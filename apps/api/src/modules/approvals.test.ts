import { afterAll, describe, expect, it } from "vitest";

import { buildApiApp } from "../app.js";

const app = buildApiApp();

afterAll(async () => {
  await app.close();
});

describe("approval queue API", () => {
  it("creates, lists, edits, and approves approval requests with role enforcement", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/approvals/requests",
      headers: {
        "x-principal-id": "collector_1",
        "x-principal-roles": "ar_collector",
      },
      payload: {
        requestType: "collections_outreach_review",
        assigneeRole: "controller",
        payload: { summary: "Strategic account reminder." },
        policyContext: {
          reasonCodes: ["strategic_or_vip_account"],
        },
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();

    const collectorQueue = await app.inject({
      method: "GET",
      url: "/v1/approvals/queue",
      headers: {
        "x-principal-id": "collector_1",
        "x-principal-roles": "ar_collector",
      },
    });

    expect(collectorQueue.statusCode).toBe(200);
    expect(
      collectorQueue.json().items.some((item: { approvalId: string }) => item.approvalId === created.id)
    ).toBe(true);

    const managerApprove = await app.inject({
      method: "POST",
      url: `/v1/approvals/${created.id}/approve`,
      headers: {
        "x-principal-id": "manager_1",
        "x-principal-roles": "ar_manager",
      },
    });

    expect(managerApprove.statusCode).toBe(409);

    const edited = await app.inject({
      method: "POST",
      url: `/v1/approvals/${created.id}/edit`,
      headers: {
        "x-principal-id": "collector_1",
        "x-principal-roles": "ar_collector",
      },
      payload: {
        payload: { summary: "Updated strategic reminder." },
        resubmit: true,
      },
    });

    expect(edited.statusCode).toBe(200);
    expect(edited.json().status).toBe("pending_approval");

    const controllerApprove = await app.inject({
      method: "POST",
      url: `/v1/approvals/${created.id}/approve`,
      headers: {
        "x-principal-id": "controller_1",
        "x-principal-roles": "controller",
      },
    });

    expect(controllerApprove.statusCode).toBe(200);
    expect(controllerApprove.json().status).toBe("approved");
  });
});
