import { createHash } from "node:crypto";
import type { ApprovalRequestRepository } from "@o2c/domain";
import type { ApprovalRequest, Invoice } from "@o2c/domain";
import type {
  BirInvoiceCaseRecord,
  BirInvoiceDuplicateCandidate,
  BirInvoiceHierarchyContext,
  BirInvoiceParserResult,
  BirInvoiceReviewCase,
  ErpInvoiceCandidate,
} from "@o2c/contracts";
import type { StoredBirInvoiceCaseRecord } from "@o2c/workflows";
import {
  executeSqlCommand,
  jsonLiteral,
  queryJsonRows,
  quoteLiteral,
} from "./postgres.js";

interface ImmutableActivityLogEntry {
  id: string;
  occurredAt: string;
  action: string;
  actorId: string;
  actorRole: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

interface ImmutableActivityLogStore {
  append(entry: ImmutableActivityLogEntry): void | Promise<void>;
}

interface AuditContext {
  actorId: string;
  actorType: "user" | "system" | "automation";
  correlationId: string;
  occurredAt: string;
}

interface AuditEvent {
  action: string;
  entityId: string;
  entityType: string;
  metadata?: Record<string, string | number | boolean | null>;
}

interface AuditLogger {
  log(context: AuditContext, event: AuditEvent): Promise<void>;
}

export interface StoredRemittanceRecord {
  remittance: {
    id: string;
    tenantId?: string;
    createdAt: string;
    updatedAt: string;
    state: string;
    uploadedDocumentId?: string;
    paymentId?: string;
    sourceChannel: string;
    rawPayload?: Record<string, unknown>;
    metadata: Record<string, unknown>;
    version?: number;
  };
  source: Record<string, unknown>;
  parsed?: Record<string, unknown>;
  paymentCandidates: Record<string, unknown>[];
  invoiceCandidates: Record<string, unknown>[];
  linkedPaymentId?: string;
  review?: Record<string, unknown>;
}

interface RemittanceRepository {
  save(record: StoredRemittanceRecord): Promise<void>;
  get(remittanceId: string): Promise<StoredRemittanceRecord | undefined>;
}

export class PostgresImmutableActivityLogStore implements ImmutableActivityLogStore {
  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId = "default",
  ) {}

  append(entry: ImmutableActivityLogEntry): void {
    const beforeState = readState(entry.before);
    const afterState = readState(entry.after);
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO activity_log (
          id,
          tenant_id,
          entity_type,
          entity_id,
          action,
          actor_id,
          actor_role,
          occurred_at,
          from_state,
          to_state,
          payload,
          created_at,
          updated_at,
          version,
          created_by_actor_id,
          created_by_actor_role,
          updated_by_actor_id,
          updated_by_actor_role
        )
        VALUES (
          '${quoteLiteral(entry.id)}'::uuid,
          '${quoteLiteral(this.tenantId)}',
          '${quoteLiteral(entry.entityType)}',
          '${quoteLiteral(entry.entityId)}'::uuid,
          '${quoteLiteral(entry.action)}',
          '${quoteLiteral(entry.actorId)}',
          '${quoteLiteral(entry.actorRole)}',
          '${quoteLiteral(entry.occurredAt)}'::timestamptz,
          ${beforeState ? `'${quoteLiteral(beforeState)}'` : "NULL"},
          ${afterState ? `'${quoteLiteral(afterState)}'` : "NULL"},
          '${jsonLiteral({
            before: entry.before ?? null,
            after: entry.after ?? null,
            metadata: entry.metadata,
          })}'::jsonb,
          '${quoteLiteral(entry.occurredAt)}'::timestamptz,
          '${quoteLiteral(entry.occurredAt)}'::timestamptz,
          1,
          '${quoteLiteral(entry.actorId)}',
          '${quoteLiteral(entry.actorRole)}',
          '${quoteLiteral(entry.actorId)}',
          '${quoteLiteral(entry.actorRole)}'
        )
      `,
    );
  }
}

export class PostgresAuditLogger implements AuditLogger {
  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId = "default",
  ) {}

  async log(context: AuditContext, event: AuditEvent): Promise<void> {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO activity_log (
          id,
          tenant_id,
          entity_type,
          entity_id,
          action,
          actor_id,
          actor_role,
          occurred_at,
          payload,
          created_at,
          updated_at,
          version,
          created_by_actor_id,
          created_by_actor_role,
          updated_by_actor_id,
          updated_by_actor_role
        )
        VALUES (
          gen_random_uuid(),
          '${quoteLiteral(this.tenantId)}',
          '${quoteLiteral(event.entityType)}',
          '${quoteLiteral(event.entityId)}'::uuid,
          '${quoteLiteral(event.action)}',
          '${quoteLiteral(context.actorId)}',
          '${quoteLiteral(mapActorRole(context.actorType))}',
          '${quoteLiteral(context.occurredAt)}'::timestamptz,
          '${jsonLiteral({
            metadata: event.metadata ?? {},
            correlationId: context.correlationId,
          })}'::jsonb,
          '${quoteLiteral(context.occurredAt)}'::timestamptz,
          '${quoteLiteral(context.occurredAt)}'::timestamptz,
          1,
          '${quoteLiteral(context.actorId)}',
          '${quoteLiteral(mapActorRole(context.actorType))}',
          '${quoteLiteral(context.actorId)}',
          '${quoteLiteral(mapActorRole(context.actorType))}'
        )
      `,
    );
  }
}

