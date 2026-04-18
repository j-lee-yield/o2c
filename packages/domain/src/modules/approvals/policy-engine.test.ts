import { describe, expect, it } from "vitest";

import { evaluateApprovalRequirement } from "./policy-engine.js";

describe("evaluateApprovalRequirement", () => {
  it("allows low-risk reminders to verified contacts without approval", () => {
    const decision = evaluateApprovalRequirement({
      subject: "outbound_message",
      action: "send_reminder",
      billingAccountId: "billing_1",
      accountTier: "standard",
      verifiedContact: true,
      lowRisk: true,
    });

    expect(decision.requiresApproval).toBe(false);
    expect(decision.autoExecute).toBe(true);
  });

  it("routes strategic disputed outreach to AR manager review", () => {
    const decision = evaluateApprovalRequirement({
      subject: "outbound_message",
      action: "send_reminder",
      billingAccountId: "billing_1",
      accountTier: "strategic",
      hasDisputedInvoice: true,
      verifiedContact: true,
      lowRisk: false,
    });

    expect(decision.requiresApproval).toBe(true);
    expect(decision.assigneeRole).toBe("ar_manager");
    expect(decision.reasonCodes).toContain("strategic_or_vip_account");
    expect(decision.reasonCodes).toContain("disputed_invoice_outreach");
  });

  it("requires approval when message balance or recipient confidence crosses thresholds", () => {
    const decision = evaluateApprovalRequirement({
      subject: "outbound_message",
      action: "grouped_reminder",
      billingAccountId: "billing_1",
      accountTier: "standard",
      balanceCents: 500_000,
      balanceApprovalThresholdCents: 250_000,
      recipientConfidence: 0.41,
      lowRecipientConfidenceThreshold: 0.7,
      groupedReminderAmbiguousEntities: true,
    });

    expect(decision.requiresApproval).toBe(true);
    expect(decision.reasonCodes).toEqual(
      expect.arrayContaining([
        "balance_above_threshold",
        "recipient_confidence_low",
        "ambiguous_grouped_entities",
      ])
    );
  });

  it("allows high-confidence no-regret cash auto-apply", () => {
    const decision = evaluateApprovalRequirement({
      subject: "cash_application",
      action: "cash_auto_apply",
      billingAccountId: "billing_1",
      autoApplyConfidence: 0.98,
      autoApplyConfidenceThreshold: 0.9,
      noRegretAutoApply: true,
      highConfidence: true,
    });

    expect(decision.requiresApproval).toBe(false);
    expect(decision.autoExecute).toBe(true);
  });

  it("requires approval for cash application below threshold and ERP conflict overrides", () => {
    const cashDecision = evaluateApprovalRequirement({
      subject: "cash_application",
      action: "cash_auto_apply",
      billingAccountId: "billing_1",
      autoApplyConfidence: 0.62,
      autoApplyConfidenceThreshold: 0.9,
      noRegretAutoApply: false,
      highConfidence: false,
    });
    const erpDecision = evaluateApprovalRequirement({
      subject: "erp_writeback_override",
      action: "erp_writeback_override",
      billingAccountId: "billing_1",
      manualOverrideErpWritebackConflict: true,
    });

    expect(cashDecision.requiresApproval).toBe(true);
    expect(cashDecision.assigneeRole).toBe("ar_manager");
    expect(cashDecision.reasonCodes).toContain("cash_application_below_auto_apply_threshold");
    expect(erpDecision.requiresApproval).toBe(true);
    expect(erpDecision.assigneeRole).toBe("controller");
    expect(erpDecision.reasonCodes).toContain("erp_writeback_conflict_override");
  });
});
