import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { InMemoryAuditLogger, type AuditContext, type AuditLogger } from "@o2c/audit";
import { loadEnv } from "@o2c/config";
import type { CustomerInvoice } from "@o2c/domain";
import { createEntityMetadata, evolveEntityMetadata } from "@o2c/domain";
import type { BusinessCentralInvoiceRecord } from "../integrations/business-central.js";
import type { OdooInvoiceRecord } from "../integrations/odoo.js";
import type { QuickBooksInvoiceRecord } from "../integrations/quickbooks.js";
import type { SapBusinessOneInvoiceRecord } from "../integrations/sap-business-one.js";
import type { XeroInvoiceRecord } from "../integrations/xero.js";

export type ImportedInvoiceSourceProvider =
  | "business_central"
  | "odoo"
  | "quickbooks_online"
  | "sap_business_one"
  | "xero"
  | "spreadsheet_upload";

export type ImportedInvoiceSourceKind = "accounting" | "spreadsheet";

export interface ImportedInvoiceSourceRecord {
  externalId: string;
  invoiceNumber: string;
  customerName: string;
  customerNumber?: string;
  contactName?: string;
  email?: string;
  currencyCode: string;
  totalAmountCents: number;
  remainingAmountCents: number;
  dueDate?: string;
  invoiceDate?: string;
  status: string;
  companyId?: string;
  companyName?: string;
  parentAccountName?: string;
  parentAccountReference?: string;
  branchName?: string;
  branchReference?: string;
}

export interface SpreadsheetImportedInvoiceRecord extends ImportedInvoiceSourceRecord {}

export type ImportedInvoiceCanonicalizationStatus =
  | "canonical_upserted"
  | "pending_account_mapping"
  | "held_invalid";

const invalidImportHoldReasons = new Set([
  "missing_external_id",
  "missing_invoice_number",
  "invalid_amount",
  "invalid_open_amount",
  "missing_currency",
]);

export interface ImportedInvoiceSnapshotRecord {
  id: string;
  tenantId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdByActorId?: string;
  createdByActorRole?: string;
  updatedByActorId?: string;
  updatedByActorRole?: string;
  sourceProvider: ImportedInvoiceSourceProvider;
  sourceKind: ImportedInvoiceSourceKind;
  externalId: string;
  companyId?: string;
  customerName: string;
  customerReference?: string;
  invoiceNumber: string;
  currency: string;
  totalAmountCents: number;
  openAmountCents: number;
  sourceStatus: string;
  issuedAt?: string;
  dueDate?: string;
  lastImportedAt: string;
  canonicalInvoiceId?: string;
  canonicalizationStatus: ImportedInvoiceCanonicalizationStatus;
  holdReason?: string;
  fingerprint: string;
  metadata: Record<string, unknown>;
}

export interface BillingAccountMatch {
  id: string;
  tenantId: string;
  parentAccountId: string;
  parentAccountName?: string;
  parentAccountReference?: string;
  branchId?: string;
  branchCode?: string;
  branchName?: string;
  accountNumber: string;
  displayName: string;
  currency: string;
  accountTier: "standard" | "strategic";
  erpCustomerId?: string;
}

export interface CanonicalInvoicePersistenceStore {
  listActiveBillingAccounts(tenantId: string): Promise<BillingAccountMatch[]>;
  findImportedInvoiceSnapshot(
    tenantId: string,
    provider: ImportedInvoiceSourceProvider,
    externalId: string,
  ): Promise<ImportedInvoiceSnapshotRecord | undefined>;
  findCanonicalInvoiceByIdentityKey(
    tenantId: string,
    canonicalIdentityKey: string,
  ): Promise<CustomerInvoice | undefined>;
  upsertImportedInvoiceSnapshot(record: ImportedInvoiceSnapshotRecord): Promise<void>;
  upsertCanonicalInvoice(invoice: CustomerInvoice): Promise<void>;
}

export interface ImportedInvoiceSyncResult {
  provider: ImportedInvoiceSourceProvider;
  importedCount: number;
  skippedCount: number;
  canonicalUpsertedCount: number;
  pendingAccountMappingCount: number;
  heldInvalidCount: number;
  snapshots: ImportedInvoiceSnapshotRecord[];
}

