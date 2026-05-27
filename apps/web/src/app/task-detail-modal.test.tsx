import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dashboard } from "./dashboard.js";
import { loadOperatorConsoleData, type OperatorConsoleData, type TaskQueueItem } from "./data.js";

const now = "2026-05-08T05:00:00.000Z";

function buildEmailFollowUpTask(id = "task_email_follow_up_1"): TaskQueueItem {
  const account: NonNullable<TaskQueueItem["composeEmail"]>["account"] = {
    id: "billing_task_email_1",
    createdAt: now,
    updatedAt: now,
    parentAccountId: "parent_task_email_1",
    branchId: "branch_makati",
    accountNumber: "BA-EMAIL-1",
    displayName: "Metro Retail - Makati",
    currency: "PHP",
    accountTier: "strategic",
    status: "active",
    centrallyPaid: false,
    metadata: {},
  };
  const contact: NonNullable<TaskQueueItem["composeEmail"]>["contact"] = {
    id: "contact_task_email_1",
    createdAt: now,
    updatedAt: now,
    parentAccountId: account.parentAccountId,
    billingAccountId: account.id,
    branchId: "branch_makati",
    scope: "billing_account",
    scopeId: account.id,
    fullName: "Maria Santos",
    email: "maria@example.test",
    role: "ap",
    isPrimary: true,
    isVerified: true,
    allowAutoSend: true,
    recentSuccessfulResponses: 3,
    metadata: {},
  };
  const invoices: NonNullable<TaskQueueItem["composeEmail"]>["invoices"] = [
    {
      id: "invoice_task_email_1",
      createdAt: now,
      updatedAt: now,
      state: "synced_open",
      parentAccountId: account.parentAccountId,
      billingAccountId: account.id,
      branchId: "branch_makati",
      invoiceNumber: "INV-EMAIL-001",
      currency: "PHP",
      amountCents: 200_000,
      dueDate: "2026-05-01",
      metadata: {},
    },
    {
      id: "invoice_task_email_2",
      createdAt: now,
      updatedAt: now,
      state: "synced_open",
      parentAccountId: account.parentAccountId,
      billingAccountId: account.id,
      branchId: "branch_makati",
      invoiceNumber: "INV-EMAIL-002",
      currency: "PHP",
      amountCents: 100_000,
      dueDate: "2026-05-16",
      metadata: {},
    },
  ];

  return {
    id,
    taskCode: "TASK-EMAIL-1",
    title: "Send email follow-up",
    relatedRecord: "INV-EMAIL-001, INV-EMAIL-002",
    amountLabel: "PHP 3,000.00",
    type: "collection",
    customerName: "Metro Retail - Makati",
    status: "open",
    priority: "high",
    assigneeName: "Ari Reyes",
    assigneeInitials: "AR",
    createdLabel: "May 8, 2026, 01:00 PM",
    dueDateLabel: "May 17, 2026, 9:00 AM",
    actionPath: `/tasks#task-detail-${id}`,
    brief: "Customer asked for invoice copies and has not replied to the last reminder.",
    ownerTeam: "Collections",
    openInvoiceCount: 2,
    balanceLabel: "PHP 3,000.00",
    overdueLabel: "PHP 2,000.00",
    invoiceContextLabel: "INV-EMAIL-001, INV-EMAIL-002",
    invoiceContextDetail:
      "INV-EMAIL-001: PHP 2,000.00 due May 1, 2026; INV-EMAIL-002: PHP 1,000.00 due May 16, 2026",
    callContextLabel: "Retell call ABC12345",
    callContextHref: "/collections?tab=call-inbox#call-detail-call_abc12345",
    callContextDetail: "Metro Retail - Makati · May 8, 2026, 12:45 PM · Customer asked for invoice copies.",
    recommendedNextAction: "Send the invoice copies and monitor for reply.",
    transcriptSnippet: "Customer asked for invoice copies so AP can route payment.",
    replyAgingLabel: "4 days without reply",
    composeEmail: {
      account,
      contact,
      invoices,
      draft: {
        subjectLine: "AI draft subject for Metro Retail",
        body: "Hi Maria,\n\nAI generated body with invoice context.\n\nThanks,",
        generatedBy: "llm",
        note: "AI generated a concise collections follow-up.",
      },
      threadMessages: [
        {
          id: "thread_task_email_1",
          fromEmail: "maria@example.test",
          fromName: "Maria Santos",
          snippet: "Please resend the invoices so we can route payment.",
          receivedAt: "4 days ago",
        },
      ],
      openTaskCount: 2,
    },
  };
}

