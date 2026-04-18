import { createEntityMetadata } from "../../shared/types.js";
import type { ExceptionState } from "../exceptions/schema.js";
import type { InvoiceState } from "../invoices/schema.js";
import type { ChannelBehaviorProfile } from "./communications.js";
import type {
  AccountBehaviorProfile,
  ContactBehaviorProfile,
  LearningChannel,
  LearningChannelMetrics,
  LearningDirection,
  LearningEvent,
  LearningEventType,
  LearningIntentType,
  LearningReason,
  NextBestActionCandidateScore,
  NextBestActionDomain,
  NextBestActionKind,
  NextBestActionScore,
  OperatorFeedback,
} from "./schema.js";

type ChannelMetricsMap = Partial<Record<LearningChannel, LearningChannelMetrics>>;

const channelByAction: Partial<Record<NextBestActionKind, LearningChannel>> = {
  send_email_grouped_reminder: "email",
  send_email_invoice_level_reminder: "email",
  send_sms_reminder: "sms",
  send_sms_ptp_followup: "sms",
  place_collection_call: "call",
  place_manual_review_call: "call",
  send_email_resend_bundle: "email",
  send_sms_payment_link_or_prompt: "sms",
  request_remittance_via_email: "email",
  request_remittance_via_sms: "sms",
  follow_up_ptp_via_email: "email",
  follow_up_ptp_via_sms: "sms",
};

const intentByAction: Partial<Record<NextBestActionKind, LearningIntentType>> = {
  send_email_grouped_reminder: "reminder",
  send_email_invoice_level_reminder: "reminder",
  send_sms_reminder: "reminder",
  send_sms_ptp_followup: "ptp_follow_up",
  place_collection_call: "escalation",
  place_manual_review_call: "exception_resolution",
  send_email_resend_bundle: "resend_documents",
  send_sms_payment_link_or_prompt: "reminder",
  request_remittance_via_email: "request_remittance",
  request_remittance_via_sms: "request_remittance",
  follow_up_ptp_via_email: "ptp_follow_up",
  follow_up_ptp_via_sms: "ptp_follow_up",
};

export interface LearningLayerPolicy {
  lookbackWindowDays: number;
  minEventsForPreference: number;
  minEventsForIntentPreference: number;
  minEventsForRecommendation: number;
  channelAvailability: {
    email: boolean;
    sms: boolean;
    call: boolean;
  };
  actionAdjustments: {
    emailFirstBonus: number;
    groupedReminderBonus: number;
    invoiceLevelReminderBonus: number;
    resendBundleBonus: number;
    requestRemittanceBonus: number;
    ptpFollowupBonus: number;
    centralizedPayerBonus: number;
    highDocRequirementBonus: number;
    resendBeforePayBonus: number;
    unreliablePtpPenalty: number;
    highWrongContactPenalty: number;
    exceptionRoutingBonus: number;
    ownerEscalationBonus: number;
    holdForReviewBase: number;
  };
  thresholds: {
    highDocumentRequirementRate: number;
    highWrongContactRate: number;
    unreliablePtpKeptRate: number;
    centralizedPayerConfidence: number;
  };
  scoringWeights: {
    responseRate: number;
    paymentConversionRate: number;
    ptpKeptRate: number;
    rightPartyContactRate: number;
    connectRate: number;
    wrongContactPenalty: number;
    optOutPenalty: number;
    fatiguePenalty: number;
  };
}

export interface LearningFeatureComputationResult {
  metricsByChannel: ChannelMetricsMap;
  preferredChannel?: LearningChannel;
  fallbackChannel?: LearningChannel;
  channelPriorityOrder: LearningChannel[];
  bestChannelByIntent: Partial<Record<LearningIntentType, LearningChannel>>;
  safetyFlags: {
    doNotSms: boolean;
    doNotCall: boolean;
    voiceAgentAllowed: boolean;
  };
  evidenceSummary: {
    eventCount: number;
    feedbackCount: number;
    lastEventAt?: string;
    lookbackWindowDays: number;
  };
  explanation: LearningReason[];
}

export interface LearningEventIngestionInput {
  id: string;
  parentAccountId: string;
  occurredAt: string;
  sourceSystem: LearningEvent["sourceSystem"];
  eventType: LearningEventType;
  billingAccountId?: string;
  branchId?: string;
  contactId?: string;
  channel?: LearningEvent["channel"];
  provider?: LearningEvent["provider"];
  direction?: LearningDirection;
  intentType?: LearningIntentType;
  communicationStatus?: LearningEvent["communicationStatus"];
  sourceEventId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  invoiceIds?: string[];
  paymentId?: string;
  remittanceId?: string;
  promiseToPayId?: string;
  exceptionId?: string;
  approvalRequestId?: string;
  explanation?: LearningReason[];
  payload?: Record<string, unknown>;
  reversible?: boolean;
  metadata?: Record<string, unknown>;
  actorId?: string;
  actorRole?: "system" | "user";
  tenantId?: string;
}

export interface LearningEventIngestionService {
  ingest(input: LearningEventIngestionInput): LearningEvent;
}

export interface FeatureComputationService {
  compute(input: {
    events: LearningEvent[];
    feedback?: OperatorFeedback[];
    policy?: Partial<LearningLayerPolicy>;
  }): LearningFeatureComputationResult;
}

export interface BehaviorProfileUpdateService {
  updateAccountProfile(input: {
    profileId: string;
    scope: AccountBehaviorProfile["scope"];
    scopeId: string;
    parentAccountId: string;
    billingAccountId?: string;
    branchId?: string;
    events: LearningEvent[];
    feedback?: OperatorFeedback[];
    computedAt: string;
    policy?: Partial<LearningLayerPolicy>;
    metadata?: Record<string, unknown>;
    actorId?: string;
    actorRole?: "system" | "user";
    tenantId?: string;
  }): AccountBehaviorProfile;
  updateContactProfile(input: {
    profileId: string;
    contactId: string;
    parentAccountId: string;
    billingAccountId?: string;
    branchId?: string;
    verificationSnapshot: ContactBehaviorProfile["verificationSnapshot"];
    events: LearningEvent[];
    feedback?: OperatorFeedback[];
    computedAt: string;
    policy?: Partial<LearningLayerPolicy>;
    metadata?: Record<string, unknown>;
    actorId?: string;
    actorRole?: "system" | "user";
    tenantId?: string;
  }): ContactBehaviorProfile;
}

export interface CollectionsLearningScoringContext {
  parentAccountId: string;
  billingAccountId: string;
  branchId?: string;
  contactId?: string;
  accountTier?: "standard" | "strategic";
  invoiceCount?: number;
  candidateActions: NextBestActionKind[];
  hardSafetyBlocks: string[];
  requiresApproval: boolean;
  accountProfile?: AccountBehaviorProfile;
  contactProfile?: ContactBehaviorProfile;
  channelBehaviorProfiles?: ChannelBehaviorProfile[];
  paymentBehaviorSnapshot?: PaymentBehaviorSnapshot;
  invoiceStates?: InvoiceState[];
  exceptionStates?: ExceptionState[];
}

export interface CashApplicationLearningScoringContext {
  parentAccountId: string;
  billingAccountId?: string;
  candidateActions: NextBestActionKind[];
  hardSafetyBlocks: string[];
  requiresApproval: boolean;
  accountProfile?: AccountBehaviorProfile;
  contactProfile?: ContactBehaviorProfile;
}

export interface PaymentBehaviorSnapshot {
  centralizedPayer?: boolean;
  centralizedPayerConfidence?: number;
  avgDaysToPay?: number;
  avgDaysLate?: number;
  groupedReminderEffectiveness?: {
    value?: number;
    numerator: number;
    denominator: number;
    reasonSummary: string;
  };
  resendBeforePayLikely?: boolean;
  resendBeforePayRate?: number;
  highDocumentRequirement?: boolean;
  documentRequirementRate?: number;
  unreliablePromiseToPay?: boolean;
  ptpKeptRate?: number;
  promiseKeptRate?: number;
  wrongContactRate?: number;
  remittanceQuality?: {
    label: "high" | "medium" | "low" | "unknown";
    structuredRate?: number;
    linkedRate?: number;
    totalRemittances: number;
    reasonSummary: string;
  };
  parentPayerProbability?: number;
  parentPaysForChildren?: boolean;
  branchPaysSeparately?: boolean;
}

export interface CashApplicationLearningBehavior {
  expectedPayerNames: string[];
  expectedPayerBankAccounts: string[];
  parentPaysForChildren?: boolean;
  parentPayerProbability?: number;
  referenceQualityScore?: number;
  remittanceUsuallyArrivesAfterPayment?: boolean;
  typicalBundleSize?: number;
  commonShortPayRate?: number;
  commonBankChargeVarianceCents?: number;
  allowBankChargeVarianceCents?: number;
  allowShortPayVarianceCents?: number;
  explanation: LearningReason[];
}

export interface CollectionsQueueNextBestActionHook {
  recommendedAction: NextBestActionScore["recommendedAction"];
  recommendedChannel?: NextBestActionScore["recommendedChannel"];
  reasonSummary: string;
  requiresApproval: boolean;
  rankedActions: Array<{
    action: NextBestActionKind;
    channel?: LearningChannel;
    score: number;
    blockedBySafety: boolean;
    reasonSummary: string;
  }>;
}

export interface AccountWorkspaceNextBestActionHook {
  nextBestAction: CollectionsQueueNextBestActionHook;
  preferredChannel?: LearningChannel;
  fallbackChannel?: LearningChannel;
  bestChannelByIntent: Partial<Record<LearningIntentType, LearningChannel>>;
  callReadiness: "ready" | "manual_only" | "blocked";
  paymentBehaviorSummary: string[];
}

export interface NextBestActionScoringService {
  score(input: {
    scoreId: string;
    domain: NextBestActionDomain;
    parentAccountId: string;
    billingAccountId?: string;
    branchId?: string;
    contactId?: string;
    accountTier?: "standard" | "strategic";
    invoiceCount?: number;
    candidateActions: NextBestActionKind[];
    hardSafetyBlocks?: string[];
    requiresApproval?: boolean;
    accountProfile?: AccountBehaviorProfile;
    contactProfile?: ContactBehaviorProfile;
    channelBehaviorProfiles?: ChannelBehaviorProfile[];
    paymentBehaviorSnapshot?: PaymentBehaviorSnapshot;
    invoiceStates?: InvoiceState[];
    exceptionStates?: ExceptionState[];
    scoredAt: string;
    policy?: Partial<LearningLayerPolicy>;
    metadata?: Record<string, unknown>;
    actorId?: string;
    actorRole?: "system" | "user";
    tenantId?: string;
  }): NextBestActionScore;
}

