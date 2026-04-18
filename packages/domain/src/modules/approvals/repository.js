export class ApprovalRequestNotFoundError extends Error {
    approvalId;
    constructor(approvalId) {
        super(`Approval "${approvalId}" was not found.`);
        this.name = "ApprovalRequestNotFoundError";
        this.approvalId = approvalId;
    }
}
//# sourceMappingURL=repository.js.map