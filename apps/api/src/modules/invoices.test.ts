import { afterAll, describe, expect, it } from "vitest";
import { makeInvoice } from "@o2c/testkit";
import { buildApiApp } from "../app.js";
import {
  buildInvoiceIndexResponse,
  mapPersistedSnapshotToIndexEntry,
  mapSeedInvoiceToIndexEntry,
} from "./invoices.js";

const app = buildApiApp();

afterAll(async () => {
  await app.close();
});

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
});
