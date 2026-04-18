import { describe, expect, it } from "vitest";

import { InMemoryAuditLogger } from "@o2c/audit";
import {
  makeInvoice,
  makeLinkedPaymentRemittanceInput,
  makePayment,
  makeRemittanceEmailInput,
  makeUploadRemittanceInput
} from "@o2c/testkit";

import {
  InMemoryInvoiceRemittanceLinker,
  InMemoryPaymentRemittanceLinker,
  InMemoryRemittanceRepository,
  NativeRemittanceParser,
  RemittanceIngestionProcessingError,
  RemittanceIngestionService
} from "./remittance-ingestion.js";

const auditContext = {
  actorId: "system",
  actorType: "automation" as const,
  correlationId: "corr-remit-1",
  occurredAt: "2026-03-26T00:00:00.000Z"
};

describe("RemittanceIngestionService", () => {
  it("ingests an email remittance, parses references, and links to a candidate payment", async () => {
    const auditLogger = new InMemoryAuditLogger();
    const service = new RemittanceIngestionService({
      auditLogger,
      parser: new NativeRemittanceParser(),
      paymentLinker: new InMemoryPaymentRemittanceLinker([
        makePayment({
          id: "payment-email-1",
          paymentReference: "RCPT-7788",
          amountCents: 12500000
        })
      ]),
      invoiceLinker: new InMemoryInvoiceRemittanceLinker([
        makeInvoice({
          id: "invoice-email-1",
          invoiceNumber: "INV-1001",
          amountCents: 12500000
        })
      ]),
      repository: new InMemoryRemittanceRepository()
    });

    const result = await service.ingest({
      source: makeRemittanceEmailInput(),
      auditContext
    });

    expect(result.outcome.route).toBe("link_payment_candidate");
    expect(result.outcome.state).toBe("linked_to_payment");
    expect(result.outcome.linkedPaymentId).toBe("payment-email-1");
    expect(result.record.attachmentDocumentIds).toEqual(["doc-remit-email-1"]);
    expect(result.record.paymentReference).toBe("RCPT-7788");
    expect(result.learningEvents.map((event) => event.eventType)).toEqual([
      "remittance_received",
      "remittance_parsed",
      "remittance_linked",
    ]);
    expect(auditLogger.events.map(({ event }) => event.action)).toEqual([
      "remittance.received",
      "ingestion.remittance_evaluated",
      "remittance.routed",
    ]);
  });

  it("ingests an upload remittance and links it to invoice candidates when no payment match exists", async () => {
    const service = new RemittanceIngestionService({
      auditLogger: new InMemoryAuditLogger(),
      parser: new NativeRemittanceParser(),
      paymentLinker: new InMemoryPaymentRemittanceLinker([]),
      invoiceLinker: new InMemoryInvoiceRemittanceLinker([
        makeInvoice({
          id: "invoice-upload-1",
          invoiceNumber: "INV-2001",
          amountCents: 8750000
        })
      ]),
      repository: new InMemoryRemittanceRepository()
    });

    const result = await service.ingest({
      source: makeUploadRemittanceInput(),
      auditContext
    });

    expect(result.outcome.route).toBe("link_invoice_candidate");
    expect(result.outcome.state).toBe("linked_to_invoice_candidate");
    expect(result.outcome.candidateInvoiceIds).toEqual(["invoice-upload-1"]);
    expect(result.record.sourceChannel).toBe("upload");
  });

  it("routes ambiguous linked workflow remittances to review when multiple payments qualify", async () => {
    const service = new RemittanceIngestionService({
      auditLogger: new InMemoryAuditLogger(),
      parser: new NativeRemittanceParser(),
      paymentLinker: new InMemoryPaymentRemittanceLinker([
        makePayment({
          id: "payment-workflow-1",
          paymentReference: "PAY-DEFAULT",
          amountCents: 10000000
        }),
        makePayment({
          id: "payment-workflow-2",
          paymentReference: "PAY-DEFAULT",
          amountCents: 10000000
        })
      ]),
      invoiceLinker: new InMemoryInvoiceRemittanceLinker([
        makeInvoice({
          id: "invoice-workflow-1",
          invoiceNumber: "INV-3001",
          amountCents: 10000000
        })
      ]),
      repository: new InMemoryRemittanceRepository()
    });

    const result = await service.ingest({
      source: makeLinkedPaymentRemittanceInput({
        paymentId: "payment-workflow-1"
      }),
      auditContext
    });

    expect(result.outcome.route).toBe("queue_review");
    expect(result.outcome.state).toBe("review_required");
    expect(result.outcome.review?.queue).toBe("matching_review");
    expect(result.outcome.candidatePaymentIds).toEqual(["payment-workflow-1", "payment-workflow-2"]);
    expect(result.learningEvents.at(-1)?.eventType).toBe("remittance_review_required");
  });

  it("marks unresolved remittances as orphaned after the policy window", async () => {
    const repository = new InMemoryRemittanceRepository();
    const service = new RemittanceIngestionService(
      {
        auditLogger: new InMemoryAuditLogger(),
        parser: new NativeRemittanceParser(),
        paymentLinker: new InMemoryPaymentRemittanceLinker([]),
        invoiceLinker: new InMemoryInvoiceRemittanceLinker([]),
        repository
      },
      {
        orphanAfterHours: 24
      }
    );

    const ingestion = await service.ingest({
      source: makeRemittanceEmailInput({
        receivedAt: "2026-03-20T08:00:00.000Z",
        bodyText: "Please review this remittance without a clear invoice or payment reference."
      }),
      auditContext
    });

    const orphanResult = await service.markOrphanedIfExpired({
      remittanceId: ingestion.outcome.remittanceId,
      auditContext,
      asOf: "2026-03-22T09:00:00.000Z"
    });

    expect(orphanResult.orphaned).toBe(true);
    expect(orphanResult.record.state).toBe("orphaned");
    expect(orphanResult.learningEvents.at(-1)?.eventType).toBe("remittance_orphaned");
  });

  it("logs processing failures and throws a typed remittance error", async () => {
    const auditLogger = new InMemoryAuditLogger();
    const service = new RemittanceIngestionService({
      auditLogger,
      parser: {
        parse: async () => {
          throw new Error("parser unavailable");
        }
      },
      paymentLinker: new InMemoryPaymentRemittanceLinker([]),
      invoiceLinker: new InMemoryInvoiceRemittanceLinker([]),
      repository: new InMemoryRemittanceRepository()
    });

    await expect(
      service.ingest({
        source: makeRemittanceEmailInput(),
        auditContext
      })
    ).rejects.toBeInstanceOf(RemittanceIngestionProcessingError);
    expect(auditLogger.events.at(-1)?.event.action).toBe("remittance.processing_failed");
  });
});
