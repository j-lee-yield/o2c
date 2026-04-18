import { describe, expect, it } from "vitest";
import type { BusinessCentralInvoiceRecord } from "../integrations/business-central.js";
import type { OdooInvoiceRecord } from "../integrations/odoo.js";
import type { QuickBooksInvoiceRecord } from "../integrations/quickbooks.js";
import type { XeroInvoiceRecord } from "../integrations/xero.js";
import {
  createImportedInvoiceSyncService,
  InMemoryCanonicalInvoicePersistenceStore,
  type BillingAccountMatch,
} from "./imported-invoice-sync-service.js";

function makeBusinessCentralInvoice(
  overrides: Partial<BusinessCentralInvoiceRecord> = {},
): BusinessCentralInvoiceRecord {
  return {
    externalId: "bc-1",
    invoiceNumber: "SI-1001",
    customerName: "Acme Billing",
    customerNumber: "BA-1001",
    currencyCode: "PHP",
    totalAmountCents: 1500000,
    remainingAmountCents: 1500000,
    status: "open",
    companyId: "company-1",
    ...overrides,
  };
}

function makeBillingAccountMatch(
  overrides: Partial<BillingAccountMatch> = {},
): BillingAccountMatch {
  return {
    id: "billing-1",
    tenantId: "default",
    parentAccountId: "parent-1",
    branchId: "branch-1",
    branchCode: "BR-001",
    branchName: "Acme Branch 1",
    accountNumber: "BA-1001",
    displayName: "Acme Billing",
    currency: "PHP",
    accountTier: "standard",
    erpCustomerId: "BA-1001",
    ...overrides,
  };
}

function makeOdooInvoice(
  overrides: Partial<OdooInvoiceRecord> = {},
): OdooInvoiceRecord {
  return {
    externalId: "odoo-1",
    invoiceNumber: "ODOO-1001",
    customerName: "Acme Billing",
    customerNumber: "BA-1001",
    currencyCode: "PHP",
    totalAmountCents: 1750000,
    remainingAmountCents: 1750000,
    status: "open",
    companyId: "odoo-company-1",
    partnerId: 42,
    ...overrides,
  };
}

function makeQuickBooksInvoice(
  overrides: Partial<QuickBooksInvoiceRecord> = {},
): QuickBooksInvoiceRecord {
  return {
    externalId: "qb-1",
    invoiceNumber: "QB-1001",
    customerName: "Acme Billing",
    customerNumber: "BA-1001",
    currencyCode: "PHP",
    totalAmountCents: 1200000,
    remainingAmountCents: 1200000,
    status: "open",
    companyId: "qb-realm-1",
    branchReference: "BR-001",
    ...overrides,
  };
}

function makeXeroInvoice(
  overrides: Partial<XeroInvoiceRecord> = {},
): XeroInvoiceRecord {
  return {
    externalId: "xero-1",
    invoiceNumber: "XERO-1001",
    customerName: "Acme Billing",
    customerNumber: "BA-1001",
    currencyCode: "PHP",
    totalAmountCents: 2100000,
    remainingAmountCents: 2100000,
    status: "open",
    companyId: "xero-tenant-1",
    branchName: "Acme Branch 1",
    ...overrides,
  };
}

