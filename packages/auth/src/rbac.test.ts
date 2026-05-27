import { describe, expect, it } from "vitest";

import {
  AuthorizationError,
  buildPermissionGuard,
  getGrantedScopeSummaries,
  hasPermission,
  hasApprovalAuthority,
  type Principal,
} from "./index.js";

describe("RBAC role restrictions", () => {
  it("grants only the expected approval capabilities by role", () => {
    const collector: Principal = { id: "collector_1", roles: ["ar_collector"] };
    const manager: Principal = { id: "manager_1", roles: ["ar_manager"] };
    const controller: Principal = { id: "controller_1", roles: ["controller"] };
    const admin: Principal = { id: "admin_1", roles: ["admin"] };

    expect(hasPermission(collector, "approval.request.review")).toBe(false);
    expect(hasPermission(manager, "approval.request.review")).toBe(true);
    expect(hasPermission(manager, "approval.request.reopen_terminal")).toBe(false);
    expect(hasPermission(controller, "approval.request.reopen_terminal")).toBe(true);
    expect(hasPermission(admin, "approval.request.reopen_terminal")).toBe(true);
  });

  it("raises an authorization error when a role lacks the permission", () => {
    const guard = buildPermissionGuard("approval.request.review");
    const collector: Principal = { id: "collector_1", roles: ["ar_collector"] };

    expect(() => guard(collector)).toThrowError(AuthorizationError);
  });

  it("merges scoped assignments across roles without granting tenant-wide access", () => {
    const principal: Principal = {
      id: "ar_rep_1",
      tenantId: "tenant_1",
      roles: ["ar_rep", "collections_rep"],
      assignments: [
        {
          role: "ar_rep",
          tenantId: "tenant_1",
          scopeType: "billing_account",
          scopeId: "billing_seed_1",
        },
        {
          role: "collections_rep",
          tenantId: "tenant_1",
          scopeType: "branch",
          scopeId: "branch_makati",
        },
      ],
    };

    expect(
      hasPermission(principal, "cash_application.propose", {
        tenantId: "tenant_1",
        scopeType: "billing_account",
        scopeId: "billing_seed_1",
      }),
    ).toBe(true);
    expect(
      hasPermission(principal, "cash_application.propose", {
        tenantId: "tenant_1",
        scopeType: "billing_account",
        scopeId: "billing_seed_2",
      }),
    ).toBe(false);
    expect(
      hasPermission(principal, "collections.outreach.send", {
        tenantId: "tenant_1",
        scopeType: "branch",
        scopeId: "branch_makati",
      }),
    ).toBe(true);
  });

  it("keeps commercial head workflow controls separate from finance-sensitive approvals", () => {
    const principal: Principal = {
      id: "commercial_head_1",
      tenantId: "tenant_1",
      roles: ["commercial_head"],
      assignments: [{ role: "commercial_head", tenantId: "tenant_1", scopeType: "tenant" }],
    };

    expect(hasPermission(principal, "collections.templates.write")).toBe(true);
    expect(hasPermission(principal, "collections.workflow_strategy.write")).toBe(true);
    expect(hasPermission(principal, "cash_application.approve")).toBe(false);
  });

  it("supports role- and user-based approval authorities with scope checks", () => {
    const principal: Principal = {
      id: "finance_head_1",
      tenantId: "tenant_1",
      roles: ["finance_head"],
      assignments: [{ role: "finance_head", tenantId: "tenant_1", scopeType: "tenant" }],
      approvalAuthorities: [
        {
          approvalType: "cash_application",
          role: "finance_head",
          scopeType: "tenant",
        },
        {
          approvalType: "outreach_exception",
          userId: "finance_head_1",
          scopeType: "branch",
          scopeId: "branch_makati",
        },
      ],
    };

    expect(hasApprovalAuthority(principal, "cash_application", { scopeType: "tenant" })).toBe(true);
    expect(
      hasApprovalAuthority(principal, "outreach_exception", {
        scopeType: "branch",
        scopeId: "branch_makati",
      }),
    ).toBe(true);
    expect(
      hasApprovalAuthority(principal, "outreach_exception", {
        scopeType: "branch",
        scopeId: "branch_cebu",
      }),
    ).toBe(false);
  });

  it("summarizes granted scopes for scoped permissions", () => {
    const principal: Principal = {
      id: "collections_rep_1",
      tenantId: "tenant_1",
      roles: ["collections_rep"],
      assignments: [
        {
          role: "collections_rep",
          tenantId: "tenant_1",
          scopeType: "team",
          scopeId: "team_ncr",
        },
      ],
    };

    expect(getGrantedScopeSummaries(principal, "collections.outreach.send")).toEqual([
      {
        permission: "collections.outreach.send",
        role: "collections_rep",
        scopeType: "team",
        scopeId: "team_ncr",
      },
    ]);
  });
});
