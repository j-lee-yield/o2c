export type AccessControlScopeType =
  | "tenant"
  | "branch"
  | "billing_account"
  | "portfolio"
  | "team";

export type AccessControlUserStatus = "active" | "invited" | "disabled";

export type AccessControlRoleKey =
  | "commercial_head"
  | "finance_head"
  | "ar_rep"
  | "collections_rep"
  | "platform_admin";

export interface AccessControlPermissionView {
  key: string;
  label: string;
  description: string;
  domain: string;
}

export interface AccessControlRoleAssignmentView {
  id: string;
  roleKey: string;
  roleLabel: string;
  scopeType: AccessControlScopeType;
  scopeId?: string;
  expiresAt?: string;
  grantedAt: string;
  grantedByUserId: string;
}

export interface AccessControlApprovalAuthorityView {
  id: string;
  approvalType: string;
  scopeType: AccessControlScopeType;
  scopeId?: string;
  grantedAt: string;
  grantedByUserId: string;
  source: "user" | "role";
}

export interface AccessControlAuditEventView {
  id: string;
  occurredAt: string;
  action: string;
  actorId: string;
  actorRole: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
}

export interface AccessControlUserListItem {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  status: AccessControlUserStatus;
  primaryRole?: string;
  roleKeys: string[];
  scopeSummary: string;
  lastActiveAt?: string;
  approvalAuthoritySummary: string;
}

export interface AccessControlUserDetail {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  status: AccessControlUserStatus;
  lastActiveAt?: string;
  assignments: AccessControlRoleAssignmentView[];
  approvalAuthorities: AccessControlApprovalAuthorityView[];
  recentAuditEvents: AccessControlAuditEventView[];
}

export interface AccessControlRoleDetail {
  key: string;
  label: string;
  description: string;
  isSystemRole: boolean;
  assignedUserCount: number;
  permissions: AccessControlPermissionView[];
  capabilitySummary: {
    view: string[];
    edit: string[];
    approve: string[];
    configure: string[];
  };
}

export interface AccessControlEffectiveAccessView {
  userId: string;
  roleKeys: string[];
  permissionKeys: string[];
  scopedPermissions: Array<{
    permissionKey: string;
    scopeType: AccessControlScopeType;
    scopeId?: string;
    viaRole: string;
  }>;
  approvalAuthorities: AccessControlApprovalAuthorityView[];
}

export interface AccessControlConsoleData {
  users: AccessControlUserListItem[];
  selectedUser?: AccessControlUserDetail;
  roles: AccessControlRoleDetail[];
  permissions: AccessControlPermissionView[];
  auditEvents: AccessControlAuditEventView[];
  currentUserAccess: AccessControlEffectiveAccessView;
}
