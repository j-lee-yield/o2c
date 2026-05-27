import {
  createActivityLogDomainHelpers,
  type ImmutableActivityLogEntry,
  type ImmutableActivityLogStore,
} from "@o2c/audit";
import {
  createAccessControlPermission,
  createAccessControlRole,
  createAccessControlUser,
  createApprovalAuthorityGrant,
  createUserRoleAssignment,
  type AccessControlPermission,
  type AccessControlRole,
  type AccessControlUser,
  type ApprovalAuthorityGrant,
  type UserRoleAssignment,
  type UserStatus,
} from "@o2c/domain";
import {
  assertPermission,
  getEffectiveAccessSummary,
  getGrantedScopeSummaries,
  hasApprovalAuthority,
  roleDefinitions,
  scopedPermissions,
  type ApprovalType,
  type Permission,
  type Principal,
  type Role,
  type ScopeType,
} from "@o2c/auth";
import type {
  AccessControlApprovalAuthorityView,
  AccessControlAuditEventView,
  AccessControlEffectiveAccessView,
  AccessControlPermissionView,
  AccessControlRoleAssignmentView,
  AccessControlRoleDetail,
  AccessControlUserDetail,
  AccessControlUserListItem,
} from "@o2c/contracts";

type CapabilityBucket = "view" | "edit" | "approve" | "configure";

export interface AccessControlStore {
  users: Map<string, AccessControlUser>;
  roles: Map<string, AccessControlRole>;
  permissions: Map<string, AccessControlPermission>;
  assignments: Map<string, UserRoleAssignment>;
  approvalAuthorities: Map<string, ApprovalAuthorityGrant>;
}

export class InMemoryAccessControlStore implements AccessControlStore {
  readonly users = new Map<string, AccessControlUser>();
  readonly roles = new Map<string, AccessControlRole>();
  readonly permissions = new Map<string, AccessControlPermission>();
  readonly assignments = new Map<string, UserRoleAssignment>();
  readonly approvalAuthorities = new Map<string, ApprovalAuthorityGrant>();
}

export interface AccessControlServiceDeps {
  activityStore: ImmutableActivityLogStore;
  store?: AccessControlStore;
  now?: () => string;
  idGenerator?: (prefix: string) => string;
  tenantId?: string;
}

export class AccessControlService {
  private readonly store: AccessControlStore;
  private readonly now: () => string;
  private readonly tenantId: string;
  private readonly idGenerator: (prefix: string) => string;
  private readonly audit: ReturnType<typeof createActivityLogDomainHelpers>;

  constructor(private readonly deps: AccessControlServiceDeps) {
    this.store = deps.store ?? new InMemoryAccessControlStore();
    this.now = deps.now ?? (() => new Date().toISOString());
    this.tenantId = deps.tenantId ?? "default";
    let counter = 0;
    this.idGenerator =
      deps.idGenerator ??
      ((prefix) => {
        counter += 1;
        return `${prefix}_${counter}`;
      });
    this.audit = createActivityLogDomainHelpers({
      store: deps.activityStore,
      now: this.now,
      idGenerator: () => this.idGenerator("activity"),
    });
    this.seedDefaults();
  }

