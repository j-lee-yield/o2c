import type { BillingAccount, Contact } from "../accounts/schema.js";
import type { ApprovalRequest } from "../approvals/schema.js";
import type { UploadedDocument } from "../documents/schema.js";
import type { CustomerInvoice } from "../invoices/schema.js";
import type { SendingIdentity, SendingIdentityProvider } from "../integrations/email.js";
import type { CallOutcome, CommunicationAttempt } from "../learning-layer/communications.js";
import type { PromiseToPay } from "../promises-to-pay/schema.js";
import type { DomainEntity } from "../../shared/types.js";

export const collectionScopes = ["account", "invoice"] as const;
export type CollectionScope = (typeof collectionScopes)[number];

export const reminderGroupingModes = ["billing_account", "invoice"] as const;
export type ReminderGroupingMode = (typeof reminderGroupingModes)[number];

export const collectionEscalationStages = [
  "friendly_reminder",
  "due_date_reminder",
  "overdue_follow_up",
  "ask_for_payment_date",
  "ask_for_remittance_advice",
  "escalate_to_account_owner",
  "stop_and_mark_exception",
] as const;
export type CollectionEscalationStage = (typeof collectionEscalationStages)[number];

export const collectionReminderDeliveryStates = [
  "ready",
  "approval_needed",
  "blocked",
] as const;
export type CollectionReminderDeliveryState = (typeof collectionReminderDeliveryStates)[number];

export const collectionBlockReasons = [
  "disputed_invoice",
  "missing_contact",
  "outside_send_window",
  "approval_required",
] as const;
export type CollectionBlockReason = (typeof collectionBlockReasons)[number];

export const collectionReplyClassifications = [
  "low_risk_reminder",
  "promise_to_pay",
  "remittance_advice",
  "already_paid",
  "document_request",
  "dispute",
  "unsupported_negotiation",
  "unknown",
  "wrong_contact",
  "invoice_not_received",
  "request_for_docs",
  "partial_dispute",
  "full_dispute",
  "generic_no_action_reply",
] as const;
export type CollectionReplyClassification = (typeof collectionReplyClassifications)[number];

export const requestedDocumentTypes = [
  "invoice",
  "statement_of_account",
  "delivery_receipt",
  "proof_of_delivery",
  "supporting",
] as const;
export type RequestedDocumentType = (typeof requestedDocumentTypes)[number];

export interface CollectionInvoiceRef {
  invoiceId: string;
  invoiceNumber: string;
  parentAccountId: string;
  billingAccountId: string;
  branchId?: string;
  amountCents: number;
  currency: string;
  dueDate?: string;
  daysPastDue?: number;
  isUrgent: boolean;
  state: CustomerInvoice["state"];
}

export interface CollectionSendWindow {
  timezone: string;
  startHour: number;
  endHour: number;
  allowedWeekdays: number[];
}

export interface CollectionReminderDraft extends DomainEntity {
  billingAccountId: string;
  parentAccountId: string;
  branchIds: string[];
  groupingMode: ReminderGroupingMode;
  scope: CollectionScope;
  channel: "email";
  recipientContactId?: string;
  recipientEmail?: string;
  sendStrategy: "auto_send" | "awaiting_approval" | "manual_send";
  deliveryState: CollectionReminderDeliveryState;
  escalationStage: CollectionEscalationStage;
  blockedReason?: CollectionBlockReason;
  sendWindow: CollectionSendWindow;
  urgentInvoiceIds: string[];
  subjectLine: string;
  previewLine: string;
  bodySections: string[];
  invoiceRefs: CollectionInvoiceRef[];
  metadata: Record<string, unknown>;
}

export interface CollectionWorkspace {
  billingAccount: BillingAccount;
  scope: CollectionScope;
  groupingMode: ReminderGroupingMode;
  invoices: CollectionInvoiceRef[];
  openInvoiceCount: number;
  branchIds: string[];
  urgentInvoiceCount: number;
  sendWindow: CollectionSendWindow;
  recommendedRecipient?: Pick<Contact, "id" | "email" | "fullName" | "allowAutoSend" | "isVerified">;
}

