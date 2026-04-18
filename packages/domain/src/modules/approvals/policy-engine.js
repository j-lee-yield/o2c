import { ApprovalPolicyViolationError } from "./errors.js";
export class NoopApprovalPolicyEngine {
    evaluateTransition(_context) {
        return { allowed: true, reasons: [] };
    }
}
export class RoleAwareApprovalPolicyEngine {
    evaluateTransition(context) {
        if ((context.nextStatus === "approved" || context.nextStatus === "rejected") &&
            context.approvalRequest.assigneeRole &&
            !principalCanReviewAssignedApproval(context.principal, context.approvalRequest.assigneeRole)) {
            return {
                allowed: false,
                reasons: [`assignee_role_required:${context.approvalRequest.assigneeRole}`],
            };
        }
        return { allowed: true, reasons: [] };
    }
}
export function evaluateApprovalRequirement(input) {
    const policyContext = buildPolicyContext(input);
    const reasonCodes = [];
    if (input.isFirstOutboundContact || input.isNewAccount) {
        reasonCodes.push("first_outbound_new_account");
    }
    if (input.accountTier === "strategic" || input.isVipAccount) {
        reasonCodes.push("strategic_or_vip_account");
    }
    if (input.hasDisputedInvoice) {
        reasonCodes.push("disputed_invoice_outreach");
    }
    if (input.isPaymentPlanDiscussion) {
        reasonCodes.push("payment_plan_discussion");
    }
    if (input.hasDiscountSettlementWriteoffLanguage) {
        reasonCodes.push("discount_settlement_writeoff_language");
    }
    if (input.balanceCents !== undefined &&
        input.balanceApprovalThresholdCents !== undefined &&
        input.balanceCents > input.balanceApprovalThresholdCents) {
        reasonCodes.push("balance_above_threshold");
    }
    if (input.recipientConfidence !== undefined &&
        input.lowRecipientConfidenceThreshold !== undefined &&
        input.recipientConfidence < input.lowRecipientConfidenceThreshold) {
        reasonCodes.push("recipient_confidence_low");
    }
    if (input.groupedReminderAmbiguousEntities) {
        reasonCodes.push("ambiguous_grouped_entities");
    }
    if (input.subject === "cash_application" &&
        input.autoApplyConfidence !== undefined &&
        input.autoApplyConfidenceThreshold !== undefined &&
        input.autoApplyConfidence < input.autoApplyConfidenceThreshold) {
        reasonCodes.push("cash_application_below_auto_apply_threshold");
    }
    if (input.manualOverrideErpWritebackConflict) {
        reasonCodes.push("erp_writeback_conflict_override");
    }
    if (reasonCodes.length > 0) {
        return {
            requiresApproval: true,
            autoExecute: false,
            requestType: approvalRequestTypeFor(input),
            assigneeRole: approverRoleFor(input, reasonCodes),
            priority: reasonCodes.some((reason) => [
                "strategic_or_vip_account",
                "discount_settlement_writeoff_language",
                "erp_writeback_conflict_override",
            ].includes(reason))
                ? "high"
                : "normal",
            reasonCodes,
            summary: buildApprovalSummary(input, reasonCodes),
            policyContext,
        };
    }
    const autoExecute = canAutoExecuteWithoutApproval(input);
    return {
        requiresApproval: false,
        autoExecute,
        requestType: approvalRequestTypeFor(input),
        priority: "normal",
        reasonCodes: [],
        summary: autoExecute
            ? buildAutoExecutionSummary(input)
            : buildApprovalSummary(input, ["manual_review_required"]),
        policyContext,
    };
}
export function assertPolicyAllows(policyEngine, context) {
    const decision = policyEngine.evaluateTransition(context);
    if (!decision.allowed) {
        throw new ApprovalPolicyViolationError("Approval transition blocked by policy engine.", {
            approvalId: context.approvalRequest.id,
            currentStatus: context.approvalRequest.status,
            nextStatus: context.nextStatus,
            principalId: context.principal.id,
            principalRoles: context.principal.roles,
            reasons: decision.reasons,
        });
    }
}
function principalCanReviewAssignedApproval(principal, assigneeRole) {
    return principal.roles.includes("admin") || principal.roles.includes(assigneeRole);
}
function approvalRequestTypeFor(input) {
    switch (input.subject) {
        case "cash_application":
            return "cash_application_review";
        case "erp_writeback_override":
            return "erp_writeback_override_review";
        case "outbound_message":
        default:
            if (input.action === "invoice_resend") {
                return "collections_document_resend";
            }
            return "collections_outreach_review";
    }
}
function approverRoleFor(input, reasonCodes) {
    if (reasonCodes.includes("discount_settlement_writeoff_language")) {
        return "controller";
    }
    if (reasonCodes.includes("strategic_or_vip_account")) {
        return "ar_manager";
    }
    if (reasonCodes.includes("erp_writeback_conflict_override")) {
        return "controller";
    }
    if (input.subject === "cash_application") {
        return "ar_manager";
    }
    return "ar_manager";
}
function buildApprovalSummary(input, reasonCodes) {
    const subject = input.subject === "cash_application"
        ? "cash application"
        : input.subject === "erp_writeback_override"
            ? "ERP writeback override"
            : "outreach";
    return `Approval required for ${subject}: ${reasonCodes.join(", ")}.`;
}
function buildAutoExecutionSummary(input) {
    switch (input.action) {
        case "invoice_resend":
            return "Invoice resend may auto-send to a verified contact.";
        case "request_remittance_advice":
            return "Remittance advice request may auto-send.";
        case "broken_promise_follow_up":
            return "Broken-promise follow-up may auto-send.";
        case "cash_auto_apply":
            return "Cash application may auto-execute under no-regret rules.";
        default:
            return "Action may auto-execute without approval.";
    }
}
function canAutoExecuteWithoutApproval(input) {
    if (input.subject === "cash_application") {
        return Boolean(input.action === "cash_auto_apply" &&
            input.noRegretAutoApply &&
            input.highConfidence &&
            input.autoApplyConfidence !== undefined &&
            input.autoApplyConfidenceThreshold !== undefined &&
            input.autoApplyConfidence >= input.autoApplyConfidenceThreshold);
    }
    if (input.subject === "erp_writeback_override") {
        return false;
    }
    if (input.action === "request_remittance_advice") {
        return true;
    }
    if (input.action === "invoice_resend") {
        return Boolean(input.verifiedContact);
    }
    if (input.action === "broken_promise_follow_up") {
        return Boolean(input.verifiedContact && input.accountTier !== "strategic" && !input.hasDisputedInvoice);
    }
    return Boolean(input.action === "send_reminder" && input.lowRisk && input.verifiedContact);
}
function buildPolicyContext(input) {
    return {
        subject: input.subject,
        action: input.action,
        billingAccountId: input.billingAccountId,
        ...(input.parentAccountId ? { parentAccountId: input.parentAccountId } : {}),
        ...(input.branchIds ? { branchIds: [...input.branchIds] } : {}),
        ...(input.accountTier ? { accountTier: input.accountTier } : {}),
        ...(input.isVipAccount !== undefined ? { isVipAccount: input.isVipAccount } : {}),
        ...(input.isNewAccount !== undefined ? { isNewAccount: input.isNewAccount } : {}),
        ...(input.isFirstOutboundContact !== undefined
            ? { isFirstOutboundContact: input.isFirstOutboundContact }
            : {}),
        ...(input.hasDisputedInvoice !== undefined
            ? { hasDisputedInvoice: input.hasDisputedInvoice }
            : {}),
        ...(input.balanceCents !== undefined ? { balanceCents: input.balanceCents } : {}),
        ...(input.balanceApprovalThresholdCents !== undefined
            ? { balanceApprovalThresholdCents: input.balanceApprovalThresholdCents }
            : {}),
        ...(input.recipientConfidence !== undefined
            ? { recipientConfidence: input.recipientConfidence }
            : {}),
        ...(input.lowRecipientConfidenceThreshold !== undefined
            ? { lowRecipientConfidenceThreshold: input.lowRecipientConfidenceThreshold }
            : {}),
        ...(input.groupedReminderAmbiguousEntities !== undefined
            ? { groupedReminderAmbiguousEntities: input.groupedReminderAmbiguousEntities }
            : {}),
        ...(input.autoApplyConfidence !== undefined
            ? { autoApplyConfidence: input.autoApplyConfidence }
            : {}),
        ...(input.autoApplyConfidenceThreshold !== undefined
            ? { autoApplyConfidenceThreshold: input.autoApplyConfidenceThreshold }
            : {}),
        ...(input.noRegretAutoApply !== undefined ? { noRegretAutoApply: input.noRegretAutoApply } : {}),
        ...(input.manualOverrideErpWritebackConflict !== undefined
            ? { manualOverrideErpWritebackConflict: input.manualOverrideErpWritebackConflict }
            : {}),
        ...(input.verifiedContact !== undefined ? { verifiedContact: input.verifiedContact } : {}),
        ...(input.lowRisk !== undefined ? { lowRisk: input.lowRisk } : {}),
        ...(input.highConfidence !== undefined ? { highConfidence: input.highConfidence } : {}),
        ...(input.policyMetadata ? { policyMetadata: input.policyMetadata } : {}),
    };
}
//# sourceMappingURL=policy-engine.js.map