export function createImportedInvoiceSyncService(input?: {
  store?: CanonicalInvoicePersistenceStore;
  auditLogger?: AuditLogger;
  now?: () => string;
  idGenerator?: () => string;
}) {
  const store = input?.store ?? new PostgresCanonicalInvoicePersistenceStore(loadEnv().DATABASE_URL);
  const auditLogger = input?.auditLogger ?? new InMemoryAuditLogger();
  const now = input?.now ?? (() => new Date().toISOString());
  const idGenerator = input?.idGenerator ?? (() => randomUUID());

  return {
    async syncBusinessCentralInvoices(params: {
      tenantId: string;
      invoices: BusinessCentralInvoiceRecord[];
      auditContext?: AuditContext;
    }): Promise<ImportedInvoiceSyncResult> {
      return syncImportedInvoices({
        provider: "business_central",
        sourceKind: "accounting",
        tenantId: params.tenantId,
        invoices: params.invoices,
        store,
        auditLogger,
        now,
        idGenerator,
        ...(params.auditContext ? { auditContext: params.auditContext } : {}),
      });
    },

    async syncOdooInvoices(params: {
      tenantId: string;
      invoices: OdooInvoiceRecord[];
      auditContext?: AuditContext;
    }): Promise<ImportedInvoiceSyncResult> {
      return syncImportedInvoices({
        provider: "odoo",
        sourceKind: "accounting",
        tenantId: params.tenantId,
        invoices: params.invoices,
        store,
        auditLogger,
        now,
        idGenerator,
        ...(params.auditContext ? { auditContext: params.auditContext } : {}),
      });
    },

    async syncQuickBooksInvoices(params: {
      tenantId: string;
      invoices: QuickBooksInvoiceRecord[];
      auditContext?: AuditContext;
    }): Promise<ImportedInvoiceSyncResult> {
      return syncImportedInvoices({
        provider: "quickbooks_online",
        sourceKind: "accounting",
        tenantId: params.tenantId,
        invoices: params.invoices,
        store,
        auditLogger,
        now,
        idGenerator,
        ...(params.auditContext ? { auditContext: params.auditContext } : {}),
      });
    },

    async syncSapBusinessOneInvoices(params: {
      tenantId: string;
      invoices: SapBusinessOneInvoiceRecord[];
      auditContext?: AuditContext;
    }): Promise<ImportedInvoiceSyncResult> {
      return syncImportedInvoices({
        provider: "sap_business_one",
        sourceKind: "accounting",
        tenantId: params.tenantId,
        invoices: params.invoices,
        store,
        auditLogger,
        now,
        idGenerator,
        ...(params.auditContext ? { auditContext: params.auditContext } : {}),
      });
    },

    async syncXeroInvoices(params: {
      tenantId: string;
      invoices: XeroInvoiceRecord[];
      auditContext?: AuditContext;
    }): Promise<ImportedInvoiceSyncResult> {
      return syncImportedInvoices({
        provider: "xero",
        sourceKind: "accounting",
        tenantId: params.tenantId,
        invoices: params.invoices,
        store,
        auditLogger,
        now,
        idGenerator,
        ...(params.auditContext ? { auditContext: params.auditContext } : {}),
      });
    },

    async syncSpreadsheetInvoices(params: {
      tenantId: string;
      invoices: SpreadsheetImportedInvoiceRecord[];
      auditContext?: AuditContext;
    }): Promise<ImportedInvoiceSyncResult> {
      return syncImportedInvoices({
        provider: "spreadsheet_upload",
        sourceKind: "spreadsheet",
        tenantId: params.tenantId,
        invoices: params.invoices,
        store,
        auditLogger,
        now,
        idGenerator,
        ...(params.auditContext ? { auditContext: params.auditContext } : {}),
      });
    },
  };
}

async function syncImportedInvoices(input: {
  provider: ImportedInvoiceSourceProvider;
  sourceKind: ImportedInvoiceSourceKind;
  tenantId: string;
  invoices: ImportedInvoiceSourceRecord[];
  store: CanonicalInvoicePersistenceStore;
  auditLogger: AuditLogger;
  auditContext?: AuditContext;
  now: () => string;
  idGenerator: () => string;
}): Promise<ImportedInvoiceSyncResult> {
  const billingAccounts = await input.store.listActiveBillingAccounts(input.tenantId);
  const snapshots: ImportedInvoiceSnapshotRecord[] = [];
  let skippedCount = 0;

  for (const importedInvoice of input.invoices) {
    const snapshot = await persistImportedInvoice({
      provider: input.provider,
      sourceKind: input.sourceKind,
      importedInvoice,
      tenantId: input.tenantId,
      billingAccounts,
      store: input.store,
      auditLogger: input.auditLogger,
      now: input.now,
      idGenerator: input.idGenerator,
      ...(input.auditContext ? { auditContext: input.auditContext } : {}),
    });

    if (snapshot.metadata.syncDisposition === "idempotent_skip") {
      skippedCount += 1;
    }
    snapshots.push(snapshot);
  }

  return {
    provider: input.provider,
    importedCount: snapshots.length,
    skippedCount,
    canonicalUpsertedCount: snapshots.filter(
      (snapshot) =>
        snapshot.canonicalizationStatus === "canonical_upserted" &&
        snapshot.metadata.syncDisposition !== "idempotent_skip",
    ).length,
    pendingAccountMappingCount: snapshots.filter(
      (snapshot) => snapshot.canonicalizationStatus === "pending_account_mapping",
    ).length,
    heldInvalidCount: snapshots.filter(
      (snapshot) => snapshot.canonicalizationStatus === "held_invalid",
    ).length,
    snapshots,
  };
}