export interface OperatorFeedbackCaptureInput {
  id: string;
  feedbackType: OperatorFeedback["feedbackType"];
  targetType: OperatorFeedback["targetType"];
  targetId: string;
  occurredAt: string;
  reasonCode: string;
  appliesToFutureScoring: boolean;
  preservesSafetyRules: boolean;
  parentAccountId?: string;
  billingAccountId?: string;
  branchId?: string;
  contactId?: string;
  linkedLearningEventId?: string;
  linkedNextBestActionScoreId?: string;
  comment?: string;
  beforePayload?: Record<string, unknown>;
  afterPayload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  existingEvents?: LearningEvent[];
  existingFeedback?: OperatorFeedback[];
  recomputeAccountProfile?: {
    profileId: string;
    scope: AccountBehaviorProfile["scope"];
    scopeId: string;
    parentAccountId: string;
    billingAccountId?: string;
    branchId?: string;
    metadata?: Record<string, unknown>;
  };
  recomputeContactProfile?: {
    profileId: string;
    contactId: string;
    parentAccountId: string;
    billingAccountId?: string;
    branchId?: string;
    verificationSnapshot: ContactBehaviorProfile["verificationSnapshot"];
    metadata?: Record<string, unknown>;
  };
  actorId?: string;
  actorRole?: "system" | "user";
  tenantId?: string;
}

export interface OperatorFeedbackCaptureResult {
  feedback: OperatorFeedback;
  emittedEvents: LearningEvent[];
  updatedAccountProfile?: AccountBehaviorProfile;
  updatedContactProfile?: ContactBehaviorProfile;
}

export interface OperatorFeedbackCaptureService {
  capture(input: OperatorFeedbackCaptureInput): OperatorFeedbackCaptureResult;
}

