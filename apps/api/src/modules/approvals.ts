import {
  ApprovalRequestNotFoundError,
  ApprovalPolicyViolationError,
  ApprovalEditNotAllowedError,
  ApprovalReopenNotAllowedError,
  InvalidApprovalTransitionError,
} from "@o2c/domain";
import { AuthorizationError, type Principal, type Role } from "@o2c/auth";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { getApprovalQueueService } from "../bootstrap/approval-queue-service.js";

const approvalRequestCreateSchema = z.object({
  requestType: z.string().min(1),
  assigneeRole: z.enum(["ar_collector", "ar_manager", "controller", "admin"]).optional(),
  currentStep: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()),
  policyContext: z.record(z.string(), z.unknown()).optional(),
});

const approvalEditSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
  policyContext: z.record(z.string(), z.unknown()).optional(),
  currentStep: z.string().min(1).optional(),
  resubmit: z.boolean().optional(),
});

const paramsSchema = z.object({
  approvalId: z.string().min(1),
});

export const registerApprovalRoutes = (app: FastifyInstance): void => {
  app.get("/v1/approvals/queue", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      const approvalQueueService = await getApprovalQueueService();
      const queue = await approvalQueueService.listQueue(principal);
      return reply.send({ items: queue });
    } catch (error) {
      return replyFromApprovalError(reply, error);
    }
  });

  app.get("/v1/approvals/:approvalId", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      const approvalQueueService = await getApprovalQueueService();
      const params = paramsSchema.parse(request.params);
      const approval = await approvalQueueService.getRequest(principal, params.approvalId);
      return reply.send(approval);
    } catch (error) {
      return replyFromApprovalError(reply, error);
    }
  });

  app.post("/v1/approvals/requests", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      const approvalQueueService = await getApprovalQueueService();
      const body = approvalRequestCreateSchema.parse(request.body);
      const approval = await approvalQueueService.createAndSubmit(principal, {
        requestType: body.requestType,
        payload: body.payload,
        ...(body.assigneeRole ? { assigneeRole: body.assigneeRole } : {}),
        ...(body.currentStep ? { currentStep: body.currentStep } : {}),
        ...(body.policyContext ? { policyContext: body.policyContext } : {}),
      });
      return reply.status(201).send(approval);
    } catch (error) {
      return replyFromApprovalError(reply, error);
    }
  });

  app.post("/v1/approvals/:approvalId/edit", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      const approvalQueueService = await getApprovalQueueService();
      const params = paramsSchema.parse(request.params);
      const body = approvalEditSchema.parse(request.body);
      const approval = await approvalQueueService.editRequest(principal, {
        approvalId: params.approvalId,
        payload: body.payload,
        ...(body.policyContext ? { policyContext: body.policyContext } : {}),
        ...(body.currentStep ? { currentStep: body.currentStep } : {}),
        ...(body.resubmit !== undefined ? { resubmit: body.resubmit } : {}),
      });
      return reply.send(approval);
    } catch (error) {
      return replyFromApprovalError(reply, error);
    }
  });

  app.post("/v1/approvals/:approvalId/approve", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      const approvalQueueService = await getApprovalQueueService();
      const params = paramsSchema.parse(request.params);
      const approval = await approvalQueueService.approve(principal, params.approvalId);
      return reply.send(approval);
    } catch (error) {
      return replyFromApprovalError(reply, error);
    }
  });

  app.post("/v1/approvals/:approvalId/reject", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      const approvalQueueService = await getApprovalQueueService();
      const params = paramsSchema.parse(request.params);
      const approval = await approvalQueueService.reject(principal, params.approvalId);
      return reply.send(approval);
    } catch (error) {
      return replyFromApprovalError(reply, error);
    }
  });
};

function parsePrincipal(request: FastifyRequest): Principal {
  const principalId = request.headers["x-principal-id"];
  const principalRoles = request.headers["x-principal-roles"];
  const id =
    typeof principalId === "string" && principalId.trim().length > 0
      ? principalId
      : "collector_api";
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
  return roles.length > 0 ? roles : ["ar_collector"];
}

function replyFromApprovalError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthorizationError) {
    return reply.status(403).send({ message: error.message, details: error.details });
  }
  if (error instanceof ApprovalRequestNotFoundError) {
    return reply.status(404).send({ message: error.message, approvalId: error.approvalId });
  }
  if (
    error instanceof ApprovalPolicyViolationError ||
    error instanceof ApprovalEditNotAllowedError ||
    error instanceof InvalidApprovalTransitionError ||
    error instanceof ApprovalReopenNotAllowedError
  ) {
    return reply.status(409).send({ message: error.message });
  }
  if (error instanceof z.ZodError) {
    return reply.status(400).send({ message: "Invalid approval request.", issues: error.issues });
  }
  throw error;
}
