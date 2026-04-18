import { describe, expect, it } from "vitest";

import { InMemoryAuditLogger } from "@o2c/audit";
import { makeBirInvoiceParserResult, makeErpInvoiceCandidate } from "@o2c/testkit";

import {
  BirInvoiceCaseLockedError,
  BirInvoiceReviewService,
  InMemoryBirInvoiceCaseRepository,
} from "./bir-invoice-review-service.js";

const auditContext = {
  actorId: "collector-1",
  actorType: "user" as const,
  correlationId: "corr-bir-review-service",
  occurredAt: "2026-03-26T00:00:00.000Z",
};

describe("BirInvoiceReviewService", () => {
  it("stores extracted fields, duplicate analysis, match suggestions, and provisional invoice output", async () => {
    const service = new BirInvoiceReviewService({
      auditLogger: new InMemoryAuditLogger(),
      repository: new InMemoryBirInvoiceCaseRepository(),
      now: () => "2026-03-26T00:00:00.000Z",
    });

    const record = await service.createCase({
      parserResult: makeBirInvoiceParserResult(),
      hierarchy: {
        parentAccountId: "parent-1",
        billingAccountId: "bill-1",
        branchId: "branch-1",
      },
      erpCandidates: [makeErpInvoiceCandidate({ invoiceId: "erp-1" })],
      duplicateCandidates: [],
      auditContext,
    });

    expect(record.status).toBe("pending_review");
    expect(record.reviewCase.matchSuggestions[0]?.invoiceId).toBe("erp-1");
    expect(record.provisionalInvoice).toMatchObject({
      state: "uploaded_unmatched",
      uploadedDocumentId: "doc-default",
      invoiceNumber: "SI-1001",
    });
  });

  it("lets a human lock corrected values and create a provisional invoice for medium-confidence uploads", async () => {
    const service = new BirInvoiceReviewService({
      auditLogger: new InMemoryAuditLogger(),
      repository: new InMemoryBirInvoiceCaseRepository(),
      now: () => "2026-03-26T00:00:00.000Z",
    });

    await service.createCase({
      parserResult: makeBirInvoiceParserResult({
        metadata: {
          fileHash: "sha256-medium-1",
          parserVersion: "bir-parser@2.0.0",
          overallConfidence: 0.79,
        },
        documentType: {
          extracted: "bir_sales_invoice",
          normalized: "bir_sales_invoice",
          extractionConfidence: 0.76,
          confidenceBand: "medium",
        },
      }),
      hierarchy: {
        parentAccountId: "parent-1",
        billingAccountId: "bill-1",
      },
      erpCandidates: [makeErpInvoiceCandidate({ invoiceId: "erp-locked-1" })],
      auditContext,
    });

    const reviewed = await service.reviewCase("doc-default", {
      auditContext: {
        ...auditContext,
        actorId: "manager-1",
      },
      corrections: {
        invoiceNumber: { value: "SI-1001", lock: true },
      },
      humanConfirmed: true,
      selectedErpInvoiceId: "erp-locked-1",
      lockDocument: true,
    });

    expect(reviewed.status).toBe("locked");
    expect(reviewed.provisionalInvoice?.metadata.requiresHumanReview).toBe(false);
    expect(reviewed.provisionalInvoice?.state).toBe("matched_to_erp");
    expect(reviewed.parserResult.invoiceNumber.finalLocked).toBe("SI-1001");
  });

  it("allows duplicate review override during a locked human confirmation", async () => {
    const service = new BirInvoiceReviewService({
      auditLogger: new InMemoryAuditLogger(),
      repository: new InMemoryBirInvoiceCaseRepository(),
      now: () => "2026-03-26T00:00:00.000Z",
    });

    await service.createCase({
      parserResult: makeBirInvoiceParserResult(),
      hierarchy: {
        parentAccountId: "parent-1",
        billingAccountId: "bill-1",
      },
      duplicateCandidates: [
        {
          entityId: "dup-1",
          fileHash: "sha256-default",
          invoiceNumber: "SI-1001",
          sellerLegalEntity: "Acme Supplies Inc.",
          buyerName: "Metro Retail Group - Makati",
          invoiceDate: "2026-03-25",
          totalAmountCents: 1500000,
          currency: "PHP",
        },
      ],
      auditContext,
    });

    const reviewed = await service.reviewCase("doc-default", {
      auditContext,
      humanConfirmed: true,
      lockDocument: true,
      overrideDuplicateBlock: true,
    });

    expect(reviewed.status).toBe("locked");
    expect(reviewed.provisionalInvoice?.state).toBe("uploaded_unmatched");
    expect(reviewed.reviewCase.duplicateCheck.classification).toBe("unique");
    expect(reviewed.duplicateCandidates).toHaveLength(1);
  });

  it("blocks changes after lock", async () => {
    const service = new BirInvoiceReviewService({
      auditLogger: new InMemoryAuditLogger(),
      repository: new InMemoryBirInvoiceCaseRepository(),
      now: () => "2026-03-26T00:00:00.000Z",
    });

    await service.createCase({
      parserResult: makeBirInvoiceParserResult(),
      hierarchy: {
        parentAccountId: "parent-1",
        billingAccountId: "bill-1",
      },
      auditContext,
    });

    await service.reviewCase("doc-default", {
      auditContext,
      lockDocument: true,
    });

    await expect(() =>
      service.reviewCase("doc-default", {
        auditContext,
        corrections: {
          buyerName: { value: "Blocked update" },
        },
      })
    ).rejects.toThrow(BirInvoiceCaseLockedError);
  });
});
