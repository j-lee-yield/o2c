import type { Principal } from "@o2c/auth";
import { assertPermission, hasPermission, type Role } from "@o2c/auth";
import type { ImmutableActivityLogEntry } from "@o2c/audit";
import { createActivityLogDomainHelpers } from "@o2c/audit";

import {
  RoleAwareApprovalPolicyEngine,
  assertPolicyAllows,
  type ApprovalPolicyEngine,
} from "./policy-engine.js";
import {
  ApprovalEditNotAllowedError,
  ApprovalReopenNotAllowedError,
  InvalidApprovalTransitionError,
} from "./errors.js";
import {
  createApprovalRequest,
  isTerminalApprovalStatus,
  type ApprovalRequest,
  type ApprovalRequestStatus,
} from "./schema.js";

const transitionMap: Record<ApprovalRequestStatus, ApprovalRequestStatus[]> = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "rejected", "cancelled"],
  reopened: ["pending_approval", "cancelled"],
  approved: [],
  rejected: [],
  cancelled: [],
};

export interface ApprovalAuditHelpers {
  append: (input: {
    actorId: string;
    actorRole: Role | "system";
    action: string;
    entityType: string;
    entityId: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    metadata: Record<string, unknown>;
  }) => ImmutableActivityLogEntry;
}

export class ApprovalRequestService {
  constructor(
    private readonly deps: {
      audit: ApprovalAuditHelpers;
      now?: () => string;
      idGenerator?: () => string;
      policyEngine?: ApprovalPolicyEngine;
    }
  ) {}

  create(principal: Principal, input: {
    requestType: string;
    payload: Record<string, unknown>;
    assigneeRole?: Role;
    currentStep?: string;
    policyContext?: Record<string, unknown>;
  }): ApprovalRequest {
    assertPermission(principal, "approval.request.create");
    const timestamp = this.now();
    const approval = createApprovalRequest({
      id: this.idGenerator(),
      requestType: input.requestType,
      requestedBy: principal.id,
      requestedAt: timestamp,
      payload: input.payload,
      ...(input.assigneeRole ? { assigneeRole: input.assigneeRole } : {}),
      ...(input.currentStep ? { currentStep: input.currentStep } : {}),
      ...(input.policyContext ? { policyContext: input.policyContext } : {}),
    });

    this.appendAudit(principal, "approval.request.created", approval.id, null, approval, {
      status: approval.status,
    });

    return approval;
  }

  submit(principal: Principal, approval: ApprovalRequest): ApprovalRequest {
    assertPermission(principal, "approval.request.create");
    return this.transition(principal, approval, "pending_approval", "approval.request.submitted");
  }

  edit(
    principal: Principal,
    approval: ApprovalRequest,
    input: {
      payload: Record<string, unknown>;
      policyContext?: Record<string, unknown>;
      currentStep?: string;
    }
  ): ApprovalRequest {
    assertPermission(principal, "approval.request.create");
    if (
      approval.status !== "draft" &&
      approval.status !== "pending_approval" &&
      approval.status !== "reopened" &&
      approval.status !== "rejected"
    ) {
      throw new ApprovalEditNotAllowedError(approval.id, approval.status);
    }
    if (
      approval.requestedBy !== principal.id &&
      !hasPermission(principal, "approval.request.review")
    ) {
      throw new ApprovalEditNotAllowedError(approval.id, approval.status);
    }

    const { resolvedAt: _resolvedAt, terminalAt: _terminalAt, ...baseApproval } = approval;
    const edited: ApprovalRequest = {
      ...baseApproval,
      status: "draft",
      updatedAt: this.now(),
      version: approval.version + 1,
      payload: serializeApprovalInput(input.payload),
      policyContext:
        input.policyContext !== undefined
          ? serializeApprovalInput(input.policyContext)
          : approval.policyContext,
      currentStep: input.currentStep ?? "awaiting_resubmission",
    };

    this.appendAudit(principal, "approval.request.edited", approval.id, approval, edited, {
      fromStatus: approval.status,
      toStatus: edited.status,
    });

    return edited;
  }

