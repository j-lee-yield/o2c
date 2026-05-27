import type {
  CallInboxDirection,
  CallInboxInvoiceReference,
  CallInboxSentiment,
  CallInboxStatus,
  CallInboxTaskReference,
  CallInboxTranscriptSegment,
} from "@o2c/contracts";
import type { NormalizedCallInboxUpsert } from "@o2c/workflows";
import type { RetellCallRecord } from "./client.js";

export interface RetellWebhookEnvelope {
  event: string;
  call: RetellCallRecord;
}

export function parseRetellWebhookEnvelope(body: unknown): RetellWebhookEnvelope | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  const call = isRecord(body.call) ? (body.call as RetellCallRecord) : isRecord(body) ? (body as RetellCallRecord) : undefined;
  const providerCallId = typeof call?.call_id === "string" ? call.call_id : undefined;
  if (!call || !providerCallId) {
    return undefined;
  }

  return {
    event: typeof body.event === "string" ? body.event : "call_updated",
    call,
  };
}

export function retellWebhookToCallInboxUpsert(input: {
  tenantId: string;
  event: string;
  call: RetellCallRecord;
  receivedAt: string;
}): NormalizedCallInboxUpsert {
  return retellCallToCallInboxUpsert({
    tenantId: input.tenantId,
    call: input.call,
    event: input.event,
    receivedAt: input.receivedAt,
  });
}

