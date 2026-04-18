import type { Task } from "@o2c/domain";

const seedActor = {
  actorId: "seed_system",
  actorRole: "system" as const,
};

export function buildSeedTasks(): Task[] {
  const openCollections = makeTask({
    id: "task_seed_collections_open",
    title: "Send remittance follow-up for March aging bucket",
    description: "Collections needs a reviewed outreach draft before the next reminder window opens.",
    kind: "collections_follow_up",
    origin: "workflow_generated",
    surfaces: ["home", "collections", "customers"],
    customerProfileId: "customer_seed_collections",
    billingAccountId: "billing_seed_1",
    dueAt: "2026-04-09T02:00:00.000Z",
    sourceLinks: [
      {
        label: "Customer profile",
        objectType: "customer_profile",
        objectId: "customer_seed_collections",
        href: "/customers/customer_seed_collections",
      },
      {
        label: "Invoice INV-SEED-1001",
        objectType: "invoice",
        objectId: "invoice_seed_1",
        href: "/collections/invoices/invoice_seed_1",
      },
    ],
    occurredAt: "2026-04-08T00:00:00.000Z",
    metadata: {
      scenario: "collections",
      queue: "aging_follow_up",
    },
  });

  const openCashApp = makeTask({
    id: "task_seed_cash_app_open",
    title: "Review ambiguous cash application before ERP writeback",
    description: "The payment matched multiple invoices and needs a collector decision.",
    kind: "cash_application_review",
    origin: "system_generated",
    surfaces: ["home", "cash_app"],
    customerProfileId: "customer_seed_cash",
    billingAccountId: "bill-dist-1",
    dueAt: "2026-04-09T04:00:00.000Z",
    sourceLinks: [
      {
        label: "Payment PAY-DIST-1",
        objectType: "payment",
        objectId: "pay-dist-1",
        href: "/cash-app/payments/pay-dist-1",
      },
      {
        label: "Invoice INV-DIST-1",
        objectType: "invoice",
        objectId: "inv-dist-1",
        href: "/cash-app/invoices/inv-dist-1",
      },
    ],
    occurredAt: "2026-04-08T00:05:00.000Z",
    metadata: {
      scenario: "cash_app",
      confidenceBand: "medium",
    },
  });

  const openDeductions = makeTask({
    id: "task_seed_deductions_open",
    title: "Investigate short-pay deduction on proof-backed invoice",
    description: "AI flagged a likely trade deduction, but the reason needs operator confirmation.",
    kind: "deduction_investigation",
    origin: "ai_generated",
    surfaces: ["home", "deductions"],
    customerProfileId: "customer_seed_deductions",
    billingAccountId: "bill-import-1",
    dueAt: "2026-04-09T06:00:00.000Z",
    sourceLinks: [
      {
        label: "Exception EXC-SHORT-1",
        objectType: "exception",
        objectId: "exception_short_pay_seed_1",
        href: "/deductions/exceptions/exception_short_pay_seed_1",
      },
      {
        label: "Payment PAY-IMPORT-1",
        objectType: "payment",
        objectId: "pay-import-1",
        href: "/deductions/payments/pay-import-1",
      },
    ],
    occurredAt: "2026-04-08T00:10:00.000Z",
    metadata: {
      scenario: "deductions",
      aiReason: "Short payment reason inferred from remittance text.",
    },
  });

  const openCreditLine = makeTask({
    id: "task_seed_credit_line_open",
    title: "Review org credit line exposure before releasing strategic outreach",
    description: "Credit controls must confirm the org-level exposure before collection messaging resumes.",
    kind: "org_credit_line_review",
    origin: "workflow_generated",
    surfaces: ["home", "org_credit_line", "customers"],
    customerProfileId: "customer_seed_credit",
    billingAccountId: "bill-manu-1",
    dueAt: "2026-04-09T08:00:00.000Z",
    sourceLinks: [
      {
        label: "Billing account",
        objectType: "billing_account",
        objectId: "bill-manu-1",
        href: "/org-credit-line/demo/accounts/bill-manu-1",
      },
      {
        label: "Approval request",
        objectType: "approval_request",
        objectId: "approval_seed_credit_1",
        href: "/approvals/approval_seed_credit_1",
      },
    ],
    occurredAt: "2026-04-08T00:15:00.000Z",
    metadata: {
      scenario: "org_credit_line",
      exposureBand: "high",
    },
  });

  const completedCustomerTask = withStatus(
    makeTask({
      id: "task_seed_customers_completed",
      title: "Confirm verified AP contact routing",
      kind: "contact_routing_review",
      origin: "manual",
      surfaces: ["home", "customers"],
      customerProfileId: "customer_seed_collections",
      billingAccountId: "billing_seed_1",
      sourceLinks: [
        {
          label: "Customer profile",
          objectType: "customer_profile",
          objectId: "customer_seed_collections",
          href: "/customers/customer_seed_collections",
        },
      ],
      occurredAt: "2026-04-07T21:00:00.000Z",
      metadata: {
        scenario: "customers",
      },
    }),
    "completed",
    "2026-04-07T22:00:00.000Z",
    "Primary AP contact verified and linked.",
  );

  const closedCollectionsTask = withStatus(
    withStatus(
      makeTask({
        id: "task_seed_collections_closed",
        title: "Close duplicate statement resend task",
        kind: "statement_resend_cleanup",
        origin: "system_generated",
        surfaces: ["home", "collections"],
        customerProfileId: "customer_seed_collections",
        billingAccountId: "billing_seed_1",
        sourceLinks: [
          {
            label: "Communication thread",
            objectType: "communication_thread",
            objectId: "thread_seed_1",
            href: "/collections/threads/thread_seed_1",
          },
        ],
        occurredAt: "2026-04-07T18:00:00.000Z",
        metadata: {
          scenario: "collections",
        },
      }),
      "completed",
      "2026-04-07T19:00:00.000Z",
      "Task work completed before closure.",
    ),
    "closed",
    "2026-04-07T20:00:00.000Z",
    "Duplicate resend task closed after thread consolidation.",
  );

  const dismissedCashTask = withStatus(
    makeTask({
      id: "task_seed_cash_app_dismissed",
      title: "AI-suggested split allocation no longer needed",
      kind: "cash_split_suggestion",
      origin: "ai_generated",
      surfaces: ["home", "cash_app"],
      customerProfileId: "customer_seed_cash",
      billingAccountId: "bill-dist-1",
      sourceLinks: [
        {
          label: "Payment PAY-DIST-1",
          objectType: "payment",
          objectId: "pay-dist-1",
          href: "/cash-app/payments/pay-dist-1",
        },
      ],
      occurredAt: "2026-04-07T16:00:00.000Z",
      metadata: {
        scenario: "cash_app",
      },
    }),
    "dismissed",
    "2026-04-07T17:00:00.000Z",
    "Collector resolved the payment through a different workflow path.",
  );

  return [
    openCollections,
    openCashApp,
    openDeductions,
    openCreditLine,
    completedCustomerTask,
    closedCollectionsTask,
    dismissedCashTask,
  ];
}

