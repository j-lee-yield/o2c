import { describe, expect, it } from "vitest";

import { normalizeVoicePostCallOutcome } from "./voice-post-call-outcome-normalizer.js";

describe("normalizeVoicePostCallOutcome", () => {
  it("captures flat Retell dispute extracted variables", () => {
    const outcome = normalizeVoicePostCallOutcome({
      invoiceIds: ["fallback_invoice"],
      defaultCurrency: "PHP",
      occurredAt: "2026-05-21T09:00:00.000Z",
      transcriptSummary: "Customer disputed the amount for invoice MCC-OD-001.",
      extractedVariables: {
        outcome_type: "dispute",
        dispute_raised: "true",
        disputed_invoice_ids: "invoice_1, invoice_2",
        dispute_type: "billing",
        dispute_scope: "invoice_subset",
        dispute_summary: "Customer says the billed amount is incorrect.",
        dispute_amount_cents: "39760000",
        dispute_currency: "PHP",
        frozen_scope_summary: "Freeze the disputed invoice subset.",
        next_action_after_dispute: "create_dispute_review_task"
      }
    });

    expect(outcome.outcome).toBe("dispute");
    expect(outcome.dispute).toMatchObject({
      invoiceIds: ["invoice_1", "invoice_2"],
      disputeType: "billing",
      disputeScope: "invoice_subset",
      summary: "Customer says the billed amount is incorrect.",
      amountCents: 39760000,
      currency: "PHP",
      frozenScopeSummary: "Freeze the disputed invoice subset.",
      nextActionAfterDispute: "create_dispute_review_task"
    });
  });

  it("captures flat Retell promise and follow-up extracted variables", () => {
    const outcome = normalizeVoicePostCallOutcome({
      invoiceIds: ["fallback_invoice"],
      defaultCurrency: "PHP",
      occurredAt: "2026-05-21T09:00:00.000Z",
      extractedVariables: {
        outcome_type: "mixed",
        promised_date: "2026-05-26",
        promised_amount_cents: "15000000",
        promise_invoice_ids: "invoice_1",
        promise_status: "new",
        promise_notes: "Customer committed to settle next week.",
        paid_already: "true",
        paid_invoice_ids: "invoice_2",
        paid_amount_cents: "6825000",
        payment_reference: "DEP-123",
        callback_requested: "true",
        callback_due_at: "2026-05-22T01:00:00.000Z",
        stop_calls_requested: "true"
      }
    });

    expect(outcome.outcome).toBe("mixed");
    expect(outcome.promiseUpdate).toMatchObject({
      invoiceIds: ["invoice_1"],
      promisedDate: "2026-05-26",
      promisedAmountCents: 15000000,
      status: "new",
      notes: "Customer committed to settle next week."
    });
    expect(outcome.paidAlreadyClaim).toMatchObject({
      invoiceIds: ["invoice_2"],
      amountCents: 6825000,
      reference: "DEP-123"
    });
    expect(outcome.callback).toMatchObject({
      dueAt: "2026-05-22T01:00:00.000Z"
    });
    expect(outcome.followUpActions[0]).toMatchObject({
      title: "Complete customer support request",
      description: "Customer requested that calls stop; review outreach preferences before further collections calls."
    });
  });
});