export function retellCallToCallInboxUpsert(input: {
  tenantId: string;
  call: RetellCallRecord;
  event?: string;
  receivedAt: string;
}): NormalizedCallInboxUpsert {
  const metadata = readRecord(input.call.metadata);
  const dynamicVariables = readStringRecord(input.call.retell_llm_dynamic_variables);
  const callAnalysis = readRecord(input.call.call_analysis);
  const customAnalysis = readRecord(callAnalysis.custom_analysis_data);
  const providerCallId = readString(input.call.call_id) ?? "unknown_retell_call";
  const direction = normalizeDirection(input.call.direction);
  const fromNumber = readString(input.call.from_number);
  const toNumber = readString(input.call.to_number);
  const startedAt = parseRetellTimestamp(input.call.start_timestamp) ?? readString(input.call.start_time);
  const endedAt = parseRetellTimestamp(input.call.end_timestamp) ?? readString(input.call.end_time);
  const durationSeconds = resolveDurationSeconds({
    startedAt,
    endedAt,
    durationMs: readNumber(input.call.duration_ms),
    durationSeconds: readNumber(input.call.duration_seconds),
  });
  const voicemail = readBoolean(customAnalysis.voicemail) ??
    readBoolean(customAnalysis.is_voicemail) ??
    readBoolean(callAnalysis.in_voicemail) ??
    readBoolean(input.call.voicemail) ??
    readString(input.call.disconnection_reason)?.toLowerCase().includes("voicemail") ??
    false;
  const sentiment = normalizeSentiment(
    readString(callAnalysis.user_sentiment) ??
      readString(customAnalysis.sentiment) ??
      readString(input.call.sentiment_label),
  );
  const summary = readString(callAnalysis.call_summary) ?? readString(input.call.transcript_summary);
  const classifications = extractClassifications({
    metadata,
    dynamicVariables,
    customAnalysis,
    disposition: readString(input.call.disconnection_reason),
    ...(summary ? { summary } : {}),
    voicemail,
  });
  const communicationAttemptId =
    readFirstString(metadata, ["communication_attempt_id", "communicationAttemptId"]) ??
    readFirstString(dynamicVariables, ["communication_attempt_id", "communicationAttemptId"]);
  const preCallPlanId =
    readFirstString(metadata, ["pre_call_plan_id", "preCallPlanId"]) ??
    readFirstString(dynamicVariables, ["pre_call_plan_id", "preCallPlanId"]);
  const parentAccountId =
    readFirstString(metadata, ["parent_account_id", "parentAccountId"]) ??
    readFirstString(dynamicVariables, ["parent_account_id", "parentAccountId"]);
  const billingAccountId =
    readFirstString(metadata, ["billing_account_id", "billingAccountId"]) ??
    readFirstString(dynamicVariables, ["billing_account_id", "billingAccountId"]);
  const branchId =
    readFirstString(metadata, ["branch_id", "branchId"]) ??
    readFirstString(dynamicVariables, ["branch_id", "branchId"]);
  const contactId =
    readFirstString(metadata, ["contact_id", "contactId"]) ??
    readFirstString(dynamicVariables, ["contact_id", "contactId"]);
  const customerPhone = customerPhoneForDirection(direction, fromNumber, toNumber);
  const providerStatus = readString(input.call.call_status);
  const disposition = readString(input.call.disconnection_reason);
  const operatorReviewRequired =
    readBoolean(customAnalysis.operator_review_required) ??
    readBoolean(input.call.operator_review_required);
  const workflowId =
    readFirstString(metadata, ["workflow_id", "workflowId", "campaign_id"]) ??
    readFirstString(dynamicVariables, ["workflow_id", "workflowId"]);
  const workflowName =
    readFirstString(metadata, ["workflow_name", "workflowName"]) ??
    (readFirstString(dynamicVariables, ["workflow_name", "workflowName", "call_objective"])
      ? humanizeIdentifier(
          readFirstString(dynamicVariables, ["workflow_name", "workflowName", "call_objective"]) ?? "",
        )
      : undefined);
  const requestedBy = readFirstString(metadata, ["requested_by", "requestedBy", "triggered_by"]);
  const approverId = readFirstString(metadata, ["approver_id", "approverId"]);
  const approverName = readFirstString(metadata, ["approver_name", "approverName"]);
  const transcriptUri = readString(input.call.transcript_url);
  const directRecordingUrl = readFirstString(input.call, ["recording_url", "scrubbed_recording_url"]);
  const recordingUrl =
    directRecordingUrl ??
    readFirstString(input.call, ["recording_multi_channel_url", "scrubbed_recording_multi_channel_url"]);
  const publicLogUrl = readString(input.call.public_log_url);

  return {
    tenantId: input.tenantId,
    provider: "retell",
    providerCallId,
    ...(communicationAttemptId ? { communicationAttemptId } : {}),
    ...(preCallPlanId ? { preCallPlanId } : {}),
    ...(parentAccountId ? { parentAccountId } : {}),
    ...(billingAccountId ? { billingAccountId } : {}),
    ...(branchId ? { branchId } : {}),
    ...(contactId ? { contactId } : {}),
    customerName:
      readFirstString(dynamicVariables, ["customer_name", "billing_account_name", "company_name"]) ??
      readFirstString(metadata, ["customer_name", "customerName", "billing_account_name"]) ??
      "Unknown customer",
    ...(customerPhone ? { customerPhone } : {}),
    ...(fromNumber ? { fromNumber } : {}),
    ...(toNumber ? { toNumber } : {}),
    direction,
    status: resolveCallInboxStatus({
      ...(input.event ? { event: input.event } : {}),
      ...(providerStatus ? { callStatus: providerStatus } : {}),
      ...(operatorReviewRequired !== undefined ? { operatorReviewRequired } : {}),
    }),
    ...(providerStatus ? { providerStatus } : {}),
    ...(disposition ? { disposition } : {}),
    startedAt: startedAt ?? input.receivedAt,
    ...(endedAt ? { endedAt } : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    voicemail,
    sentiment,
    classifications,
    ...(workflowId ? { workflowId } : {}),
    ...(workflowName ? { workflowName } : {}),
    ...(requestedBy ? { requestedBy } : {}),
    ...(approverId ? { approverId } : {}),
    ...(approverName ? { approverName } : {}),
    invoiceRefs: extractInvoiceRefs({ metadata, dynamicVariables }),
    ...(summary ? { summary } : {}),
    ...(transcriptUri ? { transcriptUri } : {}),
    transcriptSegments: extractTranscriptSegments(input.call),
    ...(recordingUrl ? { recordingUrl } : {}),
    ...(directRecordingUrl ? { recordingExpiresAt: addMinutes(input.receivedAt, 10) } : {}),
    ...(publicLogUrl ? { publicLogUrl } : {}),
    metadata: {
      providerEvent: input.event ?? "",
      disconnectionReason: readString(input.call.disconnection_reason) ?? "",
      retellAgentId: readString(input.call.agent_id) ?? "",
      retellAgentName: readString(input.call.agent_name) ?? "",
      recordingUrlEphemeral: Boolean(readFirstString(input.call, ["recording_url", "scrubbed_recording_url"])),
      callAnalysis,
      customAnalysis,
    },
    rawProviderPayload: input.call,
  };
}

export function postCallOutcomeToCallInboxUpsert(input: {
  tenantId: string;
  billingAccountId: string;
  parentAccountId?: string;
  branchId?: string;
  contactId?: string;
  communicationAttemptId: string;
  providerCallId?: string;
  preCallPlanId?: string;
  occurredAt: string;
  durationSeconds?: number;
  disposition: string;
  transcriptUri?: string;
  transcriptSummary?: string;
  transcriptSegments?: CallInboxTranscriptSegment[];
  sentimentLabel?: "positive" | "neutral" | "negative";
  operatorReviewRequired?: boolean;
  invoiceRefs?: CallInboxInvoiceReference[];
  taskRefs?: CallInboxTaskReference[];
  metadata?: Record<string, unknown>;
}): NormalizedCallInboxUpsert | undefined {
  if (!input.providerCallId) {
    return undefined;
  }

  return {
    tenantId: input.tenantId,
    provider: "retell",
    providerCallId: input.providerCallId,
    billingAccountId: input.billingAccountId,
    ...(input.parentAccountId ? { parentAccountId: input.parentAccountId } : {}),
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.contactId ? { contactId: input.contactId } : {}),
    communicationAttemptId: input.communicationAttemptId,
    ...(input.preCallPlanId ? { preCallPlanId: input.preCallPlanId } : {}),
    customerName: readString(input.metadata?.customerName) ?? readString(input.metadata?.customer_name) ?? input.billingAccountId,
    direction: normalizeDirection(input.metadata?.direction),
    status: input.operatorReviewRequired ? "needs_review" : "completed",
    disposition: input.disposition,
    startedAt: input.occurredAt,
    ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
    voicemail: input.disposition === "voicemail_left",
    sentiment: normalizeSentiment(input.sentimentLabel),
    classifications: extractPostCallClassifications(input),
    invoiceRefs: input.invoiceRefs ?? [],
    ...(input.transcriptUri ? { transcriptUri: input.transcriptUri } : {}),
    ...(input.transcriptSummary ? { summary: input.transcriptSummary } : {}),
    transcriptSegments: input.transcriptSegments ?? [],
    taskRefs: input.taskRefs ?? [],
    metadata: {
      ...(input.metadata ?? {}),
      source: "post_call_outcome",
      communicationAttemptId: input.communicationAttemptId,
    },
  };
}

