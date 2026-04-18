import { spawnSync } from "node:child_process";
import { getCollectibleAmountCents, type CustomerInvoice } from "@o2c/domain";
import {
  defaultConnectorCatalog,
  type ErpInvoiceRecord,
  type InvoiceIndexEntry,
  type InvoiceIndexImportMode,
  type InvoiceIndexProvider,
  type InvoiceIndexProviderSummary,
  type InvoiceIndexResponse,
  type InvoiceIndexSourceKind,
  type InvoiceIndexStatus,
  type InvoiceIndexStatusSummary,
} from "@o2c/contracts";
import { buildDemoSeedBundle } from "@o2c/seed";
import type { FastifyInstance } from "fastify";
import {
  getBusinessCentralIntegrationStatus,
  loadBusinessCentralSalesInvoices,
  type BusinessCentralInvoiceRecord,
} from "../integrations/business-central.js";
import {
  getQuickBooksIntegrationStatus,
  loadQuickBooksInvoices,
  type QuickBooksInvoiceRecord,
} from "../integrations/quickbooks.js";
import { loadEnv } from "@o2c/config";

interface PersistedInvoiceSnapshotRow {
  id: string;
  sourceProvider: string;
  sourceKind: InvoiceIndexSourceKind;
  externalId: string;
  canonicalInvoiceId?: string;
  customerName: string;
  customerReference?: string;
  parentAccountId?: string;
  parentAccountName?: string;
  billingAccountId?: string;
  billingAccountName?: string;
  branchId?: string;
  branchName?: string;
  invoiceNumber: string;
  currency: string;
  totalAmountCents: number;
  openAmountCents: number;
  collectibleAmountCents?: number;
  sourceStatus: string;
  issuedAt?: string;
  dueDate?: string;
  lastImportedAt: string;
  canonicalState?: CustomerInvoice["state"];
  canonicalMetadata?: Record<string, unknown>;
  snapshotMetadata?: Record<string, unknown>;
  canonicalizationStatus: string;
  holdReason?: string;
}

interface InvoiceIndexBuildOptions {
  databaseUrl?: string;
  tenantId?: string;
  now?: () => string;
  loadPersistedEntries?: (databaseUrl: string, tenantId: string) => InvoiceIndexEntry[];
  loadBusinessCentral?: (
    tenantId: string,
  ) => Promise<{ invoices: BusinessCentralInvoiceRecord[] } | undefined>;
  loadQuickBooks?: (
    tenantId: string,
  ) => Promise<{ invoices: QuickBooksInvoiceRecord[] } | undefined>;
  getBusinessCentralStatusForTenant?: typeof getBusinessCentralIntegrationStatus;
  getQuickBooksStatusForTenant?: typeof getQuickBooksIntegrationStatus;
}

type InvoiceSourceDescriptor = {
  provider: InvoiceIndexProvider;
  label: string;
  kind: InvoiceIndexSourceKind;
  importMode: InvoiceIndexImportMode;
};

type SeedBundle = ReturnType<typeof buildDemoSeedBundle>;

const connectorDescriptorByProvider = new Map(
  defaultConnectorCatalog.map((descriptor) => [
    descriptor.provider,
    {
      provider: descriptor.provider,
      label: descriptor.displayName,
      kind: descriptor.kind,
      importMode: "live_connection" as const,
    },
  ]),
);

const businessCentralDescriptor: InvoiceSourceDescriptor = {
  provider: "business_central",
  label: "Business Central",
  kind: "accounting",
  importMode: "live_connection",
};

const seedDescriptor: InvoiceSourceDescriptor = {
  provider: "seed_demo",
  label: "Seed demo catalog",
  kind: "seed",
  importMode: "seed_fallback",
};

export const registerInvoiceIndexRoutes = (app: FastifyInstance): void => {
  app.get("/v1/invoices", async () => {
    return buildInvoiceIndexResponse();
  });
};

