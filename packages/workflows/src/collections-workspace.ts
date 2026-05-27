import type { BillingAccount, Contact, SendingIdentity } from "@o2c/domain";
import {
  buildCallDetailReadModel,
  buildCollectionsWorkspaceReadModel,
  buildReplyReviewReadModel,
  buildThreadDetailReadModel,
  classifyCollectionReply,
  createCallSession,
  createCommunicationMessage,
  createCommunicationThread,
  createContactDeliveryStatus,
  createOutreachDraft,
  createPromiseToPayExtractionResult,
  createSenderIdentityIntegrationHook,
  applyEmailBounceToDeliveryStatus,
  extractTasksFromCall,
  extractTasksFromMessage,
  type CallDetailReadModel,
  type CallSession,
  type CollectionsExtractedTask,
  type CollectionsWorkspaceReadModel,
  type CommunicationMessage,
  type CommunicationThread,
  type ContactDeliveryStatus,
  type OutreachDraft,
  type PromiseToPayExtractionResult,
  type ReplyReviewReadModel,
  type ThreadDetailReadModel,
} from "@o2c/domain";
import type { EmailFailureMetadata } from "@o2c/domain";
import {
  normalizeWorkflowOutcomeFromCallOutcome,
  normalizeWorkflowOutcomeFromDeliveryStatus,
  normalizeWorkflowOutcomeFromReplyAnalysis,
} from "./workflow-interaction-outcomes.js";

export interface CollectionsWorkspaceStore {
  saveThread(thread: CommunicationThread): void;
  saveMessage(message: CommunicationMessage): void;
  saveCallSession(callSession: CallSession): void;
  saveDraft(draft: OutreachDraft): void;
  saveDeliveryStatus(status: ContactDeliveryStatus): void;
  saveTask(task: CollectionsExtractedTask): void;
  savePromiseToPayExtraction(result: PromiseToPayExtractionResult): void;
  listThreads(billingAccountId: string): CommunicationThread[];
  listMessages(billingAccountId: string): CommunicationMessage[];
  listCallSessions(billingAccountId: string): CallSession[];
  listDrafts(billingAccountId: string): OutreachDraft[];
  listDeliveryStatuses(billingAccountId: string): ContactDeliveryStatus[];
  listTasks(billingAccountId: string): CollectionsExtractedTask[];
  listPromiseToPayExtractions(billingAccountId: string): PromiseToPayExtractionResult[];
  getThread(threadId: string): CommunicationThread | undefined;
  getMessage(messageId: string): CommunicationMessage | undefined;
  getCallSession(callSessionId: string): CallSession | undefined;
  findDeliveryStatusByDestination(
    billingAccountId: string,
    destination: string,
  ): ContactDeliveryStatus | undefined;
}

export class InMemoryCollectionsWorkspaceStore implements CollectionsWorkspaceStore {
  private readonly threads = new Map<string, CommunicationThread>();
  private readonly messages = new Map<string, CommunicationMessage>();
  private readonly callSessions = new Map<string, CallSession>();
  private readonly drafts = new Map<string, OutreachDraft>();
  private readonly deliveryStatuses = new Map<string, ContactDeliveryStatus>();
  private readonly tasks = new Map<string, CollectionsExtractedTask>();
  private readonly promiseToPayExtractions = new Map<string, PromiseToPayExtractionResult>();

  saveThread(thread: CommunicationThread): void {
    this.threads.set(thread.id, thread);
  }

  saveMessage(message: CommunicationMessage): void {
    this.messages.set(message.id, message);
  }

  saveCallSession(callSession: CallSession): void {
    this.callSessions.set(callSession.id, callSession);
  }

  saveDraft(draft: OutreachDraft): void {
    this.drafts.set(draft.id, draft);
  }

  saveDeliveryStatus(status: ContactDeliveryStatus): void {
    this.deliveryStatuses.set(status.id, status);
  }

  saveTask(task: CollectionsExtractedTask): void {
    this.tasks.set(task.id, task);
  }

  savePromiseToPayExtraction(result: PromiseToPayExtractionResult): void {
    this.promiseToPayExtractions.set(result.id, result);
  }