export function toCallInboxTaskReferences(
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    taskType?: string;
    ownerTeam?: string;
    dueAt?: string;
  }>,
): CallInboxTaskReference[] {
  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status:
      task.status === "completed" || task.status === "closed" || task.status === "dismissed"
        ? task.status
        : "open",
    ...(task.taskType ? { taskType: task.taskType } : {}),
    ...(task.ownerTeam ? { ownerTeam: task.ownerTeam } : {}),
    ...(task.dueAt ? { dueAt: task.dueAt } : {}),
  }));
}

function extractTranscriptSegments(call: RetellCallRecord): CallInboxTranscriptSegment[] {
  const transcriptObject = Array.isArray(call.transcript_object)
    ? call.transcript_object
    : Array.isArray(call.transcript_with_tool_calls)
      ? call.transcript_with_tool_calls
      : [];
  const segments = transcriptObject
    .filter(isRecord)
    .map((entry) => {
      const text =
        readString(entry.content) ??
        readString(entry.text) ??
        readString(entry.transcript) ??
        readString(entry.words);
      if (!text) {
        return undefined;
      }
      const startedAtSeconds = readSeconds(entry.start_ms, entry.start_time, entry.start);
      const endedAtSeconds = readSeconds(entry.end_ms, entry.end_time, entry.end);
      return {
        speaker: normalizeSpeaker(readString(entry.role) ?? readString(entry.speaker)),
        text,
        ...(startedAtSeconds !== undefined ? { startedAtSeconds } : {}),
        ...(endedAtSeconds !== undefined ? { endedAtSeconds } : {}),
      } satisfies CallInboxTranscriptSegment;
    })
    .filter((segment): segment is CallInboxTranscriptSegment => Boolean(segment));

  if (segments.length > 0) {
    return segments;
  }

  const transcript = readString(call.transcript);
  if (!transcript) {
    return [];
  }

  return transcript
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const speakerMatch = /^(agent|assistant|customer|user|caller)\s*:\s*(.+)$/i.exec(line);
      return {
        speaker: normalizeSpeaker(speakerMatch?.[1]),
        text: speakerMatch?.[2] ?? line,
      };
    });
}

function extractInvoiceRefs(input: {
  metadata: Record<string, unknown>;
  dynamicVariables: Record<string, string>;
}): CallInboxInvoiceReference[] {
  const invoiceIds = readStringList(input.metadata.invoice_ids ?? input.metadata.invoiceIds);
  const invoiceNumbers = readStringList(
    input.dynamicVariables.invoice_numbers ??
      input.metadata.invoice_numbers ??
      input.metadata.invoiceNumbers,
  );
  const billingAccountId = readFirstString(input.metadata, ["billing_account_id", "billingAccountId"]);
  const branchId = readFirstString(input.metadata, ["branch_id", "branchId"]);
  const refs: CallInboxInvoiceReference[] = [];
  const count = Math.max(invoiceIds.length, invoiceNumbers.length);
  for (let index = 0; index < count; index += 1) {
    const invoiceId = invoiceIds[index];
    const invoiceNumber = invoiceNumbers[index] ?? invoiceId;
    if (!invoiceNumber) {
      continue;
    }
    refs.push({
      ...(invoiceId ? { invoiceId } : {}),
      invoiceNumber,
      ...(billingAccountId ? { billingAccountId } : {}),
      ...(branchId ? { branchId } : {}),
    });
  }
  return refs;
}

