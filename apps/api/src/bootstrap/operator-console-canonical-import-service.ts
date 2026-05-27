import { createHash } from "node:crypto";
import type { AuditContext } from "@o2c/audit";
import { createDatabaseClientConfig, queryJsonRows, quoteLiteral } from "@o2c/database";
import type { ImportedAccountRecord } from "../modules/account-import-file-parser.js";
import { createAccountStore } from "../modules/accounts.js";
import {
  createImportedInvoiceSyncService,
  type ImportedInvoiceSourceKind,
  type ImportedInvoiceSourceProvider,
  type ImportedInvoiceSourceRecord,
  type ImportedInvoiceSyncResult,
} from "./imported-invoice-sync-service.js";

type ImportedSnapshotSourceRecord = {
  id: string;
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
  metadata: Record<string, unknown>;
};

type ImportedParentAccount = { id: string };

type ImportedBillingAccount = {
  id: string;
  displayName: string;
};

type ImportedContact = {
  id: string;
  billingAccountId?: string;
  fullName: string;
  phone?: string;
  email?: string;
  isVerified: boolean;
  allowAutoSend: boolean;
};

type AccountImportPersistResult = {
  parentAccounts: ImportedParentAccount[];
  billingAccounts: ImportedBillingAccount[];
  contacts: ImportedContact[];
};

interface OperatorConsoleSnapshotSourceStore {
  listImportedSnapshots(input: {
    tenantId: string;
    customerName?: string;
    customerReference?: string;
    maxAccounts: number;
  }): Promise<ImportedSnapshotSourceRecord[]>;
}

interface CanonicalAccountImporter {
  importRecords(input: {
    tenantId: string;
    records: ImportedAccountRecord[];
    auditContext: AuditContext;
  }): Promise<AccountImportPersistResult>;
}

interface ImportedInvoiceCanonicalizer {
  syncImportedInvoiceRecords(input: {
    tenantId: string;
    provider: ImportedInvoiceSourceProvider;
    sourceKind: ImportedInvoiceSourceKind;
    invoices: ImportedInvoiceSourceRecord[];
    auditContext?: AuditContext;
  }): Promise<ImportedInvoiceSyncResult>;
}

export interface OperatorConsoleCanonicalImportInput {
  tenantId: string;
  auditContext: AuditContext;
  customerName?: string;
  customerReference?: string;
  maxAccounts?: number;
  defaultPhoneNumber?: string;
  markContactsVerified?: boolean;
}

export interface OperatorConsoleCanonicalImportTarget {
  billingAccountId: string;
  billingAccountName: string;
  contactId?: string;
  contactName?: string;
  phone?: string;
  invoiceCount: number;
  reason?: "missing_phone" | "unverified_contact" | "no_contact" | "no_canonical_invoices";
}

export interface OperatorConsoleCanonicalImportResult {
  status: "ok" | "no_data";
  importedSnapshotCount: number;
  importedBillingAccountCount: number;
  importedContactCount: number;
  canonicalInvoiceCount: number;
  pendingInvoiceCount: number;
  heldInvoiceCount: number;
  callableTargets: OperatorConsoleCanonicalImportTarget[];
  nonCallableTargets: OperatorConsoleCanonicalImportTarget[];
  warnings: string[];
  sampleOutboundRequest?: {
    billingAccountId: string;
    contactId: string;
  };
}

