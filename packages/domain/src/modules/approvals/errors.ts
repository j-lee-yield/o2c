import type { ApprovalRequestStatus } from "./schema.js";

export class ApprovalPolicyViolationError extends Error {
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApprovalPolicyViolationError";
    this.details = details;
  }
}

export class ApprovalReopenNotAllowedError extends Error {
  readonly approvalId: string;
  readonly currentStatus: ApprovalRequestStatus;

  constructor(approvalId: string, currentStatus: ApprovalRequestStatus) {
    super(`Approval "${approvalId}" cannot be reopened from status "${currentStatus}".`);
    this.name = "ApprovalReopenNotAllowedError";
    this.approvalId = approvalId;
    this.currentStatus = currentStatus;
  }
}

export class InvalidApprovalTransitionError extends Error {
  readonly approvalId: string;
  readonly fromStatus: ApprovalRequestStatus;
  readonly toStatus: ApprovalRequestStatus;

  constructor(params: {
    approvalId: string;
    fromStatus: ApprovalRequestStatus;
    toStatus: ApprovalRequestStatus;
  }) {
    super(
      `Approval "${params.approvalId}" cannot transition from "${params.fromStatus}" to "${params.toStatus}".`
    );
    this.name = "InvalidApprovalTransitionError";
    this.approvalId = params.approvalId;
    this.fromStatus = params.fromStatus;
    this.toStatus = params.toStatus;
  }
}

export class ApprovalEditNotAllowedError extends Error {
  readonly approvalId: string;
  readonly currentStatus: ApprovalRequestStatus;

  constructor(approvalId: string, currentStatus: ApprovalRequestStatus) {
    super(`Approval "${approvalId}" cannot be edited while in status "${currentStatus}".`);
    this.name = "ApprovalEditNotAllowedError";
    this.approvalId = approvalId;
    this.currentStatus = currentStatus;
  }
}
