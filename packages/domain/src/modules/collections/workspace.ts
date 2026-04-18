import {
  canUseSendingIdentityForOutbound,
  type SendingIdentity,
} from "../integrations/email.js";
import type { CommunicationAttempt, EmailFailureMetadata } from "../learning-layer/communications.js";
import type { BillingAccount, Contact } from "../accounts/schema.js";
import type { ApprovalRequest } from "../approvals/schema.js";
import type { PromiseToPay } from "../promises-to-pay/schema.js";
import { createEntityMetadata, evolveEntityMetadata } from "../../shared/types.js";
import type {
  CallDetailReadModel,
  CallSession,
  CollectionReplyAnalysis,
  CollectionsExtractedTask,
  CollectionsWorkspaceAggregate,
  CollectionsWorkspaceReadModel,
  CommunicationMessage,
  CommunicationThread,
  ContactDeliveryStatus,
  EmailInboxWorkspace,
  EmailInboxWorkspaceItem,
  OutreachDraft,
  PromiseToPayExtractionResult,
  ReplyReviewReadModel,
  SenderIdentityIntegrationHook,
  ThreadDetailReadModel,
} from "./schema.js";

export function createSenderIdentityIntegrationHook(input: {
  identity?: SendingIdentity;
  metadata?: Record<string, unknown>;
}): SenderIdentityIntegrationHook | undefined {
  if (!input.identity) {
    return undefined;
  }

  const reasonCodes: string[] = [];
  if (input.identity.connectionStatus !== "connected") {
    reasonCodes.push("identity_not_connected");
  }
  if (input.identity.permissionStatus === "missing") {
    reasonCodes.push("identity_permissions_missing");
  }
  if (input.identity.healthState === "unhealthy") {
    reasonCodes.push("identity_unhealthy");
  }

  return {
    senderIdentityId: input.identity.id,
    provider: input.identity.provider,
    senderEmail: input.identity.senderEmail,
    ...(input.identity.displayName ? { displayName: input.identity.displayName } : {}),
    canSend: canUseSendingIdentityForOutbound(input.identity),
    requiresReauth:
      input.identity.connectionStatus !== "connected" ||
      input.identity.permissionStatus === "missing",
    reasonCodes,
    metadata: input.metadata ?? {},
  };
}

export function createCommunicationThread(input: {
  id: string;
  channel: CommunicationThread["channel"];
  account: BillingAccount;
  contactId?: string;
  branchIds?: string[];
  subjectLine?: string;
  participantAddresses?: string[];
  invoiceIds?: string[];
  promiseToPayIds?: string[];
  providerThreadId?: string;
  providerConversationId?: string;
  senderIdentityHook?: SenderIdentityIntegrationHook;
  status?: CommunicationThread["status"];
  inboxState?: CommunicationThread["inboxState"];
  unreadCount?: number;
  latestMessageId?: string;
  latestMessageAt?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}): CommunicationThread {
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.createdAt,
      actorId: "system_collections_workspace",
      actorRole: "system",
    }),
    channel: input.channel,
    parentAccountId: input.account.parentAccountId,
    billingAccountId: input.account.id,
    branchIds: [...(input.branchIds ?? [])],
    ...(input.contactId ? { contactId: input.contactId } : {}),
    ...(input.senderIdentityHook ? { senderIdentityHook: input.senderIdentityHook } : {}),
    status: input.status ?? "open",
    inboxState: input.inboxState ?? "active",
    ...(input.subjectLine ? { subjectLine: input.subjectLine } : {}),
    participantAddresses: uniqueStrings(input.participantAddresses),
    invoiceIds: [...(input.invoiceIds ?? [])],
    promiseToPayIds: [...(input.promiseToPayIds ?? [])],
    ...(input.latestMessageId ? { latestMessageId: input.latestMessageId } : {}),
    ...(input.latestMessageAt ? { latestMessageAt: input.latestMessageAt } : {}),
    unreadCount: input.unreadCount ?? 0,
    ...(input.providerThreadId ? { providerThreadId: input.providerThreadId } : {}),
    ...(input.providerConversationId
      ? { providerConversationId: input.providerConversationId }
      : {}),
    metadata: input.metadata ?? {},
  };
}

