export class ApprovalPolicyViolationError extends Error {
    details;
    constructor(message, details = {}) {
        super(message);
        this.name = "ApprovalPolicyViolationError";
        this.details = details;
    }
}
export class ApprovalReopenNotAllowedError extends Error {
    approvalId;
    currentStatus;
    constructor(approvalId, currentStatus) {
        super(`Approval "${approvalId}" cannot be reopened from status "${currentStatus}".`);
        this.name = "ApprovalReopenNotAllowedError";
        this.approvalId = approvalId;
        this.currentStatus = currentStatus;
    }
}
export class InvalidApprovalTransitionError extends Error {
    approvalId;
    fromStatus;
    toStatus;
    constructor(params) {
        super(`Approval "${params.approvalId}" cannot transition from "${params.fromStatus}" to "${params.toStatus}".`);
        this.name = "InvalidApprovalTransitionError";
        this.approvalId = params.approvalId;
        this.fromStatus = params.fromStatus;
        this.toStatus = params.toStatus;
    }
}
export class ApprovalEditNotAllowedError extends Error {
    approvalId;
    currentStatus;
    constructor(approvalId, currentStatus) {
        super(`Approval "${approvalId}" cannot be edited while in status "${currentStatus}".`);
        this.name = "ApprovalEditNotAllowedError";
        this.approvalId = approvalId;
        this.currentStatus = currentStatus;
    }
}
//# sourceMappingURL=errors.js.map