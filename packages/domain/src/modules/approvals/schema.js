import { createEntityMetadata } from "../../shared/types.js";
export const approvalRequestStatuses = [
    "draft",
    "pending_approval",
    "approved",
    "rejected",
    "cancelled",
    "reopened",
];
export const approvalRequestSchema = {
    tableName: "approval_requests",
    fields: {
        id: { type: "string", required: true },
        requestType: { type: "string", required: true },
        status: { type: "enum", values: approvalRequestStatuses, required: true },
        requestedBy: { type: "string", required: true },
        assigneeRole: { type: "string", required: false },
        currentStep: { type: "string", required: false },
        requestedAt: { type: "string", required: true },
        resolvedAt: { type: "string", required: false },
        terminalAt: { type: "string", required: false },
        reopenedFromStatus: { type: "string", required: false },
        payload: { type: "json", required: true },
        policyContext: { type: "json", required: true },
        version: { type: "number", required: true },
        createdAt: { type: "string", required: true },
        updatedAt: { type: "string", required: true },
    },
};
export function isTerminalApprovalStatus(status) {
    return status === "approved" || status === "rejected" || status === "cancelled";
}
export function createApprovalRequest(params) {
    return {
        id: params.id,
        ...createEntityMetadata({
            at: params.requestedAt,
            actorId: params.requestedBy,
            actorRole: "user"
        }),
        requestType: params.requestType,
        status: "draft",
        requestedBy: params.requestedBy,
        requestedAt: params.requestedAt,
        payload: cloneJson(params.payload),
        policyContext: cloneJson(params.policyContext ?? {}),
        ...(params.assigneeRole ? { assigneeRole: params.assigneeRole } : {}),
        ...(params.currentStep ? { currentStep: params.currentStep } : {}),
    };
}
function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}
//# sourceMappingURL=schema.js.map