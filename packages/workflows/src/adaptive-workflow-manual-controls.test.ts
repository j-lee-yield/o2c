import { describe, expect, it } from "vitest";
import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import type { Principal } from "@o2c/auth";
import {
  AdaptiveWorkflowDecisionService,
  InMemoryWorkflowExecutionRepository,
} from "./adaptive-workflow.js";
import { AdaptiveWorkflowManualControlService } from "./adaptive-workflow-manual-controls.js";

const systemActor = {
  actorId: "system_policy",
  actorRole: "system" as const,
};

const collector: Principal = { id: "collector_1", roles: ["ar_collector"] };
const manager: Principal = { id: "manager_1", roles: ["ar_manager"] };

function createFixture() {
  const activityStore = new InMemoryImmutableActivityLogStore();
  const repository = new InMemoryWorkflowExecutionRepository();
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}_${++idCounter}`;
  const decisions = new AdaptiveWorkflowDecisionService({
    activityStore,
    repository,
    now: () => "2026-04-20T09:00:00.000Z",
    idGenerator: nextId,
  });
  const manual = new AdaptiveWorkflowManualControlService({
    activityStore,
    repository,
    now: () => "2026-04-20T09:00:00.000Z",
    idGenerator: nextId,
  });
  const execution = decisions.createExecution({
    actor: systemActor,
    tenantId: "default",
    workflowId: "workflow_1",
    billingAccountId: "billing_account_1",
    parentAccountId: "parent_account_1",
  });

  return { decisions, manual, activityStore, repository, execution };
}

describe("AdaptiveWorkflowManualControlService", () => {
  it("manual override supersedes a later AI track-switch recommendation", () => {
    const { decisions, manual, execution } = createFixture();
    const manuallyMoved = manual.moveWorkflowTrack(manager, {
      execution,
      targetTrack: "email_only",
      reason: "Operator wants this account held to email-only until contact routing is confirmed.",
    }).execution;

    const result = decisions.evaluateAndApply({
      actor: systemActor,
      execution: manuallyMoved,
      outcomes: [{ outcome: "promise_to_pay", confidence: 0.92 }],
      asOf: "2026-04-20T09:05:00.000Z",
    });

    expect(result.decision.action).toBe("continue");
    expect(result.decision.reason).toBe("manual_lock_active");
    expect(result.execution.currentTrack).toBe("email_only");
    expect(result.execution.metadata.controlMode).toBe("manual_locked");
  });

  it("AI cannot override a human manual pause until a user resumes the workflow", () => {
    const { decisions, manual, execution } = createFixture();
    const paused = manual.pauseWorkflow(collector, {
      execution,
      reason: "Collector paused automation while verifying the right AP contact.",
      effectiveUntil: "2026-04-22T09:00:00.000Z",
    }).execution;

    const blocked = decisions.evaluateAndApply({
      actor: systemActor,
      execution: paused,
      outcomes: [{ outcome: "no_response", confidence: 0.6 }],
      asOf: "2026-04-20T09:10:00.000Z",
    });

    expect(blocked.decision.reason).toBe("manual_lock_active");
    expect(blocked.execution.status).toBe("paused");
    expect(blocked.execution.effectiveUntil).toBe("2026-04-22T09:00:00.000Z");

    const resumed = manual.resumeWorkflow(collector, {
      execution: paused,
      reason: "Contact verification is done and automation may continue.",
    }).execution;

    const afterResume = decisions.evaluateAndApply({
      actor: systemActor,
      execution: resumed,
      outcomes: [{ outcome: "no_response", confidence: 0.6 }],
      asOf: "2026-04-20T09:15:00.000Z",
    });

    expect(afterResume.decision.action).toBe("continue");
    expect(afterResume.execution.status).toBe("active");
    expect(afterResume.execution.metadata.controlMode).toBe("auto");
  });

  it("hard-stop rules still win over normal cadence while a manual lock is present", () => {
    const { decisions, manual, execution } = createFixture();
    const manuallyMoved = manual.moveWorkflowTrack(manager, {
      execution,
      targetTrack: "call_assisted",
      reason: "Manager moved the account to a supervised call-assisted strategy.",
    }).execution;

    const result = decisions.evaluateAndApply({
      actor: systemActor,
      execution: manuallyMoved,
      outcomes: [{ outcome: "legal_risk", confidence: 0.99 }],
      asOf: "2026-04-20T09:20:00.000Z",
    });

    expect(result.decision.action).toBe("opt_out");
    expect(result.execution.status).toBe("opted_out");
  });

  it("records previous and new state details for manual overrides", () => {
    const { manual, activityStore, execution } = createFixture();

    const result = manual.optOutWorkflow(manager, {
      execution,
      reason: "Customer requested a full workflow stop pending legal review.",
    });

    expect(result.execution.status).toBe("opted_out");
    expect(activityStore.entries.at(-1)?.action).toBe("control_center.execution.manual_opt_out");
    expect(activityStore.entries.at(-1)?.metadata).toMatchObject({
      reason: "Customer requested a full workflow stop pending legal review.",
      previousState: "active",
      newState: "opted_out",
    });
  });
});
