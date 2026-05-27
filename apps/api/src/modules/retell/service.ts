import { randomUUID } from "node:crypto";
import {
  createActivityLogDomainHelpers,
  type ImmutableActivityLogEntry,
  type ImmutableActivityLogStore
} from "@o2c/audit";
import type { Principal } from "@o2c/auth";
import type { VoicePostCallPersistencePlan } from "@o2c/contracts";
import {
  SafeCommunicationAttemptFactory,
  type BillingAccount,
  type CollectionSendWindow,
  type CommunicationAttempt,
  type Contact,
  type CustomerInvoice,
  type PromiseToPay
} from "@o2c/domain";
import {
  buildCollectionsVoicePreCallPlan,
  buildVoicePostCallTasks,
  buildVoicePostCallPersistencePlan,
  resolveCollectionsVoicePreCallAsOf,
  type TaskWorkflowService,
  type CollectionsVoicePreCallPlan,
  type VoicePostCallCallbackRequest,
  type VoicePostCallContactHandoff,
  type VoicePostCallDisputeCapture,
  type VoicePostCallFollowUpAction,
  type VoicePostCallNonCommitment,
  type VoicePostCallPartialPaymentCommitment,
  type VoicePostCallPaidAlreadyClaim,
  type VoicePostCallPaymentPlanRequest,
  type VoicePostCallPromiseUpdate,
  type VoicePostCallRoutingChangeRequest
} from "@o2c/workflows";
import type { VoicePostCallGeneratedTask } from "@o2c/contracts";
import {
  RetellConfigurationError,
  RetellProviderError,
  type RetellCreatePhoneCallRequest,
  type RetellCreatePhoneCallResponse,
  type RetellOutboundCallClient
} from "./client.js";
import {
  buildRetellInboundCollectionsRoutingPayload,
  buildRetellOutboundCollectionsCallPayload,
  type RetellInboundRoutingPayload
} from "./payload.js";

export type RetellPreCallOrchestrationConfig = {
  tenantId: string;
  fromNumber?: string;
  overrideAgentId?: string;
};

export type RetellPreCallOrchestrationDependencies = {
  activityStore: ImmutableActivityLogStore;
  retellClient: RetellOutboundCallClient;
  taskService?: TaskWorkflowService;
  config: RetellPreCallOrchestrationConfig;
  now?: () => string;
  idGenerator?: () => string;
  repeatedBrokenPromiseThreshold?: number;
  repeatedBrokenPromiseWindowDays?: number;
};

export type StartRetellCollectionsCallInput = {
  principal: Principal;
  account: BillingAccount;
  contact: Contact;
  invoices: CustomerInvoice[];
  promisesToPay?: PromiseToPay[];
  asOf?: string;
  preDueWindowDays?: number;
  callWindow?: CollectionSendWindow;
  approvalRequestId?: string;
  fromNumber?: string;
  overrideAgentId?: string;
};

export type ResolveRetellInboundCollectionsCallInput = {
  principal: Principal;
  callerPhoneNumber: string;
  account: BillingAccount;
  contact: Contact;
  invoices: CustomerInvoice[];
  promisesToPay?: PromiseToPay[];
  asOf?: string;
  preDueWindowDays?: number;
  callWindow?: CollectionSendWindow;
};

export type RecordRetellPostCallOutcomeInput = {
  principal: Principal;
  billingAccountId: string;
  parentAccountId?: string;
  branchId?: string;
  contactId?: string;
  communicationAttemptId: string;
  providerCallId?: string;
  preCallPlanId?: string;
  occurredAt?: string;
  promisedAmountCents?: number;
  promisedDate?: string;
  transcriptUri?: string;
  transcriptSummary?: string;
  transcriptSegments?: Array<{
    speaker: "agent" | "customer" | "unknown";
    startedAtSeconds?: number | undefined;
    text: string;
  }>;
  sentimentLabel?: "positive" | "neutral" | "negative";
  disposition: string;
  operatorReviewRequired?: boolean;
  contactHandoff?: VoicePostCallContactHandoff;
  routingChangeRequest?: VoicePostCallRoutingChangeRequest;
  promiseUpdate?: VoicePostCallPromiseUpdate;
  partialPaymentCommitment?: VoicePostCallPartialPaymentCommitment;
  paymentPlanRequest?: VoicePostCallPaymentPlanRequest;
  nonCommitment?: VoicePostCallNonCommitment;
  paidAlreadyClaim?: VoicePostCallPaidAlreadyClaim;
  dispute?: VoicePostCallDisputeCapture;
  callback?: VoicePostCallCallbackRequest;
  followUpActions?: VoicePostCallFollowUpAction[];
};

export type RetellCollectionsCallResult =
  | {
      status: "blocked";
      plan: CollectionsVoicePreCallPlan;
      activityEntries: ImmutableActivityLogEntry[];
    }
  | {
      status: "started";
      plan: CollectionsVoicePreCallPlan;
      communicationAttempt: CommunicationAttempt;
      retellPayload: RetellCreatePhoneCallRequest;
      retellCall: RetellCreatePhoneCallResponse;
      activityEntries: ImmutableActivityLogEntry[];
    };

export type RetellPostCallOutcomeResult = {
  status: "recorded";
  persistencePlan: VoicePostCallPersistencePlan;
  tasks: Array<VoicePostCallGeneratedTask & { id: string }>;
  activityEntries: ImmutableActivityLogEntry[];
};

