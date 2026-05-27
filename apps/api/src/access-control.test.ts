import { afterAll, describe, expect, it } from "vitest";
import { buildApiApp } from "./app.js";

const app = buildApiApp();

afterAll(async () => {
  await app.close();
});

describe("access control admin API", () => {
  it("allows tenant admins to list users and denies scoped reps", async () => {
    const adminResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      headers: {
        "x-principal-id": "user_platform_admin",
      },
    });

    expect(adminResponse.statusCode).toBe(200);
    expect(adminResponse.json().users.length).toBeGreaterThan(0);

    const repResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      headers: {
        "x-principal-id": "user_ar_rep",
      },
    });

    expect(repResponse.statusCode).toBe(403);
  });

  it("supports user invite, role assignment, and access preview", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/admin/users",
      headers: {
        "x-principal-id": "user_platform_admin",
      },
      payload: {
        email: "ops.new@yield.example",
        fullName: "Ops New",
        roleKey: "collections_rep",
        scopeType: "team",
        scopeId: "team_vismin",
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();
    expect(created.assignments[0]?.scopeType).toBe("team");

    const previewResponse = await app.inject({
      method: "POST",
      url: "/v1/admin/access-preview",
      headers: {
        "x-principal-id": "user_platform_admin",
      },
      payload: {
        userId: created.id,
        permissionKey: "collections.outreach.send",
        scopeType: "team",
        scopeId: "team_vismin",
      },
    });

    expect(previewResponse.statusCode).toBe(200);
    expect(previewResponse.json().permissionGranted).toHaveLength(1);
  });
});