async function persistImportedInvoice(input: {
  provider: ImportedInvoiceSourceProvider;
  sourceKind: ImportedInvoiceSourceKind;
  importedInvoice: ImportedInvoiceSourceRecord;
  tenantId: string;
  billingAccounts: BillingAccountMatch[];
  store: CanonicalInvoicePersistenceStore;
  auditLogger: AuditLogger;
  auditContext?: AuditContext;
  now: () => string;
  idGenerator: () => string;
}): Promise<ImportedInvoiceSnapshotRecord> {
  const importedAt = input.now();
  const validationError = validateImportedInvoice(input.importedInvoice);
  const existingSnapshot = await input.store.findImportedInvoiceSnapshot(
    input.tenantId,
    input.provider,
    input.importedInvoice.externalId,
  );
  const snapshotFingerprint = createImportedInvoiceFingerprint(input.importedInvoice);
  if (
    existingSnapshot &&
    existingSnapshot.fingerprint === snapshotFingerprint &&
    existingSnapshot.canonicalizationStatus === "canonical_upserted"
  ) {
    return {
      ...existingSnapshot,
      metadata: {
        ...existingSnapshot.metadata,
        syncDisposition: "idempotent_skip",
      },
    };
  }

  const candidateMatches = matchBillingAccounts(input.importedInvoice, input.billingAccounts);
  const resolvedHierarchy =
    !validationError
      ? normalizeImportedHierarchy(input.importedInvoice, candidateMatches)
      : undefined;
  const holdReason =
    validationError ??
    resolveHoldReason({
      matches: candidateMatches,
      importedInvoice: input.importedInvoice,
      ...(resolvedHierarchy ? { resolvedHierarchy } : {}),
    });

  let canonicalInvoice: CustomerInvoice | undefined;
  if (!holdReason && resolvedHierarchy) {
    const canonicalIdentityKey = createCanonicalInvoiceIdentityKey({
      sellerEntityId: input.importedInvoice.companyId ?? resolvedHierarchy.parentAccountId,
      billingAccountId: resolvedHierarchy.billingAccountId,
      invoiceNumber: input.importedInvoice.invoiceNumber,
      invoiceDate: input.importedInvoice.invoiceDate,
      amountCents: input.importedInvoice.totalAmountCents,
    });
    const existingCanonicalInvoice =
      await input.store.findCanonicalInvoiceByIdentityKey(
        input.tenantId,
        canonicalIdentityKey,
      );

    canonicalInvoice = buildCanonicalInvoice({
      provider: input.provider,
      importedInvoice: input.importedInvoice,
      tenantId: input.tenantId,
      hierarchy: resolvedHierarchy,
      importedAt,
      idGenerator: input.idGenerator,
      ...(existingCanonicalInvoice ? { existing: existingCanonicalInvoice } : {}),
    });

    await input.store.upsertCanonicalInvoice(canonicalInvoice);
  }

  const snapshot = buildSnapshotRecord({
    provider: input.provider,
    sourceKind: input.sourceKind,
    importedInvoice: input.importedInvoice,
    tenantId: input.tenantId,
    importedAt,
    idGenerator: input.idGenerator,
    ...(resolvedHierarchy
      ? {
          hierarchy: {
            parentAccountId: resolvedHierarchy.parentAccountId,
            billingAccountId: resolvedHierarchy.billingAccountId,
            ...(resolvedHierarchy.branchId ? { branchId: resolvedHierarchy.branchId } : {}),
          },
        }
      : {}),
    ...(canonicalInvoice?.id ? { canonicalInvoiceId: canonicalInvoice.id } : {}),
    ...(holdReason ? { holdReason } : {}),
  });

  await input.store.upsertImportedInvoiceSnapshot(snapshot);

  if (input.auditContext) {
    await input.auditLogger.log(input.auditContext, {
      action: canonicalInvoice ? "integration.invoice_canonicalized" : "integration.invoice_snapshot_stored",
      entityType: canonicalInvoice ? "invoice" : "imported_invoice_snapshot",
      entityId: canonicalInvoice?.id ?? snapshot.id,
      metadata: {
        provider: snapshot.sourceProvider,
        invoiceNumber: snapshot.invoiceNumber,
        status: snapshot.canonicalizationStatus,
        ...(snapshot.holdReason ? { holdReason: snapshot.holdReason } : {}),
      },
    });
  }

  return snapshot;
}

