export type Role = "ar_collector" | "ar_manager" | "controller" | "admin";

export type Permission =
  | "approval.request.create"
  | "approval.request.read"
  | "approval.request.read.own"
  | "approval.request.review"
  | "approval.request.reopen_terminal"
  | "activity_log.read";

export type Principal = {
  id: string;
  roles: Role[];
};

export type RoleDefinition = {
  label: string;
  permissions: readonly (Permission | "*")[];
};

export class AuthorizationError extends Error {
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "AuthorizationError";
    this.details = details;
  }
}

export const roleDefinitions: Record<Role, RoleDefinition> = {
  ar_collector: {
    label: "AR collector",
    permissions: ["approval.request.create", "approval.request.read.own"],
  },
  ar_manager: {
    label: "AR manager",
    permissions: [
      "approval.request.create",
      "approval.request.read",
      "approval.request.review",
    ],
  },
  controller: {
    label: "controller",
    permissions: [
      "approval.request.create",
      "approval.request.read",
      "approval.request.review",
      "approval.request.reopen_terminal",
      "activity_log.read",
    ],
  },
  admin: {
    label: "admin",
    permissions: ["*"],
  },
};

export function hasRole(principal: Principal, role: Role): boolean {
  return principal.roles.includes(role);
}

export function hasPermission(principal: Principal, permission: Permission): boolean {
  return principal.roles.some((role) => {
    const grantedPermissions = roleDefinitions[role].permissions;
    return grantedPermissions.includes("*") || grantedPermissions.includes(permission);
  });
}

export function assertPermission(
  principal: Principal,
  permission: Permission,
  details: Record<string, unknown> = {}
): void {
  if (!hasPermission(principal, permission)) {
    throw new AuthorizationError(
      `Principal "${principal.id}" is not allowed to perform "${permission}".`,
      { principal, permission, ...details }
    );
  }
}

export function assertAnyRole(
  principal: Principal,
  allowedRoles: readonly Role[],
  details: Record<string, unknown> = {}
): void {
  if (!allowedRoles.some((role) => principal.roles.includes(role))) {
    throw new AuthorizationError(
      `Principal "${principal.id}" is not in the allowed role set.`,
      { principal, allowedRoles, ...details }
    );
  }
}

export function buildPermissionGuard(permission: Permission) {
  return (principal: Principal, details: Record<string, unknown> = {}) =>
    assertPermission(principal, permission, details);
}

export function buildRoleGuard(allowedRoles: readonly Role[]) {
  return (principal: Principal, details: Record<string, unknown> = {}) =>
    assertAnyRole(principal, allowedRoles, details);
}
