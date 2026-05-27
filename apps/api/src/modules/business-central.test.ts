import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiApp } from "../app.js";
import { resetBusinessCentralConnectionServiceForTests } from "../bootstrap/business-central-connection-service.js";
import { resetCustomerProfileMasteringStateForTests } from "./customer-profiles.js";

process.env.INTEGRATION_BUSINESS_CENTRAL_CONNECT_CLIENT_ID ??= "bc-client";
process.env.INTEGRATION_BUSINESS_CENTRAL_CONNECT_CLIENT_SECRET ??= "bc-secret";
process.env.INTEGRATION_BUSINESS_CENTRAL_CONNECT_REDIRECT_URI ??=
  "http://127.0.0.1:3001/v1/integrations/business-central/callback";

const TEST_TENANT = process.env.DEFAULT_TENANT_SLUG ?? "test-tenant";

function mockJsonFetch(responses: Array<unknown>) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => response,
    });
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mockJsonFetchByUrl(routes: Array<{ match: string | RegExp; response: unknown }>) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const route = routes.find((candidate) =>
      typeof candidate.match === "string"
        ? url.includes(candidate.match)
        : candidate.match.test(url),
    );
    if (!route) {
      throw new Error(`No mock fetch response configured for ${url}`);
    }
    return {
      ok: true,
      status: 200,
      json: async () => route.response,
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function makeIdToken(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64url");
  return `header.${encoded}.signature`;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetBusinessCentralConnectionServiceForTests();
  resetCustomerProfileMasteringStateForTests();
});