function buildCanonicalInvoice(input: {
  provider: ImportedInvoiceSourceProvider;
  importedInvoice: ImportedInvoiceSourceRecord;
  tenantId: string;
  hierarchy: NormalizedHierarchyMatch;
  existing?: CustomerInvoice;
  importedAt: string;
  idGenerator: () => string;
}): CustomerInvoice {
  const nextImportedState = mapImportedStatusToCanonicalState(input.importedInvoice.status);
  const state = input.existing
    ? mergeCanonicalInvoiceState(input.existing.state, nextImportedState)
    : nextImportedState;
  const canonicalIdentityKey = createCanonicalInvoiceIdentityKey({
    sellerEntityId:
      input.importedInvoice.companyId ?? input.existing?.sellerEntityId ?? input.hierarchy.parentAccountId,
    billingAccountId: input.hierarchy.billingAccountId,
    invoiceNumber: input.importedInvoice.invoiceNumber,
    invoiceDate: input.importedInvoice.invoiceDate ?? input.existing?.invoiceDate,
    amountCents: input.importedInvoice.totalAmountCents,
  });
  const metadata = {
    ...(input.existing?.metadata ?? {}),
    canonicalIdentityKey,
    importProvider: input.provider,
    externalId: input.importedInvoice.externalId,
    sourceStatus: input.importedInvoice.status,
    openAmountCents: input.importedInvoice.remainingAmountCents,
    lastImportedAt: input.importedAt,
    companyId: input.importedInvoice.companyId,
    ...(input.importedInvoice.companyName ? { companyName: input.importedInvoice.companyName } : {}),
    ...(input.importedInvoice.customerNumber
      ? { customerReference: input.importedInvoice.customerNumber }
      : {}),
  };

  if (!input.existing) {
    return {
      id: input.idGenerator(),
      ...createEntityMetadata({
        at: input.importedAt,
        tenantId: input.tenantId,
        actorId: "invoice_import_sync",
        actorRole: "system",
      }),
      ...(input.importedInvoice.companyId ? { sellerEntityId: input.importedInvoice.companyId } : {}),
      parentAccountId: input.hierarchy.parentAccountId,
      billingAccountId: input.hierarchy.billingAccountId,
      ...(input.hierarchy.branchId ? { branchId: input.hierarchy.branchId } : {}),
      ...(input.importedInvoice.invoiceDate ? { invoiceDate: input.importedInvoice.invoiceDate } : {}),
      invoiceNumber: input.importedInvoice.invoiceNumber,
      currency: input.importedInvoice.currencyCode,
      amountCents: input.importedInvoice.totalAmountCents,
      state,
      ...(input.importedInvoice.dueDate ? { dueDate: input.importedInvoice.dueDate } : {}),
      metadata,
    };
  }

  return {
    ...input.existing,
    ...evolveEntityMetadata(input.existing, {
      at: input.importedAt,
      actorId: "invoice_import_sync",
      actorRole: "system",
    }),
    parentAccountId: input.hierarchy.parentAccountId,
    billingAccountId: input.hierarchy.billingAccountId,
    ...(input.importedInvoice.companyId ?? input.existing.sellerEntityId
      ? { sellerEntityId: input.importedInvoice.companyId ?? input.existing.sellerEntityId }
      : {}),
    ...(input.existing.branchId ?? input.hierarchy.branchId
      ? { branchId: input.existing.branchId ?? input.hierarchy.branchId }
      : {}),
    ...(input.importedInvoice.invoiceDate ?? input.existing.invoiceDate
      ? { invoiceDate: input.importedInvoice.invoiceDate ?? input.existing.invoiceDate }
      : {}),
    invoiceNumber: input.importedInvoice.invoiceNumber,
    currency: input.importedInvoice.currencyCode,
    amountCents: input.importedInvoice.totalAmountCents,
    ...(input.importedInvoice.dueDate ?? input.existing.dueDate
      ? { dueDate: input.importedInvoice.dueDate ?? input.existing.dueDate }
      : {}),
    state,
    metadata,
  };
}

function buildSnapshotRecord(input: {
  provider: ImportedInvoiceSourceProvider;
  sourceKind: ImportedInvoiceSourceKind;
  importedInvoice: ImportedInvoiceSourceRecord;
  tenantId: string;
  importedAt: string;
  hierarchy?: {
    parentAccountId: string;
    billingAccountId: string;
    branchId?: string;
  };
  canonicalInvoiceId?: string;
  holdReason?: string;
  idGenerator: () => string;
}): ImportedInvoiceSnapshotRecord {
  const metadata = createEntityMetadata({
    at: input.importedAt,
    tenantId: input.tenantId,
    actorId: "invoice_import_sync",
    actorRole: "system",
  });
  return {
    id: input.idGenerator(),
    ...metadata,
    sourceProvider: input.provider,
    sourceKind: input.sourceKind,
    externalId: input.importedInvoice.externalId,
    ...(input.importedInvoice.companyId ? { companyId: input.importedInvoice.companyId } : {}),
    customerName: input.importedInvoice.customerName,
    ...(input.importedInvoice.customerNumber
      ? { customerReference: input.importedInvoice.customerNumber }
      : {}),
    invoiceNumber: input.importedInvoice.invoiceNumber,
    currency: input.importedInvoice.currencyCode,
    totalAmountCents: input.importedInvoice.totalAmountCents,
    openAmountCents: input.importedInvoice.remainingAmountCents,
    sourceStatus: input.importedInvoice.status,
    ...(input.importedInvoice.invoiceDate ? { issuedAt: input.importedInvoice.invoiceDate } : {}),
    ...(input.importedInvoice.dueDate ? { dueDate: input.importedInvoice.dueDate } : {}),
    lastImportedAt: input.importedAt,
    ...(input.canonicalInvoiceId ? { canonicalInvoiceId: input.canonicalInvoiceId } : {}),
    canonicalizationStatus: input.holdReason
      ? invalidImportHoldReasons.has(input.holdReason)
        ? "held_invalid"
        : "pending_account_mapping"
      : "canonical_upserted",
    ...(input.holdReason ? { holdReason: input.holdReason } : {}),
    fingerprint: createImportedInvoiceFingerprint(input.importedInvoice),
    metadata: {
      companyId: input.importedInvoice.companyId,
      ...(input.importedInvoice.companyName ? { companyName: input.importedInvoice.companyName } : {}),
      ...(input.importedInvoice.parentAccountName
        ? { parentAccountName: input.importedInvoice.parentAccountName }
        : {}),
      ...(input.importedInvoice.parentAccountReference
        ? { parentAccountReference: input.importedInvoice.parentAccountReference }
        : {}),
      ...(input.importedInvoice.branchName ? { branchName: input.importedInvoice.branchName } : {}),
      ...(input.importedInvoice.branchReference
        ? { branchReference: input.importedInvoice.branchReference }
        : {}),
      ...(input.importedInvoice.contactName ? { contactName: input.importedInvoice.contactName } : {}),
      ...(input.importedInvoice.email ? { email: input.importedInvoice.email } : {}),
      ...(input.hierarchy
        ? {
            normalizedHierarchy: input.hierarchy,
          }
        : {}),
    },
  };
}

