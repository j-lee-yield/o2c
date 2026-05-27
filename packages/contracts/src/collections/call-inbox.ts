export type CallInboxProvider = "retell" | "twilio" | "vapi" | "elevenlabs" | "other";

export type CallInboxDirection = "inbound" | "outbound" | "unknown";

export type CallInboxStatus =
  | "processing"
  | "completed"
  | "needs_review"
  | "failed"
  | "archived";

export type CallInboxSentiment = "positive" | "neutral" | "negative" | "unknown";

export interface CallInboxInvoiceReference {
  invoiceId?: string;
  invoiceNumber: string;
  billingAccountId?: string;
  branchId?: string;
  amountCents?: number;
  currency?: string;
}

export interface CallInboxTranscriptSegment {
  speaker: "agent" | "customer" | "unknown";
  text: string;
  startedAtSeconds?: number;
  endedAtSeconds?: number;
}

export interface CallInboxTaskReference {
  id: string;
  title: string;
  status: "open" | "completed" | "closed" | "dismissed";
  taskType?: string;
  ownerTeam?: string;
  dueAt?: string;
}

export interface CallInboxCallRecord {
  id: string;
  tenantId: string;
  provider: CallInboxProvider;
  providerCallId: string;
  communicationAttemptId?: string;
  preCallPlanId?: string;
  parentAccountId?: string;
  billingAccountId?: string;
  branchId?: string;
  contactId?: string;
  customerName: string;
  customerPhone?: string;
  fromNumber?: string;
  toNumber?: string;
  direction: CallInboxDirection;
  status: CallInboxStatus;
  providerStatus?: string;
  disposition?: string;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  voicemail: boolean;
  sentiment: CallInboxSentiment;
  classifications: string[];
  workflowId?: string;
  workflowName?: string;
  requestedBy?: string;
  approverId?: string;
  approverName?: string;
  invoiceRefs: CallInboxInvoiceReference[];
  summary?: string;
  transcriptUri?: string;
  transcriptSegments: CallInboxTranscriptSegment[];
  recordingUrl?: string;
  recordingExpiresAt?: string;
  publicLogUrl?: string;
  taskRefs: CallInboxTaskReference[];
  openTasksCount: number;
  metadata: Record<string, unknown>;
  rawProviderPayload?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CallInboxFilters {
  direction?: CallInboxDirection;
  status?: CallInboxStatus;
  voicemail?: boolean;
  customer?: string;
  classification?: string;
  workflow?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface CallInboxListItem {
  id: string;
  providerCallId: string;
  customerName: string;
  customerPhone?: string;
  billingAccountId?: string;
  branchId?: string;
  direction: CallInboxDirection;
  status: CallInboxStatus;
  providerStatus?: string;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  voicemail: boolean;
  sentiment: CallInboxSentiment;
  classifications: string[];
  workflowName?: string;
  requestedBy?: string;
  approverName?: string;
  invoiceNumbers: string[];
  openTasksCount: number;
}

export interface CallInboxListResponse {
  generatedAt: string;
  source: {
    kind: "live" | "seeded" | "empty";
    label: string;
    detail: string;
  };
  total: number;
  filters: CallInboxFilters;
  items: CallInboxListItem[];
}

export interface CallInboxDetailResponse {
  generatedAt: string;
  call: CallInboxCallRecord;
}
