export type Role = "ar_collector" | "ar_manager" | "controller" | "admin";
export type Permission = "approval.request.create" | "approval.request.read" | "approval.request.read.own" | "approval.request.review" | "approval.request.reopen_terminal" | "activity_log.read";
export interface Principal {
    id: string;
    roles: Role[];
}
export interface RoleDefinition {
    label: string;
    permissions: readonly (Permission | "*")[];
}
export declare class AuthorizationError extends Error {
    readonly details: Record<string, unknown>;
    constructor(message: string, details?: Record<string, unknown>);
}
export declare const roleDefinitions: Record<Role, RoleDefinition>;
export declare function hasRole(principal: Principal, role: Role): boolean;
export declare function hasPermission(principal: Principal, permission: Permission): boolean;
export declare function assertPermission(principal: Principal, permission: Permission, details?: Record<string, unknown>): void;
export declare function assertAnyRole(principal: Principal, allowedRoles: readonly Role[], details?: Record<string, unknown>): void;
export declare function buildPermissionGuard(permission: Permission): (principal: Principal, details?: Record<string, unknown>) => void;
export declare function buildRoleGuard(allowedRoles: readonly Role[]): (principal: Principal, details?: Record<string, unknown>) => void;
//# sourceMappingURL=rbac.d.ts.map