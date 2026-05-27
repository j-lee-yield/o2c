import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "@o2c/config";
import {
  createDataSourceIntegration,
  createDataSourceUpload,
  recordImportedInvoices,
} from "./modules/data-sources-runtime.js";
import { parseSpreadsheetInvoiceImport } from "./modules/spreadsheet-invoice-import.js";
import {
  buildClientConnectInviteData,
  loadClientConnectInvites,
  validateClientConnectAccess,
} from "./app/integration-portal-data.js";
import {
  renderClientConnectAccessDeniedHtml,
  renderClientConnectInviteHtml,
  renderCustomerStatementHtml,
  renderDashboardHtml,
  renderIntegrationInspectorHtml,
  renderIntegrationPortalHtml,
} from "./server.js";
import type {
  CollectionsCallFilterInput,
  CollectionsEmailFilterInput,
  InvoiceFilterInput,
  OnboardingImportStatus,
} from "./app/dashboard.js";
import { buildSeedControlCenter } from "./app/data.js";
import {
  addFallbackWorkflowStage,
  assignFallbackWorkflowCustomer,
  createFallbackTemplate,
  createFallbackWorkflow,
  pauseFallbackWorkflowCustomer,
  replaceFallbackWorkflow,
  removeFallbackWorkflowStage,
  resumeFallbackWorkflowCustomer,
  toggleFallbackWorkflow,
  unenrollFallbackWorkflowCustomer,
  updateFallbackTemplate,
} from "./modules/control-center-fallback.js";

type OnboardingLane = "accounts" | "invoices" | "payments";