export function createCommunicationMessage(input: {
  id: string;
  threadId: string;
  channel: CommunicationMessage["channel"];
  kind?: CommunicationMessage["kind"];
  status?: CommunicationMessage["status"];
  direction: CommunicationMessage["direction"];
  account: BillingAccount;
  contactId?: string;
  branchId?: string;
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
  metadata?: Record<string, unknown>;
}): CommunicationMessage {
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.occurredAt,
      actorId: "system_collections_workspace",
      actorRole: "system",
    }),
    threadId: input.threadId,
    channel: input.channel,
    kind: input.kind ?? "thread_message",
    status:
      input.status ??
      (input.direction === "inbound"
        ? "received"
        : input.channel === "call"
          ? "closed"
          : "drafted"),
    direction: input.direction,
    parentAccountId: input.account.parentAccountId,
    billingAccountId: input.account.id,
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.contactId ? { contactId: input.contactId } : {}),
    ...(input.senderIdentityHook ? { senderIdentityHook: input.senderIdentityHook } : {}),
    ...(input.subjectLine ? { subjectLine: input.subjectLine } : {}),
    bodyPreview: input.bodyPreview,
    ...(input.bodyText ? { bodyText: input.bodyText } : {}),
    ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
    ...(input.providerThreadId ? { providerThreadId: input.providerThreadId } : {}),
    ...(input.providerConversationId
      ? { providerConversationId: input.providerConversationId }
      : {}),
    ...(input.inReplyToProviderMessageId
      ? { inReplyToProviderMessageId: input.inReplyToProviderMessageId }
      : {}),
    ...(input.fromAddress ? { fromAddress: input.fromAddress.toLowerCase() } : {}),
    ...(input.toAddress ? { toAddress: input.toAddress.toLowerCase() } : {}),
    occurredAt: input.occurredAt,
    ...(input.replyAnalysis ? { replyAnalysis: input.replyAnalysis } : {}),
    metadata: input.metadata ?? {},
  };
}

export function createCallSession(input: {
  id: string;
  account: BillingAccount;
  provider: CommunicationAttempt["provider"];
  direction: CommunicationAttempt["direction"];
  disposition: CallSession["disposition"];
  answered: boolean;
  startedAt: string;
  endedAt?: string;
  threadId?: string;
  branchId?: string;
  contactId?: string;
  providerCallId?: string;
  senderIdentityHook?: SenderIdentityIntegrationHook;
  transcriptSummary?: string;
  transcriptSegments?: CallSession["transcriptSegments"];
  sentimentLabel?: CallSession["sentimentLabel"];
  operatorReviewRequired?: boolean;
  promiseToPayId?: string;
  metadata?: Record<string, unknown>;
}): CallSession {
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.startedAt,
      actorId: "system_collections_workspace",
      actorRole: "system",
    }),
    ...(input.threadId ? { threadId: input.threadId } : {}),
    parentAccountId: input.account.parentAccountId,
    billingAccountId: input.account.id,
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.contactId ? { contactId: input.contactId } : {}),
    ...(input.senderIdentityHook ? { senderIdentityHook: input.senderIdentityHook } : {}),
    provider: input.provider,
    ...(input.providerCallId ? { providerCallId: input.providerCallId } : {}),
    direction: input.direction,
    disposition: input.disposition,
    answered: input.answered,
    startedAt: input.startedAt,
    ...(input.endedAt ? { endedAt: input.endedAt } : {}),
    ...(input.transcriptSummary ? { transcriptSummary: input.transcriptSummary } : {}),
    transcriptSegments: [...(input.transcriptSegments ?? [])],
    ...(input.sentimentLabel ? { sentimentLabel: input.sentimentLabel } : {}),
    operatorReviewRequired: input.operatorReviewRequired ?? true,
    ...(input.promiseToPayId ? { promiseToPayId: input.promiseToPayId } : {}),
    metadata: input.metadata ?? {},
  };
}

