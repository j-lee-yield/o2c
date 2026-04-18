import { describe, expect, it } from "vitest";
import { makeBillingAccount, makeInvoice, makePayment } from "@o2c/testkit";
import type { PaymentApplication } from "@o2c/domain";
import { buildQuickBooksAppliedCashWritebackPreview } from "./quickbooks-cash-writeback.js";

describe("quickbooks cash writeback preview", () => {
  it("supports settled cash-only applications with invoice external ids", () => {
    const payment = makePayment({
      amountCents: 100_000,
      paymentReference: "RCPT-1001",
      metadata: {
        sourceBankTransactionIds: ["txn-1"],
      },
    });
    const account = makeBillingAccount({
      erpCustomerId: "qb-customer-1",
      displayName: "Puregold Price Club",
    });
    const invoice = makeInvoice({
      amountCents: 100_000,
      state: "paid",
      metadata: {
        importProvider: "quickbooks_online",
        sourceExternalId: "qb-invoice-1",
      },
    });
    const application = {
      id: "application-1",
      tenantId: payment.tenantId,
      version: 1,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      paymentId: payment.id,
      invoiceId: invoice.id,
      appliedAmountCents: 100_000,
      state: "applied",
      metadata: {},
    } satisfies PaymentApplication;

    const preview = buildQuickBooksAppliedCashWritebackPreview({
      payment,
      account,
      invoices: [invoice],
      applications: [application],
      withholdingComponents: [],
      residualActions: [],
      settlementStatus: "settled",
      sourceBankTransactionIds: ["txn-1"],
    });

    expect(preview.supportStatus).toBe("supported");
    expect(preview.payload.customerReference).toBe("qb-customer-1");
    expect(preview.payload.allocations[0]?.invoiceExternalId).toBe("qb-invoice-1");
  });

  it("routes withholding-supported settlements to manual handling", () => {
    const payment = makePayment({
      amountCents: 98_000,
      paymentReference: "RCPT-1002",
      metadata: {
        sourceBankTransactionIds: ["txn-2"],
      },
    });
    const account = makeBillingAccount({
      erpCustomerId: "qb-customer-2",
      displayName: "SM Retail",
    });
    const invoice = makeInvoice({
      amountCents: 100_000,
      state: "partially_paid",
      metadata: {
        importProvider: "quickbooks_online",
        sourceExternalId: "qb-invoice-2",
      },
    });
    const application = {
      id: "application-2",
      tenantId: payment.tenantId,
      version: 1,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      paymentId: payment.id,
      invoiceId: invoice.id,
      appliedAmountCents: 98_000,
      state: "applied",
      metadata: {},
    } satisfies PaymentApplication;

    const preview = buildQuickBooksAppliedCashWritebackPreview({
      payment,
      account,
      invoices: [invoice],
      applications: [application],
      withholdingComponents: [
        {
          withholdingComponentId: "withhold-1",
          tenantId: payment.tenantId,
          paymentId: payment.id,
          invoiceId: invoice.id,
          withholdingType: "cwt_goods",
          withholdingRateBps: 100,
          withholdingAmountMinor: 2_000,
          evidenceStatus: "remittance_only",
          recognizedForInvoiceClosure: true,
          status: "recognized",
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        },
      ],
      residualActions: [],
      settlementStatus: "settled",
      sourceBankTransactionIds: ["txn-2"],
    });

    expect(preview.supportStatus).toBe("manual_required");
    expect(preview.outcome).toBe("cash_with_withholding");
  });
});
