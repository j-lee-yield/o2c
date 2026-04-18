import { afterAll, describe, expect, it } from "vitest";

import { buildBirInvoiceReviewPreviewFixture } from "@o2c/seed";

import { buildApiApp } from "../app.js";

const app = buildApiApp();

afterAll(async () => {
  await app.close();
});

describe("BIR invoice review routes", () => {
  it("returns the review contract for a BIR upload preview", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/ingestion/bir-invoices/review-preview",
      payload: buildBirInvoiceReviewPreviewFixture(),
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();

    expect(body).toMatchObject({
      documentId: "doc-bir-1001",
      confidenceBand: "high",
      uploadedDocumentBehavior: "create_or_update_provisional_invoice",
      collectionsEligibility: "blocked_pending_match_or_confirmation",
    });
    expect(body.provisionalInvoice).toMatchObject({
      billingAccountId: "bill-1",
      branchId: "branch-makati",
      invoiceNumber: "SI-1001",
    });
    expect(body.matchSuggestions[0]).toMatchObject({
      invoiceId: "erp-1001",
      confidenceBand: "high",
    });
  });

  it("stores a BIR invoice case with extracted fields and provisional invoice data", async () => {
    const payload = {
      ...buildBirInvoiceReviewPreviewFixture(),
      auditContext: {
        actorId: "collector-1",
        actorType: "user",
        correlationId: "corr-bir-store",
        occurredAt: "2026-03-26T01:00:00.000Z",
      },
      storageKey: "uploads/bir/doc-bir-1001.pdf",
    };

    const response = await app.inject({
      method: "POST",
      url: "/v1/ingestion/bir-invoices/cases",
      payload,
    });

    expect(response.statusCode).toBe(201);

    const body = response.json();
    expect(body).toMatchObject({
      documentId: "doc-bir-1001",
      status: "pending_review",
      humanConfirmed: false,
      uploadedDocument: {
        documentType: "bir_invoice",
        storageKey: "uploads/bir/doc-bir-1001.pdf",
        uploadedBy: "collector-1",
      },
    });
    expect(body.reviewCase.duplicateCheck.classification).toBe("unique");
    expect(body.provisionalInvoice).toMatchObject({
      state: "uploaded_unmatched",
      uploadedDocumentId: "doc-bir-1001",
      invoiceNumber: "SI-1001",
    });
  });

  it("applies human corrections, selects an ERP match, and locks the case", async () => {
    const createPayload = {
      ...buildBirInvoiceReviewPreviewFixture(),
      auditContext: {
        actorId: "collector-2",
        actorType: "user",
        correlationId: "corr-bir-review-create",
        occurredAt: "2026-03-26T02:00:00.000Z",
      },
    };

    await app.inject({
      method: "POST",
      url: "/v1/ingestion/bir-invoices/cases",
      payload: createPayload,
    });

    const reviewResponse = await app.inject({
      method: "POST",
      url: "/v1/ingestion/bir-invoices/doc-bir-1001/review",
      payload: {
        auditContext: {
          actorId: "manager-1",
          actorType: "user",
          correlationId: "corr-bir-review-lock",
          occurredAt: "2026-03-26T03:00:00.000Z",
        },
        corrections: {
          buyerName: {
            value: "Metro Retail Group - Makati Branch",
            lock: true,
          },
        },
        selectedErpInvoiceId: "erp-1001",
        humanConfirmed: true,
        lockDocument: true,
      },
    });

    expect(reviewResponse.statusCode).toBe(200);

    const body = reviewResponse.json();
    expect(body).toMatchObject({
      documentId: "doc-bir-1001",
      status: "locked",
      humanConfirmed: true,
      matchedErpInvoiceId: "erp-1001",
      reviewCase: {
        collectionsEligibility: "eligible",
      },
    });
    expect(body.lockedByActorId).toBe("manager-1");
    expect(body.parserResult.buyerName.humanCorrected).toBe("Metro Retail Group - Makati Branch");
    expect(body.parserResult.buyerName.finalLocked).toBe("Metro Retail Group - Makati Branch");
    expect(body.provisionalInvoice.state).toBe("matched_to_erp");
    expect(body.provisionalInvoice.metadata.collectionsEligibility).toBe("eligible");
  });

  it("lets a reviewer override duplicate blocking and still lock the document", async () => {
    const fixture = buildBirInvoiceReviewPreviewFixture();
    await app.inject({
      method: "POST",
      url: "/v1/ingestion/bir-invoices/cases",
      payload: {
        ...fixture,
        duplicateCandidates: [
          {
            entityId: "dup-1",
            fileHash: fixture.parserResult.metadata.fileHash,
            invoiceNumber: "SI-1001",
            sellerLegalEntity: "Acme Supplies Inc.",
            buyerName: "Metro Retail Group - Makati",
            invoiceDate: "2026-03-25",
            totalAmountCents: 1500000,
            currency: "PHP",
          },
        ],
        auditContext: {
          actorId: "collector-3",
          actorType: "user",
          correlationId: "corr-bir-dup-create",
          occurredAt: "2026-03-26T04:00:00.000Z",
        },
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/ingestion/bir-invoices/doc-bir-1001/review",
      payload: {
        auditContext: {
          actorId: "manager-2",
          actorType: "user",
          correlationId: "corr-bir-dup-override",
          occurredAt: "2026-03-26T05:00:00.000Z",
        },
        humanConfirmed: true,
        lockDocument: true,
        overrideDuplicateBlock: true,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("locked");
    expect(body.reviewCase.duplicateCheck.classification).toBe("unique");
    expect(body.provisionalInvoice.state).toBe("uploaded_unmatched");
  });
});