function createImportedInvoiceFingerprint(invoice: ImportedInvoiceSourceRecord) {
  return [
    invoice.externalId,
    invoice.invoiceNumber,
    invoice.currencyCode,
    invoice.totalAmountCents,
    invoice.remainingAmountCents,
    invoice.status,
    invoice.invoiceDate ?? "",
    invoice.dueDate ?? "",
  ].join(":");
}

function createCanonicalInvoiceIdentityKey(input: {
  sellerEntityId: string;
  billingAccountId: string;
  invoiceNumber: string;
  invoiceDate: string | undefined;
  amountCents: number;
}) {
  // Keep canonical identity aligned with the spec so invoice matching never relies
  // on invoice number alone during imports or later reconciliation.
  return [
    input.sellerEntityId,
    input.billingAccountId,
    input.invoiceNumber.trim(),
    input.invoiceDate?.trim() ?? "",
    String(input.amountCents),
  ].join(":");
}

function validateImportedInvoice(invoice: ImportedInvoiceSourceRecord) {
  if (!invoice.externalId.trim()) {
    return "missing_external_id";
  }
  if (!invoice.invoiceNumber.trim()) {
    return "missing_invoice_number";
  }
  if (invoice.totalAmountCents <= 0) {
    return "invalid_amount";
  }
  if (
    invoice.remainingAmountCents < 0 ||
    invoice.remainingAmountCents > invoice.totalAmountCents
  ) {
    return "invalid_open_amount";
  }
  if (!invoice.currencyCode.trim()) {
    return "missing_currency";
  }
  return undefined;
}

function resolveHoldReason(input: {
  matches: BillingAccountMatch[];
  importedInvoice: ImportedInvoiceSourceRecord;
  resolvedHierarchy?: NormalizedHierarchyMatch;
}) {
  if (input.matches.length === 0) {
    return "unmapped_billing_account";
  }
  if (input.matches.length > 1) {
    return "ambiguous_billing_account";
  }
  if (
    input.resolvedHierarchy &&
    input.resolvedHierarchy.currency !== input.importedInvoice.currencyCode
  ) {
    return "currency_mismatch";
  }
  if (hasBranchHint(input.importedInvoice) && !input.resolvedHierarchy?.branchId) {
    return "branch_mismatch";
  }
  return undefined;
}

function matchBillingAccounts(
  invoice: ImportedInvoiceSourceRecord,
  billingAccounts: BillingAccountMatch[],
) {
  const reference = invoice.customerNumber?.trim();
  const normalizedCustomerName = normalizeLookupValue(invoice.customerName);

  const exactErpMatches = reference
    ? billingAccounts.filter(
        (billingAccount) => billingAccount.erpCustomerId?.trim() === reference,
      )
    : [];
  if (exactErpMatches.length > 0) {
    return exactErpMatches;
  }

  const accountNumberMatches = reference
    ? billingAccounts.filter(
        (billingAccount) => billingAccount.accountNumber.trim() === reference,
      )
    : [];
  if (accountNumberMatches.length > 0) {
    return accountNumberMatches;
  }

  return billingAccounts.filter(
    (billingAccount) => normalizeLookupValue(billingAccount.displayName) === normalizedCustomerName,
  );
}

interface NormalizedHierarchyMatch {
  parentAccountId: string;
  billingAccountId: string;
  branchId?: string;
  currency: string;
}

function normalizeImportedHierarchy(
  invoice: ImportedInvoiceSourceRecord,
  candidateMatches: BillingAccountMatch[],
): NormalizedHierarchyMatch | undefined {
  if (candidateMatches.length !== 1) {
    return undefined;
  }

  const [match] = candidateMatches;
  if (!match) {
    return undefined;
  }

  if (!hasBranchHint(invoice)) {
    return {
      parentAccountId: match.parentAccountId,
      billingAccountId: match.id,
      ...(match.branchId ? { branchId: match.branchId } : {}),
      currency: match.currency,
    };
  }

  if (
    matchesHierarchyHint(invoice.branchReference, match.branchCode) ||
    matchesHierarchyHint(invoice.branchName, match.branchName)
  ) {
    return {
      parentAccountId: match.parentAccountId,
      billingAccountId: match.id,
      ...(match.branchId ? { branchId: match.branchId } : {}),
      currency: match.currency,
    };
  }

  return {
    parentAccountId: match.parentAccountId,
    billingAccountId: match.id,
    currency: match.currency,
  };
}

function hasBranchHint(invoice: ImportedInvoiceSourceRecord) {
  return Boolean(invoice.branchName?.trim() || invoice.branchReference?.trim());
}

function matchesHierarchyHint(left: string | undefined, right: string | undefined) {
  return Boolean(left && right && normalizeLookupValue(left) === normalizeLookupValue(right));
}

function normalizeLookupValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function mapImportedStatusToCanonicalState(sourceStatus: string): CustomerInvoice["state"] {
  switch (sourceStatus) {
    case "paid":
      return "paid";
    case "partial":
    case "partially_paid":
      return "partially_paid";
    case "disputed":
      return "disputed_full";
    case "voided":
      return "voided";
    default:
      return "synced_open";
  }
}