  listThreads(billingAccountId: string): CommunicationThread[] {
    return [...this.threads.values()].filter((thread) => thread.billingAccountId === billingAccountId);
  }

  listMessages(billingAccountId: string): CommunicationMessage[] {
    return [...this.messages.values()].filter((message) => message.billingAccountId === billingAccountId);
  }

  listCallSessions(billingAccountId: string): CallSession[] {
    return [...this.callSessions.values()].filter((callSession) => callSession.billingAccountId === billingAccountId);
  }

  listDrafts(billingAccountId: string): OutreachDraft[] {
    return [...this.drafts.values()].filter((draft) => draft.billingAccountId === billingAccountId);
  }

  listDeliveryStatuses(billingAccountId: string): ContactDeliveryStatus[] {
    return [...this.deliveryStatuses.values()].filter((status) => status.billingAccountId === billingAccountId);
  }

  listTasks(billingAccountId: string): CollectionsExtractedTask[] {
    return [...this.tasks.values()].filter((task) => task.billingAccountId === billingAccountId);
  }

  listPromiseToPayExtractions(billingAccountId: string): PromiseToPayExtractionResult[] {
    return [...this.promiseToPayExtractions.values()].filter(
      (result) => result.billingAccountId === billingAccountId,
    );
  }

  getThread(threadId: string): CommunicationThread | undefined {
    return this.threads.get(threadId);
  }

  getMessage(messageId: string): CommunicationMessage | undefined {
    return this.messages.get(messageId);
  }

  getCallSession(callSessionId: string): CallSession | undefined {
    return this.callSessions.get(callSessionId);
  }

  findDeliveryStatusByDestination(
    billingAccountId: string,
    destination: string,
  ): ContactDeliveryStatus | undefined {
    return [...this.deliveryStatuses.values()]
      .filter(
        (status) =>
          status.billingAccountId === billingAccountId &&
          status.destination.toLowerCase() === destination.toLowerCase(),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  }
}

export interface CollectionsWorkspaceServiceDependencies {
  store?: CollectionsWorkspaceStore;
  now?: () => string;
  idGenerator?: (prefix: string) => string;
}

export class CollectionsWorkspaceService {
  private readonly store: CollectionsWorkspaceStore;
  private readonly now: () => string;
  private readonly idGenerator: (prefix: string) => string;

  constructor(deps: CollectionsWorkspaceServiceDependencies = {}) {
    this.store = deps.store ?? new InMemoryCollectionsWorkspaceStore();
    this.now = deps.now ?? (() => new Date().toISOString());
    this.idGenerator = deps.idGenerator ?? ((prefix) => `${prefix}_${Date.now()}`);
  }

