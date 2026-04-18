import { assertAnyRole, assertPermission, buildPermissionGuard, buildRoleGuard, } from "./rbac.js";
export function requirePermission(permission) {
    const guard = buildPermissionGuard(permission);
    return (context) => {
        guard(context.principal, context.resource ?? {});
    };
}
export function requireAnyRole(roles) {
    const guard = buildRoleGuard(roles);
    return (context) => {
        guard(context.principal, context.resource ?? {});
    };
}
export function createRoleGuardService() {
    return Object.freeze({
        assertPermission,
        assertAnyRole,
        requirePermission,
        requireAnyRole,
    });
}
//# sourceMappingURL=guards.js.map