async function main(): Promise<void> {
  const env = loadEnv();
  const apiBaseUrl =
    readEnv("O2C_API_BASE_URL") ??
    `http://${normalizeApiHost(env.API_HOST)}:${env.API_PORT}`;
  const server = createServer(async (request, response) => {
    const requestBaseUrl = `http://${request.headers.host ?? `127.0.0.1:${env.WEB_PORT}`}`;
    const requestUrl = request.url ? new URL(request.url, requestBaseUrl) : new URL("/", requestBaseUrl);
    const pathname = requestUrl.pathname;

    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (request.method === "GET" && pathname === "/yield-wordmark.png") {
      try {
        const file = readFileSync(join(process.cwd(), "public/yield-wordmark.png"));
        response.writeHead(200, {
          "content-type": "image/png",
          "cache-control": "public, max-age=3600",
        });
        response.end(file);
        return;
      } catch (error) {
        console.error("Failed to read Yield wordmark asset", error);
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }
    }

    if (request.method === "GET" && pathname === "/connect/accounting/invite") {
      const principalId = readHeaderValue(request.headers["x-principal-id"]);
      const principalRoles = readHeaderValue(request.headers["x-principal-roles"]);
      const inviteData = buildClientConnectInviteData({
        tenantSlug: requestUrl.searchParams.get("tenantSlug") ?? undefined,
        clientName: requestUrl.searchParams.get("client") ?? undefined,
        inviteId: requestUrl.searchParams.get("inviteId") ?? undefined,
        portalLink: requestUrl.searchParams.get("portalLink") ?? undefined,
        inspectorLink: requestUrl.searchParams.get("inspectorLink") ?? undefined,
        statusMessage: requestUrl.searchParams.get("status") ?? undefined,
        errorMessage: requestUrl.searchParams.get("error") ?? undefined,
        invites: await loadClientConnectInvites({
          tenantSlug: requestUrl.searchParams.get("tenantSlug") ?? undefined,
          principalId,
          principalRoles,
        }),
        baseUrl: requestBaseUrl,
      });
      const html = await renderClientConnectInviteHtml({
        data: inviteData,
      });
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }

    if (request.method === "POST" && pathname === "/connect/accounting/invite") {
      try {
        const form = await readFormBody(request);
        const tenantSlug = form.get("tenantSlug")?.toString().trim() || env.DEFAULT_TENANT_SLUG;
        const clientName = form.get("client")?.toString().trim() || tenantSlug;
        const apiResponse = await fetch(`${apiBaseUrl}/v1/integrations/client-connect-invites`, {
          method: "POST",
          headers: {
            "content-type": "application/json; charset=utf-8",
            ...buildPrincipalProxyHeaders(request.headers),
          },
          body: JSON.stringify({ tenantSlug, clientName }),
        });
        const target = new URL("/connect/accounting/invite", requestBaseUrl);
        target.searchParams.set("tenantSlug", tenantSlug);
        target.searchParams.set("client", clientName);
        if (!apiResponse.ok) {
          const body = (await apiResponse.json().catch(() => ({}))) as { message?: string };
          target.searchParams.set(
            "error",
            body.message ?? "Invite creation failed. Check operator permissions and try again.",
          );
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        }
        const body = (await apiResponse.json()) as {
          invite?: { inviteId?: string; token?: string };
        };
        const token = body.invite?.token;
        if (!token) {
          target.searchParams.set("error", "Invite creation succeeded but no token was returned.");
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        }
        target.searchParams.set("inviteId", body.invite?.inviteId ?? "");
        target.searchParams.set("status", "Client link created. Share the URLs below with the customer.");
        target.searchParams.set(
          "portalLink",
          new URL(`/connect/accounting?token=${encodeURIComponent(token)}`, requestBaseUrl).toString(),
        );
        target.searchParams.set(
          "inspectorLink",
          new URL(`/integrations/inspector?token=${encodeURIComponent(token)}`, requestBaseUrl).toString(),
        );
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      } catch (error) {
        console.error("Failed to create client connect invite", error);
        const target = new URL("/connect/accounting/invite", requestBaseUrl);
        target.searchParams.set("error", "Invite creation failed.");
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      }
    }

    if (request.method === "POST" && pathname === "/connect/accounting/invite/cancel") {
      try {
        const form = await readFormBody(request);
        const inviteId = form.get("inviteId")?.toString();
        const tenantSlug = form.get("tenantSlug")?.toString().trim() || env.DEFAULT_TENANT_SLUG;
        const clientName = form.get("client")?.toString().trim() || tenantSlug;
        const target = new URL("/connect/accounting/invite", requestBaseUrl);
        target.searchParams.set("tenantSlug", tenantSlug);
        target.searchParams.set("client", clientName);
        if (!inviteId) {
          target.searchParams.set("error", "Invite cancellation requires an invite id.");
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        }
        const apiResponse = await fetch(
          `${apiBaseUrl}/v1/integrations/client-connect-invites/${encodeURIComponent(inviteId)}/cancel`,
          {
            method: "POST",
            headers: buildPrincipalProxyHeaders(request.headers),
          },
        );
        if (!apiResponse.ok) {
          const body = (await apiResponse.json().catch(() => ({}))) as { message?: string };
          target.searchParams.set(
            "error",
            body.message ?? "Invite cancellation failed. Check operator permissions and try again.",
          );
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        }
        target.searchParams.set("status", "Client link cancelled.");
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      } catch (error) {
        console.error("Failed to cancel client connect invite", error);
        const target = new URL("/connect/accounting/invite", requestBaseUrl);
        target.searchParams.set("error", "Invite cancellation failed.");
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      }
    }

    if (request.method === "POST" && pathname === "/admin/users/invite") {
      try {
        const form = await readFormBody(request);
        const fullName = form.get("fullName")?.toString().trim() ?? "";
        const email = form.get("email")?.toString().trim() ?? "";
        const roleKey = form.get("primaryRole")?.toString().trim() ?? "";
        const scopeType = form.get("scopeType")?.toString().trim() ?? "";

        const apiResponse = await fetch(`${apiBaseUrl}/v1/admin/users`, {
          method: "POST",
          headers: {
            "content-type": "application/json; charset=utf-8",
            "x-principal-id": "user_platform_admin",
            ...buildPrincipalProxyHeaders(request.headers),
          },
          body: JSON.stringify({
            fullName,
            email,
            status: "invited",
            ...(roleKey ? { roleKey } : {}),
            ...(scopeType ? { scopeType } : {}),
          }),
        });

        if (!apiResponse.ok) {
          const body = (await apiResponse.json().catch(() => ({}))) as { message?: string };
          console.error("Failed to invite access-control user", body.message ?? "Unknown error");
          response.writeHead(303, { location: "/admin/users#invite-user-modal" });
          response.end();
          return;
        }

        response.writeHead(303, { location: "/admin/users" });
        response.end();
        return;
      } catch (error) {
        console.error("Failed to submit invite user form", error);
        response.writeHead(303, { location: "/admin/users#invite-user-modal" });
        response.end();
        return;
      }
    }

    if (request.method === "GET" && pathname === "/connect/accounting/quickbooks") {
      const access = await validateClientConnectAccess(
        requestUrl.searchParams.get("token") ?? undefined,
      );
      if (!access.allowed || !access.claims || !access.token) {
        const html = await renderClientConnectAccessDeniedHtml({
          title: access.title ?? "Access denied",
          message: access.message ?? "A signed invite token is required.",
        });
        response.writeHead(403, { "content-type": "text/html; charset=utf-8" });
        response.end(html);
        return;
      }
      const tenantSlug = access.claims.tenantSlug;
      const target = new URL(`${apiBaseUrl}/v1/integrations/quickbooks/connect`);
      target.searchParams.set("tenantSlug", tenantSlug);
      target.searchParams.set(
        "returnTo",
        new URL(
          `/connect/accounting?token=${encodeURIComponent(access.token)}`,
          requestBaseUrl,
        ).toString(),
      );
      const environment = requestUrl.searchParams.get("environment");
      if (environment === "production" || environment === "sandbox") {
        target.searchParams.set("environment", environment);
      }
      const realmId = requestUrl.searchParams.get("realmId");
      if (realmId?.trim()) {
        target.searchParams.set("realmId", realmId.trim());
      }
      response.writeHead(302, { location: target.toString() });
      response.end();
      return;
    }

    if (request.method === "GET" && pathname === "/connect/accounting/business-central") {
      const access = await validateClientConnectAccess(
        requestUrl.searchParams.get("token") ?? undefined,
      );
      if (!access.allowed || !access.claims || !access.token) {
        const html = await renderClientConnectAccessDeniedHtml({
          title: access.title ?? "Access denied",
          message: access.message ?? "A signed invite token is required.",
        });
        response.writeHead(403, { "content-type": "text/html; charset=utf-8" });
        response.end(html);
        return;
      }
      const tenantSlug = access.claims.tenantSlug;
      const target = new URL(`${apiBaseUrl}/v1/integrations/business-central/connect`);
      target.searchParams.set("tenantSlug", tenantSlug);
      target.searchParams.set(
        "returnTo",
        new URL(
          `/connect/accounting?token=${encodeURIComponent(access.token)}`,
          requestBaseUrl,
        ).toString(),
      );
      const environment = requestUrl.searchParams.get("environment");
      if (environment?.trim()) {
        target.searchParams.set("environment", environment.trim());
      }
      const loginHint = requestUrl.searchParams.get("loginHint");
      if (loginHint?.trim()) {
        target.searchParams.set("loginHint", loginHint.trim());
      }
      const domainHint = requestUrl.searchParams.get("domainHint");
      if (domainHint?.trim()) {
        target.searchParams.set("domainHint", domainHint.trim());
      }
      const companyId = requestUrl.searchParams.get("companyId");
      if (companyId?.trim()) {
        target.searchParams.set("companyId", companyId.trim());
      }
      response.writeHead(302, { location: target.toString() });
      response.end();
      return;
    }

    if (request.method === "POST" && pathname === "/connect/accounting/business-central/select") {
      try {
        const form = await readFormBody(request);
        const access = await validateClientConnectAccess(form.get("token")?.toString());
        if (!access.allowed || !access.claims || !access.token) {
          const html = await renderClientConnectAccessDeniedHtml({
            title: access.title ?? "Access denied",
            message: access.message ?? "A signed invite token is required.",
          });
          response.writeHead(403, { "content-type": "text/html; charset=utf-8" });
          response.end(html);
          return;
        }

        const apiResponse = await fetch(`${apiBaseUrl}/v1/integrations/business-central/connect/select`, {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            state: form.get("state")?.toString(),
            companyId: form.get("companyId")?.toString(),
          }),
        });

        const target = new URL("/connect/accounting", requestBaseUrl);
        target.searchParams.set("token", access.token);
        if (!apiResponse.ok) {
          const errorBody = (await apiResponse.json().catch(async () => {
            const text = await apiResponse.text();
            return text ? { message: text } : { message: "Business Central company selection failed." };
          })) as { message?: string };
          target.searchParams.set("bc", "error");
          target.searchParams.set("message", errorBody.message ?? "Business Central company selection failed.");
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        }

        const body = (await apiResponse.json()) as {
          connection?: {
            companyName?: string;
            companyId?: string;
          };
        };
        target.searchParams.set("bc", "connected");
        target.searchParams.set(
          "company",
          body.connection?.companyName ?? body.connection?.companyId ?? "Business Central",
        );
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      } catch (error) {
        console.error("Failed to complete Business Central company selection", error);
        const target = new URL("/connect/accounting", requestBaseUrl);
        target.searchParams.set("bc", "error");
        target.searchParams.set("message", "Business Central company selection failed.");
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      }
    }

    if (request.method === "POST" && pathname === "/connect/accounting/business-central/disconnect") {
      try {
        const form = await readFormBody(request);
        const access = await validateClientConnectAccess(form.get("token")?.toString());
        if (!access.allowed || !access.claims || !access.token) {
          const html = await renderClientConnectAccessDeniedHtml({
            title: access.title ?? "Access denied",
            message: access.message ?? "A signed invite token is required.",
          });
          response.writeHead(403, { "content-type": "text/html; charset=utf-8" });
          response.end(html);
          return;
        }

        const apiResponse = await fetch(`${apiBaseUrl}/v1/integrations/business-central/disconnect`, {
          method: "POST",
        });
        const target = new URL("/connect/accounting", requestBaseUrl);
        target.searchParams.set("token", access.token);
        if (!apiResponse.ok) {
          const errorBody = (await apiResponse.json().catch(async () => {
            const text = await apiResponse.text();
            return text ? { message: text } : { message: "Business Central disconnect failed." };
          })) as { message?: string };
          target.searchParams.set("bc", "error");
          target.searchParams.set("message", errorBody.message ?? "Business Central disconnect failed.");
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        }

        target.searchParams.set("bc", "info");
        target.searchParams.set("message", "Business Central disconnected.");
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      } catch (error) {
        console.error("Failed to disconnect Business Central company", error);
        const target = new URL("/connect/accounting", requestBaseUrl);
        const token = requestUrl.searchParams.get("token");
        if (token) {
          target.searchParams.set("token", token);
        }
        target.searchParams.set("bc", "error");
        target.searchParams.set("message", "Business Central disconnect failed.");
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      }
    }

    if (request.method === "POST" && pathname === "/connect/accounting/business-central/sync") {
      try {
        const form = await readFormBody(request);
        const access = await validateClientConnectAccess(form.get("token")?.toString());
        if (!access.allowed || !access.claims || !access.token) {
          const html = await renderClientConnectAccessDeniedHtml({
            title: access.title ?? "Access denied",
            message: access.message ?? "A signed invite token is required.",
          });
          response.writeHead(403, { "content-type": "text/html; charset=utf-8" });
          response.end(html);
          return;
        }

        const apiResponse = await fetch(`${apiBaseUrl}/v1/integrations/business-central/sync`, {
          method: "POST",
        });
        const target = new URL("/connect/accounting", requestBaseUrl);
        target.searchParams.set("token", access.token);
        if (!apiResponse.ok) {
          const errorBody = (await apiResponse.json().catch(async () => {
            const text = await apiResponse.text();
            return text ? { message: text } : { message: "Business Central sync failed." };
          })) as { message?: string };
          target.searchParams.set("bc", "error");
          target.searchParams.set("message", errorBody.message ?? "Business Central sync failed.");
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        }

        const body = (await apiResponse.json()) as {
          invoices?: { importedCount?: number };
          customers?: { syncedProfileCount?: number; syncedPaymentHistoryCount?: number };
        };
        target.searchParams.set("bc", "info");
        target.searchParams.set(
          "message",
          `Business Central sync complete: ${body.invoices?.importedCount ?? 0} invoices, ${body.customers?.syncedProfileCount ?? 0} customer profiles, ${body.customers?.syncedPaymentHistoryCount ?? 0} payments.`,
        );
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      } catch (error) {
        console.error("Failed to sync Business Central data from client connect portal", error);
        const target = new URL("/connect/accounting", requestBaseUrl);
        const token = requestUrl.searchParams.get("token");
        if (token) {
          target.searchParams.set("token", token);
        }
        target.searchParams.set("bc", "error");
        target.searchParams.set("message", "Business Central sync failed.");
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      }
    }

    if (request.method === "POST" && pathname === "/connect/accounting/sap-business-one") {
      try {
        const form = await readFormBody(request);
        const access = await validateClientConnectAccess(form.get("token")?.toString());
        if (!access.allowed || !access.claims || !access.token) {
          const html = await renderClientConnectAccessDeniedHtml({
            title: access.title ?? "Access denied",
            message: access.message ?? "A signed invite token is required.",
          });
          response.writeHead(403, { "content-type": "text/html; charset=utf-8" });
          response.end(html);
          return;
        }
        const tenantSlug = access.claims.tenantSlug;
        const payload = {
          tenantSlug,
          returnTo: new URL(
            `/connect/accounting?token=${encodeURIComponent(access.token)}`,
            requestBaseUrl,
          ).toString(),
          baseUrl: form.get("baseUrl")?.toString(),
          companyDatabase: form.get("companyDatabase")?.toString(),
          username: form.get("username")?.toString(),
          password: form.get("password")?.toString(),
          language: form.get("language")?.toString() || undefined,
        };

        const apiResponse = await fetch(`${apiBaseUrl}/v1/integrations/sap-business-one/connect`, {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify(payload),
        });

        const target = new URL("/connect/accounting", requestBaseUrl);
        target.searchParams.set("token", access.token);
        if (!apiResponse.ok) {
          const errorBody = (await apiResponse.json().catch(async () => {
            const text = await apiResponse.text();
            return text ? { message: text } : { message: "SAP Business One login failed." };
          })) as { message?: string };
          target.searchParams.set("sapb1", "error");
          target.searchParams.set("message", errorBody.message ?? "SAP Business One login failed.");
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        }

        const body = (await apiResponse.json()) as {
          connection?: {
            companyName?: string;
            companyDatabase?: string;
          };
        };
        target.searchParams.set("sapb1", "connected");
        target.searchParams.set(
          "company",
          body.connection?.companyName ?? body.connection?.companyDatabase ?? "SAP Business One",
        );
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      } catch (error) {
        console.error("Failed to connect SAP Business One", error);
        const target = new URL("/connect/accounting", requestBaseUrl);
        target.searchParams.set("tenantSlug", env.DEFAULT_TENANT_SLUG);
        target.searchParams.set("client", env.DEFAULT_TENANT_SLUG);
        target.searchParams.set("sapb1", "error");
        target.searchParams.set("message", "SAP Business One login failed.");
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      }
    }

    if (request.method === "POST" && pathname === "/connect/accounting/odoo") {
      try {
        const form = await readFormBody(request);
        const access = await validateClientConnectAccess(form.get("token")?.toString());
        if (!access.allowed || !access.claims || !access.token) {
          const html = await renderClientConnectAccessDeniedHtml({
            title: access.title ?? "Access denied",
            message: access.message ?? "A signed invite token is required.",
          });
          response.writeHead(403, { "content-type": "text/html; charset=utf-8" });
          response.end(html);
          return;
        }
        const tenantSlug = access.claims.tenantSlug;
        const payload = {
          tenantSlug,
          returnTo: new URL(
            `/connect/accounting?token=${encodeURIComponent(access.token)}`,
            requestBaseUrl,
          ).toString(),
          baseUrl: form.get("baseUrl")?.toString(),
          username: form.get("username")?.toString(),
          password: form.get("password")?.toString(),
          database: form.get("database")?.toString() || undefined,
          companyId: form.get("companyId")?.toString() || undefined,
          defaultJournalId: form.get("defaultJournalId")?.toString() || undefined,
          defaultProductId: form.get("defaultProductId")?.toString() || undefined,
        };

        const apiResponse = await fetch(`${apiBaseUrl}/v1/integrations/odoo/connect`, {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify(payload),
        });

        const target = new URL("/connect/accounting", requestBaseUrl);
        target.searchParams.set("token", access.token);
        if (!apiResponse.ok) {
          const errorBody = (await apiResponse.json().catch(async () => {
            const text = await apiResponse.text();
            return text ? { message: text } : { message: "Odoo connection failed." };
          })) as { message?: string };
          target.searchParams.set("odoo", "error");
          target.searchParams.set("message", errorBody.message ?? "Odoo connection failed.");
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        }

        const body = (await apiResponse.json()) as {
          status?: string;
          selection?: { state?: string };
          connection?: { companyName?: string; database?: string };
        };

        if (body.status === "select_database" && body.selection?.state) {
          target.searchParams.set("odooConnectState", body.selection.state);
          target.searchParams.set("message", "Choose the correct Odoo database to continue.");
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        }

        target.searchParams.set("odoo", "connected");
        target.searchParams.set(
          "company",
          body.connection?.companyName ?? body.connection?.database ?? "Odoo",
        );
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      } catch (error) {
        console.error("Failed to connect Odoo", error);
        const target = new URL("/connect/accounting", requestBaseUrl);
        target.searchParams.set("tenantSlug", env.DEFAULT_TENANT_SLUG);
        target.searchParams.set("client", env.DEFAULT_TENANT_SLUG);
        target.searchParams.set("odoo", "error");
        target.searchParams.set("message", "Odoo connection failed.");
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      }
    }

    if (request.method === "POST" && pathname === "/connect/accounting/odoo/select") {
      try {
        const form = await readFormBody(request);
        const access = await validateClientConnectAccess(form.get("token")?.toString());
        if (!access.allowed || !access.claims || !access.token) {
          const html = await renderClientConnectAccessDeniedHtml({
            title: access.title ?? "Access denied",
            message: access.message ?? "A signed invite token is required.",
          });
          response.writeHead(403, { "content-type": "text/html; charset=utf-8" });
          response.end(html);
          return;
        }
        const payload = {
          state: form.get("state")?.toString(),
          database: form.get("database")?.toString(),
        };

        const apiResponse = await fetch(`${apiBaseUrl}/v1/integrations/odoo/connect/select`, {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify(payload),
        });

        const target = new URL("/connect/accounting", requestBaseUrl);
        target.searchParams.set("token", access.token);
        if (!apiResponse.ok) {
          const errorBody = (await apiResponse.json().catch(async () => {
            const text = await apiResponse.text();
            return text ? { message: text } : { message: "Odoo database selection failed." };
          })) as { message?: string };
          target.searchParams.set("odoo", "error");
          target.searchParams.set("message", errorBody.message ?? "Odoo database selection failed.");
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        }

        const body = (await apiResponse.json()) as {
          connection?: { companyName?: string; database?: string };
        };
        target.searchParams.set("odoo", "connected");
        target.searchParams.set(
          "company",
          body.connection?.companyName ?? body.connection?.database ?? "Odoo",
        );
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      } catch (error) {
        console.error("Failed to complete Odoo database selection", error);
        const target = new URL("/connect/accounting", requestBaseUrl);
        target.searchParams.set("tenantSlug", env.DEFAULT_TENANT_SLUG);
        target.searchParams.set("client", env.DEFAULT_TENANT_SLUG);
        target.searchParams.set("odoo", "error");
        target.searchParams.set("message", "Odoo database selection failed.");
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      }
    }

    if (request.method === "GET" && pathname === "/integrations/business-central/connect") {
      const target = new URL(`${apiBaseUrl}/v1/integrations/business-central/connect`);
      target.searchParams.set("tenantSlug", env.DEFAULT_TENANT_SLUG);
      target.searchParams.set("returnTo", new URL("/integrations", requestBaseUrl).toString());
      response.writeHead(302, { location: target.toString() });
      response.end();
      return;
    }

    if (request.method === "POST" && pathname === "/integrations/business-central/sync") {
      try {
        const apiResponse = await fetch(`${apiBaseUrl}/v1/integrations/business-central/sync`, {
          method: "POST",
        });
        const target = new URL("/integrations", requestBaseUrl);
        if (!apiResponse.ok) {
          const errorBody = (await apiResponse.json().catch(async () => {
            const text = await apiResponse.text();
            return text ? { message: text } : { message: "Business Central sync failed." };
          })) as { message?: string };
          target.searchParams.set("bc", "error");
          target.searchParams.set("message", errorBody.message ?? "Business Central sync failed.");
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        }

        const body = (await apiResponse.json()) as {
          invoices?: { importedCount?: number };
          customers?: { syncedProfileCount?: number; syncedPaymentHistoryCount?: number };
        };
        target.searchParams.set("bc", "connected");
        target.searchParams.set(
          "message",
          `Business Central sync complete: ${body.invoices?.importedCount ?? 0} invoices, ${body.customers?.syncedProfileCount ?? 0} customer profiles, ${body.customers?.syncedPaymentHistoryCount ?? 0} payments.`,
        );
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      } catch (error) {
        console.error("Failed to sync Business Central data", error);
        const target = new URL("/integrations", requestBaseUrl);
        target.searchParams.set("bc", "error");
        target.searchParams.set("message", "Business Central sync failed.");
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      }
    }

    if (request.method === "GET" && pathname === "/integrations/quickbooks/connect") {
      const target = new URL(`${apiBaseUrl}/v1/integrations/quickbooks/connect`);
      target.searchParams.set("tenantSlug", env.DEFAULT_TENANT_SLUG);
      target.searchParams.set("returnTo", new URL("/integrations/quickbooks", requestBaseUrl).toString());
      const environment = requestUrl.searchParams.get("environment");
      if (environment === "production" || environment === "sandbox") {
        target.searchParams.set("environment", environment);
      }
      response.writeHead(302, { location: target.toString() });
      response.end();
      return;
    }

    if (request.method === "POST" && pathname === "/integrations/sap-business-one/connect") {
      try {
        const form = await readFormBody(request);
        const payload = {
          tenantSlug: env.DEFAULT_TENANT_SLUG,
          returnTo: new URL("/integrations/sap-business-one", requestBaseUrl).toString(),
          baseUrl: form.get("baseUrl")?.toString(),
          companyDatabase: form.get("companyDatabase")?.toString(),
          username: form.get("username")?.toString(),
          password: form.get("password")?.toString(),
          language: form.get("language")?.toString() || undefined,
        };

        const apiResponse = await fetch(`${apiBaseUrl}/v1/integrations/sap-business-one/connect`, {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify(payload),
        });

        if (!apiResponse.ok) {
          const errorBody = (await apiResponse.json().catch(async () => {
            const text = await apiResponse.text();
            return text ? { message: text } : { message: "SAP Business One login failed." };
          })) as { message?: string };
          const target = new URL("/integrations/sap-business-one", requestBaseUrl);
          target.searchParams.set("sapb1", "error");
          target.searchParams.set("message", errorBody.message ?? "SAP Business One login failed.");
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        }

        const body = (await apiResponse.json()) as {
          connection?: {
            companyName?: string;
            companyDatabase?: string;
          };
        };
        const target = new URL("/integrations/sap-business-one", requestBaseUrl);
        target.searchParams.set("sapb1", "connected");
        target.searchParams.set(
          "company",
          body.connection?.companyName ?? body.connection?.companyDatabase ?? "SAP Business One",
        );
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      } catch (error) {
        console.error("Failed to connect SAP Business One", error);
        const target = new URL("/integrations/sap-business-one", requestBaseUrl);
        target.searchParams.set("sapb1", "error");
        target.searchParams.set("message", "SAP Business One login failed.");
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      }
    }

    if (request.method === "POST" && pathname === "/integrations/sap-business-one/connect/test") {
      try {
        const form = await readFormBody(request);
        const payload = {
          tenantSlug: env.DEFAULT_TENANT_SLUG,
          returnTo: new URL("/integrations/sap-business-one", requestBaseUrl).toString(),
          baseUrl: form.get("baseUrl")?.toString(),
          companyDatabase: form.get("companyDatabase")?.toString(),
          username: form.get("username")?.toString(),
          password: form.get("password")?.toString(),
          language: form.get("language")?.toString() || undefined,
        };

        const apiResponse = await fetch(`${apiBaseUrl}/v1/integrations/sap-business-one/connect/test`, {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify(payload),
        });

        const target = new URL("/integrations/sap-business-one", requestBaseUrl);
        if (!apiResponse.ok) {
          const errorBody = (await apiResponse.json().catch(async () => {
            const text = await apiResponse.text();
            return text ? { message: text } : { message: "SAP Business One test failed." };
          })) as { message?: string };
          target.searchParams.set("sapTest", "error");
          target.searchParams.set("sapTestMessage", errorBody.message ?? "SAP Business One test failed.");
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        }

        const body = (await apiResponse.json()) as {
          result?: {
            companyName?: string;
            companyDatabase?: string;
          };
        };
        target.searchParams.set("sapTest", "success");
        target.searchParams.set(
          "sapTestMessage",
          `${body.result?.companyName ?? body.result?.companyDatabase ?? "SAP Business One"} responded successfully.`,
        );
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      } catch (error) {
        console.error("Failed to test SAP Business One connection", error);
        const target = new URL("/integrations/sap-business-one", requestBaseUrl);
        target.searchParams.set("sapTest", "error");
        target.searchParams.set("sapTestMessage", "SAP Business One test failed.");
        response.writeHead(303, { location: target.toString() });
        response.end();
        return;
      }
    }

    if (request.method === "GET" && pathname === "/integrations/email/google/connect") {
      try {
        const target = new URL(`${apiBaseUrl}/v1/integrations/email/gmail/connect`);
        target.searchParams.set("returnTo", new URL("/integrations", requestBaseUrl).toString());
        const apiResponse = await fetch(target, { redirect: "manual" });

        if (
          apiResponse.status >= 300 &&
          apiResponse.status < 400 &&
          apiResponse.headers.get("location")
        ) {
          response.writeHead(302, { location: apiResponse.headers.get("location")! });
          response.end();
          return;
        }

        const errorBody = (await apiResponse.json().catch(async () => {
          const text = await apiResponse.text();
          return text ? { message: text } : { message: "Gmail connection failed." };
        })) as { message?: string };
        const redirectTarget = new URL("/integrations", requestBaseUrl);
        redirectTarget.searchParams.set(
          "emailConnectError",
          errorBody.message ?? "Gmail connection failed.",
        );
        response.writeHead(303, { location: redirectTarget.toString() });
        response.end();
        return;
      } catch (error) {
        console.error("Failed to start Gmail connection", error);
        const redirectTarget = new URL("/integrations", requestBaseUrl);
        redirectTarget.searchParams.set("emailConnectError", "Gmail connection failed.");
        response.writeHead(303, { location: redirectTarget.toString() });
        response.end();
        return;
      }
    }

    if (request.method === "POST") {
      if (pathname === "/data-sources/integrations") {
        try {
          const form = await readFormBody(request);
          const name = form.get("name")?.toString().trim();
          const category = form.get("category")?.toString().trim();
          const syncFrequency = form.get("syncFrequency")?.toString().trim();
          const detail = form.get("detail")?.toString();

          if (!name || !category || !syncFrequency) {
            response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: "Integration name, category, and sync frequency are required." }));
            return;
          }

          createDataSourceIntegration({
            name,
            category,
            syncFrequency,
            ...(detail ? { detail } : {}),
          });
          response.writeHead(303, { location: "/data-sources#add-integration-form" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to create data source integration", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Data source integration could not be created." }));
          return;
        }
      }

      if (pathname === "/data-sources/uploads") {
        try {
          const form = await readMultipartFormBody(request, requestBaseUrl);
          const file = form.get("file");
          const sourceLabel = form.get("sourceLabel")?.toString();

          if (!(file instanceof File)) {
            response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: "A file is required." }));
            return;
          }

          const lowerName = file.name.toLowerCase();
          if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls") || lowerName.endsWith(".csv")) {
            const uploadId = `${Date.now()}-${Math.round(Math.random() * 10000)}`;
            const result = await parseSpreadsheetInvoiceImport({
              uploadId,
              fileName: file.name,
              file,
            });
            const importOutcome =
              result.invoices.length > 0
                ? recordImportedInvoices(result.invoices)
                : { importedInvoiceCount: 0, duplicateInvoiceCount: 0 };

            const reviewNotes = [
              ...(importOutcome.duplicateInvoiceCount > 0
                ? [
                    `${importOutcome.duplicateInvoiceCount} duplicate invoice row${importOutcome.duplicateInvoiceCount === 1 ? "" : "s"} skipped.`,
                  ]
                : []),
              ...result.heldRows.slice(0, 5).map((item) => `Row ${item.rowNumber}: ${item.reason}`),
            ];

            const detailParts = [
              `${importOutcome.importedInvoiceCount} invoice row${importOutcome.importedInvoiceCount === 1 ? "" : "s"} imported from ${result.sheetName}`,
              ...(importOutcome.duplicateInvoiceCount > 0
                ? [
                    `${importOutcome.duplicateInvoiceCount} duplicate row${importOutcome.duplicateInvoiceCount === 1 ? "" : "s"} skipped`,
                  ]
                : []),
              ...(result.heldRows.length > 0
                ? [`${result.heldRows.length} row${result.heldRows.length === 1 ? "" : "s"} held for review`]
                : []),
            ];

            createDataSourceUpload({
              fileName: file.name,
              fileSizeBytes: file.size,
              mimeType: file.type || "application/octet-stream",
              ...(sourceLabel ? { sourceLabel } : {}),
              status: "review",
              detail: detailParts.join(" · "),
              importedInvoiceCount: importOutcome.importedInvoiceCount,
              duplicateInvoiceCount: importOutcome.duplicateInvoiceCount,
              heldRowCount: result.heldRows.length,
              ...(reviewNotes.length > 0 ? { reviewNotes } : {}),
            });
          } else {
            createDataSourceUpload({
              fileName: file.name,
              fileSizeBytes: file.size,
              mimeType: file.type || "application/octet-stream",
              ...(sourceLabel ? { sourceLabel } : {}),
            });
          }

          response.writeHead(303, { location: "/data-sources#upload-files-form" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to upload data source file", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "File upload failed." }));
          return;
        }
      }

      const onboardingImportMatch = pathname.match(/^\/onboarding\/import\/(accounts|invoices|payments)$/);
      if (onboardingImportMatch) {
        const lane = onboardingImportMatch[1] as OnboardingLane;

        try {
          const form = await readMultipartFormBody(request, requestBaseUrl);
          const file = form.get("file");

          if (!(file instanceof File)) {
            redirectWithOnboardingStatus(response, requestBaseUrl, {
              lane,
              status: "error",
              message: "A CSV file is required.",
            });
            return;
          }

          const uploadId = `${lane}-${Date.now()}-${Math.round(Math.random() * 10_000)}`;
          const arrayBuffer = await file.arrayBuffer();
          const fileBuffer = Buffer.from(arrayBuffer);
          const apiPath =
            lane === "accounts"
              ? "/v1/accounts/imports/file"
              : lane === "invoices"
                ? "/v1/invoices/imports/spreadsheet/file"
                : "/v1/payments/ingestions/bank-statements/file";
          const apiResponse = await fetch(`${apiBaseUrl}${apiPath}`, {
            method: "POST",
            headers: {
              "content-type": file.type || "text/csv",
              "x-file-name": file.name,
              "x-upload-id": uploadId,
            },
            body: fileBuffer,
          });

          if (!apiResponse.ok) {
            const errorBody = (await apiResponse.json().catch(async () => {
              const text = await apiResponse.text();
              return text ? { message: text } : { message: `${humanizeLane(lane)} import failed.` };
            })) as { message?: string };
            redirectWithOnboardingStatus(response, requestBaseUrl, {
              lane,
              status: "error",
              message: errorBody.message ?? `${humanizeLane(lane)} import failed.`,
            });
            return;
          }

          const body = await apiResponse.json() as Record<string, unknown>;
          const heldRows = Array.isArray(body.heldRows)
            ? body.heldRows as Array<{ rowNumber?: number; reason?: string }>
            : [];
          const notes = heldRows.slice(0, 3).map((item) =>
            `Row ${item.rowNumber ?? "?"}: ${item.reason ?? "Held for review."}`,
          );
          const importedCount = readImportedCount(lane, body);
          const reviewCount = readReviewCount(lane, body);
          const heldCount = heldRows.length;

          createDataSourceUpload({
            fileName: file.name,
            fileSizeBytes: file.size,
            mimeType: file.type || "text/csv",
            sourceLabel: `Onboarding • ${humanizeLane(lane)}`,
            status: heldCount > 0 ? "review" : "processing",
            detail: buildOnboardingUploadDetail(lane, importedCount, heldCount, reviewCount),
            ...(lane === "invoices" ? { importedInvoiceCount: importedCount } : {}),
            ...(heldCount > 0 ? { heldRowCount: heldCount } : {}),
            ...(notes.length > 0 ? { reviewNotes: notes } : {}),
          });

          redirectWithOnboardingStatus(response, requestBaseUrl, {
            lane,
            status: "success",
            importedCount,
            heldCount,
            reviewCount,
            message: buildOnboardingSuccessMessage(lane, importedCount, heldCount, reviewCount),
            ...(notes.length > 0 ? { notes } : {}),
          });
          return;
        } catch (error) {
          console.error(`Failed to import onboarding ${lane} file`, error);
          redirectWithOnboardingStatus(response, requestBaseUrl, {
            lane,
            status: "error",
            message: `${humanizeLane(lane)} import failed.`,
          });
          return;
        }
      }

      if (pathname === "/integrations/odoo/connect") {
        try {
          const form = await readFormBody(request);
          const payload = JSON.stringify({
            tenantSlug: env.DEFAULT_TENANT_SLUG,
            returnTo: new URL("/integrations", requestBaseUrl).toString(),
            baseUrl: form.get("baseUrl")?.toString(),
            username: form.get("username")?.toString(),
            password: form.get("password")?.toString(),
            ...(form.get("database")?.toString().trim()
              ? { database: form.get("database")?.toString() }
              : {}),
          });

          const apiResponse = await fetch(`${apiBaseUrl}/v1/integrations/odoo/connect`, {
            method: "POST",
            headers: {
              "content-type": "application/json; charset=utf-8",
            },
            body: payload,
          });

          if (!apiResponse.ok) {
            const errorBody = await apiResponse.json().catch(async () => {
              const text = await apiResponse.text();
              return text ? { message: text } : { message: "Odoo login failed." };
            }) as { message?: string };
            const target = new URL("/integrations", requestBaseUrl);
            target.searchParams.set("odooConnectError", errorBody.message ?? "Odoo login failed.");
            response.writeHead(303, { location: target.toString() });
            response.end();
            return;
          }

          const body = (await apiResponse.json()) as {
            status?: string;
            selection?: { state?: string };
          };
          if (body.status === "select_database" && body.selection?.state) {
            const target = new URL("/integrations", requestBaseUrl);
            target.searchParams.set("odooConnectState", body.selection.state);
            response.writeHead(303, { location: target.toString() });
            response.end();
            return;
          }

          response.writeHead(303, { location: "/integrations" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to connect Odoo", error);
          const target = new URL("/integrations", requestBaseUrl);
          target.searchParams.set("odooConnectError", "Odoo login failed.");
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        }
      }

      if (pathname === "/integrations/odoo/connect/select") {
        try {
          const form = await readFormBody(request);
          const payload = JSON.stringify({
            state: form.get("state")?.toString(),
            database: form.get("database")?.toString(),
          });

          const apiResponse = await fetch(`${apiBaseUrl}/v1/integrations/odoo/connect/select`, {
            method: "POST",
            headers: {
              "content-type": "application/json; charset=utf-8",
            },
            body: payload,
          });

          if (!apiResponse.ok) {
            const errorBody = await apiResponse.json().catch(async () => {
              const text = await apiResponse.text();
              return text ? { message: text } : { message: "Odoo database selection failed." };
            }) as { message?: string };
            const target = new URL("/integrations", requestBaseUrl);
            target.searchParams.set("odooConnectError", errorBody.message ?? "Odoo database selection failed.");
            response.writeHead(303, { location: target.toString() });
            response.end();
            return;
          }

          response.writeHead(303, { location: "/integrations" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to finish Odoo connection", error);
          const target = new URL("/integrations", requestBaseUrl);
          target.searchParams.set("odooConnectError", "Odoo database selection failed.");
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        }
      }

      if (pathname === "/integrations/quickbooks/invoices/sync") {
        try {
          const apiResponse = await fetch(
            `${apiBaseUrl}/v1/invoices/imports/sync?provider=quickbooks_online`,
            {
              method: "POST",
            },
          );

          if (!apiResponse.ok) {
            const message = await apiResponse.text();
            response.writeHead(apiResponse.status, {
              "content-type": "application/json; charset=utf-8",
            });
            response.end(
              JSON.stringify({ message: message || "QuickBooks invoice import failed." }),
            );
            return;
          }

          response.writeHead(303, { location: "/integrations" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to sync QuickBooks invoices", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "QuickBooks invoice import failed." }));
          return;
        }
      }

      if (pathname === "/integrations/sap-business-one/invoices/sync") {
        try {
          const apiResponse = await fetch(`${apiBaseUrl}/v1/integrations/sap-business-one/sync`, {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({ scope: ["invoices", "customers", "payments"] }),
          });

          if (!apiResponse.ok) {
            const errorBody = (await apiResponse.json().catch(async () => {
              const text = await apiResponse.text();
              return text ? { message: text } : { message: "SAP Business One sync failed." };
            })) as { message?: string };
            const target = new URL("/integrations/sap-business-one", requestBaseUrl);
            target.searchParams.set("sapb1", "error");
            target.searchParams.set("message", errorBody.message ?? "SAP Business One sync failed.");
            response.writeHead(303, { location: target.toString() });
            return;
          }

          const body = (await apiResponse.json()) as {
            run?: {
              invoicesSyncedCount?: number;
              customersSyncedCount?: number;
              paymentsSyncedCount?: number;
            };
          };
          const target = new URL("/integrations/sap-business-one", requestBaseUrl);
          target.searchParams.set("sapb1", "connected");
          target.searchParams.set(
            "message",
            `Sync finished: ${body.run?.invoicesSyncedCount ?? 0} invoices, ${body.run?.customersSyncedCount ?? 0} customers, ${body.run?.paymentsSyncedCount ?? 0} payments.`,
          );
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to sync SAP Business One invoices", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "SAP Business One invoice sync failed." }));
          return;
        }
      }

      if (pathname === "/integrations/email/connect") {
        try {
          const form = await readFormBody(request);
          const payload = JSON.stringify({
            principal: {
              id: "web_console",
              roles: ["ar_manager"],
            },
            provider: form.get("provider")?.toString() ?? "gmail",
            authMode: form.get("authMode")?.toString() ?? "oauth2",
            senderEmail: form.get("senderEmail")?.toString(),
            ...(form.get("displayName")?.toString().trim()
              ? { displayName: form.get("displayName")?.toString().trim() }
              : {}),
            ...(form.get("scopes")?.toString().trim()
              ? {
                  scopes: form
                    .get("scopes")
                    ?.toString()
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                }
              : {}),
            ...(form.get("sendAsEmail")?.toString().trim()
              ? { sendAsEmail: form.get("sendAsEmail")?.toString().trim() }
              : {}),
            ...(form.get("sendOnBehalfOfEmail")?.toString().trim()
              ? { sendOnBehalfOfEmail: form.get("sendOnBehalfOfEmail")?.toString().trim() }
              : {}),
            ...(form.get("isDefault")?.toString() === "true" ? { isDefault: true } : {}),
          });

          const apiResponse = await fetch(`${apiBaseUrl}/v1/email/sending-identities/connect`, {
            method: "POST",
            headers: {
              "content-type": "application/json; charset=utf-8",
            },
            body: payload,
          });

          if (!apiResponse.ok) {
            const errorBody = await apiResponse.text();
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: errorBody || "Email mailbox connection failed." }));
            return;
          }

          response.writeHead(303, { location: "/integrations#email-mailbox-form" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to connect email sending identity", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Email mailbox connection failed." }));
          return;
        }
      }

      const emailDefaultMatch = pathname.match(/^\/integrations\/email\/([^/]+)\/default$/);
      if (emailDefaultMatch) {
        const identityId = emailDefaultMatch[1] ?? "";
        try {
          const apiResponse = await fetch(
            `${apiBaseUrl}/v1/email/sending-identities/${encodeURIComponent(identityId)}/default`,
            { method: "POST" },
          );

          if (!apiResponse.ok) {
            const errorBody = await apiResponse.text();
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: errorBody || "Default sender update failed." }));
            return;
          }

          response.writeHead(303, { location: "/integrations#email-mailbox-form" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to update default email sending identity", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Default sender update failed." }));
          return;
        }
      }

      const emailValidateMatch = pathname.match(/^\/integrations\/email\/([^/]+)\/validate$/);
      if (emailValidateMatch) {
        const identityId = emailValidateMatch[1] ?? "";
        try {
          const apiResponse = await fetch(
            `${apiBaseUrl}/v1/email/sending-identities/${encodeURIComponent(identityId)}/validate`,
            { method: "POST" },
          );

          if (!apiResponse.ok) {
            const errorBody = await apiResponse.text();
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: errorBody || "Mailbox validation failed." }));
            return;
          }

          response.writeHead(303, { location: "/integrations#email-mailbox-form" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to validate email sending identity", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Mailbox validation failed." }));
          return;
        }
      }

      if (pathname === "/inbox/reply") {
        try {
          const form = await readFormBody(request);
          const invoices = form
            .getAll("invoice")
            .map((value) => {
              try {
                return JSON.parse(value.toString()) as Record<string, unknown>;
              } catch {
                return undefined;
              }
            })
            .filter((value): value is Record<string, unknown> => Boolean(value));
          const payload = JSON.stringify({
            principal: {
              id: "web_console",
              roles: ["ar_manager"],
            },
            senderIdentityId: form.get("senderIdentityId")?.toString(),
            providerThreadId: form.get("providerThreadId")?.toString(),
            ...(form.get("replyToProviderMessageId")?.toString()
              ? { replyToProviderMessageId: form.get("replyToProviderMessageId")?.toString() }
              : {}),
            account: {
              id: form.get("billingAccountId")?.toString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              parentAccountId:
                form.get("parentAccountId")?.toString() || form.get("billingAccountId")?.toString(),
              accountNumber: form.get("accountNumber")?.toString() || form.get("billingAccountId")?.toString(),
              displayName: form.get("accountName")?.toString(),
              currency: form.get("currency")?.toString() || "PHP",
              accountTier:
                form.get("accountTier")?.toString() === "strategic" ? "strategic" : "standard",
              status: "active",
              centrallyPaid: false,
              metadata: {
                source: "inbox_reply",
              },
            },
            contact: {
              id: form.get("contactId")?.toString() || `inbox-contact:${form.get("contactEmail")?.toString()}`,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              parentAccountId:
                form.get("parentAccountId")?.toString() || form.get("billingAccountId")?.toString(),
              billingAccountId: form.get("billingAccountId")?.toString(),
              scope: "billing_account",
              scopeId: form.get("billingAccountId")?.toString(),
              fullName: form.get("contactName")?.toString() || form.get("contactEmail")?.toString(),
              email: form.get("contactEmail")?.toString(),
              role: "ap",
              isPrimary: true,
              // Inbox linkage is conservative: unless we have explicit verified-contact state,
              // replies route through the existing approval gate rather than assuming auto-send safety.
              isVerified: false,
              allowAutoSend: false,
              recentSuccessfulResponses: 0,
              metadata: {
                source: "inbox_linkage",
              },
            },
            ...(invoices.length > 0 ? { invoices } : {}),
            subjectLine: form.get("subjectLine")?.toString(),
            bodyPreview: form.get("bodyPreview")?.toString(),
          });

          const apiResponse = await fetch(`${apiBaseUrl}/v1/email/inbox/reply`, {
            method: "POST",
            headers: {
              "content-type": "application/json; charset=utf-8",
            },
            body: payload,
          });

          const redirectTarget = new URL("/inbox", requestBaseUrl);
          if (form.get("senderIdentityId")?.toString()) {
            redirectTarget.searchParams.set("senderIdentityId", form.get("senderIdentityId")!.toString());
          }
          if (form.get("providerThreadId")?.toString()) {
            redirectTarget.searchParams.set("threadId", form.get("providerThreadId")!.toString());
          }

          if (!apiResponse.ok) {
            const errorBody = await apiResponse.json().catch(async () => ({
              message: await apiResponse.text(),
            })) as { message?: string };
            redirectTarget.searchParams.set(
              "inboxReplyError",
              errorBody.message ?? "Reply could not be sent.",
            );
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          const body = (await apiResponse.json()) as { deliveryState?: string; failureReason?: string };
          if (body.deliveryState === "approval_needed") {
            redirectTarget.searchParams.set("inboxReplyStatus", "approval_needed");
          } else if (body.deliveryState === "sent") {
            redirectTarget.searchParams.set("inboxReplyStatus", "sent");
          } else {
            redirectTarget.searchParams.set(
              "inboxReplyError",
              body.failureReason ?? "Reply could not be sent.",
            );
          }
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to send inbox reply", error);
          const redirectTarget = new URL("/inbox", requestBaseUrl);
          redirectTarget.searchParams.set("inboxReplyError", "Reply could not be sent.");
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        }
      }

      if (pathname === "/customers/email/send") {
        let customerId: string | undefined;
        try {
          const form = await readFormBody(request);
          customerId = form.get("customerId")?.toString();
          const customerName = form.get("customerName")?.toString() ?? "Customer";
          const senderIdentityId = form.get("senderIdentityId")?.toString();
          const subjectLine = form.get("subjectLine")?.toString().trim();
          const bodyPreview = form.get("bodyPreview")?.toString().trim();
          const account = parseJsonFormField<Record<string, unknown>>(form, "accountJson");
          const contact = parseJsonFormField<Record<string, unknown>>(form, "contactJson");
          const invoices = parseJsonFormField<Array<Record<string, unknown>>>(form, "invoicesJson");
          const redirectTarget = buildCustomerEmailRedirect(requestBaseUrl, customerId);

          if (!customerId || !senderIdentityId || !subjectLine || !bodyPreview || !account || !contact || !Array.isArray(invoices) || invoices.length === 0) {
            redirectTarget.searchParams.set("customerEmailStatus", "failed");
            redirectTarget.searchParams.set("customerEmailMessage", "Complete sender, subject, body, and invoice context before sending.");
            redirectTarget.hash = "customer-email-modal";
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          if (contact.isVerified !== true || contact.allowAutoSend !== true || typeof contact.email !== "string") {
            redirectTarget.searchParams.set("customerEmailStatus", "failed");
            redirectTarget.searchParams.set(
              "customerEmailMessage",
              "A verified customer email contact is required before outbound outreach can be sent.",
            );
            redirectTarget.hash = "customer-email-modal";
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          const apiResponse = await fetch(`${apiBaseUrl}/v1/email/outbound/send`, {
            method: "POST",
            headers: {
              "content-type": "application/json; charset=utf-8",
            },
            body: JSON.stringify({
              principal: {
                id: "web_console",
                roles: ["ar_manager"],
              },
              senderIdentityId,
              workflowKind: "request_remittance",
              account,
              contact,
              invoices,
              subjectLine,
              bodyPreview,
            }),
          });

          if (!apiResponse.ok) {
            const message = await safeReadErrorMessage(apiResponse, "Customer email could not be sent.");
            redirectTarget.searchParams.set("customerEmailStatus", "failed");
            redirectTarget.searchParams.set("customerEmailMessage", message);
            redirectTarget.hash = "customer-email-modal";
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          const body = (await apiResponse.json()) as { deliveryState?: string; failureReason?: string };
          if (body.deliveryState === "sent") {
            redirectTarget.searchParams.set("customerEmailStatus", "sent");
            redirectTarget.searchParams.set("customerEmailMessage", `Email sent to ${customerName}.`);
          } else if (body.deliveryState === "approval_needed") {
            redirectTarget.searchParams.set("customerEmailStatus", "approval_needed");
            redirectTarget.searchParams.set("customerEmailMessage", "Email is queued for approval before sending.");
          } else {
            redirectTarget.searchParams.set("customerEmailStatus", "failed");
            redirectTarget.searchParams.set("customerEmailMessage", body.failureReason ?? "Customer email could not be sent.");
            redirectTarget.hash = "customer-email-modal";
          }
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to send customer email", error);
          const redirectTarget = buildCustomerEmailRedirect(requestBaseUrl, customerId);
          redirectTarget.searchParams.set("customerEmailStatus", "failed");
          redirectTarget.searchParams.set("customerEmailMessage", "Customer email could not be sent.");
          redirectTarget.hash = "customer-email-modal";
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        }
      }

      if (pathname === "/customers/email-task/create") {
        try {
          const form = await readFormBody(request);
          const customerId = form.get("customerId")?.toString();
          const customerName = form.get("customerName")?.toString() ?? "Customer";
          const senderIdentityId = form.get("senderIdentityId")?.toString();
          const accountJson = form.get("accountJson")?.toString();
          const contactJson = form.get("contactJson")?.toString();
          const invoicesJson = form.get("invoicesJson")?.toString();
          const redirectTarget = new URL("/customers", requestBaseUrl);
          if (customerId) {
            redirectTarget.searchParams.set("customer", customerId);
          }

          if (!customerId || !senderIdentityId || !accountJson || !contactJson || !invoicesJson) {
            redirectTarget.searchParams.set("taskComposeError", "Customer email draft could not be created.");
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          const account = JSON.parse(accountJson) as Record<string, unknown>;
          const contact = JSON.parse(contactJson) as Record<string, unknown>;
          const invoices = JSON.parse(invoicesJson) as Array<Record<string, unknown>>;
          const sourceLinks = [
            {
              label: customerName,
              objectType: "customer_profile",
              objectId: customerId,
              href: `/customers?customer=${encodeURIComponent(customerId)}`,
            },
            ...invoices.map((invoice) => ({
              label: String(invoice.invoiceNumber ?? invoice.id ?? "Invoice"),
              objectType: "invoice",
              objectId: String(invoice.id ?? invoice.invoiceNumber ?? "invoice"),
              href: invoice.invoiceNumber
                ? `/invoices?invoice=${encodeURIComponent(String(invoice.invoiceNumber))}`
                : undefined,
            })),
          ];

          const apiResponse = await fetch(`${apiBaseUrl}/v1/tasks`, {
            method: "POST",
            headers: {
              "content-type": "application/json; charset=utf-8",
              "x-principal-id": "web_console",
              "x-principal-roles": "ar_manager",
            },
            body: JSON.stringify({
              title: `Email ${customerName} about imported invoices`,
              description: `Draft a customer email from the imported accounting profile for ${customerName}.`,
              kind: "customer_email_follow_up",
              origin: "manual",
              surfaces: ["customers", "collections"],
              customerProfileId: customerId,
              billingAccountId: typeof account.id === "string" ? account.id : customerId,
              sourceLinks,
              metadata: {
                customerName,
                composeEmail: {
                  account,
                  contact,
                  invoices,
                },
              },
            }),
          });

          if (!apiResponse.ok) {
            const errorBody = (await apiResponse.json().catch(async () => ({
              message: await apiResponse.text(),
            }))) as { message?: string };
            redirectTarget.searchParams.set("taskComposeError", errorBody.message ?? "Customer email draft could not be created.");
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          const created = (await apiResponse.json()) as { id?: string };
          const taskTarget = new URL("/tasks", requestBaseUrl);
          if (created.id) {
            taskTarget.hash = `task-detail-${created.id}`;
          }
          response.writeHead(303, { location: taskTarget.toString() });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to create customer email task", error);
          const redirectTarget = new URL("/customers", requestBaseUrl);
          const customerId = requestUrl.searchParams.get("customer");
          if (customerId) {
            redirectTarget.searchParams.set("customer", customerId);
          }
          redirectTarget.searchParams.set("taskComposeError", "Customer email draft could not be created.");
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        }
      }

      if (pathname === "/customers/call/start") {
        let customerId: string | undefined;
        try {
          const form = await readFormBody(request);
          customerId = form.get("customerId")?.toString();
          const customerName = form.get("customerName")?.toString() ?? "Customer";
          const phoneNumber = normalizeOutboundPhoneNumber(form.get("phoneNumber")?.toString());
          const redirectTarget = buildCustomerCallRedirect(requestBaseUrl, customerId);

          const account = parseJsonFormField<Record<string, unknown>>(form, "accountJson");
          const contact = parseJsonFormField<Record<string, unknown>>(form, "contactJson");
          const invoices = parseJsonFormField<Array<Record<string, unknown>>>(form, "invoicesJson");
          if (!customerId || !phoneNumber || !account || !contact || !Array.isArray(invoices) || invoices.length === 0) {
            redirectTarget.searchParams.set("customerCallStatus", "failed");
            redirectTarget.searchParams.set(
              "customerCallMessage",
              "Enter a valid phone number before starting the call.",
            );
            redirectTarget.hash = "customer-call-modal";
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          const originalPhone = normalizeOutboundPhoneNumber(
            typeof contact.phone === "string" ? contact.phone : undefined,
          );
          const phoneChanged =
            !originalPhone || normalizePhoneDigits(originalPhone) !== normalizePhoneDigits(phoneNumber);
          const contactForCall = {
            ...contact,
            phone: phoneNumber,
            ...(phoneChanged
              ? {
                  // Operator-entered phone overrides must pass the existing Retell safety checks as unverified contacts.
                  isVerified: false,
                  allowAutoSend: false,
                  metadata: {
                    ...readRecord(contact.metadata),
                    phoneOverrideRequiresVerification: true,
                    phoneOverrideSource: "operator_console_call_modal",
                  },
                }
              : {}),
          };

          const apiResponse = await fetch(`${apiBaseUrl}/v1/retell/collections/outbound-call`, {
            method: "POST",
            headers: {
              "content-type": "application/json; charset=utf-8",
              "x-principal-id": "web_console",
              "x-principal-roles": "ar_manager",
            },
            body: JSON.stringify({
              principal: {
                id: "web_console",
                roles: ["ar_manager"],
              },
              tenantId: env.DEFAULT_TENANT_SLUG,
              account,
              contact: contactForCall,
              invoices,
            }),
          });

          if (!apiResponse.ok) {
            const message = await safeReadErrorMessage(apiResponse, "Customer call could not be started.");
            redirectTarget.searchParams.set("customerCallStatus", "failed");
            redirectTarget.searchParams.set("customerCallMessage", message);
            redirectTarget.hash = "customer-call-modal";
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          const payload = (await apiResponse.json()) as {
            status?: "started" | "blocked";
            blockedReason?: string;
          };
          if (payload.status !== "started") {
            const reason = payload.blockedReason
              ? `Call blocked by safety checks: ${humanizeCode(payload.blockedReason)}.`
              : "Call blocked by Retell pre-call safety checks.";
            redirectTarget.searchParams.set("customerCallStatus", "failed");
            redirectTarget.searchParams.set("customerCallMessage", reason);
            redirectTarget.hash = "customer-call-modal";
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          redirectTarget.searchParams.set("customerCallStatus", "started");
          redirectTarget.searchParams.set(
            "customerCallMessage",
            `Call started for ${customerName}. Activity and tasks will update as Retell posts outcomes.`,
          );
          redirectTarget.hash = "customer-call-status";
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to start customer call", error);
          const redirectTarget = buildCustomerCallRedirect(requestBaseUrl, customerId);
          redirectTarget.searchParams.set("customerCallStatus", "failed");
          redirectTarget.searchParams.set("customerCallMessage", "Customer call could not be started.");
          redirectTarget.hash = "customer-call-modal";
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        }
      }

      if (pathname === "/customers/tasks/create") {
        try {
          const form = await readFormBody(request);
          const customerId = form.get("customerId")?.toString();
          const customerName = form.get("customerName")?.toString() ?? "Customer";
          const billingAccountId = form.get("billingAccountId")?.toString() ?? customerId;
          const redirectTarget = new URL("/customers", requestBaseUrl);
          if (customerId) {
            redirectTarget.searchParams.set("customer", customerId);
            redirectTarget.searchParams.set("tab", "tasks");
          }

          if (!customerId || !billingAccountId) {
            redirectTarget.searchParams.set("taskComposeError", "Customer task could not be created.");
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          const apiResponse = await fetch(`${apiBaseUrl}/v1/tasks`, {
            method: "POST",
            headers: {
              "content-type": "application/json; charset=utf-8",
              "x-principal-id": "web_console",
              "x-principal-roles": "ar_manager",
            },
            body: JSON.stringify({
              title: `Follow up ${customerName}`,
              description: `Review the imported customer profile and next step for ${customerName}.`,
              kind: "customer_follow_up",
              origin: "manual",
              surfaces: ["customers"],
              customerProfileId: customerId,
              billingAccountId,
              sourceLinks: [
                {
                  label: customerName,
                  objectType: "customer_profile",
                  objectId: customerId,
                  href: `/customers?customer=${encodeURIComponent(customerId)}`,
                },
              ],
              metadata: {
                customerName,
                source: "customer_workspace",
              },
            }),
          });

          if (!apiResponse.ok) {
            const errorBody = (await apiResponse.json().catch(async () => ({
              message: await apiResponse.text(),
            }))) as { message?: string };
            redirectTarget.searchParams.set("taskComposeError", errorBody.message ?? "Customer task could not be created.");
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to create customer task", error);
          const redirectTarget = new URL("/customers", requestBaseUrl);
          const customerId = requestUrl.searchParams.get("customer");
          if (customerId) {
            redirectTarget.searchParams.set("customer", customerId);
            redirectTarget.searchParams.set("tab", "tasks");
          }
          redirectTarget.searchParams.set("taskComposeError", "Customer task could not be created.");
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        }
      }

      if (pathname === "/tasks/status") {
        try {
          const form = await readFormBody(request);
          const taskId = form.get("taskId")?.toString();
          const status = form.get("status")?.toString();
          const redirectTarget = new URL("/tasks", requestBaseUrl);

          if (!taskId || (status !== "completed" && status !== "closed")) {
            redirectTarget.searchParams.set("taskComposeError", "Task status could not be updated.");
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          const apiResponse = await fetch(`${apiBaseUrl}/v1/tasks/${encodeURIComponent(taskId)}/status`, {
            method: "POST",
            headers: {
              "content-type": "application/json; charset=utf-8",
              "x-principal-id": "web_console",
              "x-principal-roles": "ar_manager",
            },
            body: JSON.stringify({
              status,
              summary: status === "completed" ? "Task completed and archived from the task popup." : "Task closed from the task popup.",
            }),
          });

          if (!apiResponse.ok) {
            const message = await safeReadErrorMessage(apiResponse, "Task status could not be updated.");
            redirectTarget.searchParams.set("taskComposeError", message);
          } else {
            redirectTarget.searchParams.set(
              "taskComposeStatus",
              status === "completed" ? "completed" : "closed",
            );
          }
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to update task status", error);
          const redirectTarget = new URL("/tasks", requestBaseUrl);
          redirectTarget.searchParams.set("taskComposeError", "Task status could not be updated.");
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        }
      }

      if (pathname === "/tasks/delete") {
        try {
          const form = await readFormBody(request);
          const taskId = form.get("taskId")?.toString();
          const redirectTarget = new URL("/tasks", requestBaseUrl);

          if (!taskId) {
            redirectTarget.searchParams.set("taskComposeError", "Task could not be deleted.");
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          const apiResponse = await fetch(`${apiBaseUrl}/v1/tasks/${encodeURIComponent(taskId)}`, {
            method: "DELETE",
            headers: {
              "x-principal-id": "web_console",
              "x-principal-roles": "ar_manager",
            },
          });

          if (!apiResponse.ok) {
            const message = await safeReadErrorMessage(apiResponse, "Task could not be deleted.");
            redirectTarget.searchParams.set("taskComposeError", message);
          } else {
            redirectTarget.searchParams.set("taskComposeStatus", "deleted");
          }
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to delete task", error);
          const redirectTarget = new URL("/tasks", requestBaseUrl);
          redirectTarget.searchParams.set("taskComposeError", "Task could not be deleted.");
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        }
      }

      if (pathname === "/customers/outreach/pause" || pathname === "/customers/outreach/resume") {
        const form = await readFormBody(request);
        const customerId = form.get("customerId")?.toString();
        const workflowId = form.get("workflowId")?.toString();
        const executionId = form.get("executionId")?.toString();
        const reason = form.get("reason")?.toString();
        const action = pathname.endsWith("/resume") ? "resume" : "pause";
        const redirectTarget = new URL("/customers", requestBaseUrl);
        if (customerId) {
          redirectTarget.searchParams.set("customer", customerId);
        }

        try {
          if (!workflowId || !executionId) {
            throw new Error("Customer is not enrolled in an outreach workflow.");
          }
          const apiResponse = await fetch(`${apiBaseUrl}/v1/control-center/workflows/${workflowId}/customers/${executionId}/${action}`, {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              principal: { id: "web_console", roles: ["controller", "ar_manager"] },
              ...(reason ? { reason } : {}),
            }),
          });
          if (!apiResponse.ok) {
            if (action === "pause") {
              pauseFallbackWorkflowCustomer(buildSeedControlCenter, {
                workflowId,
                executionId,
                ...(reason ? { reason } : {}),
              });
            } else {
              resumeFallbackWorkflowCustomer(buildSeedControlCenter, {
                workflowId,
                executionId,
                ...(reason ? { reason } : {}),
              });
            }
          }
          redirectTarget.searchParams.set("customerEmailStatus", "sent");
          redirectTarget.searchParams.set(
            "customerEmailMessage",
            action === "pause" ? "Outreach paused for this customer." : "Outreach resumed for this customer.",
          );
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        } catch (error) {
          console.error(`Failed to ${action} customer outreach`, error);
          redirectTarget.searchParams.set("customerEmailStatus", "failed");
          redirectTarget.searchParams.set(
            "customerEmailMessage",
            error instanceof Error ? error.message : "Customer outreach state could not be updated.",
          );
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        }
      }

      if (pathname === "/collections/compose") {
        try {
          const form = await readMultipartFormBody(request, requestBaseUrl);
          const composeId = form.get("composeId")?.toString() ?? "collections-compose";
          const redirectTarget = new URL("/collections", requestBaseUrl);
          redirectTarget.searchParams.set("tab", "email");
          redirectTarget.hash = composeId;

          const senderIdentityId = form.get("senderIdentityId")?.toString();
          const providerThreadId = form.get("providerThreadId")?.toString();
          const subjectLine = form.get("subjectLine")?.toString();
          const bodyPreview = form.get("bodyPreview")?.toString();
          const contactEmail = form.get("contactEmail")?.toString();
          const accountName = form.get("accountName")?.toString();
          const now = new Date().toISOString();
          const account =
            readJsonFormField<Record<string, unknown>>(form, "accountJson") ??
            buildCollectionsReplyAccountFromForm(form, accountName ?? "", composeId, now);
          const contact =
            readJsonFormField<Record<string, unknown>>(form, "contactJson") ??
            buildCollectionsReplyContactFromForm(form, contactEmail ?? "", accountName ?? "", now);
          const invoices = readJsonFormField<unknown[]>(form, "invoicesJson") ?? [];
          const attachments = [
            ...(await readEmailAttachments(form)),
            ...(await buildCollectionsGeneratedEmailAttachments(apiBaseUrl, form)),
          ];

          if (!senderIdentityId || !providerThreadId || !subjectLine || !bodyPreview || !contactEmail || !accountName) {
            redirectTarget.searchParams.set(
              "collectionsComposeError",
              "A live mailbox thread is required before this collections email can be sent.",
            );
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          const payload = JSON.stringify({
            principal: {
              id: "web_console",
              roles: ["ar_manager"],
            },
            senderIdentityId,
            providerThreadId,
            replyToProviderMessageId: form.get("providerMessageId")?.toString(),
            account,
            contact,
            ...(invoices.length > 0 ? { invoices } : {}),
            subjectLine,
            bodyPreview,
            ...(attachments.length > 0 ? { attachments } : {}),
          });

          const apiResponse = await fetch(`${apiBaseUrl}/v1/email/inbox/reply`, {
            method: "POST",
            headers: {
              "content-type": "application/json; charset=utf-8",
            },
            body: payload,
          });

          if (!apiResponse.ok) {
            const errorBody = await apiResponse.json().catch(async () => ({
              message: await apiResponse.text(),
            })) as { message?: string };
            redirectTarget.searchParams.set(
              "collectionsComposeError",
              errorBody.message ?? "Collections email could not be sent.",
            );
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          const body = (await apiResponse.json()) as { deliveryState?: string; failureReason?: string };
          redirectTarget.hash = "";
          if (body.deliveryState === "approval_needed") {
            redirectTarget.searchParams.set("collectionsComposeStatus", "approval_needed");
          } else if (body.deliveryState === "sent") {
            redirectTarget.searchParams.set("collectionsComposeStatus", "sent");
          } else {
            redirectTarget.searchParams.set(
              "collectionsComposeError",
              body.failureReason ?? "Collections email could not be sent.",
            );
            redirectTarget.hash = composeId;
          }
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to send collections email", error);
          const redirectTarget = new URL("/collections", requestBaseUrl);
          redirectTarget.searchParams.set("tab", "email");
          redirectTarget.searchParams.set("collectionsComposeError", "Collections email could not be sent.");
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        }
      }

      if (pathname === "/collections/compose/prepare-attachment") {
        try {
          const form = await readMultipartFormBody(request, requestBaseUrl);
          const composeId = form.get("composeId")?.toString() ?? "collections-compose";
          const providerThreadId = form.get("providerThreadId")?.toString();
          const attachmentKind = form.get("attachmentKind")?.toString();
          const redirectTarget = new URL("/collections", requestBaseUrl);
          redirectTarget.searchParams.set("tab", "email");
          if (providerThreadId) {
            redirectTarget.searchParams.set("threadId", providerThreadId);
          }
          redirectTarget.hash = composeId;
          applyCollectionsComposeDraftQueryState(redirectTarget, form);

          if (attachmentKind === "invoice") {
            const invoiceNumbers = uniqueFormValues(form.getAll("selectedInvoiceNumbers"));
            if (invoiceNumbers.length === 0) {
              redirectTarget.searchParams.set(
                "collectionsComposeError",
                "Choose at least one invoice before attaching invoice documents.",
              );
              response.writeHead(303, { location: redirectTarget.toString() });
              response.end();
              return;
            }
            await verifyCollectionsInvoiceAttachments(apiBaseUrl, invoiceNumbers);
            for (const invoiceNumber of invoiceNumbers) {
              appendCollectionsComposeDraftAttachment(
                redirectTarget,
                "invoice",
                invoiceNumber,
                `Invoice ${invoiceNumber}.pdf`,
              );
            }
          } else if (attachmentKind === "soa") {
            await verifyCollectionsSoaAttachment(apiBaseUrl, form);
            const accountLabel =
              form.get("accountNumber")?.toString() ||
              form.get("billingAccountId")?.toString() ||
              "account";
            appendCollectionsComposeDraftAttachment(
              redirectTarget,
              "soa",
              accountLabel,
              "Statement of account.pdf",
            );
          } else {
            redirectTarget.searchParams.set(
              "collectionsComposeError",
              "Choose an invoice or SOA attachment action.",
            );
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          redirectTarget.searchParams.set("collectionsComposeStatus", "attachment_ready");
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to prepare collections attachment", error);
          const redirectTarget = new URL("/collections", requestBaseUrl);
          redirectTarget.searchParams.set("tab", "email");
          redirectTarget.searchParams.set(
            "collectionsComposeError",
            error instanceof Error ? error.message : "Attachment could not be generated.",
          );
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        }
      }

      if (pathname === "/tasks/compose") {
        try {
          const form = await readMultipartFormBody(request, requestBaseUrl);
          const composeId = form.get("composeId")?.toString() ?? "task-compose";
          const redirectTarget = new URL("/tasks", requestBaseUrl);
          redirectTarget.hash = `task-detail-${composeId}`;

          const senderIdentityId = form.get("senderIdentityId")?.toString();
          const subjectLine = form.get("subjectLine")?.toString();
          const bodyPreview = form.get("bodyPreview")?.toString();
          const ccEmails = readEmailListField(form, "cc");
          const accountJson = form.get("accountJson")?.toString();
          const contactJson = form.get("contactJson")?.toString();
          const invoicesJson = form.get("invoicesJson")?.toString();
          const attachments = await readEmailAttachments(form);

          if (
            !senderIdentityId ||
            !subjectLine ||
            !bodyPreview ||
            !accountJson ||
            !contactJson ||
            !invoicesJson
          ) {
            redirectTarget.searchParams.set(
              "taskComposeError",
              "The task is missing compose context or a sender identity.",
            );
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          const payload = JSON.stringify({
            principal: {
              id: "web_console",
              roles: ["ar_manager"],
            },
            senderIdentityId,
            workflowKind: "request_remittance",
            account: JSON.parse(accountJson),
            contact: JSON.parse(contactJson),
            invoices: JSON.parse(invoicesJson),
            subjectLine,
            bodyPreview,
            ...(ccEmails.length > 0 ? { ccEmails } : {}),
            ...(attachments.length > 0 ? { attachments } : {}),
          });

          const apiResponse = await fetch(`${apiBaseUrl}/v1/email/outbound/send`, {
            method: "POST",
            headers: {
              "content-type": "application/json; charset=utf-8",
            },
            body: payload,
          });

          if (!apiResponse.ok) {
            const errorBody = (await apiResponse.json().catch(async () => ({
              message: await apiResponse.text(),
            }))) as { message?: string };
            redirectTarget.searchParams.set(
              "taskComposeError",
              errorBody.message ?? "Task email could not be sent.",
            );
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          const body = (await apiResponse.json()) as {
            deliveryState?: string;
            failureReason?: string;
          };
          redirectTarget.hash = "";
          if (body.deliveryState === "approval_needed") {
            redirectTarget.searchParams.set("taskComposeStatus", "approval_needed");
          } else if (body.deliveryState === "sent") {
            await markTaskCompletedAfterEmailSend(apiBaseUrl, composeId);
            redirectTarget.searchParams.set("taskComposeStatus", "sent");
          } else {
            redirectTarget.searchParams.set(
              "taskComposeError",
              body.failureReason ?? "Task email could not be sent.",
            );
            redirectTarget.hash = `task-detail-${composeId}`;
          }
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to send task email", error);
          const redirectTarget = new URL("/tasks", requestBaseUrl);
          redirectTarget.searchParams.set("taskComposeError", "Task email could not be sent.");
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        }
      }

      if (pathname === "/tasks/compose/apply") {
        try {
          const form = await readMultipartFormBody(request, requestBaseUrl);
          const composeId = form.get("composeId")?.toString() ?? "task-compose";
          const generator = form.get("draftGenerator")?.toString() === "template" ? "template" : "ai";
          const redirectTarget = new URL("/tasks", requestBaseUrl);
          redirectTarget.hash = `task-detail-${composeId}`;

          const subjectLine =
            (generator === "template"
              ? form.get("templateSubjectLine")?.toString()
              : form.get("aiSubjectLine")?.toString()) ?? "";
          const bodyPreview =
            (generator === "template"
              ? form.get("templateBody")?.toString()
              : form.get("aiBody")?.toString()) ?? "";
          const note =
            (generator === "template"
              ? form.get("templateNote")?.toString()
              : form.get("aiNote")?.toString()) ?? "";

          if (!subjectLine.trim() || !bodyPreview.trim()) {
            redirectTarget.searchParams.set(
              "taskComposeError",
              "The selected draft could not be applied.",
            );
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          redirectTarget.searchParams.set("taskComposeDraftComposeId", composeId);
          redirectTarget.searchParams.set("taskComposeDraftGenerator", generator);
          redirectTarget.searchParams.set("taskComposeDraftSubject", subjectLine);
          redirectTarget.searchParams.set("taskComposeDraftBody", bodyPreview);
          if (note.trim()) {
            redirectTarget.searchParams.set("taskComposeDraftNote", note.trim());
          }

          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to apply task draft", error);
          const redirectTarget = new URL("/tasks", requestBaseUrl);
          redirectTarget.searchParams.set("taskComposeError", "The selected draft could not be applied.");
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        }
      }

      if (pathname === "/tasks/compose/attach-invoice") {
        try {
          const form = await readMultipartFormBody(request, requestBaseUrl);
          const composeId = form.get("composeId")?.toString() ?? "task-compose";
          const invoiceIds = form
            .getAll("selectedInvoiceIds")
            .map((value) => value.toString())
            .filter((value, index, array) => value.trim().length > 0 && array.indexOf(value) === index);
          const redirectTarget = new URL("/tasks", requestBaseUrl);
          redirectTarget.hash = `task-detail-${composeId}`;
          applyTaskComposeDraftQueryState(redirectTarget, form);

          if (invoiceIds.length === 0) {
            redirectTarget.searchParams.set(
              "taskInvoiceAttachmentError",
              "Choose at least one invoice before uploading a physical invoice file.",
            );
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          const file = await readSingleAttachment(form, "invoiceAttachment");
          if (!file) {
            redirectTarget.searchParams.set(
              "taskInvoiceAttachmentError",
              "Choose a PDF or image file before attaching it to the invoice.",
            );
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          const normalizedMimeType = file.mimeType?.toLowerCase() ?? "";
          const isSupportedType =
            normalizedMimeType === "application/pdf" || normalizedMimeType.startsWith("image/");
          if (!isSupportedType) {
            redirectTarget.searchParams.set(
              "taskInvoiceAttachmentError",
              "Only PDF and image invoice attachments are supported right now.",
            );
            response.writeHead(303, { location: redirectTarget.toString() });
            response.end();
            return;
          }

          for (const invoiceId of invoiceIds) {
            const apiResponse = await fetch(
              `${apiBaseUrl}/v1/invoices/${encodeURIComponent(invoiceId)}/attachment`,
              {
                method: "POST",
                headers: {
                  "content-type": "application/json; charset=utf-8",
                },
                body: JSON.stringify({
                  fileName: file.fileName,
                  ...(file.mimeType ? { mimeType: file.mimeType } : {}),
                  contentBase64: file.contentBase64,
                  uploadedBy: "web_console",
                }),
              },
            );

            if (!apiResponse.ok) {
              const errorBody = (await apiResponse.json().catch(async () => ({
                message: await apiResponse.text(),
              }))) as { message?: string };
              redirectTarget.searchParams.set(
                "taskInvoiceAttachmentError",
                errorBody.message ?? "Invoice attachment could not be stored.",
              );
              response.writeHead(303, { location: redirectTarget.toString() });
              response.end();
              return;
            }
          }

          redirectTarget.searchParams.set(
            "taskInvoiceAttachmentStatus",
            `Attached ${file.fileName} to ${invoiceIds.length} invoice record${invoiceIds.length === 1 ? "" : "s"}.`,
          );
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to attach invoice document", error);
          const redirectTarget = new URL("/tasks", requestBaseUrl);
          redirectTarget.searchParams.set(
            "taskInvoiceAttachmentError",
            "Invoice attachment could not be stored.",
          );
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        }
      }

      if (pathname === "/control-center/workflows/create") {
        let form: URLSearchParams | undefined;
        try {
          form = await readFormBody(request);
          const payload = {
            principal: { id: "web_console", roles: ["controller", "ar_manager"] },
            tenantId: "default",
            category: form.get("category")?.toString() || "collections",
            name: form.get("name")?.toString() || "New workflow",
            senderIdentityId: form.get("senderIdentityId")?.toString() || undefined,
            senderEmail: form.get("senderEmail")?.toString() || undefined,
            testEmailRecipient: form.get("testEmailRecipient")?.toString() || undefined,
            testCallRecipient: form.get("testCallRecipient")?.toString() || undefined,
            timezone: form.get("timezone")?.toString() || "Asia/Manila",
            outreachWindowStart: form.get("outreachWindowStart")?.toString() || "08:00",
            outreachWindowEnd: form.get("outreachWindowEnd")?.toString() || "17:00",
            outreachDays: readWorkflowOutreachDays(form),
            weekendCallingEnabled: workflowDaysIncludeWeekend(readWorkflowOutreachDays(form)),
          };
          const apiResponse = await fetch(`${apiBaseUrl}/v1/control-center/workflows`, {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify(payload),
          });
          if (!apiResponse.ok) {
            const message = await safeReadErrorMessage(apiResponse, "Workflow creation failed.");
            throw new Error(message);
          }
          const body = (await apiResponse.json()) as { workflow?: { id?: string } };
          const location = body.workflow?.id
            ? `/control-center?workflow=${encodeURIComponent(body.workflow.id)}`
            : "/control-center";
          response.writeHead(303, { location });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to create control-center workflow", error);
          const fallbackInput = buildFallbackWorkflowInput(form);
          const fallbackWorkflow = createFallbackWorkflow(buildSeedControlCenter, fallbackInput);
          response.writeHead(303, {
            location: `/control-center?workflow=${encodeURIComponent(fallbackWorkflow.id)}`,
          });
          response.end();
          return;
        }
      }

      if (pathname === "/control-center/workflows/update") {
        let form: URLSearchParams | undefined;
        let workflowId: string | undefined;
        try {
          form = await readFormBody(request);
          workflowId = form.get("workflowId")?.toString();
          const payload = {
            principal: { id: "web_console", roles: ["controller", "ar_manager"] },
            name: form.get("name")?.toString() || undefined,
            senderIdentityId: form.get("senderIdentityId")?.toString() || undefined,
            senderEmail: form.get("senderEmail")?.toString() || undefined,
            testEmailRecipient: form.get("testEmailRecipient")?.toString() || undefined,
            testCallRecipient: form.get("testCallRecipient")?.toString() || undefined,
            timezone: form.get("timezone")?.toString() || undefined,
            outreachWindowStart: form.get("outreachWindowStart")?.toString() || undefined,
            outreachWindowEnd: form.get("outreachWindowEnd")?.toString() || undefined,
            outreachDays: readWorkflowOutreachDays(form),
            weekendCallingEnabled: workflowDaysIncludeWeekend(readWorkflowOutreachDays(form)),
          };
          const apiResponse = await fetch(`${apiBaseUrl}/v1/control-center/workflows/${workflowId}`, {
            method: "PUT",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify(payload),
          });
          if (!apiResponse.ok) {
            const message = await safeReadErrorMessage(apiResponse, "Workflow update failed.");
            throw new Error(message);
          }
          response.writeHead(303, { location: workflowId ? `/control-center?workflow=${encodeURIComponent(workflowId)}` : "/control-center" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to update control-center workflow", error);
          if (workflowId && form) {
            updateFallbackWorkflowFromForm(form, workflowId);
            response.writeHead(303, {
              location: `/control-center?workflow=${encodeURIComponent(workflowId)}&controlCenterActionStatus=success&controlCenterActionMessage=${encodeURIComponent("Workflow settings saved locally because the API was unavailable.")}`,
            });
            response.end();
            return;
          }
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Workflow update failed." }));
          return;
        }
      }

      if (pathname === "/control-center/workflows/test-email") {
        const form = await readFormBody(request);
        const workflowId = form.get("workflowId")?.toString();
        const target = buildControlCenterWorkflowRedirect(requestBaseUrl, workflowId);
        try {
          const recipientEmail = form.get("testEmailRecipient")?.toString().trim();
          if (!recipientEmail) {
            throw new Error("Enter a test email recipient first.");
          }
          await persistControlCenterWorkflowForm(apiBaseUrl, form);
          const senderIdentity = await resolveDefaultSenderIdentity(apiBaseUrl, form.get("senderIdentityId")?.toString());
          if (!senderIdentity?.id) {
            throw new Error("No connected outbound email sender is configured.");
          }
          const sendResponse = await fetch(`${apiBaseUrl}/v1/control-center/test-email`, {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              principal: { id: "web_console", roles: ["controller", "ar_manager"] },
              senderIdentityId: senderIdentity.id,
              recipientEmail,
              workflowId: form.get("workflowId")?.toString() || "control-center-test",
              workflowName: form.get("name")?.toString() || "Control Center workflow",
            }),
          });
          if (!sendResponse.ok) {
            throw new Error(await safeReadErrorMessage(sendResponse, "Test email could not be sent."));
          }
          const result = (await sendResponse.json().catch(() => ({}))) as { deliveryState?: string; failureReason?: string };
          if (result.deliveryState && result.deliveryState !== "sent") {
            throw new Error(result.failureReason ?? `Test email ended in ${result.deliveryState}.`);
          }
          target.searchParams.set("controlCenterActionStatus", "success");
          target.searchParams.set("controlCenterActionMessage", `Test email sent to ${recipientEmail}.`);
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to send control-center test email", error);
          target.searchParams.set("controlCenterActionStatus", "error");
          target.searchParams.set(
            "controlCenterActionMessage",
            error instanceof Error ? error.message : "Test email could not be sent.",
          );
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        }
      }

      if (pathname === "/control-center/workflows/test-call") {
        const form = await readFormBody(request);
        const workflowId = form.get("workflowId")?.toString();
        const target = buildControlCenterWorkflowRedirect(requestBaseUrl, workflowId);
        try {
          const phoneNumber = normalizeOutboundPhoneNumber(form.get("testCallRecipient")?.toString());
          if (!phoneNumber) {
            throw new Error("Enter a valid test call recipient first.");
          }
          await persistControlCenterWorkflowForm(apiBaseUrl, form);
          const callResponse = await fetch(`${apiBaseUrl}/v1/retell/collections/outbound-call`, {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify(buildControlCenterTestCallPayload(form, phoneNumber)),
          });
          if (!callResponse.ok) {
            throw new Error(await safeReadErrorMessage(callResponse, "Test call could not be started."));
          }
          const result = (await callResponse.json().catch(() => ({}))) as { status?: string; blockedReason?: string };
          if (result.status !== "started") {
            throw new Error(result.blockedReason ?? "Test call was blocked by call-window or safety checks.");
          }
          target.searchParams.set("controlCenterActionStatus", "success");
          target.searchParams.set("controlCenterActionMessage", `Test call started to ${phoneNumber}.`);
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to start control-center test call", error);
          target.searchParams.set("controlCenterActionStatus", "error");
          target.searchParams.set(
            "controlCenterActionMessage",
            error instanceof Error ? error.message : "Test call could not be started.",
          );
          response.writeHead(303, { location: target.toString() });
          response.end();
          return;
        }
      }

      if (pathname === "/control-center/workflows/toggle") {
        let workflowId: string | undefined;
        let enabled = false;
        try {
          const form = await readFormBody(request);
          workflowId = form.get("workflowId")?.toString();
          enabled = form.get("enabled")?.toString() === "true";
          const apiResponse = await fetch(`${apiBaseUrl}/v1/control-center/workflows/${workflowId}/toggle`, {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              principal: { id: "web_console", roles: ["controller", "ar_manager"] },
              enabled,
            }),
          });
          if (!apiResponse.ok) {
            if (workflowId) {
              toggleFallbackWorkflow(buildSeedControlCenter, { workflowId, enabled });
            }
          }
          response.writeHead(303, { location: workflowId ? `/control-center?workflow=${encodeURIComponent(workflowId)}` : "/control-center" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to toggle control-center workflow", error);
          if (workflowId) {
            toggleFallbackWorkflow(buildSeedControlCenter, { workflowId, enabled });
            response.writeHead(303, {
              location: `/control-center?workflow=${encodeURIComponent(workflowId)}`,
            });
            response.end();
            return;
          }
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Workflow toggle failed." }));
          return;
        }
      }

      if (pathname === "/control-center/workflows/delete") {
        try {
          const form = await readFormBody(request);
          const workflowId = form.get("workflowId")?.toString();
          await fetch(`${apiBaseUrl}/v1/control-center/workflows/${workflowId}`, {
            method: "DELETE",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({ principal: { id: "web_console", roles: ["controller", "ar_manager"] } }),
          });
          response.writeHead(303, { location: "/control-center" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to delete control-center workflow", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Workflow deletion failed." }));
          return;
        }
      }

      if (pathname === "/control-center/workflows/enroll") {
        const form = await readFormBody(request);
        const workflowId = form.get("workflowId")?.toString();
        const billingAccountIds = Array.from(
          new Set(
            [
              ...form.getAll("billingAccountIds").map((value) => value.toString()),
              ...(form.get("billingAccountId")?.toString() ? [form.get("billingAccountId")!.toString()] : []),
            ].filter((value) => value.length > 0),
          ),
        );
        try {
          if (!workflowId || billingAccountIds.length === 0) {
            response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: "Workflow enrollment requires a workflow and at least one billing account." }));
            return;
          }
          for (const billingAccountId of billingAccountIds) {
            const parentAccountId = await resolveWorkflowEnrollmentParentAccountId(
              apiBaseUrl,
              billingAccountId,
              form.get("parentAccountId")?.toString() || undefined,
            );
            const apiResponse = await fetch(`${apiBaseUrl}/v1/control-center/workflows/${workflowId}/customers`, {
              method: "POST",
              headers: { "content-type": "application/json; charset=utf-8" },
              body: JSON.stringify({
                principal: { id: "web_console", roles: ["controller", "ar_manager"] },
                tenantId: "default",
                billingAccountId,
                parentAccountId,
              }),
            });
            if (!apiResponse.ok) {
              assignFallbackWorkflowCustomer(buildSeedControlCenter, {
                workflowId,
                billingAccountId,
                parentAccountId,
              });
            }
          }
          response.writeHead(303, {
            location: `/control-center?workflow=${encodeURIComponent(workflowId)}`,
          });
          response.end();
          return;
        } catch (error) {
          try {
            if (!workflowId || billingAccountIds.length === 0) {
              throw error;
            }
            for (const billingAccountId of billingAccountIds) {
              const parentAccountId =
                form.get("parentAccountId")?.toString() || billingAccountId;
              assignFallbackWorkflowCustomer(buildSeedControlCenter, {
                workflowId,
                billingAccountId,
                parentAccountId,
              });
            }
            response.writeHead(303, {
              location: `/control-center?workflow=${encodeURIComponent(workflowId)}`,
            });
            response.end();
            return;
          } catch (fallbackError) {
            console.error("Failed to enroll control-center workflow customer", error, fallbackError);
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: "Workflow enrollment failed." }));
            return;
          }
        }
      }

      if (pathname === "/control-center/workflows/customer/pause") {
        const form = await readFormBody(request);
        const workflowId = form.get("workflowId")?.toString();
        const executionId = form.get("executionId")?.toString();
        const reason = form.get("reason")?.toString();
        try {
          const apiResponse = await fetch(`${apiBaseUrl}/v1/control-center/workflows/${workflowId}/customers/${executionId}/pause`, {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              principal: { id: "web_console", roles: ["controller", "ar_manager"] },
              ...(reason ? { reason } : {}),
            }),
          });
          if (workflowId && executionId && !apiResponse.ok) {
            pauseFallbackWorkflowCustomer(buildSeedControlCenter, {
              workflowId,
              executionId,
              ...(reason ? { reason } : {}),
            });
          }
          response.writeHead(303, {
            location: workflowId ? `/control-center?workflow=${encodeURIComponent(workflowId)}` : "/control-center",
          });
          response.end();
          return;
        } catch (error) {
          try {
            if (!workflowId || !executionId) {
              throw error;
            }
            pauseFallbackWorkflowCustomer(buildSeedControlCenter, {
              workflowId,
              executionId,
              ...(reason ? { reason } : {}),
            });
            response.writeHead(303, {
              location: `/control-center?workflow=${encodeURIComponent(workflowId)}`,
            });
            response.end();
            return;
          } catch (fallbackError) {
            console.error("Failed to pause control-center workflow customer", error, fallbackError);
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: "Workflow pause failed." }));
            return;
          }
        }
      }

      if (pathname === "/control-center/workflows/customer/resume") {
        const form = await readFormBody(request);
        const workflowId = form.get("workflowId")?.toString();
        const executionId = form.get("executionId")?.toString();
        const reason = form.get("reason")?.toString();
        try {
          const apiResponse = await fetch(`${apiBaseUrl}/v1/control-center/workflows/${workflowId}/customers/${executionId}/resume`, {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              principal: { id: "web_console", roles: ["controller", "ar_manager"] },
              ...(reason ? { reason } : {}),
            }),
          });
          if (workflowId && executionId && !apiResponse.ok) {
            resumeFallbackWorkflowCustomer(buildSeedControlCenter, {
              workflowId,
              executionId,
              ...(reason ? { reason } : {}),
            });
          }
          response.writeHead(303, {
            location: workflowId ? `/control-center?workflow=${encodeURIComponent(workflowId)}` : "/control-center",
          });
          response.end();
          return;
        } catch (error) {
          try {
            if (!workflowId || !executionId) {
              throw error;
            }
            resumeFallbackWorkflowCustomer(buildSeedControlCenter, {
              workflowId,
              executionId,
              ...(reason ? { reason } : {}),
            });
            response.writeHead(303, {
              location: `/control-center?workflow=${encodeURIComponent(workflowId)}`,
            });
            response.end();
            return;
          } catch (fallbackError) {
            console.error("Failed to resume control-center workflow customer", error, fallbackError);
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: "Workflow resume failed." }));
            return;
          }
        }
      }

      if (pathname === "/control-center/workflows/customer/unenroll") {
        const form = await readFormBody(request);
        const workflowId = form.get("workflowId")?.toString();
        const executionId = form.get("executionId")?.toString();
        try {
          const apiResponse = await fetch(`${apiBaseUrl}/v1/control-center/workflows/${workflowId}/customers/${executionId}`, {
            method: "DELETE",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              principal: { id: "web_console", roles: ["controller", "ar_manager"] },
            }),
          });
          if (workflowId && executionId && !apiResponse.ok) {
            unenrollFallbackWorkflowCustomer(buildSeedControlCenter, {
              workflowId,
              executionId,
            });
          }
          response.writeHead(303, {
            location: workflowId ? `/control-center?workflow=${encodeURIComponent(workflowId)}` : "/control-center",
          });
          response.end();
          return;
        } catch (error) {
          try {
            if (!workflowId || !executionId) {
              throw error;
            }
            unenrollFallbackWorkflowCustomer(buildSeedControlCenter, {
              workflowId,
              executionId,
            });
            response.writeHead(303, {
              location: `/control-center?workflow=${encodeURIComponent(workflowId)}`,
            });
            response.end();
            return;
          } catch (fallbackError) {
            console.error("Failed to unenroll control-center workflow customer", error, fallbackError);
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: "Workflow unenrollment failed." }));
            return;
          }
        }
      }

      if (pathname === "/control-center/stages/create") {
        const form = await readFormBody(request);
        const workflowId = form.get("workflowId")?.toString();
        const triggerComparator = form.get("triggerComparator")?.toString() || "due_in_days";
        const rawOffsetDays = Number.parseInt(form.get("offsetDays")?.toString() || "0", 10);
        const outreachType = form.get("outreachType")?.toString() || "email";
        const triggerType = form.get("triggerType")?.toString() || "relative_due_date";
        const templateMode = form.get("templateMode")?.toString() || "ai_generated";
        const aiStrategyId = form.get("aiStrategyId")?.toString() || undefined;
        const templateId = form.get("templateId")?.toString() || undefined;
        const notes = form.get("notes")?.toString() || "New stage";
        const triggerConfig = {
          comparator: triggerComparator as
            | "due_in_days"
            | "due_today"
            | "days_past_due"
            | "promise_missed"
            | "remittance_missing_after_payment"
            | "no_response_after_prior_stage"
            | "manual",
          offsetDays: triggerComparator === "due_today" ? 0 : rawOffsetDays,
        };
        try {
          const apiResponse = await fetch(`${apiBaseUrl}/v1/control-center/stages`, {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              principal: { id: "web_console", roles: ["controller", "ar_manager"] },
              tenantId: "default",
              workflowId,
              outreachType,
              triggerType,
              triggerConfig,
              templateMode,
              aiStrategyId,
              templateId,
              notes,
            }),
          });
          if (!apiResponse.ok && workflowId) {
            addFallbackWorkflowStage(buildSeedControlCenter, {
              workflowId,
              outreachType: outreachType as "email" | "call" | "sms",
              triggerType: triggerType as
                | "relative_due_date"
                | "promise_to_pay_state"
                | "payment_signal_state"
                | "response_gap"
                | "manual_operator_trigger",
              triggerConfig,
              templateMode: templateMode as "pre_saved_template" | "ai_generated",
              ...(templateId ? { templateId } : {}),
              ...(aiStrategyId ? { aiStrategyId } : {}),
              notes,
            });
          }
          response.writeHead(303, { location: workflowId ? `/control-center?workflow=${encodeURIComponent(workflowId)}` : "/control-center" });
          response.end();
          return;
        } catch (error) {
          try {
            if (!workflowId) {
              throw error;
            }
            addFallbackWorkflowStage(buildSeedControlCenter, {
              workflowId,
              outreachType: outreachType as "email" | "call" | "sms",
              triggerType: triggerType as
                | "relative_due_date"
                | "promise_to_pay_state"
                | "payment_signal_state"
                | "response_gap"
                | "manual_operator_trigger",
              triggerConfig: {
                comparator: triggerComparator as
                  | "due_in_days"
                  | "due_today"
                  | "days_past_due"
                  | "promise_missed"
                  | "remittance_missing_after_payment"
                  | "no_response_after_prior_stage"
                  | "manual",
                offsetDays: triggerComparator === "due_today" ? 0 : rawOffsetDays,
              },
              templateMode: templateMode as "pre_saved_template" | "ai_generated",
              ...(templateId ? { templateId } : {}),
              ...(aiStrategyId ? { aiStrategyId } : {}),
              notes,
            });
            response.writeHead(303, { location: `/control-center?workflow=${encodeURIComponent(workflowId)}` });
            response.end();
            return;
          } catch (fallbackError) {
            console.error("Failed to create control-center stage", error, fallbackError);
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: "Stage creation failed." }));
            return;
          }
        }
      }

      if (pathname === "/control-center/stages/delete") {
        const form = await readFormBody(request);
        const workflowId = form.get("workflowId")?.toString();
        const stageId = form.get("stageId")?.toString();
        try {
          if (!workflowId || !stageId) {
            response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: "Stage deletion requires a workflow and stage id." }));
            return;
          }
          const apiResponse = await fetch(`${apiBaseUrl}/v1/control-center/stages/${encodeURIComponent(stageId)}`, {
            method: "DELETE",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              principal: { id: "web_console", roles: ["controller", "ar_manager"] },
            }),
          });
          if (!apiResponse.ok) {
            removeFallbackWorkflowStage(buildSeedControlCenter, { workflowId, stageId });
          }
          response.writeHead(303, { location: `/control-center?workflow=${encodeURIComponent(workflowId)}` });
          response.end();
          return;
        } catch (error) {
          try {
            if (!workflowId || !stageId) {
              throw error;
            }
            removeFallbackWorkflowStage(buildSeedControlCenter, { workflowId, stageId });
            response.writeHead(303, { location: `/control-center?workflow=${encodeURIComponent(workflowId)}` });
            response.end();
            return;
          } catch (fallbackError) {
            console.error("Failed to delete control-center stage", error, fallbackError);
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: "Stage deletion failed." }));
            return;
          }
        }
      }

      if (pathname === "/control-center/templates/create") {
        const form = await readFormBody(request);
        try {
          const createResponse = await fetch(`${apiBaseUrl}/v1/control-center/templates`, {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              principal: { id: "web_console", roles: ["controller", "ar_manager"] },
              tenantId: "default",
              name: form.get("name")?.toString() || "New Template",
              subject: form.get("subject")?.toString() || "",
              body: form.get("body")?.toString() || "",
              channelCompatibility: (form.get("channelCompatibility")?.toString() || "email")
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
            }),
          });
          if (!createResponse.ok) {
            throw new Error(await safeReadErrorMessage(createResponse, "Template creation failed."));
          }
          await createResponse.json().catch(() => null);
          response.writeHead(303, {
            location: "/control-center?controlCenterTab=email-templates",
          });
          response.end();
          return;
        } catch (error) {
          try {
            createFallbackTemplate(buildSeedControlCenter, {
              tenantId: "default",
              name: form.get("name")?.toString() || "New Template",
              subject: form.get("subject")?.toString() || "",
              body: form.get("body")?.toString() || "",
              ccEmails: (form.get("ccEmails")?.toString() ?? "")
                .split(",")
                .map((email) => email.trim())
                .filter((email) => email.length > 0),
              channelCompatibility: ((form.get("channelCompatibility")?.toString() || "email")
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean) as Array<"email" | "sms" | "voice_agent">),
              autoCorrectEnabled: form.get("autoCorrectEnabled")?.toString() === "on",
              isDefault: form.get("isDefault")?.toString() === "on",
              previewSeedKey: "bill-default",
            });
            response.writeHead(303, {
              location: "/control-center?controlCenterTab=email-templates",
            });
            response.end();
            return;
          } catch (fallbackError) {
            console.error("Failed to create template", error, fallbackError);
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: "Template creation failed." }));
            return;
          }
        }
      }

      if (pathname === "/control-center/templates/update") {
        const form = await readFormBody(request);
        try {
          const templateId = form.get("templateId")?.toString();
          const updateResponse = await fetch(`${apiBaseUrl}/v1/control-center/templates/${templateId}`, {
            method: "PUT",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              principal: { id: "web_console", roles: ["controller", "ar_manager"] },
              name: form.get("name")?.toString() || undefined,
              subject: form.get("subject")?.toString() || undefined,
              body: form.get("body")?.toString() || undefined,
              ccEmails: (form.get("ccEmails")?.toString() ?? "")
                .split(",")
                .map((email) => email.trim())
                .filter((email) => email.length > 0),
              autoCorrectEnabled: form.get("autoCorrectEnabled")?.toString() === "on",
              isDefault: form.get("isDefault")?.toString() === "on",
            }),
          });
          if (!updateResponse.ok) {
            throw new Error(await safeReadErrorMessage(updateResponse, "Template update failed."));
          }
          response.writeHead(303, {
            location: "/control-center?controlCenterTab=email-templates",
          });
          response.end();
          return;
        } catch (error) {
          try {
            const templateId = form.get("templateId")?.toString();
            if (!templateId) {
              throw error;
            }
            const fallbackName = form.get("name")?.toString() || undefined;
            const fallbackSubject = form.get("subject")?.toString() || undefined;
            const fallbackBody = form.get("body")?.toString() || undefined;
            const fallbackTemplate = updateFallbackTemplate(buildSeedControlCenter, templateId, {
              ...(fallbackName !== undefined ? { name: fallbackName } : {}),
              ...(fallbackSubject !== undefined ? { subject: fallbackSubject } : {}),
              ...(fallbackBody !== undefined ? { body: fallbackBody } : {}),
              ccEmails: (form.get("ccEmails")?.toString() ?? "")
                .split(",")
                .map((email) => email.trim())
                .filter((email) => email.length > 0),
              autoCorrectEnabled: form.get("autoCorrectEnabled")?.toString() === "on",
              isDefault: form.get("isDefault")?.toString() === "on",
            });
            if (!fallbackTemplate) {
              throw error;
            }
            response.writeHead(303, {
              location: "/control-center?controlCenterTab=email-templates",
            });
            response.end();
            return;
          } catch (fallbackError) {
            console.error("Failed to update template", error, fallbackError);
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: "Template update failed." }));
            return;
          }
        }
      }

      if (pathname === "/control-center/call-agent/update") {
        try {
          const form = await readFormBody(request);
          await fetch(`${apiBaseUrl}/v1/control-center/call-agent`, {
            method: "PUT",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              principal: { id: "web_console", roles: ["controller", "ar_manager"] },
              outboundCallingEnabled: form.get("outboundCallingEnabled")?.toString() === "on",
            }),
          });
          response.writeHead(303, { location: "/control-center?controlCenterTab=call-agent" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to update call agent config", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Call agent update failed." }));
          return;
        }
      }

      if (pathname === "/control-center/config/update") {
        try {
          const form = await readFormBody(request);
          await fetch(`${apiBaseUrl}/v1/control-center/config`, {
            method: "PUT",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              principal: { id: "web_console", roles: ["controller", "ar_manager"] },
              defaultTimezone: form.get("defaultTimezone")?.toString() || undefined,
              defaultSenderBehavior: form.get("defaultSenderBehavior")?.toString() || undefined,
              allowedChannels: (form.get("allowedChannels")?.toString() || "")
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
              channelFallbackPolicy: form.get("channelFallbackPolicy")?.toString() || undefined,
              sandboxMode: form.get("sandboxMode")?.toString() || undefined,
              defaultRiskApprovalMode: form.get("defaultRiskApprovalMode")?.toString() || undefined,
            }),
          });
          response.writeHead(303, { location: "/control-center" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to update control-center config", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Control-center config update failed." }));
          return;
        }
      }

      const approvalMatch = pathname.match(/^\/approvals\/([^/]+)\/(approve|reject)$/);
      const cashApplyMatch = pathname.match(/^\/cash-application\/([^/]+)\/(apply|split)\/([^/]+)$/);
      const cashSimpleActionMatch = pathname.match(
        /^\/cash-application\/([^/]+)\/(hold|reject|manual-review)$/
      );
      const cashResidualOverrideMatch = pathname.match(/^\/cash-application\/([^/]+)\/residual$/);
      const cashWritebackStageMatch = pathname.match(/^\/cash-application\/([^/]+)\/writeback\/stage$/);
      const buyerTaxProfileMatch = pathname.match(/^\/customer-profiles\/([^/]+)\/buyer-tax-profile$/);

      if (approvalMatch) {
        const [, approvalId, decision] = approvalMatch;

        try {
          const apiResponse = await fetch(`${apiBaseUrl}/v1/approvals/${approvalId}/${decision}`, {
            method: "POST",
            headers: {
              "x-principal-id": "web_console",
              "x-principal-roles": "controller,ar_manager",
            },
          });

          if (!apiResponse.ok) {
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: `Approval ${decision} failed.` }));
            return;
          }

          response.writeHead(303, { location: "/approvals" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to proxy approval action", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Approval action failed." }));
          return;
        }
      }

      if (cashApplyMatch) {
        const [, paymentId, action, invoiceId] = cashApplyMatch;

        try {
          const apiResponse = await fetch(
            `${apiBaseUrl}/v1/cash-application/${paymentId}/${action}/${invoiceId}`,
            {
              method: "POST",
              headers: {
                "x-principal-id": "web_console",
                "x-principal-roles": "controller,ar_manager",
              },
            }
          );

          if (!apiResponse.ok) {
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: `Cash application ${action} failed.` }));
            return;
          }

          response.writeHead(303, { location: "/cash-application" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to proxy cash application action", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Cash application action failed." }));
          return;
        }
      }

      if (cashSimpleActionMatch) {
        const [, paymentId, action] = cashSimpleActionMatch;

        try {
          const apiResponse = await fetch(`${apiBaseUrl}/v1/cash-application/${paymentId}/${action}`, {
            method: "POST",
            headers: {
              "x-principal-id": "web_console",
              "x-principal-roles": "controller,ar_manager",
            },
          });

          if (!apiResponse.ok) {
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: `Cash application ${action} failed.` }));
            return;
          }

          response.writeHead(303, { location: "/cash-application" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to proxy cash application action", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Cash application action failed." }));
          return;
        }
      }

      if (cashResidualOverrideMatch) {
        const [, paymentId] = cashResidualOverrideMatch;

        try {
          const form = await readFormBody(request);
          const payload = {
            residualType: form.get("residualType")?.toString(),
            reasonCode: form.get("reasonCode")?.toString() || undefined,
            note: form.get("note")?.toString() || undefined,
          };
          const apiResponse = await fetch(`${apiBaseUrl}/v1/cash-application/${paymentId}/residual`, {
            method: "PUT",
            headers: {
              "content-type": "application/json",
              "x-principal-id": "web_console",
              "x-principal-roles": "controller,ar_manager",
            },
            body: JSON.stringify(payload),
          });

          if (!apiResponse.ok) {
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: "Residual override failed." }));
            return;
          }

          response.writeHead(303, { location: "/cash-application" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to proxy residual override", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Residual override failed." }));
          return;
        }
      }

      if (cashWritebackStageMatch) {
        const [, paymentId] = cashWritebackStageMatch;

        try {
          const form = await readFormBody(request);
          const provider = form.get("provider")?.toString() || "odoo";
          const apiResponse = await fetch(
            `${apiBaseUrl}/v1/cash-application/${paymentId}/writeback/stage?provider=${encodeURIComponent(provider)}`,
            {
              method: "POST",
              headers: {
                "x-principal-id": "web_console",
                "x-principal-roles": "controller,ar_manager",
              },
            }
          );

          if (!apiResponse.ok) {
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: "Writeback staging failed." }));
            return;
          }

          response.writeHead(303, { location: "/cash-application" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to stage cash application writeback", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Writeback staging failed." }));
          return;
        }
      }

      if (buyerTaxProfileMatch) {
        const [, profileId] = buyerTaxProfileMatch;

        try {
          const form = await readFormBody(request);
          const topWithholdingAgent = form.get("isTopWithholdingAgent")?.toString();
          const defaultRateRaw = form.get("defaultWithholdingRateBps")?.toString();
          const payload = {
            withholdingDefaultType: form.get("withholdingDefaultType")?.toString() || "none",
            requires2307ForClosure: form.get("requires2307ForClosure")?.toString() === "true",
            ...(topWithholdingAgent === "true" || topWithholdingAgent === "false"
              ? { isTopWithholdingAgent: topWithholdingAgent === "true" }
              : {}),
            ...(defaultRateRaw && defaultRateRaw.trim().length > 0
              ? { defaultWithholdingRateBps: Number.parseInt(defaultRateRaw, 10) }
              : {}),
            ...(form.get("notes")?.toString()?.trim()
              ? { notes: form.get("notes")?.toString().trim() }
              : {}),
          };
          const apiResponse = await fetch(`${apiBaseUrl}/v1/customer_profiles/${profileId}/buyer-tax-profile`, {
            method: "PUT",
            headers: {
              "content-type": "application/json",
              "x-principal-id": "web_console",
              "x-principal-roles": "controller,ar_manager",
            },
            body: JSON.stringify(payload),
          });

          if (!apiResponse.ok) {
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: "Buyer tax profile update failed." }));
            return;
          }

          response.writeHead(303, { location: "/cash-application" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to update buyer tax profile", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Buyer tax profile update failed." }));
          return;
        }
      }

      if (pathname === "/integrations/odoo/invoices/sync") {
        try {
          const apiResponse = await fetch(`${apiBaseUrl}/v1/invoices/imports/sync?provider=odoo`, {
            method: "POST",
          });

          if (!apiResponse.ok) {
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: "Odoo invoice import failed." }));
            return;
          }

          response.writeHead(303, { location: "/invoices" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to sync Odoo invoices", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Odoo invoice import failed." }));
          return;
        }
      }

      if (
        pathname === "/integrations/odoo/invoices/create" ||
        pathname === "/integrations/odoo/invoices/update" ||
        pathname === "/integrations/odoo/invoices/delete"
      ) {
        try {
          const form = await readFormBody(request);
          const invoiceId = form.get("invoiceId")?.toString();
          const apiPath =
            pathname === "/integrations/odoo/invoices/create"
              ? "/v1/integrations/odoo/invoices"
              : pathname === "/integrations/odoo/invoices/update"
                ? `/v1/integrations/odoo/invoices/${invoiceId}`
                : `/v1/integrations/odoo/invoices/${invoiceId}`;
          const method =
            pathname === "/integrations/odoo/invoices/create"
              ? "POST"
              : pathname === "/integrations/odoo/invoices/update"
                ? "PATCH"
                : "DELETE";
          const payload =
            pathname === "/integrations/odoo/invoices/delete"
              ? undefined
              : JSON.stringify(Object.fromEntries([...form.entries()].filter(([key, value]) =>
                  key !== "invoiceId" && typeof value === "string" && value.trim().length > 0)));

          const apiResponse = await fetch(`${apiBaseUrl}${apiPath}`, {
            method,
            ...(payload
              ? {
                  headers: { "content-type": "application/json; charset=utf-8" },
                  body: payload,
                }
              : {}),
          });

          if (!apiResponse.ok) {
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ message: `Odoo invoice ${method.toLowerCase()} failed.` }));
            return;
          }

          response.writeHead(303, { location: "/invoices" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to proxy Odoo invoice action", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Odoo invoice action failed." }));
          return;
        }
      }
    }

    try {
      if (request.method === "GET" && pathname === "/connect/accounting") {
        const access = await validateClientConnectAccess(
          requestUrl.searchParams.get("token") ?? undefined,
        );
        if (!access.allowed || !access.claims || !access.token) {
          const html = await renderClientConnectAccessDeniedHtml({
            title: access.title ?? "Access denied",
            message: access.message ?? "A signed invite token is required.",
          });
          response.writeHead(403, { "content-type": "text/html; charset=utf-8" });
          response.end(html);
          return;
        }

        const html = await renderIntegrationPortalHtml({
          tenantSlug: access.claims.tenantSlug,
          clientName: access.claims.clientName,
          token: access.token,
          quickbooksStatus: requestUrl.searchParams.get("quickbooks") ?? undefined,
          quickbooksMessage: requestUrl.searchParams.get("message") ?? undefined,
          businessCentralStatus: requestUrl.searchParams.get("bc") ?? undefined,
          businessCentralMessage: requestUrl.searchParams.get("message") ?? undefined,
          sapStatus: requestUrl.searchParams.get("sapb1") ?? undefined,
          sapMessage: requestUrl.searchParams.get("message") ?? undefined,
          odooStatus: requestUrl.searchParams.get("odoo") ?? undefined,
          odooMessage: requestUrl.searchParams.get("message") ?? undefined,
          companyName: requestUrl.searchParams.get("company") ?? undefined,
          businessCentralConnectState:
            requestUrl.searchParams.get("bcConnectState") ?? undefined,
          odooConnectState: requestUrl.searchParams.get("odooConnectState") ?? undefined,
        });
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(html);
        return;
      }

      if (request.method === "GET" && pathname === "/integrations/inspector") {
        const access = await validateClientConnectAccess(
          requestUrl.searchParams.get("token") ?? undefined,
        );
        if (!access.allowed || !access.claims || !access.token) {
          const html = await renderClientConnectAccessDeniedHtml({
            title: access.title ?? "Access denied",
            message: access.message ?? "A signed invite token is required.",
          });
          response.writeHead(403, { "content-type": "text/html; charset=utf-8" });
          response.end(html);
          return;
        }

        const html = await renderIntegrationInspectorHtml({
          tenantSlug: access.claims.tenantSlug,
          clientName: access.claims.clientName,
          token: access.token,
        });
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(html);
        return;
      }

      if (request.method === "GET" && pathname === "/customers/soa") {
        const html = await renderCustomerStatementHtml({
          customerId: requestUrl.searchParams.get("customer") ?? undefined,
          asOf: requestUrl.searchParams.get("asOf") ?? undefined,
        });
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(html);
        return;
      }

      if (request.method === "GET" && pathname === "/invoices/export") {
        const exportUrl = new URL("/v1/invoices/export", apiBaseUrl);
        requestUrl.searchParams.forEach((value, key) => {
          exportUrl.searchParams.append(key, value);
        });
        const apiResponse = await fetch(exportUrl.toString(), {
          headers: buildPrincipalProxyHeaders(request.headers),
        });
        const body = Buffer.from(await apiResponse.arrayBuffer());
        if (!apiResponse.ok) {
          response.writeHead(apiResponse.status, {
            "content-type": apiResponse.headers.get("content-type") ?? "application/json; charset=utf-8",
          });
          response.end(body);
          return;
        }
        response.writeHead(apiResponse.status, {
          "content-type": apiResponse.headers.get("content-type") ?? "application/pdf",
          "content-disposition":
            apiResponse.headers.get("content-disposition") ??
            `attachment; filename="yield-aros-invoices.pdf"`,
        });
        response.end(body);
        return;
      }

      if (request.method === "GET" && pathname === "/collections/call-inbox/export") {
        const exportUrl = new URL("/v1/collections/call-inbox/export", apiBaseUrl);
        requestUrl.searchParams.forEach((value, key) => {
          exportUrl.searchParams.append(key, value);
        });
        const apiResponse = await fetch(exportUrl.toString(), {
          headers: buildPrincipalProxyHeaders(request.headers),
        });
        const body = await apiResponse.text();
        response.writeHead(apiResponse.status, {
          "content-type": apiResponse.headers.get("content-type") ?? "text/csv; charset=utf-8",
          "content-disposition":
            apiResponse.headers.get("content-disposition") ??
            `attachment; filename="yield-aros-call-inbox.csv"`,
        });
        response.end(body);
        return;
      }

      const html = await renderDashboardHtml(pathname, {
        cashAppTab: requestUrl.searchParams.get("tab") ?? undefined,
        analyticsTrend: readAnalyticsTrend(requestUrl),
        homeCalendarDate: requestUrl.searchParams.get("calendarDate") ?? undefined,
        taskFilters: readTaskFilters(requestUrl),
        invoiceFilters: readInvoiceFilters(requestUrl),
        customerId: requestUrl.searchParams.get("customer") ?? undefined,
        customerTab: requestUrl.searchParams.get("tab") ?? undefined,
        invoiceNumber: requestUrl.searchParams.get("invoice") ?? undefined,
        odooConnectState: requestUrl.searchParams.get("odooConnectState") ?? undefined,
        odooConnectError: requestUrl.searchParams.get("odooConnectError") ?? undefined,
        emailConnectError: requestUrl.searchParams.get("emailConnectError") ?? undefined,
        emailConnected: requestUrl.searchParams.get("emailConnected") ?? undefined,
        emailSender: requestUrl.searchParams.get("emailSender") ?? undefined,
        quickbooksStatus: requestUrl.searchParams.get("quickbooks") ?? undefined,
        quickbooksMessage: requestUrl.searchParams.get("message") ?? undefined,
        quickbooksCompany: requestUrl.searchParams.get("company") ?? undefined,
        sapStatus: requestUrl.searchParams.get("sapb1") ?? undefined,
        sapMessage: requestUrl.searchParams.get("message") ?? undefined,
        sapCompany: requestUrl.searchParams.get("company") ?? undefined,
        sapTestStatus: requestUrl.searchParams.get("sapTest") ?? undefined,
        sapTestMessage: requestUrl.searchParams.get("sapTestMessage") ?? undefined,
        inboxSenderIdentityId: requestUrl.searchParams.get("senderIdentityId") ?? undefined,
        inboxThreadId: requestUrl.searchParams.get("threadId") ?? undefined,
        inboxReplyStatus: requestUrl.searchParams.get("inboxReplyStatus") ?? undefined,
        inboxReplyError: requestUrl.searchParams.get("inboxReplyError") ?? undefined,
        collectionsComposeStatus: requestUrl.searchParams.get("collectionsComposeStatus") ?? undefined,
        collectionsComposeError: requestUrl.searchParams.get("collectionsComposeError") ?? undefined,
        collectionsComposeDraftComposeId:
          requestUrl.searchParams.get("collectionsComposeDraftComposeId") ?? undefined,
        collectionsComposeDraftGenerator:
          requestUrl.searchParams.get("collectionsComposeDraftGenerator") ?? undefined,
        collectionsComposeDraftSubject:
          requestUrl.searchParams.get("collectionsComposeDraftSubject") ?? undefined,
        collectionsComposeDraftBody:
          requestUrl.searchParams.get("collectionsComposeDraftBody") ?? undefined,
        collectionsComposeDraftAttachments:
          requestUrl.searchParams.getAll("collectionsComposeDraftAttachment"),
        taskComposeStatus: requestUrl.searchParams.get("taskComposeStatus") ?? undefined,
        taskComposeError: requestUrl.searchParams.get("taskComposeError") ?? undefined,
        taskInvoiceAttachmentStatus:
          requestUrl.searchParams.get("taskInvoiceAttachmentStatus") ?? undefined,
        taskInvoiceAttachmentError:
          requestUrl.searchParams.get("taskInvoiceAttachmentError") ?? undefined,
        taskComposeDraftComposeId: requestUrl.searchParams.get("taskComposeDraftComposeId") ?? undefined,
        taskComposeDraftGenerator: requestUrl.searchParams.get("taskComposeDraftGenerator") ?? undefined,
        taskComposeDraftSubject: requestUrl.searchParams.get("taskComposeDraftSubject") ?? undefined,
        taskComposeDraftBody: requestUrl.searchParams.get("taskComposeDraftBody") ?? undefined,
        taskComposeDraftNote: requestUrl.searchParams.get("taskComposeDraftNote") ?? undefined,
        onboardingImportStatus: readOnboardingImportStatus(requestUrl),
        controlCenterTab: readControlCenterTab(requestUrl),
        controlCenterExpandedWorkflowId: requestUrl.searchParams.get("workflow") ?? undefined,
        controlCenterSelectedTemplateId: requestUrl.searchParams.get("selectedTemplateId") ?? undefined,
        controlCenterTemplateSearch: requestUrl.searchParams.get("templateSearch") ?? undefined,
        controlCenterActionStatus: readControlCenterActionStatus(requestUrl),
        controlCenterActionMessage: requestUrl.searchParams.get("controlCenterActionMessage") ?? undefined,
        controlCenterEnrollModalWorkflowId: requestUrl.searchParams.get("enrollWorkflow") ?? undefined,
        controlCenterStageModalWorkflowId: requestUrl.searchParams.get("stageWorkflow") ?? undefined,
        controlCenterStageModalChannel: readControlCenterStageChannel(requestUrl),
        controlCenterStageModalTemplateMode: readControlCenterStageTemplateMode(requestUrl),
        collectionsTab: readCollectionsTab(requestUrl),
        collectionsEmailFilters: readCollectionsEmailFilters(requestUrl),
        collectionsCallFilters: readCollectionsCallFilters(requestUrl),
        customerCallStatus: readCustomerCallStatus(requestUrl),
        customerCallMessage: requestUrl.searchParams.get("customerCallMessage") ?? undefined,
        customerEmailStatus: readCustomerEmailStatus(requestUrl),
        customerEmailMessage: requestUrl.searchParams.get("customerEmailMessage") ?? undefined,
      });
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(html);
    } catch (error) {
      console.error("Failed to render dashboard", error);
      response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Failed to render dashboard." }));
    }
  });

  server.listen(env.WEB_PORT, "0.0.0.0", () => {
    console.info(`Web server started at http://0.0.0.0:${env.WEB_PORT}`);
  });
}

