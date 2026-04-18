import {
  DeterministicCommunicationOutcomeNormalizationService,
  DeterministicLearningEventIngestionService,
  type ApprovalRequest,
  type BillingAccount,
  type CollectionReminderDraft,
  type CollectionReplyAnalysis,
  type CommunicationAttempt,
  type Contact,
  type CustomerInvoice,
  type LearningEvent,
  type LearningEventIngestionService,
  type Payment,
  type Remittance,
  type ResendDocumentBundle,
} from "@o2c/domain";

export type LearningEventSink = (
  event: LearningEvent,
) => void | Promise<void>;

export async function persistLearningEvents(
  sink: LearningEventSink | undefined,
  events: LearningEvent[],
): Promise<void> {
  if (!sink) {
    return;
  }

  for (const event of events) {
    await sink(event);
  }
}

export class WorkflowLearningEventFactory {
  private readonly events: LearningEventIngestionService;
  private readonly communications =
    new DeterministicCommunicationOutcomeNormalizationService();

  constructor(
    events: LearningEventIngestionService = new DeterministicLearningEventIngestionService(),
  ) {
    this.events = events;
  }

  buildCollectionsReminderEvents(input: {
    occurredAt: string;
    account: BillingAccount;
    invoices: CustomerInvoice[];
    reminderDraft: CollectionReminderDraft;
    communicationAttempt?: CommunicationAttempt;
    approvalRequest?: ApprovalRequest;
    contact?: Contact;
  }): LearningEvent[] {
    const invoiceIds = input.invoices.map((invoice) => invoice.id);
    const events: LearningEvent[] = [];

    if (input.communicationAttempt) {
      events.push(
        ...this.communications.normalizeAttemptCreated({
          attempt: input.communicationAttempt,
        }),
      );
    } else if (input.reminderDraft.deliveryState === "blocked") {
      events.push(
        this.events.ingest({
          id: `${input.reminderDraft.id}:learning:blocked`,
          parentAccountId: input.account.parentAccountId,
          billingAccountId: input.account.id,
          ...(input.account.branchId ? { branchId: input.account.branchId } : {}),
          ...(input.contact?.id ? { contactId: input.contact.id } : {}),
          occurredAt: input.occurredAt,
          sourceSystem: "collections",
          eventType: "communication_blocked",
          channel: "email",
          provider: "internal",
          direction: "outbound",
          intentType: "reminder",
          communicationStatus: "blocked",
          relatedEntityType: "collection_reminder",
          relatedEntityId: input.reminderDraft.id,
          invoiceIds,
          payload: {
            blockedReason: input.reminderDraft.blockedReason,
            deliveryState: input.reminderDraft.deliveryState,
            groupingMode: input.reminderDraft.groupingMode,
          },
        }),
      );
    }

    if (input.approvalRequest) {
      events.push(
        this.buildApprovalEvent({
          id: `${input.approvalRequest.id}:learning:requested`,
          eventType: "approval_requested",
          approval: input.approvalRequest,
          parentAccountId: input.account.parentAccountId,
          billingAccountId: input.account.id,
          branchId: input.account.branchId,
          contactId: input.contact?.id,
          occurredAt: input.occurredAt,
          invoiceIds,
        }),
      );
    }

    return events;
  }

  buildCollectionsReplyEvents(input: {
    occurredAt: string;
    account: BillingAccount;
    invoices: CustomerInvoice[];
    analysis: CollectionReplyAnalysis;
    contact?: Contact;
    resendBundle?: ResendDocumentBundle;
  }): LearningEvent[] {
    const invoiceIds = input.invoices.map((invoice) => invoice.id);
    const events: LearningEvent[] = [
      this.events.ingest({
        id: `${input.account.id}:reply:${input.occurredAt}`,
        parentAccountId: input.account.parentAccountId,
        billingAccountId: input.account.id,
        ...(input.account.branchId ? { branchId: input.account.branchId } : {}),
        ...(input.contact?.id ? { contactId: input.contact.id } : {}),
        occurredAt: input.occurredAt,
        sourceSystem: "collections",
        eventType: "customer_response_received",
        channel: "email",
        provider: "internal",
        direction: "inbound",
        intentType: inferReplyIntent(input.analysis.classification),
        communicationStatus: "replied",
        relatedEntityType: "billing_account",
        relatedEntityId: input.account.id,
        invoiceIds,
        payload: {
          classification: input.analysis.classification,
          confidence: input.analysis.confidence,
        },
      }),
    ];

    if (
      input.analysis.classification === "already_paid" ||
      input.analysis.classification === "remittance_advice"
    ) {
      events.push(
        this.events.ingest({
          id: `${input.account.id}:reply-payment:${input.occurredAt}`,
          parentAccountId: input.account.parentAccountId,
          billingAccountId: input.account.id,
          ...(input.account.branchId ? { branchId: input.account.branchId } : {}),
          ...(input.contact?.id ? { contactId: input.contact.id } : {}),
          occurredAt: input.occurredAt,
          sourceSystem: "collections",
          eventType: "payment_outcome_after_communication",
          channel: "email",
          provider: "internal",
          direction: "inbound",
          intentType: "request_remittance",
          relatedEntityType: "billing_account",
          relatedEntityId: input.account.id,
          invoiceIds,
          payload: {
            classification: input.analysis.classification,
            paymentSignalDetected: true,
          },
        }),
      );
    }

    if (input.resendBundle) {
      events.push(
        this.events.ingest({
          id: `${input.resendBundle.id}:learning:resent`,
          parentAccountId: input.account.parentAccountId,
          billingAccountId: input.account.id,
          ...(input.account.branchId ? { branchId: input.account.branchId } : {}),
          ...(input.contact?.id ? { contactId: input.contact.id } : {}),
          occurredAt: input.occurredAt,
          sourceSystem: "collections",
          eventType: "invoice_bundle_resent",
          channel: "email",
          provider: "internal",
          direction: "outbound",
          intentType: "resend_documents",
          communicationStatus:
            input.resendBundle.sendStrategy === "auto_send"
              ? "completed"
              : "blocked",
          relatedEntityType: "document_bundle",
          relatedEntityId: input.resendBundle.id,
          invoiceIds,
          payload: {
            sendStrategy: input.resendBundle.sendStrategy,
            servicingClassification:
              input.resendBundle.servicingClassification,
            documentCount: input.resendBundle.documents.length,
          },
        }),
      );
    }

    return events;
  }

