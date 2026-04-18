import { InMemoryAuditLogger } from "@o2c/audit";
import type { RemittanceSourceInput } from "@o2c/contracts";
import {
  createDatabaseClientConfig,
  isDatabaseAvailable,
  PostgresAuditLogger,
  PostgresLearningLayerRuntimeStore,
  PostgresRemittanceRepository,
  queryJsonRows,
} from "@o2c/database";
import type { Invoice, Payment } from "@o2c/domain";
import {
  InMemoryInvoiceRemittanceLinker,
  InMemoryPaymentRemittanceLinker,
  InMemoryRemittanceRepository,
  NativeRemittanceParser,
  RemittanceIngestionProcessingError,
  type RemittanceRepository,
  type StoredRemittanceRecord,
  RemittanceIngestionService,
  RemittanceRecordNotFoundError
} from "@o2c/workflows";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const attachmentSchema = z.object({
  documentId: z.string(),
  fileName: z.string().optional(),
  checksum: z.string(),
  mimeType: z.string().optional(),
  source: z.enum(["email", "portal", "api", "manual"]),
  uploadedAt: z.string(),
  storageKey: z.string().optional()
});

const auditContextSchema = z.object({
  actorId: z.string(),
  actorType: z.enum(["user", "system", "automation"]),
  correlationId: z.string(),
  occurredAt: z.string()
});

const ingestRemittanceSchema = z.object({
  source: z.discriminatedUnion("channel", [
    z.object({
      channel: z.literal("email_inbox"),
      sourceId: z.string(),
      receivedAt: z.string(),
      fromEmail: z.string().email(),
      fromName: z.string().optional(),
      subject: z.string(),
      bodyText: z.string(),
      attachments: z.array(attachmentSchema),
      metadata: z.record(z.string(), z.unknown()).optional()
    }),
    z.object({
      channel: z.literal("upload"),
      sourceId: z.string(),
      uploadedAt: z.string(),
      uploadedBy: z.string(),
      fileName: z.string().optional(),
      bodyText: z.string(),
      attachments: z.array(attachmentSchema),
      metadata: z.record(z.string(), z.unknown()).optional()
    }),
    z.object({
      channel: z.literal("linked_payment_workflow"),
      sourceId: z.string(),
      linkedAt: z.string(),
      paymentId: z.string(),
      paymentReference: z.string().optional(),
      bodyText: z.string(),
      attachments: z.array(attachmentSchema),
      metadata: z.record(z.string(), z.unknown()).optional()
    })
  ]),
  auditContext: auditContextSchema,
  duplicateSignals: z
    .object({
      sameDocumentChecksum: z.boolean().optional(),
      sameProviderRecordId: z.boolean().optional(),
      sameBusinessKey: z.boolean().optional(),
      fuzzySimilarityScore: z.number().optional()
    })
    .optional()
});

const resolveSchema = z.object({
  auditContext: auditContextSchema,
  reason: z.string().optional()
});

const orphanSchema = z.object({
  auditContext: auditContextSchema,
  asOf: z.string().optional()
});

const paymentFixtures: Payment[] = [
  {
    id: "payment-email-1",
    createdAt: "2026-03-26T00:00:00.000Z",
    updatedAt: "2026-03-26T00:00:00.000Z",
    state: "ingested_unmatched",
    parentAccountId: "parent-default",
    billingAccountId: "billing-default",
    paymentReference: "RCPT-7788",
    currency: "PHP",
    amountCents: 12500000,
    receivedAt: "2026-03-26T00:00:00.000Z",
    metadata: {}
  },
  {
    id: "payment-workflow-1",
    createdAt: "2026-03-26T00:00:00.000Z",
    updatedAt: "2026-03-26T00:00:00.000Z",
    state: "ingested_unmatched",
    parentAccountId: "parent-default",
    billingAccountId: "billing-default",
    paymentReference: "PAY-DEFAULT",
    currency: "PHP",
    amountCents: 10000000,
    receivedAt: "2026-03-26T00:00:00.000Z",
    metadata: {}
  }
];