void main();

function readEnv(name: string) {
  return process.env[name]?.trim();
}

function normalizeApiHost(host: string) {
  return host === "0.0.0.0" ? "127.0.0.1" : host;
}

async function safeReadErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message ?? fallback;
  } catch {
    return fallback;
  }
}

function buildFallbackWorkflowInput(form?: URLSearchParams) {
  const senderEmail = form?.get("senderEmail")?.toString();
  const testEmailRecipient = form?.get("testEmailRecipient")?.toString();
  const testCallRecipient = form?.get("testCallRecipient")?.toString();
  const outreachDays = form ? readWorkflowOutreachDays(form) : ["monday", "tuesday", "wednesday", "thursday", "friday"];

  return {
    tenantId: "default",
    category: (form?.get("category")?.toString() as "collections" | "payments" | undefined) ?? "collections",
    name: form?.get("name")?.toString() || "New workflow",
    ...(senderEmail ? { senderEmail } : {}),
    ...(testEmailRecipient ? { testEmailRecipient } : {}),
    ...(testCallRecipient ? { testCallRecipient } : {}),
    timezone: form?.get("timezone")?.toString() || "Asia/Manila",
    outreachWindowStart: form?.get("outreachWindowStart")?.toString() || "08:00",
    outreachWindowEnd: form?.get("outreachWindowEnd")?.toString() || "17:00",
    outreachDays: outreachDays as Array<
      "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"
    >,
    weekendCallingEnabled: workflowDaysIncludeWeekend(outreachDays),
  };
}

