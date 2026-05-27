import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "./dashboard.js";
import { loadOperatorConsoleData } from "./data.js";

type OperatorConsoleData = Awaited<ReturnType<typeof loadOperatorConsoleData>>;

const originalEnableDemoData = process.env.ENABLE_DEMO_DATA;
const originalApiBaseUrl = process.env.O2C_API_BASE_URL;

beforeEach(() => {
  process.env.ENABLE_DEMO_DATA = "true";
  process.env.O2C_API_BASE_URL = "http://127.0.0.1:1";
});

afterEach(() => {
  vi.useRealTimers();
  if (originalEnableDemoData === undefined) {
    delete process.env.ENABLE_DEMO_DATA;
  } else {
    process.env.ENABLE_DEMO_DATA = originalEnableDemoData;
  }
  if (originalApiBaseUrl === undefined) {
    delete process.env.O2C_API_BASE_URL;
  } else {
    process.env.O2C_API_BASE_URL = originalApiBaseUrl;
  }
});

function addInvoiceDetailFixture(
  data: OperatorConsoleData,
  metadata: Record<string, unknown> = {},
) {
  const invoice = {
    id: "business_central:invoice-detail-test",
    sourceProvider: "business_central" as const,
    sourceKind: "accounting" as const,
    sourceLabel: "Business Central",
    importMode: "live_connection" as const,
    externalId: "invoice-detail-test",
    canonicalInvoiceId: "invoice-detail-test",
    customerName: "Medical Clinic Corp",
    billingAccountId: "billing-medical-clinic",
    billingAccountName: "Medical Clinic Corp",
    invoiceNumber: "MCC-OD-001",
    currency: "PHP",
    totalAmountCents: 128_750_00,
    openAmountCents: 128_750_00,
    paidAmountCents: 0,
    status: "open" as const,
    sourceStatus: "open",
    issuedAt: "2026-04-06",
    dueDate: "2026-05-06",
    daysPastDue: 15,
    tags: ["live", "open"],
    metadata,
  };

  data.invoiceIndex = {
    ...data.invoiceIndex,
    invoices: [invoice],
  };
  data.invoiceDetail = {
    invoiceNumber: invoice.invoiceNumber,
    billingAccountId: invoice.billingAccountId,
    branchId: "medical-clinic-main",
    status: "Open",
    amount: "₱128,750.00",
    dueDate: invoice.dueDate,
    disputeState: "No dispute hold",
    nextAction: "Follow the standard collections workflow using the billing-account route.",
    explanation: "The invoice remains collectible and visible on the billing account while preserving branch context.",
    linkedStatuses: [],
  };

  return invoice;
}

function makeInvoiceFixture(
  invoiceNumber: string,
  dueDate: string,
  daysPastDue: number,
  overrides: Partial<OperatorConsoleData["invoiceIndex"]["invoices"][number]> = {},
) {
  return {
    id: `invoice-${invoiceNumber}`,
    sourceProvider: "spreadsheet_upload" as const,
    sourceKind: "spreadsheet" as const,
    sourceLabel: "Uploaded invoices",
    importMode: "manual_upload" as const,
    customerName: overrides.customerName ?? "Fixture Customer",
    billingAccountId: overrides.billingAccountId ?? "fixture-billing",
    billingAccountName: overrides.billingAccountName ?? overrides.customerName ?? "Fixture Customer",
    invoiceNumber,
    currency: "PHP",
    totalAmountCents: overrides.totalAmountCents ?? 100_000_00,
    openAmountCents: overrides.openAmountCents ?? 100_000_00,
    paidAmountCents: overrides.paidAmountCents ?? 0,
    status: overrides.status ?? ("open" as const),
    sourceStatus: overrides.sourceStatus ?? "open",
    issuedAt: overrides.issuedAt ?? "2026-04-25",
    dueDate,
    daysPastDue,
    tags: overrides.tags ?? [],
    metadata: overrides.metadata ?? {},
    ...overrides,
  } satisfies OperatorConsoleData["invoiceIndex"]["invoices"][number];
}

function makeTaskFixture(
  id: string,
  title: string,
  relatedRecord: string,
  customerName = "Fixture Customer",
  overrides: Partial<OperatorConsoleData["taskQueue"][number]> = {},
) {
  return {
    id,
    taskCode: id.toUpperCase(),
    title,
    relatedRecord,
    amountLabel: "₱1,000.00",
    type: "collection" as const,
    customerName,
    status: "open" as const,
    priority: "high" as const,
    assigneeName: "Ana Reyes",
    assigneeInitials: "A",
    createdLabel: "May 25, 08:00 AM",
    dueDateLabel: "May 25, 05:00 PM",
    actionPath: "/tasks",
    ...overrides,
  } satisfies OperatorConsoleData["taskQueue"][number];
}

function makeCustomerFixture(
  overrides: Partial<OperatorConsoleData["customerIndex"][number]> = {},
) {
  return {
    profileId: overrides.profileId ?? "fixture-customer",
    canonicalName: overrides.canonicalName ?? "Fixture Customer",
    status: overrides.status ?? ("active" as const),
    accountTier: overrides.accountTier ?? ("standard" as const),
    billingAccountId: overrides.billingAccountId ?? "fixture-billing",
    billingAccountName: overrides.billingAccountName ?? overrides.canonicalName ?? "Fixture Customer",
    branchNames: overrides.branchNames ?? [],
    primaryContactEmail: overrides.primaryContactEmail ?? "ap.fixture@example.com",
    openAmount: overrides.openAmount ?? "₱0",
    overdueAmount: overrides.overdueAmount ?? "₱0",
    collectibleAmount: overrides.collectibleAmount ?? "₱0",
    disputedAmount: overrides.disputedAmount ?? "₱0",
    openInvoiceCount: overrides.openInvoiceCount ?? 0,
    taskCount: overrides.taskCount ?? 0,
    completenessScore: overrides.completenessScore ?? 0.83,
    nextAction: overrides.nextAction ?? "Review the account workspace before outreach.",
    hasPendingReview: overrides.hasPendingReview ?? false,
    tabs: overrides.tabs ?? [
      { id: "overview", label: "Overview", itemCount: 1, status: "ready" },
      { id: "invoices", label: "Invoices", itemCount: 0, status: "empty" },
      { id: "tasks", label: "Tasks", itemCount: 0, status: "empty" },
      { id: "activity", label: "Activity", itemCount: 0, status: "empty" },
      { id: "payments", label: "Payments", itemCount: 0, status: "empty" },
      { id: "ap_portal", label: "AP Portal", itemCount: 0, status: "empty" },
    ],
    ...overrides,
  } satisfies OperatorConsoleData["customerIndex"][number];
}

function clearOperationalActivity(data: OperatorConsoleData) {
  data.taskQueue = [];
  data.collectionsQueue = [];
  data.approvalsQueue = [];
  data.exceptionsQueue = [];
  data.aiFeed = [];
  data.emailInbox = {
    ...data.emailInbox,
    resultSizeEstimate: 0,
    messages: [],
    selectedThread: undefined,
  };
  data.callInbox = {
    ...data.callInbox,
    total: 0,
    items: [],
    calls: [],
  };
  data.cashApplicationQueue = {
    ...data.cashApplicationQueue,
    reviewRows: [],
    bankTransactions: [],
    remittances: [],
    summary: {
      autoAppliedToday: 0,
      needsReview: 0,
      unmatched: 0,
      partialApplied: 0,
      totalUnappliedCashCents: 0,
    },
    overviewSummary: {
      totalBankedTodayCents: 0,
      totalAppliedTodayCents: 0,
      reviewQueueCount: 0,
      remittanceAwaitingLinkCount: 0,
      writebackPendingCount: 0,
      unappliedCashCents: 0,
    },
  };
}

function extractTaskTableHtml(html: string) {
  const start = html.indexOf('<div class="task-table">');
  const modalStart = html.indexOf('<section id="task-detail-');
  const end = modalStart > start ? modalStart : html.length;
  return start >= 0 ? html.slice(start, end) : html;
}