export async function buildInvoiceIndexResponse(
  options: InvoiceIndexBuildOptions = {},
): Promise<InvoiceIndexResponse> {
  const env = loadEnv();
  const tenantId = options.tenantId ?? env.DEFAULT_TENANT_SLUG;
  const loadPersistedEntries = options.loadPersistedEntries ?? loadPersistedInvoiceIndexEntries;
  const loadBusinessCentral = options.loadBusinessCentral ?? loadBusinessCentralSalesInvoices;
  const loadQuickBooks = options.loadQuickBooks ?? loadQuickBooksInvoices;
  const getBusinessCentralStatusForTenant =
    options.getBusinessCentralStatusForTenant ?? getBusinessCentralIntegrationStatus;
  const getQuickBooksStatusForTenant =
    options.getQuickBooksStatusForTenant ?? getQuickBooksIntegrationStatus;
  const generatedAt = options.now?.() ?? new Date().toISOString();

  try {
    const persistedEntries = loadPersistedEntries(
      options.databaseUrl ?? env.DATABASE_URL,
      tenantId,
    );
    if (persistedEntries.length > 0) {
      const sortedEntries = sortInvoiceEntries(persistedEntries);
      return {
        generatedAt,
        source: {
          kind: "live",
          label: "Persisted imported invoice index",
          detail: `Loaded ${persistedEntries.length} stored imported invoices and canonical links from the database.`,
        },
        summary: buildInvoiceIndexSummary(sortedEntries),
        providers: buildProviderSummaries(sortedEntries),
        statuses: buildStatusSummaries(sortedEntries),
        invoices: sortedEntries,
      };
    }
  } catch (error) {
    const detail =
      error instanceof Error
        ? `Stored invoice index was unavailable: ${error.message}`
        : "Stored invoice index was unavailable.";
    return buildFallbackInvoiceIndexResponse({
      env,
      generatedAt,
      businessCentralLoader: loadBusinessCentral,
      quickBooksLoader: loadQuickBooks,
      businessCentralStatus: getBusinessCentralStatusForTenant,
      quickBooksStatus: getQuickBooksStatusForTenant,
      tenantId,
      seedFallbackDetail: detail,
    });
  }

  return buildFallbackInvoiceIndexResponse({
    env,
    generatedAt,
    businessCentralLoader: loadBusinessCentral,
    quickBooksLoader: loadQuickBooks,
    businessCentralStatus: getBusinessCentralStatusForTenant,
    quickBooksStatus: getQuickBooksStatusForTenant,
    tenantId,
  });
}