  ingestInboundEmail(input: {
    account: BillingAccount;
    contact?: Contact;
    senderIdentity?: SendingIdentity;
    threadId?: string;
    providerThreadId?: string;
    providerConversationId?: string;
    providerMessageId?: string;
    subjectLine?: string;
    body: string;
    fromAddress?: string;
    toAddress?: string;
    invoiceIds?: string[];
    branchIds?: string[];
  }): {
    thread: CommunicationThread;
    message: CommunicationMessage;
    tasks: CollectionsExtractedTask[];
    promiseToPayExtraction?: PromiseToPayExtractionResult;
  } {
    const occurredAt = this.now();
    const analysis = classifyCollectionReply({
      subject: input.subjectLine,
      body: input.body,
    });
    const messageId = this.idGenerator("message");
    const senderIdentityHook = createSenderIdentityIntegrationHook({
      identity: input.senderIdentity,
    });
    const thread = createCommunicationThread({
      id: input.threadId ?? this.idGenerator("thread"),
      channel: "email",
      account: input.account,
      ...(input.contact ? { contactId: input.contact.id } : {}),
      branchIds: input.branchIds ?? [],
      subjectLine: input.subjectLine,
      participantAddresses: [input.fromAddress, input.toAddress].filter(
        (value): value is string => Boolean(value),
      ),
      invoiceIds: input.invoiceIds ?? analysis.invoices.map((invoice) => invoice.invoiceId),
      senderIdentityHook,
      status: analysis.requiresHumanReview ? "awaiting_internal_review" : "open",
      inboxState: analysis.requiresHumanReview ? "reply_review" : "active",
      unreadCount: 1,
      ...(input.providerThreadId ? { providerThreadId: input.providerThreadId } : {}),
      ...(input.providerConversationId
        ? { providerConversationId: input.providerConversationId }
        : {}),
      latestMessageAt: occurredAt,
      createdAt: occurredAt,
    });
    const message = createCommunicationMessage({
      id: messageId,
      threadId: thread.id,
      channel: "email",
      direction: "inbound",
      account: input.account,
      ...(input.contact ? { contactId: input.contact.id } : {}),
      senderIdentityHook,
      subjectLine: input.subjectLine,
      bodyPreview: input.body.slice(0, 280),
      bodyText: input.body,
      ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
      ...(input.providerThreadId ? { providerThreadId: input.providerThreadId } : {}),
      ...(input.providerConversationId
        ? { providerConversationId: input.providerConversationId }
        : {}),
      ...(input.fromAddress ? { fromAddress: input.fromAddress } : {}),
      ...(input.toAddress ? { toAddress: input.toAddress } : {}),
      occurredAt,
      replyAnalysis: analysis,
      metadata: {
        workflowOutcome: normalizeWorkflowOutcomeFromReplyAnalysis({
          sourceId: messageId,
          billingAccountId: input.account.id,
          ...(input.contact ? { contactId: input.contact.id } : {}),
          analysis,
          bodyText: input.body,
        }),
      },
    });
    const ptpExtraction =
      analysis.classification === "promise_to_pay"
        ? createPromiseToPayExtractionResult({
            id: this.idGenerator("ptp-extraction"),
            account: input.account,
            sourceType: "communication_message",
            sourceId: message.id,
            occurredAt,
            ...(input.contact ? { contactId: input.contact.id } : {}),
            analysis,
          })
        : undefined;
    const tasks = extractTasksFromMessage({
      idGenerator: (suffix) => this.idGenerator(`task_${suffix}`),
      occurredAt,
      thread,
      message,
      ...(input.toAddress
        ? {
            latestDeliveryStatus: this.store.findDeliveryStatusByDestination(
              input.account.id,
              input.toAddress,
            ),
          }
        : {}),
    });

    this.store.saveThread(thread);
    this.store.saveMessage(message);
    for (const task of tasks) {
      this.store.saveTask(task);
    }
    if (ptpExtraction) {
      this.store.savePromiseToPayExtraction(ptpExtraction);
    }

    return {
      thread,
      message,
      tasks,
      ...(ptpExtraction ? { promiseToPayExtraction: ptpExtraction } : {}),
    };
  }

  createReplyDraft(input: {
    account: BillingAccount;
    contact?: Contact;
    senderIdentity?: SendingIdentity;
    threadId: string;
    replyToMessageId?: string;
    invoiceIds?: string[];
    subjectLine?: string;
    bodyPreview: string;
    bodyText?: string;
    branchIds?: string[];
    approvalRequestId?: string;
  }): OutreachDraft {
    const createdAt = this.now();
    const senderIdentityHook = createSenderIdentityIntegrationHook({
      identity: input.senderIdentity,
    });
    const latestDeliveryStatus = input.contact?.email
      ? this.store.findDeliveryStatusByDestination(input.account.id, input.contact.email)
      : undefined;

    const draft = createOutreachDraft({
      id: this.idGenerator("draft"),
      channel: "email",
      account: input.account,
      branchIds: input.branchIds ?? [],
      ...(input.contact ? { contact: input.contact } : {}),
      invoiceIds: input.invoiceIds,
      senderIdentityHook,
      ...(input.approvalRequestId ? { approvalRequestId: input.approvalRequestId } : {}),
      threadId: input.threadId,
      ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
      subjectLine: input.subjectLine,
      bodyPreview: input.bodyPreview,
      bodyText: input.bodyText,
      createdAt,
      metadata: {
        ...(latestDeliveryStatus ? { deliveryState: latestDeliveryStatus.state } : {}),
      },
    });

    this.store.saveDraft(draft);
    return draft;
  }

