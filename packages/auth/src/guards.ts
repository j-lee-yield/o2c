import {
  assertAnyRole,
  assertPermission,
  buildPermissionGuard,
  buildRoleGuard,
  type Permission,
  type Principal,
  type Role,
} from "./rbac.js";

export type GuardMiddlewareContext = {
  principal: Principal;
  resource?: Record<string, unknown>;
};

export function requirePermission(permission: Permission) {
  const guard = buildPermissionGuard(permission);

  return (context: GuardMiddlewareContext): void => {
    guard(context.principal, context.resource ?? {});
  };
}

export function requireAnyRole(roles: readonly Role[]) {
  const guard = buildRoleGuard(roles);

  return (context: GuardMiddlewareContext): void => {
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