const invoiceFixtures: Invoice[] = [
  {
    id: "invoice-email-1",
    createdAt: "2026-03-26T00:00:00.000Z",
    updatedAt: "2026-03-26T00:00:00.000Z",
    state: "synced_open",
    parentAccountId: "parent-default",
    billingAccountId: "billing-default",
    branchId: "branch-default",
    invoiceNumber: "INV-1001",
    currency: "PHP",
    amountCents: 12500000,
    metadata: {}
  },
  {
    id: "invoice-upload-1",
    createdAt: "2026-03-26T00:00:00.000Z",
    updatedAt: "2026-03-26T00:00:00.000Z",
    state: "synced_open",
    parentAccountId: "parent-default",
    billingAccountId: "billing-default",
    branchId: "branch-default",
    invoiceNumber: "INV-2001",
    currency: "PHP",
    amountCents: 8750000,
    metadata: {}
  },
  {
    id: "invoice-workflow-1",
    createdAt: "2026-03-26T00:00:00.000Z",
    updatedAt: "2026-03-26T00:00:00.000Z",
    state: "synced_open",
    parentAccountId: "parent-default",
    billingAccountId: "billing-default",
    branchId: "branch-default",
    invoiceNumber: "INV-3001",
    currency: "PHP",
    amountCents: 10000000,
    metadata: {}
  }
];

const databaseUrl = createDatabaseClientConfig().connectionString;
const learningRuntimeStore =
  databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl)
    ? new PostgresLearningLayerRuntimeStore(databaseUrl)
    : undefined;
const inMemoryRemittanceRepository = new InMemoryRemittanceRepository();
const inMemoryRemittanceAuditLogger = new InMemoryAuditLogger();
let inMemoryRemittanceService: RemittanceIngestionService | undefined;

export const registerRemittanceIngestionRoutes = (app: FastifyInstance): void => {
  app.post("/v1/remittances/ingestions", async (request, reply) => {
    const parsedBody = ingestRemittanceSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        message: "Invalid remittance ingestion request.",
        issues: parsedBody.error.issues
      });
    }

    try {
      const { source, auditContext, duplicateSignals } = parsedBody.data;
      const remittanceService = await getRemittanceService();
      const result = await remittanceService.ingest({
        source: toRemittanceSourceInput(source),
        auditContext,
        ...(duplicateSignals ? { duplicateSignals: toDuplicateSignalInput(duplicateSignals) } : {})
      });
      learningRuntimeStore?.persistLearningEvents(result.learningEvents);
      return reply.status(201).send(result);
    } catch (error) {
      if (error instanceof RemittanceIngestionProcessingError) {
        return reply.status(422).send({
          message: error.message,
          remittanceId: error.remittanceId
        });
      }

      throw error;
    }
  });

  app.get("/v1/remittances/:remittanceId", async (request, reply) => {
    const params = z.object({ remittanceId: z.string() }).parse(request.params);

    try {
      const remittanceService = await getRemittanceService();
      const record = await remittanceService.getRecord(params.remittanceId);
      return reply.send(record);
    } catch (error) {
      if (error instanceof RemittanceRecordNotFoundError) {
        return reply.status(404).send({
          message: "Remittance was not found.",
          remittanceId: params.remittanceId
        });
      }

      throw error;
    }
  });

  app.post("/v1/remittances/:remittanceId/resolve", async (request, reply) => {
    const params = z.object({ remittanceId: z.string() }).parse(request.params);
    const body = resolveSchema.parse(request.body);

    try {
      const remittanceService = await getRemittanceService();
      const record = await remittanceService.resolve({
        remittanceId: params.remittanceId,
        auditContext: body.auditContext,
        ...(body.reason ? { reason: body.reason } : {})
      });
      learningRuntimeStore?.persistLearningEvents(record.learningEvents);
      return reply.send(record);
    } catch (error) {
      if (error instanceof RemittanceRecordNotFoundError) {
        return reply.status(404).send({
          message: "Remittance was not found.",
          remittanceId: params.remittanceId
        });
      }

      throw error;
    }
  });

  app.post("/v1/remittances/:remittanceId/orphan-check", async (request, reply) => {
    const params = z.object({ remittanceId: z.string() }).parse(request.params);
    const body = orphanSchema.parse(request.body);

    try {
      const remittanceService = await getRemittanceService();
      const result = await remittanceService.markOrphanedIfExpired({
        remittanceId: params.remittanceId,
        auditContext: body.auditContext,
        ...(body.asOf ? { asOf: body.asOf } : {})
      });
      learningRuntimeStore?.persistLearningEvents(result.learningEvents);
      return reply.send(result);
    } catch (error) {
      if (error instanceof RemittanceRecordNotFoundError) {
        return reply.status(404).send({
          message: "Remittance was not found.",
          remittanceId: params.remittanceId
        });
      }

      throw error;
    }
  });
};