function mergeCanonicalInvoiceState(
  existingState: CustomerInvoice["state"],
  importedState: CustomerInvoice["state"],
): CustomerInvoice["state"] {
  if (existingState === "paid" || existingState === "voided") {
    return existingState;
  }
  if (existingState === "disputed_full" || existingState === "disputed_partial") {
    return existingState;
  }
  if (existingState === "writeback_pending" || existingState === "writeback_failed") {
    return existingState;
  }
  if (existingState === "credit_pending") {
    return existingState;
  }
  return importedState;
}

export class InMemoryCanonicalInvoicePersistenceStore
  implements CanonicalInvoicePersistenceStore
{
  readonly billingAccounts: BillingAccountMatch[];
  readonly snapshots = new Map<string, ImportedInvoiceSnapshotRecord>();
  readonly canonicalInvoices = new Map<string, CustomerInvoice>();

  constructor(billingAccounts: BillingAccountMatch[] = []) {
    this.billingAccounts = billingAccounts;
  }

  async listActiveBillingAccounts(): Promise<BillingAccountMatch[]> {
    return [...this.billingAccounts];
  }

  async findImportedInvoiceSnapshot(
    tenantId: string,
    provider: ImportedInvoiceSourceProvider,
    externalId: string,
  ): Promise<ImportedInvoiceSnapshotRecord | undefined> {
    return this.snapshots.get(`${tenantId}:${provider}:${externalId}`);
  }

  async findCanonicalInvoiceByIdentityKey(
    _tenantId: string,
    canonicalIdentityKey: string,
  ): Promise<CustomerInvoice | undefined> {
    return [...this.canonicalInvoices.values()].find(
      (invoice) => readCanonicalInvoiceIdentityKey(invoice) === canonicalIdentityKey,
    );
  }

  async upsertImportedInvoiceSnapshot(record: ImportedInvoiceSnapshotRecord): Promise<void> {
    this.snapshots.set(`${record.tenantId}:${record.sourceProvider}:${record.externalId}`, record);
  }

  async upsertCanonicalInvoice(invoice: CustomerInvoice): Promise<void> {
    this.canonicalInvoices.set(invoice.id, invoice);
  }
}