export type RetellInboundRoutingResult = {
  status: "routed" | "fallback";
  fallbackReason?: string;
  plan: CollectionsVoicePreCallPlan;
  routingContext: CollectionsVoicePreCallPlan["routingContext"];
  handlerContext: CollectionsVoicePreCallPlan["handlerContext"];
  verifiedContactStatus: CollectionsVoicePreCallPlan["handlerContext"]["verifiedContactStatus"];
  callObjective: CollectionsVoicePreCallPlan["preCallOutput"]["call_objective"];
  groupSummaries: Array<{
    name: string;
    rank: number;
    label: string;
    count: number;
    totalCents: number;
    summary: string;
    treatmentMode: string;
  }>;
  retellRoutingPayload: RetellInboundRoutingPayload;
  retell_llm_dynamic_variables: Record<string, string>;
  activityEntries: ImmutableActivityLogEntry[];
};

export class RetellPreCallOrchestrationService {
  private readonly now: () => string;
  private readonly idGenerator: () => string;
  private readonly audit: ReturnType<typeof createActivityLogDomainHelpers>;
  private readonly communicationFactory = new SafeCommunicationAttemptFactory();

  constructor(private readonly deps: RetellPreCallOrchestrationDependencies) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.idGenerator = deps.idGenerator ?? randomUUID;
    this.audit = createActivityLogDomainHelpers({
      store: deps.activityStore,
      idGenerator: this.idGenerator,
      now: this.now
    });
  }

  async startInvoiceFollowUpCall(
    input: StartRetellCollectionsCallInput
  ): Promise<RetellCollectionsCallResult> {
    const asOf = resolveCollectionsVoicePreCallAsOf(input.asOf, this.now());
    const plan = buildCollectionsVoicePreCallPlan({
      planId: this.idGenerator(),
      account: input.account,
      contact: input.contact,
      invoices: input.invoices,
      promisesToPay: input.promisesToPay ?? [],
      asOf,
      ...(input.preDueWindowDays !== undefined ? { preDueWindowDays: input.preDueWindowDays } : {}),
      ...(input.callWindow ? { callWindow: input.callWindow } : {}),
      ...(input.approvalRequestId ? { approvalRequestId: input.approvalRequestId } : {})
    });

    const basePreCallMetadata = buildPreCallAuditMetadata({
      account: input.account,
      contact: input.contact,
      plan
    });

    const preCallEntry = this.audit.append({
      actorId: input.principal.id,
      actorRole: input.principal.roles[0] ?? "ar_collector",
      action: plan.safetyDecision.allowed ? "retell.precall.ready" : "retell.precall.blocked",
      entityType: "billing_account",
      entityId: input.account.id,
      after: serializeJson(plan),
      metadata: {
        ...basePreCallMetadata,
        eventType: plan.safetyDecision.allowed ? "pre_call_ready" : "pre_call_blocked",
        billingAccountId: input.account.id,
        parentAccountId: input.account.parentAccountId,
        contactId: input.contact.id,
        blockedReasons: plan.safetyDecision.blockedReasons,
        bucketBlockedReason: plan.bucketOutput.blocked_reason,
        invoiceCount: input.invoices.length,
        priorityGroups: plan.priorityGroups.map((group) => group.name),
        callObjective: plan.preCallOutput.call_objective,
        callPriorityFlags: plan.preCallOutput.call_priority_flags,
        operatorSummary: plan.preCallOutput.operator_summary,
        overallBalanceTotalCents: plan.bucketOutput.overall_balance_total,
        chaseableBalanceTotalCents: plan.bucketOutput.balance_total,
        brokenPromiseCount: plan.bucketOutput.broken_promise_count,
        activeFuturePromiseCount: plan.bucketOutput.active_future_promise_count,
        disputedInvoiceCount: plan.bucketOutput.disputed_invoice_count,
        verifiedContactStatus: plan.preCallOutput.verified_contact_status,
        handlerVerificationSource: plan.preCallOutput.handler_verification_source,
        currentHandlerContactId: plan.preCallOutput.current_handler_contact_id,
        currentAccountHandlerName: plan.preCallOutput.current_account_handler_name,
        rightPartyCheckRequired: plan.preCallOutput.right_party_check_required,
        handlerHandoffPossible: plan.preCallOutput.handler_handoff_possible,
        currentContactMayNoLongerBeHandler:
          plan.preCallOutput.current_contact_may_no_longer_be_handler,
        knownNewHandlerContactId: plan.preCallOutput.known_new_handler_contact_id,
        routingUpdateRecommended: plan.preCallOutput.routing_update_recommended,
        liveTransferPossible: plan.preCallOutput.live_transfer_possible,
        handoffFollowUpRequired: plan.preCallOutput.handoff_follow_up_required,
        handlerHandoffBlockedReason: plan.preCallOutput.handler_handoff_blocked_reason
      }
    });

    const contactVerificationEntry = this.audit.append({
      actorId: input.principal.id,
      actorRole: input.principal.roles[0] ?? "ar_collector",
      action: "retell.precall.contact_verification_evaluated",
      entityType: "billing_account",
      entityId: input.account.id,
      after: serializeJson(plan.handlerContext),
      metadata: {
        ...basePreCallMetadata,
        eventType: "contact_verification_evaluated",
        rightPartyCheckRequired: plan.preCallOutput.right_party_check_required,
        right_party_check_required: plan.preCallOutput.right_party_check_required
      }
    });

    const handlerHandoffEntry = plan.handlerContext.handlerHandoffPossible
      ? this.audit.append({
          actorId: input.principal.id,
          actorRole: input.principal.roles[0] ?? "ar_collector",
          action: "retell.precall.handler_handoff_detected",
          entityType: "billing_account",
          entityId: input.account.id,
          after: serializeJson(plan.handlerContext),
          metadata: {
            ...basePreCallMetadata,
            eventType: "handler_handoff_detected",
            knownNewHandlerName: plan.preCallOutput.known_new_handler_name,
            known_new_handler_name: plan.preCallOutput.known_new_handler_name,
            knownNewHandlerPhone: plan.preCallOutput.known_new_handler_phone,
            known_new_handler_phone: plan.preCallOutput.known_new_handler_phone,
            knownNewHandlerEmail: plan.preCallOutput.known_new_handler_email,
            known_new_handler_email: plan.preCallOutput.known_new_handler_email,
            handlerHandoffBlockedReason: plan.preCallOutput.handler_handoff_blocked_reason,
            handler_handoff_blocked_reason: plan.preCallOutput.handler_handoff_blocked_reason
          }
        })
      : undefined;

    if (!plan.safetyDecision.allowed) {
      const blockedReason =
        plan.safetyDecision.blockedReasons[0] ?? plan.bucketOutput.blocked_reason ?? "blocked";
      const callBlockedEntry = this.audit.append({
        actorId: input.principal.id,
        actorRole: input.principal.roles[0] ?? "ar_collector",
        action: "retell.precall.call_blocked",
        entityType: "billing_account",
        entityId: input.account.id,
        after: serializeJson({
          planId: plan.id,
          blockedReason,
          safetyDecision: plan.safetyDecision
        }),
        metadata: {
          ...buildPreCallAuditMetadata({
            account: input.account,
            contact: input.contact,
            plan,
            blockedReason
          }),
          eventType: "call_blocked"
        }
      });

      return {
        status: "blocked",
        plan,
        activityEntries: [
          preCallEntry,
          contactVerificationEntry,
          ...(handlerHandoffEntry ? [handlerHandoffEntry] : []),
          callBlockedEntry
        ]
      };
    }

    const communicationAttempt = this.buildCommunicationAttempt(input, plan, asOf);
    const attemptEntry = this.audit.append({
      actorId: input.principal.id,
      actorRole: input.principal.roles[0] ?? "ar_collector",
      action: "communication.attempt.created",
      entityType: "billing_account",
      entityId: input.account.id,
      after: serializeJson(communicationAttempt),
      metadata: {
        ...basePreCallMetadata,
        eventType: "communication_attempt_created",
        communicationAttemptId: communicationAttempt.id,
        communication_attempt_id: communicationAttempt.id,
        billingAccountId: input.account.id,
        contactId: input.contact.id,
        channel: "call",
        provider: "retell"
      }
    });

    const fromNumber = input.fromNumber ?? this.deps.config.fromNumber;
    if (!fromNumber) {
      this.appendFailureAudit(input, plan, "RETELL_FROM_NUMBER is required.");
      throw new RetellConfigurationError("RETELL_FROM_NUMBER is required.");
    }

    const retellPayload = buildRetellOutboundCollectionsCallPayload({
      plan,
      account: input.account,
      contact: input.contact,
      communicationAttempt,
      fromNumber,
      tenantId: this.deps.config.tenantId,
      ...((input.overrideAgentId ?? this.deps.config.overrideAgentId)
        ? { overrideAgentId: input.overrideAgentId ?? this.deps.config.overrideAgentId }
        : {})
    });

    try {
      const retellCall = await this.deps.retellClient.createOutboundPhoneCall(retellPayload);
      const callEntry = this.audit.append({
        actorId: input.principal.id,
        actorRole: input.principal.roles[0] ?? "ar_collector",
        action: "retell.outbound_call.created",
        entityType: "billing_account",
        entityId: input.account.id,
        after: serializeJson(retellCall),
        metadata: {
          ...buildPreCallAuditMetadata({
            account: input.account,
            contact: input.contact,
            plan,
            communicationAttemptId: communicationAttempt.id,
            providerCallId: retellCall.call_id
          }),
          eventType: "retell_outbound_call_created",
          communicationAttemptId: communicationAttempt.id,
          communication_attempt_id: communicationAttempt.id,
          billingAccountId: input.account.id,
          contactId: input.contact.id,
          retellCallId: retellCall.call_id,
          providerCallId: retellCall.call_id,
          provider_call_id: retellCall.call_id,
          retellCallStatus: retellCall.call_status ?? "registered"
        }
      });
      const callCreatedEntry = this.audit.append({
        actorId: input.principal.id,
        actorRole: input.principal.roles[0] ?? "ar_collector",
        action: "retell.outbound_call.call_created",
        entityType: "billing_account",
        entityId: input.account.id,
        after: serializeJson({
          retellCall,
          planId: plan.id,
          communicationAttemptId: communicationAttempt.id
        }),
        metadata: {
          ...buildPreCallAuditMetadata({
            account: input.account,
            contact: input.contact,
            plan,
            communicationAttemptId: communicationAttempt.id,
            providerCallId: retellCall.call_id
          }),
          eventType: "call_created",
          retellCallStatus: retellCall.call_status ?? "registered"
        }
      });

      return {
        status: "started",
        plan,
        communicationAttempt,
        retellPayload,
        retellCall,
        activityEntries: [
          preCallEntry,
          contactVerificationEntry,
          ...(handlerHandoffEntry ? [handlerHandoffEntry] : []),
          attemptEntry,
          callEntry,
          callCreatedEntry
        ]
      };
    } catch (error) {
      this.appendFailureAudit(
        input,
        plan,
        error instanceof Error ? error.message : "Retell call failed."
      );
      throw error;
    }
  }

  resolveInboundCollectionsCall(
    input: ResolveRetellInboundCollectionsCallInput
  ): RetellInboundRoutingResult {
    const asOf = resolveCollectionsVoicePreCallAsOf(input.asOf, this.now());
    const plan = buildCollectionsVoicePreCallPlan({
      planId: this.idGenerator(),
      account: input.account,
      contact: input.contact,
      invoices: input.invoices,
      promisesToPay: input.promisesToPay ?? [],
      asOf,
      ...(input.preDueWindowDays !== undefined ? { preDueWindowDays: input.preDueWindowDays } : {}),
      ...(input.callWindow ? { callWindow: input.callWindow } : {})
    });
    const fallbackReason = determineInboundFallbackReason(plan);
    const retellRoutingPayload = buildRetellInboundCollectionsRoutingPayload({
      plan,
      account: input.account,
      contact: input.contact,
      callerPhoneNumber: input.callerPhoneNumber,
      tenantId: this.deps.config.tenantId,
      ...(fallbackReason ? { fallbackReason } : {})
    });
    const activityEntry = this.audit.append({
      actorId: input.principal.id,
      actorRole: input.principal.roles[0] ?? "ar_collector",
      action: fallbackReason ? "retell.inbound_call.fallback_routed" : "retell.inbound_call.routed",
      entityType: "billing_account",
      entityId: input.account.id,
      after: serializeJson({
        planId: plan.id,
        callerPhoneNumber: input.callerPhoneNumber,
        routingContext: plan.routingContext,
        handlerContext: plan.handlerContext,
        callObjective: plan.preCallOutput.call_objective,
        fallbackReason
      }),
      metadata: {
        ...buildPreCallAuditMetadata({
          account: input.account,
          contact: input.contact,
          plan,
          ...(fallbackReason ? { blockedReason: fallbackReason } : {})
        }),
        eventType: fallbackReason ? "inbound_call_fallback" : "inbound_call_routed",
        callerPhoneNumber: input.callerPhoneNumber,
        caller_phone_number: input.callerPhoneNumber,
        inboundCall: true,
        inbound_call: true,
        fallbackReason: fallbackReason ?? "",
        fallback_reason: fallbackReason ?? ""
      }
    });

    return {
      status: fallbackReason ? "fallback" : "routed",
      ...(fallbackReason ? { fallbackReason } : {}),
      plan,
      routingContext: plan.routingContext,
      handlerContext: plan.handlerContext,
      verifiedContactStatus: plan.handlerContext.verifiedContactStatus,
      callObjective: plan.preCallOutput.call_objective,
      groupSummaries: plan.callPriorityGroups.map((group) => ({
        name: group.name,
        rank: group.rank,
        label: group.label,
        count: group.count,
        totalCents: group.totalCents,
        summary: group.summary,
        treatmentMode: group.treatmentMode
      })),
      retellRoutingPayload,
      retell_llm_dynamic_variables: retellRoutingPayload.retell_llm_dynamic_variables,
      activityEntries: [activityEntry]
    };
  }

  private buildCommunicationAttempt(
    input: StartRetellCollectionsCallInput,
    plan: CollectionsVoicePreCallPlan,
    createdAt: string
  ): CommunicationAttempt {
    const phoneNumber = input.contact.phone;
    if (!phoneNumber) {
      throw new RetellConfigurationError("Retell call requires a verified contact phone number.");
    }

    return this.communicationFactory.create({
      attemptId: this.idGenerator(),
      tenantId: this.deps.config.tenantId,
      parentAccountId: input.account.parentAccountId,
      billingAccountId: input.account.id,
      ...(plan.routingContext.branchId ? { branchId: plan.routingContext.branchId } : {}),
      contactId: input.contact.id,
      ...(input.approvalRequestId ? { approvalRequestId: input.approvalRequestId } : {}),
      channel: "call",
      provider: "retell",
      direction: "outbound",
      intentType: inferIntentType(plan),
      recipient: {
        phoneNumber,
        displayName: input.contact.fullName,
        verified: input.contact.isVerified && input.contact.allowAutoSend
      },
      invoiceIds: plan.eligibleInvoiceIds,
      contentTemplateKey: "collections_retell_invoice_follow_up_v1",
      bodyPreview: buildBodyPreview(plan),
      metadata: {
        routingLevel: "billing_account",
        branchIds: plan.routingContext.branchIds,
        voiceAutomationMode: "manual_assist",
        bucketOutput: plan.bucketOutput,
        preCallOutput: plan.preCallOutput,
        priorityGroups: plan.priorityGroups,
        callPriorityGroups: plan.callPriorityGroups,
        handlerContext: plan.handlerContext,
        preCallPlanId: plan.id
      },
      actorId: input.principal.id,
      actorRole: "user",
      createdAt
    });
  }

  async recordPostCallOutcome(
    input: RecordRetellPostCallOutcomeInput
  ): Promise<RetellPostCallOutcomeResult> {
    const occurredAt = input.occurredAt ?? this.now();
    const persistencePlan = buildVoicePostCallPersistencePlan({
      id: this.idGenerator(),
      billingAccountId: input.billingAccountId,
      ...(input.parentAccountId ? { parentAccountId: input.parentAccountId } : {}),
      ...(input.branchId ? { branchId: input.branchId } : {}),
      ...(input.contactId ? { contactId: input.contactId } : {}),
      communicationAttemptId: input.communicationAttemptId,
      ...(input.providerCallId ? { providerCallId: input.providerCallId } : {}),
      ...(input.preCallPlanId ? { preCallPlanId: input.preCallPlanId } : {}),
      occurredAt,
      disposition: input.disposition,
      ...(input.operatorReviewRequired !== undefined
        ? { operatorReviewRequired: input.operatorReviewRequired }
        : {}),
      ...(input.contactHandoff ? { contactHandoff: input.contactHandoff } : {}),
      ...(input.routingChangeRequest ? { routingChangeRequest: input.routingChangeRequest } : {}),
      ...(input.promiseUpdate ? { promiseUpdate: input.promiseUpdate } : {}),
      ...(input.partialPaymentCommitment
        ? { partialPaymentCommitment: input.partialPaymentCommitment }
        : {}),
      ...(input.paymentPlanRequest ? { paymentPlanRequest: input.paymentPlanRequest } : {}),
      ...(input.nonCommitment ? { nonCommitment: input.nonCommitment } : {}),
      ...(input.paidAlreadyClaim ? { paidAlreadyClaim: input.paidAlreadyClaim } : {}),
      ...(input.dispute ? { dispute: input.dispute } : {}),
      ...(input.callback ? { callback: input.callback } : {}),
      ...(input.followUpActions ? { followUpActions: input.followUpActions } : {})
    });

    const receivedEntry = this.audit.append({
      actorId: input.principal.id,
      actorRole: input.principal.roles[0] ?? "ar_collector",
      action: "retell.call_outcome.received",
      entityType: "billing_account",
      entityId: input.billingAccountId,
      after: serializeJson({
        providerCallId: input.providerCallId,
        communicationAttemptId: input.communicationAttemptId,
        disposition: input.disposition,
        occurredAt,
        transcriptSummary: input.transcriptSummary
      }),
      metadata: {
        billingAccountId: input.billingAccountId,
        billing_account_id: input.billingAccountId,
        contactId: input.contactId,
        contact_id: input.contactId,
        branchId: input.branchId,
        branch_id: input.branchId,
        communicationAttemptId: input.communicationAttemptId,
        communication_attempt_id: input.communicationAttemptId,
        providerCallId: input.providerCallId,
        provider_call_id: input.providerCallId,
        preCallPlanId: input.preCallPlanId,
        pre_call_plan_id: input.preCallPlanId,
        transcriptSummary: input.transcriptSummary,
        transcript_summary: input.transcriptSummary
      }
    });

    const planEntry = this.audit.append({
      actorId: input.principal.id,
      actorRole: input.principal.roles[0] ?? "ar_collector",
      action: "collections.voice.post_call.persistence_planned",
      entityType: "billing_account",
      entityId: input.billingAccountId,
      after: serializeJson(persistencePlan),
      metadata: {
        billingAccountId: input.billingAccountId,
        billing_account_id: input.billingAccountId,
        contactId: input.contactId,
        contact_id: input.contactId,
        branchId: input.branchId,
        branch_id: input.branchId,
        communicationAttemptId: input.communicationAttemptId,
        communication_attempt_id: input.communicationAttemptId,
        providerCallId: input.providerCallId,
        provider_call_id: input.providerCallId,
        actionKinds: persistencePlan.actions.map((action) => action.kind),
        followUpSafeMode: persistencePlan.followUpSafeMode,
        operatorReviewRequired: persistencePlan.operatorReviewRequired,
        transcriptSummary: input.transcriptSummary,
        transcript_summary: input.transcriptSummary
      }
    });

    const actionEntries = persistencePlan.actions.map((action) =>
      this.audit.append({
        actorId: input.principal.id,
        actorRole: input.principal.roles[0] ?? "ar_collector",
        action: `collections.voice.post_call.${action.kind}`,
        entityType: "billing_account",
        entityId: input.billingAccountId,
        after: serializeJson(action),
        metadata: {
          billingAccountId: input.billingAccountId,
          billing_account_id: input.billingAccountId,
          contactId: input.contactId,
          contact_id: input.contactId,
          branchId: input.branchId,
          branch_id: input.branchId,
          communicationAttemptId: input.communicationAttemptId,
          communication_attempt_id: input.communicationAttemptId,
          providerCallId: input.providerCallId,
          provider_call_id: input.providerCallId,
          actionKind: action.kind,
          action_kind: action.kind,
          requiresHumanReview: action.requiresHumanReview,
          requires_human_review: action.requiresHumanReview
        }
      })
    );
    const workflowEventEntries = persistencePlan.actions.flatMap((action) => {
      const workflowEventAction = toPostCallWorkflowEventAction(action.kind);
      if (!workflowEventAction) {
        return [];
      }

      return [
        this.audit.append({
          actorId: input.principal.id,
          actorRole: input.principal.roles[0] ?? "ar_collector",
          action: workflowEventAction,
          entityType: "billing_account",
          entityId: input.billingAccountId,
          after: serializeJson(action),
          metadata: {
            billingAccountId: input.billingAccountId,
            billing_account_id: input.billingAccountId,
            contactId: input.contactId,
            contact_id: input.contactId,
            branchId: input.branchId,
            branch_id: input.branchId,
            communicationAttemptId: input.communicationAttemptId,
            communication_attempt_id: input.communicationAttemptId,
            providerCallId: input.providerCallId,
            provider_call_id: input.providerCallId,
            actionKind: action.kind,
            action_kind: action.kind,
            eventType: workflowEventAction.split(".").at(-1) ?? action.kind,
            requiresHumanReview: action.requiresHumanReview,
            requires_human_review: action.requiresHumanReview
          }
        })
      ];
    });

    const { tasks: createdTasks, activityEntries: taskActivityEntries } =
      await this.createPostCallTasks(input, persistencePlan);

    return {
      status: "recorded",
      persistencePlan,
      tasks: createdTasks,
      activityEntries: [
        receivedEntry,
        planEntry,
        ...actionEntries,
        ...workflowEventEntries,
        ...taskActivityEntries
      ]
    };
  }

  private async createPostCallTasks(
    input: RecordRetellPostCallOutcomeInput,
    persistencePlan: VoicePostCallPersistencePlan
  ): Promise<{
    tasks: Array<VoicePostCallGeneratedTask & { id: string }>;
    activityEntries: ImmutableActivityLogEntry[];
  }> {
    if (!this.deps.taskService) {
      return { tasks: [], activityEntries: [] };
    }

    const existingTasks = await this.deps.taskService.list({
      billingAccountId: input.billingAccountId
    });
    const repeatedBrokenPromiseWindowDays = this.deps.repeatedBrokenPromiseWindowDays ?? 90;
    const historicalActivityEntries =
      input.promiseUpdate?.status === "broken"
        ? await this.deps.activityStore.list?.({
            entityType: "billing_account",
            entityId: input.billingAccountId,
            actions: ["collections.voice.post_call.promise_update"],
            occurredAtFrom: shiftIsoDays(
              persistencePlan.occurredAt,
              -repeatedBrokenPromiseWindowDays
            )
          })
        : [];

    const taskPlans = buildVoicePostCallTasks(
      {
        persistencePlan,
        disposition: input.disposition,
        existingTasks,
        historicalActivityEntries: historicalActivityEntries ?? [],
        ...(input.transcriptSummary ? { transcriptSummary: input.transcriptSummary } : {}),
        ...(input.transcriptSegments ? { transcriptSegments: input.transcriptSegments } : {}),
        ...(input.promisedDate ? { promisedDate: input.promisedDate } : {}),
        ...(input.promisedAmountCents !== undefined
          ? { promisedAmountCents: input.promisedAmountCents }
          : {})
      },
      {
        repeatedBrokenPromiseThreshold: this.deps.repeatedBrokenPromiseThreshold ?? 2,
        repeatedBrokenPromiseWindowDays
      }
    );

    const createdTasks: Array<VoicePostCallGeneratedTask & { id: string }> = [];
    const taskActivityEntries: ImmutableActivityLogEntry[] = [];
    for (const taskPlan of taskPlans) {
      const createdTask = await this.deps.taskService.create(input.principal, {
        title: taskPlan.title,
        description: taskPlan.description,
        kind: taskPlan.taskType,
        origin: "workflow_generated",
        surfaces: ["home", "collections", "customers"],
        billingAccountId: taskPlan.billingAccountId,
        ...(taskPlan.contactId ? { contactId: taskPlan.contactId } : {}),
        ...(taskPlan.branchId ? { branchId: taskPlan.branchId } : {}),
        ownerTeam: taskPlan.ownerTeam,
        source: taskPlan.source,
        ...(taskPlan.callId ? { callId: taskPlan.callId } : {}),
        ...(taskPlan.planId ? { planId: taskPlan.planId } : {}),
        linkedInvoiceIds: taskPlan.linkedInvoiceIds,
        priority: taskPlan.priority,
        dueAt: taskPlan.dueAt,
        summary: taskPlan.summary,
        recommendedNextAction: taskPlan.recommendedNextAction,
        ...(taskPlan.transcriptSnippet ? { transcriptSnippet: taskPlan.transcriptSnippet } : {}),
        requiresHumanReview: taskPlan.requiresHumanReview,
        sourceLinks: buildTaskSourceLinks(taskPlan, input.communicationAttemptId),
        metadata: {
          taskType: taskPlan.taskType,
          source: taskPlan.source,
          callId: taskPlan.callId ?? "",
          planId: taskPlan.planId ?? "",
          linkedInvoiceIds: taskPlan.linkedInvoiceIds,
          priority: taskPlan.priority,
          ownerTeam: taskPlan.ownerTeam,
          recommendedNextAction: taskPlan.recommendedNextAction,
          transcriptSnippet: taskPlan.transcriptSnippet ?? "",
          requiresHumanReview: taskPlan.requiresHumanReview,
          idempotencyKey: taskPlan.idempotencyKey,
          communicationAttemptId: input.communicationAttemptId,
          providerCallId: input.providerCallId ?? ""
        }
      });

      const activityEntry = this.audit.append({
        actorId: input.principal.id,
        actorRole: input.principal.roles[0] ?? "ar_collector",
        action: "collections.voice.post_call.task_created",
        entityType: "billing_account",
        entityId: input.billingAccountId,
        after: serializeJson(createdTask),
        metadata: {
          billingAccountId: input.billingAccountId,
          billing_account_id: input.billingAccountId,
          branchId: taskPlan.branchId,
          branch_id: taskPlan.branchId,
          contactId: taskPlan.contactId,
          contact_id: taskPlan.contactId,
          communicationAttemptId: input.communicationAttemptId,
          communication_attempt_id: input.communicationAttemptId,
          providerCallId: input.providerCallId,
          provider_call_id: input.providerCallId,
          taskId: createdTask.id,
          task_id: createdTask.id,
          taskType: taskPlan.taskType,
          task_type: taskPlan.taskType,
          ownerTeam: taskPlan.ownerTeam,
          owner_team: taskPlan.ownerTeam,
          priority: taskPlan.priority,
          source: taskPlan.source,
          idempotencyKey: taskPlan.idempotencyKey,
          idempotency_key: taskPlan.idempotencyKey
        }
      });

      createdTasks.push({
        ...taskPlan,
        id: createdTask.id
      });
      taskActivityEntries.push(activityEntry);
    }

    return {
      tasks: createdTasks,
      activityEntries: taskActivityEntries
    };
  }

  private appendFailureAudit(
    input: StartRetellCollectionsCallInput,
    plan: CollectionsVoicePreCallPlan,
    failureReason: string
  ): ImmutableActivityLogEntry {
    return this.audit.append({
      actorId: input.principal.id,
      actorRole: input.principal.roles[0] ?? "ar_collector",
      action: "retell.outbound_call.failed",
      entityType: "billing_account",
      entityId: input.account.id,
      metadata: {
        billingAccountId: input.account.id,
        contactId: input.contact.id,
        preCallPlanId: plan.id,
        failureReason
      }
    });
  }
}