async function buildFallbackInvoiceIndexResponse(input: {
  env: ReturnType<typeof loadEnv>;
  generatedAt: string;
  tenantId: string;
  businessCentralLoader: (
    tenantId: string,
  ) => Promise<{ invoices: BusinessCentralInvoiceRecord[] } | undefined>;
  quickBooksLoader: (
    tenantId: string,
  ) => Promise<{ invoices: QuickBooksInvoiceRecord[] } | undefined>;
  businessCentralStatus: typeof getBusinessCentralIntegrationStatus;
  quickBooksStatus: typeof getQuickBooksIntegrationStatus;
  seedFallbackDetail?: string;
}): Promise<InvoiceIndexResponse> {
  const demo = buildDemoSeedBundle();
  const seedEntries = buildSeedInvoiceEntries(demo);
  const entries: InvoiceIndexEntry[] = [...seedEntries];
  let source: InvoiceIndexResponse["source"] = {
    kind: "seeded",
    label: "Seed-backed invoice index",
    detail:
      input.seedFallbackDetail ??
      "Using demo seed invoices because no persisted or live ERP/accounting invoice pull is active.",
  };

  const businessCentralStatus = input.businessCentralStatus(input.tenantId);
  if (businessCentralStatus.kind !== "not_configured") {
    try {
      const businessCentral = await input.businessCentralLoader(input.tenantId);
      if (businessCentral && businessCentral.invoices.length > 0) {
        entries.unshift(
          ...businessCentral.invoices.map((invoice) => mapBusinessCentralInvoiceToIndexEntry(invoice))
        );
        source = {
          kind: "live",
          label: "Live ERP/accounting invoice index",
          detail: `Combined ${businessCentral.invoices.length} live Business Central invoices with the seed fallback catalog.`,
        };
      }
    } catch (error) {
      source = {
        kind: "seeded",
        label: "Seed-backed invoice index",
        detail:
          error instanceof Error
            ? `Business Central invoice pull was unavailable: ${error.message}`
            : "Business Central invoice pull was unavailable.",
      };
    }
  }

  const quickBooksStatus = input.quickBooksStatus(input.tenantId);
  if (quickBooksStatus.kind !== "not_configured") {
    try {
      const quickBooks = await input.quickBooksLoader(input.tenantId);
      if (quickBooks && quickBooks.invoices.length > 0) {
        entries.unshift(
          ...quickBooks.invoices.map((invoice) => mapQuickBooksInvoiceToIndexEntry(invoice)),
        );
        source = {
          kind: "live",
          label: "Live ERP/accounting invoice index",
          detail: `Combined ${quickBooks.invoices.length} live QuickBooks invoices with the seed fallback catalog.`,
        };
      }
    } catch (error) {
      source = {
        kind: "seeded",
        label: "Seed-backed invoice index",
        detail:
          error instanceof Error
            ? `QuickBooks invoice pull was unavailable: ${error.message}`
            : "QuickBooks invoice pull was unavailable.",
      };
    }
  }

  const sortedEntries = sortInvoiceEntries(entries);

  return {
    generatedAt: input.generatedAt,
    source,
    summary: buildInvoiceIndexSummary(sortedEntries),
    providers: buildProviderSummaries(sortedEntries),
    statuses: buildStatusSummaries(sortedEntries),
    invoices: sortedEntries,
  };
}

export function loadPersistedInvoiceIndexEntries(
  databaseUrl: string,
  tenantId: string,
): InvoiceIndexEntry[] {
  const rows = queryJsonRows<PersistedInvoiceSnapshotRow>(
    databaseUrl,
    `
      SELECT row_to_json(q)
      FROM (
        SELECT
          snapshot.id,
          snapshot.source_provider AS "sourceProvider",
          snapshot.source_kind AS "sourceKind",
          snapshot.external_id AS "externalId",
          snapshot.canonical_invoice_id AS "canonicalInvoiceId",
          snapshot.customer_name AS "customerName",
          snapshot.customer_reference AS "customerReference",
          COALESCE(invoice.parent_account_id, billing_account.parent_account_id) AS "parentAccountId",
          parent_account.name AS "parentAccountName",
          invoice.billing_account_id AS "billingAccountId",
          billing_account.display_name AS "billingAccountName",
          COALESCE(invoice.branch_id::text, billing_account.branch_id::text) AS "branchId",
          branch.name AS "branchName",
          snapshot.invoice_number AS "invoiceNumber",
          snapshot.currency,
          snapshot.total_amount_cents::bigint AS "totalAmountCents",
          snapshot.open_amount_cents::bigint AS "openAmountCents",
          snapshot.source_status AS "sourceStatus",
          snapshot.issued_at AS "issuedAt",
          snapshot.due_date AS "dueDate",
          snapshot.last_imported_at AS "lastImportedAt",
          invoice.state AS "canonicalState",
          COALESCE(invoice.metadata, '{}'::jsonb) AS "canonicalMetadata",
          snapshot.metadata AS "snapshotMetadata",
          snapshot.canonicalization_status AS "canonicalizationStatus",
          snapshot.hold_reason AS "holdReason"
        FROM imported_invoice_snapshot snapshot
        LEFT JOIN invoice
          ON invoice.id = snapshot.canonical_invoice_id
         AND invoice.deleted_at IS NULL
        LEFT JOIN billing_account
          ON billing_account.id = invoice.billing_account_id
         AND billing_account.deleted_at IS NULL
        LEFT JOIN parent_account
          ON parent_account.id = COALESCE(invoice.parent_account_id, billing_account.parent_account_id)
         AND parent_account.deleted_at IS NULL
        LEFT JOIN branch
          ON branch.id = COALESCE(invoice.branch_id, billing_account.branch_id)
         AND branch.deleted_at IS NULL
        WHERE snapshot.tenant_id = '${quoteLiteral(tenantId)}'
          AND snapshot.deleted_at IS NULL
      ) q;
    `,
  );

  return rows.map(mapPersistedSnapshotToIndexEntry);
}