function buildManualTask(id = "task_manual_review_1"): TaskQueueItem {
  return {
    id,
    taskCode: "TASK-MANUAL-1",
    title: "Review customer dispute",
    amountLabel: "PHP 500.00",
    type: "deduction",
    customerName: "Northwind Trading",
    status: "open",
    priority: "medium",
    assigneeName: "Mina Cruz",
    assigneeInitials: "MC",
    createdLabel: "May 9, 2026, 02:15 PM",
    dueDateLabel: "May 18, 2026, 10:00 AM",
    actionPath: `/tasks#task-detail-${id}`,
    brief: "Review deduction support before closing the task.",
    openInvoiceCount: 1,
    balanceLabel: "PHP 500.00",
    invoiceContextLabel: "INV-DISPUTE-001",
    invoiceContextDetail: "INV-DISPUTE-001: PHP 500.00 due May 2, 2026",
    callContextLabel: "Retell call DEF67890",
    callContextHref: "/collections?tab=call-inbox#call-detail-call_def67890",
    callContextDetail: "Northwind Trading · May 9, 2026, 02:00 PM · Customer raised a deduction issue.",
    recommendedNextAction: "Review supporting documents before any follow-up.",
    transcriptSnippet: "Customer said the deduction support will be sent by email.",
  };
}

async function loadTaskDetailFixture() {
  const data = await loadOperatorConsoleData();
  data.emailSendingIdentities = [
    {
      id: "sender_task_detail_1",
      provider: "gmail",
      senderEmail: "collector@example.test",
      displayName: "Yield Collector",
      authMode: "oauth2",
      connectionStatus: "connected",
      permissionStatus: "granted",
      healthState: "healthy",
      scopes: ["gmail.send"],
      isDefault: true,
    },
  ];
  data.taskQueue = [
    buildEmailFollowUpTask(),
    buildEmailFollowUpTask("task_email_follow_up_2"),
    buildManualTask(),
  ];
  return data;
}

