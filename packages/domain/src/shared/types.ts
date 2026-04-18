import type { Role } from "@o2c/auth";

export type EntityId = string;
export type ActorRole = Role | "system" | "user";
export const DEFAULT_TENANT_ID = "default";

export interface DomainEntity {
  id: EntityId;
  tenantId?: string;
  version?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  createdByActorId?: string;
  createdByActorRole?: ActorRole;
  updatedByActorId?: string;
  updatedByActorRole?: ActorRole;
}

export interface AuditMetadata {
  [key: string]: unknown;
}

export interface ActorContext {
  actorId: string;
  actorRole: ActorRole;
}

export interface CanonicalEntityMetadata {
  tenantId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  createdByActorId?: string;
  createdByActorRole?: ActorRole;
  updatedByActorId?: string;
  updatedByActorRole?: ActorRole;
}

export function createEntityMetadata(input: {
  at: string;
  tenantId?: string;
  version?: number;
  actorId?: string;
  actorRole?: ActorRole;
}): CanonicalEntityMetadata {
  return {
    tenantId: input.tenantId ?? DEFAULT_TENANT_ID,
    version: input.version ?? 1,
    createdAt: input.at,
    updatedAt: input.at,
    ...(input.actorId ? { createdByActorId: input.actorId } : {}),
    ...(input.actorRole ? { createdByActorRole: input.actorRole } : {}),
    ...(input.actorId ? { updatedByActorId: input.actorId } : {}),
    ...(input.actorRole ? { updatedByActorRole: input.actorRole } : {})
  };
}

export function evolveEntityMetadata<TEntity extends DomainEntity>(
  entity: TEntity,
  input: {
    at: string;
    actorId?: string;
    actorRole?: ActorRole;
  }
): Pick<CanonicalEntityMetadata, "tenantId" | "version" | "updatedAt" | "updatedByActorId" | "updatedByActorRole"> {
  return {
    tenantId: entity.tenantId ?? DEFAULT_TENANT_ID,
    version: (entity.version ?? 0) + 1,
    updatedAt: input.at,
    ...(input.actorId ? { updatedByActorId: input.actorId } : {}),
    ...(input.actorRole ? { updatedByActorRole: input.actorRole } : {})
  };
}
