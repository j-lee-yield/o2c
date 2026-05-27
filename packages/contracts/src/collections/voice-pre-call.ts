export type InvoiceFollowUpBucketName = "overdue" | "due_today" | "pre_due";

export type InvoicePromiseTreatmentStatus =
  | "no_promise"
  | "active_future_promise"
  | "broken_promise";

export interface InvoiceFollowUpBucketLine {
  invoiceId: string;
  invoiceNumber: string;
  currency: string;
  amountCents: number;
  dueDate?: string;
  daysPastDue?: number;
  branchId?: string;
  dateBucket?: InvoiceFollowUpBucketName | "routine";
  promiseStatus: InvoicePromiseTreatmentStatus;
  promiseToPayId?: string;
  promiseDate?: string;
  promiseState?: string;
  promisedAmountCents?: number;
}

export interface InvoiceFollowUpTreatmentGroups {
  brokenPromiseInvoices: InvoiceFollowUpBucketLine[];
  overdueWithoutPromiseInvoices: InvoiceFollowUpBucketLine[];
  dueTodayWithoutPromiseInvoices: InvoiceFollowUpBucketLine[];
  preDueWithoutPromiseInvoices: InvoiceFollowUpBucketLine[];
  activeFuturePromiseInvoices: InvoiceFollowUpBucketLine[];
  routineReminderInvoices: InvoiceFollowUpBucketLine[];
  disputedInvoices: InvoiceFollowUpBucketLine[];
}

export interface InvoiceFollowUpBucketOutput {
  has_overdue: boolean;
  has_due_today: boolean;
  has_pre_due: boolean;
  overdue_total: number;
  due_today_total: number;
  pre_due_total: number;
  balance_total: number;
  overall_balance_total: number;
  oldest_overdue_days: number;
  overdue_summary: string;
  due_today_summary: string;
  pre_due_summary: string;
  has_broken_promises: boolean;
  broken_promise_total: number;
  broken_promise_count: number;
  broken_promise_summary: string;
  has_overdue_without_promise: boolean;
  overdue_without_promise_total: number;
  overdue_without_promise_count: number;
  overdue_without_promise_summary: string;
  has_due_today_without_promise: boolean;
  due_today_without_promise_total: number;
  due_today_without_promise_count: number;
  due_today_without_promise_summary: string;
  has_pre_due_without_promise: boolean;
  pre_due_without_promise_total: number;
  pre_due_without_promise_count: number;
  pre_due_without_promise_summary: string;
  has_active_future_promises: boolean;
  active_future_promise_total: number;
  active_future_promise_count: number;
  active_future_promise_summary: string;
  earliest_active_promise_date: string;
  has_disputed_invoices: boolean;
  disputed_invoice_total: number;
  disputed_invoice_count: number;
  disputed_invoice_summary: string;
  blocked_reason: VoicePreCallBlockReason | "";
}

export type VoicePreCallContactVerificationStatus = "verified" | "unverified" | "unknown";

export type VoicePreCallHandlerVerificationSource =
  | "historical"
  | "self_verified_prior_call"
  | "operator_set"
  | "unknown";

export interface VoicePreCallHandlerContext {
  contactId: string;
  contactName: string;
  contactRole: string;
  verifiedContactStatus: VoicePreCallContactVerificationStatus;
  verificationSource: VoicePreCallHandlerVerificationSource;
  currentAccountHandlerName?: string;
  currentAccountHandlerRole?: string;
  currentHandlerContactId?: string;
  rightPartyCheckRequired: boolean;
  handlerHandoffPossible: boolean;
  currentContactMayNoLongerBeHandler: boolean;
  knownNewHandlerName?: string;
  knownNewHandlerPhone?: string;
  knownNewHandlerEmail?: string;
  knownNewHandlerContactId?: string;
  knownNewHandlerVerified: boolean;
  routingUpdateRecommended: boolean;
  liveTransferPossible: boolean;
  followUpRequired: boolean;
  handlerHandoffBlockedReason?: string;
  handoffCaptureFields: string[];
}

export type VoicePreCallPriorityGroupName =
  | "broken_promises"
  | "overdue_without_promise"
  | "due_today_without_promise"
  | "pre_due_without_promise"
  | "active_future_promises"
  | "routine_reminders";

export interface VoicePreCallPriorityGroup {
  name: VoicePreCallPriorityGroupName;
  rank: number;
  label: string;
  invoiceIds: string[];
  count: number;
  totalCents: number;
  summary: string;
  treatment: string;
  treatmentMode: "recovery" | "collection" | "confirmation" | "routine";
  retellInstruction: string;
  requiresFreshChase: boolean;
  confirmationOriented: boolean;
}

export type VoicePreCallObjective =
  | "recover_broken_promises_and_secure_unpromised_overdue"
  | "recover_broken_promises_and_confirm_existing_promises"
  | "secure_unpromised_overdue_and_confirm_existing_promises"
  | "secure_unpromised_overdue_and_confirm_due_today"
  | "secure_unpromised_overdue"
  | "confirm_due_today_and_pre_due_without_promise"
  | "confirm_active_promises_only"
  | "mixed_collections_call_with_handler_check"
  | "routine_reminder_only"
  | "safe_human_review_required";