function buildPreCallAuditMetadata(input: {
  account: BillingAccount;
  contact: Contact;
  plan: CollectionsVoicePreCallPlan;
  communicationAttemptId?: string;
  providerCallId?: string;
  blockedReason?: string;
}): Record<string, unknown> {
  const output = input.plan.preCallOutput;

  return {
    billingAccountId: input.account.id,
    billing_account_id: input.account.id,
    parentAccountId: input.account.parentAccountId,
    parent_account_id: input.account.parentAccountId,
    contactId: input.contact.id,
    contact_id: input.contact.id,
    currentHandlerContactId: output.current_handler_contact_id,
    current_handler_contact_id: output.current_handler_contact_id,
    verifiedContactStatus: output.verified_contact_status,
    verified_contact_status: output.verified_contact_status,
    handlerVerificationSource: output.handler_verification_source,
    handler_verification_source: output.handler_verification_source,
    branchId: input.plan.routingContext.branchId ?? "",
    branch_id: input.plan.routingContext.branchId ?? "",
    branchIds: input.plan.routingContext.branchIds,
    branch_ids: input.plan.routingContext.branchIds,
    branchContextKnown: input.plan.routingContext.branchIds.length > 0,
    branch_context_known: input.plan.routingContext.branchIds.length > 0,
    callObjective: output.call_objective,
    call_objective: output.call_objective,
    callPriorityPlan: output.call_priority_plan,
    call_priority_plan: output.call_priority_plan,
    callPriorityGroups: input.plan.callPriorityGroups.map((group) => ({
      name: group.name,
      rank: group.rank,
      count: group.count,
      totalCents: group.totalCents,
      treatmentMode: group.treatmentMode,
      summary: group.summary
    })),
    call_priority_groups: input.plan.callPriorityGroups.map((group) => group.name),
    brokenPromiseTotalCents: output.broken_promise_total,
    broken_promise_total_cents: output.broken_promise_total,
    brokenPromiseCount: output.broken_promise_count,
    broken_promise_count: output.broken_promise_count,
    brokenPromiseSummary: output.broken_promise_summary,
    broken_promise_summary: output.broken_promise_summary,
    overdueWithoutPromiseTotalCents: output.overdue_without_promise_total,
    overdue_without_promise_total_cents: output.overdue_without_promise_total,
    overdueWithoutPromiseCount: output.overdue_without_promise_count,
    overdue_without_promise_count: output.overdue_without_promise_count,
    overdueWithoutPromiseSummary: output.overdue_without_promise_summary,
    overdue_without_promise_summary: output.overdue_without_promise_summary,
    dueTodayWithoutPromiseTotalCents: output.due_today_without_promise_total,
    due_today_without_promise_total_cents: output.due_today_without_promise_total,
    dueTodayWithoutPromiseCount: output.due_today_without_promise_count,
    due_today_without_promise_count: output.due_today_without_promise_count,
    dueTodayWithoutPromiseSummary: output.due_today_without_promise_summary,
    due_today_without_promise_summary: output.due_today_without_promise_summary,
    preDueWithoutPromiseTotalCents: output.pre_due_without_promise_total,
    pre_due_without_promise_total_cents: output.pre_due_without_promise_total,
    preDueWithoutPromiseCount: output.pre_due_without_promise_count,
    pre_due_without_promise_count: output.pre_due_without_promise_count,
    preDueWithoutPromiseSummary: output.pre_due_without_promise_summary,
    pre_due_without_promise_summary: output.pre_due_without_promise_summary,
    activeFuturePromiseTotalCents: output.active_future_promise_total,
    active_future_promise_total_cents: output.active_future_promise_total,
    activeFuturePromiseCount: output.active_future_promise_count,
    active_future_promise_count: output.active_future_promise_count,
    activeFuturePromiseSummary: output.active_future_promise_summary,
    active_future_promise_summary: output.active_future_promise_summary,
    earliestActivePromiseDate: output.earliest_active_promise_date,
    earliest_active_promise_date: output.earliest_active_promise_date,
    disputedInvoiceCount: output.disputed_invoice_count,
    disputed_invoice_count: output.disputed_invoice_count,
    disputedInvoiceSummary: output.disputed_invoice_summary,
    disputed_invoice_summary: output.disputed_invoice_summary,
    handlerHandoffPossible: output.handler_handoff_possible,
    handler_handoff_possible: output.handler_handoff_possible,
    currentContactMayNoLongerBeHandler: output.current_contact_may_no_longer_be_handler,
    current_contact_may_no_longer_be_handler: output.current_contact_may_no_longer_be_handler,
    routingUpdateRecommended: output.routing_update_recommended,
    routing_update_recommended: output.routing_update_recommended,
    liveTransferPossible: output.live_transfer_possible,
    live_transfer_possible: output.live_transfer_possible,
    handoffFollowUpRequired: output.handoff_follow_up_required,
    handoff_follow_up_required: output.handoff_follow_up_required,
    communicationAttemptId: input.communicationAttemptId ?? "",
    communication_attempt_id: input.communicationAttemptId ?? "",
    providerCallId: input.providerCallId ?? "",
    provider_call_id: input.providerCallId ?? "",
    blockedReason: input.blockedReason ?? "",
    blocked_reason: input.blockedReason ?? "",
    blockedReasons: input.plan.safetyDecision.blockedReasons,
    blocked_reasons: input.plan.safetyDecision.blockedReasons
  };
}