  getPrincipalForUser(userId: string): Principal {
    const user = this.store.users.get(userId);
    if (!user) {
      return { id: userId, tenantId: this.tenantId, roles: [] };
    }

    const assignments = [...this.store.assignments.values()]
      .filter((assignment) => assignment.userId === userId)
      .map((assignment) => ({
        assignmentId: assignment.id,
        role: this.requireRoleKeyById(assignment.roleId),
        tenantId: assignment.tenantId ?? this.tenantId,
        scopeType: assignment.scopeType,
        ...(assignment.scopeId ? { scopeId: assignment.scopeId } : {}),
        ...(assignment.expiresAt ? { expiresAt: assignment.expiresAt } : {}),
      }));

    const roles = [...new Set(assignments.map((assignment) => assignment.role))];
    const approvalAuthorities = [...this.store.approvalAuthorities.values()]
      .filter(
        (authority) =>
          authority.userId === userId ||
          (authority.roleId &&
            assignments.some((assignment) => assignment.role === this.requireRoleKeyById(authority.roleId!))),
      )
      .map((authority) => ({
        approvalType: authority.approvalType,
        ...(authority.userId ? { userId: authority.userId } : {}),
        ...(authority.roleId ? { role: this.requireRoleKeyById(authority.roleId) } : {}),
        scopeType: authority.scopeType,
        ...(authority.scopeId ? { scopeId: authority.scopeId } : {}),
      }));

    return {
      id: user.id,
      tenantId: user.tenantId ?? this.tenantId,
      email: user.email,
      fullName: user.fullName,
      roles: roles.length > 0 ? roles : ["ar_rep"],
      assignments,
      approvalAuthorities,
    };
  }

  listUsers(principal: Principal, filters?: {
    search?: string;
    status?: UserStatus;
    roleKey?: string;
    scopeType?: ScopeType;
  }): AccessControlUserListItem[] {
    assertPermission(principal, "users.read");
    const search = filters?.search?.trim().toLowerCase();
    return [...this.store.users.values()]
      .filter((user) => !filters?.status || user.status === filters.status)
      .filter((user) => {
        const assignments = this.listAssignmentsForUser(user.id);
        if (filters?.roleKey && !assignments.some((assignment) => assignment.roleKey === filters.roleKey)) {
          return false;
        }
        if (filters?.scopeType && !assignments.some((assignment) => assignment.scopeType === filters.scopeType)) {
          return false;
        }
        if (!search) {
          return true;
        }
        return (
          user.fullName.toLowerCase().includes(search) ||
          user.email.toLowerCase().includes(search)
        );
      })
      .map((user) => {
        const assignments = this.listAssignmentsForUser(user.id);
        const authorities = this.listApprovalAuthoritiesForUser(user.id);
        return {
          id: user.id,
          tenantId: user.tenantId ?? this.tenantId,
          email: user.email,
          fullName: user.fullName,
          status: user.status,
          primaryRole: assignments[0]?.roleLabel,
          roleKeys: assignments.map((assignment) => assignment.roleKey),
          scopeSummary: buildScopeSummary(assignments),
          ...(user.lastActiveAt ? { lastActiveAt: user.lastActiveAt } : {}),
          approvalAuthoritySummary:
            authorities.length > 0
              ? authorities.map((authority) => authority.approvalType).join(", ")
              : "No explicit approval authority",
        };
      });
  }

  getUserDetail(principal: Principal, userId: string): AccessControlUserDetail {
    assertPermission(principal, "users.read");
    const user = this.requireUser(userId);
    return {
      id: user.id,
      tenantId: user.tenantId ?? this.tenantId,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      ...(user.lastActiveAt ? { lastActiveAt: user.lastActiveAt } : {}),
      assignments: this.listAssignmentsForUser(userId),
      approvalAuthorities: this.listApprovalAuthoritiesForUser(userId),
      recentAuditEvents: this.listAuditEvents(principal).filter(
        (event) => event.entityId === userId || String(event.metadata.userId ?? "") === userId,
      ).slice(0, 10),
    };
  }

