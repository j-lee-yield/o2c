import {
  InvalidTaskStatusTransitionError,
  TaskNotFoundError,
  taskPriorities,
  taskOrigins,
  taskStatuses,
  taskSurfaces,
} from "@o2c/domain";
import { AuthorizationError, assertAnyRole, type Principal, type Role } from "@o2c/auth";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { getTaskService } from "../bootstrap/task-service.js";

const roleSchema = z.enum([
  "ar_collector",
  "ar_manager",
  "controller",
  "admin",
]);

const sourceLinkSchema = z.object({
  label: z.string().min(1),
  objectType: z.string().min(1),
  objectId: z.string().min(1),
  href: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const taskQuerySchema = z.object({
  status: z.enum(taskStatuses).optional(),
  origin: z.enum(taskOrigins).optional(),
  surface: z.enum(taskSurfaces).optional(),
  kind: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  priority: z.enum(taskPriorities).optional(),
  q: z.string().min(1).optional(),
  customerProfileId: z.string().min(1).optional(),
  billingAccountId: z.string().min(1).optional(),
});

const taskIdParamsSchema = z.object({
  taskId: z.string().min(1),
});

const createTaskSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  kind: z.string().min(1),
  origin: z.enum(taskOrigins).default("manual"),
  surfaces: z.array(z.enum(taskSurfaces)).min(1),
  customerProfileId: z.string().min(1).optional(),
  billingAccountId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  branchId: z.string().min(1).optional(),
  ownerId: z.string().min(1).optional(),
  ownerRole: roleSchema.or(z.literal("system")).optional(),
  ownerTeam: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  callId: z.string().min(1).optional(),
  planId: z.string().min(1).optional(),
  linkedInvoiceIds: z.array(z.string().min(1)).optional(),
  priority: z.enum(taskPriorities).optional(),
  dueAt: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  recommendedNextAction: z.string().min(1).optional(),
  transcriptSnippet: z.string().min(1).optional(),
  requiresHumanReview: z.boolean().optional(),
  sourceLinks: z.array(sourceLinkSchema).min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateTaskStatusSchema = z.object({
  status: z.enum(taskStatuses),
  occurredAt: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
});

export const registerTaskRoutes = (app: FastifyInstance): void => {
  app.get("/v1/tasks", async (request, reply) => {
    try {
      parsePrincipal(request);
      const query = taskQuerySchema.parse(request.query);
      const taskKind = query.kind ?? query.type;
      const service = await getTaskService();
      return reply.send({
        items: await service.list({
          ...(query.status ? { status: query.status } : {}),
          ...(query.origin ? { origin: query.origin } : {}),
          ...(query.surface ? { surface: query.surface } : {}),
          ...(taskKind ? { kind: taskKind } : {}),
          ...(query.priority ? { priority: query.priority } : {}),
          ...(query.q ? { q: query.q } : {}),
          ...(query.customerProfileId ? { customerProfileId: query.customerProfileId } : {}),
          ...(query.billingAccountId ? { billingAccountId: query.billingAccountId } : {}),
        }),
      });
    } catch (error) {
      return replyFromTaskError(reply, error);
    }
  });

  app.get("/v1/tasks/:taskId", async (request, reply) => {
    try {
      parsePrincipal(request);
      const params = taskIdParamsSchema.parse(request.params);
      const service = await getTaskService();
      return reply.send(await service.get(params.taskId));
    } catch (error) {
      return replyFromTaskError(reply, error);
    }
  });

  app.post("/v1/tasks", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      const body = createTaskSchema.parse(request.body);
      const allowedRoles =
        body.origin === "manual" && !body.surfaces.includes("org_credit_line") && !body.surfaces.includes("deductions")
          ? ["ar_collector", "ar_manager", "controller", "admin"] as const
          : ["ar_manager", "controller", "admin"] as const;
      assertAnyRole(principal, allowedRoles, {
        action: "tasks.create",
        origin: body.origin,
        surfaces: body.surfaces,
      });
      const service = await getTaskService();
      const created = await service.create(principal, {
        title: body.title,
        kind: body.kind,
        origin: body.origin,
        surfaces: body.surfaces,
        sourceLinks: body.sourceLinks.map((sourceLink) => ({
          label: sourceLink.label,
          objectType: sourceLink.objectType,
          objectId: sourceLink.objectId,
          ...(sourceLink.href ? { href: sourceLink.href } : {}),
          ...(sourceLink.metadata ? { metadata: sourceLink.metadata } : {}),
        })),
        ...(body.id ? { id: body.id } : {}),
        ...(body.description ? { description: body.description } : {}),
        ...(body.customerProfileId ? { customerProfileId: body.customerProfileId } : {}),
        ...(body.billingAccountId ? { billingAccountId: body.billingAccountId } : {}),
        ...(body.contactId ? { contactId: body.contactId } : {}),
        ...(body.branchId ? { branchId: body.branchId } : {}),
        ...(body.ownerId ? { ownerId: body.ownerId } : {}),
        ...(body.ownerRole ? { ownerRole: body.ownerRole } : {}),
        ...(body.ownerTeam ? { ownerTeam: body.ownerTeam } : {}),
        ...(body.source ? { source: body.source } : {}),
        ...(body.callId ? { callId: body.callId } : {}),
        ...(body.planId ? { planId: body.planId } : {}),
        ...(body.linkedInvoiceIds ? { linkedInvoiceIds: body.linkedInvoiceIds } : {}),
        ...(body.priority ? { priority: body.priority } : {}),
        ...(body.dueAt ? { dueAt: body.dueAt } : {}),
        ...(body.summary ? { summary: body.summary } : {}),
        ...(body.recommendedNextAction
          ? { recommendedNextAction: body.recommendedNextAction }
          : {}),
        ...(body.transcriptSnippet ? { transcriptSnippet: body.transcriptSnippet } : {}),
        ...(body.requiresHumanReview !== undefined
          ? { requiresHumanReview: body.requiresHumanReview }
          : {}),
        ...(body.metadata ? { metadata: body.metadata } : {}),
      });
      return reply.status(201).send(created);
    } catch (error) {
      return replyFromTaskError(reply, error);
    }
  });

  app.post("/v1/tasks/:taskId/status", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      const params = taskIdParamsSchema.parse(request.params);
      const body = updateTaskStatusSchema.parse(request.body);
      const service = await getTaskService();
      const current = await service.get(params.taskId);
      assertTaskMutationRole(principal, current, "tasks.update_status");
      const updated = await service.updateStatus(principal, {
        taskId: params.taskId,
        status: body.status,
        ...(body.occurredAt ? { occurredAt: body.occurredAt } : {}),
        ...(body.summary ? { summary: body.summary } : {}),
      });
      return reply.send(updated);
    } catch (error) {
      return replyFromTaskError(reply, error);
    }
  });

  app.delete("/v1/tasks/:taskId", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      const params = taskIdParamsSchema.parse(request.params);
      const service = await getTaskService();
      const current = await service.get(params.taskId);
      assertTaskMutationRole(principal, current, "tasks.delete");
      const deleted = await service.deleteTask(principal, {
        taskId: params.taskId,
        summary: "Task deleted from the active task list.",
      });
      return reply.send(deleted);
    } catch (error) {
      return replyFromTaskError(reply, error);
    }
  });
};

function assertTaskMutationRole(
  principal: Principal,
  task: {
    id: string;
    origin: string;
    surfaces: string[];
  },
  action: string,
) {
  const requiresElevatedRole =
    task.origin !== "manual" ||
    task.surfaces.includes("deductions") ||
    task.surfaces.includes("org_credit_line");
  assertAnyRole(
    principal,
    requiresElevatedRole
      ? ["ar_manager", "controller", "admin"]
      : ["ar_collector", "ar_manager", "controller", "admin"],
    {
      action,
      taskId: task.id,
      origin: task.origin,
      surfaces: task.surfaces,
    },
  );
}

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

function replyFromTaskError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthorizationError) {
    return reply.status(403).send({ message: error.message, details: error.details });
  }
  if (error instanceof TaskNotFoundError) {
    return reply.status(404).send({ message: error.message, taskId: error.taskId });
  }
  if (error instanceof InvalidTaskStatusTransitionError) {
    return reply.status(409).send({
      message: error.message,
      taskId: error.taskId,
      fromStatus: error.fromStatus,
      toStatus: error.toStatus,
    });
  }
  if (error instanceof z.ZodError) {
    return reply.status(400).send({ message: "Invalid task request.", issues: error.issues });
  }
  throw error;
}