function updateFallbackWorkflowFromForm(form: URLSearchParams, workflowId: string) {
  const outreachDays = readWorkflowOutreachDays(form) as Array<
    "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"
  >;
  const senderIdentityId = form.get("senderIdentityId")?.toString();
  const senderEmail = form.get("senderEmail")?.toString();
  const testEmailRecipient = form.get("testEmailRecipient")?.toString();
  const testCallRecipient = form.get("testCallRecipient")?.toString();
  replaceFallbackWorkflow(buildSeedControlCenter, workflowId, (workflow) => ({
    ...workflow,
    name: form.get("name")?.toString() || workflow.name,
    ...(senderIdentityId ? { senderIdentityId } : {}),
    ...(senderEmail ? { senderEmail } : {}),
    ...(testEmailRecipient ? { testEmailRecipient } : {}),
    ...(testCallRecipient ? { testCallRecipient } : {}),
    timezone: form.get("timezone")?.toString() || workflow.timezone || "Asia/Manila",
    outreachWindowStart: form.get("outreachWindowStart")?.toString() || workflow.outreachWindowStart,
    outreachWindowEnd: form.get("outreachWindowEnd")?.toString() || workflow.outreachWindowEnd,
    outreachDays,
    weekendCallingEnabled: workflowDaysIncludeWeekend(outreachDays),
    updatedAt: new Date().toISOString(),
    metadata: {
      ...workflow.metadata,
      lastChangedBy: "human",
      controlCenterFallback: true,
    },
  }));
}

