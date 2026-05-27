import { AuthorizationError, allRoles, type ApprovalType, type Principal, type Role, type ScopeType } from "@o2c/auth";
import type { AccessControlConsoleData } from "@o2c/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { getAccessControlService } from "../bootstrap/access-control-service.js";

const userStatusSchema = z.enum(["active", "invited", "disabled"]);
const scopeTypeSchema = z.enum(["tenant", "branch", "billing_account", "portfolio", "team"]);
const approvalTypeSchema = z.enum([
  "outreach_exception",
  "cash_application",
  "exception_resolution",
  "finance_sensitive_messaging",
  "user_role_admin",
]);
const roleSchema = z.enum([
  "ar_collector",
  "ar_manager",
  "controller",
  "admin",
  "commercial_head",
  "finance_head",
  "ar_rep",
  "collections_rep",
  "platform_admin",
]);

const listUsersQuerySchema = z.object({
  search: z.string().optional(),
  status: userStatusSchema.optional(),
  roleKey: z.string().optional(),
  scopeType: scopeTypeSchema.optional(),
});

const userParamsSchema = z.object({
  userId: z.string().min(1),
});

const assignmentParamsSchema = z.object({
  assignmentId: z.string().min(1),
});

const inviteUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  status: userStatusSchema.optional(),
  roleKey: roleSchema.optional(),
  scopeType: scopeTypeSchema.optional(),
  scopeId: z.string().min(1).optional(),
  approvalType: approvalTypeSchema.optional(),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().min(1).optional(),
  status: userStatusSchema.optional(),
});

const setStatusSchema = z.object({
  status: z.enum(["active", "disabled"]),
});

const assignRoleSchema = z.object({
  roleKey: roleSchema,
  scopeType: scopeTypeSchema,
  scopeId: z.string().min(1).optional(),
  expiresAt: z.string().min(1).optional(),
});

const approvalAuthoritySchema = z.object({
  userId: z.string().min(1).optional(),
  roleKey: roleSchema.optional(),
  approvalType: approvalTypeSchema,
  scopeType: scopeTypeSchema,
  scopeId: z.string().min(1).optional(),
});

const previewSchema = z.object({
  userId: z.string().min(1),
  permissionKey: z.string().optional(),
  scopeType: scopeTypeSchema.optional(),
  scopeId: z.string().min(1).optional(),
  approvalType: approvalTypeSchema.optional(),
});

