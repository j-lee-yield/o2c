import type { ApprovalRequest } from "./schema.js";

export interface ApprovalQueueItem {
  approvalId: string;
  requestType: string;
  requestedBy: string;
  requestedAt: string;
  status: ApprovalRequest["status"];
  priority: "high" | "normal";
  assigneeRole?: ApprovalRequest["assigneeRole"];
  currentStep?: string;
  reasonCodes: string[];
  summary: string;
}

export function buildApprovalQueue(requests: ApprovalRequest[]): ApprovalQueueItem[] {
  return requests
    .filter(
      (request) => request.status === "pending_approval" || request.status === "reopened"
    )
    .map((request) => {
      const priority: ApprovalQueueItem["priority"] =
        request.assigneeRole === "controller" ||
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
          ? request.policyContext.reasonCodes.filter((reason): reason is string => typeof reason === "string")
          : [],
        summary:
          typeof request.payload.summary === "string"
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