type ApprovalRequestRow = {
  id: string;
  requestType: string;
  status: ApprovalRequest["status"];
  requestedBy: string;
  assigneeRole?: ApprovalRequest["assigneeRole"];
  currentStep?: string;
  requestedAt: string;
  resolvedAt?: string;
  terminalAt?: string;
  reopenedFromStatus?: ApprovalRequest["reopenedFromStatus"];
  payload: Record<string, unknown>;
  policyContext: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
  tenantId?: string;
  deletedAt?: string | null;
  createdByActorId?: string;
  createdByActorRole?: ApprovalRequest["createdByActorRole"];
  updatedByActorId?: string;
  updatedByActorRole?: ApprovalRequest["updatedByActorRole"];
};

export class PostgresApprovalRequestRepository implements ApprovalRequestRepository {
  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId = "default",
  ) {}

  async save(request: ApprovalRequest): Promise<void> {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO approval_requests (
          id,
          tenant_id,
          entity_type,
          entity_id,
          request_type,
          status,
          requested_by,
          requested_at,
          resolved_at,
          terminal_at,
          assignee_role,
          current_step,
          reopened_from_status,
          payload,
          policy_context,
          metadata,
          created_at,
          updated_at,
          version,
          deleted_at,
          created_by_actor_id,
          created_by_actor_role,
          updated_by_actor_id,
          updated_by_actor_role
        )
        VALUES (
          '${quoteLiteral(request.id)}'::uuid,
          '${quoteLiteral(request.tenantId ?? this.tenantId)}',
          'approval_request',
          '${quoteLiteral(request.id)}'::uuid,
          '${quoteLiteral(request.requestType)}',
          '${quoteLiteral(request.status)}',
          '${quoteLiteral(request.requestedBy)}',
          '${quoteLiteral(request.requestedAt)}'::timestamptz,
          ${request.resolvedAt ? `'${quoteLiteral(request.resolvedAt)}'::timestamptz` : "NULL"},
          ${request.terminalAt ? `'${quoteLiteral(request.terminalAt)}'::timestamptz` : "NULL"},
          ${request.assigneeRole ? `'${quoteLiteral(request.assigneeRole)}'` : "NULL"},
          ${request.currentStep ? `'${quoteLiteral(request.currentStep)}'` : "NULL"},
          ${request.reopenedFromStatus ? `'${quoteLiteral(request.reopenedFromStatus)}'` : "NULL"},
          '${jsonLiteral(request.payload)}'::jsonb,
          '${jsonLiteral(request.policyContext)}'::jsonb,
          '${jsonLiteral({})}'::jsonb,
          '${quoteLiteral(request.createdAt)}'::timestamptz,
          '${quoteLiteral(request.updatedAt)}'::timestamptz,
          ${request.version},
          ${request.deletedAt ? `'${quoteLiteral(request.deletedAt)}'::timestamptz` : "NULL"},
          ${request.createdByActorId ? `'${quoteLiteral(request.createdByActorId)}'` : "NULL"},
          ${request.createdByActorRole ? `'${quoteLiteral(request.createdByActorRole)}'` : "NULL"},
          ${request.updatedByActorId ? `'${quoteLiteral(request.updatedByActorId)}'` : "NULL"},
          ${request.updatedByActorRole ? `'${quoteLiteral(request.updatedByActorRole)}'` : "NULL"}
        )
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          requested_by = EXCLUDED.requested_by,
          requested_at = EXCLUDED.requested_at,
          resolved_at = EXCLUDED.resolved_at,
          terminal_at = EXCLUDED.terminal_at,
          assignee_role = EXCLUDED.assignee_role,
          current_step = EXCLUDED.current_step,
          reopened_from_status = EXCLUDED.reopened_from_status,
          payload = EXCLUDED.payload,
          policy_context = EXCLUDED.policy_context,
          updated_at = EXCLUDED.updated_at,
          version = EXCLUDED.version,
          deleted_at = EXCLUDED.deleted_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role
      `,
    );
  }

  async get(approvalId: string): Promise<ApprovalRequest | undefined> {
    const [row] = queryJsonRows<ApprovalRequestRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id::text AS "id",
            request_type AS "requestType",
            status,
            requested_by AS "requestedBy",
            assignee_role AS "assigneeRole",
            current_step AS "currentStep",
            requested_at AS "requestedAt",
            resolved_at AS "resolvedAt",
            terminal_at AS "terminalAt",
            reopened_from_status AS "reopenedFromStatus",
            payload,
            policy_context AS "policyContext",
            version,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            tenant_id AS "tenantId",
            deleted_at AS "deletedAt",
            created_by_actor_id AS "createdByActorId",
            created_by_actor_role AS "createdByActorRole",
            updated_by_actor_id AS "updatedByActorId",
            updated_by_actor_role AS "updatedByActorRole"
          FROM approval_requests
          WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
            AND deleted_at IS NULL
            AND id = '${quoteLiteral(approvalId)}'::uuid
          LIMIT 1
        ) q
      `,
    );

    return row ? toApprovalRequest(row) : undefined;
  }

  async list(): Promise<ApprovalRequest[]> {
    const rows = queryJsonRows<ApprovalRequestRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id::text AS "id",
            request_type AS "requestType",
            status,
            requested_by AS "requestedBy",
            assignee_role AS "assigneeRole",
            current_step AS "currentStep",
            requested_at AS "requestedAt",
            resolved_at AS "resolvedAt",
            terminal_at AS "terminalAt",
            reopened_from_status AS "reopenedFromStatus",
            payload,
            policy_context AS "policyContext",
            version,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            tenant_id AS "tenantId",
            deleted_at AS "deletedAt",
            created_by_actor_id AS "createdByActorId",
            created_by_actor_role AS "createdByActorRole",
            updated_by_actor_id AS "updatedByActorId",
            updated_by_actor_role AS "updatedByActorRole"
          FROM approval_requests
          WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
            AND deleted_at IS NULL
          ORDER BY requested_at DESC
        ) q
      `,
    );

    return rows.map(toApprovalRequest);
  }
}

type BirInvoiceCaseRow = {
  uploadedDocument: BirInvoiceCaseRecord["uploadedDocument"];
  parserResult: BirInvoiceParserResult;
  hierarchy: BirInvoiceHierarchyContext;
  duplicateCandidates: BirInvoiceDuplicateCandidate[];
  erpCandidates: ErpInvoiceCandidate[];
  reviewCase: BirInvoiceReviewCase;
  status: BirInvoiceCaseRecord["status"];
  humanConfirmed: boolean;
  matchedErpInvoiceId?: string;
  lockedAt?: string;
  lockedByActorId?: string;
  createdAt: string;
  updatedAt: string;
  provisionalInvoice?: Invoice;
};

export class PostgresBirInvoiceCaseRepository {
  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId = "default",
  ) {}

  async save(record: StoredBirInvoiceCaseRecord): Promise<void> {
    const internalDocumentId = toDeterministicUuid(`uploaded_document:${record.documentId}`);
    const uploadedDocument = record.uploadedDocument;
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO uploaded_document (
          id,
          tenant_id,
          version,
          created_at,
          updated_at,
          deleted_at,
          created_by_actor_id,
          created_by_actor_role,
          updated_by_actor_id,
          updated_by_actor_role,
          document_type,
          source,
          storage_key,
          checksum,
          uploaded_by,
          uploaded_at,
          metadata
        )
        VALUES (
          '${quoteLiteral(internalDocumentId)}'::uuid,
          '${quoteLiteral(this.tenantId)}',
          1,
          '${quoteLiteral(record.createdAt)}'::timestamptz,
          '${quoteLiteral(record.updatedAt)}'::timestamptz,
          NULL,
          '${quoteLiteral(uploadedDocument.uploadedBy)}',
          'system',
          '${quoteLiteral(uploadedDocument.uploadedBy)}',
          'system',
          'bir_invoice',
          '${quoteLiteral(uploadedDocument.source)}',
          '${quoteLiteral(uploadedDocument.storageKey ?? `uploads/${record.documentId}`)}',
          '${quoteLiteral(record.parserResult.metadata.fileHash)}',
          '${quoteLiteral(uploadedDocument.uploadedBy)}',
          '${quoteLiteral(uploadedDocument.uploadedAt)}'::timestamptz,
          '${jsonLiteral({
            externalDocumentId: record.documentId,
            fileName: uploadedDocument.fileName,
            mimeType: uploadedDocument.mimeType,
            parserVersion: record.parserResult.metadata.parserVersion,
            overallConfidence: record.parserResult.metadata.overallConfidence,
          })}'::jsonb
        )
        ON CONFLICT (id) DO UPDATE SET
          updated_at = EXCLUDED.updated_at,
          source = EXCLUDED.source,
          storage_key = EXCLUDED.storage_key,
          checksum = EXCLUDED.checksum,
          uploaded_by = EXCLUDED.uploaded_by,
          uploaded_at = EXCLUDED.uploaded_at,
          metadata = uploaded_document.metadata || EXCLUDED.metadata
      `,
    );

    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO uploaded_document_processing_record (
          document_id,
          tenant_id,
          parser_result,
          hierarchy,
          duplicate_candidates,
          erp_candidates,
          review_case,
          status,
          human_confirmed,
          matched_erp_invoice_id,
          provisional_invoice,
          locked_at,
          locked_by_actor_id,
          created_at,
          updated_at
        )
        VALUES (
          '${quoteLiteral(internalDocumentId)}'::uuid,
          '${quoteLiteral(this.tenantId)}',
          '${jsonLiteral(record.parserResult)}'::jsonb,
          '${jsonLiteral(record.hierarchy)}'::jsonb,
          '${jsonLiteral(record.duplicateCandidates)}'::jsonb,
          '${jsonLiteral(record.erpCandidates)}'::jsonb,
          '${jsonLiteral(record.reviewCase)}'::jsonb,
          '${quoteLiteral(record.status)}',
          ${record.humanConfirmed ? "TRUE" : "FALSE"},
          ${record.matchedErpInvoiceId ? `'${quoteLiteral(record.matchedErpInvoiceId)}'` : "NULL"},
          ${record.provisionalInvoice ? `'${jsonLiteral(record.provisionalInvoice)}'::jsonb` : "NULL"},
          ${record.lockedAt ? `'${quoteLiteral(record.lockedAt)}'::timestamptz` : "NULL"},
          ${record.lockedByActorId ? `'${quoteLiteral(record.lockedByActorId)}'` : "NULL"},
          '${quoteLiteral(record.createdAt)}'::timestamptz,
          '${quoteLiteral(record.updatedAt)}'::timestamptz
        )
        ON CONFLICT (document_id) DO UPDATE SET
          parser_result = EXCLUDED.parser_result,
          hierarchy = EXCLUDED.hierarchy,
          duplicate_candidates = EXCLUDED.duplicate_candidates,
          erp_candidates = EXCLUDED.erp_candidates,
          review_case = EXCLUDED.review_case,
          status = EXCLUDED.status,
          human_confirmed = EXCLUDED.human_confirmed,
          matched_erp_invoice_id = EXCLUDED.matched_erp_invoice_id,
          provisional_invoice = EXCLUDED.provisional_invoice,
          locked_at = EXCLUDED.locked_at,
          locked_by_actor_id = EXCLUDED.locked_by_actor_id,
          updated_at = EXCLUDED.updated_at
      `,
    );

    if (record.provisionalInvoice) {
      await this.upsertProvisionalInvoice(record.provisionalInvoice);
    }
  }

  async get(documentId: string): Promise<StoredBirInvoiceCaseRecord | undefined> {
    const internalDocumentId = toDeterministicUuid(`uploaded_document:${documentId}`);
    const [row] = queryJsonRows<BirInvoiceCaseRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            jsonb_build_object(
              'documentId', COALESCE(uploaded_document.metadata->>'externalDocumentId', uploaded_document.id::text),
              'fileName', uploaded_document.metadata->>'fileName',
              'checksum', uploaded_document.checksum,
              'mimeType', uploaded_document.metadata->>'mimeType',
              'source', uploaded_document.source,
              'uploadedAt', uploaded_document.uploaded_at,
              'storageKey', uploaded_document.storage_key,
              'uploadedBy', uploaded_document.uploaded_by,
              'documentType', 'bir_invoice'
            ) AS "uploadedDocument",
            processing.parser_result AS "parserResult",
            processing.hierarchy,
            processing.duplicate_candidates AS "duplicateCandidates",
            processing.erp_candidates AS "erpCandidates",
            processing.review_case AS "reviewCase",
            processing.status,
            processing.human_confirmed AS "humanConfirmed",
            processing.matched_erp_invoice_id::text AS "matchedErpInvoiceId",
            processing.locked_at AS "lockedAt",
            processing.locked_by_actor_id AS "lockedByActorId",
            processing.created_at AS "createdAt",
            processing.updated_at AS "updatedAt",
            processing.provisional_invoice AS "provisionalInvoice"
          FROM uploaded_document_processing_record processing
          INNER JOIN uploaded_document
            ON uploaded_document.id = processing.document_id
          WHERE processing.tenant_id = '${quoteLiteral(this.tenantId)}'
            AND processing.document_id = '${quoteLiteral(internalDocumentId)}'::uuid
          LIMIT 1
        ) q
      `,
    );

    if (!row) {
      return undefined;
    }

    return {
      documentId,
      uploadedDocument: row.uploadedDocument,
      parserResult: row.parserResult,
      hierarchy: row.hierarchy,
      duplicateCandidates: row.duplicateCandidates,
      erpCandidates: row.erpCandidates,
      reviewCase: row.reviewCase,
      status: row.status,
      humanConfirmed: row.humanConfirmed,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(row.matchedErpInvoiceId ? { matchedErpInvoiceId: row.matchedErpInvoiceId } : {}),
      ...(row.lockedAt ? { lockedAt: row.lockedAt } : {}),
      ...(row.lockedByActorId ? { lockedByActorId: row.lockedByActorId } : {}),
      ...(row.provisionalInvoice ? { provisionalInvoice: row.provisionalInvoice } : {}),
    };
  }

  private async upsertProvisionalInvoice(invoice: Invoice): Promise<void> {
    const internalInvoiceId = toDeterministicUuid(`invoice:${invoice.id}`);
    const internalUploadedDocumentId = invoice.uploadedDocumentId
      ? toDeterministicUuid(`uploaded_document:${invoice.uploadedDocumentId}`)
      : undefined;
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO invoice (
          id,
          tenant_id,
          version,
          created_at,
          updated_at,
          deleted_at,
          created_by_actor_id,
          created_by_actor_role,
          updated_by_actor_id,
          updated_by_actor_role,
          seller_entity_id,
          parent_account_id,
          billing_account_id,
          branch_id,
          invoice_contact_id,
          uploaded_document_id,
          canonical_identity_key,
          invoice_date,
          invoice_number,
          amount_cents,
          collectible_amount_cents,
          disputed_amount_cents,
          currency,
          due_date,
          state,
          metadata
        )
        VALUES (
          '${quoteLiteral(internalInvoiceId)}'::uuid,
          '${quoteLiteral(invoice.tenantId ?? this.tenantId)}',
          ${invoice.version ?? 1},
          '${quoteLiteral(invoice.createdAt)}'::timestamptz,
          '${quoteLiteral(invoice.updatedAt)}'::timestamptz,
          ${invoice.deletedAt ? `'${quoteLiteral(invoice.deletedAt)}'::timestamptz` : "NULL"},
          ${invoice.createdByActorId ? `'${quoteLiteral(invoice.createdByActorId)}'` : "NULL"},
          ${invoice.createdByActorRole ? `'${quoteLiteral(invoice.createdByActorRole)}'` : "NULL"},
          ${invoice.updatedByActorId ? `'${quoteLiteral(invoice.updatedByActorId)}'` : "NULL"},
          ${invoice.updatedByActorRole ? `'${quoteLiteral(invoice.updatedByActorRole)}'` : "NULL"},
          ${invoice.sellerEntityId ? `'${quoteLiteral(invoice.sellerEntityId)}'` : "NULL"},
          '${quoteLiteral(invoice.parentAccountId)}'::uuid,
          '${quoteLiteral(invoice.billingAccountId)}'::uuid,
          ${invoice.branchId ? `'${quoteLiteral(invoice.branchId)}'::uuid` : "NULL"},
          ${invoice.invoiceContactId ? `'${quoteLiteral(invoice.invoiceContactId)}'::uuid` : "NULL"},
          ${internalUploadedDocumentId ? `'${quoteLiteral(internalUploadedDocumentId)}'::uuid` : "NULL"},
          '${quoteLiteral(String(invoice.metadata.canonicalIdentityKey ?? ""))}',
          ${invoice.invoiceDate ? `'${quoteLiteral(invoice.invoiceDate)}'::date` : "NULL"},
          '${quoteLiteral(invoice.invoiceNumber)}',
          ${invoice.amountCents},
          ${invoice.collectibleAmountCents ?? invoice.amountCents},
          ${invoice.disputedAmountCents ?? 0},
          '${quoteLiteral(invoice.currency)}',
          ${invoice.dueDate ? `'${quoteLiteral(invoice.dueDate)}'::date` : "NULL"},
          '${quoteLiteral(invoice.state)}',
          '${jsonLiteral(invoice.metadata)}'::jsonb
        )
        ON CONFLICT (id) DO UPDATE SET
          updated_at = EXCLUDED.updated_at,
          seller_entity_id = EXCLUDED.seller_entity_id,
          parent_account_id = EXCLUDED.parent_account_id,
          billing_account_id = EXCLUDED.billing_account_id,
          branch_id = EXCLUDED.branch_id,
          invoice_contact_id = EXCLUDED.invoice_contact_id,
          uploaded_document_id = EXCLUDED.uploaded_document_id,
          canonical_identity_key = EXCLUDED.canonical_identity_key,
          invoice_date = EXCLUDED.invoice_date,
          invoice_number = EXCLUDED.invoice_number,
          amount_cents = EXCLUDED.amount_cents,
          collectible_amount_cents = EXCLUDED.collectible_amount_cents,
          disputed_amount_cents = EXCLUDED.disputed_amount_cents,
          currency = EXCLUDED.currency,
          due_date = EXCLUDED.due_date,
          state = EXCLUDED.state,
          metadata = EXCLUDED.metadata
      `,
    );
  }
}

type RemittanceRecordRow = {
  remittance: Record<string, unknown>;
  source: Record<string, unknown>;
  parsed?: Record<string, unknown>;
  paymentCandidates: Record<string, unknown>[];
  invoiceCandidates: Record<string, unknown>[];
  linkedPaymentId?: string;
  review?: Record<string, unknown>;
};

export class PostgresRemittanceRepository implements RemittanceRepository {
  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId = "default",
  ) {}

  async save(record: StoredRemittanceRecord): Promise<void> {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO remittance (
          id,
          tenant_id,
          payment_id,
          uploaded_document_id,
          source_channel,
          raw_payload,
          state,
          metadata,
          created_at,
          updated_at,
          version
        )
        VALUES (
          '${quoteLiteral(record.remittance.id)}'::uuid,
          '${quoteLiteral(record.remittance.tenantId ?? this.tenantId)}',
          ${record.remittance.paymentId ? `'${quoteLiteral(record.remittance.paymentId)}'::uuid` : "NULL"},
          ${record.remittance.uploadedDocumentId ? `'${quoteLiteral(record.remittance.uploadedDocumentId)}'::uuid` : "NULL"},
          '${quoteLiteral(record.remittance.sourceChannel)}',
          ${record.remittance.rawPayload ? `'${jsonLiteral(record.remittance.rawPayload)}'::jsonb` : "NULL"},
          '${quoteLiteral(record.remittance.state)}',
          '${jsonLiteral(record.remittance.metadata)}'::jsonb,
          '${quoteLiteral(record.remittance.createdAt)}'::timestamptz,
          '${quoteLiteral(record.remittance.updatedAt)}'::timestamptz,
          ${record.remittance.version ?? 1}
        )
        ON CONFLICT (id) DO UPDATE SET
          payment_id = EXCLUDED.payment_id,
          uploaded_document_id = EXCLUDED.uploaded_document_id,
          source_channel = EXCLUDED.source_channel,
          raw_payload = EXCLUDED.raw_payload,
          state = EXCLUDED.state,
          metadata = EXCLUDED.metadata,
          updated_at = EXCLUDED.updated_at,
          version = EXCLUDED.version
      `,
    );

    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO remittance_processing_record (
          remittance_id,
          tenant_id,
          source,
          parsed,
          payment_candidates,
          invoice_candidates,
          linked_payment_id,
          review,
          created_at,
          updated_at
        )
        VALUES (
          '${quoteLiteral(record.remittance.id)}'::uuid,
          '${quoteLiteral(record.remittance.tenantId ?? this.tenantId)}',
          '${jsonLiteral(record.source)}'::jsonb,
          ${record.parsed ? `'${jsonLiteral(record.parsed)}'::jsonb` : "NULL"},
          '${jsonLiteral(record.paymentCandidates)}'::jsonb,
          '${jsonLiteral(record.invoiceCandidates)}'::jsonb,
          ${record.linkedPaymentId ? `'${quoteLiteral(record.linkedPaymentId)}'::uuid` : "NULL"},
          ${record.review ? `'${jsonLiteral(record.review)}'::jsonb` : "NULL"},
          '${quoteLiteral(record.remittance.createdAt)}'::timestamptz,
          '${quoteLiteral(record.remittance.updatedAt)}'::timestamptz
        )
        ON CONFLICT (remittance_id) DO UPDATE SET
          source = EXCLUDED.source,
          parsed = EXCLUDED.parsed,
          payment_candidates = EXCLUDED.payment_candidates,
          invoice_candidates = EXCLUDED.invoice_candidates,
          linked_payment_id = EXCLUDED.linked_payment_id,
          review = EXCLUDED.review,
          updated_at = EXCLUDED.updated_at
      `,
    );
  }

  async get(remittanceId: string): Promise<StoredRemittanceRecord | undefined> {
    const [row] = queryJsonRows<RemittanceRecordRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            jsonb_build_object(
              'id', remittance.id::text,
              'tenantId', remittance.tenant_id,
              'createdAt', remittance.created_at,
              'updatedAt', remittance.updated_at,
              'state', remittance.state,
              'uploadedDocumentId', remittance.uploaded_document_id,
              'paymentId', remittance.payment_id,
              'sourceChannel', remittance.source_channel,
              'rawPayload', remittance.raw_payload,
              'metadata', remittance.metadata,
              'version', remittance.version
            ) AS "remittance",
            processing.source,
            processing.parsed,
            processing.payment_candidates AS "paymentCandidates",
            processing.invoice_candidates AS "invoiceCandidates",
            processing.linked_payment_id::text AS "linkedPaymentId",
            processing.review
          FROM remittance
          INNER JOIN remittance_processing_record processing
            ON processing.remittance_id = remittance.id
          WHERE remittance.tenant_id = '${quoteLiteral(this.tenantId)}'
            AND remittance.deleted_at IS NULL
            AND remittance.id = '${quoteLiteral(remittanceId)}'::uuid
          LIMIT 1
        ) q
      `,
    );

    if (!row) {
      return undefined;
    }

    const record: StoredRemittanceRecord = {
      remittance: row.remittance as StoredRemittanceRecord["remittance"],
      source: row.source as StoredRemittanceRecord["source"],
      paymentCandidates: row.paymentCandidates as StoredRemittanceRecord["paymentCandidates"],
      invoiceCandidates: row.invoiceCandidates as StoredRemittanceRecord["invoiceCandidates"],
    };

    if (row.parsed) {
      record.parsed = row.parsed as Exclude<StoredRemittanceRecord["parsed"], undefined>;
    }

    if (row.linkedPaymentId) {
      record.linkedPaymentId = row.linkedPaymentId;
    }

    if (row.review) {
      record.review = row.review as Exclude<StoredRemittanceRecord["review"], undefined>;
    }

    return record;
  }
}

