import type {
  BillingAccount,
  CustomerInvoice,
  Payment,
  UploadedDocument
} from "@o2c/domain";
import type {
  EmailInboxRemittanceInput,
  BirInvoiceParserResult,
  ErpInvoiceCandidate,
  LinkedPaymentWorkflowRemittanceInput,
  UploadRemittanceInput
} from "@o2c/contracts";

export function makeBillingAccount(overrides: Partial<BillingAccount> = {}): BillingAccount {
  return {
    id: "billing-default",
    parentAccountId: "parent-default",
    accountNumber: "BA-DEFAULT",
    displayName: "Default Billing Account",
    currency: "PHP",
    accountTier: "standard",
    status: "active",
    centrallyPaid: false,
    metadata: {},
    createdAt: "2026-03-26T00:00:00.000Z",
    updatedAt: "2026-03-26T00:00:00.000Z",
    ...overrides
  };
}

export function makeInvoice(overrides: Partial<CustomerInvoice> = {}): CustomerInvoice {
  return {
    id: "invoice-default",
    createdAt: "2026-03-26T00:00:00.000Z",
    updatedAt: "2026-03-26T00:00:00.000Z",
    state: "uploaded_unmatched",
    parentAccountId: "parent-default",
    billingAccountId: "billing-default",
    branchId: "branch-default",
    invoiceNumber: "INV-DEFAULT",
    currency: "PHP",
    amountCents: 10000,
    metadata: {},
    ...overrides
  };
}

export function makeUploadedDocument(
  overrides: Partial<UploadedDocument> = {}
): UploadedDocument {
  return {
    id: "doc-default",
    createdAt: "2026-03-26T00:00:00.000Z",
    updatedAt: "2026-03-26T00:00:00.000Z",
    documentType: "invoice",
    source: "portal",
    storageKey: "uploads/doc-default.pdf",
    checksum: "sha256-default",
    uploadedBy: "user-default",
    uploadedAt: "2026-03-26T00:00:00.000Z",
    metadata: {},
    ...overrides
  };
}

export function makeBirInvoiceParserResult(
  overrides: Partial<BirInvoiceParserResult> = {}
): BirInvoiceParserResult {
  return {
    provider: "yield",
    document: {
      documentId: "doc-default",
      checksum: "sha256-default",
      fileName: "invoice.pdf",
      mimeType: "application/pdf",
      source: "portal",
      uploadedAt: "2026-03-26T00:00:00.000Z"
    },
    metadata: {
      fileHash: "sha256-default",
      parserVersion: "bir-parser@2.0.0",
      overallConfidence: 0.94
    },
    sellerLegalEntity: {
      extracted: "Acme Supplies Inc.",
      normalized: "Acme Supplies Inc.",
      extractionConfidence: 0.98,
      confidenceBand: "high"
    },
    buyerName: {
      extracted: "Metro Retail Group - Makati",
      normalized: "Metro Retail Group - Makati",
      extractionConfidence: 0.97,
      confidenceBand: "high"
    },
    invoiceNumber: {
      extracted: "SI-1001",
      normalized: "SI-1001",
      extractionConfidence: 0.99,
      confidenceBand: "high"
    },
    invoiceDate: {
      extracted: "2026-03-25",
      normalized: "2026-03-25",
      extractionConfidence: 0.97,
      confidenceBand: "high"
    },
    totalAmountCents: {
      extracted: 1500000,
      normalized: 1500000,
      extractionConfidence: 0.96,
      confidenceBand: "high"
    },
    currency: {
      extracted: "PHP",
      normalized: "PHP",
      extractionConfidence: 0.99,
      confidenceBand: "high"
    },
    lineItemsSummary: {
      extracted: [
        {
          description: "Cases of canned goods",
          quantity: 10,
          unitPriceCents: 150000,
          lineAmountCents: 1500000
        }
      ],
      normalized: [
        {
          description: "Cases of canned goods",
          quantity: 10,
          unitPriceCents: 150000,
          lineAmountCents: 1500000
        }
      ],
      extractionConfidence: 0.9,
      confidenceBand: "high"
    },
    documentType: {
      extracted: "bir_sales_invoice",
      normalized: "bir_sales_invoice",
      extractionConfidence: 0.95,
      confidenceBand: "high"
    },
    ...overrides
  };
}