function toPostCallWorkflowEventAction(kind: string): string | undefined {
  if (kind === "routing_change_request") {
    return "collections.voice.post_call.routing_change_requested";
  }

  if (kind === "callback") {
    return "collections.voice.post_call.callback_required";
  }

  if (kind === "promise_update") {
    return "collections.voice.post_call.promise_monitoring_requested";
  }

  if (kind === "partial_payment_commitment") {
    return "collections.voice.post_call.partial_payment_follow_up_requested";
  }

  if (kind === "payment_plan_request") {
    return "collections.voice.post_call.payment_plan_review_requested";
  }

  if (kind === "non_commitment") {
    return "collections.voice.post_call.non_commitment_follow_up_requested";
  }

  if (kind === "dispute") {
    return "collections.voice.post_call.dispute_follow_up_requested";
  }

  return undefined;
}

function buildTaskSourceLinks(
  taskPlan: VoicePostCallGeneratedTask,
  communicationAttemptId: string
) {
  return [
    {
      label: "Retell call outcome",
      objectType: "communication_attempt",
      objectId: communicationAttemptId,
      metadata: {
        source: taskPlan.source,
        taskType: taskPlan.taskType
      }
    },
    ...(taskPlan.callId
      ? [
          {
            label: "Retell provider call",
            objectType: "retell_call",
            objectId: taskPlan.callId
          }
        ]
      : []),
    ...(taskPlan.planId
      ? [
          {
            label: "Retell pre-call plan",
            objectType: "retell_pre_call_plan",
            objectId: taskPlan.planId
          }
        ]
      : []),
    ...taskPlan.linkedInvoiceIds.map((invoiceId: string) => ({
      label: "Linked invoice",
      objectType: "invoice",
      objectId: invoiceId
    }))
  ];
}

