import React from "react";
import type {
  CallInboxDirection,
  CallInboxStatus,
  CustomerProfileTabId,
  InvoiceIndexEntry,
  InvoiceIndexMoreFilter,
  InvoiceIndexStatus,
  InvoiceIndexTypeFilter,
} from "@o2c/contracts";
import {
  addOperatorCalendarDays,
  diffOperatorCalendarDays,
  formatOperatorDate,
  formatOperatorDateKey,
  formatOperatorToday,
  normalizeOperatorDateKey,
  operatorDateKeyToDate,
  operatorMonthKey,
} from "./date-utils.js";
import type {
  ApprovalQueueItem,
  AutomationRuleItem,
  CashAppAllocationLine,
  CashAppBankTransaction,
  CashAppRemittanceItem,
  CashAppReviewRow,
  CollectionsQueueItem,
  EmailSendingIdentityItem,
  EmailConnectErrorState,
  EmailConnectStatusState,
  ExceptionQueueItem,
  FeedItem,
  IntegrationItem,
  OperatorAction,
  OperatorConsoleData,
  OdooConnectErrorState,
  PaymentQueueItem,
  QuickBooksConnectViewState,
  SapBusinessOneConnectViewState,
  ScreenState,
  SourceBadge,
  OdooConnectSelectionState,
  TaskQueueItem,
} from "./data.js";

export type DashboardPage =
  | "home"
  | "onboarding"
  | "inbox"
  | "analytics"
  | "borrowing"
  | "credit-facilities"
  | "loan-statement"
  | "loan-repayments"
  | "loan-alerts"
  | "loan-tasks"
  | "invoices"
  | "customers"
  | "collections"
  | "control-center"
  | "cash-application"
  | "exceptions"
  | "approvals"
  | "ai-activity"
  | "data-sources"
  | "integrations"
  | "quickbooks-connect"
  | "sap-business-one-connect"
  | "rules"
  | "account-workspace"
  | "invoice-detail"
  | "screen-inventory"
  | "admin-users"
  | "admin-roles";

export type TaskStatusFilter = TaskQueueItem["status"] | "active" | "all";
export type TaskTypeFilter = TaskQueueItem["type"] | "all";
export type TaskPriorityFilter = TaskQueueItem["priority"] | "all";
export type CollectionsEmailFolderFilter = "all" | "unread" | "sent" | "drafts";
export type CollectionsCallVoicemailFilter = "all" | "yes" | "no";
export type InvoiceStatusFilter = InvoiceIndexStatus | "all";

export interface TaskFilterInput {
  status?: TaskStatusFilter;
  type?: TaskTypeFilter;
  priority?: TaskPriorityFilter;
  q?: string;
}

export interface CollectionsEmailFilterInput {
  folder?: CollectionsEmailFolderFilter;
  customer?: string;
  workflow?: string;
  q?: string;
}

export interface CollectionsCallFilterInput {
  direction?: CallInboxDirection | "all";
  status?: CallInboxStatus | "all";
  voicemail?: CollectionsCallVoicemailFilter;
  customer?: string;
  classification?: string;
  workflow?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface InvoiceFilterInput {
  q?: string;
  status?: InvoiceStatusFilter;
  type?: InvoiceIndexTypeFilter;
  more?: InvoiceIndexMoreFilter;
  page?: number;
}

interface NormalizedTaskFilters {
  status: TaskStatusFilter;
  type: TaskTypeFilter;
  priority: TaskPriorityFilter;
  q: string;
}

interface DashboardProps {
  data: OperatorConsoleData;
  page?: DashboardPage;
  pathname?: string;
  cashAppTab?: string | undefined;
  analyticsTrend?: "weekly" | "monthly" | undefined;
  homeCalendarDate?: string | undefined;
  taskFilters?: TaskFilterInput | undefined;
  invoiceFilters?: InvoiceFilterInput | undefined;
  customerId?: string | undefined;
  customerTab?: string | undefined;
  odooConnect?: OdooConnectViewState;
  odooConnectError?: OdooConnectErrorViewState;
  emailConnectError?: EmailConnectErrorState;
  emailConnectStatus?: EmailConnectStatusState;
  quickbooksConnect?: QuickBooksConnectViewState;
  sapBusinessOneConnect?: SapBusinessOneConnectViewState;
  onboardingImportStatus?: OnboardingImportStatus;
  controlCenterTab?: "workflows" | "email-templates" | "call-agent" | "config";
  controlCenterExpandedWorkflowId?: string;
  controlCenterSelectedTemplateId?: string;
  controlCenterTemplateSearch?: string;
  controlCenterActionStatus?: "success" | "error";
  controlCenterActionMessage?: string;
  controlCenterEnrollModalWorkflowId?: string;
  controlCenterStageModalWorkflowId?: string;
  controlCenterStageModalChannel?: "email" | "call" | "sms";
  controlCenterStageModalTemplateMode?: "pre_saved_template" | "ai_generated";
  collectionsTab?: "email" | "call-inbox";
  collectionsEmailFilters?: CollectionsEmailFilterInput | undefined;
  collectionsCallFilters?: CollectionsCallFilterInput | undefined;
  customerCallStatus?: "started" | "failed";
  customerCallMessage?: string;
  customerEmailStatus?: "sent" | "approval_needed" | "failed";
  customerEmailMessage?: string;
}

export interface OnboardingImportStatus {
  lane: "accounts" | "invoices" | "payments";
  status: "success" | "error";
  importedCount?: number;
  heldCount?: number;
  reviewCount?: number;
  message: string;
  notes?: string[];
}

export type OdooConnectViewState = OdooConnectSelectionState | undefined;
export type OdooConnectErrorViewState = OdooConnectErrorState | undefined;

const sidebarNavigation = [
  {
    items: [
      ["home", "Home", "dashboard", "/"],
      ["inbox", "Tasks", "check", "/tasks"],
      ["analytics", "Analytics", "trend", "/analytics"],
    ],
  },
  {
    heading: "Workspace",
    items: [
      ["collections", "Collections", "collections", "/collections"],
      ["control-center", "Control Center", "rules", "/control-center"],
    ],
  },
  {
    heading: "Manage",
    items: [
      ["customers", "Customers", "customers", "/customers"],
      ["invoices", "Invoices", "invoice", "/invoices"],
      ["payments", "Payments", "cash", "/cash-app?tab=payments"],
      ["admin-users", "Users", "customers", "/admin/users"],
    ],
  },
] as const;

const hiddenMvpPaths = ["/onboarding", "/cash-app", "/deductions", "/credit-line", "/data-sources", "/approvals", "/rules"];

function isHiddenMvpPath(path: string) {
  return hiddenMvpPaths.some((hiddenPath) => path === hiddenPath || path.startsWith(`${hiddenPath}/`));
}

function isSidebarItemActive(
  key: (typeof sidebarNavigation)[number]["items"][number][0],
  page: DashboardPage,
  cashAppTab?: string | undefined,
) {
  if (key === "payments") {
    return page === "cash-application" && cashAppTab === "payments";
  }

  return page === key;
}

export const Dashboard = ({
  data,
  page = "home",
  pathname = "/",
  cashAppTab,
  analyticsTrend,
  homeCalendarDate,
  taskFilters,
  invoiceFilters,
  customerId,
  customerTab,
  odooConnect,
  odooConnectError,
  emailConnectError,
  emailConnectStatus,
  quickbooksConnect,
  sapBusinessOneConnect,
  onboardingImportStatus,
  controlCenterTab,
  controlCenterExpandedWorkflowId,
  controlCenterSelectedTemplateId,
  controlCenterTemplateSearch,
  controlCenterActionStatus,
  controlCenterActionMessage,
  controlCenterEnrollModalWorkflowId,
  controlCenterStageModalWorkflowId,
  controlCenterStageModalChannel,
  controlCenterStageModalTemplateMode,
  collectionsTab,
  collectionsEmailFilters,
  collectionsCallFilters,
  customerCallStatus,
  customerCallMessage,
  customerEmailStatus,
  customerEmailMessage,
}: DashboardProps) => (
  <>
    <style>{styles}</style>
    <main className="dashboard-app">
      <aside className="dashboard-sidebar">
        <a className="sidebar-brand" href="/">
          <div className="brand-icon">Y</div>
          <div>
            <p className="brand-title">Yield AROS</p>
            <p className="brand-subtitle">O2C Operating System</p>
          </div>
        </a>

        {sidebarNavigation.map((section, index) => (
          <React.Fragment key={("heading" in section ? section.heading : undefined) ?? `sidebar-section-${index}`}>
            {index > 0 ? <div className="sidebar-divider" /> : null}
            {"heading" in section ? <p className="sidebar-section-heading">{section.heading}</p> : null}
            <nav className="sidebar-nav" aria-label={"heading" in section ? section.heading : "Primary navigation"}>
              {section.items.map(([key, label, icon, href]) => (
                <a
                  key={key}
                  className={`sidebar-link${isSidebarItemActive(key, page, cashAppTab) ? " is-active" : ""}`}
                  href={href}
                >
                  <AppIcon name={icon} />
                  <span>{label}</span>
                </a>
              ))}
            </nav>
          </React.Fragment>
        ))}
      </aside>

      <div className="dashboard-main">
        {page !== "control-center" ? (
          <header className="topbar">
            <p className="topbar-date">Today: {formatTopbarDate()}</p>
            <div className="topbar-user">
              <span>Juan Cruz</span>
              <span className="user-badge">JC</span>
            </div>
          </header>
        ) : null}

        <div className="page-scroll">
          {renderPage(
            page,
            data,
            pathname,
            cashAppTab,
            analyticsTrend,
            homeCalendarDate,
            taskFilters,
            invoiceFilters,
            customerId,
            customerTab,
            odooConnect,
            odooConnectError,
            emailConnectError,
            emailConnectStatus,
            quickbooksConnect,
            sapBusinessOneConnect,
            onboardingImportStatus,
            controlCenterTab,
            controlCenterExpandedWorkflowId,
            controlCenterSelectedTemplateId,
            controlCenterTemplateSearch,
            controlCenterActionStatus,
            controlCenterActionMessage,
            controlCenterEnrollModalWorkflowId,
            controlCenterStageModalWorkflowId,
            controlCenterStageModalChannel,
            controlCenterStageModalTemplateMode,
            collectionsTab,
            collectionsEmailFilters,
            collectionsCallFilters,
            customerCallStatus,
            customerCallMessage,
            customerEmailStatus,
            customerEmailMessage,
          )}
        </div>
      </div>
    </main>
  </>
);

function renderPage(
  page: DashboardPage,
  data: OperatorConsoleData,
  pathname = "/",
  cashAppTab?: string | undefined,
  analyticsTrend?: "weekly" | "monthly" | undefined,
  homeCalendarDate?: string | undefined,
  taskFilters?: TaskFilterInput | undefined,
  invoiceFilters?: InvoiceFilterInput | undefined,
  customerId?: string | undefined,
  customerTab?: string | undefined,
  odooConnect?: OdooConnectViewState,
  odooConnectError?: OdooConnectErrorViewState,
  emailConnectError?: EmailConnectErrorState,
  emailConnectStatus?: EmailConnectStatusState,
  quickbooksConnect?: QuickBooksConnectViewState,
  sapBusinessOneConnect?: SapBusinessOneConnectViewState,
  onboardingImportStatus?: OnboardingImportStatus,
  controlCenterTab?: "workflows" | "email-templates" | "call-agent" | "config",
  controlCenterExpandedWorkflowId?: string,
  controlCenterSelectedTemplateId?: string,
  controlCenterTemplateSearch?: string,
  controlCenterActionStatus?: "success" | "error",
  controlCenterActionMessage?: string,
  controlCenterEnrollModalWorkflowId?: string,
  controlCenterStageModalWorkflowId?: string,
  controlCenterStageModalChannel?: "email" | "call" | "sms",
  controlCenterStageModalTemplateMode?: "pre_saved_template" | "ai_generated",
  collectionsTab?: "email" | "call-inbox",
  collectionsEmailFilters?: CollectionsEmailFilterInput | undefined,
  collectionsCallFilters?: CollectionsCallFilterInput | undefined,
  customerCallStatus?: "started" | "failed",
  customerCallMessage?: string,
  customerEmailStatus?: "sent" | "approval_needed" | "failed",
  customerEmailMessage?: string,
) {
  switch (page) {
    case "onboarding":
      return (
        <OnboardingPage
          data={data}
          {...(onboardingImportStatus ? { onboardingImportStatus } : {})}
        />
      );
    case "borrowing":
      return <BorrowingDashboardPage data={data} />;
    case "analytics":
      return <AnalyticsPage data={data} {...(analyticsTrend ? { trend: analyticsTrend } : {})} />;
    case "credit-facilities":
      return <CreditFacilitiesPage data={data} />;
    case "loan-statement":
      return <LoanStatementPage data={data} />;
    case "loan-repayments":
      return <LoanRepaymentsPage data={data} />;
    case "loan-alerts":
      return <LoanAlertsPage data={data} />;
    case "loan-tasks":
      return <LoanTasksPage data={data} />;
    case "collections":
      return (
        <CollectionsPage
          data={data}
          activeTab={collectionsTab ?? "email"}
          emailFilters={collectionsEmailFilters}
          callFilters={collectionsCallFilters}
        />
      );
    case "control-center":
      return (
        <ControlCenterPage
          data={data}
          {...(controlCenterTab ? { activeTab: controlCenterTab } : {})}
          {...(controlCenterExpandedWorkflowId ? { expandedWorkflowId: controlCenterExpandedWorkflowId } : {})}
          {...(controlCenterSelectedTemplateId ? { selectedTemplateId: controlCenterSelectedTemplateId } : {})}
          {...(controlCenterTemplateSearch ? { templateSearch: controlCenterTemplateSearch } : {})}
          {...(controlCenterActionStatus && controlCenterActionMessage
            ? { actionStatus: controlCenterActionStatus, actionMessage: controlCenterActionMessage }
            : {})}
          {...(controlCenterEnrollModalWorkflowId ? { enrollModalWorkflowId: controlCenterEnrollModalWorkflowId } : {})}
          {...(controlCenterStageModalWorkflowId ? { stageModalWorkflowId: controlCenterStageModalWorkflowId } : {})}
          {...(controlCenterStageModalChannel ? { stageModalChannel: controlCenterStageModalChannel } : {})}
          {...(controlCenterStageModalTemplateMode ? { stageModalTemplateMode: controlCenterStageModalTemplateMode } : {})}
        />
      );
    case "inbox":
      return <InboxPage data={data} filters={taskFilters} />;
    case "invoices":
      return <InvoicesPage data={data} filters={invoiceFilters} />;
    case "customers":
      return (
        <CustomersPage
          data={data}
          {...(customerId ? { selectedCustomerId: customerId } : {})}
          {...(customerTab ? { activeTab: customerTab } : {})}
          {...(customerCallStatus ? { callStatus: customerCallStatus } : {})}
          {...(customerCallMessage ? { callMessage: customerCallMessage } : {})}
          {...(customerEmailStatus ? { emailStatus: customerEmailStatus } : {})}
          {...(customerEmailMessage ? { emailMessage: customerEmailMessage } : {})}
        />
      );
    case "cash-application":
      return <CashApplicationPage data={data} {...(cashAppTab ? { tab: cashAppTab } : {})} />;
    case "exceptions":
      return <ExceptionsPage data={data} pathname={pathname} />;
    case "approvals":
      return <ApprovalsPage data={data} />;
    case "ai-activity":
      return <AIActivityPage data={data} />;
    case "data-sources":
      return <DataSourcesPage data={data} />;
    case "integrations":
      return (
        <IntegrationsPage
          data={data}
          odooConnect={odooConnect}
          odooConnectError={odooConnectError}
          {...(emailConnectError ? { emailConnectError } : {})}
          {...(emailConnectStatus ? { emailConnectStatus } : {})}
        />
      );
    case "quickbooks-connect":
      return (
        <QuickBooksConnectPage
          data={data}
          {...(quickbooksConnect ? { quickbooksConnect } : {})}
        />
      );
    case "sap-business-one-connect":
      return (
        <SapBusinessOneConnectPage
          data={data}
          {...(sapBusinessOneConnect ? { sapBusinessOneConnect } : {})}
        />
      );
    case "rules":
      return <RulesPage data={data} />;
    case "account-workspace":
      return <AccountWorkspacePage data={data} />;
    case "invoice-detail":
      return <InvoiceDetailPage data={data} />;
    case "screen-inventory":
      return <ScreenInventoryPage data={data} />;
    case "admin-users":
      return <AccessControlUsersPage data={data} pathname={pathname} />;
    case "admin-roles":
      return <AccessControlUsersPage data={data} pathname={pathname} />;
    case "home":
    default:
      return <CommandCenterPage data={data} calendarDate={homeCalendarDate} />;
  }
}

const OnboardingPage = ({
  data,
  onboardingImportStatus,
}: {
  data: OperatorConsoleData;
  onboardingImportStatus?: OnboardingImportStatus;
}) => {
  const importedAccounts = data.accountProfileSummaries.length;
  const importedInvoices = data.invoiceIndex.invoices.length;
  const importedPayments =
    data.cashApplicationQueue.summary.autoAppliedToday +
    data.cashApplicationQueue.summary.needsReview +
    data.cashApplicationQueue.summary.unmatched +
    data.cashApplicationQueue.summary.partialApplied;

  const milestones = [
    {
      id: "accounts",
      title: "1. Import accounts",
      detail: "Upload the billing-account hierarchy, branches, and primary AR contacts.",
      countLabel: `${importedAccounts} account workspaces available`,
      action: "/onboarding/import/accounts",
      accept: ".csv",
      template: "parent_account_name,billing_account_number,billing_account_name,branch_code,branch_name,contact_name,contact_email,contact_role",
    },
    {
      id: "invoices",
      title: "2. Import invoices",
      detail: "Load open invoices into the canonical model so cash app and collections work immediately.",
      countLabel: `${importedInvoices} invoices available`,
      action: "/onboarding/import/invoices",
      accept: ".csv",
      template: "invoice_number,customer_name,total_amount,open_amount,currency,due_date,invoice_date",
    },
    {
      id: "payments",
      title: "3. Import bank transactions",
      detail: "Upload bank transactions using the locked transaction schema for payment candidate creation.",
      countLabel: `${importedPayments} payment records in the cash app queue`,
      action: "/onboarding/import/payments",
      accept: ".csv",
      template: "Date,Cheque Number,Description,Amount,Balance,Category",
    },
  ] as const;

  return (
    <section className="page-section cash-page">
      <PageHeader
        title="Guided Onboarding"
        description="Get usable account, invoice, and payment data into the system in one same-day workflow."
        actionRow={
          <div className="header-actions">
            <a href="/customers" className="ghost-button">Open Customers</a>
            <a href="/invoices" className="primary-button">Open Invoices</a>
          </div>
        }
      />

      <div className="kpi-grid kpi-grid-3">
        <SimpleKpi title="Accounts ready" value={String(importedAccounts)} />
        <SimpleKpi title="Invoices ready" value={String(importedInvoices)} />
        <SimpleKpi title="Payments visible" value={String(importedPayments)} />
      </div>

      {onboardingImportStatus ? (
        <article className={`integration-${onboardingImportStatus.status === "success" ? "success" : "error"}-banner`}>
          <strong>{humanize(onboardingImportStatus.lane)} import {onboardingImportStatus.status}</strong>
          <p>{onboardingImportStatus.message}</p>
          <p>
            Imported: {onboardingImportStatus.importedCount ?? 0}
            {onboardingImportStatus.heldCount !== undefined ? ` • Held: ${onboardingImportStatus.heldCount}` : ""}
            {onboardingImportStatus.reviewCount !== undefined ? ` • Review: ${onboardingImportStatus.reviewCount}` : ""}
          </p>
          {onboardingImportStatus.notes?.length ? (
            <div className="data-source-review-notes">
              {onboardingImportStatus.notes.map((note) => <p key={note}>{note}</p>)}
            </div>
          ) : null}
        </article>
      ) : null}

      <article className="detail-card">
        <div className="panel-header">
          <h2>Same-day setup path</h2>
        </div>
        <div className="card-grid card-grid-3">
          {milestones.map((item) => (
            <article key={item.id} className="context-item">
              <div className="eyebrow">{item.title}</div>
              <strong>{item.countLabel}</strong>
              <p>{item.detail}</p>
              <form method="POST" action={item.action} encType="multipart/form-data" className="data-source-form">
                <label className="label-copy" htmlFor={`${item.id}-file`}>CSV file</label>
                <input
                  id={`${item.id}-file`}
                  name="file"
                  type="file"
                  className="form-input file-input"
                  accept={item.accept}
                  required
                />
                <input type="hidden" name="lane" value={item.id} />
                <button type="submit" className="primary-button">Upload {humanize(item.id)}</button>
              </form>
              <div className="data-source-upload-meta">
                <strong>Template headers</strong>
                <p>{item.template}</p>
              </div>
            </article>
          ))}
        </div>
      </article>

      <div className="card-grid card-grid-2">
        <article className="detail-card">
          <div className="panel-header">
            <h2>What counts as usable</h2>
          </div>
          <div className="data-source-list">
            <article className="data-source-row">
              <div className="data-source-row-copy">
                <strong>Accounts</strong>
                <p>Billing-account hierarchy, branches, and contacts appear in the customer workspace.</p>
              </div>
            </article>
            <article className="data-source-row">
              <div className="data-source-row-copy">
                <strong>Invoices</strong>
                <p>Invoices land in the unified index and are ready for cash application and collections routing.</p>
              </div>
            </article>
            <article className="data-source-row">
              <div className="data-source-row-copy">
                <strong>Payments</strong>
                <p>Bank transactions normalize into payment candidates and become visible in the cash app queue the same day.</p>
              </div>
            </article>
          </div>
        </article>

        <article className="detail-card">
          <div className="panel-header">
            <h2>Recovery path</h2>
          </div>
          <div className="data-source-list">
            <article className="data-source-row">
              <div className="data-source-row-copy">
                <strong>Held rows stay visible</strong>
                <p>Each import returns held-row counts and sample reasons instead of silently dropping bad records.</p>
              </div>
            </article>
            <article className="data-source-row">
              <div className="data-source-row-copy">
                <strong>Operator review remains safe</strong>
                <p>Imported payments still honor settlement, withholding, and writeback guardrails before final closure.</p>
              </div>
            </article>
            <article className="data-source-row">
              <div className="data-source-row-copy">
                <strong>Next actions are immediate</strong>
                <p>After upload, the customer can move straight to Customers, Invoices, and Cash App without waiting on hidden batch steps.</p>
              </div>
            </article>
          </div>
        </article>
      </div>
    </section>
  );
};

const CommandCenterPage = ({
  data,
  calendarDate,
}: {
  data: OperatorConsoleData;
  calendarDate?: string | undefined;
}) => {
  const setupItem = data.homeSetupChecklist.items[0];
  const byCustomerView = data.homeTaskSummary.views.find((view) => view.id === "by_customer") ?? data.homeTaskSummary.views[0];
  const openTasks = getCanonicalOpenTasks(data.taskQueue);
  const totalTaskCount = openTasks.length;
  const todayDateKey = formatOperatorDateKey();
  const selectedCalendarDateKey = normalizeOperatorDateKey(calendarDate) ?? todayDateKey;
  const calendar = buildHomeCalendar({
    data,
    selectedDateKey: selectedCalendarDateKey,
    todayDateKey,
  });
  const taskAgeBuckets = buildHomeTaskAgeBuckets({
    tasks: data.taskQueue,
    invoices: data.invoiceIndex.invoices,
    calls: data.callInbox.calls,
    todayDateKey,
  });
  const taskTypeBuckets = buildHomeTaskTypeBuckets(openTasks);
  const customerBuckets = buildHomeCustomerBuckets(openTasks, byCustomerView?.items ?? []);
  const dueTodaySummary = buildHomeDueTodaySummary({
    todayDateKey,
    invoices: data.invoiceIndex.invoices,
  });
  const respondToItems = buildHomeRespondToItems({
    todayDateKey,
    invoices: data.invoiceIndex.invoices,
    collectionsQueue: data.collectionsQueue,
    taskQueue: data.taskQueue,
    calls: data.callInbox.calls,
  });
  const collectSummary = {
    customers: data.homeSnapshotMetrics.openInvoiceCount,
    amountLabel: formatPhp(data.homeSnapshotMetrics.outstandingBalanceCents),
    actionPath: data.homeCollectionsMetrics.actionPath,
  };
  const weekCompletionPercent = 0;

  return (
    <section className="page-section home-page home-reference-page">
      <section className="home-reference-block">
        <div className="home-reference-heading">
          <h2>Getting set up</h2>
          {data.homeSetupChecklist.outstandingCount > 0 ? (
            <span className="home-reference-count">{data.homeSetupChecklist.outstandingCount}</span>
          ) : null}
        </div>
        <article className="home-reference-setup-card">
          <span className="home-reference-setup-check" aria-hidden="true" />
          <span>{setupItem?.title ?? "Enable sending and receiving emails through Stout."}</span>
        </article>
      </section>

      <section className="home-reference-block home-reference-tasks">
        <div className="home-reference-heading home-reference-heading-split">
          <div>
            <h2>Tasks</h2>
            <p>{weekCompletionPercent}% tasks completed this week</p>
          </div>
          <a href="/tasks" className="home-reference-link">
            {totalTaskCount} open tasks
          </a>
        </div>

        <article className="home-reference-calendar-card">
          <div className="home-reference-calendar-top">
            <div className="home-reference-calendar-title">
              <AppIcon name="clock" />
              <span>Calendar</span>
              <strong>{calendar.monthLabel}</strong>
              <a className="home-reference-pill" href="/">Today</a>
            </div>
            <div className="home-reference-calendar-actions">
              <a href={calendar.previousHref} className="home-reference-inline-button">Prev week</a>
              <a href={calendar.nextHref} className="home-reference-inline-button">Next week</a>
            </div>
          </div>
          <div className="home-reference-calendar-grid">
            <a href={calendar.previousHref} className="home-reference-calendar-nav" aria-label="Previous week">
              <AppIcon name="chevron-left" />
            </a>
            {calendar.days.map((day) => (
              <div key={day.dateKey} className={`home-reference-calendar-day${day.isActive ? " is-active" : ""}`}>
                <span>{day.isToday ? "Today" : day.weekday}</span>
                <strong>{day.label}</strong>
                {day.activity.totalCount > 0 ? (
                  <small title={day.activity.tooltip}>{day.activity.label}</small>
                ) : null}
              </div>
            ))}
            <a href={calendar.nextHref} className="home-reference-calendar-nav" aria-label="Next week">
              <AppIcon name="chevron-right" />
            </a>
          </div>
          {calendar.activityCount === 0 ? (
            <p className="home-reference-empty">No scheduled tasks, payments, outreach, or customer activity for this week.</p>
          ) : null}
        </article>

        <article className="home-reference-banner">
          <span>{dueTodaySummary.label}</span>
          <a href={dueTodaySummary.actionPath} className="home-reference-link">
            View
          </a>
        </article>

        <div className="home-reference-list-section">
          <div className="home-reference-heading home-reference-heading-slim">
            <h3>Respond to</h3>
          </div>
          <ul className="home-reference-bullets">
            {respondToItems.items.length > 0 ? (
              respondToItems.items.map((item, index) => (
                <li key={`${item.label}-${index}`}>
                  <span title={item.detail}>{item.label}</span>
                  <a href={item.actionPath} className="home-reference-link">{item.actionLabel}</a>
                </li>
              ))
            ) : (
              <li className="home-reference-empty-list-item">
                <span>No disputes, broken promises, or open customer tasks need response.</span>
              </li>
            )}
          </ul>
        </div>

        <div className="home-reference-chart-grid">
          <article className="home-reference-chart-card">
            <div className="home-reference-chart-header">
              <h3>Open Tasks by Age</h3>
              <button type="button" className="home-reference-kebab" aria-label="More options">⋮</button>
            </div>
            {taskAgeBuckets.totalCount > 0 ? (
              <div className="home-reference-bar-chart">
                <div className="home-reference-bar-axis">
                  {taskAgeBuckets.axis.map((tick) => (
                    <span key={tick}>{tick}</span>
                  ))}
                </div>
                <div className="home-reference-bar-columns">
                  {taskAgeBuckets.buckets.map((bucket) => (
                    <div
                      key={bucket.label}
                      className="home-reference-bar-column"
                      title={`${bucket.count} open task${pluralizeCount(bucket.count)} linked to ${bucket.label} invoices`}
                      aria-label={`${bucket.label}: ${bucket.count} open task${pluralizeCount(bucket.count)}`}
                      tabIndex={0}
                    >
                      <span className="chart-tooltip home-reference-chart-tooltip" role="tooltip">
                        <strong>{formatCount(bucket.count)}</strong>
                        <span>open task{pluralizeCount(bucket.count)} linked to {bucket.label} invoices</span>
                      </span>
                      <div className="home-reference-bar-rail">
                        <div className="home-reference-bar-fill" style={{ height: `${bucket.height}%` }} />
                      </div>
                      <span>{bucket.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="home-reference-chart-empty">No open tasks are linked to invoice aging buckets.</p>
            )}
          </article>

          <article className="home-reference-chart-card">
            <div className="home-reference-chart-header">
              <h3>Task types</h3>
              <button type="button" className="home-reference-kebab" aria-label="More options">⋮</button>
            </div>
            <div className="home-reference-donut-layout">
              {taskTypeBuckets.segments.length > 0 ? (
                <>
                  <HomeDonutChart segments={taskTypeBuckets.segments} />
                  <div className="home-reference-legend">
                    {taskTypeBuckets.segments.map((segment) => (
                      <div key={segment.label} className="home-reference-legend-row">
                        <i style={{ background: segment.color }} />
                        <span>{segment.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="home-reference-chart-empty">No task type data available.</p>
              )}
            </div>
          </article>

          <article className="home-reference-chart-card">
            <div className="home-reference-chart-header">
              <h3>Customers</h3>
              <button type="button" className="home-reference-kebab" aria-label="More options">⋮</button>
            </div>
            <div className="home-reference-donut-layout">
              {customerBuckets.segments.length > 0 ? (
                <>
                  <HomeDonutChart segments={customerBuckets.segments} />
                  <div className="home-reference-legend">
                    {customerBuckets.segments.map((segment) => (
                      <div key={segment.label} className="home-reference-legend-row">
                        <i style={{ background: segment.color }} />
                        <span>{segment.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="home-reference-chart-empty">No customer task data available.</p>
              )}
            </div>
          </article>
        </div>

        <div className="home-reference-list-section">
          <div className="home-reference-heading home-reference-heading-slim">
            <h3>Collect</h3>
          </div>
          <ul className="home-reference-bullets home-reference-bullets-single">
            <li>
              <span>
                <strong>{collectSummary.amountLabel}</strong> owed from {collectSummary.customers} customers
              </span>
              <a href={collectSummary.actionPath} className="home-reference-link">View</a>
            </li>
          </ul>
        </div>
      </section>
    </section>
  );
};

const AnalyticsPage = ({
  data,
  trend = "monthly",
}: {
  data: OperatorConsoleData;
  trend?: "weekly" | "monthly";
}) => {
  const analytics = buildAnalyticsViewModel(data, trend);

  return (
    <section className="page-section analytics-page" data-analytics-page data-analytics-trend={trend}>
      <PageHeader
        title="Analytics"
        description="Your accounts at a glance"
      />

      <div className="analytics-kpi-grid">
        <AnalyticsMetricCard
          title="Total Outstanding"
          value={formatPhpCompactLong(analytics.totalOutstandingCents)}
          tone="default"
        />
        <AnalyticsMetricCard
          title="Total Overdue"
          value={formatPhpCompactLong(analytics.overdueBalanceCents)}
          tone="danger"
        />
        <AnalyticsMetricCard
          title="Cash Collected (this month)"
          value={formatPhpCompactLong(analytics.cashCollectedThisMonthCents)}
          tone="success"
        />
        <AnalyticsMetricCard
          title="Invoices Followed Up On (this month)"
          value={formatCount(analytics.invoicesFollowedUpThisMonth)}
          tone="default"
        />
        <AnalyticsMetricCard
          title="Invoices Collected (this month)"
          value={formatCount(analytics.invoicesCollectedThisMonth)}
          tone="default"
        />
      </div>

      <article className="panel analytics-impact-panel">
        <div className="panel-header">
          <div>
            <h2>What has Yield done for you?</h2>
            <p className="label-copy">Impact of AI agents and one-click workflows</p>
          </div>
        </div>
        <div className="analytics-impact-grid">
          <AnalyticsImpactCard
            title="PHP collected with Yield"
            value={formatPhpCompactLong(analytics.yieldCollectedCents)}
            icon="currency"
            accent="info"
          />
          <AnalyticsImpactCard
            title="Yield collection rate"
            value={`${analytics.collectionsRate.toFixed(1)}%`}
            icon="trend"
            accent="violet"
          />
          <AnalyticsImpactCard
            title="Calls/emails automated"
            value={formatCount(analytics.automatedCommunicationsCount)}
            icon="mail"
            accent="success"
          />
        </div>
      </article>

      <div className="analytics-trends-header">
        <h2>Trends</h2>
        <div className="analytics-trend-toggle" role="tablist" aria-label="Analytics trend interval">
          <a
            href="/analytics?trend=weekly"
            className={`analytics-trend-pill${trend === "weekly" ? " is-active" : ""}`}
            aria-current={trend === "weekly" ? "page" : undefined}
            aria-selected={trend === "weekly"}
            data-analytics-trend-link
            data-analytics-trend-value="weekly"
            role="tab"
          >
            Weekly
          </a>
          <a
            href="/analytics?trend=monthly"
            className={`analytics-trend-pill${trend === "monthly" ? " is-active" : ""}`}
            aria-current={trend === "monthly" ? "page" : undefined}
            aria-selected={trend === "monthly"}
            data-analytics-trend-link
            data-analytics-trend-value="monthly"
            role="tab"
          >
            Monthly
          </a>
        </div>
      </div>

      <div className="analytics-grid analytics-grid-trends">
        <article className="panel analytics-panel analytics-chart-panel">
          <div className="panel-header">
            <div>
              <h2>Overdue Balance %</h2>
              <p className="label-copy">Represents the percentage of your total open balance that is overdue</p>
            </div>
          </div>
          <AnalyticsTrendChart
            ariaLabel="Overdue balance percentage trend"
            labels={analytics.periodLabels}
            series={[
              {
                label: "Overdue %",
                color: "#3b82f6",
                values: analytics.overdueBalanceTrend,
              },
            ]}
            yMin={0}
            yMax={100}
            tickFormatter={(value) => `${Math.round(value)}`}
            valueFormatter={(value) => `${Number(value.toFixed(1))}%`}
            hasData={analytics.overdueBalanceTrendHasData}
            emptyMessage="No open invoice due-date data is available for this period."
          />
        </article>

        <article className="panel analytics-panel analytics-chart-panel">
          <div className="panel-header">
            <div>
              <h2>Cash Collected</h2>
              <p className="label-copy">
                Represents the amount of money you have collected over time. The orange line represents collection that Yield assisted with.
              </p>
            </div>
          </div>
          <AnalyticsTrendChart
            ariaLabel="Cash collected trend"
            labels={analytics.periodLabels}
            series={[
              {
                label: "Total",
                color: "#6b7280",
                values: analytics.cashCollectedTrend,
              },
              {
                label: "Yield Assisted",
                color: "#f59e0b",
                values: analytics.yieldCollectedTrend,
              },
            ]}
            tickFormatter={(value) => formatChartMoneyMillions(value)}
            valueFormatter={(value) => formatPhp(value)}
            hasData={analytics.cashCollectedTrendHasData}
            emptyMessage="No payment or cash-application activity is available for this period."
          />
        </article>

        <article className="panel analytics-panel analytics-chart-panel">
          <div className="panel-header">
            <div>
              <h2>{trend === "weekly" ? "Weekly trend of DSO vs weighted average agreed terms" : "Monthly trend of DSO vs weighted average agreed terms"}</h2>
              <p className="label-copy">Days Sales Outstanding compared to agreed payment terms</p>
            </div>
          </div>
          <AnalyticsTrendChart
            ariaLabel="DSO versus weighted average agreed terms trend"
            labels={analytics.periodLabels}
            series={[
              {
                label: "DSO",
                color: "#3b82f6",
                values: analytics.dsoTrend,
              },
              {
                label: "Agreed Terms",
                color: "#10b981",
                values: analytics.agreedTermsTrend,
              },
            ]}
            tickFormatter={(value) => `${Math.round(value)}`}
            valueFormatter={(value) => `${Math.round(value)} days`}
            hasData={analytics.dsoTrendHasData}
            emptyMessage="No invoice issue-date data is available for this period."
          />
        </article>

        <article className="panel analytics-panel analytics-chart-panel">
          <div className="panel-header">
            <div>
              <h2>Top Customers by Balance</h2>
              <p className="label-copy">Largest outstanding balances</p>
            </div>
          </div>
          {analytics.topCustomers.length > 0 ? (
            <div className="analytics-customer-list">
              {analytics.topCustomers.map((customer, index) => (
                <div key={customer.key} className="analytics-customer-row">
                  <span className="analytics-customer-rank">{index + 1}</span>
                  <div className="analytics-customer-copy">
                    <div className="analytics-customer-title">
                      <strong>{customer.accountName}</strong>
                      <span>{formatPhpCompactLong(customer.openAmountCents)}</span>
                    </div>
                    <div
                      className="analytics-customer-bar"
                      tabIndex={0}
                      aria-label={`${customer.accountName}: ${formatPhp(customer.openAmountCents)} open balance`}
                    >
                      <span
                        style={{ width: `${customer.ratio * 100}%` }}
                        title={`${customer.accountName}: ${formatPhp(customer.openAmountCents)} open balance`}
                      />
                      <span className="chart-tooltip analytics-bar-tooltip" role="tooltip">
                        <strong>{formatPhp(customer.openAmountCents)}</strong>
                        <span>{customer.accountName}</span>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="analytics-empty-state">No customer balance data is available.</p>
          )}
        </article>
      </div>
    </section>
  );
};

const HomeDonutChart = ({
  segments,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
}) => {
  const total = Math.max(
    segments.reduce((sum, segment) => sum + segment.value, 0),
    1,
  );
  let offset = 0;
  const gradient = segments
    .map((segment) => {
      const start = offset;
      const end = offset + (segment.value / total) * 100;
      offset = end;
      return `${segment.color} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <div className="home-reference-donut-wrap">
      <div className="home-reference-donut" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="home-reference-donut-hole" />
      </div>
    </div>
  );
};

const CollectionsPage = ({
  data,
  activeTab,
  emailFilters,
  callFilters,
}: {
  data: OperatorConsoleData;
  activeTab: "email" | "call-inbox";
  emailFilters?: CollectionsEmailFilterInput | undefined;
  callFilters?: CollectionsCallFilterInput | undefined;
}) => {
  const isCallInboxActive = activeTab === "call-inbox";
  const callInbox = data.callInbox;
  const normalizedEmailFilters = normalizeCollectionsEmailFilters(emailFilters);
  const normalizedCallFilters = normalizeCollectionsCallFilters(callFilters ?? callInbox.filters);
  const emailInboxItems = buildCollectionsInboxItems(data);
  const visibleEmailInboxItems = filterCollectionsEmailItems(data, emailInboxItems, normalizedEmailFilters);
  const emailInboxCounts = buildCollectionsInboxCounts(emailInboxItems);
  const emailCustomerOptions = buildEmailCustomerFilterOptions(data);
  const filteredCallInboxItems = filterCallInboxItems(callInbox.items, normalizedCallFilters);
  const callCustomerOptions = buildCallFilterOptions(
    callInbox.items.map((item) => ({
      value: item.customerName,
      label: item.customerName,
    })),
  );
  const callClassificationOptions = buildCallFilterOptions(
    callInbox.items.flatMap((item) =>
      item.classifications.map((classification) => ({
        value: classification,
        label: classification,
      })),
    ),
  );
  const callWorkflowOptions = buildCallFilterOptions(
    callInbox.items
      .filter((item) => item.workflowName)
      .map((item) => ({
        value: item.workflowName ?? "",
        label: item.workflowName ?? "",
      })),
  );
  const hasEmailFilters = hasActiveCollectionsEmailFilters(normalizedEmailFilters);
  const hasCallFilters = hasActiveCollectionsCallFilters(normalizedCallFilters);
  const callDateRangeLabel = formatCallDateRangeLabel(normalizedCallFilters.dateFrom, normalizedCallFilters.dateTo);
  const senderIdentityOptions = data.emailSendingIdentities.filter(
    (identity) => identity.connectionStatus === "connected",
  );
  const defaultSenderIdentityId =
    data.emailInbox.selectedSenderIdentityId ??
    data.emailSendingIdentities.find((identity) => identity.isDefault)?.id ??
    senderIdentityOptions[0]?.id;
  const callsById = new Map(callInbox.calls.map((call) => [call.id, call]));
  const detailCalls = filteredCallInboxItems
    .map((item) => callsById.get(item.id) ?? callInbox.calls[0])
    .filter((call): call is NonNullable<typeof call> => Boolean(call));

  return (
    <section className="page-section cash-page">
      <article className="collections-workspace">
        <div className="collections-hero">
          <div className="collections-hero-copy">
            <h1>Collections</h1>
            <div className="collections-channel-tabs" role="tablist" aria-label="Collections channels">
              <a
                href="/collections?tab=email"
                className={`collections-channel-tab${isCallInboxActive ? "" : " is-active"}`}
                aria-selected={isCallInboxActive ? "false" : "true"}
              >
                <AppIcon name="mail" />
                <span>Email Inbox</span>
              </a>
              <a
                href="/collections?tab=call-inbox"
                className={`collections-channel-tab${isCallInboxActive ? " is-active" : ""}`}
                aria-selected={isCallInboxActive ? "true" : "false"}
              >
                <AppIcon name="phone" />
                <span>Call Inbox</span>
              </a>
            </div>
          </div>
        </div>
      </article>

      {!isCallInboxActive && (data.collectionsComposeStatus || data.collectionsComposeError) ? (
        <div className={`collections-compose-alert${data.collectionsComposeError ? " is-error" : " is-success"}`} role="status">
          <strong>
            {data.collectionsComposeError
              ? "Email not sent"
              : data.collectionsComposeStatus?.kind === "attachment_ready"
                ? "Draft updated"
                : "Email sent"}
          </strong>
          <span>{data.collectionsComposeError?.message ?? data.collectionsComposeStatus?.message}</span>
        </div>
      ) : null}

      {isCallInboxActive ? null : (
      <article id="collections-email-inbox" className="collections-email-inbox-card" aria-label="Collections email inbox">
        <div className="collections-email-head">
          <div>
            <h2>Email Inbox</h2>
            <p>Review customer threads, linked tasks, and safe reply drafts from connected mailboxes.</p>
          </div>
          <div className="collections-filter-bar collections-email-tabs" role="tablist" aria-label="Email inbox folders">
            <a
              href={buildCollectionsEmailHref({ ...normalizedEmailFilters, folder: "all" })}
              className={`collections-filter-pill${normalizedEmailFilters.folder === "all" ? " is-active" : ""}`}
              aria-selected={normalizedEmailFilters.folder === "all" ? "true" : "false"}
            >
              All
              <span className="collections-filter-count">{emailInboxCounts.all}</span>
            </a>
            <a
              href={buildCollectionsEmailHref({ ...normalizedEmailFilters, folder: "unread" })}
              className={`collections-filter-pill${normalizedEmailFilters.folder === "unread" ? " is-active" : ""}`}
              aria-selected={normalizedEmailFilters.folder === "unread" ? "true" : "false"}
            >
              Unread
              <span className="collections-filter-count dark">{emailInboxCounts.unread}</span>
            </a>
            <a
              href={buildCollectionsEmailHref({ ...normalizedEmailFilters, folder: "sent" })}
              className={`collections-filter-pill${normalizedEmailFilters.folder === "sent" ? " is-active" : ""}`}
              aria-selected={normalizedEmailFilters.folder === "sent" ? "true" : "false"}
            >
              Sent
              <span className="collections-filter-count dark">{emailInboxCounts.sent}</span>
            </a>
            <a
              href={buildCollectionsEmailHref({ ...normalizedEmailFilters, folder: "drafts" })}
              className={`collections-filter-pill${normalizedEmailFilters.folder === "drafts" ? " is-active" : ""}`}
              aria-selected={normalizedEmailFilters.folder === "drafts" ? "true" : "false"}
            >
              Drafts
              <span className="collections-filter-count dark">{emailInboxCounts.drafts}</span>
            </a>
          </div>
        </div>

        <form method="get" action="/collections" className="collections-email-toolbar" role="search">
          <input type="hidden" name="tab" value="email" />
          <input type="hidden" name="folder" value={normalizedEmailFilters.folder} />
          <label className="collections-searchbox">
            <AppIcon name="search" />
            <input
              type="search"
              name="q"
              placeholder="Search customer, email, invoice, or thread..."
              aria-label="Search email inbox"
              defaultValue={normalizedEmailFilters.q}
            />
          </label>
          <label className="collections-email-select">
            <span>Customer</span>
            <select name="customer" defaultValue={normalizedEmailFilters.customer}>
              <option value="all">All customers</option>
              {emailCustomerOptions.map((customer) => (
                <option key={customer.value} value={customer.value}>{customer.label}</option>
              ))}
            </select>
          </label>
          <div className="collections-filter-actions">
            <button type="submit" className="primary-button">Apply</button>
            {hasEmailFilters ? <a className="ghost-button" href="/collections?tab=email">Clear</a> : null}
          </div>
        </form>

        <div className="collections-inbox-list collections-email-list">
          {visibleEmailInboxItems.length > 0 ? (
            visibleEmailInboxItems.map((item) => {
              const modalId = collectionsEmailModalId(item);
              const threadHref = item.providerThreadId
                ? `${buildCollectionsEmailHref(normalizedEmailFilters, { threadId: item.providerThreadId })}#${modalId}`
                : `#${modalId}`;
              return (
                <a
                  key={item.id}
                  className={`collections-inbox-row collections-email-row is-${item.bucket === "unread" ? "unread" : "read"}${item.isLinked ? "" : " is-unlinked"}`}
                  href={threadHref}
                >
                  <span className="collections-row-checkbox" aria-hidden="true" />
                  <div className="collections-message-copy">
                    <div className="collections-message-heading">
                      <strong>{item.customerName}</strong>
                      {item.isLinked ? (
                        <span className="collections-linked-badge" title="Linked to customer context">
                          <AppIcon name="external-link" />
                        </span>
                      ) : (
                        <span className="collections-unlinked-badge">Unlinked</span>
                      )}
                      {item.bucket === "unread" ? <span className="collections-email-unread-dot">Unread</span> : null}
                    </div>
                    <p className="collections-message-address">{item.email}</p>
                    <p className="collections-message-subject">{item.subjectLine ?? "No subject"}</p>
                    <p className="collections-message-preview">{item.preview}</p>
                  </div>
                  <div className="collections-message-meta collections-email-row-meta">
                    <span>{item.receivedLabel}</span>
                    <span>{item.owner}</span>
                  </div>
                </a>
              );
            })
          ) : (
            <div className="collections-inbox-empty collections-email-empty">
              <strong>{emailInboxItems.length > 0 ? "No email threads match these filters." : "No email threads loaded."}</strong>
              <span>
                {emailInboxItems.length > 0
                  ? "Clear or adjust the filters to review other synced customer threads."
                  : "Connect a Gmail mailbox or sync inbox messages to populate this operational view."}
              </span>
            </div>
          )}
        </div>

        <div className="collections-inbox-footer">
          <span>
            {visibleEmailInboxItems.length > 0
              ? `1 - ${visibleEmailInboxItems.length} of ${emailInboxItems.length}`
              : "0 - 0 of 0"}
          </span>
        </div>
      </article>
      )}

      {isCallInboxActive ? null : visibleEmailInboxItems.map((item, index) => (
        <CollectionsEmailThreadModal
          key={`collections-email-modal-${item.id}`}
          data={data}
          item={item}
          previousItem={visibleEmailInboxItems[index - 1]}
          nextItem={visibleEmailInboxItems[index + 1]}
          senderIdentityOptions={senderIdentityOptions}
          defaultSenderIdentityId={defaultSenderIdentityId}
        />
      ))}

      {isCallInboxActive ? (
      <>
      <form method="get" action="/collections" className="call-inbox-toolbar">
        <input type="hidden" name="tab" value="call-inbox" />
        <div className="call-inbox-filter-row">
          <label className="collections-email-select call-inbox-filter">
            <span>Direction</span>
            <select name="direction" defaultValue={normalizedCallFilters.direction}>
              <option value="all">All directions</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label className="collections-email-select call-inbox-filter">
            <span>Customer</span>
            <select name="customer" defaultValue={normalizedCallFilters.customer}>
              <option value="all">All customers</option>
              {callCustomerOptions.map((customer) => (
                <option key={customer.value} value={customer.value}>{customer.label}</option>
              ))}
            </select>
          </label>
          <label className="collections-email-select call-inbox-filter">
            <span>Classification</span>
            <select name="classification" defaultValue={normalizedCallFilters.classification}>
              <option value="all">All categories</option>
              {callClassificationOptions.map((classification) => (
                <option key={classification.value} value={classification.value}>{classification.label}</option>
              ))}
            </select>
          </label>
          <label className="collections-email-select call-inbox-filter">
            <span>Workflow</span>
            <select name="workflow" defaultValue={normalizedCallFilters.workflow}>
              <option value="all">All workflows</option>
              {callWorkflowOptions.map((workflow) => (
                <option key={workflow.value} value={workflow.value}>{workflow.label}</option>
              ))}
            </select>
          </label>
          <fieldset className="call-inbox-date-range" aria-label="Call date range">
            <legend>Date range</legend>
            <label>
              <span>Start</span>
              <input type="date" name="dateFrom" defaultValue={normalizedCallFilters.dateFrom} />
            </label>
            <label>
              <span>End</span>
              <input type="date" name="dateTo" defaultValue={normalizedCallFilters.dateTo} />
            </label>
            {callDateRangeLabel ? (
              <div className="call-inbox-date-range-label">
                <span>{callDateRangeLabel}</span>
                <a href={buildCallInboxHref({ ...normalizedCallFilters, date: "", dateFrom: "", dateTo: "" })}>Clear dates</a>
              </div>
            ) : null}
          </fieldset>
          <label className="collections-email-select call-inbox-filter compact">
            <span>Status</span>
            <select name="status" defaultValue={normalizedCallFilters.status}>
              <option value="all">All statuses</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="needs_review">Needs review</option>
              <option value="failed">Failed</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="collections-email-select call-inbox-filter compact">
            <span>Voicemail</span>
            <select name="voicemail" defaultValue={normalizedCallFilters.voicemail}>
              <option value="all">All</option>
              <option value="yes">Voicemail</option>
              <option value="no">No voicemail</option>
            </select>
          </label>
        </div>
        <div className="call-inbox-toolbar-actions">
          <button type="submit" className="primary-button">Apply</button>
          {hasCallFilters ? <a className="ghost-button" href="/collections?tab=call-inbox">Clear</a> : null}
          <a className="primary-button call-inbox-export" href={buildCallInboxExportHref(normalizedCallFilters, callInbox.exportPath)}>
            <AppIcon name="download" />
            <span>Export</span>
          </a>
        </div>
      </form>

      <article id="collections-call-inbox" className="call-inbox-table-card" aria-label="Collections call inbox">
        <div className="call-inbox-table">
          <div className="call-inbox-row call-inbox-head">
            <span className="call-inbox-sort">↕</span>
            <span>Date</span>
            <span>Customer</span>
            <span>Phone</span>
            <span>Duration</span>
            <span>Voicemail</span>
            <span>Sentiment</span>
            <span>Categories</span>
            <span>Open Tasks</span>
            <span>Approver</span>
            <span>Status</span>
          </div>

          {filteredCallInboxItems.length > 0 ? (
            filteredCallInboxItems.map((item) => (
              <a
                key={item.id}
                className="call-inbox-row call-inbox-data-row"
                href={`#call-detail-${item.id}`}
              >
                <span className="call-inbox-sort">↕</span>
                <span>{formatRelativeCallTime(item.startedAt)}</span>
                <strong>{item.customerName}</strong>
                <span>{item.customerPhone ?? "Unknown"}</span>
                <span>{formatCallDuration(item.durationSeconds)}</span>
                <span className="call-inbox-boolean">{item.voicemail ? "✓" : "×"}</span>
                <span className={`call-sentiment-dot is-${item.sentiment}`}>
                  {sentimentSymbol(item.sentiment)}
                </span>
                <span className="call-inbox-tags">
                  {item.classifications.length > 0
                    ? item.classifications.map((classification) => (
                        <span key={classification} className="call-inbox-tag">
                          {classification}
                        </span>
                      ))
                    : "None"}
                </span>
                <span>
                  <span className="call-inbox-count">{item.openTasksCount}</span>
                </span>
                <span className="call-inbox-approver">{item.approverName ? item.approverName : "○"}</span>
                <span className={`call-status-chip is-${item.status}`}>{callStatusLabel(item.status)}</span>
              </a>
            ))
          ) : (
            <div className="call-inbox-empty">
              <strong>{callInbox.items.length > 0 ? "No calls match these filters." : "No completed calls yet."}</strong>
              <span>
                {callInbox.items.length > 0
                  ? "Clear or adjust the filters to review other normalized call records."
                  : "Retell webhook and sync ingestion will populate this inbox after calls finish."}
              </span>
            </div>
          )}
        </div>

        <div className="collections-inbox-footer">
          <span>
            {filteredCallInboxItems.length > 0 ? `1 - ${filteredCallInboxItems.length} of ${callInbox.total}` : "0 - 0 of 0"}
          </span>
        </div>
      </article>
      </>
      ) : null}

      {isCallInboxActive ? detailCalls.map((call) => {
        const tasks = bucketCallTasks(call.taskRefs);
        const openTasks = tasks.open.length > 0 ? tasks.open : call.taskRefs;
        return (
          <React.Fragment key={`call-modal-${call.id}`}>
            <section id={`call-detail-${call.id}`} className="collections-compose-modal call-detail-modal">
              <a className="collections-compose-backdrop" href="#" aria-label="Close call details" />
              <article className="call-detail-panel" role="dialog" aria-modal="true" aria-labelledby={`call-detail-title-${call.id}`}>
                <a className="collections-compose-close call-detail-close" href="#" aria-label="Close call details">
                  <AppIcon name="close" />
                </a>
                <div className="call-detail-tabs" role="tablist" aria-label="Call detail tabs">
                  <a className="call-detail-tab is-active" href={`#call-detail-${call.id}`}>Call Details</a>
                  <a className="call-detail-tab" href={`#call-transcript-${call.id}`}>Transcript</a>
                </div>
                <div className="call-detail-title-row">
                  <h2 id={`call-detail-title-${call.id}`}>Call Details</h2>
                  <span className={`call-status-chip is-${call.status}`}>{callStatusLabel(call.status)}</span>
                </div>

                <div className="call-detail-grid">
                  <CallDetailField label="Customer" value={call.customerName} />
                  <CallDetailField label="Invoices" value={formatInvoiceRefs(call.invoiceRefs)} />
                  <CallDetailField label="Date" value={formatCallDateTime(call.startedAt)} />
                  <CallDetailField label="Direction" value={titleCase(call.direction)} />
                  <CallDetailField label="From" value={call.fromNumber ?? "Unknown"} />
                  <CallDetailField label="To" value={call.toNumber ?? call.customerPhone ?? "Unknown"} />
                  <CallDetailField label="Duration" value={formatCallDuration(call.durationSeconds)} />
                  <CallDetailField label="Classifications" value={formatList(call.classifications)} />
                  <CallDetailField label="User Sentiment" value={sentimentSymbol(call.sentiment)} />
                  <CallDetailField label="Voicemail" value={call.voicemail ? "✓" : "×"} />
                  <CallDetailField label="Billing Account" value={call.billingAccountId ?? "Unknown"} />
                  <CallDetailField label="Requested By" value={call.requestedBy ?? "Unknown"} />
                </div>

                <div className="call-detail-divider" />
                <section className="call-detail-section">
                  <h3>Summary</h3>
                  <p>{call.summary ?? "No summary was provided by Retell yet."}</p>
                </section>

                <div className="call-detail-divider" />
                <section className="call-detail-section">
                  <h3>Tasks</h3>
                  <div className="call-task-tabs" role="tablist" aria-label="Call task status">
                    <span className="call-task-tab is-active">Open <strong>{tasks.open.length}</strong></span>
                    <span className="call-task-tab">Completed <strong>{tasks.completed.length}</strong></span>
                    <span className="call-task-tab">Closed <strong>{tasks.closed.length}</strong></span>
                  </div>
                  <div className="call-task-list">
                    {openTasks.length > 0 ? (
                      openTasks.map((task) => (
                        <div key={task.id} className="call-task-row">
                          <AppIcon name="check" />
                          <strong>{task.title}</strong>
                          <span>{task.taskType ? titleCase(task.taskType.replace(/_/g, " ")) : "Task"}</span>
                          <span>{task.ownerTeam ?? "collections"}</span>
                          <AppIcon name="chevron-right" />
                        </div>
                      ))
                    ) : (
                      <p className="call-detail-muted">No open tasks are linked to this call.</p>
                    )}
                  </div>
                </section>
              </article>
            </section>

            <section id={`call-transcript-${call.id}`} className="collections-compose-modal call-detail-modal">
              <a className="collections-compose-backdrop" href="#" aria-label="Close transcript" />
              <article className="call-detail-panel call-transcript-panel" role="dialog" aria-modal="true" aria-labelledby={`call-transcript-title-${call.id}`}>
                <a className="collections-compose-close call-detail-close" href="#" aria-label="Close transcript">
                  <AppIcon name="close" />
                </a>
                <div className="call-detail-tabs" role="tablist" aria-label="Call transcript tabs">
                  <a className="call-detail-tab" href={`#call-detail-${call.id}`}>Call Details</a>
                  <a className="call-detail-tab is-active" href={`#call-transcript-${call.id}`}>Transcript</a>
                </div>
                <div className="call-audio-bar">
                  {call.recordingUrl ? (
                    <audio controls src={call.recordingUrl}>
                      <a href={call.recordingUrl}>Recording</a>
                    </audio>
                  ) : (
                    <>
                      <span className="call-play-icon">▷</span>
                      <span className="call-waveform" aria-hidden="true">
                        {Array.from({ length: 44 }).map((_, index) => (
                          <i key={index} style={{ height: `${14 + (index % 7) * 4}px` }} />
                        ))}
                      </span>
                      <span>{formatCallDuration(call.durationSeconds)}</span>
                    </>
                  )}
                  {call.recordingUrl ? (
                    <a className="call-recording-download" href={call.recordingUrl}>
                      <AppIcon name="download" />
                    </a>
                  ) : null}
                </div>
                <h2 id={`call-transcript-title-${call.id}`} className="sr-only">Transcript</h2>
                <div className="call-transcript-list">
                  {call.transcriptSegments.length > 0 ? (
                    call.transcriptSegments.map((segment, index) => (
                      <div key={`${segment.speaker}-${index}`} className="call-transcript-segment">
                        <strong>{titleCase(segment.speaker === "unknown" ? "speaker" : segment.speaker)}</strong>
                        <p>{segment.text}</p>
                      </div>
                    ))
                  ) : (
                    <p className="call-detail-muted">Retell has not provided a transcript for this call yet.</p>
                  )}
                </div>
              </article>
            </section>
          </React.Fragment>
        );
      }) : null}
    </section>
  );
};

const CallDetailField = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="call-detail-field">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const CollectionsEmailThreadModal = ({
  data,
  item,
  previousItem,
  nextItem,
  senderIdentityOptions,
  defaultSenderIdentityId,
}: {
  data: OperatorConsoleData;
  item: CollectionsInboxListItem;
  previousItem: CollectionsInboxListItem | undefined;
  nextItem: CollectionsInboxListItem | undefined;
  senderIdentityOptions: EmailSendingIdentityItem[];
  defaultSenderIdentityId: string | undefined;
}) => {
  const modalId = collectionsEmailModalId(item);
  const threadTabId = `${modalId}-thread-tab`;
  const tasksTabId = `${modalId}-tasks-tab`;
  const threadMessages = buildCollectionsEmailThreadMessages(data, item);
  const tasks = findEmailInboxTasks(data, item);
  const openInvoiceCount = item.relatedInvoices.length;
  const openBalanceCents = item.relatedInvoices.reduce((sum, invoice) => sum + invoice.openAmountCents, 0);
  const overdueBalanceCents = item.relatedInvoices.reduce(
    (sum, invoice) => sum + (invoice.overdueAmountCents ?? 0),
    0,
  );
  const subjectLine = item.subjectLine?.startsWith("Re:")
    ? item.subjectLine
    : `Re: ${item.subjectLine ?? item.customerName}`;
  const draftBody = buildCollectionsEmailDraft(item);
  const appliedDraft =
    data.collectionsComposeDraft?.composeId === modalId ? data.collectionsComposeDraft : undefined;
  const activeSubjectLine = appliedDraft?.subjectLine ?? subjectLine;
  const activeBody = appliedDraft?.body ?? draftBody;
  const activeGenerator = appliedDraft?.generator ?? "ai";
  const activeAttachments = appliedDraft?.attachments ?? [];
  const composeContext = buildCollectionsEmailComposeContext(data, item);
  const emailTemplates = getAvailableCollectionsEmailTemplates(data);
  const canSend =
    Boolean(defaultSenderIdentityId) &&
    Boolean(item.providerThreadId) &&
    item.email !== "No email address";

  return (
    <section id={modalId} className="collections-compose-modal collections-email-modal">
      <a className="collections-compose-backdrop" href="#" aria-label="Close email thread" />
      <article className="collections-compose-panel collections-email-panel" role="dialog" aria-modal="true" aria-labelledby={`${modalId}-title`}>
        <div className="collections-compose-header collections-email-modal-header">
          <div>
            <div className="collections-email-customer-header">
              <span className="collections-email-avatar">{initialsForName(item.customerName)}</span>
              <div>
                <h2 id={`${modalId}-title`}>{item.customerName}</h2>
                <p>{item.email}</p>
              </div>
            </div>
            <div className="collections-email-summary-strip">
              <span>{openInvoiceCount} open invoices</span>
              <span>{formatPhp(openBalanceCents)} balance</span>
              <span>{formatPhp(overdueBalanceCents)} overdue</span>
            </div>
          </div>
          <div className="collections-email-modal-actions">
            <a className={`task-detail-nav-button${previousItem ? "" : " is-disabled"}`} href={previousItem ? `#${collectionsEmailModalId(previousItem)}` : "#"} aria-label="Previous email thread">
              <AppIcon name="chevron-left" />
            </a>
            <a className={`task-detail-nav-button${nextItem ? "" : " is-disabled"}`} href={nextItem ? `#${collectionsEmailModalId(nextItem)}` : "#"} aria-label="Next email thread">
              <AppIcon name="chevron-right" />
            </a>
            <a className="collections-compose-close" href="#" aria-label="Close email thread">
              <AppIcon name="close" />
            </a>
          </div>
        </div>

        <div className="collections-email-body">
          <div className="collections-email-invoice-row">
            <span>Invoice references</span>
            <div>
              {item.relatedInvoices.length > 0 ? (
                item.relatedInvoices.slice(0, 6).map((invoice) => (
                  <a key={invoice.invoiceNumber} href={`/invoices?invoice=${encodeURIComponent(invoice.invoiceNumber)}`}>
                    {invoice.invoiceNumber}
                  </a>
                ))
              ) : (
                <strong>No invoices linked</strong>
              )}
            </div>
          </div>

          <input className="collections-email-tab-control" type="radio" name={`${modalId}-tab`} id={threadTabId} value="thread" defaultChecked />
          <input className="collections-email-tab-control" type="radio" name={`${modalId}-tab`} id={tasksTabId} value="tasks" />
          <div className="collections-email-modal-tabs" role="tablist" aria-label="Email thread detail">
            <label htmlFor={threadTabId} className="collections-email-modal-tab">Email Thread</label>
            <label htmlFor={tasksTabId} className="collections-email-modal-tab">
              Tasks <span>{tasks.length}</span>
            </label>
          </div>

          <div className="collections-email-tab-panels">
            <div className="collections-email-tab-panel is-thread">
              <div className="collections-email-thread-list">
                {threadMessages.map((message) => (
                  <details key={message.providerMessageId} className="collections-email-thread-message">
                    <summary>
                      <span className="collections-email-thread-summary-main">
                        <strong>{formatEmailMessageActor(message)}</strong>
                        <span>{formatCollectionsMessageTime(message.receivedAt)}</span>
                      </span>
                      <span className="collections-email-thread-snippet">
                        {message.snippet ?? message.subjectLine ?? "No message preview available."}
                      </span>
                    </summary>
                    <div className="collections-email-thread-full-body">
                      {message.bodyText ?? message.snippet ?? "No message body was returned by the mailbox provider."}
                    </div>
                  </details>
                ))}
              </div>

              <form method="post" action="/collections/compose" encType="multipart/form-data" className="collections-compose-form collections-email-compose-form">
                <input type="hidden" name="composeId" value={modalId} />
                <input type="hidden" name="providerThreadId" value={item.providerThreadId ?? ""} />
                <input type="hidden" name="providerMessageId" value={item.providerMessageId ?? ""} />
                <input type="hidden" name="contactEmail" value={item.email === "No email address" ? "" : item.email} />
                <input type="hidden" name="contactName" value={item.contactName ?? item.customerName} />
                <input type="hidden" name="accountName" value={item.customerName} />
                <input type="hidden" name="billingAccountId" value={item.billingAccountId ?? item.relatedInvoices[0]?.billingAccountId ?? item.id} />
                <input type="hidden" name="parentAccountId" value={item.parentAccountId ?? item.relatedInvoices[0]?.parentAccountId ?? item.billingAccountId ?? item.id} />
                <input type="hidden" name="accountNumber" value={item.accountNumber ?? item.billingAccountId ?? item.id} />
                <input type="hidden" name="currency" value={item.relatedInvoices[0]?.currency ?? "PHP"} />
                <input type="hidden" name="accountJson" value={JSON.stringify(composeContext.account)} />
                <input type="hidden" name="contactJson" value={JSON.stringify(composeContext.contact)} />
                <input type="hidden" name="invoicesJson" value={JSON.stringify(composeContext.invoices)} />
                {activeAttachments.map((attachment) => (
                  <input
                    key={`${attachment.kind}-${attachment.spec}-${attachment.label}`}
                    type="hidden"
                    name="collectionsComposeDraftAttachment"
                    value={`${attachment.kind}|${attachment.spec}|${attachment.label}`}
                  />
                ))}

                <div className="collections-email-compose-head">
                  <div className="collections-email-generation-toggle" role="group" aria-label="Draft generation mode">
                    <label>
                      <input type="radio" name="composeGenerator" value="ai" defaultChecked={activeGenerator === "ai"} />
                      <span>AI</span>
                    </label>
                    <label>
                      <input type="radio" name="composeGenerator" value="template" defaultChecked={activeGenerator === "template"} />
                      <span>Template</span>
                    </label>
                  </div>
                </div>

                <div className="collections-email-template-panel">
                  {emailTemplates.length > 0 ? (
                    <>
                      <label className="collections-email-field">
                        <span>Email template</span>
                        <select data-collections-email-template-select data-email-template-select defaultValue="">
                          <option value="">Choose a Control Center template</option>
                          {emailTemplates.map((template) => (
                            <option
                              key={template.id}
                              value={template.id}
                              data-template-subject={renderCollectionsTemplateText(template.subject, item)}
                              data-template-body={renderCollectionsTemplateText(template.body, item)}
                            >
                              {template.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="button" className="ghost-button" data-collections-email-template-apply data-email-template-apply>
                        Apply template
                      </button>
                    </>
                  ) : (
                    <div className="collections-email-empty compact">
                      <strong>No email templates available.</strong>
                      <span>Create an email-compatible template in Control Center to use it here.</span>
                    </div>
                  )}
                </div>

                <div className="collections-compose-grid">
                  <label className="collections-email-field">
                    <span>From</span>
                    <select name="senderIdentityId" defaultValue={defaultSenderIdentityId ?? ""} required>
                      {senderIdentityOptions.length > 0 ? (
                        senderIdentityOptions.map((identity) => (
                          <option key={identity.id} value={identity.id}>
                            {identity.displayName ? `${identity.displayName} <${identity.senderEmail}>` : identity.senderEmail}
                          </option>
                        ))
                      ) : (
                        <option value="">No connected mailbox</option>
                      )}
                    </select>
                  </label>
                  <label className="collections-email-field">
                    <span>To</span>
                    <input name="toEmail" type="email" defaultValue={item.email === "No email address" ? "" : item.email} readOnly />
                  </label>
                  <label className="collections-email-field collections-email-subject-field">
                    <span>Thread subject</span>
                    <input
                      name="subjectLine"
                      defaultValue={activeSubjectLine}
                      required
                      readOnly
                      aria-readonly="true"
                      data-thread-reply-subject
                    />
                    <small>Locked for this thread reply.</small>
                  </label>
                </div>

                <div className="collections-email-format-actions" aria-label="Email formatting tools">
                  <button type="button" title="Bold" data-email-format-command="bold">B</button>
                  <button type="button" title="Italic" data-email-format-command="italic">I</button>
                  <button type="button" title="Underline" data-email-format-command="underline">U</button>
                  <button type="button" title="Hyperlink" data-email-format-command="link">
                    <AppIcon name="external-link" />
                  </button>
                  <label className="collections-email-attachment-upload" htmlFor={`${modalId}-attachments`}>
                    <AppIcon name="paperclip" />
                    <span>Upload file</span>
                  </label>
                </div>

                <label className="collections-email-field collections-email-body-field">
                  <span>Body</span>
                  <textarea name="bodyPreview" className="collections-compose-textarea" defaultValue={activeBody} data-email-body />
                </label>

                <div className="collections-email-attachment-panel">
                  <div className="collections-email-attachment-controls">
                    <label className="collections-email-field">
                      <span>Invoice documents</span>
                      <select
                        name="selectedInvoiceNumbers"
                        defaultValue={item.relatedInvoices.map((invoice) => invoice.invoiceNumber)}
                        multiple
                        size={Math.min(Math.max(item.relatedInvoices.length, 2), 4)}
                      >
                        {item.relatedInvoices.length > 0 ? (
                          item.relatedInvoices.map((invoice) => (
                            <option key={`${modalId}-${invoice.invoiceNumber}`} value={invoice.invoiceNumber}>
                              {invoice.invoiceNumber}
                            </option>
                          ))
                        ) : (
                          <option value="" disabled>No linked invoices</option>
                        )}
                      </select>
                    </label>
                    <div className="collections-email-document-buttons">
                      <button
                        type="submit"
                        className="ghost-button"
                        name="attachmentKind"
                        value="invoice"
                        formAction="/collections/compose/prepare-attachment"
                        formNoValidate
                      >
                        Attach invoice(s)
                      </button>
                      <button
                        type="submit"
                        className="ghost-button"
                        name="attachmentKind"
                        value="soa"
                        formAction="/collections/compose/prepare-attachment"
                        formNoValidate
                      >
                        Attach SOA
                      </button>
                    </div>
                  </div>
                  <input
                    id={`${modalId}-attachments`}
                    type="file"
                    name="attachments"
                    className="collections-email-file-input"
                    multiple
                  />
                  <div className="collections-email-attachment-chips" aria-label="Attached documents">
                    {activeAttachments.length > 0 ? (
                      activeAttachments.map((attachment) => (
                        <span key={`${attachment.kind}-${attachment.spec}`} className="collections-email-attachment-chip">
                          <AppIcon name="paperclip" />
                          {attachment.label}
                        </span>
                      ))
                    ) : (
                      <span>No generated invoice or SOA attachments yet.</span>
                    )}
                  </div>
                </div>

                <div className="collections-compose-footer">
                  <a className="ghost-button" href="#">Discard</a>
                  <button type="submit" className="primary-button" disabled={!canSend}>
                    Send
                  </button>
                </div>
              </form>
            </div>

            <div className="collections-email-tab-panel is-tasks">
              <div className="collections-email-task-list">
                {tasks.length > 0 ? (
                  tasks.map((task) => (
                    <a key={task.id} className="collections-email-task-row" href={`#task-detail-${task.id}`}>
                      <div>
                        <strong>{task.title}</strong>
                        <span>{task.brief ?? task.relatedRecord ?? task.amountLabel}</span>
                      </div>
                      <span className={`pill ${taskStatusClassName(task.status)}`}>{humanize(task.status)}</span>
                    </a>
                  ))
                ) : (
                  <div className="collections-email-empty compact">
                    <strong>No linked tasks.</strong>
                    <span>Tasks created from post-call or email workflows will appear here.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
};

function bucketCallTasks(tasks: OperatorConsoleData["callInbox"]["calls"][number]["taskRefs"]) {
  return {
    open: tasks.filter((task) => task.status === "open"),
    completed: tasks.filter((task) => task.status === "completed"),
    closed: tasks.filter((task) => task.status === "closed" || task.status === "dismissed"),
  };
}

function formatInvoiceRefs(invoiceRefs: OperatorConsoleData["callInbox"]["calls"][number]["invoiceRefs"]) {
  return invoiceRefs.length > 0 ? invoiceRefs.map((invoice) => invoice.invoiceNumber).join(" ") : "None linked";
}

function formatList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "None";
}

function formatRelativeCallTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  const diffMinutes = Math.round((Date.now() - timestamp) / 60_000);
  if (diffMinutes < 1) {
    return "Just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minutes ago`;
  }
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function formatCallDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function formatCallDuration(value: number | undefined) {
  if (value === undefined) {
    return "--:--";
  }
  const minutes = Math.floor(value / 60).toString().padStart(2, "0");
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function sentimentSymbol(value: string) {
  if (value === "positive") {
    return "☺";
  }
  if (value === "negative") {
    return "!";
  }
  if (value === "neutral") {
    return "•";
  }
  return "?";
}

function callStatusLabel(value: string) {
  return titleCase(value.replace(/_/g, " "));
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (match) => match.toUpperCase());
}

const DEFAULT_INVOICE_PAGE_SIZE = 20;

const invoiceStatusFilterOptions: Array<{ value: InvoiceStatusFilter; label: string }> = [
  { value: "all", label: "All Status" },
  { value: "open", label: "Open" },
  { value: "partial", label: "Partial" },
  { value: "disputed", label: "Disputed" },
  { value: "paid", label: "Paid" },
  { value: "voided", label: "Voided" },
];

const invoiceTypeFilterOptions: Array<{ value: InvoiceIndexTypeFilter; label: string }> = [
  { value: "all", label: "All Types" },
  { value: "live_connection", label: "Live ERP" },
  { value: "manual_upload", label: "Manual upload" },
  { value: "seed_fallback", label: "Demo seed" },
  { value: "installment_plan", label: "Installment plan" },
  { value: "standard_invoice", label: "Standard invoice" },
];

const invoiceMoreFilterOptions: Array<{ value: InvoiceIndexMoreFilter; label: string }> = [
  { value: "all", label: "More Filters" },
  { value: "overdue", label: "Overdue" },
  { value: "due_today", label: "Due today" },
  { value: "due_soon", label: "Due in 7 days" },
  { value: "with_promise", label: "With promise" },
  { value: "with_balance", label: "With balance" },
  { value: "with_branch", label: "With branch" },
  { value: "missing_branch", label: "Missing branch" },
];

const InvoicesPage = ({
  data,
  filters,
}: {
  data: OperatorConsoleData;
  filters?: InvoiceFilterInput | undefined;
}) => {
  const { invoiceIndex } = data;
  const normalizedFilters = normalizeInvoiceFilters(filters);
  const filteredInvoices = filterInvoices(invoiceIndex.invoices, normalizedFilters);
  const totalPages = Math.max(Math.ceil(filteredInvoices.length / DEFAULT_INVOICE_PAGE_SIZE), 1);
  const currentPage = Math.min(normalizedFilters.page, totalPages);
  const pageInvoices = filteredInvoices.slice(
    (currentPage - 1) * DEFAULT_INVOICE_PAGE_SIZE,
    currentPage * DEFAULT_INVOICE_PAGE_SIZE,
  );
  const openInvoices = filteredInvoices.filter((invoice) => invoice.openAmountCents > 0);
  const overdueInvoices = openInvoices.filter((invoice) => (invoice.daysPastDue ?? 0) > 0);
  const overdueOpenBalanceCents = overdueInvoices.reduce((sum, invoice) => sum + invoice.openAmountCents, 0);
  const filteredSummary = {
    openInvoiceCount: openInvoices.length,
    openAmountCents: filteredInvoices.reduce((sum, invoice) => sum + invoice.openAmountCents, 0),
  };
  const exportHref = buildInvoiceExportHref(normalizedFilters);

  return (
    <section className="page-section invoice-ledger-page">
      <div className="invoice-ledger-header">
        <div className="invoice-ledger-title">
          <h1>Invoices</h1>
          <p>Complete invoice ledger across all customers</p>
        </div>
        <a href={exportHref} className="invoice-ledger-button" download>
          <AppIcon name="download" />
          <span>Export</span>
        </a>
      </div>

      <form className="invoice-ledger-toolbar" method="get" action="/invoices">
        <label className="invoice-ledger-search">
          <AppIcon name="search" />
          <input
            type="search"
            name="q"
            defaultValue={normalizedFilters.q}
            aria-label="Search invoices"
            placeholder="Search by invoice number, customer, account, amount..."
          />
        </label>
        <select className="invoice-ledger-select" name="status" defaultValue={normalizedFilters.status} aria-label="Filter by invoice status">
          {invoiceStatusFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select className="invoice-ledger-select" name="type" defaultValue={normalizedFilters.type} aria-label="Filter by invoice type">
          {invoiceTypeFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select className="invoice-ledger-select" name="more" defaultValue={normalizedFilters.more} aria-label="More invoice filters">
          {invoiceMoreFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button type="submit" className="invoice-ledger-button invoice-ledger-button-filter">
          <AppIcon name="filter" />
          <span>Apply</span>
        </button>
        {hasActiveInvoiceFilters(normalizedFilters) ? (
          <a className="invoice-ledger-button invoice-ledger-button-filter" href="/invoices">Reset</a>
        ) : null}
      </form>

      <div className="invoice-ledger-card">
        <div className="invoice-ledger-table invoice-ledger-table-header">
          <div className="invoice-ledger-head invoice-ledger-head-checkbox">
            <input type="checkbox" aria-label="Select all invoices" />
          </div>
          <div className="invoice-ledger-head">Number</div>
          <div className="invoice-ledger-head">Customer</div>
          <div className="invoice-ledger-head">Due Date</div>
          <div className="invoice-ledger-head">Issue Date</div>
          <div className="invoice-ledger-head">Paid Date</div>
          <div className="invoice-ledger-head">Promise To Pay</div>
          <div className="invoice-ledger-head">Status</div>
        </div>

        {pageInvoices.map((invoice: InvoiceIndexEntry) => (
          <InvoiceIndexRow key={invoice.id} invoice={invoice} customers={data.customerIndex} />
        ))}

        {pageInvoices.length === 0 ? (
          <div className="invoice-ledger-empty">
            <strong>No invoices match these filters.</strong>
            <span>Adjust search or filters to widen the invoice ledger.</span>
          </div>
        ) : null}

        <div className="invoice-ledger-summary">
          <div className="invoice-ledger-summary-block">
            <span>Open Invoices</span>
            <strong>{filteredSummary.openInvoiceCount}</strong>
          </div>
          <div className="invoice-ledger-summary-block">
            <span>Overdue Open Invoices</span>
            <strong className="is-danger">{overdueInvoices.length}</strong>
          </div>
          <div className="invoice-ledger-summary-block">
            <span>Open Balance</span>
            <strong>{formatPhp(filteredSummary.openAmountCents)}</strong>
          </div>
          <div className="invoice-ledger-summary-block">
            <span>Overdue Open Balance</span>
            <strong className="is-danger">{formatPhp(overdueOpenBalanceCents)}</strong>
          </div>
        </div>

        <div className="invoice-ledger-pagination">
          <span>
            Showing {filteredInvoices.length === 0 ? 0 : (currentPage - 1) * DEFAULT_INVOICE_PAGE_SIZE + 1}
            {"-"}
            {Math.min(currentPage * DEFAULT_INVOICE_PAGE_SIZE, filteredInvoices.length)}
            {" of "}
            {filteredInvoices.length}
          </span>
          <div>
            <a
              className={`invoice-ledger-page-link${currentPage <= 1 ? " is-disabled" : ""}`}
              href={buildInvoiceIndexHref(normalizedFilters, Math.max(currentPage - 1, 1))}
              aria-disabled={currentPage <= 1}
            >
              Previous
            </a>
            <span>Page {currentPage} of {totalPages}</span>
            <a
              className={`invoice-ledger-page-link${currentPage >= totalPages ? " is-disabled" : ""}`}
              href={buildInvoiceIndexHref(normalizedFilters, Math.min(currentPage + 1, totalPages))}
              aria-disabled={currentPage >= totalPages}
            >
              Next
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

function normalizeInvoiceFilters(filters?: InvoiceFilterInput | undefined) {
  return {
    q: filters?.q?.trim() ?? "",
    status: filters?.status ?? "all",
    type: filters?.type ?? "all",
    more: filters?.more ?? "all",
    page: filters?.page && filters.page > 0 ? Math.floor(filters.page) : 1,
  } satisfies Required<InvoiceFilterInput>;
}

function hasActiveInvoiceFilters(filters: Required<InvoiceFilterInput>) {
  return filters.q.length > 0 || filters.status !== "all" || filters.type !== "all" || filters.more !== "all";
}

function filterInvoices(
  invoices: OperatorConsoleData["invoiceIndex"]["invoices"],
  filters: Required<InvoiceFilterInput>,
) {
  const todayDateKey = formatOperatorDateKey(new Date());
  return invoices.filter((invoice) => {
    if (filters.status !== "all" && invoice.status !== filters.status) {
      return false;
    }
    if (filters.type !== "all" && !invoiceMatchesTypeFilter(invoice, filters.type)) {
      return false;
    }
    if (filters.more !== "all" && !invoiceMatchesMoreFilter(invoice, filters.more, todayDateKey)) {
      return false;
    }
    if (filters.q && !invoiceMatchesSearchFilter(invoice, filters.q)) {
      return false;
    }
    return true;
  });
}

function invoiceMatchesTypeFilter(
  invoice: OperatorConsoleData["invoiceIndex"]["invoices"][number],
  filter: Exclude<InvoiceIndexTypeFilter, "all">,
) {
  switch (filter) {
    case "live_connection":
    case "manual_upload":
    case "seed_fallback":
      return invoice.importMode === filter;
    case "installment_plan":
      return Boolean(invoice.installmentPlanId) || invoice.tags.includes("installment-plan");
    case "standard_invoice":
      return !invoice.installmentPlanId && !invoice.tags.includes("installment-plan");
  }
}

function invoiceMatchesMoreFilter(
  invoice: OperatorConsoleData["invoiceIndex"]["invoices"][number],
  filter: Exclude<InvoiceIndexMoreFilter, "all">,
  todayDateKey: string,
) {
  switch (filter) {
    case "overdue":
      return invoice.openAmountCents > 0 && ((invoice.daysPastDue ?? 0) > 0 || Boolean(invoice.dueDate && invoice.dueDate < todayDateKey));
    case "due_today":
      return invoice.openAmountCents > 0 && invoice.dueDate === todayDateKey;
    case "due_soon": {
      if (!invoice.dueDate || invoice.openAmountCents <= 0) {
        return false;
      }
      const sevenDaysFromToday = addOperatorCalendarDays(todayDateKey, 7);
      return invoice.dueDate >= todayDateKey && invoice.dueDate <= sevenDaysFromToday;
    }
    case "with_promise":
      return Boolean(
        invoice.metadata.promiseToPayId ??
        invoice.metadata.promiseToPayDate ??
        invoice.tags.find((tag) => tag.toLowerCase() === "promise-to-pay"),
      );
    case "with_balance":
      return invoice.openAmountCents > 0;
    case "with_branch":
      return Boolean(invoice.branchId || invoice.branchName);
    case "missing_branch":
      return !invoice.branchId && !invoice.branchName;
  }
}

function invoiceMatchesSearchFilter(
  invoice: OperatorConsoleData["invoiceIndex"]["invoices"][number],
  query: string,
) {
  const haystack = buildInvoiceSearchText(invoice);
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

function buildInvoiceSearchText(invoice: OperatorConsoleData["invoiceIndex"]["invoices"][number]) {
  const metadataValues = Object.entries(invoice.metadata ?? {})
    .filter(([key, value]) =>
      ["string", "number", "boolean"].includes(typeof value) &&
      /invoice|account|customer|reference|po|so|email|contact|external|branch|promise/i.test(key),
    )
    .map(([, value]) => String(value));
  return [
    invoice.invoiceNumber,
    invoice.customerName,
    invoice.customerReference,
    invoice.billingAccountId,
    invoice.billingAccountName,
    invoice.parentAccountId,
    invoice.parentAccountName,
    invoice.branchId,
    invoice.branchName,
    invoice.status,
    invoice.sourceStatus,
    invoice.sourceLabel,
    invoice.sourceProvider,
    invoice.importMode,
    invoice.dueDate,
    invoice.issuedAt,
    invoice.externalId,
    invoice.canonicalInvoiceId,
    ...invoice.tags,
    ...metadataValues,
    formatInvoiceAmountSearchText(invoice.totalAmountCents),
    formatInvoiceAmountSearchText(invoice.openAmountCents),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function formatInvoiceAmountSearchText(cents: number) {
  const amount = cents / 100;
  return [
    amount.toFixed(2),
    amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    formatPhp(cents),
  ].join(" ");
}

function buildInvoiceIndexHref(filters: Required<InvoiceFilterInput>, page: number) {
  const params = buildInvoiceFilterSearchParams(filters);
  if (page > 1) {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query ? `/invoices?${query}` : "/invoices";
}

function buildInvoiceExportHref(filters: Required<InvoiceFilterInput>) {
  const params = buildInvoiceFilterSearchParams(filters);
  const query = params.toString();
  return query ? `/invoices/export?${query}` : "/invoices/export";
}

function buildInvoiceFilterSearchParams(filters: Required<InvoiceFilterInput>) {
  const params = new URLSearchParams();
  if (filters.q) {
    params.set("q", filters.q);
  }
  if (filters.status !== "all") {
    params.set("status", filters.status);
  }
  if (filters.type !== "all") {
    params.set("type", filters.type);
  }
  if (filters.more !== "all") {
    params.set("more", filters.more);
  }
  return params;
}

type CashAppTab = "overview" | "payments" | "bank-transactions" | "remittances";

const cashAppTabs: Array<{ id: CashAppTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "payments", label: "Payments" },
  { id: "bank-transactions", label: "Bank Transactions" },
  { id: "remittances", label: "Remittances" },
];

const CashApplicationPage = ({ data, tab }: { data: OperatorConsoleData; tab?: string | undefined }) => {
  const activeTab = normalizeCashAppTab(tab);
  const {
    reviewRows,
    bankTransactions,
    remittances,
    contextPanel,
    bankAccount,
    activeSession,
    highlightedPayment,
  } = data.cashApplicationQueue;
  const pendingPaymentsTotalCents = reviewRows.reduce((sum, row) => sum + row.amountCents, 0);
  const pendingRemittancesTotalCents = remittances.reduce((sum, row) => sum + (row.amountCents ?? 0), 0);
  const potentialPaymentsCount = bankTransactions.filter(
    (row) => row.matchStatus === "review_required" || row.matchStatus === "unmatched",
  ).length;

  return (
    <section className="page-section cash-page">
      <article className="cash-module-shell">
        <div className="cash-module-header">
          <h1>Cash App</h1>
          <div className="cash-module-tabs" role="tablist" aria-label="Cash App views">
            {cashAppTabs.map((tabItem) => (
              <a
                key={tabItem.id}
                href={cashAppHref(tabItem.id)}
                className={`cash-module-tab${activeTab === tabItem.id ? " is-active" : ""}`}
              >
                {tabItem.label}
              </a>
            ))}
          </div>
        </div>

        {activeTab === "overview" ? (
          <div className="cash-overview-stack">
            <div className="cash-overview-panels">
              <article className="cash-summary-card">
                <div className="cash-summary-main">
                  <span className="cash-summary-icon currency">$</span>
                  <div className="cash-summary-copy">
                    <p className="cash-summary-metric">
                      <strong>{formatPhp(pendingPaymentsTotalCents)}</strong>
                      <span>in pending payments</span>
                    </p>
                  </div>
                </div>
                <a href={cashAppHref("payments")} className="cash-action-button">Review</a>
              </article>

              <article className="cash-summary-card">
                <div className="cash-summary-main">
                  <span className="cash-summary-icon invoice">
                    <AppIcon name="invoice" />
                  </span>
                  <div className="cash-summary-copy">
                    <p className="cash-summary-metric">
                      <strong>{formatPhp(pendingRemittancesTotalCents)}</strong>
                      <span>in pending remittances</span>
                    </p>
                  </div>
                </div>
                <a href={cashAppHref("remittances")} className="cash-action-button">Review</a>
              </article>
            </div>

            <div className="cash-overview-summary">
              <div className="cash-weekly-label">This Week&apos;s Summary</div>

              <article className="cash-highlight-card">
                <div className="cash-highlight-main">
                  <span className="cash-highlight-icon">
                    <AppIcon name="sparkle-mini" />
                  </span>
                  <div>
                    <strong>Agent Highlights</strong>
                    <p>
                      Detected <span className="cash-highlight-count">{potentialPaymentsCount}</span> bank transactions
                      {" "}that are potential payments
                    </p>
                  </div>
                </div>
                <a href={cashAppHref("bank-transactions")} className="cash-inline-link">View</a>
              </article>
            </div>
          </div>
        ) : null}

        {activeTab === "payments" ? (
          <div className="cash-tab-section">
            <div className="cash-toolbar">
              <div className="cash-toolbar-main">
                <div className="cash-search">Search</div>
                <div className="cash-filter">Date</div>
                <div className="cash-filter">Customer</div>
                <div className="cash-filter">Account</div>
                <span className="cash-badge needs-review">Needs Review</span>
                <span className="cash-badge approved">Approved</span>
              </div>
              <button type="button" className="cash-dark-button">
                <AppIcon name="upload" />
                <span>Export</span>
              </button>
            </div>

            <article className="cash-table-card">
              <div className="cash-table cash-table-payments">
                <div className="cash-table-head">Date</div>
                <div className="cash-table-head">Customer</div>
                <div className="cash-table-head">Reference #</div>
                <div className="cash-table-head amount">Amount</div>
                <div className="cash-table-head">Documentation</div>
                <div className="cash-table-head">Allocated</div>
                <div className="cash-table-head">Confidence %</div>
                <div className="cash-table-head">Status</div>
                {reviewRows.slice(0, 3).map((row) => (
                  <PaymentsTableRow key={row.paymentId} row={row} />
                ))}
              </div>
              <div className="cash-table-footer">
                <span>{cashRangeLabel(reviewRows.length, reviewRows.length)}</span>
                <div className="cash-pagination">
                  <button type="button" aria-label="Previous page">‹</button>
                  <button type="button" aria-label="Next page">›</button>
                </div>
              </div>
            </article>
          </div>
        ) : null}

        {activeTab === "bank-transactions" ? (
          <div className="cash-tab-section">
            <div className="cash-toolbar">
              <div className="cash-toolbar-main">
                <div className="cash-search">Search</div>
                <div className="cash-filter">Date</div>
                <div className="cash-filter">Account</div>
                <span className="cash-badge needs-review">Potential Payments</span>
                <span className="cash-badge neutral">Payments</span>
              </div>
              <div className="cash-toolbar-actions">
                <button type="button" className="cash-dark-button">+ Bank Account</button>
                <button type="button" className="cash-dark-button">
                  <AppIcon name="upload" />
                  <span>Upload Bank Statement</span>
                </button>
              </div>
            </div>

            <article className="cash-table-card">
              <div className="cash-table cash-table-bank">
                <div className="cash-table-head">Date</div>
                <div className="cash-table-head">Account</div>
                <div className="cash-table-head">Reference #</div>
                <div className="cash-table-head amount">Amount</div>
                <div className="cash-table-head">Memo</div>
                <div className="cash-table-head">Confidence %</div>
                <div className="cash-table-head">Status</div>
                {bankTransactions.map((row) => (
                  <BankTransactionsTableRow key={row.id} row={row} bankAccount={bankAccount} />
                ))}
              </div>
              <div className="cash-table-footer">
                <span>{cashRangeLabel(bankTransactions.length, bankTransactions.length)}</span>
                <div className="cash-pagination">
                  <button type="button" aria-label="First page">«</button>
                  <button type="button" aria-label="Previous page">‹</button>
                  <button type="button" aria-label="Next page">›</button>
                </div>
              </div>
            </article>
          </div>
        ) : null}

        {activeTab === "remittances" ? (
          <div className="cash-tab-section">
            <div className="cash-toolbar">
              <div className="cash-toolbar-main">
                <div className="cash-search">Search</div>
                <div className="cash-filter">Received</div>
                <div className="cash-filter">Source</div>
                <div className="cash-filter">Payer</div>
                <span className="cash-badge needs-review">Needs Review</span>
                <span className="cash-badge approved">Structured</span>
              </div>
              <button type="button" className="cash-dark-button">
                <AppIcon name="upload" />
                <span>Export</span>
              </button>
            </div>

            <article className="cash-table-card">
              <div className="cash-table cash-table-remittances">
                <div className="cash-table-head">Received</div>
                <div className="cash-table-head">Source</div>
                <div className="cash-table-head">Payer</div>
                <div className="cash-table-head amount">Amount</div>
                <div className="cash-table-head">Invoice References</div>
                <div className="cash-table-head">Status</div>
                {remittances.map((row) => (
                  <RemittancesTableRow key={row.id} row={row} />
                ))}
              </div>
              <div className="cash-table-footer">
                <span>{cashRangeLabel(remittances.length, remittances.length)}</span>
                <div className="cash-pagination">
                  <button type="button" aria-label="Previous page">‹</button>
                  <button type="button" aria-label="Next page">›</button>
                </div>
              </div>
            </article>

            {contextPanel?.policyGuardrails.length ? (
              <article className="cash-note-card">
                <strong>Policy guardrails</strong>
                <p>{contextPanel.policyGuardrails[0]}</p>
              </article>
            ) : null}
          </div>
        ) : null}

        {activeSession ? (
          <CashApplicationWorkspace
            session={activeSession}
            highlightedPayment={highlightedPayment}
            contextPanel={contextPanel}
          />
        ) : null}
      </article>
    </section>
  );
};

const CashApplicationWorkspace = ({
  session,
  highlightedPayment,
  contextPanel,
}: {
  session: OperatorConsoleData["cashApplicationQueue"]["activeSession"];
  highlightedPayment?: OperatorConsoleData["cashApplicationQueue"]["highlightedPayment"];
  contextPanel?: OperatorConsoleData["cashApplicationQueue"]["contextPanel"];
}) => {
  if (!session) {
    return null;
  }

  const activeResidual = session.residualAction;
  const writebackPreview = session.writebackPreview;

  return (
    <section className="cash-tab-section">
      <article className="panel">
        <h2>Selected Review Workspace</h2>
        <div className="cash-workspace-grid">
          <div className="cash-queue-panel">
            <article className="context-item">
              <div className="eyebrow">Settlement</div>
              <strong>{highlightedPayment?.paymentReference ?? session.paymentId}</strong>
              <p>
                {highlightedPayment?.accountName ?? "Account pending"} •{" "}
                {highlightedPayment ? formatPhp(highlightedPayment.amountCents) : "—"}
              </p>
              <p>
                Status: {highlightedPayment?.settlementStatus ? humanize(highlightedPayment.settlementStatus) : "Unknown"}
              </p>
              <p>
                Bank transactions: {highlightedPayment?.sourceBankTransactionIds?.join(", ") ?? "None linked"}
              </p>
              {highlightedPayment?.withholdingSummary ? (
                <p>
                  Recognized withholding:{" "}
                  {formatPhp(highlightedPayment.withholdingSummary.recognizedAmountCents)}{" "}
                  ({highlightedPayment.withholdingSummary.evidenceStatus ?? "none"})
                </p>
              ) : null}
            </article>

            <article className="context-item">
              <div className="eyebrow">Allocations</div>
              <div className="allocation-list">
                {session.allocationLines.length > 0 ? session.allocationLines.map((line) => (
                  <div key={line.invoiceId} className="residual-option">
                    <strong>{line.invoiceNumber}</strong>
                    <p>
                      Apply {formatPhp(line.applyAmountCents)} to open balance {formatPhp(line.openAmountCents)}
                    </p>
                    <p>{line.branchId ? `Branch ${line.branchId}` : "Branch preserved when known"}</p>
                    <p>{line.rationale}</p>
                  </div>
                )) : <p>No invoice allocation is selected yet.</p>}
              </div>
            </article>
          </div>

          <div className="cash-allocation-panel">
            <article className="residual-summary-card">
              <div className="eyebrow">Residual handling</div>
              <strong>{formatPhp(session.residualAmountCents)} remaining</strong>
              <p>Current residual action: {humanize(activeResidual.code)}</p>
              <p>{activeResidual.detail}</p>
            </article>

            <form
              action={`/cash-application/${encodeURIComponent(session.paymentId)}/residual`}
              method="post"
              className="residual-options"
            >
              <input type="hidden" name="reasonCode" value={activeResidual.code} />
              <label className="context-item">
                <div className="eyebrow">Residual type</div>
                <select name="residualType" defaultValue={activeResidual.code}>
                  {session.residualActionOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p>{activeResidual.riskLabel}</p>
              </label>
              <label className="context-item">
                <div className="eyebrow">Operator note</div>
                <textarea
                  name="note"
                  rows={3}
                  defaultValue=""
                  placeholder="Why is this the right residual treatment?"
                />
                <p>Residual overrides stay audit-logged and drive the provider writeback preview.</p>
              </label>
              <button type="submit" className="cash-dark-button">Save residual decision</button>
            </form>

            <article className="finalize-card">
              <div className="eyebrow">Finalize</div>
              <strong>{session.finalizeFlow.primaryActionLabel}</strong>
              <p>{session.finalizeFlow.helperText}</p>
              <p>
                {session.withholdingSummary
                  ? `Withholding: ${formatPhp(session.withholdingSummary.recognizedAmountCents)} • ${session.withholdingSummary.evidenceStatus ?? "none"} • ${session.withholdingSummary.autoClosureAllowed ? "closure-eligible" : "review-only"}`
                  : "No withholding component is currently recognized."}
              </p>
            </article>
          </div>

          <div className="cash-context-panel">
            {session.buyerTaxProfile ? (
              <form
                action={`/customer-profiles/${encodeURIComponent(session.buyerTaxProfile.profileId)}/buyer-tax-profile`}
                method="post"
                className="context-item"
              >
                <div className="eyebrow">Buyer tax profile</div>
                <strong>{session.buyerTaxProfile.profileId}</strong>
                <label>
                  <span className="label-copy">Default withholding type</span>
                  <select
                    name="withholdingDefaultType"
                    defaultValue={session.buyerTaxProfile.withholdingDefaultType}
                  >
                    <option value="none">None</option>
                    <option value="goods">Goods</option>
                    <option value="services">Services</option>
                    <option value="mixed">Mixed</option>
                    <option value="special_goods">Special goods</option>
                  </select>
                </label>
                <label>
                  <span className="label-copy">Default rate (bps)</span>
                  <input
                    type="number"
                    name="defaultWithholdingRateBps"
                    defaultValue={session.buyerTaxProfile.defaultWithholdingRateBps ?? ""}
                  />
                </label>
                <label>
                  <span className="label-copy">Top withholding agent</span>
                  <select
                    name="isTopWithholdingAgent"
                    defaultValue={
                      session.buyerTaxProfile.isTopWithholdingAgent === undefined
                        ? ""
                        : session.buyerTaxProfile.isTopWithholdingAgent
                          ? "true"
                          : "false"
                    }
                  >
                    <option value="">Unknown</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </label>
                <input type="hidden" name="requires2307ForClosure" value="false" />
                <label>
                  <span className="label-copy">Notes</span>
                  <textarea
                    name="notes"
                    rows={3}
                    defaultValue={session.buyerTaxProfile.notes ?? ""}
                    placeholder="Supplier-set notes or learned pattern context"
                  />
                </label>
                <p>
                  Source: {humanize(session.buyerTaxProfile.source)} • historical score{" "}
                  {(session.buyerTaxProfile.historicalWithholdingBehaviorScore ?? 0).toFixed(2)}
                </p>
                <button type="submit" className="cash-dark-button">Save buyer tax profile</button>
              </form>
            ) : (
              <article className="context-item">
                <div className="eyebrow">Buyer tax profile</div>
                <strong>No buyer tax profile linked yet</strong>
                <p>Once a customer profile is linked to this payer, supplier-set defaults can be edited here.</p>
              </article>
            )}

            <article className="writeback-card">
              <div className="eyebrow">ERP writeback</div>
              <strong>
                {writebackPreview ? `${writebackPreview.providerLabel} • ${humanize(writebackPreview.outcome)}` : "No preview"}
              </strong>
              <p>
                {writebackPreview?.reason ??
                  session.writebackStatus.detail}
              </p>
              {writebackPreview ? (
                <>
                  <p>Support: {humanize(writebackPreview.supportStatus)}</p>
                  <p>Target: {writebackPreview.target}</p>
                  <p>Applied cash: {formatPhp((writebackPreview.payload.totalAppliedAmountCents as number) ?? 0)}</p>
                  <div className="allocation-list">
                    {writebackPreview.manualSteps.map((step, index) => (
                      <div key={`${writebackPreview.provider}-${index}`} className="residual-option">
                        <strong>Step {index + 1}</strong>
                        <p>{step}</p>
                      </div>
                    ))}
                  </div>
                  {writebackPreview.supportStatus === "supported" ? (
                    <form
                      action={`/cash-application/${encodeURIComponent(session.paymentId)}/writeback/stage`}
                      method="post"
                    >
                      <input type="hidden" name="provider" value={writebackPreview.provider} />
                      <button type="submit" className="cash-dark-button">Stage {writebackPreview.providerLabel} writeback</button>
                    </form>
                  ) : null}
                </>
              ) : null}
            </article>

            {contextPanel ? (
              <article className="context-item">
                <div className="eyebrow">Guardrails</div>
                <strong>Operator context</strong>
                <div className="context-list">
                  {contextPanel.policyGuardrails.map((note, index) => (
                    <p key={`guardrail-${index}`}>{note}</p>
                  ))}
                  {contextPanel.withholdingNotes?.map((note, index) => (
                    <p key={`withholding-${index}`}>{note}</p>
                  ))}
                </div>
              </article>
            ) : null}
          </div>
        </div>
      </article>
    </section>
  );
};

const PaymentsTableRow = ({ row }: { row: CashAppReviewRow }) => {
  const confidence = row.matches[0]?.confidence;
  const isDocumented = row.remittanceState !== "No remittance linked";
  const allocatedValue = row.residualAmountCents === 0 ? "—" : formatPhp(row.amountCents - row.residualAmountCents);

  return (
    <>
      <div className="cash-table-cell">{row.receivedOn}</div>
      <div className="cash-table-cell">{row.accountName}</div>
      <div className="cash-table-cell">{row.bankReference ?? "—"}</div>
      <div className="cash-table-cell amount">{formatCashTableAmount(row.amountCents)}</div>
      <div className="cash-table-cell center">{isDocumented ? "✓" : "—"}</div>
      <div className="cash-table-cell center">{allocatedValue}</div>
      <div className="cash-table-cell center">{confidence !== undefined ? `${Math.round(confidence * 100)}%` : "×"}</div>
      <div className="cash-table-cell">
        <span className={`cash-badge ${cashReviewStatusClassName(row.state)}`}>{humanize(row.state)}</span>
      </div>
    </>
  );
};

const BankTransactionsTableRow = ({
  row,
  bankAccount,
}: {
  row: CashAppBankTransaction;
  bankAccount?: OperatorConsoleData["cashApplicationQueue"]["bankAccount"];
}) => {
  const confidence = row.matchStatus === "linked_payment" ? "100%" : "—";
  const amountClassName = row.direction === "credit" ? "cash-table-cell amount is-positive" : "cash-table-cell amount";

  return (
    <>
      <div className="cash-table-cell">{formatShortDate(row.postedAt)}</div>
      <div className="cash-table-cell">{bankAccount?.accountMasked ?? "—"}</div>
      <div className="cash-table-cell">{row.reference}</div>
      <div className={amountClassName}>{formatCashTableAmount(row.amountCents)}</div>
      <div className="cash-table-cell">{row.description}</div>
      <div className="cash-table-cell center">{confidence}</div>
      <div className="cash-table-cell">
        <span className={`cash-badge ${cashBankStatusClassName(row.matchStatus)}`}>{cashBankStatusLabel(row.matchStatus)}</span>
      </div>
    </>
  );
};

const RemittancesTableRow = ({ row }: { row: CashAppRemittanceItem }) => (
  <>
    <div className="cash-table-cell">{formatShortDate(row.receivedAt)}</div>
    <div className="cash-table-cell">{humanize(row.source)}</div>
    <div className="cash-table-cell">{row.payerName ?? "—"}</div>
    <div className="cash-table-cell amount">{row.amountCents !== undefined ? formatCashTableAmount(row.amountCents) : "—"}</div>
    <div className="cash-table-cell">{row.invoiceReferences.join(", ") || "—"}</div>
    <div className="cash-table-cell">
      <span className={`cash-badge ${cashRemittanceStatusClassName(row.state)}`}>{humanize(row.state)}</span>
    </div>
  </>
);

type DeductionStatus = "Research" | "Draft" | "Matched";

type DeductionListItem = {
  id: string;
  reference: string;
  customer: string;
  paymentDate: string;
  amount: string;
  preDeduction: string;
  issueDate: string;
  claim: string;
  documentState: "download" | "view_and_download";
  status: DeductionStatus;
  flagged?: boolean;
};

type DeductionDetailItem = {
  reference: string;
  customer: string;
  status: DeductionStatus;
  createdDate: string;
  receivedDate: string;
  paymentDate: string;
  claimIssueDate: string;
  docsLabel: string;
  commandLabel: string;
  externalReference: string;
  claimStatus: string;
  claimLabel: string;
  total: string;
  notes: string;
  customerReference: string;
};

const deductionListItems: DeductionListItem[] = [
  {
    id: "deduction-dm3241426",
    reference: "DM3241426UNLOAD",
    customer: "Matthews-Watson",
    paymentDate: "10/16/2025",
    amount: "$35.00",
    preDeduction: "--",
    issueDate: "--",
    claim: "--",
    documentState: "download",
    status: "Research",
  },
  {
    id: "deduction-dm3241407",
    reference: "DM3241407UNLOAD",
    customer: "Matthews-Watson",
    paymentDate: "10/16/2025",
    amount: "$35.00",
    preDeduction: "--",
    issueDate: "View claim: #DM3241407UNLOAD",
    claim: "--",
    documentState: "download",
    status: "Research",
  },
  {
    id: "deduction-dm3241407-flag",
    reference: "DM3241407UNLOAD",
    customer: "Matthews-Watson",
    paymentDate: "10/16/2025",
    amount: "$35.00",
    preDeduction: "--",
    issueDate: "--",
    claim: "--",
    documentState: "download",
    status: "Research",
    flagged: true,
  },
  {
    id: "deduction-vcna000363856e",
    reference: "VCNA000363856E-08",
    customer: "Padilla, Dixon and Vazquez",
    paymentDate: "10/14/2025",
    amount: "$1569.72",
    preDeduction: "--",
    issueDate: "--",
    claim: "--",
    documentState: "download",
    status: "Research",
  },
  {
    id: "deduction-ecomdd483952",
    reference: "ECOMDD483952",
    customer: "Johnson, Yang and Martin",
    paymentDate: "10/14/2025",
    amount: "$647.51",
    preDeduction: "--",
    issueDate: "--",
    claim: "--",
    documentState: "view_and_download",
    status: "Research",
  },
  {
    id: "deduction-vcna0003648567",
    reference: "VCNA0003648567-08",
    customer: "Padilla, Dixon and Vazquez",
    paymentDate: "10/14/2025",
    amount: "$21.64",
    preDeduction: "--",
    issueDate: "--",
    claim: "--",
    documentState: "download",
    status: "Draft",
  },
  {
    id: "deduction-dmp5641yvr",
    reference: "DMP5641YVR",
    customer: "Matthews-Watson",
    paymentDate: "10/14/2025",
    amount: "$3902.03",
    preDeduction: "--",
    issueDate: "--",
    claim: "--",
    documentState: "download",
    status: "Research",
    flagged: true,
  },
  {
    id: "deduction-sh0076721d",
    reference: "SH#Q076721D",
    customer: "Johnson, Yang and Martin",
    paymentDate: "10/14/2025",
    amount: "$20.48",
    preDeduction: "--",
    issueDate: "--",
    claim: "--",
    documentState: "view_and_download",
    status: "Research",
  },
  {
    id: "deduction-vcna000364376",
    reference: "VCNA000364376-08",
    customer: "Padilla, Dixon and Vazquez",
    paymentDate: "10/14/2025",
    amount: "$1282.11",
    preDeduction: "--",
    issueDate: "--",
    claim: "--",
    documentState: "download",
    status: "Draft",
  },
  {
    id: "deduction-vcna000363820",
    reference: "VCNA000363820D-08",
    customer: "Padilla, Dixon and Vazquez",
    paymentDate: "10/14/2025",
    amount: "$751.74",
    preDeduction: "--",
    issueDate: "--",
    claim: "--",
    documentState: "download",
    status: "Draft",
  },
  {
    id: "deduction-vcna000364364",
    reference: "VCNA000364364-08",
    customer: "Padilla, Dixon and Vazquez",
    paymentDate: "10/14/2025",
    amount: "$5006.35",
    preDeduction: "--",
    issueDate: "--",
    claim: "--",
    documentState: "download",
    status: "Draft",
  },
];

function resolveDeductionPath(pathname: string) {
  const match = pathname.match(/^\/deductions\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function getDeductionDetail(reference: string): DeductionDetailItem {
  const fallbackItem = deductionListItems[1] ?? deductionListItems[0]!;
  const listItem = deductionListItems.find((item) => item.reference === reference) ?? fallbackItem;

  return {
    reference: listItem.reference,
    customer: listItem.customer,
    status: listItem.status,
    createdDate: "Oct 20, 2025",
    receivedDate: "Oct 20, 2025",
    paymentDate: "Oct 16, 2025",
    claimIssueDate: "Oct 16, 2025",
    docsLabel: "Merge 10 17 25.xlsx",
    commandLabel: "--",
    externalReference: "--",
    claimStatus: listItem.status === "Matched" ? "Matched" : "Matched",
    claimLabel: "View Claim",
    total: listItem.amount,
    notes: "CORRECT - NO VENDOR PULLED",
    customerReference: "218273434",
  };
}

const ExceptionsPage = ({ pathname = "/" }: { data: OperatorConsoleData; pathname?: string }) => {
  const selectedReference = resolveDeductionPath(pathname);
  const deductionDetail = selectedReference ? getDeductionDetail(selectedReference) : undefined;

  if (deductionDetail) {
    return <DeductionDetailPage detail={deductionDetail} />;
  }

  return <DeductionListPage items={deductionListItems} />;
};

const DeductionListPage = ({ items }: { items: DeductionListItem[] }) => (
  <section className="page-section deductions-page">
    <div className="deductions-shell">
      <div className="deductions-top-row">
        <div className="deductions-page-tabs" role="tablist" aria-label="Deduction workspaces">
          <a className="deductions-page-tab is-active" href="/deductions">Deductions</a>
          <span className="deductions-page-tab">Uploads</span>
          <span className="deductions-page-tab">AP Portal Jobs</span>
        </div>
        <button type="button" className="ghost-button deductions-configure-button">Configure</button>
      </div>

      <div className="deductions-toolbar">
        <div className="deductions-toolbar-filters">
          <div className="deductions-searchbox">
            <AppIcon name="search" />
            <span>Search</span>
          </div>
          <div className="deductions-toolbar-chip-row">
            <button type="button" className="collections-toolbar-chip deductions-compact-chip">
              <AppIcon name="filter" />
              <span>Customer</span>
            </button>
            <button type="button" className="collections-toolbar-chip deductions-compact-chip">
              <AppIcon name="filter" />
              <span>Status</span>
            </button>
            <div className="deductions-active-filters">
              <span>Open, Research</span>
              <button type="button" className="deductions-filter-clear" aria-label="Clear filters">
                <AppIcon name="close" />
              </button>
            </div>
          </div>
          <div className="deductions-date-filters">
            <span><AppIcon name="clock" /> Created start &nbsp;-&nbsp; Created end</span>
            <span><AppIcon name="clock" /> Effective payment start &nbsp;-&nbsp; Effective payment end</span>
            <span><AppIcon name="clock" /> Effective issue start &nbsp;-&nbsp; Effective issue end</span>
          </div>
        </div>

        <div className="deductions-toolbar-actions">
          <button type="button" className="primary-button deductions-dark-button">
            <AppIcon name="download" />
            <span>Export Deductions</span>
          </button>
          <button type="button" className="primary-button deductions-dark-button">
            <AppIcon name="download" />
            <span>Export Credit Memos</span>
          </button>
          <button type="button" className="primary-button deductions-dark-button">
            <AppIcon name="upload" />
            <span>Upload Document</span>
          </button>
        </div>
      </div>

      <div className="deductions-subtabs" role="tablist" aria-label="Deduction record tabs">
        <span className="deductions-subtab is-active">Pre-deduction</span>
        <span className="deductions-subtab">Matched</span>
        <span className="deductions-subtab">Reason Code</span>
        <span className="deductions-subtab">Document</span>
      </div>

      <div className="deductions-table-card">
        <div className="deductions-table deductions-table-header">
          <div>Reference</div>
          <div>Customer</div>
          <div>Payment Date</div>
          <div>Amount</div>
          <div>Pre-deduction</div>
          <div>Issue Date</div>
          <div>Claim</div>
          <div>Document</div>
          <div>Status</div>
          <div />
        </div>
        {items.map((item) => (
          <a key={item.id} className="deductions-table deductions-row-link" href={`/deductions/${encodeURIComponent(item.reference)}`}>
            <div className="deductions-reference-cell">
              {item.flagged ? <AppIcon name="alert-outline" /> : null}
              <span>{item.reference}</span>
            </div>
            <div>{item.customer}</div>
            <div>{item.paymentDate}</div>
            <div>{item.amount}</div>
            <div className="deductions-muted">{item.preDeduction}</div>
            <div className={item.issueDate.startsWith("View claim") ? "deductions-inline-link" : "deductions-muted"}>{item.issueDate}</div>
            <div className="deductions-muted">{item.claim}</div>
            <div className="deductions-document-icons">
              {item.documentState === "view_and_download" ? <AppIcon name="eye" /> : null}
              <AppIcon name="download" />
            </div>
            <div><span className={`deduction-status-pill deduction-status-${item.status.toLowerCase()}`}>{item.status}</span></div>
            <div className="deductions-row-trash"><AppIcon name="trash" /></div>
          </a>
        ))}

        <div className="deductions-table-footer">
          <span>1 - 100 of 1,307</span>
          <div className="collections-pager">
            <button type="button" className="collections-pager-button" aria-label="Previous page">
              <AppIcon name="chevron-left" />
            </button>
            <button type="button" className="collections-pager-button" aria-label="Next page">
              <AppIcon name="chevron-right" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const DeductionDetailPage = ({ detail }: { detail: DeductionDetailItem }) => (
  <section className="page-section deduction-detail-page">
    <div className="deduction-detail-shell">
      <a className="deduction-back-link" href="/deductions">
        <AppIcon name="chevron-left" />
        <span>Back to deductions</span>
      </a>

      <div className="deduction-detail-header">
        <div className="title-with-pills">
          <h1>Deduction: {detail.reference}</h1>
          <span className={`deduction-status-pill deduction-status-${detail.status.toLowerCase()}`}>{detail.status}</span>
        </div>
        <button type="button" className="deduction-icon-button" aria-label="Delete deduction">
          <AppIcon name="trash" />
        </button>
      </div>

      <div className="deduction-detail-grid">
        <article className="deduction-card">
          <div className="deduction-card-header">
            <h2>{detail.customer}</h2>
            <button type="button" className="deduction-icon-button" aria-label="Edit deduction">
              <AppIcon name="edit" />
            </button>
          </div>
          <div className="deduction-summary-grid">
            <div className="deduction-summary-block">
              <span className="label-copy">Reference</span>
              <div className="deduction-inline-value">
                <strong>{detail.reference}</strong>
                <AppIcon name="external-link" />
              </div>
            </div>
            <div className="deduction-summary-block">
              <span className="label-copy">Claim</span>
              <div className="deduction-pill-row">
                <span className="deduction-mini-pill deduction-mini-pill-matched">{detail.claimStatus}</span>
                <a href="#" className="deduction-mini-pill deduction-mini-pill-link">{detail.claimLabel}</a>
                <AppIcon name="copy" />
                <AppIcon name="download" />
              </div>
            </div>
            <div className="deduction-summary-block">
              <span className="label-copy">External</span>
              <strong>{detail.externalReference}</strong>
            </div>
            <div className="deduction-summary-block">
              <span className="label-copy">Total</span>
              <div className="deduction-inline-value">
                <strong className="deduction-total-amount">{detail.total}</strong>
                <AppIcon name="edit" />
              </div>
            </div>
          </div>
        </article>

        <article className="deduction-card">
          <div className="deduction-metadata-list">
            <div><span>Created Date</span><strong>{detail.createdDate}</strong></div>
            <div><span>Received Date</span><strong>{detail.receivedDate}</strong></div>
            <div><span>Payment Date</span><strong>{detail.paymentDate} <AppIcon name="edit" /></strong></div>
            <div><span>Claim Issue Date</span><strong>{detail.claimIssueDate} <AppIcon name="edit" /></strong></div>
            <div><span>Docs</span><strong>{detail.docsLabel} <AppIcon name="download" /></strong></div>
            <div><span>Commands</span><strong>{detail.commandLabel}</strong></div>
          </div>
        </article>
      </div>

      <article className="deduction-card deduction-line-card">
        <div className="deduction-line-table deduction-line-table-header">
          <div>#</div>
          <div>Reason</div>
          <div>Vendor</div>
          <div>Item</div>
          <div>Name</div>
          <div>SKU</div>
          <div>UPC</div>
          <div>Fees</div>
          <div>Price</div>
          <div>Qty</div>
          <div>Actions</div>
        </div>
        <div className="deduction-line-table">
          <div>1</div>
          <div className="deductions-muted">--</div>
          <div className="deductions-muted">--</div>
          <div className="deductions-muted">--</div>
          <div>Unload Charge</div>
          <div className="deductions-muted">--</div>
          <div className="deductions-muted">--</div>
          <div>$0.00</div>
          <div>$35.00</div>
          <div>1</div>
          <div className="deduction-action-icons">
            <AppIcon name="download" />
            <AppIcon name="edit" />
            <AppIcon name="close" />
          </div>
        </div>
        <div className="deduction-line-total">
          <strong>Total</strong>
          <div className="deduction-line-total-value">
            <strong>$35.00</strong>
            <AppIcon name="plus" />
          </div>
        </div>
      </article>

      <article className="deduction-card deduction-note-card">
        <h2>Notes</h2>
        <p>{detail.notes}</p>
      </article>

      <article className="deduction-card deduction-credit-card">
        <div className="deduction-card-header">
          <h2>Credit Memo Draft</h2>
          <div className="header-actions">
            <button type="button" className="primary-button deductions-dark-button">
              <AppIcon name="refresh" />
              <span>Refresh Credit Memo</span>
            </button>
            <button type="button" className="ghost-button">
              <AppIcon name="copy" />
              <span>Sync credit memo</span>
            </button>
          </div>
        </div>

        <div className="deduction-credit-summary">
          <div className="deduction-summary-block">
            <span className="label-copy">Customer</span>
            <strong>{detail.customer}</strong>
          </div>
          <div className="deduction-summary-block">
            <span className="label-copy">Document Number</span>
            <div className="deduction-inline-link">
              <span>{detail.reference}</span>
              <AppIcon name="external-link" />
            </div>
          </div>
        </div>

        <div className="deduction-credit-draft">
          <h3>Credit Memo Draft</h3>
          <div className="deduction-credit-meta">
            <div className="deduction-summary-block">
              <span className="label-copy">Customer</span>
              <strong>{detail.customer}</strong>
            </div>
            <div className="deduction-summary-block">
              <span className="label-copy">Document Number</span>
              <div className="deduction-inline-link">
                <span>{detail.reference}</span>
                <AppIcon name="external-link" />
              </div>
            </div>
            <div className="deduction-summary-block">
              <span className="label-copy">Number</span>
              <div className="deduction-inline-value"><strong>--</strong><AppIcon name="edit" /></div>
            </div>
            <div className="deduction-summary-block">
              <span className="label-copy">Trade Allowance</span>
              <div className="deduction-inline-value"><strong>--</strong><AppIcon name="edit" /></div>
            </div>
            <div className="deduction-summary-block">
              <span className="label-copy">Posting Date</span>
              <div className="deduction-inline-value"><strong>--</strong><AppIcon name="edit" /></div>
            </div>
            <div className="deduction-summary-block">
              <span className="label-copy">Customer Reference</span>
              <div className="deduction-inline-value"><strong>{detail.customerReference}</strong><AppIcon name="edit" /></div>
            </div>
          </div>

          <div className="deduction-credit-table deduction-credit-table-header">
            <div>#</div>
            <div>Item</div>
            <div>Description</div>
            <div>Vendor</div>
            <div>Price</div>
            <div>Qty</div>
            <div>Amount</div>
            <div>Action</div>
          </div>
          <div className="deduction-credit-table">
            <div>1</div>
            <div>CR-69-FREIGHT PEN</div>
            <div>Unload charge - PO #2782...</div>
            <div className="deductions-muted">--</div>
            <div>$35.00</div>
            <div>1</div>
            <div>$35.00</div>
            <div className="deduction-action-icons"><AppIcon name="close" /></div>
          </div>

          <div className="deduction-line-total deduction-credit-total">
            <strong>Total</strong>
            <div className="deduction-line-total-value">
              <strong>$35.00</strong>
              <AppIcon name="plus" />
            </div>
          </div>
        </div>
      </article>
    </div>
  </section>
);

const ApprovalsPage = ({ data }: { data: OperatorConsoleData }) => {
  const totalPending = data.approvalsQueue.length;
  const highUrgency = data.approvalsQueue.filter((item) => item.assigneeRole === "controller").length;
  const mediumUrgency = Math.max(totalPending - highUrgency, 0);
  const strategicOutreach = data.approvalsQueue.filter((item) => item.requestType === "strategic_outreach").length;
  const disputedOutreach = data.approvalsQueue.filter((item) => item.requestType === "disputed_invoice_outreach").length;

  return (
    <section className="page-section">
      <PageHeader
        title="Approvals queue"
        description="Review and approve sensitive actions requiring human oversight"
        actionRow={<button type="button" className="ghost-button">Approve All High Priority</button>}
      />

      <div className="kpi-grid kpi-grid-5">
        <SimpleKpi title="Total Pending" value={String(totalPending)} />
        <SimpleKpi title="High Urgency" value={String(highUrgency)} tone="danger" />
        <SimpleKpi title="Medium Urgency" value={String(mediumUrgency)} tone="warning" />
        <SimpleKpi title="Strategic Outreach" value={String(strategicOutreach)} />
        <SimpleKpi title="Disputed Invoice Outreach" value={String(disputedOutreach)} />
      </div>

      {data.approvalsQueue.map((item, index) => (
        <article key={item.id} className="detail-card">
          <div className="approval-request-header">
            <div className="approval-icon" aria-hidden="true">
              {item.requestType === "strategic_outreach" ? "🛡" : item.requestType === "disputed_invoice_outreach" ? "✉" : "◔"}
            </div>
            <div className="approval-request-main">
              <div className="title-with-pills">
                <h2>{approvalHeading(item.requestType)}</h2>
                <span className={`pill ${item.assigneeRole === "controller" ? "pill-success" : "pill-info"}`}>
                  {item.assigneeRole === "controller" ? "High" : "Medium"}
                </span>
                <span className="pill pill-warning">Pending</span>
              </div>
              <div className="cash-meta-grid">
                <MetaBlock label="Account" value={approvalAccount(item.requestType, index)} />
                <MetaBlock label="Requested By" value="Juan Cruz" />
                <MetaBlock label="Requested On" value={approvalRequestedOn(index)} />
              </div>
            </div>
          </div>

          <div className="approval-body">
            <p className="label-copy">Requested Action</p>
            <strong>{item.summary}</strong>
            <div className="reason-box">
              <span className="label-copy">AI Reasoning</span>
              <p>{item.nextAction}</p>
            </div>
            <div className="email-preview">
              <div className="email-preview-head">
                <span className="label-copy">Email Preview</span>
                <button type="button" className="text-button">Edit</button>
              </div>
              <p>To: {approvalAccount(item.requestType, index)}</p>
              <p>Subject: Payment Reminder</p>
              <p>Dear Sir/Madam,</p>
              <p>We hope this message finds you well. We are writing to follow up on outstanding invoices...</p>
            </div>
          </div>

          <div className="detail-footer">
            <button type="button" className="ghost-button">Edit &amp; Approve</button>
            <div className="header-actions">
              <form method="post" action={`/approvals/${item.id}/reject`}>
                <button type="submit" className="ghost-button">Reject</button>
              </form>
              <form method="post" action={`/approvals/${item.id}/approve`}>
                <button type="submit" className="primary-button">Approve</button>
              </form>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
};

const AIActivityPage = ({ data }: { data: OperatorConsoleData }) => (
  <section className="page-section">
    <PageHeader
      title="AI activity feed"
      description="Real-time timeline of AI decisions, actions, and reasoning"
      icon="sparkle"
    />

    <div className="kpi-grid kpi-grid-5">
      <SimpleKpi title="Actions Today" value="8" />
      <SimpleKpi title="Auto-Applied" value="1" tone="success" />
      <SimpleKpi title="Approvals Requested" value="1" tone="warning" />
      <SimpleKpi title="Exceptions Created" value="2" tone="danger" />
      <SimpleKpi title="Actions Blocked" value="1" />
    </div>

    <div className="filter-row">
      <div className="search-box">Search activities...</div>
      <div className="ghost-select">All Actions</div>
      <div className="ghost-select">Today</div>
    </div>

    {data.aiFeed.map((item, index) => (
      <article key={item.id} className="detail-card">
        <div className="activity-feed-header">
          <div className="activity-feed-icon" aria-hidden="true">
            {index === 0 ? "✓" : index === 1 ? "!" : "◔"}
          </div>
          <div className="activity-feed-main">
            <div className="title-with-pills">
              <h2>{index === 0 ? "Auto-applied payment" : index === 1 ? "Created exception" : "Requested approval"}</h2>
              <span className="pill pill-success">{index === 0 ? "Success" : "Completed"}</span>
              {index === 0 ? <span className="pill pill-neutral">High (98%)</span> : null}
            </div>
            <p>{item.summary}</p>
          </div>
          <span className="activity-summary-time">{item.at}</span>
        </div>
        <div className="reason-box">
          <span className="label-copy">AI Reasoning</span>
          <p>{item.outcome}</p>
        </div>
        <p className="label-copy">Result</p>
        <p>{item.outcome}</p>
      </article>
    ))}
  </section>
);

const dataSourceOverviewStats = [
  { id: "active-connections", label: "Active Connections", value: "4", icon: "data-sources", tone: "success" as const },
  { id: "processing", label: "Processing", value: "1", icon: "clock", tone: "info" as const },
  { id: "ready-review", label: "Ready for Review", value: "1", icon: "alert", tone: "warning" as const },
  { id: "approved", label: "Approved Today", value: "2", icon: "check", tone: "success" as const },
  { id: "failed", label: "Failed", value: "0", icon: "alert-outline", tone: "danger" as const },
  { id: "last-sync", label: "Last Sync", value: "2 min ago", icon: "refresh", tone: "neutral" as const },
] as const;

const integrationHighlights = [
  {
    id: "connect",
    title: "Connect Integrations",
    description: "Auto-sync structured data from ERPs and systems",
    tone: "info",
    icon: "data-sources" as const,
  },
  {
    id: "upload",
    title: "Upload Files",
    description: "AI extracts data from PDFs, Excel, and CSV",
    tone: "success",
    icon: "upload" as const,
  },
  {
    id: "review",
    title: "Review & Approve",
    description: "Validate AI-extracted data before system sync",
    tone: "violet",
    icon: "sparkle-mini" as const,
  },
] as const;

const DataSourcesPage = ({ data }: { data: OperatorConsoleData }) => {
  const activeConnections = data.dataSourceIntegrations.filter((item) => item.status === "connected").length;
  const processingUploads = data.dataSourceUploads.filter((item) => item.status === "processing").length;
  const reviewUploads = data.dataSourceUploads.filter((item) => item.status === "review").length;
  const approvedToday = Math.max(0, data.dataSourceUploads.filter((item) => item.status === "review").length + 1);
  const failedJobs = 0;
  const lastSyncSource = [...data.dataSourceIntegrations, ...data.dataSourceUploads]
    .map((item) => ("createdAt" in item ? item.createdAt : item.uploadedAt))
    .sort((left, right) => right.localeCompare(left))[0];
  const stats = dataSourceOverviewStats.map((item) => {
    switch (item.id) {
      case "active-connections":
        return { ...item, value: String(activeConnections) };
      case "processing":
        return { ...item, value: String(processingUploads) };
      case "ready-review":
        return { ...item, value: String(reviewUploads) };
      case "approved":
        return { ...item, value: String(approvedToday) };
      case "failed":
        return { ...item, value: String(failedJobs) };
      case "last-sync":
        return { ...item, value: formatRelativeTime(lastSyncSource) };
      default:
        return item;
    }
  });
  const tabs = [
    "Overview",
    `Integrations (${activeConnections})`,
    "Upload Files",
    `Ingestion Jobs (${data.dataSourceUploads.length})`,
    "Settings",
  ] as const;
  const recentUploads = data.dataSourceUploads.slice(0, 3);
  const recentIntegrations = data.dataSourceIntegrations.slice(0, 3);

  return (
  <section className="page-section">
    <PageHeader
      title="Data Sources"
      description="Manage integrations and upload files for AI-powered data ingestion"
      actionRow={
        <div className="header-actions">
          <a href="#upload-files-form" className="ghost-button data-source-upload-button">
            <AppIcon name="upload" />
            <span>Upload Files</span>
          </a>
          <a href="#add-integration-form" className="primary-button">
            Add Integration
          </a>
        </div>
      }
    />

    <div className="kpi-grid kpi-grid-6">
      {stats.map((item) => (
        <article key={item.id} className={`simple-kpi data-source-kpi${item.id === "last-sync" ? " data-source-kpi-sync" : ""}`}>
          <div className="data-source-kpi-top">
            <p>{item.label}</p>
            <span className={`data-source-kpi-icon data-source-kpi-icon-${item.tone}`}>
              <AppIcon name={item.icon} />
            </span>
          </div>
          <strong>{item.value}</strong>
        </article>
      ))}
    </div>

    <div className="tab-pills">
      {tabs.map((tab, index) => (
        <span key={tab} className={`tab-pill${index === 0 ? " is-active" : ""}`}>
          {tab}
          {tab.startsWith("Ingestion Jobs") && reviewUploads > 0 ? <span className="tab-pill-indicator" /> : null}
        </span>
      ))}
    </div>

    <article className="detail-card data-source-hero">
      <div className="data-source-hero-icon">
        <AppIcon name="sparkle" />
      </div>
      <div className="data-source-hero-body">
        <h2>Unified Data Ingestion Platform</h2>
        <p>
          Connect to your ERP, accounting software, banks, and email systems for automatic data sync.
          Upload unstructured files for AI extraction. All data is processed, validated, and structured
          before syncing to your invoice and customer modules.
        </p>
        <div className="card-grid card-grid-3 data-source-feature-grid">
          {integrationHighlights.map((item) => (
            <article key={item.id} className="data-source-feature">
              <div className={`data-source-feature-icon tone-${item.tone}`}>
                <AppIcon name={item.icon} />
              </div>
              <div>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </article>

    <div className="card-grid card-grid-2">
      <article className="panel data-source-panel">
        <div className="panel-header">
          <h2>Recent Integration Activity</h2>
        </div>
        <div className="data-source-list">
          {recentIntegrations.map((item) => (
            <article key={item.id} className="data-source-row">
              <div className="data-source-row-main">
                <span className="data-source-row-status">
                  <AppIcon name="check" />
                </span>
                <div className="data-source-row-copy">
                  <strong>{item.name}</strong>
                  <p>{item.detail}</p>
                </div>
              </div>
              <span className="activity-summary-time">{formatRelativeTime(item.createdAt)}</span>
            </article>
          ))}
        </div>
      </article>

      <article className="panel data-source-panel">
        <div className="panel-header">
          <h2>Recent File Uploads</h2>
        </div>
        <div className="data-source-list">
          {recentUploads.map((item) => (
            <article key={item.id} className="data-source-row">
              <div className="data-source-row-main">
                <span className="data-source-file-icon">
                  <AppIcon name="invoice" />
                </span>
                <div className="data-source-row-copy">
                  <strong>{item.fileName}</strong>
                  <p>{item.detail}</p>
                </div>
              </div>
              <span className={`pill ${item.status === "review" ? "pill-warning" : "pill-info"}`}>
                {item.status === "review" ? "Review" : "Processing"}
              </span>
            </article>
          ))}
        </div>
      </article>
    </div>

    {data.dataSourceUploads.length > 0 ? (
      <article className="detail-card data-source-import-summary">
        <div className="panel-header">
          <h2>Spreadsheet Import Results</h2>
          <a className="primary-button" href="/invoices">Open Invoices</a>
        </div>
        <div className="data-source-list">
          {data.dataSourceUploads.slice(0, 4).map((item) => (
            <article key={item.id} className="data-source-row">
              <div className="data-source-row-copy">
                <strong>{item.fileName}</strong>
                <p>
                  {item.importedInvoiceCount
                    ? `${item.importedInvoiceCount} invoice${item.importedInvoiceCount === 1 ? "" : "s"} imported`
                    : item.detail}
                  {item.heldRowCount ? ` · ${item.heldRowCount} row${item.heldRowCount === 1 ? "" : "s"} held for review` : ""}
                </p>
                {item.reviewNotes?.length ? (
                  <div className="data-source-review-notes">
                    {item.reviewNotes.slice(0, 3).map((note) => (
                      <p key={note}>{note}</p>
                    ))}
                  </div>
                ) : null}
              </div>
              <span className="activity-summary-time">{formatRelativeTime(item.uploadedAt)}</span>
            </article>
          ))}
        </div>
      </article>
    ) : null}

    <div className="card-grid card-grid-2">
      <article id="add-integration-form" className="detail-card data-source-form-card">
        <div className="panel-header">
          <h2>Add Integration</h2>
          <span className="pill pill-success">Live in this session</span>
        </div>
        <p className="label-copy">
          Add a source system for ERP, bank, email, or spreadsheet ingestion. This keeps the UI aligned with real operator actions while deeper connector adapters are still being wired.
        </p>
        <form method="POST" action="/data-sources/integrations" className="data-source-form">
          <label className="label-copy" htmlFor="integration-name">Integration name</label>
          <input id="integration-name" name="name" className="form-input" placeholder="NetSuite, BDO Corporate, AP mailbox" required />
          <label className="label-copy" htmlFor="integration-category">Category</label>
          <select id="integration-category" name="category" className="form-input" defaultValue="ERP">
            <option>ERP</option>
            <option>Accounting</option>
            <option>Bank</option>
            <option>Email</option>
            <option>Spreadsheet</option>
          </select>
          <label className="label-copy" htmlFor="integration-frequency">Sync frequency</label>
          <input id="integration-frequency" name="syncFrequency" className="form-input" placeholder="Every 30 minutes" required />
          <label className="label-copy" htmlFor="integration-detail">Operator note</label>
          <input id="integration-detail" name="detail" className="form-input" placeholder="Initial connection ready for mapping and validation." />
          <button type="submit" className="primary-button">Save Integration</button>
        </form>
      </article>

      <article id="upload-files-form" className="detail-card data-source-form-card">
        <div className="panel-header">
          <h2>Upload AR Files</h2>
          <span className="pill pill-info">Multipart enabled</span>
        </div>
        <p className="label-copy">
          Upload invoices, statements, remittances, CSVs, and Excel files. We store the file metadata and add it to the ingestion queue immediately for operator review.
        </p>
        <form method="POST" action="/data-sources/uploads" encType="multipart/form-data" className="data-source-form">
          <label className="label-copy" htmlFor="upload-source-label">Source label</label>
          <input id="upload-source-label" name="sourceLabel" className="form-input" placeholder="Manual upload, customer email, treasury handoff" />
          <label className="label-copy" htmlFor="upload-file">Choose file</label>
          <input id="upload-file" name="file" type="file" className="form-input file-input" accept=".pdf,.csv,.xls,.xlsx,.xml,.txt,image/*" required />
          <button type="submit" className="primary-button">Upload File</button>
        </form>
        {recentUploads[0] ? (
          <div className="data-source-upload-meta">
            <strong>Newest queued file</strong>
            <p>
              {recentUploads[0].fileName} · {formatFileSize(recentUploads[0].fileSizeBytes)} · {formatRelativeTime(recentUploads[0].uploadedAt)}
            </p>
          </div>
        ) : null}
      </article>
    </div>
  </section>
  );
};

const taskStatusFilterOptions: Array<{ value: TaskStatusFilter; label: string }> = [
  { value: "active", label: "Open Tasks" },
  { value: "all", label: "All Status" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "completed", label: "Completed" },
  { value: "closed", label: "Closed" },
];

const taskTypeFilterOptions: Array<{ value: TaskTypeFilter; label: string }> = [
  { value: "all", label: "All Types" },
  { value: "collection", label: "Collections" },
  { value: "cash_app", label: "Cash App" },
  { value: "deduction", label: "Deductions" },
  { value: "integration", label: "Integrations" },
  { value: "credit_line", label: "Credit Line" },
];

const taskPriorityFilterOptions: Array<{ value: TaskPriorityFilter; label: string }> = [
  { value: "all", label: "All Priorities" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const InboxPage = ({ data, filters }: { data: OperatorConsoleData; filters?: TaskFilterInput | undefined }) => {
  const normalizedFilters = normalizeTaskFilters(filters);
  const filteredTasks = filterTaskQueue(data.taskQueue, normalizedFilters);
  const hasActiveFilters =
    normalizedFilters.status !== "active" ||
    normalizedFilters.type !== "all" ||
    normalizedFilters.priority !== "all" ||
    normalizedFilters.q.length > 0;
  const activeTasks = data.taskQueue.filter((item) => isOpenTaskStatus(item.status));
  const totalTasks = activeTasks.length;
  const openTasks = activeTasks.filter((item) => item.status === "open").length;
  const inProgressTasks = activeTasks.filter((item) => item.status === "in_progress").length;
  const pendingApprovalTasks = activeTasks.filter((item) => item.status === "pending_approval").length;
  const highPriorityTasks = activeTasks.filter((item) => item.priority === "high").length;
  const senderIdentityOptions = data.emailSendingIdentities.filter(
    (identity) => identity.connectionStatus === "connected",
  );
  const defaultSenderIdentityId =
    data.emailInbox.selectedSenderIdentityId ??
    data.emailSendingIdentities.find((identity) => identity.isDefault)?.id ??
    senderIdentityOptions[0]?.id;

  return (
    <section className="page-section task-page">
      <PageHeader
        title="Tasks"
        description="Global task queue across collections, cash app, deductions, and operations"
      />

      {data.taskComposeStatus ? (
        <article className="integration-success-banner">
          <strong>
            {data.taskComposeStatus.kind === "approval_needed"
              ? "Task email queued for approval."
              : data.taskComposeStatus.kind === "sent"
                ? "Task email sent."
                : data.taskComposeStatus.kind === "completed"
                  ? "Task completed and archived."
                  : data.taskComposeStatus.kind === "deleted"
                    ? "Task deleted."
                    : "Task closed."}
          </strong>
          <p>{data.taskComposeStatus.message}</p>
        </article>
      ) : null}

      {data.taskComposeError ? (
        <article className="integration-error-banner">
          <strong>Task email could not be sent.</strong>
          <p>{data.taskComposeError.message}</p>
        </article>
      ) : null}

      {data.taskInvoiceAttachmentStatus ? (
        <article className="integration-success-banner">
          <strong>Invoice attachment saved.</strong>
          <p>{data.taskInvoiceAttachmentStatus.message}</p>
        </article>
      ) : null}

      {data.taskInvoiceAttachmentError ? (
        <article className="integration-error-banner">
          <strong>Invoice attachment could not be saved.</strong>
          <p>{data.taskInvoiceAttachmentError.message}</p>
        </article>
      ) : null}

      <div className="kpi-grid kpi-grid-5 task-summary-grid">
        <article className="task-summary-card">
          <p>Active Tasks</p>
          <strong>{totalTasks}</strong>
        </article>
        <article className="task-summary-card">
          <p>Open</p>
          <strong>{openTasks}</strong>
        </article>
        <article className="task-summary-card">
          <p>In Progress</p>
          <strong className="tone-info">{inProgressTasks}</strong>
        </article>
        <article className="task-summary-card">
          <p>Pending Approval</p>
          <strong className="tone-warning">{pendingApprovalTasks}</strong>
        </article>
        <article className="task-summary-card">
          <p>High Priority</p>
          <strong className="tone-danger">{highPriorityTasks}</strong>
        </article>
      </div>

      <article className="panel task-table-shell">
        <form method="GET" action="/tasks" className="task-filter-bar">
          <label className="task-search" htmlFor="task-search">
            <AppIcon name="search" />
            <input
              id="task-search"
              type="search"
              name="q"
              defaultValue={normalizedFilters.q}
              placeholder="Search tasks, customers, invoices..."
              autoComplete="off"
              list="task-search-history"
              data-task-search-input
            />
            <datalist id="task-search-history" data-task-search-history-list />
          </label>
          <select
            className="ghost-select task-select"
            name="status"
            defaultValue={normalizedFilters.status}
            aria-label="Filter by status"
          >
            {taskStatusFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select
            className="ghost-select task-select"
            name="type"
            defaultValue={normalizedFilters.type}
            aria-label="Filter by type"
          >
            {taskTypeFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select
            className="ghost-select task-select"
            name="priority"
            defaultValue={normalizedFilters.priority}
            aria-label="Filter by priority"
          >
            {taskPriorityFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button type="submit" className="primary-button task-filter-submit">
            <AppIcon name="check" />
            <span>Apply</span>
          </button>
          {hasActiveFilters ? <a className="ghost-button task-filter-clear" href="/tasks">Clear</a> : null}
          <button type="button" className="ghost-button task-search-clear-history" data-task-search-clear-history>
            Clear recent
          </button>
        </form>

        <div className="task-table">
          <div className="task-table-header">
            <div className="task-table-head">Task</div>
            <div className="task-table-head">Customer</div>
            <div className="task-table-head">Type</div>
            <div className="task-table-head">Status</div>
            <div className="task-table-head">Priority</div>
            <div className="task-table-head">Owner</div>
            <div className="task-table-head">Source</div>
            <div className="task-table-head task-table-head-actions">Actions</div>
          </div>
          <div className="task-table-body">
            {filteredTasks.length === 0 ? (
              <div className="task-table-empty">
                <strong>{activeTasks.length === 0 && normalizedFilters.status === "active" ? "No open tasks yet." : "No tasks match these filters."}</strong>
                <p>{activeTasks.length === 0 && normalizedFilters.status === "active" ? "New operational work will appear here when tasks are created." : "Adjust the search, status, type, or priority filters."}</p>
              </div>
            ) : filteredTasks.map((task) => (
              <div key={task.id} className="task-table-row">
                <div className="task-table-cell">
                  <a className="task-row-title-link" href={`#task-detail-${task.id}`}>
                    <strong>{task.title}</strong>
                  </a>
                  <p className="task-row-meta">
                    {task.relatedRecord ? <span>{task.relatedRecord}</span> : null}
                    {task.amountLabel !== "—" ? <span>{task.amountLabel}</span> : null}
                  </p>
                </div>
                <div className="task-table-cell">
                  <strong className="task-table-plain">{task.customerName}</strong>
                </div>
                <div className="task-table-cell">
                  <span className={`task-type-pill task-type-${task.type}`}>
                    <span className="task-type-icon" />
                    {taskTypeLabel(task.type)}
                  </span>
                </div>
                <div className="task-table-cell">
                  <span className={`pill ${taskStatusClassName(task.status)}`}>{humanize(task.status)}</span>
                </div>
                <div className="task-table-cell">
                  <span className={`pill ${taskPriorityClassName(task.priority)}`}>{humanize(task.priority)}</span>
                </div>
                <div className="task-table-cell">
                  <div className="task-assignee">
                    <span className="task-assignee-avatar">{task.assigneeInitials}</span>
                    <strong className="task-table-plain">{task.assigneeName}</strong>
                  </div>
                </div>
                <div className="task-table-cell">
                  <span className="task-source-label">{taskSourceLabel(task)}</span>
                </div>
                <div className="task-table-cell task-table-cell-actions">
                  <a className="task-view-link" href={`#task-detail-${task.id}`}>
                    {task.composeEmail ? "Email" : "View"}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </article>

      {filteredTasks.map((task, index) => (
        <TaskDetailModal
          key={`task-detail-${task.id}`}
          data={data}
          task={task}
          previousTask={filteredTasks[index - 1]}
          nextTask={filteredTasks[index + 1]}
          senderIdentityOptions={senderIdentityOptions}
          {...(defaultSenderIdentityId ? { defaultSenderIdentityId } : {})}
        />
      ))}
    </section>
  );
};

const TaskDetailModal = ({
  data,
  task,
  previousTask,
  nextTask,
  senderIdentityOptions,
  defaultSenderIdentityId,
}: {
  data: OperatorConsoleData;
  task: TaskQueueItem;
  previousTask: TaskQueueItem | undefined;
  nextTask: TaskQueueItem | undefined;
  senderIdentityOptions: OperatorConsoleData["emailSendingIdentities"];
  defaultSenderIdentityId?: string;
}) => {
  const composeEmail = task.composeEmail;
  const canSend = Boolean(defaultSenderIdentityId);
  const templateDraft = composeEmail ? buildTaskTemplateDraft(composeEmail) : undefined;
  const appliedDraft =
    data.taskComposeDraft?.composeId === task.id
      ? data.taskComposeDraft
      : undefined;
  const activeDraft = composeEmail
    ? {
        composeId: task.id,
        generator: appliedDraft?.generator ?? ("ai" as const),
        subjectLine: appliedDraft?.subjectLine ?? composeEmail.draft.subjectLine,
        body: appliedDraft?.body ?? composeEmail.draft.body,
        note: appliedDraft?.note ?? composeEmail.draft.note,
      }
    : undefined;
  const activeGenerator = activeDraft?.generator ?? "ai";
  const taskEmailTemplates = getAvailableCollectionsEmailTemplates(data);
  const invoiceLabels = composeEmail?.invoices.map((invoice) => invoice.invoiceNumber) ?? [];
  const invoiceContextLabel =
    task.invoiceContextLabel ??
    (invoiceLabels.length > 0 ? invoiceLabels.join(", ") : undefined) ??
    task.relatedRecord;
  const invoiceContextItems = buildTaskInvoiceContextItems(task);
  const threadMessages = composeEmail
    ? composeEmail.threadMessages && composeEmail.threadMessages.length > 0
      ? composeEmail.threadMessages
      : buildTaskThreadMessages(task, composeEmail)
    : [];
  const tasksBadgeCount = composeEmail?.openTaskCount ?? 1;
  const openInvoiceCount = task.openInvoiceCount ?? composeEmail?.invoices.length ?? 0;
  const balanceLabel = task.balanceLabel ?? task.amountLabel;
  const overdueLabel = task.overdueLabel ?? calculateTaskOverdueLabel(composeEmail);
  const taskBrief = buildTaskDetailBrief(task);

  return (
    <section
      id={`task-detail-${task.id}`}
      className="collections-compose-modal task-detail-modal"
    >
      <a className="collections-compose-backdrop" href="#" aria-label="Close task detail" />
      <article
        className="collections-compose-panel task-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`task-detail-title-${task.id}`}
      >
        <div className="collections-compose-header task-detail-header">
          <div className="task-compose-title-block">
            <div className="task-detail-kicker">
              <span>{task.taskCode}</span>
              <span className={`pill ${taskStatusClassName(task.status)}`}>{humanize(task.status)}</span>
              {task.replyAgingLabel ? (
                <span className="task-detail-aging">
                  <AppIcon name="clock" />
                  {task.replyAgingLabel}
                </span>
              ) : null}
            </div>
            <div className="task-compose-title-row">
              <h2 id={`task-detail-title-${task.id}`}>{task.customerName}</h2>
              <span className="task-compose-badge">Customer</span>
              {task.ownerTeam ? <span className="task-compose-badge">{task.ownerTeam}</span> : null}
            </div>
            <div className="task-compose-invoice-line">
              <span>{openInvoiceCount} open invoice{openInvoiceCount === 1 ? "" : "s"}</span>
              <span className="task-compose-bullet">•</span>
              <strong>{balanceLabel}</strong>
              {overdueLabel ? (
                <>
                  <span className="task-compose-bullet">•</span>
                  <span>{overdueLabel} overdue</span>
                </>
              ) : null}
            </div>
          </div>
          <div className="task-detail-nav">
            <a
              className={`task-detail-nav-button${previousTask ? "" : " is-disabled"}`}
              href={previousTask ? `#task-detail-${previousTask.id}` : `#task-detail-${task.id}`}
              aria-label="Previous task"
            >
              <AppIcon name="chevron-left" />
            </a>
            <a
              className={`task-detail-nav-button${nextTask ? "" : " is-disabled"}`}
              href={nextTask ? `#task-detail-${nextTask.id}` : `#task-detail-${task.id}`}
              aria-label="Next task"
            >
              <AppIcon name="chevron-right" />
            </a>
            <a className="collections-compose-close" href="#" aria-label="Close task detail">
              <AppIcon name="close" />
            </a>
          </div>
        </div>

        <div className="task-detail-body">
          <div className="task-detail-summary-grid">
            <div className="task-detail-summary-card">
              <span>Task</span>
              <strong>{task.title}</strong>
            </div>
            <div className="task-detail-summary-card">
              <span>Owner</span>
              <strong>{task.assigneeName}</strong>
            </div>
            <div className="task-detail-summary-card">
              <span>Created</span>
              <strong>{task.createdLabel}</strong>
            </div>
          </div>

          <div className="task-detail-context-grid">
            <div className="task-detail-context-card">
              <span>Invoice / balance context</span>
              <strong>{invoiceContextLabel ?? "Account balance"}</strong>
              {invoiceContextItems.length > 0 ? (
                <ul className="task-detail-invoice-list">
                  {invoiceContextItems.map((item, index) => (
                    <li key={`${task.id}-invoice-context-${index}`}>
                      <strong>{item.invoiceNumber}</strong>
                      {item.detail ? <span>{item.detail}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{`${openInvoiceCount} open invoice${openInvoiceCount === 1 ? "" : "s"} · ${balanceLabel}`}</p>
              )}
            </div>
          </div>

          <div className="task-detail-brief">
            <strong>Task brief</strong>
            <p>{taskBrief}</p>
          </div>

          {task.recommendedNextAction ? (
            <div className="task-detail-next-action">
              <strong>Recommended next action</strong>
              <p>{task.recommendedNextAction}</p>
            </div>
          ) : null}

          {composeEmail && templateDraft && activeDraft ? (
            <>
            <form
              method="POST"
              action="/tasks/compose"
              className="collections-compose-form task-detail-email-form"
              encType="multipart/form-data"
              data-task-email-form
            >
              <input type="hidden" name="composeId" value={task.id} />
              <input type="hidden" name="aiSubjectLine" value={composeEmail.draft.subjectLine} />
              <input type="hidden" name="aiBody" value={composeEmail.draft.body} />
              <input type="hidden" name="aiNote" value={composeEmail.draft.note} />
              <input type="hidden" name="templateSubjectLine" value={templateDraft.subjectLine} />
              <input type="hidden" name="templateBody" value={templateDraft.body} />
              <input type="hidden" name="templateNote" value={templateDraft.note} />
              <input type="hidden" name="accountJson" value={JSON.stringify(composeEmail.account)} />
              <input type="hidden" name="contactJson" value={JSON.stringify(composeEmail.contact)} />
              <input type="hidden" name="invoicesJson" value={JSON.stringify(composeEmail.invoices)} />
              <input type="hidden" name="appliedDraftComposeId" value={activeDraft.composeId} />
              <input type="hidden" name="appliedDraftGenerator" value={activeDraft.generator} />
              <input type="hidden" name="appliedDraftSubject" value={activeDraft.subjectLine} />
              <input type="hidden" name="appliedDraftBody" value={activeDraft.body} />
              <input type="hidden" name="appliedDraftNote" value={activeDraft.note} />

              {!canSend ? (
                <div className="integration-error-banner">
                  <strong>Send is unavailable until a mailbox is connected.</strong>
                  <p>Connect a Gmail sender identity first, then reopen this task to send the follow-up.</p>
                </div>
              ) : null}

              <div className="task-compose-tabs">
                <span className="task-compose-tab is-active">Email Draft</span>
                <span className="task-compose-tab">
                  Related Tasks
                  <span className="task-compose-tab-count">{tasksBadgeCount}</span>
                </span>
              </div>

              <div className="task-compose-thread-list">
                {threadMessages.map((message) => (
                  <article key={message.id} className="task-compose-thread-card">
                    <div className="task-compose-thread-avatar">
                      {(message.fromName ?? message.fromEmail).charAt(0).toUpperCase()}
                    </div>
                    <div className="task-compose-thread-copy">
                      <div className="task-compose-thread-meta">
                        <strong>{message.fromEmail}</strong>
                        <span>{message.receivedAt}</span>
                      </div>
                      <p>{message.snippet}</p>
                    </div>
                  </article>
                ))}
              </div>

              <div className="task-compose-generator-row">
                <span>Draft source</span>
                <label className="task-compose-generator-option">
                  <input
                    type="radio"
                    name="draftGenerator"
                    value="ai"
                    defaultChecked={activeGenerator === "ai"}
                  />
                  <span>AI-generated</span>
                </label>
                <label className="task-compose-generator-option">
                  <input
                    type="radio"
                    name="draftGenerator"
                    value="template"
                    defaultChecked={activeGenerator === "template"}
                  />
                  <span>Template</span>
                </label>
                <button type="submit" className="ghost-button" formAction="/tasks/compose/apply" formNoValidate>
                  Apply
                </button>
              </div>

              <div className="task-compose-note">
                <strong>{activeDraft.generator === "ai" ? "AI-generated draft" : "Template draft"}</strong>
                <p>{activeDraft.note}</p>
              </div>

              <div className="collections-email-template-panel task-email-template-panel">
                {taskEmailTemplates.length > 0 ? (
                  <>
                    <label className="collections-message-heading">
                      <span>Email template</span>
                      <select data-email-template-select defaultValue="">
                        <option value="">Choose a Control Center template</option>
                        {taskEmailTemplates.map((template) => (
                          <option
                            key={template.id}
                            value={template.id}
                            data-template-subject={renderTaskTemplateText(template.subject, task, composeEmail)}
                            data-template-body={renderTaskTemplateText(template.body, task, composeEmail)}
                          >
                            {template.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="button" className="ghost-button" data-email-template-apply>
                      Apply template
                    </button>
                  </>
                ) : (
                  <div className="collections-email-template-empty">
                    <strong>No email templates available.</strong>
                    <span>Create an email-compatible template in Control Center to use it here.</span>
                  </div>
                )}
              </div>

              <details className="task-detail-edit-mode" open>
                <summary>
                  <AppIcon name="edit" />
                  <span>Edit email</span>
                </summary>

                <div className="task-compose-address-grid">
                  <div className="collections-message-heading">
                    <label className="label-copy" htmlFor={`task-from-${task.id}`}>From</label>
                    <select
                      id={`task-from-${task.id}`}
                      name="senderIdentityId"
                      className="form-input"
                      defaultValue={defaultSenderIdentityId}
                      required
                      disabled={senderIdentityOptions.length === 0}
                    >
                      {senderIdentityOptions.length === 0 ? (
                        <option value="">Connect a mailbox first</option>
                      ) : (
                        senderIdentityOptions.map((identity) => (
                          <option key={identity.id} value={identity.id}>
                            {identity.displayName ? `${identity.displayName} · ` : ""}
                            {identity.senderEmail}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="collections-message-heading">
                    <label className="label-copy" htmlFor={`task-to-${task.id}`}>To</label>
                    <input
                      id={`task-to-${task.id}`}
                      className="form-input"
                      defaultValue={composeEmail.contact.email ?? ""}
                      readOnly
                    />
                  </div>
                  <div className="collections-message-heading">
                    <label className="label-copy" htmlFor={`task-cc-${task.id}`}>Cc</label>
                    <input id={`task-cc-${task.id}`} name="cc" className="form-input" placeholder="Optional copy recipients" />
                  </div>
                </div>

                <div className="collections-message-heading task-detail-subject-field">
                  <label className="label-copy" htmlFor={`task-subject-${task.id}`}>Subject</label>
                  <input
                    id={`task-subject-${task.id}`}
                    name="subjectLine"
                    className="form-input"
                    defaultValue={activeDraft.subjectLine}
                    required
                  />
                </div>

                <div className="task-compose-toolbar" aria-label="Email formatting tools">
                  <button type="button" className="task-compose-format-button" title="Bold" data-task-format-command="bold">B</button>
                  <button type="button" className="task-compose-format-button" title="Italic" data-task-format-command="italic">I</button>
                  <button type="button" className="task-compose-format-button" title="Underline" data-task-format-command="underline">U</button>
                  <button type="button" className="task-compose-format-button" title="Hyperlink" data-task-format-command="link">
                    <AppIcon name="external-link" />
                  </button>
                  <label className="task-compose-attachment-trigger" htmlFor={`task-attachments-${task.id}`}>
                    <AppIcon name="paperclip" />
                    <span>Upload attachment</span>
                  </label>
                </div>

                <div className="collections-compose-grid collections-compose-grid-single">
                  <div className="collections-message-heading">
                    <textarea
                      id={`task-body-${task.id}`}
                      name="bodyPreview"
                      className="collections-compose-textarea task-compose-editor"
                      defaultValue={activeDraft.body}
                      data-task-email-body
                      required
                    />
                  </div>
                </div>

                <div className="task-compose-invoice-attachment-panel">
                  <div className="task-compose-invoice-attachment-fields">
                    <label className="label-copy" htmlFor={`task-attach-invoice-select-${task.id}`}>Upload Invoice</label>
                    <select
                      id={`task-attach-invoice-select-${task.id}`}
                      name="selectedInvoiceIds"
                      className="form-input"
                      defaultValue={composeEmail.invoices.map((invoice) => invoice.id)}
                      multiple
                      size={Math.min(Math.max(composeEmail.invoices.length, 2), 4)}
                    >
                      {composeEmail.invoices.map((invoice) => (
                        <option key={`${task.id}-${invoice.id}`} value={invoice.id}>
                          {invoice.invoiceNumber}
                          {typeof invoice.metadata.physicalInvoiceFileName === "string"
                            ? ` · ${invoice.metadata.physicalInvoiceFileName}`
                            : invoice.uploadedDocumentId
                              ? " · file attached"
                              : " · no file yet"}
                        </option>
                      ))}
                    </select>
                    <p className="task-compose-attachment-hint">
                      Hold `Cmd` or `Ctrl` to select multiple invoices for the same uploaded file.
                    </p>
                  </div>
                  <div className="task-compose-invoice-attachment-fields">
                    <label className="label-copy" htmlFor={`task-invoice-file-${task.id}`}>PDF or Photo</label>
                    <input
                      id={`task-invoice-file-${task.id}`}
                      type="file"
                      name="invoiceAttachment"
                      className="task-compose-attachment-input"
                      accept="application/pdf,image/*"
                    />
                  </div>
                  <button
                    type="submit"
                    className="ghost-button task-compose-attach-invoice-button"
                    formAction="/tasks/compose/attach-invoice"
                    formNoValidate
                  >
                    Upload Invoice
                  </button>
                </div>

                <div className="task-compose-attachment-row">
                  <label className="label-copy" htmlFor={`task-attachments-${task.id}`}>Upload attachment</label>
                  <input
                    id={`task-attachments-${task.id}`}
                    type="file"
                    name="attachments"
                    className="task-compose-attachment-input"
                    multiple
                  />
                  <label className="label-copy" htmlFor={`task-soa-${task.id}`}>Upload SOA</label>
                  <input
                    id={`task-soa-${task.id}`}
                    type="file"
                    name="soaAttachment"
                    className="task-compose-attachment-input"
                    accept="application/pdf,image/*"
                  />
                  <p className="task-compose-attachment-hint">
                    Add invoice copies, SOAs, or supporting documents before sending.
                  </p>
                </div>
              </details>

              <div className="collections-compose-footer">
                <a className="ghost-button" href="#">Cancel</a>
                <button type="submit" className="primary-button" disabled={!canSend}>
                  Send Email
                </button>
              </div>
            </form>
            <TaskDetailLifecycleActions taskId={task.id} />
            </>
          ) : (
            <TaskDetailLifecycleActions taskId={task.id} />
          )}
        </div>
      </article>
    </section>
  );
};

const TaskDetailLifecycleActions = ({ taskId }: { taskId: string }) => (
  <div className="task-detail-status-actions">
    <form method="POST" action="/tasks/status">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="status" value="completed" />
      <button type="submit" className="primary-button">Complete task</button>
    </form>
    <form method="POST" action="/tasks/delete" data-task-delete-form>
      <input type="hidden" name="taskId" value={taskId} />
      <button
        type="submit"
        className="ghost-button"
        data-confirm-message="Delete this task? This will remove it from the active task list."
      >
        Delete task
      </button>
    </form>
  </div>
);

const QuickBooksConnectPage = ({
  data,
  quickbooksConnect,
}: {
  data: OperatorConsoleData;
  quickbooksConnect?: QuickBooksConnectViewState;
}) => {
  const integration = data.integrations.find((item) => item.id === "quickbooks");
  const invoicesConnected = data.invoiceIndex.providers.find(
    (provider) => provider.provider === "quickbooks_online",
  )?.invoiceCount;
  const connectionHealthLabel =
    quickbooksConnect?.connectionHealth === "connected"
      ? "Healthy"
      : quickbooksConnect?.connectionHealth === "refresh_expiring"
        ? "Reconnect soon"
        : quickbooksConnect?.connectionHealth === "reconnect_required"
          ? "Reconnect required"
          : "Not connected";

  return (
    <section className="page-section">
      <PageHeader
        title="Connect QuickBooks Online"
        description="Give Yield AROS secure QuickBooks permission once, then let the platform read customer A/R data and prepare safe writeback actions."
        actionRow={
          <div className="header-actions">
            <a className="ghost-button" href="/integrations">Back to Integrations</a>
            <a className="primary-button" href="/integrations/quickbooks/connect?environment=production">
              Continue with QuickBooks
            </a>
          </div>
        }
      />

      {quickbooksConnect?.callbackStatus === "connected" ? (
        <article className="integration-success-banner">
          <strong>QuickBooks connection is live.</strong>
          <p>
            {quickbooksConnect.callbackMessage ??
              `${quickbooksConnect.companyName ?? "Your QuickBooks company"} is ready for import and writeback staging.`}
          </p>
        </article>
      ) : null}

      {quickbooksConnect?.callbackStatus === "error" ? (
        <article className="integration-error-banner">
          <strong>QuickBooks connection did not finish.</strong>
          <p>{quickbooksConnect.callbackMessage ?? "Try the secure sign-in flow again."}</p>
        </article>
      ) : null}

      {quickbooksConnect?.kind === "connected" && quickbooksConnect.connectionHealth !== "connected" ? (
        <article className="integration-error-banner">
          <strong>Reconnect needed before the next sync.</strong>
          <p>{quickbooksConnect.reconnectReason ?? "QuickBooks needs attention to keep data flowing safely."}</p>
        </article>
      ) : null}

      <div className="kpi-grid kpi-grid-4">
        <SimpleKpi title="Access mode" value="Read + Write" tone="success" />
        <SimpleKpi
          title="Readable objects"
          value={String(quickbooksConnect?.readableObjects.length ?? 4)}
        />
        <SimpleKpi
          title="Writable actions"
          value={String(quickbooksConnect?.writableObjects.length ?? 2)}
        />
        <SimpleKpi title="Connection" value={connectionHealthLabel} />
      </div>

      <div className="card-grid card-grid-2">
        <article className="detail-card">
          <div className="panel-header">
            <h2>Customer-facing connect flow</h2>
            <span className="pill pill-neutral">Hosted OAuth</span>
          </div>
          <div className="data-source-review-notes">
            <p>1. Click Continue with QuickBooks and sign in directly with Intuit.</p>
            <p>2. Pick the company file you want Yield AROS to access.</p>
            <p>3. Grant accounting permission once for invoice, customer, payment, and writeback-safe actions.</p>
            <p>4. Return here automatically and start importing or reconciling data the same day.</p>
          </div>
          <div className="header-actions">
            <a className="primary-button" href="/integrations/quickbooks/connect?environment=production">
              Connect production company
            </a>
            <a className="ghost-button" href="/integrations/quickbooks/connect?environment=sandbox">
              Use sandbox company
            </a>
          </div>
        </article>

        <article className="detail-card">
          <div className="panel-header">
            <h2>Permission summary</h2>
            <span className="pill pill-success">Accounting scope</span>
          </div>
          <div className="endpoints-grid">
            <EndpointRow label="OAuth scope" value={(quickbooksConnect?.scopes ?? []).join(", ")} />
            <EndpointRow label="Read access" value={(quickbooksConnect?.readableObjects ?? []).join(", ")} />
            <EndpointRow label="Write access" value={(quickbooksConnect?.writableObjects ?? []).join(", ")} />
            <EndpointRow
              label="Safety rails"
              value="ERP-safe writeback preview, audit logging, settlement checks, and review-first matching remain enforced."
            />
          </div>
        </article>
      </div>

      <div className="card-grid card-grid-2">
        <article className="detail-card">
          <div className="panel-header">
            <h2>Connection status</h2>
            <span className={`pill ${
              quickbooksConnect?.kind === "connected" && quickbooksConnect.connectionHealth === "connected"
                ? "pill-success"
                : "pill-warning"
            }`}
            >
              {quickbooksConnect?.kind === "connected" ? "Connected" : "Awaiting consent"}
            </span>
          </div>
          <div className="endpoints-grid">
            <EndpointRow label="Provider" value="QuickBooks Online" />
            <EndpointRow
              label="Company"
              value={quickbooksConnect?.companyName ?? "No QuickBooks company connected yet"}
            />
            <EndpointRow
              label="Environment"
              value={quickbooksConnect?.environment ? humanize(quickbooksConnect.environment) : "Production"}
            />
            <EndpointRow label="Health" value={connectionHealthLabel} />
            {quickbooksConnect?.accessTokenExpiresAt ? (
              <EndpointRow
                label="Access token"
                value={`Refreshes after ${formatRelativeTime(quickbooksConnect.accessTokenExpiresAt)}`}
              />
            ) : null}
            {quickbooksConnect?.refreshTokenExpiresAt ? (
              <EndpointRow
                label="Refresh token"
                value={`Valid until ${formatRelativeTime(quickbooksConnect.refreshTokenExpiresAt)}`}
              />
            ) : null}
          </div>
        </article>

        <article className="detail-card">
          <div className="panel-header">
            <h2>What happens next</h2>
            <span className="pill pill-neutral">Same-day setup</span>
          </div>
          <div className="data-source-review-notes">
            <p>Invoices can already be pulled into the canonical import path after connection.</p>
            <p>Customers and payments are available over the live QuickBooks connector for follow-on sync work.</p>
            <p>Cash application writeback stays conservative: clean cases can be staged, sensitive cases stay review-first.</p>
          </div>
          <div className="endpoints-grid">
            <EndpointRow label="Invoices available" value={String(invoicesConnected ?? 0)} />
            <EndpointRow label="Connector status" value={integration?.detail ?? "Waiting for first sync."} />
            <EndpointRow label="Next action" value={integration?.nextAction ?? "Connect and sync invoices."} />
          </div>
          <div className="header-actions">
            <form method="POST" action="/integrations/quickbooks/invoices/sync">
              <button type="submit" className="ghost-button">Import invoices now</button>
            </form>
            <a className="ghost-button" href="/invoices">Open invoices</a>
          </div>
        </article>
      </div>
    </section>
  );
};

function buildTaskTemplateDraft(composeEmail: NonNullable<TaskQueueItem["composeEmail"]>) {
  const totalAmountCents = composeEmail.invoices.reduce((sum, invoice) => sum + invoice.amountCents, 0);
  const invoiceLines = composeEmail.invoices
    .map(
      (invoice) =>
        `- ${invoice.invoiceNumber}: ${formatPhp(invoice.amountCents)} due ${invoice.dueDate ?? "soon"}`,
    )
    .join("\n");

  return {
    subjectLine: `Follow-up on overdue invoices for ${composeEmail.account.displayName}`,
    body: [
      `Hi ${composeEmail.contact.fullName},`,
      "",
      `I wanted to follow up on the overdue invoices currently outstanding on your account with us. As of today, we have ${formatPhp(totalAmountCents)} across the items below:`,
      "",
      invoiceLines,
      "",
      "Could you please let us know the expected payment timing for these invoices? If payment has already been arranged, feel free to share the remittance reference so we can review it on our side.",
      "",
      "Thank you,",
      "Yield AROS Collections",
    ].join("\n"),
    note: "Applied the saved follow-up template for overdue invoice outreach.",
  };
}

function renderTaskTemplateText(
  templateText: string,
  task: TaskQueueItem,
  composeEmail: NonNullable<TaskQueueItem["composeEmail"]>,
) {
  return applyTemplatePreviewVariables(templateText, buildTaskTemplateVariables(task, composeEmail));
}

function buildTaskTemplateVariables(
  task: TaskQueueItem,
  composeEmail: NonNullable<TaskQueueItem["composeEmail"]>,
) {
  const invoiceNumbers = composeEmail.invoices.map((invoice) => invoice.invoiceNumber).join(", ");
  const totalAmountCents = composeEmail.invoices.reduce((sum, invoice) => sum + invoice.amountCents, 0);
  const overdueSummary = composeEmail.invoices
    .map((invoice) => `- Invoice ${invoice.invoiceNumber}: ${formatPhp(invoice.amountCents)} due ${invoice.dueDate ?? "soon"}`)
    .join("\n");

  return {
    customer_name: composeEmail.contact.fullName || task.customerName,
    name: composeEmail.contact.fullName || task.customerName,
    customer_email: composeEmail.contact.email ?? "",
    customer_company_name: composeEmail.account.displayName,
    billing_account_name: composeEmail.account.displayName,
    customer_external_id: composeEmail.account.accountNumber,
    branch_name: composeEmail.account.branchId ?? "",
    sender_company_name: "Yield AROS",
    invoice_numbers: invoiceNumbers,
    overdue_invoice_summary: overdueSummary || "No linked invoices.",
    overdue_balance: formatPhp(totalAmountCents),
    upcoming_balance: formatPhp(0),
    total_account_balance: formatPhp(totalAmountCents),
    payment_url: `https://pay.yieldaros.example/account/${composeEmail.account.accountNumber}`,
    num_upcoming_invoices: "0",
  };
}

function calculateTaskOverdueLabel(composeEmail: TaskQueueItem["composeEmail"]) {
  if (!composeEmail) {
    return undefined;
  }

  const today = new Date();
  const overdueAmountCents = composeEmail.invoices
    .filter((invoice) => {
      if (!invoice.dueDate) {
        return false;
      }
      const dueDate = new Date(`${invoice.dueDate}T00:00:00.000Z`);
      return !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < today.getTime();
    })
    .reduce((sum, invoice) => sum + invoice.amountCents, 0);

  return overdueAmountCents > 0 ? formatPhp(overdueAmountCents) : undefined;
}

function buildTaskInvoiceContextItems(task: TaskQueueItem) {
  if (task.invoiceContextItems && task.invoiceContextItems.length > 0) {
    return task.invoiceContextItems.map((item) => ({
      invoiceNumber: item.invoiceNumber,
      detail: [
        item.amountLabel,
        item.dueDateLabel ? `due ${item.dueDateLabel}` : undefined,
        item.statusLabel,
      ].filter(Boolean).join(" · "),
    }));
  }

  if (task.composeEmail?.invoices.length) {
    return task.composeEmail.invoices.map((invoice) => ({
      invoiceNumber: invoice.invoiceNumber,
      detail: [
        formatPhp(invoice.amountCents),
        invoice.dueDate ? `due ${formatTaskInvoiceDueDate(invoice.dueDate)}` : undefined,
        humanize(invoice.state),
      ].filter(Boolean).join(" · "),
    }));
  }

  if (task.invoiceContextDetail) {
    return task.invoiceContextDetail
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [invoiceNumber, ...detailParts] = part.split(":");
        return {
          invoiceNumber: invoiceNumber?.trim() || "Invoice",
          detail: detailParts.join(":").trim(),
        };
      });
  }

  return [];
}

function formatTaskInvoiceDueDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function normalizeTaskFilters(input?: TaskFilterInput | undefined): NormalizedTaskFilters {
  return {
    status: isTaskStatusFilter(input?.status) ? input.status : "active",
    type: isTaskTypeFilter(input?.type) ? input.type : "all",
    priority: isTaskPriorityFilter(input?.priority) ? input.priority : "all",
    q: input?.q?.trim() ?? "",
  };
}

function filterTaskQueue(tasks: TaskQueueItem[], filters: NormalizedTaskFilters) {
  const tokens = filters.q.toLowerCase().split(/\s+/).filter(Boolean);
  return tasks.filter((task) => {
    if (filters.status === "active" && !isOpenTaskStatus(task.status)) {
      return false;
    }
    if (filters.status === "all" && task.status === "deleted") {
      return false;
    }
    if (filters.status !== "active" && filters.status !== "all" && task.status !== filters.status) {
      return false;
    }
    if (filters.type !== "all" && task.type !== filters.type) {
      return false;
    }
    if (filters.priority !== "all" && task.priority !== filters.priority) {
      return false;
    }
    if (tokens.length === 0) {
      return true;
    }

    const haystack = buildTaskSearchHaystack(task);
    return tokens.every((token) => haystack.includes(token));
  });
}

function buildTaskSearchHaystack(task: TaskQueueItem) {
  return [
    task.id,
    task.taskCode,
    task.title,
    task.customerName,
    task.brief,
    task.recommendedNextAction,
    task.type,
    taskTypeLabel(task.type),
    task.status,
    task.priority,
    task.relatedRecord,
    task.amountLabel,
    task.assigneeName,
    task.ownerTeam,
    task.invoiceContextLabel,
    task.invoiceContextDetail,
    task.callContextLabel,
    task.sourceLabel,
    task.transcriptSnippet,
    task.composeEmail?.account.accountNumber,
    task.composeEmail?.account.displayName,
    task.composeEmail?.contact.fullName,
    task.composeEmail?.contact.email,
    ...(task.composeEmail?.invoices.map((invoice) => invoice.invoiceNumber) ?? []),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
}

function isTaskStatusFilter(value: unknown): value is TaskStatusFilter {
  return value === "active" || value === "all" || value === "open" || value === "in_progress" || value === "pending_approval" || value === "completed" || value === "closed" || value === "deleted";
}

function isTaskTypeFilter(value: unknown): value is TaskTypeFilter {
  return value === "all" || value === "collection" || value === "cash_app" || value === "deduction" || value === "integration" || value === "credit_line";
}

function isTaskPriorityFilter(value: unknown): value is TaskPriorityFilter {
  return value === "all" || value === "high" || value === "medium" || value === "low";
}

function taskSourceLabel(task: TaskQueueItem) {
  if (task.sourceLabel) {
    return task.sourceLabel;
  }
  if (task.callContextLabel) {
    return "Call";
  }
  if (task.composeEmail) {
    return "Email";
  }
  switch (task.type) {
    case "cash_app":
      return "Cash app";
    case "deduction":
      return "Deduction";
    case "integration":
      return "Integration";
    case "credit_line":
      return "Credit";
    case "collection":
      return "Collections";
  }
}

function buildTaskDetailBrief(task: TaskQueueItem) {
  return (
    normalizeTaskBriefText(task.brief) ??
    (task.relatedRecord
      ? `Review ${task.relatedRecord} and complete the next safe operator action.`
      : "Review the task context and complete the next safe operator action.")
  );
}

function normalizeTaskBriefText(value: string | undefined): string | undefined {
  const normalized = value
    ?.replace(/\s+/g, " ")
    .replace(/before changing receivable state/gi, "before changing invoice status")
    .trim();
  if (!normalized || startsWithTaskSourceContext(normalized)) {
    return undefined;
  }

  const lower = normalized.toLowerCase();
  if (
    lower.includes("payment was already made") ||
    lower.includes("already paid") ||
    lower.includes("paid already")
  ) {
    return "Customer said payment was already made; verify remittance or payment evidence before changing invoice status.";
  }

  const concise = stripTaskSourceContextSections(normalized);
  if (!concise || startsWithTaskSourceContext(concise)) {
    return undefined;
  }

  const sentence = /[.!?]$/.test(concise) ? concise : `${concise}.`;
  return sentence;
}

function stripTaskSourceContextSections(value: string) {
  const markers = [
    " Scope:",
    " Recommended next action:",
    " Created from ",
    " Created from:",
    " Call note:",
    " Call summary:",
    " Transcript:",
    " Raw transcript:",
    " Source context:",
    " Internal source details:",
  ];
  const searchable = ` ${value.toLowerCase()}`;
  let end = value.length;
  for (const marker of markers) {
    const index = searchable.indexOf(marker.toLowerCase());
    if (index >= 0) {
      end = Math.min(end, Math.max(0, index - 1));
    }
  }
  return value.slice(0, end).trim();
}

function startsWithTaskSourceContext(value: string) {
  return /^(?:scope|recommended next action|created from|call note|call summary|transcript|raw transcript|source context|internal source details):/i.test(value);
}

function buildTaskThreadMessages(
  task: TaskQueueItem,
  composeEmail: NonNullable<TaskQueueItem["composeEmail"]>,
) {
  const recipient = composeEmail.contact.email ?? "customer@example.com";
  const invoiceSummary = composeEmail.invoices
    .slice(0, 2)
    .map((invoice) => invoice.invoiceNumber)
    .join(", ");

  return [
    {
      id: `${task.id}-thread-1`,
      fromEmail: recipient,
      fromName: composeEmail.contact.fullName,
      snippet: `Please resend the latest invoice copy for ${invoiceSummary}.`,
      receivedAt: "10/25/2025 8:16 AM",
    },
    {
      id: `${task.id}-thread-2`,
      fromEmail: "collections@paywithyield.com",
      fromName: "Yield Collections",
      snippet: `Checking in on the payment timing for ${composeEmail.invoices[0]?.invoiceNumber ?? "the overdue invoice"}.`,
      receivedAt: "10/24/2025 5:44 AM",
    },
  ];
}

const SapBusinessOneConnectPage = ({
  data,
  sapBusinessOneConnect,
}: {
  data: OperatorConsoleData;
  sapBusinessOneConnect?: SapBusinessOneConnectViewState;
}) => {
  const integration = data.integrations.find((item) => item.id === "sap-business-one");
  const invoicesConnected = data.invoiceIndex.providers.find(
    (provider) => provider.provider === "sap_business_one",
  )?.invoiceCount;

  return (
    <section className="page-section">
      <PageHeader
        title="Connect SAP Business One"
        description="Connect the SAP Business One Service Layer so Yield AROS can pull invoices, customers, and payments, then stage safe writeback actions."
        actionRow={
          <div className="header-actions">
            <a className="ghost-button" href="/integrations">Back to Integrations</a>
            <a className="ghost-button" href="/invoices">Open Invoices</a>
          </div>
        }
      />

      {sapBusinessOneConnect?.callbackStatus === "connected" ? (
        <article className="integration-success-banner">
          <strong>SAP Business One connection is live.</strong>
          <p>
            {sapBusinessOneConnect.callbackMessage ??
              `${sapBusinessOneConnect.companyName ?? sapBusinessOneConnect.companyDatabase ?? "SAP Business One"} is ready for import.`}
          </p>
        </article>
      ) : null}

      {sapBusinessOneConnect?.testStatus === "success" ? (
        <article className="integration-success-banner">
          <strong>Connection test succeeded.</strong>
          <p>{sapBusinessOneConnect.testMessage ?? "SAP Business One responded successfully."}</p>
        </article>
      ) : null}

      {sapBusinessOneConnect?.testStatus === "error" ? (
        <article className="integration-error-banner">
          <strong>Connection test failed.</strong>
          <p>{sapBusinessOneConnect.testMessage ?? "Check the Service Layer URL and credentials, then try again."}</p>
        </article>
      ) : null}

      {sapBusinessOneConnect?.callbackStatus === "error" ? (
        <article className="integration-error-banner">
          <strong>SAP Business One connection needs attention.</strong>
          <p>{sapBusinessOneConnect.callbackMessage ?? "Check the Service Layer URL and ERP credentials, then try again."}</p>
        </article>
      ) : null}

      <div className="kpi-grid kpi-grid-4">
        <SimpleKpi title="Access mode" value="Read + Write" tone="success" />
        <SimpleKpi title="Read objects" value={String(sapBusinessOneConnect?.readableObjects.length ?? 3)} />
        <SimpleKpi title="Write actions" value={String(sapBusinessOneConnect?.writableObjects.length ?? 2)} />
        <SimpleKpi title="Connected invoices" value={String(invoicesConnected ?? 0)} />
      </div>

      <div className="card-grid card-grid-2">
        <form method="POST" action="/integrations/sap-business-one/connect" className="detail-card form-card">
          <h2>Service Layer credentials</h2>
          <p className="label-copy">
            Use the SAP Business One Service Layer endpoint and an ERP user with the permissions you want Yield AROS to read.
          </p>
          <label className="label-copy" htmlFor="sap-b1-base-url">Service Layer URL</label>
          <input
            id="sap-b1-base-url"
            name="baseUrl"
            className="form-input"
            placeholder="https://sapb1.example.com:50000"
            required
          />
          <label className="label-copy" htmlFor="sap-b1-company-database">Company database</label>
          <input
            id="sap-b1-company-database"
            name="companyDatabase"
            className="form-input"
            placeholder="SBODEMO_PH"
            required
          />
          <label className="label-copy" htmlFor="sap-b1-username">Username</label>
          <input
            id="sap-b1-username"
            name="username"
            className="form-input"
            placeholder="manager"
            required
          />
          <label className="label-copy" htmlFor="sap-b1-password">Password</label>
          <input
            id="sap-b1-password"
            name="password"
            type="password"
            className="form-input"
            placeholder="Your SAP Business One password"
            required
          />
          <label className="label-copy" htmlFor="sap-b1-language">Language (optional)</label>
          <input
            id="sap-b1-language"
            name="language"
            className="form-input"
            placeholder="23"
          />
          <div className="header-actions">
            <button
              type="submit"
              className="ghost-button"
              formAction="/integrations/sap-business-one/connect/test"
            >
              Test connection
            </button>
            <button type="submit" className="primary-button">Connect SAP Business One</button>
          </div>
        </form>

        <article className="detail-card">
          <div className="panel-header">
            <h2>What this connection gives you</h2>
            <span className="pill pill-neutral">Service Layer</span>
          </div>
          <div className="data-source-review-notes">
            <p>1. Live A/R invoices can sync into the canonical imported-invoice pipeline.</p>
            <p>2. Business partners and incoming payments become available to the integration layer.</p>
            <p>3. Cash application and ERP writeback stay conservative and review-first.</p>
            <p>4. Branch context is preserved whenever SAP Business One exposes it on the invoice.</p>
          </div>
          <div className="endpoints-grid">
            <EndpointRow label="Auth mode" value="ERP username + password via Service Layer" />
            <EndpointRow label="Read access" value={(sapBusinessOneConnect?.readableObjects ?? []).join(", ")} />
            <EndpointRow label="Write access" value={(sapBusinessOneConnect?.writableObjects ?? []).join(", ")} />
            <EndpointRow
              label="Current company"
              value={sapBusinessOneConnect?.companyName ?? sapBusinessOneConnect?.companyDatabase ?? "Not connected yet"}
            />
            <EndpointRow
              label="Latest sync"
              value={sapBusinessOneConnect?.latestSyncRun
                ? `${humanize(sapBusinessOneConnect.latestSyncRun.status)} · ${formatRelativeTime(sapBusinessOneConnect.latestSyncRun.completedAt ?? sapBusinessOneConnect.latestSyncRun.startedAt)}`
                : "No sync has run yet"}
            />
            <EndpointRow
              label="Auto-sync"
              value={sapBusinessOneConnect?.scheduler?.enabled
                ? `Every ${sapBusinessOneConnect.scheduler.intervalMinutes} minutes`
                : "Disabled"}
            />
            <EndpointRow
              label="Next scheduled sync"
              value={sapBusinessOneConnect?.scheduler?.nextRunAt
                ? formatRelativeTime(sapBusinessOneConnect.scheduler.nextRunAt)
                : "Not scheduled"}
            />
          </div>
          <div className="header-actions">
            <form method="POST" action="/integrations/sap-business-one/invoices/sync">
              <button type="submit" className="ghost-button">Sync now</button>
            </form>
            <a className="ghost-button" href="/invoices">Open invoices</a>
          </div>
        </article>
      </div>

      <article className="detail-card">
        <div className="panel-header">
          <h2>Connection status</h2>
          <span className={`pill ${sapBusinessOneConnect?.kind === "connected" ? "pill-success" : "pill-warning"}`}>
            {sapBusinessOneConnect?.kind === "connected" ? "Connected" : "Awaiting credentials"}
          </span>
        </div>
        <div className="endpoints-grid">
          <EndpointRow label="Provider" value="SAP Business One" />
          <EndpointRow
            label="Company"
            value={sapBusinessOneConnect?.companyName ?? sapBusinessOneConnect?.companyDatabase ?? "Not connected"}
          />
          <EndpointRow label="Status detail" value={integration?.detail ?? "Waiting for first successful login."} />
          <EndpointRow label="Next action" value={integration?.nextAction ?? "Connect and import invoices."} />
        </div>
      </article>

      {sapBusinessOneConnect?.recentSyncRuns?.length ? (
        <article className="detail-card">
          <div className="panel-header">
            <h2>Recent sync runs</h2>
            <span className="pill pill-neutral">Recovery trail</span>
          </div>
          <div className="data-source-list">
            {sapBusinessOneConnect.recentSyncRuns.map((run) => (
              <article key={run.runId} className="data-source-row">
                <div className="data-source-row-copy">
                  <strong>{humanize(run.status)} sync</strong>
                  <p>
                    Scope: {run.syncScope.join(", ") || "invoices, customers, payments"} ·
                    {` ${run.invoicesSyncedCount} invoices · ${run.customersSyncedCount} customers · ${run.paymentsSyncedCount} payments`}
                  </p>
                  <p>
                    Started {formatRelativeTime(run.startedAt)}
                    {run.completedAt ? ` · completed ${formatRelativeTime(run.completedAt)}` : ""}
                  </p>
                  {run.errorMessage ? <p>{run.errorMessage}</p> : null}
                </div>
              </article>
            ))}
          </div>
        </article>
      ) : null}
    </section>
  );
};

const IntegrationsPage = ({
  data,
  odooConnect,
  odooConnectError,
  emailConnectError,
  emailConnectStatus,
}: {
  data: OperatorConsoleData;
  odooConnect?: OdooConnectViewState;
  odooConnectError?: OdooConnectErrorViewState;
  emailConnectError?: EmailConnectErrorState;
  emailConnectStatus?: EmailConnectStatusState;
}) => (
  <section className="page-section">
    <PageHeader
      title="Integration settings"
      description="Manage connections to ERPs, banks, email, and data sources"
      actionRow={
        <div className="header-actions">
          <a className="ghost-button" href="/connect/accounting/invite">
            Generate client link
          </a>
          <a className="primary-button" href="/integrations/business-central/connect">
            Connect Business Central
          </a>
          <a className="ghost-button" href="/integrations/sap-business-one">
            Connect SAP B1
          </a>
          <a className="ghost-button" href="/integrations/quickbooks">
            Connect QuickBooks
          </a>
          <a className="ghost-button" href="/integrations/email/google/connect">
            Connect Gmail
          </a>
        </div>
      }
    />

    <div className="kpi-grid kpi-grid-4">
      <SimpleKpi title="Total Integrations" value={String(data.integrations.length)} />
      <SimpleKpi
        title="Active Connections"
        value={String(data.integrations.filter((item) => item.status === "healthy").length)}
        tone="success"
      />
      <SimpleKpi title="Last Sync" value="On demand" />
      <SimpleKpi
        title="Sync Issues"
        value={String(data.integrations.filter((item) => item.status !== "healthy").length)}
      />
    </div>

    <article id="email-mailbox-form" className="detail-card">
      <div className="integration-header">
        <div className="integration-main">
          <div className="integration-app-icon">✉</div>
          <div>
            <div className="title-with-pills">
              <h2>Email sending identity</h2>
              <span className="pill pill-neutral">Outbound mailbox</span>
              <span className={`pill ${data.emailSendingIdentities.length > 0 ? "pill-success" : "pill-warning"}`}>
                {data.emailSendingIdentities.length > 0 ? `${data.emailSendingIdentities.length} connected` : "Not connected"}
              </span>
            </div>
            <div className="inline-meta">
              <span>Connect the mailbox you want Yield AROS to send from.</span>
              <span>Verified contacts, approvals, thread reuse, and audit logging remain enforced.</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card-grid card-grid-2">
        <form method="POST" action="/integrations/email/connect" className="detail-card form-card">
          <h2>Connect mailbox</h2>
          {emailConnectStatus?.kind === "success" ? (
            <div className="integration-success-banner">
              <strong>Gmail connected successfully.</strong>
              <p>{emailConnectStatus.senderEmail} is now available as a sending identity.</p>
            </div>
          ) : null}
          {emailConnectError?.kind === "error" ? (
            <div className="integration-error-banner">
              <strong>Gmail connection needs one more step.</strong>
              <p>{emailConnectError.message}</p>
            </div>
          ) : null}
          <p className="label-copy">
            Use Connect Gmail for a real Google sign-in flow, or create a sender identity record manually for other providers and local testing.
          </p>
          <div className="header-actions">
            <a className="primary-button" href="/integrations/email/google/connect">
              Connect Gmail
            </a>
          </div>
          <label className="label-copy" htmlFor="email-provider">Provider</label>
          <select id="email-provider" name="provider" className="form-input" defaultValue="gmail">
            <option value="gmail">Gmail API</option>
            <option value="microsoft_graph">Microsoft Graph / Outlook</option>
            <option value="smtp">SMTP</option>
            <option value="transactional">Transactional provider</option>
            <option value="internal">Internal stub</option>
            <option value="other">Other</option>
          </select>
          <label className="label-copy" htmlFor="email-auth-mode">Auth mode</label>
          <select id="email-auth-mode" name="authMode" className="form-input" defaultValue="oauth2">
            <option value="oauth2">OAuth 2.0</option>
            <option value="delegated_token">Delegated token</option>
            <option value="service_account">Service account</option>
            <option value="smtp_password">SMTP password</option>
            <option value="api_key">API key</option>
            <option value="other">Other</option>
          </select>
          <label className="label-copy" htmlFor="sender-email">Sender email</label>
          <input id="sender-email" name="senderEmail" className="form-input" placeholder="collections@yourcompany.com" required />
          <label className="label-copy" htmlFor="display-name">Display name</label>
          <input id="display-name" name="displayName" className="form-input" placeholder="Yield Collections" />
          <label className="label-copy" htmlFor="email-scopes">Scopes</label>
          <input id="email-scopes" name="scopes" className="form-input" placeholder="gmail.send,gmail.modify or Mail.Send" />
          <label className="label-copy" htmlFor="send-as-email">Send-as email</label>
          <input id="send-as-email" name="sendAsEmail" className="form-input" placeholder="Optional delegated alias" />
          <label className="label-copy" htmlFor="send-on-behalf-email">Send on behalf of</label>
          <input id="send-on-behalf-email" name="sendOnBehalfOfEmail" className="form-input" placeholder="Optional mailbox owner" />
          <label className="checkbox-row">
            <input type="checkbox" name="isDefault" value="true" defaultChecked={data.emailSendingIdentities.length === 0} />
            <span>Make this the default sender identity</span>
          </label>
          <button type="submit" className="primary-button">Connect mailbox</button>
        </form>

        <article className="detail-card form-card">
          <h2>How this works</h2>
          <div className="data-source-review-notes">
            <p>1. Create a sending identity here using the mailbox you want customer emails to come from.</p>
            <p>2. Set it as default so grouped reminders and resend flows can use it automatically.</p>
            <p>3. Run Validate health to confirm the build sees the connection as usable.</p>
            <p>4. Use the outbound email APIs or the collections workflows; the system will keep approval gates, verified-contact rules, and audit logs intact.</p>
          </div>
          <div className="email-preview">
            <div className="email-preview-head">
              <strong>Current default</strong>
              <span className="pill pill-neutral">
                {data.emailSendingIdentities.find((item) => item.isDefault)?.senderEmail ?? "None set"}
              </span>
            </div>
            <p>
              Thread reuse is automatic when a known conversation exists for the same billing account, contact, sender identity, and provider.
            </p>
          </div>
        </article>
      </div>
    </article>

    {data.emailSendingIdentities.length > 0 ? (
      <article className="detail-card">
        <div className="panel-header">
          <h2>Connected sending identities</h2>
          <span className="pill pill-success">Live mailbox records</span>
        </div>
        <div className="data-source-list">
          {data.emailSendingIdentities.map((identity) => (
            <article key={identity.id} className="data-source-row">
              <div className="data-source-row-main">
                <span className="data-source-row-status">
                  <AppIcon name="check" />
                </span>
                <div className="data-source-row-copy">
                  <strong>
                    {identity.displayName ? `${identity.displayName} <${identity.senderEmail}>` : identity.senderEmail}
                  </strong>
                  <p>
                    {humanize(identity.provider)} · {humanize(identity.authMode)} · connection {humanize(identity.connectionStatus)} · health {humanize(identity.healthState)}
                  </p>
                  <p>
                    Permissions: {humanize(identity.permissionStatus)}
                    {identity.scopes.length > 0 ? ` · scopes: ${identity.scopes.join(", ")}` : ""}
                  </p>
                  {identity.lastSendCheckAt ? (
                    <p>Last health check: {formatRelativeTime(identity.lastSendCheckAt)}</p>
                  ) : null}
                </div>
              </div>
              <div className="header-actions">
                {identity.isDefault ? (
                  <span className="pill pill-success">Default sender</span>
                ) : (
                  <form method="POST" action={`/integrations/email/${identity.id}/default`}>
                    <button type="submit" className="ghost-button">Set default</button>
                  </form>
                )}
                <form method="POST" action={`/integrations/email/${identity.id}/validate`}>
                  <button type="submit" className="ghost-button">Validate health</button>
                </form>
              </div>
            </article>
          ))}
        </div>
      </article>
    ) : null}

    {data.integrations.map((item, index) => (
      <article key={item.id} className="detail-card">
        <div className="integration-header">
          <div className="integration-main">
            <div className="integration-app-icon">
              {item.id === "erp" ? "ERP" : item.id === "quickbooks" ? "QB" : item.id === "sap-business-one" ? "SAP" : item.id === "bank" ? "🏦" : item.id === "bir" ? "▣" : "✉"}
            </div>
            <div>
              <div className="title-with-pills">
                <h2>{item.name}</h2>
                <span className="pill pill-neutral">
                  {item.id === "erp" || item.id === "quickbooks" || item.id === "sap-business-one" ? "ERP" : item.id === "email" ? "Email" : "Connector"}
                </span>
                <span className={`pill ${item.status === "healthy" ? "pill-success" : item.status === "warning" ? "pill-warning" : "pill-danger"}`}>
                  {item.status === "healthy" ? "Connected" : item.status}
                </span>
              </div>
              <div className="inline-meta">
                <span>{item.detail}</span>
                <span>{item.nextAction}</span>
              </div>
            </div>
          </div>
          <div className="header-actions">
            {item.id === "erp" ? (
              <div className="header-actions">
                <a className={item.status === "healthy" ? "ghost-button" : "primary-button"} href="/integrations/business-central/connect">
                  {item.status === "healthy" ? "Reconnect" : "Connect"}
                </a>
                {item.status === "healthy" ? (
                  <form method="POST" action="/integrations/business-central/sync">
                    <button type="submit" className="ghost-button">Sync all data</button>
                  </form>
                ) : null}
              </div>
            ) : item.id === "sap-business-one" ? (
              <div className="header-actions">
                <a className={item.status === "healthy" ? "ghost-button" : "primary-button"} href="/integrations/sap-business-one">
                  {item.status === "healthy" ? "Manage" : "Connect"}
                </a>
                {item.status === "healthy" ? (
                  <form method="POST" action="/integrations/sap-business-one/invoices/sync">
                    <button type="submit" className="ghost-button">Import invoices</button>
                  </form>
                ) : null}
              </div>
            ) : item.id === "quickbooks" ? (
              <div className="header-actions">
                <a className={item.status === "healthy" ? "ghost-button" : "primary-button"} href="/integrations/quickbooks">
                  {item.status === "healthy" ? "Manage" : "Connect"}
                </a>
                {item.status === "healthy" ? (
                  <form method="POST" action="/integrations/quickbooks/invoices/sync">
                    <button type="submit" className="ghost-button">Import invoices</button>
                  </form>
                ) : null}
              </div>
            ) : item.id === "odoo" ? (
              <div className="header-actions">
                <form method="POST" action="/integrations/odoo/invoices/sync">
                  <button type="submit" className="ghost-button">Import invoices</button>
                </form>
              </div>
            ) : (
              <button type="button" className="ghost-button">Configure</button>
            )}
          </div>
        </div>
        <div className="endpoints-grid">
          <EndpointRow label="Connector" value={item.name} />
          <EndpointRow label="Status" value={item.status === "healthy" ? "Connected" : item.status} />
          <EndpointRow label="Detail" value={item.detail} />
          <EndpointRow label="Next step" value={item.nextAction} />
        </div>
      </article>
    ))}

    <article className="detail-card">
      <div className="integration-header">
        <div className="integration-main">
          <div className="integration-app-icon">ODOO</div>
          <div>
            <div className="title-with-pills">
              <h2>Odoo invoice console</h2>
              <span className="pill pill-neutral">CRUD</span>
            </div>
            <div className="inline-meta">
              <span>Create, update, delete, and import Odoo invoices without leaving the dashboard.</span>
            </div>
          </div>
        </div>
      </div>

      {odooConnect?.kind === "select_database" ? (
        <form method="POST" action="/integrations/odoo/connect/select" className="detail-card form-card">
          <h2>Choose your Odoo database</h2>
          <p className="label-copy">
            We found multiple databases for {odooConnect.baseUrl}. Pick the one tied to {odooConnect.username}.
          </p>
          <input type="hidden" name="state" value={odooConnect.state} />
          <label className="label-copy" htmlFor="odoo-database-select">Database</label>
          <select id="odoo-database-select" name="database" className="form-input" defaultValue={odooConnect.databases[0]} required>
            {odooConnect.databases.map((database) => (
              <option key={database} value={database}>
                {database}
              </option>
            ))}
          </select>
          <button type="submit" className="primary-button">Continue to Odoo</button>
          <a className="ghost-button" href="/integrations">Start over</a>
        </form>
      ) : (
        <form method="POST" action="/integrations/odoo/connect" className="detail-card form-card">
          <h2>Connect Odoo account</h2>
          {odooConnectError?.kind === "error" ? (
            <div className="integration-error-banner">
              <strong>Odoo connection needs one more detail.</strong>
              <p>{odooConnectError.message}</p>
            </div>
          ) : null}
          <p className="label-copy">
            Enter your Odoo URL, username, and password. We will discover the database automatically when possible.
          </p>
          <label className="label-copy" htmlFor="odoo-base-url">Odoo URL</label>
          <input id="odoo-base-url" name="baseUrl" className="form-input" placeholder="https://your-company.odoo.com" required />
          <label className="label-copy" htmlFor="odoo-username">Username</label>
          <input id="odoo-username" name="username" className="form-input" placeholder="finance@company.com" required />
          <label className="label-copy" htmlFor="odoo-password">Password</label>
          <input id="odoo-password" name="password" type="password" className="form-input" placeholder="Your Odoo password" required />
          <label className="label-copy" htmlFor="odoo-manual-database">Database name (only if auto-discovery fails)</label>
          <input id="odoo-manual-database" name="database" className="form-input" placeholder="odoo-prod" />
          <button type="submit" className="primary-button">Log into Odoo</button>
        </form>
      )}

      <div className="card-grid card-grid-2">
        <form method="POST" action="/integrations/odoo/invoices/create" className="detail-card form-card">
          <h2>Create Odoo invoice</h2>
          <label className="label-copy" htmlFor="odoo-customer-reference">Customer reference</label>
          <input id="odoo-customer-reference" name="customerReference" className="form-input" placeholder="BA-1001" />
          <label className="label-copy" htmlFor="odoo-customer-name">Customer name</label>
          <input id="odoo-customer-name" name="customerName" className="form-input" placeholder="Acme Billing" />
          <label className="label-copy" htmlFor="odoo-invoice-number">Invoice number</label>
          <input id="odoo-invoice-number" name="invoiceNumber" className="form-input" placeholder="ODOO-1001" required />
          <label className="label-copy" htmlFor="odoo-amount-cents">Amount (cents)</label>
          <input id="odoo-amount-cents" name="amountCents" type="number" className="form-input" placeholder="1500000" required />
          <label className="label-copy" htmlFor="odoo-due-date">Due date</label>
          <input id="odoo-due-date" name="dueDate" type="date" className="form-input" />
          <label className="label-copy" htmlFor="odoo-description">Description</label>
          <input id="odoo-description" name="description" className="form-input" placeholder="Collections-created draft invoice" />
          <button type="submit" className="primary-button">Create invoice</button>
        </form>

        <div className="card-grid card-grid-1">
          <form method="POST" action="/integrations/odoo/invoices/update" className="detail-card form-card">
            <h2>Update Odoo invoice</h2>
            <label className="label-copy" htmlFor="odoo-update-id">Invoice id</label>
            <input id="odoo-update-id" name="invoiceId" type="number" className="form-input" placeholder="42" required />
            <label className="label-copy" htmlFor="odoo-update-due-date">New due date</label>
            <input id="odoo-update-due-date" name="dueDate" type="date" className="form-input" />
            <label className="label-copy" htmlFor="odoo-update-amount">New amount (cents)</label>
            <input id="odoo-update-amount" name="amountCents" type="number" className="form-input" placeholder="1750000" />
            <label className="label-copy" htmlFor="odoo-update-description">Description</label>
            <input id="odoo-update-description" name="description" className="form-input" placeholder="Updated from dashboard" />
            <button type="submit" className="ghost-button">Update invoice</button>
          </form>

          <form method="POST" action="/integrations/odoo/invoices/delete" className="detail-card form-card">
            <h2>Delete Odoo invoice</h2>
            <label className="label-copy" htmlFor="odoo-delete-id">Invoice id</label>
            <input id="odoo-delete-id" name="invoiceId" type="number" className="form-input" placeholder="42" required />
            <p className="label-copy">Only draft invoices can be deleted for safety.</p>
            <button type="submit" className="ghost-button">Delete invoice</button>
          </form>
        </div>
      </div>
    </article>
  </section>
);

const RulesPage = ({ data }: { data: OperatorConsoleData }) => (
  <section className="page-section">
    <PageHeader
      title="Rules and automations"
      description="Configure automation rules, approval thresholds, and reminder cadences"
      actionRow={<button type="button" className="primary-button">Create New Rule</button>}
    />

    <div className="kpi-grid kpi-grid-5">
      <SimpleKpi title="Active Rules" value="6" tone="success" />
      <SimpleKpi title="Total Rules" value="6" />
      <SimpleKpi title="Automations Run Today" value="342" />
      <SimpleKpi title="Actions Blocked" value="7" tone="warning" />
      <SimpleKpi title="Approvals Triggered" value="12" tone="violet" />
    </div>

    <div className="tab-pills">
      <span className="tab-pill is-active">Automation Rules</span>
      <span className="tab-pill">Reminder Cadence</span>
      <span className="tab-pill">Approval Thresholds</span>
      <span className="tab-pill">Cash Application</span>
      <span className="tab-pill">Send Windows</span>
    </div>

    {data.automationRules.map((item) => (
      <article key={item.id} className="detail-card">
        <div className="rule-header">
          <div className="rule-main">
            <div className="rule-icon">⚡</div>
            <div>
              <div className="title-with-pills">
                <h2>{item.name}</h2>
                <span className="pill pill-neutral">{item.scope}</span>
                <span className="pill pill-success">Active</span>
              </div>
              <p>{item.behavior}</p>
              <p className="label-copy">{item.auditTrail}</p>
            </div>
          </div>
          <div className="header-actions">
            <span className="toggle-pill" />
            <button type="button" className="ghost-button">Edit</button>
          </div>
        </div>
      </article>
    ))}
  </section>
);

const AccessControlUsersPage = ({
  data,
  pathname = "/admin/users",
}: {
  data: OperatorConsoleData;
  pathname?: string;
}) => {
  const admin = data.accessControlAdmin ?? buildUsersAdminFallback();

  const totalUsers = admin.users.length;
  const activeUsers = admin.users.filter((user) => user.status === "active").length;
  const invitedUsers = admin.users.filter((user) => user.status === "invited").length;
  const inactiveUsers = admin.users.filter((user) => user.status === "disabled").length;

  const closeInviteHref = pathname === "/admin/users" ? "/admin/users" : "#";

  return (
    <section className="page-section users-admin-page">
      <div className="users-admin-header">
        <div className="users-admin-title-block">
          <h1>Users &amp; Role Management</h1>
          <p>Manage user access, roles, and permissions across your organization</p>
        </div>
        <a className="users-admin-invite-button" href="#invite-user-modal">
          <AppIcon name="plus" />
          <span>Invite User</span>
        </a>
      </div>

      <div className="users-admin-stats">
        <article className="users-admin-stat-card">
          <div className="users-admin-stat-icon users-admin-stat-icon-neutral">
            <AppIcon name="approvals" />
          </div>
          <div className="users-admin-stat-copy">
            <span>Total Users</span>
            <strong>{totalUsers}</strong>
          </div>
        </article>
        <article className="users-admin-stat-card">
          <div className="users-admin-stat-icon users-admin-stat-icon-success">
            <AppIcon name="customers" />
          </div>
          <div className="users-admin-stat-copy">
            <span>Active</span>
            <strong className="users-admin-stat-success">{activeUsers}</strong>
          </div>
        </article>
        <article className="users-admin-stat-card">
          <div className="users-admin-stat-icon users-admin-stat-icon-info">
            <AppIcon name="mail" />
          </div>
          <div className="users-admin-stat-copy">
            <span>Invited</span>
            <strong className="users-admin-stat-info">{invitedUsers}</strong>
          </div>
        </article>
        <article className="users-admin-stat-card">
          <div className="users-admin-stat-icon users-admin-stat-icon-neutral">
            <AppIcon name="clock" />
          </div>
          <div className="users-admin-stat-copy">
            <span>Inactive</span>
            <strong>{inactiveUsers}</strong>
          </div>
        </article>
      </div>

      <div className="users-admin-toolbar-card">
        <div className="users-admin-searchbox">
          <AppIcon name="search" />
          <span>Search users by name, email, or ID...</span>
        </div>
        <div className="users-admin-filters">
          <div className="users-admin-filter">All Roles</div>
          <div className="users-admin-filter">All Status</div>
        </div>
      </div>

      <div className="users-admin-table-card">
        <table className="users-admin-table">
          <colgroup>
            <col className="users-admin-col-user" />
            <col className="users-admin-col-role" />
            <col className="users-admin-col-scope" />
            <col className="users-admin-col-status" />
            <col className="users-admin-col-last-active" />
            <col className="users-admin-col-actions" />
          </colgroup>
          <thead className="users-admin-table-head">
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Access Scope</th>
              <th>Status</th>
              <th>Last Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {admin.users.map((user, index) => (
              <tr className="users-admin-table-row" key={user.id}>
                <td>
            <div className="users-admin-user-cell">
              <div className="users-admin-avatar">{buildInitials(user.fullName)}</div>
              <div className="users-admin-user-copy">
                <span className="users-admin-user-name">{user.fullName}</span>
                <span className="users-admin-user-email">{user.email}</span>
              </div>
            </div>
          </td>
          <td>
                  <span className={`users-admin-role-pill ${rolePillClassName(user.primaryRole)}`}>
                    {normalizeRoleLabel(user.primaryRole) ?? "Unassigned"}
                  </span>
                </td>
                <td>
                  <div className="users-admin-scope-cell">
                    {buildScopeChips(user.scopeSummary).map((scope) => (
                      <span key={`${user.id}-${scope}`} className="users-admin-scope-pill">
                        {scope}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <span className={`users-admin-status-pill ${statusPillClassName(user.status)}`}>
                    {formatUserStatusLabel(user.status)}
                  </span>
                </td>
                <td
                  className={`users-admin-last-active${
                    formatUserLastActive(user.lastActiveAt, index) === "—" ? " is-muted" : ""
                  }`}
                >
                  {formatUserLastActive(user.lastActiveAt, index)}
                </td>
                <td className="users-admin-actions-cell" aria-hidden="true">⋮</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div id="invite-user" className="users-admin-footnote">
        Invite/create user, scope assignment, and approval authority editing remain backed by the admin API and audit log.
      </div>

      <section
        id="invite-user-modal"
        className="users-admin-invite-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-user-modal-title"
      >
        <a className="users-admin-invite-backdrop" href={closeInviteHref} aria-label="Close invite user modal" />
        <article className="users-admin-invite-panel">
          <header className="users-admin-invite-head">
            <div className="users-admin-invite-title-block">
              <h2 id="invite-user-modal-title">Invite User</h2>
              <p>Send an invitation to a new user to join your organization</p>
            </div>
            <a className="users-admin-invite-close" href={closeInviteHref} aria-label="Close invite user modal">
              ×
            </a>
          </header>

          <form className="users-admin-invite-form" method="post" action="/admin/users/invite">
            <label className="users-admin-invite-field">
              <span>Full Name</span>
              <input type="text" name="fullName" placeholder="Enter full name" />
            </label>

            <label className="users-admin-invite-field">
              <span>Email Address</span>
              <input type="email" name="email" placeholder="user@company.com" />
            </label>

            <label className="users-admin-invite-field">
              <span>Primary Role</span>
              <select name="primaryRole" defaultValue="commercial_head">
                <option value="" disabled>Select a role</option>
                <option value="commercial_head">Sales Manager</option>
                <option value="finance_head">Finance Head</option>
                <option value="ar_rep">AR Rep</option>
                <option value="collections_rep">Collections Rep</option>
                <option value="platform_admin">Platform Admin</option>
              </select>
            </label>

            <label className="users-admin-invite-field">
              <span>Access Scope (Optional)</span>
              <select name="scopeType" defaultValue="">
                <option value="">Select access scope</option>
                <option value="tenant">Tenant-wide</option>
                <option value="branch">Branch</option>
                <option value="billing_account">Billing account</option>
                <option value="portfolio">Customer portfolio</option>
                <option value="team">Team</option>
              </select>
            </label>

            <div className="users-admin-invite-actions">
              <a className="users-admin-invite-cancel" href={closeInviteHref}>Cancel</a>
              <button type="submit" className="users-admin-invite-submit">Send Invitation</button>
            </div>
          </form>
        </article>
      </section>
    </section>
  );
};

function buildUsersAdminFallback() {
  return {
    users: [
      {
        id: "user_platform_admin",
        tenantId: "default",
        email: "platform.admin@yield.example",
        fullName: "Pat Reyes",
        status: "active" as const,
        primaryRole: "Platform Admin",
        roleKeys: ["platform_admin"],
        scopeSummary: "Tenant-wide",
        lastActiveAt: "2026-04-20T08:00:00.000Z",
        approvalAuthoritySummary: "No explicit approval authority",
      },
      {
        id: "user_finance_head",
        tenantId: "default",
        email: "finance.head@yield.example",
        fullName: "Alicia Santos",
        status: "active" as const,
        primaryRole: "Finance Head",
        roleKeys: ["finance_head"],
        scopeSummary: "Tenant-wide",
        lastActiveAt: "2026-04-20T10:00:00.000Z",
        approvalAuthoritySummary: "cash_application",
      },
      {
        id: "user_sales_manager",
        tenantId: "default",
        email: "sales.manager@yield.example",
        fullName: "Miguel Cruz",
        status: "active" as const,
        primaryRole: "Sales Manager",
        roleKeys: ["commercial_head"],
        scopeSummary: "Tenant-wide",
        lastActiveAt: "2026-04-20T07:00:00.000Z",
        approvalAuthoritySummary: "outreach_exception",
      },
      {
        id: "user_ar_rep",
        tenantId: "default",
        email: "ar.rep@yield.example",
        fullName: "Jamie Lim",
        status: "active" as const,
        primaryRole: "AR Rep",
        roleKeys: ["ar_rep"],
        scopeSummary: "billing account:billing_seed_1",
        lastActiveAt: "2026-04-20T11:00:00.000Z",
        approvalAuthoritySummary: "No explicit approval authority",
      },
      {
        id: "user_collections_rep",
        tenantId: "default",
        email: "collections.rep@yield.example",
        fullName: "Tricia Dela Cruz",
        status: "invited" as const,
        primaryRole: "Collections Rep",
        roleKeys: ["collections_rep"],
        scopeSummary: "team:team_ncr",
        approvalAuthoritySummary: "No explicit approval authority",
      },
    ],
    selectedUser: undefined,
    roles: [],
    permissions: [],
    auditEvents: [],
    currentUserAccess: {
      userId: "user_platform_admin",
      roleKeys: ["platform_admin"],
      permissionKeys: ["users.manage", "roles.manage", "tenant_config.manage"],
      scopedPermissions: [],
      approvalAuthorities: [],
    },
  };
}

function buildInitials(fullName: string) {
  const parts = fullName
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}

function normalizeRoleLabel(roleLabel?: string) {
  switch (roleLabel) {
    case "Commercial Head / Sales Manager":
    case "Commercial Head":
      return "Sales Manager";
    case "Sales / Collections Rep":
    case "Sales/Collections Rep":
      return "Collections Rep";
    default:
      return roleLabel;
  }
}

function rolePillClassName(roleLabel?: string) {
  switch (normalizeRoleLabel(roleLabel)) {
    case "Finance Head":
      return "is-finance";
    case "AR Rep":
      return "is-ar";
    case "Collections Rep":
      return "is-collections";
    case "Sales Manager":
      return "is-commercial";
    case "Platform Admin":
      return "is-admin";
    default:
      return "is-neutral";
  }
}

function buildScopeChips(scopeSummary: string) {
  if (!scopeSummary || scopeSummary === "No scopes") {
    return ["None"];
  }

  if (scopeSummary === "Tenant-wide") {
    return ["Tenant-wide"];
  }

  return scopeSummary.split("|").map((scope) => scope.trim()).filter(Boolean);
}

function formatApprovalAuthoritySummary(summary: string) {
  if (summary === "No explicit approval authority") {
    return "None";
  }

  return summary
    .replace("authorities", "authorities")
    .replace("authority", "authority");
}

function formatUserStatusLabel(status: "active" | "invited" | "disabled") {
  switch (status) {
    case "disabled":
      return "Inactive";
    case "invited":
      return "Invited";
    default:
      return "Active";
  }
}

function statusPillClassName(status: "active" | "invited" | "disabled") {
  switch (status) {
    case "invited":
      return "is-invited";
    case "disabled":
      return "is-inactive";
    default:
      return "is-active";
  }
}

function formatUserLastActive(lastActiveAt: string | undefined, index: number) {
  if (!lastActiveAt) {
    const fallback = ["8h ago", "6h ago", "9h ago", "11h ago", "Mar 15", "—"];
    return fallback[index] ?? "—";
  }

  const then = new Date(lastActiveAt).getTime();
  const now = Date.now();
  const hours = Math.max(1, Math.round((now - then) / (1000 * 60 * 60)));
  return `${hours}h ago`;
}

const AccessControlRolesPage = ({ data }: { data: OperatorConsoleData }) => {
  const admin = data.accessControlAdmin;

  if (!admin) {
    return (
      <section className="page-section">
        <PageHeader
          title="Roles & Permissions"
          description="Role and permission data is unavailable right now."
        />
      </section>
    );
  }

  return (
    <section className="page-section">
      <PageHeader
        title="Roles & Permissions"
        description="Sales Manager fully configures templates and workflow strategy. Finance Head owns finance-sensitive controls and approvals."
      />

      <div className="card-grid card-grid-2">
        {admin.roles.map((role) => (
          <article className="detail-card" key={role.key}>
            <div className="title-with-pills">
              <h2>{role.label}</h2>
              <span className="pill pill-neutral">{role.assignedUserCount} users</span>
            </div>
            <p>{role.description}</p>
            <p><strong>View:</strong> {role.capabilitySummary.view.join(", ") || "None"}</p>
            <p><strong>Edit:</strong> {role.capabilitySummary.edit.join(", ") || "None"}</p>
            <p><strong>Approve:</strong> {role.capabilitySummary.approve.join(", ") || "None"}</p>
            <p><strong>Configure:</strong> {role.capabilitySummary.configure.join(", ") || "None"}</p>
          </article>
        ))}
      </div>

      <article className="detail-card">
        <h2>Permission matrix</h2>
        <div className="table-grid">
          <div className="table-head">Permission</div>
          <div className="table-head">Domain</div>
          <div className="table-head">Description</div>
          {admin.permissions.map((permission) => (
            <React.Fragment key={permission.key}>
              <div className="table-cell"><strong>{permission.key}</strong></div>
              <div className="table-cell">{permission.domain}</div>
              <div className="table-cell">{permission.description}</div>
            </React.Fragment>
          ))}
        </div>
      </article>

      <article className="detail-card">
        <h2>Audit / change history</h2>
        <ul>
          {admin.auditEvents.map((event) => (
            <li key={event.id}>
              {event.occurredAt.slice(0, 10)} · {event.action} · {event.actorId}
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
};

const CustomersPage = ({
  data,
  selectedCustomerId,
  activeTab,
  callStatus,
  callMessage,
  emailStatus,
  emailMessage,
}: {
  data: OperatorConsoleData;
  selectedCustomerId?: string;
  activeTab?: string;
  callStatus?: "started" | "failed";
  callMessage?: string;
  emailStatus?: "sent" | "approval_needed" | "failed";
  emailMessage?: string;
}) => {
  const selectedCustomer =
    data.customerIndex.find((item) => item.profileId === selectedCustomerId) ??
    data.customerIndex.find((item) => item.billingAccountId === selectedCustomerId);

  if (!selectedCustomer) {
    return (
      <section className="page-section">
        <div className="customers-module-shell">
          <div className="customers-module-header">
            <div className="customers-toolbar">
              <div className="customers-toolbar-main">
                <div className="customers-searchbox">
                  <AppIcon name="search" />
                  <span>Search by name, ID, account number, or user</span>
                </div>
                <button type="button" className="customers-filter-button">
                  <AppIcon name="filter" />
                  <span>Filter</span>
                </button>
              </div>
              <button type="button" className="customers-export-button">
                <AppIcon name="download" />
                <span>Export</span>
              </button>
            </div>
          </div>

          <article className="customers-table-card">
            <div className="customers-table customers-index-table">
              <div className="customers-table-head" />
              <div className="customers-table-head">Customer</div>
              <div className="customers-table-head">Group</div>
              <div className="customers-table-head">Account #</div>
              <div className="customers-table-head">External ID</div>
              <div className="customers-table-head">Assignee</div>
              <div className="customers-table-head">Open Invoices</div>
              <div className="customers-table-head">Oldest Due Date</div>
              <div className="customers-table-head amount">Balance</div>
              {data.customerIndex.length > 0 ? data.customerIndex.map((customer) => {
                const detail = buildCustomerDetailViewModel(data, customer);

                return (
                  <React.Fragment key={customer.profileId}>
                    <div className="customers-table-cell">
                      <div className="customers-row-select">
                        <span className="fake-checkbox" />
                        <span className={`customer-status-dot ${customerStatusClassName(customer)}`} />
                        <span className="customers-expand-mark">›</span>
                      </div>
                    </div>
                    <div className="customers-table-cell">
                      <a
                        className="customers-primary-link"
                        href={buildCustomerHref(customer.profileId)}
                      >
                        {customer.canonicalName}
                      </a>
                    </div>
                    <div className="customers-table-cell">{customer.parentAccountName ?? "—"}</div>
                    <div className="customers-table-cell">{customer.billingAccountId ?? "—"}</div>
                    <div className="customers-table-cell">{detail.externalId}</div>
                    <div className="customers-table-cell">{detail.assignee}</div>
                    <div className="customers-table-cell">{String(customer.openInvoiceCount)}</div>
                    <div className="customers-table-cell">{detail.oldestDueDate}</div>
                    <div className="customers-table-cell amount">{customer.openAmount}</div>
                  </React.Fragment>
                );
              }) : (
                <div className="customers-empty-row">
                  <strong>No customers loaded.</strong>
                  <span>Connect ERP/customer profile data or import invoices to populate customer records.</span>
                </div>
              )}
            </div>
          </article>
        </div>
      </section>
    );
  }

  const detail = buildCustomerDetailViewModel(data, selectedCustomer);
  const defaultSenderIdentity =
    data.emailSendingIdentities.find(
      (identity) => identity.connectionStatus === "connected" && identity.isDefault,
    ) ??
    data.emailSendingIdentities.find((identity) => identity.connectionStatus === "connected");
  const availableTabs = selectedCustomer.tabs.filter((tab) =>
    ["overview", "invoices", "tasks", "activity", "payments"].includes(tab.id),
  );
  const resolvedTab = resolveCustomerTab(activeTab, availableTabs);
  const callPhoneNumber = normalizeCallablePhone(detail.primaryPhone);
  const callTarget = callPhoneNumber ? detail.rawComposeEmail : undefined;
  const emailTarget = detail.rawComposeEmail?.contact.isVerified && detail.rawComposeEmail.contact.allowAutoSend
    ? detail.rawComposeEmail
    : undefined;
  const customerEmailTemplates = getAvailableCollectionsEmailTemplates(data);
  const outreachEnrollment = resolveCustomerWorkflowEnrollment(data, selectedCustomer);

  return (
    <section className="page-section">
      <div className="customers-module-shell">
        <div className="customers-module-header">
          <div className="customers-detail-top">
            <div className="customers-title-group">
              <div className="title-with-pills">
                <a className="customers-back-link" href="/customers">Customers</a>
                <span className="customers-breadcrumb-separator">/</span>
                <h2>{selectedCustomer.canonicalName}</h2>
                <span className="customers-assignee-pill">{detail.assignee}</span>
                <span className="customers-tag-pill">{detail.tagLabel}</span>
              </div>
            </div>
            <div className="header-actions">
              <button type="button" className="customers-icon-button" aria-label="Edit customer">
                <AppIcon name="edit" />
              </button>
              {callTarget ? (
                <a className="customers-dark-button" href="#customer-call-modal">
                  <AppIcon name="phone" />
                  <span>Call</span>
                </a>
              ) : (
                <button type="button" className="customers-dark-button" disabled>
                  <AppIcon name="phone" />
                  <span>Call unavailable</span>
                </button>
              )}
              {emailTarget && defaultSenderIdentity ? (
                <a className="customers-dark-button" href="#customer-email-modal">
                  <AppIcon name="mail" />
                  <span>Email</span>
                </a>
              ) : (
                <button
                  type="button"
                  className="customers-dark-button"
                  disabled
                  title={
                    defaultSenderIdentity
                      ? "Add a verified customer email before sending outreach."
                      : "Connect a sending mailbox before sending customer email."
                  }
                >
                  <AppIcon name="mail" />
                  <span>{defaultSenderIdentity ? "Email unavailable" : "Connect email first"}</span>
                </button>
              )}
              <form method="post" action="/customers/tasks/create">
                <input type="hidden" name="customerId" value={selectedCustomer.profileId} />
                <input type="hidden" name="customerName" value={selectedCustomer.canonicalName} />
                <input type="hidden" name="billingAccountId" value={selectedCustomer.billingAccountId ?? selectedCustomer.profileId} />
                <button type="submit" className="customers-outline-button">Create Task</button>
              </form>
              <a
                className="customers-outline-button"
                href={`/customers/soa?customer=${encodeURIComponent(selectedCustomer.profileId)}`}
                target="_blank"
                rel="noreferrer"
              >
                Generate SOA
              </a>
              {outreachEnrollment ? (
                <form
                  method="post"
                  action={outreachEnrollment.status === "paused" ? "/customers/outreach/resume" : "/customers/outreach/pause"}
                >
                  <input type="hidden" name="customerId" value={selectedCustomer.profileId} />
                  <input type="hidden" name="workflowId" value={outreachEnrollment.workflowId} />
                  <input type="hidden" name="executionId" value={outreachEnrollment.executionId} />
                  <input type="hidden" name="reason" value="Operator changed outreach state from customer profile." />
                  <button type="submit" className="customers-outline-button">
                    {outreachEnrollment.status === "paused" ? "Resume Outreach" : "Pause Outreach"}
                  </button>
                </form>
              ) : null}
            </div>
          </div>

          <div className="customers-tabbar" role="tablist" aria-label={`${selectedCustomer.canonicalName} detail tabs`}>
            {availableTabs.map((tab) => (
              <a
                key={tab.id}
                className={`customers-tab${resolvedTab === tab.id ? " is-active" : ""}`}
                href={buildCustomerHref(selectedCustomer.profileId, tab.id)}
              >
                {tab.label}
              </a>
            ))}
          </div>
          {callStatus ? (
            <div className={`customers-call-status is-${callStatus}`} id="customer-call-status">
              <AppIcon name={callStatus === "started" ? "phone" : "alert"} />
              <span>
                {callMessage ??
                  (callStatus === "started"
                    ? "Call started. Activity and tasks will update as Retell posts outcomes."
                    : "Call could not be started.")}
              </span>
            </div>
          ) : null}
          {emailStatus ? (
            <div className={`customers-call-status is-${emailStatus === "failed" ? "failed" : "started"}`} id="customer-email-status">
              <AppIcon name={emailStatus === "failed" ? "alert" : "mail"} />
              <span>
                {emailMessage ??
                  (emailStatus === "sent"
                    ? "Email sent."
                    : emailStatus === "approval_needed"
                      ? "Email is queued for approval before sending."
                      : "Email could not be sent.")}
              </span>
            </div>
          ) : null}
        </div>

        {resolvedTab === "overview" ? (
          <div className="customers-detail-grid">
            <div className="customers-detail-main">
              <article className="detail-card customers-section-card">
                <h2>General</h2>
                <div className="detail-grid">
                  <DetailField label="Account #" value={selectedCustomer.billingAccountId ?? "—"} />
                  <DetailField label="Source" value={detail.sourceLabel} />
                  <DetailField label="External ID" value={detail.externalId} />
                  <DetailField label="Hierarchy" value={detail.hierarchySummary} />
                </div>
              </article>

              <article className="detail-card customers-section-card">
                <div className="panel-header">
                  <h2>Contacts</h2>
                  <button type="button" className="text-button">+ Add</button>
                </div>
                <div className="detail-grid">
                  <DetailField label="Primary Email" value={detail.primaryEmail} />
                  <DetailField label="Primary Phone" value={detail.primaryPhone} />
                </div>
                <div className="customers-contact-list">
                  {detail.contacts.map((contact) => (
                    <div key={contact.name} className="customers-contact-row">
                      <div>
                        <strong>{contact.name}</strong>
                        <p>{contact.email}</p>
                      </div>
                      <div className="customers-contact-actions">
                        <span className={`pill ${contact.verified ? "pill-info" : "pill-neutral"}`}>
                          {contact.verified ? "Verified" : "Unverified"}
                        </span>
                        <span className="more-dot">⋯</span>
                      </div>
                    </div>
                  ))}
                  {detail.contacts.length === 0 ? (
                    <div className="customers-contact-empty">
                      Add a verified email or phone number before starting outbound customer communication.
                    </div>
                  ) : null}
                </div>
              </article>
            </div>

            <div className="customers-detail-side">
              <article className="customers-insight-card">
                <div className="title-with-icon">
                  <span className="sparkle">✦</span>
                  <h2>Yield Insights</h2>
                </div>
                <ul className="customers-bullet-list">
                  {detail.insights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>

              <article className="detail-card customers-overview-card">
                <h2>Overview</h2>
                <div className="customers-overview-stat">
                  <span>Open invoices</span>
                  <strong>{detail.openInvoicesLabel}</strong>
                </div>
                <div className="customers-overview-stat">
                  <span>Overdue</span>
                  <strong>{selectedCustomer.overdueAmount}</strong>
                </div>
                <div className="customers-overview-stat">
                  <span>Balance</span>
                  <strong>{selectedCustomer.openAmount}</strong>
                </div>
                <div className="customers-overview-stat">
                  <span>Credit</span>
                  <strong>{detail.creditAmount}</strong>
                </div>
              </article>
            </div>
          </div>
        ) : null}

        {resolvedTab === "invoices" ? (
          <article className="customers-table-card">
            <div className="customers-toolbar customers-inline-toolbar">
              <div className="customers-toolbar-main">
                <div className="customers-searchbox">
                  <AppIcon name="search" />
                  <span>Search by invoice #</span>
                </div>
                <button type="button" className="customers-filter-button">
                  <AppIcon name="filter" />
                  <span>Filter</span>
                </button>
              </div>
              <a className="customers-export-button" href="/invoices">
                <AppIcon name="download" />
                <span>Export</span>
              </a>
            </div>
            <div className="customers-table customers-invoice-table">
              <div className="customers-table-head" />
              <div className="customers-table-head">Number</div>
              <div className="customers-table-head">Customer</div>
              <div className="customers-table-head">Due Date</div>
              <div className="customers-table-head">Issue Date</div>
              <div className="customers-table-head">Paid Date</div>
              <div className="customers-table-head amount">Amount</div>
              <div className="customers-table-head amount">Balance</div>
              <div className="customers-table-head">Last Outreach</div>
              <div className="customers-table-head">Assignee</div>
              {detail.invoices.map((invoice) => (
                <React.Fragment key={invoice.id}>
                  <div className="customers-table-cell"><span className="fake-checkbox" /></div>
                  <div className="customers-table-cell"><a className="customers-primary-link" href={buildInvoiceDetailHref(invoice.invoiceNumber)}>{invoice.invoiceNumber}</a></div>
                  <div className="customers-table-cell">{selectedCustomer.canonicalName}</div>
                  <div className="customers-table-cell">{invoice.dueDate ?? "—"}</div>
                  <div className="customers-table-cell">{invoice.issuedAt ?? "—"}</div>
                  <div className="customers-table-cell">—</div>
                  <div className="customers-table-cell amount">{formatCustomerCurrency(invoice.totalAmountCents)}</div>
                  <div className="customers-table-cell amount">{formatCustomerCurrency(invoice.openAmountCents)}</div>
                  <div className="customers-table-cell">{detail.lastOutreach}</div>
                  <div className="customers-table-cell">{detail.assignee}</div>
                </React.Fragment>
              ))}
            </div>
            <div className="customers-table-footer">
              <span>Open invoices: <strong>{detail.invoices.length}</strong></span>
              <span>Overdue Open Invoices: <strong>{detail.overdueInvoiceCount}</strong></span>
              <span>Overdue Open Balance: <strong>{selectedCustomer.overdueAmount}</strong></span>
              <span>Open Balance: <strong>{selectedCustomer.openAmount}</strong></span>
            </div>
          </article>
        ) : null}

        {resolvedTab === "tasks" ? (
          <article className="customers-table-card">
            <div className="customers-chip-row">
              <span className="customers-chip">Assignee <span>×</span></span>
              <span className="customers-chip">Categories <span>×</span></span>
              <span className="customers-chip">Status {detail.tasks.some((task) => task.status !== "open") ? "Mixed" : "Open"} <span>×</span></span>
            </div>
            <div className="customers-table customers-task-table">
              <div className="customers-table-head" />
              <div className="customers-table-head">Customer</div>
              <div className="customers-table-head">Type</div>
              <div className="customers-table-head">Status</div>
              <div className="customers-table-head">Assignee</div>
              <div className="customers-table-head">Priority</div>
              <div className="customers-table-head">Date</div>
              {detail.tasks.map((task) => (
                <React.Fragment key={task.id}>
                  <div className="customers-table-cell"><span className="fake-checkbox" /></div>
                  <div className="customers-table-cell">{selectedCustomer.canonicalName}</div>
                  <div className="customers-table-cell">
                    <strong>{task.title}</strong>
                    <p>{task.subtitle}</p>
                  </div>
                  <div className="customers-table-cell">
                    <span className="pill pill-info">{humanize(task.status)}</span>
                  </div>
                  <div className="customers-table-cell">{task.assignee}</div>
                  <div className="customers-table-cell">{humanize(task.priority)}</div>
                  <div className="customers-table-cell">{task.dateLabel}</div>
                </React.Fragment>
              ))}
            </div>
          </article>
        ) : null}

        {resolvedTab === "activity" ? (
          <article className="customers-activity-card">
            {detail.activity.map((item) => (
              <div key={item.id} className="customers-activity-row">
                <div className="customers-activity-main">
                  <div className="customers-activity-icon">
                    <AppIcon name={item.kind === "phone" ? "phone" : "mail"} />
                  </div>
                  <div>
                    <div className="customers-activity-heading">
                      <strong>{item.label ?? "Received"}</strong>
                      <span>{item.channel}</span>
                    </div>
                    <p>{item.reference}</p>
                    <div className="customers-activity-tags">
                      {item.tags.map((tag) => (
                        <span key={tag} className="customers-activity-tag">{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="customers-activity-meta">
                  <strong>{item.dateLabel}</strong>
                  <span>{item.timeAgo}</span>
                </div>
              </div>
            ))}
          </article>
        ) : null}

        {resolvedTab === "payments" ? (
          <article className="customers-table-card">
            <div className="customers-table customers-payment-table">
              <div className="customers-table-head">Reference</div>
              <div className="customers-table-head">Customer</div>
              <div className="customers-table-head amount">Amount</div>
              <div className="customers-table-head">State</div>
              <div className="customers-table-head">Recommendation</div>
              {detail.payments.map((payment) => (
                <React.Fragment key={payment.id}>
                  <div className="customers-table-cell">{payment.paymentReference}</div>
                  <div className="customers-table-cell">{payment.accountName}</div>
                  <div className="customers-table-cell amount">{payment.amount}</div>
                  <div className="customers-table-cell">{payment.state}</div>
                  <div className="customers-table-cell">{payment.recommendation}</div>
                </React.Fragment>
              ))}
            </div>
          </article>
        ) : null}

        {resolvedTab === "ap_portal" ? (
          <article className="detail-card customers-ap-portal-card">
            <div className="panel-header">
              <div>
                <h2>AP Portal</h2>
                <p className="label-copy">Portal-specific notes stay informative only until the integration is verified.</p>
              </div>
              <span className={`pill ${detail.portalStatus === "Configured" ? "pill-success" : "pill-neutral"}`}>
                {detail.portalStatus}
              </span>
            </div>
            <div className="detail-grid">
              <DetailField label="Portal Type" value={detail.portalType} />
              <DetailField label="Portal Owner" value={detail.primaryEmail} />
              <DetailField label="Statement Access" value={detail.portalStatementAccess} />
              <DetailField label="Next Action" value={selectedCustomer.nextAction} />
            </div>
          </article>
        ) : null}

        {callTarget ? (
          <CustomerCallModal
            customer={selectedCustomer}
            account={callTarget.account}
            contact={callTarget.contact}
            invoices={callTarget.invoices}
            {...(callPhoneNumber ? { phoneNumber: callPhoneNumber } : {})}
          />
        ) : null}
        {emailTarget ? (
          <CustomerEmailModal
            customer={selectedCustomer}
            composeEmail={emailTarget}
            senderIdentities={data.emailSendingIdentities}
            templates={customerEmailTemplates}
          />
        ) : null}
      </div>
    </section>
  );
};

const CustomerCallModal = ({
  customer,
  account,
  contact,
  invoices,
  phoneNumber,
}: {
  customer: OperatorConsoleData["customerIndex"][number];
  account: NonNullable<TaskQueueItem["composeEmail"]>["account"];
  contact: NonNullable<TaskQueueItem["composeEmail"]>["contact"];
  invoices: NonNullable<TaskQueueItem["composeEmail"]>["invoices"];
  phoneNumber?: string;
}) => (
  <div className="customer-call-modal" id="customer-call-modal" role="dialog" aria-modal="true" aria-labelledby="customer-call-modal-title">
    <a className="customer-call-backdrop" href={buildCustomerHref(customer.profileId)} aria-label="Close call dialog" />
    <form method="post" action="/customers/call/start" className="customer-call-panel" data-customer-call-form>
      <div className="customer-call-head">
        <div>
          <h2 id="customer-call-modal-title">Call {customer.canonicalName}</h2>
          <p>Start a Retell collections call using the current billing account and verified context.</p>
        </div>
        <a className="customer-call-close" href={buildCustomerHref(customer.profileId)} aria-label="Close">
          ×
        </a>
      </div>

      <input type="hidden" name="customerId" value={customer.profileId} />
      <input type="hidden" name="customerName" value={customer.canonicalName} />
      <input type="hidden" name="accountJson" value={JSON.stringify(account)} />
      <input type="hidden" name="contactJson" value={JSON.stringify(contact)} />
      <input type="hidden" name="invoicesJson" value={JSON.stringify(invoices)} />

      <label className="customer-call-field">
        <span>Phone number</span>
        <input
          type="tel"
          name="phoneNumber"
          defaultValue={phoneNumber ?? ""}
          placeholder="+63 917 000 0000"
          required
          pattern="^\\+?[0-9][0-9 .()\\-]{6,}$"
        />
      </label>
      <p className="customer-call-helper">The API will still apply Retell pre-call safety checks before dialing.</p>

      <div className="customer-call-actions">
        <a href={buildCustomerHref(customer.profileId)} className="customers-outline-button">Cancel</a>
        <button type="submit" className="customers-dark-button" data-loading-label="Calling...">
          <AppIcon name="phone" />
          <span>Call</span>
        </button>
      </div>
    </form>
  </div>
);

const CustomerEmailModal = ({
  customer,
  composeEmail,
  senderIdentities,
  templates,
}: {
  customer: OperatorConsoleData["customerIndex"][number];
  composeEmail: NonNullable<TaskQueueItem["composeEmail"]>;
  senderIdentities: EmailSendingIdentityItem[];
  templates: ReturnType<typeof getAvailableCollectionsEmailTemplates>;
}) => {
  const connectedSenders = senderIdentities.filter((identity) => identity.connectionStatus === "connected");
  const defaultSender =
    connectedSenders.find((identity) => identity.isDefault) ??
    connectedSenders[0];
  const canSend = Boolean(defaultSender && composeEmail.contact.isVerified && composeEmail.contact.allowAutoSend);
  const draft = composeEmail.draft;

  return (
    <section id="customer-email-modal" className="collections-compose-modal customer-email-modal">
      <a className="collections-compose-backdrop" href={buildCustomerHref(customer.profileId)} aria-label="Close customer email" />
      <article className="collections-compose-panel customer-email-panel" role="dialog" aria-modal="true" aria-labelledby="customer-email-modal-title">
        <div className="collections-compose-header">
          <div>
            <h2 id="customer-email-modal-title">Email {customer.canonicalName}</h2>
            <p>Send through the connected outbound mailbox using verified customer contact context.</p>
          </div>
          <a className="collections-compose-close" href={buildCustomerHref(customer.profileId)} aria-label="Close">×</a>
        </div>

        <form method="post" action="/customers/email/send" className="collections-compose-form collections-email-compose-form">
          <input type="hidden" name="customerId" value={customer.profileId} />
          <input type="hidden" name="customerName" value={customer.canonicalName} />
          <input type="hidden" name="accountJson" value={JSON.stringify(composeEmail.account)} />
          <input type="hidden" name="contactJson" value={JSON.stringify(composeEmail.contact)} />
          <input type="hidden" name="invoicesJson" value={JSON.stringify(composeEmail.invoices)} />

          <div className="collections-email-template-panel">
            {templates.length > 0 ? (
              <>
                <label className="collections-email-field">
                  <span>Email template</span>
                  <select data-email-template-select defaultValue="">
                    <option value="">Choose a Control Center template</option>
                    {templates.map((template) => (
                      <option
                        key={template.id}
                        value={template.id}
                        data-template-subject={renderCustomerTemplateText(template.subject, customer, composeEmail)}
                        data-template-body={renderCustomerTemplateText(template.body, customer, composeEmail)}
                      >
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="ghost-button" data-email-template-apply>
                  Apply template
                </button>
              </>
            ) : (
              <div className="collections-email-empty compact">
                <strong>No email templates available.</strong>
                <span>Create an email-compatible template in Control Center to use it here.</span>
              </div>
            )}
          </div>

          <div className="collections-compose-grid">
            <label className="collections-email-field">
              <span>From</span>
              <select name="senderIdentityId" defaultValue={defaultSender?.id ?? ""} required>
                {connectedSenders.length > 0 ? (
                  connectedSenders.map((identity) => (
                    <option key={identity.id} value={identity.id}>
                      {identity.displayName ? `${identity.displayName} <${identity.senderEmail}>` : identity.senderEmail}
                    </option>
                  ))
                ) : (
                  <option value="">No connected mailbox</option>
                )}
              </select>
            </label>
            <label className="collections-email-field">
              <span>To</span>
              <input name="toEmail" type="email" defaultValue={composeEmail.contact.email} readOnly />
            </label>
            <label className="collections-email-field collections-email-subject-field">
              <span>Subject</span>
              <input name="subjectLine" defaultValue={draft.subjectLine} required />
            </label>
          </div>

          <label className="collections-email-field collections-email-body-field">
            <span>Body</span>
            <textarea name="bodyPreview" className="collections-compose-textarea" defaultValue={draft.body} required />
          </label>

          {!canSend ? (
            <div className="collections-email-empty compact">
              <strong>Email is unavailable.</strong>
              <span>Add a verified contact and connected sender before sending customer outreach.</span>
            </div>
          ) : null}

          <div className="collections-compose-footer">
            <a href={buildCustomerHref(customer.profileId)} className="ghost-button">Discard</a>
            <button type="submit" className="primary-button" disabled={!canSend}>
              Send
            </button>
          </div>
        </form>
      </article>
    </section>
  );
};

function buildCustomerHref(customerId: string, tab?: CustomerProfileTabId) {
  const search = new URLSearchParams({ customer: customerId });
  if (tab && tab !== "overview") {
    search.set("tab", tab);
  }

  return `/customers?${search.toString()}`;
}

function buildInvoiceDetailHref(invoiceNumber: string) {
  const search = new URLSearchParams({ invoice: invoiceNumber });
  return `/invoice-detail?${search.toString()}`;
}

function resolveCustomerTab(
  activeTab: string | undefined,
  tabs: Array<{ id: string }>,
): CustomerProfileTabId {
  const preferred = activeTab?.toLowerCase();
  const validTabIds = new Set(tabs.map((tab) => tab.id));

  if (preferred && validTabIds.has(preferred)) {
    return preferred as CustomerProfileTabId;
  }

  return "overview";
}

function buildCustomerDetailViewModel(
  data: OperatorConsoleData,
  customer: OperatorConsoleData["customerIndex"][number],
) {
  const invoices = data.invoiceIndex.invoices.filter((invoice) => invoiceMatchesCustomer(invoice, customer));
  const queueItem = data.collectionsQueue.find((item) => collectionMatchesCustomer(item, customer));
  const liveDetail =
    data.liveCustomerProfileDetail &&
    (data.customerProfile.profileId === customer.profileId ||
      data.customerProfile.profileId === customer.billingAccountId)
      ? data.liveCustomerProfileDetail
      : undefined;
  const payments = liveDetail?.payments ?? data.paymentsQueue.filter((item) => paymentMatchesCustomer(item, customer));
  const notesMatchSelectedProfile = data.customerProfile.profileId === customer.profileId;
  const insightSource = notesMatchSelectedProfile ? data.customerProfile : undefined;
  const learning = notesMatchSelectedProfile ? data.accountWorkspace.learning : undefined;

  const overdueInvoiceCount = invoices.filter(
    (invoice) => invoice.openAmountCents > 0 && (invoice.daysPastDue ?? 0) > 0,
  ).length;
  const oldestInvoice = [...invoices].sort((left, right) =>
    (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31"),
  )[0];

  const tasks = liveDetail?.tasks ?? buildCustomerTasks(customer, queueItem, overdueInvoiceCount);
  const activity = buildCustomerActivity(customer, queueItem, payments, data.callInbox.calls);
  const invoiceContact = findCustomerInvoiceContact(customer, queueItem, invoices);
  const contacts = liveDetail?.contacts ?? buildCustomerContacts(invoiceContact);
  const fallbackComposeEmail = buildCustomerComposeContext({
    customer,
    invoices,
    contact: invoiceContact,
  });
  const fallbackInsights = [
    `${customer.canonicalName} has ${customer.openInvoiceCount} open invoice${customer.openInvoiceCount === 1 ? "" : "s"} under review.`,
    customer.overdueAmount !== "₱0"
      ? `Overdue balance remains at ${customer.overdueAmount}; keep operator visibility high.`
      : "No overdue balance is blocking safe outreach right now.",
    ...(customer.primaryContactEmail
      ? [`${customer.primaryContactEmail} remains the safest surfaced contact for follow-up.`]
      : []),
  ];
  const insights = learning
    ? [
        learning.accountPaymentBehaviorSummary.summary,
        learning.preferredSendTiming.reasonSummary,
        learning.preferredContactRecommendation.reasonSummary,
      ]
    : liveDetail?.insights && liveDetail.insights.length > 0
      ? liveDetail.insights
      : fallbackInsights;

  return {
    invoices,
    tasks,
    activity,
    payments: payments.length > 0
      ? payments
      : [
          {
            id: `${customer.profileId}-payment-placeholder`,
            paymentReference: "No linked payment yet",
            accountName: customer.canonicalName,
            amount: "₱0.00",
            state: "Awaiting remittance",
            recommendation: "Hold ERP writeback until payment evidence is received.",
            source: "Customer workspace",
          },
        ],
    contacts,
    insights,
    assignee: queueItem?.assignee ?? "No Assignee",
    sourceLabel: invoices[0]?.sourceLabel ?? "File Sync",
    externalId: invoices[0]?.externalId ?? `${customer.profileId}-external`,
    hierarchySummary:
      liveDetail?.hierarchySummary ??
      (customer.parentAccountName
        ? `parent ${customer.parentAccountName} | billing ${customer.billingAccountId ?? customer.profileId} | branch preserved when known`
        : `billing ${customer.billingAccountId ?? customer.profileId} | branch preserved when known`),
    oldestDueDate: oldestInvoice?.dueDate ?? "—",
    lastOutreach: queueItem?.dueLabel ?? "12 minutes ago",
    openInvoicesLabel:
      invoices[0]
        ? `${invoices[0].invoiceNumber} and ${Math.max(invoices.length - 1, 0)} more`
        : `${customer.openInvoiceCount}`,
    overdueInvoiceCount,
    primaryEmail: liveDetail?.primaryEmail ?? invoiceContact.email ?? "No verified email",
    primaryPhone: liveDetail?.primaryPhone ?? invoiceContact.phone ?? "No verified phone",
    creditAmount: customer.disputedAmount !== "₱0" ? "₱0.00" : "₱0.00",
    portalStatus: liveDetail?.portalStatus ?? (customer.primaryContactEmail ? "Configured" : "Needs setup"),
    portalType: liveDetail?.portalType ?? (customer.parentAccountName ? "Customer portal with centralized payer access" : "Customer portal"),
    portalStatementAccess: liveDetail?.portalStatementAccess ?? (customer.openInvoiceCount > 0 ? "Statements available" : "No open statements"),
    tagLabel: customer.hasPendingReview ? "Needs review" : "No tags",
    ...(liveDetail?.rawComposeEmail ?? fallbackComposeEmail
      ? { rawComposeEmail: liveDetail?.rawComposeEmail ?? fallbackComposeEmail }
      : {}),
  };
}

function buildCustomerTasks(
  customer: OperatorConsoleData["customerIndex"][number],
  queueItem: CollectionsQueueItem | undefined,
  overdueInvoiceCount: number,
) {
  const tasks = [];

  if (queueItem) {
    tasks.push({
      id: `${customer.profileId}-call-follow-up`,
      title: "Call follow up",
      subtitle: queueItem.nextAction,
      status: "open",
      assignee: queueItem.assignee ?? "—",
      priority: customer.hasPendingReview ? "high" : "medium",
      dateLabel: queueItem.dueLabel ?? "11 minutes ago",
    });
  }

  tasks.push({
    id: `${customer.profileId}-payment-promises`,
    title: overdueInvoiceCount > 0 ? "Payment promises" : "Monitor outreach",
    subtitle:
      overdueInvoiceCount > 0
        ? `Acknowledge new dates across ${overdueInvoiceCount} overdue invoice${overdueInvoiceCount === 1 ? "" : "s"}`
        : "Keep verified contacts current before any automation expands.",
    status: "open",
    assignee: queueItem?.assignee ?? "—",
    priority: overdueInvoiceCount > 0 ? "high" : "low",
    dateLabel: "11 minutes ago",
  });

  return tasks;
}

function buildCustomerActivity(
  customer: OperatorConsoleData["customerIndex"][number],
  queueItem: CollectionsQueueItem | undefined,
  payments: PaymentQueueItem[],
  calls: OperatorConsoleData["callInbox"]["calls"],
) {
  const primaryEmail = customer.primaryContactEmail ?? queueItem?.contactEmail ?? "No verified email";
  const references = payments.length > 0
    ? payments.slice(0, 2).map((item) => item.paymentReference).join(", ")
    : `Open invoices ${customer.openInvoiceCount}`;

  return [
    ...buildCustomerCallActivity(customer, calls),
    {
      id: `${customer.profileId}-phone-activity`,
      label: "Received",
      kind: "phone" as const,
      channel: queueItem?.contactName ?? "+63 917 000 0000",
      reference: `${references} and ${Math.max(customer.openInvoiceCount - 1, 0)} more`,
      tags: ["General", "Outreach"],
      dateLabel: "Oct 25, 2025",
      timeAgo: "12 minutes ago",
    },
    {
      id: `${customer.profileId}-email-activity`,
      label: "Received",
      kind: "mail" as const,
      channel: primaryEmail,
      reference: customer.nextAction,
      tags: ["General", "Outreach"],
      dateLabel: "Oct 25, 2025",
      timeAgo: "3 hours ago",
    },
  ];
}

function buildCustomerCallActivity(
  customer: OperatorConsoleData["customerIndex"][number],
  calls: OperatorConsoleData["callInbox"]["calls"],
) {
  return calls
    .filter((call) => callMatchesCustomer(call, customer))
    .flatMap((call) => {
      const base = {
        kind: "phone" as const,
        channel: call.customerPhone ?? call.toNumber ?? call.fromNumber ?? "Retell call",
        dateLabel: formatCustomerActivityDate(call.endedAt ?? call.startedAt),
        timeAgo: formatRelativeTime(call.endedAt ?? call.startedAt),
      };
      const lifecycleItems = [
        {
          id: `${call.id}-call-initiated`,
          label: "Call initiated",
          reference: `${call.providerCallId} started from ${call.requestedBy ?? "Retell workflow"}.`,
          tags: ["Call", "Retell", titleCase(call.direction)],
          at: call.startedAt,
        },
        ...(call.status === "completed" || call.status === "needs_review"
          ? [
              {
                id: `${call.id}-call-completed`,
                label: "Call completed",
                reference: call.summary ?? `${formatCallDuration(call.durationSeconds)} ${titleCase(call.status)} call.`,
                tags: ["Call", titleCase(call.status), sentimentSymbol(call.sentiment)],
                at: call.endedAt ?? call.startedAt,
              },
            ]
          : []),
        ...(call.summary || call.disposition
          ? [
              {
                id: `${call.id}-call-outcome`,
                label: "Call outcome recorded",
                reference: call.summary ?? humanize(call.disposition ?? "call outcome"),
                tags: ["Outcome", ...call.classifications.slice(0, 2)],
                at: call.updatedAt,
              },
            ]
          : []),
        ...(call.openTasksCount > 0
          ? [
              {
                id: `${call.id}-tasks-created`,
                label: "Tasks created from call",
                reference: call.taskRefs.map((task) => task.title).join(", "),
                tags: ["Tasks", `${call.openTasksCount} open`],
                at: call.updatedAt,
              },
            ]
          : []),
      ];

      return lifecycleItems.map((item) => ({
        ...base,
        ...item,
        dateLabel: formatCustomerActivityDate(item.at),
        timeAgo: formatRelativeTime(item.at),
      }));
    })
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
    .slice(0, 6);
}

function callMatchesCustomer(
  call: OperatorConsoleData["callInbox"]["calls"][number],
  customer: OperatorConsoleData["customerIndex"][number],
) {
  const identifiers = new Set(
    [customer.profileId, customer.billingAccountId, customer.billingAccountName, customer.canonicalName]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase()),
  );
  return [
    call.billingAccountId,
    call.parentAccountId,
    call.customerName,
  ].some((value) => value && identifiers.has(value.toLowerCase()));
}

function formatCustomerActivityDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeCallablePhone(value?: string) {
  const phone = value?.trim();
  if (!phone || /^No verified phone$/i.test(phone)) {
    return undefined;
  }
  return phone;
}

type CustomerInvoiceContact = {
  name: string;
  email?: string;
  phone?: string;
  verified: boolean;
};

function findCustomerInvoiceContact(
  customer: OperatorConsoleData["customerIndex"][number],
  queueItem: CollectionsQueueItem | undefined,
  invoices: OperatorConsoleData["invoiceIndex"]["invoices"],
): CustomerInvoiceContact {
  const metadataContact = invoices.map(readInvoiceContactFromMetadata).find((contact) => contact.email || contact.phone);
  const email = customer.primaryContactEmail ?? queueItem?.contactEmail ?? metadataContact?.email;
  const phone = metadataContact?.phone;
  const verified = Boolean(customer.primaryContactEmail ?? queueItem?.contactEmail);

  return {
    name: queueItem?.contactName ?? metadataContact?.name ?? customer.canonicalName,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    verified,
  };
}

function readInvoiceContactFromMetadata(
  invoice: OperatorConsoleData["invoiceIndex"]["invoices"][number],
): Partial<CustomerInvoiceContact> {
  const metadata = invoice.metadata ?? {};
  const name = readFirstString(metadata, ["contactName", "customerContactName", "primaryContactName", "billToContactName"]);
  const email = readFirstEmail(metadata, ["email", "contactEmail", "customerEmail", "primaryContactEmail", "billToEmail", "apEmail"]);
  const phone = readFirstPhone(metadata, ["contactPhone", "customerPhone", "primaryContactPhone", "billToPhone", "mobilePhone"]);
  return {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
  };
}

function buildCustomerContacts(contact: CustomerInvoiceContact) {
  if (!contact.email) {
    return [];
  }

  return [
    {
      name: contact.name,
      email: contact.email,
      verified: contact.verified,
    },
  ];
}

function buildCustomerComposeContext(input: {
  customer: OperatorConsoleData["customerIndex"][number];
  invoices: OperatorConsoleData["invoiceIndex"]["invoices"];
  contact: CustomerInvoiceContact;
}): NonNullable<TaskQueueItem["composeEmail"]> | undefined {
  const openInvoices = input.invoices.filter((invoice) => invoice.openAmountCents > 0);
  const composeInvoices = (openInvoices.length > 0 ? openInvoices : input.invoices).map(mapInvoiceIndexEntryToComposeInvoice);
  if (!input.contact.email || composeInvoices.length === 0) {
    return undefined;
  }

  const firstInvoice = input.invoices[0];
  const accountId = input.customer.billingAccountId ?? input.customer.profileId;
  const now = new Date().toISOString();
  const contactVerified = input.contact.verified;

  return {
    account: {
      id: accountId,
      createdAt: now,
      updatedAt: now,
      parentAccountId: firstInvoice?.parentAccountId ?? input.customer.profileId,
      ...(firstInvoice?.branchId ? { branchId: firstInvoice.branchId } : {}),
      accountNumber: input.customer.billingAccountId ?? input.customer.profileId,
      displayName: input.customer.billingAccountName ?? input.customer.canonicalName,
      currency: firstInvoice?.currency ?? "PHP",
      accountTier: input.customer.accountTier === "strategic" ? "strategic" : "standard",
      status: "active",
      centrallyPaid: Boolean(input.customer.parentAccountName),
      metadata: {
        source: "customer_invoice_index",
        ...(input.customer.parentAccountName ? { parentAccountName: input.customer.parentAccountName } : {}),
      },
    },
    contact: {
      id: `contact-${sanitizeDomId(accountId)}-${sanitizeDomId(input.contact.email)}`,
      createdAt: now,
      updatedAt: now,
      parentAccountId: firstInvoice?.parentAccountId ?? input.customer.profileId,
      billingAccountId: accountId,
      ...(firstInvoice?.branchId ? { branchId: firstInvoice.branchId } : {}),
      scope: "billing_account",
      scopeId: accountId,
      fullName: input.contact.name,
      email: input.contact.email,
      ...(input.contact.phone ? { phone: input.contact.phone } : {}),
      role: input.contact.email.startsWith("ap@") ? "ap" : "customer",
      isPrimary: true,
      isVerified: contactVerified,
      allowAutoSend: contactVerified,
      recentSuccessfulResponses: 0,
      metadata: {
        source: contactVerified ? "verified_customer_profile" : "imported_invoice_metadata",
        requiresVerificationBeforeAutoSend: !contactVerified,
      },
    },
    invoices: composeInvoices,
    draft: buildCustomerEmailDraftFallback({
      customerName: input.customer.canonicalName,
      contactName: input.contact.name,
      invoices: composeInvoices,
    }),
  };
}

function mapInvoiceIndexEntryToComposeInvoice(
  invoice: OperatorConsoleData["invoiceIndex"]["invoices"][number],
): NonNullable<TaskQueueItem["composeEmail"]>["invoices"][number] {
  const now = new Date().toISOString();
  return {
    id: invoice.canonicalInvoiceId ?? invoice.id,
    createdAt: invoice.issuedAt ?? now,
    updatedAt: invoice.lastImportedAt ?? now,
    state: mapInvoiceStatusToComposeState(invoice.status),
    parentAccountId: invoice.parentAccountId ?? invoice.billingAccountId ?? invoice.customerName,
    billingAccountId: invoice.billingAccountId ?? invoice.customerName,
    ...(invoice.branchId ? { branchId: invoice.branchId } : {}),
    ...(invoice.issuedAt ? { invoiceDate: invoice.issuedAt } : {}),
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currency,
    amountCents: invoice.openAmountCents > 0 ? invoice.openAmountCents : invoice.totalAmountCents,
    ...(invoice.dueDate ? { dueDate: invoice.dueDate } : {}),
    ...(invoice.overdueAmountCents ? { disputedAmountCents: invoice.overdueAmountCents } : {}),
    metadata: {
      ...invoice.metadata,
      sourceProvider: invoice.sourceProvider,
      sourceLabel: invoice.sourceLabel,
      customerName: invoice.customerName,
    },
  };
}

function mapInvoiceStatusToComposeState(
  status: OperatorConsoleData["invoiceIndex"]["invoices"][number]["status"],
): NonNullable<TaskQueueItem["composeEmail"]>["invoices"][number]["state"] {
  if (status === "paid") {
    return "paid";
  }
  if (status === "partial") {
    return "partially_paid";
  }
  if (status === "disputed") {
    return "disputed_full";
  }
  if (status === "voided") {
    return "voided";
  }
  return "synced_open";
}

function buildCustomerEmailDraftFallback(input: {
  customerName: string;
  contactName: string;
  invoices: NonNullable<TaskQueueItem["composeEmail"]>["invoices"];
}) {
  const invoiceSummary = input.invoices
    .slice(0, 5)
    .map((invoice) => `${invoice.invoiceNumber} (${formatCustomerCurrency(invoice.amountCents)})`)
    .join(", ");

  return {
    subjectLine: `Statement follow-up for ${input.customerName}`,
    body: [
      `Hi ${input.contactName},`,
      "",
      `We're following up on the open invoice${input.invoices.length === 1 ? "" : "s"} currently on your account: ${invoiceSummary}.`,
      "",
      "Please let us know if payment has already been scheduled or if you need copies of the invoice or statement of account.",
      "",
      "Thank you,",
      "AR Team",
    ].join("\n"),
    generatedBy: "fallback" as const,
    note: "Draft generated from imported invoice context. Unverified contacts still require approval before sending.",
  };
}

function readFirstString(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function readFirstEmail(metadata: Record<string, unknown>, keys: string[]) {
  const value = readFirstString(metadata, keys);
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : undefined;
}

function readFirstPhone(metadata: Record<string, unknown>, keys: string[]) {
  const value = readFirstString(metadata, keys);
  return value && /^\+?[0-9][0-9 .()-]{6,}$/.test(value) ? value : undefined;
}

function invoiceMatchesCustomer(
  invoice: OperatorConsoleData["invoiceIndex"]["invoices"][number],
  customer: OperatorConsoleData["customerIndex"][number],
) {
  return (
    invoice.billingAccountId === customer.billingAccountId ||
    invoice.billingAccountName === customer.billingAccountName ||
    invoice.customerName === customer.canonicalName
  );
}

function resolveCustomerWorkflowEnrollment(
  data: OperatorConsoleData,
  customer: OperatorConsoleData["customerIndex"][number],
) {
  const identifiers = new Set(
    [
      customer.profileId,
      customer.billingAccountId,
      customer.billingAccountName,
      customer.canonicalName,
    ].filter((value): value is string => Boolean(value)),
  );

  for (const workflow of data.controlCenter.workflows) {
    const execution = workflow.executions.find((candidate) =>
      identifiers.has(candidate.billingAccountId) || identifiers.has(candidate.parentAccountId ?? ""),
    );
    if (execution && execution.status !== "opted_out") {
      return {
        workflowId: workflow.id,
        executionId: execution.id,
        status: execution.status,
      };
    }
  }

  return undefined;
}

function collectionMatchesCustomer(
  item: CollectionsQueueItem,
  customer: OperatorConsoleData["customerIndex"][number],
) {
  return item.accountName === customer.canonicalName || item.accountName === customer.billingAccountName;
}

function paymentMatchesCustomer(
  item: PaymentQueueItem,
  customer: OperatorConsoleData["customerIndex"][number],
) {
  return item.accountName === customer.canonicalName || item.accountName === customer.billingAccountName;
}

function customerStatusClassName(customer: OperatorConsoleData["customerIndex"][number]) {
  if (customer.disputedAmount !== "₱0") {
    return "is-danger";
  }

  if (customer.overdueAmount !== "₱0") {
    return "is-warning";
  }

  return "is-neutral";
}

function workflowStatusPillClassName(status: "active" | "paused" | "opted_out" | "manual_review") {
  switch (status) {
    case "active":
      return "pill-success";
    case "paused":
      return "pill-warning";
    case "opted_out":
      return "pill-danger";
    case "manual_review":
    default:
      return "pill-info";
  }
}

function formatCustomerCurrency(amountCents: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(amountCents / 100);
}

const AccountWorkspacePage = ({ data }: { data: OperatorConsoleData }) => (
  <section className="page-section">
    <PageHeader
      title="Customer profile"
      description="Operate one buyer profile end to end across hierarchy, exposure, contacts, and workflow context"
    />
    <div className="detail-card">
      <div className="title-with-pills">
        <h2>{data.customerProfile.overviewSummary.canonicalName}</h2>
        <span className="pill pill-violet">{humanize(data.customerProfile.overviewSummary.accountTier)}</span>
      </div>
      <div className="segmented-control" role="tablist" aria-label="Customer profile tabs">
        {data.customerProfile.tabs.map((tab: { id: string; label: string; itemCount: number }) => (
          <span key={tab.id} className={`segment-pill${tab.id === "overview" ? " is-active" : ""}`}>
            {tab.label} {tab.itemCount > 0 ? `(${tab.itemCount})` : ""}
          </span>
        ))}
      </div>
      <div className="detail-grid">
        <DetailField label="Billing account" value={data.accountWorkspace.billingAccountId} />
        <DetailField label="Parent account" value={data.customerProfile.overviewSummary.parentAccountName ?? "—"} />
        <DetailField label="Hierarchy" value={data.customerProfile.overviewSummary.hierarchySummary} />
        <DetailField label="Open balance" value={data.customerProfile.financialSummary.openAmount} />
        <DetailField label="Overdue" value={data.customerProfile.financialSummary.overdueAmount} />
        <DetailField label="Collectible" value={data.customerProfile.financialSummary.collectibleAmount} />
        <DetailField label="Disputed" value={data.customerProfile.financialSummary.disputedAmount} />
        <DetailField label="Completeness" value={`${Math.round(data.customerProfile.completenessCheck.score * 100)}%`} />
      </div>
      <div className="reason-box">
        <span className="label-copy">Next best action</span>
        <p>{data.customerProfile.insightSummary.nextBestAction ?? data.accountWorkspace.nextBestAction}</p>
        <p>{data.customerProfile.insightSummary.conciseSummary}</p>
      </div>
      {data.accountWorkspace.workflow ? (
        <article className="detail-card">
          <div className="title-with-pills">
            <h2>Workflow state</h2>
            <span className={`pill ${workflowStatusPillClassName(data.accountWorkspace.workflow.status)}`}>
              {data.accountWorkspace.workflow.statusLabel}
            </span>
            <span className="pill pill-neutral">{data.accountWorkspace.workflow.currentTrack}</span>
            <span className={`pill ${data.accountWorkspace.workflow.latestChangeBy === "ai" ? "pill-info" : "pill-warning"}`}>
              {data.accountWorkspace.workflow.latestChangeBy === "ai" ? "AI made latest change" : "Human made latest change"}
            </span>
            {data.accountWorkspace.workflow.humanReviewRequired ? (
              <span className="pill pill-danger">Human review required</span>
            ) : null}
          </div>
          <div className="detail-grid">
            <DetailField label="Workflow" value={data.accountWorkspace.workflow.workflowName} />
            <DetailField label="Latest decision" value={data.accountWorkspace.workflow.latestDecisionLabel} />
            <DetailField label="Track" value={data.accountWorkspace.workflow.currentTrack} />
            <DetailField
              label="Pause reason"
              value={data.accountWorkspace.workflow.pauseReason ?? "—"}
            />
            <DetailField
              label="Resume date"
              value={data.accountWorkspace.workflow.resumeDate ?? "—"}
            />
            <DetailField
              label="Opt-out reason"
              value={data.accountWorkspace.workflow.optOutReason ?? "—"}
            />
          </div>
          <div className="reason-box">
            <span className="label-copy">Decision rationale</span>
            <p>{data.accountWorkspace.workflow.rationale}</p>
            <p>{data.accountWorkspace.workflow.evidenceSummary}</p>
          </div>
          {data.accountWorkspace.workflow.manualOverrideLabel ? (
            <div className="detail-footer">
              <button type="button" className="ghost-button">
                {data.accountWorkspace.workflow.manualOverrideLabel}
              </button>
            </div>
          ) : null}
        </article>
      ) : null}
      <div className="card-grid card-grid-2">
        <article className="detail-card">
          <h2>Contact summary</h2>
          <p><strong>Primary:</strong> {data.customerProfile.contactSummary.primaryContactEmail ?? "No primary email"}</p>
          <p><strong>Verified contacts:</strong> {data.customerProfile.contactSummary.verifiedContacts} of {data.customerProfile.contactSummary.totalContacts}</p>
          <p><strong>Auto-send eligible:</strong> {data.customerProfile.contactSummary.autoSendEligibleContacts}</p>
          <p><strong>Shared mailboxes:</strong> {data.customerProfile.contactSummary.sharedMailboxContacts}</p>
        </article>
        <article className="detail-card">
          <h2>Credit profile</h2>
          <p><strong>Risk level:</strong> {humanize(data.customerProfile.creditProfile.riskLevel)}</p>
          <p><strong>Overdue balance:</strong> {data.customerProfile.creditProfile.hasOverdueBalance ? "Yes" : "No"}</p>
          <p><strong>Credit hold:</strong> {data.customerProfile.creditProfile.hasCreditHold ? "Yes" : "No"}</p>
          <p>{data.customerProfile.creditProfile.blockedReasons[0] ?? "No active credit blockers surfaced."}</p>
        </article>
      </div>
      <div className="card-grid card-grid-2">
          <article className="detail-card">
          <h2>Completeness check</h2>
          {data.customerProfile.completenessCheck.items.map((item: { id: string; label: string; detail: string }) => (
            <p key={item.id}>
              <strong>{item.label}:</strong> {item.detail}
            </p>
          ))}
        </article>
        <article className="detail-card">
          <h2>Customer notes</h2>
          {data.customerProfile.notes.map((note: { id: string; body: string }) => (
            <p key={note.id}>{note.body}</p>
          ))}
        </article>
      </div>
      {data.accountWorkspace.workflow?.timeline.length ? (
        <article className="detail-card">
          <div className="panel-header">
            <div>
              <h2>Workflow timeline</h2>
              <p className="label-copy">Latest AI and operator workflow decisions for this billing account.</p>
            </div>
          </div>
          <div className="activity-list">
            {data.accountWorkspace.workflow.timeline.map((item) => (
              <article key={item.id} className="activity-summary-row">
                <div className="activity-dot" />
                <div className="activity-summary-body">
                  <div className="title-with-pills">
                    <strong>{item.title}</strong>
                    <span className={`pill ${item.actor === "ai" ? "pill-info" : "pill-warning"}`}>
                      {item.actor === "ai" ? "AI" : "Human"}
                    </span>
                  </div>
                  <p>{item.summary}</p>
                  <div className="customers-activity-tags">
                    {item.tags.map((tag) => (
                      <span key={tag} className="customers-activity-tag">{tag}</span>
                    ))}
                  </div>
                </div>
                <span className="activity-summary-time">{item.at}</span>
              </article>
            ))}
          </div>
        </article>
      ) : null}
      {data.accountWorkspace.learning ? (
        <div className="card-grid card-grid-2">
          <article className="detail-card">
            <h2>Learning guidance</h2>
            <p><strong>Payment behavior:</strong> {data.accountWorkspace.learning.accountPaymentBehaviorSummary.summary}</p>
            <p><strong>Preferred contact:</strong> {data.accountWorkspace.learning.preferredContactRecommendation.contactName}</p>
            <p>{data.accountWorkspace.learning.preferredContactRecommendation.reasonSummary}</p>
            <p><strong>Preferred channel:</strong> {humanize(data.accountWorkspace.learning.preferredChannelRecommendation.channel)}</p>
            <p>{data.accountWorkspace.learning.preferredChannelRecommendation.reasonSummary}</p>
          </article>
          <article className="detail-card">
            <h2>Collection recommendations</h2>
            <p><strong>Send timing:</strong> {data.accountWorkspace.learning.preferredSendTiming.label}</p>
            <p>{data.accountWorkspace.learning.preferredSendTiming.reasonSummary}</p>
            <p><strong>Document bundle:</strong> {data.accountWorkspace.learning.documentBundleRecommendation.label}</p>
            <p>{data.accountWorkspace.learning.documentBundleRecommendation.reasonSummary}</p>
            <p><strong>PTP reliability:</strong> {humanize(data.accountWorkspace.learning.ptpReliabilityIndicator.level)}</p>
            <p>{data.accountWorkspace.learning.ptpReliabilityIndicator.reasonSummary}</p>
            <p><strong>Action score:</strong> {Math.round(data.accountWorkspace.learning.nextBestActionScore.score * 100)}%</p>
            <p>{data.accountWorkspace.learning.nextBestActionScore.reasonSummary}</p>
          </article>
        </div>
      ) : null}
    </div>
  </section>
);

const InvoiceDetailPage = ({ data }: { data: OperatorConsoleData }) => {
  const invoice = resolveInvoiceDetailEntry(data);
  const customer = resolveInvoiceDetailCustomer(data);
  const activity = buildInvoiceDetailActivity(data.invoiceDetail);
  const invoicePromise = resolveInvoicePromiseToPay(invoice);

  return (
    <section className="page-section invoice-detail-page">
      <div className="invoice-detail-header">
        <div className="invoice-detail-title">
          <h1>{data.invoiceDetail.invoiceNumber}</h1>
          <span className={`invoice-detail-status ${invoice ? buildInvoiceStatusDisplay(invoice).tone : "is-open"}`}>
            {invoice ? buildInvoiceStatusDisplay(invoice).label : data.invoiceDetail.status}
          </span>
        </div>
        <div className="invoice-detail-actions">
          <button type="button" className="invoice-detail-action-button">No Assignee</button>
          <button type="button" className="invoice-detail-action-button">
            <AppIcon name="mail" />
            <span>Email</span>
          </button>
          <button type="button" className="invoice-detail-action-button">
            <AppIcon name="phone" />
            <span>Call</span>
          </button>
          <button type="button" className="invoice-detail-icon-button" aria-label="Refresh invoice detail">
            <AppIcon name="refresh" />
          </button>
          <button type="button" className="invoice-detail-icon-button" aria-label="More invoice actions">
            <span className="invoice-detail-kebab">⋮</span>
          </button>
        </div>
      </div>

      <div className="invoice-detail-top-grid">
        <article className="invoice-detail-card">
          <h2>Invoice Details</h2>
          <div className="invoice-detail-definition-list">
            <span>Source</span>
            <strong>{invoice?.sourceLabel ?? "Sample Data Generator"}</strong>
            <span>Issued At</span>
            <strong>{formatLedgerDate(invoice?.issuedAt ?? data.invoiceDetail.dueDate)}</strong>
            <span>Due Date</span>
            <strong>{formatLedgerDate(invoice?.dueDate ?? data.invoiceDetail.dueDate)}</strong>
            <span>Amount</span>
            <strong>{data.invoiceDetail.amount}</strong>
            <span>Balance</span>
            <strong>{invoice ? formatPhp(invoice.openAmountCents) : data.invoiceDetail.amount}</strong>
            <span>Payment Promised</span>
            {invoicePromise ? (
              <strong className="invoice-detail-promise">
                {invoicePromise.promiseDate ? formatLedgerDate(invoicePromise.promiseDate) : "Captured"}
                {invoicePromise.promisedAmountCents !== undefined ? (
                  <span>{formatPromiseAmount(invoicePromise.promisedAmountCents, invoicePromise.currency)}</span>
                ) : null}
                {invoicePromise.invoiceCount && invoicePromise.invoiceCount > 1 ? (
                  <span>Group promise · {invoicePromise.invoiceCount} invoices</span>
                ) : null}
              </strong>
            ) : (
              <a href="#" className="invoice-detail-inline-link">Set Date</a>
            )}
          </div>
        </article>

        <article className="invoice-detail-card invoice-detail-customer-card">
          <h2>Customer Details</h2>
          <div className="invoice-detail-side-block">
            <span>Customer</span>
            <a href={buildCustomerHref(customer?.profileId ?? data.invoiceDetail.billingAccountId)} className="invoice-detail-inline-link">
              {customer?.canonicalName ?? invoice?.customerName ?? data.invoiceDetail.billingAccountId}
            </a>
          </div>
          <div className="invoice-detail-side-block">
            <span>Billing Address</span>
            <p>{buildInvoiceDetailAddress(invoice, customer)}</p>
          </div>
        </article>
      </div>

      <article className="invoice-detail-card">
        <h2>Line Items</h2>
        <div className="invoice-detail-line-table invoice-detail-line-table-header">
          <div>Description</div>
          <div>Qty</div>
          <div>Unit Price</div>
          <div>Total</div>
        </div>
        <div className="invoice-detail-line-table invoice-detail-line-row">
          <div>Invoice total</div>
          <div>1</div>
          <div>{data.invoiceDetail.amount}</div>
          <div>{data.invoiceDetail.amount}</div>
        </div>
      </article>

      <article className="invoice-detail-card">
        <h2>Payments</h2>
        <p className="invoice-detail-empty">No payments found for this invoice</p>
      </article>

      <article className="invoice-detail-card">
        <h2>Recent Activity</h2>
        <div className="invoice-detail-activity-list">
          {activity.map((item) => (
            <div key={item.id} className="invoice-detail-activity-row">
              <div className={`invoice-detail-activity-icon ${item.kind === "mail" ? "is-mail" : "is-phone"}`}>
                <AppIcon name={item.kind} />
              </div>
              <span className="invoice-detail-activity-pill">{item.label}</span>
              <span className="invoice-detail-activity-channel">{item.channel}</span>
              <span className="invoice-detail-activity-reference">{data.invoiceDetail.invoiceNumber}</span>
              <span className="invoice-detail-activity-date">{item.date}</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
};

const BorrowingDashboardPage = ({ data }: { data: OperatorConsoleData }) => (
  <section className="page-section">
    <PageHeader
      title="Credit Line"
      description="Demo dashboard for organization-side credit lines, lender SOAs, repayments, alerts, and tasks."
      actionRow={
        <div className="header-actions">
          <a className="ghost-button" href="/credit-line/facilities">
            View facilities
          </a>
          <a className="ghost-button" href="/credit-line/tasks">
            Open tasks
          </a>
        </div>
      }
    />

    <div className="card-grid four-up">
      <SimpleKpi
        title="Committed limit"
        value={formatPhp(data.loanDashboard.totalCommittedLimitCents)}
        subtitle={`${data.loanDashboard.facilityCount} facilities`}
      />
      <SimpleKpi
        title="Outstanding"
        value={formatPhp(data.loanDashboard.totalOutstandingCents)}
        tone="danger"
        subtitle={`${data.loanDashboard.facilitiesInArrearsCount} in arrears`}
      />
      <SimpleKpi
        title="Available to draw"
        value={formatPhp(data.loanDashboard.totalAvailableCents)}
        tone="success"
        subtitle="Based on committed headroom"
      />
      <SimpleKpi
        title="Due this week"
        value={formatPhp(data.loanDashboard.dueThisWeekCents)}
        tone="warning"
        subtitle={`${data.loanDashboard.alertCount} alerts · ${data.loanDashboard.taskCount} tasks`}
      />
    </div>

    <div className="two-column-layout">
      <article className="panel">
        <div className="panel-header">
          <div>
            <h2>Facility watchlist</h2>
            <p className="label-copy">Track utilization, DPD, and next due dates without losing lender context.</p>
          </div>
          <a className="ghost-button" href="/credit-line/facilities">
            Open list
          </a>
        </div>
        <div className="data-table">
          <div className="table-row table-head">
            <div className="table-cell">Facility</div>
            <div className="table-cell">Balances</div>
            <div className="table-cell">Due</div>
            <div className="table-cell">Status</div>
          </div>
          {data.creditFacilities.map((facility) => (
            <div key={facility.id} className="table-row">
              <div className="table-cell">
                <strong>{facility.facilityName}</strong>
                <p>{facility.lenderName}</p>
              </div>
              <div className="table-cell">
                <strong>{facility.outstandingBalance}</strong>
                <p>{facility.availableToDraw} available</p>
              </div>
              <div className="table-cell">
                <strong>{facility.nextDueDate}</strong>
                <p>{facility.daysPastDue > 0 ? `${facility.daysPastDue} DPD` : "Current"}</p>
              </div>
              <div className="table-cell">
                <span className={`pill ${facility.status === "active" ? "pill-success" : "pill-warning"}`}>
                  {humanize(facility.status)}
                </span>
                <p>{facility.utilizationPercent}% utilized</p>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="panel">
        <div className="panel-header">
          <div>
            <h2>Repayment workbench</h2>
            <p className="label-copy">SOA parsing keeps principal, interest, DST, penalty, payment applications, and running balances auditable.</p>
          </div>
        </div>
        <div className="stacked-list">
          {data.loanAlerts.slice(0, 2).map((alert) => (
            <div key={alert.id} className="stacked-item">
              <div>
                <strong>{alert.title}</strong>
                <p>{alert.summary}</p>
              </div>
              <span className={`pill ${alert.severity === "critical" ? "pill-danger" : alert.severity === "warning" ? "pill-warning" : "pill-info"}`}>
                {humanize(alert.severity)}
              </span>
            </div>
          ))}
          {data.loanTasks.slice(0, 2).map((task) => (
            <div key={task.id} className="stacked-item">
              <div>
                <strong>{task.title}</strong>
                <p>
                  {task.facilityName} · {task.owner}
                </p>
              </div>
              <span className={`pill ${task.state === "blocked" ? "pill-danger" : task.state === "in_progress" ? "pill-warning" : "pill-info"}`}>
                {humanize(task.state)}
              </span>
            </div>
          ))}
        </div>
      </article>
    </div>
  </section>
);

const CreditFacilitiesPage = ({ data }: { data: OperatorConsoleData }) => (
  <section className="page-section">
    <PageHeader
      title="Credit Line Facilities"
      description="Committed lines, utilization, headroom, and DPD for the supplier's own borrowing demo."
    />
    <article className="panel">
      <div className="data-table">
        <div className="table-row table-head">
          <div className="table-cell">Facility</div>
          <div className="table-cell">Borrower</div>
          <div className="table-cell">Limit</div>
          <div className="table-cell">Outstanding</div>
          <div className="table-cell">Headroom</div>
          <div className="table-cell">Next due</div>
          <div className="table-cell">DPD</div>
        </div>
        {data.creditFacilities.map((facility) => (
          <div key={facility.id} className="table-row">
            <div className="table-cell">
              <strong>{facility.facilityName}</strong>
              <p>{facility.lenderName}</p>
            </div>
            <div className="table-cell">
              <strong>{facility.borrowerLegalName}</strong>
              <p>{facility.currency}</p>
            </div>
            <div className="table-cell"><strong>{facility.committedLimit}</strong></div>
            <div className="table-cell"><strong>{facility.outstandingBalance}</strong></div>
            <div className="table-cell"><strong>{facility.availableToDraw}</strong></div>
            <div className="table-cell"><strong>{facility.nextDueDate}</strong></div>
            <div className="table-cell">
              <strong>{facility.daysPastDue > 0 ? `${facility.daysPastDue} days` : "Current"}</strong>
              <p>{humanize(facility.daysPastDueBucket)}</p>
            </div>
          </div>
        ))}
      </div>
    </article>
  </section>
);

const LoanStatementPage = ({ data }: { data: OperatorConsoleData }) => (
  <section className="page-section">
    <PageHeader
      title="Loan statement detail"
      description="Statement-level view of SOA parsing outputs and running balance preservation."
    />
    <div className="two-column-layout">
      <article className="panel">
        <div className="panel-header">
          <div>
            <h2>{data.loanStatementDetail.facilityName}</h2>
            <p className="label-copy">
              {data.loanStatementDetail.statementReference} · {data.loanStatementDetail.periodLabel}
            </p>
          </div>
          <span className="pill pill-warning">{data.loanStatementDetail.daysPastDue} DPD</span>
        </div>
        <dl className="detail-grid">
          <DetailField label="Lender" value={data.loanStatementDetail.lenderName} />
          <DetailField label="Source" value={data.loanStatementDetail.source} />
          <DetailField label="Opening balance" value={data.loanStatementDetail.openingBalance} />
          <DetailField label="Closing balance" value={data.loanStatementDetail.closingBalance} />
          <DetailField label="Principal" value={data.loanStatementDetail.principalDue} />
          <DetailField label="Interest" value={data.loanStatementDetail.interestDue} />
          <DetailField label="DST" value={data.loanStatementDetail.dstDue} />
          <DetailField label="Penalty" value={data.loanStatementDetail.penaltyDue} />
          <DetailField label="Total due" value={data.loanStatementDetail.totalDue} />
          <DetailField label="DPD bucket" value={humanize(data.loanStatementDetail.daysPastDueBucket)} />
        </dl>
        <p className="label-copy">{data.loanStatementDetail.runningBalanceNote}</p>
      </article>

      <article className="panel">
        <div className="panel-header">
          <div>
            <h2>Payment applications</h2>
            <p className="label-copy">Each application stays visible against the running balance.</p>
          </div>
        </div>
        <div className="stacked-list">
          {data.loanStatementDetail.paymentApplications.map((application) => (
            <div key={application.id} className="stacked-item">
              <div>
                <strong>{application.paymentReference}</strong>
                <p>
                  {application.paidAt} · {application.amountApplied}
                </p>
                <p>
                  Principal {application.appliedPrincipal} · Interest {application.appliedInterest} · DST {application.appliedDst} · Penalty {application.appliedPenalty}
                </p>
              </div>
              <span className="pill pill-info">{application.resultingRunningBalance}</span>
            </div>
          ))}
        </div>
      </article>
    </div>
  </section>
);

const LoanRepaymentsPage = ({ data }: { data: OperatorConsoleData }) => (
  <section className="page-section">
    <PageHeader
      title="Repayment history"
      description="Posted loan payments with explicit allocation across principal, interest, DST, and penalty."
    />
    <article className="panel">
      <div className="data-table">
        <div className="table-row table-head">
          <div className="table-cell">Payment</div>
          <div className="table-cell">Amount</div>
          <div className="table-cell">Principal</div>
          <div className="table-cell">Interest</div>
          <div className="table-cell">DST</div>
          <div className="table-cell">Penalty</div>
          <div className="table-cell">Remaining</div>
        </div>
        {data.loanRepaymentHistory.map((payment) => (
          <div key={payment.id} className="table-row">
            <div className="table-cell">
              <strong>{payment.paymentReference}</strong>
              <p>{payment.paidAt}</p>
            </div>
            <div className="table-cell"><strong>{payment.amount}</strong></div>
            <div className="table-cell"><strong>{payment.appliedPrincipal}</strong></div>
            <div className="table-cell"><strong>{payment.appliedInterest}</strong></div>
            <div className="table-cell"><strong>{payment.appliedDst}</strong></div>
            <div className="table-cell"><strong>{payment.appliedPenalty}</strong></div>
            <div className="table-cell">
              <strong>{payment.resultingBalance}</strong>
              <p>{humanize(payment.status)}</p>
            </div>
          </div>
        ))}
      </div>
    </article>
  </section>
);

const LoanAlertsPage = ({ data }: { data: OperatorConsoleData }) => (
  <section className="page-section">
    <PageHeader
      title="Credit Line Alerts"
      description="Credit line alerts stay visible so repayment risk is explicit and auditable."
    />
    <div className="stacked-list">
      {data.loanAlerts.map((alert) => (
        <article key={alert.id} className="panel stacked-item-card">
          <div className="stacked-item">
            <div>
              <strong>{alert.title}</strong>
              <p>{alert.facilityName}</p>
              <p>{alert.summary}</p>
            </div>
            <span className={`pill ${alert.severity === "critical" ? "pill-danger" : alert.severity === "warning" ? "pill-warning" : "pill-info"}`}>
              {humanize(alert.severity)}
            </span>
          </div>
          <p className="label-copy">Due {alert.dueAt}</p>
        </article>
      ))}
    </div>
  </section>
);

const LoanTasksPage = ({ data }: { data: OperatorConsoleData }) => (
  <section className="page-section">
    <PageHeader
      title="Credit Line Tasks"
      description="Treasury and finance follow-through for repayment, reconciliation, and lender communications."
    />
    <div className="stacked-list">
      {data.loanTasks.map((task) => (
        <article key={task.id} className="panel stacked-item-card">
          <div className="stacked-item">
            <div>
              <strong>{task.title}</strong>
              <p>
                {task.facilityName} · {task.owner}
              </p>
              <p>
                Queue: {humanize(task.queue)} · Due {task.dueAt}
              </p>
            </div>
            <span className={`pill ${task.state === "blocked" ? "pill-danger" : task.state === "in_progress" ? "pill-warning" : task.state === "completed" ? "pill-success" : "pill-info"}`}>
              {humanize(task.state)}
            </span>
          </div>
        </article>
      ))}
    </div>
  </section>
);

const ScreenInventoryPage = ({ data }: { data: OperatorConsoleData }) => (
  <section className="page-section">
    <PageHeader
      title="Screen inventory summary"
      description="The required surfaces represented in the operator console"
    />
    <div className="data-card">
      <div className="table table-inventory">
        <div className="table-head">Screen</div>
        <div className="table-head">Data source</div>
        <div className="table-head">Status</div>
        {data.screenInventory.map((item) => (
          <InventoryRow key={item.screen} item={item} />
        ))}
      </div>
    </div>
  </section>
);

const PageHeader = ({
  title,
  description,
  actionRow,
  icon,
}: {
  title: string;
  description: string;
  actionRow?: React.ReactNode;
  icon?: "sparkle";
}) => (
  <div className="page-header-row">
    <div className="page-header">
      <div className="title-with-icon">
        {icon ? <span className="sparkle">✦</span> : null}
        <h1>{title}</h1>
      </div>
      <p>{description}</p>
    </div>
    {actionRow ? <div className="page-header-actions">{actionRow}</div> : null}
  </div>
);

const AnalyticsMetricCard = ({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: "default" | "danger" | "success";
}) => (
  <article className={`analytics-metric-card analytics-metric-card-${tone}`}>
    <p>{title}</p>
    <strong className={`analytics-metric-value analytics-metric-value-${tone}`}>{value}</strong>
  </article>
);

const AnalyticsImpactCard = ({
  title,
  value,
  icon,
  accent,
}: {
  title: string;
  value: string;
  icon: "currency" | "trend" | "mail";
  accent: "info" | "success" | "violet";
}) => (
  <article className="analytics-impact-card">
    <span className={`analytics-impact-icon analytics-impact-icon-${accent}`}>
        <AppIcon name={icon} />
    </span>
    <div className="analytics-impact-copy">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  </article>
);

const AnalyticsTrendChart = ({
  labels,
  series,
  ariaLabel,
  yMin,
  yMax,
  tickFormatter = (value: number) => String(Math.round(value)),
  valueFormatter = (value: number) => String(value),
  hasData = true,
  emptyMessage = "No data available for this period.",
}: {
  labels: string[];
  series: Array<{ label: string; color: string; values: number[] }>;
  ariaLabel: string;
  yMin?: number;
  yMax?: number;
  tickFormatter?: (value: number) => string;
  valueFormatter?: (value: number) => string;
  hasData?: boolean;
  emptyMessage?: string;
}) => {
  if (!hasData) {
    return <p className="analytics-empty-state">{emptyMessage}</p>;
  }

  const width = 680;
  const height = 260;
  const paddingLeft = 54;
  const paddingRight = 18;
  const paddingTop = 20;
  const paddingBottom = 40;
  const allValues = series.flatMap((item) => item.values);
  const minValue = yMin ?? Math.max(0, Math.min(...allValues) * 0.92);
  const maxValue = yMax ?? Math.max(...allValues) * 1.08;
  const innerWidth = width - paddingLeft - paddingRight;
  const innerHeight = height - paddingTop - paddingBottom;
  const denominator = Math.max(1, maxValue - minValue);
  const horizontalGuides = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;

    return {
      y: paddingTop + innerHeight * ratio,
      value: maxValue - denominator * ratio,
    };
  });

  return (
    <div className="analytics-trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        {horizontalGuides.map((guide) => (
          <g key={guide.y}>
            <line
              x1={paddingLeft}
              x2={width - paddingRight}
              y1={guide.y}
              y2={guide.y}
              className="analytics-line-guide"
            />
            <text
              x={paddingLeft - 8}
              y={guide.y + 4}
              textAnchor="end"
              className="analytics-line-value-label"
            >
              {tickFormatter(guide.value)}
            </text>
          </g>
        ))}
        {labels.map((label, index) => {
          const x = paddingLeft + (innerWidth * index) / Math.max(1, labels.length - 1);

          return (
          <line
            key={`${label}-guide`}
            x1={x}
            x2={x}
            y1={paddingTop}
            y2={height - paddingBottom}
            className="analytics-line-vertical-guide"
          />
          );
        })}
        {series.map((item) => {
          const chartPoints = item.values.map((value, index) => {
            const x = paddingLeft + (innerWidth * index) / Math.max(1, item.values.length - 1);
            const y = paddingTop + ((maxValue - value) / denominator) * innerHeight;

            return { label: labels[index] ?? String(index), value, x, y };
          });
          const polyline = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");

          return (
            <g key={item.label}>
              <polyline points={polyline} className="analytics-line-path" style={{ stroke: item.color }} />
              {chartPoints.map((point) => {
                const tooltip = `${item.label} ${point.label}: ${valueFormatter(point.value)}`;
                const tooltipWidth = Math.max(118, tooltip.length * 6.2 + 20);

                return (
                  <g
                    key={`${item.label}-${point.label}`}
                    className="analytics-point-group"
                    tabIndex={0}
                    aria-label={tooltip}
                  >
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="13"
                      className="analytics-point-hit"
                    />
                    <g
                      className="analytics-point-tooltip"
                      transform={`translate(${point.x}, ${Math.max(34, point.y - 12)})`}
                    >
                      <rect
                        x={-tooltipWidth / 2}
                        y="-34"
                        width={tooltipWidth}
                        height="24"
                        rx="6"
                        className="analytics-tooltip-box"
                      />
                      <text y="-18" textAnchor="middle" className="analytics-tooltip-text">
                        {tooltip}
                      </text>
                    </g>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="4.5"
                      className="analytics-line-point"
                      style={{ fill: item.color }}
                    >
                      <title>{tooltip}</title>
                    </circle>
                  </g>
                );
              })}
            </g>
          );
        })}
        {labels.map((label, index) => {
          const x = paddingLeft + (innerWidth * index) / Math.max(1, labels.length - 1);

          return (
            <text key={label} x={x} y={height - 12} textAnchor="middle" className="analytics-line-label">
              {label}
            </text>
          );
        })}
      </svg>
      <div className="analytics-legend">
        {series.map((item) => (
          <span key={item.label}>
            <i className="analytics-legend-dot" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
};

const KpiCard = ({
  title,
  value,
  tone,
  icon,
  footer,
  action,
}: {
  title: string;
  value: string;
  tone: "success" | "danger" | "warning" | "info" | "violet";
  icon: "trend" | "alert" | "clock" | "currency" | "check";
  footer?: string;
  action?: string;
}) => (
  <article className="kpi-card">
    <div className="kpi-card-top">
      <p>{title}</p>
      <span className={`metric-icon metric-${tone}`}>
        <AppIcon name={icon} />
      </span>
    </div>
    <strong className={`kpi-value tone-${tone}`}>{value}</strong>
    {footer ? <span className="kpi-footer">{footer}</span> : null}
    {action ? <a className={`kpi-action tone-${tone}`} href="#">{action} →</a> : null}
  </article>
);

const SimpleKpi = ({
  title,
  value,
  tone,
  subtitle,
}: {
  title: string;
  value: string;
  tone?: "success" | "danger" | "warning" | "info" | "violet";
  subtitle?: string;
}) => (
  <article className="simple-kpi">
    <p>{title}</p>
    <strong className={tone ? `tone-${tone}` : undefined}>{value}</strong>
    {subtitle ? <span>{subtitle}</span> : null}
  </article>
);

const MiniCard = ({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone?: "success" | "danger" | "warning" | "info" | "violet";
}) => (
  <article className="simple-kpi">
    <p>{title}</p>
    <strong className={tone ? `tone-${tone}` : undefined}>{value}</strong>
  </article>
);

const ActivitySummaryRow = ({ item }: { item: FeedItem }) => (
  <article className="activity-summary-row">
    <div className="activity-dot" />
    <div className="activity-summary-body">
      <strong>{item.summary}</strong>
      <p>{item.outcome}</p>
    </div>
    <span className="activity-summary-time">{item.at}</span>
  </article>
);

const CollectionsTableRow = ({ item, index }: { item: CollectionsQueueItem; index: number }) => {
  const accountHref = index === 0 ? "/account-workspace" : "#";
  const invoiceHref = index === 0 ? buildInvoiceDetailHref("INV-2026-1234") : "#";

  return (
    <>
      <div className="table-cell"><span className="fake-checkbox" /></div>
      <div className="table-cell">
        <a href={accountHref}><strong>{collectionAccountName(index, item.accountName)}</strong></a>
        <span className={`pill ${item.accountTier === "Strategic" ? "pill-violet" : index === 2 ? "pill-warning" : "pill-neutral"}`}>
          {item.accountTier === "Strategic" ? "Strategic" : index === 2 ? "Approval Required" : item.accountTier}
        </span>
      </div>
      <div className="table-cell">
        <strong>{item.contactName ?? collectionContact(index)}</strong>
        <p>{item.contactEmail ?? collectionEmail(index)}</p>
        {item.learning ? <p>{item.learning.preferredContactRecommendation.reasonSummary}</p> : null}
      </div>
      <div className="table-cell"><strong>{item.outstandingAmount ?? collectionOutstanding(index)}</strong></div>
      <div className="table-cell"><strong className="tone-danger">{collectionOverdue(index)}</strong></div>
      <div className="table-cell">
        <strong>{item.oldestInvoiceAge ?? collectionAge(index)}</strong>
        <p>{item.averageAge ?? collectionAverage(index)}</p>
      </div>
      <div className="table-cell"><strong>{item.assignee ?? collectionAssignee(index)}</strong></div>
      <div className="table-cell">
        <a href={invoiceHref}><strong>{collectionAction(index, item.nextAction)}</strong></a>
        {item.learning ? <p>{item.learning.nextBestActionScore.reasonSummary}</p> : null}
      </div>
      <div className="table-cell"><strong>{item.dueLabel ?? "Mar 29"}</strong></div>
      <div className="table-cell"><span className="more-dot">⋮</span></div>
    </>
  );
};

const ExceptionTableRow = ({ item, index }: { item: ExceptionQueueItem; index: number }) => (
  <>
    <div className="table-cell"><strong>{exceptionTypeLabel(index, item.type)}</strong></div>
    <div className="table-cell"><strong>{exceptionAccountLabel(index, item.accountName)}</strong></div>
    <div className="table-cell"><strong>{exceptionInvoiceLabel(index)}</strong></div>
    <div className="table-cell"><strong>{exceptionAmountLabel(index, item.amount)}</strong></div>
    <div className="table-cell"><strong>{exceptionOwnerLabel(index)}</strong></div>
    <div className="table-cell"><span className={`pill ${index % 2 === 0 ? "pill-success" : "pill-info"}`}>{index % 2 === 0 ? "High" : "Medium"}</span></div>
    <div className="table-cell"><strong>{exceptionSlaLabel(index)}</strong></div>
    <div className="table-cell">
      <strong>{item.nextAction}</strong>
      {item.learning ? <p>{item.learning.exceptionPlaybookRecommendation.reasonSummary}</p> : null}
      <button type="button" className="resolve-button">Resolve</button>
    </div>
  </>
);

const MetaBlock = ({ label, value }: { label: string; value: string }) => (
  <div className="meta-block">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const EndpointRow = ({ label, value }: { label: string; value: string }) => (
  <div className="endpoint-row">
    <span>{label}</span>
    <span className="pill pill-neutral">{value}</span>
  </div>
);

const DetailField = ({ label, value }: { label: string; value: string }) => (
  <div className="detail-field">
    <dt>{label}</dt>
    <dd>{value}</dd>
  </div>
);

const InventoryRow = ({
  item,
}: {
  item: {
    screen: string;
    source: string;
    status: string;
  };
}) => (
  <>
    <div className="table-cell"><strong>{item.screen}</strong></div>
    <div className="table-cell"><p>{item.source}</p></div>
    <div className="table-cell"><span className="pill pill-success">{item.status}</span></div>
  </>
);

const InvoiceIndexRow = ({
  invoice,
  customers,
}: {
  invoice: OperatorConsoleData["invoiceIndex"]["invoices"][number];
  customers: OperatorConsoleData["customerIndex"];
}) => {
  const customer = resolveInvoiceCustomer(customers, invoice);
  const statusDisplay = buildInvoiceStatusDisplay(invoice);

  return (
    <div className="invoice-ledger-table invoice-ledger-row">
      <div className="invoice-ledger-cell invoice-ledger-cell-checkbox">
        <input type="checkbox" aria-label={`Select invoice ${invoice.invoiceNumber}`} />
      </div>
      <div className="invoice-ledger-cell" data-label="Number">
        <a href={buildInvoiceDetailHref(invoice.invoiceNumber)} className="invoice-ledger-link">{invoice.invoiceNumber}</a>
      </div>
      <div className="invoice-ledger-cell invoice-ledger-customer-cell" data-label="Customer">
        <a href={buildCustomerHref(customer?.profileId ?? invoice.billingAccountId ?? invoice.customerName)} className="invoice-ledger-customer-link">
          {invoice.customerName}
        </a>
        <div className="invoice-customer-popover" role="dialog" aria-label={`${invoice.customerName} account summary`}>
          <div className="invoice-customer-popover-header">
            <span className="invoice-customer-popover-icon">
              <AppIcon name="customers" />
            </span>
            <strong>{invoice.customerName}</strong>
          </div>
        <div className="invoice-customer-popover-grid">
            <span>Account #</span>
            <strong>{customer?.billingAccountId ?? invoice.customerReference ?? invoice.billingAccountId ?? "—"}</strong>
            <span>Overdue Balance</span>
            <strong>{customer?.overdueAmount ?? formatPhp(getInvoiceOverdueAmountCents(invoice))}</strong>
            <span>Open Invoices</span>
            <strong>{customer?.openInvoiceCount ?? (invoice.openAmountCents > 0 ? 1 : 0)}</strong>
            <span>Segment</span>
            <a href={buildCustomerHref(customer?.profileId ?? invoice.billingAccountId ?? invoice.customerName)} className="invoice-customer-popover-segment">
              {customer ? humanize(customer.accountTier) : "Standard"}
            </a>
          </div>
          <a href={buildCustomerHref(customer?.profileId ?? invoice.billingAccountId ?? invoice.customerName)} className="invoice-customer-popover-action">
            View Details
          </a>
        </div>
      </div>
      <div className="invoice-ledger-cell" data-label="Due Date">{formatLedgerDate(invoice.dueDate)}</div>
      <div className="invoice-ledger-cell" data-label="Issue Date">{formatLedgerDate(invoice.issuedAt)}</div>
      <div className="invoice-ledger-cell" data-label="Paid Date">{invoice.paidAmountCents > 0 && invoice.openAmountCents === 0 ? formatLedgerDate(invoice.lastImportedAt) : "—"}</div>
      <div className="invoice-ledger-cell" data-label="Promise To Pay">{formatLedgerDate(resolveInvoicePromiseToPayDate(invoice))}</div>
      <div className="invoice-ledger-cell" data-label="Status">
        <span className={`invoice-ledger-status ${statusDisplay.tone}`}>{statusDisplay.label}</span>
      </div>
    </div>
  );
};

function resolveInvoiceCustomer(
  customers: OperatorConsoleData["customerIndex"],
  invoice: OperatorConsoleData["invoiceIndex"]["invoices"][number],
) {
  return customers.find((customer) =>
    customer.profileId === invoice.billingAccountId ||
    customer.billingAccountId === invoice.billingAccountId ||
    customer.canonicalName === invoice.customerName ||
    customer.billingAccountName === invoice.billingAccountName,
  );
}

function resolveInvoiceDetailEntry(data: OperatorConsoleData) {
  const exactInvoice = data.invoiceIndex.invoices.find(
    (invoice) => invoice.invoiceNumber === data.invoiceDetail.invoiceNumber,
  );
  if (exactInvoice) {
    return exactInvoice;
  }

  return data.invoiceIndex.invoices.find(
    (invoice) => invoice.billingAccountId === data.invoiceDetail.billingAccountId,
  );
}

function resolveInvoiceDetailCustomer(data: OperatorConsoleData) {
  return data.customerIndex.find((customer) =>
    customer.profileId === data.invoiceDetail.billingAccountId ||
    customer.billingAccountId === data.invoiceDetail.billingAccountId,
  );
}

function buildInvoiceDetailAddress(
  invoice: OperatorConsoleData["invoiceIndex"]["invoices"][number] | undefined,
  customer: OperatorConsoleData["customerIndex"][number] | undefined,
) {
  const lines = [
    invoice?.billingAccountName ?? customer?.billingAccountName ?? customer?.canonicalName,
    invoice?.branchName ?? invoice?.branchId ?? customer?.branchNames[0],
    invoice?.parentAccountName,
  ].filter((value): value is string => Boolean(value));

  return lines.length > 0 ? lines.join(", ") : "Billing address unavailable";
}

function buildInvoiceDetailActivity(invoiceDetail: OperatorConsoleData["invoiceDetail"]) {
  if (invoiceDetail.linkedStatuses.length === 0) {
    return [
      {
        id: "activity-fallback-1",
        kind: "mail" as const,
        label: "Sent",
        channel: "workflow@paywithyield.com",
        date: "Feb 28, 2026 02:00 AM",
      },
    ];
  }

  return invoiceDetail.linkedStatuses.map((item, index) => ({
    id: item.id,
    kind: index === 0 ? "mail" as const : "phone" as const,
    label: index === 0 ? "Sent" : "Outbound",
    channel: "workflow@paywithyield.com",
    date: index === 0 ? "Feb 28, 2026 02:00 AM" : "Feb 08, 2026 02:00 AM",
  }));
}

function buildInvoiceStatusDisplay(invoice: OperatorConsoleData["invoiceIndex"]["invoices"][number]) {
  if ((invoice.daysPastDue ?? 0) > 0 && invoice.openAmountCents > 0) {
    return {
      label: `${invoice.daysPastDue} day${invoice.daysPastDue === 1 ? "" : "s"} overdue`,
      tone: "is-overdue",
    };
  }

  if (invoice.status === "partial") {
    return { label: "Partial", tone: "is-partial" };
  }

  if (invoice.status === "paid") {
    return { label: "Paid", tone: "is-paid" };
  }

  if (invoice.status === "disputed") {
    return { label: "Disputed", tone: "is-overdue" };
  }

  return { label: "Open", tone: "is-open" };
}

function formatLedgerDate(value?: string) {
  if (!value) {
    return "—";
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[2]}/${match[3]}/${match[1]}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return `${String(parsed.getMonth() + 1).padStart(2, "0")}/${String(parsed.getDate()).padStart(2, "0")}/${parsed.getFullYear()}`;
}

function getInvoiceOverdueAmountCents(invoice: OperatorConsoleData["invoiceIndex"]["invoices"][number]) {
  return (invoice.daysPastDue ?? 0) > 0 ? invoice.openAmountCents : 0;
}

function resolveInvoicePromiseToPayDate(invoice: OperatorConsoleData["invoiceIndex"]["invoices"][number]) {
  const metadata = invoice.metadata as Record<string, unknown>;
  const value = metadata.promiseToPayDate ?? metadata.promise_to_pay_date ?? metadata.nextInstallmentDueDate;
  return typeof value === "string" ? value : undefined;
}

function resolveInvoicePromiseToPay(
  invoice: OperatorConsoleData["invoiceIndex"]["invoices"][number] | undefined,
) {
  if (!invoice) {
    return undefined;
  }

  const metadata = invoice.metadata as Record<string, unknown>;
  const promiseDate = readMetadataString(metadata.promiseToPayDate ?? metadata.promise_to_pay_date);
  const promisedAmountCents = readMetadataNumber(
    metadata.promiseToPayAmountCents ??
      metadata.promisedAmountCents ??
      metadata.promised_amount_cents,
  );
  const promiseToPayId = readMetadataString(metadata.promiseToPayId ?? metadata.promise_to_pay_id);
  const state = readMetadataString(metadata.promiseToPayState ?? metadata.promise_to_pay_state);
  const invoiceCount = readMetadataNumber(metadata.promiseToPayInvoiceCount ?? metadata.promise_to_pay_invoice_count);
  if (!promiseDate && promisedAmountCents === undefined && !promiseToPayId) {
    return undefined;
  }

  return {
    ...(promiseToPayId ? { promiseToPayId } : {}),
    ...(promiseDate ? { promiseDate } : {}),
    ...(state ? { state } : {}),
    ...(promisedAmountCents !== undefined ? { promisedAmountCents } : {}),
    ...(invoiceCount !== undefined ? { invoiceCount } : {}),
    currency: readMetadataString(metadata.promiseToPayCurrency ?? metadata.currency) ?? invoice.currency,
  };
}

function readMetadataString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readMetadataNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function formatPromiseAmount(valueCents: number, currency: string) {
  if (currency === "PHP") {
    return formatPhp(valueCents);
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(valueCents / 100);
}

const AppIcon = ({
  name,
}: {
  name:
    | "dashboard"
    | "invoice"
    | "customers"
    | "collections"
    | "cash"
    | "exceptions"
    | "approvals"
    | "activity"
    | "integrations"
    | "data-sources"
    | "rules"
    | "trend"
    | "alert"
    | "alert-outline"
    | "clock"
    | "currency"
    | "check"
    | "refresh"
    | "upload"
    | "download"
    | "filter"
    | "sparkle"
    | "sparkle-mini"
    | "mail"
    | "phone"
    | "settings"
    | "search"
    | "tag"
    | "external-link"
    | "trash"
    | "copy"
    | "eye"
    | "edit"
    | "paperclip"
    | "close"
    | "plus"
    | "folder-plus"
    | "chevron-left"
    | "chevron-right";
}) => {
  const paths: Record<string, React.ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    invoice: (
      <>
        <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5" />
        <path d="M14 3.5V8h4" />
        <path d="M9 12h6M9 16h6" />
      </>
    ),
    customers: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19c1.1-3 3.3-4.5 5.5-4.5S13.4 16 14.5 19" />
        <path d="M16.5 8.5h4" />
        <path d="M18.5 6.5v4" />
      </>
    ),
    collections: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19c1.1-3 3.3-4.5 5.5-4.5S13.4 16 14.5 19" />
        <circle cx="17.5" cy="9.5" r="2.5" />
        <path d="M15 19c.7-1.9 2.1-2.9 3.8-2.9 1 0 1.9.3 2.7.9" />
      </>
    ),
    cash: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="2.5" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M6.5 12h.01M17.5 12h.01" />
      </>
    ),
    exceptions: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6" />
        <path d="M12 17h.01" />
      </>
    ),
    approvals: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2.5" />
        <path d="M8 11l2.5 2.5L16 8" />
      </>
    ),
    activity: <path d="M3 13h4l2-7 4 14 2-7h6" />,
    integrations: (
      <>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
      </>
    ),
    "data-sources": (
      <>
        <ellipse cx="12" cy="5.75" rx="6.5" ry="2.75" />
        <path d="M5.5 5.75v5.5c0 1.52 2.91 2.75 6.5 2.75s6.5-1.23 6.5-2.75v-5.5" />
        <path d="M5.5 11.25v5.5c0 1.52 2.91 2.75 6.5 2.75s6.5-1.23 6.5-2.75v-5.5" />
      </>
    ),
    rules: (
      <>
        <path d="M6 3v18M18 3v18" />
        <path d="M3 7h6M15 9h6M3 15h6M15 17h6" />
      </>
    ),
    trend: <path d="M4 16l5-5 3 3 6-7" />,
    alert: (
      <>
        <path d="M12 4l8 14H4L12 4z" />
        <path d="M12 9v4" />
        <path d="M12 16h.01" />
      </>
    ),
    "alert-outline": (
      <>
        <path d="M12 4l8 14H4L12 4z" />
        <path d="M12 9v4" />
        <path d="M12 16h.01" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v5l3 2" />
      </>
    ),
    currency: <path d="M13.5 3.5c-3.5 0-5.5 1.9-5.5 4.3 0 2.4 1.9 3.5 4.4 4 2.4.5 4.1 1.1 4.1 3 0 1.7-1.5 3.2-4.5 3.2-2 0-3.8-.6-5.2-1.8M12 2v20" />,
    check: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M8.2 12.3l2.4 2.4 5.2-5.2" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 11a8 8 0 0 0-14-4" />
        <path d="M4 4v5h5" />
        <path d="M4 13a8 8 0 0 0 14 4" />
        <path d="M20 20v-5h-5" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V5" />
        <path d="M8 9l4-4 4 4" />
        <path d="M5 19.5h14" />
      </>
    ),
    download: (
      <>
        <path d="M12 4.5v11" />
        <path d="M8 12l4 4 4-4" />
        <path d="M4.5 19.5h15" />
      </>
    ),
    filter: (
      <>
        <path d="M4.5 6.5h15l-6 7v4l-3-1.5v-2.5l-6-7z" />
      </>
    ),
    sparkle: (
      <>
        <path d="M12 3.5l1.7 4.3 4.3 1.7-4.3 1.7-1.7 4.3-1.7-4.3-4.3-1.7 4.3-1.7L12 3.5z" />
        <path d="M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" />
      </>
    ),
    "sparkle-mini": (
      <>
        <path d="M12 4.5l1.4 3.6 3.6 1.4-3.6 1.4-1.4 3.6-1.4-3.6-3.6-1.4 3.6-1.4L12 4.5z" />
      </>
    ),
    mail: (
      <>
        <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
        <path d="M4.5 7l7.5 5.5L19.5 7" />
      </>
    ),
    phone: (
      <>
        <path d="M8 4.5c0 7 4.5 11.5 11.5 11.5" />
        <path d="M9.2 7.2l-2.2 2.2a1.3 1.3 0 0 0-.2 1.6 18.3 18.3 0 0 0 6.2 6.2 1.3 1.3 0 0 0 1.6-.2l2.2-2.2" />
        <path d="M14 5.5l4.5 4.5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M5.9 5.9l1.6 1.6M16.5 16.5l1.6 1.6M18.1 5.9l-1.6 1.6M7.5 16.5l-1.6 1.6" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="6" />
        <path d="M20 20l-4.2-4.2" />
      </>
    ),
    tag: (
      <>
        <path d="M11 4.5H5.5v5.5l7.3 7.3a2 2 0 0 0 2.8 0l3.7-3.7a2 2 0 0 0 0-2.8L11 4.5z" />
        <circle cx="8.5" cy="8.5" r="1" />
      </>
    ),
    "external-link": (
      <>
        <path d="M14 5.5h5v5" />
        <path d="M10 14.5l9-9" />
        <path d="M18.5 13v4a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5.5 17V7A1.5 1.5 0 0 1 7 5.5h4" />
      </>
    ),
    trash: (
      <>
        <path d="M5.5 7h13" />
        <path d="M9 7V5.5h6V7" />
        <path d="M8 7v11a1.5 1.5 0 0 0 1.5 1.5h5A1.5 1.5 0 0 0 16 18V7" />
        <path d="M10.5 10.5v5" />
        <path d="M13.5 10.5v5" />
      </>
    ),
    copy: (
      <>
        <rect x="9" y="9" width="10" height="10" rx="2" />
        <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    eye: (
      <>
        <path d="M2.5 12s3.5-5.5 9.5-5.5S21.5 12 21.5 12s-3.5 5.5-9.5 5.5S2.5 12 2.5 12z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    edit: (
      <>
        <path d="M4.5 19.5l3.7-.7 9.1-9.1-3-3-9.1 9.1-.7 3.7z" />
        <path d="M12.8 7.1l3 3" />
      </>
    ),
    paperclip: (
      <>
        <path d="M9 12.5l5.8-5.8a3 3 0 1 1 4.2 4.2l-7.3 7.3a4.5 4.5 0 1 1-6.4-6.4l7-7" />
      </>
    ),
    close: (
      <>
        <path d="M7 7l10 10" />
        <path d="M17 7L7 17" />
      </>
    ),
    plus: (
      <>
        <path d="M12 6v12" />
        <path d="M6 12h12" />
      </>
    ),
    "folder-plus": (
      <>
        <path d="M4.5 7.5A2 2 0 0 1 6.5 5.5h3l1.5 2h6.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-9z" />
        <path d="M15.5 11v4" />
        <path d="M13.5 13h4" />
      </>
    ),
    "chevron-left": <path d="M14.5 6.5L9 12l5.5 5.5" />,
    "chevron-right": <path d="M9.5 6.5L15 12l-5.5 5.5" />,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {paths[name]}
      </g>
    </svg>
  );
};

function formatTopbarDate() {
  return formatOperatorToday();
}

function normalizeCashAppTab(value?: string): CashAppTab {
  switch (value) {
    case "payments":
      return "payments";
    case "bank-transactions":
      return "bank-transactions";
    case "remittances":
      return "remittances";
    default:
      return "overview";
  }
}

function cashAppHref(tab: CashAppTab) {
  return tab === "overview" ? "/cash-app" : `/cash-app?tab=${tab}`;
}

function cashRangeLabel(visibleCount: number, totalCount: number) {
  if (totalCount === 0) {
    return "0 - 0 of 0";
  }

  return `1 - ${visibleCount} of ${totalCount}`;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function formatCashTableAmount(valueCents: number) {
  const amount = valueCents / 100;
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cashReviewStatusClassName(state: string) {
  switch (state) {
    case "needs review":
      return "needs-review";
    case "partial applied":
      return "neutral";
    default:
      return "approved";
  }
}

function cashBankStatusLabel(state: CashAppBankTransaction["matchStatus"]) {
  switch (state) {
    case "review_required":
      return "Potential Payment";
    case "linked_payment":
      return "Pending";
    default:
      return "Unmatched";
  }
}

function cashBankStatusClassName(state: CashAppBankTransaction["matchStatus"]) {
  switch (state) {
    case "review_required":
      return "needs-review";
    case "linked_payment":
      return "neutral";
    default:
      return "approved";
  }
}

function cashRemittanceStatusClassName(state: string) {
  return state === "review_required" ? "needs-review" : "approved";
}

function buildAnalyticsViewModel(data: OperatorConsoleData, trend: "weekly" | "monthly" = "monthly") {
  const todayDateKey = formatOperatorDateKey();
  const totalOutstandingCents = data.invoiceIndex.summary.openAmountCents;
  const overdueBalanceCents = data.overdueExposure.overdueOpenAmountCents;
  const paymentEvents = collectAnalyticsPaymentEvents(data, todayDateKey);
  const outreachEvents = collectAnalyticsOutreachEvents(data, todayDateKey);
  const periods = buildAnalyticsPeriods(trend, todayDateKey);
  const overdueAggregation = buildAnalyticsOverdueBalanceTrend(data.invoiceIndex.invoices, periods, todayDateKey);
  const cashAggregation = buildAnalyticsCashCollectedTrend(paymentEvents, periods);
  const dsoAggregation = buildAnalyticsDsoTrend(data.invoiceIndex.invoices, periods, todayDateKey);
  const currentMonthKey = operatorMonthKey(todayDateKey);
  const currentMonthPaymentEvents = paymentEvents.filter((event) => operatorMonthKey(event.dateKey) === currentMonthKey);
  const currentMonthOutreachEvents = outreachEvents.filter((event) => operatorMonthKey(event.dateKey) === currentMonthKey);
  const cashCollectedThisMonthCents = currentMonthPaymentEvents.reduce((sum, event) => sum + event.amountCents, 0);
  const yieldCollectedCents = currentMonthPaymentEvents
    .filter((event) => event.yieldAssisted)
    .reduce((sum, event) => sum + event.amountCents, 0);
  const invoicesCollectedThisMonth = uniqueStrings(currentMonthPaymentEvents.flatMap((event) => event.invoiceNumbers)).length;
  const invoicesFollowedUpThisMonth = uniqueStrings(currentMonthOutreachEvents.flatMap((event) => event.invoiceNumbers)).length;
  const automatedCommunicationsCount =
    data.emailInbox.messages.filter((message) => message.direction === "outbound").length +
    data.callInbox.calls.length +
    data.aiFeed.length;
  const estimatedDsoDays = calculateWeightedDaysOpen(data.invoiceIndex.invoices, todayDateKey);
  const weightedAverageAgreedTermsDays = estimateWeightedAverageAgreedTermsDays(data.invoiceIndex.invoices);
  const collectionsRate =
    cashCollectedThisMonthCents + overdueBalanceCents > 0
      ? Math.min(100, (cashCollectedThisMonthCents / (cashCollectedThisMonthCents + overdueBalanceCents)) * 100)
      : 0;
  const topCustomers = buildAnalyticsTopCustomers(data.invoiceIndex.invoices);

  return {
    periodLabels: periods.map((period) => period.label),
    totalOutstandingCents,
    overdueBalanceCents,
    cashCollectedThisMonthCents,
    invoicesFollowedUpThisMonth,
    invoicesCollectedThisMonth,
    yieldCollectedCents,
    estimatedDsoDays,
    weightedAverageAgreedTermsDays,
    collectionsRate,
    automatedCommunicationsCount,
    overdueBalanceTrend: overdueAggregation.values,
    overdueBalanceTrendHasData: overdueAggregation.hasData,
    cashCollectedTrend: cashAggregation.totalValues,
    yieldCollectedTrend: cashAggregation.yieldValues,
    cashCollectedTrendHasData: cashAggregation.hasData,
    dsoTrend: dsoAggregation.dsoValues,
    agreedTermsTrend: dsoAggregation.termsValues,
    dsoTrendHasData: dsoAggregation.hasData,
    topCustomers,
  };
}

interface AnalyticsPeriod {
  key: string;
  label: string;
  startDateKey: string;
  endDateKey: string;
}

interface AnalyticsPaymentEvent {
  id: string;
  dateKey: string;
  amountCents: number;
  invoiceNumbers: string[];
  yieldAssisted: boolean;
}

interface AnalyticsOutreachEvent {
  id: string;
  dateKey: string;
  invoiceNumbers: string[];
}

function collectAnalyticsPaymentEvents(data: OperatorConsoleData, todayDateKey: string): AnalyticsPaymentEvent[] {
  const events: AnalyticsPaymentEvent[] = [];
  const seenPaymentIds = new Set<string>();

  for (const row of data.cashApplicationQueue.reviewRows) {
    const dateKey = readOperationalDateKey(row.receivedOn);
    if (!dateKey || row.amountCents <= 0) {
      continue;
    }

    seenPaymentIds.add(row.paymentId);
    events.push({
      id: `review:${row.paymentId}`,
      dateKey,
      amountCents: row.amountCents,
      invoiceNumbers: uniqueStrings(row.matches.map((match) => match.invoiceNumber)),
      yieldAssisted: row.matches.length > 0,
    });
  }

  for (const transaction of data.cashApplicationQueue.bankTransactions) {
    const dateKey = readOperationalDateKey(transaction.postedAt);
    if (
      !dateKey ||
      transaction.direction !== "credit" ||
      transaction.amountCents <= 0 ||
      (transaction.paymentId && seenPaymentIds.has(transaction.paymentId))
    ) {
      continue;
    }

    if (transaction.paymentId) {
      seenPaymentIds.add(transaction.paymentId);
    }
    events.push({
      id: `bank:${transaction.id}`,
      dateKey,
      amountCents: transaction.amountCents,
      invoiceNumbers: [],
      yieldAssisted: transaction.matchStatus === "linked_payment",
    });
  }

  for (const remittance of data.cashApplicationQueue.remittances) {
    const dateKey = readOperationalDateKey(remittance.receivedAt);
    if (!dateKey || !remittance.amountCents || (remittance.paymentId && seenPaymentIds.has(remittance.paymentId))) {
      continue;
    }

    events.push({
      id: `remittance:${remittance.id}`,
      dateKey,
      amountCents: remittance.amountCents,
      invoiceNumbers: uniqueStrings(remittance.invoiceReferences),
      yieldAssisted: remittance.invoiceReferences.length > 0,
    });
  }

  if (events.length === 0 && data.cashApplicationQueue.overviewSummary.totalAppliedTodayCents > 0) {
    events.push({
      id: "cash-app-summary:applied-today",
      dateKey: todayDateKey,
      amountCents: data.cashApplicationQueue.overviewSummary.totalAppliedTodayCents,
      invoiceNumbers: [],
      yieldAssisted: true,
    });
  }

  return events;
}

function collectAnalyticsOutreachEvents(data: OperatorConsoleData, todayDateKey: string): AnalyticsOutreachEvent[] {
  const events: AnalyticsOutreachEvent[] = [];

  for (const task of data.taskQueue) {
    const dateKey = readTaskDateKey(task, todayDateKey);
    if (!dateKey) {
      continue;
    }

    events.push({
      id: `task:${task.id}`,
      dateKey,
      invoiceNumbers: readTaskInvoiceNumbers(task, data.invoiceIndex.invoices),
    });
  }

  for (const call of data.callInbox.calls) {
    const dateKey = readOperationalDateKey(call.endedAt ?? call.startedAt);
    if (!dateKey) {
      continue;
    }

    events.push({
      id: `call:${call.id}`,
      dateKey,
      invoiceNumbers: uniqueStrings(call.invoiceRefs.map((invoice) => invoice.invoiceNumber)),
    });
  }

  for (const message of data.emailInbox.messages) {
    const dateKey = readOperationalDateKey(message.receivedAt);
    if (!dateKey) {
      continue;
    }

    events.push({
      id: `email:${message.providerMessageId}`,
      dateKey,
      invoiceNumbers: readInvoiceNumbersFromText(
        `${message.subjectLine ?? ""} ${message.snippet ?? ""}`,
        data.invoiceIndex.invoices,
      ),
    });
  }

  for (const item of data.aiFeed) {
    const dateKey = readOperationalDateKey(item.at);
    if (!dateKey) {
      continue;
    }

    events.push({
      id: `feed:${item.id}`,
      dateKey,
      invoiceNumbers: readInvoiceNumbersFromText(item.summary, data.invoiceIndex.invoices),
    });
  }

  return events;
}

function buildAnalyticsTopCustomers(invoices: InvoiceIndexEntry[]) {
  const grouped = new Map<string, { key: string; accountName: string; openAmountCents: number; overdueAmountCents: number }>();

  for (const invoice of invoices) {
    if (invoice.openAmountCents <= 0) {
      continue;
    }

    const key = invoice.billingAccountId ?? invoice.customerReference ?? invoice.customerName;
    const current = grouped.get(key) ?? {
      key,
      accountName: invoice.billingAccountName ?? invoice.customerName,
      openAmountCents: 0,
      overdueAmountCents: 0,
    };

    current.openAmountCents += invoice.openAmountCents;
    if ((invoice.daysPastDue ?? 0) > 0) {
      current.overdueAmountCents += invoice.openAmountCents;
    }

    grouped.set(key, current);
  }

  const rows = [...grouped.values()]
    .sort((left, right) => right.openAmountCents - left.openAmountCents)
    .slice(0, 5);
  const maxAmount = Math.max(...rows.map((row) => row.openAmountCents), 1);

  return rows.map((row) => ({
    ...row,
    ratio: row.openAmountCents / maxAmount,
  }));
}

function estimateWeightedAverageAgreedTermsDays(invoices: InvoiceIndexEntry[]) {
  const rows = invoices
    .map((invoice) => ({
      days: diffCalendarDays(invoice.issuedAt, invoice.dueDate),
      weight: Math.max(invoice.totalAmountCents, invoice.openAmountCents, 0),
    }))
    .filter((row): row is { days: number; weight: number } => typeof row.days === "number" && row.weight > 0);

  if (rows.length === 0) {
    return 0;
  }

  const weightedDays = rows.reduce((sum, row) => sum + row.days * row.weight, 0);
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);

  return Math.max(7, Math.round(weightedDays / Math.max(totalWeight, 1)));
}

function buildAnalyticsPeriods(trend: "weekly" | "monthly", todayDateKey: string): AnalyticsPeriod[] {
  const count = trend === "monthly" ? 7 : 8;

  if (trend === "monthly") {
    return Array.from({ length: count }, (_, index) => {
      const startDateKey = addOperatorCalendarMonths(`${todayDateKey.slice(0, 7)}-01`, -(count - index - 1));
      const nextMonthStart = addOperatorCalendarMonths(startDateKey, 1);
      const endDateKey = addOperatorCalendarDays(nextMonthStart, -1);

      return {
        key: operatorMonthKey(startDateKey),
        label: formatOperatorDate(operatorDateKeyToDate(startDateKey), { month: "short" }),
        startDateKey,
        endDateKey,
      };
    });
  }

  const currentWeekStart = startOfOperatorWeek(todayDateKey);

  return Array.from({ length: count }, (_, index) => {
    const startDateKey = addOperatorCalendarDays(currentWeekStart, -(count - index - 1) * 7);
    const endDateKey = addOperatorCalendarDays(startDateKey, 6);

    return {
      key: startDateKey,
      label: formatOperatorDate(operatorDateKeyToDate(startDateKey), { month: "short", day: "numeric" }),
      startDateKey,
      endDateKey,
    };
  });
}

function buildAnalyticsOverdueBalanceTrend(
  invoices: InvoiceIndexEntry[],
  periods: AnalyticsPeriod[],
  todayDateKey: string,
) {
  let hasData = false;
  const values = periods.map((period) => {
    const periodInvoices = invoices.filter((invoice) => {
      const dateKey = invoice.dueDate ?? invoice.issuedAt;
      return invoice.openAmountCents > 0 && isDateKeyInPeriod(dateKey, period);
    });
    const openAmountCents = periodInvoices.reduce((sum, invoice) => sum + invoice.openAmountCents, 0);
    const overdueAmountCents = periodInvoices.reduce(
      (sum, invoice) => sum + (readInvoiceDaysPastDue(invoice, todayDateKey) > 0 ? invoice.openAmountCents : 0),
      0,
    );

    if (openAmountCents > 0) {
      hasData = true;
    }

    return openAmountCents > 0 ? Number(((overdueAmountCents / openAmountCents) * 100).toFixed(1)) : 0;
  });

  return { values, hasData };
}

function buildAnalyticsCashCollectedTrend(events: AnalyticsPaymentEvent[], periods: AnalyticsPeriod[]) {
  const totalValues = periods.map((period) =>
    events
      .filter((event) => isDateKeyInPeriod(event.dateKey, period))
      .reduce((sum, event) => sum + event.amountCents, 0),
  );
  const yieldValues = periods.map((period) =>
    events
      .filter((event) => event.yieldAssisted && isDateKeyInPeriod(event.dateKey, period))
      .reduce((sum, event) => sum + event.amountCents, 0),
  );

  return {
    totalValues,
    yieldValues,
    hasData: totalValues.some((value) => value > 0) || yieldValues.some((value) => value > 0),
  };
}

function buildAnalyticsDsoTrend(
  invoices: InvoiceIndexEntry[],
  periods: AnalyticsPeriod[],
  todayDateKey: string,
) {
  let hasData = false;
  const dsoValues: number[] = [];
  const termsValues: number[] = [];

  for (const period of periods) {
    const periodInvoices = invoices.filter((invoice) => isDateKeyInPeriod(invoice.issuedAt ?? invoice.dueDate, period));
    if (periodInvoices.length > 0) {
      hasData = true;
    }
    dsoValues.push(calculateWeightedDaysOpen(periodInvoices, todayDateKey));
    termsValues.push(estimateWeightedAverageAgreedTermsDays(periodInvoices));
  }

  return { dsoValues, termsValues, hasData };
}

function calculateWeightedDaysOpen(invoices: InvoiceIndexEntry[], todayDateKey: string) {
  const rows = invoices
    .map((invoice) => {
      const startDateKey = invoice.issuedAt ?? invoice.dueDate;
      const weight = Math.max(invoice.openAmountCents, invoice.totalAmountCents, 0);
      return startDateKey && weight > 0
        ? { days: Math.max(0, diffOperatorCalendarDays(startDateKey, todayDateKey)), weight }
        : undefined;
    })
    .filter((row): row is { days: number; weight: number } => Boolean(row));
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);

  return totalWeight > 0
    ? Math.round(rows.reduce((sum, row) => sum + row.days * row.weight, 0) / totalWeight)
    : 0;
}

function addOperatorCalendarMonths(dateKey: string, months: number) {
  const { year, month, day } = parseDateKeyParts(dateKey);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  const nextYear = String(date.getUTCFullYear()).padStart(4, "0");
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");

  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function startOfOperatorWeek(dateKey: string) {
  const { year, month, day } = parseDateKeyParts(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  return addOperatorCalendarDays(dateKey, mondayOffset);
}

function isDateKeyInPeriod(dateKey: string | undefined, period: AnalyticsPeriod) {
  return Boolean(dateKey && dateKey >= period.startDateKey && dateKey <= period.endDateKey);
}

function parseDateKeyParts(dateKey: string) {
  const [year = 1970, month = 1, day = 1] = dateKey.split("-").map((part) => Number(part));

  return { year, month, day };
}

function readInvoiceNumbersFromText(text: string, invoices: InvoiceIndexEntry[]) {
  return uniqueStrings(
    invoices
      .filter((invoice) => text.includes(invoice.invoiceNumber))
      .map((invoice) => invoice.invoiceNumber),
  );
}

function buildHomeCalendar(input: {
  data: OperatorConsoleData;
  selectedDateKey: string;
  todayDateKey: string;
}) {
  const activityByDate = buildHomeCalendarActivityByDate(input.data, input.todayDateKey);
  const days = Array.from({ length: 7 }, (_, index) => {
    const dateKey = addOperatorCalendarDays(input.selectedDateKey, index - 3);
    const date = operatorDateKeyToDate(dateKey);
    const activity = activityByDate.get(dateKey) ?? emptyHomeCalendarActivity();

    return {
      dateKey,
      weekday: formatOperatorDate(date, { weekday: "short" }),
      label: formatOperatorDate(date, { day: "numeric" }),
      isActive: dateKey === input.selectedDateKey,
      isToday: dateKey === input.todayDateKey,
      activity,
    };
  });
  const activityCount = days.reduce((sum, day) => sum + day.activity.totalCount, 0);

  return {
    days,
    activityCount,
    monthLabel: formatOperatorDate(operatorDateKeyToDate(input.selectedDateKey), {
      month: "short",
      year: "numeric",
    }),
    previousHref: homeCalendarHref(addOperatorCalendarDays(input.selectedDateKey, -7)),
    nextHref: homeCalendarHref(addOperatorCalendarDays(input.selectedDateKey, 7)),
  };
}

function buildHomeCalendarActivityByDate(data: OperatorConsoleData, todayDateKey: string) {
  const byDate = new Map<string, HomeCalendarActivity>();

  for (const task of data.taskQueue) {
    if (!isOpenTaskStatus(task.status)) {
      continue;
    }

    const dateKey = readTaskDateKey(task, todayDateKey);
    if (!dateKey) {
      continue;
    }

    incrementHomeCalendarActivity(byDate, dateKey, "tasks");
  }

  for (const row of data.cashApplicationQueue.reviewRows) {
    const dateKey = readOperationalDateKey(row.receivedOn);
    if (dateKey) {
      incrementHomeCalendarActivity(byDate, dateKey, "payments");
    }
  }

  for (const transaction of data.cashApplicationQueue.bankTransactions) {
    if (transaction.direction !== "credit") {
      continue;
    }

    const dateKey = readOperationalDateKey(transaction.postedAt);
    if (dateKey) {
      incrementHomeCalendarActivity(byDate, dateKey, "payments");
    }
  }

  for (const remittance of data.cashApplicationQueue.remittances) {
    const dateKey = readOperationalDateKey(remittance.receivedAt);
    if (dateKey) {
      incrementHomeCalendarActivity(byDate, dateKey, "payments");
    }
  }

  for (const message of data.emailInbox.messages) {
    const dateKey = readOperationalDateKey(message.receivedAt);
    if (dateKey) {
      incrementHomeCalendarActivity(byDate, dateKey, "outreach");
    }
  }

  for (const call of data.callInbox.calls) {
    const dateKey = readOperationalDateKey(call.endedAt ?? call.startedAt);
    if (dateKey) {
      incrementHomeCalendarActivity(byDate, dateKey, "outreach");
    }
  }

  for (const item of data.aiFeed) {
    const dateKey = readOperationalDateKey(item.at);
    if (dateKey) {
      incrementHomeCalendarActivity(byDate, dateKey, "customerActivity");
    }
  }

  return byDate;
}

interface HomeCalendarActivity {
  tasks: number;
  payments: number;
  outreach: number;
  customerActivity: number;
  totalCount: number;
  label: string;
  tooltip: string;
}

function emptyHomeCalendarActivity(): HomeCalendarActivity {
  return {
    tasks: 0,
    payments: 0,
    outreach: 0,
    customerActivity: 0,
    totalCount: 0,
    label: "",
    tooltip: "No activity",
  };
}

function incrementHomeCalendarActivity(
  byDate: Map<string, HomeCalendarActivity>,
  dateKey: string,
  type: "tasks" | "payments" | "outreach" | "customerActivity",
) {
  const current = byDate.get(dateKey) ?? emptyHomeCalendarActivity();
  current[type] += 1;
  current.totalCount += 1;
  current.label = formatCalendarActivityLabel(current);
  current.tooltip = formatCalendarActivityTooltip(current);
  byDate.set(dateKey, current);
}

function formatCalendarActivityLabel(activity: HomeCalendarActivity) {
  const parts = [
    activity.tasks > 0 ? `${activity.tasks} task${pluralizeCount(activity.tasks)}` : undefined,
    activity.payments > 0 ? `${activity.payments} payment${pluralizeCount(activity.payments)}` : undefined,
    activity.outreach > 0 ? `${activity.outreach} outreach` : undefined,
    activity.customerActivity > 0 ? `${activity.customerActivity} update${pluralizeCount(activity.customerActivity)}` : undefined,
  ].filter((part): part is string => Boolean(part));

  return parts.slice(0, 2).join(", ");
}

function formatCalendarActivityTooltip(activity: HomeCalendarActivity) {
  return [
    `${activity.tasks} task${pluralizeCount(activity.tasks)}`,
    `${activity.payments} payment${pluralizeCount(activity.payments)}`,
    `${activity.outreach} outreach item${pluralizeCount(activity.outreach)}`,
    `${activity.customerActivity} customer update${pluralizeCount(activity.customerActivity)}`,
  ].join(" · ");
}

function homeCalendarHref(dateKey: string) {
  const todayDateKey = formatOperatorDateKey();

  return dateKey === todayDateKey ? "/" : `/?calendarDate=${encodeURIComponent(dateKey)}`;
}

function buildHomeTaskAgeBuckets(input: {
  tasks: TaskQueueItem[];
  invoices: InvoiceIndexEntry[];
  calls: OperatorConsoleData["callInbox"]["calls"];
  todayDateKey: string;
}) {
  const buckets = [
    { id: "current", label: "Current", count: 0 },
    { id: "days_1_30", label: "1-30", count: 0 },
    { id: "days_31_60", label: "31-60", count: 0 },
    { id: "days_61_90", label: "61-90", count: 0 },
    { id: "days_90_plus", label: "90+", count: 0 },
  ];
  const invoicesByNumber = new Map(input.invoices.map((invoice) => [invoice.invoiceNumber, invoice]));
  const invoiceNumbersByTaskId = buildCallInvoiceNumbersByTaskId(input.calls);

  for (const task of input.tasks) {
    if (!isOpenTaskStatus(task.status)) {
      continue;
    }

    const invoiceNumbers = readTaskInvoiceNumbers(task, input.invoices, invoiceNumbersByTaskId.get(task.id));
    const linkedInvoices = invoiceNumbers
      .map((invoiceNumber) => invoicesByNumber.get(invoiceNumber))
      .filter((invoice): invoice is InvoiceIndexEntry => Boolean(invoice));
    const bucketId = readOldestInvoiceAgingBucket(linkedInvoices, input.todayDateKey);
    const bucket = buckets.find((item) => item.id === bucketId);
    if (bucket) {
      bucket.count += 1;
    }
  }

  const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1);
  const totalCount = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  return {
    totalCount,
    axis: buildHomeTaskAgeAxis(maxCount),
    buckets: buckets.map((bucket) => ({
      ...bucket,
      height: bucket.count > 0 ? Math.max(12, Math.round((bucket.count / maxCount) * 100)) : 0,
    })),
  };
}

function getCanonicalOpenTasks(tasks: TaskQueueItem[]) {
  return tasks.filter((task) => isOpenTaskStatus(task.status));
}

function buildHomeTaskTypeBuckets(
  tasks: TaskQueueItem[],
) {
  const palette = ["#5b8def", "#6d61f2", "#8b5cf6", "#a78bfa"];
  const countsByType = new Map<string, number>();

  for (const task of tasks) {
    const label = taskTypeLabel(task.type);
    countsByType.set(label, (countsByType.get(label) ?? 0) + 1);
  }

  const segments = [...countsByType.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 4)
    .map((item, index) => ({
      label: item.label,
      value: item.value,
      color: palette[index] ?? "#c4b5fd",
    }));

  return { segments };
}

function buildHomeCustomerBuckets(
  tasks: TaskQueueItem[],
  fallbackItems: Array<{ label: string; count: number }>,
) {
  const palette = ["#7c6cf2", "#6d61f2", "#8b5cf6", "#c4b5fd"];
  const countsByCustomer = new Map<string, number>();

  for (const task of tasks) {
    if (task.customerName && task.customerName !== "—") {
      countsByCustomer.set(task.customerName, (countsByCustomer.get(task.customerName) ?? 0) + 1);
    }
  }

  const items = countsByCustomer.size > 0
    ? [...countsByCustomer.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((left, right) => right.count - left.count)
    : fallbackItems;
  const topItems = items.slice(0, 3);
  const othersCount = items.slice(3).reduce((sum, item) => sum + item.count, 0);
  const totalCustomers = items.length;
  const segments = topItems.map((item, index) => ({
    label: item.label,
    value: item.count,
    color: palette[index] ?? "#c4b5fd",
  }));

  if (othersCount > 0) {
    segments.push({
      label: "Others",
      value: othersCount,
      color: palette[3]!,
    });
  }

  return {
    totalCustomers,
    segments,
  };
}

function buildHomeTaskAgeAxis(maxCount: number) {
  const top = Math.max(1, maxCount);
  const step = Math.max(1, Math.ceil(top / 4));

  return [step * 4, step * 3, step * 2, step, 0];
}

function buildCallInvoiceNumbersByTaskId(calls: OperatorConsoleData["callInbox"]["calls"]) {
  const byTaskId = new Map<string, string[]>();

  for (const call of calls) {
    const invoiceNumbers = call.invoiceRefs
      .map((invoice) => invoice.invoiceNumber)
      .filter((invoiceNumber) => invoiceNumber.length > 0);
    if (invoiceNumbers.length === 0) {
      continue;
    }

    for (const task of call.taskRefs) {
      byTaskId.set(task.id, uniqueStrings([...(byTaskId.get(task.id) ?? []), ...invoiceNumbers]));
    }
  }

  return byTaskId;
}

function readTaskInvoiceNumbers(
  task: TaskQueueItem,
  invoices: InvoiceIndexEntry[],
  linkedCallInvoiceNumbers: string[] = [],
) {
  const explicitNumbers = task.composeEmail?.invoices.map((invoice) => invoice.invoiceNumber) ?? [];
  const searchableText = [
    task.relatedRecord,
    task.invoiceContextLabel,
    task.invoiceContextDetail,
    task.title,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const matchedNumbers = invoices
    .filter((invoice) => searchableText.includes(invoice.invoiceNumber))
    .map((invoice) => invoice.invoiceNumber);

  return uniqueStrings([...explicitNumbers, ...linkedCallInvoiceNumbers, ...matchedNumbers]);
}

function readOldestInvoiceAgingBucket(invoices: InvoiceIndexEntry[], todayDateKey: string) {
  if (invoices.length === 0) {
    return undefined;
  }

  const oldestDaysPastDue = Math.max(
    ...invoices.map((invoice) => readInvoiceDaysPastDue(invoice, todayDateKey)),
  );

  if (oldestDaysPastDue <= 0) {
    return "current";
  }
  if (oldestDaysPastDue <= 30) {
    return "days_1_30";
  }
  if (oldestDaysPastDue <= 60) {
    return "days_31_60";
  }
  if (oldestDaysPastDue <= 90) {
    return "days_61_90";
  }

  return "days_90_plus";
}

function readInvoiceDaysPastDue(invoice: InvoiceIndexEntry, todayDateKey: string) {
  if (!invoice.dueDate) {
    return typeof invoice.daysPastDue === "number" ? Math.max(0, invoice.daysPastDue) : 0;
  }

  return Math.max(0, diffOperatorCalendarDays(invoice.dueDate, todayDateKey));
}

function buildHomeRespondToItems(input: {
  todayDateKey: string;
  invoices: InvoiceIndexEntry[];
  taskQueue: OperatorConsoleData["taskQueue"];
  collectionsQueue: CollectionsQueueItem[];
  calls: OperatorConsoleData["callInbox"]["calls"];
}) {
  const disputeTasks = findOpenDisputeTasks(input.taskQueue);
  const brokenPromiseTasks = findOpenBrokenPromiseTasks(input);
  const openTasks = getCanonicalOpenTasks(input.taskQueue);
  const openTaskCustomerCount = new Set(
    openTasks
      .map((item) => item.customerName)
      .filter((customerName) => customerName && customerName !== "—"),
  ).size;
  const hasData = disputeTasks.length > 0 || brokenPromiseTasks.length > 0 || openTasks.length > 0;

  return {
    items: hasData
      ? [
          {
            label: `Invoice payment disputes: ${disputeTasks.length} open dispute review task${pluralizeCount(disputeTasks.length)}`,
            detail: "Invoice payment disputes count open dispute-related tasks in the task queue, not raw disputed invoice records.",
            actionPath: "/tasks",
            actionLabel: "View",
          },
          {
            label: `Broken promises to pay: ${brokenPromiseTasks.length} open follow-up task${pluralizeCount(brokenPromiseTasks.length)}`,
            detail: "Broken promises to pay count open task-queue follow-ups for missed or broken payment promises.",
            actionPath: "/tasks",
            actionLabel: "View",
          },
          {
            label: `${openTasks.length} open task${pluralizeCount(openTasks.length)} from ${openTaskCustomerCount} customer${pluralizeCount(openTaskCustomerCount)}`,
            detail: "Open tasks use the canonical task queue definition: open, in progress, or pending approval; completed and closed work is excluded.",
            actionPath: "/tasks",
            actionLabel: "Open tasks",
          },
        ]
      : [],
  };
}

function buildHomeDueTodaySummary(input: {
  todayDateKey: string;
  invoices: InvoiceIndexEntry[];
}) {
  const dueTodayInvoices = input.invoices.filter(
    (invoice) =>
      invoice.openAmountCents > 0 &&
      invoice.dueDate === input.todayDateKey &&
      invoice.status !== "paid" &&
      invoice.status !== "voided",
  );
  const customerCount = new Set(
    dueTodayInvoices.map((invoice) => invoice.billingAccountId ?? invoice.billingAccountName ?? invoice.customerName),
  ).size;
  const amountCents = dueTodayInvoices.reduce(
    (sum, invoice) =>
      sum + Math.max(readInvoiceDueNowAmount(invoice) ?? invoice.openAmountCents, 0),
    0,
  );

  return {
    label: `${formatPhp(amountCents)} currently due today from ${customerCount} customer${pluralizeCount(customerCount)}`,
    actionPath: "/invoices",
  };
}

function readInvoiceDueNowAmount(invoice: InvoiceIndexEntry) {
  const value = (invoice as InvoiceIndexEntry & { dueNowAmountCents?: unknown }).dueNowAmountCents;
  return typeof value === "number" ? value : undefined;
}

function readOperationalDateKey(value?: string) {
  if (!value || value === "—") {
    return undefined;
  }

  const normalizedDateKey = normalizeOperatorDateKey(value.slice(0, 10));
  if (normalizedDateKey) {
    return normalizedDateKey;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return formatOperatorDateKey(parsed);
}

function readTaskDateKey(task: TaskQueueItem, todayDateKey: string) {
  return parseOperatorTaskDateLabel(task.dueDateLabel, todayDateKey) ??
    parseOperatorTaskDateLabel(task.createdLabel, todayDateKey);
}

function parseOperatorTaskDateLabel(label: string, todayDateKey: string) {
  if (!label || label === "—") {
    return undefined;
  }
  if (/\bago$/i.test(label)) {
    return todayDateKey;
  }

  const normalizedDateKey = normalizeOperatorDateKey(label.slice(0, 10));
  if (normalizedDateKey) {
    return normalizedDateKey;
  }

  const referenceYear = Number(todayDateKey.slice(0, 4));
  const parsed = new Date(`${label}, ${referenceYear} GMT+0800`);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return formatOperatorDateKey(parsed);
}

function isOpenTaskStatus(status: TaskQueueItem["status"] | string) {
  return status === "open" || status === "in_progress" || status === "pending_approval";
}

function findOpenDisputeTasks(taskQueue: OperatorConsoleData["taskQueue"]) {
  return taskQueue.filter((task) =>
    isOpenTaskStatus(task.status) &&
    /dispute/i.test([
      task.title,
      task.brief,
      task.recommendedNextAction,
      task.transcriptSnippet,
      task.sourceLabel,
    ].filter((value): value is string => Boolean(value)).join(" ")),
  );
}

function findOpenBrokenPromiseTasks(input: {
  todayDateKey: string;
  taskQueue: OperatorConsoleData["taskQueue"];
}) {
  return input.taskQueue.filter((task) => {
    const text = `${task.title} ${task.brief ?? ""}`.toLowerCase();
    if (!isOpenTaskStatus(task.status) || (!text.includes("promise") && !text.includes("ptp"))) {
      return false;
    }

    const dueDateKey = parseOperatorTaskDateLabel(task.dueDateLabel, input.todayDateKey);
    return text.includes("broken") || text.includes("missed") || Boolean(dueDateKey && dueDateKey < input.todayDateKey);
  });
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function pluralizeCount(count: number) {
  return count === 1 ? "" : "s";
}

function humanize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function taskTypeLabel(value: OperatorConsoleData["taskQueue"][number]["type"]) {
  switch (value) {
    case "cash_app":
      return "Cash App";
    case "credit_line":
      return "Credit Line";
    default:
      return humanize(value);
  }
}

function taskStatusClassName(value: OperatorConsoleData["taskQueue"][number]["status"]) {
  switch (value) {
    case "in_progress":
      return "pill-task-info";
    case "pending_approval":
      return "pill-task-warning";
    default:
      return "pill-task-neutral";
  }
}

function taskPriorityClassName(value: OperatorConsoleData["taskQueue"][number]["priority"]) {
  switch (value) {
    case "high":
      return "pill-task-danger";
    case "medium":
      return "pill-task-warning";
    default:
      return "pill-task-low";
  }
}

function collectionAccountName(index: number, fallback: string) {
  return ["SM Retail Inc.", "Puregold Price Club Inc.", "Robinsons Supermarket Corp."][index] ?? fallback;
}

function collectionContact(index: number) {
  return ["Maria Santos", "Roberto Lim", "Catherine Tan"][index] ?? "Dennis Garcia";
}

function collectionEmail(index: number) {
  return ["maria.santos@sm.com.ph", "roberto.lim@puregold.com.ph", "c.tan@robinsons.com.ph"][index] ?? "dennis.garcia@alfamartphil.com";
}

function collectionOutstanding(index: number) {
  return ["₱3,245,000", "₱2,156,000", "₱1,876,000"][index] ?? "₱1,543,000";
}

function collectionOverdue(index: number) {
  return ["₱1,850,000", "₱980,000", "₱450,000"][index] ?? "₱1,200,000";
}

function collectionAge(index: number) {
  return ["67 days", "52 days", "38 days"][index] ?? "81 days";
}

function collectionAverage(index: number) {
  return ["Avg: 45d", "Avg: 38d", "Avg: 35d"][index] ?? "Avg: 52d";
}

function collectionAssignee(index: number) {
  return ["Juan Cruz", "Ana Reyes", "Juan Cruz"][index] ?? "Ana Reyes";
}

function collectionAction(index: number, fallback: string) {
  return [
    "Send grouped reminder (5 invoices)",
    "Follow up on promise due today",
    "Cannot auto-contact (unverified contact)",
  ][index] ?? fallback;
}

interface CollectionsInboxListItem {
  id: string;
  customerName: string;
  email: string;
  fromEmail?: string;
  toEmail?: string;
  fromName?: string;
  subjectLine?: string;
  preview: string;
  owner: string;
  receivedLabel: string;
  bucket: "unread" | "sent" | "draft" | "read";
  isLinked?: boolean;
  customerFilterValue?: string;
  workflowKey?: string;
  workflowName?: string;
  providerThreadId?: string;
  providerMessageId?: string;
  contactName?: string;
  billingAccountId?: string;
  parentAccountId?: string;
  accountNumber?: string;
  relatedInvoices: Array<{
    invoiceNumber: string;
    openAmountCents: number;
    overdueAmountCents?: number;
    currency: string;
    billingAccountId?: string;
    parentAccountId?: string;
  }>;
}

interface NormalizedCollectionsEmailFilters {
  folder: CollectionsEmailFolderFilter;
  customer: string;
  workflow: string;
  q: string;
}

interface NormalizedCollectionsCallFilters {
  direction: CallInboxDirection | "all";
  status: CallInboxStatus | "all";
  voicemail: CollectionsCallVoicemailFilter;
  customer: string;
  classification: string;
  workflow: string;
  date: string;
  dateFrom: string;
  dateTo: string;
}

interface FilterOption {
  value: string;
  label: string;
}

interface EmailCustomerMatch extends FilterOption {
  billingAccountId?: string;
  parentAccountId?: string;
  accountNumber?: string;
}

function buildCollectionsInboxItems(data: OperatorConsoleData): CollectionsInboxListItem[] {
  if (data.emailInbox.messages.length > 0) {
    return data.emailInbox.messages.slice(0, 25).map((message, index) => {
      const messageAddresses = [message.fromEmail, message.toEmail]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase());
      const queueItem = data.collectionsQueue.find((item) => {
        return item.contactEmail
          ? messageAddresses.includes(item.contactEmail.toLowerCase())
          : false;
      });
      const invoiceMatch = findEmailInvoiceMention(data, message);
      const customerMatch = findEmailCustomerMatch(data, message, queueItem, invoiceMatch);
      const customerName = customerMatch?.label ?? message.fromName ?? message.fromEmail ?? "Unknown sender";
      const directionBucket =
        message.direction === "outbound" ? "sent" : message.unread ? "unread" : "read";
      const relatedInvoices = findEmailRelatedInvoices(data, customerMatch?.label, queueItem, invoiceMatch);
      const contactEmail = queueItem?.contactEmail ?? message.fromEmail ?? message.toEmail;
      const workflowMatch = findEmailWorkflowMatch(data, customerMatch?.label, relatedInvoices);
      const billingAccountId = customerMatch?.billingAccountId ?? relatedInvoices[0]?.billingAccountId;
      const parentAccountId = customerMatch?.parentAccountId ?? relatedInvoices[0]?.parentAccountId;
      const accountNumber = customerMatch?.accountNumber ?? customerMatch?.billingAccountId ?? relatedInvoices[0]?.billingAccountId;

      return {
        id: message.providerMessageId,
        customerName,
        email: contactEmail ?? "No email address",
        ...(message.fromEmail ? { fromEmail: message.fromEmail } : {}),
        ...(message.toEmail ? { toEmail: message.toEmail } : {}),
        ...(message.fromName ? { fromName: message.fromName } : {}),
        ...(message.subjectLine ? { subjectLine: message.subjectLine } : {}),
        preview: message.snippet ?? queueItem?.nextAction ?? "No preview available.",
        owner: queueItem?.assignee ?? "Unassigned",
        receivedLabel: formatCollectionsMessageTime(message.receivedAt),
        bucket: directionBucket,
        isLinked: Boolean(customerMatch),
        ...(customerMatch?.value ? { customerFilterValue: customerMatch.value } : {}),
        ...(workflowMatch?.value ? { workflowKey: workflowMatch.value } : {}),
        ...(workflowMatch?.label ? { workflowName: workflowMatch.label } : {}),
        ...(message.providerThreadId ? { providerThreadId: message.providerThreadId } : {}),
        providerMessageId: message.providerMessageId,
        ...(queueItem?.contactName ?? message.fromName ? { contactName: queueItem?.contactName ?? message.fromName } : {}),
        ...(billingAccountId ? { billingAccountId } : {}),
        ...(parentAccountId ? { parentAccountId } : {}),
        ...(accountNumber ? { accountNumber } : {}),
        relatedInvoices,
      };
    });
  }

  return [];
}

function buildCollectionsInboxCounts(items: CollectionsInboxListItem[]) {
  return {
    all: items.length,
    unread: items.filter((item) => item.bucket === "unread").length,
    sent: items.filter((item) => item.bucket === "sent").length,
    drafts: items.filter((item) => item.bucket === "draft").length,
  };
}

function normalizeCollectionsEmailFilters(filters?: CollectionsEmailFilterInput): NormalizedCollectionsEmailFilters {
  const folder =
    filters?.folder === "unread" || filters?.folder === "sent" || filters?.folder === "drafts"
      ? filters.folder
      : "all";
  return {
    folder,
    customer: normalizeSelectFilterValue(filters?.customer),
    workflow: "all",
    q: filters?.q?.trim() ?? "",
  };
}

function normalizeCollectionsCallFilters(
  filters?:
    | CollectionsCallFilterInput
    | {
        direction?: CallInboxDirection;
        status?: CallInboxStatus;
        voicemail?: boolean;
        customer?: string;
        classification?: string;
        workflow?: string;
        dateFrom?: string;
        dateTo?: string;
      },
): NormalizedCollectionsCallFilters {
  const explicitDate = filters && "date" in filters ? filters.date?.trim() : undefined;
  const date = explicitDate || (filters?.dateFrom && filters.dateFrom === filters.dateTo ? filters.dateFrom : "");
  const voicemail =
    typeof filters?.voicemail === "boolean"
      ? filters.voicemail
        ? "yes"
        : "no"
      : filters?.voicemail === "yes" || filters?.voicemail === "no"
        ? filters.voicemail
        : "all";
  return {
    direction:
      filters?.direction === "inbound" || filters?.direction === "outbound" || filters?.direction === "unknown"
        ? filters.direction
        : "all",
    status:
      filters?.status === "processing" ||
      filters?.status === "completed" ||
      filters?.status === "needs_review" ||
      filters?.status === "failed" ||
      filters?.status === "archived"
        ? filters.status
        : "all",
    voicemail,
    customer: normalizeSelectFilterValue(filters?.customer),
    classification: normalizeSelectFilterValue(filters?.classification),
    workflow: normalizeSelectFilterValue(filters?.workflow),
    date,
    dateFrom: filters?.dateFrom?.trim() ?? date,
    dateTo: filters?.dateTo?.trim() ?? date,
  };
}

function normalizeSelectFilterValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && normalized !== "all" ? normalized : "all";
}

function hasActiveCollectionsEmailFilters(filters: NormalizedCollectionsEmailFilters) {
  return filters.folder !== "all" || filters.customer !== "all" || filters.q.length > 0;
}

function hasActiveCollectionsCallFilters(filters: NormalizedCollectionsCallFilters) {
  return (
    filters.direction !== "all" ||
    filters.status !== "all" ||
    filters.voicemail !== "all" ||
    filters.customer !== "all" ||
    filters.classification !== "all" ||
    filters.workflow !== "all" ||
    filters.date.length > 0 ||
    filters.dateFrom.length > 0 ||
    filters.dateTo.length > 0
  );
}

function buildEmailCustomerFilterOptions(data: OperatorConsoleData): FilterOption[] {
  return buildCallFilterOptions(
    data.customerIndex.map((customer) => ({
      value: customer.profileId ?? customer.billingAccountId ?? customer.canonicalName,
      label: customer.canonicalName ?? customer.billingAccountName ?? customer.billingAccountId ?? customer.profileId,
    })),
  );
}

function buildCallFilterOptions(options: FilterOption[]): FilterOption[] {
  const seen = new Map<string, FilterOption>();
  for (const option of options) {
    const value = option.value.trim();
    const label = option.label.trim();
    if (!value || !label) {
      continue;
    }
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, { value, label });
    }
  }
  return [...seen.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function filterCollectionsEmailItems(
  data: OperatorConsoleData,
  items: CollectionsInboxListItem[],
  filters: NormalizedCollectionsEmailFilters,
): CollectionsInboxListItem[] {
  const query = filters.q.toLowerCase();
  const customerFilter = filters.customer.toLowerCase();
  const workflowFilter = filters.workflow.toLowerCase();
  return items.filter((item) => {
    if (filters.folder === "drafts" && item.bucket !== "draft") {
      return false;
    }
    if (filters.folder !== "all" && filters.folder !== "drafts" && item.bucket !== filters.folder) {
      return false;
    }
    const relatedTasks = findEmailInboxTasks(data, item);
    const haystack = buildEmailItemSearchText(item, relatedTasks);
    if (customerFilter !== "all" && !emailItemMatchesCustomer(item, customerFilter)) {
      return false;
    }
    if (
      workflowFilter !== "all" &&
      item.workflowKey?.toLowerCase() !== workflowFilter &&
      item.workflowName?.toLowerCase() !== workflowFilter &&
      !haystack.includes(workflowFilter)
    ) {
      return false;
    }
    if (query && !haystack.includes(query)) {
      return false;
    }
    return true;
  });
}

function buildEmailItemSearchText(item: CollectionsInboxListItem, tasks: TaskQueueItem[]) {
  return [
    item.customerName,
    item.email,
    item.fromEmail,
    item.toEmail,
    item.fromName,
    item.subjectLine,
    item.preview,
    item.billingAccountId,
    item.parentAccountId,
    item.accountNumber,
    item.workflowName,
    item.workflowKey,
    ...item.relatedInvoices.flatMap((invoice) => [
      invoice.invoiceNumber,
      invoice.billingAccountId,
      invoice.parentAccountId,
    ]),
    ...tasks.flatMap((task) => [
      task.title,
      task.brief,
      task.type,
      task.relatedRecord,
      task.customerName,
      task.ownerTeam,
    ]),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function emailItemMatchesCustomer(item: CollectionsInboxListItem, customerFilter: string) {
  return [
    item.customerFilterValue,
    item.customerName,
    item.billingAccountId,
    item.parentAccountId,
    item.accountNumber,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase() === customerFilter || value.toLowerCase().includes(customerFilter));
}

function filterCallInboxItems(
  items: OperatorConsoleData["callInbox"]["items"],
  filters: NormalizedCollectionsCallFilters,
) {
  const customerFilter = filters.customer.toLowerCase();
  const classificationFilter = filters.classification.toLowerCase();
  const workflowFilter = filters.workflow.toLowerCase();
  const dateFrom = filters.dateFrom ? operatorDateKeyToDate(filters.dateFrom).getTime() : undefined;
  const dateTo = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999+08:00`).getTime() : undefined;
  return items.filter((item) => {
    if (filters.direction !== "all" && item.direction !== filters.direction) {
      return false;
    }
    if (filters.status !== "all" && item.status !== filters.status) {
      return false;
    }
    if (filters.voicemail === "yes" && !item.voicemail) {
      return false;
    }
    if (filters.voicemail === "no" && item.voicemail) {
      return false;
    }
    if (
      customerFilter !== "all" &&
      !item.customerName.toLowerCase().includes(customerFilter) &&
      !item.billingAccountId?.toLowerCase().includes(customerFilter)
    ) {
      return false;
    }
    if (
      classificationFilter !== "all" &&
      !item.classifications.some((classification) =>
        classification.toLowerCase().includes(classificationFilter),
      )
    ) {
      return false;
    }
    if (workflowFilter !== "all" && !item.workflowName?.toLowerCase().includes(workflowFilter)) {
      return false;
    }
    const startedAt = new Date(item.startedAt).getTime();
    if (dateFrom !== undefined && startedAt < dateFrom) {
      return false;
    }
    if (dateTo !== undefined && startedAt > dateTo) {
      return false;
    }
    return true;
  });
}

function buildCollectionsEmailHref(
  filters: NormalizedCollectionsEmailFilters,
  extra?: { threadId?: string },
) {
  const params = new URLSearchParams();
  params.set("tab", "email");
  if (filters.folder !== "all") {
    params.set("folder", filters.folder);
  }
  if (filters.customer !== "all") {
    params.set("customer", filters.customer);
  }
  if (filters.workflow !== "all") {
    params.set("workflow", filters.workflow);
  }
  if (filters.q) {
    params.set("q", filters.q);
  }
  if (extra?.threadId) {
    params.set("threadId", extra.threadId);
  }
  return `/collections?${params.toString()}`;
}

function buildCallInboxExportHref(filters: NormalizedCollectionsCallFilters, fallback: string) {
  const params = new URLSearchParams();
  if (filters.direction !== "all") {
    params.set("direction", filters.direction);
  }
  if (filters.status !== "all") {
    params.set("status", filters.status);
  }
  if (filters.voicemail !== "all") {
    params.set("voicemail", filters.voicemail === "yes" ? "true" : "false");
  }
  if (filters.customer !== "all") {
    params.set("customer", filters.customer);
  }
  if (filters.classification !== "all") {
    params.set("classification", filters.classification);
  }
  if (filters.workflow !== "all") {
    params.set("workflow", filters.workflow);
  }
  if (filters.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }
  if (filters.dateTo) {
    params.set("dateTo", filters.dateTo);
  }
  const query = params.toString();
  return query ? `/collections/call-inbox/export?${query}` : fallback;
}

function buildCallInboxHref(filters: NormalizedCollectionsCallFilters) {
  const params = new URLSearchParams();
  params.set("tab", "call-inbox");
  if (filters.direction !== "all") {
    params.set("direction", filters.direction);
  }
  if (filters.status !== "all") {
    params.set("status", filters.status);
  }
  if (filters.voicemail !== "all") {
    params.set("voicemail", filters.voicemail === "yes" ? "true" : "false");
  }
  if (filters.customer !== "all") {
    params.set("customer", filters.customer);
  }
  if (filters.classification !== "all") {
    params.set("classification", filters.classification);
  }
  if (filters.workflow !== "all") {
    params.set("workflow", filters.workflow);
  }
  if (filters.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }
  if (filters.dateTo) {
    params.set("dateTo", filters.dateTo);
  }
  return `/collections?${params.toString()}`;
}

function formatCallDateRangeLabel(dateFrom: string, dateTo: string) {
  if (!dateFrom && !dateTo) {
    return "";
  }
  const formatDate = (value: string) =>
    formatOperatorDate(operatorDateKeyToDate(value), {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  if (dateFrom && dateTo && dateFrom === dateTo) {
    return formatDate(dateFrom);
  }
  if (dateFrom && dateTo) {
    return `${formatDate(dateFrom)} - ${formatDate(dateTo)}`;
  }
  if (dateFrom) {
    return `From ${formatDate(dateFrom)}`;
  }
  return `Through ${formatDate(dateTo)}`;
}

function collectionsEmailModalId(item: CollectionsInboxListItem) {
  return `collections-email-detail-${sanitizeDomId(item.providerThreadId ?? item.id)}`;
}

function sanitizeDomId(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "-");
}

function findEmailCustomerMatch(
  data: OperatorConsoleData,
  message: OperatorConsoleData["emailInbox"]["messages"][number],
  queueItem?: CollectionsQueueItem,
  invoiceMatch?: InvoiceIndexEntry,
): EmailCustomerMatch | undefined {
  const messageAddresses = [message.fromEmail, message.toEmail]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim().toLowerCase());
  const queueEmail = queueItem?.contactEmail?.trim().toLowerCase();
  const candidates = data.customerIndex;
  const byEmail = candidates.find((customer) =>
    customer.primaryContactEmail
      ? messageAddresses.includes(customer.primaryContactEmail.trim().toLowerCase())
      : false,
  );
  const byInvoice = invoiceMatch
    ? candidates.find(
        (customer) =>
          (invoiceMatch.billingAccountId && customer.billingAccountId === invoiceMatch.billingAccountId) ||
          namesMatch(customer.parentAccountName, invoiceMatch.parentAccountName) ||
          namesMatch(customer.canonicalName, invoiceMatch.customerName) ||
          namesMatch(customer.billingAccountName, invoiceMatch.billingAccountName),
      )
    : undefined;
  const byQueue = queueItem
    ? candidates.find(
        (customer) =>
          (queueEmail && customer.primaryContactEmail?.trim().toLowerCase() === queueEmail) ||
          namesMatch(customer.canonicalName, queueItem.accountName) ||
          namesMatch(customer.billingAccountName, queueItem.accountName),
      )
    : undefined;
  const customer = byEmail ?? byInvoice ?? byQueue;
  if (customer) {
    return {
      label: customer.canonicalName || customer.billingAccountName || queueItem?.accountName || invoiceMatch?.customerName || "Unknown customer",
      value: customer.profileId ?? customer.billingAccountId ?? customer.canonicalName,
      ...(customer.billingAccountId ? { billingAccountId: customer.billingAccountId } : {}),
      ...(customer.billingAccountId ? { accountNumber: customer.billingAccountId } : {}),
    };
  }
  if (queueItem) {
    return {
      label: queueItem.accountName,
      value: queueItem.id,
    };
  }
  if (invoiceMatch) {
    return {
      label: invoiceMatch.customerName,
      value: invoiceMatch.billingAccountId ?? invoiceMatch.parentAccountId ?? invoiceMatch.customerName,
      ...(invoiceMatch.billingAccountId ? { billingAccountId: invoiceMatch.billingAccountId } : {}),
      ...(invoiceMatch.parentAccountId ? { parentAccountId: invoiceMatch.parentAccountId } : {}),
      ...(invoiceMatch.billingAccountId ? { accountNumber: invoiceMatch.billingAccountId } : {}),
    };
  }
  return undefined;
}

function namesMatch(left: string | undefined, right: string | undefined) {
  const normalizedLeft = left?.trim().toLowerCase();
  const normalizedRight = right?.trim().toLowerCase();
  return Boolean(
    normalizedLeft &&
      normalizedRight &&
      (normalizedLeft === normalizedRight ||
        normalizedLeft.includes(normalizedRight) ||
        normalizedRight.includes(normalizedLeft)),
  );
}

function findEmailWorkflowMatch(
  data: OperatorConsoleData,
  customerName: string | undefined,
  relatedInvoices: CollectionsInboxListItem["relatedInvoices"],
): FilterOption | undefined {
  const invoiceRefs = new Set(relatedInvoices.map((invoice) => invoice.invoiceNumber.toLowerCase()));
  const matchingTask = data.taskQueue.find((task) => {
    const relatedRecord = task.relatedRecord?.toLowerCase();
    return (
      Boolean(customerName && namesMatch(task.customerName, customerName)) ||
      Boolean(relatedRecord && invoiceRefs.has(relatedRecord))
    );
  });
  if (matchingTask?.ownerTeam) {
    return { value: matchingTask.ownerTeam, label: titleCase(matchingTask.ownerTeam.replace(/_/g, " ")) };
  }
  const workflow = data.controlCenter.workflows.find((candidate) =>
    customerName ? candidate.name.toLowerCase().includes(customerName.toLowerCase()) : false,
  );
  return workflow ? { value: workflow.id, label: workflow.name } : undefined;
}

function findEmailRelatedInvoices(
  data: OperatorConsoleData,
  customerName: string | undefined,
  queueItem?: CollectionsQueueItem,
  invoiceMatch?: InvoiceIndexEntry,
): CollectionsInboxListItem["relatedInvoices"] {
  const candidates = [
    customerName,
    queueItem?.accountName,
    invoiceMatch?.customerName,
    invoiceMatch?.billingAccountName,
    invoiceMatch?.billingAccountId,
    invoiceMatch?.parentAccountName,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const explicitInvoiceNumber = invoiceMatch?.invoiceNumber.toLowerCase();

  return data.invoiceIndex.invoices
    .filter((invoice) => {
      if (explicitInvoiceNumber && invoice.invoiceNumber.toLowerCase() === explicitInvoiceNumber) {
        return true;
      }
      const invoiceNames = [invoice.customerName, invoice.billingAccountName, invoice.parentAccountName]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim().toLowerCase());
      const invoiceIds = [invoice.billingAccountId, invoice.parentAccountId]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim().toLowerCase());
      return candidates.some((candidate) => {
        const idMatch = invoiceIds.some((id) => id === candidate);
        const nameMatch = invoiceNames.some((name) => name === candidate || name.includes(candidate) || candidate.includes(name));
        return idMatch || nameMatch;
      });
    })
    .filter((invoice) => invoice.openAmountCents > 0)
    .slice(0, 6)
    .map((invoice) => ({
      invoiceNumber: invoice.invoiceNumber,
      openAmountCents: invoice.openAmountCents,
      ...(invoice.overdueAmountCents !== undefined ? { overdueAmountCents: invoice.overdueAmountCents } : {}),
      currency: invoice.currency,
      ...(invoice.billingAccountId ? { billingAccountId: invoice.billingAccountId } : {}),
      ...(invoice.parentAccountId ? { parentAccountId: invoice.parentAccountId } : {}),
    }));
}

function findEmailInvoiceMention(
  data: OperatorConsoleData,
  message: OperatorConsoleData["emailInbox"]["messages"][number],
) {
  const haystack = [message.subjectLine, message.snippet]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
  if (!haystack) {
    return undefined;
  }
  return data.invoiceIndex.invoices.find((invoice) =>
    haystack.includes(invoice.invoiceNumber.toLowerCase()),
  );
}

function buildCollectionsEmailThreadMessages(data: OperatorConsoleData, item: CollectionsInboxListItem) {
  if (
    item.providerThreadId &&
    data.emailInbox.selectedThread?.providerThreadId === item.providerThreadId &&
    data.emailInbox.selectedThread.messages.length > 0
  ) {
    return data.emailInbox.selectedThread.messages;
  }

  const message = data.emailInbox.messages.find((candidate) => candidate.providerMessageId === item.providerMessageId);
  return message ? [message] : [];
}

function findEmailInboxTasks(data: OperatorConsoleData, item: CollectionsInboxListItem) {
  const normalizedCustomer = item.customerName.toLowerCase();
  const invoiceRefs = new Set(item.relatedInvoices.map((invoice) => invoice.invoiceNumber.toLowerCase()));

  return data.taskQueue.filter((task) => {
    const taskCustomer = task.customerName.toLowerCase();
    const relatedRecord = task.relatedRecord?.toLowerCase();
    return (
      taskCustomer === normalizedCustomer ||
      taskCustomer.includes(normalizedCustomer) ||
      normalizedCustomer.includes(taskCustomer) ||
      (relatedRecord ? invoiceRefs.has(relatedRecord) : false)
    );
  });
}

function buildCollectionsEmailDraft(item: CollectionsInboxListItem) {
  const invoiceList = item.relatedInvoices.map((invoice) => invoice.invoiceNumber).join(", ");
  const invoiceSentence = invoiceList
    ? `We are reviewing ${invoiceList} and will keep the billing-account context attached before any next step.`
    : "We are reviewing the account context before any next step.";

  return [
    "Hi,",
    "",
    "Thanks for the update.",
    invoiceSentence,
    "If payment has already been released, please share the remittance details so we can reconcile safely.",
    "",
    "Thank you.",
  ].join("\n");
}

function buildCollectionsEmailComposeContext(data: OperatorConsoleData, item: CollectionsInboxListItem) {
  const now = new Date().toISOString();
  const relatedInvoiceNumbers = new Set(item.relatedInvoices.map((invoice) => invoice.invoiceNumber));
  const matchedInvoices = data.invoiceIndex.invoices.filter((invoice) =>
    relatedInvoiceNumbers.has(invoice.invoiceNumber),
  );
  const invoices: NonNullable<TaskQueueItem["composeEmail"]>["invoices"] =
    matchedInvoices.length > 0
      ? matchedInvoices.map(mapInvoiceIndexEntryToComposeInvoice)
      : item.relatedInvoices.map((invoice) => ({
          id: `collections-invoice-${sanitizeDomId(invoice.invoiceNumber)}`,
          createdAt: now,
          updatedAt: now,
          state: "synced_open" as const,
          parentAccountId:
            invoice.parentAccountId ?? item.parentAccountId ?? item.billingAccountId ?? item.id,
          billingAccountId:
            invoice.billingAccountId ?? item.billingAccountId ?? item.id,
          invoiceNumber: invoice.invoiceNumber,
          currency: invoice.currency,
          amountCents: invoice.openAmountCents,
          metadata: {
            source: "collections_email_context",
            customerName: item.customerName,
          },
        }));
  const firstInvoice = invoices[0];
  const billingAccountId =
    item.billingAccountId ?? firstInvoice?.billingAccountId ?? item.accountNumber ?? item.id;
  const parentAccountId = item.parentAccountId ?? firstInvoice?.parentAccountId ?? billingAccountId;

  return {
    account: {
      id: billingAccountId,
      createdAt: now,
      updatedAt: now,
      parentAccountId,
      ...(firstInvoice?.branchId ? { branchId: firstInvoice.branchId } : {}),
      accountNumber: item.accountNumber ?? billingAccountId,
      displayName: item.customerName,
      currency: firstInvoice?.currency ?? item.relatedInvoices[0]?.currency ?? "PHP",
      accountTier: "standard" as const,
      status: "active" as const,
      centrallyPaid: Boolean(item.parentAccountId),
      metadata: {
        source: "collections_email_context",
        ...(item.workflowName ? { workflowName: item.workflowName } : {}),
      },
    },
    contact: {
      id: `collections-contact-${sanitizeDomId(item.email)}`,
      createdAt: now,
      updatedAt: now,
      parentAccountId,
      billingAccountId,
      ...(firstInvoice?.branchId ? { branchId: firstInvoice.branchId } : {}),
      scope: "billing_account" as const,
      scopeId: billingAccountId,
      fullName: item.contactName ?? item.customerName,
      email: item.email === "No email address" ? undefined : item.email,
      role: "ap" as const,
      isPrimary: true,
      isVerified: true,
      allowAutoSend: true,
      recentSuccessfulResponses: 0,
      metadata: {
        source: "collections_email_context",
        trustedLiveThreadReply: Boolean(item.providerThreadId),
      },
    },
    invoices,
  };
}

function getAvailableCollectionsEmailTemplates(data: OperatorConsoleData) {
  return data.controlCenter.templates.filter(
    (template) => template.channelCompatibility.includes("email") && !template.isArchived,
  );
}

function renderCollectionsTemplateText(templateText: string, item: CollectionsInboxListItem) {
  return applyTemplatePreviewVariables(templateText, buildCollectionsTemplateVariables(item));
}

function renderCustomerTemplateText(
  templateText: string,
  customer: OperatorConsoleData["customerIndex"][number],
  composeEmail: NonNullable<TaskQueueItem["composeEmail"]>,
) {
  const overdueInvoices = composeEmail.invoices.filter((invoice) => invoice.state !== "paid" && (invoice.dueDate ?? "") < formatOperatorDateKey(new Date()));
  const openBalanceCents = composeEmail.invoices.reduce((sum, invoice) => sum + invoice.amountCents, 0);
  const overdueBalanceCents = overdueInvoices.reduce((sum, invoice) => sum + invoice.amountCents, 0);
  const invoiceNumbers = composeEmail.invoices.map((invoice) => invoice.invoiceNumber).join(", ");
  const invoiceSummary = (overdueInvoices.length > 0 ? overdueInvoices : composeEmail.invoices)
    .map((invoice) => `- Invoice ${invoice.invoiceNumber}: ${formatPhp(invoice.amountCents)}${overdueInvoices.includes(invoice) ? " overdue" : " open"}`)
    .join("\n");
  return applyTemplatePreviewVariables(templateText, {
    customer_name: composeEmail.contact.fullName,
    name: composeEmail.contact.fullName,
    customer_company_name: customer.canonicalName,
    billing_account_name: composeEmail.account.displayName,
    customer_external_id: composeEmail.account.accountNumber,
    sender_company_name: "Yield AROS",
    invoice_numbers: invoiceNumbers,
    overdue_invoice_summary: invoiceSummary || "No linked invoices.",
    overdue_balance: formatPhp(overdueBalanceCents),
    upcoming_balance: formatPhp(Math.max(openBalanceCents - overdueBalanceCents, 0)),
    total_account_balance: formatPhp(openBalanceCents),
    payment_url: composeEmail.account.accountNumber ? `https://pay.yieldaros.example/account/${composeEmail.account.accountNumber}` : "",
    num_upcoming_invoices: String(Math.max(composeEmail.invoices.length - overdueInvoices.length, 0)),
  });
}

function buildCollectionsTemplateVariables(item: CollectionsInboxListItem) {
  const overdueInvoices = item.relatedInvoices.filter((invoice) => (invoice.overdueAmountCents ?? 0) > 0);
  const openBalanceCents = item.relatedInvoices.reduce((sum, invoice) => sum + invoice.openAmountCents, 0);
  const overdueBalanceCents = overdueInvoices.reduce((sum, invoice) => sum + (invoice.overdueAmountCents ?? 0), 0);
  const invoiceNumbers = item.relatedInvoices.map((invoice) => invoice.invoiceNumber).join(", ");
  const overdueSummary = overdueInvoices.length > 0
    ? overdueInvoices
        .map((invoice) => `- Invoice ${invoice.invoiceNumber}: ${formatPhp(invoice.overdueAmountCents ?? invoice.openAmountCents)} overdue`)
        .join("\n")
    : item.relatedInvoices
        .map((invoice) => `- Invoice ${invoice.invoiceNumber}: ${formatPhp(invoice.openAmountCents)} open`)
        .join("\n");
  const contactName = item.contactName ?? item.fromName ?? item.customerName;
  return {
    customer_name: contactName,
    name: contactName,
    customer_company_name: item.isLinked ? item.customerName : "",
    billing_account_name: item.isLinked ? item.customerName : "",
    customer_external_id: item.accountNumber ?? item.billingAccountId ?? "",
    sender_company_name: "Yield AROS",
    invoice_numbers: invoiceNumbers,
    overdue_invoice_summary: overdueSummary || "No linked invoices.",
    overdue_balance: formatPhp(overdueBalanceCents),
    upcoming_balance: formatPhp(0),
    total_account_balance: formatPhp(openBalanceCents),
    payment_url: item.accountNumber ? `https://pay.yieldaros.example/account/${item.accountNumber}` : "",
    num_upcoming_invoices: "0",
  };
}

function formatEmailMessageActor(message: OperatorConsoleData["emailInbox"]["messages"][number]) {
  if (message.direction === "outbound") {
    return message.toEmail ? `To ${message.toEmail}` : "Outbound message";
  }
  return message.fromName && message.fromEmail
    ? `${message.fromName} <${message.fromEmail}>`
    : message.fromEmail ?? "Inbound message";
}

function initialsForName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return initials || "AR";
}

function formatCollectionsMessageTime(value?: string) {
  if (!value) {
    return "Just now";
  }

  const now = Date.now();
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return value;
  }

  const diffHours = Math.max(0, Math.round((now - timestamp) / 3_600_000));
  if (diffHours < 24) {
    return diffHours <= 1 ? "1 hour ago" : `${diffHours} hours ago`;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function exceptionTypeLabel(index: number, fallback: string) {
  return ["Already Paid - Not Yet Matched", "Short Payment"][index] ?? humanize(fallback);
}

function exceptionAccountLabel(index: number, fallback: string) {
  return ["Puregold Price Club Inc.", "Alfamart Trading Philippines Inc."][index] ?? fallback;
}

function exceptionInvoiceLabel(index: number) {
  return ["INV-2024-0967", "INV-2024-0823"][index] ?? "—";
}

function exceptionAmountLabel(index: number, fallback: string) {
  return ["₱345,000", "₱567,000"][index] ?? fallback;
}

function exceptionOwnerLabel(index: number) {
  return ["Ana Reyes", "Ana Reyes"][index] ?? "Juan Cruz";
}

function exceptionSlaLabel(index: number) {
  return ["Mar 29 04:00 PM", "Mar 30 09:00 AM"][index] ?? "Mar 31 05:00 PM";
}

function approvalHeading(requestType: string) {
  switch (requestType) {
    case "strategic_outreach":
      return "Strategic Outreach";
    case "disputed_invoice_outreach":
      return "Disputed Invoice Outreach";
    case "low_confidence_cash_application":
      return "Low-Confidence Cash Application";
    case "unverified_contact_outreach":
      return "Unverified Contact Outreach";
    default:
      return humanize(requestType);
  }
}

function formatPhp(valueCents: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(valueCents / 100);
}

function formatPhpShort(valueCents: number) {
  const amount = valueCents / 100;

  if (Math.abs(amount) >= 1_000_000) {
    return `₱${formatCompactUnit(amount / 1_000_000, 3)}M`;
  }
  if (Math.abs(amount) >= 1_000) {
    return `₱${Math.round(amount / 1_000)}K`;
  }

  return `₱${Math.round(amount)}`;
}

function formatPhpCompactLong(valueCents: number) {
  const amount = valueCents / 100;

  if (Math.abs(amount) >= 1_000_000) {
    return `₱${formatCompactUnit(amount / 1_000_000, 3)}M`;
  }
  if (Math.abs(amount) >= 1_000) {
    return `₱${(amount / 1_000).toFixed(1)}K`;
  }

  return formatPhp(valueCents);
}

function formatCompactUnit(value: number, maxFractionDigits: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  });
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatChartMoneyMillions(valueCents: number) {
  return `${Math.round(valueCents / 100_000_000)}`;
}

function formatCompactCount(value: number) {
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2).replace(/\.00$/, "")}K`;
  }

  return String(value);
}

function formatRelativeTime(value?: string) {
  if (!value) {
    return "—";
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (diffMinutes < 1) {
    return "Just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function formatFileSize(fileSizeBytes: number) {
  if (fileSizeBytes >= 1_000_000) {
    return `${(fileSizeBytes / 1_000_000).toFixed(1)} MB`;
  }
  if (fileSizeBytes >= 1_000) {
    return `${Math.round(fileSizeBytes / 1_000)} KB`;
  }
  return `${fileSizeBytes} B`;
}

function diffCalendarDays(start?: string, end?: string) {
  if (!start || !end) {
    return undefined;
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return undefined;
  }

  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000));
}

function approvalAccount(requestType: string, index: number) {
  switch (requestType) {
    case "strategic_outreach":
      return "SM Retail Inc.";
    case "disputed_invoice_outreach":
      return "Robinsons Supermarket Corp.";
    case "low_confidence_cash_application":
      return "Puregold Price Club Inc.";
    case "unverified_contact_outreach":
      return "Robinsons Supermarket Corp.";
    default:
      return index % 2 === 0 ? "SM Retail Inc." : "Puregold Price Club Inc.";
  }
}

function approvalRequestedOn(index: number) {
  return ["Mar 29, 08:30 AM", "Mar 29, 09:15 AM", "Mar 28, 03:45 PM", "Mar 29, 07:00 AM"][index] ?? "Mar 29, 09:00 AM";
}

function invoiceStatusClassName(status: string) {
  switch (status) {
    case "paid":
      return "pill-success";
    case "disputed":
      return "pill-violet";
    case "partial":
      return "pill-warning";
    case "voided":
      return "pill-neutral";
    default:
      return "pill-danger";
  }
}

const NEW_CONTROL_CENTER_TEMPLATE_ID = "__new_template__";
const CONTROL_CENTER_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const DEFAULT_TEMPLATE_SAMPLE_VARIABLES: Record<string, string> = {
  customer_name: "Luzon Distributor Group - Manila",
  customer_email: "ap@luzondistributor.example",
  customer_company_name: "Luzon Distributor Group - Manila",
  billing_account_name: "Luzon Distributor Group - Manila",
  customer_external_id: "ACC-10024",
  branch_name: "Makati City Branch",
  sender_company_name: "Yield AROS",
  invoice_numbers: "INV-1023, INV-1027",
  overdue_invoice_summary: "- Invoice INV-1023: PHP 24,000.00 due on September 11, 2025",
  overdue_balance: "PHP 24,000.00",
  upcoming_balance: "PHP 2,400.00",
  total_account_balance: "PHP 26,400.00",
  payment_url: "https://pay.yieldaros.example/account/ACC-10024",
  num_upcoming_invoices: "1",
  name: "Maria Santos",
};

type ControlCenterWorkflowRow = OperatorConsoleData["controlCenter"]["workflows"][number];
type ControlCenterSenderIdentity = OperatorConsoleData["emailSendingIdentities"][number];

function resolveControlCenterSender(
  workflow: ControlCenterWorkflowRow,
  identities: OperatorConsoleData["emailSendingIdentities"],
): ControlCenterSenderIdentity | undefined {
  const connected = identities.filter((identity) => identity.connectionStatus === "connected");
  return (
    connected.find((identity) => identity.id === workflow.senderIdentityId) ??
    connected.find((identity) => identity.senderEmail === workflow.senderEmail || identity.sendAsEmail === workflow.senderEmail) ??
    connected.find((identity) => identity.isDefault) ??
    connected[0]
  );
}

function senderDisplayEmail(identity?: ControlCenterSenderIdentity) {
  return identity?.sendAsEmail ?? identity?.senderEmail ?? "";
}

function describeWorkflowAvailability(input: {
  workflow: ControlCenterWorkflowRow;
  senderIdentity?: ControlCenterSenderIdentity;
  callAgentConfig: OperatorConsoleData["controlCenter"]["callAgentConfig"];
}) {
  const supportedStages = input.workflow.stages.filter((stage) => stage.enabled && stage.outreachType !== "sms");
  const hasEmailStage = supportedStages.some((stage) => stage.outreachType === "email");
  const hasCallStage = supportedStages.some((stage) => stage.outreachType === "call");
  const missing: string[] = [];

  if (supportedStages.length === 0) {
    missing.push("Add an email or call stage");
  }
  if (hasEmailStage && !input.senderIdentity) {
    missing.push("Connect a sender identity");
  }
  if (hasCallStage && (!input.callAgentConfig.phoneNumber || !input.callAgentConfig.outboundCallingEnabled)) {
    missing.push("Connect and enable a Retell outbound number");
  }

  if (missing.length > 0) {
    return {
      available: false,
      label: "Not available",
      detail: missing.join(". "),
    };
  }

  return {
    available: true,
    label: input.workflow.enabled ? "Active" : "Inactive",
    detail: input.workflow.enabled
      ? "This workflow can run for enrolled customers."
      : "This workflow is ready but currently inactive.",
  };
}

function applyTemplatePreviewConditionals(value: string, sampleVariables: Record<string, string>) {
  const hasUpcomingInvoices = Number(sampleVariables.num_upcoming_invoices ?? "0") > 0;
  return value.replace(/\{%\s*if\s+num_upcoming_invoices\s*>\s*0\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/gi, (_match, content: string) =>
    hasUpcomingInvoices ? content : "",
  );
}

function applyTemplatePreviewVariables(value: string, sampleVariables: Record<string, string>) {
  const aliasedValue = applyTemplatePreviewConditionals(value, sampleVariables)
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => sampleVariables[key] ?? match);
  const aliasReplacements: Array<[string, string | undefined]> = [
    ["Customer Name", sampleVariables.customer_name],
    ["Customer Company Name", sampleVariables.customer_company_name],
    ["Sender Company Name", sampleVariables.sender_company_name],
    ["Overdue Invoices Summary", sampleVariables.overdue_invoice_summary],
    ["Overdue Balance", sampleVariables.overdue_balance],
    ["Upcoming Balance", sampleVariables.upcoming_balance],
    ["Total Account Balance", sampleVariables.total_account_balance],
    ["Payment URL", sampleVariables.payment_url],
  ];
  return aliasReplacements
    .reduce((output, [from, to]) => output.replaceAll(from, to ?? from), aliasedValue)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const ControlCenterPage = ({
  data,
  activeTab = "workflows",
  expandedWorkflowId,
  selectedTemplateId,
  templateSearch = "",
  actionStatus,
  actionMessage,
  enrollModalWorkflowId,
  stageModalWorkflowId,
  stageModalChannel = "email",
  stageModalTemplateMode = "pre_saved_template",
}: {
  data: OperatorConsoleData;
  activeTab?: "workflows" | "email-templates" | "call-agent" | "config";
  expandedWorkflowId?: string;
  selectedTemplateId?: string;
  templateSearch?: string;
  actionStatus?: "success" | "error";
  actionMessage?: string;
  enrollModalWorkflowId?: string;
  stageModalWorkflowId?: string;
  stageModalChannel?: "email" | "call" | "sms";
  stageModalTemplateMode?: "pre_saved_template" | "ai_generated";
}) => {
  const controlCenter = data.controlCenter ?? {
    workflows: [],
    generationPreview: {
      email: { emailDraft: { subjectSuggestions: [], emailBody: "", warnings: [] } },
      sms: { smsDraft: { variants: [] } },
      voice: { voicePayload: { safeTalkingPoints: [], handoffConditions: [] } },
    },
    callAgentConfig: {
      id: "cc_call_agent_fallback",
      tenantId: "default",
      createdAt: data.generatedAt,
      updatedAt: data.generatedAt,
      phoneNumber: "",
      smsEnabled: false,
      outboundCallingEnabled: false,
      handoffToHumanEnabled: false,
      manualAgentInstructions: "",
      callRecordingDisclaimerEnabled: false,
      providerType: "retell",
      providerConfigMetadata: {},
      defaultBehaviorFlags: [],
    },
    config: {
      id: "cc_config_fallback",
      tenantId: "default",
      createdAt: data.generatedAt,
      updatedAt: data.generatedAt,
      defaultTimezone: "Asia/Manila",
      defaultSenderBehavior: "workflow_specific",
      allowedChannels: ["email", "sms", "call"],
      channelFallbackPolicy: "manual_review_only",
      sandboxMode: "audit_preview_only",
      defaultRiskApprovalMode: "strict",
      seededDemoFlags: {},
    },
    templateFolders: [],
    templates: [],
    providerPreview: { providerType: "retell", payload: {} },
  };
  const visibleActiveTab = activeTab === "config" ? "workflows" : activeTab;
  const collectionWorkflows = controlCenter.workflows.filter((workflow) => workflow.category === "collections");
  const selectedEnrollWorkflow = controlCenter.workflows.find((workflow) => workflow.id === enrollModalWorkflowId);
  const selectedStageWorkflow = controlCenter.workflows.find((workflow) => workflow.id === stageModalWorkflowId);
  const isCreatingTemplate = selectedTemplateId === NEW_CONTROL_CENTER_TEMPLATE_ID;
  const selectedTemplate =
    controlCenter.templates.find((template) => template.id === selectedTemplateId) ??
    (isCreatingTemplate
      ? ({
          id: NEW_CONTROL_CENTER_TEMPLATE_ID,
          tenantId: "default",
          version: 1,
          createdAt: data.generatedAt,
          updatedAt: data.generatedAt,
          name: "New Template",
          subject: "Collections follow-up",
          body: "Hi {{customer_name}},\n\nWe are following up on {{invoice_numbers}}.",
          ccEmails: [],
          channelCompatibility: ["email"],
          autoCorrectEnabled: false,
          isDefault: false,
          isArchived: false,
          previewSeedKey: "bill-default",
        } satisfies OperatorConsoleData["controlCenter"]["templates"][number])
      : undefined);
  const selectedTemplatePreview = isCreatingTemplate ? undefined : data.controlCenterTemplatePreview;
  const templateSampleVariables = {
    ...DEFAULT_TEMPLATE_SAMPLE_VARIABLES,
    ...(selectedTemplatePreview?.sampleVariables ?? {}),
  };
  const templateVariableOptions = Object.keys(templateSampleVariables).sort();
  const workflowRows = collectionWorkflows.length > 0 ? collectionWorkflows : controlCenter.workflows;
  const normalizedTemplateSearch = templateSearch.trim().toLowerCase();
  const visibleTemplates = controlCenter.templates.filter((template) => {
    if (template.isArchived) {
      return false;
    }
    if (!normalizedTemplateSearch) {
      return true;
    }
    const searchable = `${template.name} ${template.subject} ${template.body}`.toLowerCase();
    return searchable.includes(normalizedTemplateSearch);
  });
  const normalizedStageModalChannel = stageModalChannel === "sms" ? "email" : stageModalChannel;
  const availableTemplates = controlCenter.templates.filter((template) => {
    if (normalizedStageModalChannel === "call") {
      return template.channelCompatibility.includes("voice_agent");
    }
    return template.channelCompatibility.includes(normalizedStageModalChannel);
  });
  const activeExpandedWorkflowId = expandedWorkflowId;
  const defaultSenderIdentity = data.emailSendingIdentities.find(
    (identity) => identity.connectionStatus === "connected" && identity.isDefault,
  ) ?? data.emailSendingIdentities.find((identity) => identity.connectionStatus === "connected");
  const buildControlCenterHref = ({
    tab = visibleActiveTab,
    workflow,
    selectedTemplate,
    enrollWorkflow,
    stageWorkflow,
    stageChannel,
    stageTemplateMode: templateMode,
  }: {
    tab?: "workflows" | "email-templates" | "call-agent" | "config";
    workflow?: string;
    selectedTemplate?: string;
    enrollWorkflow?: string;
    stageWorkflow?: string;
    stageChannel?: "email" | "call" | "sms";
    stageTemplateMode?: "pre_saved_template" | "ai_generated";
  } = {}) => {
    const params = new URLSearchParams();
    if (tab && tab !== "workflows" && tab !== "config") {
      params.set("controlCenterTab", tab);
    }
    if (tab === "email-templates" && templateSearch.trim()) {
      params.set("templateSearch", templateSearch.trim());
    }
    if (workflow) {
      params.set("workflow", workflow);
    }
    if (selectedTemplate) {
      params.set("selectedTemplateId", selectedTemplate);
    }
    if (enrollWorkflow) {
      params.set("enrollWorkflow", enrollWorkflow);
    }
    if (stageWorkflow) {
      params.set("stageWorkflow", stageWorkflow);
    }
    if (stageChannel) {
      params.set("stageChannel", stageChannel);
    }
    if (templateMode) {
      params.set("stageTemplateMode", templateMode);
    }
    const query = params.toString();
    return query ? `/control-center?${query}` : "/control-center";
  };
  const stageModalBaseHref = (channel: "email" | "call", templateMode = stageModalTemplateMode) =>
    buildControlCenterHref({
      tab: "workflows",
      workflow: stageModalWorkflowId ?? activeExpandedWorkflowId ?? "",
      stageWorkflow: stageModalWorkflowId ?? activeExpandedWorkflowId ?? "",
      stageChannel: channel,
      stageTemplateMode: templateMode,
    });
  const templateModeHref = (templateMode: "pre_saved_template" | "ai_generated") =>
    stageModalBaseHref(normalizedStageModalChannel, templateMode);
  const describeStageSentence = (
    stage: OperatorConsoleData["controlCenter"]["workflows"][number]["stages"][number],
  ) => {
    const comparator = stage.triggerConfig.comparator ?? stage.triggerType;
    const outreachLabel =
      stage.outreachType === "email" ? "email reminder" : stage.outreachType === "call" ? "call reminder" : "SMS reminder";
    const templateLabel =
      stage.templateMode === "pre_saved_template" && stage.templateId
        ? controlCenter.templates.find((template) => template.id === stage.templateId)?.name ?? "saved template"
        : "AI Generate";
    const offsetDays = stage.triggerConfig.offsetDays ?? 0;
    const dayLabel = offsetDays === 1 ? "day" : "days";
    if (comparator === "due_in_days") {
      return `When an invoice is ${offsetDays} ${dayLabel} until due date send an ${outreachLabel}${stage.templateMode === "pre_saved_template" && stage.outreachType === "email" ? ` using email template ${templateLabel}` : ""}`;
    }
    if (comparator === "due_today") {
      return `When an invoice is due send an ${outreachLabel}${stage.templateMode === "pre_saved_template" && stage.outreachType === "email" ? ` using email template ${templateLabel}` : ""}`;
    }
    if (comparator === "days_past_due") {
      return `When an invoice is ${offsetDays} ${dayLabel} past due send a ${outreachLabel}${stage.templateMode === "pre_saved_template" && stage.outreachType === "email" ? ` using email template ${templateLabel}` : ""}`;
    }
    if (comparator === "remittance_missing_after_payment") {
      return `When remittance is missing after payment detected start a ${outreachLabel} using ${templateLabel}`;
    }
    if (comparator === "promise_missed") {
      return `When a promise to pay is missed send a ${outreachLabel} using ${templateLabel}`;
    }
    return `Trigger ${comparator.replaceAll("_", " ")} with ${outreachLabel} using ${templateLabel}`;
  };
  const renderStageSentence = (
    stage: OperatorConsoleData["controlCenter"]["workflows"][number]["stages"][number],
  ) => {
    const comparator = stage.triggerConfig.comparator ?? stage.triggerType;
    const offsetDays = stage.triggerConfig.offsetDays ?? 0;
    const dayLabel = offsetDays === 1 ? "day" : "days";
    const templateLabel =
      stage.templateMode === "pre_saved_template" && stage.templateId
        ? controlCenter.templates.find((template) => template.id === stage.templateId)?.name ?? "saved template"
        : "AI Generate";
    const actionLabel = stage.outreachType === "email" ? "email reminder" : "call reminder";

    if (comparator === "due_in_days") {
      return (
        <>
          When an invoice is <strong>{offsetDays} {dayLabel} until due date</strong> send an <span className="stage-linkish">{actionLabel}</span>
          {stage.templateMode === "pre_saved_template" && stage.outreachType === "email" ? <> using email template <strong>{templateLabel}</strong></> : null}
        </>
      );
    }
    if (comparator === "due_today") {
      return (
        <>
          When an invoice is <strong>due</strong> send an <span className="stage-linkish">{actionLabel}</span>
          {stage.templateMode === "pre_saved_template" && stage.outreachType === "email" ? <> using email template <strong>{templateLabel}</strong></> : null}
        </>
      );
    }
    if (comparator === "days_past_due") {
      return (
        <>
          When an invoice is <strong>{offsetDays} {dayLabel} past due</strong> send a <span className="stage-linkish">{actionLabel}</span>
          {stage.templateMode === "pre_saved_template" && stage.outreachType === "email" ? <> using email template <strong>{templateLabel}</strong></> : null}
        </>
      );
    }
    return describeStageSentence(stage);
  };
  const adaptivePolicySummary = {
    autoPauseOutcomes: ["Promise to pay", "Payment in process", "Callback requested"],
    trackSwitchOutcomes: ["Promise to pay", "Invoice resend request", "Email only / do not call"],
    humanReviewOutcomes: ["Dispute detected", "Low-confidence AI outcome", "Legal or strategic handling"],
  };
  const renderOutcomeBadges = (outcomes: string[]) => (
    <div className="control-center-stage-tags">
      {outcomes.map((outcome) => (
        <span key={outcome} className="workflow-stage-badge">{outcome}</span>
      ))}
    </div>
  );
  const customerByBillingAccountId = new Map(
    data.customerIndex.map((customer: OperatorConsoleData["customerIndex"][number]) => [
      customer.billingAccountId ?? customer.profileId,
      customer,
    ]),
  );
  const renderWorkflowExecutionRow = (
    workflow: OperatorConsoleData["controlCenter"]["workflows"][number],
    execution: OperatorConsoleData["controlCenter"]["workflows"][number]["executions"][number],
  ) => {
    const customer = customerByBillingAccountId.get(execution.billingAccountId);
    const metadata = execution.metadata as Record<string, unknown>;
    const accountName =
      typeof metadata.customerName === "string"
        ? metadata.customerName
        : customer?.canonicalName ?? customer?.billingAccountName ?? execution.billingAccountId;
    const accountId =
      typeof metadata.accountNumber === "string"
        ? metadata.accountNumber
        : customer?.billingAccountId ?? execution.billingAccountId;
    const overdueAmount =
      typeof metadata.overdueAmount === "string" ? metadata.overdueAmount : customer?.overdueAmount ?? "Overdue amount unavailable";
    const openInvoiceCount =
      typeof metadata.openInvoiceCount === "number"
        ? metadata.openInvoiceCount
        : customer?.openInvoiceCount ?? 0;
    const enrolledOn = new Date(execution.createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    return (
      <article key={execution.id} className="control-center-enrollment-item">
        <div className="control-center-enrollment-check">
          <input
            type="checkbox"
            aria-label={`Select ${accountName}`}
            className="control-center-enrollment-checkbox"
            data-workflow-id={workflow.id}
          />
        </div>
        <div className="control-center-enrollment-copy">
          <div className="control-center-enrollment-title-row">
            <h5>{accountName}</h5>
            <span className="workflow-stage-badge">{accountId}</span>
            {execution.status === "paused" ? <span className="pill pill-warning">Paused</span> : null}
          </div>
          <p className="control-center-enrollment-meta">
            <span>Overdue: {overdueAmount}</span>
            <span>{openInvoiceCount} open invoices</span>
            <span>Enrolled: {enrolledOn}</span>
          </p>
        </div>
        <div className="control-center-enrollment-actions">
          {execution.status === "paused" ? (
            <form method="post" action="/control-center/workflows/customer/resume">
              <input type="hidden" name="workflowId" value={workflow.id} />
              <input type="hidden" name="executionId" value={execution.id} />
              <button type="submit" className="control-center-inline-action">
                <span className="control-center-inline-action-icon">▷</span>
                Resume
              </button>
            </form>
          ) : (
            <form method="post" action="/control-center/workflows/customer/pause">
              <input type="hidden" name="workflowId" value={workflow.id} />
              <input type="hidden" name="executionId" value={execution.id} />
              <button type="submit" className="control-center-inline-action">
                <span className="control-center-inline-action-icon">Ⅱ</span>
                Pause
              </button>
            </form>
          )}
          <form method="post" action="/control-center/workflows/customer/unenroll">
            <input type="hidden" name="workflowId" value={workflow.id} />
            <input type="hidden" name="executionId" value={execution.id} />
            <button type="submit" className="control-center-inline-action is-danger">
              <span className="control-center-inline-action-icon">◌</span>
              Unenroll
            </button>
          </form>
        </div>
      </article>
    );
  };
  const renderWorkflowCard = (workflow: OperatorConsoleData["controlCenter"]["workflows"][number]) => {
    const visibleStages = workflow.stages.filter((stage) => stage.outreachType !== "sms");
    const enrolledBillingAccountIds = new Set(workflow.executions.map((execution) => execution.billingAccountId));
    const availableCustomers = data.customerIndex.filter(
      (customer) => !enrolledBillingAccountIds.has(customer.billingAccountId ?? customer.profileId),
    );
    const workflowSender = resolveControlCenterSender(workflow, data.emailSendingIdentities);
    const resolvedSenderEmail = senderDisplayEmail(workflowSender);
    const availability = describeWorkflowAvailability({
      workflow,
      ...(workflowSender ? { senderIdentity: workflowSender } : {}),
      callAgentConfig: controlCenter.callAgentConfig,
    });
    const toggleDisabled = !workflow.enabled && !availability.available;

    return (
    <details key={workflow.id} className="control-center-workflow-row" open={workflow.id === activeExpandedWorkflowId}>
	      <summary>
	        <div className="control-center-workflow-summary">
          <form
            method="post"
            action="/control-center/workflows/toggle"
            className="control-center-toggle-form"
            data-workflow-toggle-form
          >
            <input type="hidden" name="workflowId" value={workflow.id} />
            <input type="hidden" name="enabled" value={workflow.enabled ? "false" : "true"} />
            <button
              type="submit"
              className={`workflow-toggle${workflow.enabled ? " is-active" : ""}${toggleDisabled ? " is-disabled" : ""}`}
              aria-label={toggleDisabled ? `${workflow.name} is not available` : workflow.enabled ? "Disable workflow" : "Enable workflow"}
              disabled={toggleDisabled}
              data-workflow-toggle-button
            >
              <span className="workflow-toggle-knob" />
            </button>
          </form>
          <div className="control-center-workflow-copy">
            <h3>{workflow.name}</h3>
            <p>{workflow.executions.length} customers enrolled · {availability.detail}</p>
          </div>
	        </div>
	        <div className="control-center-workflow-actions">
	          <span className={`workflow-state-badge${availability.available ? workflow.enabled ? " is-active" : " is-inactive" : " is-unavailable"}`}>
              {availability.label}
            </span>
	          <span className="workflow-stage-badge">{visibleStages.length} Stages</span>
	          <span className="workflow-chevron workflow-chevron-icon" aria-hidden="true">
              <AppIcon name="chevron-right" />
            </span>
	          <form method="post" action="/control-center/workflows/delete">
	            <input type="hidden" name="workflowId" value={workflow.id} />
	            <button type="submit" className="icon-button" aria-label={`Delete ${workflow.name}`}>
	              <AppIcon name="trash" />
	            </button>
	          </form>
	        </div>
      </summary>

      <div className="control-center-workflow-body">
        <form method="post" action="/control-center/workflows/update" className="control-center-grid-form" data-control-center-action-form>
          <input type="hidden" name="workflowId" value={workflow.id} />
          <input type="hidden" name="timezone" value={workflow.timezone || controlCenter.config.defaultTimezone || "Asia/Manila"} />
          {workflowSender ? <input type="hidden" name="senderIdentityId" value={workflowSender.id} /> : null}
          {resolvedSenderEmail ? <input type="hidden" name="senderEmail" value={resolvedSenderEmail} /> : null}
          <label>
            <span>Name</span>
            <input type="text" name="name" defaultValue={workflow.name} />
          </label>
          <label>
            <span>Email sender</span>
            <input
              type="email"
              defaultValue={resolvedSenderEmail}
              placeholder="No connected sender configured"
              readOnly
              aria-readonly="true"
            />
            <span className={`control-center-field-help${resolvedSenderEmail ? "" : " is-unavailable"}`}>
              {resolvedSenderEmail
                ? `Outbound email will send from ${resolvedSenderEmail}.`
                : "Connect a Gmail sender identity in Integrations before enabling email outreach."}
            </span>
          </label>
          <label>
            <span>Test email recipient</span>
            <input type="email" name="testEmailRecipient" defaultValue={workflow.testEmailRecipient ?? ""} />
          </label>
          <label>
            <span>Test call recipient</span>
            <input type="text" name="testCallRecipient" defaultValue={workflow.testCallRecipient ?? ""} />
          </label>
          <label>
            <span>Outreach window</span>
            <div className="control-center-inline-row">
              <input type="time" name="outreachWindowStart" defaultValue={workflow.outreachWindowStart} />
              <input type="time" name="outreachWindowEnd" defaultValue={workflow.outreachWindowEnd} />
            </div>
            <span className="control-center-field-help">{workflow.timezone || controlCenter.config.defaultTimezone || "Asia/Manila"}</span>
          </label>
          <div className="control-center-full-row">
            <span className="control-center-field-label">Selected outreach days</span>
            <div className="weekday-pill-row" aria-label="Selected outreach days">
              {CONTROL_CENTER_WEEKDAYS.map((day) => (
                <label key={day} className={`weekday-pill${workflow.outreachDays.includes(day) ? " is-active" : ""}`}>
                  <input
                    type="checkbox"
                    name="outreachDays"
                    value={day}
                    defaultChecked={workflow.outreachDays.includes(day)}
                  />
                  <span>{day.slice(0, 3).replace(/^./, (letter) => letter.toUpperCase())}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="control-center-full-row control-center-form-actions">
            <button
              type="submit"
              className="ghost-button"
              formAction="/control-center/workflows/test-email"
              data-loading-label="Sending..."
              disabled={!resolvedSenderEmail}
            >
              Send test email
            </button>
            <button
              type="submit"
              className="ghost-button"
              formAction="/control-center/workflows/test-call"
              data-loading-label="Calling..."
              disabled={!controlCenter.callAgentConfig.phoneNumber || !controlCenter.callAgentConfig.outboundCallingEnabled}
            >
              Start test call
            </button>
            <button type="submit" className="primary-button" data-loading-label="Saving...">
              Save workflow
            </button>
          </div>
        </form>

        <article className="control-center-preview-panel control-center-enrollment-panel">
          <div className="panel-header control-center-enrollment-head">
            <button
              type="button"
              className="control-center-enrollment-summary-button"
              data-enrollment-toggle
              data-enrollment-target={`workflow-enrollment-${workflow.id}`}
              aria-expanded="true"
            >
              <h4 className="control-center-enrollment-title">
                Enrolled Customers ({workflow.executions.length})
              </h4>
              <span className="workflow-chevron workflow-chevron-icon is-open" aria-hidden="true">
                <AppIcon name="chevron-right" />
              </span>
            </button>
            <a
              href={buildControlCenterHref({ tab: "workflows", workflow: workflow.id, enrollWorkflow: workflow.id })}
              className="primary-button control-center-button-with-icon"
            >
              <AppIcon name="plus" />
              Enroll Customers
            </a>
          </div>
          <div className="control-center-enrollment-list" id={`workflow-enrollment-${workflow.id}`}>
            {workflow.executions.length > 0 ? (
              <>
                <div className="control-center-select-all-row">
                  <input
                    type="checkbox"
                    aria-label="Select all enrolled customers"
                    className="control-center-select-all-checkbox"
                    data-workflow-id={workflow.id}
                  />
                  <span>Select All</span>
                </div>
                {workflow.executions.map((execution) => renderWorkflowExecutionRow(workflow, execution))}
              </>
            ) : (
              <div className="control-center-enrollment-empty">
                <p>No customers are enrolled in this workflow yet.</p>
              </div>
            )}
          </div>
        </article>

	        <div className="control-center-stage-header">
	          <div>
	            <h4>Stages</h4>
	            <p>Add email or call steps with safe trigger rules.</p>
	          </div>
	          <a href={`/control-center?workflow=${encodeURIComponent(workflow.id)}&stageWorkflow=${encodeURIComponent(workflow.id)}&stageChannel=email&stageTemplateMode=pre_saved_template`} className="primary-button control-center-button-with-icon">
              <AppIcon name="plus" />
              Add Stage
            </a>
	        </div>
        <div className="control-center-stage-list">
          {visibleStages.map((stage: OperatorConsoleData["controlCenter"]["workflows"][number]["stages"][number]) => (
            <article key={stage.id} className="control-center-stage-item">
              <div className="control-center-stage-sentence">
                <span className={`stage-channel-icon is-${stage.outreachType}`} aria-hidden="true">
                  <AppIcon name={stage.outreachType === "email" ? "mail" : "phone"} />
                </span>
                <p className="control-center-stage-sentence-copy">{renderStageSentence(stage)}</p>
	              </div>
	              <div className="control-center-stage-actions">
                  {stage.templateMode === "ai_generated" || stage.outreachType === "call" ? (
                    <span className="stage-ai-pill">AI</span>
                  ) : null}
                  <form method="post" action="/control-center/stages/delete">
                    <input type="hidden" name="workflowId" value={workflow.id} />
                    <input type="hidden" name="stageId" value={stage.id} />
                    <button type="submit" className="icon-button" aria-label="Delete stage">
                      <AppIcon name="trash" />
                    </button>
                  </form>
	              </div>
	            </article>
	          ))}
          {visibleStages.length === 0 ? (
            <div className="control-center-enrollment-empty">
              <p>No runnable email or call stages are configured yet.</p>
            </div>
          ) : null}
        </div>
        <article className="control-center-preview-panel">
          <div className="panel-header">
            <div>
              <h4>Adaptive outcomes</h4>
              <p>These runtime decisions reuse the current workflow and approval surfaces.</p>
            </div>
            <span className="workflow-stage-badge">Policy guided</span>
          </div>
          <div className="card-grid card-grid-3">
            <div className="reason-box">
              <span className="label-copy">Auto-pause outcomes</span>
              {renderOutcomeBadges(adaptivePolicySummary.autoPauseOutcomes)}
            </div>
            <div className="reason-box">
              <span className="label-copy">Track switching</span>
              {renderOutcomeBadges(adaptivePolicySummary.trackSwitchOutcomes)}
            </div>
            <div className="reason-box">
              <span className="label-copy">Human review triggers</span>
              {renderOutcomeBadges(adaptivePolicySummary.humanReviewOutcomes)}
            </div>
          </div>
        </article>
      </div>
	    </details>
	  );
  };

  const tabHref = (tab: "workflows" | "email-templates" | "call-agent") =>
    buildControlCenterHref({
      tab,
      ...(tab === "workflows" && activeExpandedWorkflowId ? { workflow: activeExpandedWorkflowId } : {}),
      ...(tab === "email-templates" && selectedTemplate ? { selectedTemplate: selectedTemplate.id } : {}),
    });
  const templateBodyPreview = (body: string) => (body.length > 78 ? `${body.slice(0, 78)}...` : body);
  const renderPreviewParagraph = (templateId: string, paragraph: string, index: number) => {
    const trimmed = paragraph.trim();
    if (/^https?:\/\/\S+$/i.test(trimmed)) {
      return (
        <p key={`${templateId}-preview-${index}`}>
          <a href={trimmed}>{trimmed}</a>
        </p>
      );
    }
    return <p key={`${templateId}-preview-${index}`}>{paragraph}</p>;
  };
  const previewSubject = selectedTemplatePreview?.subject ?? applyTemplatePreviewVariables(selectedTemplate?.subject ?? "", templateSampleVariables);
  const previewBody = selectedTemplatePreview?.body ?? applyTemplatePreviewVariables(selectedTemplate?.body ?? "", templateSampleVariables);

  return (
    <section className="page-shell control-center-page">
      <header className="control-center-hero">
        <div>
          <h1>Control Center</h1>
          <p>Manage agent rules and triggers</p>
        </div>
      </header>

      <nav className="control-center-tabbar" aria-label="Control Center tabs">
        <a href={tabHref("workflows")} className={`control-center-tab${visibleActiveTab === "workflows" ? " is-active" : ""}`}>Workflows</a>
        <a href={tabHref("email-templates")} className={`control-center-tab${visibleActiveTab === "email-templates" ? " is-active" : ""}`}>Email Templates</a>
        <a href={tabHref("call-agent")} className={`control-center-tab${visibleActiveTab === "call-agent" ? " is-active" : ""}`}>Call Agent</a>
      </nav>

      {actionStatus && actionMessage ? (
        <article className={`control-center-action-banner is-${actionStatus}`} role="status">
          <strong>{actionStatus === "success" ? "Action completed." : "Action could not complete."}</strong>
          <p>{actionMessage}</p>
        </article>
      ) : null}

      {visibleActiveTab === "workflows" ? (
        <>
          <div className="control-center-intro-row">
	            <p className="control-center-lead">Configure time based email or call triggers to conduct outreach for collection.</p>
	            <form method="post" action="/control-center/workflows/create" className="control-center-inline-form">
	              <input type="hidden" name="category" value="collections" />
	              <input type="hidden" name="name" value="New workflow" />
                <input type="hidden" name="timezone" value={controlCenter.config.defaultTimezone || "Asia/Manila"} />
                {defaultSenderIdentity ? <input type="hidden" name="senderIdentityId" value={defaultSenderIdentity.id} /> : null}
                {defaultSenderIdentity ? <input type="hidden" name="senderEmail" value={senderDisplayEmail(defaultSenderIdentity)} /> : null}
	              <button type="submit" className="primary-button control-center-button-with-icon">
                  <AppIcon name="plus" />
                  New Workflow
                </button>
	            </form>
	          </div>

	          <div className="control-center-layout">
            <div className="control-center-main">
              <div id="collections-workflows" className="control-center-workflow-group">
                {workflowRows.length > 0 ? workflowRows.map(renderWorkflowCard) : <p>No collection workflows yet.</p>}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {visibleActiveTab === "email-templates" ? (
        <div className="control-center-main">
          <section className="control-center-templates-screen">
            <div className="control-center-template-toolbar">
              <a
                href={buildControlCenterHref({ tab: "email-templates", selectedTemplate: NEW_CONTROL_CENTER_TEMPLATE_ID })}
                className="primary-button control-center-button-with-icon"
              >
                <AppIcon name="plus" />
                Create Template
              </a>
            </div>

            <form className="control-center-template-searchbar" method="get" action="/control-center">
              <input type="hidden" name="controlCenterTab" value="email-templates" />
              <AppIcon name="search" />
              <input
                type="search"
                name="templateSearch"
                defaultValue={templateSearch}
                placeholder="Search templates"
                aria-label="Search templates"
              />
              {templateSearch ? <a href="/control-center?controlCenterTab=email-templates" className="control-center-search-clear">Clear</a> : null}
              <button type="submit" className="ghost-button">Search</button>
            </form>

            <div className="control-center-template-table-wrap">
              <div className="control-center-template-table control-center-template-table-head">
                <div className="control-center-template-cell control-center-template-checkbox-cell">
                  <span className="template-checkbox" aria-hidden="true" />
                </div>
                <div className="control-center-template-cell">Name</div>
                <div className="control-center-template-cell">Subject</div>
                <div className="control-center-template-cell">Body</div>
              </div>

	              {visibleTemplates.map((template: OperatorConsoleData["controlCenter"]["templates"][number]) => (
	                <div key={template.id} className="control-center-template-table control-center-template-table-row">
                  <div className="control-center-template-cell control-center-template-checkbox-cell">
                    <span className="template-checkbox" aria-hidden="true" />
                  </div>
	                  <div className="control-center-template-cell">
	                    <div className="control-center-template-name">
	                      <span className="control-center-template-doc-icon" aria-hidden="true">
	                        <AppIcon name="invoice" />
	                      </span>
	                      <a
                          href={buildControlCenterHref({ tab: "email-templates", selectedTemplate: template.id })}
                          className="control-center-template-link"
                        >
                          {template.name}
                        </a>
	                    </div>
	                  </div>
                  <div className="control-center-template-cell control-center-template-subject">{template.subject}</div>
                  <div className="control-center-template-cell control-center-template-body">{templateBodyPreview(template.body)}</div>
                </div>
	              ))}
              {visibleTemplates.length === 0 ? (
                <div className="control-center-template-empty">
                  <strong>No templates found.</strong>
                  <p>{templateSearch ? "Try a different search term." : "Create an email template to use it in compose surfaces."}</p>
                </div>
              ) : null}
	            </div>
	          </section>
	        </div>
	      ) : null}

      {visibleActiveTab === "email-templates" && selectedTemplate ? (
        <div
          className="control-center-template-drawer-shell"
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-drawer-title"
        >
          <a
            href={buildControlCenterHref({ tab: "email-templates" })}
            className="control-center-template-drawer-backdrop"
            aria-label="Close template editor"
          />
          <aside className="control-center-template-drawer">
            <div className="control-center-template-drawer-head">
              <h2 id="template-drawer-title" data-template-drawer-title>
                {selectedTemplate.name}
              </h2>
              <a
                href={buildControlCenterHref({ tab: "email-templates" })}
                className="control-center-template-drawer-close"
                aria-label="Close"
              >
                ×
              </a>
            </div>

            <div className="control-center-template-drawer-content">
              <form
                method="post"
                action={isCreatingTemplate ? "/control-center/templates/create" : "/control-center/templates/update"}
                className="control-center-template-editor"
                data-template-editor
                data-template-sample-variables={JSON.stringify(templateSampleVariables)}
              >
                {isCreatingTemplate ? <input type="hidden" name="channelCompatibility" value="email" /> : null}
                {!isCreatingTemplate ? <input type="hidden" name="templateId" value={selectedTemplate.id} /> : null}
                <div className="control-center-template-editor-fields">
                  <label>
                    <span>Name</span>
                    <input type="text" name="name" defaultValue={selectedTemplate.name} data-template-name-input />
                  </label>
                  <label>
                    <span>Subject</span>
                    <input
                      type="text"
                      name="subject"
                      defaultValue={selectedTemplate.subject}
                      data-template-subject-input
                      data-template-variable-target
                    />
                  </label>
                  <label>
                    <span>Cc</span>
                    <input
                      type="text"
                      name="ccEmails"
                      defaultValue={selectedTemplate.ccEmails.join(", ")}
                      placeholder="collections@example.com, manager@example.com"
                    />
                  </label>
                  <div className="control-center-template-editor-note">
                    Set a list of email addresses to Cc when manually generating an email body using this template. Note: These will not be used in workflows.
                  </div>
                  <div className="control-center-template-toggle-row">
                    <label className="control-center-template-switchline">
                      <span>Default</span>
                      <span className={`template-mini-switch${selectedTemplate.isDefault ? " is-active" : ""}`} aria-hidden="true">
                        <span />
                      </span>
                      <input type="checkbox" name="isDefault" defaultChecked={selectedTemplate.isDefault} className="sr-only" />
                    </label>
                    <label className="control-center-template-switchline">
                      <span>Auto Correct</span>
                      <span
                        className={`template-mini-switch${selectedTemplate.autoCorrectEnabled ? " is-active" : ""}`}
                        aria-hidden="true"
                      >
                        <span />
                      </span>
                      <input
                        type="checkbox"
                        name="autoCorrectEnabled"
                        defaultChecked={selectedTemplate.autoCorrectEnabled}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>

                <textarea
                  name="body"
                  defaultValue={selectedTemplate.body}
                  className="control-center-template-editor-body"
                  data-template-body-input
                  data-template-variable-target
                />
                <div className="control-center-template-editor-footer">
                  <div className="control-center-template-editor-tools">
                    <div className="control-center-template-variable-picker" data-template-variable-picker>
                      <button
                        type="button"
                        className="control-center-template-variable-button"
                        data-template-variable-toggle
                        aria-haspopup="menu"
                        aria-expanded="false"
                      >
                        Variable
                      </button>
                      <div className="control-center-template-variable-menu" data-template-variable-menu role="menu">
                        {templateVariableOptions.map((variableName) => (
                          <button
                            key={variableName}
                            type="button"
                            className="control-center-template-variable-item"
                            data-template-variable-insert={`{{${variableName}}}`}
                            role="menuitem"
                          >
                            {`{{${variableName}}}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="control-center-template-editor-actions">
                    <span className="template-save-state">Saved</span>
                    <button type="submit" className="primary-button">Save Template</button>
                  </div>
                </div>
              </form>

              <section className="control-center-template-preview-pane">
                <div className="control-center-template-preview-chip">Template Preview</div>
                {selectedTemplate.ccEmails.length > 0 ? (
                  <div className="control-center-template-preview-block">
                    <h3>Cc</h3>
                    <p>{selectedTemplate.ccEmails.join(", ")}</p>
                  </div>
                ) : null}
                <div className="control-center-template-preview-block">
                  <h3>Subject</h3>
                  <p data-template-preview-subject>{previewSubject}</p>
                </div>
                <div className="control-center-template-preview-block">
                  <h3>Body</h3>
                  <div className="control-center-template-preview-copy" data-template-preview-body>
                    {previewBody
                      .split("\n")
                      .map((paragraph, index) =>
                        renderPreviewParagraph(selectedTemplate.id, paragraph, index),
                      )}
                  </div>
                </div>
              </section>
            </div>
          </aside>
        </div>
      ) : null}

      {visibleActiveTab === "call-agent" ? (
        <div className="control-center-main">
          <article id="cc-call-agent" className="control-center-card">
            <div className="control-center-card-head">
              <div>
                <h2>Call Agent</h2>
                <p>Configure operator-controlled Retell voice availability.</p>
              </div>
            </div>

            <form method="post" action="/control-center/call-agent/update" className="call-agent-settings-form">
              <div className="call-agent-settings-grid">
                <section className="call-agent-settings-section call-agent-number-section call-agent-wide-section">
                  <div className="call-agent-section-head">
                    <span className="call-agent-section-icon"><AppIcon name="phone" /></span>
                    <div>
                      <h3>Call Routing</h3>
                      <p>Outbound calls use the configured Retell number and the current workflow safety checks.</p>
                    </div>
                  </div>
                  <label className="call-agent-number-field">
                    <span>Call agent number</span>
                    <input
                      type="text"
                      defaultValue={controlCenter.callAgentConfig.phoneNumber}
                      placeholder="RETELL_FROM_NUMBER is not configured"
                      readOnly
                      aria-readonly="true"
                    />
                    <span className={`control-center-field-help${controlCenter.callAgentConfig.phoneNumber ? "" : " is-unavailable"}`}>
                      {controlCenter.callAgentConfig.phoneNumber
                        ? "Retell owns this number; update it in environment/provider configuration."
                        : "Set RETELL_FROM_NUMBER before enabling Retell outbound calls."}
                    </span>
                  </label>
                  <div className="call-agent-toggle-list">
                    <label className="control-center-checkbox call-agent-toggle">
                      <input type="checkbox" name="outboundCallingEnabled" defaultChecked={controlCenter.callAgentConfig.outboundCallingEnabled} />
                      <span>Outbound calling enabled</span>
                    </label>
                    <label className="control-center-checkbox call-agent-toggle is-disabled">
                      <input type="checkbox" defaultChecked={controlCenter.callAgentConfig.smsEnabled} disabled aria-disabled="true" />
                      <span>Inbound/outbound SMS enabled</span>
                    </label>
                  </div>
                </section>
              </div>
              <div className="call-agent-save-row">
                <button type="submit" className="primary-button">Save Call Agent</button>
              </div>
            </form>
          </article>
        </div>
      ) : null}

      {selectedEnrollWorkflow ? (
        (() => {
          const enrolledBillingAccountIds = new Set(
            selectedEnrollWorkflow.executions.map((execution) => execution.billingAccountId),
          );
          const modalCustomers = data.customerIndex.filter(
            (customer) => !enrolledBillingAccountIds.has(customer.billingAccountId ?? customer.profileId),
          );
          return (
            <div className="control-center-modal-shell" role="dialog" aria-modal="true" aria-labelledby="enroll-customers-title">
              <a
                href={buildControlCenterHref({ tab: "workflows", workflow: selectedEnrollWorkflow.id })}
                className="control-center-modal-backdrop"
                aria-label="Close enroll customers"
              />
              <div className="control-center-modal control-center-enroll-modal">
                <div className="control-center-modal-head">
                  <div>
                    <h2 id="enroll-customers-title">Enroll Customers in Workflow</h2>
                    <p>Select customers to enroll in "{selectedEnrollWorkflow.name}"</p>
                  </div>
                  <a
                    href={buildControlCenterHref({ tab: "workflows", workflow: selectedEnrollWorkflow.id })}
                    className="control-center-modal-close"
                    aria-label="Close"
                  >
                    ×
                  </a>
                </div>

                <form method="post" action="/control-center/workflows/enroll" className="control-center-modal-form">
                  <input type="hidden" name="workflowId" value={selectedEnrollWorkflow.id} />

                  <div className="control-center-enroll-search">
                    <AppIcon name="search" />
                    <input
                      type="search"
                      placeholder="Search customers..."
                      aria-label={`Search customers for ${selectedEnrollWorkflow.name}`}
                      className="control-center-enroll-search-input"
                    />
                  </div>

                  <div className="control-center-enroll-list" data-role="enroll-customer-list">
                    <label className="control-center-enroll-select-all">
                      <input type="checkbox" className="control-center-enroll-modal-select-all" />
                      <span>Select All ({modalCustomers.length})</span>
                    </label>
                    {modalCustomers.map((customer) => {
                      const billingAccountId = customer.billingAccountId ?? customer.profileId;
                      const accountNumber = customer.billingAccountId ?? customer.profileId;
                      return (
                        <label
                          key={customer.profileId}
                          className="control-center-enroll-option"
                          data-customer-search={`${customer.canonicalName} ${accountNumber} ${customer.overdueAmount} ${customer.openInvoiceCount}`.toLowerCase()}
                        >
                          <input
                            type="checkbox"
                            name="billingAccountIds"
                            value={billingAccountId}
                            className="control-center-enroll-option-checkbox"
                          />
                          <div className="control-center-enroll-option-copy">
                            <div className="control-center-enroll-option-title">
                              <strong>{customer.canonicalName}</strong>
                              <span className="workflow-stage-badge">{accountNumber}</span>
                            </div>
                            <p>
                              <span>Overdue: {customer.overdueAmount}</span>
                              <span>{customer.openInvoiceCount} open invoice{customer.openInvoiceCount === 1 ? "" : "s"}</span>
                            </p>
                          </div>
                        </label>
                      );
                    })}
                    {modalCustomers.length === 0 ? (
                      <div className="control-center-enrollment-empty">
                        <p>All available customers are already enrolled in this workflow.</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="control-center-modal-actions">
                    <a href={buildControlCenterHref({ tab: "workflows", workflow: selectedEnrollWorkflow.id })} className="ghost-button">Cancel</a>
                    <button type="submit" className="primary-button" disabled={modalCustomers.length === 0}>Enroll Customers</button>
                  </div>
                </form>
              </div>
            </div>
          );
        })()
      ) : null}

      {selectedStageWorkflow ? (
        <div className="control-center-modal-shell" role="dialog" aria-modal="true" aria-labelledby="add-stage-title">
          <a href={buildControlCenterHref({ tab: "workflows", workflow: selectedStageWorkflow.id })} className="control-center-modal-backdrop" aria-label="Close add stage" />
          <div className="control-center-modal control-center-stage-modal">
            <div className="control-center-modal-head">
              <div>
                <h2 id="add-stage-title">Add Stage</h2>
                <p>Create a new stage for your workflow</p>
              </div>
              <a href={buildControlCenterHref({ tab: "workflows", workflow: selectedStageWorkflow.id })} className="control-center-modal-close" aria-label="Close">
                ×
              </a>
            </div>

            <form method="post" action="/control-center/stages/create" className="control-center-modal-form">
              <input type="hidden" name="workflowId" value={selectedStageWorkflow.id} />
              <input type="hidden" name="outreachType" value={normalizedStageModalChannel} />
              <input type="hidden" name="triggerType" value="relative_due_date" />

              <div className="control-center-modal-block">
                <span className="control-center-field-label">Outreach Type</span>
                <div className="stage-channel-picker">
                  <a href={stageModalBaseHref("email")} className={`stage-channel-option${normalizedStageModalChannel === "email" ? " is-email" : ""}`}><span aria-hidden="true">✉</span> Email</a>
                  <a href={stageModalBaseHref("call")} className={`stage-channel-option${normalizedStageModalChannel === "call" ? " is-call" : ""}`}><span aria-hidden="true">⌕</span> Call</a>
                </div>
              </div>

              <div className="control-center-modal-block">
                <span className="control-center-field-label control-center-modal-section-label">When should this stage trigger?</span>
                <div className="control-center-trigger-builder" data-stage-trigger-builder>
                  <label className="control-center-trigger-number-wrap" data-stage-offset-wrap>
                    <input
                      type="number"
                      name="offsetDays"
                      min="0"
                      defaultValue={normalizedStageModalChannel === "call" ? "1" : "7"}
                      className="control-center-trigger-number-input"
                      data-stage-offset-input
                    />
                  </label>
                  <span className="control-center-trigger-days-copy" data-stage-offset-copy>days</span>
                  <label className="control-center-trigger-select-wrap">
                    <select
                      name="triggerComparator"
                      defaultValue="due_in_days"
                      className="control-center-trigger-select"
                      data-stage-trigger-comparator
                    >
                      <option value="due_in_days">Before due date</option>
                      <option value="due_today">On due date</option>
                      <option value="days_past_due">After due date</option>
                    </select>
                  </label>
                </div>
              </div>

              {normalizedStageModalChannel !== "call" ? (
                <div className="control-center-modal-block">
                  <span className="control-center-field-label">Template</span>
                  <div className="template-mode-picker">
                    <a href={templateModeHref("pre_saved_template")} className={`template-mode-option${stageModalTemplateMode === "pre_saved_template" ? " is-active" : ""}`}>Select Template</a>
                    <a href={templateModeHref("ai_generated")} className={`template-mode-option${stageModalTemplateMode === "ai_generated" ? " is-active" : ""}`}>AI Generate</a>
                  </div>
                  {stageModalTemplateMode === "pre_saved_template" ? (
                    <>
                      <select name="templateId" defaultValue="" data-stage-template-select className="control-center-stage-template-select">
                        <option value="">Choose a template</option>
                        {availableTemplates.map((template) => (
                          <option key={template.id} value={template.id}>{template.name}</option>
                        ))}
                      </select>
                      <input type="hidden" name="templateMode" value="pre_saved_template" />
                    </>
                  ) : (
                    <>
                      <input type="hidden" name="templateMode" value="ai_generated" />
                      <input type="hidden" name="aiStrategyId" value="strategy_email_default" />
                      <div className="control-center-ai-note">
                        Shared retrieval and policy logic will generate conservative {normalizedStageModalChannel.toUpperCase()} content using account, invoice, contact, and thread context.
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <input type="hidden" name="templateMode" value="ai_generated" />
                  <input type="hidden" name="aiStrategyId" value="strategy_voice_remittance" />
                </>
              )}

              <input
                type="hidden"
                name="notes"
                value={
                  normalizedStageModalChannel === "email"
                    ? "Email reminder stage"
                    : normalizedStageModalChannel === "call"
                      ? "Voice follow-up stage"
                      : "SMS reminder stage"
                }
              />

              <div className="control-center-modal-actions">
                <a href={buildControlCenterHref({ tab: "workflows", workflow: selectedStageWorkflow.id })} className="ghost-button">Cancel</a>
                <button
                  type="submit"
                  className="primary-button control-center-stage-submit"
                  data-stage-submit
                  disabled={stageModalTemplateMode === "pre_saved_template"}
                >
                  Add Stage
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
};

const styles = `
  :root {
    color-scheme: light;
    --navy: #0f172f;
    --navy-border: #1b2542;
    --app-bg: #f8fafc;
    --surface: #ffffff;
    --line: #e5e7eb;
    --text: #0f172a;
    --muted: #667085;
    --success: #0f9d67;
    --success-soft: #d9f7e7;
    --danger: #ff2f2f;
    --danger-soft: #ffe4e4;
    --warning: #f08a00;
    --warning-soft: #ffefc7;
    --info: #2563eb;
    --info-soft: #dbeafe;
    --violet: #9333ea;
    --violet-soft: #f3e8ff;
    --shadow: 0 8px 30px rgba(15, 23, 42, 0.04);
  }

  * { box-sizing: border-box; }
  body { margin: 0; background: var(--app-bg); color: var(--text); font-family: "IBM Plex Sans", "Segoe UI", sans-serif; }
  a { color: inherit; text-decoration: none; }
  button { font: inherit; }
  svg { width: 22px; height: 22px; flex: 0 0 auto; }

  .dashboard-app { min-height: 100vh; display: grid; grid-template-columns: 274px minmax(0, 1fr); }
  .dashboard-sidebar { background: #0f172a; color: #cbd5e1; border-right: 1px solid #172036; padding: 16px 12px; }
  .sidebar-brand { display: flex; align-items: center; gap: 12px; padding: 0 10px 18px; border-bottom: 1px solid #172036; }
  .brand-icon { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; background: #10b981; color: white; font-size: .96rem; font-weight: 700; }
  .brand-title, .brand-subtitle { margin: 0; }
  .brand-title { color: white; font-size: .92rem; font-weight: 700; }
  .brand-subtitle { color: #94a3b8; font-size: .76rem; margin-top: 1px; }
  .sidebar-divider { height: 22px; }
  .sidebar-section-heading { margin: 0 0 8px; padding: 0 12px; color: #94a3b8; font-size: .84rem; font-weight: 700; }
  .sidebar-nav { display: grid; gap: 6px; }
  .sidebar-link { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 12px; border-radius: 12px; color: #d0d7e4; font-size: .95rem; font-weight: 600; transition: background .18s ease, color .18s ease; }
  .sidebar-link:hover { background: #172036; color: white; }
  .sidebar-link.is-active { background: #059669; color: white; }

  .dashboard-main { min-width: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); }
  .topbar { height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 28px; background: white; border-bottom: 1px solid var(--line); }
  .topbar-date { margin: 0; color: var(--muted); font-size: .84rem; font-weight: 600; }
  .topbar-user { display: flex; align-items: center; gap: 14px; color: #475467; font-size: .92rem; font-weight: 600; }
  .user-badge { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: #d8f7e6; color: #0f8b62; font-weight: 700; font-size: .82rem; }

  .page-scroll { padding: 18px 28px 28px; display: grid; gap: 18px; }
  .page-section { display: grid; gap: 18px; }
  .page-header-row, .panel-header, .title-with-pills, .header-actions, .section-heading, .detail-footer, .detail-topline, .mini-card-top, .integration-header, .rule-header, .cash-review-header, .approval-request-header, .activity-feed-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .page-header, .page-header h1, .page-header p, .section-heading h2, .section-heading p, .section-source p, .meta-block span, .simple-kpi p, .simple-kpi span, .table-cell p, .reason-box p, .label-copy, .inline-meta, .detail-field dt, .detail-field dd, .activity-summary-body p, .timeline-copy p, .timeline-copy span, .email-preview p, .rule-main p, .kpi-footer { margin: 0; }
  .page-header { display: grid; gap: 8px; }
  .title-with-icon { display: flex; align-items: center; gap: 10px; }
  .page-header h1 { font-size: 2rem; line-height: 1.08; font-weight: 700; }
  .page-header p, .section-heading p, .section-source p, .table-cell p, .reason-box p, .label-copy, .inline-meta, .activity-summary-body p, .timeline-copy p, .timeline-copy span, .email-preview p, .rule-main p, .kpi-footer { color: var(--muted); line-height: 1.45; }
  .sparkle { color: var(--success); font-size: 1.2rem; }
  .page-header-actions { display: flex; align-items: center; }

  .invoice-ledger-page { gap: 14px; }
  .invoice-ledger-header,
  .invoice-ledger-toolbar,
  .invoice-ledger-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .invoice-ledger-title { display: grid; gap: 4px; }
  .invoice-ledger-title h1,
  .invoice-ledger-title p { margin: 0; }
  .invoice-ledger-title h1 { font-size: 1.92rem; line-height: 1.05; color: #111827; }
  .invoice-ledger-title p { color: #667085; font-size: .82rem; }
  .invoice-ledger-button {
    min-height: 32px;
    border-radius: 8px;
    border: 1px solid #d8dee6;
    background: white;
    color: #111827;
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
    cursor: pointer;
    font-size: .78rem;
  }
  .invoice-ledger-button svg { width: 14px; height: 14px; }
  .invoice-ledger-button-filter { white-space: nowrap; }
  .invoice-ledger-toolbar {
    background: white;
    border: 1px solid #dfe5ec;
    border-radius: 12px;
    padding: 8px 10px;
  }
  .invoice-ledger-search {
    flex: 1;
    min-height: 32px;
    border-radius: 8px;
    background: #f4f6f9;
    color: #98a2b3;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 11px;
  }
  .invoice-ledger-search svg { width: 14px; height: 14px; }
  .invoice-ledger-search input {
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: #344054;
    font: inherit;
    font-size: .77rem;
  }
  .invoice-ledger-search input::placeholder { color: #98a2b3; }
  .invoice-ledger-select {
    min-width: 118px;
    min-height: 32px;
    border-radius: 8px;
    border: 1px solid #eef1f4;
    background: #f7f8fb;
    color: #344054;
    padding: 0 30px 0 11px;
    font: inherit;
    font-size: .76rem;
  }
  .invoice-ledger-card {
    background: white;
    border: 1px solid #dfe5ec;
    border-radius: 14px;
    overflow: hidden;
  }
  .invoice-ledger-table {
    display: grid;
    grid-template-columns: 44px 1.4fr 2.2fr 1.1fr 1.1fr .95fr 1.2fr 1.2fr;
  }
  .invoice-ledger-table-header {
    min-height: 40px;
    background: #fcfcfd;
    border-bottom: 1px solid #e9edf2;
  }
  .invoice-ledger-head,
  .invoice-ledger-cell {
    padding: 0 15px;
    display: flex;
    align-items: center;
    min-height: 39px;
    font-size: .82rem;
  }
  .invoice-ledger-head {
    color: #667085;
    font-size: .63rem;
    font-weight: 700;
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .invoice-ledger-head-checkbox,
  .invoice-ledger-cell-checkbox { justify-content: center; }
  .invoice-ledger-row {
    position: relative;
    border-bottom: 1px solid #eef2f6;
    background: white;
  }
  .invoice-ledger-row:hover { background: #fbfcfe; }
  .invoice-ledger-row:last-of-type { border-bottom: 1px solid #eef2f6; }
  .invoice-ledger-empty {
    display: grid;
    gap: 6px;
    padding: 26px 18px;
    border-bottom: 1px solid #eef2f6;
    color: #667085;
  }
  .invoice-ledger-empty strong { color: #344054; }
  .invoice-ledger-head input,
  .invoice-ledger-cell input {
    width: 13px;
    height: 13px;
    margin: 0;
    accent-color: #2563eb;
  }
  .invoice-ledger-link,
  .invoice-ledger-customer-link {
    color: #2954ff;
    font-weight: 600;
  }
  .invoice-ledger-link { font-size: .8rem; }
  .invoice-ledger-customer-link { font-size: .8rem; }
  .invoice-ledger-customer-cell {
    position: relative;
    overflow: visible;
  }
  .invoice-ledger-status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 20px;
    padding: 0 8px;
    border-radius: 999px;
    border: 1px solid transparent;
    font-size: .66rem;
    white-space: nowrap;
  }
  .invoice-ledger-status.is-open {
    background: #f2f4f7;
    border-color: #e4e7ec;
    color: #475467;
  }
  .invoice-ledger-status.is-partial {
    background: #dbeafe;
    border-color: #bfdbfe;
    color: #2563eb;
  }
  .invoice-ledger-status.is-overdue {
    background: #ffe4e4;
    border-color: #ffc9c9;
    color: #e11d48;
  }
  .invoice-ledger-status.is-paid {
    background: #d8f7e6;
    border-color: #b7ebd0;
    color: #0f8b62;
  }
  .invoice-customer-popover {
    position: absolute;
    top: calc(100% - 2px);
    left: 0;
    z-index: 8;
    width: 174px;
    padding: 10px 0 12px;
    border-radius: 10px;
    border: 1px solid #dfe5ec;
    background: white;
    box-shadow: 0 12px 24px rgba(16, 24, 40, 0.12);
    opacity: 0;
    pointer-events: none;
    transform: translateY(8px);
    transition: opacity .16s ease, transform .16s ease;
  }
  .invoice-ledger-customer-cell:hover .invoice-customer-popover,
  .invoice-ledger-customer-cell:focus-within .invoice-customer-popover {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }
  .invoice-customer-popover-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px 10px;
    border-bottom: 1px solid #edf1f5;
    font-size: .82rem;
    color: #111827;
  }
  .invoice-customer-popover-icon {
    width: 12px;
    height: 12px;
    color: #98a2b3;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .invoice-customer-popover-icon svg { width: 12px; height: 12px; }
  .invoice-customer-popover-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px 8px;
    padding: 10px 12px 12px;
    font-size: .72rem;
  }
  .invoice-customer-popover-grid span { color: #667085; }
  .invoice-customer-popover-grid strong {
    color: #111827;
    font-weight: 500;
    text-align: right;
  }
  .invoice-customer-popover-segment {
    color: #2954ff;
    font-weight: 500;
    text-align: right;
  }
  .invoice-customer-popover-action {
    display: inline-flex;
    align-items: center;
    padding: 0 12px;
    color: #2954ff;
    font-size: .77rem;
    font-weight: 600;
  }
  .invoice-customer-popover-action::after { content: "→"; margin-left: 4px; }
  .invoice-ledger-summary {
    align-items: stretch;
    border-top: 1px solid #eef2f6;
    background: #fbfcfe;
    padding: 10px 15px 12px;
  }
  .invoice-ledger-summary-block {
    flex: 1;
    display: grid;
    gap: 3px;
  }
  .invoice-ledger-summary-block span {
    color: #667085;
    font-size: .63rem;
  }
  .invoice-ledger-summary-block strong {
    color: #111827;
    font-size: 1.18rem;
    line-height: 1.1;
    font-weight: 600;
  }
  .invoice-ledger-summary-block strong.is-danger { color: #e11d48; }
  .invoice-ledger-pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    border-top: 1px solid #eef2f6;
    color: #667085;
    font-size: .82rem;
  }
  .invoice-ledger-pagination > div {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .invoice-ledger-page-link {
    color: #111827;
    font-weight: 700;
    text-decoration: none;
  }
  .invoice-ledger-page-link.is-disabled {
    color: #98a2b3;
    pointer-events: none;
  }

  .invoice-detail-page { gap: 14px; }
  .invoice-detail-header,
  .invoice-detail-title,
  .invoice-detail-actions,
  .invoice-detail-activity-row { display: flex; align-items: center; gap: 8px; }
  .invoice-detail-header { justify-content: space-between; }
  .invoice-detail-title h1 { margin: 0; font-size: 1.9rem; line-height: 1.05; color: #111827; }
  .invoice-detail-status {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding: 0 8px;
    border-radius: 999px;
    border: 1px solid #e4e7ec;
    background: #f2f4f7;
    color: #475467;
    font-size: .66rem;
    white-space: nowrap;
  }
  .invoice-detail-status.is-partial { background: #dbeafe; border-color: #bfdbfe; color: #2563eb; }
  .invoice-detail-status.is-overdue { background: #ffe4e4; border-color: #ffc9c9; color: #e11d48; }
  .invoice-detail-status.is-paid { background: #d8f7e6; border-color: #b7ebd0; color: #0f8b62; }
  .invoice-detail-actions { flex-wrap: wrap; justify-content: flex-end; }
  .invoice-detail-action-button,
  .invoice-detail-icon-button {
    min-height: 30px;
    border-radius: 8px;
    border: 1px solid #d8dee6;
    background: white;
    color: #111827;
    padding: 0 10px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: .78rem;
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
    cursor: pointer;
  }
  .invoice-detail-action-button svg,
  .invoice-detail-icon-button svg { width: 14px; height: 14px; }
  .invoice-detail-icon-button { width: 30px; justify-content: center; padding: 0; }
  .invoice-detail-kebab { font-size: 1rem; line-height: 1; }
  .invoice-detail-top-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 216px;
    gap: 14px;
    align-items: start;
  }
  .invoice-detail-card {
    background: white;
    border: 1px solid #dfe5ec;
    border-radius: 14px;
    padding: 16px 16px 17px;
    box-shadow: 0 2px 6px rgba(16, 24, 40, 0.03);
  }
  .invoice-detail-card h2 {
    margin: 0 0 16px;
    color: #111827;
    font-size: .96rem;
  }
  .invoice-detail-definition-list {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px 18px;
    align-items: center;
    min-height: 126px;
  }
  .invoice-detail-definition-list span,
  .invoice-detail-side-block span,
  .invoice-detail-empty,
  .invoice-detail-activity-date { color: #667085; }
  .invoice-detail-definition-list span,
  .invoice-detail-side-block span {
    font-size: .68rem;
  }
  .invoice-detail-definition-list strong {
    text-align: right;
    font-size: .82rem;
    font-weight: 500;
    color: #111827;
  }
  .invoice-detail-promise {
    display: grid;
    gap: 2px;
    justify-items: end;
  }
  .invoice-detail-promise span {
    font-size: .72rem;
    color: #667085;
  }
  .invoice-detail-inline-link {
    color: #2954ff;
    font-size: .8rem;
    font-weight: 500;
    justify-self: end;
  }
  .invoice-detail-customer-card { min-height: 154px; }
  .invoice-detail-side-block { display: grid; gap: 5px; }
  .invoice-detail-side-block + .invoice-detail-side-block { margin-top: 14px; }
  .invoice-detail-side-block p {
    margin: 0;
    color: #111827;
    font-size: .8rem;
    line-height: 1.5;
  }
  .invoice-detail-line-table {
    display: grid;
    grid-template-columns: minmax(0, 1.8fr) 120px 180px 180px;
  }
  .invoice-detail-line-table-header {
    border-bottom: 1px solid #e9edf2;
    padding-bottom: 9px;
  }
  .invoice-detail-line-table-header > div {
    color: #667085;
    font-size: .62rem;
    text-transform: uppercase;
    letter-spacing: .04em;
    font-weight: 700;
  }
  .invoice-detail-line-row {
    padding-top: 9px;
    color: #111827;
    font-size: .8rem;
  }
  .invoice-detail-line-row > div,
  .invoice-detail-line-table-header > div { padding-right: 14px; }
  .invoice-detail-line-row > div:nth-child(3),
  .invoice-detail-line-row > div:nth-child(4),
  .invoice-detail-line-table-header > div:nth-child(3),
  .invoice-detail-line-table-header > div:nth-child(4) { text-align: right; }
  .invoice-detail-empty {
    margin: 0;
    font-size: .78rem;
    min-height: 46px;
    display: flex;
    align-items: center;
  }
  .invoice-detail-activity-list { display: grid; gap: 8px; }
  .invoice-detail-activity-row {
    display: grid;
    grid-template-columns: 20px auto minmax(0, 1fr) auto auto;
    gap: 9px;
    align-items: center;
    font-size: .74rem;
  }
  .invoice-detail-activity-icon {
    width: 20px;
    height: 20px;
    border-radius: 999px;
    display: grid;
    place-items: center;
  }
  .invoice-detail-activity-icon svg { width: 10px; height: 10px; }
  .invoice-detail-activity-icon.is-mail { background: #dbeafe; color: #2563eb; }
  .invoice-detail-activity-icon.is-phone { background: #f3e8ff; color: #9333ea; }
  .invoice-detail-activity-pill {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding: 0 8px;
    border-radius: 999px;
    border: 1px solid #e4e7ec;
    background: #f8fafc;
    color: #475467;
    font-size: .64rem;
    white-space: nowrap;
  }
  .invoice-detail-activity-channel,
  .invoice-detail-activity-reference { color: #111827; }
  .invoice-detail-activity-reference { justify-self: end; }
  .invoice-detail-activity-date { justify-self: end; white-space: nowrap; }

  .header-actions { flex-wrap: wrap; justify-content: flex-end; }
  .ghost-button, .ghost-select, .primary-button, .tab-pill, .row-button-group button, .resolve-button, .text-button {
    border-radius: 12px; padding: 10px 14px; border: 1px solid var(--line); background: white; cursor: pointer;
  }
  .ghost-select { background: #f3f5f8; min-width: 180px; }
  .primary-button { background: #0e9f6e; color: white; border-color: #0e9f6e; font-weight: 600; }
  .text-button { border: 0; background: transparent; padding: 0; color: #344054; }

  .kpi-grid { display: grid; gap: 18px; }
  .kpi-grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .kpi-grid-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .kpi-grid-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .kpi-card, .panel, .data-card, .detail-card, .simple-kpi, .reason-box, .match-card, .type-chip, .state-notice { background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow); }
  .kpi-card, .simple-kpi { min-height: 160px; padding: 18px 18px; border-radius: 18px; display: grid; align-content: start; gap: 14px; }
  .simple-kpi strong { font-size: 1.1rem; line-height: 1.2; }
  .simple-kpi span { color: var(--muted); font-size: .9rem; }
  .kpi-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .kpi-card-top p, .simple-kpi p, .mini-card-top p { color: #667085; font-size: .95rem; line-height: 1.3; }
  .metric-icon { width: 48px; height: 48px; border-radius: 999px; display: grid; place-items: center; }
  .metric-success { background: var(--success-soft); color: var(--success); }
  .metric-danger { background: var(--danger-soft); color: var(--danger); }
  .metric-warning { background: var(--warning-soft); color: var(--warning); }
  .metric-info { background: var(--info-soft); color: var(--info); }
  .metric-violet { background: var(--violet-soft); color: var(--violet); }
  .kpi-value { font-size: 2rem; font-weight: 700; line-height: 1.05; }
  .tone-success { color: var(--success); } .tone-danger { color: var(--danger); } .tone-warning { color: var(--warning); } .tone-info { color: var(--info); } .tone-violet { color: var(--violet); }
  .kpi-action { font-weight: 600; }

  .hero-lower-grid { display: grid; grid-template-columns: minmax(340px, .95fr) minmax(0, 1.95fr); gap: 18px; }
  .panel, .data-card, .detail-card { border-radius: 18px; }
  .panel, .detail-card { padding: 22px; }
  .pill { display: inline-flex; align-items: center; justify-content: center; padding: 5px 10px; border-radius: 999px; font-size: .82rem; font-weight: 600; white-space: nowrap; }
  .pill-success { background: var(--success-soft); color: var(--success); }
  .pill-danger { background: var(--danger-soft); color: var(--danger); }
  .pill-warning { background: var(--warning-soft); color: var(--warning); }
  .pill-info { background: var(--info-soft); color: var(--info); }
  .pill-violet { background: var(--violet-soft); color: var(--violet); }
  .pill-neutral { background: #f2f4f7; color: #475467; }
  .pill-task-neutral { background: #f2f4f7; color: #475467; border: 1px solid #d0d5dd; }
  .pill-task-info { background: #dbeafe; color: #2563eb; border: 1px solid #bfdbfe; }
  .pill-task-warning { background: #ffefc7; color: #c2410c; border: 1px solid #fbd38d; }
  .pill-task-danger { background: #ffe4e4; color: #dc2626; border: 1px solid #fecaca; }
  .pill-task-low { background: #f2f4f7; color: #667085; border: 1px solid #d0d5dd; }

  .exception-list, .activity-list { display: grid; gap: 0; }
  .exception-row, .activity-summary-row, .timeline-row { border-bottom: 1px solid #eef2f6; }
  .exception-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 0; }
  .exception-label { display: flex; align-items: center; gap: 12px; font-size: .98rem; color: #475467; }
  .exception-icon { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; border: 2px solid #ff4d4f; color: #ff4d4f; font-weight: 700; font-size: .8rem; }
  .activity-title { display: flex; align-items: center; gap: 10px; }
  .activity-link { color: var(--success); font-weight: 600; }
  .activity-summary-row { display: grid; grid-template-columns: 12px minmax(0,1fr) auto; gap: 16px; padding: 16px 0; align-items: start; }
  .activity-dot, .timeline-marker, .state-notice-dot { width: 10px; height: 10px; border-radius: 50%; background: #10b981; margin-top: 7px; }
  .activity-summary-body, .timeline-copy { display: grid; gap: 6px; }
  .activity-summary-time, .timeline-time { color: #98a2b3; font-size: .9rem; white-space: nowrap; }

  .filter-row, .tab-pills, .detail-grid, .card-grid, .cash-meta-grid, .endpoints-grid, .type-chip-grid, .two-column-layout, .stacked-list { display: grid; gap: 14px; }
  .filter-row { grid-template-columns: minmax(0, 1.7fr) repeat(3, minmax(180px, .8fr)); align-items: center; }
  .filter-row-tight { grid-template-columns: minmax(0, 1fr) auto; }
  .search-box { min-height: 54px; display: flex; align-items: center; padding: 0 16px; border-radius: 12px; background: #f3f5f8; color: #98a2b3; border: 1px solid #eef2f6; }
  .users-admin-page,
  .users-admin-page * { font-weight: 400; }
  .users-admin-page { gap: 28px; padding-top: 8px; }
  .users-admin-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
  .users-admin-title-block { display: grid; gap: 8px; }
  .users-admin-title-block h1, .users-admin-title-block p { margin: 0; }
  .users-admin-title-block h1 { font-size: 2.15rem; line-height: 1.03; letter-spacing: -.03em; }
  .users-admin-title-block p { color: #667085; font-size: 1.02rem; }
  .users-admin-invite-button {
    min-height: 43px;
    padding: 0 17px;
    border-radius: 11px;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: #0e9f6e;
    color: white;
    border: 1px solid #0e9f6e;
  }
  .users-admin-invite-button svg { width: 16px; height: 16px; }
  .users-admin-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
  .users-admin-stat-card {
    min-height: 106px;
    border-radius: 18px;
    background: white;
    border: 1px solid #e5e7eb;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.03);
    padding: 20px 20px;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .users-admin-stat-icon {
    width: 46px;
    height: 46px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
  }
  .users-admin-stat-icon svg { width: 19px; height: 19px; }
  .users-admin-stat-icon-neutral { background: #f3f4f6; color: #6b7280; }
  .users-admin-stat-icon-success { background: #dcfce7; color: #10b981; }
  .users-admin-stat-icon-info { background: #dbeafe; color: #2563eb; }
  .users-admin-stat-copy { display: grid; gap: 8px; }
  .users-admin-stat-copy span { color: #667085; font-size: .98rem; }
  .users-admin-stat-copy strong { font-size: 2.1rem; line-height: .95; color: #111827; font-weight: 400; }
  .users-admin-stat-success { color: #0e9f6e; }
  .users-admin-stat-info { color: #2563eb; }
  .users-admin-toolbar-card {
    border-radius: 20px;
    background: white;
    border: 1px solid #e5e7eb;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.03);
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .users-admin-searchbox {
    min-height: 42px;
    flex: 1;
    border-radius: 10px;
    background: #f4f5f8;
    border: 1px solid #eef1f4;
    color: #98a2b3;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    font-size: .98rem;
  }
  .users-admin-searchbox svg { width: 17px; height: 17px; }
  .users-admin-filters { display: flex; align-items: center; gap: 12px; }
  .users-admin-filter {
    min-width: 182px;
    min-height: 42px;
    border-radius: 10px;
    border: 1px solid #eef1f4;
    background: #f4f5f8;
    color: #344054;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 14px;
    font-size: .98rem;
  }
  .users-admin-filter::after { content: "⌄"; color: #98a2b3; font-size: .95rem; }
  .users-admin-table-card {
    border-radius: 20px;
    background: white;
    border: 1px solid #e5e7eb;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.03);
    overflow: hidden;
  }
  .users-admin-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .users-admin-col-user { width: 20%; }
  .users-admin-col-role { width: 14%; }
  .users-admin-col-scope { width: 27%; }
  .users-admin-col-status { width: 12%; }
  .users-admin-col-last-active { width: 11%; }
  .users-admin-col-actions { width: 6%; }
  .users-admin-table-head th {
    height: 48px;
    padding: 0 26px;
    background: #fcfcfd;
    border-bottom: 1px solid #e9edf2;
    color: #667085;
    font-size: .76rem;
    letter-spacing: .03em;
    text-transform: uppercase;
    text-align: left;
    white-space: nowrap;
  }
  .users-admin-table-row td {
    padding: 18px 26px;
    border-bottom: 1px solid #eef2f6;
    vertical-align: middle;
  }
  .users-admin-table-row:last-child td { border-bottom: 0; }
  .users-admin-user-cell { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .users-admin-avatar {
    width: 38px;
    height: 38px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: #d8f7e6;
    color: #0f8b62;
    font-size: .92rem;
    flex: 0 0 auto;
  }
  .users-admin-user-copy { display: grid; gap: 4px; min-width: 0; }
  .users-admin-user-name {
    color: #111827;
    font-size: .98rem;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .users-admin-user-email {
    color: #667085;
    font-size: .88rem;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .users-admin-role-pill,
  .users-admin-scope-pill,
  .users-admin-status-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 26px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid transparent;
    font-size: .81rem;
    white-space: nowrap;
  }
  .users-admin-role-pill.is-finance { background: #dbeafe; color: #2563eb; border-color: #bfdbfe; }
  .users-admin-role-pill.is-ar { background: #d8f7e6; color: #0f8b62; border-color: #b7ebd0; }
  .users-admin-role-pill.is-collections { background: #ffefc7; color: #c96a00; border-color: #f7d88a; }
  .users-admin-role-pill.is-commercial { background: #f3e8ff; color: #9333ea; border-color: #e9d5ff; }
  .users-admin-role-pill.is-admin,
  .users-admin-role-pill.is-neutral { background: #f3f4f6; color: #475467; border-color: #e5e7eb; }
  .users-admin-scope-cell { display: flex; flex-wrap: wrap; gap: 6px; }
  .users-admin-scope-pill { background: #f8fafc; color: #475467; border-color: #dfe6ee; }
  .users-admin-approval-cell {
    color: #344054;
    font-size: .96rem;
    white-space: nowrap;
  }
  .users-admin-approval-cell.is-muted { color: #98a2b3; }
  .users-admin-status-pill.is-active { background: #d8f7e6; color: #0f8b62; border-color: #b7ebd0; }
  .users-admin-status-pill.is-invited { background: #dbeafe; color: #2563eb; border-color: #bfdbfe; }
  .users-admin-status-pill.is-inactive { background: #f3f4f6; color: #667085; border-color: #e5e7eb; }
  .users-admin-last-active {
    color: #667085;
    font-size: .96rem;
    white-space: nowrap;
  }
  .users-admin-last-active.is-muted { color: #98a2b3; }
  .users-admin-actions-cell {
    color: #111827;
    font-size: 1.2rem;
    text-align: center;
    white-space: nowrap;
  }
  .users-admin-footnote { color: #667085; font-size: .88rem; padding-left: 4px; }
  .users-admin-invite-modal {
    position: fixed;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 28px 20px;
    z-index: 50;
  }
  .users-admin-invite-modal:target { display: flex; }
  .users-admin-invite-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(17, 24, 39, .44);
  }
  .users-admin-invite-panel {
    position: relative;
    width: min(610px, calc(100vw - 40px));
    border-radius: 18px;
    background: #ffffff;
    border: 1px solid #d9e0ea;
    box-shadow: 0 24px 60px rgba(15, 23, 42, .18);
    padding: 26px 28px 28px;
  }
  .users-admin-invite-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .users-admin-invite-title-block { display: grid; gap: 8px; }
  .users-admin-invite-title-block h2,
  .users-admin-invite-title-block p { margin: 0; }
  .users-admin-invite-title-block h2 { font-size: 1.05rem; color: #111827; }
  .users-admin-invite-title-block p { font-size: .98rem; color: #667085; }
  .users-admin-invite-close {
    color: #667085;
    text-decoration: none;
    font-size: 2rem;
    line-height: .85;
    padding: 0 4px;
  }
  .users-admin-invite-form {
    display: grid;
    gap: 20px;
    margin-top: 34px;
  }
  .users-admin-invite-field {
    display: grid;
    gap: 10px;
  }
  .users-admin-invite-field span {
    color: #344054;
    font-size: .96rem;
  }
  .users-admin-invite-field input,
  .users-admin-invite-field select {
    width: 100%;
    box-sizing: border-box;
    min-height: 46px;
    padding: 0 16px;
    border-radius: 12px;
    border: 1px solid #eceff3;
    background: #f6f7fb;
    color: #475467;
    font: inherit;
    outline: none;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
  }
  .users-admin-invite-field input::placeholder { color: #98a2b3; }
  .users-admin-invite-field select {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14' fill='none'%3E%3Cpath d='M3 5.25L7 9.25L11 5.25' stroke='%2398A2B3' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 16px center;
    padding-right: 44px;
  }
  .users-admin-invite-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    padding-top: 2px;
  }
  .users-admin-invite-cancel,
  .users-admin-invite-submit {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 12px;
    font: inherit;
  }
  .users-admin-invite-cancel {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #e4e7ec;
    background: #ffffff;
    color: #111827;
    text-decoration: none;
  }
  .users-admin-invite-submit {
    border: 1px solid #0e9f6e;
    background: #0e9f6e;
    color: #ffffff;
  }
  .tab-pills { grid-auto-flow: column; grid-auto-columns: max-content; justify-content: start; overflow: auto; }
  .tab-pill { background: #f3f5f8; }
  .tab-pill.is-active { background: white; font-weight: 700; }
  .tab-pill-indicator { width: 8px; height: 8px; border-radius: 50%; background: var(--warning); margin-left: 8px; display: inline-block; }
  .segmented-control { display: flex; flex-wrap: wrap; gap: 10px; }
  .segment-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 999px;
    background: #f3f5f8;
    color: #475467;
    font-size: .84rem;
    font-weight: 600;
  }
  .segment-pill.is-active { background: #eef5ff; color: var(--info); }
  .data-card { overflow: hidden; }
  .table { display: grid; }
  .table-collections-extended { grid-template-columns: 52px 1.15fr 1fr .7fr .7fr .8fr .8fr 1.3fr .5fr 44px; }
  .table-invoices { grid-template-columns: .85fr .95fr 1.1fr 1.05fr .75fr .85fr .75fr .75fr; }
  .table-exceptions { grid-template-columns: 1.15fr 1.1fr .8fr .8fr .7fr .7fr .9fr 1.5fr; }
  .table-inventory { grid-template-columns: 1fr 1.2fr .75fr; }
  .table-head, .table-cell { padding: 16px 18px; border-bottom: 1px solid var(--line); }
  .table-head { background: #fbfcfe; color: #667085; font-size: .8rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .table-cell { display: grid; align-content: start; gap: 8px; min-height: 92px; }
  .checkbox-head, .more-head { min-height: 0; }
  .fake-checkbox { width: 18px; height: 18px; border: 1px solid #d0d5dd; border-radius: 6px; }
  .more-dot { color: #667085; font-size: 1.2rem; }
  .row-button-group { display: flex; flex-wrap: wrap; gap: 8px; }
  .row-button-group button, .resolve-button { background: white; }

  .card-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .card-grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .four-up { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .two-column-layout { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
  .stacked-item, .stacked-item-card { display: grid; gap: 12px; }
  .stacked-item { grid-template-columns: minmax(0, 1fr) auto; align-items: start; }
  .mini-card { padding: 20px; border-radius: 18px; display: grid; gap: 14px; background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow); }
  .mini-card h3, .panel h2, .detail-card h2 { margin: 0; font-size: 1.35rem; line-height: 1.15; }

  .meta-block { display: grid; gap: 4px; }
  .meta-block strong, .table-cell strong, .detail-field dd, .activity-summary-body strong, .timeline-copy strong { color: var(--text); }
  .cash-meta-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .cash-subheading { color: var(--text); font-weight: 700; font-size: 1.05rem; }
  .match-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px; border-radius: 14px; background: #eef5ff; border-color: #bfd7ff; }
  .cash-workspace-grid { display: grid; grid-template-columns: minmax(300px, .95fr) minmax(420px, 1.4fr) minmax(300px, .95fr); gap: 18px; align-items: start; }
  .cash-queue-panel, .cash-allocation-panel, .cash-context-panel { display: grid; gap: 18px; }
  .cash-review-table { display: grid; grid-template-columns: .95fr 1.1fr .8fr .9fr .75fr 1.15fr; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
  .is-active-row { background: #f8fbff; }
  .allocation-list, .context-list, .residual-options { display: grid; gap: 12px; }
  .allocation-card { background: #f8fbff; }
  .residual-grid, .finalize-grid { display: grid; grid-template-columns: minmax(180px, .7fr) minmax(0, 1fr); gap: 14px; }
  .residual-summary-card, .finalize-card, .writeback-card, .residual-option, .context-item { border: 1px solid #e5e7eb; border-radius: 14px; background: #fbfcfe; padding: 16px; display: grid; gap: 8px; }
  .residual-option.is-active { border-color: #bfd7ff; background: #eef5ff; }
  .context-item strong, .residual-summary-card strong, .finalize-card strong, .writeback-card strong { font-size: .96rem; }
  .context-item p, .residual-summary-card p, .finalize-card p, .writeback-card p, .residual-option p { margin: 0; color: var(--muted); line-height: 1.45; }
  .eyebrow { color: #98a2b3; font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; font-weight: 700; }
  .detail-footer { align-items: center; flex-wrap: wrap; }
  .reason-box { border-radius: 14px; padding: 16px; background: #eef5ff; border: 1px solid #bfd7ff; }
  .integration-error-banner { display: grid; gap: 6px; padding: 14px 16px; border-radius: 14px; background: #fff4e5; border: 1px solid #f5c47b; color: #7a2e0b; }
  .integration-success-banner { display: grid; gap: 6px; padding: 14px 16px; border-radius: 14px; background: #ecfdf3; border: 1px solid #8ad5ad; color: #14532d; }
  .label-copy { font-size: .85rem; color: #667085; }
  .email-preview { border: 1px solid #e9edf5; border-radius: 14px; padding: 14px; background: #fbfcfe; display: grid; gap: 10px; }
  .email-preview-head { display: flex; align-items: center; justify-content: space-between; }

  .cash-page { gap: 14px; }
  .cash-module-shell { background: transparent; display: grid; gap: 14px; align-content: start; }
  .cash-module-header {
    background: white;
    border: 1px solid #eef2f6;
    padding: 18px 22px 16px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 14px;
    width: 100%;
    min-height: 110px;
    align-self: start;
    box-shadow: none;
  }
  .cash-module-header h1 { margin: 0; font-size: 1.15rem; line-height: 1.1; font-weight: 700; }
  .cash-module-tabs { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
  .cash-module-tab {
    display: inline-flex;
    align-items: center;
    min-height: 36px;
    padding: 0 0;
    border: 1px solid transparent;
    border-radius: 0;
    color: #111827;
    font-size: .86rem;
    font-weight: 600;
  }
  .cash-module-tab.is-active {
    padding: 0 6px;
    border-color: #111827;
    border-radius: 0;
    background: white;
    box-shadow: none;
  }
  .cash-overview-stack, .cash-tab-section { display: grid; gap: 12px; }
  .cash-overview-panels, .cash-overview-summary { display: grid; gap: 14px; }
  .cash-summary-card, .cash-highlight-card, .cash-note-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 76px;
    padding: 12px 20px;
    background: white;
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: none;
  }
  .cash-summary-main, .cash-highlight-main { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .cash-summary-copy, .cash-highlight-main div { display: grid; gap: 4px; }
  .cash-summary-main p, .cash-highlight-main p, .cash-note-card p { margin: 0; color: #475467; font-size: .8rem; line-height: 1.35; }
  .cash-summary-metric { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .cash-summary-main strong { color: var(--success); font-size: 1.05rem; line-height: 1; }
  .cash-summary-metric span { color: #475467; font-size: .82rem; font-weight: 500; }
  .cash-summary-icon, .cash-highlight-icon {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    color: #94a3b8;
    flex: 0 0 auto;
  }
  .cash-summary-icon.currency { font-size: 1.15rem; line-height: 1; color: #98a2b3; }
  .cash-summary-icon.invoice svg, .cash-highlight-icon svg { width: 16px; height: 16px; color: #2563eb; }
  .cash-highlight-main strong, .cash-note-card strong { font-size: .98rem; line-height: 1.1; }
  .cash-highlight-count { color: #2563eb; font-weight: 700; }
  .cash-weekly-label { color: #344054; font-size: .82rem; font-weight: 600; margin-top: 8px; }
  .cash-action-button, .cash-dark-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 34px;
    padding: 0 14px;
    border-radius: 10px;
    background: #111827;
    color: white;
    border: 1px solid #111827;
    font-weight: 600;
    font-size: .82rem;
    white-space: nowrap;
  }
  .cash-inline-link { color: #1d4ed8; font-weight: 600; font-size: .82rem; }
  .cash-toolbar, .cash-toolbar-main, .cash-toolbar-actions { display: flex; align-items: center; gap: 10px; }
  .cash-toolbar { justify-content: space-between; flex-wrap: wrap; }
  .cash-toolbar-main { flex: 1; flex-wrap: wrap; }
  .cash-search, .cash-filter {
    min-height: 28px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid #dbe1e8;
    background: #f8fafc;
    color: #475467;
    display: inline-flex;
    align-items: center;
    font-size: .78rem;
  }
  .cash-search { min-width: 340px; color: #98a2b3; }
  .cash-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 22px;
    padding: 0 8px;
    border-radius: 9px;
    font-size: .72rem;
    font-weight: 600;
    border: 1px solid transparent;
    white-space: nowrap;
  }
  .cash-badge.needs-review { background: #f3e8ff; color: #8b5cf6; border-color: #e9d5ff; }
  .cash-badge.approved { background: #ecfdf3; color: #039855; border-color: #a6f4c5; }
  .cash-badge.neutral { background: #f8fafc; color: #475467; border-color: #d0d5dd; }
  .cash-table-card { background: white; border: 1px solid #dfe5ec; border-radius: 16px; overflow: hidden; }
  .cash-table { display: grid; }
  .cash-table-payments { grid-template-columns: 1fr 1.5fr 1.1fr .9fr .9fr .9fr .95fr 1fr; }
  .cash-table-bank { grid-template-columns: 1fr .9fr 1.1fr .95fr 2fr .95fr 1fr; }
  .cash-table-remittances { grid-template-columns: 1fr .9fr 1.3fr .9fr 1.9fr 1fr; }
  .cash-table-head, .cash-table-cell {
    padding: 12px 18px;
    border-bottom: 1px solid #e9edf2;
    min-height: 44px;
    display: flex;
    align-items: center;
    color: #344054;
  }
  .cash-table-head { color: #667085; font-size: .72rem; font-weight: 600; background: #fbfcfd; }
  .cash-table-cell { font-size: .82rem; }
  .cash-table-cell.amount, .cash-table-head.amount { justify-content: flex-start; }
  .cash-table-cell.center { justify-content: center; }
  .cash-table-cell.is-positive { color: var(--success); font-weight: 700; }
  .cash-table-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 18px;
    color: #475467;
    font-size: .82rem;
  }
  .cash-pagination { display: flex; align-items: center; gap: 4px; }
  .cash-pagination button {
    width: 28px;
    height: 28px;
    border: 0;
    background: transparent;
    color: #111827;
    font-size: 1.1rem;
    cursor: pointer;
  }

  .type-chip-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .type-chip { min-height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 14px; border-radius: 12px; background: #fbfcfe; }
  .approval-request-header, .activity-feed-header { align-items: center; }
  .approval-icon, .activity-feed-icon, .integration-app-icon, .rule-icon { width: 48px; height: 48px; border-radius: 12px; display: grid; place-items: center; background: #f3e8ff; font-size: 1.3rem; }
  .approval-request-main, .activity-feed-main { display: grid; gap: 10px; flex: 1; }
  .approval-body { display: grid; gap: 16px; }
  .integration-main, .rule-main { display: flex; align-items: flex-start; gap: 16px; }
  .inline-meta { display: flex; flex-wrap: wrap; gap: 18px; color: var(--muted); }
  .endpoints-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .endpoint-row { min-height: 46px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 14px; border-radius: 12px; background: #fbfcfe; }
  .rule-header { align-items: center; }
  .toggle-pill { width: 34px; height: 20px; border-radius: 999px; background: #111827; position: relative; }
  .toggle-pill::after { content: ""; position: absolute; top: 2px; right: 2px; width: 16px; height: 16px; border-radius: 50%; background: white; }

  .detail-grid { margin: 0; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .detail-field { border: 1px solid #eef2f7; border-radius: 14px; padding: 14px 16px; background: #fbfcfe; }
  .detail-field dt { font-size: .78rem; text-transform: uppercase; letter-spacing: .05em; }
  .detail-field dd { font-size: .98rem; font-weight: 600; line-height: 1.4; }
  .form-card, .data-source-form-card { display: grid; gap: 14px; }
  .data-source-form { display: grid; gap: 10px; }
  .checkbox-row { display: flex; align-items: center; gap: 10px; color: var(--text); font-size: .92rem; }
  .checkbox-row input { width: 16px; height: 16px; }
  .form-input {
    width: 100%;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 12px;
    border: 1px solid #d0d5dd;
    background: white;
    color: var(--text);
  }
  select.form-input { appearance: none; }
  .file-input { padding: 10px 14px; }
  .data-source-upload-meta {
    display: grid;
    gap: 4px;
    padding: 14px 16px;
    border-radius: 14px;
    background: #fbfcfe;
    border: 1px solid #eef2f7;
  }
  .data-source-upload-meta p, .data-source-upload-meta strong { margin: 0; }
  .data-source-upload-meta p { color: var(--muted); }
  .data-source-review-notes { display: grid; gap: 4px; margin-top: 8px; }
  .data-source-review-notes p { margin: 0; color: var(--warning); font-size: .82rem; line-height: 1.4; }

  .data-source-upload-button { display: inline-flex; align-items: center; gap: 10px; }
  .data-source-kpi { min-height: 118px; padding: 16px 14px; border-radius: 16px; gap: 12px; }
  .data-source-kpi strong { font-size: 2rem; line-height: 1; color: var(--text); }
  .data-source-kpi-sync strong { font-size: 1rem; line-height: 1.2; margin-top: 10px; }
  .data-source-kpi-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .data-source-kpi-top p { font-size: .82rem; color: var(--muted); }
  .data-source-kpi-icon { width: 18px; height: 18px; display: grid; place-items: center; }
  .data-source-kpi-icon svg { width: 18px; height: 18px; }
  .data-source-kpi-icon-success { color: var(--success); }
  .data-source-kpi-icon-warning { color: var(--warning); }
  .data-source-kpi-icon-danger { color: var(--danger); }
  .data-source-kpi-icon-info { color: var(--info); }
  .data-source-kpi-icon-neutral { color: #98a2b3; }

  .data-source-hero { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 18px; padding: 18px 20px; border-color: #a7f3d0; background: linear-gradient(180deg, #f0fdf8 0%, #f5fbff 100%); }
  .data-source-hero-icon { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; background: #0e9f6e; color: white; }
  .data-source-hero-icon svg { width: 20px; height: 20px; }
  .data-source-hero-body { display: grid; gap: 10px; }
  .data-source-hero-body h2 { margin: 0; font-size: 1.9rem; }
  .data-source-hero-body > p { margin: 0; color: #475467; line-height: 1.5; }
  .data-source-feature-grid { margin-top: 2px; gap: 18px; }
  .data-source-feature { display: flex; align-items: flex-start; gap: 12px; }
  .data-source-feature-icon { width: 34px; height: 34px; border-radius: 999px; display: grid; place-items: center; flex: 0 0 auto; }
  .data-source-feature-icon svg { width: 17px; height: 17px; }
  .data-source-feature > div { display: grid; gap: 4px; }
  .data-source-feature strong { font-size: .98rem; }
  .data-source-feature p { margin: 0; color: #667085; font-size: .85rem; line-height: 1.45; }

  .data-source-panel { padding: 18px 18px 16px; }
  .data-source-list { display: grid; gap: 12px; }
  .data-source-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 14px; background: white; }
  .data-source-row-main { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .data-source-row-copy { display: grid; gap: 2px; min-width: 0; }
  .data-source-row-copy strong { font-size: .98rem; }
  .data-source-row-copy p { margin: 0; color: var(--muted); font-size: .84rem; }
  .data-source-row-status, .data-source-file-icon { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex: 0 0 auto; }
  .data-source-row-status { color: var(--success); }
  .data-source-file-icon { background: var(--info-soft); color: var(--info); }
  .data-source-row-status svg, .data-source-file-icon svg { width: 18px; height: 18px; }

  .analytics-page { gap: 18px; }
  .analytics-page .page-header { gap: 4px; }
  .analytics-page .page-header h1 { font-size: 1.75rem; line-height: 1.04; }
  .analytics-page .page-header p { font-size: .84rem; }
  .analytics-header-actions { align-items: center; gap: 12px; }
  .analytics-export-button, .analytics-impact-export-button {
    min-height: 38px;
    min-width: 112px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 14px;
    border-radius: 12px;
    font-size: .92rem;
  }
  .analytics-export-button svg, .analytics-impact-export-button svg { width: 16px; height: 16px; }
  .analytics-kpi-grid, .analytics-impact-grid, .analytics-grid { display: grid; gap: 14px; }
  .analytics-kpi-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .analytics-metric-card {
    min-height: 126px;
    padding: 18px 20px 20px;
    border: 1px solid #e7eaef;
    border-radius: 18px;
    background: #ffffff;
    box-shadow: 0 6px 18px rgba(15, 23, 42, .035);
    display: grid;
    align-content: space-between;
    gap: 14px;
  }
  .analytics-metric-card p { margin: 0; color: #667085; font-size: .86rem; line-height: 1.35; }
  .analytics-metric-value { font-size: 1.55rem; line-height: 1.02; color: #111827; letter-spacing: -.02em; }
  .analytics-metric-value-danger { color: #dc2626; }
  .analytics-metric-value-success { color: #0f9d67; }
  .analytics-impact-panel {
    padding: 24px 28px;
    border-radius: 18px;
    border: 0;
    background: linear-gradient(135deg, #121a2b 0%, #1b2436 100%);
    box-shadow: 0 12px 28px rgba(15, 23, 42, .12);
  }
  .analytics-impact-panel .panel-header { align-items: flex-start; }
  .analytics-impact-panel .panel-header h2 { font-size: 1.05rem; }
  .analytics-impact-panel h2 { color: #ffffff; }
  .analytics-impact-panel .label-copy { color: rgba(255, 255, 255, .68); font-size: .82rem; }
  .analytics-impact-export-button {
    border: 1px solid rgba(255, 255, 255, .18);
    background: #ffffff;
    color: #111827;
  }
  .analytics-impact-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); padding-top: 10px; }
  .analytics-impact-card {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 72px;
  }
  .analytics-impact-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
  }
  .analytics-impact-icon svg { width: 22px; height: 22px; }
  .analytics-impact-icon-info { background: rgba(37, 99, 235, .2); color: #60a5fa; }
  .analytics-impact-icon-violet { background: rgba(147, 51, 234, .22); color: #c084fc; }
  .analytics-impact-icon-success { background: rgba(15, 157, 103, .2); color: #2dd4bf; }
  .analytics-impact-copy { display: grid; gap: 4px; }
  .analytics-impact-copy span { color: rgba(255, 255, 255, .66); font-size: .84rem; }
  .analytics-impact-copy strong { color: #ffffff; font-size: 1.6rem; line-height: 1; letter-spacing: -.02em; }
  .analytics-trends-header {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
  }
  .analytics-trends-header h2 { margin: 0; font-size: 1.25rem; }
  .analytics-trend-toggle { display: inline-flex; align-items: center; gap: 8px; }
  .analytics-trend-pill {
    min-height: 38px;
    padding: 0 16px;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    background: #ffffff;
    color: #475467;
    display: inline-flex;
    align-items: center;
    font-size: .9rem;
    font-weight: 700;
    text-decoration: none;
  }
  .analytics-trend-pill.is-active {
    background: #111827;
    border-color: #111827;
    color: #ffffff;
  }
  .analytics-page.is-loading .analytics-grid-trends,
  .analytics-page.is-loading .analytics-kpi-grid,
  .analytics-page.is-loading .analytics-impact-panel {
    opacity: .62;
    transition: opacity .16s ease;
  }
  .analytics-grid-trends { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .analytics-panel { padding: 20px 22px; border-radius: 18px; box-shadow: 0 6px 18px rgba(15, 23, 42, .035); border-color: #e7eaef; }
  .analytics-panel .panel-header { align-items: flex-start; }
  .analytics-panel .panel-header h2 { font-size: .98rem; line-height: 1.26; }
  .analytics-panel .label-copy { font-size: .82rem; color: #667085; line-height: 1.45; }
  .analytics-chart-panel { min-height: 396px; }
  .analytics-trend-chart { padding-top: 8px; }
  .analytics-trend-chart svg { display: block; width: 100%; height: 248px; }
  .analytics-empty-state {
    margin: 18px 0 0;
    min-height: 248px;
    border: 1px dashed #d8dee8;
    border-radius: 14px;
    background: #fbfcfe;
    color: #667085;
    display: grid;
    place-items: center;
    text-align: center;
    padding: 18px;
    font-size: .9rem;
    line-height: 1.45;
  }
  .analytics-line-guide, .analytics-line-vertical-guide { stroke: #e9eef5; stroke-width: 1; }
  .analytics-line-vertical-guide { stroke-dasharray: 3 5; }
  .analytics-line-path { fill: none; stroke-width: 2.25; stroke-linecap: round; stroke-linejoin: round; }
  .analytics-line-point { stroke: #ffffff; stroke-width: 2; }
  .analytics-point-group { outline: none; cursor: default; }
  .analytics-point-hit { fill: transparent; pointer-events: all; }
  .analytics-point-tooltip {
    opacity: 0;
    pointer-events: none;
    transition: opacity .15s ease;
  }
  .analytics-point-group:hover .analytics-point-tooltip,
  .analytics-point-group:focus .analytics-point-tooltip {
    opacity: 1;
  }
  .analytics-tooltip-box { fill: #111827; filter: drop-shadow(0 8px 16px rgba(15, 23, 42, .18)); }
  .analytics-tooltip-text { fill: #ffffff; font-size: 11px; font-weight: 700; }
  .analytics-line-label, .analytics-line-value-label { font-size: 11px; fill: #98a2b3; }
  .analytics-legend {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding-top: 8px;
    color: #667085;
    font-size: .82rem;
  }
  .analytics-legend-dot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; margin-right: 6px; vertical-align: middle; }
  .analytics-customer-list { display: grid; gap: 16px; padding-top: 10px; }
  .analytics-customer-row {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 12px;
    align-items: start;
  }
  .analytics-customer-rank { color: #667085; font-size: .98rem; font-weight: 700; line-height: 1.5; }
  .analytics-customer-copy { display: grid; gap: 8px; }
  .analytics-customer-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .analytics-customer-title strong, .analytics-customer-title span { font-size: .92rem; }
  .analytics-customer-title span { color: #111827; font-weight: 700; }
  .analytics-customer-bar { position: relative; width: 100%; height: 8px; border-radius: 999px; background: #edf2f7; outline: none; }
  .analytics-customer-bar > span:first-child { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%); }
  .analytics-bar-tooltip {
    bottom: calc(100% + 10px);
    right: 0;
  }
  .analytics-customer-bar:hover .analytics-bar-tooltip,
  .analytics-customer-bar:focus .analytics-bar-tooltip {
    opacity: 1;
    transform: translateY(0);
  }

  .home-page { gap: 18px; }
  .command-center-grid { display: grid; grid-template-columns: minmax(0, 1fr) 372px; gap: 18px; align-items: start; }
  .command-main-column, .command-rail { display: grid; gap: 18px; }
  .home-setup-card { border-color: #ddd6fe; background: linear-gradient(90deg, #f5f3ff 0%, #faf5ff 100%); }
  .home-page .panel { border-radius: 20px; }
  .home-page .panel h2 { font-size: .98rem; line-height: 1.2; }
  .home-page .panel-header { align-items: center; }
  .home-page .label-copy { font-size: .8rem; }
  .home-setup-checkbox { width: 18px; height: 18px; border-radius: 6px; border: 1px solid #d0d5dd; background: rgba(255,255,255,.96); display: inline-block; }
  .home-task-panel, .home-rail-panel { padding: 0; overflow: hidden; }
  .home-task-panel .panel-header, .home-rail-panel .panel-header, .home-setup-card .panel-header { padding: 18px 22px 0; }
  .home-inline-metric { color: var(--success); font-weight: 700; font-size: inherit; }
  .home-setup-card .activity-list { padding: 8px 22px 16px; }
  .home-setup-card .activity-summary-row { grid-template-columns: minmax(0,1fr) auto; gap: 12px; padding: 8px 0; border-bottom: 0; align-items: center; }
  .home-setup-summary-body { gap: 0; }
  .home-setup-summary-body strong { font-size: .92rem; font-weight: 600; color: #344054; }
  .collections-workspace, .collections-inbox-card { background: white; border: 1px solid #e5e7eb; border-radius: 24px; box-shadow: 0 8px 24px rgba(15, 23, 42, .04); }
  .collections-workspace { padding: 28px 30px 22px; display: grid; gap: 22px; }
  .collections-hero { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
  .collections-hero-copy { display: grid; gap: 18px; }
  .collections-hero-copy h1 { margin: 0; font-size: 2rem; line-height: 1.08; letter-spacing: -.03em; }
  .collections-channel-tabs { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; border-bottom: 1px solid #eef2f6; padding-bottom: 2px; }
  .collections-channel-tab, .collections-configure-button, .collections-toolbar-chip, .collections-filter-pill, .collections-pager-button {
    border: 1px solid transparent;
    background: transparent;
    color: #475467;
    cursor: pointer;
  }
  .collections-channel-tab { display: inline-flex; align-items: center; gap: 10px; padding: 0 0 14px; border-bottom: 3px solid transparent; font-size: 1rem; font-weight: 600; color: #667085; text-decoration: none; }
  .collections-channel-tab.is-active { color: #111827; border-bottom-color: #111827; }
  .collections-channel-tab svg, .collections-configure-button svg, .collections-toolbar-chip svg { width: 18px; height: 18px; }
  .collections-configure { display: flex; align-items: flex-start; }
  .collections-configure-button { min-height: 44px; display: inline-flex; align-items: center; gap: 10px; padding: 0 4px; color: #111827; font-weight: 600; }

  .collections-filter-bar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 18px; }
  .collections-filter-pill { min-height: 42px; padding: 0 16px; border-radius: 13px; border: 1px solid #d9e0ea; background: white; display: inline-flex; align-items: center; gap: 14px; font-size: .98rem; font-weight: 600; color: #111827; text-decoration: none; }
  .collections-filter-pill.is-active { background: #2962f2; border-color: #2962f2; color: white; }
  .collections-filter-count { min-width: 34px; height: 28px; padding: 0 10px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: rgba(255,255,255,.92); color: #2962f2; font-size: .9rem; font-weight: 700; }
  .collections-filter-count.dark { background: #111827; color: white; }

  .collections-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 14px; align-items: center; margin-top: 18px; }
  .collections-searchbox { min-height: 48px; display: flex; align-items: center; gap: 10px; padding: 0 16px; border-radius: 13px; border: 1px solid #eef2f6; background: #f7f8fb; color: #98a2b3; font-size: .98rem; }
  .collections-toolbar-chip { min-height: 48px; padding: 0 16px; border-radius: 13px; border: 1px solid #d9e0ea; background: white; display: inline-flex; align-items: center; gap: 10px; color: #111827; font-size: .98rem; font-weight: 600; }

  .collections-inbox-card { overflow: hidden; margin-top: 22px; }
  .collections-inbox-list { display: grid; }
  .collections-inbox-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 24px 22px 22px; border-bottom: 1px solid #eef2f6; }
  .collections-inbox-main { min-width: 0; display: flex; align-items: flex-start; gap: 18px; }
  .collections-row-checkbox { width: 22px; height: 22px; border-radius: 7px; border: 1px solid #e3e8ef; background: #f8fafc; margin-top: 1px; flex: 0 0 auto; }
  .collections-message-trigger { min-width: 0; color: inherit; text-decoration: none; }
  .collections-message-copy { min-width: 0; display: grid; gap: 8px; }
  .collections-message-heading { display: flex; align-items: center; gap: 8px; }
  .collections-message-heading strong { font-size: 1.06rem; }
  .collections-linked-badge { width: 18px; height: 18px; color: #98a2b3; display: inline-flex; align-items: center; justify-content: center; }
  .collections-linked-badge svg { width: 15px; height: 15px; }
  .collections-message-address, .collections-message-preview { margin: 0; color: var(--muted); }
  .collections-message-address { font-size: .94rem; color: #475467; }
  .collections-message-preview { font-size: .98rem; color: #344054; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 820px; }
  .collections-message-meta { display: flex; align-items: center; gap: 20px; color: #667085; font-size: .96rem; white-space: nowrap; padding-top: 2px; }

  .collections-inbox-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 22px 30px; color: #475467; font-size: .96rem; }
  .collections-pager { display: flex; align-items: center; gap: 4px; }
  .collections-pager-button { width: 34px; height: 34px; border-radius: 999px; display: grid; place-items: center; color: #111827; font-size: 1.2rem; line-height: 1; }
  .collections-email-inbox-card { background: white; border: 1px solid #e5e7eb; border-radius: 18px; box-shadow: 0 8px 24px rgba(15, 23, 42, .04); overflow: hidden; }
  .collections-email-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 22px 24px 16px; border-bottom: 1px solid #eef2f6; }
  .collections-email-head h2, .collections-email-head p { margin: 0; }
  .collections-email-head h2 { font-size: 1.25rem; line-height: 1.1; }
  .collections-email-head p { margin-top: 6px; color: #667085; font-size: .92rem; line-height: 1.45; }
  .collections-email-tabs { margin-top: 0; justify-content: flex-end; }
  .collections-compose-alert {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 18px;
    padding: 12px 16px;
    border-radius: 12px;
    border: 1px solid #b7ebc6;
    background: #f0fdf4;
    color: #166534;
  }
  .collections-compose-alert.is-error { border-color: #fecaca; background: #fff1f2; color: #9f1239; }
  .collections-compose-alert strong, .collections-compose-alert span { margin: 0; line-height: 1.4; }
  .collections-email-toolbar { display: grid; grid-template-columns: minmax(260px, 1fr) 220px auto; gap: 12px; align-items: end; padding: 16px 24px; border-bottom: 1px solid #eef2f6; }
  .collections-searchbox input { width: 100%; border: 0; outline: 0; background: transparent; color: #111827; font: inherit; }
  .collections-email-select, .collections-email-field { display: grid; gap: 7px; color: #344054; font-size: .82rem; font-weight: 700; }
  .collections-email-select select, .collections-email-select input, .collections-email-field select, .collections-email-field input {
    width: 100%;
    min-height: 40px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid #d0d5dd;
    background: white;
    color: #111827;
    font: inherit;
  }
  .collections-filter-actions, .call-inbox-toolbar-actions { display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .collections-email-list { min-height: 120px; }
  .collections-email-row { color: inherit; text-decoration: none; align-items: stretch; padding: 18px 24px; }
  .collections-email-row:hover { background: #fbfcfe; }
  .collections-email-row.is-read { color: #667085; }
  .collections-email-row.is-read .collections-message-heading strong,
  .collections-email-row.is-read .collections-message-subject,
  .collections-email-row.is-read .collections-message-preview { color: #667085; font-weight: 500; }
  .collections-email-row.is-unread .collections-message-heading strong,
  .collections-email-row.is-unread .collections-message-subject { font-weight: 800; }
  .collections-email-row .collections-row-checkbox { margin-top: 2px; }
  .collections-message-subject { margin: 0; color: #111827; font-weight: 700; font-size: .95rem; line-height: 1.35; }
  .collections-email-row-meta { align-items: flex-end; flex-direction: column; gap: 8px; min-width: 150px; }
  .collections-email-unread-dot {
    min-height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    background: #e0f2fe;
    color: #075985;
    font-size: .72rem;
    font-weight: 800;
  }
  .collections-unlinked-badge {
    min-height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    background: #f2f4f7;
    color: #667085;
    font-size: .72rem;
    font-weight: 800;
  }
  .collections-inbox-empty { display: grid; gap: 6px; padding: 28px 24px; color: #667085; }
  .collections-inbox-empty strong { color: #111827; }
  .collections-email-empty.compact { padding: 18px; border: 1px solid #eef2f6; border-radius: 12px; background: #fbfcfe; }
  .collections-email-panel { width: min(980px, calc(100vw - 32px)); border-radius: 18px; }
  .collections-email-modal-header { align-items: center; }
  .collections-email-customer-header { display: flex; align-items: center; gap: 14px; }
  .collections-email-avatar { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; background: #111827; color: white; font-weight: 800; }
  .collections-email-summary-strip, .collections-email-modal-actions, .collections-email-modal-tabs, .collections-email-invoice-row, .collections-email-compose-head, .collections-email-generation-toggle, .collections-email-format-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .collections-email-summary-strip { margin-top: 12px; color: #344054; font-size: .84rem; font-weight: 700; }
  .collections-email-summary-strip span, .collections-email-invoice-row a, .collections-email-invoice-row strong {
    min-height: 26px;
    display: inline-flex;
    align-items: center;
    padding: 0 9px;
    border-radius: 8px;
    background: #f7f8fa;
    border: 1px solid #e4e7ec;
    color: #344054;
    text-decoration: none;
  }
  .collections-email-body { display: grid; gap: 16px; padding: 20px 28px 28px; }
  .collections-email-invoice-row { justify-content: space-between; align-items: flex-start; }
  .collections-email-invoice-row > span { color: #667085; font-size: .82rem; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
  .collections-email-invoice-row > div { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  .collections-email-tab-control { position: absolute; opacity: 0; pointer-events: none; }
  .collections-email-modal-tabs { border-bottom: 1px solid #e5e7eb; gap: 4px; }
  .collections-email-modal-tab {
    min-height: 40px;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-bottom: 2px solid transparent;
    color: #667085;
    font-weight: 800;
    cursor: pointer;
  }
  .collections-email-modal-tab span { min-width: 22px; min-height: 22px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: #eef2f6; color: #344054; font-size: .75rem; }
  .collections-email-tab-control[value="thread"]:checked ~ .collections-email-modal-tabs label[for$="thread-tab"],
  .collections-email-tab-control[value="tasks"]:checked ~ .collections-email-modal-tabs label[for$="tasks-tab"] { color: #111827; border-bottom-color: #111827; }
  .collections-email-tab-panel { display: none; }
  .collections-email-tab-control[value="thread"]:checked ~ .collections-email-tab-panels .is-thread,
  .collections-email-tab-control[value="tasks"]:checked ~ .collections-email-tab-panels .is-tasks { display: grid; gap: 16px; }
  .collections-email-thread-list, .collections-email-task-list { display: grid; gap: 10px; }
  .collections-email-thread-message, .collections-email-task-row {
    display: grid;
    gap: 8px;
    padding: 14px 16px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #fbfcfe;
  }
  .collections-email-thread-message summary { display: grid; gap: 6px; cursor: pointer; list-style: none; }
  .collections-email-thread-message summary::-webkit-details-marker { display: none; }
  .collections-email-thread-summary-main { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .collections-email-thread-snippet {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .collections-email-thread-full-body {
    margin-top: 10px;
    padding-top: 12px;
    border-top: 1px solid #e5e7eb;
    color: #344054;
    font-size: .92rem;
    line-height: 1.55;
    white-space: pre-wrap;
  }
  .collections-email-thread-message span, .collections-email-task-row span { margin: 0; color: #667085; font-size: .88rem; line-height: 1.45; }
  .collections-email-task-row { color: inherit; text-decoration: none; }
  .collections-email-task-row div { display: grid; gap: 4px; min-width: 0; }
  .collections-email-compose-form { padding: 0; }
  .collections-email-template-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: end;
    padding: 12px 14px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #fbfcfe;
  }
  .collections-email-subject-field { grid-column: 1 / -1; }
  .collections-email-generation-toggle { padding: 3px; border: 1px solid #d0d5dd; border-radius: 999px; background: #f7f8fa; }
  .collections-email-generation-toggle label { display: inline-flex; align-items: center; cursor: pointer; }
  .collections-email-generation-toggle input { position: absolute; opacity: 0; }
  .collections-email-generation-toggle span { min-height: 30px; display: inline-flex; align-items: center; padding: 0 13px; border-radius: 999px; color: #667085; font-size: .82rem; font-weight: 800; }
  .collections-email-generation-toggle input:checked + span { background: #111827; color: white; }
  .collections-email-format-actions { justify-content: flex-end; }
  .collections-email-format-actions button {
    width: 32px;
    height: 32px;
    border-radius: 9px;
    border: 1px solid #d0d5dd;
    background: white;
    display: grid;
    place-items: center;
    color: #344054;
  }
  .collections-email-format-actions svg { width: 15px; height: 15px; }
  .collections-email-attachment-upload {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 10px;
    border-radius: 9px;
    border: 1px solid #d0d5dd;
    background: white;
    color: #344054;
    font-size: .82rem;
    font-weight: 800;
    cursor: pointer;
  }
  .collections-email-compose-head { justify-content: space-between; }
  .collections-email-body-field { gap: 8px; }
  .collections-email-field small { color: #667085; font-size: .78rem; font-weight: 600; }
  .collections-email-attachment-panel {
    display: grid;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #fbfcfe;
  }
  .collections-email-attachment-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 12px;
  }
  .collections-email-attachment-controls select { min-height: 78px; padding: 8px 10px; }
  .collections-email-document-buttons, .collections-email-attachment-chips {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .collections-email-file-input { max-width: 100%; color: #667085; font-size: .84rem; }
  .collections-email-attachment-chips { color: #667085; font-size: .84rem; }
  .collections-email-attachment-chip {
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 9px;
    border-radius: 999px;
    border: 1px solid #d0d5dd;
    background: white;
    color: #344054;
    font-weight: 800;
  }
  .collections-email-attachment-chip svg { width: 14px; height: 14px; }
  .collections-compose-modal { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; padding: 28px 20px; z-index: 40; }
  .collections-compose-modal:target { display: flex; }
  .collections-compose-backdrop { position: absolute; inset: 0; background: rgba(17, 24, 39, .44); }
  .collections-compose-panel { position: relative; width: min(760px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow: auto; border-radius: 24px; background: white; border: 1px solid #d9e0ea; box-shadow: 0 24px 60px rgba(15, 23, 42, .18); }
  .collections-compose-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 24px 28px 18px; border-bottom: 1px solid #eef2f6; }
  .collections-compose-header h2, .collections-compose-header p { margin: 0; }
  .collections-compose-header h2 { font-size: 2rem; line-height: 1.04; }
  .collections-compose-header p { margin-top: 8px; color: #667085; }
  .collections-compose-close { width: 38px; height: 38px; border-radius: 999px; display: grid; place-items: center; color: #344054; text-decoration: none; }
  .collections-compose-close:hover { background: #f4f7fb; }
  .collections-compose-close svg { width: 18px; height: 18px; }
  .collections-compose-form { display: grid; gap: 18px; padding: 22px 28px 28px; }
  .collections-compose-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  .collections-compose-grid-single { grid-template-columns: minmax(0, 1fr); }
  .collections-compose-grid .collections-message-heading { display: grid; gap: 8px; align-items: initial; }
  .collections-compose-textarea { width: 100%; min-height: 220px; padding: 14px 16px; resize: vertical; border-radius: 16px; border: 1px solid #d0d5dd; background: white; color: var(--text); font: inherit; line-height: 1.55; }
  .collections-compose-footer { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding-top: 4px; }
  .collections-compose-footer .primary-button[disabled] { opacity: .55; cursor: not-allowed; }
  .task-row-title-link { color: inherit; text-decoration: none; }
  .task-row-title-link:hover { color: #059669; }
  .task-detail-modal { z-index: 46; }
  .task-detail-panel { width: min(920px, calc(100vw - 32px)); border-radius: 18px; }
  .task-detail-header { align-items: center; }
  .task-detail-kicker, .task-detail-nav, .task-detail-aging {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .task-detail-kicker { color: #667085; font-size: .86rem; font-weight: 700; }
  .task-detail-aging {
    min-height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    background: #fff7ed;
    color: #9a3412;
  }
  .task-detail-aging svg, .task-detail-nav-button svg, .task-compose-format-button svg { width: 15px; height: 15px; }
  .task-detail-nav { flex: 0 0 auto; }
  .task-detail-nav-button {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    border: 1px solid #d0d5dd;
    color: #111827;
    background: #fff;
  }
  .task-detail-nav-button.is-disabled { opacity: .35; pointer-events: none; }
  .task-detail-body { display: grid; gap: 18px; padding: 20px 28px 28px; }
  .task-detail-summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .task-detail-context-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
  .task-detail-summary-card {
    min-height: 74px;
    display: grid;
    align-content: center;
    gap: 6px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    background: #fbfcfd;
  }
  .task-detail-context-card {
    display: grid;
    gap: 6px;
    padding: 13px 14px;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    background: #fff;
  }
  .task-detail-summary-card span, .task-detail-context-card span, .task-detail-context-card p, .task-detail-brief p, .task-detail-next-action p, .task-detail-source-context p { color: #667085; }
  .task-detail-summary-card strong { color: #111827; font-size: .95rem; overflow-wrap: anywhere; }
  .task-detail-context-card strong,
  .task-detail-context-card a {
    color: #111827;
    font-size: .9rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .task-detail-context-card a { color: #2954ff; }
  .task-detail-context-card p { margin: 0; line-height: 1.45; }
  .task-detail-invoice-list {
    margin: 0;
    padding-left: 18px;
    display: grid;
    gap: 8px;
    color: #667085;
  }
  .task-detail-invoice-list li { line-height: 1.45; }
  .task-detail-invoice-list strong { color: #344054; margin-right: 6px; }
  .task-detail-invoice-list span { color: #667085; }
  .task-detail-brief {
    display: grid;
    gap: 6px;
    padding: 14px 16px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: white;
  }
  .task-detail-brief p { margin: 0; line-height: 1.45; }
  .task-detail-next-action,
  .task-detail-source-context {
    display: grid;
    gap: 6px;
    padding: 13px 16px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #fbfcfd;
  }
  .task-detail-next-action p,
  .task-detail-source-context p {
    margin: 0;
    line-height: 1.45;
  }
  .task-detail-source-context summary {
    cursor: pointer;
    color: #111827;
    font-weight: 700;
  }
  .task-detail-source-context summary::-webkit-details-marker { display: none; }
  .task-detail-email-form { padding: 0; }
  .task-detail-edit-mode {
    display: grid;
    gap: 14px;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    padding: 14px;
    background: #fff;
  }
  .task-detail-edit-mode summary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-weight: 700;
    color: #111827;
  }
  .task-detail-edit-mode summary::-webkit-details-marker { display: none; }
  .task-detail-edit-mode summary svg { width: 16px; height: 16px; }
  .task-detail-subject-field { display: grid; gap: 8px; align-items: initial; }
  .task-compose-format-button {
    width: 32px;
    height: 32px;
    display: inline-grid;
    place-items: center;
    border: 1px solid #d0d5dd;
    border-radius: 8px;
    background: #fff;
    color: #111827;
    font-weight: 800;
    cursor: pointer;
  }
  .task-detail-status-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
  .call-inbox-toolbar { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-top: 22px; }
  .call-inbox-filter-row { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
  .call-inbox-filter { width: 180px; }
  .call-inbox-filter.compact { width: 150px; }
  .call-inbox-date-range {
    min-width: 320px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .call-inbox-date-range legend {
    grid-column: 1 / -1;
    padding: 0;
    color: #344054;
    font-size: .82rem;
    font-weight: 700;
  }
  .call-inbox-date-range label { display: grid; gap: 7px; color: #344054; font-size: .78rem; font-weight: 700; }
  .call-inbox-date-range input {
    width: 100%;
    min-height: 40px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid #d0d5dd;
    background: white;
    color: #111827;
    font: inherit;
  }
  .call-inbox-date-range-label {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    color: #667085;
    font-size: .82rem;
    font-weight: 700;
  }
  .call-inbox-date-range-label a { color: #2563eb; text-decoration: none; }
  .call-inbox-export { min-height: 46px; display: inline-flex; align-items: center; gap: 10px; text-decoration: none; border-radius: 10px; background: #111827; color: #fff; }
  .call-inbox-export svg { width: 18px; height: 18px; }
  .call-inbox-table-card { margin-top: 18px; overflow: hidden; background: white; border: 1px solid #e5e7eb; border-radius: 14px; box-shadow: 0 8px 20px rgba(15, 23, 42, .035); }
  .call-inbox-table { display: grid; overflow-x: auto; }
  .call-inbox-row { min-width: 1180px; display: grid; grid-template-columns: 42px minmax(110px, .85fr) minmax(170px, 1.25fr) minmax(130px, .9fr) 92px 92px 96px minmax(210px, 1.35fr) 96px 96px 110px; align-items: center; gap: 14px; padding: 18px 22px; color: #1f2937; }
  .call-inbox-head { background: #fbfcfe; border-bottom: 1px solid #e5e7eb; color: #667085; font-size: .88rem; font-weight: 700; }
  .call-inbox-data-row { min-height: 82px; text-decoration: none; border-bottom: 1px solid #eef2f6; }
  .call-inbox-data-row:hover { background: #f8fafc; }
  .call-inbox-data-row strong { font-size: .96rem; line-height: 1.45; }
  .call-inbox-sort { width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; background: #e8f1f8; color: #46647a; font-size: .84rem; }
  .call-inbox-boolean { font-size: 1.25rem; color: #111827; }
  .call-sentiment-dot { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; font-weight: 800; }
  .call-sentiment-dot.is-positive { background: #c9f7df; color: #079669; }
  .call-sentiment-dot.is-neutral, .call-sentiment-dot.is-unknown { background: #eef2f6; color: #667085; }
  .call-sentiment-dot.is-negative { background: #fee2e2; color: #b42318; }
  .call-inbox-tags { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .call-inbox-tag { max-width: 180px; padding: 4px 10px; border-radius: 999px; border: 1px solid #e5e7eb; background: white; color: #111827; font-size: .82rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .call-inbox-count { min-width: 28px; height: 28px; padding: 0 9px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; border: 1px solid #cfe0ff; background: #edf4ff; color: #2563eb; font-weight: 800; }
  .call-inbox-approver { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; background: #eef0f3; color: #667085; font-weight: 700; overflow: hidden; }
  .call-status-chip { width: fit-content; max-width: 110px; padding: 6px 12px; border-radius: 999px; font-size: .84rem; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .call-status-chip.is-completed { background: #c7f3d8; color: #08775b; }
  .call-status-chip.is-processing { background: #fef3c7; color: #92400e; }
  .call-status-chip.is-needs_review { background: #dbeafe; color: #1d4ed8; }
  .call-status-chip.is-failed { background: #fee2e2; color: #b42318; }
  .call-status-chip.is-archived { background: #eef2f6; color: #475467; }
  .call-inbox-empty { min-width: 1180px; display: grid; gap: 6px; padding: 30px 22px; color: #667085; }
  .call-inbox-empty strong { color: #111827; }
  .call-detail-modal { z-index: 45; }
  .call-detail-panel { position: relative; width: min(620px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow: auto; border-radius: 12px; background: white; border: 1px solid #d9e0ea; box-shadow: 0 24px 60px rgba(15, 23, 42, .22); padding: 28px 32px; }
  .call-detail-close { position: absolute; top: 18px; right: 18px; }
  .call-detail-tabs { width: fit-content; min-height: 40px; display: inline-flex; align-items: center; gap: 2px; padding: 4px; border-radius: 18px; background: #eef0f6; }
  .call-detail-tab { min-height: 32px; display: inline-flex; align-items: center; padding: 0 12px; border-radius: 14px; color: #111827; text-decoration: none; font-weight: 800; }
  .call-detail-tab.is-active { background: white; box-shadow: 0 1px 2px rgba(15, 23, 42, .08); }
  .call-detail-title-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 18px; }
  .call-detail-title-row h2 { margin: 0; font-size: 1.25rem; line-height: 1.2; letter-spacing: 0; }
  .call-detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 42px; margin-top: 24px; }
  .call-detail-field { min-width: 0; display: grid; gap: 6px; }
  .call-detail-field span { color: #7a8494; font-size: .88rem; font-weight: 700; }
  .call-detail-field strong { color: #1f2937; font-size: .98rem; line-height: 1.42; overflow-wrap: anywhere; }
  .call-detail-divider { height: 1px; margin: 22px 0; background: #e5e7eb; }
  .call-detail-section { display: grid; gap: 12px; }
  .call-detail-section h3 { margin: 0; font-size: 1.05rem; line-height: 1.2; letter-spacing: 0; }
  .call-detail-section p { margin: 0; color: #344054; line-height: 1.55; }
  .call-task-tabs { width: fit-content; min-height: 42px; display: inline-flex; align-items: center; gap: 2px; padding: 4px; border-radius: 18px; background: #eef0f6; }
  .call-task-tab { min-height: 32px; display: inline-flex; align-items: center; gap: 8px; padding: 0 12px; border-radius: 14px; color: #111827; font-weight: 800; }
  .call-task-tab.is-active { background: white; box-shadow: 0 1px 2px rgba(15, 23, 42, .08); }
  .call-task-tab strong { min-width: 25px; height: 25px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; background: #090a18; color: white; font-size: .82rem; }
  .call-task-list { display: grid; gap: 10px; margin-top: 14px; }
  .call-task-row { min-height: 58px; display: grid; grid-template-columns: 24px minmax(0, 1fr) auto auto 24px; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid #e5e7eb; border-radius: 6px; color: #1f2937; }
  .call-task-row svg { width: 18px; height: 18px; color: #079669; }
  .call-task-row span { color: #667085; font-size: .9rem; white-space: nowrap; }
  .call-detail-muted { color: #667085; }
  .call-transcript-panel { width: min(620px, calc(100vw - 32px)); padding-top: 30px; }
  .call-audio-bar { min-height: 76px; display: flex; align-items: center; gap: 14px; margin-top: 12px; margin-bottom: 22px; padding: 16px 18px; border-radius: 12px; background: #f8fafc; }
  .call-audio-bar audio { width: 100%; }
  .call-play-icon { font-size: 1.35rem; color: #111827; }
  .call-waveform { height: 42px; flex: 1; display: flex; align-items: center; gap: 4px; padding: 0 10px; border-radius: 8px; background: #d8dee7; overflow: hidden; }
  .call-waveform i { width: 3px; flex: 0 0 3px; display: block; border-radius: 999px; background: #4b5563; }
  .call-recording-download { color: #111827; text-decoration: none; }
  .call-recording-download svg { width: 18px; height: 18px; }
  .call-transcript-list { display: grid; gap: 16px; }
  .call-transcript-segment { display: grid; gap: 6px; }
  .call-transcript-segment strong { color: #7a8494; font-size: .88rem; }
  .call-transcript-segment p { margin: 0; color: #1f2937; line-height: 1.5; }
  .task-compose-title-block { display: grid; gap: 10px; }
  .task-compose-title-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .task-compose-badge { display: inline-flex; align-items: center; justify-content: center; min-height: 28px; padding: 0 12px; border-radius: 999px; border: 1px solid #d0d5dd; background: #f8fafc; color: #475467; font-size: .88rem; font-weight: 600; }
  .task-compose-invoice-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: #667085; }
  .task-compose-invoice-pill { color: #344054; font-weight: 600; }
  .task-compose-bullet { color: #c0c7d2; }
  .task-compose-tabs { display: flex; align-items: center; gap: 28px; border-bottom: 1px solid #eef2f6; }
  .task-compose-tab { display: inline-flex; align-items: center; gap: 8px; padding: 0 0 14px; border-bottom: 3px solid transparent; color: #667085; font-weight: 600; text-decoration: none; }
  .task-compose-tab.is-active { color: #111827; border-bottom-color: #111827; }
  .task-compose-tab-count { min-width: 24px; height: 24px; padding: 0 7px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: #2962f2; color: white; font-size: .82rem; font-weight: 700; }
  .task-compose-thread-list { display: grid; gap: 14px; }
  .task-compose-thread-card { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 14px; padding: 18px 18px; border-radius: 18px; border: 1px solid #dfe4ec; background: white; }
  .task-compose-thread-avatar { width: 38px; height: 38px; border-radius: 999px; display: grid; place-items: center; background: #eef2f6; color: #667085; font-weight: 700; }
  .task-compose-thread-copy { display: grid; gap: 6px; min-width: 0; }
  .task-compose-thread-copy p { margin: 0; color: #667085; }
  .task-compose-thread-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .task-compose-thread-meta strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .task-compose-thread-meta span { color: #667085; font-size: .92rem; white-space: nowrap; }
  .task-compose-generator-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .task-compose-generator-option { display: inline-flex; align-items: center; gap: 8px; color: #344054; font-weight: 600; }
  .task-compose-generator-option input { accent-color: #2962f2; }
  .task-compose-note { display: grid; gap: 4px; padding: 14px 16px; border-radius: 16px; background: #f8fafc; border: 1px solid #e5e7eb; }
  .task-compose-note strong, .task-compose-note p { margin: 0; }
  .task-compose-note p { color: #667085; }
  .task-compose-address-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
  .task-compose-recipient-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; }
  .task-compose-recipient-option { color: #667085; font-weight: 600; }
  .task-compose-editor { min-height: 180px; background: #f8fafc; }
  .task-compose-toolbar { display: flex; align-items: center; gap: 18px; padding: 0 10px; color: #111827; font-size: 1.2rem; }
  .task-compose-toolbar span { font-weight: 600; }
  .task-compose-invoice-attachment-panel {
    display: grid;
    grid-template-columns: minmax(220px, 1.1fr) minmax(220px, 1fr) auto;
    gap: 12px;
    align-items: end;
    padding: 0 10px;
  }
  .task-compose-invoice-attachment-fields { display: grid; gap: 8px; }
  .task-compose-attach-invoice-button { min-height: 44px; }
  .task-compose-attachment-trigger {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #111827;
    font-size: .95rem;
    font-weight: 600;
    cursor: pointer;
  }
  .task-compose-attachment-trigger svg { width: 18px; height: 18px; }
  .task-compose-attachment-row { display: grid; gap: 8px; padding: 0 10px; }
  .task-compose-attachment-input {
    width: fit-content;
    max-width: 100%;
    font-size: .9rem;
    color: #475467;
  }
  .task-compose-attachment-hint {
    margin: 0;
    color: #667085;
    font-size: .82rem;
    line-height: 1.4;
  }

  .home-segmented { display: flex; align-items: center; gap: 8px; padding: 14px 22px 0; flex-wrap: wrap; }
  .home-segmented-compact { padding: 0; gap: 4px; }
  .home-segment { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; padding: 0 14px; border-radius: 12px; border: 1px solid #d0d5dd; background: white; color: #475467; font-size: .82rem; font-weight: 600; }
  .home-segment.is-active { background: #111827; border-color: #111827; color: white; }
  .home-task-list { display: grid; margin-top: 12px; }
  .home-task-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 22px; border-top: 1px solid #f1f5f9; }
  .home-task-row:hover { background: #f8fafc; }
  .home-task-main { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .home-task-main strong { display: block; font-size: .9rem; font-weight: 600; }
  .home-task-icon { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; color: var(--success); }
  .home-task-icon svg { width: 14px; height: 14px; }
  .home-count-badge { min-width: 38px; height: 28px; padding: 0 10px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: #f8fafc; border: 1px solid #e2e8f0; color: #344054; font-size: .84rem; font-weight: 700; }
  .home-metric-list { display: grid; gap: 10px; padding: 18px 20px 18px; }
  .home-metric-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; color: #475467; font-size: .88rem; }
  .home-metric-row strong { color: var(--text); font-size: .92rem; }
  .home-divider { height: 1px; background: #e5e7eb; margin: 2px 0; }
  .home-snapshot-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 14px; padding: 18px 20px 18px; }
  .home-snapshot-cell { display: grid; gap: 4px; }
  .home-snapshot-cell strong { font-size: 1rem; line-height: 1.1; }
  .home-snapshot-cell span { color: #667085; font-size: .72rem; letter-spacing: 0; text-transform: none; }
  .home-snapshot-cell-right { text-align: right; }
  .aging-chart { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; padding: 18px 20px 20px; align-items: end; min-height: 220px; }
  .aging-bar-group { display: grid; gap: 8px; justify-items: center; }
  .aging-bar-group strong { font-size: .78rem; font-weight: 600; }
  .aging-bar-group span { color: #98a2b3; font-size: .72rem; }
  .aging-bar-track { width: 100%; max-width: 40px; height: 128px; border-radius: 12px; background: #f1f5f9; display: flex; align-items: flex-end; overflow: hidden; }
  .aging-bar-fill { width: 100%; border-radius: 12px 12px 0 0; }
  .aging-current { background: #10b981; }
  .aging-1-30, .aging-due, .aging-days-1-30 { background: #7c3aed; }
  .aging-31-60, .aging-days-31-60 { background: #f59e0b; }
  .aging-61-90, .aging-days-61-90 { background: #ef4444; }
  .aging-91, .aging-91-plus, .aging-days-90-plus { background: #dc2626; }

  .home-reference-page {
    gap: 20px;
    align-content: start;
  }
  .home-reference-block {
    display: grid;
    gap: 14px;
  }
  .home-reference-heading,
  .home-reference-heading-split,
  .home-reference-chart-header,
  .home-reference-calendar-top,
  .home-reference-calendar-title,
  .home-reference-calendar-actions,
  .home-reference-banner,
  .home-reference-bullets li,
  .home-reference-donut-layout,
  .home-reference-legend-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .home-reference-heading,
  .home-reference-chart-header,
  .home-reference-banner,
  .home-reference-bullets li {
    justify-content: space-between;
  }
  .home-reference-heading h2,
  .home-reference-heading h3,
  .home-reference-chart-header h3 {
    margin: 0;
    color: #101828;
  }
  .home-reference-heading h2 {
    font-size: 1.95rem;
    line-height: 1.08;
    font-weight: 700;
  }
  .home-reference-heading p {
    margin: 6px 0 0;
    color: #667085;
    font-size: .92rem;
  }
  .home-reference-heading-slim h3 {
    font-size: 1.05rem;
  }
  .home-reference-count {
    min-width: 22px;
    height: 22px;
    padding: 0 7px;
    border-radius: 999px;
    background: #eef2f6;
    color: #667085;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: .78rem;
    font-weight: 700;
  }
  .home-reference-link {
    color: #2457f5;
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
  }
  .home-reference-link:hover {
    color: #153fcc;
  }
  .home-reference-setup-card,
  .home-reference-calendar-card,
  .home-reference-chart-card {
    background: #ffffff;
    border: 1px solid #d8dee8;
    border-radius: 14px;
    box-shadow: 0 8px 20px rgba(15, 23, 42, .03);
  }
  .home-reference-setup-card {
    min-height: 54px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #344054;
  }
  .home-reference-setup-check {
    width: 14px;
    height: 14px;
    border-radius: 2px;
    background: #3f3f46;
    flex: 0 0 auto;
  }
  .home-reference-tasks {
    gap: 16px;
  }
  .home-reference-calendar-card {
    padding: 18px 18px 12px;
    display: grid;
    gap: 16px;
  }
  .home-reference-calendar-title {
    color: #344054;
    font-size: .86rem;
    font-weight: 500;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
  .home-reference-calendar-title svg {
    width: 14px;
    height: 14px;
  }
  .home-reference-calendar-title strong {
    color: #667085;
    font-size: .8rem;
    font-weight: 500;
  }
  .home-reference-pill,
  .home-reference-inline-button {
    min-height: 26px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid #d8dee8;
    background: #ffffff;
    color: #344054;
    font: inherit;
    text-decoration: none;
  }
  .home-reference-pill {
    display: inline-flex;
    align-items: center;
    font-size: .78rem;
    font-weight: 600;
  }
  .home-reference-inline-button {
    cursor: pointer;
    font-size: .78rem;
  }
  .home-reference-calendar-grid {
    display: grid;
    grid-template-columns: 32px repeat(7, minmax(0, 1fr)) 32px;
    gap: 14px;
    align-items: end;
  }
  .home-reference-calendar-nav {
    width: 32px;
    height: 32px;
    border: 0;
    background: transparent;
    color: #667085;
    display: grid;
    place-items: center;
    cursor: pointer;
    text-decoration: none;
  }
  .home-reference-calendar-nav svg {
    width: 16px;
    height: 16px;
  }
  .home-reference-calendar-day {
    min-height: 64px;
    padding: 10px 12px;
    border: 1px solid transparent;
    border-radius: 10px;
    display: grid;
    justify-items: center;
    gap: 4px;
    color: #667085;
    font-size: .8rem;
  }
  .home-reference-calendar-day strong {
    color: #101828;
    font-size: 1.15rem;
    line-height: 1;
  }
  .home-reference-calendar-day small {
    max-width: 100%;
    color: #667085;
    font-size: .64rem;
    line-height: 1.15;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .home-reference-calendar-day.is-active {
    background: #ffffff;
    border-color: #d7e6ff;
    box-shadow: 0 8px 18px rgba(36, 87, 245, .08);
    color: #2457f5;
  }
  .home-reference-calendar-day.is-active strong {
    color: #2457f5;
  }
  .home-reference-empty,
  .home-reference-chart-empty {
    margin: 0;
    color: #667085;
    font-size: .84rem;
    line-height: 1.45;
  }
  .home-reference-empty {
    padding: 0 2px 2px;
  }
  .home-reference-chart-empty {
    min-height: 142px;
    padding: 18px;
    display: grid;
    place-items: center;
    text-align: center;
  }
  .home-reference-empty-list-item {
    list-style: none;
    margin-left: -16px;
  }
  .home-reference-banner {
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #ffffff;
    color: #344054;
    font-size: .9rem;
  }
  .home-reference-banner span {
    position: relative;
    padding-left: 16px;
  }
  .home-reference-banner span::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    width: 6px;
    height: 6px;
    margin-top: -3px;
    border-radius: 999px;
    background: #111827;
  }
  .home-reference-list-section {
    display: grid;
    gap: 10px;
  }
  .home-reference-bullets {
    list-style: disc;
    margin: 0;
    padding-left: 16px;
    display: grid;
    gap: 8px;
  }
  .home-reference-bullets li {
    color: #344054;
    font-size: .92rem;
  }
  .home-reference-bullets-single strong {
    font-weight: 700;
  }
  .home-reference-chart-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .home-reference-chart-card {
    min-height: 196px;
    overflow: hidden;
  }
  .home-reference-chart-header {
    padding: 12px 14px;
    border-bottom: 1px solid #edf2f7;
  }
  .home-reference-chart-header h3 {
    font-size: .86rem;
    font-weight: 500;
  }
  .home-reference-kebab {
    border: 0;
    background: transparent;
    color: #98a2b3;
    cursor: pointer;
  }
  .home-reference-bar-chart {
    padding: 18px 18px 24px;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    gap: 10px;
    min-height: 160px;
  }
  .home-reference-bar-axis {
    display: grid;
    align-content: space-between;
    color: #98a2b3;
    font-size: .7rem;
    text-align: right;
    padding: 4px 0 14px;
  }
  .home-reference-bar-columns {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 16px;
    align-items: end;
  }
  .home-reference-bar-column {
    display: grid;
    gap: 8px;
    justify-items: center;
    color: #667085;
    font-size: .72rem;
    position: relative;
    outline: none;
  }
  .chart-tooltip {
    position: absolute;
    z-index: 4;
    min-width: 132px;
    max-width: 210px;
    padding: 8px 10px;
    border-radius: 8px;
    background: #111827;
    color: #ffffff;
    box-shadow: 0 10px 24px rgba(15, 23, 42, .18);
    opacity: 0;
    pointer-events: none;
    transform: translateY(4px);
    transition: opacity .15s ease, transform .15s ease;
  }
  .chart-tooltip strong {
    display: block;
    color: #ffffff;
    font-size: .88rem;
    line-height: 1.1;
  }
  .chart-tooltip span {
    display: block;
    margin-top: 3px;
    color: rgba(255, 255, 255, .78);
    font-size: .72rem;
    line-height: 1.25;
  }
  .home-reference-chart-tooltip {
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translate(-50%, 4px);
    text-align: center;
  }
  .home-reference-bar-column:hover .home-reference-chart-tooltip,
  .home-reference-bar-column:focus .home-reference-chart-tooltip {
    opacity: 1;
    transform: translate(-50%, 0);
  }
  .home-reference-bar-rail {
    width: 100%;
    max-width: 60px;
    height: 94px;
    border-radius: 8px 8px 0 0;
    background: transparent;
    display: flex;
    align-items: end;
  }
  .home-reference-bar-fill {
    width: 100%;
    border-radius: 8px 8px 0 0;
    background: linear-gradient(180deg, #6d95f5 0%, #5a83e8 100%);
  }
  .home-reference-donut-layout {
    justify-content: center;
    padding: 18px;
    gap: 24px;
  }
  .home-reference-donut-wrap {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
  }
  .home-reference-donut {
    width: 84px;
    height: 84px;
    border-radius: 50%;
    display: grid;
    place-items: center;
  }
  .home-reference-donut-hole {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #ffffff;
  }
  .home-reference-legend {
    display: grid;
    gap: 10px;
    min-width: 150px;
  }
  .home-reference-legend-row {
    justify-content: flex-start;
    color: #667085;
    font-size: .84rem;
  }
  .home-reference-legend-row i {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    display: inline-block;
    flex: 0 0 auto;
  }

  .deductions-page, .deduction-detail-page { gap: 14px; }
  .deductions-shell, .deduction-detail-shell { display: grid; gap: 14px; }
  .deductions-top-row, .deduction-detail-header, .deduction-card-header, .deductions-table-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .deductions-page-tabs, .deductions-subtabs, .deduction-pill-row { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
  .deductions-page-tab { padding: 0 0 8px; border-bottom: 2px solid transparent; color: #667085; font-weight: 600; text-decoration: none; }
  .deductions-page-tab.is-active, .deductions-subtab.is-active { color: #0f172a; border-bottom-color: #0f172a; }
  .deductions-configure-button { min-height: 36px; padding: 0 14px; border-radius: 10px; }
  .deductions-toolbar { display: grid; grid-template-columns: minmax(340px, 1fr) auto; gap: 14px 16px; align-items: start; }
  .deductions-toolbar-filters { display: grid; gap: 10px; min-width: 0; }
  .deductions-toolbar-chip-row, .deductions-toolbar-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .deductions-searchbox { min-height: 42px; display: flex; align-items: center; gap: 10px; padding: 0 14px; border-radius: 12px; background: #f8fafc; border: 1px solid #eef2f7; color: #98a2b3; }
  .deductions-searchbox svg, .deductions-date-filters svg, .deduction-action-icons svg, .deductions-document-icons svg, .deduction-inline-value svg, .deduction-inline-link svg, .deduction-metadata-list svg, .deduction-back-link svg, .deductions-active-filters svg, .deduction-icon-button svg, .deductions-row-trash svg { width: 16px; height: 16px; }
  .deductions-compact-chip { min-height: 38px; padding: 0 12px; border-radius: 11px; font-size: .92rem; }
  .deductions-active-filters { display: inline-flex; align-items: center; gap: 6px; color: #667085; font-size: .9rem; min-height: 38px; }
  .deductions-filter-clear, .deduction-icon-button { width: 28px; height: 28px; border: 0; border-radius: 999px; background: transparent; color: #98a2b3; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
  .deductions-dark-button { min-height: 38px; padding: 0 12px; border-radius: 10px; display: inline-flex; align-items: center; gap: 8px; background: #111827; border-color: #111827; font-size: .92rem; }
  .deductions-date-filters { display: grid; gap: 8px; color: #667085; font-size: .9rem; }
  .deductions-date-filters span { display: inline-flex; align-items: center; gap: 8px; }
  .deductions-subtabs { gap: 24px; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb; }
  .deductions-subtab { padding-bottom: 8px; border-bottom: 2px solid transparent; color: #667085; font-weight: 600; }
  .deductions-table-card, .deduction-card, .deduction-credit-draft { border: 1px solid #d9e0ea; border-radius: 16px; background: white; overflow: hidden; }
  .deductions-table { display: grid; grid-template-columns: 1.3fr 1.25fr .82fr .72fr .88fr 1.65fr .48fr .72fr .72fr 44px; align-items: center; }
  .deductions-table > div { padding: 11px 14px; border-bottom: 1px solid #edf2f7; font-size: .9rem; color: #0f172a; }
  .deductions-table-header { background: #f8fafc; }
  .deductions-table-header > div { font-size: .7rem; text-transform: uppercase; letter-spacing: .05em; color: #667085; font-weight: 700; }
  .deductions-row-link { text-decoration: none; color: inherit; }
  .deductions-row-link:hover { background: #fbfdff; }
  .deductions-reference-cell, .deductions-document-icons, .deduction-action-icons, .deduction-inline-value, .deduction-inline-link, .deduction-back-link { display: inline-flex; align-items: center; gap: 8px; }
  .deductions-reference-cell svg { color: #f59e0b; }
  .deductions-muted { color: #98a2b3 !important; }
  .deductions-inline-link { color: #2457f5 !important; font-weight: 600; }
  .deduction-status-pill { display: inline-flex; align-items: center; min-height: 22px; padding: 0 10px; border-radius: 999px; font-size: .78rem; font-weight: 700; border: 1px solid transparent; }
  .deduction-status-research { background: #fef3c7; color: #a16207; border-color: #fbbf24; }
  .deduction-status-draft { background: #dbeafe; color: #2563eb; border-color: #93c5fd; }
  .deduction-status-matched { background: #ede9fe; color: #6d28d9; border-color: #c4b5fd; }
  .deductions-row-trash { color: #c0c8d4; display: inline-flex; justify-content: center; }
  .deductions-table-footer { padding: 12px 16px; color: #667085; font-size: .9rem; }
  .deduction-back-link { color: #475467; text-decoration: none; font-size: .92rem; }
  .deduction-detail-header h1 { margin: 0; font-size: 2rem; line-height: 1.08; color: #1f2937; }
  .deduction-detail-grid { display: grid; grid-template-columns: minmax(0, 1fr) 640px; gap: 18px; align-items: start; }
  .deduction-card { padding: 18px; display: grid; gap: 18px; }
  .deduction-card h2, .deduction-credit-draft h3 { margin: 0; color: #1f2937; }
  .deduction-summary-grid, .deduction-credit-summary, .deduction-credit-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 18px; }
  .deduction-summary-block { display: grid; gap: 6px; }
  .deduction-summary-block strong { color: #1f2937; }
  .deduction-total-amount { font-size: 1.9rem; line-height: 1; }
  .deduction-metadata-list { display: grid; gap: 12px; }
  .deduction-metadata-list > div { display: flex; align-items: center; justify-content: space-between; gap: 18px; color: #667085; font-size: .92rem; }
  .deduction-metadata-list strong { display: inline-flex; align-items: center; gap: 8px; color: #1f2937; text-align: right; }
  .deduction-line-card { padding: 0; }
  .deduction-line-table, .deduction-credit-table { display: grid; grid-template-columns: 54px .8fr .8fr .7fr 1.25fr .6fr .5fr .72fr .7fr .45fr .7fr; align-items: center; }
  .deduction-credit-table { grid-template-columns: 56px 1fr 2fr .9fr .7fr .5fr .8fr .7fr; }
  .deduction-line-table > div, .deduction-credit-table > div { padding: 14px 12px; border-bottom: 1px solid #edf2f7; font-size: .9rem; }
  .deduction-line-table-header, .deduction-credit-table-header { background: #f8fafc; }
  .deduction-line-table-header > div, .deduction-credit-table-header > div { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: #667085; font-weight: 700; }
  .deduction-action-icons { color: #98a2b3; }
  .deduction-action-icons svg:last-child { color: #ef4444; }
  .deduction-line-total, .deduction-credit-total { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; }
  .deduction-line-total-value { display: inline-flex; align-items: center; gap: 14px; }
  .deduction-line-total-value svg { color: #98a2b3; width: 16px; height: 16px; }
  .deduction-note-card p { margin: 0; color: #475467; }
  .deduction-credit-card { gap: 22px; }
  .deduction-credit-summary { padding-right: 12px; }
  .deduction-credit-draft { padding: 18px; gap: 18px; }
  .deduction-mini-pill { display: inline-flex; align-items: center; min-height: 20px; padding: 0 10px; border-radius: 999px; font-size: .74rem; font-weight: 700; text-decoration: none; }
  .deduction-mini-pill-matched { background: #ede9fe; color: #7c3aed; }
  .deduction-mini-pill-link { background: #dbeafe; color: #2457f5; }

  .task-page {
    --task-table-columns: minmax(0, 2.8fr) minmax(0, 1.35fr) minmax(0, .95fr) minmax(0, .95fr) minmax(0, .85fr) minmax(0, 1.2fr) minmax(0, .95fr) minmax(0, .55fr);
    gap: 12px;
    align-content: start;
    min-width: 0;
  }
  .task-page .page-header-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 12px;
    min-width: 0;
  }
  .task-page .page-header-actions { justify-self: end; align-self: start; }
  .task-page .page-header { gap: 4px; }
  .task-page .page-header h1 { font-size: 1.3rem; line-height: 1.08; }
  .task-page .page-header p { font-size: .84rem; line-height: 1.35; }
  .task-summary-grid { gap: 12px; grid-auto-rows: 84px; }
  .task-page-actions { gap: 10px; }
  .task-toolbar-button { display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 12px; font-size: .86rem; border-radius: 10px; }
  .task-toolbar-button svg { width: 14px; height: 14px; }
  .task-summary-card {
    min-height: 84px;
    height: 100%;
    padding: 12px 16px;
    border-radius: 14px;
    border: 1px solid var(--line);
    background: white;
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 6px;
  }
  .task-summary-card p, .task-summary-card strong { margin: 0; }
  .task-summary-card p { color: #667085; font-size: .78rem; font-weight: 500; }
  .task-summary-card strong { font-size: 1.1rem; line-height: 1; }
  .task-table-shell { padding: 14px; display: grid; gap: 10px; border-radius: 16px; min-width: 0; overflow: hidden; }
  .task-filter-bar {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) 132px 132px 140px auto auto auto;
    gap: 10px;
    align-items: center;
    min-width: 0;
  }
  .task-search {
    min-height: 36px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border-radius: 10px;
    background: #f3f5f8;
    border: 1px solid #e9edf3;
    color: #98a2b3;
    font-size: .82rem;
  }
  .task-search svg { width: 14px; height: 14px; }
  .task-search input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #111827;
    font: inherit;
  }
  .task-search input::placeholder { color: #98a2b3; }
  .task-select {
    min-width: 0;
    min-height: 36px;
    padding: 0 12px;
    border-radius: 10px;
    background: #f8fafc;
    border-color: #e9edf3;
    border-style: solid;
    color: #344054;
    font-size: .82rem;
    font-weight: 600;
  }
  .task-filter-submit {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: .82rem;
  }
  .task-filter-submit svg { width: 14px; height: 14px; }
  .task-filter-clear,
  .task-search-clear-history {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: .82rem;
  }
  .task-search-clear-history { white-space: nowrap; }
  .task-table { display: grid; gap: 0; min-width: 0; width: 100%; }
  .task-table-header, .task-table-row {
    display: grid;
    grid-template-columns: var(--task-table-columns);
    align-items: center;
    min-width: 0;
    width: 100%;
  }
  .task-table-header { border-top: 1px solid #eef2f6; background: #fbfcfe; }
  .task-table-row { border-bottom: 1px solid #eef2f6; }
  .task-table-head, .task-table-cell {
    padding: 10px 12px;
    min-width: 0;
    overflow: hidden;
  }
  .task-table-head {
    color: #667085;
    font-size: .7rem;
    font-weight: 700;
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .task-table-head-actions, .task-table-cell-actions { justify-self: end; }
  .task-table-cell {
    display: grid;
    align-content: center;
    gap: 5px;
    min-height: 42px;
    font-size: .8rem;
  }
  .task-table-cell strong { margin: 0; font-size: .76rem; line-height: 1.2; }
  .task-row-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    color: #667085;
    font-size: .66rem;
  }
  .task-row-meta span + span::before { content: "·"; margin-right: 8px; color: #98a2b3; }
  .task-table-empty {
    min-height: 120px;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 6px;
    padding: 24px;
    border-bottom: 1px solid #eef2f6;
    color: #667085;
    text-align: center;
  }
  .task-table-empty strong { color: #111827; }
  .task-table-empty p { margin: 0; line-height: 1.45; }
  .task-type-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: fit-content;
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid transparent;
    font-size: .68rem;
    font-weight: 700;
    line-height: 1;
  }
  .task-type-icon {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: currentColor;
    opacity: .8;
  }
  .task-type-collection { background: #dbeafe; border-color: #bfdbfe; color: #2563eb; }
  .task-type-cash_app { background: #d9f7e7; border-color: #a7f3d0; color: #0f9d67; }
  .task-type-deduction { background: #ffefc7; border-color: #fbd38d; color: #c2410c; }
  .task-type-integration { background: #f3e8ff; border-color: #ddd6fe; color: #9333ea; }
  .task-type-credit_line { background: #e0e7ff; border-color: #c7d2fe; color: #4f46e5; }
  .task-assignee { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
  .task-assignee strong { min-width: 0; overflow-wrap: anywhere; }
  .task-assignee-avatar {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: #d9f7e7;
    color: #0f9d67;
    font-size: .66rem;
    font-weight: 700;
    flex: 0 0 auto;
  }
  .task-table-plain { font-weight: 500; }
  .task-source-label { color: #475467; font-weight: 700; }
  .task-table-cell .pill { padding: 3px 9px; font-size: .68rem; }
  .task-view-link { font-weight: 700; color: #111827; font-size: .78rem; }
  .task-view-link:hover { color: #059669; }

  .customers-module-shell { display: grid; gap: 20px; }
  .customers-module-header {
    background: white;
    border: 1px solid #e7ebf2;
    padding: 12px 18px 0;
    border-radius: 0;
  }
  .customers-toolbar, .customers-toolbar-main, .customers-detail-top, .customers-contact-row, .customers-overview-stat, .customers-table-footer, .customers-activity-row, .customers-activity-main, .customers-activity-heading, .customers-activity-meta, .customers-contact-actions { display: flex; align-items: center; gap: 12px; }
  .customers-toolbar, .customers-detail-top, .customers-contact-row, .customers-overview-stat, .customers-table-footer, .customers-activity-row { justify-content: space-between; }
  .customers-toolbar { padding: 12px 0; flex-wrap: wrap; }
  .customers-toolbar-main { flex: 1; flex-wrap: wrap; }
  .customers-searchbox {
    min-height: 40px;
    min-width: 340px;
    padding: 0 12px;
    border: 1px solid #dbe1e8;
    border-radius: 10px;
    background: #f8fafc;
    color: #98a2b3;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: .92rem;
  }
  .customers-searchbox svg, .customers-filter-button svg, .customers-export-button svg, .customers-dark-button svg, .customers-icon-button svg, .customers-activity-icon svg { width: 16px; height: 16px; }
  .customers-filter-button, .customers-export-button, .customers-dark-button, .customers-outline-button, .customers-icon-button {
    min-height: 32px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid #d0d5dd;
    background: white;
    color: #111827;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
  }
  .customers-export-button, .customers-dark-button { background: #111827; border-color: #111827; color: white; }
  .customers-dark-button:disabled, .customers-outline-button:disabled {
    opacity: .55;
    cursor: not-allowed;
  }
  .customers-icon-button { width: 32px; justify-content: center; padding: 0; }
  .customers-back-link { color: #667085; font-size: 1rem; font-weight: 600; }
  .customers-breadcrumb-separator { color: #98a2b3; }
  .customers-title-group .title-with-pills h2 { font-size: 1.85rem; }
  .customers-assignee-pill, .customers-tag-pill, .customers-activity-tag {
    display: inline-flex;
    align-items: center;
    min-height: 26px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid #e4e7ec;
    background: #f7f8fa;
    color: #344054;
    font-size: .8rem;
    font-weight: 600;
  }
  .customers-tabbar { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; border-top: 1px solid #eef2f6; }
  .customers-tab {
    display: inline-flex;
    align-items: center;
    min-height: 36px;
    padding: 0 2px;
    border: 1px solid transparent;
    color: #111827;
    font-size: .92rem;
  }
  .customers-tab.is-active { padding: 0 10px; border-color: #111827; }
  .customers-call-status {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 12px 0 14px;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: .9rem;
    font-weight: 600;
    line-height: 1.4;
  }
  .customers-call-status svg { width: 16px; height: 16px; flex: 0 0 auto; }
  .customers-call-status.is-started { background: #dcfce7; border: 1px solid #bbf7d0; color: #166534; }
  .customers-call-status.is-failed { background: #fee2e2; border: 1px solid #fecaca; color: #991b1b; }
  .customer-call-modal {
    position: fixed;
    inset: 0;
    z-index: 48;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 24px 18px;
  }
  .customer-call-modal:target { display: flex; }
  .customer-call-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(17, 24, 39, .44);
  }
  .customer-call-panel {
    position: relative;
    width: min(520px, calc(100vw - 36px));
    display: grid;
    gap: 16px;
    padding: 22px;
    border-radius: 14px;
    border: 1px solid #d9e0ea;
    background: white;
    box-shadow: 0 24px 60px rgba(15, 23, 42, .22);
  }
  .customer-call-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .customer-call-head h2, .customer-call-head p, .customer-call-helper { margin: 0; }
  .customer-call-head h2 { font-size: 1.15rem; line-height: 1.25; letter-spacing: 0; }
  .customer-call-head p, .customer-call-helper { color: #667085; font-size: .9rem; line-height: 1.45; }
  .customer-call-close {
    color: #667085;
    font-size: 1.8rem;
    line-height: .9;
    text-decoration: none;
  }
  .customer-call-field {
    display: grid;
    gap: 8px;
    color: #344054;
    font-size: .9rem;
    font-weight: 700;
  }
  .customer-call-field input {
    min-height: 42px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid #d0d5dd;
    color: #111827;
    font: inherit;
    font-weight: 500;
  }
  .customer-call-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
  }
  .customers-table-card, .customers-activity-card { background: white; border: 1px solid #dfe5ec; border-radius: 16px; overflow: hidden; }
  .customers-table { display: grid; }
  .customers-index-table { grid-template-columns: .6fr 2fr 1fr .95fr 1.7fr .9fr .9fr 1fr 1fr; }
  .customers-invoice-table { grid-template-columns: .55fr 1.15fr 1.2fr .9fr .9fr .85fr 1fr 1fr 1fr .85fr; }
  .customers-task-table { grid-template-columns: .55fr 1.3fr 1.7fr .9fr .9fr .8fr .9fr; }
  .customers-payment-table { grid-template-columns: 1fr 1.2fr .9fr .9fr 1.8fr; }
  .customers-table-head, .customers-table-cell {
    min-height: 54px;
    padding: 14px 16px;
    border-bottom: 1px solid #e9edf2;
    display: flex;
    align-items: center;
    color: #344054;
    font-size: .9rem;
  }
  .customers-table-head {
    color: #667085;
    font-size: .76rem;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
    background: #fbfcfd;
  }
  .customers-empty-row { grid-column: 1 / -1; min-height: 160px; display: grid; place-content: center; gap: 8px; padding: 28px; color: #667085; text-align: center; border-bottom: 1px solid #e9edf2; }
  .customers-empty-row strong { color: #111827; font-size: 1rem; }
  .customers-table-cell.amount, .customers-table-head.amount { justify-content: flex-end; }
  .customers-row-select { display: inline-flex; align-items: center; gap: 10px; color: #98a2b3; }
  .customer-status-dot { width: 7px; height: 7px; border-radius: 999px; display: inline-flex; }
  .customer-status-dot.is-danger { background: #ef4444; }
  .customer-status-dot.is-warning { background: #f59e0b; }
  .customer-status-dot.is-neutral { background: #cbd5e1; }
  .customers-expand-mark { font-size: 1.1rem; line-height: 1; }
  .customers-primary-link { font-weight: 600; color: #111827; }
  .customers-primary-link:hover { color: #0e9f6e; }
  .customers-detail-grid { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(280px, .55fr); gap: 18px; align-items: start; }
  .customers-detail-main, .customers-detail-side { display: grid; gap: 18px; }
  .customers-section-card, .customers-overview-card, .customers-ap-portal-card { display: grid; gap: 16px; }
  .customers-insight-card {
    display: grid;
    gap: 14px;
    padding: 18px 20px;
    border-radius: 16px;
    border: 1px solid #bfdbfe;
    background: #eef5ff;
  }
  .customers-bullet-list { margin: 0; padding-left: 18px; display: grid; gap: 10px; color: #344054; }
  .customers-contact-list { display: grid; gap: 0; border-top: 1px solid #eef2f6; }
  .customers-contact-row { padding: 14px 0; border-bottom: 1px solid #eef2f6; }
  .customers-contact-row p, .customers-activity-row p { margin: 4px 0 0; color: #667085; font-size: .88rem; }
  .customers-overview-stat { padding: 12px 0; border-bottom: 1px solid #eef2f6; }
  .customers-overview-stat:last-child { border-bottom: 0; }
  .customers-table-footer { padding: 16px 18px; flex-wrap: wrap; color: #475467; font-size: .92rem; }
  .customers-chip-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 14px 18px; border-bottom: 1px solid #eef2f6; background: #fbfcfd; }
  .customers-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid #d0d5dd;
    background: #f8fafc;
    color: #344054;
    font-size: .8rem;
    font-weight: 600;
  }
  .customers-inline-toolbar { padding: 14px 18px; border-bottom: 1px solid #eef2f6; }
  .customers-activity-card { display: grid; }
  .customers-activity-row { padding: 16px 18px; border-bottom: 1px solid #eef2f6; align-items: flex-start; }
  .customers-activity-main { align-items: flex-start; }
  .customers-activity-icon {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: #f8fafc;
    color: #667085;
    flex: 0 0 auto;
  }
  .customers-activity-heading { justify-content: flex-start; }
  .customers-activity-heading span { color: #344054; }
  .customers-activity-tags { display: flex; align-items: center; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .customers-activity-meta { flex-direction: column; align-items: flex-end; color: #667085; font-size: .85rem; }

  @media (max-width: 1500px) {
    .kpi-grid-5, .kpi-grid-6, .card-grid-3, .four-up, .endpoints-grid, .type-chip-grid, .cash-workspace-grid, .two-column-layout, .analytics-kpi-grid, .deduction-detail-grid, .deduction-summary-grid, .deduction-credit-summary, .deduction-credit-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .analytics-impact-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .filter-row, .cash-meta-grid, .task-filter-bar, .deductions-toolbar { grid-template-columns: 1fr 1fr; }
    .cash-review-table, .residual-grid, .finalize-grid { grid-template-columns: 1fr; }
    .cash-table-payments, .cash-table-bank, .cash-table-remittances { grid-template-columns: 1fr 1fr; }
  }

  @media (max-width: 1280px) {
    .dashboard-app { grid-template-columns: 1fr; }
    .dashboard-sidebar { border-right: 0; border-bottom: 1px solid var(--navy-border); }
    .command-center-grid, .hero-lower-grid, .kpi-grid-4, .kpi-grid-5, .kpi-grid-6, .card-grid-2, .card-grid-3, .four-up, .detail-grid, .endpoints-grid, .type-chip-grid, .filter-row, .cash-meta-grid, .cash-workspace-grid, .residual-grid, .finalize-grid, .two-column-layout, .collections-toolbar, .collections-email-toolbar, .collections-compose-grid, .call-agent-settings-grid, .task-filter-bar, .task-detail-summary-grid, .task-detail-context-grid, .analytics-kpi-grid, .analytics-impact-grid, .analytics-grid-trends, .deduction-detail-grid, .deduction-summary-grid, .deduction-credit-summary, .deduction-credit-meta, .deductions-toolbar, .customers-detail-grid { grid-template-columns: 1fr; }
    .table-collections-extended, .table-invoices, .table-exceptions, .table-inventory, .cash-review-table, .cash-table-payments, .cash-table-bank, .cash-table-remittances, .deductions-table, .deduction-line-table, .deduction-credit-table, .customers-index-table, .customers-invoice-table, .customers-task-table, .customers-payment-table { grid-template-columns: 1fr; }
    .invoice-detail-top-grid { grid-template-columns: 1fr; }
    .invoice-ledger-toolbar { flex-wrap: wrap; }
    .invoice-ledger-search { min-width: 100%; }
    .task-table-row { grid-template-columns: 1fr; }
    .table-head, .task-table-head, .task-table-header, .cash-table-head, .deductions-table-header, .deduction-line-table-header, .deduction-credit-table-header, .customers-table-head { display: none; }
    .table-cell, .task-table-cell, .cash-table-cell, .customers-table-cell { min-height: auto; }
    .data-source-hero { grid-template-columns: 1fr; }
    .collections-inbox-row, .collections-hero, .collections-email-head, .collections-inbox-footer, .collections-compose-header, .collections-compose-footer, .deductions-top-row, .deduction-detail-header, .deduction-card-header, .deductions-table-footer, .customers-activity-row, .customers-detail-top, .customers-toolbar, .customers-toolbar-main, .customers-table-footer { flex-direction: column; align-items: flex-start; }
    .call-agent-wide-section { grid-column: auto; }
    .collections-message-meta { justify-items: start; }
    .customers-searchbox { min-width: 100%; }
    .customers-activity-meta { align-items: flex-start; }
    .analytics-chart-panel { min-height: auto; }
    .home-reference-chart-grid, .home-reference-donut-layout { grid-template-columns: 1fr; }
    .home-reference-calendar-grid { grid-template-columns: 32px repeat(3, minmax(0, 1fr)) 32px; }
    .home-reference-calendar-day:nth-of-type(n + 5) { display: none; }
  }

  @media (max-width: 780px) {
    .topbar { height: auto; gap: 12px; padding: 16px; flex-direction: column; align-items: flex-start; }
    .page-scroll { padding: 18px 16px 28px; }
    .page-header-row, .panel-header, .header-actions, .section-heading, .detail-footer, .approval-request-header, .activity-feed-header, .integration-header, .rule-header, .cash-review-header { flex-direction: column; align-items: flex-start; }
    .invoice-detail-header, .invoice-detail-title, .invoice-detail-actions { flex-direction: column; align-items: flex-start; }
    .invoice-detail-actions { width: 100%; }
    .invoice-detail-action-button, .invoice-detail-icon-button { width: 100%; justify-content: center; }
    .invoice-detail-line-table,
    .invoice-detail-line-table-header { grid-template-columns: 1fr; }
    .invoice-detail-line-table-header { display: none; }
    .invoice-detail-line-row { gap: 8px; }
    .invoice-detail-line-row > div {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding-right: 0;
      text-align: left;
    }
    .invoice-detail-line-row > div:nth-child(1)::before { content: "Description"; color: #667085; font-size: .72rem; font-weight: 700; text-transform: uppercase; }
    .invoice-detail-line-row > div:nth-child(2)::before { content: "Qty"; color: #667085; font-size: .72rem; font-weight: 700; text-transform: uppercase; }
    .invoice-detail-line-row > div:nth-child(3)::before { content: "Unit Price"; color: #667085; font-size: .72rem; font-weight: 700; text-transform: uppercase; }
    .invoice-detail-line-row > div:nth-child(4)::before { content: "Total"; color: #667085; font-size: .72rem; font-weight: 700; text-transform: uppercase; }
    .invoice-detail-activity-row {
      grid-template-columns: 20px auto minmax(0, 1fr);
      row-gap: 6px;
    }
    .invoice-detail-activity-reference,
    .invoice-detail-activity-date { justify-self: start; }
    .invoice-ledger-header, .invoice-ledger-toolbar, .invoice-ledger-summary { flex-direction: column; align-items: stretch; }
    .invoice-ledger-button, .invoice-ledger-select { width: 100%; justify-content: center; }
    .invoice-ledger-table,
    .invoice-ledger-table-header { grid-template-columns: 1fr; }
    .invoice-ledger-table-header { display: none; }
    .invoice-ledger-row { padding: 10px 0; }
    .invoice-ledger-cell {
      min-height: auto;
      padding: 6px 16px;
      justify-content: space-between;
      gap: 14px;
      border-bottom: 0;
    }
    .invoice-ledger-cell::before {
      content: attr(data-label);
      color: #667085;
      font-size: .72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .invoice-ledger-cell-checkbox {
      justify-content: flex-start;
      padding-bottom: 2px;
    }
    .invoice-ledger-cell-checkbox::before { display: none; }
    .invoice-customer-popover {
      left: 16px;
      right: 16px;
      width: auto;
      max-width: 260px;
    }
    .match-card { flex-direction: column; align-items: flex-start; }
    .data-source-row { flex-direction: column; align-items: flex-start; }
    .home-snapshot-grid, .aging-chart { grid-template-columns: 1fr 1fr; }
    .analytics-header-actions, .analytics-export-button, .analytics-impact-export-button, .analytics-trend-toggle { width: 100%; }
    .analytics-export-button, .analytics-impact-export-button { justify-content: center; }
    .analytics-impact-panel { padding: 24px 20px; }
    .analytics-trends-header { flex-direction: column; align-items: flex-start; }
    .analytics-trend-pill { flex: 1; justify-content: center; }
    .analytics-customer-row { grid-template-columns: 1fr; }
    .analytics-panel { padding: 22px 18px; }
    .analytics-customer-rank { line-height: 1; }
    .cash-module-header { min-height: 0; padding: 18px 16px 16px; gap: 12px; }
    .cash-module-header h1 { font-size: 1.08rem; }
    .cash-module-tab { min-height: 34px; font-size: .84rem; }
    .cash-module-tab.is-active { padding: 0 6px; }
    .cash-summary-card, .cash-highlight-card, .cash-toolbar, .cash-toolbar-main, .cash-toolbar-actions, .cash-table-footer { flex-direction: column; align-items: flex-start; }
    .collections-email-template-panel { grid-template-columns: 1fr; }
    .collections-filter-actions, .call-inbox-toolbar, .call-inbox-toolbar-actions { width: 100%; }
    .call-inbox-toolbar { flex-direction: column; align-items: stretch; }
    .call-inbox-filter, .call-inbox-filter.compact { width: 100%; }
    .cash-summary-card, .cash-highlight-card, .cash-note-card { min-height: auto; padding: 16px; border-radius: 14px; }
    .cash-summary-main strong { font-size: 1rem; }
    .cash-search { min-width: 100%; }
    .home-reference-heading-split, .home-reference-calendar-top, .home-reference-banner, .home-reference-bullets li, .home-reference-donut-layout { flex-direction: column; align-items: flex-start; }
    .home-reference-calendar-actions { width: 100%; justify-content: space-between; }
    .home-reference-inline-button { width: 100%; }
    .home-reference-calendar-grid { grid-template-columns: 24px repeat(2, minmax(0, 1fr)) 24px; gap: 10px; }
    .home-reference-calendar-day:nth-of-type(n + 4) { display: none; }
    .home-reference-chart-card { min-height: auto; }
    .home-reference-bar-chart { grid-template-columns: 24px minmax(0, 1fr); padding-inline: 14px; }
    .home-reference-bar-columns { gap: 10px; }
  }

  @media (min-width: 1281px) {
    .task-page .kpi-grid-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
    .task-page .task-filter-bar { grid-template-columns: minmax(0, 1fr) 150px 150px 150px auto auto auto; }
  }

  .control-center-page { gap: 26px; padding-top: 20px; }
  .control-center-hero { display: grid; gap: 12px; padding-top: 8px; }
  .control-center-hero h1, .control-center-hero p { margin: 0; }
  .control-center-hero h1 { font-size: 2rem; line-height: 1.04; letter-spacing: -0.035em; font-weight: 700; }
  .control-center-hero p { color: #6b7280; font-size: .98rem; font-weight: 500; line-height: 1.45; }
  .control-center-tabbar { display: flex; gap: 38px; align-items: flex-end; margin-top: 28px; padding-bottom: 22px; border-bottom: 1px solid #e5e7eb; }
  .control-center-tab { position: relative; padding: 0 0 14px; color: #667085; font-size: 1rem; font-weight: 600; }
  .control-center-tab.is-active { color: #111827; }
  .control-center-tab.is-active::after { content: ""; position: absolute; left: 0; right: 0; bottom: -22px; height: 3px; background: #1f2937; border-radius: 999px; }
  .control-center-intro-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-top: 12px; }
  .control-center-lead { margin: 0; color: #475467; font-size: .98rem; line-height: 1.45; }
  .control-center-button-with-icon { display: inline-flex; align-items: center; gap: 10px; }
  .control-center-button-with-icon svg { width: 16px; height: 16px; }
  .control-center-layout { display: block; }
  .control-center-main { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
  .control-center-card { background: transparent; border: 0; border-radius: 0; padding: 0; box-shadow: none; }
  .control-center-card-head, .control-center-stage-header, .control-center-inline-row, .control-center-template-row, .control-center-preview-grid { display: flex; justify-content: space-between; gap: 16px; }
  .control-center-card-head { align-items: center; margin-bottom: 14px; }
  .control-center-card-head h2, .control-center-card-head p, .control-center-stage-header h4, .control-center-stage-header p { margin: 0; }
  .control-center-card-head h2 { font-size: 1.35rem; line-height: 1.1; }
  .control-center-card-head p, .control-center-stage-header p { margin-top: 6px; color: #667085; font-size: .92rem; }
  .control-center-inline-form, .control-center-inline-actions { display: flex; gap: 12px; align-items: center; }
  .control-center-workflow-group, .control-center-stage-list { display: flex; flex-direction: column; gap: 14px; }
  .control-center-workflow-row, .control-center-stage-item, .control-center-template-row, .control-center-preview-panel { background: #fff; border: 1px solid #e6e8ec; border-radius: 20px; box-shadow: none; }
  .control-center-workflow-row { padding: 0; overflow: hidden; }
  .control-center-workflow-row summary { list-style: none; cursor: pointer; padding: 22px 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 90px; }
  .control-center-workflow-row summary::-webkit-details-marker { display: none; }
  .control-center-workflow-summary { display: flex; align-items: center; gap: 18px; min-width: 0; }
  .control-center-toggle-form { margin: 0; }
  .workflow-toggle { width: 52px; height: 28px; border: 0; padding: 4px; border-radius: 999px; background: #e8ebf1; display: inline-flex; align-items: center; transition: background .18s ease; }
  .workflow-toggle.is-active { background: #111827; }
  .workflow-toggle.is-disabled, .workflow-toggle:disabled { opacity: .48; cursor: not-allowed; }
  .workflow-toggle-knob { width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18); transform: translateX(0); transition: transform .18s ease; }
  .workflow-toggle.is-active .workflow-toggle-knob { transform: translateX(24px); }
  .control-center-workflow-copy h3, .control-center-workflow-copy p { margin: 0; }
  .control-center-workflow-copy h3 { font-size: 1.08rem; line-height: 1.22; font-weight: 700; color: #111827; }
  .control-center-workflow-copy p { margin-top: 6px; font-size: .84rem; color: #667085; }
  .control-center-workflow-actions, .control-center-stage-tags, .control-center-folder-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .workflow-stage-badge { display: inline-flex; align-items: center; padding: 5px 11px; border: 1px solid #e1e5ea; border-radius: 11px; background: #fff; color: #344054; font-size: .8rem; font-weight: 600; }
  .workflow-state-badge { display: inline-flex; align-items: center; padding: 5px 11px; border-radius: 999px; border: 1px solid transparent; font-size: .78rem; font-weight: 800; }
  .workflow-state-badge.is-active { background: #dcfce7; color: #166534; border-color: #bbf7d0; }
  .workflow-state-badge.is-inactive { background: #f8fafc; color: #475467; border-color: #e2e8f0; }
  .workflow-state-badge.is-unavailable { background: #fef3c7; color: #92400e; border-color: #fde68a; }
  .workflow-chevron { color: #98a2b3; font-size: .95rem; }
  .workflow-chevron-icon { width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; transition: transform .18s ease; }
  .workflow-chevron-icon svg { width: 16px; height: 16px; stroke-width: 1.9; }
  .control-center-workflow-row[open] .workflow-chevron-icon { transform: rotate(90deg); }
  .icon-button { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: 0; border-radius: 8px; background: transparent; color: #98a2b3; padding: 0; }
  .icon-button svg { width: 15px; height: 15px; stroke-width: 1.9; }
  .icon-button:hover { background: #f3f4f6; color: #667085; }
  .control-center-workflow-body { padding: 0 24px 24px; display: flex; flex-direction: column; gap: 22px; border-top: 1px solid #eef2f6; background: #fff; }
  .control-center-grid-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 22px; padding-top: 22px; }
  .control-center-grid-form label { display: flex; flex-direction: column; gap: 8px; color: #344054; font-size: 14px; font-weight: 600; }
  .control-center-grid-form input, .control-center-grid-form textarea, .control-center-grid-form select, .control-center-modal-form select {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #eef2f6;
    border-radius: 12px;
    background: #fbfbfc;
    padding: 11px 14px;
    font: inherit;
    color: #101828;
    box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.02);
  }
  .control-center-grid-form input[readonly], .call-agent-number-field input[readonly] { background: #f8fafc; color: #475467; }
  .control-center-field-help { color: #667085; font-size: .78rem; line-height: 1.35; font-weight: 500; }
  .control-center-field-help.is-unavailable { color: #b45309; }
  .control-center-form-actions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; align-items: center; }
  .control-center-action-banner {
    display: grid;
    gap: 4px;
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid #d0d5dd;
    background: white;
  }
  .control-center-action-banner strong, .control-center-action-banner p { margin: 0; }
  .control-center-action-banner p { color: #475467; line-height: 1.45; }
  .control-center-action-banner.is-success { border-color: #bbf7d0; background: #f0fdf4; }
  .control-center-action-banner.is-error { border-color: #fecaca; background: #fef2f2; }
  .control-center-grid-form textarea { min-height: 100px; resize: vertical; }
  .call-agent-settings-form { display: grid; gap: 18px; padding-top: 18px; }
  .call-agent-settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: stretch; }
  .call-agent-settings-section {
    display: grid;
    gap: 16px;
    padding: 18px;
    border: 1px solid #e3e8ef;
    border-radius: 16px;
    background: #fbfcfe;
  }
  .call-agent-wide-section { grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .call-agent-wide-section .call-agent-section-head { grid-column: 1 / -1; }
  .call-agent-section-head { display: flex; align-items: flex-start; gap: 12px; }
  .call-agent-section-head h3, .call-agent-section-head p { margin: 0; }
  .call-agent-section-head h3 { font-size: 1rem; line-height: 1.2; color: #111827; }
  .call-agent-section-head p { margin-top: 5px; color: #667085; font-size: .86rem; line-height: 1.45; }
  .call-agent-section-icon { width: 36px; height: 36px; flex: 0 0 auto; border-radius: 11px; display: grid; place-items: center; background: white; border: 1px solid #e3e8ef; color: #2563eb; }
  .call-agent-section-icon svg { width: 18px; height: 18px; }
  .call-agent-number-field, .call-agent-textarea-field { display: grid; gap: 8px; color: #344054; font-size: .86rem; font-weight: 800; }
  .call-agent-number-field input, .call-agent-textarea-field textarea {
    width: 100%;
    border: 1px solid #d0d5dd;
    border-radius: 12px;
    background: white;
    color: #111827;
    font: inherit;
    box-sizing: border-box;
  }
  .call-agent-number-field input { min-height: 44px; padding: 0 13px; }
  .call-agent-textarea-field textarea { min-height: 118px; padding: 12px 13px; resize: vertical; line-height: 1.5; }
  .call-agent-toggle-list { display: grid; gap: 10px; }
  .call-agent-toggle {
    min-height: 44px;
    padding: 10px 12px;
    border-radius: 12px;
    background: white;
    border: 1px solid #e3e8ef;
  }
  .call-agent-toggle.is-disabled { color: #98a2b3; background: #f8fafc; opacity: .72; }
  .call-agent-toggle.is-disabled input { cursor: not-allowed; }
  .call-agent-recording-section { align-content: start; }
  .call-agent-save-row { display: flex; justify-content: flex-end; }
  .control-center-full-row { grid-column: 1 / -1; }
  .control-center-checkbox { flex-direction: row !important; align-items: center; gap: 10px; }
  .control-center-checkbox input { width: auto; }
  .control-center-stage-header { align-items: center; }
  .pill-button, .primary-button, .ghost-button { border-radius: 12px; padding: 10px 16px; font: inherit; cursor: pointer; font-weight: 600; }
  .primary-button { border: none; background: #111827; color: #fff; box-shadow: none; }
  .ghost-button, .pill-button { border: 1px solid #d0d5dd; background: #fff; color: #344054; }
  .pill-button.is-active { background: #eef2ff; border-color: #c7d2fe; }
  .control-center-stage-item {
    padding: 16px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-radius: 18px;
  }
  .control-center-stage-title, .control-center-preview-subject { margin: 0; font-weight: 700; color: #101828; }
  .control-center-stage-sentence { display: flex; align-items: center; gap: 16px; min-width: 0; }
  .control-center-stage-sentence-copy { margin: 0; color: #344054; font-size: .98rem; line-height: 1.45; min-width: 0; }
  .control-center-stage-sentence-copy strong { color: #101828; font-weight: 700; }
  .control-center-stage-sentence-copy .stage-linkish { color: #245cff; font-weight: 700; }
  .stage-channel-icon { width: 42px; height: 42px; border-radius: 14px; display: grid; place-items: center; flex: 0 0 auto; }
  .stage-channel-icon svg { width: 20px; height: 20px; stroke-width: 1.9; }
  .stage-channel-icon.is-email { background: #eef4ff; color: #2f6fff; }
  .stage-channel-icon.is-call { background: #faf0ff; color: #a020f0; }
  .stage-channel-icon.is-sms { background: #ecfdf3; color: #16a34a; }
  .control-center-stage-actions { display: flex; align-items: center; gap: 14px; flex: 0 0 auto; }
  .stage-ai-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 30px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid #e6d3ff;
    background: #faf5ff;
    color: #9333ea;
    font-size: .82rem;
    font-weight: 700;
  }
  .control-center-stage-meta, .control-center-stage-notes, .control-center-template-row p { margin: 4px 0 0; color: #667085; }
  .stage-tag { padding: 6px 10px; border-radius: 999px; background: #f8fafc; color: #344054; font-size: 12px; border: 1px solid #e4e7ec; font-weight: 600; }
  .stage-tag.is-highlight { background: #ecfdf3; color: #17663a; border-color: #b7ebce; }
  .control-center-enrollment-panel { display: grid; gap: 14px; padding: 0; border: 0; border-top: 1px solid #eaecf0; border-radius: 0; }
  .control-center-enrollment-list { display: grid; gap: 12px; }
  .control-center-enrollment-list.is-collapsed { display: none; }
  .control-center-enrollment-item {
    padding: 18px 18px;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    border: 1px solid #eaecf0;
    border-radius: 14px;
    background: #fff;
  }
  .control-center-enrollment-check { display: flex; align-items: center; justify-content: center; }
  .control-center-enrollment-check input {
    width: 18px;
    height: 18px;
    accent-color: #111827;
    border-radius: 6px;
  }
  .control-center-enrollment-copy { display: grid; gap: 6px; }
  .control-center-enrollment-title-row, .control-center-enrollment-meta, .control-center-enrollment-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .control-center-enrollment-title-row h5, .control-center-enrollment-reason { margin: 0; }
  .control-center-enrollment-title-row h5 { font-size: 1rem; color: #101828; font-weight: 700; }
  .control-center-enrollment-meta, .control-center-enrollment-reason { color: #667085; font-size: .9rem; line-height: 1.45; }
  .control-center-enrollment-title { display: inline-flex; align-items: center; gap: 10px; margin: 0; font-size: 1rem; color: #101828; }
  .control-center-enrollment-summary-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex: 1 1 auto;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    text-align: left;
  }
  .control-center-enrollment-head { padding-top: 14px; align-items: center; }
  .control-center-enrollment-head .panel-header { margin: 0; }
  .control-center-enrollment-head > div,
  .control-center-enrollment-summary-button { display: flex; align-items: center; }
  .control-center-enrollment-head > div { flex: 1 1 auto; min-width: 0; }
  .control-center-enrollment-head .workflow-chevron-icon { flex: 0 0 auto; transform: rotate(90deg); color: #98a2b3; }
  .control-center-enrollment-summary-button[aria-expanded="false"] .workflow-chevron-icon { transform: rotate(0deg); }
  .control-center-inline-action {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 0;
    background: transparent;
    border-radius: 12px;
    padding: 6px 4px;
    color: #111827;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .control-center-inline-action.is-danger { color: #ef4444; }
  .control-center-inline-action-icon { font-size: .92rem; line-height: 1; }
  .control-center-select-all-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border: 1px solid #eaecf0;
    border-radius: 12px;
    color: #667085;
    background: #fff;
    font-size: .92rem;
    font-weight: 600;
  }
  .control-center-select-all-row input { width: 18px; height: 18px; }
  .control-center-enrollment-empty {
    padding: 16px 18px;
    border: 1px dashed #d0d5dd;
    border-radius: 16px;
    background: #fff;
    color: #667085;
  }
  .control-center-templates-screen { display: grid; gap: 24px; margin-top: 20px; }
  .control-center-template-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-bottom: 10px; }
  .control-center-template-filter-row { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
  .template-filter-pill { min-height: 42px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; padding: 0 16px; border-radius: 12px; border: 0; background: #111827; color: #fff; font-size: .95rem; font-weight: 600; box-shadow: none; }
  .template-filter-pill svg { width: 16px; height: 16px; stroke-width: 1.9; }
  .template-outline-pill { border: 1px solid #e2e8f0; background: #fff; color: #111827; }
  .control-center-template-toolbar .primary-button { min-height: 42px; padding-inline: 18px; }
  .control-center-template-searchbar { display: flex; align-items: center; gap: 12px; max-width: 760px; min-height: 52px; padding: 8px 12px 8px 18px; border-radius: 14px; background: #f7f8fb; border: 1px solid #eef1f5; }
  .control-center-template-searchbar svg { width: 18px; height: 18px; color: #98a2b3; stroke-width: 1.8; }
  .control-center-template-searchbar input { width: 100%; border: 0; outline: none; background: transparent; color: #667085; font: inherit; font-size: .97rem; padding: 0; }
  .control-center-template-searchbar input::placeholder { color: #667085; opacity: 1; }
  .control-center-search-clear { color: #667085; font-size: .86rem; font-weight: 700; white-space: nowrap; }
  .control-center-template-table-wrap { border-top: 1px solid #e8ecf2; border-left: 1px solid #e8ecf2; border-right: 1px solid #e8ecf2; margin-top: 2px; }
  .control-center-template-table { display: grid; grid-template-columns: 76px minmax(230px, 1.1fr) minmax(320px, 1.58fr) minmax(420px, 2.2fr); }
  .control-center-template-table-head { min-height: 56px; border-bottom: 1px solid #edf1f5; }
  .control-center-template-table-row { min-height: 100px; border-bottom: 1px solid #edf1f5; }
  .control-center-template-cell { display: flex; align-items: center; padding: 0 20px; color: #344054; font-size: .94rem; }
  .control-center-template-table-head .control-center-template-cell { color: #667085; font-size: .83rem; font-weight: 700; }
  .control-center-template-checkbox-cell { justify-content: center; }
  .template-checkbox { width: 22px; height: 22px; border-radius: 6px; border: 1px solid #d7dce4; background: #fff; display: inline-flex; }
  .control-center-template-name { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
  .control-center-template-doc-icon { display: inline-flex; align-items: center; justify-content: center; color: #98a2b3; flex: 0 0 auto; }
  .control-center-template-doc-icon svg { width: 17px; height: 17px; stroke-width: 1.85; }
  .control-center-template-link { color: #2563eb; font-size: .96rem; font-weight: 500; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .control-center-template-subject, .control-center-template-body { color: #475467; line-height: 1.48; }
  .control-center-template-subject, .control-center-template-body { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; }
  .control-center-template-subject { -webkit-line-clamp: 2; }
  .control-center-template-body { -webkit-line-clamp: 1; color: #667085; }
  .control-center-template-empty { display: grid; gap: 6px; padding: 28px 22px; border-bottom: 1px solid #edf1f5; color: #667085; }
  .control-center-template-empty strong { color: #111827; }
  .control-center-template-empty p { margin: 0; }
  .control-center-template-drawer-shell { position: fixed; inset: 64px 0 0 274px; z-index: 45; }
  .control-center-template-drawer-backdrop { position: absolute; inset: 0; background: rgba(15, 23, 42, 0.08); }
  .control-center-template-drawer { position: absolute; top: 0; right: 0; bottom: 0; width: min(1180px, calc(100vw - 294px)); background: #fff; border-left: 1px solid #e6e8ec; box-shadow: -18px 0 48px rgba(15, 23, 42, 0.12); display: grid; grid-template-rows: auto minmax(0, 1fr); }
  .control-center-template-drawer-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 20px; border-bottom: 1px solid #eef2f6; }
  .control-center-template-drawer-head h2 { margin: 0; font-size: 1.15rem; line-height: 1.2; color: #111827; }
  .control-center-template-drawer-close { color: #667085; font-size: 1.4rem; line-height: 1; }
  .control-center-template-drawer-content { min-height: 0; display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(400px, .95fr); }
  .control-center-template-editor { min-width: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; border-right: 1px solid #eef2f6; }
  .control-center-template-editor-fields { display: grid; gap: 14px; padding: 18px 18px 0; }
  .control-center-template-editor-fields label { display: grid; gap: 8px; color: #111827; font-size: .92rem; font-weight: 600; }
  .control-center-template-editor-fields input { width: 100%; border: 1px solid #e4e7ec; border-radius: 10px; min-height: 40px; padding: 0 12px; font: inherit; color: #111827; }
  .control-center-template-editor-note { display: flex; align-items: center; justify-content: space-between; gap: 14px; color: #667085; font-size: .84rem; line-height: 1.4; }
  .template-mini-button { min-width: 36px; min-height: 28px; border: 1px solid #e4e7ec; border-radius: 8px; background: #fff; color: #344054; font-weight: 600; }
  .control-center-template-toggle-row { display: flex; align-items: center; gap: 28px; padding-bottom: 2px; }
  .control-center-template-switchline { display: inline-flex; align-items: center; gap: 10px; color: #111827; font-size: .92rem; font-weight: 600; }
  .template-mini-switch { width: 38px; height: 22px; border-radius: 999px; background: #e5e7eb; padding: 3px; display: inline-flex; align-items: center; }
  .template-mini-switch span { width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.16); }
  .template-mini-switch.is-active { background: #111827; justify-content: flex-end; }
  .control-center-template-editor-body { width: 100%; min-height: 0; border: 0; border-top: 1px solid #eef2f6; border-bottom: 1px solid #eef2f6; padding: 18px; font: inherit; font-size: .95rem; line-height: 1.65; color: #344054; resize: none; outline: none; }
  .control-center-template-editor-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 18px; }
  .control-center-template-editor-tools { display: flex; align-items: center; gap: 14px; color: #344054; font-size: .88rem; font-weight: 600; position: relative; }
  .control-center-template-variable-picker { position: relative; }
  .control-center-template-variable-button { min-height: 30px; border: 1px solid #d0d5dd; border-radius: 9px; background: #fff; color: #344054; padding: 0 11px; font: inherit; font-size: .88rem; font-weight: 700; cursor: pointer; }
  .control-center-template-variable-menu { position: absolute; left: 0; bottom: calc(100% + 12px); min-width: 240px; max-height: 260px; overflow: auto; padding: 8px; border: 1px solid #e4e7ec; border-radius: 14px; background: #fff; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16); display: none; z-index: 3; }
  .control-center-template-variable-picker.is-open .control-center-template-variable-menu { display: grid; }
  .control-center-template-variable-item { min-height: 34px; border: 0; border-radius: 10px; background: transparent; color: #111827; padding: 0 10px; text-align: left; font: inherit; font-size: .86rem; cursor: pointer; }
  .control-center-template-variable-item:hover { background: #f5f7fb; }
  .control-center-template-editor-actions { display: flex; align-items: center; gap: 14px; }
  .template-save-state { color: #667085; font-size: .84rem; font-weight: 600; }
  .control-center-template-preview-pane { padding: 18px 22px 24px; display: grid; align-content: start; gap: 18px; background: #fff; overflow: auto; }
  .control-center-template-preview-chip { display: inline-flex; align-items: center; min-height: 28px; padding: 0 12px; border-radius: 10px; background: #f4f0ff; color: #7c3aed; font-size: .77rem; font-weight: 700; width: fit-content; }
  .control-center-template-preview-block { display: grid; gap: 10px; padding-top: 16px; border-top: 1px solid #eef2f6; }
  .control-center-template-preview-block h3 { margin: 0; font-size: .92rem; color: #111827; }
  .control-center-template-preview-block p { margin: 0; color: #344054; line-height: 1.6; }
  .control-center-template-preview-copy { display: grid; gap: 14px; color: #344054; line-height: 1.65; }
  .control-center-template-preview-copy p { margin: 0; }
  .control-center-template-grid, .control-center-preview-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 16px; }
  .control-center-template-row, .control-center-preview-panel { padding: 16px; }
  .control-center-preview-panel pre { white-space: pre-wrap; margin: 12px 0 0; font-size: 12px; color: #31425d; background: #f8fafc; padding: 12px; border-radius: 12px; overflow: auto; border: 1px solid #eef2f6; }
  .control-center-preview-panel ul { margin: 12px 0 0; padding-left: 18px; color: #31425d; }
  .control-center-field-label { display: block; margin-bottom: 8px; color: #344054; font-size: 13px; font-weight: 600; }
  .weekday-pill-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .weekday-pill { min-width: 38px; padding: 8px 10px; border-radius: 10px; border: 1px solid #d0d5dd; background: #fff; color: #667085; text-align: center; font-size: .82rem; font-weight: 600; cursor: pointer; }
  .weekday-pill input { position: absolute; opacity: 0; pointer-events: none; }
  .weekday-pill.is-active, .weekday-pill:has(input:checked) { background: #111827; border-color: #111827; color: #fff; }
  .control-center-toggle-row { display: flex; align-items: center; justify-content: space-between; padding-top: 4px; }
  .control-center-inline-toggle { cursor: pointer; }
  .control-center-inline-toggle input:checked + .workflow-toggle-knob { transform: translateX(12px); }
  .control-center-inline-toggle input:checked ~ .workflow-toggle-knob { transform: translateX(12px); }
  .control-center-inline-toggle input:checked + .workflow-toggle-knob,
  .control-center-inline-toggle input:checked ~ .workflow-toggle-knob { background: #fff; }
  .control-center-inline-toggle:has(input:checked) { background: #0f172a; }
  .control-center-modal-shell { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; }
  .control-center-modal-backdrop { position: absolute; inset: 0; background: rgba(15, 23, 42, 0.44); }
  .control-center-modal { position: relative; z-index: 1; width: min(100%, 380px); background: #fff; border: 1px solid #d0d5dd; border-radius: 14px; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28); padding: 16px; }
  .control-center-enroll-modal { width: min(100% - 24px, 688px); padding: 28px 32px 24px; border-radius: 18px; }
  .control-center-stage-modal { width: min(100% - 24px, 556px); padding: 14px 16px 12px; border-radius: 14px; }
  .control-center-modal-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .control-center-modal-head h2, .control-center-modal-head p { margin: 0; }
  .control-center-modal-head h2 { font-size: 1.06rem; line-height: 1.18; color: #101828; }
  .control-center-modal-head p { margin-top: 6px; color: #667085; font-size: .8rem; line-height: 1.38; }
  .control-center-modal-close { color: #475467; font-size: 1.32rem; line-height: 1; }
  .control-center-modal-form { display: grid; gap: 14px; margin-top: 12px; }
  .control-center-modal-block { display: grid; gap: 8px; }
  .control-center-modal-section-label { margin-bottom: 0; }
  .control-center-enroll-search {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 54px;
    padding: 0 16px;
    border: 1px solid #d0d5dd;
    border-radius: 14px;
    background: #fff;
    box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.03);
  }
  .control-center-enroll-search svg { width: 18px; height: 18px; color: #98a2b3; flex: 0 0 auto; }
  .control-center-enroll-search-input {
    flex: 1;
    border: 0;
    background: transparent;
    padding: 0;
    color: #101828;
    font: inherit;
    font-size: 1rem;
    outline: none;
  }
  .control-center-enroll-list {
    display: grid;
    gap: 0;
    max-height: 584px;
    overflow: auto;
    border: 1px solid #eaecf0;
    border-radius: 16px;
    background: #fff;
  }
  .control-center-enroll-select-all, .control-center-enroll-option {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    gap: 12px;
    align-items: flex-start;
    padding: 18px 20px;
    cursor: pointer;
  }
  .control-center-enroll-option + .control-center-enroll-option,
  .control-center-enroll-select-all + .control-center-enroll-option { border-top: 1px solid #eaecf0; }
  .control-center-enroll-select-all { font-size: 1rem; font-weight: 600; color: #344054; }
  .control-center-enroll-select-all input,
  .control-center-enroll-option-checkbox {
    width: 22px;
    height: 22px;
    margin: 0;
    accent-color: #111827;
    border-radius: 6px;
  }
  .control-center-enroll-option-copy { display: grid; gap: 8px; }
  .control-center-enroll-option-title {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .control-center-enroll-option-title strong { font-size: 1rem; color: #101828; }
  .control-center-enroll-option-copy p {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    color: #667085;
    font-size: .92rem;
  }
  .control-center-enroll-option-copy p span + span::before { content: "•"; margin-right: 12px; color: #98a2b3; }
  .control-center-enroll-option.is-hidden { display: none; }
  .stage-channel-picker, .template-mode-picker { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .stage-channel-option, .template-mode-option {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    border: 1px solid #d0d5dd;
    border-radius: 12px;
    background: #fff;
    color: #344054;
    font-size: .86rem;
    font-weight: 600;
  }
  .stage-channel-option.is-email {
    border-color: #2f6fff;
    background: #edf4ff;
    color: #1d4ed8;
    box-shadow: inset 0 0 0 1px #2f6fff;
  }
  .stage-channel-option.is-call {
    border-color: #d7dce4;
    background: #fff;
    color: #344054;
  }
  .template-mode-option.is-active { background: #111827; border-color: #111827; color: #fff; }
  .control-center-trigger-builder {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .control-center-trigger-number-wrap {
    position: relative;
    width: 96px;
    flex: 0 0 96px;
  }
  .control-center-trigger-number-wrap::after {
    content: "⌃\A⌄";
    white-space: pre;
    position: absolute;
    top: 50%;
    right: 12px;
    transform: translateY(-50%);
    color: #98a2b3;
    font-size: 10px;
    line-height: .8;
    opacity: 0;
    transition: opacity .16s ease;
    pointer-events: none;
  }
  .control-center-trigger-number-wrap:hover::after,
  .control-center-trigger-number-wrap:focus-within::after { opacity: 1; }
  .control-center-trigger-number-input {
    width: 100%;
    min-height: 34px;
    border: 1px solid #eef2f6;
    border-radius: 9px;
    background: #f5f7fb;
    padding: 0 10px;
    color: #101828;
    font: inherit;
    font-size: .88rem;
    font-weight: 600;
    outline: none;
    appearance: textfield;
    -moz-appearance: textfield;
  }
  .control-center-trigger-number-input::-webkit-outer-spin-button,
  .control-center-trigger-number-input::-webkit-inner-spin-button {
    -webkit-appearance: inner-spin-button;
    opacity: 0;
    transition: opacity .16s ease;
  }
  .control-center-trigger-number-input:hover::-webkit-outer-spin-button,
  .control-center-trigger-number-input:hover::-webkit-inner-spin-button,
  .control-center-trigger-number-input:focus::-webkit-outer-spin-button,
  .control-center-trigger-number-input:focus::-webkit-inner-spin-button {
    opacity: 1;
  }
  .control-center-trigger-days-copy {
    color: #475467;
    font-size: .84rem;
    font-weight: 500;
  }
  .control-center-trigger-select-wrap {
    position: relative;
    min-width: 188px;
  }
  .control-center-trigger-select-wrap::after {
    content: "⌄";
    position: absolute;
    top: 50%;
    right: 14px;
    transform: translateY(-50%);
    color: #98a2b3;
    font-size: 14px;
    pointer-events: none;
  }
  .control-center-trigger-select {
    width: 100%;
    min-height: 34px;
    border: 1px solid #eef2f6;
    border-radius: 9px;
    background: #f5f7fb;
    padding: 0 30px 0 10px;
    color: #101828;
    font: inherit;
    font-size: .86rem;
    font-weight: 600;
    appearance: none;
  }
  .control-center-trigger-builder.is-on-due-date .control-center-trigger-number-wrap,
  .control-center-trigger-builder.is-on-due-date .control-center-trigger-days-copy { display: none; }
  .control-center-stage-template-select {
    min-height: 34px;
    border-radius: 9px;
    background: #f5f7fb;
    padding-right: 30px;
    color: #667085;
  }
  .control-center-ai-note { padding: 10px 12px; border-radius: 12px; background: #f8fafc; border: 1px solid #e4e7ec; color: #475467; font-size: .86rem; line-height: 1.45; }
  .control-center-ai-note { padding: 8px 10px; border-radius: 9px; font-size: .8rem; }
  .control-center-stage-submit[disabled] {
    background: #98a2b3;
    color: #fff;
    cursor: not-allowed;
  }
  .control-center-modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 12px; border-top: 1px solid #eaecf0; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

  @media (max-width: 980px) {
    .control-center-layout, .control-center-template-grid, .control-center-preview-grid, .control-center-grid-form { grid-template-columns: 1fr; }
    .control-center-sidebar { padding-top: 0; }
    .control-center-tabbar { gap: 16px; overflow-x: auto; }
    .control-center-workflow-row summary, .control-center-card-head, .control-center-stage-header { flex-direction: column; align-items: flex-start; }
    .control-center-template-toolbar { flex-direction: column; align-items: flex-start; }
    .control-center-enrollment-item, .control-center-enrollment-form, .control-center-enrollment-actions { flex-direction: column; align-items: flex-start; }
    .control-center-enrollment-form select { min-width: 100%; }
    .control-center-template-searchbar { max-width: none; width: 100%; }
     .control-center-template-table, .control-center-template-table-head { grid-template-columns: 56px minmax(180px, 1fr) minmax(180px, 1fr); }
     .control-center-template-table-head .control-center-template-cell:nth-child(4), .control-center-template-table-row .control-center-template-cell:nth-child(4) { display: none; }
    .control-center-template-drawer-shell { inset: 0; }
    .control-center-template-drawer { width: min(100vw, 100%); }
    .control-center-template-drawer-content { grid-template-columns: 1fr; }
    .control-center-template-preview-pane { border-top: 1px solid #eef2f6; }
    .stage-channel-picker, .template-mode-picker { grid-template-columns: 1fr; }
    .control-center-modal { width: min(100% - 24px, 380px); }
  }
`;