export interface PromiseToPayExtraction {
  promiseDate?: string;
  promisedAmountCents?: number;
  currency?: string;
  confidence: number;
  riskFlags: string[];
}

export interface CollectionReplyInvoiceReference {
  invoiceId: string;
  invoiceNumber: string;
  matchedBy: "invoice_number" | "provided_context";
}

export interface CollectionReplyAnalysis {
  classification: CollectionReplyClassification;
  confidence: number;
  requiresHumanReview: boolean;
  reasons: string[];
  extractedPromiseDate?: string;
  extractedAmountCents?: number;
  invoices: CollectionReplyInvoiceReference[];
  requestedDocumentTypes: RequestedDocumentType[];
  ptp?: PromiseToPayExtraction;
}

export interface ResendBundleDocument {
  documentType: RequestedDocumentType;
  sourceDocumentType?: UploadedDocument["documentType"];
  documentId?: string;
  storageKey?: string;
  available: boolean;
  invoiceId?: string;
  missingReason?: string;
}

export interface ResendDocumentBundle extends DomainEntity {
  parentAccountId: string;
  billingAccountId: string;
  recipientContactId?: string;
  invoiceIds: string[];
  requestedDocumentTypes: RequestedDocumentType[];
  documents: ResendBundleDocument[];
  sendStrategy: "auto_send" | "awaiting_review" | "manual_exception";
  servicingClassification: "invoice_not_received" | "request_for_docs";
  metadata: Record<string, unknown>;
}

export interface CustomerMemoryUpdate extends DomainEntity {
  parentAccountId: string;
  billingAccountId: string;
  contactId?: string;
  lastReplyClassification: CollectionReplyClassification;
  lastReplyAt: string;
  promiseToPayState?: string;
  promiseToPayDate?: string;
  wrongContactReported: boolean;
  servicingIssueOpen: boolean;
  requestedDocumentTypes: RequestedDocumentType[];
  disputedInvoiceIds: string[];
  notes: string[];
  metadata: Record<string, unknown>;
}

export const collectionsInboxChannels = ["email", "call"] as const;
export type CollectionsInboxChannel = (typeof collectionsInboxChannels)[number];

export const communicationThreadStatuses = [
  "open",
  "awaiting_internal_review",
  "awaiting_customer",
  "resolved",
  "closed",
] as const;
export type CommunicationThreadStatus = (typeof communicationThreadStatuses)[number];

export const communicationThreadInboxStates = [
  "new",
  "active",
  "reply_review",
  "blocked",
  "resolved",
  "archived",
] as const;
export type CommunicationThreadInboxState = (typeof communicationThreadInboxStates)[number];

export const communicationMessageKinds = [
  "thread_message",
  "draft",
  "bounce_notice",
  "call_note",
] as const;
export type CommunicationMessageKind = (typeof communicationMessageKinds)[number];

export const communicationMessageStatuses = [
  "received",
  "drafted",
  "queued",
  "sent",
  "delivered",
  "bounced",
  "review_required",
  "closed",
] as const;
export type CommunicationMessageStatus = (typeof communicationMessageStatuses)[number];

export const outreachDraftStatuses = [
  "drafted",
  "approval_required",
  "ready_to_send",
  "blocked",
  "manual_only",
  "sent",
] as const;
export type OutreachDraftStatus = (typeof outreachDraftStatuses)[number];

export const contactDeliveryStates = [
  "active",
  "delivered",
  "bounced",
  "suppressed",
  "invalid",
] as const;
export type ContactDeliveryState = (typeof contactDeliveryStates)[number];

export const collectionsTaskKinds = [
  "review_reply",
  "review_bounce",
  "follow_up_promise_to_pay",
  "resend_documents",
  "resolve_wrong_contact",
  "review_dispute",
  "schedule_callback",
  "review_call",
  "link_remittance",
] as const;
export type CollectionsTaskKind = (typeof collectionsTaskKinds)[number];