export const registerAccessControlRoutes = (app: FastifyInstance): void => {
  app.get("/v1/admin/access-control/console", async (request, reply) => {
    try {
      const principal = await resolvePrincipal(request);
      const service = await getAccessControlService();
      const query = z.object({ selectedUserId: z.string().optional() }).parse(request.query);
      const data: AccessControlConsoleData = {
        users: service.listUsers(principal),
        ...(query.selectedUserId ? { selectedUser: service.getUserDetail(principal, query.selectedUserId) } : {}),
        roles: service.listRoles(principal),
        permissions: service.listPermissions(),
        auditEvents: service.listAuditEvents(principal).slice(0, 20),
        currentUserAccess: service.getCurrentUserAccess(principal),
      };
      return reply.send(data);
    } catch (error) {
      return replyFromAccessControlError(reply, error);
    }
  });

  app.get("/v1/admin/users", async (request, reply) => {
    try {
      const principal = await resolvePrincipal(request);
      const query = listUsersQuerySchema.parse(request.query);
      const service = await getAccessControlService();
      return reply.send({
        users: service.listUsers(principal, {
          ...(query.search ? { search: query.search } : {}),
          ...(query.status ? { status: query.status } : {}),
          ...(query.roleKey ? { roleKey: query.roleKey } : {}),
          ...(query.scopeType ? { scopeType: query.scopeType } : {}),
        }),
      });
    } catch (error) {
      return replyFromAccessControlError(reply, error);
    }
  });

  app.get("/v1/admin/users/:userId", async (request, reply) => {
    try {
      const principal = await resolvePrincipal(request);
      const params = userParamsSchema.parse(request.params);
      const service = await getAccessControlService();
      return reply.send(service.getUserDetail(principal, params.userId));
    } catch (error) {
      return replyFromAccessControlError(reply, error);
    }
  });

  app.post("/v1/admin/users", async (request, reply) => {
    try {
      const principal = await resolvePrincipal(request);
      const body = inviteUserSchema.parse(request.body);
      const service = await getAccessControlService();
      const created = service.inviteUser(principal, {
        email: body.email,
        fullName: body.fullName,
        ...(body.status ? { status: body.status } : {}),
        ...(body.roleKey ? { roleKey: body.roleKey } : {}),
        ...(body.scopeType ? { scopeType: body.scopeType } : {}),
        ...(body.scopeId ? { scopeId: body.scopeId } : {}),
        ...(body.approvalType ? { approvalType: body.approvalType } : {}),
      });
      return reply.status(201).send(created);
    } catch (error) {
      return replyFromAccessControlError(reply, error);
    }
  });

  app.post("/v1/admin/users/:userId", async (request, reply) => {
    try {
      const principal = await resolvePrincipal(request);
      const params = userParamsSchema.parse(request.params);
      const body = updateUserSchema.parse(request.body);
      const service = await getAccessControlService();
      return reply.send(
        service.updateUser(principal, params.userId, {
          ...(body.email ? { email: body.email } : {}),
          ...(body.fullName ? { fullName: body.fullName } : {}),
          ...(body.status ? { status: body.status } : {}),
        }),
      );
    } catch (error) {
      return replyFromAccessControlError(reply, error);
    }
  });

  app.post("/v1/admin/users/:userId/status", async (request, reply) => {
    try {
      const principal = await resolvePrincipal(request);
      const params = userParamsSchema.parse(request.params);
      const body = setStatusSchema.parse(request.body);
      const service = await getAccessControlService();
      return reply.send(service.setUserStatus(principal, params.userId, body.status));
    } catch (error) {
      return replyFromAccessControlError(reply, error);
    }
  });

  app.get("/v1/admin/users/:userId/assignments", async (request, reply) => {
    try {
      const principal = await resolvePrincipal(request);
      const params = userParamsSchema.parse(request.params);
      const service = await getAccessControlService();
      return reply.send({ assignments: service.getUserDetail(principal, params.userId).assignments });
    } catch (error) {
      return replyFromAccessControlError(reply, error);
    }
  });

  app.post("/v1/admin/users/:userId/assignments", async (request, reply) => {
    try {
      const principal = await resolvePrincipal(request);
      const params = userParamsSchema.parse(request.params);
      const body = assignRoleSchema.parse(request.body);
      const service = await getAccessControlService();
      return reply.status(201).send(
        service.assignRole(principal, {
          userId: params.userId,
          roleKey: body.roleKey,
          scopeType: body.scopeType,
          ...(body.scopeId ? { scopeId: body.scopeId } : {}),
          ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}),
        }),
      );
    } catch (error) {
      return replyFromAccessControlError(reply, error);
    }
  });

  app.post("/v1/admin/assignments/:assignmentId/remove", async (request, reply) => {
    try {
      const principal = await resolvePrincipal(request);
      const params = assignmentParamsSchema.parse(request.params);
      const service = await getAccessControlService();
      service.removeAssignment(principal, params.assignmentId);
      return reply.status(204).send();
    } catch (error) {
      return replyFromAccessControlError(reply, error);
    }
  });

  app.post("/v1/admin/users/:userId/approval-authorities", async (request, reply) => {
    try {
      const principal = await resolvePrincipal(request);
      const params = userParamsSchema.parse(request.params);
      const body = approvalAuthoritySchema.parse({ ...(request.body as object), userId: params.userId });
      const service = await getAccessControlService();
      return reply.status(201).send(
        service.setApprovalAuthority(principal, {
          ...(body.userId ? { userId: body.userId } : {}),
          ...(body.roleKey ? { roleKey: body.roleKey } : {}),
          approvalType: body.approvalType,
          scopeType: body.scopeType,
          ...(body.scopeId ? { scopeId: body.scopeId } : {}),
        }),
      );
    } catch (error) {
      return replyFromAccessControlError(reply, error);
    }
  });

  app.get("/v1/admin/roles", async (request, reply) => {
    try {
      const principal = await resolvePrincipal(request);
      const service = await getAccessControlService();
      return reply.send({ roles: service.listRoles(principal) });
    } catch (error) {
      return replyFromAccessControlError(reply, error);
    }
  });

  app.get("/v1/admin/roles/:roleKey", async (request, reply) => {
    try {
      const principal = await resolvePrincipal(request);
      const params = z.object({ roleKey: roleSchema }).parse(request.params);
      const service = await getAccessControlService();
      return reply.send(service.getRoleDetail(principal, params.roleKey));
    } catch (error) {
      return replyFromAccessControlError(reply, error);
    }
  });

  app.get("/v1/admin/permissions", async (_request, reply) => {
    try {
      const principal = await resolvePrincipal(_request);
      const service = await getAccessControlService();
      service.listRoles(principal);
      return reply.send({ permissions: service.listPermissions() });
    } catch (error) {
      return replyFromAccessControlError(reply, error);
    }
  });

  app.get("/v1/admin/me/effective-access", async (request, reply) => {
    try {
      const principal = await resolvePrincipal(request);
      const service = await getAccessControlService();
      return reply.send(service.getCurrentUserAccess(principal));
    } catch (error) {
      return replyFromAccessControlError(reply, error);
    }
  });

  app.post("/v1/admin/access-preview", async (request, reply) => {
    try {
      const principal = await resolvePrincipal(request);
      const body = previewSchema.parse(request.body);
      const service = await getAccessControlService();
      return reply.send(
        service.previewUserEffectiveAccess(principal, {
          userId: body.userId,
          ...(body.permissionKey ? { permissionKey: body.permissionKey as never } : {}),
          ...(body.scopeType ? { scopeType: body.scopeType } : {}),
          ...(body.scopeId ? { scopeId: body.scopeId } : {}),
          ...(body.approvalType ? { approvalType: body.approvalType } : {}),
        }),
      );
    } catch (error) {
      return replyFromAccessControlError(reply, error);
    }
  });

  app.get("/v1/admin/audit-events", async (request, reply) => {
    try {
      const principal = await resolvePrincipal(request);
      const service = await getAccessControlService();
      return reply.send({ events: service.listAuditEvents(principal) });
    } catch (error) {
      return replyFromAccessControlError(reply, error);
    }
  });
};

