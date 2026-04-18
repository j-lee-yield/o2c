import { describe, expect, it } from "vitest";

import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import { recordOperatorFeedback } from "@o2c/domain";
import { makeBillingAccount, makeInvoice, makePayment } from "@o2c/testkit";

import {
  CashApplicationInputError,
  CashApplicationWorkflowEngine,
  type CashApplicationEngineInput,
} from "./cash-application.js";

const principal = {
  id: "manager_1",
  roles: ["ar_manager"] as const,
};

const auditContext = {
  actorId: "system",
  actorType: "automation" as const,
  correlationId: "corr-cash-1",
  occurredAt: "2026-03-26T00:00:00.000Z",
};

function makeEngine() {
  return new CashApplicationWorkflowEngine({
    activityStore: new InMemoryImmutableActivityLogStore(),
    now: () => "2026-03-26T00:00:00.000Z",
    idGenerator: (prefix) => `${prefix}_1`,
  });
}

function makeBaseInput(overrides: Partial<CashApplicationEngineInput> = {}): CashApplicationEngineInput {
  const account = makeBillingAccount({
    id: "bill-1",
    parentAccountId: "parent-1",
    displayName: "Metro Retail Group - Makati",
    accountTier: "standard",
    currency: "PHP",
    metadata: {},
  });
  const invoice = makeInvoice({
    id: "inv-1",
    parentAccountId: "parent-1",
    billingAccountId: "bill-1",
    amountCents: 1500000,
    invoiceNumber: "SI-1001",
    invoiceDate: "2026-03-12",
    state: "matched_to_erp",
    branchId: "branch-makati",
    metadata: {
      customerName: "Metro Retail Group - Makati",
      poNumber: "PO-7711",
      openAmountCents: 1500000,
      latestVerifiedSnapshot: true,
      knownPayerBankAccounts: ["0917-AR-9981"],
    },
  });
  const payment = makePayment({
    id: "pay-1",
    parentAccountId: "parent-1",
    billingAccountId: "bill-1",
    amountCents: 1500000,
    paymentReference: "RCPT-7788",
    currency: "PHP",
    metadata: {
      payerName: "Metro Retail Group - Makati",
      payerBankAccount: "0917-AR-9981",
    },
  });

  return {
    principal: { ...principal },
    auditContext,
    account,
    payment,
    invoices: [invoice],
    paymentsLedger: [
      {
        id: "ledger-1",
        paymentId: "pay-1",
        bankReference: "RCPT-7788",
        payerName: "Metro Retail Group - Makati",
        payerBankAccount: "0917-AR-9981",
        amountCents: 1500000,
        settled: true,
        confirmed: true,
      },
    ],
    bankTransactions: [
      {
        id: "bank-1",
        bankReference: "RCPT-7788",
        amountCents: 1500000,
        payerName: "Metro Retail Group - Makati",
        payerBankAccount: "0917-AR-9981",
      },
    ],
    remittanceEmails: [
      {
        id: "email-1",
        subject: "Remittance for SI-1001",
        bodyText: "Please apply RCPT-7788 against SI-1001 and PO-7711. Amount PHP 15,000.00.",
        payerName: "Metro Retail Group - Makati",
        receivedAt: "2026-03-26T08:00:00.000Z",
      },
    ],
    uploadedProofsOfPayment: [
      {
        id: "proof-1",
        fileName: "proof.pdf",
        extractedText: "Payment reference RCPT-7788 for invoice SI-1001.",
        payerName: "Metro Retail Group - Makati",
        bankReference: "RCPT-7788",
        payerBankAccount: "0917-AR-9981",
      },
    ],
    erpPaymentRecords: [
      {
        id: "erp-pay-1",
        paymentReference: "RCPT-7788",
        settled: true,
        confirmed: true,
        writebackPathAvailable: true,
        referencedInvoiceNumbers: ["SI-1001"],
      },
    ],
    settlementWebhooks: [
      {
        id: "webhook-1",
        status: "confirmed",
        bankReference: "RCPT-7788",
        payerBankAccount: "0917-AR-9981",
      },
    ],
    knownCustomerBehavior: {
      expectedPayerNames: ["Metro Retail Group - Makati"],
      expectedPayerBankAccounts: ["0917-AR-9981"],
      allowBankChargeVarianceCents: 500,
      allowShortPayVarianceCents: 500,
    },
    ...overrides,
  };
}