  inviteUser(
    principal: Principal,
    input: {
      email: string;
      fullName: string;
      status?: UserStatus;
      roleKey?: Role;
      scopeType?: ScopeType;
      scopeId?: string;
      approvalType?: ApprovalType;
    },
  ): AccessControlUserDetail {
    assertPermission(principal, "users.manage");
    const now = this.now();
    const user = createAccessControlUser({
      id: this.idGenerator("user"),
      tenantId: this.tenantId,
      email: input.email,
      fullName: input.fullName,
      status: input.status ?? "invited",
      createdAt: now,
      actorId: principal.id,
      actorRole: "user",
    });
    this.store.users.set(user.id, user);
    this.audit.append({
      actorId: principal.id,
      actorRole: principal.roles[0] ?? "platform_admin",
      action: "access_control.user.invited",
      entityType: "access_control_user",
      entityId: user.id,
      after: sanitizeUser(user),
      metadata: { email: user.email, status: user.status },
    });

    if (input.roleKey) {
      this.assignRole(principal, {
        userId: user.id,
        roleKey: input.roleKey,
        scopeType: input.scopeType ?? "tenant",
        ...(input.scopeId ? { scopeId: input.scopeId } : {}),
      });
    }

    if (input.approvalType) {
      this.setApprovalAuthority(principal, {
        userId: user.id,
        approvalType: input.approvalType,
        scopeType: input.scopeType ?? "tenant",
        ...(input.scopeId ? { scopeId: input.scopeId } : {}),
      });
    }

    return this.getUserDetail(principal, user.id);
  }

  updateUser(
    principal: Principal,
    userId: string,
    input: { fullName?: string; email?: string; status?: UserStatus },
  ): AccessControlUserDetail {
    assertPermission(principal, "users.manage");
    const user = this.requireUser(userId);
    const updated: AccessControlUser = {
      ...user,
      ...(input.fullName ? { fullName: input.fullName.trim() } : {}),
      ...(input.email ? { email: input.email.trim().toLowerCase() } : {}),
      ...(input.status ? { status: input.status } : {}),
      updatedAt: this.now(),
      updatedByActorId: principal.id,
      updatedByActorRole: principal.roles[0] ?? "platform_admin",
    };
    this.store.users.set(userId, updated);
    this.audit.append({
      actorId: principal.id,
      actorRole: principal.roles[0] ?? "platform_admin",
      action: "access_control.user.updated",
      entityType: "access_control_user",
      entityId: userId,
      before: sanitizeUser(user),
      after: sanitizeUser(updated),
      metadata: {},
    });
    return this.getUserDetail(principal, userId);
  }

  setUserStatus(
    principal: Principal,
    userId: string,
    status: Extract<UserStatus, "active" | "disabled">,
  ): AccessControlUserDetail {
    const action =
      status === "disabled" ? "access_control.user.disabled" : "access_control.user.enabled";
    const user = this.updateUser(principal, userId, { status });
    this.audit.append({
      actorId: principal.id,
      actorRole: principal.roles[0] ?? "platform_admin",
      action,
      entityType: "access_control_user",
      entityId: userId,
      metadata: { status },
    });
    return user;
  }

  listAssignmentsForUser(userId: string): AccessControlRoleAssignmentView[] {
    return [...this.store.assignments.values()]
      .filter((assignment) => assignment.userId === userId)
      .map((assignment) => {
        const role = this.store.roles.get(assignment.roleId);
        return {
          id: assignment.id,
          roleKey: role?.key ?? assignment.roleId,
          roleLabel: role?.label ?? assignment.roleId,
          scopeType: assignment.scopeType,
          ...(assignment.scopeId ? { scopeId: assignment.scopeId } : {}),
          ...(assignment.expiresAt ? { expiresAt: assignment.expiresAt } : {}),
          grantedAt: assignment.grantedAt,
          grantedByUserId: assignment.grantedByUserId,
        };
      })
      .sort((left, right) => left.roleLabel.localeCompare(right.roleLabel));
  }