function readWorkflowOutreachDays(form: URLSearchParams): string[] {
  const allowed = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
  const values = form
    .getAll("outreachDays")
    .flatMap((value) => value.toString().split(","))
    .map((value) => value.trim().toLowerCase())
    .filter((value) => allowed.has(value));
  return values.length > 0 ? Array.from(new Set(values)) : ["monday", "tuesday", "wednesday", "thursday", "friday"];
}

function workflowDaysIncludeWeekend(days: string[]) {
  return days.includes("saturday") || days.includes("sunday");
}

async function persistControlCenterWorkflowForm(apiBaseUrl: string, form: URLSearchParams) {
  const workflowId = form.get("workflowId")?.toString();
  if (!workflowId) {
    return;
  }
  const outreachDays = readWorkflowOutreachDays(form);
  const response = await fetch(`${apiBaseUrl}/v1/control-center/workflows/${workflowId}`, {
    method: "PUT",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      principal: { id: "web_console", roles: ["controller", "ar_manager"] },
      name: form.get("name")?.toString() || undefined,
      senderIdentityId: form.get("senderIdentityId")?.toString() || undefined,
      senderEmail: form.get("senderEmail")?.toString() || undefined,
      testEmailRecipient: form.get("testEmailRecipient")?.toString() || undefined,
      testCallRecipient: form.get("testCallRecipient")?.toString() || undefined,
      timezone: form.get("timezone")?.toString() || "Asia/Manila",
      outreachWindowStart: form.get("outreachWindowStart")?.toString() || undefined,
      outreachWindowEnd: form.get("outreachWindowEnd")?.toString() || undefined,
      outreachDays,
      weekendCallingEnabled: workflowDaysIncludeWeekend(outreachDays),
    }),
  });
  if (!response.ok) {
    updateFallbackWorkflowFromForm(form, workflowId);
  }
}

