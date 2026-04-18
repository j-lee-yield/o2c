import type { Role } from "@o2c/auth";
import type { BillingAccount, Contact } from "../accounts/schema.js";
import type { CustomerInvoice } from "../invoices/schema.js";
export type SensitiveActionType = "send_reminder" | "invoice_level_outreach" | "resend_document" | "resolve_payment_exception";
export interface CollectionsApprovalRuleInput {
    actionType: SensitiveActionType;
    account: BillingAccount;
    invoices?: CustomerInvoice[];
    contact?: Pick<Contact, "id" | "isVerified" | "allowAutoSend">;
    lowRisk: boolean;
    aiProposedSend?: boolean;
    exceptionKind?: string;
    balanceApprovalThresholdCents?: number;
    recipientConfidence?: number;
    lowRecipientConfidenceThreshold?: number;
    groupedReminderAmbiguousEntities?: boolean;
    isFirstOutboundContact?: boolean;
}
export interface CollectionsApprovalRuleDecision {
    requiresApproval: boolean;
    autoExecute: boolean;
    approverRole?: Role;
    reasonCode?: string;
    reasonCodes: string[];
    requestType: string;
    summary: string;
    priority: "high" | "normal";
    policyContext: Record<string, unknown>;
}
export declare function evaluateCollectionsApprovalRule(input: CollectionsApprovalRuleInput): CollectionsApprovalRuleDecision;
//# sourceMappingURL=rules-engine.d.ts.map