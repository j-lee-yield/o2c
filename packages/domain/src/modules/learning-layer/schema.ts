import type { DomainEntity } from "../../shared/types.js";

export const learningChannels = ["email", "sms", "call"] as const;
export type LearningChannel = (typeof learningChannels)[number];

export const learningProviders = [
  "internal",
  "gmail",
  "microsoft_graph",
  "smtp",
  "transactional",
  "twilio",
  "vapi",
  "retell",
  "elevenlabs",
  "other",
] as const;
export type LearningProvider = (typeof learningProviders)[number];

export const learningDirections = ["outbound", "inbound"] as const;
export type LearningDirection = (typeof learningDirections)[number];

export const learningIntentTypes = [
  "reminder",
  "overdue_follow_up",
  "request_remittance",
  "resend_documents",
  "ptp_follow_up",
  "escalation",
  "exception_resolution",
] as const;
export type LearningIntentType = (typeof learningIntentTypes)[number];

export const learningCommunicationStatuses = [
  "queued",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "replied",
  "failed",
  "bounced",
  "connected",
  "missed",
  "voicemail_left",
  "completed",
  "blocked",
] as const;
export type LearningCommunicationStatus =
  (typeof learningCommunicationStatuses)[number];

export const learningEventTypes = [
  "communication_attempt_created",
  "communication_blocked",
  "communication_completed",
  "customer_response_received",
  "payment_outcome_after_communication",
  "approval_requested",
  "approval_approved",
  "approval_rejected",
  "remittance_received",
  "remittance_parsed",
  "remittance_linked",
  "remittance_review_required",
  "remittance_resolved",
  "remittance_orphaned",
  "payment_candidate_match_found",
  "payment_review_required",
  "payment_auto_applied",
  "email_sent",
  "email_delivered",
  "email_opened",
  "email_replied",
  "email_bounced",
  "email_link_clicked",
  "invoice_bundle_resent",
  "sms_sent",
  "sms_delivered",
  "sms_failed",
  "sms_replied",
  "sms_link_clicked",
  "sms_opt_out_received",
  "call_placed",
  "call_connected",
  "call_failed",
  "call_missed",
  "voicemail_left",
  "call_disposition_logged",
  "call_transcript_ingested",
  "call_ptp_captured",
  "call_wrong_contact",
  "callback_requested",
  "operator_contact_overridden",
  "operator_message_edited",
  "operator_match_rejected",
  "operator_match_corrected",
  "operator_exception_retyped",
  "operator_doc_bundle_changed",
  "operator_routing_changed",
  "operator_ptp_reclassified",
  "operator_resend_blocked",
  "operator_approval_rejected",
] as const;
export type LearningEventType = (typeof learningEventTypes)[number];

export const behaviorProfileScopes = [
  "parent_account",
  "billing_account",
  "branch",
] as const;
export type BehaviorProfileScope = (typeof behaviorProfileScopes)[number];

export const operatorFeedbackTypes = [
  "confirm",
  "correct",
  "override",
  "reject",
  "contact_override",
  "message_edit",
  "match_rejected",
  "match_corrected",
  "exception_retyped",
  "doc_bundle_changed",
  "routing_changed",
  "ptp_reclassified",
  "resend_blocked",
  "approval_rejected",
] as const;
export type OperatorFeedbackType = (typeof operatorFeedbackTypes)[number];

export const operatorFeedbackTargets = [
  "learning_event",
  "account_behavior_profile",
  "contact_behavior_profile",
  "next_best_action_score",
  "collections_action",
  "cash_application_decision",
  "contact",
  "message",
  "payment_match",
  "exception",
  "document_bundle",
  "routing_decision",
  "promise_to_pay",
  "resend_decision",
  "approval_request",
] as const;
export type OperatorFeedbackTarget = (typeof operatorFeedbackTargets)[number];

export const nextBestActionDomains = [
  "collections",
  "cash_application",
] as const;
export type NextBestActionDomain = (typeof nextBestActionDomains)[number];

export const nextBestActionKinds = [
  "send_email_grouped_reminder",
  "send_email_invoice_level_reminder",
  "send_sms_reminder",
  "send_sms_ptp_followup",
  "place_collection_call",
  "place_manual_review_call",
  "send_email_resend_bundle",
  "send_sms_payment_link_or_prompt",
  "request_remittance_via_email",
  "request_remittance_via_sms",
  "follow_up_ptp_via_email",
  "follow_up_ptp_via_sms",
  "escalate_to_owner",
  "route_to_exception",
  "hold_for_review",
] as const;
export type NextBestActionKind = (typeof nextBestActionKinds)[number];

export interface LearningReason {
  code: string;
  summary: string;
  evidence?: Record<string, unknown>;
}