  recordEmailBounce(input: {
    account: BillingAccount;
    destination: string;
    contactId?: string;
    relatedMessageId?: string;
    failure: Pick<EmailFailureMetadata, "failureKind" | "reasonSummary">;
  }): ContactDeliveryStatus {
    const occurredAt = this.now();
    const existing = this.store.findDeliveryStatusByDestination(input.account.id, input.destination);
    const status =
      existing ??
      createContactDeliveryStatus({
        id: this.idGenerator("delivery"),
        account: input.account,
        destination: input.destination,
        ...(input.contactId ? { contactId: input.contactId } : {}),
        createdAt: occurredAt,
      });

    const next = applyEmailBounceToDeliveryStatus(status, {
      failedAt: occurredAt,
      failure: input.failure,
      ...(input.relatedMessageId ? { relatedMessageId: input.relatedMessageId } : {}),
    });
    const withWorkflowOutcome = {
      ...next,
      metadata: {
        ...next.metadata,
        workflowOutcome: normalizeWorkflowOutcomeFromDeliveryStatus(next),
      },
    };
    this.store.saveDeliveryStatus(withWorkflowOutcome);
    return withWorkflowOutcome;
  }

  recordCallSession(input: {
    account: BillingAccount;
    contact?: Contact;
    senderIdentity?: SendingIdentity;
    threadId?: string;
    provider: CallSession["provider"];
    disposition: CallSession["disposition"];
    answered: boolean;
    transcriptSummary?: string;
    transcriptSegments?: CallSession["transcriptSegments"];
    sentimentLabel?: CallSession["sentimentLabel"];
    providerCallId?: string;
    promiseToPayId?: string;
    promisedAmountCents?: number;
    promisedDate?: string;
    operatorReviewRequired?: boolean;
    metadata?: Record<string, unknown>;
  }): {
    callSession: CallSession;
    tasks: CollectionsExtractedTask[];
    promiseToPayExtraction?: PromiseToPayExtractionResult;
  } {
    const occurredAt = this.now();
    const callSessionId = this.idGenerator("call");
    const senderIdentityHook = createSenderIdentityIntegrationHook({
      identity: input.senderIdentity,
    });
    const workflowOutcome = normalizeWorkflowOutcomeFromCallOutcome({
      sourceId: callSessionId,
      billingAccountId: input.account.id,
      ...(input.contact ? { contactId: input.contact.id } : {}),
      outcome: {
        disposition: input.disposition,
        operatorReviewRequired: input.operatorReviewRequired ?? true,
        ...(input.promisedAmountCents !== undefined
          ? { promisedAmountCents: input.promisedAmountCents }
          : {}),
        ...(input.promisedDate ? { promisedDate: input.promisedDate } : {}),
        ...(input.transcriptSummary ? { transcriptSummary: input.transcriptSummary } : {}),
        transcriptSegments: input.transcriptSegments ?? [],
        metadata: input.metadata ?? {},
        occurredAt,
      },
    });
    const callSession = createCallSession({
      id: callSessionId,
      account: input.account,
      provider: input.provider,
      direction: "inbound",
      disposition: input.disposition,
      answered: input.answered,
      startedAt: occurredAt,
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.contact ? { contactId: input.contact.id } : {}),
      ...(input.providerCallId ? { providerCallId: input.providerCallId } : {}),
      senderIdentityHook,
      ...(input.transcriptSummary ? { transcriptSummary: input.transcriptSummary } : {}),
      ...(input.transcriptSegments ? { transcriptSegments: input.transcriptSegments } : {}),
      ...(input.sentimentLabel ? { sentimentLabel: input.sentimentLabel } : {}),
      operatorReviewRequired: input.operatorReviewRequired ?? true,
      ...(input.promiseToPayId ? { promiseToPayId: input.promiseToPayId } : {}),
      metadata: {
        ...(input.metadata ?? {}),
        workflowOutcome,
      },
    });
    const ptpExtraction =
      input.promisedAmountCents !== undefined || input.promisedDate
        ? createPromiseToPayExtractionResult({
            id: this.idGenerator("ptp-extraction"),
            account: input.account,
            sourceType: "call_session",
            sourceId: callSession.id,
            occurredAt,
            ...(input.contact ? { contactId: input.contact.id } : {}),
            callPromise: {
              ...(input.promisedAmountCents !== undefined
                ? { promisedAmountCents: input.promisedAmountCents }
                : {}),
              ...(input.promisedDate ? { promisedDate: input.promisedDate } : {}),
              confidence: 0.75,
            },
          })
        : undefined;
    const tasks = extractTasksFromCall({
      idGenerator: (suffix) => this.idGenerator(`task_${suffix}`),
      occurredAt,
      callSession,
    });

