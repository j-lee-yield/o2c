import { describe, expect, it } from "vitest";

import { InMemoryAuditLogger } from "@o2c/audit";

import {
  classifyDuplicateSignals,
  evaluateBankStatementIngestion,
  evaluateBirInvoiceIngestion,
  evaluateRemittanceIngestion,
} from "./ingestion-foundation.js";

const auditContext = {
  actorId: "system",
  actorType: "automation" as const,
  correlationId: "corr-1",
  occurredAt: "2026-03-26T00:00:00.000Z",
};

describe("ingestion foundation", () => {
  it("allows high-confidence BIR OCR to create provisional invoices but keeps collections blocked until match or confirmation", async () => {
    const auditLogger = new InMemoryAuditLogger();

    const decision = await evaluateBirInvoiceIngestion({
      extraction: {
        provider: "yield",
        document: {
          documentId: "doc-1",
          checksum: "sha256-1",
          source: "email",
          uploadedAt: "2026-03-26T00:00:00.000Z",
        },
        overallConfidence: 0.97,
        invoiceNumber: { value: "INV-100", confidence: 0.99 },
      },
      erpMatched: false,
      humanConfirmed: false,
      auditContext,
      deps: { auditLogger },
    });

    expect(decision.createProvisionalInvoice).toBe(true);
    expect(decision.createMatchingSuggestion).toBe(true);
    expect(decision.collectionsEligibility).toBe("blocked_pending_match_or_confirmation");
    expect(auditLogger.events).toHaveLength(1);
  });

  it("routes exact-duplicate BIR uploads to duplicate review", async () => {
    const auditLogger = new InMemoryAuditLogger();

    const decision = await evaluateBirInvoiceIngestion({
      extraction: {
        provider: "yield",
        document: {
          documentId: "doc-2",
          checksum: "sha256-2",
          source: "email",
          uploadedAt: "2026-03-26T00:00:00.000Z",
        },
        overallConfidence: 0.99,
        invoiceNumber: { value: "INV-101", confidence: 0.99 },
      },
      duplicateSignals: { sameDocumentChecksum: true },
      erpMatched: false,
      humanConfirmed: false,
      auditContext,
      deps: { auditLogger },
    });

    expect(decision.createProvisionalInvoice).toBe(false);
    expect(decision.review?.queue).toBe("duplicate_review");
  });

  it("persists Perfios payloads and pushes low-confidence transactions to review", async () => {
    const auditLogger = new InMemoryAuditLogger();

    const decision = await evaluateBankStatementIngestion({
      statement: {
        provider: "perfios",
        document: {
          documentId: "stmt-1",
          checksum: "sha256-stmt-1",
          source: "email",
          uploadedAt: "2026-03-26T00:00:00.000Z",
        },
        raw_payload: { provider: "perfios" },
        statement: {
          account_number_masked: "XXXX1234",
          parser_confidence: 0.94,
        },
        transactions: [
          {
            external_transaction_id: "txn-1",
            date: "2026-03-25",
            description: "Customer payment",
            amount: 100000,
            parser_confidence: 0.95,
          },
          {
            external_transaction_id: "txn-2",
            date: "2026-03-25",
            description: "Ambiguous transaction",
            amount: 50000,
            parser_confidence: 0.7,
          }
        ],
      },
      auditContext,
      deps: { auditLogger },
    });

    expect(decision.persistRawPayload).toBe(true);
    expect(decision.persistNormalizedTransactions).toBe(true);
    expect(decision.transactionDecisions[0]).toMatchObject({
      transactionId: "txn-1",
      route: "create_provisional_payment_candidate"
    });
    expect(decision.transactionDecisions[1]).toMatchObject({
      transactionId: "txn-2",
      route: "queue_review"
    });
  });

  it("routes ambiguous remittances to matching review", async () => {
    const auditLogger = new InMemoryAuditLogger();

    const decision = await evaluateRemittanceIngestion({
      extraction: {
        provider: "yield",
        document: {
          documentId: "remit-1",
          checksum: "sha256-remit-1",
          source: "email",
          uploadedAt: "2026-03-26T00:00:00.000Z",
        },
        overallConfidence: 0.82,
        referencedInvoices: [],
      },
      matchedPaymentCount: 2,
      matchedInvoiceCount: 3,
      auditContext,
      deps: { auditLogger },
    });

    expect(decision.route).toBe("queue_review");
    expect(decision.review?.queue).toBe("matching_review");
  });

  it("classifies exact and suspected duplicates conservatively", () => {
    expect(
      classifyDuplicateSignals(
        { sameProviderRecordId: true },
        { suspectedDuplicateMinSimilarity: 0.92 }
      ).classification
    ).toBe("exact_duplicate");

    expect(
      classifyDuplicateSignals(
        { fuzzySimilarityScore: 0.95 },
        { suspectedDuplicateMinSimilarity: 0.92 }
      ).classification
    ).toBe("suspected_duplicate");
  });
});
