import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeInvoice } from "@o2c/testkit";
import { buildApiApp } from "../app.js";
import {
  buildInvoiceIndexResponse,
  mapPersistedSnapshotToIndexEntry,
  mapSeedInvoiceToIndexEntry,
} from "./invoices.js";

const app = buildApiApp();
const originalEnableDemoData = process.env.ENABLE_DEMO_DATA;

beforeEach(() => {
  process.env.ENABLE_DEMO_DATA = "true";
});

afterEach(() => {
  if (originalEnableDemoData === undefined) {
    delete process.env.ENABLE_DEMO_DATA;
  } else {
    process.env.ENABLE_DEMO_DATA = originalEnableDemoData;
  }
});

afterAll(async () => {
  await app.close();
});

function buildInvoiceEntryFixture(
  invoiceNumber: string,
  overrides: Partial<ReturnType<typeof mapSeedInvoiceToIndexEntry>> = {},
): ReturnType<typeof mapSeedInvoiceToIndexEntry> {
  return {
    id: `fixture:${invoiceNumber}`,
    sourceProvider: "spreadsheet_upload",
    sourceKind: "spreadsheet",
    sourceLabel: "Uploaded invoices",
    importMode: "manual_upload",
    customerName: "Fixture Customer",
    billingAccountId: "fixture-billing",
    billingAccountName: "Fixture Customer",
    invoiceNumber,
    currency: "PHP",
    totalAmountCents: 1000000,
    openAmountCents: 1000000,
    paidAmountCents: 0,
    status: "open",
    sourceStatus: "open",
    issuedAt: "2026-04-26",
    dueDate: "2026-05-26",
    daysPastDue: 0,
    tags: [],
    metadata: {},
    ...overrides,
  };
}

