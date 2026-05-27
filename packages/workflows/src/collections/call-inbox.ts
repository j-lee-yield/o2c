import {
  createActivityLogDomainHelpers,
  type ImmutableActivityLogEntry,
  type ImmutableActivityLogStore,
} from "@o2c/audit";
import type {
  CallInboxCallRecord,
  CallInboxDirection,
  CallInboxFilters,
  CallInboxInvoiceReference,
  CallInboxListItem,
  CallInboxListResponse,
  CallInboxProvider,
  CallInboxSentiment,
  CallInboxStatus,
  CallInboxTaskReference,
  CallInboxTranscriptSegment,
} from "@o2c/contracts";
import type { Principal } from "@o2c/auth";

export interface CallInboxRepository {
  save(record: CallInboxCallRecord): Promise<void>;
  get(callRecordId: string): Promise<CallInboxCallRecord | undefined>;
  findByProviderCallId(input: {
    tenantId: string;
    provider: CallInboxProvider;
    providerCallId: string;
  }): Promise<CallInboxCallRecord | undefined>;
  list(filters?: CallInboxFilters): Promise<CallInboxCallRecord[]>;
}

export class InMemoryCallInboxRepository implements CallInboxRepository {
  private readonly records = new Map<string, CallInboxCallRecord>();

  async save(record: CallInboxCallRecord): Promise<void> {
    this.records.set(record.id, structuredClone(record));
  }

  async get(callRecordId: string): Promise<CallInboxCallRecord | undefined> {
    const record = this.records.get(callRecordId);
    return record ? structuredClone(record) : undefined;
  }

  async findByProviderCallId(input: {
    tenantId: string;
    provider: CallInboxProvider;
    providerCallId: string;
  }): Promise<CallInboxCallRecord | undefined> {
    const record = [...this.records.values()].find(
      (candidate) =>
        candidate.tenantId === input.tenantId &&
        candidate.provider === input.provider &&
        candidate.providerCallId === input.providerCallId,
    );
    return record ? structuredClone(record) : undefined;
  }

  async list(filters: CallInboxFilters = {}): Promise<CallInboxCallRecord[]> {
    return applyCallInboxFilters([...this.records.values()], filters).map((record) =>
      structuredClone(record),
    );
  }
}

export interface NormalizedCallInboxUpsert {
  id?: string;
  tenantId: string;
  provider: CallInboxProvider;
  providerCallId: string;
  communicationAttemptId?: string;
  preCallPlanId?: string;
  parentAccountId?: string;
  billingAccountId?: string;
  branchId?: string;
  contactId?: string;
  customerName?: string;
  customerPhone?: string;
  fromNumber?: string;
  toNumber?: string;
  direction?: CallInboxDirection;
  status?: CallInboxStatus;
  providerStatus?: string;
  disposition?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  voicemail?: boolean;
  sentiment?: CallInboxSentiment;
  classifications?: string[];
  workflowId?: string;
  workflowName?: string;
  requestedBy?: string;
  approverId?: string;
  approverName?: string;
  invoiceRefs?: CallInboxInvoiceReference[];
  summary?: string;
  transcriptUri?: string;
  transcriptSegments?: CallInboxTranscriptSegment[];
  recordingUrl?: string;
  recordingExpiresAt?: string;
  publicLogUrl?: string;
  taskRefs?: CallInboxTaskReference[];
  metadata?: Record<string, unknown>;
  rawProviderPayload?: Record<string, unknown>;
}

export interface CallInboxWorkflowServiceDependencies {
  repository: CallInboxRepository;
  activityStore?: ImmutableActivityLogStore;
  now?: () => string;
  idGenerator?: () => string;
}

export class CallInboxWorkflowService {
  private readonly now: () => string;
  private readonly idGenerator: () => string;
  private readonly audit?: ReturnType<typeof createActivityLogDomainHelpers>;

