import type { ApprovalRequestStatus } from "./schema.js";
export declare class ApprovalPolicyViolationError extends Error {
    readonly details: Record<string, unknown>;
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class ApprovalReopenNotAllowedError extends Error {
    readonly approvalId: string;
    readonly currentStatus: ApprovalRequestStatus;
    constructor(approvalId: string, currentStatus: ApprovalRequestStatus);
}
export declare class InvalidApprovalTransitionError extends Error {
    readonly approvalId: string;
    readonly fromStatus: ApprovalRequestStatus;
    readonly toStatus: ApprovalRequestStatus;
    constructor(params: {
        approvalId: string;
        fromStatus: ApprovalRequestStatus;
        toStatus: ApprovalRequestStatus;
    });
}
export declare class ApprovalEditNotAllowedError extends Error {
    readonly approvalId: string;
    readonly currentStatus: ApprovalRequestStatus;
    constructor(approvalId: string, currentStatus: ApprovalRequestStatus);
}
//# sourceMappingURL=errors.d.ts.map