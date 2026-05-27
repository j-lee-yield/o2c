import { describe, expect, it } from "vitest";
import { createTask, filterTasks, transitionTaskStatus } from "./service.js";

const actor = {
  actorId: "collector-1",
  actorRole: "user" as const,
};

describe("task service", () => {
  it("creates source-linked tasks with an audit entry", () => {
    const task = createTask({
      id: "task-1",
      title: "Review short-paid remittance",
      kind: "deduction_review",
      origin: "workflow_generated",
      surfaces: ["home", "deductions"],
      customerProfileId: "customer-1",
      sourceLinks: [
        {
          label: "Invoice INV-1",
          objectType: "invoice",
          objectId: "inv-1",
          href: "/customers/customer-1/invoices/inv-1",
        },
      ],
      occurredAt: "2026-04-08T00:00:00.000Z",
      actor,
    });

    expect(task.status).toBe("open");
    expect(task.surfaces).toEqual(["home", "deductions"]);
    expect(task.sourceLinks).toHaveLength(1);
    expect(task.auditTrail[0]?.action).toBe("task.created");
  });

  it("archives completed tasks with an audit entry", () => {
    const created = createTask({
      id: "task-2",
      title: "Resolve cash application ambiguity",
      kind: "cash_review",
      origin: "system_generated",
      surfaces: ["home", "cash_app"],
      sourceLinks: [{ label: "Payment PAY-1", objectType: "payment", objectId: "pay-1" }],
      occurredAt: "2026-04-08T00:00:00.000Z",
      actor,
    });

    const completed = transitionTaskStatus({
      task: created,
      nextStatus: "completed",
      occurredAt: "2026-04-08T01:00:00.000Z",
      actor,
    });

    expect(completed.completedAt).toBe("2026-04-08T01:00:00.000Z");
    expect(completed.archivedAt).toBe("2026-04-08T01:00:00.000Z");
    expect(completed.auditTrail.map((entry) => entry.action)).toEqual([
      "task.created",
      "task.completed",
      "task.archived",
    ]);
  });

  it("soft-deletes tasks without destroying audit history", () => {
    const created = createTask({
      id: "task-2-delete",
      title: "Resolve duplicate follow-up",
      kind: "collections_follow_up",
      origin: "manual",
      surfaces: ["home", "collections"],
      sourceLinks: [{ label: "Invoice INV-2", objectType: "invoice", objectId: "inv-2" }],
      occurredAt: "2026-04-08T00:00:00.000Z",
      actor,
    });

    const deleted = transitionTaskStatus({
      task: created,
      nextStatus: "deleted",
      occurredAt: "2026-04-08T02:00:00.000Z",
      actor,
    });

    expect(deleted.status).toBe("deleted");
    expect(deleted.deletedAt).toBe("2026-04-08T02:00:00.000Z");
    expect(deleted.auditTrail.map((entry) => entry.action)).toEqual([
      "task.created",
      "task.deleted",
    ]);
  });

  it("filters by customer, status, and surface", () => {
    const tasks = [
      createTask({
        id: "task-3",
        title: "Open collections task",
        kind: "collections_follow_up",
        origin: "manual",
        surfaces: ["home", "collections"],
        customerProfileId: "customer-a",
        sourceLinks: [{ label: "Invoice", objectType: "invoice", objectId: "inv-a" }],
        occurredAt: "2026-04-08T00:00:00.000Z",
        actor,
      }),
      transitionTaskStatus({
        task: createTask({
          id: "task-4",
          title: "Completed customer task",
          kind: "customer_review",
          origin: "ai_generated",
          surfaces: ["home", "customers"],
          customerProfileId: "customer-a",
          sourceLinks: [{ label: "Profile", objectType: "customer_profile", objectId: "customer-a" }],
          occurredAt: "2026-04-08T00:00:00.000Z",
          actor,
        }),
        nextStatus: "completed",
        occurredAt: "2026-04-08T01:00:00.000Z",
        actor,
      }),
    ];

    expect(filterTasks(tasks, { customerProfileId: "customer-a", surface: "customers" })).toHaveLength(1);
    expect(filterTasks(tasks, { status: "open", surface: "collections" })).toHaveLength(1);
    expect(filterTasks(tasks, { status: "deleted" })).toHaveLength(0);
  });

  it("filters by kind, priority, and searchable task context", () => {
    const tasks = [
      createTask({
        id: "task-5",
        title: "Verify remittance evidence",
        kind: "payment_collection_follow_up",
        origin: "workflow_generated",
        surfaces: ["home", "collections"],
        customerProfileId: "customer-medical",
        billingAccountId: "billing-medical",
        linkedInvoiceIds: ["MCC-OD-001"],
        priority: "high",
        summary: "Customer said payment was already made.",
        sourceLinks: [
          {
            label: "Invoice MCC-OD-001",
            objectType: "invoice",
            objectId: "invoice-mcc-od-001",
          },
        ],
        occurredAt: "2026-04-08T00:00:00.000Z",
        actor,
        metadata: {
          customerName: "Medical Clinic Corp",
          providerCallId: "F5184D12",
        },
      }),
      createTask({
        id: "task-6",
        title: "Review disputed deduction",
        kind: "invoice_dispute_review",
        origin: "workflow_generated",
        surfaces: ["home", "deductions"],
        customerProfileId: "customer-retail",
        priority: "medium",
        sourceLinks: [{ label: "Deduction", objectType: "deduction", objectId: "deduction-1" }],
        occurredAt: "2026-04-08T00:00:00.000Z",
        actor,
      }),
    ];

    expect(filterTasks(tasks, {
      kind: "payment_collection_follow_up",
      priority: "high",
      q: "medical mcc-od-001",
    }).map((task) => task.id)).toEqual(["task-5"]);
    expect(filterTasks(tasks, { kind: "payment_collection_follow_up", priority: "medium" })).toHaveLength(0);
  });
});
