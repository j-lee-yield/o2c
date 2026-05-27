import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dashboard } from "./dashboard.js";
import { loadOperatorConsoleData, type OperatorConsoleData, type TaskQueueItem } from "./data.js";

function installLiveCustomerCallContext(data: OperatorConsoleData) {
  let customer = data.customerIndex[0];
  if (!customer) {
    customer = {
      profileId: "billing_customer_call_1",
      canonicalName: "Metro Retail - Makati",
      status: "active",
      accountTier: "standard",
      parentAccountName: "Metro Retail Group",
      billingAccountId: "billing_customer_call_1",
      billingAccountName: "Metro Retail - Makati",
      branchNames: ["Makati Branch"],
      primaryContactEmail: "maria@example.test",
      openAmount: "PHP 1,250.00",
      overdueAmount: "PHP 1,250.00",
      collectibleAmount: "PHP 1,250.00",
      disputedAmount: "PHP 0.00",
      openInvoiceCount: 1,
      taskCount: 0,
      completenessScore: 0.91,
      nextAction: "Call AP contact about overdue invoices.",
      hasPendingReview: false,
      tabs: [
        { id: "overview", label: "Overview", itemCount: 1, status: "ready" },
        { id: "invoices", label: "Invoices", itemCount: 1, status: "ready" },
        { id: "tasks", label: "Tasks", itemCount: 0, status: "empty" },
        { id: "activity", label: "Activity", itemCount: 0, status: "ready" },
        { id: "payments", label: "Payments", itemCount: 0, status: "ready" },
        { id: "ap_portal", label: "AP Portal", itemCount: 0, status: "empty" },
      ],
    };
    data.customerIndex = [customer];
  }
  const now = "2026-05-08T05:00:00.000Z";

  const account: NonNullable<TaskQueueItem["composeEmail"]>["account"] = {
    id: customer.billingAccountId ?? customer.profileId,
    parentAccountId: "parent_customer_call_1",
    branchId: "branch_1",
    createdAt: now,
    updatedAt: now,
    accountNumber: customer.billingAccountId ?? "BA-TEST-1",
    displayName: customer.canonicalName,
    currency: "PHP",
    accountTier: customer.accountTier === "strategic" ? "strategic" : "standard",
    status: "active",
    centrallyPaid: false,
    metadata: {},
  };
  const contact: NonNullable<TaskQueueItem["composeEmail"]>["contact"] = {
    id: "contact_customer_call_1",
    createdAt: now,
    updatedAt: now,
    parentAccountId: account.parentAccountId,
    billingAccountId: account.id,
    branchId: account.branchId,
    scope: "billing_account",
    scopeId: account.id,
    fullName: "Maria Santos",
    email: "maria@example.test",
    phone: "+63 917 555 0199",
    role: "ap",
    isPrimary: true,
    isVerified: true,
    allowAutoSend: true,
    recentSuccessfulResponses: 2,
    metadata: {},
  };
  const invoices: NonNullable<TaskQueueItem["composeEmail"]>["invoices"] = [
    {
      id: "invoice_customer_call_1",
      createdAt: now,
      updatedAt: now,
      state: "synced_open",
      parentAccountId: account.parentAccountId,
      billingAccountId: account.id,
      branchId: account.branchId,
      invoiceNumber: "INV-CALL-001",
      currency: "PHP",
      amountCents: 125_000,
      dueDate: "2026-05-01",
      metadata: {},
    },
  ];

  data.customerProfile = {
    ...data.customerProfile,
    profileId: customer.profileId,
  };
  data.liveCustomerProfileDetail = {
    contacts: [
      {
        name: contact.fullName,
        email: contact.email ?? "ap@example.test",
        verified: true,
      },
    ],
    payments: [],
    tasks: [],
    insights: ["Verified phone number is ready for manual collections calls."],
    sourceLabel: "Customer profile API",
    externalId: account.accountNumber,
    hierarchySummary: account.parentAccountId,
    primaryEmail: contact.email ?? "ap@example.test",
    primaryPhone: contact.phone ?? "",
    portalStatus: "Configured",
    portalType: "Email",
    portalStatementAccess: "Verified",
    rawComposeEmail: {
      account,
      contact,
      invoices,
      draft: {
        subjectLine: "Follow-up on overdue invoices",
        body: "Hi Maria,\n\nWe are following up on the open invoice.",
        generatedBy: "fallback",
        note: "Seeded test draft.",
      },
    },
  };

  return { customer, account, contact, invoices };
}

describe("Customer call modal", () => {
  it("renders a Retell-backed call form from the customer detail view", async () => {
    const data = await loadOperatorConsoleData();
    const { customer } = installLiveCustomerCallContext(data);

    const html = renderToStaticMarkup(
      <Dashboard
        data={data}
        page="customers"
        customerId={customer.profileId}
        customerCallStatus="started"
        customerCallMessage={`Call started for ${customer.canonicalName}.`}
      />,
    );

    expect(html).toContain('href="#customer-call-modal"');
    expect(html).toContain('action="/customers/call/start"');
    expect(html).toContain('name="phoneNumber"');
    expect(html).toContain('value="+63 917 555 0199"');
    expect(html).toContain("The API will still apply Retell pre-call safety checks before dialing.");
    expect(html).toContain(`Call started for ${customer.canonicalName}.`);
  });

  it("renders call lifecycle activity from normalized call inbox records", async () => {
    const data = await loadOperatorConsoleData();
    const { customer, account, contact, invoices } = installLiveCustomerCallContext(data);
    const startedAt = "2026-05-08T05:17:00.000Z";
    const endedAt = "2026-05-08T05:21:00.000Z";

    data.callInbox.calls = [
      {
        id: "call_customer_1",
        tenantId: "tenant_1",
        provider: "retell",
        providerCallId: "retell_customer_1",
        billingAccountId: account.id,
        parentAccountId: account.parentAccountId,
        branchId: account.branchId ?? "branch_1",
        contactId: contact.id,
        customerName: customer.canonicalName,
        customerPhone: contact.phone ?? "+63 917 555 0199",
        toNumber: contact.phone ?? "+63 917 555 0199",
        direction: "outbound",
        status: "completed",
        providerStatus: "ended",
        startedAt,
        endedAt,
        durationSeconds: 244,
        voicemail: false,
        sentiment: "positive",
        classifications: ["Payment promise", "Support request"],
        requestedBy: "web_console",
        invoiceRefs: invoices.map((invoice) => ({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          billingAccountId: invoice.billingAccountId,
          branchId: invoice.branchId ?? account.branchId ?? "branch_1",
        })),
        summary: "Customer promised to pay and requested supporting documents.",
        transcriptSegments: [],
        taskRefs: [
          {
            id: "task_customer_call_1",
            title: "Payment promise follow-up",
            status: "open",
            taskType: "follow_up_promise_to_pay",
            ownerTeam: "collections",
          },
        ],
        openTasksCount: 1,
        metadata: {},
        createdAt: startedAt,
        updatedAt: endedAt,
      },
    ];

    const html = renderToStaticMarkup(
      <Dashboard data={data} page="customers" customerId={customer.profileId} customerTab="activity" />,
    );

    expect(html).toContain("Call initiated");
    expect(html).toContain("Call completed");
    expect(html).toContain("Call outcome recorded");
    expect(html).toContain("Tasks created from call");
    expect(html).toContain("Payment promise follow-up");
  });
});
