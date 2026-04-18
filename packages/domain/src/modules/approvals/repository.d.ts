import type { ApprovalRequest } from "./schema.js";
export interface ApprovalRequestRepository {
    save(request: ApprovalRequest): Promise<void>;
    get(approvalId: string): Promise<ApprovalRequest | undefined>;
    list(): Promise<ApprovalRequest[]>;
}
export declare class ApprovalRequestNotFoundError extends Error {
    readonly approvalId: string;
    constructor(approvalId: string);
}
//# sourceMappingURL=repository.d.ts.map