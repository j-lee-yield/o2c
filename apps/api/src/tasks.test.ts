import { afterAll, describe, expect, it } from "vitest";
import { buildApiApp } from "./app.js";

const app = buildApiApp();

afterAll(async () => {
  await app.close();
});

describe("task APIs", () => {
  it("lists seeded tasks globally with surface filtering", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/tasks?surface=deductions&status=open",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((task: { surfaces: string[]; status: string }) =>
      task.surfaces.includes("deductions") && task.status === "open")).toBe(true);
  });

  it("creates a manual task and exposes it on the per-customer endpoint", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/tasks",
      headers: {
        "x-principal-id": "collector-api",
        "x-principal-roles": "ar_collector",
      },
      payload: {
        id: "task_api_manual_customer_1",
        title: "Call AP contact for branch remittance confirmation",
        kind: "customer_outreach",
        origin: "manual",
        surfaces: ["home", "customers", "collections"],
        customerProfileId: "customer-api-task-1",
        sourceLinks: [
          {
            label: "Customer profile",
            objectType: "customer_profile",
            objectId: "customer-api-task-1",
            href: "/customers/customer-api-task-1",
          },
        ],
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json().status).toBe("open");

    const customerResponse = await app.inject({
      method: "GET",
      url: "/v1/customer_profiles/customer-api-task-1/tasks",
    });

    expect(customerResponse.statusCode).toBe(200);
    expect(customerResponse.json().items.some((task: { id: string }) => task.id === "task_api_manual_customer_1")).toBe(true);
  });

  it("blocks collectors from creating org credit line workflow tasks", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/tasks",
      headers: {
        "x-principal-id": "collector-api",
        "x-principal-roles": "ar_collector",
      },
      payload: {
        id: "task_api_credit_line_forbidden",
        title: "Review org credit line stub",
        kind: "org_credit_line_review",
        origin: "workflow_generated",
        surfaces: ["home", "org_credit_line"],
        sourceLinks: [
          {
            label: "Stub screen",
            objectType: "screen",
            objectId: "org-credit-line-demo",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("updates task status using the first-class task endpoint", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/tasks",
      headers: {
        "x-principal-id": "manager-api",
        "x-principal-roles": "ar_manager",
      },
      payload: {
        id: "task_api_status_1",
        title: "Review org credit line freeze",
        kind: "credit_hold_review",
        origin: "workflow_generated",
        surfaces: ["home", "org_credit_line"],
        customerProfileId: "customer-api-credit-1",
        sourceLinks: [
          {
            label: "Billing account",
            objectType: "billing_account",
            objectId: "billing-api-credit-1",
          },
        ],
      },
    });

    const updateResponse = await app.inject({
      method: "POST",
      url: "/v1/tasks/task_api_status_1/status",
      headers: {
        "x-principal-id": "manager-api",
        "x-principal-roles": "ar_manager",
      },
      payload: {
        status: "completed",
        summary: "Credit review finished and the hold was released.",
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().status).toBe("completed");

    const getResponse = await app.inject({
      method: "GET",
      url: "/v1/tasks/task_api_status_1",
    });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json().auditTrail.at(-1).action).toBe("task.completed");
  });
});
