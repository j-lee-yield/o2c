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
export declare function buildApprovalQueue(requests: ApprovalRequest[]): ApprovalQueueItem[];
//# sourceMappingURL=queue.d.ts.map