import { describe, expect, it } from "vitest";

import { makeBillingAccount, makeInvoice, makePayment } from "@o2c/testkit";
import { createPaymentApplication } from "@o2c/domain";

import { buildOdooAppliedCashWritebackPreview } from "./odoo-cash-writeback.js";

describe("odoo cash writeback preview", () => {
  it("supports settled cash-only invoice applications", () => {
    const preview = buildOdooAppliedCashWritebackPreview({
      payment: makePayment({
        id: "payment-1",
        parentAccountId: "parent-1",
        billingAccountId: "billing-1",
        paymentReference: "PAY-1",
        amountCents: 100_000,
        receivedAt: "2026-04-09T00:00:00.000Z",
        state: "manually_applied",
      }),
      account: makeBillingAccount({
        id: "billing-1",
        parentAccountId: "parent-1",
        displayName: "Metro Retail",
        accountNumber: "BA-001",
      }),
      invoices: [
        makeInvoice({
          id: "invoice-1",
          parentAccountId: "parent-1",
          billingAccountId: "billing-1",
          invoiceNumber: "INV-1",
          amountCents: 100_000,
          state: "paid",
          invoiceDate: "2026-04-01",
          dueDate: "2026-04-30",
          metadata: { openAmountCents: 0 },
        }),
      ],
      applications: [
        createPaymentApplication({
          id: "application-1",
          paymentId: "payment-1",
          invoiceId: "invoice-1",
          parentAccountId: "parent-1",
          billingAccountId: "billing-1",
          currency: "PHP",
          appliedAmountCents: 100_000,
          state: "applied",
          rationale: "Test allocation",
          createdAt: "2026-04-09T00:00:00.000Z",
          metadata: {},
        }),
      ],
      withholdingComponents: [],
      residualActions: [],
      settlementStatus: "settled",
      sourceBankTransactionIds: ["bank-txn-1"],
    });

    expect(preview.supportStatus).toBe("supported");
    expect(preview.payload.totalAppliedAmountCents).toBe(100_000);
  });

  it("requires manual handling when withholding is recognized", () => {
    const preview = buildOdooAppliedCashWritebackPreview({
      payment: makePayment({
        id: "payment-2",
        parentAccountId: "parent-1",
        billingAccountId: "billing-1",
        paymentReference: "PAY-2",
        amountCents: 98_000,
        receivedAt: "2026-04-09T00:00:00.000Z",
        state: "manually_applied",
      }),
      account: makeBillingAccount({
        id: "billing-1",
        parentAccountId: "parent-1",
        displayName: "Metro Retail",
        accountNumber: "BA-001",
      }),
      invoices: [],
      applications: [
        createPaymentApplication({
          id: "application-2",
          paymentId: "payment-2",
          invoiceId: "invoice-2",
          parentAccountId: "parent-1",
          billingAccountId: "billing-1",
          currency: "PHP",
          appliedAmountCents: 98_000,
          state: "applied",
          rationale: "Test allocation",
          createdAt: "2026-04-09T00:00:00.000Z",
          metadata: {},
        }),
      ],
      withholdingComponents: [
        {
          withholdingComponentId: "withholding-1",
          tenantId: "default",
          paymentId: "payment-2",
          invoiceId: "invoice-2",
          withholdingType: "cwt_services",
          withholdingRateBps: 200,
          withholdingAmountMinor: 2_000,
          evidenceStatus: "remittance_only",
          recognizedForInvoiceClosure: true,
          createdAt: "2026-04-09T00:00:00.000Z",
          updatedAt: "2026-04-09T00:00:00.000Z",
        },
      ],
      residualActions: [],
      settlementStatus: "settled",
      sourceBankTransactionIds: ["bank-txn-2"],
    });

    expect(preview.supportStatus).toBe("manual_required");
    expect(preview.outcome).toBe("cash_with_withholding");
  });
});
