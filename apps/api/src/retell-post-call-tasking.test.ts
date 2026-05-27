import { describe, expect, it, vi } from "vitest";
import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import { InMemoryTaskRepository, TaskWorkflowService } from "@o2c/workflows";
import { RetellPreCallOrchestrationService } from "./modules/retell/service.js";

describe("Retell post-call task creation", () => {
  it("creates a dispute review task and emits an audit log entry", async () => {
    const activityStore = new InMemoryImmutableActivityLogStore();
    const taskService = new TaskWorkflowService({
      repository: new InMemoryTaskRepository(),
      now: () => "2026-05-07T02:00:00.000Z",
      idGenerator: (prefix) => `${prefix}_1`
    });
    const service = new RetellPreCallOrchestrationService({
      activityStore,
      retellClient: {} as never,
      taskService,
      config: {
        tenantId: "tenant_1"
      },
      now: () => "2026-05-07T02:00:00.000Z",
      idGenerator: () => "activity_1"
    });

    const result = await service.recordPostCallOutcome({
      principal: {
        id: "api-test",
        roles: ["ar_collector"]
      },
      billingAccountId: "billing_1",
      parentAccountId: "parent_1",
      branchId: "branch_1",
      contactId: "contact_1",
      communicationAttemptId: "attempt_1",
      providerCallId: "call_1",
      preCallPlanId: "plan_1",
      occurredAt: "2026-05-07T02:00:00.000Z",
      disposition: "connected",
      transcriptSummary: "Customer disputed invoice INV-1001 and asked for review.",
      dispute: {
        invoiceIds: ["inv_1"],
        disputeType: "billing",
        summary: "Customer disputed the invoice amount."
      }
    });

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]).toMatchObject({
      taskType: "invoice_dispute_review",
      billingAccountId: "billing_1",
      contactId: "contact_1",
      branchId: "branch_1",
      source: "retell_call",
      callId: "call_1",
      planId: "plan_1",
      linkedInvoiceIds: ["inv_1"],
      requiresHumanReview: true,
      status: "open"
    });

    const savedTasks = await taskService.list({ billingAccountId: "billing_1" });
    expect(savedTasks).toHaveLength(1);
    expect(savedTasks[0]).toMatchObject({
      kind: "invoice_dispute_review",
      taskType: "invoice_dispute_review",
      source: "retell_call",
      summary:
        "Customer raised a dispute that requires invoice-scope review before further collections activity."
    });

    expect(result.activityEntries.map((entry) => entry.action)).toContain(
      "collections.voice.post_call.task_created"
    );
  });

  it("does not create a duplicate task when the same outcome is replayed", async () => {
    const activityStore = new InMemoryImmutableActivityLogStore();
    const taskService = new TaskWorkflowService({
      repository: new InMemoryTaskRepository(),
      now: () => "2026-05-07T03:00:00.000Z",
      idGenerator: (prefix) => `${prefix}_${Math.random().toString(16).slice(2)}`
    });
    const service = new RetellPreCallOrchestrationService({
      activityStore,
      retellClient: {} as never,
      taskService,
      config: {
        tenantId: "tenant_1"
      },
      now: () => "2026-05-07T03:00:00.000Z",
      idGenerator: () => `activity_${Math.random().toString(16).slice(2)}`
    });

    const input = {
      principal: {
        id: "api-test",
        roles: ["ar_collector"] as const
      },
      billingAccountId: "billing_1",
      communicationAttemptId: "attempt_same",
      disposition: "callback_requested",
      callback: {
        dueAt: "2026-05-08T01:00:00.000Z",
        timezone: "Asia/Manila"
      }
    };

    const first = await service.recordPostCallOutcome(input);
    const second = await service.recordPostCallOutcome(input);

    expect(first.tasks).toHaveLength(1);
    expect(second.tasks).toHaveLength(0);
    expect(await taskService.list({ billingAccountId: "billing_1" })).toHaveLength(1);
  });

  it("creates promise and support follow-up tasks from post-call outcomes", async () => {
    const activityStore = new InMemoryImmutableActivityLogStore();
    let taskSequence = 0;
    const taskService = new TaskWorkflowService({
      repository: new InMemoryTaskRepository(),
      now: () => "2026-05-07T03:30:00.000Z",
      idGenerator: (prefix) => `${prefix}_${++taskSequence}`
    });
    const service = new RetellPreCallOrchestrationService({
      activityStore,
      retellClient: {} as never,
      taskService,
      config: {
        tenantId: "tenant_1"
      },
      now: () => "2026-05-07T03:30:00.000Z",
      idGenerator: () => "activity_promise_support"
    });

    const result = await service.recordPostCallOutcome({
      principal: {
        id: "api-test",
        roles: ["ar_collector"]
      },
      billingAccountId: "billing_1",
      parentAccountId: "parent_1",
      branchId: "branch_1",
      contactId: "contact_1",
      communicationAttemptId: "attempt_promise_support",
      providerCallId: "call_1",
      preCallPlanId: "plan_1",
      disposition: "connected",
      transcriptSummary: "Customer promised to pay and requested proof of delivery.",
      promiseUpdate: {
        invoiceIds: ["inv_1"],
        status: "new",
        promisedDate: "2026-05-10",
        promisedAmountCents: 125_000,
        currency: "PHP"
      },
      followUpActions: [
        {
          title: "Send proof of delivery",
          description: "Customer asked support to send proof of delivery before payment.",
          dueAt: "2026-05-08T02:00:00.000Z",
          requiresHumanReview: true,
          metadata: {
            invoiceIds: ["inv_1"],
            category: "support_request"
          }
        }
      ]
    });

    expect(result.tasks.map((task) => task.taskType)).toEqual(
      expect.arrayContaining(["follow_up_promise_to_pay", "support_request_follow_up"])
    );
    const savedTasks = await taskService.list({ billingAccountId: "billing_1" });
    expect(savedTasks.map((task) => task.kind)).toEqual(
      expect.arrayContaining(["follow_up_promise_to_pay", "support_request_follow_up"])
    );
    expect(savedTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          callId: "call_1",
          contactId: "contact_1",
          branchId: "branch_1",
          linkedInvoiceIds: ["inv_1"]
        })
      ])
    );
  });

  it("does not load full historical activity for non-broken-promise outcomes", async () => {
    const list = vi.fn(() => {
      throw new Error("history should not be loaded for this outcome");
    });
    const activityStore = {
      append: vi.fn(),
      list
    };
    const taskService = new TaskWorkflowService({
      repository: new InMemoryTaskRepository(),
      now: () => "2026-05-07T04:00:00.000Z",
      idGenerator: (prefix) => `${prefix}_history_guard`
    });
    const service = new RetellPreCallOrchestrationService({
      activityStore,
      retellClient: {} as never,
      taskService,
      config: {
        tenantId: "tenant_1"
      },
      now: () => "2026-05-07T04:00:00.000Z",
      idGenerator: () => "activity_history_guard"
    });

    const result = await service.recordPostCallOutcome({
      principal: {
        id: "api-test",
        roles: ["ar_collector"]
      },
      billingAccountId: "billing_1",
      communicationAttemptId: "attempt_history_guard",
      occurredAt: "2026-05-07T04:00:00.000Z",
      disposition: "connected",
      dispute: {
        invoiceIds: ["inv_1"],
        disputeType: "billing",
        summary: "Customer disputed the invoice amount."
      }
    });

    expect(result.status).toBe("recorded");
    expect(result.tasks).toHaveLength(1);
    expect(list).not.toHaveBeenCalled();
  });

  it("loads only broken-promise history when escalation evaluation is relevant", async () => {
    const list = vi.fn(() => []);
    const activityStore = {
      append: vi.fn(),
      list
    };
    const taskService = new TaskWorkflowService({
      repository: new InMemoryTaskRepository(),
      now: () => "2026-05-07T05:00:00.000Z",
      idGenerator: (prefix) => `${prefix}_broken_history`
    });
    const service = new RetellPreCallOrchestrationService({
      activityStore,
      retellClient: {} as never,
      taskService,
      config: {
        tenantId: "tenant_1"
      },
      now: () => "2026-05-07T05:00:00.000Z",
      idGenerator: () => "activity_broken_history",
      repeatedBrokenPromiseWindowDays: 30
    });

    await service.recordPostCallOutcome({
      principal: {
        id: "api-test",
        roles: ["ar_collector"]
      },
      billingAccountId: "billing_1",
      communicationAttemptId: "attempt_broken_history",
      occurredAt: "2026-05-07T05:00:00.000Z",
      disposition: "connected",
      promiseUpdate: {
        promiseToPayId: "ptp_1",
        invoiceIds: ["inv_1"],
        status: "broken"
      }
    });

    expect(list).toHaveBeenCalledWith({
      entityType: "billing_account",
      entityId: "billing_1",
      actions: ["collections.voice.post_call.promise_update"],
      occurredAtFrom: "2026-04-07T05:00:00.000Z"
    });
  });
});
