import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { buildApiApp } from "./app.js";
import { resetQuickBooksConnectionServiceForTests } from "./bootstrap/quickbooks-connection-service.js";

process.env.INTEGRATION_QUICKBOOKS_CLIENT_ID ??= "qb-client";
process.env.INTEGRATION_QUICKBOOKS_CLIENT_SECRET ??= "qb-secret";
process.env.INTEGRATION_QUICKBOOKS_CONNECT_REDIRECT_URI ??=
  "http://127.0.0.1:3001/v1/integrations/quickbooks/callback";

const TEST_TENANT = process.env.DEFAULT_TENANT_SLUG ?? "test-tenant";

const app = buildApiApp();

afterAll(async () => {
  await app.close();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetQuickBooksConnectionServiceForTests();
});

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

describe("invoice import API", () => {
  it("routes spreadsheet invoices through the canonical invoice sync flow", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/invoices/imports/spreadsheet",
      payload: {
        invoices: [
          {
            externalId: "spreadsheet-upload-1-row-2",
            invoiceNumber: "INV-9001",
            customerName: "Metro Group - Makati",
            currencyCode: "PHP",
            totalAmountCents: 12500000,
            remainingAmountCents: 12500000,
            status: "open",
            parentAccountName: "Metro Group",
            branchName: "Makati",
          },
        ],
        auditContext: {
          actorId: "api-test",
          actorType: "system",
          correlationId: "corr-invoice-import-1",
          occurredAt: "2026-04-09T09:00:00.000Z",
        },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.provider).toBe("spreadsheet_upload");
    expect(body.importedCount).toBe(1);
    expect(body.snapshots[0]?.sourceProvider).toBe("spreadsheet_upload");
  });

  it("accepts raw spreadsheet file uploads for invoice imports", async () => {
    const csv = [
      "invoice_number,customer_name,total_amount,open_amount,status",
      "INV-9002,Metro Group - Cebu,125000.00,125000.00,open",
    ].join("\n");

    const response = await app.inject({
      method: "POST",
      url: "/v1/invoices/imports/spreadsheet/file",
      headers: {
        "content-type": "text/csv",
        "x-file-name": "metro-invoices.csv",
        "x-upload-id": "upload-api-file-1",
      },
      payload: Buffer.from(csv, "utf8"),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.uploadId).toBe("upload-api-file-1");
    expect(body.fileName).toBe("metro-invoices.csv");
    expect(body.importedCount).toBe(1);
    expect(body.heldRows).toEqual([]);
  });

  it("syncs connected QuickBooks invoices through the canonical invoice flow", async () => {
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
              Id: "qb-101",
              DocNumber: "QB-INV-101",
              CustomerRef: { value: "CUST-101", name: "Metro Group - Makati" },
              CurrencyRef: { value: "PHP" },
              TotalAmt: 125000,
              Balance: 125000,
              DueDate: "2026-04-30",
              TxnDate: "2026-04-01",
            },
          ],
        },
      },
    ]);

    const connect = await app.inject({
      method: "GET",
      url: `/v1/integrations/quickbooks/connect?tenantSlug=${encodeURIComponent(TEST_TENANT)}&returnTo=http://127.0.0.1:3000/integrations`,
    });
    const connectUrl = new URL(connect.headers.location ?? "");
    const state = connectUrl.searchParams.get("state");

    await app.inject({
      method: "GET",
      url: `/v1/integrations/quickbooks/callback?state=${encodeURIComponent(state ?? "")}&code=auth-code-invoice-sync&realmId=9130344138709151`,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/invoices/imports/sync?provider=quickbooks_online",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.provider).toBe("quickbooks_online");
    expect(body.importedCount).toBe(1);
    expect(body.snapshots[0]?.sourceProvider).toBe("quickbooks_online");
  });
});
