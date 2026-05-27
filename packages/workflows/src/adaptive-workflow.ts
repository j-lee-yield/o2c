import {
  createActivityLogDomainHelpers,
  type ImmutableActivityLogEntry,
  type ImmutableActivityLogStore,
} from "@o2c/audit";
import {
  applyControlCenterWorkflowDecision,
  createControlCenterWorkflowExecution,
  type ActorContext,
  type ControlCenterStructuredOutcome,
  type ControlCenterWorkflowDecisionReviewState,
  type ControlCenterWorkflowExecutionControlMode,
  type ControlCenterStructuredOutcomeType,
  type ControlCenterWorkflowDecision,
  type ControlCenterWorkflowExecution,
  type ControlCenterWorkflowTrack,
} from "@o2c/domain";

export interface AdaptiveWorkflowPolicyConfig {
  pauseWindowsHours: {
    paid: number;
    paymentInProcess: number;
    callBackAfterDate: number;
    wrongContact: number;
    bouncedEmail: number;
    invalidNumber: number;
  };
}

const defaultPolicyConfig: AdaptiveWorkflowPolicyConfig = {
  pauseWindowsHours: {
    paid: 168,
    paymentInProcess: 72,
    callBackAfterDate: 24,
    wrongContact: 168,
    bouncedEmail: 72,
    invalidNumber: 168,
  },
};

export interface WorkflowExecutionRepository {
  save(execution: ControlCenterWorkflowExecution): Promise<void> | void;
  get(executionId: string): Promise<ControlCenterWorkflowExecution | undefined> | ControlCenterWorkflowExecution | undefined;
}

export class InMemoryWorkflowExecutionRepository implements WorkflowExecutionRepository {
  private readonly records = new Map<string, ControlCenterWorkflowExecution>();

  save(execution: ControlCenterWorkflowExecution): void {
    this.records.set(execution.id, structuredClone(execution));
  }

  get(executionId: string): ControlCenterWorkflowExecution | undefined {
    const record = this.records.get(executionId);
    return record ? structuredClone(record) : undefined;
  }
}

export interface AdaptiveWorkflowDecisionInput {
  execution: Pick<ControlCenterWorkflowExecution, "status" | "currentTrack"> & {
    metadata?: ControlCenterWorkflowExecution["metadata"];
  };
  outcomes: ControlCenterStructuredOutcome[];
  asOf: string;
  policy?: Partial<AdaptiveWorkflowPolicyConfig>;
  allowManualOverride?: boolean;
}

export interface AdaptiveWorkflowDecisionResult {
  decision: ControlCenterWorkflowDecision;
  matchedOutcome: ControlCenterStructuredOutcome;
}

export interface EvaluateAndApplyDecisionInput extends AdaptiveWorkflowDecisionInput {
  actor: ActorContext;
  execution: ControlCenterWorkflowExecution;
  metadata?: Record<string, unknown>;
}

export interface EvaluateAndApplyDecisionResult extends AdaptiveWorkflowDecisionResult {
  execution: ControlCenterWorkflowExecution;
  activityEntry: ImmutableActivityLogEntry;
}

export function evaluateAdaptiveWorkflowDecision(
  input: AdaptiveWorkflowDecisionInput,
): AdaptiveWorkflowDecisionResult {
  const policy = mergePolicy(input.policy);
  const outcomes = dedupeOutcomes(input.outcomes);
  const matchedOutcome = selectHighestPriorityOutcome(outcomes);
  const decision = normalizeDecisionAgainstExecution(
    buildDecisionForOutcome({
      outcome: matchedOutcome,
      asOf: input.asOf,
      policy,
    }),
    input.execution,
    matchedOutcome,
    input.allowManualOverride ?? false,
  );

  return {
    decision,
    matchedOutcome,
  };
}

export class AdaptiveWorkflowDecisionService {
  private readonly now: () => string;
  private readonly idGenerator: (prefix: string) => string;
  private readonly audit: ReturnType<typeof createActivityLogDomainHelpers>;
  private readonly repository: WorkflowExecutionRepository;
  private readonly policy: AdaptiveWorkflowPolicyConfig;