describe("Task detail modal", () => {
  it("opens email follow-up tasks with AI draft, edit controls, document actions, and task navigation", async () => {
    const data = await loadTaskDetailFixture();
    const html = renderToStaticMarkup(<Dashboard data={data} page="inbox" />);

    expect(html).toContain('href="#task-detail-task_email_follow_up_1"');
    expect(html).toContain('id="task-detail-task_email_follow_up_1"');
    expect(html).toContain("Metro Retail - Makati");
    expect(html).toContain("2 open invoices");
    expect(html).toContain("PHP 3,000.00");
    expect(html).toContain("PHP 2,000.00 overdue");
    expect(html).toContain("Send email follow-up");
    expect(html).toContain("Ari Reyes");
    expect(html).toContain("May 8, 2026, 01:00 PM");
    expect(html).toContain("Customer asked for invoice copies");
    expect(html).toContain("Invoice / balance context");
    expect(html).toContain("INV-EMAIL-001");
    expect(html).toContain("PHP 2,000.00");
    expect(html).toContain("due May 1, 2026");
    expect(html).not.toContain("INV-EMAIL-001: PHP 2,000.00 due May 1, 2026; INV-EMAIL-002");
    expect(html).not.toContain("Source call");
    expect(html).not.toContain("Retell call ABC12345");
    expect(html).not.toContain("/collections?tab=call-inbox#call-detail-call_abc12345");
    expect(html).toContain("Recommended next action");
    expect(html).toContain("Send the invoice copies and monitor for reply.");
    expect(html).not.toContain("Source context");
    expect(html).not.toContain("Transcript summary: Customer asked for invoice copies so AP can route payment.");
    expect(html).not.toContain("Call note:");
    expect(html).toContain("4 days without reply");
    expect(html).toContain("AI draft subject for Metro Retail");
    expect(html).toContain("AI generated body with invoice context.");
    expect(html).toContain("AI-generated draft");
    expect(html).toContain('action="/tasks/compose"');
    expect(html).toContain('name="senderIdentityId"');
    expect(html).toContain('collector@example.test');
    expect(html).toContain('name="cc"');
    expect(html).toContain('name="bodyPreview"');
    expect(html).toContain('title="Bold"');
    expect(html).toContain('data-task-format-command="bold"');
    expect(html).toContain('title="Italic"');
    expect(html).toContain('data-task-format-command="italic"');
    expect(html).toContain('title="Underline"');
    expect(html).toContain('data-task-format-command="underline"');
    expect(html).toContain('title="Hyperlink"');
    expect(html).toContain('data-task-format-command="link"');
    expect(html).toContain("data-task-email-body");
    expect(html).toContain('name="attachments"');
    expect(html).toContain('name="invoiceAttachment"');
    expect(html).toContain('formAction="/tasks/compose/attach-invoice"');
    expect(html).toContain('name="soaAttachment"');
    expect(html).toContain('href="#task-detail-task_email_follow_up_2"');
    expect(html).toContain("Complete task");
    expect(html).toContain("Delete task");
    expect(html).toContain('action="/tasks/delete"');
    expect(html).toContain("Delete this task? This will remove it from the active task list.");
  });

  it("preserves applied draft edits in the modal so document uploads keep the operator copy", async () => {
    const data: OperatorConsoleData = await loadTaskDetailFixture();
    data.taskComposeDraft = {
      composeId: "task_email_follow_up_1",
      generator: "ai",
      subjectLine: "Edited subject from operator",
      body: "Edited body from operator before attaching the invoice.",
      note: "Operator edited the AI draft.",
    };

    const html = renderToStaticMarkup(<Dashboard data={data} page="inbox" />);

    expect(html).toContain('value="Edited subject from operator"');
    expect(html).toContain("Edited body from operator before attaching the invoice.");
    expect(html).toContain('name="appliedDraftSubject" value="Edited subject from operator"');
    expect(html).toContain('name="appliedDraftBody" value="Edited body from operator before attaching the invoice."');
    expect(html).toContain('formAction="/tasks/compose/attach-invoice"');
  });

  it("renders completion and delete actions for non-email tasks", async () => {
    const data = await loadTaskDetailFixture();
    const html = renderToStaticMarkup(<Dashboard data={data} page="inbox" />);

    expect(html).toContain('id="task-detail-task_manual_review_1"');
    expect(html).toContain('action="/tasks/status"');
    expect(html).toContain('name="status" value="completed"');
    expect(html).not.toContain('name="status" value="closed"');
    expect(html).toContain('action="/tasks/delete"');
    expect(html).toContain("Complete task");
    expect(html).toContain("Delete task");
    expect(html).toContain("Delete this task? This will remove it from the active task list.");
    expect(html).toContain("May 9, 2026, 02:15 PM");
    expect(html).not.toContain("May 18, 2026, 10:00 AM");
    expect(html).toContain("INV-DISPUTE-001");
    expect(html).toContain("PHP 500.00 due May 2, 2026");
    expect(html).not.toContain("Retell call DEF67890");
    expect(html).toContain("Recommended next action");
    expect(html).toContain("Review supporting documents before any follow-up.");
  });

  it("shows the full task brief in task detail without ellipsis truncation", async () => {
    const data = await loadTaskDetailFixture();
    data.taskQueue = [
      {
        ...buildManualTask("task_full_brief"),
        taskCode: "TSK-00B2A4",
        brief:
          "Review the customer dispute, confirm the invoice numbers against ERP, check the support packet from AP, document the safe next step, and only then decide whether the collections workflow should stay paused for the billing account while finance reviews the deduction evidence.",
      },
    ];

    const html = renderToStaticMarkup(<Dashboard data={data} page="inbox" />);

    expect(html).toContain("TSK-00B2A4");
    expect(html).toContain("while finance reviews the deduction evidence.");
    expect(html).not.toContain("deduction evidence.…");
  });
});