export function createOutreachDraft(input: {
  id: string;
  channel: OutreachDraft["channel"];
  account: BillingAccount;
  branchIds?: string[];
  contact?: Pick<Contact, "id" | "isVerified" | "allowAutoSend">;
  invoiceIds?: string[];
  senderIdentityHook?: SenderIdentityIntegrationHook;
  approvalRequestId?: string;
  threadId?: string;
  replyToMessageId?: string;
  subjectLine?: string;
  bodyPreview: string;
  bodyText?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}): OutreachDraft {
  const bounced =
    input.metadata?.deliveryState === "bounced" ||
    input.metadata?.deliveryState === "suppressed" ||
    input.metadata?.deliveryState === "invalid";
  const unverified = input.channel === "email" && !input.contact?.isVerified;
  const notAutoSendReady = input.channel === "email" && !input.contact?.allowAutoSend;
  const senderBlocked = input.channel === "email" && input.senderIdentityHook?.canSend === false;
  const emailFirstProductionBehavior = true;

  let status: OutreachDraft["status"];
  if (input.channel === "call") {
    status = "manual_only";
  } else if (bounced || senderBlocked) {
    status = "blocked";
  } else if (input.approvalRequestId || unverified || notAutoSendReady) {
    status = "approval_required";
  } else {
    status = "ready_to_send";
  }

  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.createdAt,
      actorId: "system_collections_workspace",
      actorRole: "system",
    }),
    channel: input.channel,
    ...(input.threadId ? { threadId: input.threadId } : {}),
    parentAccountId: input.account.parentAccountId,
    billingAccountId: input.account.id,
    branchIds: [...(input.branchIds ?? [])],
    ...(input.contact?.id ? { contactId: input.contact.id } : {}),
    invoiceIds: [...(input.invoiceIds ?? [])],
    ...(input.senderIdentityHook ? { senderIdentityHook: input.senderIdentityHook } : {}),
    status,
    ...(input.subjectLine ? { subjectLine: input.subjectLine } : {}),
    bodyPreview: input.bodyPreview,
    ...(input.bodyText ? { bodyText: input.bodyText } : {}),
    ...(input.approvalRequestId ? { approvalRequestId: input.approvalRequestId } : {}),
    ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
    emailFirstProductionBehavior,
    metadata: {
      ...(unverified ? { contactVerified: false } : { contactVerified: true }),
      ...(notAutoSendReady ? { allowAutoSend: false } : { allowAutoSend: true }),
      ...input.metadata,
    },
  };
}

export function createContactDeliveryStatus(input: {
  id: string;
  account: BillingAccount;
  destination: string;
  contactId?: string;
  state?: ContactDeliveryStatus["state"];
  lastAttemptAt?: string;
  lastDeliveredAt?: string;
  lastBouncedAt?: string;
  lastBounceReason?: string;
  relatedMessageId?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}): ContactDeliveryStatus {
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.createdAt,
      actorId: "system_collections_workspace",
      actorRole: "system",
    }),
    parentAccountId: input.account.parentAccountId,
    billingAccountId: input.account.id,
    ...(input.contactId ? { contactId: input.contactId } : {}),
    channel: "email",
    destination: input.destination.toLowerCase(),
    state: input.state ?? "active",
    ...(input.lastAttemptAt ? { lastAttemptAt: input.lastAttemptAt } : {}),
    ...(input.lastDeliveredAt ? { lastDeliveredAt: input.lastDeliveredAt } : {}),
    ...(input.lastBouncedAt ? { lastBouncedAt: input.lastBouncedAt } : {}),
    ...(input.lastBounceReason ? { lastBounceReason: input.lastBounceReason } : {}),
    ...(input.relatedMessageId ? { relatedMessageId: input.relatedMessageId } : {}),
    metadata: input.metadata ?? {},
  };
}

