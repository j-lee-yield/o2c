import { createHash, randomUUID } from "node:crypto";
import { AuthorizationError, assertAnyRole, createClientConnectInviteToken, verifyClientConnectInviteToken, type Principal, type Role } from "@o2c/auth";
import { loadEnv } from "@o2c/config";
import {
  createDatabaseClientConfig,
  executeSqlCommand,
  isDatabaseAvailable,
  jsonLiteral,
  queryJsonRows,
  quoteLiteral,
} from "@o2c/database";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

const inviteStatusSchema = z.enum(["active", "cancelled"]);

const createInviteSchema = z.object({
  tenantSlug: z.string().min(1),
  clientName: z.string().min(1),
});

const inviteListQuerySchema = z.object({
  tenantSlug: z.string().min(1).optional(),
});

const inviteIdParamsSchema = z.object({
  inviteId: z.string().uuid(),
});

const resolveInviteQuerySchema = z.object({
  token: z.string().min(1),
});

type ClientConnectInviteRecord = {
  inviteId: string;
  tenantSlug: string;
  clientName: string;
  tokenHash: string;
  status: z.infer<typeof inviteStatusSchema>;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  cancelledAt?: string;
  createdByActorId: string;
  createdByActorRole: Role;
  cancelledByActorId?: string;
  cancelledByActorRole?: Role;
  metadata: Record<string, unknown>;
};

type ClientConnectInviteRow = ClientConnectInviteRecord;

type ClientConnectInviteStore = {
  create(input: {
    tenantSlug: string;
    clientName: string;
    token: string;
    principal: Principal;
  }): ClientConnectInviteRecord;
  list(tenantSlug?: string): ClientConnectInviteRecord[];
  cancel(inviteId: string, principal: Principal): ClientConnectInviteRecord | undefined;
  resolve(token: string): ClientConnectInviteRecord | undefined;
  markUsed(inviteId: string): void;
};

class InMemoryClientConnectInviteStore implements ClientConnectInviteStore {
  private readonly invites = new Map<string, ClientConnectInviteRecord>();

  create(input: {
    tenantSlug: string;
    clientName: string;
    token: string;
    principal: Principal;
  }) {
    const now = new Date().toISOString();
    const invite: ClientConnectInviteRecord = {
      inviteId: randomUUID(),
      tenantSlug: input.tenantSlug,
      clientName: input.clientName,
      tokenHash: hashInviteToken(input.token),
      status: "active",
      createdAt: now,
      updatedAt: now,
      createdByActorId: input.principal.id,
      createdByActorRole: input.principal.roles[0] ?? "controller",
      metadata: {},
    };
    this.invites.set(invite.inviteId, invite);
    return invite;
  }

  list(tenantSlug?: string) {
    return [...this.invites.values()]
      .filter((invite) => !tenantSlug || invite.tenantSlug === tenantSlug)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  cancel(inviteId: string, principal: Principal) {
    const existing = this.invites.get(inviteId);
    if (!existing) {
      return undefined;
    }
    const updated: ClientConnectInviteRecord = {
      ...existing,
      status: "cancelled",
      updatedAt: new Date().toISOString(),
      cancelledAt: new Date().toISOString(),
      cancelledByActorId: principal.id,
      cancelledByActorRole: principal.roles[0] ?? "controller",
    };
    this.invites.set(inviteId, updated);
    return updated;
  }

  resolve(token: string) {
    const tokenHash = hashInviteToken(token);
    return [...this.invites.values()].find((invite) => invite.tokenHash === tokenHash);
  }

  markUsed(inviteId: string) {
    const existing = this.invites.get(inviteId);
    if (!existing) {
      return;
    }
    this.invites.set(inviteId, {
      ...existing,
      updatedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    });
  }
}

class PostgresClientConnectInviteStore implements ClientConnectInviteStore {
  constructor(private readonly databaseUrl: string) {}