function extractClassifications(input: {
  metadata: Record<string, unknown>;
  dynamicVariables: Record<string, string>;
  customAnalysis: Record<string, unknown>;
  disposition?: string | undefined;
  summary?: string | undefined;
  voicemail: boolean;
}): string[] {
  const explicit = [
    ...readStringList(input.metadata.classifications ?? input.metadata.categories),
    ...readStringList(input.customAnalysis.classifications ?? input.customAnalysis.categories),
    ...readStringList(input.dynamicVariables.classifications ?? input.dynamicVariables.categories),
  ];
  const inferred: string[] = [];
  const summary = input.summary?.toLowerCase() ?? "";
  const disposition = input.disposition?.toLowerCase() ?? "";
  if (input.voicemail || disposition.includes("voicemail")) {
    inferred.push("Voicemail");
  }
  if (summary.includes("promise") || summary.includes("paying")) {
    inferred.push("Payment promise");
  }
  if (summary.includes("support") || summary.includes("invoice copy") || summary.includes("statement")) {
    inferred.push("Support request");
  }
  if (summary.includes("dispute")) {
    inferred.push("Dispute");
  }
  if (summary.includes("callback") || disposition.includes("callback")) {
    inferred.push("Callback requested");
  }

  return uniqueStrings([...explicit.map(humanizeIdentifier), ...inferred]);
}

function extractPostCallClassifications(input: {
  disposition: string;
  transcriptSummary?: string;
  metadata?: Record<string, unknown>;
}): string[] {
  return extractClassifications({
    metadata: input.metadata ?? {},
    dynamicVariables: {},
    customAnalysis: {},
    disposition: input.disposition,
    summary: input.transcriptSummary,
    voicemail: input.disposition === "voicemail_left",
  });
}

function resolveCallInboxStatus(input: {
  event?: string | undefined;
  callStatus?: string | undefined;
  operatorReviewRequired?: boolean | undefined;
}): CallInboxStatus {
  if (input.operatorReviewRequired) {
    return "needs_review";
  }
  if (input.callStatus === "error" || input.callStatus === "not_connected") {
    return "failed";
  }
  if (input.event === "call_ended" || input.event === "call_analyzed" || input.callStatus === "ended") {
    return "completed";
  }
  return "processing";
}

function resolveDurationSeconds(input: {
  startedAt?: string | undefined;
  endedAt?: string | undefined;
  durationMs?: number | undefined;
  durationSeconds?: number | undefined;
}): number | undefined {
  if (input.durationSeconds !== undefined) {
    return Math.round(input.durationSeconds);
  }
  if (input.durationMs !== undefined) {
    return Math.round(input.durationMs / 1000);
  }
  if (!input.startedAt || !input.endedAt) {
    return undefined;
  }
  const started = new Date(input.startedAt).getTime();
  const ended = new Date(input.endedAt).getTime();
  return Number.isFinite(started) && Number.isFinite(ended)
    ? Math.max(0, Math.round((ended - started) / 1000))
    : undefined;
}

function parseRetellTimestamp(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const timestamp = value > 10_000_000_000 ? value : value * 1000;
    return new Date(timestamp).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parseRetellTimestamp(parsed);
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return undefined;
}

function customerPhoneForDirection(
  direction: CallInboxDirection,
  fromNumber: string | undefined,
  toNumber: string | undefined,
): string | undefined {
  if (direction === "outbound") {
    return toNumber;
  }
  if (direction === "inbound") {
    return fromNumber;
  }
  return toNumber ?? fromNumber;
}

function normalizeDirection(value: unknown): CallInboxDirection {
  return value === "inbound" || value === "outbound" ? value : "unknown";
}

function normalizeSentiment(value: unknown): CallInboxSentiment {
  if (value === "positive" || value === "neutral" || value === "negative") {
    return value;
  }
  return "unknown";
}

function normalizeSpeaker(value: unknown): CallInboxTranscriptSegment["speaker"] {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (normalized === "agent" || normalized === "assistant") {
    return "agent";
  }
  if (normalized === "customer" || normalized === "user" || normalized === "caller") {
    return "customer";
  }
  return "unknown";
}

function readSeconds(...values: unknown[]): number | undefined {
  for (const value of values) {
    const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : undefined;
    if (numeric === undefined || !Number.isFinite(numeric)) {
      continue;
    }
    return numeric > 10_000 ? Math.round(numeric / 1000) : numeric;
  }
  return undefined;
}

function addMinutes(value: string, minutes: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date(Date.now() + minutes * 60_000).toISOString();
  }
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readFirstString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = readString(source[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\n;]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
