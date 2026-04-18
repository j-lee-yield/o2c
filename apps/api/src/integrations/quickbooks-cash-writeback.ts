import type {
  BillingAccount,
  CustomerInvoice,
  Payment,
  PaymentApplication,
} from "@o2c/domain";

import type {
  StoredPaymentResidualAction,
  StoredWithholdingComponent,
} from "../bootstrap/payment-finality-store.js";

export interface QuickBooksAppliedCashWritebackPreview {
  provider: "quickbooks_online";
  providerLabel: "QuickBooks Online";
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
    entity: "Payment";
    operation: "create_and_link";
    realmIdHint?: string;
    customerReference?: string;
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
      invoiceExternalId?: string;
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
      nativeReceivePaymentSupported: boolean;
      manualReconciliationRequired: boolean;
      reason?: string;
    };
  };
}

export function buildQuickBooksAppliedCashWritebackPreview(input: {
  payment: Payment;
  account: BillingAccount;
  invoices: CustomerInvoice[];
  applications: PaymentApplication[];
  withholdingComponents: StoredWithholdingComponent[];
  residualActions: StoredPaymentResidualAction[];
  settlementStatus?: string;
  sourceBankTransactionIds: string[];
}): QuickBooksAppliedCashWritebackPreview {
  const appliedAmountCents = input.applications.reduce(
    (sum, application) => sum + application.appliedAmountCents,
    0,
  );
  const unappliedAmountCents = Math.max(0, input.payment.amountCents - appliedAmountCents);
  const openResidualActions = input.residualActions.filter((action) => action.status === "open");
  const hasWithholding = input.withholdingComponents.length > 0;
  const hasResidualActions = openResidualActions.length > 0 || unappliedAmountCents > 0;
  const customerReference =
    input.account.erpCustomerId ??
    (typeof input.payment.metadata.customerReference === "string"
      ? input.payment.metadata.customerReference
      : undefined);
  const realmIdHint =
    typeof input.payment.metadata.quickbooksRealmId === "string"
      ? input.payment.metadata.quickbooksRealmId
      : undefined;
  const invoiceById = new Map(input.invoices.map((invoice) => [invoice.id, invoice]));
  const allocations = input.applications.map((application) => {
    const invoice = invoiceById.get(application.invoiceId);
    const externalId =
      typeof invoice?.metadata.sourceExternalId === "string"
        ? invoice.metadata.sourceExternalId
        : typeof invoice?.metadata.externalId === "string"
          ? invoice.metadata.externalId
          : undefined;

    return {
      invoiceId: application.invoiceId,
      invoiceNumber: invoice?.invoiceNumber ?? application.invoiceId,
      appliedAmountCents: application.appliedAmountCents,
      resultingInvoiceState: invoice?.state ?? "unknown",
      ...(externalId ? { invoiceExternalId: externalId } : {}),
      ...(invoice?.branchId ? { branchId: invoice.branchId } : {}),
    };
  });

  let supportStatus: QuickBooksAppliedCashWritebackPreview["supportStatus"] = "supported";
  let reason: string | undefined;
  const manualSteps: string[] = [];

  if (input.settlementStatus !== "settled") {
    supportStatus = "blocked";
    reason = "Only settled bank-backed payments can be written back to QuickBooks.";
  } else if (input.sourceBankTransactionIds.length === 0) {
    supportStatus = "blocked";
    reason = "QuickBooks writeback stays blocked until the payment is tied to a matched bank transaction.";
  } else if (allocations.length === 0) {
    supportStatus = "blocked";
    reason = "No finalized invoice allocation exists yet.";
  } else if (!customerReference) {
    supportStatus = "manual_required";
    reason = "QuickBooks needs a reliable customer reference before a payment can be linked safely.";
    manualSteps.push("Confirm the QuickBooks customer for this billing account before posting.");
  } else if (allocations.some((allocation) => !allocation.invoiceExternalId)) {
    supportStatus = "manual_required";
    reason = "One or more invoices do not yet carry a QuickBooks external ID for safe linking.";
    manualSteps.push("Re-sync invoice identities from QuickBooks before posting the payment.");
  } else if (hasWithholding) {
    supportStatus = "manual_required";
    reason =
      "Recognized withholding still needs a manual accounting treatment in QuickBooks after the cash receipt is posted.";
    manualSteps.push("Create the customer payment in QuickBooks for the received cash amount only.");
    manualSteps.push("Record the withholding portion separately using the reviewed tax evidence.");
  } else if (hasResidualActions) {
    supportStatus = "manual_required";
    reason =
      "Residual handling is present, so QuickBooks posting should be confirmed manually before push.";
    manualSteps.push("Create the customer payment only for the finalized allocation amount.");
    manualSteps.push("Handle unapplied cash or the residual action separately in QuickBooks.");
  }

  if (manualSteps.length === 0 && supportStatus === "supported") {
    manualSteps.push("Create a settled customer payment in QuickBooks and link it to the matched invoices.");
  }

  const outcome: QuickBooksAppliedCashWritebackPreview["outcome"] = hasWithholding
    ? "cash_with_withholding"
    : hasResidualActions
      ? "cash_with_residual"
      : allocations.every((allocation) => allocation.resultingInvoiceState === "paid")
        ? "cash_only_exact"
        : "cash_only_partial";

  return {
    provider: "quickbooks_online",
    providerLabel: "QuickBooks Online",
    target: "applied_cash",
    supportStatus,
    outcome,
    ...(reason ? { reason } : {}),
    manualSteps,
    payload: {
      entity: "Payment",
      operation: "create_and_link",
      ...(realmIdHint ? { realmIdHint } : {}),
      ...(customerReference ? { customerReference } : {}),
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
        nativeReceivePaymentSupported: supportStatus === "supported",
        manualReconciliationRequired: supportStatus === "manual_required",
        ...(reason ? { reason } : {}),
      },
    },
  };
}