export function deriveCashApplicationLearningBehavior(input: {
  events?: LearningEvent[];
  feedback?: OperatorFeedback[];
}): CashApplicationLearningBehavior {
  const futureSafeFeedback = (input.feedback ?? []).filter(
    (feedback) => feedback.appliesToFutureScoring && feedback.preservesSafetyRules,
  );
  const cashEvents = (input.events ?? []).filter(
    (event) =>
      event.sourceSystem === "cash_application" ||
      event.relatedEntityType === "payment_match" ||
      event.relatedEntityType === "cash_application_decision",
  );
  const evidence = [
    ...futureSafeFeedback.map((feedback) => feedback.afterPayload ?? {}),
    ...cashEvents.map((event) => event.payload ?? {}),
  ];

  const expectedPayerNames = uniqueStrings(
    evidence.flatMap((payload) => readStringArray(payload, "expectedPayerNames")).concat(
      evidence
        .map((payload) => readString(payload, "expectedPayerName"))
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  );
  const expectedPayerBankAccounts = uniqueStrings(
    evidence.flatMap((payload) => readStringArray(payload, "expectedPayerBankAccounts")).concat(
      evidence
        .map((payload) => readString(payload, "expectedPayerBankAccount"))
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  );

  const parentPaySignals = evidence
    .map((payload) => readBoolean(payload, "parentPaysForChildren"))
    .filter((value): value is boolean => typeof value === "boolean");
  const parentPaysForChildren =
    parentPaySignals.filter(Boolean).length >= 2 &&
    parentPaySignals.filter(Boolean).length > parentPaySignals.filter((value) => !value).length;
  const parentPayerProbability =
    parentPaySignals.length > 0
      ? Number(
          (
            parentPaySignals.filter(Boolean).length / parentPaySignals.length
          ).toFixed(3),
        )
      : undefined;

  const referenceQualityScores = evidence
    .map((payload) => readNumber(payload, "referenceQualityScore"))
    .filter((value): value is number => typeof value === "number");
  const referenceQualityScore =
    referenceQualityScores.length >= 2
      ? Number(
          (
            referenceQualityScores.reduce((sum, value) => sum + value, 0) /
            referenceQualityScores.length
          ).toFixed(3),
        )
      : undefined;

  const remittanceAfterPaymentSignals = evidence
    .map((payload) => readString(payload, "remittanceTiming"))
    .filter((value): value is string => typeof value === "string")
    .map((value) => value === "after_payment");
  const remittanceUsuallyArrivesAfterPayment =
    remittanceAfterPaymentSignals.filter(Boolean).length >= 2 &&
    remittanceAfterPaymentSignals.filter(Boolean).length >
      remittanceAfterPaymentSignals.filter((value) => !value).length;

  const bundleSizes = evidence
    .map((payload) => {
      const invoiceIds = readStringArray(payload, "invoiceIds");
      if (invoiceIds.length > 1) {
        return invoiceIds.length;
      }
      const explicitBundleSize = readNumber(payload, "bundleSize");
      return explicitBundleSize && explicitBundleSize > 1 ? explicitBundleSize : undefined;
    })
    .filter((value): value is number => typeof value === "number");
  const typicalBundleSize = modeNumber(bundleSizes, 2);

  const shortPaySignals = evidence
    .map((payload) => {
      const observed = readBoolean(payload, "shortPayObserved");
      if (typeof observed === "boolean") {
        return observed;
      }
      return readString(payload, "varianceType") === "short_pay";
    });
  const shortPayObservedCount = shortPaySignals.filter(Boolean).length;
  const commonShortPayRate =
    shortPaySignals.length >= 2
      ? Number((shortPayObservedCount / shortPaySignals.length).toFixed(3))
      : undefined;

  const bankChargeVariances = evidence
    .filter((payload) => readString(payload, "varianceType") === "bank_charge")
    .map((payload) => readNumber(payload, "varianceCents"))
    .filter((value): value is number => typeof value === "number" && value > 0);
  const commonBankChargeVarianceCents =
    bankChargeVariances.length >= 2 ? Math.max(...bankChargeVariances) : undefined;

  const explanation: LearningReason[] = [];
  if (expectedPayerNames.length > 0 || expectedPayerBankAccounts.length > 0) {
    explanation.push({
      code: "cash_app_payer_identity_learned",
      summary: "Future-safe feedback contributes payer identity hints for cash application scoring.",
      evidence: {
        payerNames: expectedPayerNames,
        payerBankAccounts: expectedPayerBankAccounts,
      },
    });
  }
  if (parentPaysForChildren && parentPayerProbability !== undefined) {
    explanation.push({
      code: "cash_app_parent_payer_pattern",
      summary: "Feedback shows a repeatable parent-payer pattern, but billing-account safeguards still apply.",
      evidence: {
        parentPayerProbability,
      },
    });
  }
  if (remittanceUsuallyArrivesAfterPayment) {
    explanation.push({
      code: "cash_app_remittance_timing_pattern",
      summary: "Feedback shows remittance often lands after payment for this account.",
    });
  }
  if (commonBankChargeVarianceCents !== undefined) {
    explanation.push({
      code: "cash_app_bank_charge_variance_pattern",
      summary: "Feedback captured a repeatable bank-charge variance pattern.",
      evidence: {
        commonBankChargeVarianceCents,
      },
    });
  }

  return {
    expectedPayerNames,
    expectedPayerBankAccounts,
    ...(parentPaysForChildren ? { parentPaysForChildren } : {}),
    ...(parentPayerProbability !== undefined ? { parentPayerProbability } : {}),
    ...(referenceQualityScore !== undefined ? { referenceQualityScore } : {}),
    ...(remittanceUsuallyArrivesAfterPayment ? { remittanceUsuallyArrivesAfterPayment } : {}),
    ...(typicalBundleSize !== undefined ? { typicalBundleSize } : {}),
    ...(commonShortPayRate !== undefined ? { commonShortPayRate } : {}),
    ...(commonBankChargeVarianceCents !== undefined
      ? {
          commonBankChargeVarianceCents,
          allowBankChargeVarianceCents: commonBankChargeVarianceCents,
        }
      : {}),
    ...(commonShortPayRate !== undefined &&
    commonShortPayRate >= 0.5 &&
    commonBankChargeVarianceCents !== undefined
      ? {
          allowShortPayVarianceCents: commonBankChargeVarianceCents,
        }
      : {}),
    explanation,
  };
}

export function defaultLearningLayerPolicy(): LearningLayerPolicy {
  return {
    lookbackWindowDays: 90,
    minEventsForPreference: 2,
    minEventsForIntentPreference: 2,
    minEventsForRecommendation: 2,
    channelAvailability: {
      email: true,
      sms: false,
      call: false,
    },
    actionAdjustments: {
      emailFirstBonus: 0.12,
      groupedReminderBonus: 0.08,
      invoiceLevelReminderBonus: 0.05,
      resendBundleBonus: 0.28,
      requestRemittanceBonus: 0.18,
      ptpFollowupBonus: 0.12,
      centralizedPayerBonus: 0.18,
      highDocRequirementBonus: 0.24,
      resendBeforePayBonus: 0.15,
      unreliablePtpPenalty: 0.35,
      highWrongContactPenalty: 0.25,
      exceptionRoutingBonus: 0.35,
      ownerEscalationBonus: 0.2,
      holdForReviewBase: 0.2,
    },
    thresholds: {
      highDocumentRequirementRate: 0.35,
      highWrongContactRate: 0.3,
      unreliablePtpKeptRate: 0.55,
      centralizedPayerConfidence: 0.6,
    },
    scoringWeights: {
      responseRate: 0.3,
      paymentConversionRate: 0.3,
      ptpKeptRate: 0.15,
      rightPartyContactRate: 0.15,
      connectRate: 0.1,
      wrongContactPenalty: 0.25,
      optOutPenalty: 0.4,
      fatiguePenalty: 0.15,
    },
  };
}

export class DeterministicLearningEventIngestionService
  implements LearningEventIngestionService
{
  ingest(input: LearningEventIngestionInput): LearningEvent {
    return {
      id: input.id,
      ...createEntityMetadata(
        buildEntityMetadataInput(input.occurredAt, input.tenantId, input.actorId, input.actorRole),
      ),
      parentAccountId: input.parentAccountId,
      ...(input.billingAccountId ? { billingAccountId: input.billingAccountId } : {}),
      ...(input.branchId ? { branchId: input.branchId } : {}),
      ...(input.contactId ? { contactId: input.contactId } : {}),
      eventType: input.eventType,
      sourceSystem: input.sourceSystem,
      ...(input.sourceEventId ? { sourceEventId: input.sourceEventId } : {}),
      occurredAt: input.occurredAt,
      ...(input.channel ? { channel: input.channel } : {}),
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.direction ? { direction: input.direction } : {}),
      ...(input.intentType ? { intentType: input.intentType } : {}),
      ...(input.communicationStatus
        ? { communicationStatus: input.communicationStatus }
        : {}),
      ...(input.relatedEntityType ? { relatedEntityType: input.relatedEntityType } : {}),
      ...(input.relatedEntityId ? { relatedEntityId: input.relatedEntityId } : {}),
      invoiceIds: input.invoiceIds ?? [],
      ...(input.paymentId ? { paymentId: input.paymentId } : {}),
      ...(input.remittanceId ? { remittanceId: input.remittanceId } : {}),
      ...(input.promiseToPayId ? { promiseToPayId: input.promiseToPayId } : {}),
      ...(input.exceptionId ? { exceptionId: input.exceptionId } : {}),
      ...(input.approvalRequestId ? { approvalRequestId: input.approvalRequestId } : {}),
      explanation: input.explanation ?? [],
      payload: input.payload ?? {},
      reversible: input.reversible ?? true,
      metadata: input.metadata ?? {},
    };
  }
}

export class DeterministicFeatureComputationService
  implements FeatureComputationService
{
  compute(input: {
    events: LearningEvent[];
    feedback?: OperatorFeedback[];
    policy?: Partial<LearningLayerPolicy>;
  }): LearningFeatureComputationResult {
    const policy = mergePolicy(input.policy);
    const feedback = input.feedback ?? [];
    const metricsByChannel = computeMetricsByChannel(input.events);
    const channelPriorityOrder = rankChannels(metricsByChannel, policy);
    const preferredChannel =
      determinePreferredChannel(channelPriorityOrder, metricsByChannel, policy) ??
      extractOperatorChannelPreference(feedback, "preferredChannel");
    const fallbackChannel =
      channelPriorityOrder.find((channel) => channel !== preferredChannel) ??
      extractOperatorChannelPreference(feedback, "fallbackChannel");
    const bestChannelByIntent = computeBestChannelByIntent(
      input.events,
      metricsByChannel,
      policy,
    );
    const lastEventAt = input.events
      .map((event) => event.occurredAt)
      .sort()
      .at(-1);
    const safetyFlags = {
      doNotSms: (metricsByChannel.sms?.optOuts ?? 0) > 0,
      doNotCall: Boolean(
        extractBooleanFeedback(feedback, "doNotCall") ||
          input.events.some((event) => event.eventType === "call_wrong_contact"),
      ),
      voiceAgentAllowed: !extractBooleanFeedback(feedback, "voiceAgentDisallowed"),
    };
    const explanation: LearningReason[] = [
      {
        code: "channel_ranked",
        summary: `Computed channel order: ${channelPriorityOrder.join(", ") || "none"}.`,
      },
    ];

    if (preferredChannel) {
      explanation.push({
        code: "preferred_channel_selected",
        summary: `Preferred channel is ${preferredChannel}.`,
      });
    }
    if (safetyFlags.doNotSms) {
      explanation.push({
        code: "sms_opt_out_detected",
        summary: "SMS is blocked because an opt-out signal exists.",
      });
    }
    if (extractOperatorChannelPreference(feedback, "preferredChannel")) {
      explanation.push({
        code: "operator_override_applied",
        summary: "Operator feedback influenced preferred channel selection.",
      });
    }

    return {
      metricsByChannel,
      ...(preferredChannel ? { preferredChannel } : {}),
      ...(fallbackChannel ? { fallbackChannel } : {}),
      channelPriorityOrder,
      bestChannelByIntent,
      safetyFlags,
      evidenceSummary: {
        eventCount: input.events.length,
        feedbackCount: feedback.length,
        ...(lastEventAt ? { lastEventAt } : {}),
        lookbackWindowDays: policy.lookbackWindowDays,
      },
      explanation,
    };
  }
}

export class DeterministicBehaviorProfileUpdateService
  implements BehaviorProfileUpdateService
{
  constructor(
    private readonly features: FeatureComputationService = new DeterministicFeatureComputationService(),
  ) {}

  updateAccountProfile(input: {
    profileId: string;
    scope: AccountBehaviorProfile["scope"];
    scopeId: string;
    parentAccountId: string;
    billingAccountId?: string;
    branchId?: string;
    events: LearningEvent[];
    feedback?: OperatorFeedback[];
    computedAt: string;
    policy?: Partial<LearningLayerPolicy>;
    metadata?: Record<string, unknown>;
    actorId?: string;
    actorRole?: "system" | "user";
    tenantId?: string;
  }): AccountBehaviorProfile {
    const computed = this.features.compute({
      events: input.events,
      ...(input.feedback ? { feedback: input.feedback } : {}),
      ...(input.policy ? { policy: input.policy } : {}),
    });

    return {
      id: input.profileId,
      ...createEntityMetadata(
        buildEntityMetadataInput(input.computedAt, input.tenantId, input.actorId, input.actorRole),
      ),
      scope: input.scope,
      scopeId: input.scopeId,
      parentAccountId: input.parentAccountId,
      ...(input.billingAccountId ? { billingAccountId: input.billingAccountId } : {}),
      ...(input.branchId ? { branchId: input.branchId } : {}),
      ...(computed.preferredChannel ? { preferredChannel: computed.preferredChannel } : {}),
      ...(computed.fallbackChannel ? { fallbackChannel: computed.fallbackChannel } : {}),
      channelPriorityOrder: computed.channelPriorityOrder,
      bestChannelByIntent: computed.bestChannelByIntent,
      metricsByChannel: computed.metricsByChannel,
      safetyFlags: computed.safetyFlags,
      evidenceSummary: computed.evidenceSummary,
      explanation: computed.explanation,
      policySnapshot: serializePolicySnapshot(mergePolicy(input.policy)),
      lastComputedAt: input.computedAt,
      metadata: input.metadata ?? {},
    };
  }

  updateContactProfile(input: {
    profileId: string;
    contactId: string;
    parentAccountId: string;
    billingAccountId?: string;
    branchId?: string;
    verificationSnapshot: ContactBehaviorProfile["verificationSnapshot"];
    events: LearningEvent[];
    feedback?: OperatorFeedback[];
    computedAt: string;
    policy?: Partial<LearningLayerPolicy>;
    metadata?: Record<string, unknown>;
    actorId?: string;
    actorRole?: "system" | "user";
    tenantId?: string;
  }): ContactBehaviorProfile {
    const computed = this.features.compute({
      events: input.events,
      ...(input.feedback ? { feedback: input.feedback } : {}),
      ...(input.policy ? { policy: input.policy } : {}),
    });

    return {
      id: input.profileId,
      ...createEntityMetadata(
        buildEntityMetadataInput(input.computedAt, input.tenantId, input.actorId, input.actorRole),
      ),
      contactId: input.contactId,
      parentAccountId: input.parentAccountId,
      ...(input.billingAccountId ? { billingAccountId: input.billingAccountId } : {}),
      ...(input.branchId ? { branchId: input.branchId } : {}),
      ...(computed.preferredChannel ? { preferredChannel: computed.preferredChannel } : {}),
      ...(computed.fallbackChannel ? { fallbackChannel: computed.fallbackChannel } : {}),
      channelPriorityOrder: computed.channelPriorityOrder,
      bestChannelByIntent: computed.bestChannelByIntent,
      metricsByChannel: computed.metricsByChannel,
      verificationSnapshot: input.verificationSnapshot,
      evidenceSummary: computed.evidenceSummary,
      explanation: computed.explanation,
      policySnapshot: serializePolicySnapshot(mergePolicy(input.policy)),
      lastComputedAt: input.computedAt,
      metadata: input.metadata ?? {},
    };
  }
}

export class DeterministicNextBestActionScoringService
  implements NextBestActionScoringService
{
  score(input: {
    scoreId: string;
    domain: NextBestActionDomain;
    parentAccountId: string;
    billingAccountId?: string;
    branchId?: string;
    contactId?: string;
    accountTier?: "standard" | "strategic";
    invoiceCount?: number;
    candidateActions: NextBestActionKind[];
    hardSafetyBlocks?: string[];
    requiresApproval?: boolean;
    accountProfile?: AccountBehaviorProfile;
    contactProfile?: ContactBehaviorProfile;
    channelBehaviorProfiles?: ChannelBehaviorProfile[];
    paymentBehaviorSnapshot?: PaymentBehaviorSnapshot;
    invoiceStates?: InvoiceState[];
    exceptionStates?: ExceptionState[];
    scoredAt: string;
    policy?: Partial<LearningLayerPolicy>;
    metadata?: Record<string, unknown>;
    actorId?: string;
    actorRole?: "system" | "user";
    tenantId?: string;
  }): NextBestActionScore {
    const policy = mergePolicy(input.policy);
    const hardSafetyBlocks = input.hardSafetyBlocks ?? [];
    const context = buildScoringContext({
      policy,
      hardSafetyBlocks,
      ...(input.accountProfile ? { accountProfile: input.accountProfile } : {}),
      ...(input.contactProfile ? { contactProfile: input.contactProfile } : {}),
      ...(input.channelBehaviorProfiles
        ? { channelBehaviorProfiles: input.channelBehaviorProfiles }
        : {}),
      ...(input.paymentBehaviorSnapshot
        ? { paymentBehaviorSnapshot: input.paymentBehaviorSnapshot }
        : {}),
      ...(input.invoiceStates ? { invoiceStates: input.invoiceStates } : {}),
      ...(input.exceptionStates ? { exceptionStates: input.exceptionStates } : {}),
      ...(input.accountTier ? { accountTier: input.accountTier } : {}),
      ...(input.invoiceCount !== undefined ? { invoiceCount: input.invoiceCount } : {}),
      requiresApproval: input.requiresApproval ?? false,
    });
    const candidateScores = input.candidateActions
      .map((action) => scoreCandidateAction(action, context))
      .sort((left, right) => right.score - left.score);
    const safeCandidate =
      candidateScores
        .filter((candidate) => !candidate.blockedBySafety)
        .sort((left, right) => right.score - left.score)[0] ??
      {
        action: "hold_for_review" as const,
        score: 0,
        blockedBySafety: false,
        reasonCodes:
          hardSafetyBlocks.length > 0 ? ["hard_safety_blocked"] : ["insufficient_learning_signal"],
        reasonSummary:
          hardSafetyBlocks.length > 0
            ? summarizeReasonCodes(["hard_safety_blocked", ...hardSafetyBlocks])
            : summarizeReasonCodes(["insufficient_learning_signal"]),
      };
    const recommendedChannel =
      channelByAction[safeCandidate.action] ??
      context.profile?.preferredChannel;
    const explanation: LearningReason[] = [
      {
        code:
          hardSafetyBlocks.length > 0 ? "hard_safety_blocked" : "candidate_action_ranked",
        summary:
          hardSafetyBlocks.length > 0
            ? `Hard safety blocks narrow recommendations to safe fallback actions: ${hardSafetyBlocks.join(", ")}.`
            : `Recommended action is ${safeCandidate.action} with score ${safeCandidate.score.toFixed(2)}.`,
      },
    ];

    return {
      id: input.scoreId,
      ...createEntityMetadata(
        buildEntityMetadataInput(input.scoredAt, input.tenantId, input.actorId, input.actorRole),
      ),
      domain: input.domain,
      parentAccountId: input.parentAccountId,
      ...(input.billingAccountId ? { billingAccountId: input.billingAccountId } : {}),
      ...(input.branchId ? { branchId: input.branchId } : {}),
      ...(input.contactId ? { contactId: input.contactId } : {}),
      recommendedAction:
        safeCandidate.action,
      ...(recommendedChannel ? { recommendedChannel } : {}),
      ...(intentByAction[safeCandidate.action]
        ? { intentType: intentByAction[safeCandidate.action] }
        : {}),
      score: safeCandidate.score,
      recommendedReasonSummary: safeCandidate.reasonSummary,
      requiresApproval: input.requiresApproval ?? false,
      hardSafetyBlocks,
      candidateScores,
      explanation,
      sourceProfileIds: {
        ...(input.accountProfile ? { accountBehaviorProfileId: input.accountProfile.id } : {}),
        ...(input.contactProfile ? { contactBehaviorProfileId: input.contactProfile.id } : {}),
      },
      policySnapshot: serializePolicySnapshot(policy),
      scoredAt: input.scoredAt,
      metadata: input.metadata ?? {},
    };
  }
}

export function buildCollectionsQueueNextBestActionHook(
  score: NextBestActionScore,
): CollectionsQueueNextBestActionHook {
  return {
    recommendedAction: score.recommendedAction,
    ...(score.recommendedChannel ? { recommendedChannel: score.recommendedChannel } : {}),
    reasonSummary: score.recommendedReasonSummary,
    requiresApproval: score.requiresApproval,
    rankedActions: score.candidateScores.map((candidate) => ({
      action: candidate.action,
      ...(candidate.channel ? { channel: candidate.channel } : {}),
      score: candidate.score,
      blockedBySafety: candidate.blockedBySafety,
      reasonSummary: candidate.reasonSummary,
    })),
  };
}

export function buildAccountWorkspaceNextBestActionHook(input: {
  score: NextBestActionScore;
  accountProfile?: AccountBehaviorProfile;
  contactProfile?: ContactBehaviorProfile;
  paymentBehaviorSnapshot?: PaymentBehaviorSnapshot;
}): AccountWorkspaceNextBestActionHook {
  const profile = input.contactProfile ?? input.accountProfile;
  const paymentBehaviorSummary = summarizePaymentBehavior(input.paymentBehaviorSnapshot);

  return {
    nextBestAction: buildCollectionsQueueNextBestActionHook(input.score),
    ...(profile?.preferredChannel ? { preferredChannel: profile.preferredChannel } : {}),
    ...(profile?.fallbackChannel ? { fallbackChannel: profile.fallbackChannel } : {}),
    bestChannelByIntent: profile?.bestChannelByIntent ?? {},
    callReadiness: determineCallReadiness(input.accountProfile, input.contactProfile),
    paymentBehaviorSummary,
  };
}

export class DeterministicOperatorFeedbackCaptureService
  implements OperatorFeedbackCaptureService
{
  constructor(
    private readonly events: LearningEventIngestionService = new DeterministicLearningEventIngestionService(),
    private readonly profiles: BehaviorProfileUpdateService = new DeterministicBehaviorProfileUpdateService(),
  ) {}

  capture(input: OperatorFeedbackCaptureInput): OperatorFeedbackCaptureResult {
    const feedback = recordOperatorFeedback({
      id: input.id,
      feedbackType: input.feedbackType,
      targetType: input.targetType,
      targetId: input.targetId,
      occurredAt: input.occurredAt,
      reasonCode: input.reasonCode,
      appliesToFutureScoring: input.appliesToFutureScoring,
      preservesSafetyRules: input.preservesSafetyRules,
      ...(input.parentAccountId ? { parentAccountId: input.parentAccountId } : {}),
      ...(input.billingAccountId ? { billingAccountId: input.billingAccountId } : {}),
      ...(input.branchId ? { branchId: input.branchId } : {}),
      ...(input.contactId ? { contactId: input.contactId } : {}),
      ...(input.linkedLearningEventId
        ? { linkedLearningEventId: input.linkedLearningEventId }
        : {}),
      ...(input.linkedNextBestActionScoreId
        ? { linkedNextBestActionScoreId: input.linkedNextBestActionScoreId }
        : {}),
      ...(input.comment ? { comment: input.comment } : {}),
      ...(input.beforePayload ? { beforePayload: input.beforePayload } : {}),
      ...(input.afterPayload ? { afterPayload: input.afterPayload } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      ...(input.actorId ? { actorId: input.actorId } : {}),
      ...(input.actorRole ? { actorRole: input.actorRole } : {}),
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    });

    const emittedEvents = [buildLearningEventFromFeedback(feedback, this.events)];
    const existingEvents = input.existingEvents ?? [];
    const existingFeedback = input.existingFeedback ?? [];
    const feedbackHistory = [...existingFeedback, feedback];
    const eventHistory = [...existingEvents, ...emittedEvents];

    const updatedAccountProfile = input.recomputeAccountProfile
      ? this.profiles.updateAccountProfile({
          profileId: input.recomputeAccountProfile.profileId,
          scope: input.recomputeAccountProfile.scope,
          scopeId: input.recomputeAccountProfile.scopeId,
          parentAccountId: input.recomputeAccountProfile.parentAccountId,
          ...(input.recomputeAccountProfile.billingAccountId
            ? { billingAccountId: input.recomputeAccountProfile.billingAccountId }
            : {}),
          ...(input.recomputeAccountProfile.branchId
            ? { branchId: input.recomputeAccountProfile.branchId }
            : {}),
          events: eventHistory,
          feedback: feedbackHistory,
          computedAt: input.occurredAt,
          ...(input.recomputeAccountProfile.metadata
            ? { metadata: input.recomputeAccountProfile.metadata }
            : {}),
          ...(input.actorId ? { actorId: input.actorId } : {}),
          ...(input.actorRole ? { actorRole: input.actorRole } : {}),
          ...(input.tenantId ? { tenantId: input.tenantId } : {}),
        })
      : undefined;

    const updatedContactProfile = input.recomputeContactProfile
      ? this.profiles.updateContactProfile({
          profileId: input.recomputeContactProfile.profileId,
          contactId: input.recomputeContactProfile.contactId,
          parentAccountId: input.recomputeContactProfile.parentAccountId,
          ...(input.recomputeContactProfile.billingAccountId
            ? { billingAccountId: input.recomputeContactProfile.billingAccountId }
            : {}),
          ...(input.recomputeContactProfile.branchId
            ? { branchId: input.recomputeContactProfile.branchId }
            : {}),
          verificationSnapshot: applyVerificationFeedback(
            input.recomputeContactProfile.verificationSnapshot,
            feedback,
          ),
          events: eventHistory,
          feedback: feedbackHistory,
          computedAt: input.occurredAt,
          ...(input.recomputeContactProfile.metadata
            ? { metadata: input.recomputeContactProfile.metadata }
            : {}),
          ...(input.actorId ? { actorId: input.actorId } : {}),
          ...(input.actorRole ? { actorRole: input.actorRole } : {}),
          ...(input.tenantId ? { tenantId: input.tenantId } : {}),
        })
      : undefined;

    return {
      feedback,
      emittedEvents,
      ...(updatedAccountProfile ? { updatedAccountProfile } : {}),
      ...(updatedContactProfile ? { updatedContactProfile } : {}),
    };
  }
}

export function recordOperatorFeedback(input: {
  id: string;
  feedbackType: OperatorFeedback["feedbackType"];
  targetType: OperatorFeedback["targetType"];
  targetId: string;
  occurredAt: string;
  reasonCode: string;
  appliesToFutureScoring: boolean;
  preservesSafetyRules: boolean;
  parentAccountId?: string;
  billingAccountId?: string;
  branchId?: string;
  contactId?: string;
  linkedLearningEventId?: string;
  linkedNextBestActionScoreId?: string;
  comment?: string;
  beforePayload?: Record<string, unknown>;
  afterPayload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  actorId?: string;
  actorRole?: "system" | "user";
  tenantId?: string;
}): OperatorFeedback {
  return {
    id: input.id,
    ...createEntityMetadata(
      buildEntityMetadataInput(input.occurredAt, input.tenantId, input.actorId, input.actorRole),
    ),
    feedbackType: input.feedbackType,
    targetType: input.targetType,
    targetId: input.targetId,
    occurredAt: input.occurredAt,
    ...(input.parentAccountId ? { parentAccountId: input.parentAccountId } : {}),
    ...(input.billingAccountId ? { billingAccountId: input.billingAccountId } : {}),
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.contactId ? { contactId: input.contactId } : {}),
    ...(input.linkedLearningEventId
      ? { linkedLearningEventId: input.linkedLearningEventId }
      : {}),
    ...(input.linkedNextBestActionScoreId
      ? { linkedNextBestActionScoreId: input.linkedNextBestActionScoreId }
      : {}),
    reasonCode: input.reasonCode,
    ...(input.comment ? { comment: input.comment } : {}),
    ...(input.beforePayload ? { beforePayload: input.beforePayload } : {}),
    ...(input.afterPayload ? { afterPayload: input.afterPayload } : {}),
    appliesToFutureScoring: input.appliesToFutureScoring,
    preservesSafetyRules: input.preservesSafetyRules,
    metadata: input.metadata ?? {},
  };
}

function mergePolicy(
  policy?: Partial<LearningLayerPolicy>,
): LearningLayerPolicy {
  const defaults = defaultLearningLayerPolicy();
  return {
    ...defaults,
    ...policy,
    channelAvailability: {
      ...defaults.channelAvailability,
      ...(policy?.channelAvailability ?? {}),
    },
    actionAdjustments: {
      ...defaults.actionAdjustments,
      ...(policy?.actionAdjustments ?? {}),
    },
    thresholds: {
      ...defaults.thresholds,
      ...(policy?.thresholds ?? {}),
    },
    scoringWeights: {
      ...defaults.scoringWeights,
      ...(policy?.scoringWeights ?? {}),
    },
  };
}

function computeMetricsByChannel(events: LearningEvent[]): ChannelMetricsMap {
  const metrics: ChannelMetricsMap = {};

  for (const channel of ["email", "sms", "call"] as const) {
    const channelEvents = events.filter((event) => event.channel === channel);
    const attempts = channelEvents.filter((event) => isAttempt(event)).length;
    const responses = channelEvents.filter((event) => isResponse(event)).length;
    const latencies = channelEvents
      .map((event) => readNumber(event.payload, "responseLatencyHours"))
      .filter((value): value is number => value !== undefined);
    const paymentConversions = channelEvents.filter((event) =>
      event.eventType === "payment_outcome_after_communication" &&
      readBoolean(event.payload, "paymentReceived") === true,
    ).length;
    const ptpCaptures = channelEvents.filter((event) =>
      readBoolean(event.payload, "ptpCaptured") === true ||
      event.eventType === "call_ptp_captured",
    ).length;
    const ptpKept = channelEvents.filter((event) =>
      readBoolean(event.payload, "ptpKept") === true,
    ).length;
    const wrongContacts = channelEvents.filter((event) =>
      event.eventType === "call_wrong_contact" ||
      readBoolean(event.payload, "wrongContact") === true,
    ).length;
    const docRequests = channelEvents.filter((event) =>
      readBoolean(event.payload, "docsRequested") === true,
    ).length;
    const optOuts = channelEvents.filter((event) =>
      event.eventType === "sms_opt_out_received" ||
      readBoolean(event.payload, "optOutReceived") === true,
    ).length;
    const connections = channelEvents.filter((event) =>
      event.eventType === "call_connected" ||
      event.communicationStatus === "connected",
    ).length;
    const voicemails = channelEvents.filter((event) =>
      event.eventType === "voicemail_left" ||
      event.communicationStatus === "voicemail_left",
    ).length;
    const rightPartyContacts = Math.max(responses + connections - wrongContacts, 0);

    metrics[channel] = {
      attempts,
      responses,
      responseRate: safeRate(responses, attempts),
      ...(latencies.length > 0
        ? {
            avgResponseLatencyHours:
              latencies.reduce((sum, value) => sum + value, 0) / latencies.length,
          }
        : {}),
      paymentConversions,
      paymentConversionRate: safeRate(paymentConversions, attempts),
      ptpCaptures,
      ptpCaptureRate: safeRate(ptpCaptures, attempts),
      ptpKept,
      ptpKeptRate: safeRate(ptpKept, Math.max(ptpCaptures, attempts)),
      wrongContacts,
      wrongContactRate: safeRate(wrongContacts, Math.max(attempts, 1)),
      docRequests,
      docRequestRate: safeRate(docRequests, Math.max(responses, attempts)),
      optOuts,
      optOutRate: safeRate(optOuts, Math.max(attempts, 1)),
      connections,
      connectRate: safeRate(connections, Math.max(attempts, 1)),
      voicemails,
      voicemailRate: safeRate(voicemails, Math.max(attempts, 1)),
      rightPartyContacts,
      rightPartyContactRate: safeRate(rightPartyContacts, Math.max(attempts, 1)),
    };
  }

  return metrics;
}

function rankChannels(
  metricsByChannel: ChannelMetricsMap,
  policy: LearningLayerPolicy,
): LearningChannel[] {
  return (["email", "sms", "call"] as const)
    .map((channel) => ({
      channel,
      score: computeChannelPreferenceScore(metricsByChannel[channel], policy),
    }))
    .sort((left, right) => right.score - left.score)
    .map((item) => item.channel);
}

function determinePreferredChannel(
  ranking: LearningChannel[],
  metricsByChannel: ChannelMetricsMap,
  policy: LearningLayerPolicy,
): LearningChannel | undefined {
  return ranking.find((channel) => {
    return (metricsByChannel[channel]?.attempts ?? 0) >= policy.minEventsForPreference;
  });
}

function computeBestChannelByIntent(
  events: LearningEvent[],
  metricsByChannel: ChannelMetricsMap,
  policy: LearningLayerPolicy,
): Partial<Record<LearningIntentType, LearningChannel>> {
  const result: Partial<Record<LearningIntentType, LearningChannel>> = {};

  for (const intent of [
    "reminder",
    "overdue_follow_up",
    "request_remittance",
    "resend_documents",
    "ptp_follow_up",
    "escalation",
    "exception_resolution",
  ] as const) {
    const perChannel = (["email", "sms", "call"] as const)
      .map((channel) => {
        const intentEvents = events.filter(
          (event) => event.channel === channel && event.intentType === intent,
        );
        const attempts = intentEvents.filter((event) => isAttempt(event)).length;
        const score =
          attempts >= policy.minEventsForIntentPreference
            ? computeChannelPreferenceScore(metricsByChannel[channel], policy)
            : -1;
        return { channel, score };
      })
      .sort((left, right) => right.score - left.score)[0];

    if (perChannel && perChannel.score >= 0) {
      result[intent] = perChannel.channel;
    }
  }

  return result;
}

function computeChannelPreferenceScore(
  metrics: LearningChannelMetrics | undefined,
  policy: LearningLayerPolicy,
): number {
  if (!metrics) {
    return 0;
  }

  return (
    metrics.responseRate * policy.scoringWeights.responseRate +
    metrics.paymentConversionRate * policy.scoringWeights.paymentConversionRate +
    metrics.ptpKeptRate * policy.scoringWeights.ptpKeptRate +
    metrics.rightPartyContactRate * policy.scoringWeights.rightPartyContactRate +
    metrics.connectRate * policy.scoringWeights.connectRate -
    metrics.wrongContactRate * policy.scoringWeights.wrongContactPenalty -
    metrics.optOutRate * policy.scoringWeights.optOutPenalty -
    metrics.voicemailRate * policy.scoringWeights.fatiguePenalty
  );
}

interface ActionScoringContext {
  profile?: AccountBehaviorProfile | ContactBehaviorProfile;
  accountProfile?: AccountBehaviorProfile;
  contactProfile?: ContactBehaviorProfile;
  channelMetricsByChannel: Partial<Record<LearningChannel, LearningChannelMetrics>>;
  channelProfilesByChannel: Partial<Record<LearningChannel, ChannelBehaviorProfile>>;
  paymentBehaviorSnapshot?: PaymentBehaviorSnapshot;
  invoiceStates: InvoiceState[];
  exceptionStates: ExceptionState[];
  hardSafetyBlocks: string[];
  requiresApproval: boolean;
  accountTier?: "standard" | "strategic";
  invoiceCount: number;
  policy: LearningLayerPolicy;
}

function buildScoringContext(input: {
  policy: LearningLayerPolicy;
  hardSafetyBlocks: string[];
  accountProfile?: AccountBehaviorProfile;
  contactProfile?: ContactBehaviorProfile;
  channelBehaviorProfiles?: ChannelBehaviorProfile[];
  paymentBehaviorSnapshot?: PaymentBehaviorSnapshot;
  invoiceStates?: InvoiceState[];
  exceptionStates?: ExceptionState[];
  requiresApproval: boolean;
  accountTier?: "standard" | "strategic";
  invoiceCount?: number;
}): ActionScoringContext {
  const profile = input.contactProfile ?? input.accountProfile;
  const channelProfilesByChannel: Partial<Record<LearningChannel, ChannelBehaviorProfile>> = {};

  for (const profileEntry of input.channelBehaviorProfiles ?? []) {
    const current = channelProfilesByChannel[profileEntry.channel];
    if (!current || current.ownerType === "account") {
      channelProfilesByChannel[profileEntry.channel] = profileEntry;
    }
  }

  const channelMetricsByChannel: Partial<Record<LearningChannel, LearningChannelMetrics>> = {
    ...(input.accountProfile?.metricsByChannel ?? {}),
    ...(input.contactProfile?.metricsByChannel ?? {}),
  };
  for (const channel of ["email", "sms", "call"] as const) {
    const directChannelProfile = channelProfilesByChannel[channel];
    if (!directChannelProfile) {
      continue;
    }

    channelMetricsByChannel[channel] = {
      attempts: directChannelProfile.evidenceCount,
      responses: Math.round(directChannelProfile.responseRate * directChannelProfile.evidenceCount),
      responseRate: directChannelProfile.responseRate,
      ...(directChannelProfile.avgResponseLatencyHours !== undefined
        ? { avgResponseLatencyHours: directChannelProfile.avgResponseLatencyHours }
        : {}),
      paymentConversions: Math.round(
        directChannelProfile.paymentConversionRate * directChannelProfile.evidenceCount,
      ),
      paymentConversionRate: directChannelProfile.paymentConversionRate,
      ptpCaptures: Math.round(directChannelProfile.ptpCaptureRate * directChannelProfile.evidenceCount),
      ptpCaptureRate: directChannelProfile.ptpCaptureRate,
      ptpKept: Math.round(directChannelProfile.ptpKeptRate * directChannelProfile.evidenceCount),
      ptpKeptRate: directChannelProfile.ptpKeptRate,
      wrongContacts: Math.round(directChannelProfile.wrongContactRate * directChannelProfile.evidenceCount),
      wrongContactRate: directChannelProfile.wrongContactRate,
      docRequests: Math.round(directChannelProfile.docRequestRate * directChannelProfile.evidenceCount),
      docRequestRate: directChannelProfile.docRequestRate,
      optOuts: Math.round(directChannelProfile.optOutRate * directChannelProfile.evidenceCount),
      optOutRate: directChannelProfile.optOutRate,
      connections: Math.round(directChannelProfile.connectRate * directChannelProfile.evidenceCount),
      connectRate: directChannelProfile.connectRate,
      voicemails: Math.round(directChannelProfile.voicemailRate * directChannelProfile.evidenceCount),
      voicemailRate: directChannelProfile.voicemailRate,
      rightPartyContacts: Math.round(
        directChannelProfile.rightPartyContactRate * directChannelProfile.evidenceCount,
      ),
      rightPartyContactRate: directChannelProfile.rightPartyContactRate,
    };
  }

  return {
    ...(profile ? { profile } : {}),
    ...(input.accountProfile ? { accountProfile: input.accountProfile } : {}),
    ...(input.contactProfile ? { contactProfile: input.contactProfile } : {}),
    channelMetricsByChannel,
    channelProfilesByChannel,
    ...(input.paymentBehaviorSnapshot
      ? { paymentBehaviorSnapshot: input.paymentBehaviorSnapshot }
      : {}),
    invoiceStates: input.invoiceStates ?? [],
    exceptionStates: input.exceptionStates ?? [],
    hardSafetyBlocks: input.hardSafetyBlocks,
    requiresApproval: input.requiresApproval,
    ...(input.accountTier ? { accountTier: input.accountTier } : {}),
    invoiceCount: input.invoiceCount ?? input.invoiceStates?.length ?? 0,
    policy: input.policy,
  };
}

function scoreCandidateAction(
  action: NextBestActionKind,
  context: ActionScoringContext,
): NextBestActionCandidateScore {
  const channel = channelByAction[action];
  const reasonCodes: string[] = [];
  const blockedReasonCodes: string[] = [];
  const channelMetrics = channel ? context.channelMetricsByChannel[channel] : undefined;
  const channelProfile = channel ? context.channelProfilesByChannel[channel] : undefined;
  const profile = context.profile;

  if (context.hardSafetyBlocks.length > 0 && !isSafeFallbackAction(action)) {
    blockedReasonCodes.push(...context.hardSafetyBlocks, "hard_safety_blocked");
  }

  if (channel === "sms" && !context.policy.channelAvailability.sms) {
    blockedReasonCodes.push("sms_recommendations_disabled");
  }

  if (channel === "call" && !context.policy.channelAvailability.call) {
    blockedReasonCodes.push("call_recommendations_disabled");
  }

  if (channel === "sms" && context.contactProfile?.verificationSnapshot.smsNumberVerified === false) {
    blockedReasonCodes.push("unverified_sms_number");
  }

  if (channel === "call" && context.contactProfile?.verificationSnapshot.phoneNumberVerified === false) {
    blockedReasonCodes.push("unverified_call_number");
  }

  if (channel === "sms" && context.accountProfile?.safetyFlags.doNotSms) {
    blockedReasonCodes.push("sms_opt_out");
  }

  if (channel === "call" && context.accountProfile?.safetyFlags.doNotCall) {
    blockedReasonCodes.push("call_blocked");
  }

  if (
    channel === "call" &&
    context.accountTier === "strategic" &&
    context.accountProfile?.safetyFlags.voiceAgentAllowed === false
  ) {
    blockedReasonCodes.push("voice_disallowed_for_strategic_account");
  }

  if (action === "place_collection_call" && hasUnresolvedException(context.exceptionStates)) {
    blockedReasonCodes.push("exception_requires_controlled_resolution");
  }

  if (blockedReasonCodes.length > 0) {
    return {
      action,
      ...(channel ? { channel } : {}),
      ...(intentByAction[action] ? { intentType: intentByAction[action] } : {}),
      score: 0,
      blockedBySafety: true,
      reasonCodes: blockedReasonCodes,
      reasonSummary: summarizeReasonCodes(blockedReasonCodes),
    };
  }

  if (!profile && !isSafeFallbackAction(action)) {
    return {
      action,
      ...(channel ? { channel } : {}),
      ...(intentByAction[action] ? { intentType: intentByAction[action] } : {}),
      score: 0,
      blockedBySafety: false,
      reasonCodes: ["missing_behavior_profile"],
      reasonSummary: summarizeReasonCodes(["missing_behavior_profile"]),
    };
  }

  let score = baseActionScore(action, context.policy);

  if (channel !== undefined) {
    score += computeChannelPreferenceScore(channelMetrics, context.policy);
  }

  if ((channelMetrics?.attempts ?? 0) < context.policy.minEventsForRecommendation && !isSafeFallbackAction(action)) {
    reasonCodes.push("insufficient_signal");
  }
  if (profile?.preferredChannel && channel === profile.preferredChannel) {
    reasonCodes.push("preferred_channel_match");
    score += 0.12;
  }
  if (
    profile?.bestChannelByIntent[intentByAction[action] ?? "reminder"] === channel &&
    channel !== undefined
  ) {
    reasonCodes.push("best_channel_for_intent");
    score += 0.16;
  }

  if (channel === "email") {
    reasonCodes.push("email_first_default");
    score += context.policy.actionAdjustments.emailFirstBonus;
  }

  if (action === "escalate_to_owner" && context.accountTier === "strategic") {
    reasonCodes.push("strategic_account_owner_escalation");
    score += 0.18;
  }
  if (action === "escalate_to_owner" && context.requiresApproval) {
    reasonCodes.push("approval_or_owner_alignment_needed");
    score += context.policy.actionAdjustments.ownerEscalationBonus;
  }

  applyInvoiceStateAdjustments(action, context, reasonCodes, (value) => {
    score += value;
  });
  applyExceptionAdjustments(action, context, reasonCodes, (value) => {
    score += value;
  });
  applyPaymentBehaviorAdjustments(action, context, reasonCodes, (value) => {
    score += value;
  });
  applyChannelBehaviorAdjustments(action, channelProfile, channelMetrics, context, reasonCodes, (value) => {
    score += value;
  });

  const safeScore = roundScore(score);

  if (safeScore <= 0 && action === "hold_for_review") {
    reasonCodes.push("safe_manual_fallback");
  }

  return {
    action,
    ...(channel ? { channel } : {}),
    ...(intentByAction[action] ? { intentType: intentByAction[action] } : {}),
    score: safeScore,
    blockedBySafety: false,
    reasonCodes,
    reasonSummary: summarizeReasonCodes(reasonCodes),
  };
}

function isSafeFallbackAction(action: NextBestActionKind): boolean {
  return action === "hold_for_review" || action === "route_to_exception" || action === "escalate_to_owner";
}

function baseActionScore(action: NextBestActionKind, policy: LearningLayerPolicy): number {
  switch (action) {
    case "hold_for_review":
      return policy.actionAdjustments.holdForReviewBase;
    case "route_to_exception":
      return 0.15;
    case "escalate_to_owner":
      return 0.1;
    case "send_email_grouped_reminder":
      return 0.28 + policy.actionAdjustments.groupedReminderBonus;
    case "send_email_invoice_level_reminder":
      return 0.25 + policy.actionAdjustments.invoiceLevelReminderBonus;
    case "send_email_resend_bundle":
      return 0.24;
    case "request_remittance_via_email":
      return 0.2;
    case "follow_up_ptp_via_email":
      return 0.18 + policy.actionAdjustments.ptpFollowupBonus;
    case "send_sms_reminder":
      return 0.18;
    case "send_sms_ptp_followup":
      return 0.15 + policy.actionAdjustments.ptpFollowupBonus;
    case "place_collection_call":
      return 0.14;
    case "place_manual_review_call":
      return 0.16;
    default:
      return 0;
  }
}

function applyInvoiceStateAdjustments(
  action: NextBestActionKind,
  context: ActionScoringContext,
  reasonCodes: string[],
  adjust: (value: number) => void,
): void {
  const states = new Set(context.invoiceStates);
  if (states.size === 0) {
    return;
  }

  if (context.invoiceCount > 1 && action === "send_email_grouped_reminder") {
    reasonCodes.push("multiple_invoices_grouped");
    adjust(0.08);
  }
  if (context.invoiceCount <= 1 && action === "send_email_invoice_level_reminder") {
    reasonCodes.push("single_invoice_precision");
    adjust(0.1);
  }
  if (states.has("disputed_full")) {
    if (action === "route_to_exception" || action === "hold_for_review") {
      reasonCodes.push("full_dispute_requires_exception_flow");
      adjust(0.4);
    }
    if (action === "escalate_to_owner") {
      adjust(0.12);
    }
  }
  if (states.has("disputed_partial")) {
    if (action === "hold_for_review") {
      reasonCodes.push("partial_dispute_requires_controlled_followup");
      adjust(0.18);
    }
  }
  if (
    states.has("uploaded_unmatched") ||
    states.has("credit_pending") ||
    states.has("writeback_failed")
  ) {
    if (action === "route_to_exception") {
      reasonCodes.push("invoice_state_requires_exception");
      adjust(0.3);
    }
    if (action === "hold_for_review") {
      adjust(0.16);
    }
  }
}

function applyExceptionAdjustments(
  action: NextBestActionKind,
  context: ActionScoringContext,
  reasonCodes: string[],
  adjust: (value: number) => void,
): void {
  if (!hasUnresolvedException(context.exceptionStates)) {
    return;
  }

  if (action === "route_to_exception") {
    reasonCodes.push("open_exception_present");
    adjust(context.policy.actionAdjustments.exceptionRoutingBonus);
  }
  if (action === "hold_for_review") {
    reasonCodes.push("exception_needs_operator_control");
    adjust(0.18);
  }
  if (action === "place_manual_review_call" && context.policy.channelAvailability.call) {
    reasonCodes.push("manual_call_for_exception_resolution");
    adjust(0.22);
  }
  if (action === "escalate_to_owner" && context.requiresApproval) {
    reasonCodes.push("approval_or_owner_alignment_needed");
    adjust(context.policy.actionAdjustments.ownerEscalationBonus);
  }
  if (action === "escalate_to_owner" && context.accountTier === "strategic") {
    reasonCodes.push("strategic_account_owner_escalation");
    adjust(0.16);
  }
}

function applyPaymentBehaviorAdjustments(
  action: NextBestActionKind,
  context: ActionScoringContext,
  reasonCodes: string[],
  adjust: (value: number) => void,
): void {
  const snapshot = context.paymentBehaviorSnapshot;
  if (!snapshot) {
    return;
  }

  const centralizedPayer =
    snapshot.centralizedPayer === true &&
    (snapshot.centralizedPayerConfidence ?? 1) >= context.policy.thresholds.centralizedPayerConfidence;
  if (centralizedPayer) {
    if (action === "send_email_grouped_reminder" || action === "request_remittance_via_email") {
      reasonCodes.push("centralized_payer_behavior");
      adjust(context.policy.actionAdjustments.centralizedPayerBonus);
    }
    if (action === "send_email_invoice_level_reminder") {
      adjust(-0.1);
    }
    if (action === "place_collection_call") {
      adjust(-0.08);
    }
  }

  const highDocRequirement =
    snapshot.highDocumentRequirement === true ||
    (snapshot.documentRequirementRate ?? 0) >= context.policy.thresholds.highDocumentRequirementRate;
  if (highDocRequirement) {
    if (action === "send_email_resend_bundle") {
      reasonCodes.push("customer_often_requires_supporting_docs");
      adjust(context.policy.actionAdjustments.highDocRequirementBonus);
    }
    if (action === "request_remittance_via_email") {
      adjust(0.08);
    }
    if (action === "send_email_grouped_reminder" || action === "send_email_invoice_level_reminder") {
      adjust(-0.06);
    }
  }

  if (snapshot.resendBeforePayLikely === true && action === "send_email_resend_bundle") {
    reasonCodes.push("resend_precedes_payment");
    adjust(context.policy.actionAdjustments.resendBeforePayBonus);
  }

  const unreliablePtp =
    snapshot.unreliablePromiseToPay === true ||
    (snapshot.ptpKeptRate !== undefined &&
      snapshot.ptpKeptRate < context.policy.thresholds.unreliablePtpKeptRate);
  if (unreliablePtp) {
    if (action === "follow_up_ptp_via_email" || action === "send_sms_ptp_followup") {
      reasonCodes.push("ptp_reliability_low");
      adjust(-context.policy.actionAdjustments.unreliablePtpPenalty);
    }
    if (action === "hold_for_review") {
      adjust(0.14);
    }
  }
}

function applyChannelBehaviorAdjustments(
  action: NextBestActionKind,
  channelProfile: ChannelBehaviorProfile | undefined,
  channelMetrics: LearningChannelMetrics | undefined,
  context: ActionScoringContext,
  reasonCodes: string[],
  adjust: (value: number) => void,
): void {
  if (!channelMetrics) {
    return;
  }

  if (
    channelMetrics.wrongContactRate >= context.policy.thresholds.highWrongContactRate ||
    (channelProfile?.wrongContactRate ?? 0) >= context.policy.thresholds.highWrongContactRate
  ) {
    if (action === "route_to_exception" || action === "hold_for_review") {
      reasonCodes.push("high_wrong_contact_risk");
      adjust(0.22);
    }
    if (action === "place_collection_call" || action === "send_sms_reminder") {
      adjust(-context.policy.actionAdjustments.highWrongContactPenalty);
    }
  }

  if (
    (action === "send_email_resend_bundle" || action === "request_remittance_via_email") &&
    channelMetrics.docRequestRate >= context.policy.thresholds.highDocumentRequirementRate
  ) {
    reasonCodes.push("channel_history_shows_doc_requests");
    adjust(0.12);
  }

  if (action === "place_collection_call" && channelMetrics.connectRate >= 0.55) {
    reasonCodes.push("high_call_connect_rate");
    adjust(0.18);
  }

  if (
    (action === "send_sms_reminder" || action === "send_sms_ptp_followup") &&
    channelMetrics.responseRate >= 0.6
  ) {
    reasonCodes.push("strong_sms_response_rate");
    adjust(0.18);
  }
}

function summarizeReasonCodes(reasonCodes: string[]): string {
  const priority = new Map<string, number>([
    ["hard_safety_blocked", 100],
    ["voice_disallowed_for_strategic_account", 95],
    ["sms_opt_out", 95],
    ["unverified_sms_number", 95],
    ["unverified_call_number", 95],
    ["full_dispute_requires_exception_flow", 90],
    ["open_exception_present", 88],
    ["high_wrong_contact_risk", 86],
    ["customer_often_requires_supporting_docs", 84],
    ["resend_precedes_payment", 82],
    ["centralized_payer_behavior", 80],
    ["ptp_reliability_low", 78],
    ["best_channel_for_intent", 76],
    ["preferred_channel_match", 74],
    ["manual_call_for_exception_resolution", 72],
    ["approval_or_owner_alignment_needed", 70],
    ["strategic_account_owner_escalation", 68],
    ["multiple_invoices_grouped", 66],
    ["single_invoice_precision", 64],
    ["email_first_default", 30],
    ["insufficient_signal", 20],
    ["safe_manual_fallback", 10],
  ]);
  const ordered = [...new Set(reasonCodes)].sort(
    (left, right) => (priority.get(right) ?? 0) - (priority.get(left) ?? 0),
  );
  if (ordered.length === 0) {
    return "Score is neutral because the action has limited direct evidence.";
  }

  return ordered
    .slice(0, 2)
    .map((code) => {
      switch (code) {
        case "hard_safety_blocked":
          return "Hard policy blocks keep this path manual";
        case "sms_recommendations_disabled":
          return "SMS stays disabled under email-first MVP policy";
        case "call_recommendations_disabled":
          return "Call stays disabled until voice policy is enabled";
        case "unverified_sms_number":
          return "SMS is blocked because the number is unverified";
        case "unverified_call_number":
          return "Call is blocked because the phone number is unverified";
        case "sms_opt_out":
          return "SMS is blocked by opt-out history";
        case "call_blocked":
          return "Call is blocked by account-level safety controls";
        case "voice_disallowed_for_strategic_account":
          return "Strategic account policy disallows voice automation";
        case "exception_requires_controlled_resolution":
          return "Open exceptions require controlled resolution first";
        case "missing_behavior_profile":
          return "Behavior memory is thin, so no proactive action is favored";
        case "insufficient_signal":
          return "Learning signal is still limited";
        case "preferred_channel_match":
          return "This matches the learned preferred channel";
        case "best_channel_for_intent":
          return "This channel performs best for the current intent";
        case "email_first_default":
          return "Email keeps the default MVP preference";
        case "multiple_invoices_grouped":
          return "Grouped outreach fits the current invoice set";
        case "single_invoice_precision":
          return "A single invoice favors invoice-level outreach";
        case "full_dispute_requires_exception_flow":
          return "Full disputes should route through exception handling";
        case "partial_dispute_requires_controlled_followup":
          return "Partial disputes still need controlled follow-up";
        case "invoice_state_requires_exception":
          return "Current invoice state favors exception routing";
        case "open_exception_present":
          return "An active exception already exists on this account";
        case "exception_needs_operator_control":
          return "Operator control is safer than fresh outreach";
        case "manual_call_for_exception_resolution":
          return "A manual review call could help resolve the exception";
        case "approval_or_owner_alignment_needed":
          return "Owner alignment is needed before actioning";
        case "strategic_account_owner_escalation":
          return "Strategic accounts favor owner-led review";
        case "centralized_payer_behavior":
          return "Past payments point to a centralized payer flow";
        case "customer_often_requires_supporting_docs":
          return "This customer often needs supporting documents first";
        case "resend_precedes_payment":
          return "Resending documents often leads payment here";
        case "ptp_reliability_low":
          return "Promise-to-pay follow-up is unreliable for this customer";
        case "high_wrong_contact_risk":
          return "Wrong-contact risk is elevated on this account";
        case "channel_history_shows_doc_requests":
          return "Channel history shows repeated document requests";
        case "high_call_connect_rate":
          return "Calls connect reliably when review allows them";
        case "strong_sms_response_rate":
          return "SMS gets fast responses for this contact";
        case "safe_manual_fallback":
          return "Manual review remains the safest fallback";
        default:
          return code.replaceAll("_", " ");
      }
    })
    .join(". ") + ".";
}

function summarizePaymentBehavior(
  snapshot?: PaymentBehaviorSnapshot,
): string[] {
  if (!snapshot) {
    return [];
  }

  const summaries: string[] = [];
  if (snapshot.centralizedPayer) {
    summaries.push("Centralized payer behavior is active.");
  }
  if (snapshot.highDocumentRequirement) {
    summaries.push("Supporting documents are often required before payment.");
  }
  if (snapshot.resendBeforePayLikely) {
    summaries.push("Resend-before-pay behavior is common.");
  }
  if (snapshot.unreliablePromiseToPay) {
    summaries.push("Promise-to-pay outcomes are unreliable.");
  }

  return summaries;
}

function determineCallReadiness(
  accountProfile?: AccountBehaviorProfile,
  contactProfile?: ContactBehaviorProfile,
): "ready" | "manual_only" | "blocked" {
  if (accountProfile?.safetyFlags.doNotCall) {
    return "blocked";
  }
  if (contactProfile?.verificationSnapshot.phoneNumberVerified === false) {
    return "blocked";
  }
  if (accountProfile?.safetyFlags.voiceAgentAllowed === false) {
    return "manual_only";
  }
  return "ready";
}

function hasUnresolvedException(states: ExceptionState[]): boolean {
  return states.some((state) => state !== "resolved" && state !== "dismissed");
}

function roundScore(value: number): number {
  return Math.max(0, Number(value.toFixed(3)));
}

function buildLearningEventFromFeedback(
  feedback: OperatorFeedback,
  events: LearningEventIngestionService,
): LearningEvent {
  const eventType = mapFeedbackTypeToEventType(feedback.feedbackType);
  const channel =
    readLearningChannel(feedback.afterPayload?.channel) ??
    readLearningChannel(feedback.beforePayload?.channel) ??
    readLearningChannel(feedback.afterPayload?.preferredChannel) ??
    readLearningChannel(feedback.beforePayload?.preferredChannel);
  const intentType = inferIntentTypeFromFeedback(feedback);
  const communicationStatus = inferCommunicationStatusFromFeedback(feedback);
  const explanation = [
    {
      code: feedback.reasonCode,
      summary: summarizeFeedbackReason(feedback),
      evidence: {
        feedbackType: feedback.feedbackType,
        targetType: feedback.targetType,
        targetId: feedback.targetId,
      },
    },
  ];
  const payload: Record<string, unknown> = {
    feedbackType: feedback.feedbackType,
    targetType: feedback.targetType,
    targetId: feedback.targetId,
    ...(feedback.beforePayload ? { originalValue: feedback.beforePayload } : {}),
    ...(feedback.afterPayload ? { correctedValue: feedback.afterPayload } : {}),
    ...(feedback.comment ? { comment: feedback.comment } : {}),
  };

  if (feedback.feedbackType === "doc_bundle_changed") {
    payload.docsRequested = true;
  }
  if (feedback.feedbackType === "contact_override") {
    payload.wrongContact =
      readBoolean(feedback.afterPayload ?? {}, "wrongContact") ??
      readBoolean(feedback.beforePayload ?? {}, "wrongContact") ??
      false;
  }
  if (feedback.feedbackType === "ptp_reclassified") {
    payload.ptpCaptured = readBoolean(feedback.afterPayload ?? {}, "ptpCaptured") ?? false;
    payload.ptpKept = readBoolean(feedback.afterPayload ?? {}, "ptpKept") ?? false;
  }
  if (feedback.feedbackType === "resend_blocked") {
    payload.resendBlocked = true;
  }
  if (feedback.feedbackType === "approval_rejected") {
    payload.approvalRejected = true;
  }

  const paymentId = extractLinkedId(feedback, "paymentId");
  const remittanceId = extractLinkedId(feedback, "remittanceId");
  const promiseToPayId = extractLinkedId(feedback, "promiseToPayId");
  const exceptionId = extractLinkedId(feedback, "exceptionId");
  const approvalRequestId = extractLinkedId(feedback, "approvalRequestId");

  return events.ingest({
    id: `${feedback.id}_event`,
    parentAccountId: feedback.parentAccountId ?? "operator_feedback_unscoped",
    ...(feedback.billingAccountId ? { billingAccountId: feedback.billingAccountId } : {}),
    ...(feedback.branchId ? { branchId: feedback.branchId } : {}),
    ...(feedback.contactId ? { contactId: feedback.contactId } : {}),
    occurredAt: feedback.occurredAt,
    sourceSystem: "operator",
    eventType,
    sourceEventId: feedback.id,
    ...(channel ? { channel } : {}),
    ...(intentType ? { intentType } : {}),
    ...(communicationStatus ? { communicationStatus } : {}),
    relatedEntityType: feedback.targetType,
    relatedEntityId: feedback.targetId,
    invoiceIds: extractInvoiceIdsFromFeedback(feedback),
    ...(paymentId ? { paymentId } : {}),
    ...(remittanceId ? { remittanceId } : {}),
    ...(promiseToPayId ? { promiseToPayId } : {}),
    ...(exceptionId ? { exceptionId } : {}),
    ...(approvalRequestId ? { approvalRequestId } : {}),
    explanation,
    payload,
    reversible: true,
    metadata: feedback.metadata,
    ...(feedback.tenantId ? { tenantId: feedback.tenantId } : {}),
    ...(feedback.updatedByActorId ? { actorId: feedback.updatedByActorId } : {}),
    ...(feedback.updatedByActorRole === "system" || feedback.updatedByActorRole === "user"
      ? { actorRole: feedback.updatedByActorRole }
      : {}),
  });
}

function mapFeedbackTypeToEventType(
  feedbackType: OperatorFeedback["feedbackType"],
): LearningEventType {
  switch (feedbackType) {
    case "contact_override":
      return "operator_contact_overridden";
    case "message_edit":
      return "operator_message_edited";
    case "match_rejected":
      return "operator_match_rejected";
    case "match_corrected":
      return "operator_match_corrected";
    case "exception_retyped":
      return "operator_exception_retyped";
    case "doc_bundle_changed":
      return "operator_doc_bundle_changed";
    case "routing_changed":
      return "operator_routing_changed";
    case "ptp_reclassified":
      return "operator_ptp_reclassified";
    case "resend_blocked":
      return "operator_resend_blocked";
    case "approval_rejected":
      return "operator_approval_rejected";
    case "confirm":
    case "correct":
    case "override":
    case "reject":
      return "operator_routing_changed";
  }
}

function applyVerificationFeedback(
  snapshot: ContactBehaviorProfile["verificationSnapshot"],
  feedback: OperatorFeedback,
): ContactBehaviorProfile["verificationSnapshot"] {
  return {
    emailVerified:
      readBoolean(feedback.afterPayload ?? {}, "emailVerified") ?? snapshot.emailVerified,
    smsNumberVerified:
      readBoolean(feedback.afterPayload ?? {}, "smsNumberVerified") ??
      snapshot.smsNumberVerified,
    phoneNumberVerified:
      readBoolean(feedback.afterPayload ?? {}, "phoneNumberVerified") ??
      snapshot.phoneNumberVerified,
  };
}

function inferIntentTypeFromFeedback(
  feedback: OperatorFeedback,
): LearningIntentType | undefined {
  const explicit =
    readLearningIntentType(feedback.afterPayload?.intentType) ??
    readLearningIntentType(feedback.beforePayload?.intentType);
  if (explicit) {
    return explicit;
  }

  switch (feedback.feedbackType) {
    case "message_edit":
    case "doc_bundle_changed":
    case "resend_blocked":
      return "resend_documents";
    case "ptp_reclassified":
      return "ptp_follow_up";
    case "approval_rejected":
    case "routing_changed":
      return "escalation";
    case "exception_retyped":
      return "exception_resolution";
    case "contact_override":
      return "reminder";
    default:
      return undefined;
  }
}

function inferCommunicationStatusFromFeedback(
  feedback: OperatorFeedback,
): LearningEvent["communicationStatus"] | undefined {
  if (feedback.feedbackType === "approval_rejected" || feedback.feedbackType === "resend_blocked") {
    return "blocked";
  }
  return undefined;
}

function summarizeFeedbackReason(feedback: OperatorFeedback): string {
  switch (feedback.feedbackType) {
    case "contact_override":
      return "Operator corrected the contact or recipient routing details.";
    case "message_edit":
      return "Operator edited message content before customer outreach.";
    case "match_rejected":
      return "Operator rejected a proposed cash-application match.";
    case "match_corrected":
      return "Operator corrected a cash-application match outcome.";
    case "exception_retyped":
      return "Operator retyped the exception for more accurate downstream handling.";
    case "doc_bundle_changed":
      return "Operator changed the document bundle requested or sent to the customer.";
    case "routing_changed":
      return "Operator changed the communication or account routing path.";
    case "ptp_reclassified":
      return "Operator reclassified the promise-to-pay outcome.";
    case "resend_blocked":
      return "Operator blocked document resend to preserve safety and review controls.";
    case "approval_rejected":
      return "Operator or approver rejected the approval outcome.";
    case "confirm":
      return "Operator confirmed the current system assessment.";
    case "correct":
      return "Operator corrected the current system assessment.";
    case "override":
      return "Operator overrode the current system recommendation.";
    case "reject":
      return "Operator rejected the current system recommendation.";
  }
}

function extractInvoiceIdsFromFeedback(feedback: OperatorFeedback): string[] {
  const candidates = [feedback.afterPayload?.invoiceIds, feedback.beforePayload?.invoiceIds];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((value): value is string => typeof value === "string");
    }
  }
  return [];
}

