import { AuthorizationError, assertAnyRole, type Principal, type Role } from "@o2c/auth";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  DeductionCaseNotFoundError,
  DeductionSyncBlockedError,
  getDeductionsWorkspaceService,
} from "../bootstrap/deductions-service.js";

const caseParamsSchema = z.object({
  caseId: z.string().min(1),
});

const lineItemSchema = z.object({
  id: z.string().min(1).optional(),
  claimId: z.string().min(1).optional(),
  lineNumber: z.number().int().positive(),
  category: z.string().min(1),
  description: z.string().min(1),
  disputedAmountCents: z.number().int().nonnegative(),
  acceptedAmountCents: z.number().int().nonnegative().optional(),
  quantity: z.number().nonnegative().optional(),
  unitAmountCents: z.number().int().nonnegative().optional(),
  status: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const claimSchema = z.object({
  id: z.string().min(1).optional(),
  claimNumber: z.string().min(1),
  claimantName: z.string().min(1).optional(),
  assertedAmountCents: z.number().int().nonnegative(),
  assertedAt: z.string().min(1),
  status: z.string().min(1).optional(),
  sourceChannel: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const uploadHookSchema = z.object({
  caseId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
  parentAccountId: z.string().min(1),
  billingAccountId: z.string().min(1),
  branchId: z.string().min(1).optional(),
  invoiceId: z.string().min(1).optional(),
  paymentId: z.string().min(1).optional(),
  exceptionId: z.string().min(1).optional(),
  approvalRequestId: z.string().min(1).optional(),
  externalClaimReference: z.string().min(1).optional(),
  targetAmountCents: z.number().int().nonnegative(),
  currency: z.string().min(1),
  reasonCode: z.string().min(1),
  priority: z.string().min(1).optional(),
  ownerRole: z.string().min(1).optional(),
  detectedAt: z.string().min(1),
  uploadedDocumentIds: z.array(z.string().min(1)),
  missingDocumentTypes: z.array(z.string().min(1)).optional(),
  lineItems: z.array(lineItemSchema).optional(),
  claims: z.array(claimSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const apPortalHookSchema = uploadHookSchema
  .omit({ uploadedDocumentIds: true, claims: true, ownerRole: true, externalClaimReference: true })
  .extend({
    sourceJobId: z.string().min(1),
    externalClaimReference: z.string().min(1),
    documentIds: z.array(z.string().min(1)).optional(),
    claim: claimSchema,
  });

export const registerDeductionRoutes = (app: FastifyInstance): void => {
  app.get("/v1/deductions/queue", async (request, reply) => {
    try {
      parsePrincipal(request);
      const service = await getDeductionsWorkspaceService();
      return reply.send(await service.getQueueReadModel());
    } catch (error) {
      return replyFromDeductionError(reply, error);
    }
  });

  app.get("/v1/deductions/:caseId", async (request, reply) => {
    try {
      parsePrincipal(request);
      const { caseId } = caseParamsSchema.parse(request.params);
      const service = await getDeductionsWorkspaceService();
      return reply.send(await service.getDetailReadModel(caseId));
    } catch (error) {
      return replyFromDeductionError(reply, error);
    }
  });

  app.post("/v1/deductions/hooks/uploads", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      assertAnyRole(principal, ["ar_manager", "controller", "admin"], {
        action: "deductions.record_upload_hook",
      });
      const body = uploadHookSchema.parse(request.body);
      const service = await getDeductionsWorkspaceService();
      return reply.send(await service.recordUploadHook(principal, body));
    } catch (error) {
      return replyFromDeductionError(reply, error);
    }
  });

  app.post("/v1/deductions/hooks/ap-portal-jobs", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      assertAnyRole(principal, ["ar_manager", "controller", "admin"], {
        action: "deductions.record_ap_portal_hook",
      });
      const body = apPortalHookSchema.parse(request.body);
      const service = await getDeductionsWorkspaceService();
      return reply.send(await service.recordApPortalJobHook(principal, body));
    } catch (error) {
      return replyFromDeductionError(reply, error);
    }
  });

  app.post("/v1/deductions/:caseId/credit-memo/refresh", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      assertAnyRole(principal, ["ar_manager", "controller", "admin"], {
        action: "deductions.refresh_credit_memo",
      });
      const { caseId } = caseParamsSchema.parse(request.params);
      const service = await getDeductionsWorkspaceService();
      return reply.send(await service.refreshCreditMemoDraft(principal, caseId));
    } catch (error) {
      return replyFromDeductionError(reply, error);
    }
  });

  app.post("/v1/deductions/:caseId/credit-memo/sync", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      assertAnyRole(principal, ["controller", "admin"], {
        action: "deductions.sync_credit_memo",
      });
      const { caseId } = caseParamsSchema.parse(request.params);
      const service = await getDeductionsWorkspaceService();
      return reply.send(await service.syncCreditMemoDraft(principal, caseId));
    } catch (error) {
      return replyFromDeductionError(reply, error);
    }
  });
};

function parsePrincipal(request: FastifyRequest): Principal {
  const principalId = request.headers["x-principal-id"];
  const principalRoles = request.headers["x-principal-roles"];
  const id =
    typeof principalId === "string" && principalId.trim().length > 0
      ? principalId
      : "deductions_api";
  const roles = parseRoles(principalRoles);
  return { id, roles };
}

function parseRoles(header: string | string[] | undefined): Role[] {
  const rawValue =
    typeof header === "string" ? header : Array.isArray(header) ? header.join(",") : "";
  const roles = rawValue
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is Role =>
      role === "ar_collector" ||
      role === "ar_manager" ||
      role === "controller" ||
      role === "admin"
    );
  return roles.length > 0 ? roles : ["ar_manager"];
}

function replyFromDeductionError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthorizationError) {
    return reply.status(403).send({ message: error.message, details: error.details });
  }
  if (error instanceof DeductionCaseNotFoundError) {
    return reply.status(404).send({ message: error.message, deductionCaseId: error.caseId });
  }
  if (error instanceof DeductionSyncBlockedError) {
    return reply.status(409).send({ message: error.message });
  }
  if (error instanceof z.ZodError) {
    return reply.status(400).send({ message: "Invalid deductions request.", issues: error.issues });
  }
  throw error;
}