async function resolveDefaultSenderIdentity(apiBaseUrl: string, preferredIdentityId?: string) {
  const response = await fetch(`${apiBaseUrl}/v1/email/sending-identities`);
  if (!response.ok) {
    return undefined;
  }
  const payload = (await response.json().catch(() => ({}))) as {
    identities?: Array<{
      id: string;
      senderEmail?: string;
      sendAsEmail?: string;
      connectionStatus?: string;
      healthState?: string;
      isDefault?: boolean;
    }>;
  };
  const identities = payload.identities ?? [];
  const connected = identities.filter((identity) => identity.connectionStatus === "connected" || !identity.connectionStatus);
  return (
    connected.find((identity) => identity.id === preferredIdentityId) ??
    connected.find((identity) => identity.isDefault) ??
    connected[0]
  );
}

function buildControlCenterWorkflowRedirect(requestBaseUrl: string, workflowId?: string) {
  const target = new URL("/control-center", requestBaseUrl);
  if (workflowId) {
    target.searchParams.set("workflow", workflowId);
  }
  return target;
}

function buildControlCenterTestCallPayload(form: URLSearchParams, phoneNumber: string) {
  const now = new Date().toISOString();
  const workflowId = form.get("workflowId")?.toString() || "control-center-test";
  const { account, contact, invoices } = buildControlCenterTestReceivableContext(now, {
    workflowId,
    phoneNumber,
  });
  const days = readWorkflowOutreachDays(form);
  return {
    principal: { id: "web_console", roles: ["controller", "ar_manager"] },
    tenantId: "default",
    account,
    invoices,
    contact,
    asOf: now,
    callWindow: {
      timezone: form.get("timezone")?.toString() || "Asia/Manila",
      startHour: readHour(form.get("outreachWindowStart")?.toString(), 8),
      endHour: readHour(form.get("outreachWindowEnd")?.toString(), 17),
      allowedWeekdays: days.map(dayToCallWindowWeekday),
    },
  };
}