export function mapConnectorInvoiceToIndexEntry(
  invoice: ErpInvoiceRecord,
  provider: InvoiceIndexProvider,
): InvoiceIndexEntry {
  const descriptor = resolveDescriptor(provider);
  const status = normalizeConnectorStatus(invoice.status);
  const openAmountCents = Math.max(invoice.openAmountCents, 0);
  const customerName =
    readStringMetadata(invoice.metadata, "customerName") ?? invoice.billingAccountExternalId;
  const daysPastDue = computeDaysPastDue(invoice.dueDate);

  return {
    id: `${provider}:${invoice.externalId}`,
    sourceProvider: descriptor.provider,
    sourceKind: descriptor.kind,
    sourceLabel: descriptor.label,
    importMode: descriptor.importMode,
    externalId: invoice.externalId,
    customerName,
    ...(invoice.billingAccountExternalId
      ? { customerReference: invoice.billingAccountExternalId }
      : {}),
    ...(invoice.parentAccountExternalId
      ? { parentAccountId: invoice.parentAccountExternalId }
      : {}),
    ...(invoice.billingAccountExternalId
      ? { billingAccountId: invoice.billingAccountExternalId }
      : {}),
    ...(invoice.branchExternalId ? { branchId: invoice.branchExternalId } : {}),
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currency,
    totalAmountCents: invoice.amountCents,
    openAmountCents,
    paidAmountCents: Math.max(invoice.amountCents - openAmountCents, 0),
    status,
    sourceStatus: invoice.status,
    ...(invoice.issuedAt ? { issuedAt: invoice.issuedAt } : {}),
    ...(invoice.dueDate ? { dueDate: invoice.dueDate } : {}),
    ...(daysPastDue !== undefined ? { daysPastDue } : {}),
    tags: buildInvoiceTags({
      status,
      importMode: descriptor.importMode,
      ...(invoice.branchExternalId ? { branchId: invoice.branchExternalId } : {}),
    }),
    metadata: { ...invoice.metadata },
  };
}

export function mapBusinessCentralInvoiceToIndexEntry(
  invoice: BusinessCentralInvoiceRecord,
): InvoiceIndexEntry {
  const status = normalizeConnectorStatus(invoice.status);
  const openAmountCents = Math.max(invoice.remainingAmountCents, 0);
  const daysPastDue = computeDaysPastDue(invoice.dueDate);

  return {
    id: `business_central:${invoice.externalId}`,
    sourceProvider: businessCentralDescriptor.provider,
    sourceKind: businessCentralDescriptor.kind,
    sourceLabel: businessCentralDescriptor.label,
    importMode: businessCentralDescriptor.importMode,
    externalId: invoice.externalId,
    customerName: invoice.customerName,
    ...(invoice.customerNumber ? { customerReference: invoice.customerNumber } : {}),
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currencyCode,
    totalAmountCents: invoice.totalAmountCents,
    openAmountCents,
    paidAmountCents: Math.max(invoice.totalAmountCents - openAmountCents, 0),
    status,
    sourceStatus: invoice.status,
    ...(invoice.invoiceDate ? { issuedAt: invoice.invoiceDate } : {}),
    ...(invoice.dueDate ? { dueDate: invoice.dueDate } : {}),
    ...(daysPastDue !== undefined ? { daysPastDue } : {}),
    tags: buildInvoiceTags({
      status,
      importMode: businessCentralDescriptor.importMode,
      ...(invoice.contactName ? { contactName: invoice.contactName } : {}),
    }),
    metadata: {
      companyId: invoice.companyId,
      ...(invoice.companyName ? { companyName: invoice.companyName } : {}),
      ...(invoice.contactName ? { contactName: invoice.contactName } : {}),
      ...(invoice.email ? { email: invoice.email } : {}),
    },
  };
}