export function applyEmailBounceToDeliveryStatus(
  status: ContactDeliveryStatus,
  input: {
    failedAt: string;
    failure: Pick<EmailFailureMetadata, "failureKind" | "reasonSummary">;
    relatedMessageId?: string;
  },
): ContactDeliveryStatus {
  const nextState =
    input.failure.failureKind === "invalid_recipient" ? "invalid" : "bounced";

  return {
    ...status,
    ...evolveEntityMetadata(status, {
      at: input.failedAt,
      actorId: "system_collections_workspace",
      actorRole: "system",
    }),
    state: nextState,
    lastAttemptAt: input.failedAt,
    lastBouncedAt: input.failedAt,
    lastBounceReason: input.failure.reasonSummary,
    ...(input.relatedMessageId ? { relatedMessageId: input.relatedMessageId } : {}),
    metadata: {
      ...status.metadata,
      lastFailureKind: input.failure.failureKind,
    },
  };
}

export function createPromiseToPayExtractionResult(input: {
  id: string;
  account: BillingAccount;
  sourceType: PromiseToPayExtractionResult["sourceType"];
  sourceId: string;
  occurredAt: string;
  contactId?: string;
  analysis?: Pick<
    CollectionReplyAnalysis,
    "classification" | "confidence" | "ptp" | "extractedPromiseDate" | "extractedAmountCents"
  >;
  callPromise?: {
    promisedAmountCents?: number;
    promisedDate?: string;
    confidence?: number;
  };
  promiseToPay?: PromiseToPay;
  metadata?: Record<string, unknown>;
}): PromiseToPayExtractionResult {
  const promisedAmountCents =
    input.analysis?.ptp?.promisedAmountCents ??
    input.analysis?.extractedAmountCents ??
    input.callPromise?.promisedAmountCents;
  const promiseDate =
    input.analysis?.ptp?.promiseDate ??
    input.analysis?.extractedPromiseDate ??
    input.callPromise?.promisedDate;
  const riskFlags = [...(input.analysis?.ptp?.riskFlags ?? [])];
  const extracted = promiseDate !== undefined || promisedAmountCents !== undefined;
  const requiresReview = riskFlags.length > 0 || input.promiseToPay?.state === "detected_unconfirmed";

  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.occurredAt,
      actorId: "system_collections_workspace",
      actorRole: "system",
    }),
    parentAccountId: input.account.parentAccountId,
    billingAccountId: input.account.id,
    ...(input.contactId ? { contactId: input.contactId } : {}),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    extracted,
    confidence:
      input.analysis?.ptp?.confidence ??
      input.analysis?.confidence ??
      input.callPromise?.confidence ??
      0,
    requiresReview,
    ...(promiseDate ? { promiseDate } : {}),
    ...(promisedAmountCents !== undefined ? { promisedAmountCents } : {}),
    ...(input.promiseToPay ? { currency: input.promiseToPay.currency, promiseToPayId: input.promiseToPay.id } : {}),
    riskFlags,
    metadata: {
      classification: input.analysis?.classification,
      ...input.metadata,
    },
  };
}