describe("imported invoice sync service", () => {
  it("stores a snapshot and promotes to canonical invoice when there is exactly one safe account match", async () => {
    const store = new InMemoryCanonicalInvoicePersistenceStore([makeBillingAccountMatch()]);
    const service = createImportedInvoiceSyncService({
      store,
      now: () => "2026-03-30T10:00:00.000Z",
      idGenerator: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })(),
    });

    const result = await service.syncBusinessCentralInvoices({
      tenantId: "default",
      invoices: [makeBusinessCentralInvoice()],
    });

    expect(result.importedCount).toBe(1);
    expect(result.canonicalUpsertedCount).toBe(1);
    expect(result.pendingAccountMappingCount).toBe(0);
    expect(result.snapshots[0]?.canonicalizationStatus).toBe("canonical_upserted");
    expect([...store.canonicalInvoices.values()][0]?.invoiceNumber).toBe("SI-1001");
    expect([...store.canonicalInvoices.values()][0]?.sellerEntityId).toBe("company-1");
  });

  it("holds imported invoices in durable snapshots when there is no safe account match", async () => {
    const store = new InMemoryCanonicalInvoicePersistenceStore([]);
    const service = createImportedInvoiceSyncService({
      store,
      now: () => "2026-03-30T10:00:00.000Z",
    });

    const result = await service.syncBusinessCentralInvoices({
      tenantId: "default",
      invoices: [makeBusinessCentralInvoice()],
    });

    expect(result.importedCount).toBe(1);
    expect(result.canonicalUpsertedCount).toBe(0);
    expect(result.pendingAccountMappingCount).toBe(1);
    expect(result.snapshots[0]?.holdReason).toBe("unmapped_billing_account");
    expect(store.canonicalInvoices.size).toBe(0);
    expect(store.snapshots.size).toBe(1);
  });

  it("does not downgrade protected canonical invoice states on re-import", async () => {
    const store = new InMemoryCanonicalInvoicePersistenceStore([makeBillingAccountMatch()]);
    const service = createImportedInvoiceSyncService({
      store,
      now: () => "2026-03-30T10:00:00.000Z",
      idGenerator: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })(),
    });

    await store.upsertCanonicalInvoice({
      id: "invoice-1",
      tenantId: "default",
      version: 1,
      createdAt: "2026-03-29T09:00:00.000Z",
      updatedAt: "2026-03-29T09:00:00.000Z",
      parentAccountId: "parent-1",
      billingAccountId: "billing-1",
      branchId: "branch-1",
      invoiceNumber: "SI-1001",
      currency: "PHP",
      amountCents: 1500000,
      state: "disputed_full",
      metadata: {},
    });

    await service.syncBusinessCentralInvoices({
      tenantId: "default",
      invoices: [makeBusinessCentralInvoice({ status: "open" })],
    });

    expect([...store.canonicalInvoices.values()][0]?.state).toBe("disputed_full");
  });

  it("does not merge invoices that share a number but differ in canonical identity", async () => {
    const store = new InMemoryCanonicalInvoicePersistenceStore([makeBillingAccountMatch()]);
    const service = createImportedInvoiceSyncService({
      store,
      now: () => "2026-03-30T10:00:00.000Z",
      idGenerator: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })(),
    });

    await service.syncBusinessCentralInvoices({
      tenantId: "default",
      invoices: [
        makeBusinessCentralInvoice({
          externalId: "bc-1",
          invoiceNumber: "SI-1001",
          invoiceDate: "2026-03-01",
          totalAmountCents: 1500000,
          remainingAmountCents: 1500000,
        }),
      ],
    });

    await service.syncBusinessCentralInvoices({
      tenantId: "default",
      invoices: [
        makeBusinessCentralInvoice({
          externalId: "bc-2",
          invoiceNumber: "SI-1001",
          invoiceDate: "2026-03-05",
          totalAmountCents: 1700000,
          remainingAmountCents: 1700000,
        }),
      ],
    });

    expect(store.canonicalInvoices.size).toBe(2);
  });

  it("does not merge invoices that share buyer and number but come from different seller entities", async () => {
    const store = new InMemoryCanonicalInvoicePersistenceStore([makeBillingAccountMatch()]);
    const service = createImportedInvoiceSyncService({
      store,
      now: () => "2026-03-30T10:00:00.000Z",
      idGenerator: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })(),
    });

    await service.syncBusinessCentralInvoices({
      tenantId: "default",
      invoices: [makeBusinessCentralInvoice({ externalId: "bc-1", companyId: "company-1" })],
    });

    await service.syncBusinessCentralInvoices({
      tenantId: "default",
      invoices: [makeBusinessCentralInvoice({ externalId: "bc-2", companyId: "company-2" })],
    });

    expect(store.canonicalInvoices.size).toBe(2);
  });

  it("marks malformed imports as held_invalid and avoids canonical writes", async () => {
    const store = new InMemoryCanonicalInvoicePersistenceStore([makeBillingAccountMatch()]);
    const service = createImportedInvoiceSyncService({
      store,
      now: () => "2026-03-30T10:00:00.000Z",
    });

    const result = await service.syncBusinessCentralInvoices({
      tenantId: "default",
      invoices: [
        makeBusinessCentralInvoice({
          remainingAmountCents: 2000000,
        }),
      ],
    });

    expect(result.heldInvalidCount).toBe(1);
    expect(result.pendingAccountMappingCount).toBe(0);
    expect(result.snapshots[0]?.canonicalizationStatus).toBe("held_invalid");
    expect(result.snapshots[0]?.holdReason).toBe("invalid_open_amount");
    expect(store.canonicalInvoices.size).toBe(0);
  });

  it("stores Odoo imports under the Odoo source provider and still canonicalizes safely", async () => {
    const store = new InMemoryCanonicalInvoicePersistenceStore([makeBillingAccountMatch()]);
    const service = createImportedInvoiceSyncService({
      store,
      now: () => "2026-03-30T10:00:00.000Z",
      idGenerator: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })(),
    });

    const result = await service.syncOdooInvoices({
      tenantId: "default",
      invoices: [makeOdooInvoice()],
    });

    expect(result.provider).toBe("odoo");
    expect(result.canonicalUpsertedCount).toBe(1);
    expect(result.snapshots[0]?.sourceProvider).toBe("odoo");
    expect(result.snapshots[0]?.canonicalizationStatus).toBe("canonical_upserted");
  });

  it("normalizes QuickBooks imports into the existing hierarchy and preserves the branch", async () => {
    const store = new InMemoryCanonicalInvoicePersistenceStore([makeBillingAccountMatch()]);
    const service = createImportedInvoiceSyncService({
      store,
      now: () => "2026-03-30T10:00:00.000Z",
      idGenerator: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })(),
    });

    const result = await service.syncQuickBooksInvoices({
      tenantId: "default",
      invoices: [makeQuickBooksInvoice()],
    });

    expect(result.provider).toBe("quickbooks_online");
    expect(result.canonicalUpsertedCount).toBe(1);
    expect([...store.canonicalInvoices.values()][0]?.branchId).toBe("branch-1");
  });

  it("holds imports when the provider branch hint conflicts with the normalized billing hierarchy", async () => {
    const store = new InMemoryCanonicalInvoicePersistenceStore([makeBillingAccountMatch()]);
    const service = createImportedInvoiceSyncService({
      store,
      now: () => "2026-03-30T10:00:00.000Z",
    });

    const result = await service.syncQuickBooksInvoices({
      tenantId: "default",
      invoices: [makeQuickBooksInvoice({ branchReference: "BR-999" })],
    });

    expect(result.pendingAccountMappingCount).toBe(1);
    expect(result.snapshots[0]?.holdReason).toBe("branch_mismatch");
    expect(store.canonicalInvoices.size).toBe(0);
  });

  it("stores Xero imports under the Xero source provider and skips unchanged records idempotently", async () => {
    const store = new InMemoryCanonicalInvoicePersistenceStore([makeBillingAccountMatch()]);
    const service = createImportedInvoiceSyncService({
      store,
      now: () => "2026-03-30T10:00:00.000Z",
      idGenerator: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })(),
    });

    const first = await service.syncXeroInvoices({
      tenantId: "default",
      invoices: [makeXeroInvoice()],
    });
    const second = await service.syncXeroInvoices({
      tenantId: "default",
      invoices: [makeXeroInvoice()],
    });

    expect(first.provider).toBe("xero");
    expect(first.canonicalUpsertedCount).toBe(1);
    expect(second.skippedCount).toBe(1);
    expect(second.snapshots[0]?.metadata.syncDisposition).toBe("idempotent_skip");
    expect(store.canonicalInvoices.size).toBe(1);
  });

  it("routes spreadsheet uploads through the same canonical invoice snapshot flow", async () => {
    const store = new InMemoryCanonicalInvoicePersistenceStore([makeBillingAccountMatch()]);
    const service = createImportedInvoiceSyncService({
      store,
      now: () => "2026-03-30T10:00:00.000Z",
      idGenerator: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })(),
    });

    const result = await service.syncSpreadsheetInvoices({
      tenantId: "default",
      invoices: [
        {
          externalId: "spreadsheet_upload:upload-1:2",
          invoiceNumber: "CSV-1001",
          customerName: "Acme Billing",
          customerNumber: "BA-1001",
          currencyCode: "PHP",
          totalAmountCents: 950000,
          remainingAmountCents: 950000,
          status: "open",
          invoiceDate: "2026-03-20",
          dueDate: "2026-04-20",
          branchName: "Acme Branch 1",
        },
      ],
    });

    expect(result.provider).toBe("spreadsheet_upload");
    expect(result.canonicalUpsertedCount).toBe(1);
    expect(result.snapshots[0]?.sourceKind).toBe("spreadsheet");
    expect(result.snapshots[0]?.canonicalizationStatus).toBe("canonical_upserted");
    expect([...store.canonicalInvoices.values()][0]).toEqual(
      expect.objectContaining({
        invoiceNumber: "CSV-1001",
        billingAccountId: "billing-1",
        branchId: "branch-1",
        invoiceDate: "2026-03-20",
      })
    );
  });
});