class PostgresOperatorConsoleSnapshotSourceStore
  implements OperatorConsoleSnapshotSourceStore
{
  constructor(private readonly databaseUrl: string) {}

  async listImportedSnapshots(input: {
    tenantId: string;
    customerName?: string;
    customerReference?: string;
    maxAccounts: number;
  }): Promise<ImportedSnapshotSourceRecord[]> {
    const filters = [
      `tenant_id = '${quoteLiteral(input.tenantId)}'`,
      "deleted_at IS NULL",
    ];

    if (input.customerName) {
      filters.push(
        `LOWER(customer_name) = LOWER('${quoteLiteral(input.customerName.trim())}')`,
      );
    }

    if (input.customerReference) {
      filters.push(
        `customer_reference = '${quoteLiteral(input.customerReference.trim())}'`,
      );
    }

    const rows = queryJsonRows<ImportedSnapshotSourceRecord>(
      this.databaseUrl,
      `
        WITH scoped_accounts AS (
          SELECT DISTINCT
            COALESCE(NULLIF(customer_reference, ''), customer_name) AS account_key
          FROM imported_invoice_snapshot
          WHERE ${filters.join(" AND ")}
          ORDER BY account_key
          LIMIT ${input.maxAccounts}
        )
        SELECT row_to_json(q)
        FROM (
          SELECT
            snapshot.id::text AS id,
            snapshot.source_provider AS "sourceProvider",
            snapshot.source_kind AS "sourceKind",
            snapshot.external_id AS "externalId",
            snapshot.company_id AS "companyId",
            snapshot.customer_name AS "customerName",
            snapshot.customer_reference AS "customerReference",
            snapshot.invoice_number AS "invoiceNumber",
            snapshot.currency,
            snapshot.total_amount_cents::integer AS "totalAmountCents",
            snapshot.open_amount_cents::integer AS "openAmountCents",
            snapshot.source_status AS "sourceStatus",
            snapshot.issued_at AS "issuedAt",
            snapshot.due_date AS "dueDate",
            snapshot.last_imported_at AS "lastImportedAt",
            COALESCE(snapshot.metadata, '{}'::jsonb) AS metadata
          FROM imported_invoice_snapshot snapshot
          INNER JOIN scoped_accounts account_scope
            ON account_scope.account_key = COALESCE(NULLIF(snapshot.customer_reference, ''), snapshot.customer_name)
          WHERE ${filters.join(" AND ")}
          ORDER BY snapshot.customer_name ASC, snapshot.invoice_number ASC
        ) q
      `,
    );

    return rows;
  }
}

export function createOperatorConsoleCanonicalImportService(input?: {
  sourceStore?: OperatorConsoleSnapshotSourceStore;
  accountImporter?: CanonicalAccountImporter;
  invoiceCanonicalizer?: ImportedInvoiceCanonicalizer;
}) {
  const databaseUrl = createDatabaseClientConfig().connectionString;
  const sourceStore =
    input?.sourceStore ??
    (databaseUrl.length > 0
      ? new PostgresOperatorConsoleSnapshotSourceStore(databaseUrl)
      : undefined);
  const accountImporter = input?.accountImporter ?? createAccountStore({ preferPostgres: true });
  const invoiceCanonicalizer =
    input?.invoiceCanonicalizer ?? createImportedInvoiceSyncService();

  return {
    async materializeFromOperatorConsoleReadModel(
      params: OperatorConsoleCanonicalImportInput,
    ): Promise<OperatorConsoleCanonicalImportResult> {
      if (!sourceStore) {
        return {
          status: "no_data",
          importedSnapshotCount: 0,
          importedBillingAccountCount: 0,
          importedContactCount: 0,
          canonicalInvoiceCount: 0,
          pendingInvoiceCount: 0,
          heldInvoiceCount: 0,
          callableTargets: [],
          nonCallableTargets: [],
          warnings: ["Database-backed imported invoice snapshots are not available in this environment."],
        };
      }

      let snapshots: ImportedSnapshotSourceRecord[];
      try {
        snapshots = await sourceStore.listImportedSnapshots({
          tenantId: params.tenantId,
          ...(params.customerName ? { customerName: params.customerName } : {}),
          ...(params.customerReference ? { customerReference: params.customerReference } : {}),
          maxAccounts: params.maxAccounts ?? 25,
        });
      } catch (error) {
        return {
          status: "no_data",
          importedSnapshotCount: 0,
          importedBillingAccountCount: 0,
          importedContactCount: 0,
          canonicalInvoiceCount: 0,
          pendingInvoiceCount: 0,
          heldInvoiceCount: 0,
          callableTargets: [],
          nonCallableTargets: [],
          warnings: [
            error instanceof Error
              ? `Imported invoice snapshots could not be loaded: ${error.message}`
              : "Imported invoice snapshots could not be loaded.",
          ],
        };
      }

      if (snapshots.length === 0) {
        return {
          status: "no_data",
          importedSnapshotCount: 0,
          importedBillingAccountCount: 0,
          importedContactCount: 0,
          canonicalInvoiceCount: 0,
          pendingInvoiceCount: 0,
          heldInvoiceCount: 0,
          callableTargets: [],
          nonCallableTargets: [],
          warnings: ["No operator-console imported invoice snapshots matched the requested filter."],
        };
      }

      const accountRecords = buildImportedAccountRecordsFromSnapshots({
        snapshots,
        ...(params.defaultPhoneNumber ? { defaultPhoneNumber: params.defaultPhoneNumber } : {}),
        markContactsVerified: params.markContactsVerified ?? false,
      });
      const accountImportResult = await accountImporter.importRecords({
        tenantId: params.tenantId,
        records: accountRecords,
        auditContext: params.auditContext,
      });

      const syncInputsByProvider = new Map<
        string,
        {
          provider: ImportedInvoiceSourceProvider;
          sourceKind: ImportedInvoiceSourceKind;
          invoices: ImportedInvoiceSourceRecord[];
        }
      >();

      for (const snapshot of snapshots) {
        const key = `${snapshot.sourceProvider}:${snapshot.sourceKind}`;
        const existing = syncInputsByProvider.get(key);
        const invoice = reconstructImportedInvoiceFromSnapshot(snapshot);
        if (existing) {
          existing.invoices.push(invoice);
          continue;
        }
        syncInputsByProvider.set(key, {
          provider: snapshot.sourceProvider,
          sourceKind: snapshot.sourceKind,
          invoices: [invoice],
        });
      }

      const syncResults = await Promise.all(
        [...syncInputsByProvider.values()].map((batch) =>
          invoiceCanonicalizer.syncImportedInvoiceRecords({
            tenantId: params.tenantId,
            provider: batch.provider,
            sourceKind: batch.sourceKind,
            invoices: batch.invoices,
            auditContext: params.auditContext,
          }),
        ),
      );

      return summarizeMaterialization({
        accountImportResult,
        syncResults,
      });
    },
  };
}

