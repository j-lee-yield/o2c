import type { BirInvoiceReviewPreviewRequest } from "@o2c/contracts";

export function buildBirInvoiceReviewPreviewFixture(): BirInvoiceReviewPreviewRequest {
  return {
    parserResult: {
      provider: "yield",
      document: {
        documentId: "doc-bir-1001",
        fileName: "bir-invoice-1001.pdf",
        checksum: "sha256-bir-1001",
        mimeType: "application/pdf",
        source: "portal",
        uploadedAt: "2026-03-26T00:00:00.000Z",
      },
      metadata: {
        fileHash: "sha256-bir-1001",
        parserVersion: "bir-parser@2.0.0",
        overallConfidence: 0.96,
      },
      sellerLegalEntity: {
        extracted: "Acme Supplies Inc.",
        normalized: "Acme Supplies Inc.",
        extractionConfidence: 0.98,
        confidenceBand: "high",
      },
      buyerName: {
        extracted: "Metro Retail Group - Makati",
        normalized: "Metro Retail Group - Makati",
        extractionConfidence: 0.97,
        confidenceBand: "high",
      },
      invoiceNumber: {
        extracted: "SI-1001",
        normalized: "SI-1001",
        extractionConfidence: 0.99,
        confidenceBand: "high",
      },
      invoiceDate: {
        extracted: "2026-03-25",
        normalized: "2026-03-25",
        extractionConfidence: 0.98,
        confidenceBand: "high",
      },
      totalAmountCents: {
        extracted: 1500000,
        normalized: 1500000,
        extractionConfidence: 0.96,
        confidenceBand: "high",
      },
      currency: {
        extracted: "PHP",
        normalized: "PHP",
        extractionConfidence: 0.99,
        confidenceBand: "high",
      },
      poNumber: {
        extracted: "PO-7788",
        normalized: "PO-7788",
        extractionConfidence: 0.89,
        confidenceBand: "high",
      },
      lineItemsSummary: {
        extracted: [
          {
            description: "Cases of canned goods",
            quantity: 10,
            unitPriceCents: 150000,
            lineAmountCents: 1500000,
          },
        ],
        normalized: [
          {
            description: "Cases of canned goods",
            quantity: 10,
            unitPriceCents: 150000,
            lineAmountCents: 1500000,
          },
        ],
        extractionConfidence: 0.91,
        confidenceBand: "high",
      },
      documentType: {
        extracted: "bir_sales_invoice",
        normalized: "bir_sales_invoice",
        extractionConfidence: 0.95,
        confidenceBand: "high",
      },
      tin: {
        extracted: "123-456-789-000",
        normalized: "123456789000",
        extractionConfidence: 0.86,
        confidenceBand: "medium",
      },
      businessStyle: {
        extracted: "Wholesale distribution",
        normalized: "Wholesale distribution",
        extractionConfidence: 0.82,
        confidenceBand: "medium",
      },
      deliveryOrBillToAddress: {
        extracted: "Makati City, Metro Manila",
        normalized: "Makati City, Metro Manila",
        extractionConfidence: 0.8,
        confidenceBand: "medium",
      },
      receivedStampPresent: {
        extracted: true,
        normalized: true,
        extractionConfidence: 0.78,
        confidenceBand: "medium",
      },
      signaturePresent: {
        extracted: true,
        normalized: true,
        extractionConfidence: 0.79,
        confidenceBand: "medium",
      },
      branchId: {
        extracted: "branch-makati",
        normalized: "branch-makati",
        extractionConfidence: 0.88,
        confidenceBand: "high",
      },
    },
    hierarchy: {
      parentAccountId: "parent-1",
      billingAccountId: "bill-1",
      branchId: "branch-makati",
    },
    duplicateCandidates: [
      {
        entityId: "doc-older-1",
        documentId: "doc-older-1",
        fileHash: "sha256-older-1",
        sellerLegalEntity: "Acme Supplies Inc.",
        buyerName: "Metro Retail Group - Makati",
        invoiceNumber: "SI-1000",
        invoiceDate: "2026-03-20",
        totalAmountCents: 1300000,
        currency: "PHP",
      },
    ],
    erpCandidates: [
      {
        invoiceId: "erp-1001",
        parentAccountId: "parent-1",
        billingAccountId: "bill-1",
        branchId: "branch-makati",
        invoiceNumber: "SI-1001",
        invoiceDate: "2026-03-25",
        amountCents: 1500000,
        currency: "PHP",
        buyerName: "Metro Retail Group - Makati",
        sellerLegalEntity: "Acme Supplies Inc.",
      },
      {
        invoiceId: "erp-1002",
        parentAccountId: "parent-1",
        billingAccountId: "bill-2",
        branchId: "branch-hq",
        invoiceNumber: "SI-2002",
        invoiceDate: "2026-03-25",
        amountCents: 1500000,
        currency: "PHP",
        buyerName: "Metro Retail Group - HQ",
        sellerLegalEntity: "Acme Supplies Inc.",
      },
    ],
    erpMatched: false,
    humanConfirmed: false,
  };
}
