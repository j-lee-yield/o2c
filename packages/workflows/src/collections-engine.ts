import {
  createActivityLogDomainHelpers,
  type ImmutableActivityLogEntry,
  type ImmutableActivityLogStore,
} from "@o2c/audit";
import type { Principal } from "@o2c/auth";
import type { CollectionEmailProviderHook } from "@o2c/contracts";
import {
  ApprovalRequestService,
  SafeCommunicationAttemptFactory,
  ExceptionTransitionService,
  ExceptionTriageService,
  PromiseToPayTransitionService,
  assembleResendDocumentBundle,
  assertNoWorkflowBlockers,
  buildApprovalQueue,
  buildCollectionWorkspace,
  buildReminderContent,
  canAutoChaseInvoice,
  classifyCollectionReply,
  createCustomerMemoryUpdate,
  createPromiseToPayFromReply,
  createReminderDraft,
  createTypedException,
  decidePromiseToPayAcceptance,
  defaultCollectionSendWindow,
  determineCollectionEscalationStage,
  evaluateCollectionsApprovalRule,
  isWithinCollectionSendWindow,
  type ApprovalQueueItem,
  type ApprovalRequest,
  type BillingAccount,
  type CollectionBlockReason,
  type CollectionReplyAnalysis,
  type CollectionReminderDraft,
  type CollectionScope,
  type CollectionSendWindow,
  type CollectionWorkspace,
  type Contact,
  type CustomerInvoice,
  type CustomerMemoryUpdate,
  type DomainException,
  type PromiseToPay,
  type ResendDocumentBundle,
  type UploadedDocument,
  type LearningEvent,
} from "@o2c/domain";
import { WorkflowLearningEventFactory } from "./learning-events.js";

export interface CollectionsWorkflowDependencies {
  activityStore: ImmutableActivityLogStore;
  now?: () => string;
  idGenerator?: (prefix: string) => string;
}

export interface ReminderPlanResult {
  workspace: CollectionWorkspace;
  reminderDraft: CollectionReminderDraft;
  approvalRequest?: ApprovalRequest;
  exception?: DomainException;
  emailProviderHook?: CollectionEmailProviderHook;
  communicationAttempt?: ReturnType<SafeCommunicationAttemptFactory["create"]>;
  approvalQueue: ApprovalQueueItem[];
  activityEntries: ImmutableActivityLogEntry[];
  learningEvents: LearningEvent[];
}

export interface ReplyHandlingResult {
  analysis: CollectionReplyAnalysis;
  promiseToPay?: PromiseToPay;
  resendBundle?: ResendDocumentBundle;
  customerMemory: CustomerMemoryUpdate;
  exception?: DomainException;
  approvalRequest?: ApprovalRequest;
  activityEntries: ImmutableActivityLogEntry[];
  learningEvents: LearningEvent[];
}

export interface OperatorWorkspaceSnapshot {
  workspace: CollectionWorkspace;
  pendingApprovals: ApprovalQueueItem[];
  openExceptions: DomainException[];
  activityFeed: ImmutableActivityLogEntry[];
}

export class CollectionsWorkflowEngine {
  private readonly now: () => string;
  private readonly idGenerator: (prefix: string) => string;
  private readonly audit: ReturnType<typeof createActivityLogDomainHelpers>;
  private readonly approvalService: ApprovalRequestService;
  private readonly communicationFactory = new SafeCommunicationAttemptFactory();
  private readonly learningEvents = new WorkflowLearningEventFactory();
  private readonly promiseService = new PromiseToPayTransitionService();
  private readonly exceptionService = new ExceptionTransitionService();
  private readonly exceptionTriageService = new ExceptionTriageService();