  create(input: {
    tenantSlug: string;
    clientName: string;
    token: string;
    principal: Principal;
  }): ClientConnectInviteRecord {
    const inviteId = randomUUID();
    const now = new Date().toISOString();
    const actorRole = input.principal.roles[0] ?? "controller";
    const tokenHash = hashInviteToken(input.token);

    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO client_connect_invite (
          invite_id,
          tenant_slug,
          client_name,
          token_hash,
          status,
          created_at,
          updated_at,
          created_by_actor_id,
          created_by_actor_role,
          metadata
        )
        VALUES (
          '${quoteLiteral(inviteId)}',
          '${quoteLiteral(input.tenantSlug)}',
          '${quoteLiteral(input.clientName)}',
          '${quoteLiteral(tokenHash)}',
          'active',
          '${quoteLiteral(now)}'::timestamptz,
          '${quoteLiteral(now)}'::timestamptz,
          '${quoteLiteral(input.principal.id)}',
          '${quoteLiteral(actorRole)}',
          '${jsonLiteral({ issuedVia: "client_connect_invite" })}'::jsonb
        )
      `,
    );

    logInviteAuditEvent(this.databaseUrl, inviteId, input.principal, "integration.client_connect_invite_created", {
      tenantSlug: input.tenantSlug,
      clientName: input.clientName,
    });

    return {
      inviteId,
      tenantSlug: input.tenantSlug,
      clientName: input.clientName,
      tokenHash,
      status: "active",
      createdAt: now,
      updatedAt: now,
      createdByActorId: input.principal.id,
      createdByActorRole: actorRole,
      metadata: { issuedVia: "client_connect_invite" },
    };
  }

  list(tenantSlug?: string): ClientConnectInviteRecord[] {
    const where = tenantSlug
      ? `WHERE tenant_slug = '${quoteLiteral(tenantSlug)}'`
      : "";
    return queryJsonRows<ClientConnectInviteRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            invite_id AS "inviteId",
            tenant_slug AS "tenantSlug",
            client_name AS "clientName",
            token_hash AS "tokenHash",
            status,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            last_used_at AS "lastUsedAt",
            cancelled_at AS "cancelledAt",
            created_by_actor_id AS "createdByActorId",
            created_by_actor_role AS "createdByActorRole",
            cancelled_by_actor_id AS "cancelledByActorId",
            cancelled_by_actor_role AS "cancelledByActorRole",
            metadata
          FROM client_connect_invite
          ${where}
          ORDER BY created_at DESC
        ) q
      `,
    );
  }

  cancel(inviteId: string, principal: Principal): ClientConnectInviteRecord | undefined {
    const existing = this.getById(inviteId);
    if (!existing) {
      return undefined;
    }
    const now = new Date().toISOString();
    const actorRole = principal.roles[0] ?? "controller";
    executeSqlCommand(
      this.databaseUrl,
      `
        UPDATE client_connect_invite
        SET
          status = 'cancelled',
          updated_at = '${quoteLiteral(now)}'::timestamptz,
          cancelled_at = '${quoteLiteral(now)}'::timestamptz,
          cancelled_by_actor_id = '${quoteLiteral(principal.id)}',
          cancelled_by_actor_role = '${quoteLiteral(actorRole)}'
        WHERE invite_id = '${quoteLiteral(inviteId)}'
      `,
    );
    logInviteAuditEvent(this.databaseUrl, inviteId, principal, "integration.client_connect_invite_cancelled", {
      tenantSlug: existing.tenantSlug,
      clientName: existing.clientName,
    });
    return {
      ...existing,
      status: "cancelled",
      updatedAt: now,
      cancelledAt: now,
      cancelledByActorId: principal.id,
      cancelledByActorRole: actorRole,
    };
  }