function buildImportedAccountRecordsFromSnapshots(input: {
  snapshots: ImportedSnapshotSourceRecord[];
  defaultPhoneNumber?: string;
  markContactsVerified: boolean;
}) {
  const records: ImportedAccountRecord[] = [];
  const grouped = groupSnapshotsByAccount(input.snapshots);

  for (const accountSnapshots of grouped.values()) {
    const first = accountSnapshots[0];
    if (!first) {
      continue;
    }

    const singleBranch = selectSingleBranchHint(accountSnapshots);
    const baseRecord = buildBaseAccountRecord({
      snapshot: first,
      ...(singleBranch ? { singleBranch } : {}),
    });
    records.push(baseRecord);

    const contactCandidates = buildContactCandidates({
      snapshots: accountSnapshots,
      ...(input.defaultPhoneNumber ? { defaultPhoneNumber: input.defaultPhoneNumber } : {}),
      markContactsVerified: input.markContactsVerified,
    });

    for (const contact of contactCandidates) {
      records.push({ ...baseRecord, contact });
    }
  }

  return records;
}

function summarizeMaterialization(input: {
  accountImportResult: AccountImportPersistResult;
  syncResults: ImportedInvoiceSyncResult[];
}): OperatorConsoleCanonicalImportResult {
  const uniqueBillingAccounts = dedupeById(input.accountImportResult.billingAccounts);
  const uniqueContacts = dedupeById(
    input.accountImportResult.contacts.filter((contact) => contact.billingAccountId),
  );
  const syncedSnapshots = input.syncResults.flatMap((result) => result.snapshots);
  const openCanonicalInvoiceCountByBillingAccount = new Map<string, number>();

  for (const snapshot of syncedSnapshots) {
    const normalizedHierarchy = readObject(snapshot.metadata.normalizedHierarchy);
    const billingAccountId = readString(normalizedHierarchy.billingAccountId);
    if (!billingAccountId || snapshot.canonicalizationStatus !== "canonical_upserted") {
      continue;
    }
    if (snapshot.openAmountCents <= 0) {
      continue;
    }
    openCanonicalInvoiceCountByBillingAccount.set(
      billingAccountId,
      (openCanonicalInvoiceCountByBillingAccount.get(billingAccountId) ?? 0) + 1,
    );
  }

  const callableTargets: OperatorConsoleCanonicalImportTarget[] = [];
  const nonCallableTargets: OperatorConsoleCanonicalImportTarget[] = [];
  const contactBillingAccountIds = new Set(
    uniqueContacts.map((contact) => contact.billingAccountId).filter((value): value is string => Boolean(value)),
  );

  for (const contact of uniqueContacts) {
    const billingAccountId = contact.billingAccountId;
    if (!billingAccountId) {
      continue;
    }
    const account = uniqueBillingAccounts.find((candidate) => candidate.id === billingAccountId);
    const invoiceCount = openCanonicalInvoiceCountByBillingAccount.get(billingAccountId) ?? 0;
    const target: OperatorConsoleCanonicalImportTarget = {
      billingAccountId,
      billingAccountName: account?.displayName ?? billingAccountId,
      contactId: contact.id,
      contactName: contact.fullName,
      ...(contact.phone ? { phone: contact.phone } : {}),
      invoiceCount,
    };

    if (!contact.phone) {
      nonCallableTargets.push({ ...target, reason: "missing_phone" });
      continue;
    }

    if (!contact.isVerified || !contact.allowAutoSend) {
      nonCallableTargets.push({ ...target, reason: "unverified_contact" });
      continue;
    }

    if (invoiceCount <= 0) {
      nonCallableTargets.push({ ...target, reason: "no_canonical_invoices" });
      continue;
    }

    callableTargets.push(target);
  }

  for (const account of uniqueBillingAccounts) {
    const hasContact = contactBillingAccountIds.has(account.id);
    const invoiceCount = openCanonicalInvoiceCountByBillingAccount.get(account.id) ?? 0;
    if (hasContact || invoiceCount <= 0) {
      continue;
    }

    nonCallableTargets.push({
      billingAccountId: account.id,
      billingAccountName: account.displayName,
      invoiceCount,
      reason: "no_contact",
    });
  }

  const warnings = buildWarnings({
    syncResults: input.syncResults,
    callableTargets,
    nonCallableTargets,
  });
  const sampleOutboundRequest = callableTargets[0]?.contactId
    ? {
        billingAccountId: callableTargets[0].billingAccountId,
        contactId: callableTargets[0].contactId,
      }
    : undefined;

  return {
    status: "ok",
    importedSnapshotCount: syncedSnapshots.length,
    importedBillingAccountCount: uniqueBillingAccounts.length,
    importedContactCount: uniqueContacts.length,
    canonicalInvoiceCount: syncedSnapshots.filter(
      (snapshot) => snapshot.canonicalizationStatus === "canonical_upserted",
    ).length,
    pendingInvoiceCount: syncedSnapshots.filter(
      (snapshot) => snapshot.canonicalizationStatus === "pending_account_mapping",
    ).length,
    heldInvoiceCount: syncedSnapshots.filter(
      (snapshot) => snapshot.canonicalizationStatus === "held_invalid",
    ).length,
    callableTargets,
    nonCallableTargets,
    warnings,
    ...(sampleOutboundRequest ? { sampleOutboundRequest } : {}),
  };
}