function extractLinkedId(
  feedback: OperatorFeedback,
  field:
    | "paymentId"
    | "remittanceId"
    | "promiseToPayId"
    | "exceptionId"
    | "approvalRequestId",
): string | undefined {
  const value = feedback.afterPayload?.[field] ?? feedback.beforePayload?.[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function extractOperatorChannelPreference(
  feedback: OperatorFeedback[],
  field: "preferredChannel" | "fallbackChannel",
): LearningChannel | undefined {
  const latest = [...feedback]
    .reverse()
    .find((entry) => entry.appliesToFutureScoring && entry.afterPayload?.[field]);
  const value = latest?.afterPayload?.[field];
  if (value === "email" || value === "sms" || value === "call") {
    return value;
  }
  return undefined;
}

function extractBooleanFeedback(
  feedback: OperatorFeedback[],
  field: string,
): boolean {
  return [...feedback].reverse().some((entry) => entry.afterPayload?.[field] === true);
}

function readLearningChannel(value: unknown): LearningChannel | undefined {
  return value === "email" || value === "sms" || value === "call" ? value : undefined;
}

function readLearningIntentType(value: unknown): LearningIntentType | undefined {
  return value === "reminder" ||
    value === "overdue_follow_up" ||
    value === "request_remittance" ||
    value === "resend_documents" ||
    value === "ptp_follow_up" ||
    value === "escalation" ||
    value === "exception_resolution"
    ? value
    : undefined;
}

function isAttempt(event: LearningEvent): boolean {
  return (
    event.direction === "outbound" ||
    event.eventType === "communication_attempt_created" ||
    event.eventType.endsWith("_sent") ||
    event.eventType === "call_placed"
  );
}

function isResponse(event: LearningEvent): boolean {
  return (
    event.eventType === "customer_response_received" ||
    event.eventType.endsWith("_replied") ||
    event.communicationStatus === "replied"
  );
}

function safeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function readString(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringArray(
  payload: Record<string, unknown>,
  key: string,
): string[] {
  const value = payload[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function readNumber(
  payload: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = payload[key];
  return typeof value === "number" ? value : undefined;
}

function readBoolean(
  payload: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = payload[key];
  return typeof value === "boolean" ? value : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function modeNumber(values: number[], minimumOccurrences: number): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0]);
  const [value, occurrences] = ranked[0] ?? [];
  return value !== undefined && occurrences !== undefined && occurrences >= minimumOccurrences
    ? value
    : undefined;
}

function buildEntityMetadataInput(
  at: string,
  tenantId?: string,
  actorId?: string,
  actorRole?: "system" | "user",
): {
  at: string;
  tenantId?: string;
  actorId?: string;
  actorRole?: "system" | "user";
} {
  return {
    at,
    ...(tenantId ? { tenantId } : {}),
    ...(actorId ? { actorId } : {}),
    ...(actorRole ? { actorRole } : {}),
  };
}

function serializePolicySnapshot(
  policy: LearningLayerPolicy,
): Record<string, unknown> {
  return {
    lookbackWindowDays: policy.lookbackWindowDays,
    minEventsForPreference: policy.minEventsForPreference,
    minEventsForIntentPreference: policy.minEventsForIntentPreference,
    minEventsForRecommendation: policy.minEventsForRecommendation,
    scoringWeights: {
      responseRate: policy.scoringWeights.responseRate,
      paymentConversionRate: policy.scoringWeights.paymentConversionRate,
      ptpKeptRate: policy.scoringWeights.ptpKeptRate,
      rightPartyContactRate: policy.scoringWeights.rightPartyContactRate,
      connectRate: policy.scoringWeights.connectRate,
      wrongContactPenalty: policy.scoringWeights.wrongContactPenalty,
      optOutPenalty: policy.scoringWeights.optOutPenalty,
      fatiguePenalty: policy.scoringWeights.fatiguePenalty,
    },
  };
}