export function extractTasksFromMessage(input: {
  idGenerator: (suffix: string) => string;
  occurredAt: string;
  thread: CommunicationThread;
  message: CommunicationMessage;
  latestDeliveryStatus?: ContactDeliveryStatus;
}): CollectionsExtractedTask[] {
  const analysis = input.message.replyAnalysis;
  if (!analysis) {
    return [];
  }

  const tasks: CollectionsExtractedTask[] = [];
  if (input.latestDeliveryStatus?.state === "bounced") {
    tasks.push(
      createCollectionsTask({
        id: input.idGenerator("bounce"),
        occurredAt: input.occurredAt,
        thread: input.thread,
        message: input.message,
        kind: "review_bounce",
        title: "Review bounced contact",
        description: "Bounce handling requires a verified replacement contact before more outreach.",
      }),
    );
  }

  switch (analysis.classification) {
    case "promise_to_pay":
      tasks.push(
        createCollectionsTask({
          id: input.idGenerator("ptp"),
          occurredAt: input.occurredAt,
          thread: input.thread,
          message: input.message,
          kind: "follow_up_promise_to_pay",
          title: "Follow up promise to pay",
          description: "Track the buyer commitment and confirm whether payment arrives on time.",
        }),
      );
      break;
    case "request_for_docs":
    case "invoice_not_received":
      tasks.push(
        createCollectionsTask({
          id: input.idGenerator("docs"),
          occurredAt: input.occurredAt,
          thread: input.thread,
          message: input.message,
          kind: "resend_documents",
          title: "Prepare supporting documents",
          description: "Document resend work should be reviewed before responding when supporting files are requested.",
        }),
      );
      break;
    case "wrong_contact":
      tasks.push(
        createCollectionsTask({
          id: input.idGenerator("wrong-contact"),
          occurredAt: input.occurredAt,
          thread: input.thread,
          message: input.message,
          kind: "resolve_wrong_contact",
          title: "Resolve wrong contact",
          description: "Update the verified contact routing before any new collections outreach.",
        }),
      );
      break;
    case "partial_dispute":
    case "full_dispute":
      tasks.push(
        createCollectionsTask({
          id: input.idGenerator("dispute"),
          occurredAt: input.occurredAt,
          thread: input.thread,
          message: input.message,
          kind: "review_dispute",
          title: "Review dispute response",
          description: "Collections must pause while the dispute is triaged with supporting context.",
        }),
      );
      break;
    default:
      if (analysis.requiresHumanReview) {
        tasks.push(
          createCollectionsTask({
            id: input.idGenerator("review"),
            occurredAt: input.occurredAt,
            thread: input.thread,
            message: input.message,
            kind: "review_reply",
            title: "Review inbound reply",
            description: "The latest reply has conditions that require operator review.",
          }),
        );
      }
      break;
  }

  return tasks;
}

export function extractTasksFromCall(input: {
  idGenerator: (suffix: string) => string;
  occurredAt: string;
  callSession: CallSession;
}): CollectionsExtractedTask[] {
  const tasks: CollectionsExtractedTask[] = [];
  if (input.callSession.disposition === "callback_requested") {
    tasks.push(
      createCollectionsTask({
        id: input.idGenerator("callback"),
        occurredAt: input.occurredAt,
        callSession: input.callSession,
        kind: "schedule_callback",
        title: "Schedule callback",
        description: "The contact requested a callback, so the call queue needs a follow-up task.",
      }),
    );
  }
  if (input.callSession.operatorReviewRequired || input.callSession.disposition === "wrong_contact") {
    tasks.push(
      createCollectionsTask({
        id: input.idGenerator("call-review"),
        occurredAt: input.occurredAt,
        callSession: input.callSession,
        kind: input.callSession.disposition === "wrong_contact" ? "resolve_wrong_contact" : "review_call",
        title:
          input.callSession.disposition === "wrong_contact"
            ? "Resolve wrong call contact"
            : "Review call outcome",
        description:
          input.callSession.disposition === "wrong_contact"
            ? "Voice outreach found the wrong party and must not continue automatically."
            : "Call outcomes remain manual-first for day-1 operations.",
      }),
    );
  }
  if (input.callSession.promiseToPayId) {
    tasks.push(
      createCollectionsTask({
        id: input.idGenerator("call-ptp"),
        occurredAt: input.occurredAt,
        callSession: input.callSession,
        kind: "follow_up_promise_to_pay",
        title: "Track call promise to pay",
        description: "A promise to pay was captured from the call and needs follow-up monitoring.",
      }),
    );
  }

  return tasks;
}

