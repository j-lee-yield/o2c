import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiApp } from "../app.js";
import { resetSapBusinessOneConnectionServiceForTests } from "../bootstrap/sap-business-one-connection-service.js";

const TEST_TENANT = process.env.DEFAULT_TENANT_SLUG ?? "test-tenant";

function mockSapFetch(responses?: Array<unknown>) {
  const fetchMock = vi.fn();
  const queue = responses ?? [
    {
      SessionId: "session-123",
      SessionTimeout: 30,
    },
    {
      CompanyName: "Acme SAP B1",
    },
    {
      value: [
        {
          DocEntry: 101,
          DocNum: 7001,
          CardCode: "CUST-101",
          CardName: "Metro Group - Makati",
          DocCurrency: "PHP",
          DocTotal: 125000,
          PaidToDate: 25000,
          DocDueDate: "2026-04-30",
          DocDate: "2026-04-01",
          DocumentStatus: "bost_Open",
          Cancelled: "tNO",
          BPLName: "Makati",
          BPL_IDAssignedToInvoice: 3,
        },
      ],
    },
  ];
  for (const [index, responseBody] of queue.entries()) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "set-cookie"
            ? "B1SESSION=session-123; Path=/; HttpOnly, ROUTEID=.node1; Path=/"
            : null,
      },
      json: async () => responseBody,
      ...(index === 0
        ? {}
        : {
            headers: { get: () => null },
          }),
    });
  }
  vi.stubGlobal("fetch", fetchMock);
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetSapBusinessOneConnectionServiceForTests();
});

describe("sap business one integration API", () => {
  it("connects a tenant and loads invoices", async () => {
    mockSapFetch();
    const app = buildApiApp();

    const connect = await app.inject({
      method: "POST",
      url: "/v1/integrations/sap-business-one/connect",
      payload: {
        tenantSlug: TEST_TENANT,
        returnTo: "http://127.0.0.1:3000/integrations/sap-business-one",
        baseUrl: "https://sapb1.example.com:50000",
        companyDatabase: "SBODEMO_PH",
        username: "manager",
        password: "secret",
      },
    });

    expect(connect.statusCode).toBe(200);
    expect(connect.json()).toMatchObject({
      status: "connected",
      connection: {
        tenantSlug: TEST_TENANT,
        companyDatabase: "SBODEMO_PH",
        companyName: "Acme SAP B1",
      },
    });

    const connection = await app.inject({
      method: "GET",
      url: "/v1/integrations/sap-business-one/connection",
    });

    expect(connection.statusCode).toBe(200);
    expect(connection.json()).toMatchObject({
      status: {
        kind: "connected",
        companyDatabase: "SBODEMO_PH",
        companyName: "Acme SAP B1",
      },
      authorization: {
        provider: "sap_business_one",
        accessMode: "read_write",
      },
    });

    const invoices = await app.inject({
      method: "GET",
      url: "/v1/integrations/sap-business-one/invoices",
    });

    expect(invoices.statusCode).toBe(200);
    expect(invoices.json()).toMatchObject({
      company: {
        id: "SBODEMO_PH",
        displayName: "Acme SAP B1",
      },
      invoices: [
        {
          externalId: "101",
          invoiceNumber: "7001",
          customerName: "Metro Group - Makati",
          customerNumber: "CUST-101",
          totalAmountCents: 12500000,
          remainingAmountCents: 10000000,
          branchName: "Makati",
          branchReference: "3",
        },
      ],
    });

    await app.close();
  });

  it("tests credentials before saving and records a sync run", async () => {
    mockSapFetch([
      { SessionId: "session-123", SessionTimeout: 30 },
      { CompanyName: "Acme SAP B1" },
      { SessionId: "session-123", SessionTimeout: 30 },
      { CompanyName: "Acme SAP B1" },
      {
        value: [
          {
            DocEntry: 101,
            DocNum: 7001,
            CardCode: "CUST-101",
            CardName: "Metro Group - Makati",
            DocCurrency: "PHP",
            DocTotal: 125000,
            PaidToDate: 25000,
            DocDueDate: "2026-04-30",
            DocDate: "2026-04-01",
            DocumentStatus: "bost_Open",
            Cancelled: "tNO",
          },
        ],
      },
      {
        value: [
          {
            CardCode: "CUST-101",
            CardName: "Metro Group - Makati",
            Currency: "PHP",
            E_Mail: "ap@metro.example",
          },
        ],
      },
      {
        value: [
          {
            DocEntry: 501,
            DocNum: 8801,
            CardCode: "CUST-101",
            CardName: "Metro Group - Makati",
            DocCurrency: "PHP",
            DocDate: "2026-04-05",
            TransferSum: 1000,
          },
        ],
      },
    ]);
    const app = buildApiApp();

    const testResponse = await app.inject({
      method: "POST",
      url: "/v1/integrations/sap-business-one/connect/test",
      payload: {
        baseUrl: "https://sapb1.example.com:50000",
        companyDatabase: "SBODEMO_PH",
        username: "manager",
        password: "secret",
      },
    });

    expect(testResponse.statusCode).toBe(200);
    expect(testResponse.json()).toMatchObject({
      status: "ok",
      result: {
        companyDatabase: "SBODEMO_PH",
        companyName: "Acme SAP B1",
      },
    });

    const connect = await app.inject({
      method: "POST",
      url: "/v1/integrations/sap-business-one/connect",
      payload: {
        tenantSlug: TEST_TENANT,
        returnTo: "http://127.0.0.1:3000/integrations/sap-business-one",
        baseUrl: "https://sapb1.example.com:50000",
        companyDatabase: "SBODEMO_PH",
        username: "manager",
        password: "secret",
      },
    });
    expect(connect.statusCode).toBe(200);

    const sync = await app.inject({
      method: "POST",
      url: "/v1/integrations/sap-business-one/sync",
      payload: {
        scope: ["invoices", "customers", "payments"],
      },
    });

    expect(sync.statusCode).toBe(200);
    expect(sync.json()).toMatchObject({
      status: "succeeded",
      run: {
        invoicesSyncedCount: 1,
        customersSyncedCount: 1,
        paymentsSyncedCount: 1,
      },
    });

    const connection = await app.inject({
      method: "GET",
      url: "/v1/integrations/sap-business-one/connection",
    });

    expect(connection.statusCode).toBe(200);
    expect(connection.json()).toMatchObject({
      sync: {
        latestRun: {
          status: "succeeded",
          invoicesSyncedCount: 1,
          customersSyncedCount: 1,
          paymentsSyncedCount: 1,
        },
      },
    });

    await app.close();
  });
});