  assignRole(
    principal: Principal,
    input: {
      userId: string;
      roleKey: Role;
      scopeType: ScopeType;
      scopeId?: string;
      expiresAt?: string;
    },
  ): AccessControlRoleAssignmentView {
    assertPermission(principal, "users.manage");
    const now = this.now();
    const role = this.requireRoleByKey(input.roleKey);
    const assignment = createUserRoleAssignment({
      id: this.idGenerator("assignment"),
      tenantId: this.tenantId,
      userId: input.userId,
      roleId: role.id,
      scopeType: input.scopeType,
      ...(input.scopeId ? { scopeId: input.scopeId } : {}),
      grantedByUserId: principal.id,
      grantedAt: now,
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    });
    this.store.assignments.set(assignment.id, assignment);
    this.audit.append({
      actorId: principal.id,
      actorRole: principal.roles[0] ?? "platform_admin",
      action: "access_control.assignment.granted",
      entityType: "user_role_assignment",
      entityId: assignment.id,
      after: sanitizeAssignment(assignment, role.key),
      metadata: { userId: input.userId, roleKey: input.roleKey },
    });
    return this.listAssignmentsForUser(input.userId).find((item) => item.id === assignment.id)!;
  }

  removeAssignment(principal: Principal, assignmentId: string): void {
    assertPermission(principal, "users.manage");
    const assignment = this.store.assignments.get(assignmentId);
    if (!assignment) {
      return;
    }
    const roleKey = this.requireRoleKeyById(assignment.roleId);
    this.store.assignments.delete(assignmentId);
    this.audit.append({
      actorId: principal.id,
      actorRole: principal.roles[0] ?? "platform_admin",
      action: "access_control.assignment.removed",
      entityType: "user_role_assignment",
      entityId: assignmentId,
      before: sanitizeAssignment(assignment, roleKey),
      metadata: { userId: assignment.userId, roleKey },
    });
  }