export function mapQuickBooksInvoiceToIndexEntry(
  invoice: QuickBooksInvoiceRecord,
): InvoiceIndexEntry {
  const status = normalizeConnectorStatus(invoice.status);
  const openAmountCents = Math.max(invoice.remainingAmountCents, 0);
  const daysPastDue = computeDaysPastDue(invoice.dueDate);

  return {
    id: `quickbooks_online:${invoice.externalId}`,
    sourceProvider: "quickbooks_online",
    sourceKind: "accounting",
    sourceLabel: "QuickBooks Online",
    importMode: "live_connection",
    externalId: invoice.externalId,
    customerName: invoice.customerName,
    ...(invoice.customerNumber ? { customerReference: invoice.customerNumber } : {}),
    ...(invoice.parentAccountName ? { parentAccountName: invoice.parentAccountName } : {}),
    ...(invoice.branchReference ? { branchId: invoice.branchReference } : {}),
    ...(invoice.branchName ? { branchName: invoice.branchName } : {}),
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currencyCode,
    totalAmountCents: invoice.totalAmountCents,
    openAmountCents,
    paidAmountCents: Math.max(invoice.totalAmountCents - openAmountCents, 0),
    status,
    sourceStatus: invoice.status,
    ...(invoice.invoiceDate ? { issuedAt: invoice.invoiceDate } : {}),
    ...(invoice.dueDate ? { dueDate: invoice.dueDate } : {}),
    ...(daysPastDue !== undefined ? { daysPastDue } : {}),
    tags: buildInvoiceTags({
      status,
      importMode: "live_connection",
    }),
    metadata: {
      companyId: invoice.companyId,
      ...(invoice.companyName ? { companyName: invoice.companyName } : {}),
      ...(invoice.email ? { email: invoice.email } : {}),
    },
  };
}

export function mapPersistedSnapshotToIndexEntry(
  row: PersistedInvoiceSnapshotRow,
): InvoiceIndexEntry {
  const provider = normalizePersistedProvider(row.sourceProvider);
  const descriptor = resolveDescriptor(provider);
  const status = row.canonicalState
    ? normalizeCanonicalStatus(row.canonicalState)
    : normalizeConnectorStatus(row.sourceStatus);
  const daysPastDue = computeDaysPastDue(row.dueDate);
  const metadata = {
    ...(row.snapshotMetadata ?? {}),
    ...(row.canonicalMetadata ?? {}),
    canonicalizationStatus: row.canonicalizationStatus,
    ...(row.holdReason ? { holdReason: row.holdReason } : {}),
  };
  const collectibleAmountCents = deriveCollectibleAmount({
    canonicalState: row.canonicalState,
    totalAmountCents: row.totalAmountCents,
    metadata,
  });

  return {
    id: `${provider}:${row.externalId}`,
    sourceProvider: provider,
    sourceKind: row.sourceKind,
    sourceLabel: descriptor.label,
    importMode: descriptor.importMode,
    externalId: row.externalId,
    ...(row.canonicalInvoiceId ? { canonicalInvoiceId: row.canonicalInvoiceId } : {}),
    customerName: row.billingAccountName ?? row.customerName,
    ...(row.customerReference ? { customerReference: row.customerReference } : {}),
    ...(row.parentAccountId ? { parentAccountId: row.parentAccountId } : {}),
    ...(row.parentAccountName ? { parentAccountName: row.parentAccountName } : {}),
    ...(row.billingAccountId ? { billingAccountId: row.billingAccountId } : {}),
    ...(row.billingAccountName ? { billingAccountName: row.billingAccountName } : {}),
    ...(row.branchId ? { branchId: row.branchId } : {}),
    ...(row.branchName ? { branchName: row.branchName } : {}),
    invoiceNumber: row.invoiceNumber,
    currency: row.currency,
    totalAmountCents: row.totalAmountCents,
    openAmountCents: row.openAmountCents,
    ...(collectibleAmountCents !== undefined ? { collectibleAmountCents } : {}),
    paidAmountCents: Math.max(row.totalAmountCents - row.openAmountCents, 0),
    status,
    sourceStatus: row.sourceStatus,
    ...(row.issuedAt ? { issuedAt: row.issuedAt } : {}),
    ...(row.dueDate ? { dueDate: row.dueDate } : {}),
    ...(row.lastImportedAt ? { lastImportedAt: row.lastImportedAt } : {}),
    ...(daysPastDue !== undefined ? { daysPastDue } : {}),
    tags: buildInvoiceTags({
      status,
      importMode: descriptor.importMode,
      ...(row.branchId ? { branchId: row.branchId } : {}),
      ...(readStringMetadata(metadata, "contactName")
        ? { contactName: readStringMetadata(metadata, "contactName") }
        : {}),
      ...(row.canonicalState ? { canonicalState: row.canonicalState } : {}),
    }).concat(row.canonicalInvoiceId ? ["canonical-linked"] : ["held-import"]),
    metadata,
  };
}

