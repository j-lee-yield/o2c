import { createEntityMetadata, type DomainEntity } from "../../shared/types.js";

export const userStatuses = ["active", "invited", "disabled"] as const;
export type UserStatus = (typeof userStatuses)[number];

export const assignmentScopeTypes = [
  "tenant",
  "branch",
  "billing_account",
  "portfolio",
  "team",
] as const;
export type AssignmentScopeType = (typeof assignmentScopeTypes)[number];

export const approvalAuthorityTypes = [
  "outreach_exception",
  "cash_application",
  "exception_resolution",
  "finance_sensitive_messaging",
  "user_role_admin",
] as const;
export type ApprovalAuthorityType = (typeof approvalAuthorityTypes)[number];

export interface AccessControlUser extends DomainEntity {
  email: string;
  fullName: string;
  status: UserStatus;
  lastActiveAt?: string;
}

export interface AccessControlRole extends DomainEntity {
  key: string;
  label: string;
  description: string;
  isSystemRole: boolean;
}

export interface AccessControlPermission extends DomainEntity {
  key: string;
  label: string;
  description: string;
  domain: string;
}

export interface RolePermissionGrant {
  roleId: string;
  permissionId: string;
}

export interface UserRoleAssignment extends DomainEntity {
  userId: string;
  roleId: string;
  scopeType: AssignmentScopeType;
  scopeId?: string;
  grantedByUserId: string;
  grantedAt: string;
  expiresAt?: string;
}

export interface ApprovalAuthorityGrant extends DomainEntity {
  userId?: string;
  roleId?: string;
  approvalType: ApprovalAuthorityType;
  scopeType: AssignmentScopeType;
  scopeId?: string;
  grantedByUserId: string;
  grantedAt: string;
}

export class InvalidAssignmentScopeError extends Error {
  constructor(message: string, readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = "InvalidAssignmentScopeError";
  }
}

export class InvalidApprovalAuthorityError extends Error {
  constructor(message: string, readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = "InvalidApprovalAuthorityError";
  }
}

export function createAccessControlUser(input: {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  status: UserStatus;
  actorId: string;
  actorRole?: "user" | "system";
  createdAt: string;
  lastActiveAt?: string;
}): AccessControlUser {
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.createdAt,
      actorId: input.actorId,
      actorRole: input.actorRole ?? "user",
      tenantId: input.tenantId,
    }),
    email: input.email.trim().toLowerCase(),
    fullName: input.fullName.trim(),
    status: input.status,
    ...(input.lastActiveAt ? { lastActiveAt: input.lastActiveAt } : {}),
  };
}

export function createAccessControlRole(input: {
  id: string;
  tenantId?: string;
  key: string;
  label: string;
  description: string;
  isSystemRole: boolean;
  actorId: string;
  actorRole?: "user" | "system";
  createdAt: string;
}): AccessControlRole {
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.createdAt,
      actorId: input.actorId,
      actorRole: input.actorRole ?? "system",
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    }),
    key: input.key,
    label: input.label,
    description: input.description,
    isSystemRole: input.isSystemRole,
  };
}

export function createAccessControlPermission(input: {
  id: string;
  key: string;
  label: string;
  description: string;
  domain: string;
  createdAt: string;
}): AccessControlPermission {
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.createdAt,
      actorId: "system",
      actorRole: "system",
    }),
    key: input.key,
    label: input.label,
    description: input.description,
    domain: input.domain,
  };
}

export function createUserRoleAssignment(input: {
  id: string;
  tenantId: string;
  userId: string;
  roleId: string;
  scopeType: AssignmentScopeType;
  scopeId?: string;
  grantedByUserId: string;
  grantedAt: string;
  expiresAt?: string;
}): UserRoleAssignment {
  assertScopeValue(input.scopeType, input.scopeId, "assignment");
  if (input.expiresAt && input.expiresAt <= input.grantedAt) {
    throw new InvalidAssignmentScopeError("Role assignment expiry must be after grant time.", {
      expiresAt: input.expiresAt,
      grantedAt: input.grantedAt,
    });
  }

  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.grantedAt,
      actorId: input.grantedByUserId,
      actorRole: "user",
      tenantId: input.tenantId,
    }),
    userId: input.userId,
    roleId: input.roleId,
    scopeType: input.scopeType,
    ...(input.scopeId ? { scopeId: input.scopeId } : {}),
    grantedByUserId: input.grantedByUserId,
    grantedAt: input.grantedAt,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
  };
}

export function createApprovalAuthorityGrant(input: {
  id: string;
  tenantId: string;
  userId?: string;
  roleId?: string;
  approvalType: ApprovalAuthorityType;
  scopeType: AssignmentScopeType;
  scopeId?: string;
  grantedByUserId: string;
  grantedAt: string;
}): ApprovalAuthorityGrant {
  if (!input.userId && !input.roleId) {
    throw new InvalidApprovalAuthorityError(
      "Approval authority must target either a user or a role.",
      input,
    );
  }

  assertScopeValue(input.scopeType, input.scopeId, "approval_authority");

  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.grantedAt,
      actorId: input.grantedByUserId,
      actorRole: "user",
      tenantId: input.tenantId,
    }),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.roleId ? { roleId: input.roleId } : {}),
    approvalType: input.approvalType,
    scopeType: input.scopeType,
    ...(input.scopeId ? { scopeId: input.scopeId } : {}),
    grantedByUserId: input.grantedByUserId,
    grantedAt: input.grantedAt,
  };
}

export function assertScopeValue(
  scopeType: AssignmentScopeType,
  scopeId: string | undefined,
  recordType: "assignment" | "approval_authority",
): void {
  if (scopeType === "tenant" && scopeId) {
    throw new InvalidAssignmentScopeError(
      `${recordType} scope id must be empty for tenant-wide scope.`,
      { scopeType, scopeId },
    );
  }

  if (scopeType !== "tenant" && (!scopeId || scopeId.trim().length === 0)) {
    throw new InvalidAssignmentScopeError(
      `${recordType} scope id is required for ${scopeType} scope.`,
      { scopeType, scopeId },
    );
  }
}
