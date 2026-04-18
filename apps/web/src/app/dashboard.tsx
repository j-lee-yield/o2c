import React from "react";
import type {
  CustomerProfileTabId,
  InvoiceIndexEntry,
  InvoiceIndexProviderSummary,
  InvoiceIndexStatusSummary,
} from "@o2c/contracts";
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
  | "screen-inventory";

interface DashboardProps {
  data: OperatorConsoleData;
  page?: DashboardPage;
  pathname?: string;
  cashAppTab?: string | undefined;
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
  controlCenterStageModalWorkflowId?: string;
  controlCenterStageModalChannel?: "email" | "call" | "sms";
  controlCenterStageModalTemplateMode?: "pre_saved_template" | "ai_generated";
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

const primaryNavigation = [
  ["home", "Home", "dashboard", "/"],
  ["onboarding", "Onboarding", "upload", "/onboarding"],
  ["inbox", "Tasks", "check", "/tasks"],
  ["analytics", "Analytics", "trend", "/analytics"],
  ["collections", "Collections", "collections", "/collections"],
  ["control-center", "Control Center", "rules", "/control-center"],
  ["cash-application", "Cash App", "cash", "/cash-app"],
  ["exceptions", "Deductions", "invoice", "/deductions"],
  ["customers", "Customers", "customers", "/customers"],
  ["invoices", "Invoices", "invoice", "/invoices"],
] as const;

const secondaryNavigation = [
  ["approvals", "Approvals", "approvals", "/approvals"],
  ["borrowing", "Credit Line", "currency", "/credit-line"],
  ["data-sources", "Data Sources", "data-sources", "/data-sources"],
  ["ai-activity", "AI Activity", "activity", "/ai-activity"],
  ["rules", "Rules", "rules", "/rules"],
] as const;

export const Dashboard = ({
  data,
  page = "home",
  pathname = "/",
  cashAppTab,
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
  controlCenterStageModalWorkflowId,
  controlCenterStageModalChannel,
  controlCenterStageModalTemplateMode,
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

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {primaryNavigation.map(([key, label, icon, href]) => (
            <a key={key} className={`sidebar-link${page === key ? " is-active" : ""}`} href={href}>
              <AppIcon name={icon} />
              <span>{label}</span>
            </a>
          ))}
        </nav>

        <div className="sidebar-divider" />
        <nav className="sidebar-nav" aria-label="Secondary navigation">
          {secondaryNavigation.map(([key, label, icon, href]) => (
            <a key={key} className={`sidebar-link${page === key ? " is-active" : ""}`} href={href}>
              <AppIcon name={icon} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
      </aside>

      <div className="dashboard-main">
        <header className="topbar">
          <p className="topbar-date">Today: {formatTopbarDate(data.generatedAt)}</p>
          <div className="topbar-user">
            <span>Juan Cruz</span>
            <span className="user-badge">JC</span>
          </div>
        </header>

        <div className="page-scroll">
          {renderPage(
            page,
            data,
            pathname,
            cashAppTab,
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
            controlCenterStageModalWorkflowId,
            controlCenterStageModalChannel,
            controlCenterStageModalTemplateMode,
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
  controlCenterStageModalWorkflowId?: string,
  controlCenterStageModalChannel?: "email" | "call" | "sms",
  controlCenterStageModalTemplateMode?: "pre_saved_template" | "ai_generated",
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
      return <AnalyticsPage data={data} />;
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
      return <CollectionsPage data={data} />;
    case "control-center":
      return (
        <ControlCenterPage
          data={data}
          {...(controlCenterTab ? { activeTab: controlCenterTab } : {})}
          {...(controlCenterExpandedWorkflowId ? { expandedWorkflowId: controlCenterExpandedWorkflowId } : {})}
          {...(controlCenterSelectedTemplateId ? { selectedTemplateId: controlCenterSelectedTemplateId } : {})}
          {...(controlCenterStageModalWorkflowId ? { stageModalWorkflowId: controlCenterStageModalWorkflowId } : {})}
          {...(controlCenterStageModalChannel ? { stageModalChannel: controlCenterStageModalChannel } : {})}
          {...(controlCenterStageModalTemplateMode ? { stageModalTemplateMode: controlCenterStageModalTemplateMode } : {})}
        />
      );
    case "inbox":
      return <InboxPage data={data} />;
    case "invoices":
      return <InvoicesPage data={data} />;
    case "customers":
      return (
        <CustomersPage
          data={data}
          {...(customerId ? { selectedCustomerId: customerId } : {})}
          {...(customerTab ? { activeTab: customerTab } : {})}
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
    case "home":
    default:
      return <CommandCenterPage data={data} />;
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
            <a href="/cash-app" className="primary-button">Open Cash App</a>
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

const CommandCenterPage = ({ data }: { data: OperatorConsoleData }) => {
  const setupItem = data.homeSetupChecklist.items[0];
  const byCustomerView = data.homeTaskSummary.views.find((view) => view.id === "by_customer") ?? data.homeTaskSummary.views[0];
  const byTaskTypeView = data.homeTaskSummary.views.find((view) => view.id === "by_task_type") ?? data.homeTaskSummary.views[1];
  const totalTaskCount = data.homeTaskSummary.views.find((view) => view.id === "all_tasks")?.totalCount ?? byCustomerView?.totalCount ?? 0;
  const calendarDays = buildHomeCalendarDays(data.generatedAt);
  const taskAgeBuckets = buildHomeTaskAgeBuckets(totalTaskCount);
  const taskTypeBuckets = buildHomeTaskTypeBuckets(byTaskTypeView?.items ?? []);
  const customerBuckets = buildHomeCustomerBuckets(byCustomerView?.items ?? []);
  const respondToItems = buildHomeRespondToItems({
    customerItems: byCustomerView?.items ?? [],
    taskTypeItems: byTaskTypeView?.items ?? [],
  });
  const collectSummary = {
    customers: data.homeSnapshotMetrics.openInvoiceCount,
    amountLabel: formatPhp(data.homeSnapshotMetrics.outstandingBalanceCents),
    actionPath: data.homeCollectionsMetrics.actionPath,
  };
  const dueTodayLabel = `${formatPhp(data.homeSnapshotMetrics.overdueBalanceCents)} currently due today from ${Math.max(customerBuckets.totalCustomers, 1)} customers`;
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
          <a href={byCustomerView?.actionPath ?? "/tasks"} className="home-reference-link">
            {totalTaskCount} open tasks
          </a>
        </div>

        <article className="home-reference-calendar-card">
          <div className="home-reference-calendar-top">
            <div className="home-reference-calendar-title">
              <AppIcon name="clock" />
              <span>Calendar</span>
              <strong>{formatHomeCalendarMonth(data.generatedAt)}</strong>
              <span className="home-reference-pill">Today</span>
            </div>
            <div className="home-reference-calendar-actions">
              <button type="button" className="home-reference-inline-button">Prev day</button>
              <button type="button" className="home-reference-inline-button">Next day</button>
            </div>
          </div>
          <div className="home-reference-calendar-grid">
            <button type="button" className="home-reference-calendar-nav" aria-label="Previous day">
              <AppIcon name="chevron-left" />
            </button>
            {calendarDays.map((day) => (
              <div key={day.label} className={`home-reference-calendar-day${day.isActive ? " is-active" : ""}`}>
                <span>{day.weekday}</span>
                <strong>{day.label}</strong>
              </div>
            ))}
            <button type="button" className="home-reference-calendar-nav" aria-label="Next day">
              <AppIcon name="chevron-right" />
            </button>
          </div>
        </article>

        <article className="home-reference-banner">
          <span>{dueTodayLabel}</span>
          <a href={data.homeCollectionsMetrics.actionPath} className="home-reference-link">
            View
          </a>
        </article>

        <div className="home-reference-list-section">
          <div className="home-reference-heading home-reference-heading-slim">
            <h3>Respond to</h3>
          </div>
          <ul className="home-reference-bullets">
            {respondToItems.map((item, index) => (
              <li key={`${item.label}-${index}`}>
                <span>{item.label}</span>
                <a href={item.actionPath} className="home-reference-link">View</a>
              </li>
            ))}
          </ul>
        </div>

        <div className="home-reference-chart-grid">
          <article className="home-reference-chart-card">
            <div className="home-reference-chart-header">
              <h3>Open Tasks by Age</h3>
              <button type="button" className="home-reference-kebab" aria-label="More options">⋮</button>
            </div>
            <div className="home-reference-bar-chart">
              <div className="home-reference-bar-axis">
                {taskAgeBuckets.axis.map((tick) => (
                  <span key={tick}>{tick}</span>
                ))}
              </div>
              <div className="home-reference-bar-columns">
                {taskAgeBuckets.buckets.map((bucket) => (
                  <div key={bucket.label} className="home-reference-bar-column">
                    <div className="home-reference-bar-rail">
                      <div className="home-reference-bar-fill" style={{ height: `${bucket.height}%` }} />
                    </div>
                    <span>{bucket.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="home-reference-chart-card">
            <div className="home-reference-chart-header">
              <h3>Task types</h3>
              <button type="button" className="home-reference-kebab" aria-label="More options">⋮</button>
            </div>
            <div className="home-reference-donut-layout">
              <HomeDonutChart segments={taskTypeBuckets.segments} />
              <div className="home-reference-legend">
                {taskTypeBuckets.segments.map((segment) => (
                  <div key={segment.label} className="home-reference-legend-row">
                    <i style={{ background: segment.color }} />
                    <span>{segment.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="home-reference-chart-card">
            <div className="home-reference-chart-header">
              <h3>Customers</h3>
              <button type="button" className="home-reference-kebab" aria-label="More options">⋮</button>
            </div>
            <div className="home-reference-donut-layout">
              <HomeDonutChart segments={customerBuckets.segments} />
              <div className="home-reference-legend">
                {customerBuckets.segments.map((segment) => (
                  <div key={segment.label} className="home-reference-legend-row">
                    <i style={{ background: segment.color }} />
                    <span>{segment.label}</span>
                  </div>
                ))}
              </div>
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

const AnalyticsPage = ({ data }: { data: OperatorConsoleData }) => {
  const analytics = buildAnalyticsViewModel(data);

  return (
    <section className="page-section analytics-page">
      <PageHeader
        title="Analytics"
        description="Collections performance, DSO trends, and financial metrics"
        actionRow={
          <div className="header-actions analytics-header-actions">
            <button type="button" className="ghost-select analytics-select">
              <span>Year to Date</span>
              <span className="analytics-select-caret" aria-hidden="true">▾</span>
            </button>
            <button type="button" className="ghost-button analytics-export-button">
              <AppIcon name="download" />
              Export Report
            </button>
          </div>
        }
      />

      <div className="analytics-kpi-grid">
        <AnalyticsMetricCard
          title="Total Outstanding"
          value={formatPhpCompactLong(analytics.totalOutstandingCents)}
          icon="currency"
          accent="info"
          footer="↓ 8.2% vs last month"
        />
        <AnalyticsMetricCard
          title="Overdue Balance"
          value={formatPhpCompactLong(analytics.overdueBalanceCents)}
          icon="alert-outline"
          accent="danger"
          footer="↓ 12.5% vs last month"
        />
        <AnalyticsMetricCard
          title="DSO (Days)"
          value={String(analytics.estimatedDsoDays)}
          icon="trend"
          accent="success"
          footer="↓ 10 days since Jan"
        />
        <AnalyticsMetricCard
          title="Collections Rate"
          value={`${analytics.collectionsRate.toFixed(1)}%`}
          icon="sparkle-mini"
          accent="violet"
          footer="↑ 2.1% vs last month"
        />
      </div>

      <div className="analytics-grid analytics-grid-primary">
        <article className="panel analytics-panel">
          <div className="panel-header">
            <div>
              <h2>Collections vs Target</h2>
              <p className="label-copy">Monthly performance</p>
            </div>
            <span className="pill pill-success">Above Target</span>
          </div>
          <div className="analytics-bar-chart">
            {analytics.monthlyPerformance.map((month) => (
              <div key={month.label} className="analytics-bar-column">
                <div className="analytics-bar-label-top">{formatPhpCompactLong(month.collectedCents)}</div>
                <div className="analytics-bar-track">
                  <div className="analytics-bar-grid" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="analytics-bar-group">
                    <div className="analytics-bar analytics-bar-collected-wrap">
                      <div className="analytics-bar-collected" style={{ height: `${month.collectedRatio * 100}%` }} />
                    </div>
                    <div className="analytics-bar analytics-bar-target-wrap">
                      <div className="analytics-bar-target" style={{ height: `${month.targetRatio * 100}%` }} />
                    </div>
                  </div>
                </div>
                <span className="analytics-axis-label">{month.label}</span>
              </div>
            ))}
          </div>
          <div className="analytics-legend">
            <span><i className="analytics-legend-dot analytics-legend-dot-collected" />Collected</span>
            <span><i className="analytics-legend-dot analytics-legend-dot-target" />Target</span>
          </div>
        </article>

        <article className="panel analytics-panel">
          <div className="panel-header">
            <div>
              <h2>Aging Balance</h2>
              <p className="label-copy">Current AR distribution</p>
            </div>
            <span className="pill pill-info">{formatPhpCompactLong(analytics.totalOutstandingCents)} Total</span>
          </div>
          <div className="analytics-aging-layout">
            <div className="analytics-donut-wrap">
              <div className="analytics-donut-area">
                <div className="analytics-donut" style={{ background: analytics.agingChart }} />
                {analytics.agingLegend.map((bucket) => (
                  <span
                    key={`${bucket.label}-share`}
                    className={`analytics-aging-percent analytics-aging-percent-${bucket.position}`}
                    style={{ color: bucket.color }}
                  >
                    {bucket.percent}%
                  </span>
                ))}
              </div>
            </div>
            <div className="analytics-aging-legend">
              {analytics.agingLegend.map((bucket) => (
                <div key={bucket.label} className="analytics-aging-row">
                  <div className="analytics-aging-name">
                    <i className="analytics-legend-dot" style={{ background: bucket.color }} />
                    <span>{bucket.label}</span>
                  </div>
                  <div className="analytics-aging-values">
                    <strong>{bucket.percent}%</strong>
                    <span>{formatPhpCompactLong(bucket.amountCents)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </article>
      </div>

      <div className="analytics-grid analytics-grid-secondary">
        <article className="panel analytics-panel">
          <div className="panel-header">
            <div>
              <h2>DSO Trend</h2>
              <p className="label-copy">Days Sales Outstanding over time</p>
            </div>
            <span className="pill pill-success">Improving</span>
          </div>
          <AnalyticsLineChart points={analytics.dsoTrend} />
          <div className="analytics-inline-stats">
            <AnalyticsSectionStat
              label="Avg Collection Time"
              value={`${analytics.avgCollectionTimeDays} days`}
              tone="success"
            />
            <AnalyticsSectionStat
              label="Open Invoices"
              value={String(analytics.openInvoiceCount)}
              tone="info"
            />
          </div>
        </article>

        <article className="panel analytics-panel">
          <div className="panel-header">
            <div>
              <h2>Top Customers by Balance</h2>
              <p className="label-copy">Largest outstanding balances</p>
            </div>
            <div className="analytics-inline-stats analytics-inline-stats-compact">
              <AnalyticsSectionStat
                label="Active Customers"
                value={String(analytics.activeCustomerCount)}
                tone="success"
              />
              <AnalyticsSectionStat
                label="Need Attention"
                value={String(analytics.customersNeedingAttention)}
                tone="danger"
              />
            </div>
          </div>
          <div className="analytics-customer-list">
            {analytics.topCustomers.map((customer, index) => (
              <div key={customer.key} className="analytics-customer-row">
                <div className="analytics-customer-copy">
                  <div className="analytics-customer-title">
                    <span className="analytics-customer-rank">{index + 1}.</span>
                    <strong>{customer.accountName}</strong>
                  </div>
                  <div className="analytics-customer-bar">
                    <span style={{ width: `${customer.ratio * 100}%` }} />
                  </div>
                </div>
                <div className="analytics-customer-metrics">
                  <strong>{formatPhpCompactLong(customer.openAmountCents)}</strong>
                  {customer.overdueAmountCents > 0 ? (
                    <span className="pill pill-danger">{formatPhpCompactLong(customer.overdueAmountCents)} overdue</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
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

const CollectionsPage = ({ data }: { data: OperatorConsoleData }) => {
  const senderIdentityOptions = data.emailSendingIdentities.filter(
    (identity) => identity.connectionStatus === "connected",
  );
  const defaultSenderIdentityId =
    data.emailInbox.selectedSenderIdentityId ??
    senderIdentityOptions.find((identity) => identity.isDefault)?.id ??
    senderIdentityOptions[0]?.id;
  const inboxItems = buildCollectionsInboxItems(data);
  const unreadCount = inboxItems.filter((item) => item.bucket === "unread").length;
  const sentCount = inboxItems.filter((item) => item.bucket === "sent").length;
  const draftCount = inboxItems.filter((item) => item.bucket === "draft").length;

  return (
    <section className="page-section cash-page">
      <article className="collections-workspace">
        <div className="collections-hero">
          <div className="collections-hero-copy">
            <h1>Collections</h1>
            <div className="collections-channel-tabs" role="tablist" aria-label="Collections channels">
              <button type="button" className="collections-channel-tab is-active" aria-selected="true">
                <AppIcon name="mail" />
                <span>Email Inbox</span>
              </button>
              <button type="button" className="collections-channel-tab" aria-selected="false">
                <AppIcon name="phone" />
                <span>SMS Inbox</span>
              </button>
              <button type="button" className="collections-channel-tab" aria-selected="false">
                <AppIcon name="phone" />
                <span>Call Inbox</span>
              </button>
            </div>
          </div>
          <div className="collections-configure">
            <button type="button" className="collections-configure-button">
              <AppIcon name="settings" />
              <span>Configure</span>
            </button>
          </div>
        </div>
      </article>

      <div className="collections-filter-bar">
        <button type="button" className="collections-filter-pill is-active">
          <span>All</span>
          <span className="collections-filter-count">{inboxItems.length}</span>
        </button>
        <button type="button" className="collections-filter-pill">
          <span>Unread</span>
          <span className="collections-filter-count dark">{unreadCount}</span>
        </button>
        <button type="button" className="collections-filter-pill">
          <span>Sent</span>
          <span className="collections-filter-count dark">{sentCount}</span>
        </button>
        <button type="button" className="collections-filter-pill">
          <span>Drafts</span>
          <span className="collections-filter-count dark">{draftCount}</span>
        </button>
      </div>

      <div className="collections-toolbar">
        <div className="collections-searchbox">
          <AppIcon name="search" />
          <span>Search</span>
        </div>
        <button type="button" className="collections-toolbar-chip">
          <AppIcon name="customers" />
          <span>Customer</span>
        </button>
        <button type="button" className="collections-toolbar-chip">
          <AppIcon name="tag" />
          <span>Workflow</span>
        </button>
      </div>

      {data.collectionsComposeStatus ? (
        <article className="integration-success-banner">
          <strong>
            {data.collectionsComposeStatus.kind === "approval_needed"
              ? "Collections email queued for approval."
              : "Collections email sent."}
          </strong>
          <p>{data.collectionsComposeStatus.message}</p>
        </article>
      ) : null}

      {data.collectionsComposeError ? (
        <article className="integration-error-banner">
          <strong>Collections email could not be sent.</strong>
          <p>{data.collectionsComposeError.message}</p>
        </article>
      ) : null}

      <article className="collections-inbox-card">
        <div className="collections-inbox-list">
          {inboxItems.map((item) => (
            <article key={item.id} className="collections-inbox-row">
              <div className="collections-inbox-main">
                <span className="collections-row-checkbox" aria-hidden="true" />
                <a className="collections-message-trigger" href={`#collections-compose-${item.id}`}>
                  <div className="collections-message-copy">
                    <div className="collections-message-heading">
                      <strong>{item.customerName}</strong>
                      {item.isLinked ? (
                        <span className="collections-linked-badge">
                          <AppIcon name="external-link" />
                        </span>
                      ) : null}
                    </div>
                    <p className="collections-message-address">{item.email}</p>
                    <p className="collections-message-preview">{item.preview}</p>
                  </div>
                </a>
              </div>
              <div className="collections-message-meta">
                <span>{item.owner}</span>
                <span>{item.receivedLabel}</span>
              </div>
            </article>
          ))}
        </div>

        <div className="collections-inbox-footer">
          <span>
            1 - {inboxItems.length} of {inboxItems.length}
          </span>
          <div className="collections-pager">
            <button type="button" className="collections-pager-button" aria-label="First page">
              «
            </button>
            <button type="button" className="collections-pager-button" aria-label="Previous page">
              ‹
            </button>
            <button type="button" className="collections-pager-button" aria-label="Next page">
              ›
            </button>
          </div>
        </div>
      </article>

      {inboxItems.map((item) => {
        const canSend = Boolean(defaultSenderIdentityId && item.providerThreadId);
        const subjectLine =
          item.subjectLine ?? (item.preview.startsWith("Re:") ? item.preview : `Re: ${item.preview}`);

        return (
          <section key={`compose-${item.id}`} id={`collections-compose-${item.id}`} className="collections-compose-modal">
            <a className="collections-compose-backdrop" href="#" aria-label="Close compose window" />
            <article className="collections-compose-panel" role="dialog" aria-modal="true" aria-labelledby={`collections-compose-title-${item.id}`}>
              <div className="collections-compose-header">
                <div>
                  <h2 id={`collections-compose-title-${item.id}`}>{item.customerName}</h2>
                  <p>Compose a collections-safe reply from the inbox thread.</p>
                </div>
                <a className="collections-compose-close" href="#" aria-label="Close compose window">
                  <AppIcon name="close" />
                </a>
              </div>

              <form method="POST" action="/collections/compose" className="collections-compose-form">
                <input type="hidden" name="composeId" value={item.id} />
                <input type="hidden" name="accountName" value={item.customerName} />
                <input type="hidden" name="contactEmail" value={item.email} />
                <input type="hidden" name="contactName" value={item.customerName} />
                <input type="hidden" name="billingAccountId" value={`collections:${item.id}`} />
                <input type="hidden" name="parentAccountId" value={`collections:${item.id}`} />
                <input type="hidden" name="accountNumber" value={`collections:${item.id}`} />
                <input type="hidden" name="currency" value="PHP" />
                <input type="hidden" name="accountTier" value="standard" />
                <input type="hidden" name="providerMessageId" value={item.providerMessageId ?? item.id} />
                {item.providerThreadId ? (
                  <input type="hidden" name="providerThreadId" value={item.providerThreadId} />
                ) : null}

                {!canSend ? (
                  <div className="integration-error-banner">
                    <strong>Send is unavailable for this preview thread.</strong>
                    <p>
                      Connect a live mailbox and open a synced inbox thread to send from this modal.
                      Compose remains available so the operator can review the message safely.
                    </p>
                  </div>
                ) : null}

                <div className="collections-compose-grid">
                  <div className="collections-message-heading">
                    <label className="label-copy" htmlFor={`collections-from-${item.id}`}>From</label>
                    <select
                      id={`collections-from-${item.id}`}
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
                    <label className="label-copy" htmlFor={`collections-to-${item.id}`}>To</label>
                    <input
                      id={`collections-to-${item.id}`}
                      name="contactEmailDisplay"
                      className="form-input"
                      defaultValue={item.email}
                      readOnly
                    />
                  </div>
                </div>

                <div className="collections-compose-grid collections-compose-grid-single">
                  <div className="collections-message-heading">
                    <label className="label-copy" htmlFor={`collections-subject-${item.id}`}>Subject</label>
                    <input
                      id={`collections-subject-${item.id}`}
                      name="subjectLine"
                      className="form-input"
                      defaultValue={subjectLine}
                      required
                    />
                  </div>
                </div>

                <div className="collections-compose-grid collections-compose-grid-single">
                  <div className="collections-message-heading">
                    <label className="label-copy" htmlFor={`collections-body-${item.id}`}>Message</label>
                    <textarea
                      id={`collections-body-${item.id}`}
                      name="bodyPreview"
                      className="collections-compose-textarea"
                      defaultValue={`Hi ${item.customerName},\n\nFollowing up on this thread regarding your account.\n\n${item.preview}\n\nPlease let us know if payment has been released or if you need anything from us.\n\nBest,\nYield Collections`}
                      required
                    />
                  </div>
                </div>

                <div className="collections-compose-footer">
                  <a className="ghost-button" href="#">
                    Discard
                  </a>
                  <button type="submit" className="primary-button" disabled={!canSend}>
                    Send Email
                  </button>
                </div>
              </form>
            </article>
          </section>
        );
      })}
    </section>
  );
};

const InvoicesPage = ({ data }: { data: OperatorConsoleData }) => {
  const { invoiceIndex } = data;

  return (
    <section className="page-section">
      <PageHeader
        title="Imported invoices"
        description="Unified invoice index across ERP and accounting imports with normalized balances, due dates, and source tracking."
        actionRow={
          <div className="header-actions">
            <span className={`pill ${invoiceIndex.source.kind === "live" ? "pill-success" : "pill-warning"}`}>
              {invoiceIndex.source.label}
            </span>
          </div>
        }
      />

      <div className="kpi-grid kpi-grid-5">
        <SimpleKpi
          title="Indexed invoices"
          value={String(invoiceIndex.summary.totalInvoices)}
          subtitle={invoiceIndex.source.detail}
        />
        <SimpleKpi
          title="Open balance"
          value={formatPhp(invoiceIndex.summary.openAmountCents)}
          tone="danger"
          subtitle={`${invoiceIndex.summary.openInvoiceCount} invoices still open`}
        />
        <SimpleKpi
          title="Overdue"
          value={String(invoiceIndex.summary.overdueInvoiceCount)}
          tone="warning"
          subtitle="Normalized by due date across providers"
        />
        <SimpleKpi
          title="Disputed"
          value={String(invoiceIndex.summary.disputedInvoiceCount)}
          tone="violet"
          subtitle="Collections-safe hold remains visible"
        />
        <SimpleKpi
          title="Connected platforms"
          value={String(invoiceIndex.summary.connectedProviderCount)}
          tone="success"
          subtitle={`${invoiceIndex.providers.length} total source groups in the index`}
        />
      </div>

      <div className="card-grid card-grid-2">
        <article className="panel">
          <div className="panel-header">
            <h2>By platform</h2>
            <span className="pill pill-neutral">{invoiceIndex.providers.length} groups</span>
          </div>
          <div className="activity-list">
            {invoiceIndex.providers.map((provider: InvoiceIndexProviderSummary) => (
              <article key={provider.provider} className="activity-summary-row">
                <div className="activity-dot" />
                <div className="activity-summary-body">
                  <strong>{provider.label}</strong>
                  <p>
                    {provider.kind} · {provider.importMode === "live_connection" ? "Live import" : "Seed fallback"}
                  </p>
                </div>
                <span className="activity-summary-time">
                  {provider.invoiceCount} / {formatPhp(provider.openAmountCents)}
                </span>
              </article>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>By status</h2>
            <span className="pill pill-neutral">Normalized</span>
          </div>
          <div className="activity-list">
            {invoiceIndex.statuses.map((status: InvoiceIndexStatusSummary) => (
              <article key={status.status} className="activity-summary-row">
                <div className="activity-dot" />
                <div className="activity-summary-body">
                  <strong>{humanize(status.status)}</strong>
                  <p>{status.invoiceCount} invoices</p>
                </div>
                <span className="activity-summary-time">{formatPhp(status.openAmountCents)}</span>
              </article>
            ))}
          </div>
        </article>
      </div>

      <div className="data-card">
        <div className="table table-invoices">
          <div className="table-head">Platform</div>
          <div className="table-head">Invoice</div>
          <div className="table-head">Customer</div>
          <div className="table-head">Hierarchy</div>
          <div className="table-head">Status</div>
          <div className="table-head">Dates</div>
          <div className="table-head">Open</div>
          <div className="table-head">Total</div>
          {invoiceIndex.invoices.map((invoice: InvoiceIndexEntry) => (
            <InvoiceIndexRow key={invoice.id} invoice={invoice} />
          ))}
        </div>
      </div>
    </section>
  );
};

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

const InboxPage = ({ data }: { data: OperatorConsoleData }) => {
  const totalTasks = data.taskQueue.length;
  const openTasks = data.taskQueue.filter((item) => item.status === "open").length;
  const inProgressTasks = data.taskQueue.filter((item) => item.status === "in_progress").length;
  const pendingApprovalTasks = data.taskQueue.filter((item) => item.status === "pending_approval").length;
  const highPriorityTasks = data.taskQueue.filter((item) => item.priority === "high").length;

  return (
    <section className="page-section task-page">
      <PageHeader
        title="Tasks"
        description="Global task queue across collections, cash app, deductions, and operations"
        actionRow={
          <div className="header-actions task-page-actions">
            <button type="button" className="ghost-button task-toolbar-button">
              <AppIcon name="filter" />
              <span>Advanced Filters</span>
            </button>
            <button type="button" className="ghost-button task-toolbar-button">
              <AppIcon name="download" />
              <span>Export</span>
            </button>
          </div>
        }
      />

      <div className="kpi-grid kpi-grid-5 task-summary-grid">
        <article className="task-summary-card">
          <p>Total Tasks</p>
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
        <div className="task-filter-bar">
          <div className="task-search">
            <AppIcon name="search" />
            <span>Search tasks, customers, or IDs...</span>
          </div>
          <button type="button" className="ghost-select task-select">All Status</button>
          <button type="button" className="ghost-select task-select">All Types</button>
          <button type="button" className="ghost-select task-select">All Priorities</button>
        </div>

        <div className="task-table">
          <div className="task-table-header">
            <div className="task-table-head">Task</div>
            <div className="task-table-head">Type</div>
            <div className="task-table-head">Customer</div>
            <div className="task-table-head">Status</div>
            <div className="task-table-head">Priority</div>
            <div className="task-table-head">Assignee</div>
            <div className="task-table-head">Created</div>
            <div className="task-table-head">Due Date</div>
            <div className="task-table-head task-table-head-actions">Actions</div>
          </div>
          <div className="task-table-body">
            {data.taskQueue.map((task) => (
              <div key={task.id} className="task-table-row">
                <div className="task-table-cell">
                  <strong>{task.title}</strong>
                  <p className="task-row-meta">
                    <span>{task.taskCode}</span>
                    {task.relatedRecord ? <span>{task.relatedRecord}</span> : null}
                    <span>{task.amountLabel}</span>
                  </p>
                </div>
                <div className="task-table-cell">
                  <span className={`task-type-pill task-type-${task.type}`}>
                    <span className="task-type-icon" />
                    {taskTypeLabel(task.type)}
                  </span>
                </div>
                <div className="task-table-cell">
                  <strong className="task-table-plain">{task.customerName}</strong>
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
                  <strong className="task-table-plain">{task.createdLabel}</strong>
                </div>
                <div className="task-table-cell">
                  <strong className="task-table-plain">{task.dueDateLabel}</strong>
                </div>
                <div className="task-table-cell task-table-cell-actions">
                  <a className="task-view-link" href={task.actionPath}>
                    View
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </article>
    </section>
  );
};

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
            <a className="ghost-button" href="/cash-app">Open Cash App</a>
          </div>
        </article>
      </div>
    </section>
  );
};

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
            <a className="ghost-button" href="/cash-app">Open Cash App</a>
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
              <a className={item.status === "healthy" ? "ghost-button" : "primary-button"} href="/integrations/business-central/connect">
                {item.status === "healthy" ? "Reconnect" : "Connect"}
              </a>
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

const CustomersPage = ({
  data,
  selectedCustomerId,
  activeTab,
}: {
  data: OperatorConsoleData;
  selectedCustomerId?: string;
  activeTab?: string;
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
              <a className="customers-export-button" href="/data-sources">
                <AppIcon name="download" />
                <span>Export</span>
              </a>
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
              {data.customerIndex.map((customer) => {
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
              })}
            </div>
          </article>
        </div>
      </section>
    );
  }

  const detail = buildCustomerDetailViewModel(data, selectedCustomer);
  const availableTabs = selectedCustomer.tabs.filter((tab) =>
    ["overview", "invoices", "tasks", "activity", "payments", "ap_portal"].includes(tab.id),
  );
  const resolvedTab = resolveCustomerTab(activeTab, availableTabs);

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
              <button type="button" className="customers-dark-button">
                <AppIcon name="mail" />
                <span>Email</span>
              </button>
              <button type="button" className="customers-outline-button">Pause Outreach</button>
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
                          {contact.verified ? "Verified" : "Internal"}
                        </span>
                        <span className="more-dot">⋯</span>
                      </div>
                    </div>
                  ))}
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
                  <div className="customers-table-cell"><a className="customers-primary-link" href="/invoice-detail">{invoice.invoiceNumber}</a></div>
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
                      <strong>Received</strong>
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
      </div>
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
  const payments = data.paymentsQueue.filter((item) => paymentMatchesCustomer(item, customer));
  const notesMatchSelectedProfile = data.customerProfile.profileId === customer.profileId;
  const insightSource = notesMatchSelectedProfile ? data.customerProfile : undefined;
  const learning = notesMatchSelectedProfile ? data.accountWorkspace.learning : undefined;

  const overdueInvoiceCount = invoices.filter(
    (invoice) => invoice.openAmountCents > 0 && (invoice.daysPastDue ?? 0) > 0,
  ).length;
  const oldestInvoice = [...invoices].sort((left, right) =>
    (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31"),
  )[0];

  const tasks = buildCustomerTasks(customer, queueItem, overdueInvoiceCount);
  const activity = buildCustomerActivity(customer, queueItem, payments);
  const contacts = buildCustomerContacts(customer, queueItem);
  const insights = learning
    ? [
        learning.accountPaymentBehaviorSummary.summary,
        learning.preferredSendTiming.reasonSummary,
        learning.preferredContactRecommendation.reasonSummary,
      ]
    : [
        `${customer.canonicalName} has ${customer.openInvoiceCount} open invoice${customer.openInvoiceCount === 1 ? "" : "s"} under review.`,
        customer.overdueAmount !== "₱0"
          ? `Overdue balance remains at ${customer.overdueAmount}; keep operator visibility high.`
          : "No overdue balance is blocking safe outreach right now.",
        customer.primaryContactEmail
          ? `${customer.primaryContactEmail} remains the safest surfaced contact for follow-up.`
          : "No verified contact is surfaced yet, so automation must stay conservative.",
      ];

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
      customer.parentAccountName
        ? `parent ${customer.parentAccountName} | billing ${customer.billingAccountId ?? customer.profileId} | branch preserved when known`
        : `billing ${customer.billingAccountId ?? customer.profileId} | branch preserved when known`,
    oldestDueDate: oldestInvoice?.dueDate ?? "—",
    lastOutreach: queueItem?.dueLabel ?? "12 minutes ago",
    openInvoicesLabel:
      invoices[0]
        ? `${invoices[0].invoiceNumber} and ${Math.max(invoices.length - 1, 0)} more`
        : `${customer.openInvoiceCount}`,
    overdueInvoiceCount,
    primaryEmail: customer.primaryContactEmail ?? queueItem?.contactEmail ?? "No verified email",
    primaryPhone: queueItem?.contactName ? "+63 917 000 0000" : "No verified phone",
    creditAmount: customer.disputedAmount !== "₱0" ? "₱0.00" : "₱0.00",
    portalStatus: customer.primaryContactEmail ? "Configured" : "Needs setup",
    portalType: customer.parentAccountName ? "Customer portal with centralized payer access" : "Customer portal",
    portalStatementAccess: customer.openInvoiceCount > 0 ? "Statements available" : "No open statements",
    tagLabel: customer.hasPendingReview ? "Needs review" : "No tags",
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
) {
  const primaryEmail = customer.primaryContactEmail ?? queueItem?.contactEmail ?? "No verified email";
  const references = payments.length > 0
    ? payments.slice(0, 2).map((item) => item.paymentReference).join(", ")
    : `Open invoices ${customer.openInvoiceCount}`;

  return [
    {
      id: `${customer.profileId}-phone-activity`,
      kind: "phone" as const,
      channel: queueItem?.contactName ?? "+63 917 000 0000",
      reference: `${references} and ${Math.max(customer.openInvoiceCount - 1, 0)} more`,
      tags: ["General", "Outreach"],
      dateLabel: "Oct 25, 2025",
      timeAgo: "12 minutes ago",
    },
    {
      id: `${customer.profileId}-email-activity`,
      kind: "mail" as const,
      channel: primaryEmail,
      reference: customer.nextAction,
      tags: ["General", "Outreach"],
      dateLabel: "Oct 25, 2025",
      timeAgo: "3 hours ago",
    },
  ];
}

function buildCustomerContacts(
  customer: OperatorConsoleData["customerIndex"][number],
  queueItem: CollectionsQueueItem | undefined,
) {
  const primaryEmail = customer.primaryContactEmail ?? queueItem?.contactEmail ?? "ap@customer.example";

  return [
    {
      name: customer.canonicalName,
      email: primaryEmail,
      verified: Boolean(customer.primaryContactEmail ?? queueItem?.contactEmail),
    },
    {
      name: queueItem?.contactName ?? "Collections Contact",
      email: customer.primaryContactEmail ?? "collections@example.com",
      verified: false,
    },
  ];
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

const InvoiceDetailPage = ({ data }: { data: OperatorConsoleData }) => (
  <section className="page-section">
    <PageHeader
      title="Invoice detail"
      description="Identity, due status, branch, docs, dispute state, and next step"
    />
    <div className="detail-card">
      <div className="title-with-pills">
        <h2>{data.invoiceDetail.invoiceNumber}</h2>
        <span className="pill pill-danger">{data.invoiceDetail.status}</span>
      </div>
      <div className="detail-grid">
        <DetailField label="Billing account" value={data.invoiceDetail.billingAccountId} />
        <DetailField label="Branch ID" value={data.invoiceDetail.branchId} />
        <DetailField label="Amount" value={data.invoiceDetail.amount} />
        <DetailField label="Due date" value={data.invoiceDetail.dueDate} />
        <DetailField label="Collectible" value={data.invoiceDetail.collectibleAmount ?? "—"} />
        <DetailField label="Disputed" value={data.invoiceDetail.disputedAmount ?? "—"} />
      </div>
      <div className="reason-box">
        <span className="label-copy">Dispute state</span>
        <p>{data.invoiceDetail.disputeState}</p>
        <p>{data.invoiceDetail.explanation}</p>
      </div>
      <div className="card-grid card-grid-2">
        {data.invoiceDetail.linkedStatuses.map((item) => (
          <article key={item.id} className="detail-card">
            <div className="title-with-pills">
              <h2>{item.reference}</h2>
              <span className={`pill ${item.kind === "payment" ? "pill-success" : "pill-info"}`}>
                {humanize(item.kind)}
              </span>
            </div>
            <p><strong>Status:</strong> {item.status}</p>
            {item.amount ? <p><strong>Amount:</strong> {item.amount}</p> : null}
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
    </div>
  </section>
);

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
  icon,
  accent,
  footer,
}: {
  title: string;
  value: string;
  icon: "currency" | "alert-outline" | "trend" | "sparkle-mini";
  accent: "info" | "danger" | "success" | "violet";
  footer: string;
}) => (
  <article className="analytics-metric-card">
    <div className="analytics-metric-top">
      <p>{title}</p>
      <span className={`analytics-metric-icon analytics-metric-icon-${accent}`}>
        <AppIcon name={icon} />
      </span>
    </div>
    <strong className="analytics-metric-value">{value}</strong>
    <span className={`analytics-metric-footer analytics-metric-footer-${accent}`}>{footer}</span>
  </article>
);

const AnalyticsSummaryCard = ({
  title,
  value,
  subtitle,
  accent,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  accent: "info" | "success" | "violet";
  icon: "invoice" | "customers" | "clock";
}) => (
  <article className="analytics-summary-card">
    <div className="analytics-summary-top">
      <span className={`analytics-summary-icon analytics-summary-icon-${accent}`}>
        <AppIcon name={icon} />
      </span>
      <p>{title}</p>
    </div>
    <strong className="analytics-summary-value">{value}</strong>
    <span className={`analytics-summary-subtitle analytics-summary-subtitle-${accent}`}>{subtitle}</span>
  </article>
);

const AnalyticsSectionStat = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "info" | "danger";
}) => (
  <div className="analytics-section-stat">
    <span>{label}</span>
    <strong className={`analytics-section-stat-value analytics-section-stat-value-${tone}`}>{value}</strong>
  </div>
);

const AnalyticsLineChart = ({
  points,
}: {
  points: Array<{ label: string; value: number }>;
}) => {
  const width = 640;
  const height = 220;
  const paddingX = 28;
  const paddingTop = 24;
  const paddingBottom = 34;
  const minValue = Math.min(...points.map((point) => point.value)) - 2;
  const maxValue = Math.max(...points.map((point) => point.value)) + 2;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingTop - paddingBottom;
  const denominator = Math.max(1, maxValue - minValue);

  const chartPoints = points.map((point, index) => {
    const x = paddingX + (innerWidth * index) / Math.max(1, points.length - 1);
    const y = paddingTop + ((maxValue - point.value) / denominator) * innerHeight;

    return {
      ...point,
      x,
      y,
    };
  });

  const polyline = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const horizontalGuides = Array.from({ length: 4 }, (_, index) => paddingTop + (innerHeight * index) / 3);

  return (
    <div className="analytics-line-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="DSO trend line chart">
        {horizontalGuides.map((y) => (
          <line
            key={y}
            x1={paddingX}
            x2={width - paddingX}
            y1={y}
            y2={y}
            className="analytics-line-guide"
          />
        ))}
        {chartPoints.map((point) => (
          <line
            key={`${point.label}-guide`}
            x1={point.x}
            x2={point.x}
            y1={paddingTop}
            y2={height - paddingBottom}
            className="analytics-line-vertical-guide"
          />
        ))}
        <polyline points={polyline} className="analytics-line-path" />
        {chartPoints.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="4.5" className="analytics-line-point" />
            <text x={point.x} y={height - 12} textAnchor="middle" className="analytics-line-label">
              {point.label}
            </text>
          </g>
        ))}
      </svg>
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
  const invoiceHref = index === 0 ? "/invoice-detail" : "#";

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
}: {
  invoice: OperatorConsoleData["invoiceIndex"]["invoices"][number];
}) => (
  <>
    <div className="table-cell">
      <strong>{invoice.sourceLabel}</strong>
      <p>
        {invoice.importMode === "live_connection"
          ? "Live import"
          : invoice.importMode === "manual_upload"
            ? "Manual spreadsheet upload"
            : "Seed fallback"}
      </p>
    </div>
    <div className="table-cell">
      <strong>{invoice.invoiceNumber}</strong>
      <p>{invoice.externalId ?? invoice.canonicalInvoiceId ?? "No external ID"}</p>
    </div>
    <div className="table-cell">
      <strong>{invoice.customerName}</strong>
      <p>
        {invoice.customerReference ??
          invoice.billingAccountName ??
          (invoice.sourceProvider === "spreadsheet_upload" ? "Manual spreadsheet import" : "No customer reference")}
      </p>
    </div>
    <div className="table-cell">
      <strong>{invoice.billingAccountName ?? invoice.billingAccountId ?? "Unmapped billing account"}</strong>
      <p>{invoice.branchName ?? invoice.branchId ?? invoice.parentAccountName ?? "No branch tag"}</p>
    </div>
    <div className="table-cell">
      <span className={`pill ${invoiceStatusClassName(invoice.status)}`}>{humanize(invoice.status)}</span>
      <p>{invoice.sourceStatus}</p>
    </div>
    <div className="table-cell">
      <strong>{invoice.dueDate ?? "No due date"}</strong>
      <p>{invoice.issuedAt ?? invoice.lastImportedAt ?? "No import timestamp"}</p>
    </div>
    <div className="table-cell">
      <strong>{formatPhp(invoice.openAmountCents)}</strong>
      <p>{invoice.daysPastDue ? `${invoice.daysPastDue} days past due` : "Current or undated"}</p>
    </div>
    <div className="table-cell">
      <strong>{formatPhp(invoice.totalAmountCents)}</strong>
      <p>{invoice.currency}</p>
    </div>
  </>
);

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

function formatTopbarDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
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

function buildAnalyticsViewModel(data: OperatorConsoleData) {
  const totalOutstandingCents = data.invoiceIndex.summary.openAmountCents;
  const overdueBalanceCents = data.overdueExposure.overdueOpenAmountCents;
  const estimatedDsoDays = estimateDsoDays(data.invoiceAgingAnalytics);
  const collectionsRate = Math.max(
    0,
    Math.min(100, data.collectibleVsDisputed.collectibleCoverageRatio * 100),
  );
  const monthlyPerformance = buildAnalyticsMonthlyPerformance(
    totalOutstandingCents,
    data.collectibleVsDisputed.collectibleCoverageRatio,
    data.generatedAt,
  );
  const topCustomers = buildAnalyticsTopCustomers(data.invoiceIndex.invoices);
  const activeCustomerCount = new Set(
    data.invoiceIndex.invoices
      .filter((invoice) => invoice.openAmountCents > 0)
      .map((invoice) => invoice.billingAccountId ?? invoice.customerReference ?? invoice.customerName),
  ).size;
  const overdueShare =
    data.homeSnapshotMetrics.openInvoiceCount > 0
      ? (data.homeSnapshotMetrics.overdueInvoiceCount / data.homeSnapshotMetrics.openInvoiceCount) * 100
      : 0;
  const agingLegend = buildAnalyticsAgingLegend(data.invoiceAgingAnalytics.buckets);
  const dsoTrend = buildAnalyticsDsoTrend(estimatedDsoDays, data.generatedAt);

  return {
    totalOutstandingCents,
    overdueBalanceCents,
    estimatedDsoDays,
    collectionsRate,
    monthlyPerformance,
    topCustomers,
    activeCustomerCount,
    customersNeedingAttention: Math.min(activeCustomerCount, data.collectionsQueue.length + data.exceptionCounts.totalOpen),
    openInvoiceCount: data.homeSnapshotMetrics.openInvoiceCount,
    overdueInvoiceCount: data.homeSnapshotMetrics.overdueInvoiceCount,
    overdueShareLabel: `${Math.round(overdueShare)}%`,
    avgCollectionTimeDays: Math.max(estimatedDsoDays - 7, 1),
    agingLegend,
    agingChart: buildAnalyticsConicGradient(agingLegend),
    dsoTrend,
  };
}

function estimateDsoDays(invoiceAgingAnalytics: OperatorConsoleData["invoiceAgingAnalytics"]) {
  const midpointByBucket: Record<string, number> = {
    current: 12,
    days_1_30: 24,
    days_31_60: 46,
    days_61_90: 73,
    days_90_plus: 102,
  };
  const weightedTotal = invoiceAgingAnalytics.buckets.reduce((sum, bucket) => {
    return sum + bucket.openAmountCents * (midpointByBucket[bucket.id] ?? 0);
  }, 0);
  const totalOpen = invoiceAgingAnalytics.buckets.reduce((sum, bucket) => sum + bucket.openAmountCents, 0);

  return totalOpen > 0 ? Math.round(weightedTotal / totalOpen) : 0;
}

function buildAnalyticsMonthlyPerformance(
  totalOutstandingCents: number,
  collectibleCoverageRatio: number,
  generatedAt: string,
) {
  const baseTargetMultipliers = [0.78, 0.86, 0.91, 0.88, 0.95, 1];
  const collectedPerformance = [0.92, 0.95, 0.97, 0.96, 0.99, 1.02];
  const maxTargetCents = totalOutstandingCents * 1.02;

  return baseTargetMultipliers.map((multiplier, index) => {
    const date = new Date(generatedAt);
    date.setUTCMonth(date.getUTCMonth() - (baseTargetMultipliers.length - index - 1));
    const targetCents = Math.round(totalOutstandingCents * multiplier);
    const collectedRatio = index < collectedPerformance.length ? collectedPerformance[index]! : 1;
    const collectedCents = Math.round(
      targetCents * Math.max(0.74, Math.min(0.98, collectibleCoverageRatio + 0.08)) * collectedRatio,
    );

    return {
      label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "Asia/Manila" }).format(date),
      targetCents,
      collectedCents,
      targetRatio: targetCents / Math.max(maxTargetCents, 1),
      collectedRatio: collectedCents / Math.max(maxTargetCents, 1),
    };
  });
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

function buildAnalyticsAgingLegend(buckets: OperatorConsoleData["invoiceAgingAnalytics"]["buckets"]) {
  const colors = ["#15b981", "#2f6fed", "#f59e0b", "#ef4444", "#991b1b"];
  const positions = ["top", "bottom-left", "bottom-right", "right-lower", "right-upper"];
  const total = buckets.reduce((sum, bucket) => sum + bucket.openAmountCents, 0);

  return buckets.map((bucket, index) => ({
    label: bucket.id === "current" ? "Current days" : bucket.label,
    amountCents: bucket.openAmountCents,
    percent: total > 0 ? Math.round((bucket.openAmountCents / total) * 100) : 0,
    color: colors[index] ?? "#94a3b8",
    position: positions[index] ?? "top",
  }));
}

function buildAnalyticsConicGradient(
  legend: Array<{ percent: number; color: string }>,
) {
  let currentOffset = 0;
  const stops = legend.map((segment, index) => {
    const start = currentOffset;
    const end = index === legend.length - 1 ? 100 : currentOffset + segment.percent;
    currentOffset = end;

    return `${segment.color} ${start}% ${end}%`;
  });

  return `conic-gradient(${stops.join(", ")})`;
}

function buildAnalyticsDsoTrend(currentDsoDays: number, generatedAt: string) {
  const offsets = [10, 8, 6, 4, 2, 0];

  return offsets.map((offset, index) => {
    const date = new Date(generatedAt);
    date.setUTCMonth(date.getUTCMonth() - (offsets.length - index - 1));

    return {
      label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "Asia/Manila" }).format(date),
      value: currentDsoDays + offset,
    };
  });
}

function buildHomeCalendarDays(generatedAt: string) {
  const baseDate = new Date(generatedAt);
  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(baseDate);
    date.setUTCDate(baseDate.getUTCDate() - 3 + index);
    const parts = formatter.formatToParts(date);
    const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
    const label = parts.find((part) => part.type === "day")?.value ?? "";

    return {
      weekday,
      label,
      isActive: index === 3,
    };
  });
}

function formatHomeCalendarMonth(generatedAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(generatedAt));
}

function buildHomeTaskAgeBuckets(totalTaskCount: number) {
  const ratios = [0.42, 0.28, 0.18, 0.08, 0.74];
  const labels = ["1-7d", "8-14d", "15-21d", "22-30d", ">30d"];
  const counts = ratios.map((ratio, index) => {
    const baseline = Math.max(index === ratios.length - 1 ? 2 : 1, Math.round(totalTaskCount * ratio));
    return totalTaskCount > 0 ? baseline : 0;
  });
  const maxCount = Math.max(...counts, 1);

  return {
    axis: [12, 9, 6, 3, 0],
    buckets: labels.map((label, index) => ({
      label,
      count: counts[index] ?? 0,
      height: Math.max(10, Math.round(((counts[index] ?? 0) / maxCount) * 100)),
    })),
  };
}

function buildHomeTaskTypeBuckets(
  items: Array<{ label: string; count: number }>,
) {
  const palette = ["#5b8def", "#6d61f2", "#8b5cf6", "#a78bfa"];
  const segments = items.slice(0, 4).map((item, index) => ({
    label: item.label,
    value: item.count,
    color: palette[index] ?? "#c4b5fd",
  }));

  if (segments.length === 0) {
    segments.push({ label: "Follow up", value: 1, color: palette[0]! });
  }

  return { segments };
}

function buildHomeCustomerBuckets(
  items: Array<{ label: string; count: number }>,
) {
  const palette = ["#7c6cf2", "#6d61f2", "#8b5cf6", "#c4b5fd"];
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

  if (segments.length === 0) {
    segments.push({ label: "Others", value: 1, color: palette[3]! });
  }

  return {
    totalCustomers,
    segments,
  };
}

function buildHomeRespondToItems(input: {
  customerItems: Array<{ label: string; count: number; actionPath: string }>;
  taskTypeItems: Array<{ label: string; count: number; actionPath: string }>;
}) {
  const primaryCustomer = input.customerItems[0];
  const primaryTaskType = input.taskTypeItems[0];
  const secondaryTaskType = input.taskTypeItems[1];

  return [
    primaryCustomer
      ? {
          label: `${primaryCustomer.count} open tasks from ${primaryCustomer.label}`,
          actionPath: primaryCustomer.actionPath,
        }
      : null,
    primaryTaskType
      ? {
          label: `${primaryTaskType.count} ${primaryTaskType.label.toLowerCase()} tasks ready for action`,
          actionPath: primaryTaskType.actionPath,
        }
      : null,
    secondaryTaskType
      ? {
          label: `${secondaryTaskType.count} ${secondaryTaskType.label.toLowerCase()} tasks next in queue`,
          actionPath: secondaryTaskType.actionPath,
        }
      : null,
  ].filter((item): item is { label: string; actionPath: string } => Boolean(item));
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
  subjectLine?: string;
  preview: string;
  owner: string;
  receivedLabel: string;
  bucket: "unread" | "sent" | "draft";
  isLinked?: boolean;
  providerThreadId?: string;
  providerMessageId?: string;
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
      const customerName =
        queueItem?.accountName ??
        message.fromName ??
        message.fromEmail ??
        message.toEmail ??
        `Collections thread ${index + 1}`;
      const directionBucket =
        message.direction === "outbound" ? "sent" : message.unread ? "unread" : "draft";

      return {
        id: message.providerMessageId,
        customerName,
        email: queueItem?.contactEmail ?? message.fromEmail ?? message.toEmail ?? "unknown@customer.com",
        ...(message.subjectLine ? { subjectLine: message.subjectLine } : {}),
        preview: message.subjectLine ?? message.snippet ?? queueItem?.nextAction ?? "Open thread for context.",
        owner: queueItem?.assignee ?? "Juan Cruz",
        receivedLabel: formatCollectionsMessageTime(message.receivedAt),
        bucket: directionBucket,
        isLinked: Boolean(queueItem),
        ...(message.providerThreadId ? { providerThreadId: message.providerThreadId } : {}),
        providerMessageId: message.providerMessageId,
      };
    });
  }

  return data.collectionsQueue.slice(0, 4).map((item, index) => ({
    id: item.id,
    customerName: item.accountName,
    email: item.contactEmail ?? collectionEmail(index),
    subjectLine: `Re: ${item.nextAction}`,
    preview: [
      `Re: ${item.nextAction}`,
      `${item.rationale}`,
      `Collections update: ${item.promiseDue}. ${item.nextAction}`,
      `Need customer confirmation before release. ${item.rationale}`,
    ][index] ?? item.nextAction,
    owner: item.assignee ?? collectionAssignee(index),
    receivedLabel: ["3 hours ago", "3 hours ago", "10/24/2025", "10/22/2025"][index] ?? "Just now",
    bucket: (["unread", "unread", "sent", "draft"] as const)[index] ?? "unread",
    isLinked: index === 2,
    providerMessageId: item.id,
  }));
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
    return `₱${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(amount) >= 1_000) {
    return `₱${Math.round(amount / 1_000)}K`;
  }

  return `₱${Math.round(amount)}`;
}

function formatPhpCompactLong(valueCents: number) {
  const amount = valueCents / 100;

  if (Math.abs(amount) >= 1_000_000) {
    return `₱${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(amount) >= 1_000) {
    return `₱${(amount / 1_000).toFixed(1)}K`;
  }

  return formatPhp(valueCents);
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

const ControlCenterPage = ({
  data,
  activeTab = "workflows",
  expandedWorkflowId,
  selectedTemplateId,
  stageModalWorkflowId,
  stageModalChannel = "email",
  stageModalTemplateMode = "pre_saved_template",
}: {
  data: OperatorConsoleData;
  activeTab?: "workflows" | "email-templates" | "call-agent" | "config";
  expandedWorkflowId?: string;
  selectedTemplateId?: string;
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
    callAgent: { providerType: "retell", phoneNumber: "", defaultBehaviorFlags: [] },
    config: {
      defaultTimezone: "Asia/Manila",
      allowedChannels: ["email", "sms", "call"],
      channelFallbackPolicy: "manual_review_only",
      sandboxMode: "audit_preview_only",
    },
    templateFolders: [],
    templates: [],
    providerPreview: { providerType: "retell", payload: {} },
  };
  const emailPreview = controlCenter.generationPreview.email.emailDraft;
  const smsPreview = controlCenter.generationPreview.sms.smsDraft;
  const voicePreview = controlCenter.generationPreview.voice.voicePayload;
  const collectionWorkflows = controlCenter.workflows.filter((workflow) => workflow.category === "collections");
  const selectedStageWorkflow = controlCenter.workflows.find((workflow) => workflow.id === stageModalWorkflowId);
  const selectedTemplate = controlCenter.templates.find((template) => template.id === selectedTemplateId);
  const selectedTemplatePreview = data.controlCenterTemplatePreview;
  const workflowRows = collectionWorkflows.length > 0 ? collectionWorkflows : controlCenter.workflows;
  const availableTemplates = controlCenter.templates.filter((template) => {
    if (stageModalChannel === "call") {
      return template.channelCompatibility.includes("voice_agent");
    }
    return template.channelCompatibility.includes(stageModalChannel);
  });
  const activeExpandedWorkflowId = expandedWorkflowId;
  const buildControlCenterHref = ({
    tab = activeTab,
    workflow,
    selectedTemplate,
    stageWorkflow,
    stageChannel,
    stageTemplateMode: templateMode,
  }: {
    tab?: "workflows" | "email-templates" | "call-agent" | "config";
    workflow?: string;
    selectedTemplate?: string;
    stageWorkflow?: string;
    stageChannel?: "email" | "call" | "sms";
    stageTemplateMode?: "pre_saved_template" | "ai_generated";
  } = {}) => {
    const params = new URLSearchParams();
    if (tab && tab !== "workflows") {
      params.set("controlCenterTab", tab);
    }
    if (workflow) {
      params.set("workflow", workflow);
    }
    if (selectedTemplate) {
      params.set("selectedTemplateId", selectedTemplate);
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
  const stageModalBaseHref = (channel: "email" | "call" | "sms", templateMode = stageModalTemplateMode) =>
    buildControlCenterHref({
      tab: "workflows",
      workflow: stageModalWorkflowId ?? activeExpandedWorkflowId ?? "",
      stageWorkflow: stageModalWorkflowId ?? activeExpandedWorkflowId ?? "",
      stageChannel: channel,
      stageTemplateMode: templateMode,
    });
  const templateModeHref = (templateMode: "pre_saved_template" | "ai_generated") =>
    stageModalBaseHref(stageModalChannel, templateMode);
  const folderNameById = new Map(
    controlCenter.folders.map((folder: OperatorConsoleData["controlCenter"]["folders"][number]) => [folder.id, folder.name]),
  );
  const describeStageSentence = (
    stage: OperatorConsoleData["controlCenter"]["workflows"][number]["stages"][number],
  ) => {
    const comparator = stage.triggerConfig.comparator ?? stage.triggerType;
    const outreachLabel =
      stage.outreachType === "email" ? "email reminder" : stage.outreachType === "call" ? "call follow-up" : "SMS reminder";
    const templateLabel =
      stage.templateMode === "pre_saved_template" && stage.templateId
        ? controlCenter.templates.find((template) => template.id === stage.templateId)?.name ?? "saved template"
        : "AI Generate";
    if (comparator === "due_in_days") {
      return `When an invoice is ${stage.triggerConfig.offsetDays ?? 0} days until due date send an ${outreachLabel} using ${templateLabel}`;
    }
    if (comparator === "days_past_due") {
      return `When an invoice is ${stage.triggerConfig.offsetDays ?? 0} days past due send a ${outreachLabel} using ${templateLabel}`;
    }
    if (comparator === "remittance_missing_after_payment") {
      return `When remittance is missing after payment detected start a ${outreachLabel} using ${templateLabel}`;
    }
    if (comparator === "promise_missed") {
      return `When a promise to pay is missed send a ${outreachLabel} using ${templateLabel}`;
    }
    return `Trigger ${comparator.replaceAll("_", " ")} with ${outreachLabel} using ${templateLabel}`;
  };
	  const renderWorkflowCard = (workflow: OperatorConsoleData["controlCenter"]["workflows"][number]) => (
    <details key={workflow.id} className="control-center-workflow-row" open={workflow.id === activeExpandedWorkflowId}>
	      <summary>
	        <div className="control-center-workflow-summary">
          <form method="post" action="/control-center/workflows/toggle" className="control-center-toggle-form">
            <input type="hidden" name="workflowId" value={workflow.id} />
            <input type="hidden" name="enabled" value={workflow.enabled ? "false" : "true"} />
            <button
              type="submit"
              className={`workflow-toggle${workflow.enabled ? " is-active" : ""}`}
              aria-label={workflow.enabled ? "Disable workflow" : "Enable workflow"}
            >
              <span className="workflow-toggle-knob" />
            </button>
          </form>
          <div className="control-center-workflow-copy">
            <h3>{workflow.name}</h3>
            <p>{workflow.approxTargetCount} customers</p>
          </div>
	        </div>
	        <div className="control-center-workflow-actions">
	          <span className="workflow-stage-badge">{workflow.stageCount} Stages</span>
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
        <form method="post" action="/control-center/workflows/update" className="control-center-grid-form">
          <input type="hidden" name="workflowId" value={workflow.id} />
          <label>
            <span>Name</span>
            <input type="text" name="name" defaultValue={workflow.name} />
          </label>
          <label>
            <span>Email sender</span>
            <input type="email" name="senderEmail" defaultValue={workflow.senderEmail ?? ""} />
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
            <span>Timezone</span>
            <input type="text" name="timezone" defaultValue={workflow.timezone} />
          </label>
          <label>
            <span>Outreach window</span>
            <div className="control-center-inline-row">
              <input type="text" name="outreachWindowStart" defaultValue={workflow.outreachWindowStart} />
              <input type="text" name="outreachWindowEnd" defaultValue={workflow.outreachWindowEnd} />
            </div>
          </label>
          <div className="control-center-full-row">
            <span className="control-center-field-label">Selected outreach days</span>
            <input type="hidden" name="outreachDays" value={workflow.outreachDays.join(",")} />
            <div className="weekday-pill-row" aria-label="Selected outreach days">
              {(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const).map((day) => (
                <span key={day} className={`weekday-pill${workflow.outreachDays.includes(day) ? " is-active" : ""}`}>
                  {day.slice(0, 3).replace(/^./, (letter) => letter.toUpperCase())}
                </span>
              ))}
            </div>
          </div>
          <div className="control-center-full-row control-center-toggle-row">
            <span className="control-center-field-label">Weekend Calling</span>
            <label className="workflow-toggle control-center-inline-toggle">
              <input
                type="checkbox"
                name="weekendCallingEnabled"
                defaultChecked={workflow.weekendCallingEnabled}
                className="sr-only"
              />
              <span className="workflow-toggle-knob" />
            </label>
          </div>
          <div className="control-center-full-row">
            <button type="submit" className="primary-button">Save Workflow</button>
          </div>
        </form>

	        <div className="control-center-stage-header">
	          <div>
	            <h4>Stages</h4>
	            <p>Add email, SMS, or call steps with safe trigger rules.</p>
	          </div>
	          <a href={`/control-center?workflow=${encodeURIComponent(workflow.id)}&stageWorkflow=${encodeURIComponent(workflow.id)}&stageChannel=email&stageTemplateMode=pre_saved_template`} className="primary-button control-center-button-with-icon">
              <AppIcon name="plus" />
              Add Stage
            </a>
	        </div>
        <div className="control-center-stage-list">
          {workflow.stages.map((stage: OperatorConsoleData["controlCenter"]["workflows"][number]["stages"][number]) => (
            <article key={stage.id} className="control-center-stage-item">
              <div className="control-center-stage-sentence">
                <span className={`stage-channel-icon is-${stage.outreachType}`} aria-hidden="true">
                  {stage.outreachType === "email" ? "✉" : stage.outreachType === "call" ? "⌕" : "◫"}
                </span>
                <div>
                  <p className="control-center-stage-sentence-copy">{describeStageSentence(stage)}</p>
                  <p className="control-center-stage-meta">
                    {stage.enabled ? "Active" : "Inactive"} · {stage.requiresApproval ? "Approval required" : "No approval"}
                  </p>
                </div>
	              </div>
	              <div className="control-center-stage-tags">
	                <span className="workflow-chevron workflow-chevron-icon" aria-hidden="true">
                    <AppIcon name="chevron-right" />
                  </span>
	              </div>
	            </article>
	          ))}
        </div>
      </div>
	    </details>
	  );

  const tabHref = (tab: "workflows" | "email-templates" | "call-agent" | "config") =>
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

  return (
    <section className="page-shell control-center-page">
      <header className="control-center-hero">
        <div>
          <h1>Control Center</h1>
          <p>Manage agent rules and triggers</p>
        </div>
      </header>

      <nav className="control-center-tabbar" aria-label="Control Center tabs">
        <a href={tabHref("workflows")} className={`control-center-tab${activeTab === "workflows" ? " is-active" : ""}`}>Workflows</a>
        <a href={tabHref("email-templates")} className={`control-center-tab${activeTab === "email-templates" ? " is-active" : ""}`}>Email Templates</a>
        <a href={tabHref("call-agent")} className={`control-center-tab${activeTab === "call-agent" ? " is-active" : ""}`}>Call Agent</a>
        <a href={tabHref("config")} className={`control-center-tab${activeTab === "config" ? " is-active" : ""}`}>Config</a>
      </nav>

      {activeTab === "workflows" ? (
        <>
          <div className="control-center-intro-row">
	            <p className="control-center-lead">Configure time based email or call triggers to conduct outreach for collection.</p>
	            <form method="post" action="/control-center/workflows/create" className="control-center-inline-form">
	              <input type="hidden" name="category" value="collections" />
	              <input type="hidden" name="name" value="New workflow" />
	              <button type="submit" className="primary-button control-center-button-with-icon">
                  <AppIcon name="plus" />
                  New Workflow
                </button>
	            </form>
	          </div>

	          <div className="control-center-layout">
	            <aside className="control-center-sidebar">
	              <a href={buildControlCenterHref({ tab: "workflows" })} className="control-center-category-card is-active">
	                <div className="control-center-category-icon" aria-hidden="true">
                    <AppIcon name="sparkle-mini" />
                  </div>
	                <div>
	                  <h3>Collections</h3>
	                  <p>Define how your agent monitors and follows up on open invoices.</p>
	                </div>
	              </a>
	              <a href={buildControlCenterHref({ tab: "workflows" })} className="control-center-category-card">
	                <div className="control-center-category-icon payments" aria-hidden="true">
                    <AppIcon name="cash" />
                  </div>
	                <div>
	                  <h3>Payments</h3>
                  <p>Enable and customize your Yield-powered payment experience.</p>
                </div>
              </a>
            </aside>

            <div className="control-center-main">
              <div id="collections-workflows" className="control-center-workflow-group">
                {workflowRows.length > 0 ? workflowRows.map(renderWorkflowCard) : <p>No collection workflows yet.</p>}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {activeTab === "email-templates" ? (
        <div className="control-center-main">
          <section className="control-center-templates-screen">
            <div className="control-center-template-toolbar">
              <div className="control-center-template-filter-row">
                <button type="button" className="template-filter-pill is-active">All</button>
                <form method="post" action="/control-center/folders/create">
                  <input type="hidden" name="name" value="New Folder" />
                  <button type="submit" className="template-filter-pill template-outline-pill">
                    <AppIcon name="folder-plus" />
                    New Folder
                  </button>
                </form>
                {controlCenter.folders.map((folder: OperatorConsoleData["controlCenter"]["folders"][number]) => (
                  <button key={folder.id} type="button" className="template-filter-pill template-outline-pill">
                    {folder.name}
                  </button>
                ))}
              </div>
              <form method="post" action="/control-center/templates/create">
                <input type="hidden" name="name" value="New Template" />
                <input type="hidden" name="subject" value="Collections follow-up" />
                <input type="hidden" name="body" value="Hi {{customer_name}}, we are following up on {{invoice_numbers}}." />
                <input type="hidden" name="channelCompatibility" value="email" />
                <button type="submit" className="primary-button control-center-button-with-icon">
                  <AppIcon name="plus" />
                  Template
                </button>
              </form>
            </div>

            <div className="control-center-template-searchbar">
              <AppIcon name="search" />
              <input type="text" value="" placeholder="Search by template name" readOnly aria-label="Search by template name" />
            </div>

            <div className="control-center-template-table-wrap">
              <div className="control-center-template-table control-center-template-table-head">
                <div className="control-center-template-cell control-center-template-checkbox-cell">
                  <span className="template-checkbox" aria-hidden="true" />
                </div>
                <div className="control-center-template-cell">Name</div>
                <div className="control-center-template-cell">Subject</div>
                <div className="control-center-template-cell">Body</div>
                <div className="control-center-template-cell">Folder</div>
              </div>

	              {controlCenter.templates.map((template: OperatorConsoleData["controlCenter"]["templates"][number]) => (
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
                  <div className="control-center-template-cell control-center-template-folder">
                    {template.folderId ? folderNameById.get(template.folderId) ?? "—" : "—"}
                  </div>
                </div>
	              ))}
	            </div>
	          </section>
	        </div>
	      ) : null}

      {activeTab === "email-templates" && selectedTemplate ? (
        <div className="control-center-template-drawer-shell" role="dialog" aria-modal="true" aria-labelledby="template-drawer-title">
          <a
            href={buildControlCenterHref({ tab: "email-templates" })}
            className="control-center-template-drawer-backdrop"
            aria-label="Close template editor"
          />
          <aside className="control-center-template-drawer">
            <div className="control-center-template-drawer-head">
              <h2 id="template-drawer-title">{selectedTemplate.name}</h2>
              <a
                href={buildControlCenterHref({ tab: "email-templates" })}
                className="control-center-template-drawer-close"
                aria-label="Close"
              >
                ×
              </a>
            </div>

            <div className="control-center-template-drawer-content">
              <form method="post" action="/control-center/templates/update" className="control-center-template-editor">
                <input type="hidden" name="templateId" value={selectedTemplate.id} />
                <div className="control-center-template-editor-fields">
                  <label>
                    <span>Name</span>
                    <input type="text" name="name" defaultValue={selectedTemplate.name} />
                  </label>
                  <label>
                    <span>Subject</span>
                    <input type="text" name="subject" defaultValue={selectedTemplate.subject} />
                  </label>
                  <label>
                    <span>Folder</span>
                    <select name="folderId" defaultValue={selectedTemplate.folderId ?? ""}>
                      <option value="">No folder</option>
                      {controlCenter.folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
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
                    <button type="button" className="template-mini-button">Cc</button>
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

                <textarea name="body" defaultValue={selectedTemplate.body} className="control-center-template-editor-body" />
                <div className="control-center-template-editor-footer">
                  <div className="control-center-template-editor-tools" aria-hidden="true">
                    <span>B</span>
                    <span>I</span>
                    <span>U</span>
                    <span>•</span>
                    <span>1.</span>
                    <span>🔗</span>
                    <span>📎</span>
                    <span>Variable</span>
                  </div>
                  <div className="control-center-template-editor-actions">
                    <span className="template-save-state">Saved</span>
                    <button type="submit" className="primary-button">Save Template</button>
                  </div>
                </div>
              </form>

              <section className="control-center-template-preview-pane">
                <div className="control-center-template-preview-chip">Template Preview</div>
                <div className="control-center-template-preview-block">
                  <h3>To</h3>
                  <p>{selectedTemplatePreview?.sampleVariables.customer_email ?? "maria.santos@example.com"}</p>
                </div>
                {selectedTemplate.ccEmails.length > 0 ? (
                  <div className="control-center-template-preview-block">
                    <h3>Cc</h3>
                    <p>{selectedTemplate.ccEmails.join(", ")}</p>
                  </div>
                ) : null}
                <div className="control-center-template-preview-block">
                  <h3>Subject</h3>
                  <p>{selectedTemplatePreview?.subject ?? selectedTemplate.subject}</p>
                </div>
                <div className="control-center-template-preview-block">
                  <h3>Body</h3>
                  <div className="control-center-template-preview-copy">
                    {(selectedTemplatePreview?.body ?? selectedTemplate.body)
                      .split("\n")
                      .map((paragraph, index) =>
                        renderPreviewParagraph(selectedTemplate.id, paragraph, index),
                      )}
                  </div>
                </div>
                {selectedTemplate.folderId ? (
                  <div className="control-center-template-preview-block">
                    <h3>Folder</h3>
                    <p>{folderNameById.get(selectedTemplate.folderId) ?? "—"}</p>
                  </div>
                ) : null}
              </section>
            </div>
          </aside>
        </div>
      ) : null}

      {activeTab === "call-agent" ? (
        <div className="control-center-main">
          <article id="cc-call-agent" className="control-center-card">
            <div className="control-center-card-head">
              <div>
                <h2>Call Agent</h2>
                <p>Configure voice behavior, handoff settings, and provider-ready payloads.</p>
              </div>
            </div>

            <form method="post" action="/control-center/call-agent/update" className="control-center-grid-form">
              <label>
                <span>Phone number</span>
                <input type="text" name="phoneNumber" defaultValue={controlCenter.callAgentConfig.phoneNumber} />
              </label>
              <label>
                <span>Human escalation</span>
                <input
                  type="text"
                  name="humanSupportNumber"
                  defaultValue={controlCenter.callAgentConfig.humanSupportNumber ?? ""}
                />
              </label>
              <label className="control-center-checkbox">
                <input type="checkbox" name="smsEnabled" defaultChecked={controlCenter.callAgentConfig.smsEnabled} />
                <span>Inbound/outbound SMS enabled</span>
              </label>
              <label className="control-center-checkbox">
                <input
                  type="checkbox"
                  name="outboundCallingEnabled"
                  defaultChecked={controlCenter.callAgentConfig.outboundCallingEnabled}
                />
                <span>Outbound calling enabled</span>
              </label>
              <label className="control-center-checkbox">
                <input
                  type="checkbox"
                  name="handoffToHumanEnabled"
                  defaultChecked={controlCenter.callAgentConfig.handoffToHumanEnabled}
                />
                <span>Route handoff requests to human support</span>
              </label>
              <label className="control-center-checkbox">
                <input
                  type="checkbox"
                  name="callRecordingDisclaimerEnabled"
                  defaultChecked={controlCenter.callAgentConfig.callRecordingDisclaimerEnabled}
                />
                <span>Call recording disclaimer</span>
              </label>
              <label className="control-center-full-row">
                <span>Manual instructions</span>
                <textarea name="manualAgentInstructions" defaultValue={controlCenter.callAgentConfig.manualAgentInstructions} />
              </label>
              <label className="control-center-full-row">
                <span>Override opening line</span>
                <textarea name="overrideOpeningLine" defaultValue={controlCenter.callAgentConfig.overrideOpeningLine ?? ""} />
              </label>
              <div className="control-center-full-row">
                <button type="submit" className="primary-button">Save Call Agent</button>
              </div>
            </form>

            <div className="control-center-preview-grid">
              <div className="control-center-preview-panel">
                <h3>Voice agent preview</h3>
                <p>{voicePreview?.agentBrief}</p>
                <ul>
                  {voicePreview?.safeTalkingPoints.map((point: string) => <li key={point}>{point}</li>)}
                </ul>
              </div>
              <div className="control-center-preview-panel">
                <h3>Provider payload</h3>
                <pre>{JSON.stringify(controlCenter.providerPreview.payload, null, 2)}</pre>
              </div>
            </div>
          </article>
        </div>
      ) : null}

      {activeTab === "config" ? (
        <div className="control-center-main">
          <article id="cc-config" className="control-center-card">
            <div className="control-center-card-head">
              <div>
                <h2>Config</h2>
                <p>Defaults, fallback policy, and testing controls for safe outreach.</p>
              </div>
            </div>

            <form method="post" action="/control-center/config/update" className="control-center-grid-form">
              <label>
                <span>Default timezone</span>
                <input type="text" name="defaultTimezone" defaultValue={controlCenter.config.defaultTimezone} />
              </label>
              <label>
                <span>Sender behavior</span>
                <input type="text" name="defaultSenderBehavior" defaultValue={controlCenter.config.defaultSenderBehavior} />
              </label>
              <label>
                <span>Allowed channels</span>
                <input type="text" name="allowedChannels" defaultValue={controlCenter.config.allowedChannels.join(",")} />
              </label>
              <label>
                <span>Fallback policy</span>
                <input type="text" name="channelFallbackPolicy" defaultValue={controlCenter.config.channelFallbackPolicy} />
              </label>
              <label>
                <span>Sandbox mode</span>
                <input type="text" name="sandboxMode" defaultValue={controlCenter.config.sandboxMode} />
              </label>
              <label>
                <span>Risk approvals</span>
                <input type="text" name="defaultRiskApprovalMode" defaultValue={controlCenter.config.defaultRiskApprovalMode} />
              </label>
              <div className="control-center-full-row">
                <button type="submit" className="primary-button">Save Config</button>
              </div>
            </form>

            <div className="control-center-preview-grid">
              <div className="control-center-preview-panel">
                <h3>Shared AI email preview</h3>
                <p>{emailPreview?.subjectSuggestions?.[0]}</p>
                <pre>{emailPreview?.emailBody ?? "No email preview"}</pre>
              </div>
              <div className="control-center-preview-panel">
                <h3>Shared AI SMS preview</h3>
                <pre>{smsPreview?.variants?.[0] ?? "No SMS preview"}</pre>
              </div>
            </div>
          </article>
        </div>
      ) : null}

      {selectedStageWorkflow ? (
        <div className="control-center-modal-shell" role="dialog" aria-modal="true" aria-labelledby="add-stage-title">
          <a href={buildControlCenterHref({ tab: "workflows", workflow: selectedStageWorkflow.id })} className="control-center-modal-backdrop" aria-label="Close add stage" />
          <div className="control-center-modal">
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
              <input type="hidden" name="outreachType" value={stageModalChannel} />
              <input type="hidden" name="triggerType" value={stageModalChannel === "call" ? "payment_signal_state" : "relative_due_date"} />

              <div className="control-center-modal-block">
                <span className="control-center-field-label">Outreach Type</span>
                <div className="stage-channel-picker">
                  <a href={stageModalBaseHref("email")} className={`stage-channel-option${stageModalChannel === "email" ? " is-email" : ""}`}>✉ Email</a>
                  <a href={stageModalBaseHref("call")} className={`stage-channel-option${stageModalChannel === "call" ? " is-call" : ""}`}>⌕ Call</a>
                  <a href={stageModalBaseHref("sms")} className={`stage-channel-option${stageModalChannel === "sms" ? " is-sms" : ""}`}>◫ SMS</a>
                </div>
              </div>

              <div className="control-center-modal-block">
                <label className="control-center-full-row">
                  <span className="control-center-field-label">When should this stage trigger?</span>
                  <select name="triggerComparator" defaultValue={stageModalChannel === "call" ? "remittance_missing_after_payment" : "due_in_days"}>
                    <option value="due_in_days">Invoice is due in X days</option>
                    <option value="due_today">Invoice is due today</option>
                    <option value="days_past_due">X days past due</option>
                    <option value="promise_missed">Promise-to-pay missed</option>
                    <option value="remittance_missing_after_payment">Remittance missing after payment detected</option>
                    <option value="no_response_after_prior_stage">No response after prior stage</option>
                    <option value="manual">Manual operator-triggered stage</option>
                  </select>
                </label>
                <input type="hidden" name="offsetDays" value={stageModalChannel === "call" ? "1" : stageModalChannel === "sms" ? "3" : "7"} />
              </div>

              {stageModalChannel !== "call" ? (
                <div className="control-center-modal-block">
                  <span className="control-center-field-label">Template</span>
                  <div className="template-mode-picker">
                    <a href={templateModeHref("pre_saved_template")} className={`template-mode-option${stageModalTemplateMode === "pre_saved_template" ? " is-active" : ""}`}>Select Template</a>
                    <a href={templateModeHref("ai_generated")} className={`template-mode-option${stageModalTemplateMode === "ai_generated" ? " is-active" : ""}`}>AI Generate</a>
                  </div>
                  {stageModalTemplateMode === "pre_saved_template" ? (
                    <>
                      <select name="templateId" defaultValue={availableTemplates[0]?.id}>
                        {availableTemplates.map((template) => (
                          <option key={template.id} value={template.id}>{template.name}</option>
                        ))}
                      </select>
                      <input type="hidden" name="templateMode" value="pre_saved_template" />
                    </>
                  ) : (
                    <>
                      <input type="hidden" name="templateMode" value="ai_generated" />
                      <input type="hidden" name="aiStrategyId" value={stageModalChannel === "sms" ? "strategy_sms_conservative" : "strategy_email_default"} />
                      <div className="control-center-ai-note">
                        Shared retrieval and policy logic will generate conservative {stageModalChannel.toUpperCase()} content using account, invoice, contact, and thread context.
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
                  stageModalChannel === "email"
                    ? "Email reminder stage"
                    : stageModalChannel === "call"
                      ? "Voice follow-up stage"
                      : "SMS reminder stage"
                }
              />

              <div className="control-center-modal-actions">
                <a href={buildControlCenterHref({ tab: "workflows", workflow: selectedStageWorkflow.id })} className="ghost-button">Cancel</a>
                <button type="submit" className="primary-button">Add Stage</button>
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
  .dashboard-sidebar { background: #0f172a; color: #cbd5e1; border-right: 1px solid #172036; padding: 12px 10px; }
  .sidebar-brand { display: flex; align-items: center; gap: 12px; padding: 0 8px 16px; border-bottom: 1px solid #172036; }
  .brand-icon { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; background: #10b981; color: white; font-size: .96rem; font-weight: 700; }
  .brand-title, .brand-subtitle { margin: 0; }
  .brand-title { color: white; font-size: .92rem; font-weight: 700; }
  .brand-subtitle { color: #94a3b8; font-size: .76rem; margin-top: 1px; }
  .sidebar-divider { height: 18px; }
  .sidebar-nav { display: grid; gap: 4px; padding-top: 12px; }
  .sidebar-link { display: flex; align-items: center; gap: 12px; min-height: 40px; padding: 0 12px; border-radius: 12px; color: #d0d7e4; font-size: .9rem; font-weight: 600; transition: background .18s ease, color .18s ease; }
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
  .analytics-header-actions { align-items: center; gap: 12px; }
  .analytics-select, .analytics-export-button { min-height: 42px; border-radius: 12px; }
  .analytics-select { min-width: 210px; display: inline-flex; align-items: center; justify-content: space-between; gap: 12px; font-weight: 600; background: #f7f8fb; border-color: #eef2f6; }
  .analytics-select-caret { color: #98a2b3; font-size: .85rem; }
  .analytics-export-button { min-width: 154px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; }
  .analytics-export-button svg { width: 16px; height: 16px; }
  .analytics-kpi-grid, .analytics-summary-grid { display: grid; gap: 18px; }
  .analytics-kpi-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .analytics-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .analytics-metric-card, .analytics-summary-card { background: #ffffff; border: 1px solid #e7eaef; border-radius: 22px; box-shadow: 0 10px 24px rgba(15, 23, 42, .04); }
  .analytics-metric-card { min-height: 188px; padding: 22px 24px; display: grid; align-content: start; gap: 22px; }
  .analytics-summary-card { min-height: 74px; padding: 14px 16px; display: grid; gap: 6px; }
  .analytics-metric-top, .analytics-summary-top, .analytics-aging-row, .analytics-aging-name, .analytics-aging-values, .analytics-customer-row, .analytics-customer-title, .analytics-customer-metrics, .analytics-legend, .analytics-inline-stats { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .analytics-metric-top p, .analytics-summary-top p { margin: 0; color: #667085; font-size: 1rem; }
  .analytics-metric-icon, .analytics-summary-icon { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; }
  .analytics-metric-icon svg, .analytics-summary-icon svg { width: 24px; height: 24px; }
  .analytics-metric-icon-info, .analytics-summary-icon-info { background: #dceaff; color: #2563eb; }
  .analytics-metric-icon-danger { background: #ffe1e2; color: #ef4444; }
  .analytics-metric-icon-success, .analytics-summary-icon-success { background: #d8f5e7; color: #0f9d67; }
  .analytics-metric-icon-violet, .analytics-summary-icon-violet { background: #f1e7ff; color: #9333ea; }
  .analytics-metric-value { font-size: 2.1rem; line-height: 1.05; color: #111827; }
  .analytics-summary-value { font-size: 1.5rem; line-height: 1; color: #1f2937; }
  .analytics-metric-footer, .analytics-summary-subtitle { font-size: 1rem; font-weight: 600; }
  .analytics-metric-footer-info, .analytics-metric-footer-danger, .analytics-metric-footer-success, .analytics-metric-footer-violet, .analytics-summary-subtitle-success, .analytics-summary-subtitle-violet { color: #0f9d67; }
  .analytics-summary-subtitle-info { color: #ef4444; }
  .analytics-grid { display: grid; gap: 18px; }
  .analytics-grid-primary, .analytics-grid-secondary { grid-template-columns: minmax(0, 1fr) minmax(0, .98fr); }
  .analytics-panel { padding: 28px; border-radius: 22px; box-shadow: 0 10px 24px rgba(15, 23, 42, .04); border-color: #e7eaef; }
  .analytics-panel .panel-header { align-items: flex-start; }
  .analytics-panel .panel-header h2 { font-size: 1.15rem; line-height: 1.2; }
  .analytics-panel .label-copy { font-size: 1rem; color: #667085; }
  .analytics-bar-chart { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px; align-items: end; min-height: 310px; padding-top: 18px; }
  .analytics-bar-column { display: grid; gap: 12px; justify-items: center; }
  .analytics-bar-label-top { color: #667085; font-size: .82rem; font-weight: 600; }
  .analytics-bar-track { position: relative; width: 100%; min-height: 250px; border-radius: 12px; overflow: hidden; display: flex; align-items: flex-end; justify-content: center; }
  .analytics-bar-grid { position: absolute; inset: 0; display: grid; align-content: stretch; }
  .analytics-bar-grid span { border-top: 1px dashed #e5e7eb; }
  .analytics-bar-grid span:first-child { border-top: 0; }
  .analytics-bar-group { position: relative; z-index: 1; width: 100%; height: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 8px; padding: 0 8px; }
  .analytics-bar { flex: 1; max-width: 38px; height: 100%; display: flex; align-items: flex-end; }
  .analytics-bar-target, .analytics-bar-collected { width: 100%; border-radius: 8px 8px 0 0; }
  .analytics-bar-target { background: #cfd4dd; }
  .analytics-bar-collected { background: linear-gradient(180deg, #28c38a 0%, #14a26c 100%); }
  .analytics-axis-label, .analytics-line-label { color: #98a2b3; font-size: .72rem; }
  .analytics-legend { justify-content: center; color: #667085; font-size: .95rem; padding-top: 16px; }
  .analytics-legend-dot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; margin-right: 6px; vertical-align: middle; }
  .analytics-legend-dot-collected { background: #0f9d67; }
  .analytics-legend-dot-target { background: #cbd5e1; }
  .analytics-aging-layout { display: grid; grid-template-columns: minmax(240px, .9fr) minmax(0, 1fr); gap: 20px; align-items: center; }
  .analytics-donut-wrap { display: grid; place-items: center; padding: 8px 0; }
  .analytics-donut-area { position: relative; width: 260px; height: 260px; display: grid; place-items: center; }
  .analytics-donut { width: 230px; height: 230px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(255,255,255,.65); }
  .analytics-aging-percent { position: absolute; font-size: 1.05rem; font-weight: 700; line-height: 1; }
  .analytics-aging-percent-top { top: 12px; left: 50%; transform: translateX(-50%); }
  .analytics-aging-percent-bottom-left { bottom: 28px; left: 18px; }
  .analytics-aging-percent-bottom-right { bottom: 40px; right: 18px; }
  .analytics-aging-percent-right-upper { top: 104px; right: 2px; }
  .analytics-aging-percent-right-lower { top: 144px; right: -6px; }
  .analytics-aging-legend { display: grid; gap: 12px; }
  .analytics-aging-row { padding: 2px 0; }
  .analytics-aging-name span, .analytics-aging-values span { color: #667085; font-size: .95rem; }
  .analytics-aging-values { min-width: 96px; text-align: right; }
  .analytics-aging-values strong { font-size: 1.2rem; }
  .analytics-line-chart svg { display: block; width: 100%; height: 218px; }
  .analytics-line-guide, .analytics-line-vertical-guide { stroke: #e9eef5; stroke-width: 1; }
  .analytics-line-vertical-guide { stroke-dasharray: 3 5; }
  .analytics-line-path { fill: none; stroke: #10b981; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
  .analytics-line-point { fill: #10b981; stroke: white; stroke-width: 2; }
  .analytics-line-label { font-size: 12px; fill: #98a2b3; }
  .analytics-inline-stats { justify-content: flex-start; flex-wrap: wrap; padding-top: 18px; }
  .analytics-inline-stats-compact { justify-content: flex-end; padding-top: 0; }
  .analytics-section-stat { min-width: 132px; padding: 12px 14px; border: 1px solid #e7eaef; border-radius: 14px; background: #fbfcfe; display: grid; gap: 4px; }
  .analytics-section-stat span { color: #667085; font-size: .8rem; }
  .analytics-section-stat-value { font-size: 1rem; }
  .analytics-section-stat-value-success { color: #0f9d67; }
  .analytics-section-stat-value-info { color: #2563eb; }
  .analytics-section-stat-value-danger { color: #ef4444; }
  .analytics-customer-list { display: grid; gap: 18px; padding-top: 20px; }
  .analytics-customer-row { align-items: center; padding-bottom: 14px; border-bottom: 1px solid #eef2f7; }
  .analytics-customer-row:last-child { border-bottom: 0; padding-bottom: 0; }
  .analytics-customer-copy { flex: 1; display: grid; gap: 8px; }
  .analytics-customer-title { justify-content: flex-start; gap: 8px; }
  .analytics-customer-rank { color: #98a2b3; font-size: .85rem; }
  .analytics-customer-title strong { font-size: 1rem; font-weight: 600; }
  .analytics-customer-bar { width: 100%; height: 8px; border-radius: 999px; background: #edf2f7; overflow: hidden; }
  .analytics-customer-bar span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #4f83f1 0%, #2f6fed 100%); }
  .analytics-customer-metrics { align-items: flex-end; flex-direction: column; }
  .analytics-customer-metrics strong { font-size: 1rem; }

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
  .collections-channel-tab { display: inline-flex; align-items: center; gap: 10px; padding: 0 0 14px; border-bottom: 3px solid transparent; font-size: 1rem; font-weight: 600; color: #667085; }
  .collections-channel-tab.is-active { color: #111827; border-bottom-color: #111827; }
  .collections-channel-tab svg, .collections-configure-button svg, .collections-toolbar-chip svg { width: 18px; height: 18px; }
  .collections-configure { display: flex; align-items: flex-start; }
  .collections-configure-button { min-height: 44px; display: inline-flex; align-items: center; gap: 10px; padding: 0 4px; color: #111827; font-weight: 600; }

  .collections-filter-bar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 18px; }
  .collections-filter-pill { min-height: 42px; padding: 0 16px; border-radius: 13px; border: 1px solid #d9e0ea; background: white; display: inline-flex; align-items: center; gap: 14px; font-size: .98rem; font-weight: 600; color: #111827; }
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
    padding: 16px 14px 10px;
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
  }
  .home-reference-calendar-nav svg {
    width: 16px;
    height: 16px;
  }
  .home-reference-calendar-day {
    min-height: 58px;
    padding: 10px 12px;
    border-radius: 8px;
    display: grid;
    justify-items: center;
    gap: 4px;
    color: #667085;
    font-size: .8rem;
  }
  .home-reference-calendar-day strong {
    color: #101828;
    font-size: .96rem;
  }
  .home-reference-calendar-day.is-active {
    background: #1f6ff2;
    color: #dce9ff;
  }
  .home-reference-calendar-day.is-active strong {
    color: #ffffff;
  }
  .home-reference-banner {
    min-height: 30px;
    padding: 0 12px;
    border: 1px solid #b7d0ff;
    border-radius: 10px;
    background: #eff6ff;
    color: #344054;
    font-size: .9rem;
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
    --task-table-columns: minmax(0, 2.8fr) minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, .95fr) minmax(0, .85fr) minmax(0, 1.15fr) minmax(0, .75fr) minmax(0, .95fr) minmax(0, .5fr);
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
    grid-template-columns: minmax(0, 1fr) 124px 124px 132px;
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
  .task-select {
    min-width: 0;
    min-height: 36px;
    padding: 0 12px;
    border-radius: 10px;
    background: #f8fafc;
    border-color: #e9edf3;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    color: #344054;
    font-size: .82rem;
    font-weight: 600;
  }
  .task-select::after { content: "⌄"; color: #98a2b3; margin-left: 10px; }
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
    .filter-row, .cash-meta-grid, .task-filter-bar, .deductions-toolbar { grid-template-columns: 1fr 1fr; }
    .cash-review-table, .residual-grid, .finalize-grid { grid-template-columns: 1fr; }
    .cash-table-payments, .cash-table-bank, .cash-table-remittances { grid-template-columns: 1fr 1fr; }
  }

  @media (max-width: 1280px) {
    .dashboard-app { grid-template-columns: 1fr; }
    .dashboard-sidebar { border-right: 0; border-bottom: 1px solid var(--navy-border); }
    .command-center-grid, .hero-lower-grid, .kpi-grid-4, .kpi-grid-5, .kpi-grid-6, .card-grid-2, .card-grid-3, .four-up, .detail-grid, .endpoints-grid, .type-chip-grid, .filter-row, .cash-meta-grid, .cash-workspace-grid, .residual-grid, .finalize-grid, .two-column-layout, .collections-toolbar, .collections-compose-grid, .task-filter-bar, .analytics-kpi-grid, .analytics-grid-primary, .analytics-grid-secondary, .analytics-summary-grid, .analytics-aging-layout, .deduction-detail-grid, .deduction-summary-grid, .deduction-credit-summary, .deduction-credit-meta, .deductions-toolbar, .customers-detail-grid { grid-template-columns: 1fr; }
    .table-collections-extended, .table-invoices, .table-exceptions, .table-inventory, .cash-review-table, .cash-table-payments, .cash-table-bank, .cash-table-remittances, .deductions-table, .deduction-line-table, .deduction-credit-table, .customers-index-table, .customers-invoice-table, .customers-task-table, .customers-payment-table { grid-template-columns: 1fr; }
    .task-table-row { grid-template-columns: 1fr; }
    .table-head, .task-table-head, .task-table-header, .cash-table-head, .deductions-table-header, .deduction-line-table-header, .deduction-credit-table-header, .customers-table-head { display: none; }
    .table-cell, .task-table-cell, .cash-table-cell, .customers-table-cell { min-height: auto; }
    .data-source-hero { grid-template-columns: 1fr; }
    .collections-inbox-row, .collections-hero, .collections-inbox-footer, .collections-compose-header, .collections-compose-footer, .deductions-top-row, .deduction-detail-header, .deduction-card-header, .deductions-table-footer, .customers-activity-row, .customers-detail-top, .customers-toolbar, .customers-toolbar-main, .customers-table-footer { flex-direction: column; align-items: flex-start; }
    .collections-message-meta { justify-items: start; }
    .customers-searchbox { min-width: 100%; }
    .customers-activity-meta { align-items: flex-start; }
    .analytics-inline-stats-compact { justify-content: flex-start; padding-top: 18px; }
    .home-reference-chart-grid, .home-reference-donut-layout { grid-template-columns: 1fr; }
    .home-reference-calendar-grid { grid-template-columns: 32px repeat(3, minmax(0, 1fr)) 32px; }
    .home-reference-calendar-day:nth-of-type(n + 5) { display: none; }
  }

  @media (max-width: 780px) {
    .topbar { height: auto; gap: 12px; padding: 16px; flex-direction: column; align-items: flex-start; }
    .page-scroll { padding: 18px 16px 28px; }
    .page-header-row, .panel-header, .header-actions, .section-heading, .detail-footer, .approval-request-header, .activity-feed-header, .integration-header, .rule-header, .cash-review-header { flex-direction: column; align-items: flex-start; }
    .match-card { flex-direction: column; align-items: flex-start; }
    .data-source-row { flex-direction: column; align-items: flex-start; }
    .home-snapshot-grid, .aging-chart { grid-template-columns: 1fr 1fr; }
    .analytics-bar-chart { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .analytics-customer-row { flex-direction: column; }
    .analytics-customer-metrics { align-items: flex-start; }
    .analytics-header-actions, .analytics-inline-stats { width: 100%; }
    .analytics-select, .analytics-export-button, .analytics-section-stat { width: 100%; }
    .analytics-panel { padding: 22px 18px; }
    .analytics-donut-area { width: 220px; height: 220px; }
    .analytics-donut { width: 188px; height: 188px; }
    .cash-module-header { min-height: 0; padding: 18px 16px 16px; gap: 12px; }
    .cash-module-header h1 { font-size: 1.08rem; }
    .cash-module-tab { min-height: 34px; font-size: .84rem; }
    .cash-module-tab.is-active { padding: 0 6px; }
    .cash-summary-card, .cash-highlight-card, .cash-toolbar, .cash-toolbar-main, .cash-toolbar-actions, .cash-table-footer { flex-direction: column; align-items: flex-start; }
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
    .task-page .task-filter-bar { grid-template-columns: minmax(0, 1fr) 150px 150px 150px; }
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
  .control-center-layout { display: grid; grid-template-columns: 264px minmax(0, 1fr); gap: 28px; align-items: start; }
  .control-center-sidebar { display: grid; gap: 26px; padding-top: 4px; }
  .control-center-category-card { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 12px; padding: 14px 18px; border: 1px solid transparent; border-radius: 14px; background: transparent; box-shadow: none; }
  .control-center-category-card.is-active { border-color: #fdba74; background: #fff7ed; }
  .control-center-category-card h3, .control-center-category-card p { margin: 0; }
  .control-center-category-card h3 { font-size: .98rem; line-height: 1.2; color: #1f2937; font-weight: 600; }
  .control-center-category-card p { margin-top: 6px; font-size: .76rem; line-height: 1.38; color: #667085; }
  .control-center-category-icon { display: grid; place-items: center; width: 18px; height: 18px; margin-top: 2px; border-radius: 999px; color: #f97316; }
  .control-center-category-icon svg { width: 16px; height: 16px; stroke-width: 1.8; }
  .control-center-category-icon.payments { color: #475467; }
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
  .workflow-toggle-knob { width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18); transform: translateX(0); transition: transform .18s ease; }
  .workflow-toggle.is-active .workflow-toggle-knob { transform: translateX(24px); }
  .control-center-workflow-copy h3, .control-center-workflow-copy p { margin: 0; }
  .control-center-workflow-copy h3 { font-size: 1.02rem; line-height: 1.22; font-weight: 700; color: #111827; }
  .control-center-workflow-copy p { margin-top: 6px; font-size: .84rem; color: #667085; }
  .control-center-workflow-actions, .control-center-stage-tags, .control-center-folder-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .workflow-stage-badge { display: inline-flex; align-items: center; padding: 5px 11px; border: 1px solid #e1e5ea; border-radius: 11px; background: #fff; color: #344054; font-size: .8rem; font-weight: 600; }
  .workflow-chevron { color: #98a2b3; font-size: .95rem; }
  .workflow-chevron-icon { width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; transition: transform .18s ease; }
  .workflow-chevron-icon svg { width: 16px; height: 16px; stroke-width: 1.9; }
  .control-center-workflow-row[open] .workflow-chevron-icon { transform: rotate(90deg); }
  .icon-button { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: 0; border-radius: 8px; background: transparent; color: #98a2b3; padding: 0; }
  .icon-button svg { width: 15px; height: 15px; stroke-width: 1.9; }
  .icon-button:hover { background: #f3f4f6; color: #667085; }
  .control-center-workflow-body { padding: 0 20px 20px; display: flex; flex-direction: column; gap: 16px; border-top: 1px solid #eef2f6; background: #fff; }
  .control-center-grid-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  .control-center-grid-form label { display: flex; flex-direction: column; gap: 8px; color: #344054; font-size: 14px; }
  .control-center-grid-form input, .control-center-grid-form textarea, .control-center-modal-form select { width: 100%; box-sizing: border-box; border: 1px solid #d0d5dd; border-radius: 12px; background: #fff; padding: 11px 12px; font: inherit; color: #101828; }
  .control-center-grid-form textarea { min-height: 100px; resize: vertical; }
  .control-center-full-row { grid-column: 1 / -1; }
  .control-center-checkbox { flex-direction: row !important; align-items: center; gap: 10px; }
  .control-center-checkbox input { width: auto; }
  .control-center-stage-header { align-items: center; }
  .pill-button, .primary-button, .ghost-button { border-radius: 12px; padding: 10px 16px; font: inherit; cursor: pointer; font-weight: 600; }
  .primary-button { border: none; background: #111827; color: #fff; box-shadow: none; }
  .ghost-button, .pill-button { border: 1px solid #d0d5dd; background: #fff; color: #344054; }
  .pill-button.is-active { background: #eef2ff; border-color: #c7d2fe; }
  .control-center-stage-item { padding: 14px 16px; display: flex; justify-content: space-between; gap: 16px; }
  .control-center-stage-title, .control-center-preview-subject { margin: 0; font-weight: 700; color: #101828; }
  .control-center-stage-sentence { display: flex; align-items: flex-start; gap: 12px; }
  .control-center-stage-sentence-copy { margin: 0; color: #111827; font-size: .94rem; line-height: 1.45; }
  .stage-channel-icon { width: 28px; height: 28px; border-radius: 10px; display: grid; place-items: center; font-size: .82rem; font-weight: 700; }
  .stage-channel-icon.is-email { background: #eef2ff; color: #3659ff; }
  .stage-channel-icon.is-call { background: #f3e8ff; color: #8b5cf6; }
  .stage-channel-icon.is-sms { background: #ecfdf3; color: #16a34a; }
  .control-center-stage-meta, .control-center-stage-notes, .control-center-template-row p { margin: 4px 0 0; color: #667085; }
  .stage-tag { padding: 6px 10px; border-radius: 999px; background: #f8fafc; color: #344054; font-size: 12px; border: 1px solid #e4e7ec; font-weight: 600; }
  .stage-tag.is-highlight { background: #ecfdf3; color: #17663a; border-color: #b7ebce; }
  .control-center-templates-screen { display: grid; gap: 24px; margin-top: 20px; }
  .control-center-template-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-bottom: 10px; }
  .control-center-template-filter-row { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
  .template-filter-pill { min-height: 42px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; padding: 0 16px; border-radius: 12px; border: 0; background: #111827; color: #fff; font-size: .95rem; font-weight: 600; box-shadow: none; }
  .template-filter-pill svg { width: 16px; height: 16px; stroke-width: 1.9; }
  .template-outline-pill { border: 1px solid #e2e8f0; background: #fff; color: #111827; }
  .control-center-template-toolbar .primary-button { min-height: 42px; padding-inline: 18px; }
  .control-center-template-searchbar { display: flex; align-items: center; gap: 12px; max-width: 680px; min-height: 52px; padding: 0 18px; border-radius: 14px; background: #f7f8fb; border: 1px solid #eef1f5; }
  .control-center-template-searchbar svg { width: 18px; height: 18px; color: #98a2b3; stroke-width: 1.8; }
  .control-center-template-searchbar input { width: 100%; border: 0; outline: none; background: transparent; color: #667085; font: inherit; font-size: .97rem; padding: 0; }
  .control-center-template-searchbar input::placeholder { color: #667085; opacity: 1; }
  .control-center-template-table-wrap { border-top: 1px solid #e8ecf2; border-left: 1px solid #e8ecf2; border-right: 1px solid #e8ecf2; margin-top: 2px; }
  .control-center-template-table { display: grid; grid-template-columns: 76px minmax(230px, 1.1fr) minmax(320px, 1.58fr) minmax(420px, 2.2fr) 92px; }
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
  .control-center-template-subject, .control-center-template-body, .control-center-template-folder { color: #475467; line-height: 1.48; }
  .control-center-template-subject, .control-center-template-body { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; }
  .control-center-template-subject { -webkit-line-clamp: 2; }
  .control-center-template-body { -webkit-line-clamp: 1; color: #667085; }
  .control-center-template-folder { justify-content: flex-start; }
  .control-center-template-drawer-shell { position: fixed; inset: 64px 0 0 274px; z-index: 45; }
  .control-center-template-drawer-backdrop { position: absolute; inset: 0; background: rgba(15, 23, 42, 0.08); }
  .control-center-template-drawer { position: absolute; top: 0; right: 0; bottom: 0; width: min(980px, calc(100vw - 310px)); background: #fff; border-left: 1px solid #e6e8ec; box-shadow: -18px 0 48px rgba(15, 23, 42, 0.12); display: grid; grid-template-rows: auto minmax(0, 1fr); }
  .control-center-template-drawer-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 20px; border-bottom: 1px solid #eef2f6; }
  .control-center-template-drawer-head h2 { margin: 0; font-size: 1.15rem; line-height: 1.2; color: #111827; }
  .control-center-template-drawer-close { color: #667085; font-size: 1.4rem; line-height: 1; }
  .control-center-template-drawer-content { min-height: 0; display: grid; grid-template-columns: minmax(0, 1.1fr) 360px; }
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
  .control-center-template-editor-tools { display: flex; align-items: center; gap: 14px; color: #344054; font-size: .88rem; font-weight: 600; }
  .control-center-template-editor-actions { display: flex; align-items: center; gap: 14px; }
  .template-save-state { color: #667085; font-size: .84rem; font-weight: 600; }
  .control-center-template-preview-pane { padding: 18px 18px 24px; display: grid; align-content: start; gap: 18px; background: #fff; overflow: auto; }
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
  .weekday-pill { min-width: 38px; padding: 8px 10px; border-radius: 10px; border: 1px solid #d0d5dd; background: #fff; color: #667085; text-align: center; font-size: .82rem; font-weight: 600; }
  .weekday-pill.is-active { background: #111827; border-color: #111827; color: #fff; }
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
  .control-center-modal-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .control-center-modal-head h2, .control-center-modal-head p { margin: 0; }
  .control-center-modal-head p { margin-top: 8px; color: #667085; font-size: .9rem; }
  .control-center-modal-close { color: #667085; font-size: 1.35rem; line-height: 1; }
  .control-center-modal-form { display: grid; gap: 16px; margin-top: 18px; }
  .control-center-modal-block { display: grid; gap: 10px; }
  .stage-channel-picker, .template-mode-picker { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .template-mode-picker { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stage-channel-option, .template-mode-option { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 36px; border: 1px solid #d0d5dd; border-radius: 10px; background: #fff; color: #344054; font-size: .9rem; font-weight: 500; }
  .stage-channel-option.is-email { border-color: #3659ff; background: #eef2ff; color: #3659ff; }
  .stage-channel-option.is-call { border-color: #a855f7; background: #f3e8ff; color: #7c3aed; }
  .stage-channel-option.is-sms { border-color: #22c55e; background: #ecfdf3; color: #16a34a; }
  .template-mode-option.is-active { background: #111827; border-color: #111827; color: #fff; }
  .control-center-ai-note { padding: 10px 12px; border-radius: 12px; background: #f8fafc; border: 1px solid #e4e7ec; color: #475467; font-size: .86rem; line-height: 1.45; }
  .control-center-modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 14px; border-top: 1px solid #eaecf0; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

  @media (max-width: 980px) {
    .control-center-layout, .control-center-template-grid, .control-center-preview-grid, .control-center-grid-form { grid-template-columns: 1fr; }
    .control-center-sidebar { padding-top: 0; }
    .control-center-tabbar { gap: 16px; overflow-x: auto; }
    .control-center-workflow-row summary, .control-center-card-head, .control-center-stage-header { flex-direction: column; align-items: flex-start; }
    .control-center-template-toolbar { flex-direction: column; align-items: flex-start; }
    .control-center-template-searchbar { max-width: none; width: 100%; }
    .control-center-template-table, .control-center-template-table-head { grid-template-columns: 56px minmax(180px, 1fr) minmax(180px, 1fr); }
    .control-center-template-table-head .control-center-template-cell:nth-child(4), .control-center-template-table-head .control-center-template-cell:nth-child(5), .control-center-template-table-row .control-center-template-cell:nth-child(4), .control-center-template-table-row .control-center-template-cell:nth-child(5) { display: none; }
    .control-center-template-drawer-shell { inset: 0; }
    .control-center-template-drawer { width: min(100vw, 100%); }
    .control-center-template-drawer-content { grid-template-columns: 1fr; }
    .control-center-template-preview-pane { border-top: 1px solid #eef2f6; }
    .stage-channel-picker, .template-mode-picker { grid-template-columns: 1fr; }
    .control-center-modal { width: min(100% - 24px, 380px); }
  }
`;