async function resolvePrincipal(request: FastifyRequest): Promise<Principal> {
  const service = await getAccessControlService();
  const headerId = readHeader(request.headers["x-principal-id"]);
  const headerRoles = parseRoles(request.headers["x-principal-roles"]);
  const userId = headerId && headerId.trim().length > 0 ? headerId.trim() : "user_ar_rep";
  const principal = service.getPrincipalForUser(userId);

  if (principal.roles.length > 0) {
    return principal;
  }

  return {
    id: userId,
    tenantId: "default",
    roles: headerRoles.length > 0 ? headerRoles : ["ar_rep"],
  };
}

function parseRoles(header: string | string[] | undefined): Role[] {
  const rawValue = readHeader(header);
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is Role => (allRoles as readonly string[]).includes(role));
}

function readHeader(value: string | string[] | undefined) {
  return typeof value === "string" ? value : Array.isArray(value) ? value.join(",") : undefined;
}

function replyFromAccessControlError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthorizationError) {
    return reply.status(403).send({ message: error.message, details: error.details });
  }
  if (error instanceof z.ZodError) {
    return reply.status(400).send({ message: "Invalid access control request.", issues: error.issues });
  }
  if (error instanceof Error) {
    return reply.status(404).send({ message: error.message });
  }
  throw error;
}