export const collectionsTaskStatuses = [
  "open",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type CollectionsTaskStatus = (typeof collectionsTaskStatuses)[number];

export interface SenderIdentityIntegrationHook {
  senderIdentityId?: string;
  provider: SendingIdentityProvider | "internal";
  senderEmail?: string;
  displayName?: string;
  canSend: boolean;
  requiresReauth: boolean;
  reasonCodes: string[];
  metadata: Record<string, unknown>;
}

export interface CollectionsTaskAuditEntry {
  occurredAt: string;
  action: string;
  actorId: string;
  actorRole: "system" | "user";
  summary: string;
}

export interface CollectionsExtractedTask extends DomainEntity {
  billingAccountId: string;
  parentAccountId: string;
  branchId?: string;
  contactId?: string;
  threadId?: string;
  messageId?: string;
  callSessionId?: string;
  kind: CollectionsTaskKind;
  status: CollectionsTaskStatus;
  title: string;
  description: string;
  dueAt?: string;
  auditTrail: CollectionsTaskAuditEntry[];
  metadata: Record<string, unknown>;
}

export interface CommunicationThread extends DomainEntity {
  channel: CollectionsInboxChannel;
  parentAccountId: string;
  billingAccountId: string;
  branchIds: string[];
  contactId?: string;
  senderIdentityHook?: SenderIdentityIntegrationHook;
  status: CommunicationThreadStatus;
  inboxState: CommunicationThreadInboxState;
  subjectLine?: string;
  participantAddresses: string[];
  invoiceIds: string[];
  promiseToPayIds: string[];
  latestMessageId?: string;
  latestMessageAt?: string;
  unreadCount: number;
  providerThreadId?: string;
  providerConversationId?: string;
  metadata: Record<string, unknown>;
}

export interface CommunicationMessage extends DomainEntity {
  threadId: string;
  channel: CollectionsInboxChannel;
  kind: CommunicationMessageKind;
  status: CommunicationMessageStatus;
  direction: CommunicationAttempt["direction"];
  parentAccountId: string;
  billingAccountId: string;
  branchId?: string;
  contactId?: string;
  senderIdentityHook?: SenderIdentityIntegrationHook;
  subjectLine?: string;
  bodyPreview: string;
  bodyText?: string;
  providerMessageId?: string;
  providerThreadId?: string;
  providerConversationId?: string;
  inReplyToProviderMessageId?: string;
  fromAddress?: string;
  toAddress?: string;
  occurredAt: string;
  replyAnalysis?: CollectionReplyAnalysis;
  metadata: Record<string, unknown>;
}

export interface CallSession extends DomainEntity {
  threadId?: string;
  parentAccountId: string;
  billingAccountId: string;
  branchId?: string;
  contactId?: string;
  senderIdentityHook?: SenderIdentityIntegrationHook;
  provider: CommunicationAttempt["provider"];
  providerCallId?: string;
  direction: CommunicationAttempt["direction"];
  disposition: CallOutcome["disposition"];
  answered: boolean;
  startedAt: string;
  endedAt?: string;
  transcriptSummary?: string;
  transcriptSegments: CallOutcome["transcriptSegments"];
  sentimentLabel?: CallOutcome["sentimentLabel"];
  operatorReviewRequired: boolean;
  promiseToPayId?: string;
  metadata: Record<string, unknown>;
}

export interface OutreachDraft extends DomainEntity {
  channel: CollectionsInboxChannel;
  threadId?: string;
  parentAccountId: string;
  billingAccountId: string;
  branchIds: string[];
  contactId?: string;
  invoiceIds: string[];
  senderIdentityHook?: SenderIdentityIntegrationHook;
  status: OutreachDraftStatus;
  subjectLine?: string;
  bodyPreview: string;
  bodyText?: string;
  approvalRequestId?: string;
  replyToMessageId?: string;
  emailFirstProductionBehavior: boolean;
  metadata: Record<string, unknown>;
}

export interface ContactDeliveryStatus extends DomainEntity {
  parentAccountId: string;
  billingAccountId: string;
  contactId?: string;
  channel: Extract<CollectionsInboxChannel, "email">;
  destination: string;
  state: ContactDeliveryState;
  lastAttemptAt?: string;
  lastDeliveredAt?: string;
  lastBouncedAt?: string;
  lastBounceReason?: string;
  relatedMessageId?: string;
  metadata: Record<string, unknown>;
}

export interface PromiseToPayExtractionResult extends DomainEntity {
  parentAccountId: string;
  billingAccountId: string;
  contactId?: string;
  sourceType: "communication_message" | "call_session";
  sourceId: string;
  extracted: boolean;
  confidence: number;
  requiresReview: boolean;
  promiseDate?: string;
  promisedAmountCents?: number;
  currency?: string;
  riskFlags: string[];
  promiseToPayId?: string;
  metadata: Record<string, unknown>;
}

export interface ThreadDetailReadModel {
  thread: CommunicationThread;
  messages: CommunicationMessage[];
  latestDeliveryStatus?: ContactDeliveryStatus;
  tasks: CollectionsExtractedTask[];
  promiseToPayExtractions: PromiseToPayExtractionResult[];
  drafts: OutreachDraft[];
}

export interface ReplyReviewReadModel {
  thread: CommunicationThread;
  message: CommunicationMessage;
  analysis: CollectionReplyAnalysis;
  approvalRequired: boolean;
  blockedReasonCodes: string[];
  recommendedDraftStatus: OutreachDraftStatus;
  latestDeliveryStatus?: ContactDeliveryStatus;
  tasks: CollectionsExtractedTask[];
  promiseToPayExtraction?: PromiseToPayExtractionResult;
}

export interface CallDetailReadModel {
  callSession: CallSession;
  taskList: CollectionsExtractedTask[];
  promiseToPayExtraction?: PromiseToPayExtractionResult;
  approvalRequired: boolean;
  emailFirstProductionBehavior: boolean;
}

export interface EmailInboxWorkspaceItem {
  threadId: string;
  billingAccountId: string;
  subjectLine?: string;
  latestMessagePreview?: string;
  latestMessageAt?: string;
  contactId?: string;
  participantAddresses: string[];
  unreadCount: number;
  inboxState: CommunicationThreadInboxState;
  latestDeliveryState?: ContactDeliveryState;
  replyReviewRequired: boolean;
  senderReady: boolean;
}

export interface EmailInboxWorkspace {
  channel: "email";
  productionMode: "active";
  items: EmailInboxWorkspaceItem[];
  draftCount: number;
  blockedCount: number;
}

export interface CallInboxWorkspaceItem {
  callSessionId: string;
  billingAccountId: string;
  contactId?: string;
  disposition: CallSession["disposition"];
  startedAt: string;
  operatorReviewRequired: boolean;
  taskCount: number;
}

export interface CallInboxWorkspace {
  channel: "call";
  productionMode: "manual_only";
  items: CallInboxWorkspaceItem[];
  openReviewCount: number;
}

export interface CollectionsWorkspaceReadModel {
  account: Pick<BillingAccount, "id" | "parentAccountId" | "displayName" | "currency">;
  emailInbox: EmailInboxWorkspace;
  callInbox: CallInboxWorkspace;
  pendingApprovalIds: string[];
}

export interface CollectionsWorkspaceAggregate {
  account: BillingAccount;
  threads: CommunicationThread[];
  messages: CommunicationMessage[];
  callSessions: CallSession[];
  drafts: OutreachDraft[];
  deliveryStatuses: ContactDeliveryStatus[];
  approvals?: ApprovalRequest[];
  tasks: CollectionsExtractedTask[];
  promiseToPayExtractions: PromiseToPayExtractionResult[];
  promisesToPay?: PromiseToPay[];
}