  constructor(private readonly deps: CollectionsWorkflowDependencies) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.idGenerator = deps.idGenerator ?? ((prefix) => `${prefix}_${Date.now()}`);
    this.audit = createActivityLogDomainHelpers({
      store: deps.activityStore,
      idGenerator: () => this.idGenerator("activity"),
      now: this.now,
    });
    this.approvalService = new ApprovalRequestService({
      audit: this.audit,
      now: this.now,
      idGenerator: () => this.idGenerator("approval"),
    });
  }

  planReminder(params: {
    principal: Principal;
    account: BillingAccount;
    invoices: CustomerInvoice[];
    contact?: Contact;
    scope?: CollectionScope;
    sendWindow?: CollectionSendWindow;
    openExceptions?: DomainException[];
  }): ReminderPlanResult {
    const createdAt = this.now();
    const scope = params.scope ?? "account";
    const sendWindow = params.sendWindow ?? defaultCollectionSendWindow();
    const workspace = buildCollectionWorkspace({
      account: params.account,
      invoices: params.invoices,
      scope,
      ...(params.contact ? { contact: params.contact } : {}),
      asOf: createdAt,
      sendWindow,
    });
    const escalationStage = determineCollectionEscalationStage(params.invoices, createdAt);
    const content = buildReminderContent({
      account: params.account,
      invoices: params.invoices,
      scope,
      escalationStage,
      asOf: createdAt,
    });

    const missingContact = !params.contact?.email;
    const disputedInvoice = params.invoices.find(
      (invoice) =>
        invoice.state === "disputed_full" ||
        (invoice.state === "disputed_partial" && !canAutoChaseInvoice(invoice))
    );
    const outsideSendWindow = !isWithinCollectionSendWindow(createdAt, sendWindow);
    const stopAtException = escalationStage === "stop_and_mark_exception";
    const blockingException =
      !missingContact
        ? this.findCollectionWorkflowBlocker(
            params.invoices,
            params.openExceptions ?? [],
            createdAt
          )
        : undefined;

    let blockedReason: CollectionBlockReason | undefined;
    let exception: DomainException | undefined;
    let approvalRequest: ApprovalRequest | undefined;

    if (disputedInvoice) {
      blockedReason = "disputed_invoice";
    } else if (missingContact) {
      blockedReason = "missing_contact";
      exception = this.createTriagedException(params.principal, {
        kind: "wrong_contact",
        account: params.account,
        invoiceIds: params.invoices.map((invoice) => invoice.id),
        summary: "No verified email contact is available for collections outreach.",
      });
    } else if (blockingException) {
      blockedReason = "approval_required";
      exception = blockingException;
    } else if (stopAtException) {
      blockedReason = "approval_required";
      exception = this.createTriagedException(params.principal, {
        kind: "strategic_account_escalation",
        account: params.account,
        invoiceIds: params.invoices.map((invoice) => invoice.id),
        summary: "Collections ladder reached the stop stage and requires controlled escalation.",
      });
    } else if (outsideSendWindow) {
      blockedReason = "outside_send_window";
    }

    const decision =
      blockedReason === undefined
        ? (() => {
            const balanceApprovalThresholdCents = readThresholdCents(
              params.account.metadata.approvalBalanceThresholdCents
            );
            const recipientConfidence = readConfidence(
              params.contact?.metadata.recipientConfidence
            );
            const lowRecipientConfidenceThreshold = readConfidence(
              params.account.metadata.lowRecipientConfidenceThreshold
            );

            return evaluateCollectionsApprovalRule({
            actionType: scope === "invoice" ? "invoice_level_outreach" : "send_reminder",
            account: params.account,
            invoices: params.invoices,
            ...(params.contact ? { contact: params.contact } : {}),
            lowRisk: isLowRiskReminder(params.account, params.contact, scope),
            aiProposedSend: true,
            ...(balanceApprovalThresholdCents !== undefined
              ? { balanceApprovalThresholdCents }
              : {}),
            ...(recipientConfidence !== undefined ? { recipientConfidence } : {}),
            ...(lowRecipientConfidenceThreshold !== undefined
              ? { lowRecipientConfidenceThreshold }
              : {}),
            groupedReminderAmbiguousEntities:
              scope === "account" && isAmbiguousGrouping(params.account, params.invoices),
            isFirstOutboundContact:
              params.contact?.recentSuccessfulResponses === 0 ||
              params.account.metadata.firstOutboundPending === true,
            });
          })()
        : undefined;

    const deliveryState =
      blockedReason !== undefined
        ? "blocked"
        : decision?.requiresApproval
          ? "approval_needed"
          : "ready";
    const sendStrategy =
      deliveryState === "ready"
        ? "auto_send"
        : deliveryState === "approval_needed"
          ? "awaiting_approval"
          : "manual_send";

    const reminderDraft = createReminderDraft({
      reminderId: this.idGenerator("reminder"),
      account: params.account,
      invoices: params.invoices,
      scope,
      ...(params.contact ? { contact: params.contact } : {}),
      sendStrategy,
      deliveryState,
      escalationStage,
      ...(blockedReason ? { blockedReason } : {}),
      sendWindow,
      subjectLine: content.subjectLine,
      previewLine: content.previewLine,
      bodySections: content.bodySections,
      createdAt,
      metadata: {
        sendWindowApplied: true,
        ...(decision?.reasonCode ? { approvalReasonCode: decision.reasonCode } : {}),
        ...(decision?.reasonCodes ? { approvalReasonCodes: decision.reasonCodes } : {}),
      },
    });

    if (deliveryState === "approval_needed" && decision) {
      approvalRequest = this.createAndSubmitApproval(params.principal, {
        requestType: decision.requestType,
        summary: decision.summary,
        ...(decision.approverRole ? { assigneeRole: decision.approverRole } : {}),
        payload: {
          summary: decision.summary,
          reminderId: reminderDraft.id,
          billingAccountId: params.account.id,
          invoiceIds: params.invoices.map((invoice) => invoice.id),
          escalationStage,
        },
        policyContext: decision.policyContext,
      });
    }

    const emailProviderHook =
      params.contact?.email && deliveryState !== "blocked"
        ? this.buildEmailProviderHook(reminderDraft, params.contact)
        : undefined;
    const communicationAttempt =
      emailProviderHook && deliveryState === "ready"
        ? this.buildEmailCommunicationAttempt(
            reminderDraft,
            params.contact as Contact,
            approvalRequest?.id,
          )
        : undefined;

    const activityEntries = [
      this.audit.append({
        actorId: params.principal.id,
        actorRole: params.principal.roles[0] ?? "ar_collector",
        action:
          deliveryState === "ready"
            ? "collections.reminder.auto_send_planned"
            : deliveryState === "approval_needed"
              ? "collections.reminder.approval_requested"
              : "collections.reminder.blocked",
        entityType: "collection_reminder",
        entityId: reminderDraft.id,
        after: serializeJson(reminderDraft),
        metadata: {
          billingAccountId: params.account.id,
          groupedReminder: reminderDraft.groupingMode === "billing_account",
          invoiceCount: params.invoices.length,
          escalationStage,
          deliveryState,
          ...(blockedReason ? { blockedReason } : {}),
        },
      }),
    ];

    if (communicationAttempt) {
      activityEntries.push(
        this.audit.append({
          actorId: params.principal.id,
          actorRole: params.principal.roles[0] ?? "ar_collector",
          action: "communication.attempt.created",
          entityType: "communication_attempt",
          entityId: communicationAttempt.id,
          after: serializeJson(communicationAttempt),
          metadata: {
            billingAccountId: params.account.id,
            reminderId: reminderDraft.id,
            channel: communicationAttempt.channel,
            provider: communicationAttempt.provider,
          },
        }),
      );
    }

    if (exception) {
      activityEntries.push(
        this.audit.append({
          actorId: params.principal.id,
          actorRole: params.principal.roles[0] ?? "ar_collector",
          action: "collections.exception.created",
          entityType: "exception",
          entityId: exception.id,
          after: serializeJson(exception),
          metadata: {
            billingAccountId: params.account.id,
            reminderId: reminderDraft.id,
          },
        })
      );
    }

    const learningEvents = this.learningEvents.buildCollectionsReminderEvents({
      occurredAt: createdAt,
      account: params.account,
      invoices: params.invoices,
      reminderDraft,
      ...(communicationAttempt ? { communicationAttempt } : {}),
      ...(approvalRequest ? { approvalRequest } : {}),
      ...(params.contact ? { contact: params.contact } : {}),
    });

    return {
      workspace,
      reminderDraft,
      ...(approvalRequest ? { approvalRequest } : {}),
      ...(exception ? { exception } : {}),
      ...(emailProviderHook ? { emailProviderHook } : {}),
      ...(communicationAttempt ? { communicationAttempt } : {}),
      approvalQueue: buildApprovalQueue(approvalRequest ? [approvalRequest] : []),
      activityEntries,
      learningEvents,
    };
  }

  handleReply(params: {
    principal: Principal;
    account: BillingAccount;
    invoices: CustomerInvoice[];
    body: string;
    subject?: string;
    hasAttachments?: boolean;
    contact?: Contact;
    availableDocuments?: UploadedDocument[];
  }): ReplyHandlingResult {
    const analysis = classifyCollectionReply({
      ...(params.subject ? { subject: params.subject } : {}),
      body: params.body,
      ...(params.hasAttachments !== undefined ? { hasAttachments: params.hasAttachments } : {}),
      invoices: params.invoices,
    });
    const customerMemory = createCustomerMemoryUpdate({
      memoryId: this.idGenerator("memory"),
      occurredAt: this.now(),
      account: params.account,
      ...(params.contact ? { contact: params.contact } : {}),
      analysis,
    });
    const activityEntries: ImmutableActivityLogEntry[] = [];

    if (analysis.classification === "promise_to_pay") {
      const captured = this.capturePromiseToPay(params, analysis);
      const updatedMemory = {
        ...customerMemory,
        promiseToPayState: captured.state,
        promiseToPayDate: captured.promiseDate,
      };
      activityEntries.push(
        this.audit.append({
          actorId: params.principal.id,
          actorRole: params.principal.roles[0] ?? "ar_collector",
          action:
            captured.state === "accepted"
              ? "collections.reply.promise_to_pay_auto_accepted"
              : "collections.reply.promise_to_pay_detected",
          entityType: "promise_to_pay",
          entityId: captured.id,
          after: serializeJson(captured),
          metadata: {
            billingAccountId: params.account.id,
            invoiceIds: params.invoices.map((invoice) => invoice.id).join(","),
            promiseState: captured.state,
          },
        }),
        this.appendCustomerMemoryAudit(params.principal, updatedMemory),
      );

      const learningEvents = this.learningEvents.buildCollectionsReplyEvents({
        occurredAt: this.now(),
        account: params.account,
        invoices: params.invoices,
        analysis,
        ...(params.contact ? { contact: params.contact } : {}),
      });

      return {
        analysis,
        promiseToPay: captured,
        customerMemory: updatedMemory,
        activityEntries,
        learningEvents,
      };
    }

    if (
      analysis.classification === "already_paid" ||
      analysis.classification === "remittance_advice"
    ) {
      const created = this.exceptionService.transition(
        createTypedException({
          id: this.idGenerator("exception"),
          entityType: "billing_account",
          entityId: params.account.id,
          kind:
            analysis.classification === "already_paid"
              ? "already_paid"
              : "proof_remittance_received_not_matched",
          createdAt: this.now(),
          metadata: {
            billingAccountId: params.account.id,
            invoiceIds: params.invoices.map((invoice) => invoice.id),
          },
        }),
        "triaged",
        {
          actorId: params.principal.id,
          actorRole: params.principal.roles[0] ?? "ar_collector",
        }
      );
      const triaged = this.exceptionTriageService.triage(created, {
        actorId: params.principal.id,
        actorRole: toSupportedWorkflowRole(params.principal.roles[0]),
        hasPaymentEvidence: params.hasAttachments ?? false,
        ...(params.hasAttachments
          ? {
              paymentEvidenceType:
                analysis.classification === "already_paid" ? "proof_of_payment" : "remittance",
              searchBankData: true,
              likelyMatches: params.invoices.map((invoice) => ({
                invoiceId: invoice.id,
                confidence: 0.72,
                rationale: "Customer referenced this invoice in a payment-related reply.",
              })),
            }
          : { requestedAdditionalProof: true }),
      });

      activityEntries.push(
        this.audit.append({
          actorId: params.principal.id,
          actorRole: params.principal.roles[0] ?? "ar_collector",
          action: "collections.reply.payment_exception_created",
          entityType: "exception",
          entityId: triaged.id,
          after: serializeJson(triaged),
          metadata: {
            billingAccountId: params.account.id,
            classification: analysis.classification,
          },
        }),
        this.appendCustomerMemoryAudit(params.principal, customerMemory),
      );

      const learningEvents = this.learningEvents.buildCollectionsReplyEvents({
        occurredAt: this.now(),
        account: params.account,
        invoices: params.invoices,
        analysis,
        ...(params.contact ? { contact: params.contact } : {}),
      });

      return {
        analysis,
        exception: triaged,
        customerMemory,
        activityEntries,
        learningEvents,
      };
    }

    if (
      analysis.classification === "invoice_not_received" ||
      analysis.classification === "request_for_docs"
    ) {
      return this.handleResendServicing({
        principal: params.principal,
        account: params.account,
        invoices: params.invoices,
        analysis,
        customerMemory,
        ...(params.contact ? { contact: params.contact } : {}),
        ...(params.availableDocuments ? { availableDocuments: params.availableDocuments } : {}),
      });
    }

    if (analysis.classification === "wrong_contact") {
      const exception = this.createTriagedException(params.principal, {
        kind: "wrong_contact",
        account: params.account,
        invoiceIds: params.invoices.map((invoice) => invoice.id),
        summary: "Customer replied that the current recipient is not the correct contact.",
      });
      activityEntries.push(
        this.audit.append({
          actorId: params.principal.id,
          actorRole: params.principal.roles[0] ?? "ar_collector",
          action: "collections.reply.wrong_contact_reported",
          entityType: "exception",
          entityId: exception.id,
          after: serializeJson(exception),
          metadata: {
            billingAccountId: params.account.id,
          },
        }),
        this.appendCustomerMemoryAudit(params.principal, customerMemory),
      );

      const learningEvents = this.learningEvents.buildCollectionsReplyEvents({
        occurredAt: this.now(),
        account: params.account,
        invoices: params.invoices,
        analysis,
        ...(params.contact ? { contact: params.contact } : {}),
      });

      return {
        analysis,
        customerMemory,
        exception,
        activityEntries,
        learningEvents,
      };
    }

    if (
      analysis.classification === "partial_dispute" ||
      analysis.classification === "full_dispute"
    ) {
      const kind = analysis.classification === "partial_dispute" ? "partial_dispute" : "full_dispute";
      const exception = this.createTriagedException(params.principal, {
        kind,
        account: params.account,
        invoiceIds: analysis.invoices.map((invoice) => invoice.invoiceId),
        summary:
          kind === "partial_dispute"
            ? "Customer raised a partial dispute on the invoice set."
            : "Customer raised a full dispute on the invoice set.",
      });
      activityEntries.push(
        this.audit.append({
          actorId: params.principal.id,
          actorRole: params.principal.roles[0] ?? "ar_collector",
          action: "collections.reply.dispute_logged",
          entityType: "exception",
          entityId: exception.id,
          after: serializeJson(exception),
          metadata: {
            billingAccountId: params.account.id,
            disputeScope: analysis.classification,
          },
        }),
        this.appendCustomerMemoryAudit(params.principal, customerMemory),
      );

      const learningEvents = this.learningEvents.buildCollectionsReplyEvents({
        occurredAt: this.now(),
        account: params.account,
        invoices: params.invoices,
        analysis,
        ...(params.contact ? { contact: params.contact } : {}),
      });

      return {
        analysis,
        customerMemory,
        exception,
        activityEntries,
        learningEvents,
      };
    }

    activityEntries.push(
      this.audit.append({
        actorId: params.principal.id,
        actorRole: params.principal.roles[0] ?? "ar_collector",
        action: "collections.reply.logged",
        entityType: "billing_account",
        entityId: params.account.id,
        metadata: {
          classification: analysis.classification,
          confidence: analysis.confidence,
        },
      }),
      this.appendCustomerMemoryAudit(params.principal, customerMemory),
    );

    const learningEvents = this.learningEvents.buildCollectionsReplyEvents({
      occurredAt: this.now(),
      account: params.account,
      invoices: params.invoices,
      analysis,
      ...(params.contact ? { contact: params.contact } : {}),
    });

    return {
      analysis,
      customerMemory,
      activityEntries,
      learningEvents,
    };
  }

  buildOperatorWorkspace(params: {
    account: BillingAccount;
    invoices: CustomerInvoice[];
    contact?: Contact;
    approvals: ApprovalRequest[];
    exceptions: DomainException[];
    activityEntries: ImmutableActivityLogEntry[];
  }): OperatorWorkspaceSnapshot {
    return {
      workspace: buildCollectionWorkspace({
        account: params.account,
        invoices: params.invoices,
        ...(params.contact ? { contact: params.contact } : {}),
        asOf: this.now(),
      }),
      pendingApprovals: buildApprovalQueue(params.approvals),
      openExceptions: params.exceptions.filter(
        (exception) => exception.state !== "resolved" && exception.state !== "dismissed"
      ),
      activityFeed: [...params.activityEntries].sort((left, right) =>
        right.occurredAt.localeCompare(left.occurredAt)
      ),
    };
  }

  private handleResendServicing(params: {
    principal: Principal;
    account: BillingAccount;
    invoices: CustomerInvoice[];
    analysis: CollectionReplyAnalysis;
    customerMemory: CustomerMemoryUpdate;
    contact?: Contact;
    availableDocuments?: UploadedDocument[];
  }): ReplyHandlingResult {
    const resendBundle = assembleResendDocumentBundle({
      bundleId: this.idGenerator("bundle"),
      occurredAt: this.now(),
      account: params.account,
      invoices: params.invoices,
      analysis: params.analysis,
      ...(params.contact ? { contact: params.contact } : {}),
      ...(params.availableDocuments ? { availableDocuments: params.availableDocuments } : {}),
    });
    const activityEntries: ImmutableActivityLogEntry[] = [
      this.audit.append({
        actorId: params.principal.id,
        actorRole: params.principal.roles[0] ?? "ar_collector",
        action:
          resendBundle.sendStrategy === "auto_send"
            ? "collections.reply.document_bundle_auto_sent"
            : "collections.reply.document_bundle_created",
        entityType: "document_bundle",
        entityId: resendBundle.id,
        after: serializeJson(resendBundle),
        metadata: {
          billingAccountId: params.account.id,
          sendStrategy: resendBundle.sendStrategy,
          servicingClassification: resendBundle.servicingClassification,
        },
      }),
      this.appendCustomerMemoryAudit(params.principal, params.customerMemory),
    ];

    if (resendBundle.sendStrategy === "manual_exception") {
      const exception = this.createTriagedException(params.principal, {
        kind: "missing_supporting_docs",
        account: params.account,
        invoiceIds: params.invoices.map((invoice) => invoice.id),
        summary: "Requested resend bundle is incomplete and requires document assembly.",
      });
      activityEntries.push(
        this.audit.append({
          actorId: params.principal.id,
          actorRole: params.principal.roles[0] ?? "ar_collector",
          action: "collections.reply.document_bundle_exception_created",
          entityType: "exception",
          entityId: exception.id,
          after: serializeJson(exception),
          metadata: {
            billingAccountId: params.account.id,
            bundleId: resendBundle.id,
          },
        })
      );

      return {
        analysis: params.analysis,
        resendBundle,
        customerMemory: params.customerMemory,
        exception,
        activityEntries,
        learningEvents: this.learningEvents.buildCollectionsReplyEvents({
          occurredAt: this.now(),
          account: params.account,
          invoices: params.invoices,
          analysis: params.analysis,
          ...(params.contact ? { contact: params.contact } : {}),
          resendBundle,
        }),
      };
    }

    if (resendBundle.sendStrategy === "awaiting_review") {
      const exception = this.createTriagedException(params.principal, {
        kind: "invoice_not_received",
        account: params.account,
        invoiceIds: params.invoices.map((invoice) => invoice.id),
        summary: "Requested resend cannot proceed until the recipient is verified.",
      });
      const decision = evaluateCollectionsApprovalRule({
        actionType: "resend_document",
        account: params.account,
        invoices: params.invoices,
        ...(params.contact ? { contact: params.contact } : {}),
        lowRisk: false,
        aiProposedSend: true,
      });
      const approvalRequest = this.createAndSubmitApproval(params.principal, {
        requestType: decision.requestType,
        summary: "Approval required before sending requested documents.",
        ...(decision.approverRole ? { assigneeRole: decision.approverRole } : {}),
        payload: {
          summary: "Approval required before sending requested documents.",
          billingAccountId: params.account.id,
          invoiceIds: params.invoices.map((invoice) => invoice.id),
          bundleId: resendBundle.id,
        },
        policyContext: decision.policyContext,
      });
      activityEntries.push(
        this.audit.append({
          actorId: params.principal.id,
          actorRole: params.principal.roles[0] ?? "ar_collector",
          action: "collections.reply.document_resend_exception_created",
          entityType: "exception",
          entityId: exception.id,
          after: serializeJson(exception),
          metadata: {
            billingAccountId: params.account.id,
            bundleId: resendBundle.id,
          },
        }),
        this.audit.append({
          actorId: params.principal.id,
          actorRole: params.principal.roles[0] ?? "ar_collector",
          action: "collections.reply.document_resend_review_requested",
          entityType: "approval_request",
          entityId: approvalRequest.id,
          after: serializeJson(approvalRequest),
          metadata: {
            billingAccountId: params.account.id,
            bundleId: resendBundle.id,
          },
        })
      );

      return {
        analysis: params.analysis,
        resendBundle,
        customerMemory: params.customerMemory,
        exception,
        approvalRequest,
        activityEntries,
        learningEvents: this.learningEvents.buildCollectionsReplyEvents({
          occurredAt: this.now(),
          account: params.account,
          invoices: params.invoices,
          analysis: params.analysis,
          ...(params.contact ? { contact: params.contact } : {}),
          resendBundle,
        }),
      };
    }

    return {
      analysis: params.analysis,
      resendBundle,
      customerMemory: params.customerMemory,
      activityEntries,
      learningEvents: this.learningEvents.buildCollectionsReplyEvents({
        occurredAt: this.now(),
        account: params.account,
        invoices: params.invoices,
        analysis: params.analysis,
        ...(params.contact ? { contact: params.contact } : {}),
        resendBundle,
      }),
    };
  }

  private createAndSubmitApproval(
    principal: Principal,
    input: {
      requestType: string;
      summary: string;
      assigneeRole?: ApprovalRequest["assigneeRole"];
      payload: Record<string, unknown>;
      policyContext: Record<string, unknown>;
    }
  ) {
    const created = this.approvalService.create(principal, {
      requestType: input.requestType,
      payload: input.payload,
      ...(input.assigneeRole ? { assigneeRole: input.assigneeRole } : {}),
      currentStep: "awaiting_review",
      ...(input.policyContext ? { policyContext: input.policyContext } : {}),
    });

    return this.approvalService.submit(principal, created);
  }

  private createTriagedException(
    principal: Principal,
    input: {
      kind:
        | "wrong_contact"
        | "strategic_account_escalation"
        | "invoice_not_received"
        | "already_paid"
        | "proof_remittance_received_not_matched"
        | "partial_dispute"
        | "full_dispute"
        | "missing_supporting_docs";
      account: BillingAccount;
      invoiceIds: string[];
      summary: string;
    }
  ): DomainException {
    return this.exceptionService.transition(
      createTypedException({
        id: this.idGenerator("exception"),
        entityType: "billing_account",
        entityId: input.account.id,
        kind: input.kind,
        createdAt: this.now(),
        summary: input.summary,
        metadata: {
          billingAccountId: input.account.id,
          invoiceIds: input.invoiceIds,
          kind: input.kind,
        },
      }),
      "triaged",
      {
        actorId: principal.id,
        actorRole: principal.roles[0] ?? "ar_collector",
      }
    );
  }

  private findCollectionWorkflowBlocker(
    invoices: CustomerInvoice[],
    exceptions: DomainException[],
    now: string
  ): DomainException | undefined {
    for (const exception of exceptions) {
      try {
        assertNoWorkflowBlockers({
          workflow: "collection_cadence",
          invoices,
          exceptions: [exception],
          now,
        });
      } catch {
        return exception;
      }
    }

    return undefined;
  }

  private buildEmailProviderHook(
    reminderDraft: CollectionReminderDraft,
    contact: Contact
  ): CollectionEmailProviderHook {
    return {
      templateKey: "collections_grouped_email_v1",
      reminderId: reminderDraft.id,
      billingAccountId: reminderDraft.billingAccountId,
      parentAccountId: reminderDraft.parentAccountId,
      escalationStage: reminderDraft.escalationStage,
      deliveryState: reminderDraft.deliveryState,
      groupingMode: reminderDraft.groupingMode,
      recipient: {
        email: contact.email ?? "",
        name: contact.fullName,
      },
      subjectLine: reminderDraft.subjectLine,
      previewLine: reminderDraft.previewLine,
      bodySections: reminderDraft.bodySections,
      invoices: reminderDraft.invoiceRefs.map((invoice) => ({
        invoiceId: invoice.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        ...(invoice.branchId ? { branchId: invoice.branchId } : {}),
        amountCents: invoice.amountCents,
        currency: invoice.currency,
        ...(invoice.dueDate ? { dueDate: invoice.dueDate } : {}),
        ...(invoice.daysPastDue !== undefined ? { daysPastDue: invoice.daysPastDue } : {}),
        isUrgent: invoice.isUrgent,
      })),
      urgentInvoiceIds: reminderDraft.urgentInvoiceIds,
      sendWindow: reminderDraft.sendWindow,
      metadata: reminderDraft.metadata,
    };
  }

  private buildEmailCommunicationAttempt(
    reminderDraft: CollectionReminderDraft,
    contact: Contact,
    approvalRequestId?: string,
  ): ReturnType<SafeCommunicationAttemptFactory["create"]> {
    return this.communicationFactory.create({
      attemptId: this.idGenerator("communication"),
      parentAccountId: reminderDraft.parentAccountId,
      billingAccountId: reminderDraft.billingAccountId,
      branchId: reminderDraft.branchIds[0],
      contactId: contact.id,
      ...(approvalRequestId ? { approvalRequestId } : {}),
      channel: "email",
      provider: "internal",
      direction: "outbound",
      intentType: mapReminderIntent(reminderDraft.escalationStage),
      recipient: {
        email: contact.email,
        displayName: contact.fullName,
        verified: contact.isVerified && contact.allowAutoSend,
      },
      invoiceIds: reminderDraft.invoiceRefs.map((invoice) => invoice.invoiceId),
      subjectLine: reminderDraft.subjectLine,
      contentTemplateKey: "collections_grouped_email_v1",
      bodyPreview: reminderDraft.previewLine,
      createdAt: this.now(),
      metadata: {
        reminderId: reminderDraft.id,
        groupedReminder: reminderDraft.groupingMode === "billing_account",
      },
      actorId: "system_collections",
      actorRole: "system",
    });
  }

  private capturePromiseToPay(
    params: {
      principal: Principal;
      account: BillingAccount;
      invoices: CustomerInvoice[];
      contact?: Contact;
    },
    analysis: CollectionReplyAnalysis
  ): PromiseToPay {
    const basePromise = createPromiseToPayFromReply({
      id: this.idGenerator("ptp"),
      now: this.now(),
      account: params.account,
      invoices: params.invoices,
      analysis,
      ...(params.contact ? { contact: params.contact } : {}),
    });
    const decision = decidePromiseToPayAcceptance({
      account: params.account,
      ...(params.contact ? { contact: params.contact } : {}),
      promiseToPay: basePromise,
    });

    if (!decision.autoAccepted) {
      return {
        ...basePromise,
        metadata: {
          ...basePromise.metadata,
          acceptanceReasons: decision.reasons,
        },
      };
    }

    return this.promiseService.transition(basePromise, "accepted", {
      actorId: params.principal.id,
      actorRole: params.principal.roles[0] ?? "ar_collector",
      metadata: {
        acceptanceReasons: decision.reasons,
      },
    });
  }

  private appendCustomerMemoryAudit(principal: Principal, memory: CustomerMemoryUpdate) {
    return this.audit.append({
      actorId: principal.id,
      actorRole: principal.roles[0] ?? "ar_collector",
      action: "collections.customer_memory.updated",
      entityType: "customer_memory",
      entityId: memory.id,
      after: serializeJson(memory),
      metadata: {
        billingAccountId: memory.billingAccountId,
        lastReplyClassification: memory.lastReplyClassification,
      },
    });
  }
}