function groupSnapshotsByAccount(snapshots: ImportedSnapshotSourceRecord[]) {
  const grouped = new Map<string, ImportedSnapshotSourceRecord[]>();

  for (const snapshot of snapshots) {
    const accountKey =
      snapshot.customerReference?.trim() || normalizeIdentifier(snapshot.customerName);
    const existing = grouped.get(accountKey);
    if (existing) {
      existing.push(snapshot);
      continue;
    }
    grouped.set(accountKey, [snapshot]);
  }

  return grouped;
}

function buildBaseAccountRecord(input: {
  snapshot: ImportedSnapshotSourceRecord;
  singleBranch?: {
    externalId?: string;
    code: string;
    name: string;
  };
}): ImportedAccountRecord {
  const parentAccountName =
    readString(input.snapshot.metadata.parentAccountName) ?? input.snapshot.customerName;
  const parentAccountReference = readString(input.snapshot.metadata.parentAccountReference);
  const accountNumber =
    input.snapshot.customerReference?.trim() ||
    `rm-${stableShortHash(input.snapshot.customerName).toUpperCase()}`;

  return {
    parentAccount: {
      name: parentAccountName,
      status: "active",
      externalId: `read_model_parent:${parentAccountName}`,
      ...(parentAccountReference ? { externalReference: parentAccountReference } : {}),
    },
    billingAccount: {
      externalId: `read_model_billing:${accountNumber}`,
      accountNumber,
      displayName: input.snapshot.customerName,
      currency: input.snapshot.currency,
      accountTier: "standard",
      ...(input.snapshot.customerReference
        ? { erpCustomerId: input.snapshot.customerReference }
        : {}),
      centrallyPaid: false,
      status: "active",
    },
    ...(input.singleBranch ? { branch: { ...input.singleBranch, status: "active" } } : {}),
  };
}