export function makeErpInvoiceCandidate(
  overrides: Partial<ErpInvoiceCandidate> = {}
): ErpInvoiceCandidate {
  return {
    invoiceId: "erp-invoice-default",
    parentAccountId: "parent-default",
    billingAccountId: "billing-default",
    branchId: "branch-default",
    invoiceNumber: "SI-1001",
    invoiceDate: "2026-03-25",
    amountCents: 1500000,
    currency: "PHP",
    buyerName: "Metro Retail Group - Makati",
    sellerLegalEntity: "Acme Supplies Inc.",
    ...overrides
  };
}

export function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "payment-default",
    createdAt: "2026-03-26T00:00:00.000Z",
    updatedAt: "2026-03-26T00:00:00.000Z",
    state: "ingested_unmatched",
    parentAccountId: "parent-default",
    billingAccountId: "billing-default",
    paymentReference: "PAY-DEFAULT",
    currency: "PHP",
    amountCents: 100000,
    receivedAt: "2026-03-26T00:00:00.000Z",
    metadata: {},
    ...overrides
  };
}

export function makeRemittanceEmailInput(
  overrides: Partial<EmailInboxRemittanceInput> = {}
): EmailInboxRemittanceInput {
  return {
    channel: "email_inbox",
    sourceId: "email-msg-1",
    receivedAt: "2026-03-26T08:00:00.000Z",
    fromEmail: "ap@acme.example",
    fromName: "ACME AP Team",
    subject: "Remittance advice for INV-1001",
    bodyText:
      "Please apply payment reference RCPT-7788 for invoice INV-1001. Amount paid PHP 125,000.00.",
    attachments: [
      {
        documentId: "doc-remit-email-1",
        fileName: "remittance-advice.pdf",
        checksum: "sha256-email-1",
        mimeType: "application/pdf",
        source: "email",
        uploadedAt: "2026-03-26T08:00:00.000Z"
      }
    ],
    metadata: {},
    ...overrides
  };
}

export function makeUploadRemittanceInput(
  overrides: Partial<UploadRemittanceInput> = {}
): UploadRemittanceInput {
  return {
    channel: "upload",
    sourceId: "upload-1",
    uploadedAt: "2026-03-26T09:15:00.000Z",
    uploadedBy: "collector@o2c.local",
    fileName: "customer-remittance.txt",
    bodyText:
      "Payer: Northwind Retail. Invoice No INV-2001 settled. Amount paid PHP 87500.00.",
    attachments: [
      {
        documentId: "doc-remit-upload-1",
        fileName: "customer-remittance.txt",
        checksum: "sha256-upload-1",
        mimeType: "text/plain",
        source: "manual",
        uploadedAt: "2026-03-26T09:15:00.000Z"
      }
    ],
    metadata: {},
    ...overrides
  };
}

export function makeLinkedPaymentRemittanceInput(
  overrides: Partial<LinkedPaymentWorkflowRemittanceInput> = {}
): LinkedPaymentWorkflowRemittanceInput {
  return {
    channel: "linked_payment_workflow",
    sourceId: "workflow-link-1",
    linkedAt: "2026-03-26T10:30:00.000Z",
    paymentId: "payment-default",
    paymentReference: "PAY-DEFAULT",
    bodyText:
      "Attached remittance confirms INV-3001 and INV-3002 were included in this transfer for PHP 100000.00.",
    attachments: [
      {
        documentId: "doc-remit-workflow-1",
        fileName: "workflow-remittance.pdf",
        checksum: "sha256-workflow-1",
        mimeType: "application/pdf",
        source: "api",
        uploadedAt: "2026-03-26T10:30:00.000Z"
      }
    ],
    metadata: {},
    ...overrides
  };
}
