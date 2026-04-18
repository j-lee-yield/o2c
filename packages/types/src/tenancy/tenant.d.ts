import type { Identifier, ISODateString } from "../common/primitives.js";
export type TenantId = Identifier<"tenant">;
export type UserId = Identifier<"user">;
export type TenantContext = {
    tenantId: TenantId;
    tenantSlug: string;
    actorId?: UserId;
    correlationId: string;
    requestAt: ISODateString;
};
export type TenantScoped<T> = T & {
    tenantId: TenantId;
};
//# sourceMappingURL=tenant.d.ts.map