export const legacyRoles = ["ar_collector", "ar_manager", "controller", "admin"];
export const scopedRoles = [
  "commercial_head",
  "finance_head",
  "ar_rep",
  "collections_rep",
  "platform_admin",
];
export const allRoles = [...legacyRoles, ...scopedRoles];

export const legacyPermissions = [
  "approval.request.create",
  "approval.request.read",
  "approval.request.read.own",
  "approval.request.review",
  "approval.request.reopen_terminal",
  "activity_log.read",
];

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
];

export const scopeTypes = ["tenant", "branch", "billing_account", "portfolio", "team"];
export const approvalTypes = [
  "outreach_exception",
  "cash_application",
  "exception_resolution",
  "finance_sensitive_messaging",
  "user_role_admin",
];

export class AuthorizationError extends Error {
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

export function hasRole(principal, role) {
  return normalizeAssignments(principal).some((assignment) => assignment.role === role);
}

export function hasPermission(principal, permission, context) {
  return getGrantedScopeSummaries(principal, permission, context).length > 0;
}

export function getGrantedScopeSummaries(principal, permission, context) {
  return normalizeAssignments(principal).flatMap((assignment) => {
    const grantedPermissions = roleDefinitions[assignment.role]?.permissions ?? [];
    if (!grantedPermissions.includes("*") && !grantedPermissions.includes(permission)) {
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

export function getEffectiveAccessSummary(principal) {
  const permissions = [];
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

export function hasApprovalAuthority(principal, approvalType, context) {
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

export function assertPermission(principal, permission, details = {}) {
  const context = toPermissionContext(details);
  if (!hasPermission(principal, permission, context)) {
    throw new AuthorizationError(
      `Principal "${principal.id}" is not allowed to perform "${permission}".`,
      { principal, permission, ...details },
    );
  }
}

export function assertAnyRole(principal, allowedRoles, details = {}) {
  if (!allowedRoles.some((role) => hasRole(principal, role))) {
    throw new AuthorizationError(
      `Principal "${principal.id}" is not in the allowed role set.`,
      { principal, allowedRoles, ...details },
    );
  }
}

export function buildPermissionGuard(permission) {
  return (principal, details = {}) => assertPermission(principal, permission, details);
}

export function buildRoleGuard(allowedRoles) {
  return (principal, details = {}) => assertAnyRole(principal, allowedRoles, details);
}

function normalizeAssignments(principal) {
  const explicitAssignments = principal.assignments?.filter(
    (assignment) => !assignment.expiresAt || assignment.expiresAt > nowIso(),
  ) ?? [];

  if (explicitAssignments.length > 0) {
    return explicitAssignments;
  }

  return principal.roles.map((role) => ({
    role,
    tenantId: principal.tenantId,
    scopeType: "tenant",
  }));
}

function matchesContext(assignment, context) {
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

function toPermissionContext(details) {
  const scopeType = details.scopeType;
  if (!scopeTypes.includes(scopeType)) {
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