  constructor(input: {
    activityStore: ImmutableActivityLogStore;
    repository?: WorkflowExecutionRepository;
    policy?: Partial<AdaptiveWorkflowPolicyConfig>;
    now?: () => string;
    idGenerator?: (prefix: string) => string;
  }) {
    this.now = input.now ?? (() => new Date().toISOString());
    this.idGenerator = input.idGenerator ?? ((prefix) => `${prefix}_${Date.now()}`);
    this.repository = input.repository ?? new InMemoryWorkflowExecutionRepository();
    this.policy = mergePolicy(input.policy);
    this.audit = createActivityLogDomainHelpers({
      store: input.activityStore,
      now: this.now,
      idGenerator: () => this.idGenerator("activity"),
    });
  }

  createExecution(input: {
    actor: ActorContext;
    tenantId: string;
    workflowId: string;
    billingAccountId: string;
    parentAccountId: string;
    currentTrack?: ControlCenterWorkflowExecution["currentTrack"];
  }): ControlCenterWorkflowExecution {
    const execution = createControlCenterWorkflowExecution({
      id: this.idGenerator("workflow_execution"),
      tenantId: input.tenantId,
      actor: input.actor,
      at: this.now(),
      workflowId: input.workflowId,
      billingAccountId: input.billingAccountId,
      parentAccountId: input.parentAccountId,
      ...(input.currentTrack ? { currentTrack: input.currentTrack } : {}),
    });
    this.repository.save(execution);
    return execution;
  }

  evaluateAndApply(input: EvaluateAndApplyDecisionInput): EvaluateAndApplyDecisionResult {
    const occurredAt = input.asOf;
    const { decision, matchedOutcome } = evaluateAdaptiveWorkflowDecision({
      execution: input.execution,
      outcomes: input.outcomes,
      asOf: occurredAt,
      policy: this.policy,
    });
    const updated = applyControlCenterWorkflowDecision(input.execution, {
      actor: input.actor,
      at: occurredAt,
      decision,
      metadata: {
        matchedOutcome: matchedOutcome.outcome,
        ...(input.metadata ?? {}),
      },
    });
    this.repository.save(updated);
    const activityEntry = this.audit.append({
      actorId: input.actor.actorId,
      actorRole: toActivityActorRole(input.actor.actorRole),
      action: "control_center.execution.decision_applied",
      entityType: "control_center_workflow_execution",
      entityId: updated.id,
      before: serializeExecution(input.execution),
      after: serializeExecution(updated),
      metadata: {
        action: decision.action,
        reason: decision.reason,
        confidence: decision.confidence,
        requiresHumanReview: decision.requiresHumanReview,
        ...(decision.targetTrack ? { targetTrack: decision.targetTrack } : {}),
        ...(decision.effectiveUntil ? { effectiveUntil: decision.effectiveUntil } : {}),
        rationaleSummary: decision.rationaleSummary,
        outcome: matchedOutcome.outcome,
        reasoningMetadata: decision.reasoningMetadata,
        ...(input.metadata ? { executionMetadata: input.metadata } : {}),
      },
    });

    return {
      decision,
      matchedOutcome,
      execution: updated,
      activityEntry,
    };
  }
}

function toActivityActorRole(
  actorRole: ActorContext["actorRole"],
): "ar_collector" | "ar_manager" | "controller" | "admin" | "system" {
  switch (actorRole) {
    case "ar_collector":
    case "ar_manager":
    case "controller":
    case "admin":
    case "system":
      return actorRole;
    case "user":
    default:
      return "system";
  }
}

