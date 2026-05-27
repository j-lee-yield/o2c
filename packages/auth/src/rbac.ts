export const legacyRoles = ["ar_collector", "ar_manager", "controller", "admin"] as const;
export const scopedRoles = [
  "commercial_head",
  "finance_head",
  "ar_rep",
  "collections_rep",
  "platform_admin",
] as const;
export const allRoles = [...legacyRoles, ...scopedRoles] as const;

export type Role = (typeof allRoles)[number];
export type LegacyRole = (typeof legacyRoles)[number];
export type ScopedRole = (typeof scopedRoles)[number];

export const legacyPermissions = [
  "approval.request.create",
  "approval.request.read",
  "approval.request.read.own",
  "approval.request.review",
  "approval.request.reopen_terminal",
  "activity_log.read",
] as const;

export const scopedPermissions = [
  "accounts.read",
  "accounts.read_scoped",
  "accounts.update_scoped",
  "customers.notes.write",
  "invoices.read",
  "invoices.read_scoped",
  "promises_to_pay.read",
  "promises_to_pay.write",
  "collections.read",
  "collections.work_queue.read",
  "collections.outreach.draft",
  "collections.outreach.send",
  "collections.outreach.approve",
  "collections.templates.read",
  "collections.templates.write",
  "collections.workflow_strategy.read",
  "collections.workflow_strategy.write",
  "payments.read",
  "payments.review",
  "remittances.read",
  "remittances.resolve",
  "cash_application.read",
  "cash_application.propose",
  "cash_application.approve",
  "approvals.read",
  "approvals.request",
  "approvals.decide_outreach",
  "approvals.decide_cash_application",
  "approvals.decide_exception_resolution",
  "ai_activity.read",
  "learning_feedback.write",
  "outreach_ai.generate",
  "users.read",
  "users.manage",
  "roles.read",
  "roles.manage",
  "integrations.read",
  "integrations.manage",
  "tenant_config.manage",
  "audit.read",
] as const;

export type Permission = (typeof legacyPermissions)[number] | (typeof scopedPermissions)[number];

export const scopeTypes = [
  "tenant",
  "branch",
  "billing_account",
  "portfolio",
  "team",
] as const;
export type ScopeType = (typeof scopeTypes)[number];

export const approvalTypes = [
  "outreach_exception",
  "cash_application",
  "exception_resolution",
  "finance_sensitive_messaging",
  "user_role_admin",
] as const;
export type ApprovalType = (typeof approvalTypes)[number];

export type AssignmentScope = {
  scopeType: ScopeType;
  scopeId?: string;
}

export type RoleAssignment = {
  assignmentId?: string;
  role: Role;
  tenantId?: string;
  expiresAt?: string;
} & AssignmentScope

export type ApprovalAuthority = {
  approvalType: ApprovalType;
  role?: Role;
  userId?: string;
} & AssignmentScope

export type Principal = {
  id: string;
  tenantId?: string;
  email?: string;
  fullName?: string;
  roles: Role[];
  assignments?: RoleAssignment[];
  approvalAuthorities?: ApprovalAuthority[];
};

export type RoleDefinition = {
  label: string;
  permissions: readonly (Permission | "*")[];
};

export type PermissionContext = {
  tenantId?: string;
} & Partial<AssignmentScope>

export type PermissionGrantSummary = {
  permission: Permission | "*";
  role: Role;
} & AssignmentScope

export type EffectiveAccessSummary = {
  roles: Role[];
  permissions: PermissionGrantSummary[];
  approvalAuthorities: ApprovalAuthority[];
}

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
    label: "Controller",
    permissions: [
      "approval.request.create",
      "approval.request.read",
      "approval.request.review",
      "approval.request.reopen_terminal",
      "activity_log.read",
    ],
  },
  admin: {
    label: "Admin",
    permissions: ["*"],
  },
  commercial_head: {
    label: "Sales Manager",
    permissions: [
      "accounts.read",
      "invoices.read",
      "promises_to_pay.read",
      "promises_to_pay.write",
      "collections.read",
      "collections.work_queue.read",
      "collections.outreach.draft",
      "collections.outreach.send",
      "collections.outreach.approve",
      "collections.templates.read",
      "collections.templates.write",
      "collections.workflow_strategy.read",
      "collections.workflow_strategy.write",
      "approvals.read",
      "approvals.request",
      "approvals.decide_outreach",
      "ai_activity.read",
      "learning_feedback.write",
      "outreach_ai.generate",
      "roles.read",
      "integrations.read",
      "audit.read",
    ],
  },
  finance_head: {
    label: "Finance Head",
    permissions: [
      "accounts.read",
      "invoices.read",
      "payments.read",
      "payments.review",
      "remittances.read",
      "remittances.resolve",
      "cash_application.read",
      "cash_application.propose",
      "cash_application.approve",
      "approvals.read",
      "approvals.request",
      "approvals.decide_outreach",
      "approvals.decide_cash_application",
      "approvals.decide_exception_resolution",
      "users.read",
      "users.manage",
      "roles.read",
      "roles.manage",
      "integrations.read",
      "integrations.manage",
      "tenant_config.manage",
      "audit.read",
    ],
  },
  ar_rep: {
    label: "AR Rep",
    permissions: [
      "accounts.read_scoped",
      "accounts.update_scoped",
      "customers.notes.write",
      "invoices.read_scoped",
      "promises_to_pay.read",
      "promises_to_pay.write",
      "collections.read",
      "collections.work_queue.read",
      "collections.outreach.draft",
      "collections.outreach.send",
      "payments.read",
      "payments.review",
      "remittances.read",
      "remittances.resolve",
      "cash_application.read",
      "cash_application.propose",
      "approvals.read",
      "approvals.request",
      "audit.read",
    ],
  },
  collections_rep: {
    label: "Collections Rep",
    permissions: [
      "accounts.read_scoped",
      "customers.notes.write",
      "invoices.read_scoped",
      "promises_to_pay.read",
      "promises_to_pay.write",
      "collections.read",
      "collections.work_queue.read",
      "collections.outreach.draft",
      "collections.outreach.send",
      "approvals.read",
      "approvals.request",
      "ai_activity.read",
      "outreach_ai.generate",
    ],
  },
  platform_admin: {
    label: "Platform Admin",
    permissions: ["*"],
  },
};