function buildSeedInvoiceEntries(seed: SeedBundle): InvoiceIndexEntry[] {
  const billingAccountById = new Map(
    seed.billingAccounts.map((billingAccount) => [billingAccount.id, billingAccount]),
  );
  const parentAccountById = new Map(
    seed.parentAccounts.map((parentAccount) => [parentAccount.id, parentAccount]),
  );
  const branchById = new Map(seed.branches.map((branch) => [branch.id, branch]));

  return seed.invoices.map((invoice) =>
    mapSeedInvoiceToIndexEntry(invoice, {
      ...(billingAccountById.get(invoice.billingAccountId)?.displayName
        ? { billingAccountName: billingAccountById.get(invoice.billingAccountId)?.displayName }
        : {}),
      ...(parentAccountById.get(invoice.parentAccountId)?.name
        ? { parentAccountName: parentAccountById.get(invoice.parentAccountId)?.name }
        : {}),
      ...(invoice.branchId && branchById.get(invoice.branchId)?.name
        ? { branchName: branchById.get(invoice.branchId)?.name }
        : {}),
    }),
  );
}

export function mapSeedInvoiceToIndexEntry(
  invoice: CustomerInvoice,
  names: {
    billingAccountName?: string | undefined;
    parentAccountName?: string | undefined;
    branchName?: string | undefined;
  },
): InvoiceIndexEntry {
  const status = normalizeCanonicalStatus(invoice.state);
  const openAmountCents = deriveSeedOpenAmount(invoice, status);
  const collectibleAmountCents = deriveCollectibleAmount({
    canonicalState: invoice.state,
    totalAmountCents: invoice.amountCents,
    invoice,
    metadata: invoice.metadata,
  });
  const daysPastDue = computeDaysPastDue(invoice.dueDate);

  return {
    id: `seed_demo:${invoice.id}`,
    sourceProvider: seedDescriptor.provider,
    sourceKind: seedDescriptor.kind,
    sourceLabel: seedDescriptor.label,
    importMode: seedDescriptor.importMode,
    canonicalInvoiceId: invoice.id,
    customerName: names.billingAccountName ?? invoice.billingAccountId,
    parentAccountId: invoice.parentAccountId,
    ...(names.parentAccountName ? { parentAccountName: names.parentAccountName } : {}),
    billingAccountId: invoice.billingAccountId,
    ...(names.billingAccountName ? { billingAccountName: names.billingAccountName } : {}),
    ...(invoice.branchId ? { branchId: invoice.branchId } : {}),
    ...(names.branchName ? { branchName: names.branchName } : {}),
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currency,
    totalAmountCents: invoice.amountCents,
    openAmountCents,
    ...(collectibleAmountCents !== undefined ? { collectibleAmountCents } : {}),
    paidAmountCents: Math.max(invoice.amountCents - openAmountCents, 0),
    status,
    sourceStatus: invoice.state,
    ...(invoice.invoiceDate ? { issuedAt: invoice.invoiceDate } : {}),
    ...(invoice.dueDate ? { dueDate: invoice.dueDate } : {}),
    ...(invoice.updatedAt ? { lastImportedAt: invoice.updatedAt } : {}),
    ...(daysPastDue !== undefined ? { daysPastDue } : {}),
    tags: buildInvoiceTags({
      status,
      importMode: seedDescriptor.importMode,
      canonicalState: invoice.state,
      ...(invoice.branchId ? { branchId: invoice.branchId } : {}),
    }),
    metadata: { ...invoice.metadata },
  };
}