function buildDecisionForOutcome(input: {
  outcome: ControlCenterStructuredOutcome;
  asOf: string;
  policy: AdaptiveWorkflowPolicyConfig;
}): ControlCenterWorkflowDecision {
  const confidence = clampConfidence(input.outcome.confidence, defaultConfidenceFor(input.outcome.outcome));
  const rationaleSummary =
    input.outcome.evidenceSummary ?? defaultRationaleSummary(input.outcome.outcome);
  const reasoningMetadata = {
    outcome: input.outcome.outcome,
    confidence,
    ...(input.outcome.metadata ? { evidence: input.outcome.metadata } : {}),
  };

  switch (input.outcome.outcome) {
    case "legal_risk":
      return {
        action: "opt_out",
        reason: "legal_risk_block",
        confidence,
        requiresHumanReview: true,
        rationaleSummary,
        reasoningMetadata,
      };
    case "paid":
      return {
        action: "pause",
        reason: "resolved_payment_signal",
        confidence,
        effectiveUntil: addHours(input.asOf, input.policy.pauseWindowsHours.paid),
        requiresHumanReview: false,
        rationaleSummary,
        reasoningMetadata,
      };
    case "dispute":
      return {
        action: "escalate_for_review",
        reason: "dispute_requires_controlled_resolution",
        confidence,
        requiresHumanReview: true,
        rationaleSummary,
        reasoningMetadata,
      };
    case "strategic_account":
      return {
        action: "escalate_for_review",
        reason: "strategic_account_manual_handling",
        confidence,
        requiresHumanReview: true,
        rationaleSummary,
        reasoningMetadata,
      };
    case "low_confidence":
      return {
        action: "escalate_for_review",
        reason: "ambiguous_or_low_confidence_outcome",
        confidence,
        requiresHumanReview: true,
        rationaleSummary,
        reasoningMetadata,
      };
    case "wrong_contact":
      return {
        action: "pause",
        reason: "wrong_contact_repair_required",
        confidence,
        effectiveUntil: addHours(input.asOf, input.policy.pauseWindowsHours.wrongContact),
        requiresHumanReview: false,
        rationaleSummary,
        reasoningMetadata,
      };
    case "bounced_email":
      return {
        action: "pause",
        reason: "bounced_email_contact_repair_required",
        confidence,
        effectiveUntil: addHours(input.asOf, input.policy.pauseWindowsHours.bouncedEmail),
        requiresHumanReview: false,
        rationaleSummary,
        reasoningMetadata,
      };
    case "invalid_number":
      return {
        action: "pause",
        reason: "invalid_number_contact_repair_required",
        confidence,
        effectiveUntil: addHours(input.asOf, input.policy.pauseWindowsHours.invalidNumber),
        requiresHumanReview: false,
        rationaleSummary,
        reasoningMetadata,
      };
    case "payment_in_process":
      return {
        action: "pause",
        reason: "payment_in_process_wait_window",
        confidence,
        effectiveUntil: addHours(input.asOf, input.policy.pauseWindowsHours.paymentInProcess),
        requiresHumanReview: false,
        rationaleSummary,
        reasoningMetadata,
      };
    case "call_back_after_date":
      return {
        action: "pause",
        reason: "callback_requested_wait_window",
        confidence,
        effectiveUntil:
          readEffectiveUntil(input.outcome.metadata) ??
          addHours(input.asOf, input.policy.pauseWindowsHours.callBackAfterDate),
        requiresHumanReview: false,
        rationaleSummary,
        reasoningMetadata,
      };
    case "promise_to_pay":
      return {
        action: "switch_track",
        reason: "promise_to_pay_follow_up",
        confidence,
        targetTrack: "promise_to_pay",
        requiresHumanReview: false,
        rationaleSummary,
        reasoningMetadata,
      };
    case "resend_requested":
      return {
        action: "switch_track",
        reason: "issue_resolution_document_resend",
        confidence,
        targetTrack: "issue_resolution",
        requiresHumanReview: false,
        rationaleSummary,
        reasoningMetadata,
      };
    case "do_not_call":
    case "email_only":
      return {
        action: "switch_track",
        reason: "channel_restricted_to_email_only",
        confidence,
        targetTrack: "email_only",
        requiresHumanReview: false,
        rationaleSummary,
        reasoningMetadata,
      };
    case "no_response":
      return {
        action: "continue",
        reason: "no_response_continue_cadence",
        confidence,
        requiresHumanReview: false,
        rationaleSummary,
        reasoningMetadata,
      };
  }
}