export function hasRole(principal: Principal, role: Role): boolean {
  return normalizeAssignments(principal).some((assignment) => assignment.role === role);
}

export function hasPermission(
  principal: Principal,
  permission: Permission,
  context?: PermissionContext,
): boolean {
  return getGrantedScopeSummaries(principal, permission, context).length > 0;
}

export function getGrantedScopeSummaries(
  principal: Principal,
  permission: Permission,
  context?: PermissionContext,
): PermissionGrantSummary[] {
  return normalizeAssignments(principal).flatMap((assignment) => {
    const grantedPermissions = roleDefinitions[assignment.role]?.permissions ?? [];
    if (
      !grantedPermissions.includes("*") &&
      !grantedPermissions.includes(permission)
    ) {
      return [];
    }

    if (!matchesContext(assignment, context)) {
      return [];
    }

    return [
      {
        permission: grantedPermissions.includes("*") ? "*" : permission,
        role: assignment.role,
        scopeType: assignment.scopeType,
        ...(assignment.scopeId ? { scopeId: assignment.scopeId } : {}),
      },
    ];
  });
}

export function getEffectiveAccessSummary(principal: Principal): EffectiveAccessSummary {
  const permissions: PermissionGrantSummary[] = [];

  for (const assignment of normalizeAssignments(principal)) {
    const grantedPermissions = roleDefinitions[assignment.role]?.permissions ?? [];
    for (const permission of grantedPermissions) {
      permissions.push({
        permission,
        role: assignment.role,
        scopeType: assignment.scopeType,
        ...(assignment.scopeId ? { scopeId: assignment.scopeId } : {}),
      });
    }
  }

  return {
    roles: [...new Set(normalizeAssignments(principal).map((assignment) => assignment.role))],
    permissions,
    approvalAuthorities: principal.approvalAuthorities ?? [],
  };
}

export function hasApprovalAuthority(
  principal: Principal,
  approvalType: ApprovalType,
  context?: PermissionContext,
): boolean {
  return (principal.approvalAuthorities ?? []).some((authority) => {
    if (authority.approvalType !== approvalType) {
      return false;
    }

    if (authority.userId && authority.userId !== principal.id) {
      return false;
    }

    if (authority.role && !hasRole(principal, authority.role)) {
      return false;
    }

    return matchesContext(authority, context);
  });
}

export function assertPermission(
  principal: Principal,
  permission: Permission,
  details: Record<string, unknown> = {},
): void {
  const context = toPermissionContext(details);
  if (!hasPermission(principal, permission, context)) {
    throw new AuthorizationError(
      `Principal "${principal.id}" is not allowed to perform "${permission}".`,
      { principal, permission, ...details },
    );
  }
}

export function assertAnyRole(
  principal: Principal,
  allowedRoles: readonly Role[],
  details: Record<string, unknown> = {},
): void {
  if (!allowedRoles.some((role) => hasRole(principal, role))) {
    throw new AuthorizationError(
      `Principal "${principal.id}" is not in the allowed role set.`,
      { principal, allowedRoles, ...details },
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

function normalizeAssignments(principal: Principal): RoleAssignment[] {
  const explicitAssignments =
    principal.assignments?.filter((assignment) => !assignment.expiresAt || assignment.expiresAt > nowIso()) ?? [];

  if (explicitAssignments.length > 0) {
    return explicitAssignments;
  }

  return principal.roles.map((role) => ({
    role,
    scopeType: "tenant",
    ...(principal.tenantId ? { tenantId: principal.tenantId } : {}),
  }));
}

function matchesContext(
  assignment: AssignmentScope & { tenantId?: string },
  context?: PermissionContext,
) {
  if (!context) {
    return true;
  }

  if (context.tenantId && assignment.tenantId && assignment.tenantId !== context.tenantId) {
    return false;
  }

  if (!context.scopeType) {
    return true;
  }

  if (assignment.scopeType === "tenant") {
    return true;
  }

  if (assignment.scopeType !== context.scopeType) {
    return false;
  }

  if (!context.scopeId) {
    return true;
  }

  return assignment.scopeId === context.scopeId;
}

function toPermissionContext(details: Record<string, unknown>): PermissionContext | undefined {
  const scopeType = details.scopeType;
  if (
    scopeType !== "tenant" &&
    scopeType !== "branch" &&
    scopeType !== "billing_account" &&
    scopeType !== "portfolio" &&
    scopeType !== "team"
  ) {
    return undefined;
  }

  return {
    scopeType,
    ...(typeof details.scopeId === "string" ? { scopeId: details.scopeId } : {}),
    ...(typeof details.tenantId === "string" ? { tenantId: details.tenantId } : {}),
  };
}

function nowIso() {
  return new Date().toISOString();
}