export interface LearningChannelMetrics {
  attempts: number;
  responses: number;
  responseRate: number;
  avgResponseLatencyHours?: number;
  paymentConversions: number;
  paymentConversionRate: number;
  ptpCaptures: number;
  ptpCaptureRate: number;
  ptpKept: number;
  ptpKeptRate: number;
  wrongContacts: number;
  wrongContactRate: number;
  docRequests: number;
  docRequestRate: number;
  optOuts: number;
  optOutRate: number;
  connections: number;
  connectRate: number;
  voicemails: number;
  voicemailRate: number;
  rightPartyContacts: number;
  rightPartyContactRate: number;
}

export interface LearningEvidenceSummary {
  eventCount: number;
  feedbackCount: number;
  lastEventAt?: string;
  lookbackWindowDays: number;
}

export interface LearningEvent extends DomainEntity {
  parentAccountId: string;
  billingAccountId?: string;
  branchId?: string;
  contactId?: string;
  eventType: LearningEventType;
  sourceSystem:
    | "collections"
    | "cash_application"
    | "remittance"
    | "approvals"
    | "operator"
    | "workflow_engine"
    | "email_provider"
    | "sms_provider"
    | "voice_provider"
    | "erp";
  sourceEventId?: string;
  occurredAt: string;
  channel?: LearningChannel;
  provider?: LearningProvider;
  direction?: LearningDirection;
  intentType?: LearningIntentType;
  communicationStatus?: LearningCommunicationStatus;
  relatedEntityType?: string;
  relatedEntityId?: string;
  invoiceIds: string[];
  paymentId?: string;
  remittanceId?: string;
  promiseToPayId?: string;
  exceptionId?: string;
  approvalRequestId?: string;
  explanation: LearningReason[];
  payload: Record<string, unknown>;
  reversible: boolean;
  reversedAt?: string;
  reversalReason?: string;
  metadata: Record<string, unknown>;
}

export interface AccountBehaviorProfile extends DomainEntity {
  scope: BehaviorProfileScope;
  scopeId: string;
  parentAccountId: string;
  billingAccountId?: string;
  branchId?: string;
  preferredChannel?: LearningChannel;
  fallbackChannel?: LearningChannel;
  channelPriorityOrder: LearningChannel[];
  bestChannelByIntent: Partial<Record<LearningIntentType, LearningChannel>>;
  metricsByChannel: Partial<Record<LearningChannel, LearningChannelMetrics>>;
  safetyFlags: {
    doNotSms: boolean;
    doNotCall: boolean;
    voiceAgentAllowed: boolean;
  };
  evidenceSummary: LearningEvidenceSummary;
  explanation: LearningReason[];
  policySnapshot: Record<string, unknown>;
  lastComputedAt: string;
  metadata: Record<string, unknown>;
}

export interface ContactBehaviorProfile extends DomainEntity {
  contactId: string;
  parentAccountId: string;
  billingAccountId?: string;
  branchId?: string;
  preferredChannel?: LearningChannel;
  fallbackChannel?: LearningChannel;
  channelPriorityOrder: LearningChannel[];
  bestChannelByIntent: Partial<Record<LearningIntentType, LearningChannel>>;
  metricsByChannel: Partial<Record<LearningChannel, LearningChannelMetrics>>;
  verificationSnapshot: {
    emailVerified: boolean;
    smsNumberVerified: boolean;
    phoneNumberVerified: boolean;
  };
  evidenceSummary: LearningEvidenceSummary;
  explanation: LearningReason[];
  policySnapshot: Record<string, unknown>;
  lastComputedAt: string;
  metadata: Record<string, unknown>;
}

export interface OperatorFeedback extends DomainEntity {
  feedbackType: OperatorFeedbackType;
  targetType: OperatorFeedbackTarget;
  targetId: string;
  occurredAt: string;
  parentAccountId?: string;
  billingAccountId?: string;
  branchId?: string;
  contactId?: string;
  linkedLearningEventId?: string;
  linkedNextBestActionScoreId?: string;
  reasonCode: string;
  comment?: string;
  beforePayload?: Record<string, unknown>;
  afterPayload?: Record<string, unknown>;
  appliesToFutureScoring: boolean;
  preservesSafetyRules: boolean;
  metadata: Record<string, unknown>;
}

export interface NextBestActionCandidateScore {
  action: NextBestActionKind;
  channel?: LearningChannel;
  intentType?: LearningIntentType;
  score: number;
  blockedBySafety: boolean;
  reasonCodes: string[];
  reasonSummary: string;
}

export interface NextBestActionScore extends DomainEntity {
  domain: NextBestActionDomain;
  parentAccountId: string;
  billingAccountId?: string;
  branchId?: string;
  contactId?: string;
  recommendedAction: NextBestActionKind;
  recommendedChannel?: LearningChannel;
  intentType?: LearningIntentType;
  score: number;
  recommendedReasonSummary: string;
  requiresApproval: boolean;
  hardSafetyBlocks: string[];
  candidateScores: NextBestActionCandidateScore[];
  explanation: LearningReason[];
  sourceProfileIds: {
    accountBehaviorProfileId?: string;
    contactBehaviorProfileId?: string;
  };
  policySnapshot: Record<string, unknown>;
  scoredAt: string;
  metadata: Record<string, unknown>;
}
