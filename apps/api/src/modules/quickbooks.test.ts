import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiApp } from "../app.js";
import { resetQuickBooksConnectionServiceForTests } from "../bootstrap/quickbooks-connection-service.js";

process.env.INTEGRATION_QUICKBOOKS_CLIENT_ID = "qb-client";
process.env.INTEGRATION_QUICKBOOKS_CLIENT_SECRET = "qb-secret";
process.env.INTEGRATION_QUICKBOOKS_CONNECT_REDIRECT_URI =
  "http://127.0.0.1:3001/v1/integrations/quickbooks/callback";

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

afterEach(() => {
  vi.unstubAllGlobals();
  resetQuickBooksConnectionServiceForTests();
});

describe("quickbooks integration API", () => {
  it("returns connection status even when QuickBooks is not configured", async () => {
    const app = buildApiApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/integrations/quickbooks/connection",
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(
      payload.status.kind === "not_configured" || payload.status.kind === "customer_connected",
    ).toBe(true);
    expect(payload.connection === null || typeof payload.connection === "object").toBe(true);
    expect(payload.authorization).toMatchObject({
      provider: "quickbooks_online",
      accessMode: "read_write",
    });
    expect(payload.connectSetup).toMatchObject({
      configured: true,
      missingEnvKeys: [],
      redirectUri: "http://127.0.0.1:3001/v1/integrations/quickbooks/callback",
    });

    await app.close();
  });

  it("reports missing QuickBooks connect setup keys when OAuth config is absent", async () => {
    const previousClientId = process.env.INTEGRATION_QUICKBOOKS_CLIENT_ID;
    const previousClientSecret = process.env.INTEGRATION_QUICKBOOKS_CLIENT_SECRET;
    const previousRedirectUri = process.env.INTEGRATION_QUICKBOOKS_CONNECT_REDIRECT_URI;
    const previousEnvironment =
      process.env.INTEGRATION_QUICKBOOKS_CONNECT_DEFAULT_ENVIRONMENT;
    process.env.INTEGRATION_QUICKBOOKS_CLIENT_ID = "";
    process.env.INTEGRATION_QUICKBOOKS_CLIENT_SECRET = "";
    process.env.INTEGRATION_QUICKBOOKS_CONNECT_REDIRECT_URI = "";
    process.env.INTEGRATION_QUICKBOOKS_CONNECT_DEFAULT_ENVIRONMENT = "";
    resetQuickBooksConnectionServiceForTests();

    const app = buildApiApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/integrations/quickbooks/connection",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      connectSetup: {
        configured: false,
        missingEnvKeys: [
          "INTEGRATION_QUICKBOOKS_CLIENT_ID",
          "INTEGRATION_QUICKBOOKS_CLIENT_SECRET",
        ],
        redirectUri: "http://127.0.0.1:3001/v1/integrations/quickbooks/callback",
        defaultEnvironment: "production",
      },
    });

    await app.close();

    if (previousClientId === undefined) {
      delete process.env.INTEGRATION_QUICKBOOKS_CLIENT_ID;
    } else {
      process.env.INTEGRATION_QUICKBOOKS_CLIENT_ID = previousClientId;
    }
    if (previousClientSecret === undefined) {
      delete process.env.INTEGRATION_QUICKBOOKS_CLIENT_SECRET;
    } else {
      process.env.INTEGRATION_QUICKBOOKS_CLIENT_SECRET = previousClientSecret;
    }
    if (previousRedirectUri === undefined) {
      delete process.env.INTEGRATION_QUICKBOOKS_CONNECT_REDIRECT_URI;
    } else {
      process.env.INTEGRATION_QUICKBOOKS_CONNECT_REDIRECT_URI = previousRedirectUri;
    }
    if (previousEnvironment === undefined) {
      delete process.env.INTEGRATION_QUICKBOOKS_CONNECT_DEFAULT_ENVIRONMENT;
    } else {
      process.env.INTEGRATION_QUICKBOOKS_CONNECT_DEFAULT_ENVIRONMENT = previousEnvironment;
    }
    resetQuickBooksConnectionServiceForTests();
  });

  it("creates a QuickBooks connection after the callback completes", async () => {
    mockJsonFetch([
      {
        access_token: "qb-access-token",
        refresh_token: "qb-refresh-token",
        expires_in: 3600,
        x_refresh_token_expires_in: 86400,
      },
      {
        CompanyInfo: {
          CompanyName: "Acme QuickBooks",
        },
      },
    ]);

    const app = buildApiApp();
    const connect = await app.inject({
      method: "GET",
      url: `/v1/integrations/quickbooks/connect?tenantSlug=${encodeURIComponent(TEST_TENANT)}&returnTo=http://127.0.0.1:3000/integrations/quickbooks&environment=sandbox`,
    });

    expect(connect.statusCode).toBe(302);
    const redirectLocation = connect.headers.location;
    expect(redirectLocation).toContain("appcenter.intuit.com/connect/oauth2");
    const redirectUrl = new URL(redirectLocation ?? "");
    const state = redirectUrl.searchParams.get("state");
    expect(state).toBeTruthy();

    const callback = await app.inject({
      method: "GET",
      url: `/v1/integrations/quickbooks/callback?state=${encodeURIComponent(state ?? "")}&code=auth-code-1&realmId=9130344138709151`,
    });

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toContain("/integrations/quickbooks");
    expect(callback.headers.location).toContain("quickbooks=connected");

    const connection = await app.inject({
      method: "GET",
      url: "/v1/integrations/quickbooks/connection",
    });

    expect(connection.statusCode).toBe(200);
    expect(connection.json()).toMatchObject({
      status: {
        kind: "customer_connected",
        realmId: "9130344138709151",
        companyName: "Acme QuickBooks",
        environment: "sandbox",
        connectionHealth: "refresh_expiring",
        needsReconnect: true,
      },
      connection: {
        tenantSlug: TEST_TENANT,
        realmId: "9130344138709151",
        companyName: "Acme QuickBooks",
      },
    });

    await app.close();
  });

  it("loads invoices from QuickBooks after a tenant is connected", async () => {
    mockJsonFetch([
      {
        access_token: "qb-access-token",
        refresh_token: "qb-refresh-token",
        expires_in: 3600,
      },
      {
        CompanyInfo: {
          CompanyName: "Acme QuickBooks",
        },
      },
      {
        QueryResponse: {
          Invoice: [
            {
              Id: "101",
              DocNumber: "INV-QB-101",
              CustomerRef: { value: "CUST-101", name: "SM Retail" },
              BillEmail: { Address: "ap@sm.example" },
              CurrencyRef: { value: "PHP" },
              TotalAmt: 1500,
              Balance: 500,
              DueDate: "2026-04-30",
              TxnDate: "2026-04-01",
              DepartmentRef: { value: "BR-MNL", name: "Manila" },
            },
          ],
        },
      },
    ]);

    const app = buildApiApp();
    const connect = await app.inject({
      method: "GET",
      url: `/v1/integrations/quickbooks/connect?tenantSlug=${encodeURIComponent(TEST_TENANT)}&returnTo=http://127.0.0.1:3000/integrations`,
    });
    const connectUrl = new URL(connect.headers.location ?? "");
    const state = connectUrl.searchParams.get("state");

    await app.inject({
      method: "GET",
      url: `/v1/integrations/quickbooks/callback?state=${encodeURIComponent(state ?? "")}&code=auth-code-2&realmId=9130344138709151`,
    });

    const invoices = await app.inject({
      method: "GET",
      url: "/v1/integrations/quickbooks/invoices",
    });

    expect(invoices.statusCode).toBe(200);
    expect(invoices.json()).toMatchObject({
      company: {
        id: "9130344138709151",
        displayName: "Acme QuickBooks",
      },
      invoices: [
        {
          externalId: "101",
          invoiceNumber: "INV-QB-101",
          customerName: "SM Retail",
          customerNumber: "CUST-101",
          email: "ap@sm.example",
          currencyCode: "PHP",
          totalAmountCents: 150000,
          remainingAmountCents: 50000,
          branchName: "Manila",
          branchReference: "BR-MNL",
        },
      ],
    });

    await app.close();
  });

  it("loads customers, derived contacts, and payments from QuickBooks", async () => {
    mockJsonFetch([
      {
        access_token: "qb-access-token",
        refresh_token: "qb-refresh-token",
        expires_in: 3600,
      },
      {
        CompanyInfo: {
          CompanyName: "Acme QuickBooks",
        },
      },
      {
        QueryResponse: {
          Customer: [
            {
              Id: "cust-1",
              DisplayName: "Puregold Price Club",
              PrimaryEmailAddr: { Address: "ap@puregold.example" },
              PrimaryPhone: { FreeFormNumber: "09171234567" },
              CurrencyRef: { value: "PHP" },
              ParentRef: { value: "parent-1", name: "Puregold Group" },
              BillAddr: {
                Line1: "EDSA",
                City: "Pasig",
                CountrySubDivisionCode: "NCR",
                PostalCode: "1600",
              },
            },
          ],
        },
      },
      {
        QueryResponse: {
          Customer: [
            {
              Id: "cust-1",
              DisplayName: "Puregold Price Club",
              PrimaryEmailAddr: { Address: "ap@puregold.example" },
              PrimaryPhone: { FreeFormNumber: "09171234567" },
              CurrencyRef: { value: "PHP" },
              ParentRef: { value: "parent-1", name: "Puregold Group" },
            },
          ],
        },
      },
      {
        QueryResponse: {
          Payment: [
            {
              Id: "pay-1",
              CustomerRef: { value: "cust-1", name: "Puregold Price Club" },
              TotalAmt: 1250,
              UnappliedAmt: 250,
              CurrencyRef: { value: "PHP" },
              TxnDate: "2026-04-10",
              PaymentRefNum: "RCPT-101",
              PrivateNote: "Matched via bank feed",
              Line: [
                {
                  LinkedTxn: [{ TxnId: "inv-1", TxnType: "Invoice" }],
                },
              ],
            },
          ],
        },
      },
    ]);

    const app = buildApiApp();
    const connect = await app.inject({
      method: "GET",
      url: `/v1/integrations/quickbooks/connect?tenantSlug=${encodeURIComponent(TEST_TENANT)}&returnTo=http://127.0.0.1:3000/integrations`,
    });
    const connectUrl = new URL(connect.headers.location ?? "");
    const state = connectUrl.searchParams.get("state");

    await app.inject({
      method: "GET",
      url: `/v1/integrations/quickbooks/callback?state=${encodeURIComponent(state ?? "")}&code=auth-code-3&realmId=9130344138709151`,
    });

    const customers = await app.inject({
      method: "GET",
      url: "/v1/integrations/quickbooks/customers",
    });
    expect(customers.statusCode).toBe(200);
    expect(customers.json()).toMatchObject({
      customers: [
        {
          externalId: "cust-1",
          displayName: "Puregold Price Club",
          parentAccountName: "Puregold Group",
          currencyCode: "PHP",
        },
      ],
      contacts: [
        {
          customerExternalId: "cust-1",
          email: "ap@puregold.example",
          role: "accounts_payable",
        },
      ],
    });

    const contacts = await app.inject({
      method: "GET",
      url: "/v1/integrations/quickbooks/contacts",
    });
    expect(contacts.statusCode).toBe(200);
    expect(contacts.json()).toMatchObject({
      contacts: [
        {
          customerExternalId: "cust-1",
          email: "ap@puregold.example",
        },
      ],
    });

    const payments = await app.inject({
      method: "GET",
      url: "/v1/integrations/quickbooks/payments",
    });
    expect(payments.statusCode).toBe(200);
    expect(payments.json()).toMatchObject({
      payments: [
        {
          externalId: "pay-1",
          customerName: "Puregold Price Club",
          paymentReference: "RCPT-101",
          amountCents: 125000,
          unappliedAmountCents: 25000,
          linkedInvoiceIds: ["inv-1"],
        },
      ],
    });

    await app.close();
  });
});