export function buildReplyReviewReadModel(input: {
  thread: CommunicationThread;
  message: CommunicationMessage;
  latestDeliveryStatus?: ContactDeliveryStatus;
  tasks?: CollectionsExtractedTask[];
  promiseToPayExtraction?: PromiseToPayExtractionResult;
}): ReplyReviewReadModel | undefined {
  if (!input.message.replyAnalysis) {
    return undefined;
  }

  const blockedReasonCodes: string[] = [];
  if (input.latestDeliveryStatus?.state === "bounced") {
    blockedReasonCodes.push("email_bounced");
  }
  if (input.latestDeliveryStatus?.state === "suppressed") {
    blockedReasonCodes.push("email_suppressed");
  }
  if (input.thread.senderIdentityHook && !input.thread.senderIdentityHook.canSend) {
    blockedReasonCodes.push(...input.thread.senderIdentityHook.reasonCodes);
  }
  if (input.message.replyAnalysis.requiresHumanReview) {
    blockedReasonCodes.push("analysis_requires_review");
  }

  const recommendedDraftStatus =
    blockedReasonCodes.length > 0
      ? "blocked"
      : input.message.replyAnalysis.requiresHumanReview
        ? "approval_required"
        : "ready_to_send";

  return {
    thread: input.thread,
    message: input.message,
    analysis: input.message.replyAnalysis,
    approvalRequired:
      input.message.replyAnalysis.requiresHumanReview || recommendedDraftStatus === "approval_required",
    blockedReasonCodes,
    recommendedDraftStatus,
    ...(input.latestDeliveryStatus ? { latestDeliveryStatus: input.latestDeliveryStatus } : {}),
    tasks: [...(input.tasks ?? [])],
    ...(input.promiseToPayExtraction ? { promiseToPayExtraction: input.promiseToPayExtraction } : {}),
  };
}

export function buildThreadDetailReadModel(input: {
  thread: CommunicationThread;
  messages: CommunicationMessage[];
  drafts?: OutreachDraft[];
  deliveryStatuses?: ContactDeliveryStatus[];
  tasks?: CollectionsExtractedTask[];
  promiseToPayExtractions?: PromiseToPayExtractionResult[];
}): ThreadDetailReadModel {
  return {
    thread: input.thread,
    messages: [...input.messages].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    ...(input.deliveryStatuses?.[0] ? { latestDeliveryStatus: input.deliveryStatuses[0] } : {}),
    tasks: [...(input.tasks ?? [])],
    promiseToPayExtractions: [...(input.promiseToPayExtractions ?? [])],
    drafts: [...(input.drafts ?? [])].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  };
}

export function buildCallDetailReadModel(input: {
  callSession: CallSession;
  tasks?: CollectionsExtractedTask[];
  promiseToPayExtraction?: PromiseToPayExtractionResult;
}): CallDetailReadModel {
  return {
    callSession: input.callSession,
    taskList: [...(input.tasks ?? [])],
    ...(input.promiseToPayExtraction ? { promiseToPayExtraction: input.promiseToPayExtraction } : {}),
    approvalRequired: input.callSession.operatorReviewRequired,
    emailFirstProductionBehavior: true,
  };
}

export function buildEmailInboxWorkspace(input: {
  threads: CommunicationThread[];
  messages: CommunicationMessage[];
  drafts?: OutreachDraft[];
  deliveryStatuses?: ContactDeliveryStatus[];
}): EmailInboxWorkspace {
  const items: EmailInboxWorkspaceItem[] = input.threads
    .filter((thread) => thread.channel === "email")
    .map((thread) => {
      const latestMessage = input.messages
        .filter((message) => message.threadId === thread.id)
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0];
      const latestDeliveryState = input.deliveryStatuses
        ?.filter((status) => status.billingAccountId === thread.billingAccountId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.state;

      return {
        threadId: thread.id,
        billingAccountId: thread.billingAccountId,
        ...(thread.subjectLine ? { subjectLine: thread.subjectLine } : {}),
        ...(latestMessage?.bodyPreview ? { latestMessagePreview: latestMessage.bodyPreview } : {}),
        ...(thread.latestMessageAt ? { latestMessageAt: thread.latestMessageAt } : {}),
        ...(thread.contactId ? { contactId: thread.contactId } : {}),
        participantAddresses: [...thread.participantAddresses],
        unreadCount: thread.unreadCount,
        inboxState: thread.inboxState,
        ...(latestDeliveryState ? { latestDeliveryState } : {}),
        replyReviewRequired: latestMessage?.replyAnalysis?.requiresHumanReview ?? false,
        senderReady: thread.senderIdentityHook?.canSend ?? false,
      };
    })
    .sort((left, right) => (right.latestMessageAt ?? "").localeCompare(left.latestMessageAt ?? ""));

  return {
    channel: "email",
    productionMode: "active",
    items,
    draftCount: (input.drafts ?? []).filter((draft) => draft.channel === "email").length,
    blockedCount: items.filter((item) => item.inboxState === "blocked").length,
  };
}