  decide(
    principal: Principal,
    approval: ApprovalRequest,
    nextStatus: Extract<ApprovalRequestStatus, "approved" | "rejected">
  ): ApprovalRequest {
    assertPermission(principal, "approval.request.review");
    const action =
      nextStatus === "approved"
        ? "approval.request.approved"
        : "approval.request.rejected";

    return this.transition(principal, approval, nextStatus, action);
  }

  cancel(principal: Principal, approval: ApprovalRequest): ApprovalRequest {
    assertPermission(principal, "approval.request.create");
    return this.transition(principal, approval, "cancelled", "approval.request.cancelled");
  }

  manualReopen(
    principal: Principal,
    approval: ApprovalRequest,
    input: { reason: string }
  ): ApprovalRequest {
    assertPermission(principal, "approval.request.reopen_terminal");

    if (!isTerminalApprovalStatus(approval.status)) {
      throw new ApprovalReopenNotAllowedError(approval.id, approval.status);
    }

    const { resolvedAt: _resolvedAt, terminalAt: _terminalAt, ...baseApproval } = approval;
    const reopened: ApprovalRequest = {
      ...baseApproval,
      status: "reopened",
      reopenedFromStatus: approval.status,
      updatedAt: this.now(),
      version: approval.version + 1,
    };

    this.appendAudit(
      principal,
      "approval.request.reopened",
      approval.id,
      approval,
      reopened,
      {
        reason: input.reason,
        reopenedFromStatus: approval.status,
      }
    );

    return reopened;
  }

  transition(
    principal: Principal,
    approval: ApprovalRequest,
    nextStatus: ApprovalRequestStatus,
    action: string
  ): ApprovalRequest {
    const allowedStatuses = transitionMap[approval.status] ?? [];
    if (!allowedStatuses.includes(nextStatus)) {
      throw new InvalidApprovalTransitionError({
        approvalId: approval.id,
        fromStatus: approval.status,
        toStatus: nextStatus,
      });
    }

    assertPolicyAllows(this.policyEngine(), {
      principal,
      approvalRequest: approval,
      nextStatus,
    });

    const timestamp = this.now();
    const {
      resolvedAt: _resolvedAt,
      terminalAt: _terminalAt,
      ...baseApproval
    } = approval;
    const transitioned: ApprovalRequest = {
      ...baseApproval,
      status: nextStatus,
      updatedAt: timestamp,
      version: approval.version + 1,
      ...(isTerminalApprovalStatus(nextStatus) ? { resolvedAt: timestamp } : {}),
      ...(isTerminalApprovalStatus(nextStatus) ? { terminalAt: timestamp } : {}),
    };

    this.appendAudit(principal, action, approval.id, approval, transitioned, {
      fromStatus: approval.status,
      toStatus: nextStatus,
    });

    return transitioned;
  }

  static createAuditHelpers(input: Parameters<typeof createActivityLogDomainHelpers>[0]) {
    return createActivityLogDomainHelpers(input);
  }

  private appendAudit(
    principal: Principal,
    action: string,
    entityId: string,
    before: ApprovalRequest | null,
    after: ApprovalRequest,
    metadata: Record<string, unknown>
  ) {
    this.deps.audit.append({
      actorId: principal.id,
      actorRole: principal.roles[0] ?? "ar_collector",
      action,
      entityType: "approval_request",
      entityId,
      before: before ? serializeApproval(before) : null,
      after: serializeApproval(after),
      metadata,
    });
  }

  private now() {
    return this.deps.now?.() ?? new Date().toISOString();
  }

  private idGenerator() {
    return this.deps.idGenerator?.() ?? `approval_${Date.now()}`;
  }

  private policyEngine() {
    return this.deps.policyEngine ?? new RoleAwareApprovalPolicyEngine();
  }
}

function serializeApproval(approval: ApprovalRequest): Record<string, unknown> {
  return JSON.parse(JSON.stringify(approval)) as Record<string, unknown>;
}

function serializeApprovalInput(input: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
}
