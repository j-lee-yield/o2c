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
  renderDashboardHtml,
  renderIntegrationInspectorHtml,
  renderIntegrationPortalHtml,
} from "./server.js";
import type { OnboardingImportStatus } from "./app/dashboard.js";

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
      const clientName = access.claims.clientName;
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
      const clientName = access.claims.clientName;
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
        const clientName = access.claims.clientName;
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
        const clientName = access.claims.clientName;
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
        const tenantSlug = access.claims.tenantSlug;
        const clientName = access.claims.clientName;
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

      if (pathname === "/collections/compose") {
        try {
          const form = await readFormBody(request);
          const composeId = form.get("composeId")?.toString() ?? "collections-compose";
          const redirectTarget = new URL("/collections", requestBaseUrl);
          redirectTarget.hash = `collections-compose-${composeId}`;

          const senderIdentityId = form.get("senderIdentityId")?.toString();
          const providerThreadId = form.get("providerThreadId")?.toString();
          const subjectLine = form.get("subjectLine")?.toString();
          const bodyPreview = form.get("bodyPreview")?.toString();
          const contactEmail = form.get("contactEmail")?.toString();
          const accountName = form.get("accountName")?.toString();

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
            account: {
              id: form.get("billingAccountId")?.toString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              parentAccountId:
                form.get("parentAccountId")?.toString() || form.get("billingAccountId")?.toString(),
              accountNumber: form.get("accountNumber")?.toString() || form.get("billingAccountId")?.toString(),
              displayName: accountName,
              currency: form.get("currency")?.toString() || "PHP",
              accountTier:
                form.get("accountTier")?.toString() === "strategic" ? "strategic" : "standard",
              status: "active",
              centrallyPaid: false,
              metadata: {
                source: "collections_compose",
                composeId,
              },
            },
            contact: {
              id: `collections-contact:${contactEmail}`,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              parentAccountId:
                form.get("parentAccountId")?.toString() || form.get("billingAccountId")?.toString(),
              billingAccountId: form.get("billingAccountId")?.toString(),
              scope: "billing_account",
              scopeId: form.get("billingAccountId")?.toString(),
              fullName: form.get("contactName")?.toString() || accountName,
              email: contactEmail,
              role: "ap",
              isPrimary: true,
              // This compose route is limited to live Gmail inbox threads with a concrete
              // providerThreadId, so we allow direct replies without the extra approval hop.
              isVerified: true,
              allowAutoSend: true,
              recentSuccessfulResponses: 0,
              metadata: {
                source: "collections_compose",
                trustedLiveThreadReply: true,
              },
            },
            subjectLine,
            bodyPreview,
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
            redirectTarget.hash = `collections-compose-${composeId}`;
          }
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to send collections email", error);
          const redirectTarget = new URL("/collections", requestBaseUrl);
          redirectTarget.searchParams.set("collectionsComposeError", "Collections email could not be sent.");
          response.writeHead(303, { location: redirectTarget.toString() });
          response.end();
          return;
        }
      }

      if (pathname === "/control-center/workflows/create") {
        try {
          const form = await readFormBody(request);
          const payload = {
            principal: { id: "web_console", roles: ["controller", "ar_manager"] },
            tenantId: "default",
            category: form.get("category")?.toString() || "collections",
            name: form.get("name")?.toString() || "New workflow",
            senderEmail: form.get("senderEmail")?.toString() || undefined,
            testEmailRecipient: form.get("testEmailRecipient")?.toString() || undefined,
            testCallRecipient: form.get("testCallRecipient")?.toString() || undefined,
            timezone: form.get("timezone")?.toString() || "Asia/Manila",
            outreachWindowStart: form.get("outreachWindowStart")?.toString() || "08:00",
            outreachWindowEnd: form.get("outreachWindowEnd")?.toString() || "17:00",
            outreachDays: (form.get("outreachDays")?.toString() || "monday,tuesday,wednesday,thursday,friday")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            weekendCallingEnabled: form.get("weekendCallingEnabled")?.toString() === "on",
          };
          await fetch(`${apiBaseUrl}/v1/control-center/workflows`, {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify(payload),
          });
          response.writeHead(303, { location: "/control-center" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to create control-center workflow", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Workflow creation failed." }));
          return;
        }
      }

      if (pathname === "/control-center/workflows/update") {
        try {
          const form = await readFormBody(request);
          const workflowId = form.get("workflowId")?.toString();
          const payload = {
            principal: { id: "web_console", roles: ["controller", "ar_manager"] },
            name: form.get("name")?.toString() || undefined,
            senderEmail: form.get("senderEmail")?.toString() || undefined,
            testEmailRecipient: form.get("testEmailRecipient")?.toString() || undefined,
            testCallRecipient: form.get("testCallRecipient")?.toString() || undefined,
            timezone: form.get("timezone")?.toString() || undefined,
            outreachWindowStart: form.get("outreachWindowStart")?.toString() || undefined,
            outreachWindowEnd: form.get("outreachWindowEnd")?.toString() || undefined,
            outreachDays: form.get("outreachDays")?.toString()
              ? form.get("outreachDays")!.toString().split(",").map((value) => value.trim()).filter(Boolean)
              : undefined,
            weekendCallingEnabled: form.get("weekendCallingEnabled")?.toString() === "on",
          };
          await fetch(`${apiBaseUrl}/v1/control-center/workflows/${workflowId}`, {
            method: "PUT",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify(payload),
          });
          response.writeHead(303, { location: workflowId ? `/control-center?workflow=${encodeURIComponent(workflowId)}` : "/control-center" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to update control-center workflow", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Workflow update failed." }));
          return;
        }
      }

      if (pathname === "/control-center/workflows/toggle") {
        try {
          const form = await readFormBody(request);
          const workflowId = form.get("workflowId")?.toString();
          await fetch(`${apiBaseUrl}/v1/control-center/workflows/${workflowId}/toggle`, {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              principal: { id: "web_console", roles: ["controller", "ar_manager"] },
              enabled: form.get("enabled")?.toString() === "true",
            }),
          });
          response.writeHead(303, { location: workflowId ? `/control-center?workflow=${encodeURIComponent(workflowId)}` : "/control-center" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to toggle control-center workflow", error);
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

      if (pathname === "/control-center/stages/create") {
        try {
          const form = await readFormBody(request);
          const workflowId = form.get("workflowId")?.toString();
          await fetch(`${apiBaseUrl}/v1/control-center/stages`, {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              principal: { id: "web_console", roles: ["controller", "ar_manager"] },
              tenantId: "default",
              workflowId,
              outreachType: form.get("outreachType")?.toString() || "email",
              triggerType: form.get("triggerType")?.toString() || "relative_due_date",
              triggerConfig: {
                comparator: form.get("triggerComparator")?.toString() || "due_in_days",
                offsetDays: Number.parseInt(form.get("offsetDays")?.toString() || "0", 10),
              },
              templateMode: form.get("templateMode")?.toString() || "ai_generated",
              aiStrategyId: form.get("aiStrategyId")?.toString() || undefined,
              templateId: form.get("templateId")?.toString() || undefined,
              notes: form.get("notes")?.toString() || "New stage",
            }),
          });
          response.writeHead(303, { location: workflowId ? `/control-center?workflow=${encodeURIComponent(workflowId)}` : "/control-center" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to create control-center stage", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Stage creation failed." }));
          return;
        }
      }

      if (pathname === "/control-center/folders/create") {
        try {
          const form = await readFormBody(request);
          await fetch(`${apiBaseUrl}/v1/control-center/template-folders`, {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              principal: { id: "web_console", roles: ["controller", "ar_manager"] },
              tenantId: "default",
              name: form.get("name")?.toString() || "New Folder",
            }),
          });
          response.writeHead(303, { location: "/control-center" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to create template folder", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Template folder creation failed." }));
          return;
        }
      }

      if (pathname === "/control-center/templates/create") {
        try {
          const form = await readFormBody(request);
          await fetch(`${apiBaseUrl}/v1/control-center/templates`, {
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
          response.writeHead(303, { location: "/control-center" });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to create template", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Template creation failed." }));
          return;
        }
      }

      if (pathname === "/control-center/templates/update") {
        try {
          const form = await readFormBody(request);
          const templateId = form.get("templateId")?.toString();
          await fetch(`${apiBaseUrl}/v1/control-center/templates/${templateId}`, {
            method: "PUT",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              principal: { id: "web_console", roles: ["controller", "ar_manager"] },
              name: form.get("name")?.toString() || undefined,
              folderId: form.get("folderId")?.toString() || null,
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
          response.writeHead(303, {
            location: templateId
              ? `/control-center?controlCenterTab=email-templates&selectedTemplateId=${encodeURIComponent(templateId)}`
              : "/control-center?controlCenterTab=email-templates",
          });
          response.end();
          return;
        } catch (error) {
          console.error("Failed to update template", error);
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ message: "Template update failed." }));
          return;
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
              phoneNumber: form.get("phoneNumber")?.toString() || undefined,
              humanSupportNumber: form.get("humanSupportNumber")?.toString() || null,
              smsEnabled: form.get("smsEnabled")?.toString() === "on",
              outboundCallingEnabled: form.get("outboundCallingEnabled")?.toString() === "on",
              handoffToHumanEnabled: form.get("handoffToHumanEnabled")?.toString() === "on",
              callRecordingDisclaimerEnabled: form.get("callRecordingDisclaimerEnabled")?.toString() === "on",
              manualAgentInstructions: form.get("manualAgentInstructions")?.toString() || undefined,
              overrideOpeningLine: form.get("overrideOpeningLine")?.toString() || null,
            }),
          });
          response.writeHead(303, { location: "/control-center" });
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

      const html = await renderDashboardHtml(pathname, {
        cashAppTab: requestUrl.searchParams.get("tab") ?? undefined,
        customerId: requestUrl.searchParams.get("customer") ?? undefined,
        customerTab: requestUrl.searchParams.get("tab") ?? undefined,
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
        onboardingImportStatus: readOnboardingImportStatus(requestUrl),
        controlCenterTab: readControlCenterTab(requestUrl),
        controlCenterExpandedWorkflowId: requestUrl.searchParams.get("workflow") ?? undefined,
        controlCenterSelectedTemplateId: requestUrl.searchParams.get("selectedTemplateId") ?? undefined,
        controlCenterStageModalWorkflowId: requestUrl.searchParams.get("stageWorkflow") ?? undefined,
        controlCenterStageModalChannel: readControlCenterStageChannel(requestUrl),
        controlCenterStageModalTemplateMode: readControlCenterStageTemplateMode(requestUrl),
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

function readControlCenterStageChannel(url: URL) {
  const value = url.searchParams.get("stageChannel");
  return value === "email" || value === "call" || value === "sms" ? value : undefined;
}

function readControlCenterTab(url: URL) {
  const value = url.searchParams.get("controlCenterTab");
  return value === "workflows" || value === "email-templates" || value === "call-agent" || value === "config"
    ? value
    : undefined;
}

function readControlCenterStageTemplateMode(url: URL) {
  const value = url.searchParams.get("stageTemplateMode");
  return value === "pre_saved_template" || value === "ai_generated" ? value : undefined;
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
