import { describe, expect, it, vi } from "vitest";

import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import type { Principal } from "@o2c/auth";

import {
  ApprovalQueueWorkflowService,
  InMemoryApprovalRequestRepository,
} from "./approvals-queue.js";

function createService() {
  return new ApprovalQueueWorkflowService({
    repository: new InMemoryApprovalRequestRepository(),
    activityStore: new InMemoryImmutableActivityLogStore(),
    now: () => "2026-03-26T00:00:00.000Z",
    idGenerator: (prefix) => `${prefix}_1`,
  });
}

describe("ApprovalQueueWorkflowService", () => {
  it("shows collectors only their own approvals but reviewers can see the full queue", async () => {
    const service = createService();
    const firstCollector: Principal = { id: "collector_1", roles: ["ar_collector"] };
    const secondCollector: Principal = { id: "collector_2", roles: ["ar_collector"] };
    const manager: Principal = { id: "manager_1", roles: ["ar_manager"] };

    await service.createAndSubmit(firstCollector, {
      requestType: "collections_outreach_review",
      payload: { summary: "Collector one request." },
      assigneeRole: "ar_manager",
      policyContext: { reasonCodes: ["recipient_confidence_low"] },
    });

    expect(await service.listQueue(firstCollector)).toHaveLength(1);
    expect(await service.listQueue(secondCollector)).toHaveLength(0);
    expect(await service.listQueue(manager)).toHaveLength(1);
  });

  it("fires edit, reject, and approve hooks during the queue flow", async () => {
    const service = createService();
    const collector: Principal = { id: "collector_1", roles: ["ar_collector"] };
    const manager: Principal = { id: "manager_1", roles: ["ar_manager"] };
    const editedHook = vi.fn();
    const rejectedHook = vi.fn();
    const approvedHook = vi.fn();

    const created = await service.createAndSubmit(collector, {
      requestType: "collections_outreach_review",
      payload: { summary: "Need review." },
      assigneeRole: "ar_manager",
      policyContext: { reasonCodes: ["first_outbound_new_account"] },
    });

    const rejected = await service.reject(manager, created.id, {
      onRejected: rejectedHook,
    });
    const reopened = await service.editRequest(collector, {
      approvalId: rejected.id,
      payload: { summary: "Updated review details." },
      resubmit: true,
    }, {
      onEdited: editedHook,
    });
    const approved = await service.approve(manager, reopened.id, {
      onApproved: approvedHook,
    });

    expect(rejectedHook).toHaveBeenCalledOnce();
    expect(editedHook).toHaveBeenCalledOnce();
    expect(approvedHook).toHaveBeenCalledOnce();
    expect(approved.status).toBe("approved");
  });

  it("emits approval learning events through the configured sink", async () => {
    const events: string[] = [];
    const service = new ApprovalQueueWorkflowService({
      repository: new InMemoryApprovalRequestRepository(),
      activityStore: new InMemoryImmutableActivityLogStore(),
      learningEventSink: (event) => {
        events.push(event.eventType);
      },
      now: () => "2026-03-26T00:00:00.000Z",
      idGenerator: (prefix) => `${prefix}_1`,
    });
    const collector: Principal = { id: "collector_1", roles: ["ar_collector"] };
    const manager: Principal = { id: "manager_1", roles: ["ar_manager"] };

    const created = await service.createAndSubmit(collector, {
      requestType: "collections_outreach_review",
      payload: { summary: "Need review.", billingAccountId: "billing-1", invoiceIds: ["inv-1"] },
      assigneeRole: "ar_manager",
    });
    await service.reject(manager, created.id);
    const reopened = await service.editRequest(
      collector,
      {
        approvalId: created.id,
        payload: { summary: "Updated review.", billingAccountId: "billing-1", invoiceIds: ["inv-1"] },
        resubmit: true,
      },
    );
    await service.approve(manager, reopened.id);

    expect(events).toContain("approval_requested");
    expect(events).toContain("approval_rejected");
    expect(events).toContain("approval_approved");
  });
});
