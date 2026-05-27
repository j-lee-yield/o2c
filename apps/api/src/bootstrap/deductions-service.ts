import { randomUUID } from "node:crypto";
import {
  createActivityLogDomainHelpers,
  InMemoryImmutableActivityLogStore,
} from "@o2c/audit";
import type { Principal } from "@o2c/auth";
import {
  createDatabaseClientConfig,
  executeSqlCommand,
  isDatabaseAvailable,
  jsonLiteral,
  PostgresImmutableActivityLogStore,
  queryJsonRows,
  quoteLiteral,
} from "@o2c/database";
import {
  createEntityMetadata,
  evolveEntityMetadata,
  type ApprovalRequest,
  type Claim,
  type CreditMemoDraft,
  type CreditMemoDraftLine,
  type DeductionCase,
  type DeductionDocumentBundle,
  type DeductionLineItem,
  type DomainException,
  type Payment,
  type CustomerInvoice,
} from "@o2c/domain";
import type {
  ClaimInput,
  DeductionApPortalJobHookInput,
  DeductionCreditMemoRefreshResult,
  DeductionCreditMemoSyncResult,
  DeductionDetailReadModel,
  DeductionLineItemInput,
  DeductionQueueReadModel,
  DeductionUploadHookInput,
} from "@o2c/contracts";
import { makeBillingAccount, makeInvoice, makePayment } from "@o2c/testkit";

export class DeductionCaseNotFoundError extends Error {
  constructor(readonly caseId: string) {
    super(`Deduction case ${caseId} was not found.`);
    this.name = "DeductionCaseNotFoundError";
  }
}

export class DeductionSyncBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeductionSyncBlockedError";
  }
}

