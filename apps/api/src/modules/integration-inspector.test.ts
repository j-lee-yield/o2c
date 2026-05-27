import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiApp } from "../app.js";
import { resetBusinessCentralConnectionServiceForTests } from "../bootstrap/business-central-connection-service.js";
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
  resetBusinessCentralConnectionServiceForTests();
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

  it("returns summarized and raw Business Central data for a tenant", async () => {
    process.env.INTEGRATION_BUSINESS_CENTRAL_CONNECT_CLIENT_ID ??= "bc-client";
    process.env.INTEGRATION_BUSINESS_CENTRAL_CONNECT_CLIENT_SECRET ??= "bc-secret";
    process.env.INTEGRATION_BUSINESS_CENTRAL_CONNECT_REDIRECT_URI ??=
      "http://127.0.0.1:3001/v1/integrations/business-central/callback";

    mockJsonFetch([
      {
        access_token: "bc-access-token",
        refresh_token: "bc-refresh-token",
        expires_in: 3600,
        id_token: "header.eyJwcmVmZXJyZWRfdXNlcm5hbWUiOiJjb250cm9sbGVyQGNvbnRvc28uY29tIn0.signature",
      },
      {
        value: [{ id: "company-1", displayName: "Contoso Holding" }],
      },
      {
        value: [
          {
            id: "invoice-1",
            number: "INV-1001",
            customerId: "customer-1",
            customerNumber: "C-100",
            customerName: "Contoso Retail",
            currencyCode: "PHP",
            remainingAmount: 0,
            totalAmountIncludingTax: 717,
            status: "Paid",
          },
        ],
      },
      {
        value: [
          {
            id: "customer-1",
            number: "C-100",
            displayName: "Contoso Retail",
            email: "ap@contoso.example",
            phoneNumber: "09170000000",
            currencyCode: "PHP",
          },
        ],
      },
      {
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
      {
        value: [
          {
            id: "customer-1",
            number: "C-100",
            displayName: "Contoso Retail",
            email: "ap@contoso.example",
            phoneNumber: "09170000000",
            currencyCode: "PHP",
          },
        ],
      },
    ]);

    const app = buildApiApp();
    const connect = await app.inject({
      method: "GET",
      url: `/v1/integrations/business-central/connect?tenantSlug=${encodeURIComponent(TEST_TENANT)}&returnTo=http://127.0.0.1:3000/connect/accounting`,
    });
    const redirectUrl = new URL(connect.headers.location ?? "");
    const state = redirectUrl.searchParams.get("state");

    await app.inject({
      method: "GET",
      url: `/v1/integrations/business-central/callback?state=${encodeURIComponent(state ?? "")}&code=auth-code-bc-1`,
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/integrations/inspector?tenantSlug=${encodeURIComponent(TEST_TENANT)}&provider=business-central`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      tenantSlug: TEST_TENANT,
      providers: [
        {
          provider: "business-central",
          connectionStatus: "connected",
          companyName: "Contoso Holding",
          summary: {
            invoiceCount: 1,
            customerCount: 1,
            contactCount: 1,
            paymentCount: 1,
            totalInvoiceAmountCents: 71700,
            totalOpenInvoiceAmountCents: 0,
            totalPaymentAmountCents: 71700,
            totalUnappliedPaymentAmountCents: 0,
            currencyCodes: ["PHP"],
          },
          raw: {
            invoices: [{ externalId: "invoice-1" }],
            customers: [{ externalId: "customer-1" }],
            contacts: [{ customerExternalId: "customer-1" }],
            payments: [{ externalId: "payment-1" }],
          },
        },
      ],
    });

    await app.close();
  });
});
