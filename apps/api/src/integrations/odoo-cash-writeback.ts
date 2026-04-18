import type { BillingAccount, CustomerInvoice, Payment, PaymentApplication } from "@o2c/domain";

import type {
  StoredPaymentResidualAction,
  StoredWithholdingComponent,
} from "../bootstrap/payment-finality-store.js";

export interface OdooAppliedCashWritebackPreview {
  provider: "odoo";
  providerLabel: "Odoo";
  target: "applied_cash";
  supportStatus: "supported" | "manual_required" | "blocked";
  outcome:
    | "cash_only_exact"
    | "cash_only_partial"
    | "cash_with_withholding"
    | "cash_with_residual";
  reason?: string;
  manualSteps: string[];
  payload: {
    model: "account.payment";
    operation: "register_payment";
    paymentReference: string;
    paymentReceivedAt: string;
    settlementStatus?: string;
    sourceBankTransactionIds: string[];
    billingAccountId: string;
    billingAccountName: string;
    totalCashAmountCents: number;
    totalAppliedAmountCents: number;
    unappliedAmountCents: number;
    allocations: Array<{
      invoiceId: string;
      invoiceNumber: string;
      appliedAmountCents: number;
      resultingInvoiceState: string;
      branchId?: string;
    }>;
    withholdingComponents: Array<{
      invoiceId: string;
      withholdingType: StoredWithholdingComponent["withholdingType"];
      withholdingAmountCents: number;
      evidenceStatus: StoredWithholdingComponent["evidenceStatus"];
      recognizedForInvoiceClosure: boolean;
    }>;
    residualActions: Array<{
      residualType: StoredPaymentResidualAction["residualType"];
      amountCents: number;
      reasonCode: string;
      requiresApproval: boolean;
    }>;
    providerHints: {
      nativeSettlementSupported: boolean;
      manualReconciliationRequired: boolean;
      reason?: string;
    };
  };
}

export function buildOdooAppliedCashWritebackPreview(input: {
  payment: Payment;
  account: BillingAccount;
  invoices: CustomerInvoice[];
  applications: PaymentApplication[];
  withholdingComponents: StoredWithholdingComponent[];
  residualActions: StoredPaymentResidualAction[];
  settlementStatus?: string;
  sourceBankTransactionIds: string[];
}): OdooAppliedCashWritebackPreview {
  const appliedAmountCents = input.applications.reduce(
    (sum, application) => sum + application.appliedAmountCents,
    0,
  );
  const recognizedWithholdingAmountCents = input.withholdingComponents.reduce(
    (sum, component) => sum + component.withholdingAmountMinor,
    0,
  );
  const unappliedAmountCents = Math.max(0, input.payment.amountCents - appliedAmountCents);
  const hasWithholding = recognizedWithholdingAmountCents > 0;
  const openResidualActions = input.residualActions.filter((action) => action.status === "open");
  const hasResidualActions = openResidualActions.length > 0;
  const invoiceById = new Map(input.invoices.map((invoice) => [invoice.id, invoice]));
  const allocations = input.applications.map((application) => {
    const invoice = invoiceById.get(application.invoiceId);
    return {
      invoiceId: application.invoiceId,
      invoiceNumber: invoice?.invoiceNumber ?? application.invoiceId,
      appliedAmountCents: application.appliedAmountCents,
      resultingInvoiceState: invoice?.state ?? "unknown",
      ...(invoice?.branchId ? { branchId: invoice.branchId } : {}),
    };
  });

  let supportStatus: OdooAppliedCashWritebackPreview["supportStatus"] = "supported";
  let reason: string | undefined;
  const manualSteps: string[] = [];

  if (input.settlementStatus !== "settled") {
    supportStatus = "blocked";
    reason = "Only settled bank-backed payments can be written back to Odoo.";
  } else if (input.sourceBankTransactionIds.length === 0) {
    supportStatus = "blocked";
    reason = "Invoice closure must stay tied to a matched bank transaction before writeback.";
  } else if (allocations.length === 0) {
    supportStatus = "blocked";
    reason = "No invoice allocations are finalized yet, so there is nothing safe to write back.";
  } else if (hasWithholding) {
    supportStatus = "manual_required";
    reason =
      "Odoo writeback for withholding-supported settlements needs manual reconciliation details preserved.";
    manualSteps.push("Post the cash receipt in Odoo against the matched invoice allocation.");
    manualSteps.push("Record the recognized withholding separately using the buyer tax evidence on file.");
  } else if (hasResidualActions || unappliedAmountCents > 0) {
    supportStatus = "manual_required";
    reason =
      "Residual handling is present, so the operator should confirm the final Odoo treatment before posting.";
    manualSteps.push("Post only the confirmed invoice allocation amount in Odoo.");
    manualSteps.push("Handle the remaining residual or unapplied cash using the recorded residual action.");
  }

  if (manualSteps.length === 0 && supportStatus === "supported") {
    manualSteps.push("Register the settled customer payment against the matched invoice allocation in Odoo.");
  }

  const outcome: OdooAppliedCashWritebackPreview["outcome"] = hasWithholding
    ? "cash_with_withholding"
    : hasResidualActions || unappliedAmountCents > 0
      ? "cash_with_residual"
      : allocations.every((allocation) => allocation.resultingInvoiceState === "paid")
        ? "cash_only_exact"
        : "cash_only_partial";

  return {
    provider: "odoo",
    providerLabel: "Odoo",
    target: "applied_cash",
    supportStatus,
    outcome,
    ...(reason ? { reason } : {}),
    manualSteps,
    payload: {
      model: "account.payment",
      operation: "register_payment",
      paymentReference: input.payment.paymentReference,
      paymentReceivedAt: input.payment.receivedAt,
      ...(input.settlementStatus ? { settlementStatus: input.settlementStatus } : {}),
      sourceBankTransactionIds: input.sourceBankTransactionIds,
      billingAccountId: input.account.id,
      billingAccountName: input.account.displayName,
      totalCashAmountCents: input.payment.amountCents,
      totalAppliedAmountCents: appliedAmountCents,
      unappliedAmountCents,
      allocations,
      withholdingComponents: input.withholdingComponents.map((component) => ({
        invoiceId: component.invoiceId,
        withholdingType: component.withholdingType,
        withholdingAmountCents: component.withholdingAmountMinor,
        evidenceStatus: component.evidenceStatus,
        recognizedForInvoiceClosure: component.recognizedForInvoiceClosure,
      })),
      residualActions: openResidualActions.map((action) => ({
        residualType: action.residualType,
        amountCents: action.amountMinor,
        reasonCode: action.reasonCode,
        requiresApproval: action.requiresApproval,
      })),
      providerHints: {
        nativeSettlementSupported: supportStatus === "supported",
        manualReconciliationRequired: supportStatus === "manual_required",
        ...(reason ? { reason } : {}),
      },
    },
  };
}