  setApprovalAuthority(
    principal: Principal,
    input: {
      userId?: string;
      roleKey?: Role;
      approvalType: ApprovalType;
      scopeType: ScopeType;
      scopeId?: string;
    },
  ): AccessControlApprovalAuthorityView {
    assertPermission(principal, "users.manage");
    const authority = createApprovalAuthorityGrant({
      id: this.idGenerator("approval_authority"),
      tenantId: this.tenantId,
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.roleKey ? { roleId: this.requireRoleByKey(input.roleKey).id } : {}),
      approvalType: input.approvalType,
      scopeType: input.scopeType,
      ...(input.scopeId ? { scopeId: input.scopeId } : {}),
      grantedByUserId: principal.id,
      grantedAt: this.now(),
    });
    this.store.approvalAuthorities.set(authority.id, authority);
    this.audit.append({
      actorId: principal.id,
      actorRole: principal.roles[0] ?? "platform_admin",
      action: "access_control.approval_authority.granted",
      entityType: "approval_authority",
      entityId: authority.id,
      after: sanitizeApprovalAuthority(authority, input.roleKey),
      metadata: { approvalType: authority.approvalType, userId: input.userId ?? "", roleKey: input.roleKey ?? "" },
    });
    return this.toApprovalAuthorityView(authority);
  }

  listApprovalAuthoritiesForUser(userId: string): AccessControlApprovalAuthorityView[] {
    const userAssignments = this.listAssignmentsForUser(userId);
    return [...this.store.approvalAuthorities.values()]
      .filter(
        (authority) =>
          authority.userId === userId ||
          (authority.roleId &&
            userAssignments.some((assignment) => assignment.roleKey === this.requireRoleKeyById(authority.roleId!))),
      )
      .map((authority) => this.toApprovalAuthorityView(authority));
  }

  listRoles(principal: Principal): AccessControlRoleDetail[] {
    assertPermission(principal, "roles.read");
    return [...this.store.roles.values()]
      .map((role) => {
        const permissions = this.listPermissions().filter((permission) =>
          roleDefinitions[role.key as Role]?.permissions.includes("*") ||
          roleDefinitions[role.key as Role]?.permissions.includes(permission.key as Permission),
        );
        return {
          key: role.key,
          label: role.label,
          description: role.description,
          isSystemRole: role.isSystemRole,
          assignedUserCount: [...this.store.assignments.values()].filter(
            (assignment) => assignment.roleId === role.id,
          ).length,
          permissions,
          capabilitySummary: buildCapabilitySummary(permissions.map((permission) => permission.key)),
        };
      })
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  getRoleDetail(principal: Principal, roleKey: Role): AccessControlRoleDetail {
    const role = this.listRoles(principal).find((item) => item.key === roleKey);
    if (!role) {
      throw new Error(`Role "${roleKey}" not found.`);
    }
    return role;
  }

  listPermissions(): AccessControlPermissionView[] {
    return [...this.store.permissions.values()]
      .map((permission) => ({
        key: permission.key,
        label: permission.label,
        description: permission.description,
        domain: permission.domain,
      }))
      .sort((left, right) => left.domain.localeCompare(right.domain) || left.key.localeCompare(right.key));
  }

  getCurrentUserAccess(principal: Principal): AccessControlEffectiveAccessView {
    const summary = getEffectiveAccessSummary(principal);
    return {
      userId: principal.id,
      roleKeys: summary.roles,
      permissionKeys: [
        ...new Set(
          summary.permissions.map((permission) => permission.permission).filter((value) => value !== "*"),
        ),
      ] as string[],
      scopedPermissions: summary.permissions.map((permission) => ({
        permissionKey: permission.permission,
        scopeType: permission.scopeType,
        ...(permission.scopeId ? { scopeId: permission.scopeId } : {}),
        viaRole: permission.role,
      })),
      approvalAuthorities: (principal.approvalAuthorities ?? []).map((authority, index) => ({
        id: `principal_${index}`,
        approvalType: authority.approvalType,
        scopeType: authority.scopeType,
        ...(authority.scopeId ? { scopeId: authority.scopeId } : {}),
        grantedAt: this.now(),
        grantedByUserId: authority.userId ?? authority.role ?? principal.id,
        source: authority.userId ? "user" : "role",
      })),
    };
  }

  previewUserEffectiveAccess(
    principal: Principal,
    input: {
      userId: string;
      permissionKey?: Permission;
      scopeType?: ScopeType;
      scopeId?: string;
      approvalType?: ApprovalType;
    },
  ) {
    assertPermission(principal, "users.read");
    const previewPrincipal = this.getPrincipalForUser(input.userId);
    const permissionGranted = input.permissionKey
      ? getGrantedScopeSummaries(previewPrincipal, input.permissionKey, {
          ...(input.scopeType ? { scopeType: input.scopeType } : {}),
          ...(input.scopeId ? { scopeId: input.scopeId } : {}),
          tenantId: this.tenantId,
        })
      : [];
    return {
      userId: input.userId,
      permissionGranted,
      approvalAuthorityGranted: input.approvalType
        ? hasApprovalAuthority(previewPrincipal, input.approvalType, {
            ...(input.scopeType ? { scopeType: input.scopeType } : {}),
            ...(input.scopeId ? { scopeId: input.scopeId } : {}),
          })
        : undefined,
      effectiveAccess: this.getCurrentUserAccess(previewPrincipal),
    };
  }

  listAuditEvents(principal: Principal): AccessControlAuditEventView[] {
    assertPermission(principal, "audit.read");
    const entries = (this.deps.activityStore as { entries?: ImmutableActivityLogEntry[] }).entries ?? [];
    return entries
      .filter((entry) => entry.action.startsWith("access_control."))
      .map((entry) => ({
        id: entry.id,
        occurredAt: entry.occurredAt,
        action: entry.action,
        actorId: entry.actorId,
        actorRole: entry.actorRole,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata,
      }))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  }

  private requireUser(userId: string) {
    const user = this.store.users.get(userId);
    if (!user) {
      throw new Error(`User "${userId}" not found.`);
    }
    return user;
  }

  private requireRoleByKey(roleKey: Role) {
    const role = [...this.store.roles.values()].find((item) => item.key === roleKey);
    if (!role) {
      throw new Error(`Role "${roleKey}" not found.`);
    }
    return role;
  }

  private requireRoleKeyById(roleId: string): Role {
    const role = this.store.roles.get(roleId);
    if (!role) {
      throw new Error(`Role id "${roleId}" not found.`);
    }
    return role.key as Role;
  }

  private toApprovalAuthorityView(authority: ApprovalAuthorityGrant): AccessControlApprovalAuthorityView {
    return {
      id: authority.id,
      approvalType: authority.approvalType,
      scopeType: authority.scopeType,
      ...(authority.scopeId ? { scopeId: authority.scopeId } : {}),
      grantedAt: authority.grantedAt,
      grantedByUserId: authority.grantedByUserId,
      source: authority.userId ? "user" : "role",
    };
  }

  private seedDefaults() {
    if (this.store.roles.size > 0) {
      return;
    }

    const now = this.now();
    for (const permissionKey of scopedPermissions) {
      const permissionLabel = permissionKey.split(".").at(-1) ?? permissionKey;
      this.store.permissions.set(
        permissionKey,
        createAccessControlPermission({
          id: permissionKey,
          key: permissionKey,
          label: permissionLabel.replace(/_/g, " "),
          description: `Permission to ${permissionKey.replace(/\./g, " ")}.`,
          domain: permissionKey.split(".")[0] ?? "general",
          createdAt: now,
        }),
      );
    }

    for (const [key, definition] of Object.entries(roleDefinitions)) {
      if (
        key !== "commercial_head" &&
        key !== "finance_head" &&
        key !== "ar_rep" &&
        key !== "collections_rep" &&
        key !== "platform_admin"
      ) {
        continue;
      }
      const role = createAccessControlRole({
        id: this.idGenerator("role"),
        key,
        label: definition.label,
        description: defaultRoleDescriptions[key as Role],
        isSystemRole: true,
        createdAt: now,
        actorId: "system",
        actorRole: "system",
      });
      this.store.roles.set(role.id, role);
    }

    const seededUsers = [
      {
        id: "user_platform_admin",
        email: "platform.admin@yield.example",
        fullName: "Pat Reyes",
        status: "active" as const,
        roleKey: "platform_admin" as const,
        scopeType: "tenant" as const,
      },
      {
        id: "user_finance_head",
        email: "finance.head@yield.example",
        fullName: "Alicia Santos",
        status: "active" as const,
        roleKey: "finance_head" as const,
        scopeType: "tenant" as const,
      },
      {
        id: "user_commercial_head",
        email: "commercial.head@yield.example",
        fullName: "Miguel Cruz",
        status: "active" as const,
        roleKey: "commercial_head" as const,
        scopeType: "tenant" as const,
      },
      {
        id: "user_ar_rep",
        email: "ar.rep@yield.example",
        fullName: "Jamie Lim",
        status: "active" as const,
        roleKey: "ar_rep" as const,
        scopeType: "billing_account" as const,
        scopeId: "billing_seed_1",
      },
      {
        id: "user_collections_rep",
        email: "collections.rep@yield.example",
        fullName: "Tricia Dela Cruz",
        status: "invited" as const,
        roleKey: "collections_rep" as const,
        scopeType: "team" as const,
        scopeId: "team_ncr",
      },
    ];

    for (const seeded of seededUsers) {
      const user = createAccessControlUser({
        id: seeded.id,
        tenantId: this.tenantId,
        email: seeded.email,
        fullName: seeded.fullName,
        status: seeded.status,
        createdAt: now,
        actorId: "system",
        actorRole: "system",
      });
      this.store.users.set(user.id, user);
      const role = this.requireRoleByKey(seeded.roleKey);
      const assignment = createUserRoleAssignment({
        id: this.idGenerator("assignment"),
        tenantId: this.tenantId,
        userId: user.id,
        roleId: role.id,
        scopeType: seeded.scopeType,
        ...(seeded.scopeId ? { scopeId: seeded.scopeId } : {}),
        grantedByUserId: "system",
        grantedAt: now,
      });
      this.store.assignments.set(assignment.id, assignment);
    }

    this.store.approvalAuthorities.set(
      "authority_finance_cash_app",
      createApprovalAuthorityGrant({
        id: "authority_finance_cash_app",
        tenantId: this.tenantId,
        roleId: this.requireRoleByKey("finance_head").id,
        approvalType: "cash_application",
        scopeType: "tenant",
        grantedByUserId: "system",
        grantedAt: now,
      }),
    );
    this.store.approvalAuthorities.set(
      "authority_commercial_outreach",
      createApprovalAuthorityGrant({
        id: "authority_commercial_outreach",
        tenantId: this.tenantId,
        roleId: this.requireRoleByKey("commercial_head").id,
        approvalType: "outreach_exception",
        scopeType: "tenant",
        grantedByUserId: "system",
        grantedAt: now,
      }),
    );
  }
}