function determineInboundFallbackReason(plan: CollectionsVoicePreCallPlan): string | undefined {
  const liveFlowResolvableReasons = new Set([
    "unverified_contact",
    "outside_call_window",
    "handler_handoff_requires_review"
  ]);
  const hardBlockedReason = plan.safetyDecision.blockedReasons.find(
    (reason) => !liveFlowResolvableReasons.has(reason)
  );
  if (hardBlockedReason) {
    return hardBlockedReason;
  }

  if (plan.callPriorityGroups.length === 0) {
    return plan.bucketOutput.blocked_reason || "no_collectible_invoices";
  }

  return undefined;
}

function inferIntentType(plan: CollectionsVoicePreCallPlan): CommunicationAttempt["intentType"] {
  if (plan.preCallOutput.has_broken_promises || plan.preCallOutput.has_active_future_promises) {
    return "ptp_follow_up";
  }

  if (plan.preCallOutput.has_overdue_without_promise) {
    return "overdue_follow_up";
  }

  return "reminder";
}

function buildBodyPreview(plan: CollectionsVoicePreCallPlan): string {
  if (plan.preCallOutput.has_broken_promises) {
    return `Retell call prepared for broken promises: ${plan.preCallOutput.broken_promise_summary}.`;
  }

  if (plan.preCallOutput.has_overdue_without_promise) {
    return `Retell call prepared for overdue invoices: ${plan.preCallOutput.overdue_without_promise_summary}.`;
  }

  if (plan.preCallOutput.has_due_today_without_promise) {
    return `Retell call prepared for invoices due today: ${plan.preCallOutput.due_today_without_promise_summary}.`;
  }

  return `Retell call prepared with priority plan: ${plan.preCallOutput.call_priority_plan}.`;
}

function shiftIsoDays(iso: string, days: number) {
  const value = new Date(iso);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString();
}

function serializeJson<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function isRetellOperationalError(error: unknown): boolean {
  return error instanceof RetellConfigurationError || error instanceof RetellProviderError;
}
