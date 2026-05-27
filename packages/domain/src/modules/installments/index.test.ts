import { describe, expect, it } from "vitest";

import {
  InstallmentLineTransitionService,
  allocatePaymentToInstallmentLines,
  buildInstallmentPlanSummary,
  canAutoChaseInstallmentLine,
  createInstallmentLine,
  createPromiseToPayFromReply,
  CrossEntityInstallmentAllocationAmbiguityError,
  DisputedInstallmentLineAutoChaseBlockedError,
  refreshInstallmentLine,
} from "../../index.js";

describe("installment receivables", () => {
  it("transitions installment lines through due, partial, and paid states", () => {
    const transitions = new InstallmentLineTransitionService();
    const baseLine = createInstallmentLine({
      id: "line-1",
      createdAt: "2026-04-01T00:00:00.000Z",
      installmentPlanId: "plan-1",
      billingAccountId: "billing-1",
      currency: "PHP",
      sequenceNumber: 1,
      dueDate: "2026-04-21",
      scheduledAmountCents: 10_000,
      remainingAmountCents: 10_000,
      status: "future",
      metadata: {},
    });

    const due = transitions.transition(baseLine, "due", {
      actorId: "system",
      actorRole: "system",
      occurredAt: "2026-04-21T00:00:00.000Z",
    });
    const partial = transitions.transition({ ...due, paidAmountCents: 2_500, remainingAmountCents: 7_500 }, "partially_paid", {
      actorId: "system",
      actorRole: "system",
      occurredAt: "2026-04-22T00:00:00.000Z",
    });
    const paid = transitions.transition({ ...partial, paidAmountCents: 10_000, remainingAmountCents: 0 }, "paid", {
      actorId: "system",
      actorRole: "system",
      occurredAt: "2026-04-23T00:00:00.000Z",
    });

    expect(due.state).toBe("due");
    expect(partial.state).toBe("partially_paid");
    expect(paid.state).toBe("paid");
  });

  it("ages only overdue installment lines instead of the full invoice balance", () => {
    const lines = [
      createInstallmentLine({
        id: "line-overdue",
        createdAt: "2026-01-01T00:00:00.000Z",
        installmentPlanId: "plan-1",
        billingAccountId: "billing-1",
        currency: "PHP",
        sequenceNumber: 1,
        dueDate: "2026-03-01",
        scheduledAmountCents: 10_000,
        remainingAmountCents: 10_000,
        status: "due",
        metadata: {},
      }),
      createInstallmentLine({
        id: "line-future",
        createdAt: "2026-01-01T00:00:00.000Z",
        installmentPlanId: "plan-1",
        billingAccountId: "billing-1",
        currency: "PHP",
        sequenceNumber: 2,
        dueDate: "2026-06-01",
        scheduledAmountCents: 10_000,
        remainingAmountCents: 10_000,
        status: "future",
        metadata: {},
      }),
    ];

    const summary = buildInstallmentPlanSummary(lines, "2026-04-21T00:00:00.000Z");

    expect(summary.totalRemainingBalanceCents).toBe(20_000);
    expect(summary.overdueInstallmentsBalanceCents).toBe(10_000);
    expect(summary.futureInstallmentsBalanceCents).toBe(10_000);
    expect(summary.missedInstallmentCount).toBe(1);
    expect(summary.oldestOverdueInstallmentDaysPastDue).toBeGreaterThan(0);
  });

  it("allocates oldest due first by installment line due date", () => {
    const decision = allocatePaymentToInstallmentLines({
      paymentAmountCents: 12_000,
      accountBillingAccountId: "billing-1",
      paymentCurrency: "PHP",
      policy: "oldest_due_first",
      lines: [
        refreshInstallmentLine({
          line: createInstallmentLine({
            id: "line-older",
            createdAt: "2026-01-01T00:00:00.000Z",
            installmentPlanId: "plan-1",
            billingAccountId: "billing-1",
            currency: "PHP",
            sequenceNumber: 1,
            dueDate: "2026-03-15",
            scheduledAmountCents: 10_000,
            remainingAmountCents: 10_000,
            status: "due",
            metadata: {},
          }),
          asOfDate: "2026-04-21T00:00:00.000Z",
        }),
        refreshInstallmentLine({
          line: createInstallmentLine({
            id: "line-newer",
            createdAt: "2026-01-01T00:00:00.000Z",
            installmentPlanId: "plan-1",
            billingAccountId: "billing-1",
            currency: "PHP",
            sequenceNumber: 2,
            dueDate: "2026-04-10",
            scheduledAmountCents: 10_000,
            remainingAmountCents: 10_000,
            status: "due",
            metadata: {},
          }),
          asOfDate: "2026-04-21T00:00:00.000Z",
        }),
      ],
    });

    expect(decision.allocations.map((allocation) => allocation.line.installmentLineId)).toEqual([
      "line-older",
      "line-newer",
    ]);
    expect(decision.allocations[0]?.amountCents).toBe(10_000);
    expect(decision.unappliedAmountCents).toBe(0);
  });

  it("blocks disputed installment lines from auto-chase and auto-allocation", () => {
    const line = createInstallmentLine({
      id: "line-disputed",
      createdAt: "2026-01-01T00:00:00.000Z",
      installmentPlanId: "plan-1",
      billingAccountId: "billing-1",
      currency: "PHP",
      sequenceNumber: 1,
      dueDate: "2026-04-01",
      scheduledAmountCents: 10_000,
      remainingAmountCents: 10_000,
      status: "disputed",
      metadata: {},
    });

    expect(canAutoChaseInstallmentLine(line)).toBe(false);
    expect(() =>
      allocatePaymentToInstallmentLines({
        paymentAmountCents: 10_000,
        accountBillingAccountId: "billing-1",
        paymentCurrency: "PHP",
        policy: "oldest_due_first",
        lines: [line],
      }),
    ).toThrow(DisputedInstallmentLineAutoChaseBlockedError);
  });

  it("blocks allocation when billing-account or branch ambiguity exists", () => {
    expect(() =>
      allocatePaymentToInstallmentLines({
        paymentAmountCents: 10_000,
        accountBillingAccountId: "billing-1",
        paymentCurrency: "PHP",
        policy: "oldest_due_first",
        lines: [
          createInstallmentLine({
            id: "line-cross-entity",
            createdAt: "2026-01-01T00:00:00.000Z",
            installmentPlanId: "plan-1",
            billingAccountId: "billing-2",
            currency: "PHP",
            sequenceNumber: 1,
            dueDate: "2026-04-01",
            scheduledAmountCents: 10_000,
            remainingAmountCents: 10_000,
            status: "due",
            metadata: {},
          }),
        ],
      }),
    ).toThrow(CrossEntityInstallmentAllocationAmbiguityError);
  });

  it("links promise-to-pay records to installment lines without breaking invoice references", () => {
    const promise = createPromiseToPayFromReply({
      id: "ptp-1",
      now: "2026-04-21T00:00:00.000Z",
      account: {
        id: "billing-1",
        parentAccountId: "parent-1",
        accountNumber: "BA-1",
        displayName: "Billing",
        currency: "PHP",
        accountTier: "standard",
        status: "active",
        centrallyPaid: false,
        metadata: {},
        createdAt: "2026-04-21T00:00:00.000Z",
        updatedAt: "2026-04-21T00:00:00.000Z",
      },
      invoices: [
        {
          id: "invoice-1",
          createdAt: "2026-04-21T00:00:00.000Z",
          updatedAt: "2026-04-21T00:00:00.000Z",
          state: "matched_to_erp",
          parentAccountId: "parent-1",
          billingAccountId: "billing-1",
          invoiceNumber: "SI-1001",
          currency: "PHP",
          amountCents: 10_000,
          metadata: {},
        },
      ],
      installmentLineIds: ["line-1", "line-2"],
      analysis: {
        classification: "promise_to_pay",
        confidence: 0.98,
        requiresHumanReview: false,
        reasons: [],
        invoices: [],
        requestedDocumentTypes: [],
        ptp: {
          confidence: 0.98,
          promisedAmountCents: 10_000,
          currency: "PHP",
          promiseDate: "2026-04-25",
          riskFlags: [],
        },
      },
    });

    expect(promise.installmentLineIds).toEqual(["line-1", "line-2"]);
    expect(promise.metadata.invoiceIds).toEqual(["invoice-1"]);
    expect(promise.metadata.installmentLineIds).toEqual(["line-1", "line-2"]);
  });
});
