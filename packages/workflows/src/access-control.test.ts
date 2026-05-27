import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import { describe, expect, it } from "vitest";
import { AccessControlService } from "./access-control.js";

describe("AccessControlService", () => {
  function createService() {
    return new AccessControlService({
      activityStore: new InMemoryImmutableActivityLogStore(),
      tenantId: "default",
    });
  }

  it("seeds safe default roles and users", () => {
    const service = createService();
    const admin = service.getPrincipalForUser("user_platform_admin");

    expect(service.listUsers(admin).length).toBeGreaterThanOrEqual(5);
    expect(service.listRoles(admin).map((role) => role.key)).toContain("commercial_head");
    expect(service.getCurrentUserAccess(admin).roleKeys).toContain("platform_admin");
  });

  it("keeps finance approval authority explicit and scoped", () => {
    const service = createService();
    const admin = service.getPrincipalForUser("user_platform_admin");
    const finance = service.getPrincipalForUser("user_finance_head");

    const preview = service.previewUserEffectiveAccess(admin, {
      userId: finance.id,
      approvalType: "cash_application",
      scopeType: "tenant",
    });

    expect(preview.approvalAuthorityGranted).toBe(true);
  });

  it("does not grant collections reps cash application approval by default", () => {
    const service = createService();
    const admin = service.getPrincipalForUser("user_platform_admin");
    const collectionsRep = service.getPrincipalForUser("user_collections_rep");

    const preview = service.previewUserEffectiveAccess(admin, {
      userId: collectionsRep.id,
      permissionKey: "cash_application.approve",
      scopeType: "team",
      scopeId: "team_ncr",
    });

    expect(preview.permissionGranted).toHaveLength(0);
  });

  it("writes audit events for user and role admin changes", () => {
    const service = createService();
    const admin = service.getPrincipalForUser("user_platform_admin");
    const created = service.inviteUser(admin, {
      email: "new.rep@yield.example",
      fullName: "New Rep",
      roleKey: "ar_rep",
      scopeType: "billing_account",
      scopeId: "billing_seed_2",
    });

    service.setApprovalAuthority(admin, {
      userId: created.id,
      approvalType: "outreach_exception",
      scopeType: "billing_account",
      scopeId: "billing_seed_2",
    });

    expect(service.listAuditEvents(admin).map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "access_control.user.invited",
        "access_control.assignment.granted",
        "access_control.approval_authority.granted",
      ]),
    );
  });
});
