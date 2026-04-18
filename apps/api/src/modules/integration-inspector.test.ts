import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiApp } from "../app.js";
import { resetQuickBooksConnectionServiceForTests } from "../bootstrap/quickbooks-connection-service.js";

process.env.INTEGRATION_QUICKBOOKS_CLIENT_ID ??= "qb-client";
process.env.INTEGRATION_QUICKBOOKS_CLIENT_SECRET ??= "qb-secret";
process.env.INTEGRATION_QUICKBOOKS_CONNECT_REDIRECT_URI ??=
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
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetQuickBooksConnectionServiceForTests();
});

describe("integration inspector API", () => {
  it("returns summarized and raw QuickBooks data for a tenant", async () => {
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
              CurrencyRef: { value: "PHP" },
              TotalAmt: 1500,
              Balance: 500,
            },
          ],
        },
      },
      {
        QueryResponse: {
          Customer: [
            {
              Id: "cust-1",
              DisplayName: "SM Retail",
              PrimaryEmailAddr: { Address: "ap@sm.example" },
              CurrencyRef: { value: "PHP" },
            },
          ],
        },
      },
      {
        QueryResponse: {
          Payment: [
            {
              Id: "pay-1",
              CustomerRef: { value: "cust-1", name: "SM Retail" },
              TotalAmt: 1250,
              UnappliedAmt: 250,
              CurrencyRef: { value: "PHP" },
              TxnDate: "2026-04-10",
              PaymentRefNum: "RCPT-101",
            },
          ],
        },
      },
    ]);

    const app = buildApiApp();
    const connect = await app.inject({
      method: "GET",
      url: `/v1/integrations/quickbooks/connect?tenantSlug=${encodeURIComponent(TEST_TENANT)}&returnTo=http://127.0.0.1:3000/connect/accounting`,
    });
    const redirectUrl = new URL(connect.headers.location ?? "");
    const state = redirectUrl.searchParams.get("state");

    await app.inject({
      method: "GET",
      url: `/v1/integrations/quickbooks/callback?state=${encodeURIComponent(state ?? "")}&code=auth-code-3&realmId=9130344138709151`,
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/integrations/inspector?tenantSlug=${encodeURIComponent(TEST_TENANT)}&provider=quickbooks`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      tenantSlug: TEST_TENANT,
      providers: [
        {
          provider: "quickbooks",
          connectionStatus: "connected",
          companyName: "Acme QuickBooks",
          summary: {
            invoiceCount: 1,
            customerCount: 1,
            contactCount: 1,
            paymentCount: 1,
            totalInvoiceAmountCents: 150000,
            totalOpenInvoiceAmountCents: 50000,
            totalPaymentAmountCents: 125000,
            totalUnappliedPaymentAmountCents: 25000,
            currencyCodes: ["PHP"],
          },
          raw: {
            company: {
              id: "9130344138709151",
            },
            invoices: [
              {
                externalId: "101",
              },
            ],
            customers: [
              {
                externalId: "cust-1",
              },
            ],
            payments: [
              {
                externalId: "pay-1",
              },
            ],
          },
        },
      ],
    });

    await app.close();
  });
});