function buildContactCandidates(input: {
  snapshots: ImportedSnapshotSourceRecord[];
  defaultPhoneNumber?: string;
  markContactsVerified: boolean;
}): Array<NonNullable<ImportedAccountRecord["contact"]>> {
  const candidates = new Map<string, NonNullable<ImportedAccountRecord["contact"]>>();

  for (const snapshot of input.snapshots) {
    const metadata = snapshot.metadata;
    const fullName = readString(metadata.contactName);
    const email = readString(metadata.email);
    const phone =
      readString(metadata.phone) ??
      readString(metadata.contactPhone) ??
      readString(metadata.primaryContactPhone) ??
      input.defaultPhoneNumber;

    if (!fullName && !email && !phone) {
      continue;
    }

    const candidateName = fullName ?? email ?? phone ?? "Primary AP Contact";
    const identityKey = [candidateName, email ?? "", phone ?? ""].join("|").toLowerCase();
    const isVerified = input.markContactsVerified && Boolean(email || phone);
    const allowAutoSend = isVerified;
    const candidate: NonNullable<ImportedAccountRecord["contact"]> = {
      externalId: `read_model_contact:${snapshot.customerReference ?? snapshot.customerName}:${identityKey}`,
      fullName: candidateName,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      role: inferContactRole(candidateName, email),
      scope: "billing_account",
      isPrimary: true,
      isVerified,
      allowAutoSend,
      recentSuccessfulResponses: 0,
    };

    if (!candidates.has(identityKey)) {
      candidates.set(identityKey, candidate);
    }
  }

  return [...candidates.values()];
}

function inferContactRole(fullName: string, email?: string) {
  const haystack = `${fullName} ${email ?? ""}`.toLowerCase();
  if (haystack.includes("treasury")) {
    return "treasury" as const;
  }
  if (haystack.includes("finance")) {
    return "shared_finance" as const;
  }
  return "ap" as const;
}

function selectSingleBranchHint(snapshots: ImportedSnapshotSourceRecord[]) {
  const branchHints = new Map<string, { externalId?: string; code: string; name: string }>();

  for (const snapshot of snapshots) {
    const branchName = readString(snapshot.metadata.branchName);
    const branchReference = readString(snapshot.metadata.branchReference);
    if (!branchName && !branchReference) {
      continue;
    }
    const name = branchName ?? branchReference ?? "Unknown branch";
    const code = branchReference ?? branchName ?? name;
    branchHints.set(`${code}|${name}`.toLowerCase(), {
      ...(branchReference ? { externalId: `read_model_branch:${branchReference}` } : {}),
      code,
      name,
    });
  }

  return branchHints.size === 1 ? [...branchHints.values()][0] : undefined;
}