function normalizeDecisionAgainstExecution(
  decision: ControlCenterWorkflowDecision,
  execution: Pick<ControlCenterWorkflowExecution, "status" | "currentTrack"> & {
    metadata?: ControlCenterWorkflowExecution["metadata"];
  },
  matchedOutcome: ControlCenterStructuredOutcome,
  allowManualOverride: boolean,
): ControlCenterWorkflowDecision {
  if (isManualLockActive(execution) && !allowManualOverride && !isHardStopOutcome(matchedOutcome.outcome)) {
    return {
      action: "continue",
      reason: "manual_lock_active",
      confidence: decision.confidence,
      requiresHumanReview: true,
      rationaleSummary: "A human operator has locked this workflow state, so AI cannot change it automatically.",
      reasoningMetadata: {
        ...decision.reasoningMetadata,
        normalizedFromAction: decision.action,
        normalizedBecause: "manual_lock_active",
        manualLockReason: readStringMetadata(execution.metadata, "manualLockReason"),
      },
    };
  }

  if (decision.action === "switch_track" && decision.targetTrack === execution.currentTrack) {
    return {
      action: "continue",
      reason: "target_track_already_active",
      confidence: decision.confidence,
      requiresHumanReview: decision.requiresHumanReview,
      rationaleSummary: `Track ${execution.currentTrack} is already active; workflow should continue without a duplicate switch.`,
      reasoningMetadata: {
        ...decision.reasoningMetadata,
        normalizedFromAction: "switch_track",
        normalizedBecause: "target_track_already_active",
      },
    };
  }

  if (execution.status === "opted_out" && decision.action !== "opt_out") {
    return {
      action: "continue",
      reason: "workflow_already_opted_out",
      confidence: decision.confidence,
      requiresHumanReview: true,
      rationaleSummary: "Workflow is already opted out and cannot be advanced automatically.",
      reasoningMetadata: {
        ...decision.reasoningMetadata,
        normalizedBecause: "workflow_already_opted_out",
      },
    };
  }

  return decision;
}

export type AdaptiveWorkflowControlMode = ControlCenterWorkflowExecutionControlMode;
export type AdaptiveWorkflowDecisionReviewState = ControlCenterWorkflowDecisionReviewState;

export function getAdaptiveWorkflowControlMode(
  execution: { metadata?: ControlCenterWorkflowExecution["metadata"] },
): AdaptiveWorkflowControlMode {
  return execution.metadata?.controlMode === "manual_locked" ? "manual_locked" : "auto";
}

export function isManualLockActive(
  execution: { metadata?: ControlCenterWorkflowExecution["metadata"] },
) {
  return getAdaptiveWorkflowControlMode(execution) === "manual_locked";
}

export function isHardStopOutcome(outcome: ControlCenterStructuredOutcomeType) {
  return outcome === "legal_risk" || outcome === "paid";
}

function dedupeOutcomes(outcomes: ControlCenterStructuredOutcome[]) {
  const deduped = new Map<ControlCenterStructuredOutcomeType, ControlCenterStructuredOutcome>();
  for (const outcome of outcomes) {
    const existing = deduped.get(outcome.outcome);
    if (!existing || (outcome.confidence ?? 0) > (existing.confidence ?? 0)) {
      deduped.set(outcome.outcome, outcome);
    }
  }
  if (deduped.size === 0) {
    return [
      {
        outcome: "no_response" as const,
        confidence: 0.5,
        evidenceSummary: "No blocking outcome was supplied.",
      },
    ];
  }
  return [...deduped.values()];
}

function selectHighestPriorityOutcome(outcomes: ControlCenterStructuredOutcome[]) {
  return [...outcomes].sort((left, right) => comparePriority(left.outcome, right.outcome))[0]!;
}

function comparePriority(
  left: ControlCenterStructuredOutcomeType,
  right: ControlCenterStructuredOutcomeType,
) {
  return priorityForOutcome(left) - priorityForOutcome(right);
}

function priorityForOutcome(outcome: ControlCenterStructuredOutcomeType) {
  switch (outcome) {
    case "legal_risk":
      return 0;
    case "paid":
      return 1;
    case "dispute":
      return 2;
    case "strategic_account":
      return 3;
    case "low_confidence":
      return 4;
    case "wrong_contact":
    case "bounced_email":
    case "invalid_number":
      return 5;
    case "payment_in_process":
    case "call_back_after_date":
      return 6;
    case "promise_to_pay":
      return 7;
    case "resend_requested":
      return 8;
    case "do_not_call":
    case "email_only":
      return 9;
    case "no_response":
    default:
      return 10;
  }
}

