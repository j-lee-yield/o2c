import { assertAnyRole, assertPermission, type Permission, type Principal, type Role } from "./rbac.js";
export interface GuardMiddlewareContext {
    principal: Principal;
    resource?: Record<string, unknown>;
}
export declare function requirePermission(permission: Permission): (context: GuardMiddlewareContext) => void;
export declare function requireAnyRole(roles: readonly Role[]): (context: GuardMiddlewareContext) => void;
export declare function createRoleGuardService(): Readonly<{
    assertPermission: typeof assertPermission;
    assertAnyRole: typeof assertAnyRole;
    requirePermission: typeof requirePermission;
    requireAnyRole: typeof requireAnyRole;
}>;
//# sourceMappingURL=guards.d.ts.map