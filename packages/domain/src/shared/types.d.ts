import type { Role } from "@o2c/auth";
export type EntityId = string;
export type ActorRole = Role | "system" | "user";
export declare const DEFAULT_TENANT_ID = "default";
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
export declare function createEntityMetadata(input: {
    at: string;
    tenantId?: string;
    version?: number;
    actorId?: string;
    actorRole?: ActorRole;
}): CanonicalEntityMetadata;
export declare function evolveEntityMetadata<TEntity extends DomainEntity>(entity: TEntity, input: {
    at: string;
    actorId?: string;
    actorRole?: ActorRole;
}): Pick<CanonicalEntityMetadata, "tenantId" | "version" | "updatedAt" | "updatedByActorId" | "updatedByActorRole">;
//# sourceMappingURL=types.d.ts.map