import type { CallInboxCallRecord, CallInboxFilters } from "@o2c/contracts";
import type { CallInboxRepository } from "@o2c/workflows";
import { applyCallInboxFilters } from "@o2c/workflows";
import {
  executeSqlCommand,
  jsonLiteral,
  queryJsonRows,
  quoteLiteral,
} from "./postgres.js";

type CallInboxRow = {
  id: string;
  tenantId: string;
  provider: CallInboxCallRecord["provider"];
  providerCallId: string;
  communicationAttemptId?: string | null;
  preCallPlanId?: string | null;
  parentAccountId?: string | null;
  billingAccountId?: string | null;
  branchId?: string | null;
  contactId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  fromNumber?: string | null;
  toNumber?: string | null;
  direction: CallInboxCallRecord["direction"];
  status: CallInboxCallRecord["status"];
  providerStatus?: string | null;
  disposition?: string | null;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
  voicemail: boolean;
  sentiment: CallInboxCallRecord["sentiment"];
  classifications?: CallInboxCallRecord["classifications"];
  workflowId?: string | null;
  workflowName?: string | null;
  requestedBy?: string | null;
  approverId?: string | null;
  approverName?: string | null;
  invoiceRefs?: CallInboxCallRecord["invoiceRefs"];
  summary?: string | null;
  transcriptUri?: string | null;
  transcriptSegments?: CallInboxCallRecord["transcriptSegments"];
  recordingUrl?: string | null;
  recordingExpiresAt?: string | null;
  publicLogUrl?: string | null;
  taskRefs?: CallInboxCallRecord["taskRefs"];
  openTasksCount: number;
  metadata?: Record<string, unknown>;
  rawProviderPayload?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export class PostgresCallInboxRepository implements CallInboxRepository {
  private readonly databaseUrl: string;
  private readonly tenantId: string;

  constructor(databaseUrl: string, tenantId = "default") {
    this.databaseUrl = databaseUrl;
    this.tenantId = tenantId;
  }

  async save(record: CallInboxCallRecord): Promise<void> {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO call_inbox_record (
          id, tenant_id, provider, provider_call_id, communication_attempt_id, pre_call_plan_id,
          parent_account_id, billing_account_id, branch_id, contact_id, customer_name, customer_phone,
          from_number, to_number, direction, status, provider_status, disposition, started_at, ended_at,
          duration_seconds, voicemail, sentiment, classifications, workflow_id, workflow_name,
          requested_by, approver_id, approver_name, invoice_refs, summary, transcript_uri,
          transcript_segments, recording_url, recording_expires_at, public_log_url, task_refs,
          open_tasks_count, metadata, raw_provider_payload, created_at, updated_at
        )
        VALUES (
          '${quoteLiteral(record.id)}',
          '${quoteLiteral(record.tenantId ?? this.tenantId)}',
          '${quoteLiteral(record.provider)}',
          '${quoteLiteral(record.providerCallId)}',
          ${nullableText(record.communicationAttemptId)},
          ${nullableText(record.preCallPlanId)},
          ${nullableText(record.parentAccountId)},
          ${nullableText(record.billingAccountId)},
          ${nullableText(record.branchId)},
          ${nullableText(record.contactId)},
          '${quoteLiteral(record.customerName)}',
          ${nullableText(record.customerPhone)},
          ${nullableText(record.fromNumber)},
          ${nullableText(record.toNumber)},
          '${quoteLiteral(record.direction)}',
          '${quoteLiteral(record.status)}',
          ${nullableText(record.providerStatus)},
          ${nullableText(record.disposition)},
          '${quoteLiteral(record.startedAt)}'::timestamptz,
          ${nullableTimestamp(record.endedAt)},
          ${record.durationSeconds !== undefined ? record.durationSeconds : "NULL"},
          ${record.voicemail ? "TRUE" : "FALSE"},
          '${quoteLiteral(record.sentiment)}',
          '${jsonLiteral(record.classifications)}'::jsonb,
          ${nullableText(record.workflowId)},
          ${nullableText(record.workflowName)},
          ${nullableText(record.requestedBy)},
          ${nullableText(record.approverId)},
          ${nullableText(record.approverName)},
          '${jsonLiteral(record.invoiceRefs)}'::jsonb,
          ${nullableText(record.summary)},
          ${nullableText(record.transcriptUri)},
          '${jsonLiteral(record.transcriptSegments)}'::jsonb,
          ${nullableText(record.recordingUrl)},
          ${nullableTimestamp(record.recordingExpiresAt)},
          ${nullableText(record.publicLogUrl)},
          '${jsonLiteral(record.taskRefs)}'::jsonb,
          ${record.openTasksCount},
          '${jsonLiteral(record.metadata)}'::jsonb,
          ${record.rawProviderPayload ? `'${jsonLiteral(record.rawProviderPayload)}'::jsonb` : "NULL"},
          '${quoteLiteral(record.createdAt)}'::timestamptz,
          '${quoteLiteral(record.updatedAt)}'::timestamptz
        )
        ON CONFLICT (tenant_id, provider, provider_call_id)
        DO UPDATE SET
          communication_attempt_id = EXCLUDED.communication_attempt_id,
          pre_call_plan_id = EXCLUDED.pre_call_plan_id,
          parent_account_id = EXCLUDED.parent_account_id,
          billing_account_id = EXCLUDED.billing_account_id,
          branch_id = EXCLUDED.branch_id,
          contact_id = EXCLUDED.contact_id,
          customer_name = EXCLUDED.customer_name,
          customer_phone = EXCLUDED.customer_phone,
          from_number = EXCLUDED.from_number,
          to_number = EXCLUDED.to_number,
          direction = EXCLUDED.direction,
          status = EXCLUDED.status,
          provider_status = EXCLUDED.provider_status,
          disposition = EXCLUDED.disposition,
          started_at = EXCLUDED.started_at,
          ended_at = EXCLUDED.ended_at,
          duration_seconds = EXCLUDED.duration_seconds,
          voicemail = EXCLUDED.voicemail,
          sentiment = EXCLUDED.sentiment,
          classifications = EXCLUDED.classifications,
          workflow_id = EXCLUDED.workflow_id,
          workflow_name = EXCLUDED.workflow_name,
          requested_by = EXCLUDED.requested_by,
          approver_id = EXCLUDED.approver_id,
          approver_name = EXCLUDED.approver_name,
          invoice_refs = EXCLUDED.invoice_refs,
          summary = EXCLUDED.summary,
          transcript_uri = EXCLUDED.transcript_uri,
          transcript_segments = EXCLUDED.transcript_segments,
          recording_url = EXCLUDED.recording_url,
          recording_expires_at = EXCLUDED.recording_expires_at,
          public_log_url = EXCLUDED.public_log_url,
          task_refs = EXCLUDED.task_refs,
          open_tasks_count = EXCLUDED.open_tasks_count,
          metadata = EXCLUDED.metadata,
          raw_provider_payload = EXCLUDED.raw_provider_payload,
          updated_at = EXCLUDED.updated_at
      `,
    );
  }

  async get(callRecordId: string): Promise<CallInboxCallRecord | undefined> {
    const [row] = queryJsonRows<CallInboxRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (${this.baseSelect(`id = '${quoteLiteral(callRecordId)}'`)}) q
      `,
    );
    return row ? toCallInboxRecord(row) : undefined;
  }

  async findByProviderCallId(input: {
    tenantId: string;
    provider: CallInboxCallRecord["provider"];
    providerCallId: string;
  }): Promise<CallInboxCallRecord | undefined> {
    const [row] = queryJsonRows<CallInboxRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (${this.baseSelect(`
          tenant_id = '${quoteLiteral(input.tenantId)}'
          AND provider = '${quoteLiteral(input.provider)}'
          AND provider_call_id = '${quoteLiteral(input.providerCallId)}'
        `)}) q
      `,
    );
    return row ? toCallInboxRecord(row) : undefined;
  }

  async list(filters: CallInboxFilters = {}): Promise<CallInboxCallRecord[]> {
    const rows = queryJsonRows<CallInboxRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (${this.baseSelect(`tenant_id = '${quoteLiteral(this.tenantId)}'`)}) q
      `,
    );

    return applyCallInboxFilters(rows.map(toCallInboxRecord), filters);
  }

  private baseSelect(predicate: string): string {
    return `
      SELECT
        id,
        tenant_id AS "tenantId",
        provider,
        provider_call_id AS "providerCallId",
        communication_attempt_id AS "communicationAttemptId",
        pre_call_plan_id AS "preCallPlanId",
        parent_account_id AS "parentAccountId",
        billing_account_id AS "billingAccountId",
        branch_id AS "branchId",
        contact_id AS "contactId",
        customer_name AS "customerName",
        customer_phone AS "customerPhone",
        from_number AS "fromNumber",
        to_number AS "toNumber",
        direction,
        status,
        provider_status AS "providerStatus",
        disposition,
        started_at AS "startedAt",
        ended_at AS "endedAt",
        duration_seconds AS "durationSeconds",
        voicemail,
        sentiment,
        classifications,
        workflow_id AS "workflowId",
        workflow_name AS "workflowName",
        requested_by AS "requestedBy",
        approver_id AS "approverId",
        approver_name AS "approverName",
        invoice_refs AS "invoiceRefs",
        summary,
        transcript_uri AS "transcriptUri",
        transcript_segments AS "transcriptSegments",
        recording_url AS "recordingUrl",
        recording_expires_at AS "recordingExpiresAt",
        public_log_url AS "publicLogUrl",
        task_refs AS "taskRefs",
        open_tasks_count AS "openTasksCount",
        metadata,
        raw_provider_payload AS "rawProviderPayload",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM call_inbox_record
      WHERE deleted_at IS NULL
        AND ${predicate}
      ORDER BY started_at DESC, updated_at DESC
    `;
  }
}