async function getRemittanceService() {
  const databaseBacked = databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl);

  if (!databaseBacked) {
    if (!inMemoryRemittanceService) {
      inMemoryRemittanceService = new RemittanceIngestionService(
        {
          auditLogger: inMemoryRemittanceAuditLogger,
          parser: new NativeRemittanceParser(),
          paymentLinker: new InMemoryPaymentRemittanceLinker(paymentFixtures),
          invoiceLinker: new InMemoryInvoiceRemittanceLinker(invoiceFixtures),
          repository: inMemoryRemittanceRepository,
        },
        {
          orphanAfterHours: 24,
        }
      );
    }

    return inMemoryRemittanceService;
  }

  const payments = loadPaymentsFromDatabase(databaseUrl);
  const invoices = loadInvoicesFromDatabase(databaseUrl);
  const postgresRepository = new PostgresRemittanceRepository(databaseUrl);
  const repository: RemittanceRepository = {
    save: async (record: StoredRemittanceRecord) => {
      await postgresRepository.save({
        remittance: record.remittance,
        source: record.source as unknown as Record<string, unknown>,
        ...(record.parsed
          ? { parsed: record.parsed as unknown as Record<string, unknown> }
          : {}),
        paymentCandidates: record.paymentCandidates as unknown as Record<string, unknown>[],
        invoiceCandidates: record.invoiceCandidates as unknown as Record<string, unknown>[],
        ...(record.linkedPaymentId ? { linkedPaymentId: record.linkedPaymentId } : {}),
        ...(record.review
          ? { review: record.review as unknown as Record<string, unknown> }
          : {}),
      });
    },
    get: async (remittanceId: string) =>
      (await postgresRepository.get(remittanceId)) as StoredRemittanceRecord | undefined,
  };

  return new RemittanceIngestionService(
    {
      auditLogger: new PostgresAuditLogger(databaseUrl),
      parser: new NativeRemittanceParser(),
      paymentLinker: new InMemoryPaymentRemittanceLinker(payments),
      invoiceLinker: new InMemoryInvoiceRemittanceLinker(invoices),
      repository,
    },
    {
      orphanAfterHours: 24,
    }
  );
}

type PaymentRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  state: Payment["state"];
  parentAccountId: string;
  billingAccountId?: string;
  uploadedDocumentId?: string;
  paymentReference: string;
  currency: string;
  amountCents: number;
  receivedAt: string;
  metadata: Record<string, unknown>;
};

type InvoiceRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  state: Invoice["state"];
  parentAccountId: string;
  billingAccountId: string;
  branchId?: string;
  uploadedDocumentId?: string;
  invoiceNumber: string;
  currency: string;
  amountCents: number;
  metadata: Record<string, unknown>;
};

function loadPaymentsFromDatabase(currentDatabaseUrl: string): Payment[] {
  const rows = queryJsonRows<PaymentRow>(
    currentDatabaseUrl,
    `
      SELECT row_to_json(q)
      FROM (
        SELECT
          id::text AS "id",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          state,
          parent_account_id::text AS "parentAccountId",
          billing_account_id::text AS "billingAccountId",
          uploaded_document_id::text AS "uploadedDocumentId",
          payment_reference AS "paymentReference",
          currency,
          amount_cents::integer AS "amountCents",
          received_at AS "receivedAt",
          metadata
        FROM payment
        WHERE deleted_at IS NULL
        ORDER BY received_at DESC
        LIMIT 100
      ) q
    `
  );

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    state: row.state,
    parentAccountId: row.parentAccountId,
    ...(row.billingAccountId ? { billingAccountId: row.billingAccountId } : {}),
    ...(row.uploadedDocumentId ? { uploadedDocumentId: row.uploadedDocumentId } : {}),
    paymentReference: row.paymentReference,
    currency: row.currency,
    amountCents: row.amountCents,
    receivedAt: row.receivedAt,
    metadata: row.metadata ?? {},
  }));
}