function reconstructImportedInvoiceFromSnapshot(
  snapshot: ImportedSnapshotSourceRecord,
): ImportedInvoiceSourceRecord {
  const contactName = readString(snapshot.metadata.contactName);
  const email = readString(snapshot.metadata.email);
  const companyName = readString(snapshot.metadata.companyName);
  const paymentTermsCode = readString(snapshot.metadata.paymentTermsCode);
  const paymentTermsLabel = readString(snapshot.metadata.paymentTermsLabel);
  const customerPurchaseOrderNumber = readString(
    snapshot.metadata.customerPurchaseOrderNumber,
  );
  const salesOrderNumber = readString(snapshot.metadata.salesOrderNumber);
  const externalDocumentNumber = readString(snapshot.metadata.externalDocumentNumber);
  const issuerCompanyName = readString(snapshot.metadata.issuerCompanyName);
  const issuerAddressSummary = readString(snapshot.metadata.issuerAddressSummary);
  const issuerPhone = readString(snapshot.metadata.issuerPhone);
  const issuerFax = readString(snapshot.metadata.issuerFax);
  const parentAccountName = readString(snapshot.metadata.parentAccountName);
  const parentAccountReference = readString(snapshot.metadata.parentAccountReference);
  const branchName = readString(snapshot.metadata.branchName);
  const branchReference = readString(snapshot.metadata.branchReference);

  return {
    externalId: snapshot.externalId,
    invoiceNumber: snapshot.invoiceNumber,
    customerName: snapshot.customerName,
    currencyCode: snapshot.currency,
    totalAmountCents: snapshot.totalAmountCents,
    remainingAmountCents: snapshot.openAmountCents,
    status: snapshot.sourceStatus,
    ...(snapshot.customerReference ? { customerNumber: snapshot.customerReference } : {}),
    ...(contactName ? { contactName } : {}),
    ...(email ? { email } : {}),
    ...(snapshot.companyId ? { companyId: snapshot.companyId } : {}),
    ...(companyName ? { companyName } : {}),
    ...(paymentTermsCode ? { paymentTermsCode } : {}),
    ...(paymentTermsLabel ? { paymentTermsLabel } : {}),
    ...(customerPurchaseOrderNumber ? { customerPurchaseOrderNumber } : {}),
    ...(salesOrderNumber ? { salesOrderNumber } : {}),
    ...(externalDocumentNumber ? { externalDocumentNumber } : {}),
    ...(issuerCompanyName ? { issuerCompanyName } : {}),
    ...(issuerAddressSummary ? { issuerAddressSummary } : {}),
    ...(issuerPhone ? { issuerPhone } : {}),
    ...(issuerFax ? { issuerFax } : {}),
    ...(parentAccountName ? { parentAccountName } : {}),
    ...(parentAccountReference ? { parentAccountReference } : {}),
    ...(branchName ? { branchName } : {}),
    ...(branchReference ? { branchReference } : {}),
    ...(snapshot.issuedAt ? { invoiceDate: snapshot.issuedAt } : {}),
    ...(snapshot.dueDate ? { dueDate: snapshot.dueDate } : {}),
  };
}

function buildWarnings(input: {
  syncResults: ImportedInvoiceSyncResult[];
  callableTargets: OperatorConsoleCanonicalImportTarget[];
  nonCallableTargets: OperatorConsoleCanonicalImportTarget[];
}) {
  const warnings: string[] = [];
  const pendingCount = input.syncResults.reduce(
    (sum, result) => sum + result.pendingAccountMappingCount,
    0,
  );
  const heldCount = input.syncResults.reduce(
    (sum, result) => sum + result.heldInvalidCount,
    0,
  );

  if (pendingCount > 0) {
    warnings.push(
      `${pendingCount} invoices still need account or branch mapping before they become canonical.`,
    );
  }
  if (heldCount > 0) {
    warnings.push(`${heldCount} invoices were held because the imported values were invalid.`);
  }
  if (input.callableTargets.length === 0 && input.nonCallableTargets.length > 0) {
    warnings.push(
      "No Retell-callable contacts were produced yet. Add a phone number or opt into verified test contacts for a local call run.",
    );
  }

  return warnings;
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function stableShortHash(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 10);
}

function readObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