function buildInvoiceIndexSummary(entries: InvoiceIndexEntry[]): InvoiceIndexResponse["summary"] {
  return {
    totalInvoices: entries.length,
    totalAmountCents: entries.reduce((sum, entry) => sum + entry.totalAmountCents, 0),
    openAmountCents: entries.reduce((sum, entry) => sum + entry.openAmountCents, 0),
    openInvoiceCount: entries.filter((entry) => entry.status === "open" || entry.status === "partial").length,
    overdueInvoiceCount: entries.filter((entry) => (entry.daysPastDue ?? 0) > 0 && entry.openAmountCents > 0).length,
    disputedInvoiceCount: entries.filter((entry) => entry.status === "disputed").length,
    paidInvoiceCount: entries.filter((entry) => entry.status === "paid").length,
    connectedProviderCount: new Set(
      entries
        .filter((entry) => entry.importMode === "live_connection")
        .map((entry) => entry.sourceProvider),
    ).size,
  };
}

function buildProviderSummaries(entries: InvoiceIndexEntry[]): InvoiceIndexProviderSummary[] {
  const grouped = new Map<string, InvoiceIndexProviderSummary>();

  for (const entry of entries) {
    const existing = grouped.get(entry.sourceProvider);
    if (existing) {
      existing.invoiceCount += 1;
      existing.openInvoiceCount += entry.openAmountCents > 0 ? 1 : 0;
      existing.totalAmountCents += entry.totalAmountCents;
      existing.openAmountCents += entry.openAmountCents;
      continue;
    }

    grouped.set(entry.sourceProvider, {
      provider: entry.sourceProvider,
      label: entry.sourceLabel,
      kind: entry.sourceKind,
      importMode: entry.importMode,
      invoiceCount: 1,
      openInvoiceCount: entry.openAmountCents > 0 ? 1 : 0,
      totalAmountCents: entry.totalAmountCents,
      openAmountCents: entry.openAmountCents,
    });
  }

  return [...grouped.values()].sort((left, right) => right.invoiceCount - left.invoiceCount);
}

function buildStatusSummaries(entries: InvoiceIndexEntry[]): InvoiceIndexStatusSummary[] {
  const statuses: InvoiceIndexStatus[] = ["open", "partial", "disputed", "paid", "voided"];
  return statuses.map((status) => {
    const matching = entries.filter((entry) => entry.status === status);
    return {
      status,
      invoiceCount: matching.length,
      totalAmountCents: matching.reduce((sum, entry) => sum + entry.totalAmountCents, 0),
      openAmountCents: matching.reduce((sum, entry) => sum + entry.openAmountCents, 0),
    };
  });
}

function normalizeCanonicalStatus(state: CustomerInvoice["state"]): InvoiceIndexStatus {
  switch (state) {
    case "paid":
      return "paid";
    case "partially_paid":
      return "partial";
    case "disputed_partial":
    case "disputed_full":
      return "disputed";
    case "voided":
      return "voided";
    default:
      return "open";
  }
}

function normalizeConnectorStatus(status: string): InvoiceIndexStatus {
  switch (status) {
    case "paid":
      return "paid";
    case "partial":
    case "partially_paid":
      return "partial";
    case "disputed":
      return "disputed";
    case "voided":
      return "voided";
    default:
      return "open";
  }
}

function normalizePersistedProvider(provider: string): InvoiceIndexProvider {
  if (provider === "business_central" || provider === "seed_demo") {
    return provider;
  }

  return provider as InvoiceIndexProvider;
}

