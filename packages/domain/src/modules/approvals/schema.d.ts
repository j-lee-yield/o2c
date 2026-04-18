import { type DomainEntity } from "../../shared/types.js";
import type { Role } from "@o2c/auth";
export declare const approvalRequestStatuses: readonly ["draft", "pending_approval", "approved", "rejected", "cancelled", "reopened"];
export type ApprovalRequestStatus = "draft" | "pending_approval" | "approved" | "rejected" | "cancelled" | "reopened";
export type TerminalApprovalRequestStatus = "approved" | "rejected" | "cancelled";
export interface ApprovalRequest extends DomainEntity {
    requestType: string;
    status: ApprovalRequestStatus;
    requestedBy: string;
    assigneeRole?: Role;
    currentStep?: string;
    requestedAt: string;
    resolvedAt?: string;
    terminalAt?: string;
    reopenedFromStatus?: TerminalApprovalRequestStatus;
    payload: Record<string, unknown>;
    policyContext: Record<string, unknown>;
    version: number;
}
export declare const approvalRequestSchema: {
    readonly tableName: "approval_requests";
    readonly fields: {
        readonly id: {
            readonly type: "string";
            readonly required: true;
        };
        readonly requestType: {
            readonly type: "string";
            readonly required: true;
        };
        readonly status: {
            readonly type: "enum";
            readonly values: readonly ["draft", "pending_approval", "approved", "rejected", "cancelled", "reopened"];
            readonly required: true;
        };
        readonly requestedBy: {
            readonly type: "string";
            readonly required: true;
        };
        readonly assigneeRole: {
            readonly type: "string";
            readonly required: false;
        };
        readonly currentStep: {
            readonly type: "string";
            readonly required: false;
        };
        readonly requestedAt: {
            readonly type: "string";
            readonly required: true;
        };
        readonly resolvedAt: {
            readonly type: "string";
            readonly required: false;
        };
        readonly terminalAt: {
            readonly type: "string";
            readonly required: false;
        };
        readonly reopenedFromStatus: {
            readonly type: "string";
            readonly required: false;
        };
        readonly payload: {
            readonly type: "json";
            readonly required: true;
        };
        readonly policyContext: {
            readonly type: "json";
            readonly required: true;
        };
        readonly version: {
            readonly type: "number";
            readonly required: true;
        };
        readonly createdAt: {
            readonly type: "string";
            readonly required: true;
        };
        readonly updatedAt: {
            readonly type: "string";
            readonly required: true;
        };
    };
};
export declare function isTerminalApprovalStatus(status: ApprovalRequestStatus): status is TerminalApprovalRequestStatus;
export declare function createApprovalRequest(params: {
    id: string;
    requestType: string;
    requestedBy: string;
    requestedAt: string;
    payload: Record<string, unknown>;
    assigneeRole?: Role;
    currentStep?: string;
    policyContext?: Record<string, unknown>;
}): ApprovalRequest;
//# sourceMappingURL=schema.d.ts.map