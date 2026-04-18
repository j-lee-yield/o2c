import type { FastifyRequest } from "fastify";
import type { TenantContext } from "@o2c/types";

export const resolveTenantContext = (request: FastifyRequest): TenantContext => ({
  tenantId: (request.headers["x-tenant-id"] as TenantContext["tenantId"]) ?? "tenant-local",
  tenantSlug: String(request.headers["x-tenant-slug"] ?? "acme"),
  actorId: request.headers["x-actor-id"] as TenantContext["actorId"],
  correlationId: String(request.headers["x-correlation-id"] ?? crypto.randomUUID()),
  requestAt: new Date().toISOString()
});

