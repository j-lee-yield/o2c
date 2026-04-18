export const DEFAULT_TENANT_ID = "default";
export function createEntityMetadata(input) {
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
export function evolveEntityMetadata(entity, input) {
    return {
        tenantId: entity.tenantId ?? DEFAULT_TENANT_ID,
        version: (entity.version ?? 0) + 1,
        updatedAt: input.at,
        ...(input.actorId ? { updatedByActorId: input.actorId } : {}),
        ...(input.actorRole ? { updatedByActorRole: input.actorRole } : {})
    };
}
//# sourceMappingURL=types.js.map