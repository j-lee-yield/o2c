export function buildApprovalQueue(requests) {
    return requests
        .filter((request) => request.status === "pending_approval" || request.status === "reopened")
        .map((request) => {
        const priority = request.assigneeRole === "controller" ||
            request.requestType === "collections_exception_resolution"
            ? "high"
            : "normal";
        return {
            approvalId: request.id,
            requestType: request.requestType,
            requestedBy: request.requestedBy,
            requestedAt: request.requestedAt,
            status: request.status,
            ...(request.assigneeRole ? { assigneeRole: request.assigneeRole } : {}),
            ...(request.currentStep ? { currentStep: request.currentStep } : {}),
            priority,
            reasonCodes: Array.isArray(request.policyContext.reasonCodes)
                ? request.policyContext.reasonCodes.filter((reason) => typeof reason === "string")
                : [],
            summary: typeof request.payload.summary === "string"
                ? request.payload.summary
                : `Approval needed for ${request.requestType}.`
        };
    })
        .sort((left, right) => {
        if (left.priority !== right.priority) {
            return left.priority === "high" ? -1 : 1;
        }
        return left.requestedAt.localeCompare(right.requestedAt);
    });
}
//# sourceMappingURL=queue.js.map