class PostgresCanonicalInvoicePersistenceStore
  implements CanonicalInvoicePersistenceStore
{
  constructor(private readonly databaseUrl: string) {}

  async listActiveBillingAccounts(tenantId: string): Promise<BillingAccountMatch[]> {
    const rows = queryJsonRows(this.databaseUrl, `
      SELECT row_to_json(q)
      FROM (
        SELECT
          billing_account.id,
          billing_account.tenant_id AS "tenantId",
          billing_account.parent_account_id AS "parentAccountId",
          parent_account.name AS "parentAccountName",
          parent_account.external_reference AS "parentAccountReference",
          billing_account.branch_id AS "branchId",
          branch.code AS "branchCode",
          branch.name AS "branchName",
          billing_account.account_number AS "accountNumber",
          billing_account.display_name AS "displayName",
          billing_account.currency,
          'standard'::text AS "accountTier",
          billing_account.erp_customer_id AS "erpCustomerId"
        FROM billing_account
        LEFT JOIN parent_account
          ON parent_account.id = billing_account.parent_account_id
        LEFT JOIN branch
          ON branch.id = billing_account.branch_id
        WHERE billing_account.tenant_id = '${quoteLiteral(tenantId)}'
          AND billing_account.deleted_at IS NULL
          AND billing_account.status = 'active'
      ) q;
    `);

    return rows as BillingAccountMatch[];
  }

  async findImportedInvoiceSnapshot(
    tenantId: string,
    provider: ImportedInvoiceSourceProvider,
    externalId: string,
  ): Promise<ImportedInvoiceSnapshotRecord | undefined> {
    const [row] = queryJsonRows(this.databaseUrl, `
      SELECT row_to_json(q)
      FROM (
        SELECT
          id,
          tenant_id AS "tenantId",
          version,
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          created_by_actor_id AS "createdByActorId",
          created_by_actor_role AS "createdByActorRole",
          updated_by_actor_id AS "updatedByActorId",
          updated_by_actor_role AS "updatedByActorRole",
          source_provider AS "sourceProvider",
          source_kind AS "sourceKind",
          external_id AS "externalId",
          company_id AS "companyId",
          customer_name AS "customerName",
          customer_reference AS "customerReference",
          invoice_number AS "invoiceNumber",
          currency,
          total_amount_cents::bigint AS "totalAmountCents",
          open_amount_cents::bigint AS "openAmountCents",
          source_status AS "sourceStatus",
          issued_at AS "issuedAt",
          due_date AS "dueDate",
          last_imported_at AS "lastImportedAt",
          canonical_invoice_id AS "canonicalInvoiceId",
          canonicalization_status AS "canonicalizationStatus",
          hold_reason AS "holdReason",
          fingerprint,
          metadata
        FROM imported_invoice_snapshot
        WHERE tenant_id = '${quoteLiteral(tenantId)}'
          AND source_provider = '${quoteLiteral(provider)}'
          AND external_id = '${quoteLiteral(externalId)}'
        LIMIT 1
      ) q;
    `);

    return row as ImportedInvoiceSnapshotRecord | undefined;
  }

  async findCanonicalInvoiceByIdentityKey(
    tenantId: string,
    canonicalIdentityKey: string,
  ): Promise<CustomerInvoice | undefined> {
    const [row] = queryJsonRows(this.databaseUrl, `
      SELECT row_to_json(q)
      FROM (
        SELECT
          id,
          tenant_id AS "tenantId",
          version,
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          deleted_at AS "deletedAt",
          created_by_actor_id AS "createdByActorId",
          created_by_actor_role AS "createdByActorRole",
          updated_by_actor_id AS "updatedByActorId",
          updated_by_actor_role AS "updatedByActorRole",
          seller_entity_id AS "sellerEntityId",
          parent_account_id AS "parentAccountId",
          billing_account_id AS "billingAccountId",
          NULLIF(metadata->>'branchId', '') AS "branchId",
          invoice_number AS "invoiceNumber",
          currency,
          amount_cents::bigint AS "amountCents",
          state,
          NULLIF(metadata->>'invoiceDate', '') AS "invoiceDate",
          due_date AS "dueDate",
          metadata
        FROM invoice
        WHERE tenant_id = '${quoteLiteral(tenantId)}'
          AND deleted_at IS NULL
          AND canonical_identity_key = '${quoteLiteral(canonicalIdentityKey)}'
        LIMIT 1
      ) q;
    `);

    return row as CustomerInvoice | undefined;
  }

  async upsertImportedInvoiceSnapshot(record: ImportedInvoiceSnapshotRecord): Promise<void> {
    runPsql(this.databaseUrl, `
      INSERT INTO imported_invoice_snapshot (
        id, tenant_id, version, created_at, updated_at, deleted_at,
        created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
        source_provider, source_kind, external_id, company_id, customer_name, customer_reference,
        invoice_number, currency, total_amount_cents, open_amount_cents, source_status,
        issued_at, due_date, last_imported_at, canonical_invoice_id,
        canonicalization_status, hold_reason, fingerprint, metadata
      ) VALUES (
        '${quoteLiteral(record.id)}',
        '${quoteLiteral(record.tenantId)}',
        ${record.version},
        '${quoteLiteral(record.createdAt)}',
        '${quoteLiteral(record.updatedAt)}',
        NULL,
        ${nullableText(record.createdByActorId)},
        ${nullableText(record.createdByActorRole)},
        ${nullableText(record.updatedByActorId)},
        ${nullableText(record.updatedByActorRole)},
        '${quoteLiteral(record.sourceProvider)}',
        '${quoteLiteral(record.sourceKind)}',
        '${quoteLiteral(record.externalId)}',
        ${nullableText(record.companyId)},
        '${quoteLiteral(record.customerName)}',
        ${nullableText(record.customerReference)},
        '${quoteLiteral(record.invoiceNumber)}',
        '${quoteLiteral(record.currency)}',
        ${record.totalAmountCents},
        ${record.openAmountCents},
        '${quoteLiteral(record.sourceStatus)}',
        ${nullableDate(record.issuedAt)},
        ${nullableDate(record.dueDate)},
        '${quoteLiteral(record.lastImportedAt)}',
        ${nullableUuid(record.canonicalInvoiceId)},
        '${quoteLiteral(record.canonicalizationStatus)}',
        ${nullableText(record.holdReason)},
        '${quoteLiteral(record.fingerprint)}',
        '${quoteLiteral(JSON.stringify(record.metadata))}'::jsonb
      )
      ON CONFLICT (tenant_id, source_provider, external_id)
      DO UPDATE SET
        version = imported_invoice_snapshot.version + 1,
        updated_at = EXCLUDED.updated_at,
        updated_by_actor_id = EXCLUDED.updated_by_actor_id,
        updated_by_actor_role = EXCLUDED.updated_by_actor_role,
        company_id = EXCLUDED.company_id,
        customer_name = EXCLUDED.customer_name,
        customer_reference = EXCLUDED.customer_reference,
        invoice_number = EXCLUDED.invoice_number,
        currency = EXCLUDED.currency,
        total_amount_cents = EXCLUDED.total_amount_cents,
        open_amount_cents = EXCLUDED.open_amount_cents,
        source_status = EXCLUDED.source_status,
        issued_at = EXCLUDED.issued_at,
        due_date = EXCLUDED.due_date,
        last_imported_at = EXCLUDED.last_imported_at,
        canonical_invoice_id = EXCLUDED.canonical_invoice_id,
        canonicalization_status = EXCLUDED.canonicalization_status,
        hold_reason = EXCLUDED.hold_reason,
        fingerprint = EXCLUDED.fingerprint,
        metadata = EXCLUDED.metadata;
    `);
  }

  async upsertCanonicalInvoice(invoice: CustomerInvoice): Promise<void> {
    runPsql(this.databaseUrl, `
      INSERT INTO invoice (
        id, tenant_id, version, created_at, updated_at, deleted_at,
        created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
        seller_entity_id, parent_account_id, billing_account_id, branch_id, invoice_contact_id,
        uploaded_document_id, canonical_identity_key, invoice_date, invoice_number, amount_cents,
        collectible_amount_cents, disputed_amount_cents, currency, due_date, state, metadata
      ) VALUES (
        '${quoteLiteral(invoice.id)}',
        '${quoteLiteral(invoice.tenantId ?? "default")}',
        ${invoice.version ?? 1},
        '${quoteLiteral(invoice.createdAt)}',
        '${quoteLiteral(invoice.updatedAt)}',
        ${nullableTimestamp(invoice.deletedAt)},
        ${nullableText(invoice.createdByActorId)},
        ${nullableText(invoice.createdByActorRole)},
        ${nullableText(invoice.updatedByActorId)},
        ${nullableText(invoice.updatedByActorRole)},
        ${nullableText(invoice.sellerEntityId)},
        '${quoteLiteral(invoice.parentAccountId)}',
        '${quoteLiteral(invoice.billingAccountId)}',
        ${nullableUuid(invoice.branchId)},
        ${nullableUuid(invoice.invoiceContactId)},
        ${nullableUuid(invoice.uploadedDocumentId)},
        '${quoteLiteral(readCanonicalInvoiceIdentityKey(invoice))}',
        ${nullableDate(invoice.invoiceDate)},
        '${quoteLiteral(invoice.invoiceNumber)}',
        ${invoice.amountCents},
        ${readCollectibleAmountCents(invoice)},
        ${readDisputedAmountCents(invoice)},
        '${quoteLiteral(invoice.currency)}',
        ${nullableDate(invoice.dueDate)},
        '${quoteLiteral(invoice.state)}',
        '${quoteLiteral(JSON.stringify({
          ...invoice.metadata,
          canonicalIdentityKey: readCanonicalInvoiceIdentityKey(invoice),
          ...(invoice.branchId ? { branchId: invoice.branchId } : {}),
          ...(invoice.invoiceDate ? { invoiceDate: invoice.invoiceDate } : {}),
        }))}'::jsonb
      )
      ON CONFLICT ON CONSTRAINT invoice_canonical_identity_key_unique
      DO UPDATE SET
        version = invoice.version + 1,
        updated_at = EXCLUDED.updated_at,
        updated_by_actor_id = EXCLUDED.updated_by_actor_id,
        updated_by_actor_role = EXCLUDED.updated_by_actor_role,
        seller_entity_id = EXCLUDED.seller_entity_id,
        parent_account_id = EXCLUDED.parent_account_id,
        billing_account_id = EXCLUDED.billing_account_id,
        branch_id = COALESCE(EXCLUDED.branch_id, invoice.branch_id),
        invoice_contact_id = COALESCE(EXCLUDED.invoice_contact_id, invoice.invoice_contact_id),
        uploaded_document_id = COALESCE(EXCLUDED.uploaded_document_id, invoice.uploaded_document_id),
        canonical_identity_key = EXCLUDED.canonical_identity_key,
        invoice_date = COALESCE(EXCLUDED.invoice_date, invoice.invoice_date),
        invoice_number = EXCLUDED.invoice_number,
        amount_cents = EXCLUDED.amount_cents,
        collectible_amount_cents = EXCLUDED.collectible_amount_cents,
        disputed_amount_cents = EXCLUDED.disputed_amount_cents,
        currency = EXCLUDED.currency,
        due_date = COALESCE(EXCLUDED.due_date, invoice.due_date),
        state = EXCLUDED.state,
        metadata = invoice.metadata || EXCLUDED.metadata;
    `);
  }
}

