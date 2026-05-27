import {
  createActivityLogDomainHelpers,
  type ImmutableActivityLogEntry,
  type ImmutableActivityLogStore,
} from "@o2c/audit";
import { assertAnyRole, type Principal } from "@o2c/auth";
import {
  applyControlCenterWorkflowDecision,
  evolveEntityMetadata,
  type ActorContext,
  type ControlCenterWorkflowDecisionReviewState,
  type ControlCenterWorkflowExecution,
  type ControlCenterWorkflowTrack,
} from "@o2c/domain";
import type { WorkflowExecutionRepository } from "./adaptive-workflow.js";

export type ManualWorkflowAction =
  | "resume"
  | "pause"
  | "opt_out"
  | "move_track"
  | "mark_reviewed"
  | "approve_decision"
  | "override_decision";

export interface ManualWorkflowMutationResult {
  execution: ControlCenterWorkflowExecution;
  activityEntry: ImmutableActivityLogEntry;
}

export class AdaptiveWorkflowManualControlService {
  private readonly now: () => string;
  private readonly audit: ReturnType<typeof createActivityLogDomainHelpers>;

  constructor(input: {
    activityStore: ImmutableActivityLogStore;
    repository: WorkflowExecutionRepository;
    now?: () => string;
    idGenerator?: (prefix: string) => string;
  }) {
    this.now = input.now ?? (() => new Date().toISOString());
    let counter = 0;
    const nextId =
      input.idGenerator ??
      ((prefix: string) => {
        counter += 1;
        return `${prefix}_${Date.now()}_${counter}`;
      });
    this.audit = createActivityLogDomainHelpers({
      store: input.activityStore,
      now: this.now,
      idGenerator: () => nextId("activity"),
    });
    this.repository = input.repository;
  }

  private readonly repository: WorkflowExecutionRepository;

  pauseWorkflow(
    principal: Principal,
    input: {
      execution: ControlCenterWorkflowExecution;
      reason: string;
      effectiveUntil?: string;
    },
  ): ManualWorkflowMutationResult {
    assertManualPermission(principal, "pause");
    return this.applyManualStateChange(principal, input.execution, {
      action: "pause",
      currentTrack: input.execution.currentTrack,
      reason: input.reason,
      ...(input.effectiveUntil ? { effectiveUntil: input.effectiveUntil } : {}),
      lockMode: "manual_locked",
    });
  }

  resumeWorkflow(
    principal: Principal,
    input: {
      execution: ControlCenterWorkflowExecution;
      reason: string;
    },
  ): ManualWorkflowMutationResult {
    assertManualPermission(principal, "resume");
    return this.applyManualStateChange(principal, input.execution, {
      action: "resume",
      currentTrack: input.execution.currentTrack,
      reason: input.reason,
      lockMode: "auto",
    });
  }

  optOutWorkflow(
    principal: Principal,
    input: {
      execution: ControlCenterWorkflowExecution;
      reason: string;
    },
  ): ManualWorkflowMutationResult {
    assertManualPermission(principal, "opt_out");
    return this.applyManualStateChange(principal, input.execution, {
      action: "opt_out",
      currentTrack: input.execution.currentTrack,
      reason: input.reason,
      lockMode: "manual_locked",
    });
  }

  moveWorkflowTrack(
    principal: Principal,
    input: {
      execution: ControlCenterWorkflowExecution;
      targetTrack: ControlCenterWorkflowTrack;
      reason: string;
    },
  ): ManualWorkflowMutationResult {
    assertManualPermission(principal, "move_track");
    return this.applyManualStateChange(principal, input.execution, {
      action: "move_track",
      currentTrack: input.targetTrack,
      reason: input.reason,
      lockMode: "manual_locked",
    });
  }

  markDecisionState(
    principal: Principal,
    input: {
      execution: ControlCenterWorkflowExecution;
      reviewState: ControlCenterWorkflowDecisionReviewState;
      reason: string;
    },
  ): ManualWorkflowMutationResult {
    assertManualPermission(
      principal,
      input.reviewState === "reviewed" ? "mark_reviewed" : input.reviewState === "approved" ? "approve_decision" : "override_decision",
    );
    const occurredAt = this.now();
    const actor = principalToActor(principal);
    const updated = {
      ...input.execution,
      ...evolveEntityMetadata(input.execution, {
        at: occurredAt,
        actorId: actor.actorId,
        actorRole: actor.actorRole,
      }),
      metadata: {
        ...input.execution.metadata,
        controlMode:
          input.reviewState === "overridden"
            ? "manual_locked"
            : input.execution.metadata.controlMode ?? "auto",
        lastChangedBy: "human",
        lastManualAction:
          input.reviewState === "reviewed"
            ? "mark_reviewed"
            : input.reviewState === "approved"
              ? "approve_decision"
              : "override_decision",
        decisionReviewState: input.reviewState,
        decisionReviewReason: input.reason,
        decisionReviewActorId: principal.id,
        decisionReviewActorRole: principal.roles[0] ?? "ar_collector",
        decisionReviewAt: occurredAt,
      },
    } satisfies ControlCenterWorkflowExecution;
    this.repository.save(updated);

    const activityEntry = this.audit.append({
      actorId: principal.id,
      actorRole: principal.roles[0] ?? "ar_collector",
      action: `control_center.execution.decision_${input.reviewState}`,
      entityType: "control_center_workflow_execution",
      entityId: updated.id,
      before: serializeExecution(input.execution),
      after: serializeExecution(updated),
      metadata: {
        reviewState: input.reviewState,
        reason: input.reason,
      },
    });

    return { execution: updated, activityEntry };
  }

