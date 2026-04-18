import type { BillingAccount, CustomerInvoice, Payment } from "@o2c/domain";
import type {
  CashApplicationBankTransaction,
  CashApplicationEngineInput,
  CashApplicationErpPaymentRecord,
  CashApplicationLedgerRecord,
  CashApplicationProofOfPayment,
  CashApplicationRemittanceEmail,
  CashApplicationSettlementWebhook,
} from "@o2c/workflows";

export interface CashApplicationFixture {
  id: string;
  title: string;
  account: BillingAccount;
  payment: Payment;
  invoices: CustomerInvoice[];
  paymentsLedger: CashApplicationLedgerRecord[];
  bankTransactions: CashApplicationBankTransaction[];
  remittanceEmails: CashApplicationRemittanceEmail[];
  uploadedProofsOfPayment: CashApplicationProofOfPayment[];
  erpPaymentRecords: CashApplicationErpPaymentRecord[];
  settlementWebhooks: CashApplicationSettlementWebhook[];
  knownCustomerBehavior: NonNullable<CashApplicationEngineInput["knownCustomerBehavior"]>;
}

const now = "2026-03-26T00:00:00.000Z";

export function buildCashApplicationFixtures(): CashApplicationFixture[] {
  return [
    {
      id: "exact-settled-parent-aware",
      title: "Settled exact match with parent-aware payer behavior",
      account: makeAccount({
        id: "bill-makati",
        parentAccountId: "parent-metro",
        displayName: "Metro Retail Group - Makati",
        centrallyPaid: true,
      }),
      payment: makePayment({
        id: "pay-makati-1",
        parentAccountId: "parent-metro",
        billingAccountId: "bill-makati",
        amountCents: 1500000,
        paymentReference: "RCPT-7788",
        metadata: {
          payerName: "Metro Retail Group Treasury",
          payerBankAccount: "0917-AR-9981",
        },
      }),
      invoices: [
        makeInvoice({
          id: "inv-makati-1",
          parentAccountId: "parent-metro",
          billingAccountId: "bill-makati",
          branchId: "branch-makati",
          invoiceNumber: "SI-1001",
          amountCents: 1500000,
          invoiceDate: "2026-03-12",
          metadata: {
            customerName: "Metro Retail Group - Makati",
            poNumber: "PO-7711",
            openAmountCents: 1500000,
            latestVerifiedSnapshot: true,
            knownPayerBankAccounts: ["0917-AR-9981"],
          },
        }),
      ],
      paymentsLedger: [
        {
          id: "ledger-makati-1",
          paymentId: "pay-makati-1",
          bankReference: "RCPT-7788",
          payerName: "Metro Retail Group Treasury",
          payerBankAccount: "0917-AR-9981",
          amountCents: 1500000,
          settled: true,
          confirmed: true,
        },
      ],
      bankTransactions: [
        {
          id: "bank-makati-1",
          bankReference: "RCPT-7788",
          amountCents: 1500000,
          payerName: "Metro Retail Group Treasury",
          payerBankAccount: "0917-AR-9981",
        },
      ],
      remittanceEmails: [
        {
          id: "email-makati-1",
          subject: "Remittance SI-1001",
          bodyText: "Apply RCPT-7788 to SI-1001 / PO-7711.",
          payerName: "Metro Retail Group Treasury",
          receivedAt: "2026-03-26T08:00:00.000Z",
        },
      ],
      uploadedProofsOfPayment: [
        {
          id: "proof-makati-1",
          fileName: "proof.pdf",
          extractedText: "RCPT-7788 settled for invoice SI-1001.",
          payerName: "Metro Retail Group Treasury",
          bankReference: "RCPT-7788",
          payerBankAccount: "0917-AR-9981",
        },
      ],
      erpPaymentRecords: [
        {
          id: "erp-makati-1",
          paymentReference: "RCPT-7788",
          settled: true,
          confirmed: true,
          writebackPathAvailable: true,
          referencedInvoiceNumbers: ["SI-1001"],
        },
      ],
      settlementWebhooks: [
        {
          id: "webhook-makati-1",
          status: "confirmed",
          bankReference: "RCPT-7788",
          payerBankAccount: "0917-AR-9981",
        },
      ],
      knownCustomerBehavior: {
        expectedPayerNames: ["Metro Retail Group Treasury", "Metro Retail Group - Makati"],
        expectedPayerBankAccounts: ["0917-AR-9981"],
        parentPaysForChildren: true,
        allowBankChargeVarianceCents: 500,
        allowShortPayVarianceCents: 500,
      },
    },
    {
      id: "split-branch-payment",
      title: "One payment across multiple branch-tagged invoices",
      account: makeAccount({
        id: "bill-cebu",
        parentAccountId: "parent-metro",
        displayName: "Metro Retail Group - Cebu",
      }),
      payment: makePayment({
        id: "pay-cebu-1",
        parentAccountId: "parent-metro",
        billingAccountId: "bill-cebu",
        amountCents: 2000000,
        paymentReference: "RCPT-8821",
        metadata: {
          payerName: "Metro Retail Group - Cebu",
          payerBankAccount: "6222-CEB-01",
        },
      }),
      invoices: [
        makeInvoice({
          id: "inv-cebu-1",
          parentAccountId: "parent-metro",
          billingAccountId: "bill-cebu",
          branchId: "branch-cebu-north",
          invoiceNumber: "SI-2001",
          amountCents: 1200000,
          invoiceDate: "2026-03-08",
          metadata: {
            customerName: "Metro Retail Group - Cebu",
            openAmountCents: 1200000,
            latestVerifiedSnapshot: true,
          },
        }),
        makeInvoice({
          id: "inv-cebu-2",
          parentAccountId: "parent-metro",
          billingAccountId: "bill-cebu",
          branchId: "branch-cebu-south",
          invoiceNumber: "SI-2002",
          amountCents: 800000,
          invoiceDate: "2026-03-09",
          metadata: {
            customerName: "Metro Retail Group - Cebu",
            openAmountCents: 800000,
            latestVerifiedSnapshot: true,
          },
        }),
      ],
      paymentsLedger: [
        {
          id: "ledger-cebu-1",
          paymentId: "pay-cebu-1",
          bankReference: "RCPT-8821",
          payerName: "Metro Retail Group - Cebu",
          payerBankAccount: "6222-CEB-01",
          amountCents: 2000000,
          settled: true,
          confirmed: true,
        },
      ],
      bankTransactions: [
        {
          id: "bank-cebu-1",
          bankReference: "RCPT-8821",
          amountCents: 2000000,
          payerName: "Metro Retail Group - Cebu",
          payerBankAccount: "6222-CEB-01",
        },
      ],
      remittanceEmails: [
        {
          id: "email-cebu-1",
          subject: "Remittance SI-2001 and SI-2002",
          bodyText: "Apply RCPT-8821 to SI-2001 and SI-2002.",
          payerName: "Metro Retail Group - Cebu",
          receivedAt: "2026-03-26T09:00:00.000Z",
        },
      ],
      uploadedProofsOfPayment: [],
      erpPaymentRecords: [
        {
          id: "erp-cebu-1",
          paymentReference: "RCPT-8821",
          settled: true,
          confirmed: true,
          writebackPathAvailable: true,
          referencedInvoiceNumbers: ["SI-2001", "SI-2002"],
        },
      ],
      settlementWebhooks: [{ id: "webhook-cebu-1", status: "confirmed", bankReference: "RCPT-8821" }],
      knownCustomerBehavior: {
        expectedPayerNames: ["Metro Retail Group - Cebu"],
        expectedPayerBankAccounts: ["6222-CEB-01"],
        branchReferenceBias: true,
        allowBankChargeVarianceCents: 500,
        allowShortPayVarianceCents: 500,
      },
    },
  ];
}

function makeAccount(overrides: Partial<BillingAccount>): BillingAccount {
  return {
    id: "bill-default",
    parentAccountId: "parent-default",
    accountNumber: "BA-DEFAULT",
    displayName: "Default Billing Account",
    currency: "PHP",
    accountTier: "standard",
    status: "active",
    centrallyPaid: false,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<CustomerInvoice>): CustomerInvoice {
  return {
    id: "inv-default",
    parentAccountId: "parent-default",
    billingAccountId: "bill-default",
    invoiceNumber: "SI-DEFAULT",
    currency: "PHP",
    amountCents: 100000,
    state: "matched_to_erp",
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makePayment(overrides: Partial<Payment>): Payment {
  return {
    id: "pay-default",
    parentAccountId: "parent-default",
    billingAccountId: "bill-default",
    paymentReference: "PAY-DEFAULT",
    currency: "PHP",
    amountCents: 100000,
    receivedAt: now,
    state: "ingested_unmatched",
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
