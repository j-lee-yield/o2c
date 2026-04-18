import { describe, expect, it } from "vitest";

import {
  AuthorizationError,
  buildPermissionGuard,
  hasPermission,
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
});