function sanitizeUser(user: AccessControlUser) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    status: user.status,
  };
}

function sanitizeAssignment(assignment: UserRoleAssignment, roleKey: string) {
  return {
    id: assignment.id,
    userId: assignment.userId,
    roleKey,
    scopeType: assignment.scopeType,
    ...(assignment.scopeId ? { scopeId: assignment.scopeId } : {}),
  };
}

function sanitizeApprovalAuthority(authority: ApprovalAuthorityGrant, roleKey?: string) {
  return {
    id: authority.id,
    approvalType: authority.approvalType,
    scopeType: authority.scopeType,
    ...(authority.scopeId ? { scopeId: authority.scopeId } : {}),
    ...(authority.userId ? { userId: authority.userId } : {}),
    ...(roleKey ? { roleKey } : {}),
  };
}

function buildScopeSummary(assignments: AccessControlRoleAssignmentView[]) {
  if (assignments.length === 0) {
    return "No scopes";
  }
  return assignments
    .map((assignment) =>
      assignment.scopeType === "tenant"
        ? "Tenant-wide"
        : `${assignment.scopeType.replace(/_/g, " ")}:${assignment.scopeId ?? "unknown"}`
    )
    .join(" | ");
}

function buildCapabilitySummary(permissionKeys: string[]): AccessControlRoleDetail["capabilitySummary"] {
  const summary: Record<CapabilityBucket, string[]> = {
    view: [],
    edit: [],
    approve: [],
    configure: [],
  };

  for (const permissionKey of permissionKeys) {
    const bucket = permissionKey.includes(".approve") || permissionKey.includes(".decide")
      ? "approve"
      : permissionKey.includes(".write") || permissionKey.includes(".manage") || permissionKey.includes(".update")
        ? permissionKey.includes("templates") || permissionKey.includes("workflow_strategy") || permissionKey.includes("tenant_config")
          ? "configure"
          : "edit"
        : permissionKey.includes(".read")
          ? "view"
          : permissionKey.includes("generate")
            ? "edit"
            : "view";
    summary[bucket].push(permissionKey);
  }

  return summary;
}

const defaultRoleDescriptions: Record<Role, string> = {
  ar_collector: "Legacy AR collector role.",
  ar_manager: "Legacy AR manager role.",
  controller: "Legacy controller role.",
  admin: "Legacy admin role.",
  commercial_head:
    "Commercial leadership with broad customer visibility and full collections template/workflow strategy configuration.",
  finance_head:
    "Finance leadership with finance-sensitive approvals, cash application oversight, audit access, and admin controls.",
  ar_rep:
    "Scoped AR operations across invoices, payments, remittances, outreach, and approval requests without tenant admin rights.",
  collections_rep:
    "Scoped customer-facing outreach operations with notes, disputes, and PTP capture but no cash application approval authority.",
  platform_admin:
    "Tenant-wide administration for users, roles, integrations, and global configuration. Use sparingly.",
};