  constructor(private readonly deps: CallInboxWorkflowServiceDependencies) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.idGenerator = deps.idGenerator ?? (() => `call_inbox_${Date.now()}`);
    this.audit = deps.activityStore
      ? createActivityLogDomainHelpers({
          store: deps.activityStore,
          idGenerator: this.idGenerator,
          now: this.now,
        })
      : undefined;
  }

  async upsertCall(
    principal: Principal,
    input: NormalizedCallInboxUpsert,
  ): Promise<{ record: CallInboxCallRecord; activityEntry?: ImmutableActivityLogEntry }> {
    const existing = await this.deps.repository.findByProviderCallId({
      tenantId: input.tenantId,
      provider: input.provider,
      providerCallId: input.providerCallId,
    });
    const timestamp = this.now();
    const record = mergeCallInboxRecord({
      existing,
      input,
      now: timestamp,
      idGenerator: this.idGenerator,
    });
    await this.deps.repository.save(record);

    const activityEntry = this.audit?.append({
      actorId: principal.id,
      actorRole: principal.roles[0] ?? "system",
      action: existing ? "collections.call_inbox.updated" : "collections.call_inbox.ingested",
      entityType: "call_inbox_record",
      entityId: record.id,
      ...(existing ? { before: toAuditPayload(existing) } : {}),
      after: toAuditPayload(record),
      metadata: {
        tenantId: record.tenantId,
        tenant_id: record.tenantId,
        provider: record.provider,
        providerCallId: record.providerCallId,
        provider_call_id: record.providerCallId,
        billingAccountId: record.billingAccountId ?? "",
        billing_account_id: record.billingAccountId ?? "",
        parentAccountId: record.parentAccountId ?? "",
        parent_account_id: record.parentAccountId ?? "",
        branchId: record.branchId ?? "",
        branch_id: record.branchId ?? "",
        contactId: record.contactId ?? "",
        contact_id: record.contactId ?? "",
        communicationAttemptId: record.communicationAttemptId ?? "",
        communication_attempt_id: record.communicationAttemptId ?? "",
        direction: record.direction,
        status: record.status,
        classificationCount: record.classifications.length,
        openTasksCount: record.openTasksCount,
      },
    });

    return {
      record,
      ...(activityEntry ? { activityEntry } : {}),
    };
  }

  async linkTasks(
    principal: Principal,
    input: {
      tenantId: string;
      provider: CallInboxProvider;
      providerCallId: string;
      taskRefs: CallInboxTaskReference[];
    },
  ): Promise<CallInboxCallRecord | undefined> {
    const existing = await this.deps.repository.findByProviderCallId(input);
    if (!existing) {
      return undefined;
    }

    const taskRefs = mergeTaskRefs(existing.taskRefs, input.taskRefs);
    const record: CallInboxCallRecord = {
      ...existing,
      taskRefs,
      openTasksCount: countOpenTasks(taskRefs),
      updatedAt: this.now(),
    };
    await this.deps.repository.save(record);

    this.audit?.append({
      actorId: principal.id,
      actorRole: principal.roles[0] ?? "system",
      action: "collections.call_inbox.tasks_linked",
      entityType: "call_inbox_record",
      entityId: record.id,
      before: toAuditPayload(existing),
      after: toAuditPayload(record),
      metadata: {
        tenantId: record.tenantId,
        tenant_id: record.tenantId,
        provider: record.provider,
        providerCallId: record.providerCallId,
        provider_call_id: record.providerCallId,
        taskIds: input.taskRefs.map((task) => task.id),
        task_ids: input.taskRefs.map((task) => task.id),
        openTasksCount: record.openTasksCount,
        open_tasks_count: record.openTasksCount,
      },
    });

    return record;
  }

  async listCalls(filters: CallInboxFilters = {}): Promise<CallInboxListResponse> {
    const records = await this.deps.repository.list(filters);
    return {
      generatedAt: this.now(),
      source: records.length > 0
        ? {
            kind: "live",
            label: "Normalized call inbox",
            detail: "Call records are persisted from provider webhooks and post-call outcomes.",
          }
        : {
            kind: "empty",
            label: "Normalized call inbox",
            detail: "No calls have been ingested yet.",
          },
      total: records.length,
      filters,
      items: records.map(toCallInboxListItem),
    };
  }

  async getCall(callRecordId: string): Promise<CallInboxCallRecord | undefined> {
    return this.deps.repository.get(callRecordId);
  }
}

