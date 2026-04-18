import { InMemoryAuditLogger } from "@o2c/audit";
import type {
  BirInvoiceReviewPreviewRequest,
  CreateBirInvoiceCaseRequest,
  ReviewBirInvoiceCaseRequest,
} from "@o2c/contracts";
import {
  createDatabaseClientConfig,
  isDatabaseAvailable,
  PostgresAuditLogger,
  PostgresBirInvoiceCaseRepository,
} from "@o2c/database";
import {
  BirInvoiceCaseLockedError,
  BirInvoiceCaseNotFoundError,
  BirInvoiceMatchCandidateNotFoundError,
  BirInvoiceReviewService,
  buildBirInvoiceReviewCase,
  InMemoryBirInvoiceCaseRepository,
  MissingBirInvoiceFieldError,
} from "@o2c/workflows";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

const birInvoiceFieldCorrectionSchema = z.object({
  value: z.unknown(),
  lock: z.boolean().optional(),
});

const auditContextSchema = z.object({
  actorId: z.string().min(1),
  actorType: z.enum(["user", "system", "automation"]),
  correlationId: z.string().min(1),
  occurredAt: z.string().min(1),
});

const birInvoiceReviewPreviewRequestSchema = z.object({
  parserResult: z.unknown(),
  hierarchy: z.object({
    parentAccountId: z.string().min(1),
    billingAccountId: z.string().min(1),
    branchId: z.string().min(1).optional(),
  }),
  duplicateCandidates: z.array(z.unknown()).optional(),
  erpCandidates: z.array(z.unknown()).optional(),
  erpMatched: z.boolean().optional(),
  humanConfirmed: z.boolean().optional(),
});

const birInvoiceCaseCreateSchema = birInvoiceReviewPreviewRequestSchema.extend({
  auditContext: auditContextSchema,
  storageKey: z.string().min(1).optional(),
  uploadedBy: z.string().min(1).optional(),
});

const birInvoiceCaseReviewSchema = z.object({
  auditContext: auditContextSchema,
  corrections: z.record(z.enum([
    "sellerLegalEntity",
    "buyerName",
    "invoiceNumber",
    "invoiceDate",
    "totalAmountCents",
    "currency",
    "poNumber",
    "lineItemsSummary",
    "documentType",
    "tin",
    "businessStyle",
    "deliveryOrBillToAddress",
    "receivedStampPresent",
    "signaturePresent",
    "branchId",
  ]), birInvoiceFieldCorrectionSchema).optional(),
  lockDocument: z.boolean().optional(),
  humanConfirmed: z.boolean().optional(),
  selectedErpInvoiceId: z.string().min(1).optional(),
  overrideDuplicateBlock: z.boolean().optional(),
});

const databaseUrl = createDatabaseClientConfig().connectionString;
const inMemoryAuditLogger = new InMemoryAuditLogger();
const inMemoryRepository = new InMemoryBirInvoiceCaseRepository();
let inMemoryService: BirInvoiceReviewService | undefined;

export const registerBirInvoiceReviewRoutes = (app: FastifyInstance): void => {
  app.post("/v1/ingestion/bir-invoices/review-preview", async (request, reply) => {
    const parsedBody = birInvoiceReviewPreviewRequestSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: "Invalid BIR invoice review preview request.",
        issues: parsedBody.error.issues,
      });
    }

    const body = request.body as BirInvoiceReviewPreviewRequest;
    const auditLogger = new InMemoryAuditLogger();

    const reviewCase = await buildBirInvoiceReviewCase({
      parserResult: body.parserResult,
      hierarchy: body.hierarchy,
      auditContext: {
        actorId: "api",
        actorType: "system",
        correlationId: request.id,
        occurredAt: new Date().toISOString(),
      },
      deps: { auditLogger },
      ...(body.duplicateCandidates ? { duplicateCandidates: body.duplicateCandidates } : {}),
      ...(body.erpCandidates ? { erpCandidates: body.erpCandidates } : {}),
      ...(body.erpMatched !== undefined ? { erpMatched: body.erpMatched } : {}),
      ...(body.humanConfirmed !== undefined ? { humanConfirmed: body.humanConfirmed } : {}),
    });

    return reply.send(reviewCase);
  });

  app.post("/v1/ingestion/bir-invoices/cases", async (request, reply) => {
    const parsedBody = birInvoiceCaseCreateSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        message: "Invalid BIR invoice ingestion request.",
        issues: parsedBody.error.issues,
      });
    }

    const service = await getBirInvoiceReviewService();
    const record = await service.createCase(parsedBody.data as CreateBirInvoiceCaseRequest);
    return reply.status(201).send(record);
  });

  app.get("/v1/ingestion/bir-invoices/:documentId", async (request, reply) => {
    try {
      const params = z.object({ documentId: z.string().min(1) }).parse(request.params);
      const service = await getBirInvoiceReviewService();
      return reply.send(await service.getCase(params.documentId));
    } catch (error) {
      return replyFromBirInvoiceError(reply, error);
    }
  });

  app.post("/v1/ingestion/bir-invoices/:documentId/review", async (request, reply) => {
    try {
      const params = z.object({ documentId: z.string().min(1) }).parse(request.params);
      const body = birInvoiceCaseReviewSchema.parse(request.body) as ReviewBirInvoiceCaseRequest;
      const service = await getBirInvoiceReviewService();
      return reply.send(await service.reviewCase(params.documentId, body));
    } catch (error) {
      return replyFromBirInvoiceError(reply, error);
    }
  });
};

async function getBirInvoiceReviewService(): Promise<BirInvoiceReviewService> {
  if (databaseUrl && isDatabaseAvailable(databaseUrl)) {
    return new BirInvoiceReviewService({
      auditLogger: new PostgresAuditLogger(databaseUrl),
      repository: new PostgresBirInvoiceCaseRepository(databaseUrl),
    });
  }

  if (!inMemoryService) {
    inMemoryService = new BirInvoiceReviewService({
      auditLogger: inMemoryAuditLogger,
      repository: inMemoryRepository,
    });
  }

  return inMemoryService;
}

function replyFromBirInvoiceError(reply: FastifyReply, error: unknown) {
  if (error instanceof BirInvoiceCaseNotFoundError) {
    return reply.status(404).send({
      message: error.message,
      documentId: error.documentId,
    });
  }

  if (
    error instanceof BirInvoiceCaseLockedError ||
    error instanceof BirInvoiceMatchCandidateNotFoundError ||
    error instanceof MissingBirInvoiceFieldError
  ) {
    return reply.status(409).send({ message: error.message });
  }

  if (error instanceof z.ZodError) {
    return reply.status(400).send({
      message: "Invalid BIR invoice review request.",
      issues: error.issues,
    });
  }

  throw error;
}