function toActivitySnapshot(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

type RelatedApproval = Pick<ApprovalRequest, "id" | "status" | "requestType">;
type RelatedInvoice = Pick<CustomerInvoice, "id" | "state" | "invoiceNumber" | "amountCents" | "currency">;
type RelatedPayment = Pick<Payment, "id" | "state" | "paymentReference" | "amountCents" | "currency">;
type RelatedException = Pick<DomainException, "id" | "state" | "summary">;
type RelatedAccount = { id: string; displayName: string };

type DeductionWorkspaceRecord = {
  deductionCase: DeductionCase;
  account: RelatedAccount;
  invoice?: RelatedInvoice;
  payment?: RelatedPayment;
  exception?: RelatedException;
  approval?: RelatedApproval;
  lineItems: DeductionLineItem[];
  claims: Claim[];
  documentBundle?: DeductionDocumentBundle;
  creditMemoDraft?: CreditMemoDraft;
  creditMemoDraftLines: CreditMemoDraftLine[];
};

interface DeductionWorkspaceRepository {
  list(): Promise<DeductionWorkspaceRecord[]>;
  get(caseId: string): Promise<DeductionWorkspaceRecord | undefined>;
  save(record: DeductionWorkspaceRecord): Promise<void>;
}

class InMemoryDeductionWorkspaceRepository implements DeductionWorkspaceRepository {
  private readonly records = new Map<string, DeductionWorkspaceRecord>();

  seed(record: DeductionWorkspaceRecord) {
    this.records.set(record.deductionCase.id, structuredClone(record));
  }

  async list(): Promise<DeductionWorkspaceRecord[]> {
    return [...this.records.values()].map((record) => structuredClone(record));
  }

  async get(caseId: string): Promise<DeductionWorkspaceRecord | undefined> {
    const record = this.records.get(caseId);
    return record ? structuredClone(record) : undefined;
  }

  async save(record: DeductionWorkspaceRecord): Promise<void> {
    this.records.set(record.deductionCase.id, structuredClone(record));
  }
}

type DeductionCaseRow = DeductionCase & { accountName: string };

class PostgresDeductionWorkspaceRepository implements DeductionWorkspaceRepository {
  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId = "default",
  ) {}

  async list(): Promise<DeductionWorkspaceRecord[]> {
    const rows = queryJsonRows<{ id: string }>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT id::text AS id
          FROM deduction_case
          WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
          ORDER BY updated_at DESC
        ) q
      `,
    );

    const records = await Promise.all(rows.map((row) => this.get(row.id)));
    return records.filter((record): record is DeductionWorkspaceRecord => Boolean(record));
  }

  async get(caseId: string): Promise<DeductionWorkspaceRecord | undefined> {
    const [deductionCase] = queryJsonRows<DeductionCaseRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            dc.id::text AS id,
            dc.tenant_id AS "tenantId",
            dc.version,
            dc.created_at AS "createdAt",
            dc.updated_at AS "updatedAt",
            dc.deleted_at AS "deletedAt",
            dc.created_by_actor_id AS "createdByActorId",
            dc.created_by_actor_role AS "createdByActorRole",
            dc.updated_by_actor_id AS "updatedByActorId",
            dc.updated_by_actor_role AS "updatedByActorRole",
            dc.parent_account_id::text AS "parentAccountId",
            dc.billing_account_id::text AS "billingAccountId",
            dc.branch_id::text AS "branchId",
            dc.invoice_id::text AS "invoiceId",
            dc.payment_id::text AS "paymentId",
            dc.exception_id::text AS "exceptionId",
            dc.approval_request_id::text AS "approvalRequestId",
            dc.external_claim_reference AS "externalClaimReference",
            dc.state,
            dc.queue_status AS "queueStatus",
            dc.reason_code AS "reasonCode",
            dc.priority,
            dc.source_channel AS "sourceChannel",
            dc.source_job_id AS "sourceJobId",
            dc.owner_role AS "ownerRole",
            dc.detected_at AS "detectedAt",
            dc.opened_at AS "openedAt",
            dc.target_amount_cents AS "targetAmountCents",
            dc.currency,
            dc.metadata,
            ba.display_name AS "accountName"
          FROM deduction_case dc
          INNER JOIN billing_account ba ON ba.id = dc.billing_account_id
          WHERE dc.tenant_id = '${quoteLiteral(this.tenantId)}'
            AND dc.id = '${quoteLiteral(caseId)}'::uuid
          LIMIT 1
        ) q
      `,
    );

    if (!deductionCase) {
      return undefined;
    }

    const lineItems = queryJsonRows<DeductionLineItem>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id::text AS id,
            tenant_id AS "tenantId",
            version,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            deleted_at AS "deletedAt",
            created_by_actor_id AS "createdByActorId",
            created_by_actor_role AS "createdByActorRole",
            updated_by_actor_id AS "updatedByActorId",
            updated_by_actor_role AS "updatedByActorRole",
            deduction_case_id::text AS "deductionCaseId",
            invoice_id::text AS "invoiceId",
            payment_id::text AS "paymentId",
            exception_id::text AS "exceptionId",
            claim_id::text AS "claimId",
            line_number AS "lineNumber",
            category,
            description,
            quantity,
            unit_amount_cents AS "unitAmountCents",
            disputed_amount_cents AS "disputedAmountCents",
            accepted_amount_cents AS "acceptedAmountCents",
            status,
            metadata
          FROM deduction_line_item
          WHERE deduction_case_id = '${quoteLiteral(caseId)}'::uuid
          ORDER BY line_number
        ) q
      `,
    );

    const claims = queryJsonRows<Claim>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id::text AS id,
            tenant_id AS "tenantId",
            version,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            deleted_at AS "deletedAt",
            created_by_actor_id AS "createdByActorId",
            created_by_actor_role AS "createdByActorRole",
            updated_by_actor_id AS "updatedByActorId",
            updated_by_actor_role AS "updatedByActorRole",
            deduction_case_id::text AS "deductionCaseId",
            invoice_id::text AS "invoiceId",
            payment_id::text AS "paymentId",
            exception_id::text AS "exceptionId",
            claim_number AS "claimNumber",
            claimant_name AS "claimantName",
            source_channel AS "sourceChannel",
            asserted_at AS "assertedAt",
            status,
            asserted_amount_cents AS "assertedAmountCents",
            currency,
            metadata
          FROM claim
          WHERE deduction_case_id = '${quoteLiteral(caseId)}'::uuid
          ORDER BY asserted_at DESC
        ) q
      `,
    );

    const [documentBundle] = queryJsonRows<DeductionDocumentBundle>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id::text AS id,
            tenant_id AS "tenantId",
            version,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            deleted_at AS "deletedAt",
            created_by_actor_id AS "createdByActorId",
            created_by_actor_role AS "createdByActorRole",
            updated_by_actor_id AS "updatedByActorId",
            updated_by_actor_role AS "updatedByActorRole",
            deduction_case_id::text AS "deductionCaseId",
            invoice_id::text AS "invoiceId",
            payment_id::text AS "paymentId",
            status,
            completeness_score AS "completenessScore",
            missing_document_types AS "missingDocumentTypes",
            document_ids AS "documentIds",
            metadata
          FROM deduction_document_bundle
          WHERE deduction_case_id = '${quoteLiteral(caseId)}'::uuid
          LIMIT 1
        ) q
      `,
    );

    const [creditMemoDraft] = queryJsonRows<CreditMemoDraft>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id::text AS id,
            tenant_id AS "tenantId",
            version,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            deleted_at AS "deletedAt",
            created_by_actor_id AS "createdByActorId",
            created_by_actor_role AS "createdByActorRole",
            updated_by_actor_id AS "updatedByActorId",
            updated_by_actor_role AS "updatedByActorRole",
            deduction_case_id::text AS "deductionCaseId",
            invoice_id::text AS "invoiceId",
            payment_id::text AS "paymentId",
            exception_id::text AS "exceptionId",
            approval_request_id::text AS "approvalRequestId",
            memo_number AS "memoNumber",
            state,
            reason_code AS "reasonCode",
            currency,
            subtotal_amount_cents AS "subtotalAmountCents",
            total_amount_cents AS "totalAmountCents",
            last_refreshed_at AS "lastRefreshedAt",
            last_synced_at AS "lastSyncedAt",
            erp_sync_status AS "erpSyncStatus",
            metadata
          FROM credit_memo_draft
          WHERE deduction_case_id = '${quoteLiteral(caseId)}'::uuid
          LIMIT 1
        ) q
      `,
    );

    const creditMemoDraftLines = creditMemoDraft
      ? queryJsonRows<CreditMemoDraftLine>(
          this.databaseUrl,
          `
            SELECT row_to_json(q)
            FROM (
              SELECT
                id::text AS id,
                tenant_id AS "tenantId",
                version,
                created_at AS "createdAt",
                updated_at AS "updatedAt",
                deleted_at AS "deletedAt",
                created_by_actor_id AS "createdByActorId",
                created_by_actor_role AS "createdByActorRole",
                updated_by_actor_id AS "updatedByActorId",
                updated_by_actor_role AS "updatedByActorRole",
                credit_memo_draft_id::text AS "creditMemoDraftId",
                deduction_line_item_id::text AS "deductionLineItemId",
                line_number AS "lineNumber",
                description,
                quantity,
                unit_amount_cents AS "unitAmountCents",
                amount_cents AS "amountCents",
                tax_code AS "taxCode",
                metadata
              FROM credit_memo_draft_line
              WHERE credit_memo_draft_id = '${quoteLiteral(creditMemoDraft.id)}'::uuid
              ORDER BY line_number
            ) q
          `,
        )
      : [];

    const invoice = deductionCase.invoiceId ? this.queryInvoice(deductionCase.invoiceId) : undefined;
    const payment = deductionCase.paymentId ? this.queryPayment(deductionCase.paymentId) : undefined;
    const exception = deductionCase.exceptionId
      ? this.queryException(deductionCase.exceptionId)
      : undefined;
    const approval = deductionCase.approvalRequestId
      ? this.queryApproval(deductionCase.approvalRequestId)
      : undefined;

    return {
      deductionCase,
      account: { id: deductionCase.billingAccountId, displayName: deductionCase.accountName },
      ...(invoice ? { invoice } : {}),
      ...(payment ? { payment } : {}),
      ...(exception ? { exception } : {}),
      ...(approval ? { approval } : {}),
      lineItems,
      claims,
      ...(documentBundle ? { documentBundle } : {}),
      ...(creditMemoDraft ? { creditMemoDraft } : {}),
      creditMemoDraftLines,
    };
  }

  async save(record: DeductionWorkspaceRecord): Promise<void> {
    const deductionCase = record.deductionCase;
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO deduction_case (
          id, tenant_id, version, created_at, updated_at, deleted_at,
          created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
          parent_account_id, billing_account_id, branch_id, invoice_id, payment_id, exception_id,
          approval_request_id, external_claim_reference, state, queue_status, reason_code, priority,
          source_channel, source_job_id, owner_role, detected_at, opened_at, target_amount_cents,
          currency, metadata
        )
        VALUES (
          '${quoteLiteral(deductionCase.id)}'::uuid,
          '${quoteLiteral(deductionCase.tenantId ?? this.tenantId)}',
          ${deductionCase.version ?? 1},
          '${quoteLiteral(deductionCase.createdAt)}'::timestamptz,
          '${quoteLiteral(deductionCase.updatedAt)}'::timestamptz,
          ${toSqlNullableTimestamp(deductionCase.deletedAt)},
          ${toSqlNullableText(deductionCase.createdByActorId)},
          ${toSqlNullableText(deductionCase.createdByActorRole)},
          ${toSqlNullableText(deductionCase.updatedByActorId)},
          ${toSqlNullableText(deductionCase.updatedByActorRole)},
          '${quoteLiteral(deductionCase.parentAccountId)}'::uuid,
          '${quoteLiteral(deductionCase.billingAccountId)}'::uuid,
          ${toSqlNullableUuid(deductionCase.branchId)},
          ${toSqlNullableUuid(deductionCase.invoiceId)},
          ${toSqlNullableUuid(deductionCase.paymentId)},
          ${toSqlNullableUuid(deductionCase.exceptionId)},
          ${toSqlNullableUuid(deductionCase.approvalRequestId)},
          ${toSqlNullableText(deductionCase.externalClaimReference)},
          '${quoteLiteral(deductionCase.state)}'::deduction_case_state,
          '${quoteLiteral(deductionCase.queueStatus)}',
          '${quoteLiteral(deductionCase.reasonCode)}',
          '${quoteLiteral(deductionCase.priority)}',
          '${quoteLiteral(deductionCase.sourceChannel)}',
          ${toSqlNullableText(deductionCase.sourceJobId)},
          ${toSqlNullableText(deductionCase.ownerRole)},
          '${quoteLiteral(deductionCase.detectedAt)}'::timestamptz,
          '${quoteLiteral(deductionCase.openedAt)}'::timestamptz,
          ${deductionCase.targetAmountCents},
          '${quoteLiteral(deductionCase.currency)}',
          '${jsonLiteral(deductionCase.metadata)}'::jsonb
        )
        ON CONFLICT (id) DO UPDATE SET
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          branch_id = EXCLUDED.branch_id,
          invoice_id = EXCLUDED.invoice_id,
          payment_id = EXCLUDED.payment_id,
          exception_id = EXCLUDED.exception_id,
          approval_request_id = EXCLUDED.approval_request_id,
          external_claim_reference = EXCLUDED.external_claim_reference,
          state = EXCLUDED.state,
          queue_status = EXCLUDED.queue_status,
          reason_code = EXCLUDED.reason_code,
          priority = EXCLUDED.priority,
          source_channel = EXCLUDED.source_channel,
          source_job_id = EXCLUDED.source_job_id,
          owner_role = EXCLUDED.owner_role,
          detected_at = EXCLUDED.detected_at,
          opened_at = EXCLUDED.opened_at,
          target_amount_cents = EXCLUDED.target_amount_cents,
          currency = EXCLUDED.currency,
          metadata = EXCLUDED.metadata
      `,
    );

    executeSqlCommand(
      this.databaseUrl,
      `DELETE FROM deduction_line_item WHERE deduction_case_id = '${quoteLiteral(deductionCase.id)}'::uuid`,
    );
    executeSqlCommand(
      this.databaseUrl,
      `DELETE FROM claim WHERE deduction_case_id = '${quoteLiteral(deductionCase.id)}'::uuid`,
    );
    executeSqlCommand(
      this.databaseUrl,
      `DELETE FROM credit_memo_draft_line WHERE credit_memo_draft_id IN (SELECT id FROM credit_memo_draft WHERE deduction_case_id = '${quoteLiteral(deductionCase.id)}'::uuid)`,
    );
    executeSqlCommand(
      this.databaseUrl,
      `DELETE FROM credit_memo_draft WHERE deduction_case_id = '${quoteLiteral(deductionCase.id)}'::uuid`,
    );
    executeSqlCommand(
      this.databaseUrl,
      `DELETE FROM deduction_document_bundle WHERE deduction_case_id = '${quoteLiteral(deductionCase.id)}'::uuid`,
    );

    for (const claim of record.claims) {
      executeSqlCommand(
        this.databaseUrl,
        `
          INSERT INTO claim (
            id, tenant_id, version, created_at, updated_at, deleted_at,
            created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
            deduction_case_id, invoice_id, payment_id, exception_id, claim_number, claimant_name,
            source_channel, asserted_at, status, asserted_amount_cents, currency, metadata
          )
          VALUES (
            '${quoteLiteral(claim.id)}'::uuid,
            '${quoteLiteral(claim.tenantId ?? this.tenantId)}',
            ${claim.version ?? 1},
            '${quoteLiteral(claim.createdAt)}'::timestamptz,
            '${quoteLiteral(claim.updatedAt)}'::timestamptz,
            ${toSqlNullableTimestamp(claim.deletedAt)},
            ${toSqlNullableText(claim.createdByActorId)},
            ${toSqlNullableText(claim.createdByActorRole)},
            ${toSqlNullableText(claim.updatedByActorId)},
            ${toSqlNullableText(claim.updatedByActorRole)},
            '${quoteLiteral(claim.deductionCaseId)}'::uuid,
            ${toSqlNullableUuid(claim.invoiceId)},
            ${toSqlNullableUuid(claim.paymentId)},
            ${toSqlNullableUuid(claim.exceptionId)},
            '${quoteLiteral(claim.claimNumber)}',
            ${toSqlNullableText(claim.claimantName)},
            '${quoteLiteral(claim.sourceChannel)}',
            '${quoteLiteral(claim.assertedAt)}'::timestamptz,
            '${quoteLiteral(claim.status)}'::claim_state,
            ${claim.assertedAmountCents},
            '${quoteLiteral(claim.currency)}',
            '${jsonLiteral(claim.metadata)}'::jsonb
          )
        `,
      );
    }

    for (const line of record.lineItems) {
      executeSqlCommand(
        this.databaseUrl,
        `
          INSERT INTO deduction_line_item (
            id, tenant_id, version, created_at, updated_at, deleted_at,
            created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
            deduction_case_id, invoice_id, payment_id, exception_id, claim_id, line_number, category,
            description, quantity, unit_amount_cents, disputed_amount_cents, accepted_amount_cents,
            status, metadata
          )
          VALUES (
            '${quoteLiteral(line.id)}'::uuid,
            '${quoteLiteral(line.tenantId ?? this.tenantId)}',
            ${line.version ?? 1},
            '${quoteLiteral(line.createdAt)}'::timestamptz,
            '${quoteLiteral(line.updatedAt)}'::timestamptz,
            ${toSqlNullableTimestamp(line.deletedAt)},
            ${toSqlNullableText(line.createdByActorId)},
            ${toSqlNullableText(line.createdByActorRole)},
            ${toSqlNullableText(line.updatedByActorId)},
            ${toSqlNullableText(line.updatedByActorRole)},
            '${quoteLiteral(line.deductionCaseId)}'::uuid,
            ${toSqlNullableUuid(line.invoiceId)},
            ${toSqlNullableUuid(line.paymentId)},
            ${toSqlNullableUuid(line.exceptionId)},
            ${toSqlNullableUuid(line.claimId)},
            ${line.lineNumber},
            '${quoteLiteral(line.category)}',
            '${quoteLiteral(line.description)}',
            ${typeof line.quantity === "number" ? line.quantity : "NULL"},
            ${typeof line.unitAmountCents === "number" ? line.unitAmountCents : "NULL"},
            ${line.disputedAmountCents},
            ${typeof line.acceptedAmountCents === "number" ? line.acceptedAmountCents : "NULL"},
            '${quoteLiteral(line.status)}'::deduction_line_item_status,
            '${jsonLiteral(line.metadata)}'::jsonb
          )
        `,
      );
    }

    if (record.documentBundle) {
      const bundle = record.documentBundle;
      executeSqlCommand(
        this.databaseUrl,
        `
          INSERT INTO deduction_document_bundle (
            id, tenant_id, version, created_at, updated_at, deleted_at,
            created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
            deduction_case_id, invoice_id, payment_id, status, completeness_score,
            missing_document_types, document_ids, metadata
          )
          VALUES (
            '${quoteLiteral(bundle.id)}'::uuid,
            '${quoteLiteral(bundle.tenantId ?? this.tenantId)}',
            ${bundle.version ?? 1},
            '${quoteLiteral(bundle.createdAt)}'::timestamptz,
            '${quoteLiteral(bundle.updatedAt)}'::timestamptz,
            ${toSqlNullableTimestamp(bundle.deletedAt)},
            ${toSqlNullableText(bundle.createdByActorId)},
            ${toSqlNullableText(bundle.createdByActorRole)},
            ${toSqlNullableText(bundle.updatedByActorId)},
            ${toSqlNullableText(bundle.updatedByActorRole)},
            '${quoteLiteral(bundle.deductionCaseId)}'::uuid,
            ${toSqlNullableUuid(bundle.invoiceId)},
            ${toSqlNullableUuid(bundle.paymentId)},
            '${quoteLiteral(bundle.status)}'::deduction_document_bundle_state,
            ${bundle.completenessScore},
            '${jsonLiteral(bundle.missingDocumentTypes)}'::jsonb,
            '${jsonLiteral(bundle.documentIds)}'::jsonb,
            '${jsonLiteral(bundle.metadata)}'::jsonb
          )
        `,
      );
    }

    if (record.creditMemoDraft) {
      const draft = record.creditMemoDraft;
      executeSqlCommand(
        this.databaseUrl,
        `
          INSERT INTO credit_memo_draft (
            id, tenant_id, version, created_at, updated_at, deleted_at,
            created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
            deduction_case_id, invoice_id, payment_id, exception_id, approval_request_id,
            memo_number, state, reason_code, currency, subtotal_amount_cents, total_amount_cents,
            last_refreshed_at, last_synced_at, erp_sync_status, metadata
          )
          VALUES (
            '${quoteLiteral(draft.id)}'::uuid,
            '${quoteLiteral(draft.tenantId ?? this.tenantId)}',
            ${draft.version ?? 1},
            '${quoteLiteral(draft.createdAt)}'::timestamptz,
            '${quoteLiteral(draft.updatedAt)}'::timestamptz,
            ${toSqlNullableTimestamp(draft.deletedAt)},
            ${toSqlNullableText(draft.createdByActorId)},
            ${toSqlNullableText(draft.createdByActorRole)},
            ${toSqlNullableText(draft.updatedByActorId)},
            ${toSqlNullableText(draft.updatedByActorRole)},
            '${quoteLiteral(draft.deductionCaseId)}'::uuid,
            ${toSqlNullableUuid(draft.invoiceId)},
            ${toSqlNullableUuid(draft.paymentId)},
            ${toSqlNullableUuid(draft.exceptionId)},
            ${toSqlNullableUuid(draft.approvalRequestId)},
            ${toSqlNullableText(draft.memoNumber)},
            '${quoteLiteral(draft.state)}'::credit_memo_draft_state,
            '${quoteLiteral(draft.reasonCode)}',
            '${quoteLiteral(draft.currency)}',
            ${draft.subtotalAmountCents},
            ${draft.totalAmountCents},
            '${quoteLiteral(draft.lastRefreshedAt)}'::timestamptz,
            ${toSqlNullableTimestamp(draft.lastSyncedAt)},
            '${quoteLiteral(draft.erpSyncStatus)}',
            '${jsonLiteral(draft.metadata)}'::jsonb
          )
        `,
      );

      for (const line of record.creditMemoDraftLines) {
        executeSqlCommand(
          this.databaseUrl,
          `
            INSERT INTO credit_memo_draft_line (
              id, tenant_id, version, created_at, updated_at, deleted_at,
              created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
              credit_memo_draft_id, deduction_line_item_id, line_number, description, quantity,
              unit_amount_cents, amount_cents, tax_code, metadata
            )
            VALUES (
              '${quoteLiteral(line.id)}'::uuid,
              '${quoteLiteral(line.tenantId ?? this.tenantId)}',
              ${line.version ?? 1},
              '${quoteLiteral(line.createdAt)}'::timestamptz,
              '${quoteLiteral(line.updatedAt)}'::timestamptz,
              ${toSqlNullableTimestamp(line.deletedAt)},
              ${toSqlNullableText(line.createdByActorId)},
              ${toSqlNullableText(line.createdByActorRole)},
              ${toSqlNullableText(line.updatedByActorId)},
              ${toSqlNullableText(line.updatedByActorRole)},
              '${quoteLiteral(line.creditMemoDraftId)}'::uuid,
              ${toSqlNullableUuid(line.deductionLineItemId)},
              ${line.lineNumber},
              '${quoteLiteral(line.description)}',
              ${typeof line.quantity === "number" ? line.quantity : "NULL"},
              ${typeof line.unitAmountCents === "number" ? line.unitAmountCents : "NULL"},
              ${line.amountCents},
              ${toSqlNullableText(line.taxCode)},
              '${jsonLiteral(line.metadata)}'::jsonb
            )
          `,
        );
      }
    }
  }

  private queryInvoice(invoiceId: string) {
    const [invoice] = queryJsonRows<RelatedInvoice>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id::text AS id,
            state,
            invoice_number AS "invoiceNumber",
            amount_cents AS "amountCents",
            currency
          FROM invoice
          WHERE id = '${quoteLiteral(invoiceId)}'::uuid
          LIMIT 1
        ) q
      `,
    );
    return invoice;
  }

  private queryPayment(paymentId: string) {
    const [payment] = queryJsonRows<RelatedPayment>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id::text AS id,
            state,
            payment_reference AS "paymentReference",
            amount_cents AS "amountCents",
            currency
          FROM payment
          WHERE id = '${quoteLiteral(paymentId)}'::uuid
          LIMIT 1
        ) q
      `,
    );
    return payment;
  }

  private queryException(exceptionId: string) {
    const [exception] = queryJsonRows<RelatedException>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id::text AS id,
            state,
            summary
          FROM exception
          WHERE id = '${quoteLiteral(exceptionId)}'::uuid
          LIMIT 1
        ) q
      `,
    );
    return exception;
  }

  private queryApproval(approvalId: string) {
    const [approval] = queryJsonRows<RelatedApproval>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id::text AS id,
            status,
            request_type AS "requestType"
          FROM approval_requests
          WHERE id = '${quoteLiteral(approvalId)}'::uuid
          LIMIT 1
        ) q
      `,
    );
    return approval;
  }
}

let deductionsService: ReturnType<typeof createDeductionsWorkspaceService> | undefined;
let runtimeMode: "database" | "memory" | undefined;
let seeded = false;
const inMemoryDeductionsAuditStore = new InMemoryImmutableActivityLogStore();
const inMemoryDeductionsAudit = createActivityLogDomainHelpers({
  store: inMemoryDeductionsAuditStore,
  idGenerator: () => randomUUID(),
  now: () => new Date().toISOString(),
});

export async function getDeductionsWorkspaceService() {
  if (!deductionsService) {
    const databaseUrl = createDatabaseClientConfig().connectionString;
    const databaseBacked = databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl);

    if (databaseBacked) {
      const repo = new PostgresDeductionWorkspaceRepository(databaseUrl);
      const ready = await probeDeductionsSchema(repo);
      if (ready) {
        deductionsService = createDeductionsWorkspaceService({
          repository: repo,
          audit: createActivityLogDomainHelpers({
            store: new PostgresImmutableActivityLogStore(databaseUrl),
            idGenerator: () => randomUUID(),
            now: () => new Date().toISOString(),
          }),
        });
        runtimeMode = "database";
      }
    }

    if (!deductionsService) {
      const repo = new InMemoryDeductionWorkspaceRepository();
      deductionsService = createDeductionsWorkspaceService({
        repository: repo,
        audit: inMemoryDeductionsAudit,
      });
      runtimeMode = "memory";
    }
  }

  if (!seeded && runtimeMode === "memory" && deductionsService) {
    seeded = true;
    seedDeductionsWorkspace(deductionsService.repository);
  }

  return deductionsService.api;
}

export function getDeductionsAuditEntries() {
  return inMemoryDeductionsAuditStore.entries;
}

async function probeDeductionsSchema(repository: DeductionWorkspaceRepository) {
  try {
    await repository.list();
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('relation "deduction_case" does not exist')) {
      console.warn("Deductions schema is unavailable; falling back to in-memory deductions workspace.");
      return false;
    }
    throw error;
  }
}

function createDeductionsWorkspaceService(input: {
  repository: DeductionWorkspaceRepository;
  audit: ReturnType<typeof createActivityLogDomainHelpers>;
}) {
  const repository = input.repository;
  const audit = input.audit;

  const api = {
    async getQueueReadModel(): Promise<DeductionQueueReadModel> {
      const records = await repository.list();
      const items = records.map(mapQueueItem);
      return {
        generatedAt: new Date().toISOString(),
        summary: {
          totalOpenCases: items.filter((item) => item.queueStatus !== "synced").length,
          approvalBlockedCases: items.filter((item) => item.queueStatus === "approval_blocked").length,
          syncReadyCases: items.filter((item) => item.queueStatus === "sync_ready").length,
          missingDocumentsCases: items.filter((item) => item.missingDocumentCount > 0).length,
          totalTargetAmountCents: items.reduce((sum, item) => sum + item.targetAmountCents, 0),
        },
        items,
      };
    },

    async getDetailReadModel(caseId: string): Promise<DeductionDetailReadModel> {
      const record = await repository.get(caseId);
      if (!record) {
        throw new DeductionCaseNotFoundError(caseId);
      }
      return mapDetail(record);
    },

    async recordUploadHook(
      principal: Principal,
      input: DeductionUploadHookInput,
    ): Promise<DeductionDetailReadModel> {
      const record = await buildRecordFromUpload(repository, input);
      await repository.save(record);
      audit.append({
        actorId: principal.id,
        actorRole: principal.roles[0] ?? "ar_manager",
        action: "deductions.upload_hook_recorded",
        entityType: "deduction_case",
        entityId: record.deductionCase.id,
        after: toActivitySnapshot(record.deductionCase),
        metadata: {
          sourceChannel: record.deductionCase.sourceChannel,
          targetAmountCents: record.deductionCase.targetAmountCents,
        },
      });
      return mapDetail(record);
    },

    async recordApPortalJobHook(
      principal: Principal,
      input: DeductionApPortalJobHookInput,
    ): Promise<DeductionDetailReadModel> {
      const record = await buildRecordFromApPortal(repository, input);
      await repository.save(record);
      audit.append({
        actorId: principal.id,
        actorRole: principal.roles[0] ?? "ar_manager",
        action: "deductions.ap_portal_hook_recorded",
        entityType: "deduction_case",
        entityId: record.deductionCase.id,
        after: toActivitySnapshot(record.deductionCase),
        metadata: {
          sourceChannel: record.deductionCase.sourceChannel,
          targetAmountCents: record.deductionCase.targetAmountCents,
        },
      });
      return mapDetail(record);
    },

    async refreshCreditMemoDraft(
      principal: Principal,
      caseId: string,
    ): Promise<DeductionCreditMemoRefreshResult> {
      const record = await repository.get(caseId);
      if (!record) {
        throw new DeductionCaseNotFoundError(caseId);
      }

      const now = new Date().toISOString();
      const eligibleLines = record.lineItems.filter(
        (line) => line.status === "accepted" || typeof line.acceptedAmountCents === "number",
      );
      const sourceLines = eligibleLines.length > 0 ? eligibleLines : record.lineItems;
      const draftId = record.creditMemoDraft?.id ?? randomUUID();
      const draftLines = sourceLines
        .filter((line) => (line.acceptedAmountCents ?? line.disputedAmountCents) > 0)
        .map((line) =>
          createCreditMemoDraftLine({
            now,
            actorId: principal.id,
            creditMemoDraftId: draftId,
            deductionLineItemId: line.id,
            lineNumber: line.lineNumber,
            description: line.description,
            amountCents: line.acceptedAmountCents ?? line.disputedAmountCents,
          }),
        );

      const totalAmountCents = draftLines.reduce((sum, line) => sum + line.amountCents, 0);
      const draftState: CreditMemoDraft["state"] = record.deductionCase.approvalRequestId
        ? "approval_pending"
        : "ready_for_review";
      const draftErpSyncStatus: CreditMemoDraft["erpSyncStatus"] = record.deductionCase.approvalRequestId
        ? "blocked"
        : "ready";
      const draftFields = {
        id: draftId,
        deductionCaseId: record.deductionCase.id,
        ...(record.deductionCase.invoiceId ? { invoiceId: record.deductionCase.invoiceId } : {}),
        ...(record.deductionCase.paymentId ? { paymentId: record.deductionCase.paymentId } : {}),
        ...(record.deductionCase.exceptionId ? { exceptionId: record.deductionCase.exceptionId } : {}),
        ...(record.deductionCase.approvalRequestId
          ? { approvalRequestId: record.deductionCase.approvalRequestId }
          : {}),
        ...(record.creditMemoDraft?.memoNumber ? { memoNumber: record.creditMemoDraft.memoNumber } : {}),
        state: draftState,
        reasonCode: record.deductionCase.reasonCode,
        currency: record.deductionCase.currency,
        subtotalAmountCents: totalAmountCents,
        totalAmountCents,
        lastRefreshedAt: now,
        ...(record.creditMemoDraft?.lastSyncedAt ? { lastSyncedAt: record.creditMemoDraft.lastSyncedAt } : {}),
        erpSyncStatus: draftErpSyncStatus,
        metadata: {
          ...(record.creditMemoDraft?.metadata ?? {}),
          refreshedBy: principal.id,
        },
      };
      const draft: CreditMemoDraft = record.creditMemoDraft
        ? {
            ...record.creditMemoDraft,
            ...evolveEntityMetadata(record.creditMemoDraft, {
              at: now,
              actorId: principal.id,
              actorRole: "user",
            }),
            ...draftFields,
          }
        : {
            ...createEntityMetadata({ at: now, actorId: principal.id, actorRole: "user" }),
            ...draftFields,
          };

      const deductionCase: DeductionCase = {
        ...record.deductionCase,
        ...evolveEntityMetadata(record.deductionCase, { at: now, actorId: principal.id, actorRole: "user" }),
        state: record.deductionCase.approvalRequestId ? "approval_pending" : "credit_memo_draft",
        queueStatus: record.deductionCase.approvalRequestId ? "approval_blocked" : "sync_ready",
      };

      await repository.save({
        ...record,
        deductionCase,
        creditMemoDraft: draft,
        creditMemoDraftLines: draftLines,
      });
      audit.append({
        actorId: principal.id,
        actorRole: principal.roles[0] ?? "ar_manager",
        action: "deductions.credit_memo_refreshed",
        entityType: "deduction_case",
        entityId: caseId,
        before: toActivitySnapshot(record.creditMemoDraft),
        after: toActivitySnapshot(draft),
        metadata: {
          lineCount: draftLines.length,
          totalAmountCents,
          approvalBlocked: Boolean(record.deductionCase.approvalRequestId),
        },
      });

      return {
        deductionCaseId: caseId,
        creditMemoDraftId: draft.id,
        state: draft.state,
        totalAmountCents: draft.totalAmountCents,
        lineCount: draftLines.length,
      };
    },

    async syncCreditMemoDraft(
      principal: Principal,
      caseId: string,
    ): Promise<DeductionCreditMemoSyncResult> {
      const record = await repository.get(caseId);
      if (!record) {
        throw new DeductionCaseNotFoundError(caseId);
      }
      if (!record.creditMemoDraft) {
        throw new DeductionSyncBlockedError("Refresh the credit memo draft before syncing.");
      }
      if (record.creditMemoDraft.totalAmountCents <= 0) {
        throw new DeductionSyncBlockedError("Credit memo draft total must be greater than zero.");
      }
      if (!record.approval || record.approval.status !== "approved") {
        throw new DeductionSyncBlockedError("Credit memo sync requires an approved linked approval request.");
      }

      const now = new Date().toISOString();
      const creditMemoDraft: CreditMemoDraft = {
        ...record.creditMemoDraft,
        ...evolveEntityMetadata(record.creditMemoDraft, { at: now, actorId: principal.id, actorRole: "user" }),
        state: "synced",
        erpSyncStatus: "synced",
        lastSyncedAt: now,
        metadata: {
          ...record.creditMemoDraft.metadata,
          syncedBy: principal.id,
        },
      };
      const deductionCase: DeductionCase = {
        ...record.deductionCase,
        ...evolveEntityMetadata(record.deductionCase, { at: now, actorId: principal.id, actorRole: "user" }),
        state: "synced",
        queueStatus: "synced",
      };
      const lineItems = record.lineItems.map((line) =>
        line.status === "accepted" || typeof line.acceptedAmountCents === "number"
          ? {
              ...line,
              ...evolveEntityMetadata(line, { at: now, actorId: principal.id, actorRole: "user" }),
              status: "credited" as const,
            }
          : line,
      );

      await repository.save({
        ...record,
        deductionCase,
        creditMemoDraft,
        lineItems,
      });
      audit.append({
        actorId: principal.id,
        actorRole: principal.roles[0] ?? "controller",
        action: "deductions.credit_memo_synced",
        entityType: "deduction_case",
        entityId: caseId,
        before: toActivitySnapshot(record.creditMemoDraft),
        after: toActivitySnapshot(creditMemoDraft),
        metadata: {
          totalAmountCents: creditMemoDraft.totalAmountCents,
          approvalRequestId: record.approval?.id ?? null,
        },
      });

      return {
        deductionCaseId: caseId,
        creditMemoDraftId: creditMemoDraft.id,
        state: creditMemoDraft.state,
        erpSyncStatus: creditMemoDraft.erpSyncStatus,
        syncedAt: now,
      };
    },
  };

  return { repository, api };
}

function seedDeductionsWorkspace(repository: DeductionWorkspaceRepository) {
  if (!(repository instanceof InMemoryDeductionWorkspaceRepository)) {
    return;
  }

  const now = "2026-04-01T08:00:00.000Z";
  const invoice = makeInvoice({
    id: "invoice-deduction-1",
    state: "credit_pending",
    invoiceNumber: "INV-DED-1001",
    amountCents: 250_000_00,
    currency: "PHP",
  });
  const payment = makePayment({
    id: "payment-deduction-1",
    state: "partially_applied",
    paymentReference: "PAY-DED-9001",
    amountCents: 200_000_00,
    currency: "PHP",
  });
  const account = makeBillingAccount({
    id: "billing-deduction-1",
    displayName: "Metro Retail Group - Deductions",
    currency: "PHP",
  });
  const deductionCase: DeductionCase = {
    id: "deduction-case-1",
    ...createEntityMetadata({ at: now, actorId: "seed_user", actorRole: "system" }),
    parentAccountId: account.parentAccountId,
    billingAccountId: account.id,
    branchId: "branch-default",
    invoiceId: invoice.id,
    paymentId: payment.id,
    exceptionId: "exception-deduction-1",
    approvalRequestId: "approval-deduction-1",
    externalClaimReference: "CLAIM-7781",
    state: "triaged",
    queueStatus: "approval_blocked",
    reasonCode: "pricing",
    priority: "high",
    sourceChannel: "ap_portal",
    sourceJobId: "portal-job-1",
    ownerRole: "ar_manager",
    detectedAt: now,
    openedAt: now,
    targetAmountCents: 50_000_00,
    currency: "PHP",
    metadata: {},
  };
  const claims: Claim[] = [
    {
      id: "claim-1",
      ...createEntityMetadata({ at: now, actorId: "seed_user", actorRole: "system" }),
      deductionCaseId: deductionCase.id,
      invoiceId: invoice.id,
      paymentId: payment.id,
      exceptionId: "exception-deduction-1",
      claimNumber: "CLAIM-7781",
      claimantName: "Metro AP Shared Services",
      sourceChannel: "ap_portal",
      assertedAt: now,
      status: "validated",
      assertedAmountCents: 50_000_00,
      currency: "PHP",
      metadata: {},
    },
  ];
  const lineItems: DeductionLineItem[] = [
    {
      id: "deduction-line-1",
      ...createEntityMetadata({ at: now, actorId: "seed_user", actorRole: "system" }),
      deductionCaseId: deductionCase.id,
      invoiceId: invoice.id,
      paymentId: payment.id,
      exceptionId: "exception-deduction-1",
      claimId: claims[0]!.id,
      lineNumber: 1,
      category: "pricing",
      description: "Off-invoice trade promotion deduction",
      disputedAmountCents: 50_000_00,
      acceptedAmountCents: 45_000_00,
      status: "accepted",
      metadata: {},
    },
  ];
  const documentBundle: DeductionDocumentBundle = {
    id: "bundle-1",
    ...createEntityMetadata({ at: now, actorId: "seed_user", actorRole: "system" }),
    deductionCaseId: deductionCase.id,
    invoiceId: invoice.id,
    paymentId: payment.id,
    status: "partial",
    completenessScore: 0.67,
    missingDocumentTypes: ["delivery_receipt"],
    documentIds: ["doc-proof-1", "doc-claim-1"],
    metadata: {},
  };

  repository.seed({
    deductionCase,
    account: { id: account.id, displayName: account.displayName },
    invoice: {
      id: invoice.id,
      state: invoice.state,
      invoiceNumber: invoice.invoiceNumber,
      amountCents: invoice.amountCents,
      currency: invoice.currency,
    },
    payment: {
      id: payment.id,
      state: payment.state,
      paymentReference: payment.paymentReference,
      amountCents: payment.amountCents,
      currency: payment.currency,
    },
    exception: {
      id: "exception-deduction-1",
      state: "waiting_on_internal",
      summary: "Short payment pending pricing support.",
    },
    approval: {
      id: "approval-deduction-1",
      status: "pending_approval",
      requestType: "credit_memo_sync",
    },
    lineItems,
    claims,
    documentBundle,
    creditMemoDraftLines: [],
  });
}

function mapQueueItem(record: DeductionWorkspaceRecord) {
  const missingDocumentCount = record.documentBundle?.missingDocumentTypes.length ?? 0;
  const claimCount = record.claims.length;
  const nextAction =
    missingDocumentCount > 0
      ? "Complete missing deduction support bundle."
      : record.creditMemoDraft
        ? record.approval?.status === "approved"
          ? "Sync approved credit memo to ERP."
          : "Resolve approval gate before ERP sync."
        : "Refresh the credit memo draft from accepted deduction lines.";

  return {
    deductionCaseId: record.deductionCase.id,
    ...(record.deductionCase.invoiceId ? { invoiceId: record.deductionCase.invoiceId } : {}),
    ...(record.deductionCase.paymentId ? { paymentId: record.deductionCase.paymentId } : {}),
    ...(record.deductionCase.exceptionId ? { exceptionId: record.deductionCase.exceptionId } : {}),
    ...(record.deductionCase.approvalRequestId
      ? { approvalRequestId: record.deductionCase.approvalRequestId }
      : {}),
    accountName: record.account.displayName,
    ...(record.invoice?.invoiceNumber ? { invoiceNumber: record.invoice.invoiceNumber } : {}),
    ...(record.payment?.paymentReference ? { paymentReference: record.payment.paymentReference } : {}),
    reasonCode: record.deductionCase.reasonCode,
    queueStatus: record.deductionCase.queueStatus,
    priority: record.deductionCase.priority,
    sourceChannel: record.deductionCase.sourceChannel,
    targetAmountCents: record.deductionCase.targetAmountCents,
    currency: record.deductionCase.currency,
    missingDocumentCount,
    claimCount,
    ...(record.creditMemoDraft?.state ? { creditMemoState: record.creditMemoDraft.state } : {}),
    detectedAt: record.deductionCase.detectedAt,
    nextAction,
  };
}

function mapDetail(record: DeductionWorkspaceRecord): DeductionDetailReadModel {
  return {
    deductionCase: {
      id: record.deductionCase.id,
      state: record.deductionCase.state,
      queueStatus: record.deductionCase.queueStatus,
      reasonCode: record.deductionCase.reasonCode,
      priority: record.deductionCase.priority,
      sourceChannel: record.deductionCase.sourceChannel,
      targetAmountCents: record.deductionCase.targetAmountCents,
      currency: record.deductionCase.currency,
      detectedAt: record.deductionCase.detectedAt,
      openedAt: record.deductionCase.openedAt,
      ...(record.deductionCase.externalClaimReference
        ? { externalClaimReference: record.deductionCase.externalClaimReference }
        : {}),
      ...(record.deductionCase.ownerRole ? { ownerRole: record.deductionCase.ownerRole } : {}),
      metadata: record.deductionCase.metadata,
    },
    relatedRecords: {
      ...(record.invoice
        ? {
            invoice: {
              id: record.invoice.id,
              status: record.invoice.state,
              label: record.invoice.invoiceNumber,
              amountCents: record.invoice.amountCents,
              currency: record.invoice.currency,
            },
          }
        : {}),
      ...(record.payment
        ? {
            payment: {
              id: record.payment.id,
              status: record.payment.state,
              label: record.payment.paymentReference,
              amountCents: record.payment.amountCents,
              currency: record.payment.currency,
            },
          }
        : {}),
      ...(record.exception
        ? {
            exception: {
              id: record.exception.id,
              status: record.exception.state,
              label: record.exception.summary,
            },
          }
        : {}),
      ...(record.approval
        ? {
            approval: {
              id: record.approval.id,
              status: record.approval.status,
              label: record.approval.requestType,
            },
          }
        : {}),
    },
    lineItems: record.lineItems.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      category: line.category,
      description: line.description,
      disputedAmountCents: line.disputedAmountCents,
      ...(typeof line.acceptedAmountCents === "number" ? { acceptedAmountCents: line.acceptedAmountCents } : {}),
      status: line.status,
    })),
    claims: record.claims.map((claim) => ({
      id: claim.id,
      claimNumber: claim.claimNumber,
      status: claim.status,
      sourceChannel: claim.sourceChannel,
      assertedAmountCents: claim.assertedAmountCents,
      assertedAt: claim.assertedAt,
      ...(claim.claimantName ? { claimantName: claim.claimantName } : {}),
    })),
    ...(record.documentBundle
      ? {
          documentBundle: {
            id: record.documentBundle.id,
            status: record.documentBundle.status,
            completenessScore: record.documentBundle.completenessScore,
            documentIds: record.documentBundle.documentIds,
            missingDocumentTypes: record.documentBundle.missingDocumentTypes,
          },
        }
      : {}),
    ...(record.creditMemoDraft
      ? {
          creditMemoDraft: {
            id: record.creditMemoDraft.id,
            state: record.creditMemoDraft.state,
            subtotalAmountCents: record.creditMemoDraft.subtotalAmountCents,
            totalAmountCents: record.creditMemoDraft.totalAmountCents,
            erpSyncStatus: record.creditMemoDraft.erpSyncStatus,
            ...(record.creditMemoDraft.memoNumber ? { memoNumber: record.creditMemoDraft.memoNumber } : {}),
            lastRefreshedAt: record.creditMemoDraft.lastRefreshedAt,
            ...(record.creditMemoDraft.lastSyncedAt ? { lastSyncedAt: record.creditMemoDraft.lastSyncedAt } : {}),
            lines: record.creditMemoDraftLines.map((line) => ({
              id: line.id,
              lineNumber: line.lineNumber,
              description: line.description,
              amountCents: line.amountCents,
            })),
          },
        }
      : {}),
  };
}

async function buildRecordFromUpload(
  repository: DeductionWorkspaceRepository,
  input: DeductionUploadHookInput,
): Promise<DeductionWorkspaceRecord> {
  const now = input.detectedAt;
  const existing = input.caseId ? await repository.get(input.caseId) : undefined;
  const caseId = input.caseId ?? randomUUID();
  const deductionState: DeductionCase["state"] = input.missingDocumentTypes?.length ? "gathering_support" : "triaged";
  const deductionQueueStatus: DeductionCase["queueStatus"] = input.missingDocumentTypes?.length
    ? "needs_documents"
    : "ready_for_review";
  const deductionSourceChannel: DeductionCase["sourceChannel"] = "upload";
  const deductionCaseFields = {
    id: caseId,
    parentAccountId: input.parentAccountId,
    billingAccountId: input.billingAccountId,
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
    ...(input.paymentId ? { paymentId: input.paymentId } : {}),
    ...(input.exceptionId ? { exceptionId: input.exceptionId } : {}),
    ...(input.approvalRequestId ? { approvalRequestId: input.approvalRequestId } : {}),
    ...(input.externalClaimReference ? { externalClaimReference: input.externalClaimReference } : {}),
    state: deductionState,
    queueStatus: deductionQueueStatus,
    reasonCode: normalizeReasonCode(input.reasonCode),
    priority: normalizePriority(input.priority),
    sourceChannel: deductionSourceChannel,
    ...(input.ownerRole ? { ownerRole: input.ownerRole } : {}),
    detectedAt: input.detectedAt,
    openedAt: existing?.deductionCase.openedAt ?? input.detectedAt,
    targetAmountCents: input.targetAmountCents,
    currency: input.currency,
    metadata: input.metadata ?? {},
  };
  const deductionCase: DeductionCase = existing
    ? {
        ...existing.deductionCase,
        ...evolveEntityMetadata(existing.deductionCase, { at: now, actorId: "upload_job", actorRole: "system" }),
        ...deductionCaseFields,
      }
    : {
        ...createEntityMetadata({ at: now, actorId: "upload_job", actorRole: "system" }),
        ...deductionCaseFields,
      };

  const documentBundleId = existing?.documentBundle?.id ?? randomUUID();
  const documentBundleFields = {
    id: documentBundleId,
    deductionCaseId: caseId,
    ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
    ...(input.paymentId ? { paymentId: input.paymentId } : {}),
    status: bundleStatus(input.uploadedDocumentIds, input.missingDocumentTypes),
    completenessScore: completenessScore(input.uploadedDocumentIds, input.missingDocumentTypes),
    missingDocumentTypes: input.missingDocumentTypes ?? [],
    documentIds: input.uploadedDocumentIds,
    metadata: {},
  };
  const documentBundle: DeductionDocumentBundle = existing?.documentBundle
    ? {
        ...existing.documentBundle,
        ...evolveEntityMetadata(existing.documentBundle, {
          at: now,
          actorId: "upload_job",
          actorRole: "system",
        }),
        ...documentBundleFields,
      }
    : {
        ...createEntityMetadata({ at: now, actorId: "upload_job", actorRole: "system" }),
        ...documentBundleFields,
      };

  return {
    deductionCase,
    account: { id: input.billingAccountId, displayName: existing?.account.displayName ?? "Unknown billing account" },
    ...(existing?.invoice ? { invoice: existing.invoice } : {}),
    ...(existing?.payment ? { payment: existing.payment } : {}),
    ...(existing?.exception ? { exception: existing.exception } : {}),
    ...(existing?.approval ? { approval: existing.approval } : {}),
    lineItems: buildLineItems({
      existing: existing?.lineItems ?? [],
      input: input.lineItems ?? [],
      caseId,
      ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
      ...(input.paymentId ? { paymentId: input.paymentId } : {}),
      ...(input.exceptionId ? { exceptionId: input.exceptionId } : {}),
      now,
      actorId: "upload_job",
    }),
    claims: buildClaims({
      existing: existing?.claims ?? [],
      input: input.claims ?? [],
      caseId,
      ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
      ...(input.paymentId ? { paymentId: input.paymentId } : {}),
      ...(input.exceptionId ? { exceptionId: input.exceptionId } : {}),
      sourceChannel: "upload",
      currency: input.currency,
      now,
      actorId: "upload_job",
    }),
    documentBundle,
    ...(existing?.creditMemoDraft ? { creditMemoDraft: existing.creditMemoDraft } : {}),
    creditMemoDraftLines: existing?.creditMemoDraftLines ?? [],
  };
}

async function buildRecordFromApPortal(
  repository: DeductionWorkspaceRepository,
  input: DeductionApPortalJobHookInput,
): Promise<DeductionWorkspaceRecord> {
  const base = await buildRecordFromUpload(repository, {
    ...(input.caseId ? { caseId: input.caseId } : {}),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    parentAccountId: input.parentAccountId,
    billingAccountId: input.billingAccountId,
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
    ...(input.paymentId ? { paymentId: input.paymentId } : {}),
    ...(input.exceptionId ? { exceptionId: input.exceptionId } : {}),
    ...(input.approvalRequestId ? { approvalRequestId: input.approvalRequestId } : {}),
    externalClaimReference: input.externalClaimReference,
    targetAmountCents: input.targetAmountCents,
    currency: input.currency,
    reasonCode: input.reasonCode,
    ...(input.priority ? { priority: input.priority } : {}),
    detectedAt: input.detectedAt,
    uploadedDocumentIds: input.documentIds ?? [],
    ...(input.lineItems ? { lineItems: input.lineItems } : {}),
    claims: [input.claim],
    metadata: {
      ...input.metadata,
      sourceJobId: input.sourceJobId,
    },
  });

  return {
    ...base,
    deductionCase: {
      ...base.deductionCase,
      sourceChannel: "ap_portal",
      sourceJobId: input.sourceJobId,
      queueStatus:
        base.documentBundle && base.documentBundle.missingDocumentTypes.length > 0
          ? "needs_documents"
          : "ready_for_review",
    },
  };
}

function buildLineItems(params: {
  existing: DeductionLineItem[];
  input: DeductionLineItemInput[];
  caseId: string;
  invoiceId?: string;
  paymentId?: string;
  exceptionId?: string;
  now: string;
  actorId: string;
}) {
  if (params.input.length === 0) {
    return params.existing;
  }

  return params.input.map((line) => ({
    id: line.id ?? randomUUID(),
    ...createEntityMetadata({ at: params.now, actorId: params.actorId, actorRole: "system" }),
    deductionCaseId: params.caseId,
    ...(params.invoiceId ? { invoiceId: params.invoiceId } : {}),
    ...(params.paymentId ? { paymentId: params.paymentId } : {}),
    ...(params.exceptionId ? { exceptionId: params.exceptionId } : {}),
    ...(line.claimId ? { claimId: line.claimId } : {}),
    lineNumber: line.lineNumber,
    category: normalizeReasonCode(line.category),
    description: line.description,
    ...(typeof line.quantity === "number" ? { quantity: line.quantity } : {}),
    ...(typeof line.unitAmountCents === "number" ? { unitAmountCents: line.unitAmountCents } : {}),
    disputedAmountCents: line.disputedAmountCents,
    ...(typeof line.acceptedAmountCents === "number"
      ? { acceptedAmountCents: line.acceptedAmountCents }
      : {}),
    status: normalizeLineStatus(line.status),
    metadata: line.metadata ?? {},
  }));
}

function buildClaims(params: {
  existing: Claim[];
  input: ClaimInput[];
  caseId: string;
  invoiceId?: string;
  paymentId?: string;
  exceptionId?: string;
  sourceChannel: "upload" | "ap_portal";
  currency: string;
  now: string;
  actorId: string;
}) {
  if (params.input.length === 0) {
    return params.existing;
  }

  return params.input.map((claim) => ({
    id: claim.id ?? randomUUID(),
    ...createEntityMetadata({ at: params.now, actorId: params.actorId, actorRole: "system" }),
    deductionCaseId: params.caseId,
    ...(params.invoiceId ? { invoiceId: params.invoiceId } : {}),
    ...(params.paymentId ? { paymentId: params.paymentId } : {}),
    ...(params.exceptionId ? { exceptionId: params.exceptionId } : {}),
    claimNumber: claim.claimNumber,
    ...(claim.claimantName ? { claimantName: claim.claimantName } : {}),
    sourceChannel: claim.sourceChannel === "ap_portal" ? "ap_portal" : params.sourceChannel,
    assertedAt: claim.assertedAt,
    status: normalizeClaimStatus(claim.status),
    assertedAmountCents: claim.assertedAmountCents,
    currency: params.currency,
    metadata: claim.metadata ?? {},
  }));
}

function createCreditMemoDraftLine(input: {
  now: string;
  actorId: string;
  creditMemoDraftId: string;
  deductionLineItemId?: string;
  lineNumber: number;
  description: string;
  amountCents: number;
}): CreditMemoDraftLine {
  return {
    id: randomUUID(),
    ...createEntityMetadata({ at: input.now, actorId: input.actorId, actorRole: "user" }),
    creditMemoDraftId: input.creditMemoDraftId,
    ...(input.deductionLineItemId ? { deductionLineItemId: input.deductionLineItemId } : {}),
    lineNumber: input.lineNumber,
    description: input.description,
    amountCents: input.amountCents,
    metadata: {},
  };
}

function normalizeReasonCode(reasonCode: string): DeductionCase["reasonCode"] {
  return reasonCode === "pricing" ||
    reasonCode === "short_shipment" ||
    reasonCode === "damaged_goods" ||
    reasonCode === "returns" ||
    reasonCode === "trade_promo" ||
    reasonCode === "tax" ||
    reasonCode === "logistics" ||
    reasonCode === "unclassified"
    ? reasonCode
    : "unclassified";
}

function normalizePriority(priority?: string): DeductionCase["priority"] {
  return priority === "low" || priority === "medium" || priority === "high" || priority === "critical"
    ? priority
    : "medium";
}

function normalizeLineStatus(status?: string): DeductionLineItem["status"] {
  return status === "open" ||
    status === "under_review" ||
    status === "accepted" ||
    status === "rejected" ||
    status === "credited"
    ? status
    : "open";
}

function normalizeClaimStatus(status?: string): Claim["status"] {
  return status === "received" ||
    status === "validated" ||
    status === "needs_support" ||
    status === "rejected" ||
    status === "resolved"
    ? status
    : "received";
}

function bundleStatus(documentIds: string[], missingDocumentTypes?: string[]): DeductionDocumentBundle["status"] {
  if (documentIds.length === 0) {
    return "missing_documents";
  }
  return missingDocumentTypes && missingDocumentTypes.length > 0 ? "partial" : "complete";
}

function completenessScore(documentIds: string[], missingDocumentTypes?: string[]) {
  const missingCount = missingDocumentTypes?.length ?? 0;
  const total = documentIds.length + missingCount;
  if (total === 0) {
    return 0;
  }
  return Number((documentIds.length / total).toFixed(2));
}

function toSqlNullableText(value: string | undefined) {
  return value ? `'${quoteLiteral(value)}'` : "NULL";
}

function toSqlNullableUuid(value: string | undefined) {
  return value ? `'${quoteLiteral(value)}'::uuid` : "NULL";
}

function toSqlNullableTimestamp(value: string | undefined) {
  return value ? `'${quoteLiteral(value)}'::timestamptz` : "NULL";
}