  resolve(token: string): ClientConnectInviteRecord | undefined {
    const tokenHash = hashInviteToken(token);
    const rows = queryJsonRows<ClientConnectInviteRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            invite_id AS "inviteId",
            tenant_slug AS "tenantSlug",
            client_name AS "clientName",
            token_hash AS "tokenHash",
            status,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            last_used_at AS "lastUsedAt",
            cancelled_at AS "cancelledAt",
            created_by_actor_id AS "createdByActorId",
            created_by_actor_role AS "createdByActorRole",
            cancelled_by_actor_id AS "cancelledByActorId",
            cancelled_by_actor_role AS "cancelledByActorRole",
            metadata
          FROM client_connect_invite
          WHERE token_hash = '${quoteLiteral(tokenHash)}'
          LIMIT 1
        ) q
      `,
    );
    return rows[0];
  }

  markUsed(inviteId: string) {
    const now = new Date().toISOString();
    executeSqlCommand(
      this.databaseUrl,
      `
        UPDATE client_connect_invite
        SET
          last_used_at = '${quoteLiteral(now)}'::timestamptz,
          updated_at = '${quoteLiteral(now)}'::timestamptz
        WHERE invite_id = '${quoteLiteral(inviteId)}'
      `,
    );
  }

  private getById(inviteId: string): ClientConnectInviteRecord | undefined {
    const rows = queryJsonRows<ClientConnectInviteRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            invite_id AS "inviteId",
            tenant_slug AS "tenantSlug",
            client_name AS "clientName",
            token_hash AS "tokenHash",
            status,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            last_used_at AS "lastUsedAt",
            cancelled_at AS "cancelledAt",
            created_by_actor_id AS "createdByActorId",
            created_by_actor_role AS "createdByActorRole",
            cancelled_by_actor_id AS "cancelledByActorId",
            cancelled_by_actor_role AS "cancelledByActorRole",
            metadata
          FROM client_connect_invite
          WHERE invite_id = '${quoteLiteral(inviteId)}'
          LIMIT 1
        ) q
      `,
    );
    return rows[0];
  }
}

let inviteStore: ClientConnectInviteStore | undefined;

export const registerClientConnectInviteRoutes = (app: FastifyInstance): void => {
  app.get("/v1/integrations/client-connect-invites", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      assertAnyRole(principal, ["controller", "admin"], {
        action: "client_connect_invites.list",
      });
      const query = inviteListQuerySchema.parse(request.query ?? {});
      const items = getClientConnectInviteStore().list(query.tenantSlug);
      return reply.send({ items });
    } catch (error) {
      return replyFromInviteError(reply, error);
    }
  });

  app.post("/v1/integrations/client-connect-invites", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      assertAnyRole(principal, ["controller", "admin"], {
        action: "client_connect_invites.create",
      });
      const body = createInviteSchema.parse(request.body ?? {});
      const token = createClientConnectInviteToken(
        {
          tenantSlug: body.tenantSlug.trim(),
          clientName: body.clientName.trim(),
          exp: Date.UTC(2099, 0, 1, 0, 0, 0),
        },
        getInviteSecret(),
      );
      const invite = getClientConnectInviteStore().create({
        tenantSlug: body.tenantSlug.trim(),
        clientName: body.clientName.trim(),
        token,
        principal,
      });
      return reply.status(201).send({
        invite: {
          ...invite,
          token,
        },
      });
    } catch (error) {
      return replyFromInviteError(reply, error);
    }
  });

  app.post("/v1/integrations/client-connect-invites/:inviteId/cancel", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      assertAnyRole(principal, ["controller", "admin"], {
        action: "client_connect_invites.cancel",
      });
      const { inviteId } = inviteIdParamsSchema.parse(request.params ?? {});
      const invite = getClientConnectInviteStore().cancel(inviteId, principal);
      if (!invite) {
        return reply.status(404).send({ message: "Invite was not found." });
      }
      return reply.send({ invite });
    } catch (error) {
      return replyFromInviteError(reply, error);
    }
  });

  app.get("/v1/integrations/client-connect-invites/resolve", async (request, reply) => {
    try {
      const query = resolveInviteQuerySchema.parse(request.query ?? {});
      const verification = verifyClientConnectInviteToken(query.token, getInviteSecret());
      if (!verification.valid) {
        return reply.status(403).send({
          message: mapInviteFailure(verification.reason),
          reason: verification.reason,
        });
      }

      const invite = getClientConnectInviteStore().resolve(query.token);
      if (!invite) {
        return reply.status(403).send({
          message: "This client connect link is not recognized.",
          reason: "not_found",
        });
      }

      if (invite.status !== "active") {
        return reply.status(403).send({
          message: "This client connect link has been cancelled.",
          reason: "cancelled",
        });
      }

      getClientConnectInviteStore().markUsed(invite.inviteId);
      return reply.send({
        invite: {
          inviteId: invite.inviteId,
          tenantSlug: invite.tenantSlug,
          clientName: invite.clientName,
          status: invite.status,
          createdAt: invite.createdAt,
          updatedAt: invite.updatedAt,
          lastUsedAt: new Date().toISOString(),
        },
        claims: verification.claims,
      });
    } catch (error) {
      return replyFromInviteError(reply, error);
    }
  });
};