function serializeExecution(execution: ControlCenterWorkflowExecution) {
  return {
    id: execution.id,
    workflowId: execution.workflowId,
    billingAccountId: execution.billingAccountId,
    parentAccountId: execution.parentAccountId,
    status: execution.status,
    currentTrack: execution.currentTrack,
    ...(execution.lastDecisionAction ? { lastDecisionAction: execution.lastDecisionAction } : {}),
    ...(execution.lastDecisionReason ? { lastDecisionReason: execution.lastDecisionReason } : {}),
    ...(execution.lastDecisionConfidence !== undefined
      ? { lastDecisionConfidence: execution.lastDecisionConfidence }
      : {}),
    ...(execution.effectiveUntil ? { effectiveUntil: execution.effectiveUntil } : {}),
    requiresHumanReview: execution.requiresHumanReview,
    ...(execution.rationaleSummary ? { rationaleSummary: execution.rationaleSummary } : {}),
    reasoningMetadata: execution.reasoningMetadata,
    metadata: execution.metadata,
  };
}

function mergePolicy(
  policy: Partial<AdaptiveWorkflowPolicyConfig> | undefined,
): AdaptiveWorkflowPolicyConfig {
  return {
    pauseWindowsHours: {
      ...defaultPolicyConfig.pauseWindowsHours,
      ...(policy?.pauseWindowsHours ?? {}),
    },
  };
}

function addHours(isoTimestamp: string, hours: number) {
  return new Date(Date.parse(isoTimestamp) + hours * 60 * 60 * 1000).toISOString();
}

function clampConfidence(value: number | undefined, fallback: number) {
  if (value === undefined || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function defaultConfidenceFor(outcome: ControlCenterStructuredOutcomeType) {
  switch (outcome) {
    case "paid":
    case "do_not_call":
    case "email_only":
    case "legal_risk":
      return 0.98;
    case "dispute":
    case "wrong_contact":
    case "bounced_email":
    case "invalid_number":
    case "strategic_account":
      return 0.95;
    case "payment_in_process":
    case "call_back_after_date":
    case "resend_requested":
    case "promise_to_pay":
      return 0.82;
    case "low_confidence":
      return 0.35;
    case "no_response":
    default:
      return 0.6;
  }
}

function defaultRationaleSummary(outcome: ControlCenterStructuredOutcomeType) {
  switch (outcome) {
    case "paid":
      return "Objective payment evidence is present, so workflow activity should pause while the account settles.";
    case "promise_to_pay":
      return "Customer intent now centers on a promise to pay, so follow-up should shift to the promise track.";
    case "payment_in_process":
      return "Payment appears to be in process and a short reversible pause is safer than fresh outreach.";
    case "call_back_after_date":
      return "The customer asked for a later callback, so the workflow should pause until the requested time.";
    case "resend_requested":
      return "Customer requested documents, so the workflow should move to the issue-resolution track.";
    case "dispute":
      return "A dispute requires controlled issue resolution rather than autonomous collections continuation.";
    case "wrong_contact":
      return "The workflow reached the wrong contact and must pause until contact routing is repaired.";
    case "bounced_email":
      return "The last email bounced and the workflow should pause while the destination is repaired.";
    case "invalid_number":
      return "The current phone channel is invalid and should pause until a verified number exists.";
    case "do_not_call":
    case "email_only":
      return "Channel restrictions limit outreach to email-safe handling.";
    case "legal_risk":
      return "Legal or compliance risk blocks further automated workflow activity.";
    case "strategic_account":
      return "Strategic account handling requires human oversight before further workflow automation.";
    case "low_confidence":
      return "The AI outcome is too ambiguous for autonomous progression.";
    case "no_response":
    default:
      return "No blocking outcome is present, so the workflow can continue along the current cadence.";
  }
}

function readEffectiveUntil(metadata: Record<string, unknown> | undefined) {
  const value = metadata?.effectiveUntil;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringMetadata(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