function buildControlCenterTestReceivableContext(
  now: string,
  input: { workflowId: string; recipientEmail?: string; phoneNumber?: string },
) {
  const parentAccountId = "11111111-1111-4111-8111-111111111111";
  const billingAccountId = "22222222-2222-4222-8222-222222222222";
  const account = {
    id: billingAccountId,
    createdAt: now,
    updatedAt: now,
    parentAccountId,
    accountNumber: "CONTROL-CENTER-TEST",
    displayName: "Control Center Test Account",
    currency: "PHP",
    accountTier: "standard",
    status: "active",
    centrallyPaid: false,
    metadata: { source: "control_center_test", workflowId: input.workflowId },
  };
  const contact = {
    id: "33333333-3333-4333-8333-333333333333",
    createdAt: now,
    updatedAt: now,
    parentAccountId,
    billingAccountId,
    scope: "billing_account",
    scopeId: billingAccountId,
    fullName: "Control Center test recipient",
    ...(input.recipientEmail ? { email: input.recipientEmail } : {}),
    ...(input.phoneNumber ? { phone: input.phoneNumber } : {}),
    role: "ap",
    isPrimary: true,
    isVerified: true,
    allowAutoSend: true,
    recentSuccessfulResponses: 1,
    metadata: { source: "control_center_test", workflowId: input.workflowId },
  };
  const invoices = [
    {
      id: "44444444-4444-4444-8444-444444444444",
      createdAt: now,
      updatedAt: now,
      state: "synced_open",
      parentAccountId,
      billingAccountId,
      invoiceNumber: "CC-TEST-001",
      currency: "PHP",
      amountCents: 100,
      dueDate: now.slice(0, 10),
      metadata: { source: "control_center_test", workflowId: input.workflowId },
    },
  ];
  return { account, contact, invoices };
}

function readHour(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const hour = Number(value.split(":")[0]);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback;
}

function dayToCallWindowWeekday(day: string) {
  switch (day) {
    case "monday":
      return 1;
    case "tuesday":
      return 2;
    case "wednesday":
      return 3;
    case "thursday":
      return 4;
    case "friday":
      return 5;
    case "saturday":
      return 6;
    case "sunday":
      return 7;
    default:
      return 1;
  }
}

async function resolveWorkflowEnrollmentParentAccountId(
  apiBaseUrl: string,
  billingAccountId: string,
  fallbackParentAccountId?: string,
) {
  try {
    const response = await fetch(`${apiBaseUrl}/v1/accounts`);
    if (!response.ok) {
      return fallbackParentAccountId ?? billingAccountId;
    }
    const payload = (await response.json()) as {
      items?: Array<{ billingAccountId?: string; parentAccountId?: string }>;
    };
    const match = payload.items?.find((item) => item.billingAccountId === billingAccountId);
    return match?.parentAccountId ?? fallbackParentAccountId ?? billingAccountId;
  } catch {
    return fallbackParentAccountId ?? billingAccountId;
  }
}

function readControlCenterStageChannel(url: URL) {
  const value = url.searchParams.get("stageChannel");
  return value === "email" || value === "call" || value === "sms" ? value : undefined;
}

function readAnalyticsTrend(url: URL) {
  const value = url.searchParams.get("trend");

  return value === "weekly" || value === "monthly" ? value : undefined;
}

function readTaskFilters(url: URL) {
  const filters: {
    status?: "active" | "all" | "open" | "in_progress" | "pending_approval" | "completed" | "closed" | "deleted";
    type?: "all" | "collection" | "cash_app" | "deduction" | "integration" | "credit_line";
    priority?: "all" | "high" | "medium" | "low";
    q?: string;
  } = {};
  const status = url.searchParams.get("status");
  if (status === "active" || status === "all" || status === "open" || status === "in_progress" || status === "pending_approval" || status === "completed" || status === "closed" || status === "deleted") {
    filters.status = status;
  }
  const type = url.searchParams.get("type");
  if (type === "all" || type === "collection" || type === "cash_app" || type === "deduction" || type === "integration" || type === "credit_line") {
    filters.type = type;
  }
  const priority = url.searchParams.get("priority");
  if (priority === "all" || priority === "high" || priority === "medium" || priority === "low") {
    filters.priority = priority;
  }
  const q = url.searchParams.get("q")?.trim();
  if (q) {
    filters.q = q;
  }
  return Object.keys(filters).length > 0 ? filters : undefined;
}

function readInvoiceFilters(url: URL): InvoiceFilterInput | undefined {
  const filters: InvoiceFilterInput = {};
  const q = url.searchParams.get("q")?.trim();
  if (q) {
    filters.q = q;
  }
  const status = url.searchParams.get("status");
  if (status === "all" || status === "open" || status === "partial" || status === "paid" || status === "disputed" || status === "voided") {
    filters.status = status;
  }
  const type = url.searchParams.get("type");
  if (
    type === "all" ||
    type === "live_connection" ||
    type === "manual_upload" ||
    type === "seed_fallback" ||
    type === "installment_plan" ||
    type === "standard_invoice"
  ) {
    filters.type = type;
  }
  const more = url.searchParams.get("more");
  if (
    more === "all" ||
    more === "overdue" ||
    more === "due_today" ||
    more === "due_soon" ||
    more === "with_promise" ||
    more === "with_balance" ||
    more === "with_branch" ||
    more === "missing_branch"
  ) {
    filters.more = more;
  }
  const page = Number(url.searchParams.get("page"));
  if (Number.isFinite(page) && page > 0) {
    filters.page = Math.floor(page);
  }
  return Object.keys(filters).length > 0 ? filters : undefined;
}

function readControlCenterTab(url: URL) {
  const value = url.searchParams.get("controlCenterTab");
  return value === "workflows" || value === "email-templates" || value === "call-agent"
    ? value
    : undefined;
}

function readControlCenterActionStatus(url: URL) {
  const value = url.searchParams.get("controlCenterActionStatus");
  return value === "success" || value === "error" ? value : undefined;
}

function readControlCenterStageTemplateMode(url: URL) {
  const value = url.searchParams.get("stageTemplateMode");
  return value === "pre_saved_template" || value === "ai_generated" ? value : undefined;
}

function readCollectionsTab(url: URL) {
  const value = url.searchParams.get("tab");
  return value === "email" || value === "call-inbox" ? value : undefined;
}