export function getClientConnectInviteStore() {
  if (!inviteStore) {
    const db = createDatabaseClientConfig();
    inviteStore =
      db.connectionString && isDatabaseAvailable(db.connectionString)
        ? new PostgresClientConnectInviteStore(db.connectionString)
        : new InMemoryClientConnectInviteStore();
  }
  return inviteStore as ClientConnectInviteStore;
}

export function resetClientConnectInviteStoreForTests() {
  inviteStore = undefined;
}

function getInviteSecret() {
  const configured =
    process.env.CLIENT_CONNECT_LINK_SECRET?.trim() || process.env.JWT_PRIVATE_KEY?.trim();
  return configured || loadEnv().JWT_PRIVATE_KEY;
}

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function parsePrincipal(request: FastifyRequest): Principal {
  const principalId = request.headers["x-principal-id"];
  const principalRoles = request.headers["x-principal-roles"];
  const id =
    typeof principalId === "string" && principalId.trim().length > 0
      ? principalId
      : "anonymous_operator";
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
      role === "admin",
    );
  return roles.length > 0 ? roles : ["ar_collector"];
}

function mapInviteFailure(reason: "missing" | "malformed" | "signature_mismatch" | "expired") {
  switch (reason) {
    case "missing":
      return "A client connect token is required.";
    case "expired":
      return "This client connect link has expired.";
    case "malformed":
    case "signature_mismatch":
      return "This client connect link is not valid.";
  }
}

function replyFromInviteError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthorizationError) {
    return reply.status(403).send({ message: error.message, details: error.details });
  }
  if (error instanceof z.ZodError) {
    return reply.status(400).send({ message: "Invalid client connect invite request.", issues: error.issues });
  }
  if (error instanceof Error) {
    return reply.status(502).send({ message: error.message });
  }
  return reply.status(502).send({ message: "Client connect invite request failed." });
}

function logInviteAuditEvent(
  databaseUrl: string,
  entityId: string,
  principal: Principal,
  action: string,
  metadata: Record<string, unknown>,
) {
  executeSqlCommand(
    databaseUrl,
    `
      INSERT INTO activity_log (
        id,
        tenant_id,
        entity_type,
        entity_id,
        action,
        actor_id,
        actor_role,
        occurred_at,
        payload,
        created_at,
        updated_at,
        version,
        created_by_actor_id,
        created_by_actor_role,
        updated_by_actor_id,
        updated_by_actor_role
      )
      VALUES (
        gen_random_uuid(),
        '${quoteLiteral(metadata.tenantSlug?.toString() ?? "default")}',
        'client_connect_invite',
        '${quoteLiteral(entityId)}'::uuid,
        '${quoteLiteral(action)}',
        '${quoteLiteral(principal.id)}',
        '${quoteLiteral(principal.roles[0] ?? "controller")}',
        NOW(),
        '${jsonLiteral({ metadata })}'::jsonb,
        NOW(),
        NOW(),
        1,
        '${quoteLiteral(principal.id)}',
        '${quoteLiteral(principal.roles[0] ?? "controller")}',
        '${quoteLiteral(principal.id)}',
        '${quoteLiteral(principal.roles[0] ?? "controller")}'
      )
    `,
  );
}