describe("Dashboard", () => {
  it("renders the command center as its own page", async () => {
    const data = await loadOperatorConsoleData();
    const html = renderToStaticMarkup(<Dashboard data={data} page="home" />);

    expect(html).toContain("Getting set up");
    expect(html).toContain("Enable sending and receiving emails through Yield");
    expect(html).toContain("Tasks");
    expect(html).toContain("Today");
    expect(html).toContain("open tasks");
    expect(html).toContain("currently due today from");
    expect(html).toContain("Respond to");
    expect(html).toContain("Invoice payment disputes:");
    expect(html).toContain("Open Tasks by Age");
    expect(html).toContain("Task types");
    expect(html).toContain("Workspace");
    expect(html).toContain("Manage");
    expect(html).toContain("Payments");
    expect(html).toContain("Customers");
    expect(html).toContain("Collect");
    expect(html).toContain("Analytics");
    expect(html).not.toContain("Collections queue");
    expect(html).not.toContain('href="/onboarding"');
    expect(html).not.toContain('href="/cash-app"');
    expect(html).not.toContain('href="/deductions"');
    expect(html).not.toContain('href="/credit-line"');
    expect(html).not.toContain('href="/data-sources"');
    expect(html).not.toContain('href="/approvals"');
    expect(html).not.toContain('href="/rules"');
    expect(html).toContain('href="/cash-app?tab=payments"');
  });

  it("uses the current Philippine date for Today displays and home calendar initialization", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T16:30:00.000Z"));
    const data = await loadOperatorConsoleData();
    data.generatedAt = "2026-01-01T00:00:00.000Z";

    const html = renderToStaticMarkup(<Dashboard data={data} page="home" />);

    expect(html).toContain("Today: Monday, May 25, 2026");
    expect(html).not.toContain("Thursday, January 1, 2026");
    expect(html).toContain("May 2026");
    expect(html).toContain('href="/?calendarDate=2026-05-18"');
    expect(html).toContain('href="/?calendarDate=2026-06-01"');
  });

  it("uses real task aging data for the homepage bar chart", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-25T04:00:00.000Z"));
    const data = await loadOperatorConsoleData();
    clearOperationalActivity(data);
    data.invoiceIndex.invoices = [
      makeInvoiceFixture("INV-CURRENT", "2026-06-10", 0),
      makeInvoiceFixture("INV-1-30", "2026-05-10", 15),
      makeInvoiceFixture("INV-31-60", "2026-04-10", 45),
      makeInvoiceFixture("INV-90", "2026-01-30", 115),
    ];
    data.taskQueue = [
      makeTaskFixture("task-current", "Review current invoice", "INV-CURRENT", "Current Customer"),
      makeTaskFixture("task-1-30", "Follow up overdue invoice", "INV-1-30", "Overdue Customer"),
      makeTaskFixture("task-31-60", "Escalate invoice", "INV-31-60", "Older Customer"),
      makeTaskFixture("task-90", "Legal review", "INV-90", "Oldest Customer"),
    ];

    const html = renderToStaticMarkup(<Dashboard data={data} page="home" />);

    expect(html).toContain('title="1 open task linked to Current invoices"');
    expect(html).toContain('title="1 open task linked to 1-30 invoices"');
    expect(html).toContain('title="1 open task linked to 31-60 invoices"');
    expect(html).toContain('title="1 open task linked to 90+ invoices"');
    expect(html).toContain('<strong>1</strong><span>open task linked to Current invoices</span>');
    expect(html).not.toContain("No open tasks are linked to invoice aging buckets.");
  });

  it("renders respond-to counts from canonical open dispute, broken-promise, and task data", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-25T04:00:00.000Z"));
    const data = await loadOperatorConsoleData();
    clearOperationalActivity(data);
    data.invoiceIndex.invoices = [
      makeInvoiceFixture("INV-DISPUTE", "2026-05-01", 24, {
        status: "disputed",
        tags: ["payment_dispute"],
        customerName: "Disputed Customer",
      }),
    ];
    data.taskQueue = [
      makeTaskFixture("task-dispute", "Review dispute response", "INV-DISPUTE", "Disputed Customer"),
      {
        ...makeTaskFixture("task-broken", "Broken promise to pay", "INV-DISPUTE", "Disputed Customer"),
        dueDateLabel: "May 20, 05:00 PM",
      },
      makeTaskFixture("task-open", "Send invoice copy", "INV-DISPUTE", "Another Customer"),
      makeTaskFixture("task-completed", "Completed customer follow-up", "INV-DISPUTE", "Another Customer", {
        status: "completed",
      }),
      makeTaskFixture("task-closed", "Closed customer follow-up", "INV-DISPUTE", "Another Customer", {
        status: "closed",
      }),
      {
        ...makeTaskFixture("task-archived", "Archived customer follow-up", "INV-DISPUTE", "Another Customer"),
        status: "archived",
      } as unknown as OperatorConsoleData["taskQueue"][number],
      {
        ...makeTaskFixture("task-deleted", "Deleted customer follow-up", "INV-DISPUTE", "Another Customer"),
        status: "deleted",
      } as unknown as OperatorConsoleData["taskQueue"][number],
    ];
    data.homeTaskSummary = {
      ...data.homeTaskSummary,
      views: data.homeTaskSummary.views.map((view) =>
        view.id === "all_tasks" ? { ...view, totalCount: 99 } : view,
      ),
    };

    const html = renderToStaticMarkup(<Dashboard data={data} page="home" />);

    expect(html).toContain("Invoice payment disputes: 1 open dispute review task");
    expect(html).toContain("Broken promises to pay: 1 open follow-up task");
    expect(html).toContain("3 open tasks from 2 customers");
    expect(html).toContain('href="/tasks" class="home-reference-link">Open tasks</a>');
    expect(html).toContain('href="/tasks" class="home-reference-link">3 open tasks</a>');
    expect(html).not.toContain(">99 open tasks<");
  });

  it("renders routed collections and cash application pages", async () => {
    const data = await loadOperatorConsoleData({
      page: "collections",
      controlCenterSelectedTemplateId: "cc_template_seed_5",
    });
    const collectionsCallData = await loadOperatorConsoleData({
      page: "collections",
      collectionsTab: "call-inbox",
    });
    const analyticsHtml = renderToStaticMarkup(<Dashboard data={data} page="analytics" />);
    const analyticsWeeklyHtml = renderToStaticMarkup(<Dashboard data={data} page="analytics" analyticsTrend="weekly" />);
    const borrowingHtml = renderToStaticMarkup(<Dashboard data={data} page="borrowing" />);
    const facilitiesHtml = renderToStaticMarkup(<Dashboard data={data} page="credit-facilities" />);
    const statementHtml = renderToStaticMarkup(<Dashboard data={data} page="loan-statement" />);
    const repaymentsHtml = renderToStaticMarkup(<Dashboard data={data} page="loan-repayments" />);
    const alertsHtml = renderToStaticMarkup(<Dashboard data={data} page="loan-alerts" />);
    const loanTasksHtml = renderToStaticMarkup(<Dashboard data={data} page="loan-tasks" />);
    const invoicesHtml = renderToStaticMarkup(<Dashboard data={data} page="invoices" />);
    const customerDetailTarget = data.customerIndex[0] ?? makeCustomerFixture({
      profileId: "bill-mfg-1",
      canonicalName: "Archipelago Manufacturing HQ",
      billingAccountId: "bill-mfg-1",
      billingAccountName: "Archipelago Manufacturing HQ",
      openInvoiceCount: 1,
    });
    data.customerIndex = [customerDetailTarget, ...data.customerIndex.slice(1)];
    const customersHtml = renderToStaticMarkup(<Dashboard data={data} page="customers" />);
    const customerDetailHtml = renderToStaticMarkup(
      <Dashboard data={data} page="customers" customerId={customerDetailTarget.profileId} customerTab="overview" />
    );
    const collectionsHtml = renderToStaticMarkup(<Dashboard data={data} page="collections" />);
    const collectionsCallHtml = renderToStaticMarkup(
      <Dashboard data={collectionsCallData} page="collections" collectionsTab="call-inbox" />,
    );
    const controlCenterHtml = renderToStaticMarkup(<Dashboard data={data} page="control-center" />);
    const controlCenterCallAgentHtml = renderToStaticMarkup(
      <Dashboard data={data} page="control-center" controlCenterTab="call-agent" />,
    );
    const controlCenterTemplateDrawerHtml = renderToStaticMarkup(
      <Dashboard
        data={data}
        page="control-center"
        controlCenterTab="email-templates"
        controlCenterSelectedTemplateId="cc_template_seed_5"
      />,
    );
    const controlCenterEmailTemplatesHtml = renderToStaticMarkup(
      <Dashboard data={data} page="control-center" controlCenterTab="email-templates" />,
    );
    const controlCenterNewTemplateDrawerHtml = renderToStaticMarkup(
      <Dashboard
        data={data}
        page="control-center"
        controlCenterTab="email-templates"
        controlCenterSelectedTemplateId="__new_template__"
      />,
    );
    const controlCenterEnrollModalHtml = renderToStaticMarkup(
      <Dashboard
        data={data}
        page="control-center"
        controlCenterExpandedWorkflowId={data.controlCenter?.workflows[0]?.id}
        controlCenterEnrollModalWorkflowId={data.controlCenter?.workflows[0]?.id}
      />,
    );
    const controlCenterStageModalHtml = renderToStaticMarkup(
      <Dashboard
        data={data}
        page="control-center"
        controlCenterExpandedWorkflowId={data.controlCenter?.workflows[0]?.id}
        controlCenterStageModalWorkflowId={data.controlCenter?.workflows[0]?.id}
        controlCenterStageModalChannel="email"
        controlCenterStageModalTemplateMode="pre_saved_template"
      />,
    );
    const cashHtml = renderToStaticMarkup(<Dashboard data={data} page="cash-application" />);
    const cashPaymentsHtml = renderToStaticMarkup(
      <Dashboard data={data} page="cash-application" cashAppTab="payments" />,
    );
    const cashBankHtml = renderToStaticMarkup(
      <Dashboard data={data} page="cash-application" cashAppTab="bank-transactions" />,
    );

    expect(analyticsHtml).toContain("Analytics");
    expect(analyticsHtml).toContain("Total Outstanding");
    expect(analyticsHtml).toContain("What has Yield done for you?");
    expect(analyticsHtml).toContain("Overdue Balance %");
    expect(analyticsHtml).toContain("Cash Collected");
    expect(analyticsHtml).toContain("Monthly trend of DSO vs weighted average agreed terms");
    expect(analyticsHtml).toContain("Top Customers by Balance");
    expect(analyticsHtml).toContain('href="/analytics?trend=weekly"');
    expect(analyticsHtml).toContain('href="/analytics?trend=monthly"');
    expect(analyticsWeeklyHtml).toContain("Weekly trend of DSO vs weighted average agreed terms");
    expect(borrowingHtml).toContain("Credit Line");
    expect(borrowingHtml).toContain("Repayment workbench");
    expect(facilitiesHtml).toContain("Credit Line Facilities");
    expect(facilitiesHtml).toContain("Security Bank Revolver");
    expect(statementHtml).toContain("Loan statement detail");
    expect(statementHtml).toContain("Payment applications");
    expect(repaymentsHtml).toContain("Repayment history");
    expect(repaymentsHtml).toContain("PYMT-88912");
    expect(alertsHtml).toContain("Credit Line Alerts");
    expect(alertsHtml).toContain("Past due repayment");
    expect(loanTasksHtml).toContain("Credit Line Tasks");
    expect(loanTasksHtml).toContain("Confirm repayment release with treasury");
    expect(invoicesHtml).toContain("Complete invoice ledger across all customers");
    expect(invoicesHtml).toContain("More Filters");
    expect(invoicesHtml).toContain("Overdue Open Invoices");
    expect(customersHtml).toContain("Customers");
    expect(customersHtml).toContain("Search by name, ID, account number, or user");
    expect(customersHtml).toContain("Open Invoices");
    expect(customersHtml).toContain("Export");
    expect(customerDetailHtml).toContain("Yield Insights");
    expect(customerDetailHtml).toContain("Contacts");
    expect(customerDetailHtml).not.toContain("Pause Outreach");
    expect(customerDetailHtml).not.toContain("AP Portal");

    expect(collectionsHtml).toContain("Collections");
    expect(collectionsHtml).toContain("Email Inbox");
    expect(collectionsHtml).toContain("Call Inbox");
    expect(collectionsHtml).not.toContain("Configure");
    expect(collectionsHtml).not.toContain("SMS Inbox");
    expect(collectionsCallHtml).toContain("Direction");
    expect(collectionsCallHtml).toContain("Classification");
    expect(collectionsCallHtml).toContain("/collections/call-inbox/export");
    expect(collectionsHtml).not.toContain("AI Activity (Last 2 hours)");
    expect(controlCenterHtml).toContain("Control Center");
    expect(controlCenterHtml).toContain("Workflows");
    expect(controlCenterHtml).toContain("Email Templates");
    expect(controlCenterEmailTemplatesHtml).toContain("Create Template");
    expect(controlCenterEmailTemplatesHtml).toContain("selectedTemplateId=__new_template__");
    expect(controlCenterEmailTemplatesHtml).toContain('name="templateSearch"');
    expect(controlCenterHtml).toContain("Call Agent");
    expect(controlCenterHtml).not.toContain(">Config<");
    expect(controlCenterHtml).toContain("New Workflow");
    expect(controlCenterHtml).toContain("Configure time based email or call triggers");
    expect(controlCenterHtml).toContain("Email sender");
    expect(controlCenterHtml).toContain("Test email recipient");
    expect(controlCenterHtml).toContain("Test call recipient");
    expect(controlCenterHtml).toContain("Selected outreach days");
    expect(controlCenterHtml).toContain("Send test email");
    expect(controlCenterHtml).toContain("Start test call");
    expect(controlCenterHtml).toContain('/control-center/workflows/test-email');
    expect(controlCenterHtml).toContain('/control-center/workflows/test-call');
    expect(controlCenterHtml).toContain('type="time" name="outreachWindowStart"');
    expect(controlCenterHtml).toContain('name="outreachDays"');
    expect(controlCenterHtml).not.toContain("Weekend Calling");
    expect(controlCenterHtml).toContain("Adaptive outcomes");
    expect(controlCenterHtml).toContain("Auto-pause outcomes");
    expect(controlCenterHtml).toContain("Track switching");
    expect(controlCenterHtml).toContain("Human review triggers");
    expect(controlCenterHtml).toContain("Add email or call steps with safe trigger rules.");
    expect(controlCenterHtml).toContain("Enroll Customers");
    expect(controlCenterHtml).toContain("Enrolled Customers (2)");
    expect(controlCenterHtml).toContain("Select All");
    expect(controlCenterHtml).toContain("ACC001");
    expect(controlCenterHtml).toContain("ACC003");
    expect(controlCenterHtml).toContain("SM Retail Inc.");
    expect(controlCenterHtml).toContain("Robinson Supermarket");
    expect(controlCenterHtml).not.toContain('class="control-center-workflow-row" open=""');
    expect(controlCenterCallAgentHtml).toContain("Call agent number");
    expect(controlCenterCallAgentHtml).toContain("Inbound/outbound SMS enabled");
    expect(controlCenterCallAgentHtml).toContain('aria-disabled="true"');
    expect(controlCenterCallAgentHtml).not.toContain("Provider payload");
    expect(controlCenterCallAgentHtml).not.toContain("Voice agent preview");
    expect(controlCenterCallAgentHtml).not.toContain("Human Transfer");
    expect(controlCenterCallAgentHtml).not.toContain("Opening Line Configuration");
    expect(controlCenterCallAgentHtml).not.toContain("Call Recording Disclaimer");
    expect(controlCenterTemplateDrawerHtml).toContain("Template Preview");
    expect(controlCenterTemplateDrawerHtml).not.toContain("<h3>To</h3>");
    expect(controlCenterTemplateDrawerHtml).toContain("Save Template");
    expect(controlCenterTemplateDrawerHtml).toContain("ar-manager@yieldaros.example");
    expect(controlCenterTemplateDrawerHtml).toContain("Auto Correct");
    expect(controlCenterTemplateDrawerHtml).toContain("Luzon Distributor Group - Manila");
    expect(controlCenterTemplateDrawerHtml).toContain("Balance overdue:");
    expect(controlCenterNewTemplateDrawerHtml).toContain("New Template");
    expect(controlCenterNewTemplateDrawerHtml).toContain("/control-center/templates/create");
    expect(controlCenterNewTemplateDrawerHtml).toContain("Collections follow-up");
    expect(controlCenterNewTemplateDrawerHtml).toContain("data-template-preview-body");
    expect(controlCenterNewTemplateDrawerHtml).toContain("Hi Luzon Distributor Group - Manila,");
    expect(controlCenterNewTemplateDrawerHtml).toContain("INV-1023, INV-1027");
    expect(controlCenterNewTemplateDrawerHtml).toContain("data-template-sample-variables=");
    expect(controlCenterNewTemplateDrawerHtml).toContain("{{customer_name}}");
    expect(controlCenterNewTemplateDrawerHtml).toContain("{{invoice_numbers}}");
    expect(controlCenterNewTemplateDrawerHtml).toContain("data-template-variable-toggle");
    expect(controlCenterEnrollModalHtml).toContain("Enroll Customers in Workflow");
    expect(controlCenterEnrollModalHtml).toContain("Search customers...");
    expect(controlCenterEnrollModalHtml).toContain("Archipelago Manufacturing HQ");
    expect(controlCenterEnrollModalHtml).toContain("bill-mfg-1");
    expect(controlCenterEnrollModalHtml).toContain("Overdue:");
    expect(controlCenterEnrollModalHtml).toContain("open invoice");
    expect(controlCenterStageModalHtml).toContain("Add Stage");
    expect(controlCenterStageModalHtml).toContain("Email");
    expect(controlCenterStageModalHtml).toContain("Call");
    expect(controlCenterStageModalHtml).not.toContain("stageChannel=sms");
    expect(controlCenterStageModalHtml).toContain("Before due date");
    expect(controlCenterStageModalHtml).toContain("On due date");
    expect(controlCenterStageModalHtml).toContain("After due date");
    expect(controlCenterStageModalHtml).toContain("Choose a template");

    expect(cashHtml).toContain("Cash App");
    expect(cashHtml).toContain("in pending payments");
    expect(cashHtml).toContain("This Week&#x27;s Summary");
    expect(cashHtml).toContain("Agent Highlights");
    expect(cashHtml).toContain("Bank Transactions");
    expect(cashHtml).toContain("Remittances");
    expect(cashPaymentsHtml).toContain("Documentation");
    expect(cashPaymentsHtml).toContain("Export");
    expect(cashBankHtml).toContain("Upload Bank Statement");
    expect(cashBankHtml).toContain("Potential Payment");
  });

  it("renders the redesigned analytics page", async () => {
    const data = await loadOperatorConsoleData();
    const monthlyHtml = renderToStaticMarkup(<Dashboard data={data} page="analytics" />);
    const weeklyHtml = renderToStaticMarkup(<Dashboard data={data} page="analytics" analyticsTrend="weekly" />);

    expect(monthlyHtml).toContain("Total Outstanding");
    expect(monthlyHtml).toContain("Total Overdue");
    expect(monthlyHtml).toContain("Cash Collected (this month)");
    expect(monthlyHtml).toContain("Invoices Followed Up On (this month)");
    expect(monthlyHtml).toContain("Invoices Collected (this month)");
    expect(monthlyHtml).toContain("What has Yield done for you?");
    expect(monthlyHtml).toContain("PHP collected with Yield");
    expect(monthlyHtml).toContain("Yield collection rate");
    expect(monthlyHtml).toContain("Calls/emails automated");
    expect(monthlyHtml).toContain("Overdue Balance %");
    expect(monthlyHtml).toContain("Cash Collected");
    expect(monthlyHtml).toContain("Monthly trend of DSO vs weighted average agreed terms");
    expect(monthlyHtml).toContain("Top Customers by Balance");
    expect(monthlyHtml).toContain('href="/analytics?trend=weekly"');
    expect(monthlyHtml).toContain('href="/analytics?trend=monthly"');
    expect(monthlyHtml).toContain('data-analytics-trend-value="monthly" role="tab"');
    expect(monthlyHtml).toContain('class="analytics-trend-pill is-active" aria-current="page" aria-selected="true" data-analytics-trend-link="true" data-analytics-trend-value="monthly"');
    expect(weeklyHtml).toContain("Weekly trend of DSO vs weighted average agreed terms");
    expect(weeklyHtml).toContain('class="analytics-trend-pill is-active" aria-current="page" aria-selected="true" data-analytics-trend-link="true" data-analytics-trend-value="weekly"');
  });

  it("aggregates analytics trends from operational data and removes export actions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-25T04:00:00.000Z"));
    const data = await loadOperatorConsoleData();
    clearOperationalActivity(data);
    data.invoiceIndex.invoices = [
      makeInvoiceFixture("INV-MAY", "2026-05-20", 5, {
        issuedAt: "2026-04-20",
        customerName: "Analytics Customer",
        billingAccountName: "Analytics Customer",
      }),
    ];
    data.invoiceIndex.summary = {
      ...data.invoiceIndex.summary,
      totalInvoices: 1,
      openInvoiceCount: 1,
      openAmountCents: 100_000_00,
      overdueInvoiceCount: 1,
    };
    data.overdueExposure = {
      ...data.overdueExposure,
      overdueOpenAmountCents: 100_000_00,
    };
    data.cashApplicationQueue.reviewRows = [
      {
        paymentId: "pay-may",
        paymentReference: "PAY-MAY",
        accountName: "Analytics Customer",
        amountCents: 25_000_00,
        state: "needs review",
        reviewReason: "Matched to invoice reference.",
        receivedOn: "2026-05-20",
        remittanceState: "linked_to_payment",
        writebackStatus: "pending",
        residualAmountCents: 0,
        recommendedAction: "Review and apply.",
        matches: [
          {
            invoiceId: "invoice-INV-MAY",
            invoiceNumber: "INV-MAY",
            invoiceAmountCents: 100_000_00,
            paymentAmountCents: 25_000_00,
            differenceCents: 0,
            confidence: 0.98,
            rationale: "Exact invoice reference.",
          },
        ],
      },
    ];
    data.callInbox.calls = [
      {
        id: "call-may",
        tenantId: "default",
        provider: "retell",
        providerCallId: "provider-call-may",
        customerName: "Analytics Customer",
        direction: "outbound",
        status: "completed",
        startedAt: "2026-05-19T02:00:00.000Z",
        voicemail: false,
        sentiment: "neutral",
        classifications: ["promise_to_pay"],
        invoiceRefs: [{ invoiceNumber: "INV-MAY" }],
        transcriptSegments: [],
        taskRefs: [],
        openTasksCount: 0,
        metadata: {},
        createdAt: "2026-05-19T02:00:00.000Z",
        updatedAt: "2026-05-19T02:00:00.000Z",
      },
    ];

    const monthlyHtml = renderToStaticMarkup(<Dashboard data={data} page="analytics" />);
    const weeklyHtml = renderToStaticMarkup(<Dashboard data={data} page="analytics" analyticsTrend="weekly" />);

    expect(monthlyHtml).toContain("<title>Total May: ₱25,000.00</title>");
    expect(monthlyHtml).toContain("Total May: ₱25,000.00");
    expect(monthlyHtml).toContain('aria-label="Analytics Customer: ₱100,000.00 open balance"');
    expect(weeklyHtml).toContain("<title>Total May 18: ₱25,000.00</title>");
    expect(monthlyHtml).not.toContain(">Export<");
  });

  it("formats analytics million-peso totals without over-rounding", async () => {
    const data = await loadOperatorConsoleData();
    data.invoiceIndex.summary = {
      ...data.invoiceIndex.summary,
      openAmountCents: 127_700_000,
    };

    const html = renderToStaticMarkup(<Dashboard data={data} page="analytics" />);

    expect(html).toContain("₱1.277M");
    expect(html).not.toContain("₱1.3M");
  });

  it("renders clean empty states when no operational dashboard data exists", async () => {
    const data = await loadOperatorConsoleData();
    clearOperationalActivity(data);
    data.invoiceIndex.invoices = [];
    data.invoiceIndex.summary = {
      totalInvoices: 0,
      totalAmountCents: 0,
      openAmountCents: 0,
      openInvoiceCount: 0,
      overdueInvoiceCount: 0,
      disputedInvoiceCount: 0,
      paidInvoiceCount: 0,
      connectedProviderCount: 0,
    };
    data.overdueExposure = {
      ...data.overdueExposure,
      overdueOpenAmountCents: 0,
    };

    const homeHtml = renderToStaticMarkup(<Dashboard data={data} page="home" />);
    const analyticsHtml = renderToStaticMarkup(<Dashboard data={data} page="analytics" />);

    expect(homeHtml).toContain("No scheduled tasks, payments, outreach, or customer activity for this week.");
    expect(homeHtml).toContain("No open tasks are linked to invoice aging buckets.");
    expect(analyticsHtml).toContain("No payment or cash-application activity is available for this period.");
    expect(analyticsHtml).toContain("No customer balance data is available.");
  });

  it("suppresses sample dashboard data when ENABLE_DEMO_DATA is explicitly false", async () => {
    process.env.ENABLE_DEMO_DATA = "false";
    process.env.O2C_API_BASE_URL = "http://127.0.0.1:1";

    const data = await loadOperatorConsoleData();
    const html = renderToStaticMarkup(<Dashboard data={data} page="home" />);

    expect(data.invoiceIndex.invoices).toHaveLength(0);
    expect(data.taskQueue).toHaveLength(0);
    expect(html).toContain("No open tasks are linked to invoice aging buckets.");
    expect(html).not.toContain("SM Retail Inc.");
  });

  it("renders the invite user modal entry points on the users page", async () => {
    const data = await loadOperatorConsoleData();
    data.accessControlAdmin = {
      users: [
        {
          id: "user_platform_admin",
          tenantId: "default",
          email: "platform.admin@yield.example",
          fullName: "Pat Reyes",
          status: "active",
          primaryRole: "Platform Admin",
          roleKeys: ["platform_admin"],
          scopeSummary: "Tenant-wide",
          approvalAuthoritySummary: "No explicit approval authority",
        },
      ],
      selectedUser: {
        id: "user_platform_admin",
        tenantId: "default",
        email: "platform.admin@yield.example",
        fullName: "Pat Reyes",
        status: "active",
        assignments: [],
        approvalAuthorities: [],
        recentAuditEvents: [],
      },
      roles: [],
      permissions: [],
      auditEvents: [],
      currentUserAccess: {
        userId: "user_platform_admin",
        roleKeys: ["platform_admin"],
        permissionKeys: ["users.manage"],
        scopedPermissions: [],
        approvalAuthorities: [],
      },
    };
    const html = renderToStaticMarkup(<Dashboard data={data} page="admin-users" pathname="/admin/users" />);

    expect(html).toContain('href="#invite-user-modal"');
    expect(html).toContain('id="invite-user-modal"');
    expect(html).toContain("Invite User");
    expect(html).toContain("Send an invitation to a new user to join your organization");
    expect(html).toContain("Full Name");
    expect(html).toContain("Email Address");
    expect(html).toContain("Primary Role");
    expect(html).toContain("Access Scope (Optional)");
    expect(html).toContain("Send Invitation");
    expect(html).toContain('action="/admin/users/invite"');
  });

  it("renders deductions list and detail views", async () => {
    const data = await loadOperatorConsoleData();
    const deductionsHtml = renderToStaticMarkup(<Dashboard data={data} page="exceptions" pathname="/deductions" />);
    const deductionDetailHtml = renderToStaticMarkup(
      <Dashboard data={data} page="exceptions" pathname="/deductions/DM3241407UNLOAD" />,
    );

    expect(deductionsHtml).toContain("Export Deductions");
    expect(deductionsHtml).toContain("Pre-deduction");
    expect(deductionsHtml).toContain("DM3241407UNLOAD");
    expect(deductionsHtml).toContain("Upload Document");

    expect(deductionDetailHtml).toContain("Back to deductions");
    expect(deductionDetailHtml).toContain("Deduction: DM3241407UNLOAD");
    expect(deductionDetailHtml).toContain("Credit Memo Draft");
    expect(deductionDetailHtml).toContain("Sync credit memo");
  });

  it("keeps secondary detail pages available", async () => {
    const data = await loadOperatorConsoleData();
    const inboxHtml = renderToStaticMarkup(<Dashboard data={data} page="inbox" />);
    const onboardingHtml = renderToStaticMarkup(
      <Dashboard
        data={data}
        page="onboarding"
        onboardingImportStatus={{
          lane: "payments",
          status: "success",
          importedCount: 2,
          heldCount: 1,
          reviewCount: 1,
          message: "2 bank transactions normalized, 1 row was held safely.",
          notes: ["Row 4: Missing or invalid transaction date."],
        }}
      />,
    );
    const accountHtml = renderToStaticMarkup(<Dashboard data={data} page="account-workspace" />);
    const invoiceHtml = renderToStaticMarkup(<Dashboard data={data} page="invoice-detail" />);
    const inventoryHtml = renderToStaticMarkup(<Dashboard data={data} page="screen-inventory" />);
    const dataSourcesHtml = renderToStaticMarkup(<Dashboard data={data} page="data-sources" />);
    const integrationsHtml = renderToStaticMarkup(<Dashboard data={data} page="integrations" />);
    const quickBooksConnectHtml = renderToStaticMarkup(
      <Dashboard
        data={data}
        page="quickbooks-connect"
        quickbooksConnect={{
          kind: "connected",
          accessMode: "read_write",
          scopes: [
            "com.intuit.quickbooks.accounting",
            "openid",
            "profile",
            "email",
            "offline_access",
          ],
          readableObjects: ["invoices", "customers", "contacts", "payments"],
          writableObjects: ["payment writeback staging", "cash application writeback preview"],
          companyName: "Acme QuickBooks",
          environment: "sandbox",
          connectionHealth: "connected",
          callbackStatus: "connected",
          callbackMessage: "Acme QuickBooks is now authorized for Yield AROS.",
        }}
      />,
    );
    const sapBusinessOneConnectHtml = renderToStaticMarkup(
      <Dashboard
        data={data}
        page="sap-business-one-connect"
        sapBusinessOneConnect={{
          kind: "connected",
          accessMode: "read_write",
          authStrategy: "basic_auth",
          readableObjects: ["invoices", "customers", "payments"],
          writableObjects: ["payment writeback staging", "cash application writeback preview"],
          companyName: "Acme SAP B1",
          companyDatabase: "SBODEMO_PH",
          callbackStatus: "connected",
          callbackMessage: "Acme SAP B1 is now connected to Yield AROS.",
          testStatus: "success",
          testMessage: "Acme SAP B1 responded successfully.",
          latestSyncRun: {
            status: "succeeded",
            invoicesSyncedCount: 12,
            customersSyncedCount: 4,
            paymentsSyncedCount: 3,
            startedAt: "2026-04-10T09:00:00.000Z",
            completedAt: "2026-04-10T09:02:00.000Z",
          },
          recentSyncRuns: [
            {
              runId: "sap-run-1",
              status: "succeeded",
              syncScope: ["invoices", "customers", "payments"],
              invoicesSyncedCount: 12,
              customersSyncedCount: 4,
              paymentsSyncedCount: 3,
              startedAt: "2026-04-10T09:00:00.000Z",
              completedAt: "2026-04-10T09:02:00.000Z",
            },
          ],
          scheduler: {
            enabled: true,
            intervalMinutes: 15,
            running: false,
            nextRunAt: "2026-04-10T09:15:00.000Z",
          },
        }}
      />,
    );

    expect(inboxHtml).toContain("Tasks");
    expect(inboxHtml).toContain("Global task queue across collections, cash app, deductions, and operations");
    expect(inboxHtml).not.toContain("Advanced Filters");
    expect(inboxHtml).toContain("Follow up on overdue invoices");
    expect(inboxHtml).toContain("Pending Approval");
    expect(onboardingHtml).toContain("Guided Onboarding");
    expect(onboardingHtml).toContain("Same-day setup path");
    expect(onboardingHtml).toContain("Date,Cheque Number,Description,Amount,Balance,Category");
    expect(onboardingHtml).toContain('href="/invoices"');
    expect(onboardingHtml).not.toContain('href="/cash-app"');
    expect(accountHtml).toContain("Customer profile");
    expect(accountHtml).toContain("Workflow state");
    expect(accountHtml).toContain("Paused");
    expect(accountHtml).toContain("Promise to pay follow-up");
    expect(accountHtml).toContain("Human review required");
    expect(accountHtml).toContain("Workflow timeline");
    expect(accountHtml).toContain("Contact summary");
    expect(accountHtml).toContain("Credit profile");
    expect(accountHtml).toContain("Learning guidance");
    expect(accountHtml).toContain("Payment behavior:");
    expect(invoiceHtml).toContain("Invoice Details");
    expect(invoiceHtml).toContain("Customer Details");
    expect(invoiceHtml).toContain("Line Items");
    expect(invoiceHtml).toContain("No payments found for this invoice");
    expect(inventoryHtml).toContain("Screen inventory summary");
    expect(dataSourcesHtml).toContain("Data Sources");
    expect(dataSourcesHtml).toContain("action=\"/data-sources/uploads\"");
    expect(dataSourcesHtml).toContain("action=\"/data-sources/integrations\"");
    expect(integrationsHtml).toContain("Connect QuickBooks");
    expect(integrationsHtml).toContain("Connect SAP B1");
    expect(integrationsHtml).toContain("Connect Gmail");
    expect(integrationsHtml).toContain("/integrations/quickbooks");
    expect(integrationsHtml).toContain("/integrations/sap-business-one");
    expect(integrationsHtml).toContain("action=\"/integrations/email/connect\"");
    expect(quickBooksConnectHtml).toContain("Connect QuickBooks Online");
    expect(quickBooksConnectHtml).toContain("Connect production company");
    expect(quickBooksConnectHtml).toContain("Use sandbox company");
    expect(quickBooksConnectHtml).toContain("Read + Write");
    expect(quickBooksConnectHtml).toContain("Acme QuickBooks is now authorized for Yield AROS.");
    expect(quickBooksConnectHtml).not.toContain('href="/cash-app"');
    expect(quickBooksConnectHtml).toContain('href="/invoices"');
    expect(sapBusinessOneConnectHtml).toContain("Connect SAP Business One");
    expect(sapBusinessOneConnectHtml).toContain("Service Layer credentials");
    expect(sapBusinessOneConnectHtml).toContain("Test connection");
    expect(sapBusinessOneConnectHtml).toContain("Sync now");
    expect(sapBusinessOneConnectHtml).toContain("Recent sync runs");
    expect(sapBusinessOneConnectHtml).toContain("Acme SAP B1 is now connected to Yield AROS.");
    expect(sapBusinessOneConnectHtml).toContain("Every 15 minutes");
    expect(sapBusinessOneConnectHtml).not.toContain('href="/cash-app"');
    expect(sapBusinessOneConnectHtml).toContain('href="/invoices"');
  });

  it("keeps task IDs out of the main task table", async () => {
    const data = await loadOperatorConsoleData();
    data.taskQueue = [
      makeTaskFixture("task-visible-id", "Verify payment evidence", "INV-ID-001", "Medical Clinic Corp", {
        taskCode: "VISIBLE-ID-123",
      }),
    ];

    const html = renderToStaticMarkup(<Dashboard data={data} page="inbox" />);
    const tableHtml = extractTaskTableHtml(html);

    expect(tableHtml).toContain("Verify payment evidence");
    expect(tableHtml).toContain("Medical Clinic Corp");
    expect(tableHtml).not.toContain("Task ID");
    expect(tableHtml).not.toContain("VISIBLE-ID-123");
    expect(html).toContain("VISIBLE-ID-123");
  });

  it("filters invoice rows by search, status, type, more filter, and paginates 20 per page", async () => {
    const data = await loadOperatorConsoleData();
    data.invoiceIndex = {
      ...data.invoiceIndex,
      invoices: Array.from({ length: 25 }, (_, index) =>
        makeInvoiceFixture(`INV-${String(index + 1).padStart(3, "0")}`, "2026-05-30", 0, {
          customerName: index === 20 ? "Medical Supplies Co" : `Customer ${index + 1}`,
          billingAccountName: index === 20 ? "Medical Supplies Billing" : `Billing ${index + 1}`,
          status: index === 20 ? "open" : index % 2 === 0 ? "paid" : "open",
          importMode: index === 20 ? "manual_upload" : "live_connection",
          openAmountCents: index === 20 ? 12_500_00 : index % 2 === 0 ? 0 : 5_000_00,
          totalAmountCents: index === 20 ? 12_500_00 : 5_000_00,
        }),
      ),
    };

    const firstPageHtml = renderToStaticMarkup(<Dashboard data={data} page="invoices" />);
    expect(firstPageHtml).toContain("Showing 1-20 of 25");
    expect(firstPageHtml).toContain("INV-020");
    expect(firstPageHtml).not.toContain("INV-021");

    const secondPageHtml = renderToStaticMarkup(
      <Dashboard data={data} page="invoices" invoiceFilters={{ page: 2 }} />,
    );
    expect(secondPageHtml).toContain("Showing 21-25 of 25");
    expect(secondPageHtml).toContain("INV-021");

    const filteredHtml = renderToStaticMarkup(
      <Dashboard
        data={data}
        page="invoices"
        invoiceFilters={{ q: "medical 12500", status: "open", type: "manual_upload", more: "with_balance" }}
      />,
    );
    expect(filteredHtml).toContain("INV-021");
    expect(filteredHtml).toContain("Medical Supplies Co");
    expect(filteredHtml).toContain('href="/invoices/export?q=medical+12500&amp;status=open&amp;type=manual_upload&amp;more=with_balance"');
    expect(filteredHtml).not.toContain("INV-020");

    const emptyHtml = renderToStaticMarkup(
      <Dashboard data={data} page="invoices" invoiceFilters={{ status: "disputed", q: "medical" }} />,
    );
    expect(emptyHtml).toContain("No invoices match these filters.");
  });

  it("opens a guarded customer email compose modal with templates for verified contacts", async () => {
    const data = await loadOperatorConsoleData();
    const customer = makeCustomerFixture({
      profileId: "customer-email",
      canonicalName: "Email Customer",
      billingAccountId: "email-billing",
      primaryContactEmail: "ap.email@example.com",
      openInvoiceCount: 1,
    });
    data.customerIndex = [customer];
    data.invoiceIndex = {
      ...data.invoiceIndex,
      invoices: [
        makeInvoiceFixture("EMAIL-001", "2026-05-30", 0, {
          customerName: customer.canonicalName,
          billingAccountId: customer.billingAccountId,
          billingAccountName: customer.billingAccountName,
          openAmountCents: 15_000_00,
        }),
      ],
    };
    data.emailSendingIdentities = [
      {
        id: "sender-1",
        provider: "gmail",
        senderEmail: "collections@example.com",
        displayName: "Collections",
        authMode: "oauth",
        connectionStatus: "connected",
        permissionStatus: "ready",
        healthState: "healthy",
        isDefault: true,
        scopes: ["gmail.send"],
      },
    ];
    data.controlCenter.templates = [
      {
        id: "template-1",
        tenantId: "default",
        name: "Statement follow-up",
        channelCompatibility: ["email"],
        subject: "Statement for {{customer_company_name}}",
        body: "Hi {{customer_name}}, {{invoice_numbers}} remains open.",
        ccEmails: [],
        autoCorrectEnabled: true,
        isDefault: false,
        isArchived: false,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
    ];

    const html = renderToStaticMarkup(
      <Dashboard data={data} page="customers" customerId={customer.profileId} />,
    );

    expect(html).toContain('href="#customer-email-modal"');
    expect(html).toContain('action="/customers/email/send"');
    expect(html).toContain("ap.email@example.com");
    expect(html).toContain("Statement follow-up");
    expect(html).toContain("Statement for Email Customer");
    expect(html).not.toContain("/customers/email-task/create");
  });

  it("hides customer outreach controls unless the customer is enrolled and toggles the enrolled state", async () => {
    const data = await loadOperatorConsoleData();
    const customer = data.customerIndex[0] ?? makeCustomerFixture();
    data.customerIndex = [customer];
    data.controlCenter.workflows[0]!.executions = [];

    const notEnrolledHtml = renderToStaticMarkup(
      <Dashboard data={data} page="customers" customerId={customer.profileId} />,
    );
    expect(notEnrolledHtml).not.toContain("Pause Outreach");
    expect(notEnrolledHtml).not.toContain("Resume Outreach");

    data.controlCenter.workflows[0]!.executions = [
      {
        id: "customer-execution-active",
        tenantId: "default",
        version: 1,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
        workflowId: data.controlCenter.workflows[0]!.id,
        billingAccountId: customer.billingAccountId ?? customer.profileId,
        status: "active",
        currentTrack: "standard_reminders",
        lastDecisionAction: "continue",
        lastDecisionReason: "workflow_customer_enrolled",
        lastDecisionConfidence: 1,
        requiresHumanReview: false,
        rationaleSummary: "Workflow is active.",
        reasoningMetadata: {},
        metadata: {},
      },
    ];
    const activeHtml = renderToStaticMarkup(
      <Dashboard data={data} page="customers" customerId={customer.profileId} />,
    );
    expect(activeHtml).toContain('action="/customers/outreach/pause"');
    expect(activeHtml).toContain("Pause Outreach");

    data.controlCenter.workflows[0]!.executions[0]!.status = "paused";
    const pausedHtml = renderToStaticMarkup(
      <Dashboard data={data} page="customers" customerId={customer.profileId} />,
    );
    expect(pausedHtml).toContain('action="/customers/outreach/resume"');
    expect(pausedHtml).toContain("Resume Outreach");
  });

  it("filters task rows by status, type, priority, and search together", async () => {
    const data = await loadOperatorConsoleData();
    data.taskQueue = [
      makeTaskFixture("task-paid", "Verify payment evidence", "MCC-OD-001", "Medical Clinic Corp", {
        type: "collection",
        status: "open",
        priority: "high",
        brief: "Customer said payment was already made; verify remittance evidence.",
        sourceLabel: "Retell call",
      }),
      makeTaskFixture("task-deduction", "Review deduction support", "DM-001", "Retail Customer", {
        type: "deduction",
        status: "pending_approval",
        priority: "medium",
      }),
      makeTaskFixture("task-cash", "Match cash receipt", "PAY-001", "Cash Customer", {
        type: "cash_app",
        status: "open",
        priority: "low",
      }),
    ];

    const statusHtml = extractTaskTableHtml(renderToStaticMarkup(
      <Dashboard data={data} page="inbox" taskFilters={{ status: "pending_approval" }} />,
    ));
    expect(statusHtml).toContain("Review deduction support");
    expect(statusHtml).not.toContain("Verify payment evidence");

    const combinedHtml = extractTaskTableHtml(renderToStaticMarkup(
      <Dashboard
        data={data}
        page="inbox"
        taskFilters={{ status: "open", type: "collection", priority: "high", q: "medical remittance mcc-od-001" }}
      />,
    ));
    expect(combinedHtml).toContain("Verify payment evidence");
    expect(combinedHtml).not.toContain("Review deduction support");
    expect(combinedHtml).not.toContain("Match cash receipt");

    const emptyHtml = extractTaskTableHtml(renderToStaticMarkup(
      <Dashboard data={data} page="inbox" taskFilters={{ type: "cash_app", priority: "high" }} />,
    ));
    expect(emptyHtml).toContain("No tasks match these filters.");
  });

  it("defaults the Tasks page to active tasks, removes due dates, and exposes scoped search history controls", async () => {
    const data = await loadOperatorConsoleData();
    data.taskQueue = [
      makeTaskFixture("task-active", "Call active customer", "MCC-OD-001", "Medical Clinic Corp", {
        status: "open",
        dueDateLabel: "May 25, 05:00 PM",
      }),
      makeTaskFixture("task-completed", "Completed follow-up", "MCC-OD-002", "Medical Clinic Corp", {
        status: "completed",
        dueDateLabel: "May 26, 05:00 PM",
      }),
      makeTaskFixture("task-deleted", "Deleted duplicate follow-up", "MCC-OD-003", "Medical Clinic Corp", {
        status: "deleted",
        dueDateLabel: "May 27, 05:00 PM",
      }),
    ];

    const html = renderToStaticMarkup(<Dashboard data={data} page="inbox" />);
    const tableHtml = extractTaskTableHtml(html);

    expect(html).toContain("Active Tasks");
    expect(html).toContain('data-task-search-input="true"');
    expect(html).toContain('list="task-search-history"');
    expect(html).toContain('data-task-search-history-list="true"');
    expect(html).toContain('data-task-search-clear-history="true"');
    expect(tableHtml).toContain("Call active customer");
    expect(tableHtml).not.toContain("Completed follow-up");
    expect(tableHtml).not.toContain("Deleted duplicate follow-up");
    expect(tableHtml).not.toContain("Due Date");
    expect(tableHtml).not.toContain("May 25, 05:00 PM");
  });

  it("scopes task search history to the Tasks search bar and reuses selected searches", () => {
    const serverSource = readFileSync(new URL("../server.tsx", import.meta.url), "utf8");

    expect(serverSource).toContain("yield-aros.tasks.search-history.v1");
    expect(serverSource).toContain("data-task-search-input");
    expect(serverSource).toContain("data-task-search-history-list");
    expect(serverSource).toContain("form.requestSubmit()");
    expect(serverSource).toContain("data-task-search-clear-history");
  });

  it("keeps long call notes out of the primary task brief", async () => {
    const data = await loadOperatorConsoleData();
    data.taskQueue = [
      makeTaskFixture("task-long-brief", "Payment collection follow-up", "MCC-OD-001", "Medical Clinic Corp", {
        brief:
          "Customer said payment was already made; verify remittance or payment evidence before changing receivable state. Scope: MCC-OD-001: ₱128,750.00 due May 6, 2026 Recommended next action: Check remittance/payment records, match evidence to invoices, and update the account only after verification. Created from Retell call F5184D12. Call note: customer described a long call with bank transfer details.",
        recommendedNextAction:
          "Check remittance/payment records, match evidence to invoices, and update the account only after verification.",
        callContextLabel: "Retell call F5184D12",
        callContextDetail: "Medical Clinic Corp · May 25, 2026, 09:00 AM · Customer described bank transfer details.",
        transcriptSnippet: "Customer described a long call with bank transfer details.",
        sourceLabel: "Retell call",
      }),
    ];

    const html = renderToStaticMarkup(<Dashboard data={data} page="inbox" />);

    expect(html).toContain(
      "Customer said payment was already made; verify remittance or payment evidence before changing invoice status.",
    );
    expect(html).not.toContain("Source context");
    expect(html).not.toContain("Transcript summary: Customer described a long call with bank transfer details.");
    expect(html).not.toContain("Call note:");
    expect(html).not.toContain("Created from Retell call F5184D12.");
  });

  it("renders invoice detail for the selected invoice", async () => {
    const data = await loadOperatorConsoleData();
    const targetInvoice = addInvoiceDetailFixture(data);
    const html = renderToStaticMarkup(<Dashboard data={data} page="invoice-detail" />);

    expect(html).toContain(targetInvoice.invoiceNumber);
    expect(html).toContain(targetInvoice.customerName);
    expect(html).toContain(targetInvoice.billingAccountId);
  });

  it("renders captured promise-to-pay details on the invoice detail card", async () => {
    const data = await loadOperatorConsoleData();
    addInvoiceDetailFixture(data, {
        promiseToPayId: "ptp-test",
        promiseToPayDate: "2026-05-26",
        promiseToPayAmountCents: 128_750_00,
        promiseToPayCurrency: "PHP",
        promiseToPayState: "accepted",
        promiseToPayInvoiceCount: 3,
    });

    const html = renderToStaticMarkup(<Dashboard data={data} page="invoice-detail" />);

    expect(html).toContain("Payment Promised");
    expect(html).toContain("05/26/2026");
    expect(html).toContain("₱128,750.00");
    expect(html).toContain("Group promise");
    expect(html).toContain("3 invoices");
  });

  it("uses the selected invoice promise when multiple invoices share a billing account", async () => {
    const data = await loadOperatorConsoleData();
    const firstInvoice = addInvoiceDetailFixture(data);
    const promisedInvoice = {
      ...firstInvoice,
      id: "business_central:invoice-detail-promised",
      externalId: "invoice-detail-promised",
      canonicalInvoiceId: "invoice-detail-promised",
      invoiceNumber: "MCC-OD-002",
      totalAmountCents: 94_600_00,
      openAmountCents: 94_600_00,
      issuedAt: "2026-04-13",
      dueDate: "2026-05-13",
      daysPastDue: 9,
      metadata: {
        promiseToPayId: "ptp-selected",
        promiseToPayDate: "2026-05-23",
        promiseToPayAmountCents: 94_600_00,
        promiseToPayCurrency: "PHP",
        promiseToPayState: "accepted",
        promiseToPayInvoiceCount: 4,
      },
    };
    data.invoiceIndex = {
      ...data.invoiceIndex,
      invoices: [firstInvoice, promisedInvoice],
    };
    data.invoiceDetail = {
      ...data.invoiceDetail,
      invoiceNumber: promisedInvoice.invoiceNumber,
      amount: "₱94,600.00",
      dueDate: promisedInvoice.dueDate,
    };

    const html = renderToStaticMarkup(<Dashboard data={data} page="invoice-detail" />);

    expect(html).toContain("MCC-OD-002");
    expect(html).toContain("9 days overdue");
    expect(html).toContain("05/23/2026");
    expect(html).toContain("₱94,600.00");
    expect(html).toContain("Group promise");
    expect(html).not.toContain("Set Date");
  });

  it("renders adaptive workflow states for opt-out, track switching, and review flags", async () => {
    const data = await loadOperatorConsoleData();

    data.accountWorkspace.workflow = {
      workflowName: "Standard Overdue Collections",
      status: "opted_out",
      statusLabel: "Opted out",
      optOutReason: "Customer requested stop to all automated outreach",
      currentTrack: "Email only",
      latestDecisionLabel: "Switched to email-only track",
      latestDecisionAction: "switch_track",
      latestChangeBy: "human",
      humanReviewRequired: true,
      rationale: "Operator kept the account visible but blocked future automated calls after an explicit customer preference update.",
      evidenceSummary: "Calls suppressed because contact requested email only.",
      manualOverrideLabel: "Manual override",
      policySummary: {
        autoPauseOutcomes: ["Promise to pay"],
        trackSwitchOutcomes: ["Email only"],
        humanReviewOutcomes: ["Dispute detected"],
      },
      timeline: [
        {
          id: "timeline-1",
          title: "Calls suppressed because contact requested email only",
          summary: "Calls suppressed because contact requested email only.",
          at: "5 minutes ago",
          actor: "human",
          tags: ["Email only", "Manual override"],
        },
        {
          id: "timeline-2",
          title: "Moved to issue-resolution track because dispute detected",
          summary: "Moved to issue-resolution track because dispute detected.",
          at: "18 minutes ago",
          actor: "ai",
          tags: ["Track switch", "Dispute"],
        },
      ],
    };

    const html = renderToStaticMarkup(<Dashboard data={data} page="account-workspace" />);

    expect(html).toContain("Opted out");
    expect(html).toContain("Customer requested stop to all automated outreach");
    expect(html).toContain("Switched to email-only track");
    expect(html).toContain("Human review required");
    expect(html).toContain("Calls suppressed because contact requested email only");
    expect(html).toContain("Moved to issue-resolution track because dispute detected");
  });

  it("renders workflow enrollment controls for active and paused customers", async () => {
    const data = await loadOperatorConsoleData();
    const [firstCustomer, secondCustomer] = data.customerIndex;

    data.controlCenter.workflows[0]!.executions = [
      {
        id: "execution_active",
        tenantId: "default",
        version: 1,
        createdAt: "2026-01-15T09:00:00.000Z",
        updatedAt: "2026-01-15T09:00:00.000Z",
        workflowId: data.controlCenter.workflows[0]!.id,
        billingAccountId: firstCustomer?.billingAccountId ?? firstCustomer?.profileId ?? "customer-1",
        parentAccountId: "parent-1",
        status: "active",
        currentTrack: "standard_reminders",
        lastDecisionAction: "continue",
        lastDecisionReason: "workflow_customer_enrolled",
        lastDecisionConfidence: 1,
        requiresHumanReview: false,
        rationaleSummary: "Workflow is actively monitoring invoice follow-up timing.",
        reasoningMetadata: {},
        metadata: { lastChangedBy: "human" },
      },
      {
        id: "execution_paused",
        tenantId: "default",
        version: 1,
        createdAt: "2026-02-01T09:00:00.000Z",
        updatedAt: "2026-02-05T09:00:00.000Z",
        workflowId: data.controlCenter.workflows[0]!.id,
        billingAccountId: secondCustomer?.billingAccountId ?? secondCustomer?.profileId ?? "customer-2",
        parentAccountId: "parent-2",
        status: "paused",
        currentTrack: "promise_to_pay",
        lastDecisionAction: "pause",
        lastDecisionReason: "Customer promised payment by Friday.",
        lastDecisionConfidence: 0.94,
        requiresHumanReview: false,
        effectiveUntil: "2026-02-07T00:00:00.000Z",
        rationaleSummary: "Workflow is paused until the customer follow-up date.",
        reasoningMetadata: {},
        metadata: { lastChangedBy: "ai" },
      },
    ];
    data.controlCenter.workflows[0]!.approxTargetCount = 2;

    const html = renderToStaticMarkup(
      <Dashboard
        data={data}
        page="control-center"
        controlCenterExpandedWorkflowId={data.controlCenter.workflows[0]!.id}
      />,
    );

    expect(html).toContain("Enrolled Customers (2)");
    expect(html).toContain("Pause");
    expect(html).toContain("Resume");
    expect(html).toContain("Unenroll");
    expect(html).toContain("Paused");
    expect(html).toContain("Resume");
    expect(html).toContain("Select All");
    expect(html).toContain(firstCustomer?.billingAccountId ?? firstCustomer?.profileId ?? "customer-1");
    expect(html).toContain(secondCustomer?.billingAccountId ?? secondCustomer?.profileId ?? "customer-2");
  });

  it("renders the user management screen under Manage and hides Roles nav", async () => {
    const data = await loadOperatorConsoleData();
    data.accessControlAdmin = {
      users: [
        {
          id: "user_platform_admin",
          tenantId: "default",
          email: "platform.admin@yield.example",
          fullName: "Pat Reyes",
          status: "active",
          primaryRole: "Platform Admin",
          roleKeys: ["platform_admin"],
          scopeSummary: "Tenant-wide",
          approvalAuthoritySummary: "No explicit approval authority",
        },
      ],
      selectedUser: {
        id: "user_platform_admin",
        tenantId: "default",
        email: "platform.admin@yield.example",
        fullName: "Pat Reyes",
        status: "active",
        assignments: [
          {
            id: "assignment_1",
            roleKey: "platform_admin",
            roleLabel: "Platform Admin",
            scopeType: "tenant",
            grantedAt: "2026-04-20T00:00:00.000Z",
            grantedByUserId: "system",
          },
        ],
        approvalAuthorities: [],
        recentAuditEvents: [
          {
            id: "audit_1",
            occurredAt: "2026-04-20T00:00:00.000Z",
            action: "access_control.assignment.granted",
            actorId: "system",
            actorRole: "system",
            entityType: "user_role_assignment",
            entityId: "assignment_1",
            metadata: {},
          },
        ],
      },
      roles: [
        {
          key: "commercial_head",
          label: "Sales Manager",
          description: "Commercial leadership role.",
          isSystemRole: true,
          assignedUserCount: 1,
          permissions: [
            {
              key: "collections.templates.write",
              label: "templates write",
              description: "Permission to edit templates.",
              domain: "collections",
            },
          ],
          capabilitySummary: {
            view: ["collections.read"],
            edit: [],
            approve: ["approvals.decide_outreach"],
            configure: ["collections.templates.write", "collections.workflow_strategy.write"],
          },
        },
      ],
      permissions: [
        {
          key: "collections.templates.write",
          label: "templates write",
          description: "Permission to edit templates.",
          domain: "collections",
        },
      ],
      auditEvents: [
        {
          id: "audit_1",
          occurredAt: "2026-04-20T00:00:00.000Z",
          action: "access_control.assignment.granted",
          actorId: "system",
          actorRole: "system",
          entityType: "user_role_assignment",
          entityId: "assignment_1",
          metadata: {},
        },
      ],
      currentUserAccess: {
        userId: "user_platform_admin",
        roleKeys: ["platform_admin"],
        permissionKeys: ["users.manage", "roles.manage"],
        scopedPermissions: [],
        approvalAuthorities: [],
      },
    };

    const usersHtml = renderToStaticMarkup(<Dashboard data={data} page="admin-users" />);
    const homeHtml = renderToStaticMarkup(<Dashboard data={data} page="home" />);

    expect(usersHtml).toContain("Users &amp; Role Management");
    expect(usersHtml).toContain("Manage user access, roles, and permissions across your organization");
    expect(usersHtml).toContain("Total Users");
    expect(usersHtml).toContain("Access Scope");
    expect(usersHtml).not.toContain("Approval Authority");
    expect(usersHtml).toContain("Invite User");
    expect(homeHtml).toContain('href="/admin/users"');
    expect(homeHtml).not.toContain('href="/admin/roles"');
  });
});