function readCanonicalInvoiceIdentityKey(invoice: CustomerInvoice) {
  const metadataIdentityKey =
    typeof invoice.metadata.canonicalIdentityKey === "string"
      ? invoice.metadata.canonicalIdentityKey
      : undefined;
  return (
    metadataIdentityKey ??
    createCanonicalInvoiceIdentityKey({
      sellerEntityId: invoice.sellerEntityId ?? invoice.parentAccountId,
      billingAccountId: invoice.billingAccountId,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      amountCents: invoice.amountCents,
    })
  );
}

function readCollectibleAmountCents(invoice: CustomerInvoice) {
  const directValue = invoice.collectibleAmountCents;
  if (typeof directValue === "number" && Number.isInteger(directValue)) {
    return directValue;
  }

  const metadataValue = invoice.metadata.collectibleAmountCents;
  return typeof metadataValue === "number" && Number.isInteger(metadataValue)
    ? metadataValue
    : invoice.amountCents;
}

function readDisputedAmountCents(invoice: CustomerInvoice) {
  const directValue = invoice.disputedAmountCents;
  if (typeof directValue === "number" && Number.isInteger(directValue)) {
    return directValue;
  }

  const metadataValue = invoice.metadata.disputedAmountCents;
  return typeof metadataValue === "number" && Number.isInteger(metadataValue)
    ? metadataValue
    : 0;
}

function queryJsonRows(databaseUrl: string, sql: string): unknown[] {
  const result = spawnSync("psql", [databaseUrl, "-t", "-A", "-c", sql], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || "psql query failed.");
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

function runPsql(databaseUrl: string, sql: string): void {
  const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || "psql command failed.");
  }
}

function nullableText(value?: string) {
  return value ? `'${quoteLiteral(value)}'` : "NULL";
}

function nullableDate(value?: string) {
  return value ? `'${quoteLiteral(value)}'` : "NULL";
}

function nullableTimestamp(value?: string) {
  return value ? `'${quoteLiteral(value)}'` : "NULL";
}

function nullableUuid(value?: string) {
  return value ? `'${quoteLiteral(value)}'` : "NULL";
}

function quoteLiteral(value: string) {
  return value.replaceAll("'", "''");
}
