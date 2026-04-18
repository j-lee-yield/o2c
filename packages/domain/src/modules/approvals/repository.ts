import type { ApprovalRequest } from "./schema.js";

export interface ApprovalRequestRepository {
  save(request: ApprovalRequest): Promise<void>;
  get(approvalId: string): Promise<ApprovalRequest | undefined>;
  list(): Promise<ApprovalRequest[]>;
}

export class ApprovalRequestNotFoundError extends Error {
  readonly approvalId: string;

  constructor(approvalId: string) {
    super(`Approval "${approvalId}" was not found.`);
    this.name = "ApprovalRequestNotFoundError";
    this.approvalId = approvalId;
  }
}