function readCollectionsEmailFilters(url: URL): CollectionsEmailFilterInput | undefined {
  const filters: CollectionsEmailFilterInput = {};
  const folder = url.searchParams.get("folder");
  if (folder === "all" || folder === "unread" || folder === "sent" || folder === "drafts") {
    filters.folder = folder;
  }
  const customer = url.searchParams.get("customer")?.trim();
  if (customer && customer !== "all") {
    filters.customer = customer;
  }
  const q = url.searchParams.get("q")?.trim();
  if (q) {
    filters.q = q;
  }
  return Object.keys(filters).length > 0 ? filters : undefined;
}

function readCollectionsCallFilters(url: URL): CollectionsCallFilterInput | undefined {
  const filters: CollectionsCallFilterInput = {};
  const direction = url.searchParams.get("direction");
  if (direction === "all" || direction === "inbound" || direction === "outbound" || direction === "unknown") {
    filters.direction = direction;
  }
  const status = url.searchParams.get("status");
  if (
    status === "all" ||
    status === "processing" ||
    status === "completed" ||
    status === "needs_review" ||
    status === "failed" ||
    status === "archived"
  ) {
    filters.status = status;
  }
  const voicemail = url.searchParams.get("voicemail");
  if (voicemail === "all" || voicemail === "yes" || voicemail === "no") {
    filters.voicemail = voicemail;
  } else if (voicemail === "true" || voicemail === "false") {
    filters.voicemail = voicemail === "true" ? "yes" : "no";
  }
  const customer = url.searchParams.get("customer")?.trim();
  if (customer && customer !== "all") {
    filters.customer = customer;
  }
  const classification = url.searchParams.get("classification")?.trim();
  if (classification && classification !== "all") {
    filters.classification = classification;
  }
  const workflow = url.searchParams.get("workflow")?.trim();
  if (workflow && workflow !== "all") {
    filters.workflow = workflow;
  }
  const date = url.searchParams.get("date")?.trim();
  if (date) {
    filters.date = date;
    filters.dateFrom = date;
    filters.dateTo = date;
  } else {
    const dateFrom = url.searchParams.get("dateFrom")?.trim();
    const dateTo = url.searchParams.get("dateTo")?.trim();
    if (dateFrom) {
      filters.dateFrom = dateFrom;
    }
    if (dateTo) {
      filters.dateTo = dateTo;
    }
  }
  return Object.keys(filters).length > 0 ? filters : undefined;
}

function readCustomerCallStatus(url: URL) {
  const value = url.searchParams.get("customerCallStatus");
  return value === "started" || value === "failed" ? value : undefined;
}

function readCustomerEmailStatus(url: URL) {
  const value = url.searchParams.get("customerEmailStatus");
  return value === "sent" || value === "approval_needed" || value === "failed" ? value : undefined;
}

function buildCustomerCallRedirect(requestBaseUrl: string, customerId: string | undefined) {
  const redirectTarget = new URL("/customers", requestBaseUrl);
  if (customerId) {
    redirectTarget.searchParams.set("customer", customerId);
    redirectTarget.searchParams.set("tab", "activity");
  }
  return redirectTarget;
}

function buildCustomerEmailRedirect(requestBaseUrl: string, customerId: string | undefined) {
  const redirectTarget = new URL("/customers", requestBaseUrl);
  if (customerId) {
    redirectTarget.searchParams.set("customer", customerId);
  }
  return redirectTarget;
}

const outboundPhonePattern = /^\+?[0-9][0-9 .()-]{6,}$/;

function normalizeOutboundPhoneNumber(value: string | undefined) {
  const phone = value?.trim();
  if (!phone || !outboundPhonePattern.test(phone)) {
    return undefined;
  }
  return phone;
}

function normalizePhoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

function parseJsonFormField<T>(form: URLSearchParams, key: string): T | undefined {
  const raw = form.get(key)?.toString();
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function humanizeCode(value: string) {
  return value.replace(/_/g, " ");
}

async function readFormBody(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

async function readMultipartFormBody(
  request: import("node:http").IncomingMessage,
  requestBaseUrl: string,
) {
  const bodyChunks: Buffer[] = [];
  for await (const chunk of request) {
    bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const webRequest = new Request(new URL(request.url ?? "/", requestBaseUrl), {
    method: request.method ?? "POST",
    headers: request.headers as HeadersInit,
    body: Buffer.concat(bodyChunks),
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  return webRequest.formData();
}

async function readEmailAttachments(form: FormData) {
  const attachments: Array<{
    fileName: string;
    mimeType?: string;
    contentBase64: string;
  }> = [];

  for (const fieldName of ["attachments", "soaAttachment"]) {
    for (const fileEntry of form.getAll(fieldName)) {
      if (!(fileEntry instanceof File) || fileEntry.size === 0) {
        continue;
      }

      const buffer = Buffer.from(await fileEntry.arrayBuffer());
      attachments.push({
        fileName: fileEntry.name || (fieldName === "soaAttachment" ? "statement-of-account" : "attachment"),
        ...(fileEntry.type ? { mimeType: fileEntry.type } : {}),
        contentBase64: buffer.toString("base64"),
      });
    }
  }

  return attachments;
}

function readEmailListField(form: FormData, fieldName: string) {
  const raw = form.get(fieldName)?.toString();
  if (!raw) {
    return [];
  }

  return raw
    .split(/[,;\n]/)
    .map((value) => value.trim())
    .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index);
}

async function markTaskCompletedAfterEmailSend(apiBaseUrl: string, taskId: string) {
  try {
    const statusResponse = await fetch(`${apiBaseUrl}/v1/tasks/${encodeURIComponent(taskId)}/status`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-principal-id": "web_console",
        "x-principal-roles": "ar_manager",
      },
      body: JSON.stringify({
        status: "completed",
        summary: "Email follow-up sent from the task popup.",
      }),
    });
    if (!statusResponse.ok) {
      console.warn("Task email sent but completion status update was rejected");
    }
  } catch (error) {
    console.warn("Task email sent but completion status update failed", error);
  }
}

async function readSingleAttachment(form: FormData, fieldName: string) {
  const fileEntry = form.get(fieldName);
  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    return undefined;
  }

  const buffer = Buffer.from(await fileEntry.arrayBuffer());
  return {
    fileName: fileEntry.name || "attachment",
    ...(fileEntry.type ? { mimeType: fileEntry.type } : {}),
    contentBase64: buffer.toString("base64"),
  };
}

function applyTaskComposeDraftQueryState(redirectTarget: URL, form: FormData) {
  const composeId = form.get("appliedDraftComposeId")?.toString();
  const generator =
    form.get("draftGenerator")?.toString() ?? form.get("appliedDraftGenerator")?.toString();
  const subjectLine =
    form.get("subjectLine")?.toString() ?? form.get("appliedDraftSubject")?.toString();
  const body =
    form.get("bodyPreview")?.toString() ?? form.get("appliedDraftBody")?.toString();
  const note = form.get("appliedDraftNote")?.toString();

  if (!composeId || !subjectLine || !body) {
    return;
  }

  redirectTarget.searchParams.set("taskComposeDraftComposeId", composeId);
  redirectTarget.searchParams.set(
    "taskComposeDraftGenerator",
    generator === "template" ? "template" : "ai",
  );
  redirectTarget.searchParams.set("taskComposeDraftSubject", subjectLine);
  redirectTarget.searchParams.set("taskComposeDraftBody", body);
  if (note?.trim()) {
    redirectTarget.searchParams.set("taskComposeDraftNote", note.trim());
  }
}

function applyCollectionsComposeDraftQueryState(redirectTarget: URL, form: FormData) {
  const composeId = form.get("composeId")?.toString();
  const generator = form.get("composeGenerator")?.toString();
  const subjectLine = form.get("subjectLine")?.toString();
  const body = form.get("bodyPreview")?.toString();

  if (!composeId || !subjectLine || !body) {
    return;
  }

  redirectTarget.searchParams.set("collectionsComposeDraftComposeId", composeId);
  redirectTarget.searchParams.set(
    "collectionsComposeDraftGenerator",
    generator === "template" ? "template" : "ai",
  );
  redirectTarget.searchParams.set("collectionsComposeDraftSubject", subjectLine);
  redirectTarget.searchParams.set("collectionsComposeDraftBody", body);
  for (const attachment of form.getAll("collectionsComposeDraftAttachment")) {
    const value = attachment.toString();
    if (value.trim()) {
      redirectTarget.searchParams.append("collectionsComposeDraftAttachment", value);
    }
  }
}

function appendCollectionsComposeDraftAttachment(
  redirectTarget: URL,
  kind: "invoice" | "soa",
  spec: string,
  label: string,
) {
  const serialized = serializeCollectionsComposeAttachment(kind, spec, label);
  const existing = redirectTarget.searchParams.getAll("collectionsComposeDraftAttachment");
  if (!existing.includes(serialized)) {
    redirectTarget.searchParams.append("collectionsComposeDraftAttachment", serialized);
  }
}

function serializeCollectionsComposeAttachment(kind: "invoice" | "soa", spec: string, label: string) {
  return [kind, spec, label].map((part) => part.replace(/\|/g, " ").trim()).join("|");
}

function parseCollectionsComposeAttachmentSpec(value: string) {
  const [kind, spec, label] = value.split("|");
  if ((kind !== "invoice" && kind !== "soa") || !spec || !label) {
    return undefined;
  }
  return { kind, spec, label };
}

function uniqueFormValues(values: FormDataEntryValue[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.toString().trim())
        .filter(Boolean),
    ),
  );
}

function readJsonFormField<T>(form: FormData, fieldName: string): T | undefined {
  const raw = form.get(fieldName)?.toString();
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function buildCollectionsReplyAccountFromForm(
  form: FormData,
  accountName: string,
  composeId: string,
  now: string,
) {
  const billingAccountId = form.get("billingAccountId")?.toString() || composeId;
  const parentAccountId = form.get("parentAccountId")?.toString() || billingAccountId;
  return {
    id: billingAccountId,
    createdAt: now,
    updatedAt: now,
    parentAccountId,
    accountNumber: form.get("accountNumber")?.toString() || billingAccountId,
    displayName: accountName,
    currency: form.get("currency")?.toString() || "PHP",
    accountTier: form.get("accountTier")?.toString() === "strategic" ? "strategic" : "standard",
    status: "active",
    centrallyPaid: false,
    metadata: {
      source: "collections_compose",
      composeId,
    },
  };
}

function buildCollectionsReplyContactFromForm(
  form: FormData,
  contactEmail: string,
  accountName: string,
  now: string,
) {
  const billingAccountId = form.get("billingAccountId")?.toString();
  const parentAccountId = form.get("parentAccountId")?.toString() || billingAccountId || contactEmail;
  return {
    id: `collections-contact:${contactEmail}`,
    createdAt: now,
    updatedAt: now,
    parentAccountId,
    billingAccountId,
    scope: "billing_account",
    scopeId: billingAccountId,
    fullName: form.get("contactName")?.toString() || accountName,
    email: contactEmail,
    role: "ap",
    isPrimary: true,
    // Live thread replies preserve the existing Gmail conversation and still flow through
    // outbound policy checks when attached invoice context is disputed or ambiguous.
    isVerified: true,
    allowAutoSend: true,
    recentSuccessfulResponses: 0,
    metadata: {
      source: "collections_compose",
      trustedLiveThreadReply: true,
    },
  };
}

async function verifyCollectionsInvoiceAttachments(apiBaseUrl: string, invoiceNumbers: string[]) {
  for (const invoiceNumber of invoiceNumbers) {
    await fetchCollectionsInvoiceAttachment(apiBaseUrl, invoiceNumber);
  }
}

async function verifyCollectionsSoaAttachment(apiBaseUrl: string, form: FormData) {
  await fetchCollectionsSoaAttachment(apiBaseUrl, form);
}

async function buildCollectionsGeneratedEmailAttachments(apiBaseUrl: string, form: FormData) {
  const specs = Array.from(
    new Set(
      form
        .getAll("collectionsComposeDraftAttachment")
        .map((value) => parseCollectionsComposeAttachmentSpec(value.toString()))
        .filter((value): value is NonNullable<ReturnType<typeof parseCollectionsComposeAttachmentSpec>> => Boolean(value))
        .map((value) => `${value.kind}|${value.spec}|${value.label}`),
    ),
  ).map((value) => parseCollectionsComposeAttachmentSpec(value)!);

  const attachments: Array<{
    fileName: string;
    mimeType?: string;
    contentBase64: string;
  }> = [];
  for (const spec of specs) {
    if (spec.kind === "invoice") {
      attachments.push(await fetchCollectionsInvoiceAttachment(apiBaseUrl, spec.spec));
    } else {
      attachments.push(await fetchCollectionsSoaAttachment(apiBaseUrl, form));
    }
  }
  return attachments;
}

async function fetchCollectionsInvoiceAttachment(apiBaseUrl: string, invoiceNumber: string) {
  const invoiceUrl = new URL(`${apiBaseUrl}/v1/invoices/export`);
  invoiceUrl.searchParams.set("q", invoiceNumber);
  const response = await fetch(invoiceUrl.toString());
  if (!response.ok) {
    throw new Error("Invoice attachment could not be generated.");
  }
  const body = Buffer.from(await response.arrayBuffer());
  return {
    fileName: `invoice-${sanitizeFileName(invoiceNumber)}.pdf`,
    mimeType: response.headers.get("content-type") ?? "application/pdf",
    contentBase64: body.toString("base64"),
  };
}

async function fetchCollectionsSoaAttachment(apiBaseUrl: string, form: FormData) {
  const account = readJsonFormField<Record<string, unknown>>(form, "accountJson");
  const contact = readJsonFormField<Record<string, unknown>>(form, "contactJson");
  const invoices = readJsonFormField<unknown[]>(form, "invoicesJson") ?? [];
  if (!account || !contact) {
    throw new Error("Statement-of-account attachment is missing account context.");
  }
  const response = await fetch(`${apiBaseUrl}/v1/email/outbound/attachments/statement-of-account`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      principal: { id: "web_console", roles: ["ar_manager"] },
      account,
      contact,
      invoices,
      asOf: new Date().toISOString(),
    }),
  });
  if (!response.ok) {
    throw new Error(await safeReadErrorMessage(response, "SOA attachment could not be generated."));
  }
  const payload = (await response.json().catch(() => ({}))) as {
    attachment?: {
      fileName: string;
      mimeType?: string;
      contentBase64: string;
    };
  };
  if (!payload.attachment?.contentBase64) {
    throw new Error("SOA attachment could not be generated.");
  }
  return payload.attachment;
}

function sanitizeFileName(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "document";
}

function readOnboardingImportStatus(requestUrl: URL): OnboardingImportStatus | undefined {
  const lane = requestUrl.searchParams.get("onboardingLane");
  const status = requestUrl.searchParams.get("onboardingStatus");
  const message = requestUrl.searchParams.get("onboardingMessage");

  if (
    (lane !== "accounts" && lane !== "invoices" && lane !== "payments") ||
    (status !== "success" && status !== "error") ||
    !message
  ) {
    return undefined;
  }

  const importedCount = readOptionalInt(requestUrl.searchParams.get("onboardingImportedCount"));
  const heldCount = readOptionalInt(requestUrl.searchParams.get("onboardingHeldCount"));
  const reviewCount = readOptionalInt(requestUrl.searchParams.get("onboardingReviewCount"));
  const notes = requestUrl.searchParams.getAll("onboardingNote");

  return {
    lane: lane as OnboardingLane,
    status,
    message,
    ...(importedCount !== undefined ? { importedCount } : {}),
    ...(heldCount !== undefined ? { heldCount } : {}),
    ...(reviewCount !== undefined ? { reviewCount } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  };
}

function redirectWithOnboardingStatus(
  response: import("node:http").ServerResponse,
  requestBaseUrl: string,
  status: OnboardingImportStatus,
) {
  const target = new URL("/onboarding", requestBaseUrl);
  target.searchParams.set("onboardingLane", status.lane);
  target.searchParams.set("onboardingStatus", status.status);
  target.searchParams.set("onboardingMessage", status.message);
  if (status.importedCount !== undefined) {
    target.searchParams.set("onboardingImportedCount", String(status.importedCount));
  }
  if (status.heldCount !== undefined) {
    target.searchParams.set("onboardingHeldCount", String(status.heldCount));
  }
  if (status.reviewCount !== undefined) {
    target.searchParams.set("onboardingReviewCount", String(status.reviewCount));
  }
  for (const note of status.notes ?? []) {
    target.searchParams.append("onboardingNote", note);
  }
  response.writeHead(303, { location: target.toString() });
  response.end();
}

function readImportedCount(lane: "accounts" | "invoices" | "payments", body: Record<string, unknown>) {
  if (lane === "accounts") {
    return readCount(body.importedBillingAccountCount) ?? 0;
  }
  if (lane === "invoices") {
    return readCount(body.importedCount) ?? 0;
  }
  return readCount(body.normalizedTransactionCount) ?? 0;
}

function readReviewCount(lane: "accounts" | "invoices" | "payments", body: Record<string, unknown>) {
  if (lane === "payments") {
    return readCount(body.reviewRequiredTransactionCount) ?? 0;
  }
  return readCount(body.pendingAccountMappingCount) ?? 0;
}

function readCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalInt(value: string | null) {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildPrincipalProxyHeaders(
  headers: import("node:http").IncomingHttpHeaders,
): Record<string, string> {
  const principalId = readHeaderValue(headers["x-principal-id"]);
  const principalRoles = readHeaderValue(headers["x-principal-roles"]);
  return {
    ...(principalId ? { "x-principal-id": principalId } : {}),
    ...(principalRoles ? { "x-principal-roles": principalRoles } : {}),
  };
}

function readHeaderValue(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  if (Array.isArray(value)) {
    const joined = value.join(",").trim();
    return joined || undefined;
  }
  return undefined;
}

function humanizeLane(lane: "accounts" | "invoices" | "payments") {
  return lane === "payments" ? "bank transaction" : lane.slice(0, -1);
}

function buildOnboardingUploadDetail(
  lane: "accounts" | "invoices" | "payments",
  importedCount: number,
  heldCount: number,
  reviewCount: number,
) {
  const importedLabel =
    lane === "payments"
      ? `${importedCount} normalized transaction${importedCount === 1 ? "" : "s"}`
      : `${importedCount} ${humanizeLane(lane)} record${importedCount === 1 ? "" : "s"}`;
  const parts = [importedLabel];
  if (reviewCount > 0) {
    parts.push(`${reviewCount} item${reviewCount === 1 ? "" : "s"} flagged for review`);
  }
  if (heldCount > 0) {
    parts.push(`${heldCount} row${heldCount === 1 ? "" : "s"} held`);
  }
  return parts.join(" · ");
}

function buildOnboardingSuccessMessage(
  lane: "accounts" | "invoices" | "payments",
  importedCount: number,
  heldCount: number,
  reviewCount: number,
) {
  const importedText =
    lane === "payments"
      ? `${importedCount} bank transaction${importedCount === 1 ? "" : "s"} normalized`
      : `${importedCount} ${humanizeLane(lane)} record${importedCount === 1 ? "" : "s"} imported`;
  const notes = [importedText];
  if (reviewCount > 0) {
    notes.push(`${reviewCount} item${reviewCount === 1 ? "" : "s"} need review`);
  }
  if (heldCount > 0) {
    notes.push(`${heldCount} row${heldCount === 1 ? "" : "s"} were held safely`);
  }
  return notes.join(", ");
}