function makeTask(
  input: Omit<Task, "status" | "auditTrail" | "tenantId" | "version" | "createdAt" | "updatedAt" | "createdByActorId" | "createdByActorRole" | "updatedByActorId" | "updatedByActorRole"> & {
    occurredAt: string;
  },
): Task {
  return {
    id: input.id,
    tenantId: "default",
    version: 1,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
    createdByActorId: seedActor.actorId,
    createdByActorRole: seedActor.actorRole,
    updatedByActorId: seedActor.actorId,
    updatedByActorRole: seedActor.actorRole,
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    kind: input.kind,
    status: "open",
    origin: input.origin,
    surfaces: input.surfaces,
    ...(input.customerProfileId ? { customerProfileId: input.customerProfileId } : {}),
    ...(input.billingAccountId ? { billingAccountId: input.billingAccountId } : {}),
    ...(input.ownerId ? { ownerId: input.ownerId } : {}),
    ...(input.ownerRole ? { ownerRole: input.ownerRole } : {}),
    ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    sourceLinks: input.sourceLinks,
    auditTrail: [
      {
        occurredAt: input.occurredAt,
        action: "task.created",
        actorId: seedActor.actorId,
        actorRole: seedActor.actorRole,
        summary: `Task created in ${input.surfaces.join(", ")}.`,
      },
    ],
    metadata: input.metadata,
  };
}

function withStatus(
  task: Task,
  status: Task["status"],
  occurredAt: string,
  summary: string,
): Task {
  return {
    ...task,
    version: (task.version ?? 1) + 1,
    updatedAt: occurredAt,
    updatedByActorId: seedActor.actorId,
    updatedByActorRole: seedActor.actorRole,
    status,
    ...(status === "completed" ? { completedAt: occurredAt } : {}),
    ...(status === "closed" ? { closedAt: occurredAt } : {}),
    ...(status === "dismissed" ? { dismissedAt: occurredAt } : {}),
    auditTrail: [
      ...task.auditTrail,
      {
        occurredAt,
        action: `task.${status}`,
        actorId: seedActor.actorId,
        actorRole: seedActor.actorRole,
        summary,
      },
    ],
  };
}