export function buildCollectionsWorkspaceReadModel(
  aggregate: CollectionsWorkspaceAggregate,
): CollectionsWorkspaceReadModel {
  const emailInbox = buildEmailInboxWorkspace({
    threads: aggregate.threads,
    messages: aggregate.messages,
    drafts: aggregate.drafts,
    deliveryStatuses: aggregate.deliveryStatuses,
  });

  return {
    account: {
      id: aggregate.account.id,
      parentAccountId: aggregate.account.parentAccountId,
      displayName: aggregate.account.displayName,
      currency: aggregate.account.currency,
    },
    emailInbox,
    callInbox: {
      channel: "call",
      productionMode: "manual_only",
      items: aggregate.callSessions
        .map((callSession) => ({
          callSessionId: callSession.id,
          billingAccountId: callSession.billingAccountId,
          ...(callSession.contactId ? { contactId: callSession.contactId } : {}),
          disposition: callSession.disposition,
          startedAt: callSession.startedAt,
          operatorReviewRequired: callSession.operatorReviewRequired,
          taskCount: aggregate.tasks.filter((task) => task.callSessionId === callSession.id).length,
        }))
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt)),
      openReviewCount: aggregate.callSessions.filter((callSession) => callSession.operatorReviewRequired).length,
    },
    pendingApprovalIds: (aggregate.approvals ?? [])
      .filter((approval) => approval.status === "pending_approval")
      .map((approval) => approval.id),
  };
}

export function findLatestThreadApproval(input: {
  threadId: string;
  drafts: OutreachDraft[];
  approvals?: ApprovalRequest[];
}): ApprovalRequest | undefined {
  const approvalId = [...input.drafts]
    .filter((draft) => draft.threadId === input.threadId && draft.approvalRequestId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]?.approvalRequestId;

  return input.approvals?.find((approval) => approval.id === approvalId);
}

function createCollectionsTask(input: {
  id: string;
  occurredAt: string;
  kind: CollectionsExtractedTask["kind"];
  title: string;
  description: string;
  thread?: CommunicationThread;
  message?: CommunicationMessage;
  callSession?: CallSession;
}): CollectionsExtractedTask {
  const accountId =
    input.thread?.billingAccountId ??
    input.message?.billingAccountId ??
    input.callSession?.billingAccountId;
  const parentAccountId =
    input.thread?.parentAccountId ??
    input.message?.parentAccountId ??
    input.callSession?.parentAccountId;

  if (!accountId || !parentAccountId) {
    throw new Error("Collections tasks require billing account context.");
  }

  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.occurredAt,
      actorId: "system_collections_workspace",
      actorRole: "system",
    }),
    billingAccountId: accountId,
    parentAccountId,
    ...(input.message?.branchId ? { branchId: input.message.branchId } : {}),
    ...(input.message?.contactId
      ? { contactId: input.message.contactId }
      : input.thread?.contactId
        ? { contactId: input.thread.contactId }
        : input.callSession?.contactId
          ? { contactId: input.callSession.contactId }
          : {}),
    ...(input.thread ? { threadId: input.thread.id } : {}),
    ...(input.message ? { messageId: input.message.id } : {}),
    ...(input.callSession ? { callSessionId: input.callSession.id } : {}),
    kind: input.kind,
    status: "open",
    title: input.title,
    description: input.description,
    auditTrail: [
      {
        occurredAt: input.occurredAt,
        action: "task.created",
        actorId: "system_collections_workspace",
        actorRole: "system",
        summary: input.title,
      },
    ],
    metadata: {},
  };
}

function uniqueStrings(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).filter((value): value is string => value.length > 0))];
}