export function toCallInboxListItem(record: CallInboxCallRecord): CallInboxListItem {
  return {
    id: record.id,
    providerCallId: record.providerCallId,
    customerName: record.customerName,
    ...(record.customerPhone ? { customerPhone: record.customerPhone } : {}),
    ...(record.billingAccountId ? { billingAccountId: record.billingAccountId } : {}),
    ...(record.branchId ? { branchId: record.branchId } : {}),
    direction: record.direction,
    status: record.status,
    ...(record.providerStatus ? { providerStatus: record.providerStatus } : {}),
    startedAt: record.startedAt,
    ...(record.endedAt ? { endedAt: record.endedAt } : {}),
    ...(record.durationSeconds !== undefined ? { durationSeconds: record.durationSeconds } : {}),
    voicemail: record.voicemail,
    sentiment: record.sentiment,
    classifications: [...record.classifications],
    ...(record.workflowName ? { workflowName: record.workflowName } : {}),
    ...(record.requestedBy ? { requestedBy: record.requestedBy } : {}),
    ...(record.approverName ? { approverName: record.approverName } : {}),
    invoiceNumbers: record.invoiceRefs.map((invoice) => invoice.invoiceNumber),
    openTasksCount: record.openTasksCount,
  };
}

export function applyCallInboxFilters(
  records: CallInboxCallRecord[],
  filters: CallInboxFilters,
): CallInboxCallRecord[] {
  const customerFilter = filters.customer?.trim().toLowerCase();
  const classificationFilter = filters.classification?.trim().toLowerCase();
  const workflowFilter = filters.workflow?.trim().toLowerCase();
  const dateFrom = filters.dateFrom ? startOfManilaDay(filters.dateFrom) : undefined;
  const dateTo = filters.dateTo ? endOfManilaDay(filters.dateTo) : undefined;

  return records
    .filter((record) => {
      if (filters.direction && record.direction !== filters.direction) {
        return false;
      }
      if (filters.status && record.status !== filters.status) {
        return false;
      }
      if (filters.voicemail !== undefined && record.voicemail !== filters.voicemail) {
        return false;
      }
      if (
        customerFilter &&
        !record.customerName.toLowerCase().includes(customerFilter) &&
        !record.billingAccountId?.toLowerCase().includes(customerFilter)
      ) {
        return false;
      }
      if (
        classificationFilter &&
        !record.classifications.some((classification) =>
          classification.toLowerCase().includes(classificationFilter),
        )
      ) {
        return false;
      }
      if (
        workflowFilter &&
        !record.workflowName?.toLowerCase().includes(workflowFilter) &&
        !record.workflowId?.toLowerCase().includes(workflowFilter)
      ) {
        return false;
      }
      const startedAt = new Date(record.startedAt).getTime();
      if (dateFrom !== undefined && startedAt < dateFrom) {
        return false;
      }
      if (dateTo !== undefined && startedAt > dateTo) {
        return false;
      }
      return true;
    })
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

function mergeCallInboxRecord(input: {
  existing?: CallInboxCallRecord;
  input: NormalizedCallInboxUpsert;
  now: string;
  idGenerator: () => string;
}): CallInboxCallRecord {
  const existing = input.existing;
  const upsert = input.input;
  const taskRefs = mergeTaskRefs(existing?.taskRefs ?? [], upsert.taskRefs ?? []);
  const invoiceRefs = mergeInvoiceRefs(existing?.invoiceRefs ?? [], upsert.invoiceRefs ?? []);
  const classifications = uniqueStrings([
    ...(existing?.classifications ?? []),
    ...(upsert.classifications ?? []),
  ]);
  const transcriptSegments =
    upsert.transcriptSegments && upsert.transcriptSegments.length > 0
      ? upsert.transcriptSegments
      : existing?.transcriptSegments ?? [];

  return {
    id: existing?.id ?? upsert.id ?? input.idGenerator(),
    tenantId: upsert.tenantId,
    provider: upsert.provider,
    providerCallId: upsert.providerCallId,
    ...(coalesce(upsert.communicationAttemptId, existing?.communicationAttemptId)
      ? {
          communicationAttemptId: coalesce(
            upsert.communicationAttemptId,
            existing?.communicationAttemptId,
          ),
        }
      : {}),
    ...(coalesce(upsert.preCallPlanId, existing?.preCallPlanId)
      ? { preCallPlanId: coalesce(upsert.preCallPlanId, existing?.preCallPlanId) }
      : {}),
    ...(coalesce(upsert.parentAccountId, existing?.parentAccountId)
      ? { parentAccountId: coalesce(upsert.parentAccountId, existing?.parentAccountId) }
      : {}),
    ...(coalesce(upsert.billingAccountId, existing?.billingAccountId)
      ? { billingAccountId: coalesce(upsert.billingAccountId, existing?.billingAccountId) }
      : {}),
    ...(coalesce(upsert.branchId, existing?.branchId)
      ? { branchId: coalesce(upsert.branchId, existing?.branchId) }
      : {}),
    ...(coalesce(upsert.contactId, existing?.contactId)
      ? { contactId: coalesce(upsert.contactId, existing?.contactId) }
      : {}),
    customerName: coalesce(upsert.customerName, existing?.customerName) ?? "Unknown customer",
    ...(coalesce(upsert.customerPhone, existing?.customerPhone)
      ? { customerPhone: coalesce(upsert.customerPhone, existing?.customerPhone) }
      : {}),
    ...(coalesce(upsert.fromNumber, existing?.fromNumber)
      ? { fromNumber: coalesce(upsert.fromNumber, existing?.fromNumber) }
      : {}),
    ...(coalesce(upsert.toNumber, existing?.toNumber)
      ? { toNumber: coalesce(upsert.toNumber, existing?.toNumber) }
      : {}),
    direction: upsert.direction ?? existing?.direction ?? "unknown",
    status: resolveStatus(upsert.status, existing?.status),
    ...(coalesce(upsert.providerStatus, existing?.providerStatus)
      ? { providerStatus: coalesce(upsert.providerStatus, existing?.providerStatus) }
      : {}),
    ...(coalesce(upsert.disposition, existing?.disposition)
      ? { disposition: coalesce(upsert.disposition, existing?.disposition) }
      : {}),
    startedAt: upsert.startedAt ?? existing?.startedAt ?? input.now,
    ...(coalesce(upsert.endedAt, existing?.endedAt)
      ? { endedAt: coalesce(upsert.endedAt, existing?.endedAt) }
      : {}),
    ...(coalesce(upsert.durationSeconds, existing?.durationSeconds) !== undefined
      ? { durationSeconds: coalesce(upsert.durationSeconds, existing?.durationSeconds) }
      : {}),
    voicemail: upsert.voicemail ?? existing?.voicemail ?? false,
    sentiment: upsert.sentiment ?? existing?.sentiment ?? "unknown",
    classifications,
    ...(coalesce(upsert.workflowId, existing?.workflowId)
      ? { workflowId: coalesce(upsert.workflowId, existing?.workflowId) }
      : {}),
    ...(coalesce(upsert.workflowName, existing?.workflowName)
      ? { workflowName: coalesce(upsert.workflowName, existing?.workflowName) }
      : {}),
    ...(coalesce(upsert.requestedBy, existing?.requestedBy)
      ? { requestedBy: coalesce(upsert.requestedBy, existing?.requestedBy) }
      : {}),
    ...(coalesce(upsert.approverId, existing?.approverId)
      ? { approverId: coalesce(upsert.approverId, existing?.approverId) }
      : {}),
    ...(coalesce(upsert.approverName, existing?.approverName)
      ? { approverName: coalesce(upsert.approverName, existing?.approverName) }
      : {}),
    invoiceRefs,
    ...(coalesce(upsert.summary, existing?.summary)
      ? { summary: coalesce(upsert.summary, existing?.summary) }
      : {}),
    ...(coalesce(upsert.transcriptUri, existing?.transcriptUri)
      ? { transcriptUri: coalesce(upsert.transcriptUri, existing?.transcriptUri) }
      : {}),
    transcriptSegments,
    ...(coalesce(upsert.recordingUrl, existing?.recordingUrl)
      ? { recordingUrl: coalesce(upsert.recordingUrl, existing?.recordingUrl) }
      : {}),
    ...(coalesce(upsert.recordingExpiresAt, existing?.recordingExpiresAt)
      ? { recordingExpiresAt: coalesce(upsert.recordingExpiresAt, existing?.recordingExpiresAt) }
      : {}),
    ...(coalesce(upsert.publicLogUrl, existing?.publicLogUrl)
      ? { publicLogUrl: coalesce(upsert.publicLogUrl, existing?.publicLogUrl) }
      : {}),
    taskRefs,
    openTasksCount: countOpenTasks(taskRefs),
    metadata: {
      ...(existing?.metadata ?? {}),
      ...(upsert.metadata ?? {}),
    },
    ...(upsert.rawProviderPayload ?? existing?.rawProviderPayload
      ? { rawProviderPayload: upsert.rawProviderPayload ?? existing?.rawProviderPayload }
      : {}),
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
  };
}

function resolveStatus(
  nextStatus: CallInboxStatus | undefined,
  existingStatus: CallInboxStatus | undefined,
): CallInboxStatus {
  if (!nextStatus) {
    return existingStatus ?? "processing";
  }
  if (existingStatus === "needs_review" && nextStatus === "completed") {
    return existingStatus;
  }
  return nextStatus;
}

function mergeTaskRefs(
  existing: CallInboxTaskReference[],
  incoming: CallInboxTaskReference[],
): CallInboxTaskReference[] {
  const byId = new Map<string, CallInboxTaskReference>();
  for (const task of existing) {
    byId.set(task.id, task);
  }
  for (const task of incoming) {
    byId.set(task.id, {
      ...(byId.get(task.id) ?? {}),
      ...task,
    });
  }
  return [...byId.values()].sort((left, right) => left.title.localeCompare(right.title));
}

function mergeInvoiceRefs(
  existing: CallInboxInvoiceReference[],
  incoming: CallInboxInvoiceReference[],
): CallInboxInvoiceReference[] {
  const byKey = new Map<string, CallInboxInvoiceReference>();
  for (const invoice of existing) {
    byKey.set(invoice.invoiceId ?? invoice.invoiceNumber, invoice);
  }
  for (const invoice of incoming) {
    const key = invoice.invoiceId ?? invoice.invoiceNumber;
    byKey.set(key, {
      ...(byKey.get(key) ?? {}),
      ...invoice,
    });
  }
  return [...byKey.values()];
}

function countOpenTasks(tasks: CallInboxTaskReference[]): number {
  return tasks.filter((task) => task.status === "open").length;
}

function toAuditPayload(record: CallInboxCallRecord): Record<string, unknown> {
  return record as unknown as Record<string, unknown>;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function coalesce<T>(next: T | undefined, current: T | undefined): T | undefined {
  return next !== undefined && next !== "" ? next : current;
}

function startOfManilaDay(value: string): number {
  const timestamp = new Date(`${value}T00:00:00+08:00`).getTime();
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

function endOfManilaDay(value: string): number {
  const timestamp = new Date(`${value}T23:59:59.999+08:00`).getTime();
  if (Number.isNaN(timestamp)) {
    return Number.POSITIVE_INFINITY;
  }
  return timestamp;
}