function loadInvoicesFromDatabase(currentDatabaseUrl: string): Invoice[] {
  const rows = queryJsonRows<InvoiceRow>(
    currentDatabaseUrl,
    `
      SELECT row_to_json(q)
      FROM (
        SELECT
          id::text AS "id",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          state,
          parent_account_id::text AS "parentAccountId",
          billing_account_id::text AS "billingAccountId",
          branch_id::text AS "branchId",
          uploaded_document_id::text AS "uploadedDocumentId",
          invoice_number AS "invoiceNumber",
          currency,
          amount_cents::integer AS "amountCents",
          metadata
        FROM invoice
        WHERE deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 250
      ) q
    `
  );

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    state: row.state,
    parentAccountId: row.parentAccountId,
    billingAccountId: row.billingAccountId,
    ...(row.branchId ? { branchId: row.branchId } : {}),
    ...(row.uploadedDocumentId ? { uploadedDocumentId: row.uploadedDocumentId } : {}),
    invoiceNumber: row.invoiceNumber,
    currency: row.currency,
    amountCents: row.amountCents,
    metadata: row.metadata ?? {},
  }));
}

function toRemittanceSourceInput(
  source: z.infer<typeof ingestRemittanceSchema>["source"]
): RemittanceSourceInput {
  const base = {
    channel: source.channel,
    sourceId: source.sourceId,
    bodyText: source.bodyText,
    attachments: source.attachments.map((attachment) => ({
      documentId: attachment.documentId,
      checksum: attachment.checksum,
      source: attachment.source,
      uploadedAt: attachment.uploadedAt,
      ...(attachment.fileName ? { fileName: attachment.fileName } : {}),
      ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
      ...(attachment.storageKey ? { storageKey: attachment.storageKey } : {})
    })),
    ...(source.metadata ? { metadata: source.metadata } : {})
  };

  switch (source.channel) {
    case "email_inbox":
      return {
        ...base,
        channel: "email_inbox",
        receivedAt: source.receivedAt,
        fromEmail: source.fromEmail,
        subject: source.subject,
        ...(source.fromName ? { fromName: source.fromName } : {})
      };
    case "upload":
      return {
        ...base,
        channel: "upload",
        uploadedAt: source.uploadedAt,
        uploadedBy: source.uploadedBy,
        ...(source.fileName ? { fileName: source.fileName } : {})
      };
    case "linked_payment_workflow":
      return {
        ...base,
        channel: "linked_payment_workflow",
        linkedAt: source.linkedAt,
        paymentId: source.paymentId,
        ...(source.paymentReference ? { paymentReference: source.paymentReference } : {})
      };
  }
}

function toDuplicateSignalInput(
  duplicateSignals: NonNullable<z.infer<typeof ingestRemittanceSchema>["duplicateSignals"]>
) {
  return {
    ...(duplicateSignals.sameDocumentChecksum !== undefined
      ? { sameDocumentChecksum: duplicateSignals.sameDocumentChecksum }
      : {}),
    ...(duplicateSignals.sameProviderRecordId !== undefined
      ? { sameProviderRecordId: duplicateSignals.sameProviderRecordId }
      : {}),
    ...(duplicateSignals.sameBusinessKey !== undefined
      ? { sameBusinessKey: duplicateSignals.sameBusinessKey }
      : {}),
    ...(duplicateSignals.fuzzySimilarityScore !== undefined
      ? { fuzzySimilarityScore: duplicateSignals.fuzzySimilarityScore }
      : {})
  };
}