  private applyManualStateChange(
    principal: Principal,
    execution: ControlCenterWorkflowExecution,
    input: {
      action: Extract<ManualWorkflowAction, "resume" | "pause" | "opt_out" | "move_track">;
      currentTrack: ControlCenterWorkflowTrack;
      reason: string;
      effectiveUntil?: string;
      lockMode: "auto" | "manual_locked";
    },
  ): ManualWorkflowMutationResult {
    const occurredAt = this.now();
    const actor = principalToActor(principal);
    const updated = applyControlCenterWorkflowDecision(execution, {
      actor,
      at: occurredAt,
      decision: {
        action:
          input.action === "move_track"
            ? "switch_track"
            : input.action === "opt_out"
              ? "opt_out"
              : input.action === "pause"
                ? "pause"
                : "continue",
        reason: input.reason,
        confidence: 1,
        ...(input.effectiveUntil ? { effectiveUntil: input.effectiveUntil } : {}),
        ...(input.action === "move_track" ? { targetTrack: input.currentTrack } : {}),
        requiresHumanReview: false,
        rationaleSummary: input.reason,
        reasoningMetadata: {
          source: "manual_control",
          manualAction: input.action,
          actorId: principal.id,
          actorRoles: principal.roles,
        },
      },
      metadata: {
        ...execution.metadata,
        controlMode: input.lockMode,
        ...(input.lockMode === "manual_locked"
          ? {
              manualLockReason: input.reason,
              manualLockActorId: principal.id,
              manualLockActorRole: principal.roles[0] ?? "ar_collector",
              manualLockAt: occurredAt,
            }
          : {
              manualLockReason: undefined,
              manualLockActorId: undefined,
              manualLockActorRole: undefined,
              manualLockAt: undefined,
            }),
        lastChangedBy: "human",
        lastManualAction: input.action,
      },
    });

    if (input.lockMode === "auto") {
      delete updated.metadata.manualLockReason;
      delete updated.metadata.manualLockActorId;
      delete updated.metadata.manualLockActorRole;
      delete updated.metadata.manualLockAt;
    }

    this.repository.save(updated);

    const activityEntry = this.audit.append({
      actorId: principal.id,
      actorRole: principal.roles[0] ?? "ar_collector",
      action: `control_center.execution.manual_${input.action}`,
      entityType: "control_center_workflow_execution",
      entityId: updated.id,
      before: serializeExecution(execution),
      after: serializeExecution(updated),
      metadata: {
        reason: input.reason,
        previousState: execution.status,
        newState: updated.status,
        previousTrack: execution.currentTrack,
        newTrack: updated.currentTrack,
        ...(input.effectiveUntil ? { effectiveUntil: input.effectiveUntil } : {}),
      },
    });

    return { execution: updated, activityEntry };
  }
}

function assertManualPermission(principal: Principal, action: ManualWorkflowAction) {
  switch (action) {
    case "pause":
    case "resume":
    case "mark_reviewed":
      assertAnyRole(principal, ["ar_collector", "ar_manager", "controller", "admin"], { action });
      return;
    case "opt_out":
    case "move_track":
    case "approve_decision":
    case "override_decision":
      assertAnyRole(principal, ["ar_manager", "controller", "admin"], { action });
      return;
  }
}

function principalToActor(principal: Principal): ActorContext {
  return {
    actorId: principal.id,
    actorRole: principal.roles[0] ?? "ar_collector",
  };
}

function serializeExecution(execution: ControlCenterWorkflowExecution) {
  return {
    id: execution.id,
    status: execution.status,
    currentTrack: execution.currentTrack,
    ...(execution.effectiveUntil ? { effectiveUntil: execution.effectiveUntil } : {}),
    ...(execution.lastDecisionAction ? { lastDecisionAction: execution.lastDecisionAction } : {}),
    ...(execution.lastDecisionReason ? { lastDecisionReason: execution.lastDecisionReason } : {}),
    metadata: execution.metadata,
  };
}