describe("invoice index API", () => {
  it("returns a normalized invoice index payload", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/invoices",
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();

    expect(payload.generatedAt).toBeTypeOf("string");
    expect(payload.summary.totalInvoices).toBeGreaterThan(0);
    expect(payload.providers.length).toBeGreaterThan(0);
    expect(payload.statuses.some((item: { status: string }) => item.status === "open")).toBe(true);
    expect(payload.invoices[0]?.invoiceNumber).toBeTypeOf("string");
    expect(payload.invoices[0]?.sourceProvider).toBeTypeOf("string");
    expect(payload.invoices[0]?.totalAmountCents).toBeTypeOf("number");
    expect(Array.isArray(payload.invoices[0]?.tags)).toBe(true);
  });

  it("filters and paginates invoice index read models from query state", async () => {
    const entries = [
      buildInvoiceEntryFixture("INV-OPEN-1", {
        customerName: "Acme Medical",
        billingAccountName: "Acme Medical Billing",
        status: "open",
        importMode: "manual_upload",
        openAmountCents: 1250000,
        totalAmountCents: 1250000,
      }),
      buildInvoiceEntryFixture("INV-OPEN-2", {
        customerName: "Acme Medical",
        billingAccountName: "Acme Medical Billing",
        status: "open",
        importMode: "manual_upload",
        openAmountCents: 2500000,
        totalAmountCents: 2500000,
      }),
      buildInvoiceEntryFixture("INV-PAID-1", {
        customerName: "Other Customer",
        status: "paid",
        importMode: "live_connection",
        openAmountCents: 0,
        totalAmountCents: 1000000,
      }),
    ];

    const response = await buildInvoiceIndexResponse({
      databaseUrl: "postgresql://example",
      tenantId: "acme",
      now: () => "2026-05-26T02:00:00.000Z",
      loadPersistedEntries: () => entries,
      loadActivePromiseSummaries: () => [],
      filters: {
        q: "acme",
        status: "open",
        type: "manual_upload",
        more: "with_balance",
        page: 2,
        pageSize: 1,
      },
      loadBusinessCentral: async () => ({
        invoices: [],
      }),
      getBusinessCentralStatusForTenant: () => ({ kind: "not_configured" }),
    });

    expect(response.summary.totalInvoices).toBe(2);
    expect(response.pagination).toMatchObject({
      page: 2,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
      hasPreviousPage: true,
      hasNextPage: false,
    });
    expect(response.invoices).toHaveLength(1);
    expect(response.invoices[0]?.invoiceNumber).toBe("INV-OPEN-2");
  });

  it("exports the filtered invoice index as a PDF", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/invoices/export?status=open",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.body.slice(0, 5)).toBe("%PDF-");
  });

  it("prefers persisted imported invoice snapshots over live and seed fallback data", async () => {
    const response = await buildInvoiceIndexResponse({
      databaseUrl: "postgresql://example",
      tenantId: "acme",
      now: () => "2026-03-30T08:00:00.000Z",
      loadPersistedEntries: () => [
        {
          id: "business_central:bc-1",
          sourceProvider: "business_central",
          sourceKind: "accounting",
          sourceLabel: "Business Central",
          importMode: "live_connection",
          externalId: "bc-1",
          canonicalInvoiceId: "invoice-1",
          customerName: "Acme Billing",
          customerReference: "BA-1001",
          parentAccountId: "parent-1",
          parentAccountName: "Acme Parent",
          billingAccountId: "billing-1",
          billingAccountName: "Acme Billing",
          branchId: "branch-1",
          branchName: "Makati",
          invoiceNumber: "SI-1001",
          currency: "PHP",
          totalAmountCents: 1500000,
          openAmountCents: 1500000,
          collectibleAmountCents: 1100000,
          paidAmountCents: 0,
          status: "disputed",
          sourceStatus: "open",
          issuedAt: "2026-03-25",
          dueDate: "2026-04-25",
          lastImportedAt: "2026-03-30T07:59:00.000Z",
          tags: ["live", "disputed", "canonical-linked"],
          metadata: {
            canonicalizationStatus: "canonical_upserted",
            disputedAmountCents: 400000,
          },
        },
      ],
      loadActivePromiseSummaries: () => [
        {
          id: "ptp-1",
          billingAccountId: "billing-1",
          promisedAmountCents: 1_500_000,
          currency: "PHP",
          promiseDate: "2026-04-30",
          state: "accepted",
          updatedAt: "2026-03-30T08:10:00.000Z",
          invoiceIds: ["invoice-1", "invoice-2", "invoice-3"],
        },
      ],
      loadBusinessCentral: async () => ({
        invoices: [],
      }),
      getBusinessCentralStatusForTenant: () => ({ kind: "not_configured" }),
    });

    expect(response.source.label).toContain("Persisted");
    expect(response.summary.totalInvoices).toBe(1);
    expect(response.invoices[0]?.canonicalInvoiceId).toBe("invoice-1");
    expect(response.invoices[0]?.customerName).toBe("Acme Billing");
    expect(response.invoices[0]?.collectibleAmountCents).toBe(1100000);
    expect(response.invoices[0]?.metadata.promiseToPayDate).toBe("2026-04-30");
    expect(response.invoices[0]?.metadata.promiseToPayId).toBe("ptp-1");
    expect(response.invoices[0]?.metadata.promiseToPayInvoiceCount).toBe(3);
    expect(response.invoices[0]?.tags).toContain("promise-to-pay");
  });

  it("falls back to seed data when persisted imports are unavailable", async () => {
    const response = await buildInvoiceIndexResponse({
      databaseUrl: "postgresql://example",
      tenantId: "acme",
      now: () => "2026-03-30T08:00:00.000Z",
      loadPersistedEntries: () => {
        throw new Error("database unavailable");
      },
      loadBusinessCentral: async () => null,
      getBusinessCentralStatusForTenant: () => ({ kind: "not_configured" }),
    });

    expect(response.source.kind).toBe("seeded");
    expect(response.source.detail).toContain("Stored invoice index was unavailable");
    expect(response.summary.totalInvoices).toBeGreaterThan(0);
  });

  it("keeps the invoice index empty instead of seeding demo data when demo data is disabled", async () => {
    process.env.ENABLE_DEMO_DATA = "false";

    const response = await buildInvoiceIndexResponse({
      databaseUrl: "postgresql://example",
      tenantId: "acme",
      now: () => "2026-03-30T08:00:00.000Z",
      loadPersistedEntries: () => {
        throw new Error("database unavailable");
      },
      loadBusinessCentral: async () => null,
      getBusinessCentralStatusForTenant: () => ({ kind: "not_configured" }),
      loadQuickBooks: async () => null,
      getQuickBooksStatusForTenant: () => ({ kind: "not_configured" }),
    });

    expect(response.source.kind).toBe("live");
    expect(response.summary.totalInvoices).toBe(0);
    expect(response.invoices).toEqual([]);
  });

  it("derives collectible amount for partial disputes in the persisted read model", () => {
    const entry = mapPersistedSnapshotToIndexEntry({
      id: "snapshot-1",
      sourceProvider: "business_central",
      sourceKind: "accounting",
      externalId: "bc-1",
      canonicalInvoiceId: "invoice-1",
      customerName: "Acme Billing",
      billingAccountId: "billing-1",
      billingAccountName: "Acme Billing",
      invoiceNumber: "SI-1001",
      currency: "PHP",
      totalAmountCents: 1_500_000,
      openAmountCents: 1_500_000,
      sourceStatus: "open",
      lastImportedAt: "2026-03-30T07:59:00.000Z",
      canonicalState: "disputed_partial",
      canonicalMetadata: {
        disputedAmountCents: 400_000,
      },
      snapshotMetadata: {},
      canonicalizationStatus: "canonical_upserted",
    });

    expect(entry.status).toBe("disputed");
    expect(entry.collectibleAmountCents).toBe(1_100_000);
  });

  it("keeps spreadsheet-backed persisted snapshots marked as manual uploads", () => {
    const entry = mapPersistedSnapshotToIndexEntry({
      id: "snapshot-2",
      sourceProvider: "spreadsheet_upload",
      sourceKind: "spreadsheet",
      externalId: "spreadsheet_upload:upload-1:2",
      customerName: "Acme Billing",
      customerReference: "BA-1001",
      billingAccountId: "billing-1",
      billingAccountName: "Acme Billing",
      invoiceNumber: "CSV-1001",
      currency: "PHP",
      totalAmountCents: 950000,
      openAmountCents: 950000,
      sourceStatus: "open",
      issuedAt: "2026-03-20",
      dueDate: "2026-04-20",
      lastImportedAt: "2026-03-30T07:59:00.000Z",
      snapshotMetadata: {},
      canonicalizationStatus: "pending_account_mapping",
    });

    expect(entry.sourceProvider).toBe("spreadsheet_upload");
    expect(entry.importMode).toBe("manual_upload");
    expect(entry.tags).toContain("manual-upload");
  });

  it("derives collectible amount for partial disputes in the seed read model", () => {
    const entry = mapSeedInvoiceToIndexEntry(
      makeInvoice({
        id: "invoice-1",
        parentAccountId: "parent-1",
        billingAccountId: "billing-1",
        invoiceNumber: "SI-1001",
        amountCents: 1_500_000,
        state: "disputed_partial",
        disputedAmountCents: 400_000,
        metadata: {},
      }),
      {
        billingAccountName: "Acme Billing",
        parentAccountName: "Acme Parent",
      },
    );

    expect(entry.status).toBe("disputed");
    expect(entry.collectibleAmountCents).toBe(1_100_000);
    expect(entry.collectibleAmountCents).toBeLessThan(entry.totalAmountCents);
  });

  it("derives installment-aware overdue and future balances from invoice metadata", () => {
    const entry = mapSeedInvoiceToIndexEntry(
      makeInvoice({
        id: "invoice-installment-1",
        parentAccountId: "parent-1",
        billingAccountId: "billing-1",
        branchId: "branch-1",
        invoiceNumber: "SI-INSTALLMENT-1",
        amountCents: 60_000,
        state: "matched_to_erp",
        metadata: {
          installmentPlan: {
            installmentPlanId: "plan-1",
          },
          installmentLines: [
            {
              installmentLineId: "line-1",
              installmentPlanId: "plan-1",
              billingAccountId: "billing-1",
              branchId: "branch-1",
              currency: "PHP",
              sequenceNumber: 1,
              dueDate: "2026-03-01",
              scheduledAmountCents: 10_000,
              paidAmountCents: 0,
              remainingAmountCents: 10_000,
              status: "overdue",
            },
            {
              installmentLineId: "line-2",
              installmentPlanId: "plan-1",
              billingAccountId: "billing-1",
              branchId: "branch-1",
              currency: "PHP",
              sequenceNumber: 2,
              dueDate: "2026-06-01",
              scheduledAmountCents: 10_000,
              paidAmountCents: 0,
              remainingAmountCents: 10_000,
              status: "future",
            },
          ],
        },
      }),
      {
        billingAccountName: "Acme Billing",
        parentAccountName: "Acme Parent",
        branchName: "Makati",
      },
    );

    expect(entry.openAmountCents).toBe(20_000);
    expect(entry.overdueAmountCents).toBe(10_000);
    expect(entry.futureAmountCents).toBe(10_000);
    expect(entry.installmentPlanId).toBe("plan-1");
    expect(entry.missedInstallmentCount).toBe(1);
    expect(entry.tags).toContain("installment-plan");
  });

  it("includes example standard-term and installment invoices in the seed invoice index", async () => {
    const response = await buildInvoiceIndexResponse({
      databaseUrl: "postgresql://example",
      tenantId: "acme",
      now: () => "2026-04-21T00:00:00.000Z",
      loadPersistedEntries: () => {
        throw new Error("database unavailable");
      },
      loadBusinessCentral: async () => null,
      getBusinessCentralStatusForTenant: () => ({ kind: "not_configured" }),
    });

    const standardInvoice = response.invoices.find((invoice) => invoice.invoiceNumber === "SI-EX-STANDARD-1002");
    const installmentInvoice = response.invoices.find((invoice) => invoice.invoiceNumber === "SI-EX-INSTALL-2002");

    expect(standardInvoice?.metadata.exampleType).toBe("standard_credit_terms");
    expect(standardInvoice?.openAmountCents).toBe(240_000);
    expect(installmentInvoice?.metadata.exampleType).toBe("installment_plan");
    expect(installmentInvoice?.overdueAmountCents).toBe(60_000);
    expect(installmentInvoice?.dueNowAmountCents).toBe(60_000);
    expect(installmentInvoice?.futureAmountCents).toBe(120_000);
    expect(installmentInvoice?.missedInstallmentCount).toBe(1);
  });
});