describe("business central integration API", () => {
  it("returns OAuth errors back to the original client connect page", async () => {
    const app = buildApiApp();

    const connect = await app.inject({
      method: "GET",
      url:
        `/v1/integrations/business-central/connect?tenantSlug=${encodeURIComponent(TEST_TENANT)}` +
        `&returnTo=${encodeURIComponent("http://127.0.0.1:3000/connect/accounting?token=signed-token")}`,
    });

    expect(connect.statusCode).toBe(302);
    const redirectUrl = new URL(connect.headers.location ?? "");
    const state = redirectUrl.searchParams.get("state");
    expect(state).toBeTruthy();

    const callback = await app.inject({
      method: "GET",
      url:
        `/v1/integrations/business-central/callback?state=${encodeURIComponent(state ?? "")}` +
        `&error=invalid_client&error_description=${encodeURIComponent("Microsoft sign-in failed.")}`,
    });

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe(
      "http://127.0.0.1:3000/connect/accounting?token=signed-token&bc=error&message=Microsoft+sign-in+failed.",
    );

    await app.close();
  });

  it("supports company selection when the authorized account can access multiple companies", async () => {
    mockJsonFetch([
      {
        access_token: "bc-access-token",
        refresh_token: "bc-refresh-token",
        expires_in: 3600,
        id_token: makeIdToken({
          tid: "tenant-guid-1",
          preferred_username: "controller@contoso.com",
        }),
      },
      {
        value: [
          { id: "company-1", displayName: "", name: "Contoso Holding" },
          { id: "company-2", displayName: "Contoso Manufacturing" },
        ],
      },
    ]);

    const app = buildApiApp();

    const connect = await app.inject({
      method: "GET",
      url:
        `/v1/integrations/business-central/connect?tenantSlug=${encodeURIComponent(TEST_TENANT)}` +
        `&returnTo=${encodeURIComponent("http://127.0.0.1:3000/connect/accounting?token=signed-token")}` +
        `&environment=production&loginHint=${encodeURIComponent("controller@contoso.com")}` +
        `&domainHint=${encodeURIComponent("contoso.com")}`,
    });

    expect(connect.statusCode).toBe(302);
    expect(connect.headers.location).toContain("login.microsoftonline.com");
    expect(connect.headers.location).toContain("login_hint=controller%40contoso.com");
    expect(connect.headers.location).toContain("domain_hint=contoso.com");

    const redirectUrl = new URL(connect.headers.location ?? "");
    const state = redirectUrl.searchParams.get("state");
    expect(state).toBeTruthy();

    const callback = await app.inject({
      method: "GET",
      url: `/v1/integrations/business-central/callback?state=${encodeURIComponent(state ?? "")}&code=auth-code-1`,
    });

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toContain("bcConnectState=");

    const callbackTarget = new URL(callback.headers.location ?? "");
    const selectionState = callbackTarget.searchParams.get("bcConnectState");
    expect(selectionState).toBeTruthy();

    const selection = await app.inject({
      method: "GET",
      url: `/v1/integrations/business-central/connect/${encodeURIComponent(selectionState ?? "")}`,
    });

    expect(selection.statusCode).toBe(200);
    expect(selection.json()).toMatchObject({
      status: "select_company",
      selection: {
        state: selectionState,
        environment: "production",
        loginHint: "controller@contoso.com",
        domainHint: "contoso.com",
        companies: [
          { id: "company-1", name: "Contoso Holding" },
          { id: "company-2", name: "Contoso Manufacturing" },
        ],
      },
    });

    const finalize = await app.inject({
      method: "POST",
      url: "/v1/integrations/business-central/connect/select",
      payload: {
        state: selectionState,
        companyId: "company-2",
      },
    });

    expect(finalize.statusCode).toBe(200);
    expect(finalize.json()).toMatchObject({
      status: "connected",
      connection: {
        tenantSlug: TEST_TENANT,
        companyId: "company-2",
        companyName: "Contoso Manufacturing",
        tenantId: "tenant-guid-1",
        tenantLabel: "controller@contoso.com",
      },
    });

    const connection = await app.inject({
      method: "GET",
      url: "/v1/integrations/business-central/connection",
    });

    expect(connection.statusCode).toBe(200);
    expect(connection.json()).toMatchObject({
      status: {
        kind: "customer_connected",
        companyName: "Contoso Manufacturing",
        environment: "production",
      },
      connection: {
        tenantSlug: TEST_TENANT,
        companyId: "company-2",
        companyName: "Contoso Manufacturing",
      },
    });

    await app.close();
  });

  it("loads Business Central invoices, customers, and payments after a company is connected", async () => {
    mockJsonFetchByUrl([
      {
        match: /oauth2\/v2\.0\/token/,
        response: {
          access_token: "bc-access-token",
          refresh_token: "bc-refresh-token",
          expires_in: 3600,
          id_token: makeIdToken({
            tid: "tenant-guid-1",
            preferred_username: "controller@contoso.com",
          }),
        },
      },
      {
        match: /\/companies$/,
        response: {
          value: [{ id: "company-1", displayName: "Contoso Holding" }],
        },
      },
      {
        match: /\/customers/,
        response: {
          value: [
            {
              id: "customer-1",
              number: "C-100",
              displayName: "Contoso Retail",
              phoneNumber: "09170000000",
              email: "ap@contoso.example",
              currencyCode: "PHP",
              paymentTermsId: "term-30-net",
            },
          ],
        },
      },
      {
        match: /\/customerPayments/,
        response: {
          value: [
            {
              id: "payment-1",
              customerId: "customer-1",
              customerNumber: "C-100",
              postingDate: "2026-04-23",
              documentNumber: "PAY-1001",
              amount: 71700,
              appliesToInvoiceId: "invoice-1",
              description: "Customer payment",
            },
          ],
        },
      },
      {
        match: /\/salesInvoices/,
        response: {
          value: [
            {
              id: "invoice-1",
              number: "INV-1001",
              customerId: "customer-1",
              customerNumber: "C-100",
              customerName: "Contoso Retail",
              currencyCode: "PHP",
              remainingAmount: 0,
              totalAmountIncludingTax: 71700,
              status: "Paid",
              paymentTermsCode: "30D/NET",
              externalDocumentNumber: "PO-7781",
              orderNumber: "SO1-017785",
            },
          ],
        },
      },
      {
        match: /\/paymentTerms/,
        response: {
          value: [
            {
              id: "term-30-net",
              code: "30D/NET",
              displayName: "30 Days Net",
            },
          ],
        },
      },
      {
        match: /\/companyInformation/,
        response: {
          value: [
            {
              displayName: "Contoso Medical Supply",
              addressLine1: "200 Elizalde Street",
              city: "Paranaque City",
              phoneNumber: "+632 806-9267",
              faxNumber: "+632 801-4406",
            },
          ],
        },
      },
    ]);

    const app = buildApiApp();

    const connect = await app.inject({
      method: "GET",
      url:
        `/v1/integrations/business-central/connect?tenantSlug=${encodeURIComponent(TEST_TENANT)}` +
        `&returnTo=${encodeURIComponent("http://127.0.0.1:3000/connect/accounting?token=signed-token")}`,
    });
    const redirectUrl = new URL(connect.headers.location ?? "");
    const state = redirectUrl.searchParams.get("state");

    await app.inject({
      method: "GET",
      url: `/v1/integrations/business-central/callback?state=${encodeURIComponent(state ?? "")}&code=auth-code-2`,
    });

    const invoices = await app.inject({
      method: "GET",
      url: "/v1/integrations/business-central/invoices",
    });
    expect(invoices.statusCode).toBe(200);
    expect(invoices.json()).toMatchObject({
      invoices: [
        {
          externalId: "invoice-1",
          invoiceNumber: "INV-1001",
          paymentTermsCode: "30D/NET",
          paymentTermsLabel: "30 Days Net",
          customerPurchaseOrderNumber: "PO-7781",
          salesOrderNumber: "SO1-017785",
          issuerCompanyName: "Contoso Medical Supply",
        },
      ],
    });

    const customers = await app.inject({
      method: "GET",
      url: "/v1/integrations/business-central/customers",
    });
    expect(customers.statusCode).toBe(200);
    expect(customers.json()).toMatchObject({
      customers: [{ externalId: "customer-1", displayName: "Contoso Retail" }],
      contacts: [{ customerExternalId: "customer-1", email: "ap@contoso.example" }],
    });

    const payments = await app.inject({
      method: "GET",
      url: "/v1/integrations/business-central/payments",
    });
    expect(payments.statusCode).toBe(200);
    expect(payments.json()).toMatchObject({
      payments: [{ externalId: "payment-1", paymentReference: "PAY-1001", amountCents: 7170000 }],
    });

    const validation = await app.inject({
      method: "POST",
      url: "/v1/integrations/business-central/validate",
    });
    expect(validation.statusCode).toBe(200);
    expect(validation.json()).toMatchObject({
      counts: {
        invoices: 1,
        customers: 1,
        contacts: 1,
        payments: 1,
      },
    });

    await app.close();
  });

  it("disconnects a saved Business Central connection", async () => {
    mockJsonFetch([
      {
        access_token: "bc-access-token",
        refresh_token: "bc-refresh-token",
        expires_in: 3600,
        id_token: makeIdToken({
          tid: "tenant-guid-1",
          preferred_username: "controller@contoso.com",
        }),
      },
      {
        value: [{ id: "company-1", displayName: "Contoso Holding" }],
      },
    ]);

    const app = buildApiApp();

    const connect = await app.inject({
      method: "GET",
      url:
        `/v1/integrations/business-central/connect?tenantSlug=${encodeURIComponent(TEST_TENANT)}` +
        `&returnTo=${encodeURIComponent("http://127.0.0.1:3000/connect/accounting?token=signed-token")}`,
    });
    const redirectUrl = new URL(connect.headers.location ?? "");
    const state = redirectUrl.searchParams.get("state");

    await app.inject({
      method: "GET",
      url: `/v1/integrations/business-central/callback?state=${encodeURIComponent(state ?? "")}&code=auth-code-3`,
    });

    const disconnected = await app.inject({
      method: "POST",
      url: "/v1/integrations/business-central/disconnect",
    });
    expect(disconnected.statusCode).toBe(200);
    expect(disconnected.json()).toMatchObject({
      status: "disconnected",
      tenantSlug: TEST_TENANT,
      connection: {
        tenantSlug: TEST_TENANT,
        companyId: "company-1",
      },
    });

    const connection = await app.inject({
      method: "GET",
      url: "/v1/integrations/business-central/connection",
    });
    expect(connection.statusCode).toBe(200);
    expect(connection.json()).toMatchObject({
      status: { kind: "not_configured" },
      connection: null,
    });

    await app.close();
  });

  it("syncs paginated Business Central invoices plus customer and payment history into the platform", async () => {
    mockJsonFetchByUrl([
      {
        match: "/oauth2/v2.0/token",
        response: {
          access_token: "bc-access-token",
          refresh_token: "bc-refresh-token",
          expires_in: 3600,
          id_token: makeIdToken({
            tid: "tenant-guid-1",
            preferred_username: "controller@contoso.com",
          }),
        },
      },
      {
        match: /\/api\/v2\.0\/companies$/,
        response: {
          value: [{ id: "company-1", displayName: "Contoso Holding" }],
        },
      },
      {
        match: /\/salesInvoices\?/,
        response: {
          value: [
            {
              id: "invoice-1",
              number: "INV-1001",
              customerId: "customer-1",
              customerNumber: "C-100",
              customerName: "Contoso Retail",
              currencyCode: "PHP",
              remainingAmount: 100,
              totalAmountIncludingTax: 717,
              status: "Open",
            },
          ],
          "@odata.nextLink": "https://api.businesscentral.dynamics.com/page-2",
        },
      },
      {
        match: "page-2",
        response: {
          value: [
            {
              id: "invoice-2",
              number: "INV-1002",
              customerId: "customer-1",
              customerNumber: "C-100",
              customerName: "Contoso Retail",
              currencyCode: "PHP",
              remainingAmount: 0,
              totalAmountIncludingTax: 200,
              status: "Paid",
            },
          ],
        },
      },
      {
        match: /\/customers\?/,
        response: {
          value: [
            {
              id: "customer-1",
              number: "C-100",
              displayName: "Contoso Retail",
              phoneNumber: "09170000000",
              email: "ap@contoso.example",
              currencyCode: "PHP",
            },
          ],
        },
      },
      {
        match: /\/customerPayments\?/,
        response: {
          value: [
            {
              id: "payment-1",
              customerId: "customer-1",
              customerNumber: "C-100",
              postingDate: "2026-04-23",
              documentNumber: "PAY-1001",
              amount: 717,
              appliesToInvoiceId: "invoice-1",
              description: "Customer payment",
            },
          ],
        },
      },
    ]);

    const app = buildApiApp();

    const connect = await app.inject({
      method: "GET",
      url:
        `/v1/integrations/business-central/connect?tenantSlug=${encodeURIComponent(TEST_TENANT)}` +
        `&returnTo=${encodeURIComponent("http://127.0.0.1:3000/connect/accounting?token=signed-token")}`,
    });
    const redirectUrl = new URL(connect.headers.location ?? "");
    const state = redirectUrl.searchParams.get("state");

    await app.inject({
      method: "GET",
      url: `/v1/integrations/business-central/callback?state=${encodeURIComponent(state ?? "")}&code=auth-code-4`,
    });

    const sync = await app.inject({
      method: "POST",
      url: "/v1/integrations/business-central/sync",
    });

    expect(sync.json()).toBeDefined();
    expect(sync.statusCode).toBe(200);
    expect(sync.json()).toMatchObject({
      status: "completed",
      provider: "business-central",
      tenantSlug: TEST_TENANT,
      invoices: {
        pulledCount: 2,
        importedCount: 2,
      },
      customers: {
        pulledCustomerCount: 1,
        pulledPaymentCount: 1,
        syncedProfileCount: 1,
        syncedPaymentHistoryCount: 1,
        syncedInvoiceHistoryCount: 2,
      },
    });

    await app.close();
  });
});