    this.store.saveCallSession(callSession);
    for (const task of tasks) {
      this.store.saveTask(task);
    }
    if (ptpExtraction) {
      this.store.savePromiseToPayExtraction(ptpExtraction);
    }

    return {
      callSession,
      tasks,
      ...(ptpExtraction ? { promiseToPayExtraction: ptpExtraction } : {}),
    };
  }

  getWorkspace(account: BillingAccount): CollectionsWorkspaceReadModel {
    return buildCollectionsWorkspaceReadModel({
      account,
      threads: this.store.listThreads(account.id),
      messages: this.store.listMessages(account.id),
      callSessions: this.store.listCallSessions(account.id),
      drafts: this.store.listDrafts(account.id),
      deliveryStatuses: this.store.listDeliveryStatuses(account.id),
      tasks: this.store.listTasks(account.id),
      promiseToPayExtractions: this.store.listPromiseToPayExtractions(account.id),
    });
  }

  getThreadDetail(threadId: string): ThreadDetailReadModel | undefined {
    const thread = this.store.getThread(threadId);
    if (!thread) {
      return undefined;
    }

    return buildThreadDetailReadModel({
      thread,
      messages: this.store
        .listMessages(thread.billingAccountId)
        .filter((message) => message.threadId === threadId),
      drafts: this.store.listDrafts(thread.billingAccountId).filter((draft) => draft.threadId === threadId),
      deliveryStatuses: this.store
        .listDeliveryStatuses(thread.billingAccountId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      tasks: this.store.listTasks(thread.billingAccountId).filter((task) => task.threadId === threadId),
      promiseToPayExtractions: this.store
        .listPromiseToPayExtractions(thread.billingAccountId)
        .filter((result) => result.sourceType === "communication_message"),
    });
  }

  getReplyReview(messageId: string): ReplyReviewReadModel | undefined {
    const message = this.store.getMessage(messageId);
    if (!message) {
      return undefined;
    }
    const thread = this.store.getThread(message.threadId);
    if (!thread) {
      return undefined;
    }

    const deliveryStatus = [message.toAddress, message.fromAddress]
      .filter((value): value is string => Boolean(value))
      .map((destination) => this.store.findDeliveryStatusByDestination(thread.billingAccountId, destination))
      .find((status): status is ContactDeliveryStatus => Boolean(status));

    const tasks = this.store
      .listTasks(thread.billingAccountId)
      .filter((task) => task.messageId === message.id);
    const ptpExtraction = this.store
      .listPromiseToPayExtractions(thread.billingAccountId)
      .find((result) => result.sourceId === message.id);

    return buildReplyReviewReadModel({
      thread,
      message,
      ...(deliveryStatus ? { latestDeliveryStatus: deliveryStatus } : {}),
      tasks,
      ...(ptpExtraction ? { promiseToPayExtraction: ptpExtraction } : {}),
    });
  }

  getCallDetail(callSessionId: string): CallDetailReadModel | undefined {
    const callSession = this.store.getCallSession(callSessionId);
    if (!callSession) {
      return undefined;
    }

    const tasks = this.store
      .listTasks(callSession.billingAccountId)
      .filter((task) => task.callSessionId === callSession.id);
    const ptpExtraction = this.store
      .listPromiseToPayExtractions(callSession.billingAccountId)
      .find((result) => result.sourceId === callSession.id);

    return buildCallDetailReadModel({
      callSession,
      tasks,
      ...(ptpExtraction ? { promiseToPayExtraction: ptpExtraction } : {}),
    });
  }
}