describe("CashApplicationWorkflowEngine.process", () => {
  it("auto-applies an exact high-confidence match and stages ERP writeback", () => {
    const engine = makeEngine();

    const result = engine.process(makeBaseInput());

    expect(result.route).toBe("auto_apply");
    expect(result.decision).toBe("auto_apply");
    expect(result.payment.state).toBe("auto_applied");
    expect(result.applications).toHaveLength(1);
    expect(result.applications[0]?.state).toBe("applied");
    expect(result.applications[0]?.branchId).toBe("branch-makati");
    expect(result.invoices[0]?.state).toBe("paid");
    expect(result.allocations[0]?.branchId).toBe("branch-makati");
    expect(result.writebackStage?.status).toBe("staged");
    expect(result.writebackStage?.payload?.allocations[0]?.invoiceNumber).toBe("SI-1001");
    expect(result.candidateSet?.selectedCandidate?.confidence).toBeGreaterThanOrEqual(0.99);
    expect(result.learningEvents.map((event) => event.eventType)).toEqual([
      "payment_candidate_match_found",
      "payment_auto_applied",
    ]);
  });

  it("suggests a review when the best candidate is plausible but below auto-apply confidence", () => {
    const engine = makeEngine();

    const result = engine.process(
      makeBaseInput({
        payment: makePayment({
          id: "pay-2",
          parentAccountId: "parent-1",
          billingAccountId: "bill-1",
          amountCents: 1499500,
          paymentReference: "RCPT-7788",
          currency: "PHP",
          metadata: {
            payerName: "Metro Retail Group - Mkti",
            payerBankAccount: "0917-AR-9981",
          },
        }),
        paymentsLedger: [
          {
            id: "ledger-2",
            paymentId: "pay-2",
            bankReference: "RCPT-7788",
            payerName: "Metro Retail Group - Mkti",
            payerBankAccount: "0917-AR-9981",
            amountCents: 1499500,
            settled: true,
            confirmed: true,
          },
        ],
        remittanceEmails: [
          {
            id: "email-2",
            subject: "Remittance for SI-100I",
            bodyText: "Apply against SI-100I. Bank charges 5.00 PHP.",
            payerName: "Metro Retail Group - Mkti",
            receivedAt: "2026-03-26T08:30:00.000Z",
          },
        ],
        uploadedProofsOfPayment: [],
        erpPaymentRecords: [
          {
            id: "erp-pay-2",
            paymentReference: "RCPT-7788",
            settled: true,
            confirmed: true,
            writebackPathAvailable: true,
          },
        ],
        autoApplyConfidenceThreshold: 0.995,
      })
    );
    expect(result.route).toBe("review_required");
    expect(result.decision).toBe("review_suggestion");
    expect(result.applications[0]?.state).toBe("proposed");
    expect(result.exception).toBeUndefined();
    expect(result.candidateSet?.selectedCandidate?.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.candidateSet?.selectedCandidate?.confidence).toBeLessThan(0.995);
    expect(result.learningEvents.at(-1)?.eventType).toBe("payment_review_required");
  });

  it("routes strategic accounts to approval when the candidate is no-regret auto-apply eligible", () => {
    const engine = makeEngine();

    const result = engine.process(
      makeBaseInput({
        account: makeBillingAccount({
          id: "bill-strategic",
          parentAccountId: "parent-1",
          displayName: "Metro Retail Group - Strategic Procurement",
          accountTier: "strategic",
          currency: "PHP",
          centrallyPaid: true,
          metadata: {},
        }),
        payment: makePayment({
          id: "pay-strategic",
          parentAccountId: "parent-1",
          billingAccountId: "bill-strategic",
          amountCents: 1500000,
          paymentReference: "RCPT-9100",
          currency: "PHP",
          metadata: {
            payerName: "Metro Retail Group Treasury",
            payerBankAccount: "0917-AR-9981",
          },
        }),
        invoices: [
          makeInvoice({
            id: "inv-strategic",
            parentAccountId: "parent-1",
            billingAccountId: "bill-strategic",
            amountCents: 1500000,
            invoiceNumber: "SI-9100",
            invoiceDate: "2026-03-12",
            state: "matched_to_erp",
            branchId: "branch-hq",
            metadata: {
              customerName: "Metro Retail Group - Strategic Procurement",
              openAmountCents: 1500000,
              latestVerifiedSnapshot: true,
              knownPayerBankAccounts: ["0917-AR-9981"],
            },
          }),
        ],
        paymentsLedger: [
          {
            id: "ledger-strategic",
            paymentId: "pay-strategic",
            bankReference: "RCPT-9100",
            payerName: "Metro Retail Group Treasury",
            payerBankAccount: "0917-AR-9981",
            amountCents: 1500000,
            settled: true,
            confirmed: true,
          },
        ],
        bankTransactions: [
          {
            id: "bank-strategic",
            bankReference: "RCPT-9100",
            amountCents: 1500000,
            payerName: "Metro Retail Group Treasury",
            payerBankAccount: "0917-AR-9981",
          },
        ],
        remittanceEmails: [
          {
            id: "email-strategic",
            subject: "Remittance for SI-9100",
            bodyText: "Please apply RCPT-9100 against SI-9100.",
            payerName: "Metro Retail Group Treasury",
            receivedAt: "2026-03-26T08:00:00.000Z",
          },
        ],
        uploadedProofsOfPayment: [],
        erpPaymentRecords: [
          {
            id: "erp-pay-strategic",
            paymentReference: "RCPT-9100",
            settled: true,
            confirmed: true,
            writebackPathAvailable: true,
            referencedInvoiceNumbers: ["SI-9100"],
          },
        ],
        settlementWebhooks: [
          {
            id: "webhook-strategic",
            status: "confirmed",
            bankReference: "RCPT-9100",
            payerBankAccount: "0917-AR-9981",
          },
        ],
        knownCustomerBehavior: {
          expectedPayerNames: ["Metro Retail Group Treasury"],
          expectedPayerBankAccounts: ["0917-AR-9981"],
          parentPaysForChildren: true,
          allowBankChargeVarianceCents: 500,
          allowShortPayVarianceCents: 500,
        },
      })
    );

    expect(result.route).toBe("approval_required");
    expect(result.decision).toBe("approval_required");
    expect(result.applications[0]?.state).toBe("proposed");
    expect(result.approvalRequest?.status).toBe("pending_approval");
  });

  it("routes low-confidence conflicting evidence to the exception queue", () => {
    const engine = makeEngine();

    const result = engine.process(
      makeBaseInput({
        payment: makePayment({
          id: "pay-3",
          parentAccountId: "parent-1",
          billingAccountId: "bill-1",
          amountCents: 1500000,
          paymentReference: "WIRE-5531",
          currency: "PHP",
          metadata: {},
        }),
        remittanceEmails: [
          {
            id: "email-3",
            subject: "Apply SI-1001 and SI-9009",
            bodyText: "Please apply to SI-1001 and SI-9009.",
            receivedAt: "2026-03-26T09:00:00.000Z",
          },
        ],
        uploadedProofsOfPayment: [],
        erpPaymentRecords: [
          {
            id: "erp-pay-3",
            paymentReference: "WIRE-5531",
            settled: true,
            confirmed: true,
            writebackPathAvailable: false,
            referencedInvoiceNumbers: ["SI-1001", "SI-9009"],
          },
        ],
        settlementWebhooks: [{ id: "webhook-3", status: "settled" }],
        knownCustomerBehavior: undefined,
        autoApplyConfidenceThreshold: 0.99,
        reviewConfidenceThreshold: 0.85,
      })
    );

    expect(result.route).toBe("review_required");
    expect(result.decision).toBe("exception_queue");
    expect(result.exception?.kind).toBe("erp_sync_inconsistency");
  });

  it("supports one payment across many invoices while preserving branch visibility", () => {
    const engine = makeEngine();
    const invoiceA = makeInvoice({
      id: "inv-a",
      parentAccountId: "parent-1",
      billingAccountId: "bill-1",
      invoiceNumber: "SI-2001",
      amountCents: 900000,
      invoiceDate: "2026-03-01",
      state: "matched_to_erp",
      branchId: "branch-cebu-north",
      metadata: {
        customerName: "Metro Retail Group - Makati",
        openAmountCents: 900000,
        latestVerifiedSnapshot: true,
      },
    });
    const invoiceB = makeInvoice({
      id: "inv-b",
      parentAccountId: "parent-1",
      billingAccountId: "bill-1",
      invoiceNumber: "SI-2002",
      amountCents: 600000,
      invoiceDate: "2026-03-02",
      state: "matched_to_erp",
      branchId: "branch-cebu-south",
      metadata: {
        customerName: "Metro Retail Group - Makati",
        openAmountCents: 600000,
        latestVerifiedSnapshot: true,
      },
    });

    const result = engine.process(
      makeBaseInput({
        payment: makePayment({
          id: "pay-4",
          parentAccountId: "parent-1",
          billingAccountId: "bill-1",
          amountCents: 1500000,
          paymentReference: "RCPT-9901",
          currency: "PHP",
          metadata: {
            payerName: "Metro Retail Group - Makati",
            payerBankAccount: "0917-AR-9981",
          },
        }),
        invoices: [invoiceA, invoiceB],
        remittanceEmails: [
          {
            id: "email-4",
            subject: "Remittance SI-2001 / SI-2002",
            bodyText: "Apply RCPT-9901 to SI-2001 and SI-2002.",
            payerName: "Metro Retail Group - Makati",
            receivedAt: "2026-03-26T07:00:00.000Z",
          },
        ],
        uploadedProofsOfPayment: [],
        erpPaymentRecords: [
          {
            id: "erp-pay-4",
            paymentReference: "RCPT-9901",
            settled: true,
            confirmed: true,
            writebackPathAvailable: true,
            referencedInvoiceNumbers: ["SI-2001", "SI-2002"],
          },
        ],
        settlementWebhooks: [{ id: "webhook-4", status: "confirmed", bankReference: "RCPT-9901" }],
      })
    );
    expect(result.route).toBe("auto_apply");
    expect(result.allocations).toHaveLength(2);
    expect(result.allocations.map((allocation) => allocation.branchId)).toEqual([
      "branch-cebu-north",
      "branch-cebu-south",
    ]);
    expect(result.appliedAmountCents).toBe(1500000);
  });

  it("supports partial payment before ERP catches up when the invoice snapshot is verified", () => {
    const engine = makeEngine();
    const invoice = makeInvoice({
      id: "inv-partial",
      parentAccountId: "parent-1",
      billingAccountId: "bill-1",
      invoiceNumber: "SI-3001",
      amountCents: 2000000,
      invoiceDate: "2026-03-10",
      state: "matched_to_erp",
      metadata: {
        customerName: "Metro Retail Group - Makati",
        openAmountCents: 2000000,
        latestVerifiedSnapshot: true,
      },
    });

    const result = engine.process(
      makeBaseInput({
        payment: makePayment({
          id: "pay-5",
          parentAccountId: "parent-1",
          billingAccountId: "bill-1",
          amountCents: 1250000,
          paymentReference: "RCPT-3001",
          currency: "PHP",
          metadata: {
            payerName: "Metro Retail Group - Makati",
            payerBankAccount: "0917-AR-9981",
          },
        }),
        invoices: [invoice],
        remittanceEmails: [
          {
            id: "email-5",
            subject: "Partial payment SI-3001",
            bodyText: "Please apply 12,500.00 to SI-3001. Balance will follow next week.",
            payerName: "Metro Retail Group - Makati",
            receivedAt: "2026-03-26T11:00:00.000Z",
          },
        ],
        erpPaymentRecords: [
          {
            id: "erp-pay-5",
            paymentReference: "RCPT-3001",
            settled: false,
            confirmed: false,
            writebackPathAvailable: true,
            referencedInvoiceNumbers: ["SI-3001"],
          },
        ],
        settlementWebhooks: [{ id: "webhook-5", status: "confirmed", bankReference: "RCPT-3001" }],
      })
    );

    expect(result.route).toBe("review_required");
    expect(result.decision).toBe("review_suggestion");
    expect(result.candidateSet?.selectedCandidate?.policyAmountMatch).toBe("partial");
  });

  it("closes an invoice with cash plus recognized withholding when 2307 evidence is linked", () => {
    const engine = makeEngine();
    const invoice = makeInvoice({
      id: "inv-withholding-supported",
      parentAccountId: "parent-1",
      billingAccountId: "bill-1",
      invoiceNumber: "SI-3601",
      amountCents: 1500000,
      invoiceDate: "2026-03-10",
      state: "matched_to_erp",
      metadata: {
        customerName: "Metro Retail Group - Makati",
        openAmountCents: 1500000,
        latestVerifiedSnapshot: true,
        invoiceTaxBasisExplicit: true,
      },
    });

    const result = engine.process(
      makeBaseInput({
        payment: makePayment({
          id: "pay-withholding-supported",
          parentAccountId: "parent-1",
          billingAccountId: "bill-1",
          amountCents: 1485000,
          paymentReference: "RCPT-3601",
          currency: "PHP",
          metadata: {
            payerName: "Metro Retail Group - Makati",
            payerBankAccount: "0917-AR-9981",
            settlementStatus: "settled",
          },
        }),
        invoices: [invoice],
        paymentsLedger: [
          {
            id: "ledger-withholding-supported",
            paymentId: "pay-withholding-supported",
            bankReference: "RCPT-3601",
            payerName: "Metro Retail Group - Makati",
            payerBankAccount: "0917-AR-9981",
            amountCents: 1485000,
            settled: true,
            confirmed: true,
          },
        ],
        bankTransactions: [
          {
            id: "bank-withholding-supported",
            bankReference: "RCPT-3601",
            amountCents: 1485000,
            payerName: "Metro Retail Group - Makati",
            payerBankAccount: "0917-AR-9981",
          },
        ],
        remittanceEmails: [
          {
            id: "email-withholding-supported",
            subject: "Remittance for SI-3601",
            bodyText:
              "Please apply RCPT-3601 to SI-3601. Withholding tax PHP 150.00. Form 2307 follows.",
            payerName: "Metro Retail Group - Makati",
            receivedAt: "2026-03-26T11:00:00.000Z",
            metadata: {
              withholdingAmountCents: 15000,
              statesWithholding: true,
            },
          },
        ],
        uploadedProofsOfPayment: [
          {
            id: "proof-2307",
            fileName: "bir-form-2307.pdf",
            extractedText: "BIR Form 2307 for invoice SI-3601, withholding tax PHP 150.00.",
            payerName: "Metro Retail Group - Makati",
            bankReference: "RCPT-3601",
            payerBankAccount: "0917-AR-9981",
            metadata: {
              form2307Linked: true,
              withholdingAmountCents: 15000,
            },
          },
        ],
        erpPaymentRecords: [
          {
            id: "erp-pay-withholding-supported",
            paymentReference: "RCPT-3601",
            settled: true,
            confirmed: true,
            writebackPathAvailable: true,
            referencedInvoiceNumbers: ["SI-3601"],
          },
        ],
        settlementWebhooks: [{ id: "webhook-withholding-supported", status: "confirmed", bankReference: "RCPT-3601" }],
      }),
    );

    expect(result.route).toBe("auto_apply");
    expect(result.invoices[0]?.state).toBe("paid");
    expect(result.invoices[0]?.metadata.recognizedWithholdingAmountCents).toBe(15000);
    expect(result.applications[0]?.metadata.applicationType).toBe("withholding_supported");
    expect(result.writebackStage?.payload?.recognizedWithholdingAmountCents).toBe(15000);
  });

  it("closes matched bank-transaction payments with explicit remittance-backed withholding even without 2307", () => {
    const engine = makeEngine();
    const invoice = makeInvoice({
      id: "inv-withholding-review",
      parentAccountId: "parent-1",
      billingAccountId: "bill-1",
      invoiceNumber: "SI-3602",
      amountCents: 1500000,
      invoiceDate: "2026-03-10",
      state: "matched_to_erp",
      metadata: {
        customerName: "Metro Retail Group - Makati",
        openAmountCents: 1500000,
        latestVerifiedSnapshot: true,
        invoiceTaxBasisExplicit: true,
      },
    });

    const result = engine.process(
      makeBaseInput({
        payment: makePayment({
          id: "pay-withholding-review",
          parentAccountId: "parent-1",
          billingAccountId: "bill-1",
          amountCents: 1485000,
          paymentReference: "RCPT-3602",
          currency: "PHP",
          metadata: {
            payerName: "Metro Retail Group - Makati",
            payerBankAccount: "0917-AR-9981",
          },
        }),
        invoices: [invoice],
        paymentsLedger: [
          {
            id: "ledger-withholding-review",
            paymentId: "pay-withholding-review",
            bankReference: "RCPT-3602",
            payerName: "Metro Retail Group - Makati",
            payerBankAccount: "0917-AR-9981",
            amountCents: 1485000,
            settled: true,
            confirmed: true,
          },
        ],
        bankTransactions: [
          {
            id: "bank-withholding-review",
            bankReference: "RCPT-3602",
            amountCents: 1485000,
            payerName: "Metro Retail Group - Makati",
            payerBankAccount: "0917-AR-9981",
          },
        ],
        remittanceEmails: [
          {
            id: "email-withholding-review",
            subject: "Remittance for SI-3602",
            bodyText:
              "Please apply RCPT-3602 to SI-3602. We withheld PHP 150.00 as tax.",
            payerName: "Metro Retail Group - Makati",
            receivedAt: "2026-03-26T11:15:00.000Z",
            metadata: {
              withholdingAmountCents: 15000,
              statesWithholding: true,
            },
          },
        ],
        uploadedProofsOfPayment: [],
        erpPaymentRecords: [
          {
            id: "erp-pay-withholding-review",
            paymentReference: "RCPT-3602",
            settled: true,
            confirmed: true,
            writebackPathAvailable: true,
            referencedInvoiceNumbers: ["SI-3602"],
          },
        ],
        settlementWebhooks: [{ id: "webhook-withholding-review", status: "confirmed", bankReference: "RCPT-3602" }],
      }),
    );

    expect(result.route).toBe("auto_apply");
    expect(result.decision).toBe("auto_apply");
    expect(result.invoices[0]?.state).toBe("paid");
    expect(result.invoices[0]?.metadata.recognizedWithholdingAmountCents).toBe(15000);
    expect(result.applications[0]?.metadata.withholdingEvidenceStatus).toBe("remittance_only");
  });

  it("uses parent-payer history to strengthen branch invoice matches without bypassing safety", () => {
    const engine = makeEngine();

    const result = engine.process(
      makeBaseInput({
        account: makeBillingAccount({
          id: "bill-parent-pay",
          parentAccountId: "parent-1",
          displayName: "Metro Retail Group - South Branch",
          branchId: "branch-south",
          accountTier: "standard",
          currency: "PHP",
          centrallyPaid: true,
          metadata: {},
        }),
        payment: makePayment({
          id: "pay-parent-pay",
          parentAccountId: "parent-1",
          billingAccountId: "bill-parent-pay",
          amountCents: 1500000,
          paymentReference: "TRSY-1001",
          currency: "PHP",
          receivedAt: "2026-03-26T08:00:00.000Z",
          metadata: {
            payerName: "Metro Retail Group Treasury",
            payerBankAccount: "0917-AR-9981",
          },
        }),
        invoices: [
          makeInvoice({
            id: "inv-parent-pay",
            parentAccountId: "parent-1",
            billingAccountId: "bill-parent-pay",
            amountCents: 1500000,
            invoiceNumber: "SI-4100",
            invoiceDate: "2026-03-12",
            state: "matched_to_erp",
            branchId: "branch-south",
            metadata: {
              customerName: "Metro Retail Group - South Branch",
              openAmountCents: 1500000,
              latestVerifiedSnapshot: true,
            },
          }),
        ],
        remittanceEmails: [
          {
            id: "email-parent-pay",
            subject: "Treasury remittance for SI-4100",
            bodyText: "Please apply TRSY-1001 to SI-4100.",
            payerName: "Metro Retail Group Treasury",
            receivedAt: "2026-03-26T08:30:00.000Z",
          },
        ],
        knownCustomerBehavior: {
          parentPaysForChildren: true,
          parentPayerProbability: 0.9,
          expectedPayerNames: ["Metro Retail Group Treasury"],
          expectedPayerBankAccounts: ["0917-AR-9981"],
          allowBankChargeVarianceCents: 500,
          allowShortPayVarianceCents: 500,
        },
      }),
    );

    expect(result.route).toBe("review_required");
    expect(result.decision).toBe("exception_queue");
    expect(result.candidateSet?.selectedCandidate).toBeDefined();
  });

  it("keeps weak bank references reviewable when historical payer identity is strong", () => {
    const engine = makeEngine();

    const result = engine.process(
      makeBaseInput({
        payment: makePayment({
          id: "pay-weak-ref",
          parentAccountId: "parent-1",
          billingAccountId: "bill-1",
          amountCents: 1500000,
          paymentReference: "123",
          currency: "PHP",
          receivedAt: "2026-03-26T08:00:00.000Z",
          metadata: {
            payerName: "Metro Retail Group - Makati",
            payerBankAccount: "0917-AR-9981",
          },
        }),
        paymentsLedger: [
          {
            id: "ledger-weak-ref",
            paymentId: "pay-weak-ref",
            bankReference: "123",
            payerName: "Metro Retail Group - Makati",
            payerBankAccount: "0917-AR-9981",
            amountCents: 1500000,
            settled: true,
            confirmed: true,
          },
        ],
        bankTransactions: [
          {
            id: "bank-weak-ref",
            bankReference: "123",
            amountCents: 1500000,
            payerName: "Metro Retail Group - Makati",
            payerBankAccount: "0917-AR-9981",
          },
        ],
        remittanceEmails: [],
        uploadedProofsOfPayment: [],
        erpPaymentRecords: [
          {
            id: "erp-pay-weak-ref",
            paymentReference: "123",
            settled: true,
            confirmed: true,
            writebackPathAvailable: true,
          },
        ],
        autoApplyConfidenceThreshold: 0.999,
        knownCustomerBehavior: {
          expectedPayerNames: ["Metro Retail Group - Makati"],
          expectedPayerBankAccounts: ["0917-AR-9981"],
          referenceQualityScore: 0.2,
          allowBankChargeVarianceCents: 500,
          allowShortPayVarianceCents: 500,
        },
      }),
    );

    expect(result.route).toBe("review_required");
    expect(result.decision).toBe("review_suggestion");
    expect(result.candidateSet?.selectedCandidate?.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.candidateSet?.selectedCandidate?.scoreReasonSummaries).toContain(
      "Score increased because weak payment references are offset by strong historical payer identity.",
    );
  });

  it("recognizes remittance arriving after payment when that pattern is historically common", () => {
    const engine = makeEngine();

    const result = engine.process(
      makeBaseInput({
        payment: makePayment({
          id: "pay-late-remit",
          parentAccountId: "parent-1",
          billingAccountId: "bill-1",
          amountCents: 1500000,
          paymentReference: "RCPT-9900",
          currency: "PHP",
          receivedAt: "2026-03-26T08:00:00.000Z",
          metadata: {
            payerName: "Metro Retail Group - Makati",
            payerBankAccount: "0917-AR-9981",
          },
        }),
        remittanceEmails: [
          {
            id: "email-late-remit",
            subject: "Late remittance for SI-1001",
            bodyText: "Please apply RCPT-9900 to SI-1001.",
            payerName: "Metro Retail Group - Makati",
            receivedAt: "2026-03-26T11:30:00.000Z",
          },
        ],
        knownCustomerBehavior: {
          expectedPayerNames: ["Metro Retail Group - Makati"],
          expectedPayerBankAccounts: ["0917-AR-9981"],
          remittanceUsuallyArrivesAfterPayment: true,
          allowBankChargeVarianceCents: 500,
          allowShortPayVarianceCents: 500,
        },
      }),
    );

    expect(result.route).toBe("auto_apply");
    expect(result.candidateSet?.selectedCandidate?.scoreReasonSummaries).toContain(
      "Score increased because remittance usually trails payment for this customer.",
    );
  });

  it("learns common bank charge variance without weakening no-regret gating", () => {
    const engine = makeEngine();

    const result = engine.process(
      makeBaseInput({
        payment: makePayment({
          id: "pay-bank-charge",
          parentAccountId: "parent-1",
          billingAccountId: "bill-1",
          amountCents: 1499700,
          paymentReference: "RCPT-7788",
          currency: "PHP",
          receivedAt: "2026-03-26T08:00:00.000Z",
          metadata: {
            payerName: "Metro Retail Group - Makati",
            payerBankAccount: "0917-AR-9981",
          },
        }),
        paymentsLedger: [
          {
            id: "ledger-bank-charge",
            paymentId: "pay-bank-charge",
            bankReference: "RCPT-7788",
            payerName: "Metro Retail Group - Makati",
            payerBankAccount: "0917-AR-9981",
            amountCents: 1499700,
            settled: true,
            confirmed: true,
          },
        ],
        bankTransactions: [
          {
            id: "bank-bank-charge",
            bankReference: "RCPT-7788",
            amountCents: 1499700,
            payerName: "Metro Retail Group - Makati",
            payerBankAccount: "0917-AR-9981",
          },
        ],
        remittanceEmails: [
          {
            id: "email-bank-charge",
            subject: "Remittance for SI-1001",
            bodyText: "Apply net of bank charge.",
            payerName: "Metro Retail Group - Makati",
            receivedAt: "2026-03-26T08:30:00.000Z",
          },
        ],
        uploadedProofsOfPayment: [],
        autoApplyConfidenceThreshold: 0.999,
        knownCustomerBehavior: {
          expectedPayerNames: ["Metro Retail Group - Makati"],
          expectedPayerBankAccounts: ["0917-AR-9981"],
          commonBankChargeVarianceCents: 500,
          allowBankChargeVarianceCents: 500,
          allowShortPayVarianceCents: 500,
        },
      }),
    );

    expect(result.route).toBe("auto_apply");
    expect(result.decision).toBe("auto_apply");
    expect(result.candidateSet?.selectedCandidate?.policyAmountMatch).toBe("near_exact");
    expect(result.candidateSet?.selectedCandidate?.scoreReasonSummaries).toContain(
      "Score increased because the payment delta matches a common bank-charge variance pattern.",
    );
  });

  it("enriches cash-application scoring from future-safe learning feedback without replacing safeguards", () => {
    const engine = makeEngine();

    const result = engine.process(
      makeBaseInput({
        knownCustomerBehavior: undefined,
        payment: makePayment({
          id: "pay-learned-bank-charge",
          parentAccountId: "parent-1",
          billingAccountId: "bill-1",
          amountCents: 1499700,
          paymentReference: "RCPT-7788",
          currency: "PHP",
          receivedAt: "2026-03-26T08:00:00.000Z",
          metadata: {
            payerName: "Metro Retail Group Treasury",
            payerBankAccount: "0917-AR-9981",
          },
        }),
        paymentsLedger: [
          {
            id: "ledger-learned-bank-charge",
            paymentId: "pay-learned-bank-charge",
            bankReference: "RCPT-7788",
            payerName: "Metro Retail Group Treasury",
            payerBankAccount: "0917-AR-9981",
            amountCents: 1499700,
            settled: true,
            confirmed: true,
          },
        ],
        bankTransactions: [
          {
            id: "bank-learned-bank-charge",
            bankReference: "RCPT-7788",
            amountCents: 1499700,
            payerName: "Metro Retail Group Treasury",
            payerBankAccount: "0917-AR-9981",
          },
        ],
        remittanceEmails: [
          {
            id: "email-learned-bank-charge",
            subject: "Remittance for SI-1001",
            bodyText: "Apply net of bank charge.",
            payerName: "Metro Retail Group Treasury",
            receivedAt: "2026-03-26T09:30:00.000Z",
          },
        ],
        operatorFeedback: [
          recordOperatorFeedback({
            id: "feedback-learned-cash-1",
            feedbackType: "match_corrected",
            targetType: "payment_match",
            targetId: "payment-match-learned-1",
            occurredAt: "2026-03-20T08:00:00.000Z",
            parentAccountId: "parent-1",
            billingAccountId: "bill-1",
            reasonCode: "cash_application_pattern_confirmed",
            appliesToFutureScoring: true,
            preservesSafetyRules: true,
            afterPayload: {
              expectedPayerName: "Metro Retail Group Treasury",
              expectedPayerBankAccount: "0917-AR-9981",
              varianceType: "bank_charge",
              varianceCents: 500,
              remittanceTiming: "after_payment",
            },
          }),
          recordOperatorFeedback({
            id: "feedback-learned-cash-2",
            feedbackType: "match_corrected",
            targetType: "payment_match",
            targetId: "payment-match-learned-2",
            occurredAt: "2026-03-21T08:00:00.000Z",
            parentAccountId: "parent-1",
            billingAccountId: "bill-1",
            reasonCode: "cash_application_pattern_confirmed",
            appliesToFutureScoring: true,
            preservesSafetyRules: true,
            afterPayload: {
              expectedPayerName: "Metro Retail Group Treasury",
              expectedPayerBankAccount: "0917-AR-9981",
              varianceType: "bank_charge",
              varianceCents: 500,
              remittanceTiming: "after_payment",
            },
          }),
        ],
      }),
    );

    expect(result.route).toBe("auto_apply");
    expect(result.decision).toBe("auto_apply");
    expect(result.candidateSet?.selectedCandidate?.scoreReasonSummaries).toContain(
      "Score increased because the payment delta matches a common bank-charge variance pattern.",
    );
  });

  it("does not let learning signals overpower cross-entity ambiguity", () => {
    const engine = makeEngine();
    const sameParentInvoice = makeInvoice({
      id: "inv-other-billing",
      parentAccountId: "parent-1",
      billingAccountId: "bill-other",
      amountCents: 1500000,
      invoiceNumber: "SI-9999",
      invoiceDate: "2026-03-10",
      state: "matched_to_erp",
      branchId: "branch-other",
      metadata: {
        customerName: "Metro Retail Group Treasury",
        openAmountCents: 1500000,
        latestVerifiedSnapshot: true,
      },
    });

    const result = engine.process(
      makeBaseInput({
        payment: makePayment({
          id: "pay-ambiguous",
          parentAccountId: "parent-1",
          billingAccountId: "bill-1",
          amountCents: 3000000,
          paymentReference: "TRSY-AMB-1",
          currency: "PHP",
          receivedAt: "2026-03-26T08:00:00.000Z",
          metadata: {
            payerName: "Metro Retail Group Treasury",
            payerBankAccount: "0917-AR-9981",
          },
        }),
        paymentsLedger: [
          {
            id: "ledger-ambiguous",
            paymentId: "pay-ambiguous",
            bankReference: "TRSY-AMB-1",
            payerName: "Metro Retail Group Treasury",
            payerBankAccount: "0917-AR-9981",
            amountCents: 3000000,
            settled: true,
            confirmed: true,
          },
        ],
        bankTransactions: [
          {
            id: "bank-ambiguous",
            bankReference: "TRSY-AMB-1",
            amountCents: 3000000,
            payerName: "Metro Retail Group Treasury",
            payerBankAccount: "0917-AR-9981",
          },
        ],
        invoices: [makeBaseInput().invoices[0]!, sameParentInvoice],
        remittanceEmails: [
          {
            id: "email-ambiguous",
            subject: "Apply to SI-1001 and SI-9999",
            bodyText: "Treasury remittance covers SI-1001 and SI-9999 in one payment.",
            payerName: "Metro Retail Group Treasury",
            receivedAt: "2026-03-26T09:00:00.000Z",
          },
        ],
        knownCustomerBehavior: {
          expectedPayerNames: ["Metro Retail Group Treasury"],
          expectedPayerBankAccounts: ["0917-AR-9981"],
          parentPaysForChildren: true,
          parentPayerProbability: 0.95,
          typicalBundleSize: 2,
          allowBankChargeVarianceCents: 500,
          allowShortPayVarianceCents: 500,
        },
      }),
    );

    expect(result.route).toBe("review_required");
    expect(result.decision).toBe("exception_queue");
    expect(result.candidateSet?.selectedCandidate?.crossEntityAmbiguity).toBe(true);
    expect(result.candidateSet?.selectedCandidate?.scoreReasonSummaries).toContain(
      "Score decreased because cross-entity ambiguity blocks learning signals from overconfident matching.",
    );
  });

  it("rejects duplicate allocations during direct evaluation", () => {
    const engine = makeEngine();
    const baseInput = makeBaseInput();

    expect(() =>
      engine.evaluate({
        principal: baseInput.principal,
        auditContext: baseInput.auditContext,
        account: baseInput.account,
        payment: baseInput.payment,
        allocations: [
          { invoice: baseInput.invoices[0]!, amountCents: 750000 },
          { invoice: baseInput.invoices[0]!, amountCents: 750000 },
        ],
        payerIdentified: true,
        matchConfidence: 0.99,
        noRegretAutoApply: true,
      })
    ).toThrowError(CashApplicationInputError);
  });

  it("rejects currency mismatches during direct evaluation", () => {
    const engine = makeEngine();
    const baseInput = makeBaseInput();
    const invoice = makeInvoice({
      ...baseInput.invoices[0]!,
      id: "inv-usd",
      invoiceNumber: "SI-USD-1",
      currency: "USD",
    });

    expect(() =>
      engine.evaluate({
        principal: baseInput.principal,
        auditContext: baseInput.auditContext,
        account: baseInput.account,
        payment: baseInput.payment,
        allocations: [{ invoice, amountCents: invoice.amountCents }],
        payerIdentified: true,
        matchConfidence: 0.99,
        noRegretAutoApply: true,
      })
    ).toThrowError(CashApplicationInputError);
  });
});
