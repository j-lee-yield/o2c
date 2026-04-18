import { describe, expect, it } from "vitest";

import { InMemoryAuditLogger } from "@o2c/audit";
import { makeBirInvoiceParserResult, makeErpInvoiceCandidate } from "@o2c/testkit";

import {
  MissingBirInvoiceFieldError,
  buildBirInvoiceReviewCase,
  createProvisionalInvoiceDraft,
  detectBirInvoiceDuplicates,
  determineBirInvoiceConfidenceBand,
  resolveBirInvoiceFieldValue,
} from "./bir-invoice-ingestion.js";

const auditContext = {
  actorId: "system",
  actorType: "automation" as const,
  correlationId: "corr-bir-1",
  occurredAt: "2026-03-26T00:00:00.000Z",
};

describe("bir invoice ingestion", () => {
  it("creates provisional review output for high-confidence unique uploads", async () => {
    const auditLogger = new InMemoryAuditLogger();
    const parserResult = makeBirInvoiceParserResult({
      branchId: {
        extracted: "branch-source",
        normalized: "branch-source",
        extractionConfidence: 0.88,
        confidenceBand: "high",
      },
    });

    const reviewCase = await buildBirInvoiceReviewCase({
      parserResult,
      hierarchy: {
        parentAccountId: "parent-1",
        billingAccountId: "bill-1",
        branchId: "branch-fallback",
      },
      erpCandidates: [
        makeErpInvoiceCandidate({ invoiceId: "erp-exact" }),
        makeErpInvoiceCandidate({
          invoiceId: "erp-weaker",
          invoiceNumber: "SI-9999",
          buyerName: "Different buyer",
        }),
      ],
      auditContext,
      deps: { auditLogger },
    });

    expect(reviewCase.confidenceBand).toBe("high");
    expect(reviewCase.uploadedDocumentBehavior).toBe("create_or_update_provisional_invoice");
    expect(reviewCase.provisionalInvoice?.branchId).toBe("branch-source");
    expect(reviewCase.matchSuggestions[0]).toMatchObject({
      invoiceId: "erp-exact",
      confidenceBand: "high",
    });
    expect(reviewCase.allowedDownstreamActions).toContain("suggest_match_to_erp_invoice");
    expect(reviewCase.collectionsEligibility).toBe("blocked_pending_match_or_confirmation");
    expect(auditLogger.events).toHaveLength(2);
  });

  it("routes medium-confidence uploads into review drafts", async () => {
    const auditLogger = new InMemoryAuditLogger();
    const parserResult = makeBirInvoiceParserResult({
      metadata: {
        fileHash: "sha256-medium",
        parserVersion: "bir-parser@2.0.0",
        overallConfidence: 0.81,
      },
      documentType: {
        extracted: "bir_sales_invoice",
        normalized: "bir_sales_invoice",
        extractionConfidence: 0.78,
        confidenceBand: "medium",
      },
    });

    const reviewCase = await buildBirInvoiceReviewCase({
      parserResult,
      hierarchy: {
        parentAccountId: "parent-1",
        billingAccountId: "bill-1",
      },
      auditContext,
      deps: { auditLogger },
    });

    expect(determineBirInvoiceConfidenceBand(parserResult)).toBe("medium");
    expect(reviewCase.uploadedDocumentBehavior).toBe("create_review_draft");
    expect(reviewCase.review?.queue).toBe("ingestion_review");
    expect(reviewCase.provisionalInvoice).toBeUndefined();
    expect(reviewCase.allowedDownstreamActions).toEqual([]);
  });

  it("stores low-confidence uploads without automation", async () => {
    const auditLogger = new InMemoryAuditLogger();
    const parserResult = makeBirInvoiceParserResult({
      metadata: {
        fileHash: "sha256-low",
        parserVersion: "bir-parser@2.0.0",
        overallConfidence: 0.5,
      },
      lineItemsSummary: {
        extracted: [],
        normalized: [],
        extractionConfidence: 0.45,
        confidenceBand: "low",
      },
      documentType: {
        extracted: "unknown",
        normalized: "unknown",
        extractionConfidence: 0.4,
        confidenceBand: "low",
      },
    });

    const reviewCase = await buildBirInvoiceReviewCase({
      parserResult,
      hierarchy: {
        parentAccountId: "parent-1",
        billingAccountId: "bill-1",
      },
      auditContext,
      deps: { auditLogger },
    });

    expect(reviewCase.confidenceBand).toBe("low");
    expect(reviewCase.uploadedDocumentBehavior).toBe("store_document_only");
    expect(reviewCase.allowedDownstreamActions).toEqual([]);
    expect(reviewCase.matchSuggestions).toEqual([]);
  });

  it("detects exact duplicates from file hash and business key", () => {
    const duplicateCheck = detectBirInvoiceDuplicates({
      parserResult: makeBirInvoiceParserResult(),
      candidates: [
        {
          entityId: "doc-1",
          fileHash: "sha256-default",
          sellerLegalEntity: "Acme Supplies Inc.",
          buyerName: "Metro Retail Group - Makati",
          invoiceNumber: "SI-1001",
          invoiceDate: "2026-03-25",
          totalAmountCents: 1500000,
          currency: "PHP",
        },
      ],
    });

    expect(duplicateCheck.classification).toBe("exact_duplicate");
    expect(duplicateCheck.matchedEntityIds).toEqual(["doc-1"]);
  });

  it("uses final locked values when building provisional invoices", () => {
    const parserResult = makeBirInvoiceParserResult({
      buyerName: {
        extracted: "Metro Retail Group",
        normalized: "Metro Retail Group",
        humanCorrected: "Metro Retail Group - Makati",
        finalLocked: "Metro Retail Group - Makati Branch",
        extractionConfidence: 0.7,
        confidenceBand: "medium",
      },
    });

    expect(resolveBirInvoiceFieldValue(parserResult.buyerName)).toBe(
      "Metro Retail Group - Makati Branch"
    );

    const provisionalInvoice = createProvisionalInvoiceDraft({
      parserResult,
      hierarchy: {
        parentAccountId: "parent-1",
        billingAccountId: "bill-1",
      },
    });

    expect(provisionalInvoice.buyerName).toBe("Metro Retail Group - Makati Branch");
  });

  it("throws a typed error when a required field is missing for provisional creation", () => {
    const parserResult = makeBirInvoiceParserResult({
      invoiceNumber: {
        extractionConfidence: 0.99,
        confidenceBand: "high",
      },
    });

    expect(() =>
      createProvisionalInvoiceDraft({
        parserResult,
        hierarchy: {
          parentAccountId: "parent-1",
          billingAccountId: "bill-1",
        },
      })
    ).toThrowError(MissingBirInvoiceFieldError);
  });
});
