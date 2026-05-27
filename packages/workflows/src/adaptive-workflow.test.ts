import { describe, expect, it } from "vitest";
import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import type {
  ActorContext,
  ControlCenterStructuredOutcome,
  ControlCenterWorkflowExecution,
} from "@o2c/domain";
import {
  AdaptiveWorkflowDecisionService,
  evaluateAdaptiveWorkflowDecision,
  InMemoryWorkflowExecutionRepository,
} from "./adaptive-workflow.js";

const actor: ActorContext = {
  actorId: "system_policy",
  actorRole: "system",
};

function createService() {
  const activityStore = new InMemoryImmutableActivityLogStore();
  const repository = new InMemoryWorkflowExecutionRepository();
  let idCounter = 0;
  const service = new AdaptiveWorkflowDecisionService({
    activityStore,
    repository,
    now: () => "2026-04-20T09:00:00.000Z",
    idGenerator: (prefix) => `${prefix}_${++idCounter}`,
  });

  const execution = service.createExecution({
    actor,
    tenantId: "default",
    workflowId: "workflow_1",
    billingAccountId: "billing_account_1",
    parentAccountId: "parent_account_1",
  });

  return { service, activityStore, repository, execution };
}

function evaluate(
  outcome: ControlCenterStructuredOutcome,
  execution: Pick<ControlCenterWorkflowExecution, "status" | "currentTrack"> = {
    status: "active",
    currentTrack: "standard_reminders",
  },
) {
  return evaluateAdaptiveWorkflowDecision({
    execution,
    outcomes: [outcome],
    asOf: "2026-04-20T09:00:00.000Z",
  });
}

describe("evaluateAdaptiveWorkflowDecision", () => {
  it("maps legal risk to a workflow opt-out", () => {
    const result = evaluate({ outcome: "legal_risk" });

    expect(result.decision.action).toBe("opt_out");
    expect(result.decision.requiresHumanReview).toBe(true);
    expect(result.decision.reason).toBe("legal_risk_block");
  });

  it("maps payment in process to a reversible pause window", () => {
    const result = evaluate({ outcome: "payment_in_process", confidence: 0.77 });

    expect(result.decision.action).toBe("pause");
    expect(result.decision.confidence).toBe(0.77);
    expect(result.decision.effectiveUntil).toBe("2026-04-23T09:00:00.000Z");
  });

  it("switches to the promise-to-pay track when a PTP outcome is present", () => {
    const result = evaluate({ outcome: "promise_to_pay" });

    expect(result.decision.action).toBe("switch_track");
    expect(result.decision.targetTrack).toBe("promise_to_pay");
    expect(result.decision.requiresHumanReview).toBe(false);
  });

  it("chooses a single highest-priority action when outcomes conflict", () => {
    const result = evaluateAdaptiveWorkflowDecision({
      execution: {
        status: "active",
        currentTrack: "standard_reminders",
      },
      outcomes: [
        { outcome: "payment_in_process", confidence: 0.9 },
        { outcome: "low_confidence", confidence: 0.2 },
        { outcome: "promise_to_pay", confidence: 0.8 },
      ],
      asOf: "2026-04-20T09:00:00.000Z",
    });

    expect(result.matchedOutcome.outcome).toBe("low_confidence");
    expect(result.decision.action).toBe("escalate_for_review");
  });

  it("normalizes duplicate track switches into continue", () => {
    const result = evaluateAdaptiveWorkflowDecision({
      execution: {
        status: "active",
        currentTrack: "email_only",
      },
      outcomes: [{ outcome: "email_only", confidence: 0.99 }],
      asOf: "2026-04-20T09:00:00.000Z",
    });

    expect(result.decision.action).toBe("continue");
    expect(result.decision.reason).toBe("target_track_already_active");
    expect(result.decision.reasoningMetadata.normalizedFromAction).toBe("switch_track");
  });
});

describe("AdaptiveWorkflowDecisionService", () => {
  it("applies track switches and records explainable activity metadata", () => {
    const { service, activityStore, repository, execution } = createService();

    const result = service.evaluateAndApply({
      actor,
      execution,
      outcomes: [
        {
          outcome: "promise_to_pay",
          confidence: 0.88,
          evidenceSummary: "Customer committed to paying on Friday.",
          metadata: { source: "call_outcome" },
        },
      ],
      asOf: "2026-04-20T09:00:00.000Z",
    });

    expect(result.execution.status).toBe("active");
    expect(result.execution.currentTrack).toBe("promise_to_pay");
    expect(result.execution.lastDecisionAction).toBe("switch_track");
    expect(result.execution.reasoningMetadata).toMatchObject({
      outcome: "promise_to_pay",
      confidence: 0.88,
      evidence: { source: "call_outcome" },
    });
    expect(activityStore.entries).toHaveLength(1);
    expect(activityStore.entries[0]?.action).toBe("control_center.execution.decision_applied");
    expect(activityStore.entries[0]?.metadata).toMatchObject({
      action: "switch_track",
      targetTrack: "promise_to_pay",
      outcome: "promise_to_pay",
    });
    expect(repository.get(result.execution.id)?.currentTrack).toBe("promise_to_pay");
  });

  it("preserves opt-out state instead of applying contradictory follow-up actions", () => {
    const { service, execution } = createService();
    const optedOut = service.evaluateAndApply({
      actor,
      execution,
      outcomes: [{ outcome: "legal_risk" }],
      asOf: "2026-04-20T09:00:00.000Z",
    }).execution;

    const result = service.evaluateAndApply({
      actor,
      execution: optedOut,
      outcomes: [{ outcome: "promise_to_pay", confidence: 0.9 }],
      asOf: "2026-04-20T09:00:00.000Z",
    });

    expect(result.decision.action).toBe("continue");
    expect(result.decision.reason).toBe("workflow_already_opted_out");
    expect(result.execution.status).toBe("opted_out");
    expect(result.execution.currentTrack).toBe("standard_reminders");
    expect(result.execution.requiresHumanReview).toBe(true);
  });

  it("clears stale pause windows when a later decision is not a pause", () => {
    const { service, execution } = createService();
    const paused = service.evaluateAndApply({
      actor,
      execution,
      outcomes: [{ outcome: "payment_in_process" }],
      asOf: "2026-04-20T09:00:00.000Z",
    }).execution;

    expect(paused.status).toBe("paused");
    expect(paused.effectiveUntil).toBe("2026-04-23T09:00:00.000Z");

    const resumed = service.evaluateAndApply({
      actor,
      execution: paused,
      outcomes: [{ outcome: "promise_to_pay" }],
      asOf: "2026-04-20T09:00:00.000Z",
    }).execution;

    expect(resumed.status).toBe("active");
    expect(resumed.currentTrack).toBe("promise_to_pay");
    expect(resumed.effectiveUntil).toBeUndefined();
  });
});