function deriveSeedOpenAmount(invoice: CustomerInvoice, status: InvoiceIndexStatus) {
  const metadataOpenAmount = readNumericMetadata(invoice.metadata, "openAmountCents");
  if (typeof metadataOpenAmount === "number") {
    return metadataOpenAmount;
  }

  switch (status) {
    case "paid":
    case "voided":
      return 0;
    case "partial":
      return Math.round(invoice.amountCents / 2);
    default:
      return invoice.amountCents;
  }
}

function deriveCollectibleAmount(input: {
  canonicalState: CustomerInvoice["state"] | undefined;
  totalAmountCents: number;
  invoice?: CustomerInvoice;
  metadata: Record<string, unknown>;
}): number | undefined {
  if (input.canonicalState !== "disputed_partial") {
    return undefined;
  }

  if (input.invoice) {
    const collectibleAmount = getCollectibleAmountCents(input.invoice);
    return collectibleAmount > 0 ? collectibleAmount : undefined;
  }

  const collectibleFromMetadata = readNumericMetadata(input.metadata, "collectibleAmountCents");
  if (
    collectibleFromMetadata !== undefined &&
    collectibleFromMetadata >= 0 &&
    collectibleFromMetadata <= input.totalAmountCents
  ) {
    return collectibleFromMetadata;
  }

  const disputedAmount = readNumericMetadata(input.metadata, "disputedAmountCents");
  if (
    disputedAmount !== undefined &&
    disputedAmount >= 0 &&
    disputedAmount <= input.totalAmountCents
  ) {
    return Math.max(input.totalAmountCents - disputedAmount, 0);
  }

  return undefined;
}

function computeDaysPastDue(dueDate?: string) {
  if (!dueDate) {
    return undefined;
  }

  const due = Date.parse(dueDate);
  if (!Number.isFinite(due)) {
    return undefined;
  }

  const diffMs = Date.now() - due;
  const diffDays = Math.floor(diffMs / 86_400_000);
  return diffDays > 0 ? diffDays : 0;
}

function sortInvoiceEntries(entries: InvoiceIndexEntry[]) {
  return [...entries].sort((left, right) => {
    const leftImported = left.lastImportedAt ?? left.issuedAt ?? "";
    const rightImported = right.lastImportedAt ?? right.issuedAt ?? "";
    return rightImported.localeCompare(leftImported);
  });
}

function buildInvoiceTags(input: {
  status: InvoiceIndexStatus;
  importMode: InvoiceIndexImportMode;
  branchId?: string | undefined;
  contactName?: string | undefined;
  canonicalState?: string | undefined;
}) {
  const tags = [
    input.importMode === "live_connection"
      ? "live"
      : input.importMode === "manual_upload"
        ? "manual-upload"
        : "seeded",
    input.status,
  ];

  if (input.branchId) {
    tags.push("branch-tagged");
  }

  if (input.contactName) {
    tags.push("contact-visible");
  }

  if (input.canonicalState?.startsWith("disputed_")) {
    tags.push("collections-blocked");
  }

  return tags;
}

function resolveDescriptor(provider: InvoiceIndexProvider): InvoiceSourceDescriptor {
  if (provider === "business_central") {
    return businessCentralDescriptor;
  }

  if (provider === "spreadsheet_upload") {
    return {
      provider,
      label: "Spreadsheet upload",
      kind: "spreadsheet",
      importMode: "manual_upload",
    };
  }

  if (provider === "seed_demo") {
    return seedDescriptor;
  }

  return connectorDescriptorByProvider.get(provider) ?? {
    provider,
    label: provider,
    kind: "accounting",
    importMode: "live_connection",
  };
}

function readNumericMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "number" ? value : undefined;
}

function readStringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function queryJsonRows<T>(databaseUrl: string, sql: string): T[] {
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
    .map((line) => JSON.parse(line) as T);
}

function quoteLiteral(value: string) {
  return value.replaceAll("'", "''");
}