function toApprovalRequest(row: ApprovalRequestRow): ApprovalRequest {
  return {
    id: row.id,
    requestType: row.requestType,
    status: row.status,
    requestedBy: row.requestedBy,
    requestedAt: row.requestedAt,
    payload: row.payload ?? {},
    policyContext: row.policyContext ?? {},
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.assigneeRole ? { assigneeRole: row.assigneeRole } : {}),
    ...(row.currentStep ? { currentStep: row.currentStep } : {}),
    ...(row.resolvedAt ? { resolvedAt: row.resolvedAt } : {}),
    ...(row.terminalAt ? { terminalAt: row.terminalAt } : {}),
    ...(row.reopenedFromStatus ? { reopenedFromStatus: row.reopenedFromStatus } : {}),
    ...(row.tenantId ? { tenantId: row.tenantId } : {}),
    ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
    ...(row.createdByActorId ? { createdByActorId: row.createdByActorId } : {}),
    ...(row.createdByActorRole ? { createdByActorRole: row.createdByActorRole } : {}),
    ...(row.updatedByActorId ? { updatedByActorId: row.updatedByActorId } : {}),
    ...(row.updatedByActorRole ? { updatedByActorRole: row.updatedByActorRole } : {}),
  };
}

function mapActorRole(actorType: AuditContext["actorType"]) {
  return actorType === "user" ? "ar_collector" : "system";
}

function toDeterministicUuid(input: string): string {
  const hex = createHash("sha1").update(input).digest("hex").slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function readState(snapshot: Record<string, unknown> | null | undefined): string | undefined {
  const value = snapshot?.state ?? snapshot?.status;
  return typeof value === "string" ? value : undefined;
}