export interface VoicePreCallOutput extends InvoiceFollowUpBucketOutput {
  verified_contact_status: VoicePreCallContactVerificationStatus;
  handler_verification_source: VoicePreCallHandlerVerificationSource;
  current_account_handler_name: string;
  current_account_handler_role: string;
  current_handler_contact_id: string;
  right_party_check_required: boolean;
  handler_handoff_possible: boolean;
  current_contact_may_no_longer_be_handler: boolean;
  known_new_handler_name: string;
  known_new_handler_phone: string;
  known_new_handler_email: string;
  known_new_handler_contact_id: string;
  routing_update_recommended: boolean;
  live_transfer_possible: boolean;
  handoff_follow_up_required: boolean;
  handler_handoff_blocked_reason: string;
  call_priority_plan: string;
  call_objective: VoicePreCallObjective;
  call_priority_flags: string;
  operator_summary: string;
  debug_summary: string;
}

export type VoicePreCallBlockReason =
  | "missing_phone"
  | "unverified_contact"
  | "do_not_call"
  | "voice_agent_disabled"
  | "inactive_account"
  | "disputed_invoice"
  | "erp_not_verified"
  | "erp_divergence"
  | "credit_pending"
  | "ambiguous_routing"
  | "cross_entity_ambiguity"
  | "missing_branch_context"
  | "outside_call_window"
  | "approval_required"
  | "no_collectible_invoices"
  | "handler_handoff_requires_review";

export interface VoicePreCallSafetyDecision {
  allowed: boolean;
  blockedReasons: VoicePreCallBlockReason[];
  warnings: string[];
  rationale: string[];
}

export interface VoicePreCallRoutingContext {
  routingLevel: "billing_account";
  parentAccountId: string;
  billingAccountId: string;
  contactId: string;
  branchId?: string;
  branchIds: string[];
}

export type VoicePostCallPersistenceActionKind =
  | "contact_handoff"
  | "routing_change_request"
  | "promise_update"
  | "partial_payment_commitment"
  | "payment_plan_request"
  | "non_commitment"
  | "paid_already_claim"
  | "dispute"
  | "callback"
  | "next_step_follow_up";

export interface VoicePostCallPersistenceAction {
  kind: VoicePostCallPersistenceActionKind;
  title: string;
  description: string;
  requiresHumanReview: boolean;
  dueAt?: string;
  metadata: Record<string, unknown>;
}

export interface VoicePostCallPersistencePlan {
  id: string;
  billingAccountId: string;
  parentAccountId?: string;
  branchId?: string;
  contactId?: string;
  communicationAttemptId: string;
  providerCallId?: string;
  preCallPlanId?: string;
  occurredAt: string;
  disposition: string;
  actions: VoicePostCallPersistenceAction[];
  operatorReviewRequired: boolean;
  followUpSafeMode: "normal" | "manual_review" | "handler_unreachable";
  auditSummary: string;
}

export const voicePostCallTaskTypes = [
  "invoice_dispute_review",
  "follow_up_promise_to_pay",
  "payment_collection_follow_up",
  "account_manager_callback",
  "non_commitment_follow_up",
  "broken_promise_escalation",
  "contact_verification_review",
  "payment_plan_review",
  "support_request_follow_up",
] as const;

export type VoicePostCallTaskType = (typeof voicePostCallTaskTypes)[number];

export const voicePostCallTaskPriorities = ["low", "medium", "high", "critical"] as const;

export type VoicePostCallTaskPriority = (typeof voicePostCallTaskPriorities)[number];

export interface VoicePostCallGeneratedTask {
  taskType: VoicePostCallTaskType;
  billingAccountId: string;
  contactId?: string;
  branchId?: string;
  source: "retell_call";
  callId?: string;
  planId?: string;
  linkedInvoiceIds: string[];
  priority: VoicePostCallTaskPriority;
  ownerTeam: string;
  dueAt: string;
  summary: string;
  recommendedNextAction: string;
  transcriptSnippet?: string;
  requiresHumanReview: boolean;
  status: "open";
  title: string;
  description: string;
  idempotencyKey: string;
}

export type VoiceDisputeScope =
  | "invoice_subset"
  | "current_group_only"
  | "whole_account_or_balance"
  | "routing_or_handler_issue"
  | "unclear";

export type VoiceDisputeContinuationNextAction =
  | "continue_with_remaining_groups"
  | "stop_and_escalate"
  | "switch_to_handler_handoff";

export interface VoiceDisputeFrozenScope {
  scope: VoiceDisputeScope;
  invoiceIds: string[];
  groupNames: VoicePreCallPriorityGroupName[];
  summary: string;
}

export interface VoiceDisputeContinuationDecision {
  shouldContinueCall: boolean;
  nextAction: VoiceDisputeContinuationNextAction;
  continuationReason: string;
  frozenScope: VoiceDisputeFrozenScope;
  safeRemainingGroupsExist: boolean;
  safeRemainingGroups: VoicePreCallPriorityGroup[];
}
