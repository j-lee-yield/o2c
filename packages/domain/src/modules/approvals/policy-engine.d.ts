import type { Principal, Role } from "@o2c/auth";
import type { ApprovalRequest, ApprovalRequestStatus } from "./schema.js";
export interface ApprovalPolicyContext {
    principal: Principal;
    approvalRequest: ApprovalRequest;
    nextStatus: ApprovalRequestStatus;
}
export interface ApprovalPolicyDecision {
    allowed: boolean;
    reasons: string[];
}
export interface ApprovalPolicyEngine {
    evaluateTransition(context: ApprovalPolicyContext): ApprovalPolicyDecision;
}
export declare class NoopApprovalPolicyEngine implements ApprovalPolicyEngine {
    evaluateTransition(_context: ApprovalPolicyContext): ApprovalPolicyDecision;
}
export declare class RoleAwareApprovalPolicyEngine implements ApprovalPolicyEngine {
    evaluateTransition(context: ApprovalPolicyContext): ApprovalPolicyDecision;
}
export type ApprovalPolicySubject = "outbound_message" | "cash_application" | "erp_writeback_override";
export type ApprovalPolicyAction = "send_reminder" | "invoice_resend" | "request_remittance_advice" | "broken_promise_follow_up" | "payment_plan_discussion" | "discount_settlement_writeoff_message" | "grouped_reminder" | "cash_auto_apply" | "erp_writeback_override";
export interface ApprovalRequirementContext {
    subject: ApprovalPolicySubject;
    action: ApprovalPolicyAction;
    billingAccountId: string;
    parentAccountId?: string;
    branchIds?: string[];
    accountTier?: "standard" | "strategic";
    isVipAccount?: boolean;
    isNewAccount?: boolean;
    isFirstOutboundContact?: boolean;
    hasDisputedInvoice?: boolean;
    isPaymentPlanDiscussion?: boolean;
    hasDiscountSettlementWriteoffLanguage?: boolean;
    balanceCents?: number;
    balanceApprovalThresholdCents?: number;
    recipientConfidence?: number;
    lowRecipientConfidenceThreshold?: number;
    groupedReminderAmbiguousEntities?: boolean;
    autoApplyConfidence?: number;
    autoApplyConfidenceThreshold?: number;
    noRegretAutoApply?: boolean;
    manualOverrideErpWritebackConflict?: boolean;
    verifiedContact?: boolean;
    lowRisk?: boolean;
    highConfidence?: boolean;
    policyMetadata?: Record<string, unknown>;
}
export interface ApprovalRequirementDecision {
    requiresApproval: boolean;
    autoExecute: boolean;
    requestType: string;
    assigneeRole?: Role;
    priority: "high" | "normal";
    reasonCodes: string[];
    summary: string;
    policyContext: Record<string, unknown>;
}
export declare function evaluateApprovalRequirement(input: ApprovalRequirementContext): ApprovalRequirementDecision;
export declare function assertPolicyAllows(policyEngine: ApprovalPolicyEngine, context: ApprovalPolicyContext): void;
//# sourceMappingURL=policy-engine.d.ts.map