function toCallInboxRecord(row: CallInboxRow): CallInboxCallRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    provider: row.provider,
    providerCallId: row.providerCallId,
    ...(row.communicationAttemptId ? { communicationAttemptId: row.communicationAttemptId } : {}),
    ...(row.preCallPlanId ? { preCallPlanId: row.preCallPlanId } : {}),
    ...(row.parentAccountId ? { parentAccountId: row.parentAccountId } : {}),
    ...(row.billingAccountId ? { billingAccountId: row.billingAccountId } : {}),
    ...(row.branchId ? { branchId: row.branchId } : {}),
    ...(row.contactId ? { contactId: row.contactId } : {}),
    customerName: row.customerName,
    ...(row.customerPhone ? { customerPhone: row.customerPhone } : {}),
    ...(row.fromNumber ? { fromNumber: row.fromNumber } : {}),
    ...(row.toNumber ? { toNumber: row.toNumber } : {}),
    direction: row.direction,
    status: row.status,
    ...(row.providerStatus ? { providerStatus: row.providerStatus } : {}),
    ...(row.disposition ? { disposition: row.disposition } : {}),
    startedAt: row.startedAt,
    ...(row.endedAt ? { endedAt: row.endedAt } : {}),
    ...(row.durationSeconds !== null && row.durationSeconds !== undefined
      ? { durationSeconds: Number(row.durationSeconds) }
      : {}),
    voicemail: row.voicemail,
    sentiment: row.sentiment,
    classifications: row.classifications ?? [],
    ...(row.workflowId ? { workflowId: row.workflowId } : {}),
    ...(row.workflowName ? { workflowName: row.workflowName } : {}),
    ...(row.requestedBy ? { requestedBy: row.requestedBy } : {}),
    ...(row.approverId ? { approverId: row.approverId } : {}),
    ...(row.approverName ? { approverName: row.approverName } : {}),
    invoiceRefs: row.invoiceRefs ?? [],
    ...(row.summary ? { summary: row.summary } : {}),
    ...(row.transcriptUri ? { transcriptUri: row.transcriptUri } : {}),
    transcriptSegments: row.transcriptSegments ?? [],
    ...(row.recordingUrl ? { recordingUrl: row.recordingUrl } : {}),
    ...(row.recordingExpiresAt ? { recordingExpiresAt: row.recordingExpiresAt } : {}),
    ...(row.publicLogUrl ? { publicLogUrl: row.publicLogUrl } : {}),
    taskRefs: row.taskRefs ?? [],
    openTasksCount: row.openTasksCount,
    metadata: row.metadata ?? {},
    ...(row.rawProviderPayload ? { rawProviderPayload: row.rawProviderPayload } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function nullableText(value: string | undefined): string {
  return value ? `'${quoteLiteral(value)}'` : "NULL";
}

function nullableTimestamp(value: string | undefined): string {
  return value ? `'${quoteLiteral(value)}'::timestamptz` : "NULL";
}