function isLowRiskReminder(
  account: BillingAccount,
  contact: Contact | undefined,
  scope: CollectionScope
) {
  return Boolean(
    account.accountTier === "standard" &&
      scope === "account" &&
      contact?.isVerified &&
      contact.allowAutoSend
  );
}

function isAmbiguousGrouping(account: BillingAccount, invoices: CustomerInvoice[]): boolean {
  const uniqueBillingAccounts = new Set(invoices.map((invoice) => invoice.billingAccountId));
  const uniqueParents = new Set(invoices.map((invoice) => invoice.parentAccountId));

  return (
    uniqueBillingAccounts.size > 1 ||
    uniqueParents.size > 1 ||
    [...uniqueBillingAccounts][0] !== account.id
  );
}

function readConfidence(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readThresholdCents(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined;
}

function mapReminderIntent(
  stage: CollectionReminderDraft["escalationStage"]
): "reminder" | "overdue_follow_up" | "request_remittance" | "escalation" {
  switch (stage) {
    case "friendly_reminder":
    case "due_date_reminder":
      return "reminder";
    case "overdue_follow_up":
    case "ask_for_payment_date":
      return "overdue_follow_up";
    case "ask_for_remittance_advice":
      return "request_remittance";
    case "escalate_to_account_owner":
    case "stop_and_mark_exception":
      return "escalation";
    default:
      return "reminder";
  }
}

function toSupportedWorkflowRole(
  role: string | undefined,
): "ar_collector" | "ar_manager" | "controller" | "admin" {
  if (role === "ar_manager" || role === "controller" || role === "admin") {
    return role;
  }

  return "ar_collector";
}

function serializeJson(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
