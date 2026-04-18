export class AuthorizationError extends Error {
    details;
    constructor(message, details = {}) {
        super(message);
        this.name = "AuthorizationError";
        this.details = details;
    }
}
export const roleDefinitions = {
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
export function hasRole(principal, role) {
    return principal.roles.includes(role);
}
export function hasPermission(principal, permission) {
    return principal.roles.some((role) => {
        const grantedPermissions = roleDefinitions[role].permissions;
        return grantedPermissions.includes("*") || grantedPermissions.includes(permission);
    });
}
export function assertPermission(principal, permission, details = {}) {
    if (!hasPermission(principal, permission)) {
        throw new AuthorizationError(`Principal "${principal.id}" is not allowed to perform "${permission}".`, { principal, permission, ...details });
    }
}
export function assertAnyRole(principal, allowedRoles, details = {}) {
    if (!allowedRoles.some((role) => principal.roles.includes(role))) {
        throw new AuthorizationError(`Principal "${principal.id}" is not in the allowed role set.`, { principal, allowedRoles, ...details });
    }
}
export function buildPermissionGuard(permission) {
    return (principal, details = {}) => assertPermission(principal, permission, details);
}
export function buildRoleGuard(allowedRoles) {
    return (principal, details = {}) => assertAnyRole(principal, allowedRoles, details);
}
//# sourceMappingURL=rbac.js.map