  buildRemittanceLifecycleEvents(input: {
    remittance: Remittance;
    occurredAt: string;
    phase:
      | "received"
      | "parsed"
      | "linked"
      | "review_required"
      | "resolved"
      | "orphaned";
    parentAccountId?: string;
    billingAccountId?: string;
    branchId?: string;
    paymentId?: string;
    invoiceIds?: string[];
  }): LearningEvent[] {
    const eventTypeByPhase = {
      received: "remittance_received",
      parsed: "remittance_parsed",
      linked: "remittance_linked",
      review_required: "remittance_review_required",
      resolved: "remittance_resolved",
      orphaned: "remittance_orphaned",
    } as const;

    return [
      this.events.ingest({
        id: `${input.remittance.id}:learning:${input.phase}:${input.occurredAt}`,
        parentAccountId: input.parentAccountId ?? "unscoped_parent_account",
        ...(input.billingAccountId
          ? { billingAccountId: input.billingAccountId }
          : {}),
        ...(input.branchId ? { branchId: input.branchId } : {}),
        occurredAt: input.occurredAt,
        sourceSystem: "remittance",
        eventType: eventTypeByPhase[input.phase],
        relatedEntityType: "remittance",
        relatedEntityId: input.remittance.id,
        invoiceIds: input.invoiceIds ?? [],
        ...(input.paymentId ? { paymentId: input.paymentId } : {}),
        ...(input.phase === "linked" || input.phase === "review_required"
          ? {
              payload: {
                remittanceState: input.remittance.state,
              },
            }
          : {}),
        remittanceId: input.remittance.id,
      }),
    ];
  }

  buildCashApplicationEvents(input: {
    payment: Payment;
    account: BillingAccount;
    occurredAt: string;
    phase: "candidate_match_found" | "review_required" | "auto_applied";
    invoiceIds?: string[];
    approvalRequestId?: string;
    metadata?: Record<string, unknown>;
  }): LearningEvent[] {
    const eventTypeByPhase = {
      candidate_match_found: "payment_candidate_match_found",
      review_required: "payment_review_required",
      auto_applied: "payment_auto_applied",
    } as const;

    return [
      this.events.ingest({
        id: `${input.payment.id}:learning:${input.phase}:${input.occurredAt}`,
        parentAccountId: input.account.parentAccountId,
        billingAccountId: input.account.id,
        occurredAt: input.occurredAt,
        sourceSystem: "cash_application",
        eventType: eventTypeByPhase[input.phase],
        relatedEntityType: "payment",
        relatedEntityId: input.payment.id,
        invoiceIds: input.invoiceIds ?? [],
        paymentId: input.payment.id,
        ...(input.approvalRequestId
          ? { approvalRequestId: input.approvalRequestId }
          : {}),
        payload: input.metadata ?? {},
      }),
    ];
  }

  buildApprovalEvent(input: {
    id: string;
    eventType:
      | "approval_requested"
      | "approval_approved"
      | "approval_rejected";
    approval: ApprovalRequest;
    parentAccountId?: string;
    billingAccountId?: string;
    branchId?: string;
    contactId?: string;
    occurredAt: string;
    invoiceIds?: string[];
  }): LearningEvent {
    const payload = {
      requestType: input.approval.requestType,
      status: input.approval.status,
      assigneeRole: input.approval.assigneeRole,
    };

    return this.events.ingest({
      id: input.id,
      parentAccountId:
        input.parentAccountId ??
        readString(input.approval.payload, "parentAccountId") ??
        "approval_unscoped_parent_account",
      ...(input.billingAccountId
        ? { billingAccountId: input.billingAccountId }
        : readString(input.approval.payload, "billingAccountId")
          ? {
              billingAccountId: readString(
                input.approval.payload,
                "billingAccountId",
              )!,
            }
          : {}),
      ...(input.branchId ? { branchId: input.branchId } : {}),
      ...(input.contactId ? { contactId: input.contactId } : {}),
      occurredAt: input.occurredAt,
      sourceSystem: "approvals",
      eventType: input.eventType,
      relatedEntityType: "approval_request",
      relatedEntityId: input.approval.id,
      approvalRequestId: input.approval.id,
      invoiceIds:
        input.invoiceIds ??
        readStringArray(input.approval.payload, "invoiceIds"),
      payload,
    });
  }
}

function inferReplyIntent(
  classification: CollectionReplyAnalysis["classification"],
): "reminder" | "request_remittance" | "resend_documents" | "ptp_follow_up" | "exception_resolution" {
  switch (classification) {
    case "already_paid":
    case "remittance_advice":
      return "request_remittance";
    case "invoice_not_received":
    case "request_for_docs":
      return "resend_documents";
    case "promise_to_pay":
      return "ptp_follow_up";
    case "wrong_contact":
    case "partial_dispute":
    case "full_dispute":
      return "exception_resolution";
    default:
      return "reminder";
  }
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
