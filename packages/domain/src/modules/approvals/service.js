import { assertPermission, hasPermission } from "@o2c/auth";
import { createActivityLogDomainHelpers } from "@o2c/audit";
import { RoleAwareApprovalPolicyEngine, assertPolicyAllows, } from "./policy-engine.js";
import { ApprovalEditNotAllowedError, ApprovalReopenNotAllowedError, InvalidApprovalTransitionError, } from "./errors.js";
import { createApprovalRequest, isTerminalApprovalStatus, } from "./schema.js";
const transitionMap = {
    draft: ["pending_approval", "cancelled"],
    pending_approval: ["approved", "rejected", "cancelled"],
    reopened: ["pending_approval", "cancelled"],
    approved: [],
    rejected: [],
    cancelled: [],
};
export class ApprovalRequestService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    create(principal, input) {
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
    submit(principal, approval) {
        assertPermission(principal, "approval.request.create");
        return this.transition(principal, approval, "pending_approval", "approval.request.submitted");
    }
    edit(principal, approval, input) {
        assertPermission(principal, "approval.request.create");
        if (approval.status !== "draft" &&
            approval.status !== "pending_approval" &&
            approval.status !== "reopened" &&
            approval.status !== "rejected") {
            throw new ApprovalEditNotAllowedError(approval.id, approval.status);
        }
        if (approval.requestedBy !== principal.id &&
            !hasPermission(principal, "approval.request.review")) {
            throw new ApprovalEditNotAllowedError(approval.id, approval.status);
        }
        const { resolvedAt: _resolvedAt, terminalAt: _terminalAt, ...baseApproval } = approval;
        const edited = {
            ...baseApproval,
            status: "draft",
            updatedAt: this.now(),
            version: approval.version + 1,
            payload: serializeApprovalInput(input.payload),
            policyContext: input.policyContext !== undefined
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
    decide(principal, approval, nextStatus) {
        assertPermission(principal, "approval.request.review");
        const action = nextStatus === "approved"
            ? "approval.request.approved"
            : "approval.request.rejected";
        return this.transition(principal, approval, nextStatus, action);
    }
    cancel(principal, approval) {
        assertPermission(principal, "approval.request.create");
        return this.transition(principal, approval, "cancelled", "approval.request.cancelled");
    }
    manualReopen(principal, approval, input) {
        assertPermission(principal, "approval.request.reopen_terminal");
        if (!isTerminalApprovalStatus(approval.status)) {
            throw new ApprovalReopenNotAllowedError(approval.id, approval.status);
        }
        const { resolvedAt: _resolvedAt, terminalAt: _terminalAt, ...baseApproval } = approval;
        const reopened = {
            ...baseApproval,
            status: "reopened",
            reopenedFromStatus: approval.status,
            updatedAt: this.now(),
            version: approval.version + 1,
        };
        this.appendAudit(principal, "approval.request.reopened", approval.id, approval, reopened, {
            reason: input.reason,
            reopenedFromStatus: approval.status,
        });
        return reopened;
    }
    transition(principal, approval, nextStatus, action) {
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
        const { resolvedAt: _resolvedAt, terminalAt: _terminalAt, ...baseApproval } = approval;
        const transitioned = {
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
    static createAuditHelpers(input) {
        return createActivityLogDomainHelpers(input);
    }
    appendAudit(principal, action, entityId, before, after, metadata) {
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
    now() {
        return this.deps.now?.() ?? new Date().toISOString();
    }
    idGenerator() {
        return this.deps.idGenerator?.() ?? `approval_${Date.now()}`;
    }
    policyEngine() {
        return this.deps.policyEngine ?? new RoleAwareApprovalPolicyEngine();
    }
}
function serializeApproval(approval) {
    return JSON.parse(JSON.stringify(approval));
}
function serializeApprovalInput(input) {
    return JSON.parse(JSON.stringify(input));
}
//# sourceMappingURL=service.js.map