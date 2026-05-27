import { loadEnv } from "@o2c/config";
import {
  buildDemoSeedBundle,
  buildLearningLayerDemoScenarios,
  getPilotReadinessRuntime,
} from "@o2c/seed";
import {
  createDatabaseClientConfig,
  isDatabaseAvailable,
  loadPersistedLearningSummary,
  queryJsonRows,
  quoteLiteral,
  type PersistedLearningSummaryRow,
} from "@o2c/database";
import type {
  AccountProfileSummary,
  ActionSummary,
  ApprovalQueueItem,
  CashApplicationQueueData,
  CollectibleVsDisputedSummary,
  CollectionsQueueItem,
  CustomerIndexItem,
  CustomerProfileWorkspaceData,
  DashboardSummaryCard,
  ExceptionCountSummary,
  ExceptionQueueItem,
  FeedItem,
  HomeAgingBalanceReadModel,
  HomeCollectionsMetricsReadModel,
  HomeSetupChecklistReadModel,
  HomeSnapshotMetricsReadModel,
  HomeTaskSummaryReadModel,
  IntegrationItem,
  InvoiceAgingAnalytics,
  InvoiceDetailData,
  InvoiceIndexEntry,
  InvoiceLinkedStatusItem,
  LearningCashApplicationSummary,
  LearningCollectionsSummary,
  LearningExceptionSummary,
  LearningWorkspaceSummary,
  LinkedPaymentRemittanceSummary,
  LoanAlertQueueItem,
  LoanDashboardReadModel,
  LoanRepaymentHistoryItem,
  LoanStatementDetailData,
  LoanTaskQueueItem,
  MetricTile,
  NextActionSummaryCard,
  OperatorAction,
  OperatorConsoleResponse,
  OverdueExposureSummary,
  PaymentQueueItem,
  CreditFacilityListItem,
} from "@o2c/contracts";
import type { Principal } from "@o2c/auth";
import type { Invoice, Task } from "@o2c/domain";
import type { FastifyInstance } from "fastify";
import { getApprovalQueueService } from "../bootstrap/approval-queue-service.js";
import { getCashApplicationService } from "../bootstrap/cash-application-service.js";
import { buildControlCenterConsoleData } from "../bootstrap/control-center-service.js";
import { getOutreachIntelligenceService } from "../bootstrap/outreach-intelligence-service.js";
import { getTaskService } from "../bootstrap/task-service.js";
import { buildInvoiceIndexResponse } from "./invoices.js";
import {
  getBusinessCentralIntegrationStatus,
  type BusinessCentralInvoiceRecord,
  loadBusinessCentralSalesInvoices,
} from "../integrations/business-central.js";
import { getOdooIntegrationStatus, loadOdooInvoices } from "../integrations/odoo.js";
import {
  getQuickBooksIntegrationStatus,
  loadQuickBooksInvoices,
} from "../integrations/quickbooks.js";
import {
  getSapBusinessOneIntegrationStatus,
  loadSapBusinessOneInvoices,
} from "../integrations/sap-business-one.js";

interface OperatorConsoleTaskComposeAccount {
  id: string;
  createdAt: string;
  updatedAt: string;
  parentAccountId: string;
  branchId?: string;
  accountNumber: string;
  displayName: string;
  currency: string;
  accountTier: "standard" | "strategic";
  status: "active" | "inactive";
  centrallyPaid: boolean;
  metadata: Record<string, unknown>;
}

interface OperatorConsoleTaskComposeContact {
  id: string;
  createdAt: string;
  updatedAt: string;
  parentAccountId: string;
  billingAccountId?: string;
  branchId?: string;
  invoiceId?: string;
  scope: "parent_account" | "billing_account" | "branch" | "invoice";
  scopeId: string;
  fullName: string;
  email?: string;
  phone?: string;
  role:
    | "customer"
    | "collector"
    | "approver"
    | "internal"
    | "ap"
    | "shared_finance"
    | "treasury"
    | "branch"
    | "invoice";
  isPrimary: boolean;
  isVerified: boolean;
  allowAutoSend: boolean;
  recentSuccessfulResponses: number;
  metadata: Record<string, unknown>;
}

interface OperatorConsoleTaskComposeInvoice {
  id: string;
  createdAt: string;
  updatedAt: string;
  state:
    | "uploaded_unmatched"
    | "synced_open"
    | "matched_to_erp"
    | "partially_paid"
    | "paid"
    | "disputed_partial"
    | "disputed_full"
    | "credit_pending"
    | "writeback_pending"
    | "writeback_failed"
    | "voided";
  parentAccountId: string;
  billingAccountId: string;
  branchId?: string;
  invoiceContactId?: string;
  uploadedDocumentId?: string;
  invoiceDate?: string;
  invoiceNumber: string;
  currency: string;
  amountCents: number;
  dueDate?: string;
  disputedAmountCents?: number;
  metadata: Record<string, unknown>;
}

interface OperatorConsoleTaskComposePayload {
  scenario?: string;
  account: OperatorConsoleTaskComposeAccount;
  contact: OperatorConsoleTaskComposeContact;
  invoices: OperatorConsoleTaskComposeInvoice[];
}

interface OperatorConsoleTaskEmailDraft {
  subjectLine: string;
  body: string;
  generatedBy: "llm" | "fallback";
  note: string;
}

interface OperatorConsoleTaskQueueItem {
  id: string;
  taskCode: string;
  title: string;
  relatedRecord?: string;
  amountLabel: string;
  type: "collection" | "cash_app" | "deduction" | "integration" | "credit_line";
  customerName: string;
  status: "open" | "in_progress" | "pending_approval" | "completed" | "closed";
  priority: "high" | "medium" | "low";
  assigneeName: string;
  assigneeInitials: string;
  createdAt?: string;
  createdLabel: string;
  dueDateLabel: string;
  actionPath: string;
  sourceLabel?: string;
  brief?: string;
  recommendedNextAction?: string;
  transcriptSnippet?: string;
  ownerTeam?: string;
  openInvoiceCount?: number;
  balanceLabel?: string;
  overdueLabel?: string;
  invoiceContextLabel?: string;
  invoiceContextDetail?: string;
  invoiceContextItems?: TaskInvoiceContextItem[];
  callContextLabel?: string;
  callContextHref?: string;
  callContextDetail?: string;
  replyAgingLabel?: string;
  composeEmail?: {
    account: OperatorConsoleTaskComposeAccount;
    contact: OperatorConsoleTaskComposeContact;
    invoices: OperatorConsoleTaskComposeInvoice[];
    draft: OperatorConsoleTaskEmailDraft;
  };
}

interface LlmDraftFetchResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

export const registerOperatorConsoleRoutes = (app: FastifyInstance): void => {
  const runtime = getPilotReadinessRuntime();
  const reviewer: Principal = { id: "web_console", roles: ["controller", "ar_manager"] };
  const env = loadEnv();
  const demoDataEnabled = resolveDemoDataEnabled(env.ENABLE_DEMO_DATA, env.NODE_ENV);

  app.get("/v1/operator-console", async () => {
    const snapshot = await runtime.getSnapshot();
    const demo = buildDemoSeedBundle();
    const learningScenarios = indexLearningScenarios();
    const approvalQueueService = await getApprovalQueueService();
    const cashApplicationService = await getCashApplicationService();
    const taskService = await getTaskService();
    const queue = await approvalQueueService.listQueue(reviewer);
    const cashApplicationQueue = await cashApplicationService.getConsoleView();
    const firstClassTasks = await taskService.list();
    const learningCashApplicationQueue = attachLearningToCashApplicationQueue(
      cashApplicationQueue,
      learningScenarios,
    );
    let businessCentralStatus:
      | { kind: "connected"; invoiceCount: number; companyName?: string }
      | { kind: "error"; message: string }
      | { kind: "not_configured" } = { kind: "not_configured" };
    let odooStatus:
      | { kind: "connected"; invoiceCount: number; companyName?: string }
      | { kind: "error"; message: string }
      | { kind: "not_configured" } = { kind: "not_configured" };
    let quickBooksStatus:
      | {
          kind: "connected";
          invoiceCount: number;
          companyName?: string;
          connectionHealth: "connected" | "refresh_expiring" | "reconnect_required";
          reconnectReason?: string;
        }
      | { kind: "error"; message: string }
      | { kind: "not_configured" } = { kind: "not_configured" };
    let sapBusinessOneStatus:
      | {
          kind: "connected";
          invoiceCount: number;
          companyDatabase: string;
          companyName?: string;
        }
      | { kind: "error"; message: string }
      | { kind: "not_configured" } = { kind: "not_configured" };

    let collectionsQueue: OperatorConsoleResponse["collectionsQueue"] = [];

    collectionsQueue = hydrateCollectionsQueueWithPersistedLearning({
      collectionsQueue,
      databaseUrl: env.DATABASE_URL,
      tenantId: env.DEFAULT_TENANT_SLUG,
    });

    const businessCentralIntegration = getBusinessCentralIntegrationStatus(env.DEFAULT_TENANT_SLUG);

    if (businessCentralIntegration.kind !== "not_configured") {
      try {
        const businessCentral = await loadBusinessCentralSalesInvoices(env.DEFAULT_TENANT_SLUG);
        if (businessCentral && businessCentral.invoices.length > 0) {
          businessCentralStatus = {
            kind: "connected",
            invoiceCount: businessCentral.invoices.length,
            ...(businessCentral.company.displayName ?? businessCentral.company.name
              ? { companyName: businessCentral.company.displayName ?? businessCentral.company.name }
              : {}),
          };
          collectionsQueue = businessCentral.invoices.map((invoice) =>
            mapBusinessCentralInvoiceToCollectionsQueueItem(invoice, learningScenarios),
          );
          collectionsQueue = hydrateCollectionsQueueWithPersistedLearning({
            collectionsQueue,
            databaseUrl: env.DATABASE_URL,
            tenantId: env.DEFAULT_TENANT_SLUG,
          });
        }
      } catch (error) {
        businessCentralStatus = {
          kind: "error",
          message: error instanceof Error ? error.message : "Business Central sync failed.",
        };
      }
    }

    const odooIntegration = getOdooIntegrationStatus(env.DEFAULT_TENANT_SLUG);
    if (odooIntegration.kind !== "not_configured") {
      try {
        const odoo = await loadOdooInvoices(env.DEFAULT_TENANT_SLUG);
        if (odoo && odoo.invoices.length > 0) {
          odooStatus = {
            kind: "connected",
            invoiceCount: odoo.invoices.length,
            ...(odooIntegration.companyName ? { companyName: odooIntegration.companyName } : {}),
          };
        }
      } catch (error) {
        odooStatus = {
          kind: "error",
          message: error instanceof Error ? error.message : "Odoo sync failed.",
        };
      }
    }

    const quickBooksIntegration = getQuickBooksIntegrationStatus(env.DEFAULT_TENANT_SLUG);
    if (quickBooksIntegration.kind !== "not_configured") {
      try {
        const quickBooks = await loadQuickBooksInvoices(env.DEFAULT_TENANT_SLUG);
        if (quickBooks && quickBooks.invoices.length > 0) {
          quickBooksStatus = {
            kind: "connected",
            invoiceCount: quickBooks.invoices.length,
            connectionHealth: quickBooksIntegration.connectionHealth,
            ...(quickBooksIntegration.companyName
              ? { companyName: quickBooksIntegration.companyName }
              : {}),
            ...(quickBooksIntegration.reconnectReason
              ? { reconnectReason: quickBooksIntegration.reconnectReason }
              : {}),
          };
        }
      } catch (error) {
        quickBooksStatus = {
          kind: "error",
          message: error instanceof Error ? error.message : "QuickBooks sync failed.",
        };
      }
    }

    const sapBusinessOneIntegration = getSapBusinessOneIntegrationStatus(env.DEFAULT_TENANT_SLUG);
    if (sapBusinessOneIntegration.kind !== "not_configured") {
      try {
        const sapBusinessOne = await loadSapBusinessOneInvoices(env.DEFAULT_TENANT_SLUG);
        if (sapBusinessOne && sapBusinessOne.invoices.length > 0) {
          sapBusinessOneStatus = {
            kind: "connected",
            invoiceCount: sapBusinessOne.invoices.length,
            companyDatabase: sapBusinessOneIntegration.companyDatabase,
            ...(sapBusinessOneIntegration.companyName
              ? { companyName: sapBusinessOneIntegration.companyName }
              : {}),
          };
        }
      } catch (error) {
        sapBusinessOneStatus = {
          kind: "error",
          message: error instanceof Error ? error.message : "SAP Business One sync failed.",
        };
      }
    }

    const exceptionBreakdown = tallyExceptions(snapshot.scenarios);
    const approvalsQueue = queue.map((item) => ({
      id: item.approvalId,
      requestType: item.requestType,
      status: item.status,
      assigneeRole: item.assigneeRole ?? "controller",
      summary: item.summary,
      nextAction: "Open the request, confirm policy context, then approve or reject.",
    }));
    const approvalsPending = approvalsQueue.length;
    const accountsNeedingReview = new Set(
      snapshot.scenarios
        .filter((scenario) => scenario.route !== "auto_apply")
        .map((scenario) => scenario.title)
    ).size;
    const cashCollectedToday = snapshot.scenarios.reduce(
      (sum, scenario) => sum + scenario.appliedAmountCents,
      0
    );
    const overdueAtRisk = snapshot.scenarios
      .filter((scenario) => scenario.route !== "auto_apply")
      .reduce((sum, scenario) => sum + scenario.paymentAmountCents, 0);

    const invoiceIndex = await buildInvoiceIndexResponse();
    if (collectionsQueue.length === 0) {
      collectionsQueue = hydrateCollectionsQueueWithPersistedLearning({
        collectionsQueue: invoiceIndex.invoices
          .filter(isInvoiceIndexEntryEligibleForCollectionsQueue)
          .map((invoice) => mapInvoiceIndexEntryToCollectionsQueueItem(invoice, learningScenarios)),
        databaseUrl: env.DATABASE_URL,
        tenantId: env.DEFAULT_TENANT_SLUG,
      });
    }
    const metrics: MetricTile[] = [
      {
        label: "Cash collected today",
        value: formatCurrency(cashCollectedToday),
        detail: `${snapshot.scenarios.length} evaluated payment flows.`,
      },
      {
        label: "Overdue at risk",
        value: formatCurrency(overdueAtRisk),
        detail: "Held in approvals or typed exception review.",
      },
      {
        label: "Promises due today",
        value: "2",
        detail: `${formatCurrency(3_100_000)} committed for follow-up.`,
      },
      {
        label: "Unapplied cash",
        value: formatCurrency(snapshot.metrics.unappliedCashCents),
        detail: "Conservative hold until operator review completes.",
      },
      {
        label: "Auto-applied cash",
        value: formatCurrency(snapshot.metrics.autoAppliedCashCents),
        detail: `${snapshot.metrics.autoAppliedPayments} payments moved without intervention.`,
      },
      {
        label: "Accounts needing review",
        value: String(accountsNeedingReview),
        detail: "Unique accounts across approvals and exceptions.",
      },
      {
        label: "Approvals pending",
        value: String(approvalsPending),
        detail: "Included in the operator console API response.",
      },
      {
        label: "Exceptions by type",
        value: formatExceptionBreakdown(exceptionBreakdown),
        detail: "Typed queue with explicit next actions.",
      },
    ];
    const actionSummaries: ActionSummary[] = [
      {
        id: "summary-1",
        title: "Auto-application held only where policy says to hold.",
        summary: "Two flows closed automatically; strategic and unknown-payer flows stayed blocked.",
        severity: "normal",
      },
      {
        id: "summary-2",
        title: "One strategic account is waiting on approval.",
        summary: "Collectors can see the account, but controller approval remains the release gate.",
        severity: "attention",
      },
      {
        id: "summary-3",
        title: "One exception is ready for treasury outreach.",
        summary: "The next best action is evidence collection, not a risky application guess.",
        severity: "critical",
      },
    ];
    const accountWorkspace: OperatorConsoleResponse["accountWorkspace"] = {
      accountName: "Metro Retail Group - Strategic Procurement",
      billingAccountId: "bill-strat-1",
      parentAccount: demo.parentAccounts[0]?.name ?? "Metro Retail Group",
      accountTier: "Strategic",
      owner: "AR Manager - Luzon",
      balanceOpen: formatCurrency(2_450_000),
      overdueAmount: formatCurrency(2_450_000),
      promiseStatus: "Promise due today, awaiting proof of payment",
      nextBestAction: "Review approval packet, then release the controller-only application path.",
      notes: [
        "Centrally paid behavior is active, but visibility stays attached to the billing account.",
        "Invoice remains branch-tagged as branch-hq for downstream reconciliation.",
        "No auto-chase task was created because the invoice is under tighter strategic controls.",
      ],
      ...(() => {
        const learning = resolveWorkspaceLearning({
          businessCentralConnected: businessCentralStatus.kind === "connected",
          collectionsQueue,
          ...(learningScenarios["billing_seed_1"]?.workspace
            ? { demoWorkspace: learningScenarios["billing_seed_1"].workspace }
            : {}),
          databaseUrl: env.DATABASE_URL,
          tenantId: env.DEFAULT_TENANT_SLUG,
          billingAccountId: "bill-strat-1",
        });
        return learning ? { learning } : {};
      })(),
    };
    const invoiceDetail: InvoiceDetailData =
      businessCentralStatus.kind === "connected" && collectionsQueue[0]
        ? {
            invoiceNumber: collectionsQueue[0].nextAction.replace("Review ", ""),
            billingAccountId: "bc-sales-invoice",
            branchId: "business-central",
            status: "Synced from Business Central",
            amount: collectionsQueue[0].outstandingAmount ?? collectionsQueue[0].overdueAmount,
            dueDate: collectionsQueue[0].dueLabel ?? "No due date",
            disputeState: "No dispute signal imported",
            nextAction: `Review ${collectionsQueue[0].nextAction.replace("Review ", "")} in the collections queue.`,
            explanation: "This invoice detail panel is now seeded from your live Business Central sales invoice pull.",
            linkedStatuses: buildInvoiceLinkedStatuses({ businessCentralConnected: true }),
          }
        : {
            invoiceNumber: demo.invoices[1]?.invoiceNumber ?? "SI-MFG-2001",
            billingAccountId: demo.invoices[1]?.billingAccountId ?? "bill-mfg-1",
            branchId: demo.invoices[1]?.branchId ?? "branch-mfg-laguna",
            status: "Disputed full",
            amount: formatCurrency(demo.invoices[1]?.amountCents ?? 2_450_000),
            dueDate: "2026-03-26",
            disputeState: "Dispute hold in effect",
            nextAction: "Wait for dispute resolution or controller decision before any collector follow-up.",
            explanation: "The UI preserves branch routing on the invoice and blocks auto-chase while the dispute is open.",
            collectibleAmount: formatCurrency(0),
            disputedAmount: formatCurrency(demo.invoices[1]?.amountCents ?? 2_450_000),
            linkedStatuses: buildInvoiceLinkedStatuses({ businessCentralConnected: false }),
          };
    const paymentsQueue: PaymentQueueItem[] = [
      {
        id: "payment-1",
        paymentReference:
          learningCashApplicationQueue.highlightedPayment?.paymentReference ?? "PAY-2024-0235",
        accountName:
          learningCashApplicationQueue.highlightedPayment?.accountName ?? "Puregold Price Club Inc.",
        amount: formatCurrency(
          learningCashApplicationQueue.highlightedPayment?.amountCents ?? 320_000_00
        ),
        state:
          learningCashApplicationQueue.summary.needsReview > 0 ? "Needs review" : "Queue cleared",
        recommendation:
          learningCashApplicationQueue.highlightedPayment?.matches[0]?.learning?.matchConfidenceExplanation.reasonSummary ??
          learningCashApplicationQueue.highlightedPayment?.matches[0]?.rationale ??
          "Suggested matches are ready for operator confirmation.",
        source: "Cash application queue API",
        actions: [{ label: "Open review item", path: "/cash-app" }],
      },
      {
        id: "payment-2",
        paymentReference: "PAY-2024-0234",
        accountName: "SM Retail Inc.",
        amount: formatCurrency(456_000_00),
        state: "Auto-applied",
        recommendation: "Posted with no-regret confidence and full invoice match.",
        source: "Cash application queue API",
      },
      {
        id: "payment-3",
        paymentReference: "PAY-2024-0236",
        accountName: "Unknown - GARCIA TRADING",
        amount: formatCurrency(125_000_00),
        state: "Unapplied cash",
        recommendation: "Resolve payer identity before any money movement.",
        source: "Cash application queue API",
      },
    ];
    const exceptionsQueue: ExceptionQueueItem[] = [
      {
        id: "exception-1",
        type: exceptionBreakdown[0]?.type ?? "payer_unidentified",
        accountName: "Northpoint Wholesale - Manila",
        amount: formatCurrency(875_000),
        summary: "Payment reached the queue without a reliable billing-account match.",
        nextAction: "Collect payer proof, attach evidence, then rerun application review.",
        actions: scenarioActions(snapshot.scenarios, "importer-proof-upload-unmatched-cash"),
        ...(learningScenarios["billing_sparse_demo"]?.exception
          ? { learning: learningScenarios["billing_sparse_demo"].exception }
          : {}),
      },
      {
        id: "exception-2",
        type: "dispute_hold",
        accountName: "Metro Retail Group - Strategic Procurement",
        amount: formatCurrency(2_450_000),
        summary: "Invoice is fully disputed and cannot enter chase automation.",
        nextAction: "Leave collections paused and route to the dispute owner.",
        actions: scenarioActions(snapshot.scenarios, "distributor-short-pay-partial-dispute"),
        ...(learningScenarios["billing_seed_1"]?.exception
          ? { learning: learningScenarios["billing_seed_1"].exception }
          : {}),
      },
    ];
    const aiFeed: FeedItem[] =
      snapshot.runtimeEvents && snapshot.runtimeEvents.length > 0
        ? snapshot.runtimeEvents.slice(0, 4).map((event) => ({
            id: event.id,
            at: formatTime(event.at),
            actor: event.actor,
            summary: event.summary,
            outcome: event.outcome,
          }))
        : [];
    const integrations: IntegrationItem[] = [
      {
        id: "erp",
        name: "Dynamics 365 Business Central",
        status:
          businessCentralStatus.kind === "connected"
            ? "healthy"
            : businessCentralStatus.kind === "error"
              ? "warning"
              : "warning",
        detail:
          businessCentralStatus.kind === "connected"
            ? `Customer tenant connected${businessCentralStatus.companyName ? ` to ${businessCentralStatus.companyName}` : ""}; pulled ${businessCentralStatus.invoiceCount} sales invoices.`
            : businessCentralStatus.kind === "error"
              ? `Configured, but the last invoice pull failed: ${businessCentralStatus.message}`
              : "Not configured yet. Add the product app credentials and let a customer connect their Business Central tenant.",
        nextAction:
          businessCentralStatus.kind === "connected"
            ? "Review live invoices in the collections queue."
            : "Start the customer connect flow from the integrations page.",
      },
      {
        id: "odoo",
        name: "Odoo",
        status:
          odooStatus.kind === "connected"
            ? "healthy"
            : odooStatus.kind === "error"
              ? "warning"
              : "warning",
        detail:
          odooStatus.kind === "connected"
            ? `Connected to Odoo${odooStatus.companyName ? ` (${odooStatus.companyName})` : ""}; pulled ${odooStatus.invoiceCount} invoices.`
            : odooStatus.kind === "error"
              ? `Configured, but the last Odoo invoice sync failed: ${odooStatus.message}`
              : "Not configured yet. Add the Odoo URL, username, and password, then connect from the integrations page.",
        nextAction:
          odooStatus.kind === "connected"
            ? "Sync imported invoices or create a draft invoice from the dashboard."
            : "Start the Odoo connect flow from the integrations page.",
      },
      {
        id: "quickbooks",
        name: "QuickBooks Online",
        status:
          quickBooksStatus.kind === "connected"
            ? quickBooksStatus.connectionHealth === "connected"
              ? "healthy"
              : "warning"
            : quickBooksStatus.kind === "error"
              ? "warning"
              : "warning",
        detail:
          quickBooksStatus.kind === "connected"
            ? quickBooksStatus.connectionHealth === "connected"
              ? `Connected to QuickBooks${quickBooksStatus.companyName ? ` (${quickBooksStatus.companyName})` : ""}; pulled ${quickBooksStatus.invoiceCount} invoices.`
              : `${quickBooksStatus.reconnectReason ?? "QuickBooks needs attention before the next sync."} Pulled ${quickBooksStatus.invoiceCount} invoices from the last healthy connection.`
            : quickBooksStatus.kind === "error"
              ? `Configured, but the last QuickBooks invoice sync failed: ${quickBooksStatus.message}`
              : "Not configured yet. Add the Intuit app credentials and redirect URI, then connect a QuickBooks company from the integrations page.",
        nextAction:
          quickBooksStatus.kind === "connected"
            ? quickBooksStatus.connectionHealth === "connected"
              ? "Sync imported invoices from QuickBooks."
              : "Reconnect QuickBooks before the next scheduled sync."
            : "Start the QuickBooks connect flow from the integrations page.",
      },
      {
        id: "sap-business-one",
        name: "SAP Business One",
        status:
          sapBusinessOneStatus.kind === "connected"
            ? "healthy"
            : sapBusinessOneStatus.kind === "error"
              ? "warning"
              : "warning",
        detail:
          sapBusinessOneStatus.kind === "connected"
            ? `Connected to SAP Business One${sapBusinessOneStatus.companyName ? ` (${sapBusinessOneStatus.companyName})` : ` (${sapBusinessOneStatus.companyDatabase})`}; pulled ${sapBusinessOneStatus.invoiceCount} invoices.`
            : sapBusinessOneStatus.kind === "error"
              ? `Configured, but the last SAP Business One invoice sync failed: ${sapBusinessOneStatus.message}`
              : "Not configured yet. Add the Service Layer URL, company database, and ERP user, then connect from the integrations page.",
        nextAction:
          sapBusinessOneStatus.kind === "connected"
            ? "Sync imported invoices from SAP Business One."
            : "Start the SAP Business One connect flow from the integrations page.",
      },
      {
        id: "bank",
        name: "Bank statement import",
        status: "warning",
        detail: "Last successful import was 12 minutes ago; no data loss detected.",
        nextAction: "Watch the next polling cycle before escalating.",
      },
      {
        id: "bir",
        name: "BIR review preview",
        status: "error",
        detail: "Preview endpoint is available, but no production parser adapter is configured in web yet.",
        nextAction: "Keep the manual review path visible until the adapter is wired.",
      },
    ];
    const dashboardSummaryCards = buildDashboardSummaryCards(metrics);
    const invoiceAgingAnalytics = buildInvoiceAgingAnalytics(invoiceIndex.invoices, snapshot.generatedAt);
    const homeSetupChecklist = buildHomeSetupChecklist({
      emailSendingIdentityCount: 0,
      integrationStatuses: integrations,
    });
    const overdueExposure = buildOverdueExposure(invoiceIndex.invoices);
    const collectibleVsDisputed = buildCollectibleVsDisputed(invoiceIndex.invoices);
    const linkedPaymentRemittanceStatus = loadLinkedPaymentRemittanceStatus({
      databaseUrl: env.DATABASE_URL,
      tenantId: env.DEFAULT_TENANT_SLUG,
      paymentsQueue,
      cashApplicationQueue: learningCashApplicationQueue,
    });
    const exceptionCounts = buildExceptionCountSummary({
      exceptionBreakdown,
      exceptionsQueue,
      databaseUrl: env.DATABASE_URL,
      tenantId: env.DEFAULT_TENANT_SLUG,
    });
    const accountProfileSummaries = buildAccountProfileSummaries({
      invoiceEntries: invoiceIndex.invoices,
      collectionsQueue,
      promisesDueToday: 2,
    });
    const customerIndex = buildCustomerIndex({
      accountProfileSummaries,
      collectionsQueue,
    });
    const customerProfile = buildCustomerProfileWorkspace({
      accountWorkspace,
      customerIndex,
      billingAccountId: "bill-strat-1",
    });
    const nextActionSummaryCards = buildNextActionSummaryCards({
      approvalsPending,
      exceptionCount: exceptionCounts.totalOpen,
      cashReviewCount: learningCashApplicationQueue.summary.needsReview,
      actionSummaries,
    });
    const homeTaskSummary = buildHomeTaskSummary({
      accountProfileSummaries,
      collectionsQueue,
      approvalsQueue,
      exceptionsQueue,
      cashApplicationQueue: learningCashApplicationQueue,
      firstClassTasks,
    });
    const homeCollectionsMetrics = buildHomeCollectionsMetrics({
      aiFeedCount: aiFeed.length,
      collectibleOpenAmountCents: collectibleVsDisputed.collectibleOpenAmountCents,
      automatedTaskCount: nextActionSummaryCards.reduce((sum, item) => sum + item.count, 0),
      overdueOpenAmountCents: overdueExposure.overdueOpenAmountCents,
    });
    const homeSnapshotMetrics = buildHomeSnapshotMetrics({
      openInvoiceCount: invoiceIndex.summary.openInvoiceCount,
      outstandingBalanceCents: invoiceIndex.summary.openAmountCents,
      overdueInvoiceCount: invoiceIndex.summary.overdueInvoiceCount,
      overdueBalanceCents: invoiceAgingAnalytics.buckets
        .filter((bucket) => bucket.id !== "current")
        .reduce((sum, bucket) => sum + bucket.openAmountCents, 0),
    });
    const homeAgingBalance = buildHomeAgingBalance(invoiceAgingAnalytics);
    const outreachIntelligence = buildOutreachIntelligencePreview({
      generatedAt: snapshot.generatedAt,
      invoiceIndex,
      customerIndex,
      collectionsQueue,
      accountWorkspace,
      invoiceDetail,
      paymentsQueue,
    });
    const controlCenter = buildControlCenterConsoleData(reviewer);
    const loanDashboard = buildLoanDashboard();
    const creditFacilities = buildCreditFacilityList();
    const loanStatementDetail = buildLoanStatementDetail();
    const loanRepaymentHistory = buildLoanRepaymentHistory();
    const loanAlerts = buildLoanAlerts();
    const loanTasks = buildLoanTasks();
    const taskQueue = await buildTaskQueue(firstClassTasks);

    const response: OperatorConsoleResponse & { taskQueue: OperatorConsoleTaskQueueItem[] } = {
      generatedAt: snapshot.generatedAt,
      commandCenterSource: {
        kind: "live",
        label: "Live operator console API",
        detail: "Fetched from /v1/operator-console.",
      },
      approvalsSource: {
        kind: "live",
        label: "Operator console approvals payload",
        detail: approvalsPending > 0 ? "Approvals are included in the operator console response." : "No open approval items.",
      },
      approvalsFallbackActive: false,
      invoiceIndex,
      metrics,
      actionSummaries,
      dashboardSummaryCards,
      homeSetupChecklist,
      homeTaskSummary,
      homeCollectionsMetrics,
      homeSnapshotMetrics,
      homeAgingBalance,
      outreachIntelligence,
      controlCenter,
      invoiceAgingAnalytics,
      overdueExposure,
      collectibleVsDisputed,
      linkedPaymentRemittanceStatus,
      exceptionCounts,
      customerIndex,
      customerProfile,
      accountProfileSummaries,
      nextActionSummaryCards,
      collectionsQueue,
      accountWorkspace,
      invoiceDetail,
      paymentsQueue,
      cashApplicationQueue: learningCashApplicationQueue,
      loanDashboard,
      creditFacilities,
      loanStatementDetail,
      loanRepaymentHistory,
      loanAlerts,
      loanTasks,
      taskQueue,
      exceptionsQueue,
      approvalsQueue,
      aiFeed,
      integrations,
      automationRules: [
        {
          id: "rule-1",
          name: "Strategic approval gate",
          scope: "Cash application",
          behavior: "Strategic accounts always require explicit approval even when evidence is strong.",
          auditTrail: "Workflow emits an approval request and keeps money movement blocked.",
        },
        {
          id: "rule-2",
          name: "Dispute chase block",
          scope: "Collections",
          behavior: "Disputed invoices never generate auto-chase tasks.",
          auditTrail: "Exception remains visible with the next action redirected to dispute resolution.",
        },
        {
          id: "rule-3",
          name: "Branch-preserving routing",
          scope: "Invoice application",
          behavior: "Invoice branch IDs remain attached whenever the source provides them.",
          auditTrail: "Branch tags stay visible in the payment and invoice panels.",
        },
      ],
      exceptionBreakdown,
      screenInventory: [
        { screen: "Home / command center", source: "Operator console API", status: "Implemented" },
        { screen: "Imported invoice index", source: "Operator console API", status: "Implemented" },
        { screen: "Collections queue", source: "Operator console API", status: "Implemented" },
        { screen: "Control Center", source: "Operator console API", status: "Implemented" },
        { screen: "Account workspace", source: "Operator console API", status: "Implemented" },
        { screen: "Invoice detail", source: "Operator console API", status: "Implemented" },
        { screen: "Payments / cash application queue", source: "Operator console API", status: "Implemented" },
        { screen: "Org credit line dashboard (demo)", source: "Operator console API", status: "Demo stub" },
        { screen: "Credit facility list", source: "Operator console API", status: "Implemented" },
        { screen: "Loan statement detail", source: "Operator console API", status: "Implemented" },
        { screen: "Repayment history", source: "Operator console API", status: "Implemented" },
        { screen: "Loan alerts and tasks", source: "Operator console API", status: "Implemented" },
        { screen: "Exceptions queue", source: "Operator console API", status: "Implemented" },
        { screen: "Approvals queue", source: "Operator console API", status: "Implemented" },
        { screen: "AI activity feed", source: "Operator console API", status: "Implemented" },
        { screen: "Integration settings", source: "Operator console API", status: "Implemented" },
        { screen: "Rules and automations", source: "Operator console API", status: "Implemented" },
      ],
      screenStates: {
        collectionsEmpty: {
          kind: "empty",
          title: "No dispute-chase tasks generated",
          message: "Disputed invoices stay visible in context, but the queue stays clean because auto-chase is blocked.",
        },
        approvalsEmpty: {
          kind: "empty",
          title: "Live approvals queue is currently empty",
          message: "The console falls back to seeded strategic approvals so the operator flow remains demonstrable.",
        },
        aiLoading: {
          kind: "loading",
          title: "Next AI sweep is in progress",
          message: "Concise action summaries refresh after the current workflow audit pass completes.",
        },
        integrationError: {
          kind: "error",
          title: "BIR parser adapter not configured for production use",
          message: "Manual review stays available; no ingestion action is hidden behind a silent failure.",
        },
      },
    };

    return demoDataEnabled ? response : suppressDemoOperationalResponse(response);
  });
};

function suppressDemoOperationalResponse(
  response: OperatorConsoleResponse & { taskQueue: OperatorConsoleTaskQueueItem[] },
): OperatorConsoleResponse & { taskQueue: OperatorConsoleTaskQueueItem[] } {
  const invoiceIndex =
    response.invoiceIndex.source.kind === "seeded"
      ? {
          ...response.invoiceIndex,
          source: {
            kind: "live" as const,
            label: "No live invoice data",
            detail: "Demo invoice data is disabled for normal runtime.",
          },
          summary: {
            totalInvoices: 0,
            totalAmountCents: 0,
            openAmountCents: 0,
            openInvoiceCount: 0,
            overdueInvoiceCount: 0,
            disputedInvoiceCount: 0,
            paidInvoiceCount: 0,
            connectedProviderCount: 0,
          },
          providers: [],
          statuses: [],
          invoices: [],
        }
      : response.invoiceIndex;
  const hasLiveInvoiceRows =
    response.invoiceIndex.source.kind !== "seeded" && invoiceIndex.invoices.length > 0;

  return {
    ...response,
    commandCenterSource: hasLiveInvoiceRows
      ? response.commandCenterSource
      : {
          kind: "stub",
          label: "No operational data loaded",
          detail: "Demo data is disabled. Connect ERP, email, and task integrations to populate the console.",
        },
    approvalsFallbackActive: false,
    invoiceIndex,
    metrics: hasLiveInvoiceRows
      ? response.metrics
      : response.metrics.map((metric) => ({
          ...metric,
          value: "0",
          detail: "No live operational data loaded.",
        })),
    actionSummaries: hasLiveInvoiceRows ? response.actionSummaries : [],
    dashboardSummaryCards: hasLiveInvoiceRows ? response.dashboardSummaryCards : [],
    homeTaskSummary: hasLiveInvoiceRows
      ? response.homeTaskSummary
      : {
          ...response.homeTaskSummary,
          views: response.homeTaskSummary.views.map((view) => ({ ...view, totalCount: 0, items: [] })),
        },
    homeCollectionsMetrics: hasLiveInvoiceRows
      ? response.homeCollectionsMetrics
      : {
          ...response.homeCollectionsMetrics,
          outreachActivityCount: 0,
          collectedAmountCents: 0,
          automatedTaskCount: 0,
          totalCollectedAmountCents: 0,
        },
    homeSnapshotMetrics: hasLiveInvoiceRows
      ? response.homeSnapshotMetrics
      : {
          ...response.homeSnapshotMetrics,
          openInvoiceCount: 0,
          outstandingBalanceCents: 0,
          overdueInvoiceCount: 0,
          overdueBalanceCents: 0,
        },
    homeAgingBalance: hasLiveInvoiceRows
      ? response.homeAgingBalance
      : {
          ...response.homeAgingBalance,
          buckets: response.homeAgingBalance.buckets.map((bucket) => ({
            ...bucket,
            openAmountCents: 0,
            invoiceCount: 0,
          })),
        },
    customerIndex: hasLiveInvoiceRows ? response.customerIndex : [],
    accountProfileSummaries: hasLiveInvoiceRows ? response.accountProfileSummaries : [],
    nextActionSummaryCards: hasLiveInvoiceRows ? response.nextActionSummaryCards : [],
    collectionsQueue: hasLiveInvoiceRows ? response.collectionsQueue : [],
    paymentsQueue: [],
    loanDashboard: {
      ...response.loanDashboard,
      totalCommittedLimitCents: 0,
      totalOutstandingCents: 0,
      totalAvailableCents: 0,
      dueThisWeekCents: 0,
      overdueCents: 0,
      facilityCount: 0,
      facilitiesInArrearsCount: 0,
      alertCount: 0,
      taskCount: 0,
    },
    creditFacilities: [],
    loanRepaymentHistory: [],
    loanAlerts: [],
    loanTasks: [],
    taskQueue: response.taskQueue,
    exceptionsQueue: [],
    approvalsQueue: [],
    aiFeed: [],
    exceptionBreakdown: [],
    screenStates: {
      ...response.screenStates,
      approvalsEmpty: {
        kind: "empty",
        title: "No live approvals",
        message: "Demo approvals are hidden in normal runtime.",
      },
    },
  };
}

type PersistedLinkedStatusRow = {
  invoicesWithLinkedPaymentsCount: number;
  remittancesLinkedToPaymentCount: number;
  remittancesAwaitingReviewCount: number;
  remittancesOrphanedCount: number;
};

type PersistedExceptionStateRow = {
  totalOpen: number;
  highSeverity: number;
  waitingOnCustomer: number;
  readyForResolution: number;
};

function buildDashboardSummaryCards(metrics: MetricTile[]): DashboardSummaryCard[] {
  return [
    metricToCard(metrics, "Cash collected today", "cash_collected_today", "success"),
    metricToCard(metrics, "Overdue at risk", "overdue_at_risk", "danger", "View collections", "/collections"),
    metricToCard(metrics, "Promises due today", "promises_due_today", "warning"),
    metricToCard(metrics, "Unapplied cash", "unapplied_cash", "info", "Review payments", "/cash-app"),
    metricToCard(metrics, "Approvals pending", "approvals_pending", "violet", "Review approvals", "/approvals"),
  ];
}

async function buildTaskQueue(
  tasks: Awaited<ReturnType<Awaited<ReturnType<typeof getTaskService>>["list"]>>,
): Promise<OperatorConsoleTaskQueueItem[]> {
  const env = loadEnv();
  const accountNameById = loadTaskBillingAccountNames(
    env.DATABASE_URL,
    env.DEFAULT_TENANT_SLUG,
    tasks,
  );
  const invoiceContextByTaskId = loadTaskInvoiceContexts(
    env.DATABASE_URL,
    env.DEFAULT_TENANT_SLUG,
    tasks,
  );
  const callContextByProviderId = loadTaskCallContexts(
    env.DATABASE_URL,
    env.DEFAULT_TENANT_SLUG,
    tasks,
  );
  const queueItems = await Promise.all(
    tasks
      .filter((task) => task.status !== "dismissed" && task.status !== "deleted")
      .map(async (task) => {
        const rawComposeEmail = readComposeEmailPayload(task.metadata);
        const composeEmail = rawComposeEmail
          ? {
              ...rawComposeEmail,
              invoices: hydrateTaskComposeInvoices(
                env.DATABASE_URL,
                env.DEFAULT_TENANT_SLUG,
                rawComposeEmail.invoices,
              ),
            }
          : undefined;
        const providerCallId = readString(task.metadata, "providerCallId") ?? task.callId;
        const callContext = providerCallId
          ? callContextByProviderId.get(providerCallId) ?? buildFallbackTaskCallContext(providerCallId)
          : undefined;
        const invoiceContext = composeEmail
          ? buildTaskInvoiceContextFromComposeInvoices(composeEmail.invoices)
          : invoiceContextByTaskId.get(task.id) ?? callContext?.invoiceContext;
        const amountCents = composeEmail
          ? composeEmail.invoices.reduce((sum, invoice) => sum + invoice.amountCents, 0)
          : invoiceContext?.balanceCents ?? readNumber(task.metadata, "amountCents");
        const overdueAmountCents = composeEmail
          ? composeEmail.invoices
              .filter((invoice) => isPastDueInvoice(invoice.dueDate))
              .reduce((sum, invoice) => sum + invoice.amountCents, 0)
          : invoiceContext?.overdueCents ?? readNumber(task.metadata, "overdueAmountCents");
        const priority = readPriority(task);
        const assigneeName =
          task.ownerId === "web_console"
            ? "You"
            : task.ownerId
              ? humanizeIdentifier(task.ownerId)
              : task.origin === "workflow_generated"
                ? "Automation"
                : "Unassigned";
        const relatedRecord =
          readString(task.metadata, "relatedRecord") ??
          invoiceContext?.label ??
          composeEmail?.invoices.map((invoice) => invoice.invoiceNumber).join(", ");
        const replyAgingLabel = readReplyAgingLabel(task.metadata);
        const draft = composeEmail
          ? await generateTaskEmailDraft({
              taskTitle: task.title,
              account: composeEmail.account,
              contact: composeEmail.contact,
              invoices: composeEmail.invoices,
            })
          : undefined;
        const brief = buildOperatorTaskBrief(task);

        return {
          id: task.id,
          taskCode: toTaskCode(task.id),
          title: task.title,
          ...(relatedRecord ? { relatedRecord } : {}),
          amountLabel:
            amountCents !== undefined && amountCents > 0 ? formatCurrency(amountCents) : "—",
          type: mapTaskType(task),
          customerName:
            composeEmail?.account.displayName ??
            readString(task.metadata, "customerName") ??
            (task.billingAccountId ? accountNameById.get(task.billingAccountId) : undefined) ??
            task.billingAccountId ??
            "—",
          status: mapOperatorTaskStatus(task.status),
          priority,
          assigneeName,
          assigneeInitials: buildInitials(assigneeName),
          createdAt: task.createdAt,
          createdLabel: formatDateTimeLabel(task.createdAt),
          dueDateLabel: task.dueAt ? formatDateTimeLabel(task.dueAt) : "—",
          actionPath: composeEmail ? `/tasks#task-detail-${task.id}` : "/tasks",
          sourceLabel: buildTaskSourceLabel(task, composeEmail, callContext),
          ...(brief ? { brief } : {}),
          ...(task.recommendedNextAction ? { recommendedNextAction: task.recommendedNextAction } : {}),
          ...(task.transcriptSnippet ? { transcriptSnippet: task.transcriptSnippet } : {}),
          ...(task.ownerTeam ? { ownerTeam: humanizeIdentifier(task.ownerTeam) } : {}),
          ...(invoiceContext ? { openInvoiceCount: invoiceContext.invoiceCount } : {}),
          ...(amountCents !== undefined && amountCents > 0
            ? { balanceLabel: formatCurrency(amountCents) }
            : {}),
          ...(overdueAmountCents !== undefined && overdueAmountCents > 0
            ? { overdueLabel: formatCurrency(overdueAmountCents) }
            : {}),
          ...(invoiceContext ? { invoiceContextLabel: invoiceContext.label } : {}),
          ...(invoiceContext?.detail ? { invoiceContextDetail: invoiceContext.detail } : {}),
          ...(invoiceContext?.items ? { invoiceContextItems: invoiceContext.items } : {}),
          ...(callContext ? { callContextLabel: callContext.label } : {}),
          ...(callContext?.href ? { callContextHref: callContext.href } : {}),
          ...(callContext?.detail ? { callContextDetail: callContext.detail } : {}),
          ...(replyAgingLabel ? { replyAgingLabel } : {}),
          ...(composeEmail && draft
            ? {
                composeEmail: {
                  account: composeEmail.account,
                  contact: composeEmail.contact,
                  invoices: composeEmail.invoices,
                  draft,
                },
              }
            : {}),
        } satisfies OperatorConsoleTaskQueueItem;
      }),
  );

  return queueItems.sort(compareTaskQueueItems);
}

interface TaskInvoiceContext {
  invoiceCount: number;
  label: string;
  detail?: string;
  items?: TaskInvoiceContextItem[];
  balanceCents?: number;
  overdueCents?: number;
}

interface TaskInvoiceContextItem {
  invoiceNumber: string;
  amountLabel?: string;
  dueDateLabel?: string;
  statusLabel?: string;
}

interface TaskCallContext {
  providerCallId: string;
  label: string;
  href?: string;
  detail?: string;
  invoiceContext?: TaskInvoiceContext;
}

interface TaskCallInvoiceRef {
  invoiceId?: string;
  invoiceNumber?: string;
  amountCents?: number;
  currency?: string;
}

function loadTaskBillingAccountNames(
  databaseUrl: string,
  tenantId: string,
  tasks: Array<{ billingAccountId?: string; metadata: Record<string, unknown> }>,
): Map<string, string> {
  const billingAccountIds = uniqueStrings(
    tasks
      .map((task) => task.billingAccountId)
      .filter((value): value is string => typeof value === "string" && isUuid(value)),
  );
  if (billingAccountIds.length === 0) {
    return new Map();
  }

  try {
    const rows = queryJsonRows<{ id: string; displayName: string }>(
      databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT id::text AS id, display_name AS "displayName"
          FROM billing_account
          WHERE tenant_id = '${quoteLiteral(tenantId)}'
            AND deleted_at IS NULL
            AND id IN (${billingAccountIds.map((id) => `'${quoteLiteral(id)}'::uuid`).join(", ")})
        ) q;
      `,
    );
    return new Map(rows.map((row) => [row.id, row.displayName]));
  } catch {
    return new Map();
  }
}

function loadTaskInvoiceContexts(
  databaseUrl: string,
  tenantId: string,
  tasks: Array<{
    id: string;
    linkedInvoiceIds?: string[];
    metadata: Record<string, unknown>;
  }>,
): Map<string, TaskInvoiceContext> {
  const invoiceIds = uniqueStrings(
    tasks
      .flatMap((task) => task.linkedInvoiceIds ?? readStringArray(task.metadata.linkedInvoiceIds))
      .filter((value) => isUuid(value)),
  );
  if (invoiceIds.length === 0) {
    return new Map();
  }

  try {
    const rows = queryJsonRows<{
      id: string;
      invoiceNumber: string;
      dueDate?: string;
      currency: string;
      amountCents: number;
      collectibleAmountCents?: number;
      metadata?: Record<string, unknown>;
    }>(
      databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id::text AS id,
            invoice_number AS "invoiceNumber",
            due_date::text AS "dueDate",
            currency,
            amount_cents::integer AS "amountCents",
            collectible_amount_cents::integer AS "collectibleAmountCents",
            COALESCE(metadata, '{}'::jsonb) AS metadata
          FROM invoice
          WHERE tenant_id = '${quoteLiteral(tenantId)}'
            AND deleted_at IS NULL
            AND id IN (${invoiceIds.map((id) => `'${quoteLiteral(id)}'::uuid`).join(", ")})
        ) q;
      `,
    );
    const invoiceById = new Map(rows.map((row) => [row.id, row]));
    const contexts = new Map<string, TaskInvoiceContext>();
    for (const task of tasks) {
      const taskInvoiceIds = uniqueStrings(
        [
          ...(task.linkedInvoiceIds ?? []),
          ...readStringArray(task.metadata.linkedInvoiceIds),
        ].filter((value) => isUuid(value)),
      );
      const invoices = taskInvoiceIds
        .map((invoiceId) => invoiceById.get(invoiceId))
        .filter((invoice): invoice is NonNullable<typeof invoice> => Boolean(invoice));
      if (invoices.length === 0) {
        continue;
      }
      contexts.set(task.id, buildTaskInvoiceContextFromRows(invoices));
    }
    return contexts;
  } catch {
    return new Map();
  }
}

function loadTaskCallContexts(
  databaseUrl: string,
  tenantId: string,
  tasks: Array<{ callId?: string; metadata: Record<string, unknown> }>,
): Map<string, TaskCallContext> {
  const providerCallIds = uniqueStrings(
    tasks
      .map((task) => readString(task.metadata, "providerCallId") ?? task.callId)
      .filter((value): value is string => Boolean(value)),
  );
  if (providerCallIds.length === 0) {
    return new Map();
  }

  try {
    const rows = queryJsonRows<{
      id: string;
      providerCallId: string;
      customerName: string;
      startedAt?: string;
      summary?: string;
      invoiceRefs?: TaskCallInvoiceRef[];
    }>(
      databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id::text AS id,
            provider_call_id AS "providerCallId",
            customer_name AS "customerName",
            started_at::text AS "startedAt",
            summary,
            invoice_refs AS "invoiceRefs"
          FROM call_inbox_record
          WHERE tenant_id = '${quoteLiteral(tenantId)}'
            AND deleted_at IS NULL
            AND provider_call_id IN (${providerCallIds.map((id) => `'${quoteLiteral(id)}'`).join(", ")})
        ) q;
      `,
    );
    return new Map(
      rows.map((row) => {
        const invoiceContext = buildTaskInvoiceContextFromCallRefs(row.invoiceRefs ?? []);
        return [
          row.providerCallId,
          {
            providerCallId: row.providerCallId,
            label: `Retell call ${shortIdentifier(row.providerCallId)}`,
            href: `/collections?tab=call-inbox#call-detail-${row.id}`,
            detail: [
              row.customerName,
              row.startedAt ? formatDateTimeLabel(row.startedAt) : undefined,
              row.summary ? truncateText(row.summary, 160) : undefined,
            ].filter(Boolean).join(" · "),
            ...(invoiceContext ? { invoiceContext } : {}),
          },
        ] as const;
      }),
    );
  } catch {
    return new Map();
  }
}

function buildFallbackTaskCallContext(providerCallId: string): TaskCallContext {
  return {
    providerCallId,
    label: `Retell call ${shortIdentifier(providerCallId)}`,
    href: "/collections?tab=call-inbox",
    detail: providerCallId,
  };
}

function buildTaskInvoiceContextFromComposeInvoices(
  invoices: OperatorConsoleTaskComposeInvoice[],
): TaskInvoiceContext | undefined {
  if (invoices.length === 0) {
    return undefined;
  }

  return {
    invoiceCount: invoices.length,
    label: formatInvoiceNumberList(invoices.map((invoice) => invoice.invoiceNumber)),
    items: invoices.map((invoice) => ({
      invoiceNumber: invoice.invoiceNumber,
      amountLabel: formatCurrency(invoice.amountCents),
      ...(invoice.dueDate ? { dueDateLabel: formatDateLabel(invoice.dueDate) } : {}),
      statusLabel: humanizeIdentifier(invoice.state),
    })),
    detail: invoices
      .map((invoice) => `${invoice.invoiceNumber}: ${formatCurrency(invoice.amountCents)}${invoice.dueDate ? ` due ${formatDateLabel(invoice.dueDate)}` : ""}`)
      .join("; "),
    balanceCents: invoices.reduce((sum, invoice) => sum + invoice.amountCents, 0),
    overdueCents: invoices
      .filter((invoice) => isPastDueInvoice(invoice.dueDate))
      .reduce((sum, invoice) => sum + invoice.amountCents, 0),
  };
}

function buildTaskInvoiceContextFromCallRefs(
  invoiceRefs: TaskCallInvoiceRef[],
): TaskInvoiceContext | undefined {
  const normalizedRefs: Array<{ invoiceNumber: string; amountCents?: number }> = [];
  for (const invoiceRef of invoiceRefs) {
    const invoiceNumber = invoiceRef.invoiceNumber?.trim();
    if (!invoiceNumber) {
      continue;
    }
    const amountCents = typeof invoiceRef.amountCents === "number" ? invoiceRef.amountCents : undefined;
    normalizedRefs.push({
      invoiceNumber,
      ...(amountCents !== undefined ? { amountCents } : {}),
    });
  }
  if (normalizedRefs.length === 0) {
    return undefined;
  }

  const balanceCents = normalizedRefs.reduce(
    (sum, invoiceRef) => sum + (invoiceRef.amountCents ?? 0),
    0,
  );

  return {
    invoiceCount: normalizedRefs.length,
    label: formatInvoiceNumberList(normalizedRefs.map((invoiceRef) => invoiceRef.invoiceNumber)),
    items: normalizedRefs.map((invoiceRef) => ({
      invoiceNumber: invoiceRef.invoiceNumber,
      ...(invoiceRef.amountCents !== undefined
        ? { amountLabel: formatCurrency(invoiceRef.amountCents) }
        : {}),
    })),
    detail: normalizedRefs
      .map((invoiceRef) =>
        invoiceRef.amountCents !== undefined
          ? `${invoiceRef.invoiceNumber}: ${formatCurrency(invoiceRef.amountCents)}`
          : invoiceRef.invoiceNumber,
      )
      .join("; "),
    ...(balanceCents > 0 ? { balanceCents } : {}),
  };
}

function buildTaskInvoiceContextFromRows(
  invoices: Array<{
    invoiceNumber: string;
    dueDate?: string;
    amountCents: number;
    collectibleAmountCents?: number;
    metadata?: Record<string, unknown>;
  }>,
): TaskInvoiceContext {
  const balanceCents = invoices.reduce(
    (sum, invoice) => sum + readTaskInvoiceOpenAmountCents(invoice),
    0,
  );
  const overdueCents = invoices
    .filter((invoice) => isPastDueInvoice(invoice.dueDate))
    .reduce((sum, invoice) => sum + readTaskInvoiceOpenAmountCents(invoice), 0);

  return {
    invoiceCount: invoices.length,
    label: formatInvoiceNumberList(invoices.map((invoice) => invoice.invoiceNumber)),
    items: invoices.map((invoice) => ({
      invoiceNumber: invoice.invoiceNumber,
      amountLabel: formatCurrency(readTaskInvoiceOpenAmountCents(invoice)),
      ...(invoice.dueDate ? { dueDateLabel: formatDateLabel(invoice.dueDate) } : {}),
    })),
    detail: invoices
      .map((invoice) => `${invoice.invoiceNumber}: ${formatCurrency(readTaskInvoiceOpenAmountCents(invoice))}${invoice.dueDate ? ` due ${formatDateLabel(invoice.dueDate)}` : ""}`)
      .join("; "),
    balanceCents,
    overdueCents,
  };
}

function readTaskInvoiceOpenAmountCents(invoice: {
  amountCents: number;
  collectibleAmountCents?: number;
  metadata?: Record<string, unknown>;
}) {
  const metadataOpenAmount = readNumber(invoice.metadata ?? {}, "openAmountCents");
  if (metadataOpenAmount !== undefined) {
    return metadataOpenAmount;
  }
  return invoice.collectibleAmountCents ?? invoice.amountCents;
}

function formatInvoiceNumberList(invoiceNumbers: string[]) {
  const uniqueInvoiceNumbers = uniqueStrings(invoiceNumbers);
  if (uniqueInvoiceNumbers.length <= 3) {
    return uniqueInvoiceNumbers.join(", ");
  }
  return `${uniqueInvoiceNumbers.slice(0, 3).join(", ")} + ${uniqueInvoiceNumbers.length - 3} more`;
}

function hydrateTaskComposeInvoices(
  databaseUrl: string,
  tenantId: string,
  invoices: OperatorConsoleTaskComposeInvoice[],
): OperatorConsoleTaskComposeInvoice[] {
  if (invoices.length === 0) {
    return invoices;
  }

  try {
    const queryableInvoices = invoices.filter((invoice) => isUuid(invoice.id));
    if (queryableInvoices.length === 0) {
      return invoices;
    }

    const rows = queryJsonRows<{
      id: string;
      uploadedDocumentId?: string;
      uploadedDocumentFileName?: string;
      uploadedDocumentMimeType?: string;
      metadata?: Record<string, unknown>;
    }>(
      databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            invoice.id::text AS id,
            invoice.uploaded_document_id::text AS "uploadedDocumentId",
            uploaded_document.metadata->>'fileName' AS "uploadedDocumentFileName",
            uploaded_document.metadata->>'mimeType' AS "uploadedDocumentMimeType",
            COALESCE(invoice.metadata, '{}'::jsonb) AS metadata
          FROM invoice
          LEFT JOIN uploaded_document
            ON uploaded_document.id = invoice.uploaded_document_id
           AND uploaded_document.deleted_at IS NULL
          WHERE invoice.tenant_id = '${quoteLiteral(tenantId)}'
            AND invoice.deleted_at IS NULL
            AND invoice.id IN (${queryableInvoices.map((invoice) => `'${quoteLiteral(invoice.id)}'::uuid`).join(", ")})
        ) q;
      `,
    );
    const rowById = new Map(rows.map((row) => [row.id, row]));

    return invoices.map((invoice) => {
      const persisted = rowById.get(invoice.id);
      if (!persisted) {
        return invoice;
      }

      return {
        ...invoice,
        ...(persisted.uploadedDocumentId
          ? { uploadedDocumentId: persisted.uploadedDocumentId }
          : {}),
        metadata: {
          ...invoice.metadata,
          ...(persisted.metadata ?? {}),
          ...(persisted.uploadedDocumentFileName
            ? { physicalInvoiceFileName: persisted.uploadedDocumentFileName }
            : {}),
          ...(persisted.uploadedDocumentMimeType
            ? { physicalInvoiceMimeType: persisted.uploadedDocumentMimeType }
            : {}),
        },
      };
    });
  } catch {
    return invoices;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function generateTaskEmailDraft(input: {
  taskTitle: string;
  account: OperatorConsoleTaskComposeAccount;
  contact: OperatorConsoleTaskComposeContact;
  invoices: OperatorConsoleTaskComposeInvoice[];
}): Promise<OperatorConsoleTaskEmailDraft> {
  const fallback = buildFallbackTaskEmailDraft(input);
  const env = loadEnv() as ReturnType<typeof loadEnv> & {
    OPENAI_API_KEY?: string;
    OUTREACH_EMAIL_DRAFT_MODEL?: string;
  };
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ...fallback,
      generatedBy: "fallback",
      note: "OpenAI API key is not configured, so this draft is using the local safe fallback.",
    };
  }

  try {
    const response = (await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: env.OUTREACH_EMAIL_DRAFT_MODEL?.trim() || "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "Draft one concise B2B collections follow-up email. Keep it polite, specific, and safe. Do not threaten, do not claim payment has not happened with certainty, and do not mention discounts or settlements. Return JSON with keys subjectLine and body.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  taskTitle: input.taskTitle,
                  customerName: input.account.displayName,
                  contactName: input.contact.fullName,
                  currency: input.account.currency,
                  invoices: input.invoices.map((invoice) => ({
                    invoiceNumber: invoice.invoiceNumber,
                    amountCents: invoice.amountCents,
                    dueDate: invoice.dueDate,
                  })),
                }),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "task_follow_up_email",
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["subjectLine", "body"],
              properties: {
                subjectLine: { type: "string" },
                body: { type: "string" },
              },
            },
          },
        },
      }),
    })) as LlmDraftFetchResponse;

    if (!response.ok) {
      return {
        ...fallback,
        generatedBy: "fallback",
        note: "The LLM draft request failed, so this draft is using the local safe fallback.",
      };
    }

    const payload = (await response.json()) as {
      output_text?: string;
    };
    const parsed = payload.output_text ? safeParseJson(payload.output_text) : undefined;
    const subjectLine =
      parsed && typeof parsed.subjectLine === "string" && parsed.subjectLine.trim().length > 0
        ? parsed.subjectLine.trim()
        : fallback.subjectLine;
    const body =
      parsed && typeof parsed.body === "string" && parsed.body.trim().length > 0
        ? parsed.body.trim()
        : fallback.body;

    return {
      subjectLine,
      body,
      generatedBy: "llm",
      note: "Draft generated with the configured LLM.",
    };
  } catch {
    return {
      ...fallback,
      generatedBy: "fallback",
      note: "The LLM draft request failed, so this draft is using the local safe fallback.",
    };
  }
}

function buildFallbackTaskEmailDraft(input: {
  taskTitle: string;
  account: OperatorConsoleTaskComposeAccount;
  contact: OperatorConsoleTaskComposeContact;
  invoices: OperatorConsoleTaskComposeInvoice[];
}): Omit<OperatorConsoleTaskEmailDraft, "generatedBy" | "note"> {
  const totalAmountCents = input.invoices.reduce((sum, invoice) => sum + invoice.amountCents, 0);
  const invoiceList = input.invoices
    .map(
      (invoice) =>
        `- ${invoice.invoiceNumber}: ${formatCurrency(invoice.amountCents)} due ${invoice.dueDate ?? "soon"}`,
    )
    .join("\n");

  return {
    subjectLine: `Follow-up on overdue invoices for ${input.account.displayName}`,
    body: [
      `Hi ${input.contact.fullName},`,
      "",
      `I wanted to follow up on the overdue invoices currently outstanding on your account with us. As of today, we have ${formatCurrency(totalAmountCents)} across the items below:`,
      "",
      invoiceList,
      "",
      "Could you please let us know the expected payment timing for these invoices? If payment has already been arranged, feel free to share the remittance reference so we can review it on our side.",
      "",
      "Thank you,",
      "Yield AROS Collections",
    ].join("\n"),
  };
}

function readComposeEmailPayload(
  metadata: Record<string, unknown>,
): OperatorConsoleTaskComposePayload | undefined {
  const raw = metadata.composeEmail;
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const payload = raw as Record<string, unknown>;
  const account = payload.account;
  const contact = payload.contact;
  const invoices = payload.invoices;
  if (!account || typeof account !== "object" || !contact || typeof contact !== "object") {
    return undefined;
  }
  if (!Array.isArray(invoices) || invoices.length === 0) {
    return undefined;
  }

  return {
    ...(typeof payload.scenario === "string" ? { scenario: payload.scenario } : {}),
    account: account as OperatorConsoleTaskComposeAccount,
    contact: contact as OperatorConsoleTaskComposeContact,
    invoices: invoices as OperatorConsoleTaskComposeInvoice[],
  };
}

function mapTaskType(task: {
  surfaces: string[];
  kind: string;
}): OperatorConsoleTaskQueueItem["type"] {
  if (task.surfaces.includes("cash_app")) {
    return "cash_app";
  }
  if (task.surfaces.includes("deductions")) {
    return "deduction";
  }
  if (task.surfaces.includes("org_credit_line")) {
    return "credit_line";
  }
  if (task.kind.includes("integration")) {
    return "integration";
  }
  return "collection";
}

function mapOperatorTaskStatus(taskStatus: Task["status"]): OperatorConsoleTaskQueueItem["status"] {
  if (taskStatus === "completed" || taskStatus === "closed") {
    return taskStatus;
  }
  return "open";
}

function buildOperatorTaskBrief(task: Task): string | undefined {
  return (
    normalizeOperatorTaskBrief(task.summary, task.kind) ??
    normalizeOperatorTaskBrief(task.description, task.kind) ??
    normalizeOperatorTaskBrief(task.recommendedNextAction, task.kind)
  );
}

function normalizeOperatorTaskBrief(value: string | undefined, taskKind?: string): string | undefined {
  const normalized = value
    ?.replace(/\s+/g, " ")
    .replace(/before changing receivable state/gi, "before changing invoice status")
    .trim();
  if (!normalized || startsWithSourceContext(normalized)) {
    return undefined;
  }

  const lower = normalized.toLowerCase();
  if (
    taskKind === "payment_collection_follow_up" &&
    (lower.includes("payment was already made") || lower.includes("already paid") || lower.includes("paid already"))
  ) {
    return "Customer said payment was already made; verify remittance or payment evidence before changing invoice status.";
  }

  const withoutSourceSections = stripSourceContextSections(normalized);
  if (!withoutSourceSections || startsWithSourceContext(withoutSourceSections)) {
    return undefined;
  }

  return ensureSentence(withoutSourceSections);
}

function stripSourceContextSections(value: string) {
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

function startsWithSourceContext(value: string) {
  return /^(?:scope|recommended next action|created from|call note|call summary|transcript|raw transcript|source context|internal source details):/i.test(value);
}

function ensureSentence(value: string) {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function buildTaskSourceLabel(
  task: Task,
  composeEmail: OperatorConsoleTaskComposePayload | undefined,
  callContext: TaskCallContext | undefined,
) {
  const source = task.source ?? readString(task.metadata, "source");
  if (callContext || source?.includes("retell")) {
    return "Retell call";
  }
  if (composeEmail) {
    return "Collections email";
  }
  if (task.origin === "manual") {
    return "Manual";
  }
  if (task.origin === "workflow_generated") {
    return "Workflow";
  }
  if (task.origin === "ai_generated") {
    return "AI";
  }
  return "System";
}

function readPriority(task: Task): OperatorConsoleTaskQueueItem["priority"] {
  const raw = task.priority ?? readString(task.metadata, "priority");
  if (raw === "critical") {
    return "high";
  }
  return raw === "low" || raw === "medium" || raw === "high" ? raw : "medium";
}

function toTaskCode(taskId: string): string {
  const cleaned = taskId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `TSK-${cleaned.slice(-6).padStart(6, "0")}`;
}

function buildInitials(value: string): string {
  const initials = value
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "O";
}

function formatDateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function formatDateTimeLabel(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function readString(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(metadata: Record<string, unknown>, key: string): number | undefined {
  const value = metadata[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value.filter((entry): entry is string => typeof entry === "string"));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return uniqueStrings(value.split(","));
  }
  return [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function shortIdentifier(value: string) {
  if (value.length <= 12) {
    return value;
  }
  return value.slice(-8).toUpperCase();
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trimEnd()}…` : normalized;
}

function readReplyAgingLabel(metadata: Record<string, unknown>): string | undefined {
  const explicit =
    readString(metadata, "replyAgingLabel") ??
    readString(metadata, "daysWithoutReplyLabel");
  if (explicit) {
    return explicit;
  }

  const days = readNumber(metadata, "daysWithoutReply") ?? readNumber(metadata, "replyAgingDays");
  if (days === undefined || days < 1) {
    return undefined;
  }
  return `${days} day${days === 1 ? "" : "s"} without reply`;
}

function isPastDueInvoice(dueDate: string | undefined) {
  if (!dueDate) {
    return false;
  }
  const due = new Date(`${dueDate}T00:00:00.000Z`);
  if (Number.isNaN(due.getTime())) {
    return false;
  }
  return due.getTime() < Date.now();
}

function safeParseJson(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function compareTaskQueueItems(
  left: OperatorConsoleTaskQueueItem,
  right: OperatorConsoleTaskQueueItem,
): number {
  const priorityRank = { high: 0, medium: 1, low: 2 };
  const priorityDiff = priorityRank[left.priority] - priorityRank[right.priority];
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  const leftCreated = left.createdAt ?? "";
  const rightCreated = right.createdAt ?? "";
  return rightCreated.localeCompare(leftCreated);
}

function metricToCard(
  metrics: MetricTile[],
  label: string,
  id: string,
  tone: DashboardSummaryCard["tone"],
  actionLabel?: string,
  actionPath?: string,
): DashboardSummaryCard {
  const metric = metrics.find((item) => item.label === label) ?? { label, value: "—", detail: "" };
  return {
    id,
    title: metric.label,
    value: metric.value,
    detail: metric.detail,
    tone,
    ...(actionLabel ? { actionLabel } : {}),
    ...(actionPath ? { actionPath } : {}),
  };
}

function buildHomeSetupChecklist(input: {
  emailSendingIdentityCount: number;
  integrationStatuses: IntegrationItem[];
}): HomeSetupChecklistReadModel {
  const emailConnected = input.emailSendingIdentityCount > 0;
  const erpConnected = input.integrationStatuses.some(
    (item) =>
      (
        item.name === "Business Central" ||
        item.name === "Dynamics 365 Business Central" ||
        item.name === "Odoo" ||
        item.name === "QuickBooks Online"
      ) &&
      item.status === "healthy",
  );

  const items = [
    {
      id: "connect_email",
      title: "Enable sending and receiving emails through Yield",
      detail: emailConnected
        ? "Outreach and remittance requests can flow through the connected mailbox."
        : "Required before any automated or operator-assisted outreach goes live.",
      status: emailConnected ? ("complete" as const) : ("pending" as const),
      actionLabel: emailConnected ? "Review Tasks" : "Connect Gmail",
      actionPath: emailConnected ? "/inbox" : "/integrations/email/google/connect",
    },
    {
      id: "connect_erp",
      title: "Confirm an ERP or accounting source is connected",
      detail: erpConnected
        ? "Ledger-backed invoice balances are available for operational follow-through."
        : "Needed so collectors work from ERP-backed balances instead of passive exports.",
      status: erpConnected ? ("complete" as const) : ("pending" as const),
      actionLabel: "Open Integrations",
      actionPath: "/integrations",
    },
  ];

  return {
    title: "Getting set up",
    outstandingCount: items.filter((item) => item.status === "pending").length,
    items,
  };
}

function buildHomeTaskSummary(input: {
  accountProfileSummaries: AccountProfileSummary[];
  collectionsQueue: CollectionsQueueItem[];
  approvalsQueue: ApprovalQueueItem[];
  exceptionsQueue: ExceptionQueueItem[];
  cashApplicationQueue: CashApplicationQueueData;
  firstClassTasks: Array<{
    customerProfileId?: string;
    billingAccountId?: string;
    surfaces: string[];
    status: string;
  }>;
}): HomeTaskSummaryReadModel {
  const tasksByCustomer = input.accountProfileSummaries
    .map((profile) => {
      const collectionsCount = input.collectionsQueue.filter(
        (item) => item.accountName === profile.accountName,
      ).length;
      const exceptionCount = input.exceptionsQueue.filter(
        (item) => item.accountName === profile.accountName,
      ).length;
      const approvalCount = input.approvalsQueue.filter((item) =>
        item.summary.includes(profile.accountName),
      ).length;
      const explicitTaskCount = input.firstClassTasks.filter(
        (task) =>
          task.status === "open" &&
          (task.billingAccountId === profile.billingAccountId ||
            task.customerProfileId === profile.billingAccountId),
      ).length;
      const count = collectionsCount + exceptionCount + approvalCount + explicitTaskCount;

      return count > 0
        ? {
            id: profile.billingAccountId,
            label: profile.accountName,
            detail: `${profile.openInvoiceCount} open invoices · overdue ${profile.overdueAmount}`,
            count,
            actionPath: "/customers",
          }
        : undefined;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => right.count - left.count);

  const tasksByType = [
    {
      id: "collections_tasks",
      label: "Collections",
      detail: "Accounts ready for collector action or follow-up.",
      count: input.collectionsQueue.length,
      actionPath: "/collections",
    },
    {
      id: "approval_tasks",
      label: "Approvals",
      detail: "Approval-gated actions that remain blocked until release.",
      count: input.approvalsQueue.length,
      actionPath: "/approvals",
    },
    {
      id: "exception_tasks",
      label: "Exceptions",
      detail: "Typed issues that need an explicit next step.",
      count: input.exceptionsQueue.length,
      actionPath: "/exceptions",
    },
      {
        id: "cash_application_tasks",
        label: "Cash application review",
        detail: "Payments held for safe operator review.",
        count: input.cashApplicationQueue.summary.needsReview,
        actionPath: "/cash-app",
      },
      {
        id: "deductions_tasks",
        label: "Deductions",
        detail: "Deduction work and short-pay follow-up that need explicit review.",
        count: input.firstClassTasks.filter(
          (task) => task.status === "open" && task.surfaces.includes("deductions"),
        ).length,
        actionPath: "/deductions",
      },
      {
        id: "org_credit_line_tasks",
        label: "Org credit line (demo)",
        detail: "Demo-only org credit line follow-up surfaced until the workflow is fully wired.",
        count: input.firstClassTasks.filter(
          (task) => task.status === "open" && task.surfaces.includes("org_credit_line"),
        ).length,
        actionPath: "/org-credit-line/demo",
      },
    ].filter((item) => item.count > 0);

  const canonicalOpenTaskCount = input.firstClassTasks.filter((task) => task.status === "open").length;
  const allTasks = canonicalOpenTaskCount > 0
    ? [
        {
          id: "open_tasks",
          label: "Open tasks",
          detail: "Canonical task queue count; completed, archived, closed, dismissed, and deleted tasks are excluded.",
          count: canonicalOpenTaskCount,
          actionPath: "/inbox",
        },
      ]
    : [];

  return {
    title: "Tasks",
    views: [
      {
        id: "by_customer",
        label: "By Customer",
        totalCount: tasksByCustomer.reduce((sum, item) => sum + item.count, 0),
        actionPath: "/customers",
        items: tasksByCustomer,
      },
      {
        id: "by_task_type",
        label: "By Task Type",
        totalCount: tasksByType.reduce((sum, item) => sum + item.count, 0),
        actionPath: "/inbox",
        items: tasksByType,
      },
      {
        id: "all_tasks",
        label: "All tasks",
        totalCount: allTasks.reduce((sum, item) => sum + item.count, 0),
        actionPath: "/inbox",
        items: allTasks,
      },
    ],
  };
}

function buildHomeCollectionsMetrics(input: {
  aiFeedCount: number;
  collectibleOpenAmountCents: number;
  automatedTaskCount: number;
  overdueOpenAmountCents: number;
}): HomeCollectionsMetricsReadModel {
  return {
    title: "Collections",
    periodLabel: "Today",
    outreachActivityCount: input.aiFeedCount,
    collectedAmountCents: input.collectibleOpenAmountCents,
    automatedTaskCount: input.automatedTaskCount,
    totalCollectedAmountCents: input.overdueOpenAmountCents,
    actionPath: "/collections",
  };
}

function buildHomeSnapshotMetrics(input: {
  openInvoiceCount: number;
  outstandingBalanceCents: number;
  overdueInvoiceCount: number;
  overdueBalanceCents: number;
}): HomeSnapshotMetricsReadModel {
  return {
    title: "Snapshot",
    openInvoiceCount: input.openInvoiceCount,
    outstandingBalanceCents: input.outstandingBalanceCents,
    overdueInvoiceCount: input.overdueInvoiceCount,
    overdueBalanceCents: input.overdueBalanceCents,
    actionPath: "/invoices",
  };
}

function buildHomeAgingBalance(
  invoiceAgingAnalytics: InvoiceAgingAnalytics,
): HomeAgingBalanceReadModel {
  return {
    title: "Aging Balance",
    subtitle: "Open invoice balance distributed across aging buckets",
    asOf: invoiceAgingAnalytics.asOf,
    buckets: invoiceAgingAnalytics.buckets.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      openAmountCents: bucket.openAmountCents,
      invoiceCount: bucket.invoiceCount,
      actionPath: "/invoices",
    })),
    actionPath: "/invoices",
  };
}

function buildLoanDashboard(): LoanDashboardReadModel {
  return {
    title: "Org credit line dashboard (demo)",
    totalCommittedLimitCents: 42_500_000_00,
    totalOutstandingCents: 28_420_000_00,
    totalAvailableCents: 14_080_000_00,
    dueThisWeekCents: 3_480_000_00,
    overdueCents: 1_250_000_00,
    facilityCount: 3,
    facilitiesInArrearsCount: 1,
    alertCount: 3,
    taskCount: 4,
    actionPath: "/org-credit-line/demo",
  };
}

function buildCreditFacilityList(): CreditFacilityListItem[] {
  return [
    {
      id: "fac-bdo-001",
      facilityName: "BDO Working Capital Line",
      lenderName: "BDO Unibank",
      borrowerLegalName: "Yield AROS Manufacturing Inc.",
      currency: "PHP",
      committedLimit: formatCurrency(20_500_000_00),
      outstandingBalance: formatCurrency(13_700_000_00),
      availableToDraw: formatCurrency(6_800_000_00),
      nextDueDate: "2026-04-12",
      daysPastDue: 0,
      daysPastDueBucket: "current",
      utilizationPercent: 67,
      status: "active",
      actionPath: "/org-credit-line/demo/facilities",
    },
    {
      id: "fac-secb-002",
      facilityName: "Security Bank Revolver",
      lenderName: "Security Bank",
      borrowerLegalName: "Yield AROS Manufacturing Inc.",
      currency: "PHP",
      committedLimit: formatCurrency(12_000_000_00),
      outstandingBalance: formatCurrency(11_900_000_00),
      availableToDraw: formatCurrency(100_000_00),
      nextDueDate: "2026-04-10",
      daysPastDue: 0,
      daysPastDueBucket: "current",
      utilizationPercent: 99,
      status: "watchlist",
      actionPath: "/org-credit-line/demo/facilities",
    },
    {
      id: "fac-bpi-003",
      facilityName: "BPI Bridge Loan",
      lenderName: "BPI",
      borrowerLegalName: "Yield AROS Manufacturing Inc.",
      currency: "PHP",
      committedLimit: formatCurrency(10_000_000_00),
      outstandingBalance: formatCurrency(2_820_000_00),
      availableToDraw: formatCurrency(7_180_000_00),
      nextDueDate: "2026-04-05",
      daysPastDue: 17,
      daysPastDueBucket: "days_1_30",
      utilizationPercent: 28,
      status: "watchlist",
      actionPath: "/org-credit-line/demo/facilities",
    },
  ];
}

function buildLoanStatementDetail(): LoanStatementDetailData {
  return {
    facilityId: "fac-bpi-003",
    facilityName: "BPI Bridge Loan",
    lenderName: "BPI",
    statementReference: "SOA-BPI-2026-03-31",
    statementDate: "2026-03-31",
    periodLabel: "Mar 1, 2026 to Mar 31, 2026",
    source: "Lender SOA upload",
    openingBalance: formatCurrency(3_450_000_00),
    closingBalance: formatCurrency(2_820_000_00),
    principalDue: formatCurrency(2_500_000_00),
    interestDue: formatCurrency(210_000_00),
    dstDue: formatCurrency(35_000_00),
    penaltyDue: formatCurrency(75_000_00),
    totalDue: formatCurrency(2_820_000_00),
    daysPastDue: 17,
    daysPastDueBucket: "days_1_30",
    runningBalanceNote:
      "SOA parsing preserved principal, interest, DST, penalty, payment applications, and running balances.",
    paymentApplications: [
      {
        id: "loan-app-1",
        paidAt: "2026-03-18",
        paymentReference: "PYMT-88912",
        amountApplied: formatCurrency(650_000_00),
        appliedPrincipal: formatCurrency(500_000_00),
        appliedInterest: formatCurrency(110_000_00),
        appliedDst: formatCurrency(15_000_00),
        appliedPenalty: formatCurrency(25_000_00),
        resultingRunningBalance: formatCurrency(2_820_000_00),
      },
    ],
  };
}

function buildLoanRepaymentHistory(): LoanRepaymentHistoryItem[] {
  return [
    {
      id: "loan-pay-1",
      paidAt: "2026-03-18",
      paymentReference: "PYMT-88912",
      amount: formatCurrency(650_000_00),
      appliedPrincipal: formatCurrency(500_000_00),
      appliedInterest: formatCurrency(110_000_00),
      appliedDst: formatCurrency(15_000_00),
      appliedPenalty: formatCurrency(25_000_00),
      resultingBalance: formatCurrency(2_820_000_00),
      status: "posted",
    },
    {
      id: "loan-pay-2",
      paidAt: "2026-02-15",
      paymentReference: "PYMT-86107",
      amount: formatCurrency(1_100_000_00),
      appliedPrincipal: formatCurrency(900_000_00),
      appliedInterest: formatCurrency(160_000_00),
      appliedDst: formatCurrency(20_000_00),
      appliedPenalty: formatCurrency(20_000_00),
      resultingBalance: formatCurrency(3_450_000_00),
      status: "posted",
    },
  ];
}

function buildLoanAlerts(): LoanAlertQueueItem[] {
  return [
    {
      id: "loan-alert-1",
      facilityId: "fac-bpi-003",
      facilityName: "BPI Bridge Loan",
      severity: "critical",
      title: "Past due repayment",
      summary: "The March 31 SOA shows the bridge loan is 17 DPD and still accruing penalty.",
      dueAt: "2026-04-09",
      actionPath: "/org-credit-line/demo/alerts",
    },
    {
      id: "loan-alert-2",
      facilityId: "fac-secb-002",
      facilityName: "Security Bank Revolver",
      severity: "warning",
      title: "Facility near max utilization",
      summary: "Available headroom is below PHP 100K and new drawdowns should be reviewed carefully.",
      dueAt: "2026-04-10",
      actionPath: "/org-credit-line/demo/alerts",
    },
    {
      id: "loan-alert-3",
      facilityId: "fac-bdo-001",
      facilityName: "BDO Working Capital Line",
      severity: "info",
      title: "Fresh SOA ready for review",
      summary: "The lender statement parsed cleanly and is ready for repayment reconciliation.",
      dueAt: "2026-04-12",
      actionPath: "/org-credit-line/demo/statement",
    },
  ];
}

function buildLoanTasks(): LoanTaskQueueItem[] {
  return [
    {
      id: "loan-task-1",
      facilityId: "fac-bpi-003",
      facilityName: "BPI Bridge Loan",
      title: "Confirm repayment release with treasury",
      owner: "Treasury Lead",
      queue: "treasury",
      dueAt: "2026-04-09",
      state: "open",
      actionPath: "/org-credit-line/demo/tasks",
    },
    {
      id: "loan-task-2",
      facilityId: "fac-bpi-003",
      facilityName: "BPI Bridge Loan",
      title: "Upload signed proof of payment",
      owner: "Finance Ops",
      queue: "finance",
      dueAt: "2026-04-09",
      state: "in_progress",
      actionPath: "/org-credit-line/demo/tasks",
    },
    {
      id: "loan-task-3",
      facilityId: "fac-secb-002",
      facilityName: "Security Bank Revolver",
      title: "Review alternative facility headroom",
      owner: "CFO",
      queue: "operations",
      dueAt: "2026-04-11",
      state: "blocked",
      actionPath: "/org-credit-line/demo/tasks",
    },
    {
      id: "loan-task-4",
      facilityId: "fac-bdo-001",
      facilityName: "BDO Working Capital Line",
      title: "Reconcile SOA to internal running balance",
      owner: "Controller",
      queue: "finance",
      dueAt: "2026-04-12",
      state: "open",
      actionPath: "/org-credit-line/demo/tasks",
    },
  ];
}

function buildInvoiceAgingAnalytics(
  invoices: OperatorConsoleResponse["invoiceIndex"]["invoices"],
  asOf: string,
): InvoiceAgingAnalytics {
  const buckets: InvoiceAgingAnalytics["buckets"] = [
    { id: "current", label: "Current", invoiceCount: 0, openAmountCents: 0, collectibleAmountCents: 0, disputedAmountCents: 0 },
    { id: "days_1_30", label: "1-30 days", invoiceCount: 0, openAmountCents: 0, collectibleAmountCents: 0, disputedAmountCents: 0 },
    { id: "days_31_60", label: "31-60 days", invoiceCount: 0, openAmountCents: 0, collectibleAmountCents: 0, disputedAmountCents: 0 },
    { id: "days_61_90", label: "61-90 days", invoiceCount: 0, openAmountCents: 0, collectibleAmountCents: 0, disputedAmountCents: 0 },
    { id: "days_90_plus", label: "90+ days", invoiceCount: 0, openAmountCents: 0, collectibleAmountCents: 0, disputedAmountCents: 0 },
  ];

  for (const invoice of invoices) {
    if (invoice.openAmountCents <= 0) {
      continue;
    }
    const overdueAmountCents = getOverdueOpenAmountCents(invoice);
    const currentAmountCents = Math.max(invoice.openAmountCents - overdueAmountCents, 0);

    if (currentAmountCents > 0) {
      const currentBucket = buckets.find((item) => item.id === "current");
      if (currentBucket) {
        currentBucket.invoiceCount += 1;
        currentBucket.openAmountCents += currentAmountCents;
        currentBucket.collectibleAmountCents += Math.min(getCollectibleOpenAmountCents(invoice), currentAmountCents);
        currentBucket.disputedAmountCents += Math.max(
          currentAmountCents - Math.min(getCollectibleOpenAmountCents(invoice), currentAmountCents),
          0,
        );
      }
    }

    if (overdueAmountCents > 0) {
      const bucketId = bucketIdForDaysPastDue(
        invoice.oldestOverdueInstallmentDaysPastDue ?? invoice.daysPastDue ?? 0,
      );
      const bucket = buckets.find((item) => item.id === bucketId);
      if (!bucket) {
        continue;
      }
      bucket.invoiceCount += 1;
      bucket.openAmountCents += overdueAmountCents;
      bucket.collectibleAmountCents += Math.min(getCollectibleOpenAmountCents(invoice), overdueAmountCents);
      bucket.disputedAmountCents += Math.max(
        overdueAmountCents - Math.min(getCollectibleOpenAmountCents(invoice), overdueAmountCents),
        0,
      );
    }
  }

  return {
    asOf,
    buckets,
    overdueInvoiceCount: invoices.filter((invoice) => getOverdueOpenAmountCents(invoice) > 0).length,
    overdueOpenAmountCents: buckets.slice(1).reduce((sum, bucket) => sum + bucket.openAmountCents, 0),
    overdueCollectibleAmountCents: buckets.slice(1).reduce((sum, bucket) => sum + bucket.collectibleAmountCents, 0),
  };
}

function buildOverdueExposure(
  invoices: OperatorConsoleResponse["invoiceIndex"]["invoices"],
): OverdueExposureSummary {
  const overdue = invoices.filter((invoice) => getOverdueOpenAmountCents(invoice) > 0);
  const severe = overdue.filter(
    (invoice) => (invoice.oldestOverdueInstallmentDaysPastDue ?? invoice.daysPastDue ?? 0) > 60,
  );
  return {
    overdueInvoiceCount: overdue.length,
    overdueOpenAmountCents: overdue.reduce((sum, invoice) => sum + getOverdueOpenAmountCents(invoice), 0),
    overdueCollectibleAmountCents: overdue.reduce(
      (sum, invoice) => sum + Math.min(getCollectibleOpenAmountCents(invoice), getOverdueOpenAmountCents(invoice)),
      0,
    ),
    blockedDisputedAmountCents: overdue.reduce((sum, invoice) => sum + getDisputedOpenAmountCents(invoice), 0),
    severeOverdueInvoiceCount: severe.length,
    severeOverdueAmountCents: severe.reduce((sum, invoice) => sum + getOverdueOpenAmountCents(invoice), 0),
  };
}

function buildCollectibleVsDisputed(
  invoices: OperatorConsoleResponse["invoiceIndex"]["invoices"],
): CollectibleVsDisputedSummary {
  const openInvoices = invoices.filter((invoice) => invoice.openAmountCents > 0);
  const collectibleOpenAmountCents = openInvoices.reduce(
    (sum, invoice) => sum + getCollectibleOpenAmountCents(invoice),
    0,
  );
  const disputedOpenAmountCents = openInvoices.reduce(
    (sum, invoice) => sum + getDisputedOpenAmountCents(invoice),
    0,
  );
  const partialDisputeCollectibleAmountCents = openInvoices
    .filter((invoice) => invoice.status === "disputed" && typeof invoice.collectibleAmountCents === "number")
    .reduce((sum, invoice) => sum + getCollectibleOpenAmountCents(invoice), 0);
  const fullyDisputedAmountCents = openInvoices
    .filter((invoice) => invoice.status === "disputed" && !invoice.collectibleAmountCents)
    .reduce((sum, invoice) => sum + invoice.openAmountCents, 0);

  return {
    collectibleOpenAmountCents,
    disputedOpenAmountCents,
    partialDisputeCollectibleAmountCents,
    fullyDisputedAmountCents,
    collectibleCoverageRatio:
      collectibleOpenAmountCents + disputedOpenAmountCents > 0
        ? collectibleOpenAmountCents / (collectibleOpenAmountCents + disputedOpenAmountCents)
        : 0,
  };
}

function loadLinkedPaymentRemittanceStatus(input: {
  databaseUrl: string;
  tenantId: string;
  paymentsQueue: PaymentQueueItem[];
  cashApplicationQueue: CashApplicationQueueData;
}): LinkedPaymentRemittanceSummary {
  const seededSummary: LinkedPaymentRemittanceSummary = {
    invoicesWithLinkedPaymentsCount: 2,
    paymentsAwaitingReviewCount: input.cashApplicationQueue.summary.needsReview,
    unappliedPaymentsCount: input.paymentsQueue.filter((item) => item.state === "Unapplied cash").length,
    remittancesLinkedToPaymentCount: 1,
    remittancesAwaitingReviewCount: 1,
    remittancesOrphanedCount: 0,
  };

  if (!databaseIsUsable(input.databaseUrl)) {
    return seededSummary;
  }

  try {
    const [row] = queryJsonRows<PersistedLinkedStatusRow>(
      input.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            COALESCE((SELECT COUNT(DISTINCT invoice_id)::int FROM payment_application WHERE tenant_id = '${quoteLiteral(input.tenantId)}' AND deleted_at IS NULL), 0) AS "invoicesWithLinkedPaymentsCount",
            COALESCE((SELECT COUNT(*)::int FROM remittance_processing_record WHERE tenant_id = '${quoteLiteral(input.tenantId)}' AND linked_payment_id IS NOT NULL), 0) AS "remittancesLinkedToPaymentCount",
            COALESCE((SELECT COUNT(*)::int FROM remittance rem INNER JOIN remittance_processing_record processing ON processing.remittance_id = rem.id WHERE processing.tenant_id = '${quoteLiteral(input.tenantId)}' AND rem.deleted_at IS NULL AND rem.state IN ('review_required', 'linked_to_invoice_candidate')), 0) AS "remittancesAwaitingReviewCount",
            COALESCE((SELECT COUNT(*)::int FROM remittance WHERE tenant_id = '${quoteLiteral(input.tenantId)}' AND deleted_at IS NULL AND state = 'orphaned'), 0) AS "remittancesOrphanedCount"
        ) q;
      `,
    );

    return row
      ? {
          ...seededSummary,
          invoicesWithLinkedPaymentsCount: row.invoicesWithLinkedPaymentsCount,
          remittancesLinkedToPaymentCount: row.remittancesLinkedToPaymentCount,
          remittancesAwaitingReviewCount: row.remittancesAwaitingReviewCount,
          remittancesOrphanedCount: row.remittancesOrphanedCount,
        }
      : seededSummary;
  } catch {
    return seededSummary;
  }
}

function buildExceptionCountSummary(input: {
  exceptionBreakdown: Array<{ type: string; count: number }>;
  exceptionsQueue: ExceptionQueueItem[];
  databaseUrl: string;
  tenantId: string;
}): ExceptionCountSummary {
  const seededSummary: ExceptionCountSummary = {
    totalOpen: input.exceptionBreakdown.reduce((sum, item) => sum + item.count, 0),
    highSeverity: input.exceptionsQueue.length,
    waitingOnCustomer: input.exceptionBreakdown.some((item) => item.type.includes("payer")) ? 1 : 0,
    readyForResolution: 0,
    byType: input.exceptionBreakdown,
  };

  if (!databaseIsUsable(input.databaseUrl)) {
    return seededSummary;
  }

  try {
    const [row] = queryJsonRows<PersistedExceptionStateRow>(
      input.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            COUNT(*)::int AS "totalOpen",
            COUNT(*) FILTER (WHERE severity IN ('high', 'critical'))::int AS "highSeverity",
            COUNT(*) FILTER (WHERE state = 'waiting_on_customer')::int AS "waitingOnCustomer",
            COUNT(*) FILTER (WHERE state = 'ready_for_resolution')::int AS "readyForResolution"
          FROM exception
          WHERE tenant_id = '${quoteLiteral(input.tenantId)}'
            AND deleted_at IS NULL
            AND state NOT IN ('resolved', 'dismissed')
        ) q;
      `,
    );

    return row ? { ...seededSummary, ...row } : seededSummary;
  } catch {
    return seededSummary;
  }
}

function buildAccountProfileSummaries(input: {
  invoiceEntries: OperatorConsoleResponse["invoiceIndex"]["invoices"];
  collectionsQueue: CollectionsQueueItem[];
  promisesDueToday: number;
}): AccountProfileSummary[] {
  const grouped = new Map<string, {
    accountName: string;
    parentAccountName?: string;
    openAmountCents: number;
    overdueAmountCents: number;
    collectibleAmountCents: number;
    disputedAmountCents: number;
    openInvoiceCount: number;
  }>();

  for (const invoice of input.invoiceEntries) {
    const key = invoice.billingAccountId ?? invoice.customerReference ?? invoice.customerName;
    const existing = grouped.get(key) ?? {
      accountName: invoice.billingAccountName ?? invoice.customerName,
      ...(invoice.parentAccountName ? { parentAccountName: invoice.parentAccountName } : {}),
      openAmountCents: 0,
      overdueAmountCents: 0,
      collectibleAmountCents: 0,
      disputedAmountCents: 0,
      openInvoiceCount: 0,
    };
    if (invoice.openAmountCents > 0) {
      existing.openAmountCents += invoice.openAmountCents;
      existing.collectibleAmountCents += getCollectibleOpenAmountCents(invoice);
      existing.disputedAmountCents += getDisputedOpenAmountCents(invoice);
      existing.openInvoiceCount += 1;
      if (getOverdueOpenAmountCents(invoice) > 0) {
        existing.overdueAmountCents += getOverdueOpenAmountCents(invoice);
      }
    }
    grouped.set(key, existing);
  }

  const queueByAccount = new Map(input.collectionsQueue.map((item) => [item.accountName, item]));

  return [...grouped.entries()]
    .sort((left, right) => right[1].openAmountCents - left[1].openAmountCents)
    .slice(0, 3)
    .map(([billingAccountId, summary], index) => {
      const queueItem = queueByAccount.get(summary.accountName);
      return {
        billingAccountId,
        accountName: summary.accountName,
        ...(summary.parentAccountName ? { parentAccountName: summary.parentAccountName } : {}),
        accountTier: queueItem?.accountTier.toLowerCase() === "strategic" ? "strategic" : "standard",
        openAmount: formatCurrency(summary.openAmountCents),
        overdueAmount: formatCurrency(summary.overdueAmountCents),
        collectibleAmount: formatCurrency(summary.collectibleAmountCents),
        disputedAmount: formatCurrency(summary.disputedAmountCents),
        openInvoiceCount: summary.openInvoiceCount,
        promisesDueToday: index === 0 ? input.promisesDueToday : 0,
        nextAction: queueItem?.nextAction ?? "Review account workspace before any outreach.",
        linkedStatus:
          summary.disputedAmountCents > 0
            ? "Disputed exposure remains blocked from automation."
            : "Linked payments are safe to review in the cash application queue.",
      };
    });
}

function buildCustomerIndex(input: {
  accountProfileSummaries: AccountProfileSummary[];
  collectionsQueue: CollectionsQueueItem[];
}): CustomerIndexItem[] {
  const queueByAccount = new Map(input.collectionsQueue.map((item) => [item.accountName, item]));

  return input.accountProfileSummaries.map((item): CustomerIndexItem => {
    const queueItem = queueByAccount.get(item.accountName);
    const tabs: CustomerIndexItem["tabs"] = [
      { id: "overview", label: "Overview", itemCount: 1, status: "ready" as const },
      { id: "invoices", label: "Invoices", itemCount: item.openInvoiceCount, status: item.openInvoiceCount > 0 ? "ready" as const : "empty" as const },
      {
        id: "tasks",
        label: "Tasks",
        itemCount: item.promisesDueToday + (queueItem ? 1 : 0),
        status: item.promisesDueToday + (queueItem ? 1 : 0) > 0 ? "attention" as const : "empty" as const,
      },
      { id: "activity", label: "Activity", itemCount: queueItem ? 2 : 0, status: queueItem ? "ready" as const : "empty" as const },
      { id: "payments", label: "Payments", itemCount: item.disputedAmount === "₱0" ? 1 : 0, status: "ready" as const },
      { id: "ap_portal", label: "AP Portal", itemCount: 0, status: "empty" as const },
      {
        id: "deductions",
        label: "Deductions",
        itemCount: item.disputedAmount === "₱0" ? 0 : 1,
        status: item.disputedAmount === "₱0" ? "empty" as const : "attention" as const,
      },
    ];

    return {
      profileId: item.billingAccountId,
      canonicalName: item.accountName,
      status: "active",
      accountTier: item.accountTier,
      ...(item.parentAccountName ? { parentAccountName: item.parentAccountName } : {}),
      billingAccountId: item.billingAccountId,
      billingAccountName: item.accountName,
      branchNames: [],
      ...(queueItem?.contactEmail ? { primaryContactEmail: queueItem.contactEmail } : {}),
      openAmount: item.openAmount,
      overdueAmount: item.overdueAmount,
      collectibleAmount: item.collectibleAmount,
      disputedAmount: item.disputedAmount,
      openInvoiceCount: item.openInvoiceCount,
      taskCount: item.promisesDueToday + (queueItem ? 1 : 0),
      completenessScore: queueItem?.contactEmail ? 0.83 : 0.67,
      nextAction: item.nextAction,
      hasPendingReview: item.accountTier === "strategic" || item.disputedAmount !== "₱0",
      tabs,
    };
  });
}

function buildCustomerProfileWorkspace(input: {
  accountWorkspace: OperatorConsoleResponse["accountWorkspace"];
  customerIndex: CustomerIndexItem[];
  billingAccountId: string;
}): CustomerProfileWorkspaceData {
  const selectedIndex =
    input.customerIndex.find((item) => item.billingAccountId === input.billingAccountId) ??
    input.customerIndex[0];

  const completenessItems = [
    {
      id: "billing_account",
      label: "Billing account linked",
      status: "complete" as const,
      detail: "Billing account remains the default routing level for this customer.",
    },
    {
      id: "parent_account",
      label: "Parent account linked",
      status: input.accountWorkspace.parentAccount ? "complete" as const : "warning" as const,
      detail: input.accountWorkspace.parentAccount
        ? "Parent-account visibility is available for centralized payer context."
        : "Parent-account visibility is still missing.",
    },
    {
      id: "verified_contact",
      label: "Verified contact",
      status: selectedIndex?.primaryContactEmail ? "complete" as const : "missing" as const,
      detail: selectedIndex?.primaryContactEmail
        ? "A primary customer contact is available for safe outreach."
        : "No verified primary contact is currently surfaced.",
    },
    {
      id: "branch_context",
      label: "Branch preserved",
      status: input.accountWorkspace.notes.some((note) => note.includes("branch-tagged"))
        ? "complete" as const
        : "warning" as const,
      detail: "Branch context is retained whenever invoice data includes it.",
    },
  ];
  const completedCount = completenessItems.filter((item) => item.status === "complete").length;
  const completenessScore = Number((completedCount / completenessItems.length).toFixed(2));

  return {
    profileId: input.accountWorkspace.billingAccountId,
    overviewSummary: {
      canonicalName: input.accountWorkspace.accountName,
      status: "active",
      accountTier: input.accountWorkspace.accountTier.toLowerCase() === "strategic" ? "strategic" : "standard",
      parentAccountName: input.accountWorkspace.parentAccount,
      billingAccountName: input.accountWorkspace.accountName,
      branchNames: input.accountWorkspace.notes
        .filter((note) => note.includes("branch"))
        .map(() => "Known branch"),
      hierarchySummary: `parent ${input.accountWorkspace.parentAccount} | billing ${input.accountWorkspace.billingAccountId} | branch preserved when known`,
    },
    contactSummary: {
      totalContacts: selectedIndex?.primaryContactEmail ? 1 : 0,
      verifiedContacts: selectedIndex?.primaryContactEmail ? 1 : 0,
      autoSendEligibleContacts: selectedIndex?.primaryContactEmail ? 1 : 0,
      sharedMailboxContacts: selectedIndex?.primaryContactEmail?.startsWith("ap@") ? 1 : 0,
      hasVerifiedPrimaryContact: Boolean(selectedIndex?.primaryContactEmail),
      primaryContactName: "Primary AP Contact",
      primaryContactRole: "ap",
      ...(selectedIndex?.primaryContactEmail
        ? { primaryContactEmail: selectedIndex.primaryContactEmail }
        : {}),
    },
    insightSummary: {
      conciseSummary: `${input.accountWorkspace.accountName} | ${input.accountWorkspace.nextBestAction}`,
      nextBestAction: input.accountWorkspace.nextBestAction,
      duplicateReviewPending: false,
      primaryContactReviewPending: false,
      explanation: [input.accountWorkspace.linkedStatus ?? "Customer insight summary is based on current workspace signals."],
    },
    financialSummary: {
      currency: "PHP",
      openAmount: input.accountWorkspace.balanceOpen,
      overdueAmount: input.accountWorkspace.overdueAmount,
      collectibleAmount: input.accountWorkspace.collectibleAmount ?? "—",
      disputedAmount: input.accountWorkspace.disputedAmount ?? "—",
      unappliedCashAmount: "₱0",
      openInvoiceCount: selectedIndex?.openInvoiceCount ?? 0,
      overdueInvoiceCount: selectedIndex?.overdueAmount === "₱0" ? 0 : selectedIndex?.openInvoiceCount ?? 0,
      disputedInvoiceCount: input.accountWorkspace.disputedAmount && input.accountWorkspace.disputedAmount !== "₱0" ? 1 : 0,
      paymentCount: 1,
      remittanceCount: 1,
    },
    completenessCheck: {
      score: completenessScore,
      completedCount,
      totalCount: completenessItems.length,
      status: completedCount === completenessItems.length ? "complete" : "warning",
      items: completenessItems,
    },
    notes: input.accountWorkspace.notes.map((body, index) => ({
      id: `customer-note-${index + 1}`,
      kind: body.includes("auto-chase") ? "collections" as const : "system" as const,
      body,
      source: "operator_console.seed",
      createdAt: new Date().toISOString(),
    })),
    creditProfile: {
      riskLevel:
        input.accountWorkspace.disputedAmount && input.accountWorkspace.disputedAmount !== "₱0"
          ? "high"
          : input.accountWorkspace.overdueAmount !== "₱0"
            ? "medium"
            : "low",
      hasCreditHold: false,
      hasOverdueBalance: input.accountWorkspace.overdueAmount !== "₱0",
      blockedReasons:
        input.accountWorkspace.disputedAmount && input.accountWorkspace.disputedAmount !== "₱0"
          ? ["Disputed balance remains open and blocks automated collections."]
          : [],
    },
    tabs: selectedIndex?.tabs ?? [],
    ...(input.accountWorkspace.learning ? { learning: input.accountWorkspace.learning } : {}),
  };
}

function buildNextActionSummaryCards(input: {
  approvalsPending: number;
  exceptionCount: number;
  cashReviewCount: number;
  actionSummaries: ActionSummary[];
}): NextActionSummaryCard[] {
  const primary: ActionSummary = input.actionSummaries[0] ?? {
    id: "cash-review-summary",
    title: "Cash review items waiting",
    summary: "Open cash review items remain visible until the safest application path is confirmed.",
    severity: "attention" as const,
  };
  const approvals: ActionSummary = input.actionSummaries[1] ?? {
    id: "approval-summary",
    title: "Approvals waiting",
    summary: "Approval-gated items stay paused until a reviewer explicitly releases them.",
    severity: "attention" as const,
  };
  const exceptions: ActionSummary = input.actionSummaries[2] ?? {
    id: "exception-summary",
    title: "Exceptions waiting",
    summary: "Typed exceptions remain visible until the recommended next step is completed.",
    severity: "critical" as const,
  };

  return [
    {
      id: primary.id,
      title: primary.title,
      summary: primary.summary,
      severity: primary.severity,
      count: input.cashReviewCount,
      actionLabel: "Open cash review",
      actionPath: "/cash-app",
    },
    {
      id: approvals.id,
      title: approvals.title,
      summary: approvals.summary,
      severity: approvals.severity,
      count: input.approvalsPending,
      actionLabel: "Review approvals",
      actionPath: "/approvals",
    },
    {
      id: exceptions.id,
      title: exceptions.title,
      summary: exceptions.summary,
      severity: exceptions.severity,
      count: input.exceptionCount,
      actionLabel: "Resolve exception",
      actionPath: "/exceptions",
    },
  ];
}

function buildInvoiceLinkedStatuses(input: {
  businessCentralConnected: boolean;
}): InvoiceLinkedStatusItem[] {
  return input.businessCentralConnected
    ? [
        {
          id: "linked-payment-live",
          kind: "payment",
          reference: "Awaiting live payment link",
          status: "Pending review",
          detail: "The invoice row is live, but payment/remittance linkage still waits on the conservative review path.",
        },
      ]
    : [
        {
          id: "linked-payment-1",
          kind: "payment",
          reference: "PAY-2024-0234",
          status: "Auto-applied",
          amount: formatCurrency(2_450_000),
          detail: "Linked payment remains auditable and branch-aware.",
        },
        {
          id: "linked-remittance-1",
          kind: "remittance",
          reference: "RMT-STRAT-001",
          status: "Awaiting dispute resolution",
          detail: "Remittance evidence is attached, but the invoice stays blocked while the dispute is open.",
        },
      ];
}

function bucketIdForDaysPastDue(daysPastDue: number): InvoiceAgingAnalytics["buckets"][number]["id"] {
  if (daysPastDue <= 0) {
    return "current";
  }
  if (daysPastDue <= 30) {
    return "days_1_30";
  }
  if (daysPastDue <= 60) {
    return "days_31_60";
  }
  if (daysPastDue <= 90) {
    return "days_61_90";
  }
  return "days_90_plus";
}

function getCollectibleOpenAmountCents(invoice: OperatorConsoleResponse["invoiceIndex"]["invoices"][number]) {
  if (invoice.status === "disputed") {
    return Math.min(invoice.collectibleAmountCents ?? 0, invoice.openAmountCents);
  }
  return invoice.openAmountCents;
}

function getOverdueOpenAmountCents(invoice: OperatorConsoleResponse["invoiceIndex"]["invoices"][number]) {
  if (typeof invoice.overdueAmountCents === "number") {
    return invoice.overdueAmountCents;
  }
  return (invoice.daysPastDue ?? 0) > 0 ? invoice.openAmountCents : 0;
}

function getDisputedOpenAmountCents(invoice: OperatorConsoleResponse["invoiceIndex"]["invoices"][number]) {
  if (invoice.status !== "disputed") {
    return 0;
  }
  const disputedBase = typeof invoice.overdueAmountCents === "number" ? invoice.overdueAmountCents : invoice.openAmountCents;
  return Math.max(disputedBase - Math.min(getCollectibleOpenAmountCents(invoice), disputedBase), 0);
}

function databaseIsUsable(databaseUrl: string) {
  return databaseUrl.trim().length > 0 && createDatabaseClientConfig().connectionString.length > 0 && isDatabaseAvailable(databaseUrl);
}

function tallyExceptions(
  scenarios: Array<{
    route: string;
    exceptionKind?: string;
  }>
) {
  const counts = new Map<string, number>();

  for (const scenario of scenarios) {
    if (scenario.route !== "review_required") {
      continue;
    }

    const key = scenario.exceptionKind ?? "manual_review";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([type, count]) => ({ type, count }));
}

function indexLearningScenarios() {
  return Object.fromEntries(
    buildLearningLayerDemoScenarios().map((scenario) => [scenario.billingAccountId, scenario]),
  );
}

function attachLearningToCashApplicationQueue(
  queue: OperatorConsoleResponse["cashApplicationQueue"],
  scenarios: ReturnType<typeof indexLearningScenarios>,
): OperatorConsoleResponse["cashApplicationQueue"] {
  return {
    ...queue,
    reviewRows: queue.reviewRows.map((row, rowIndex) => ({
      ...row,
      matches: row.matches.map((match, index) => ({
        ...match,
        ...(((rowIndex === 0 && index === 0)
          ? scenarios["billing_seed_1"]?.cashApplication
          : scenarios["billing_sparse_demo"]?.cashApplication)
          ? {
              learning:
                rowIndex === 0 && index === 0
                  ? scenarios["billing_seed_1"]!.cashApplication
                  : scenarios["billing_sparse_demo"]!.cashApplication,
            }
          : {}),
      })),
    })),
    ...(queue.highlightedPayment
      ? {
          highlightedPayment: {
            ...queue.highlightedPayment,
            matches: queue.highlightedPayment.matches.map((match, index) => ({
              ...match,
              ...((index === 0
                ? scenarios["billing_seed_1"]?.cashApplication
                : scenarios["billing_sparse_demo"]?.cashApplication)
                ? {
                    learning:
                      index === 0
                        ? scenarios["billing_seed_1"]!.cashApplication
                        : scenarios["billing_sparse_demo"]!.cashApplication,
                  }
                : {}),
            })),
          },
        }
      : {}),
    ...(queue.activeSession
      ? {
          activeSession: {
            ...queue.activeSession,
            availableInvoiceSearchResults: queue.activeSession.availableInvoiceSearchResults.map((result, index) => ({
              ...result,
              rationale:
                index === 0 && scenarios["billing_seed_1"]?.cashApplication
                  ? `${result.rationale} ${scenarios["billing_seed_1"]!.cashApplication.matchConfidenceExplanation.reasonSummary}`
                  : result.rationale,
            })),
          },
        }
      : {}),
  };
}

function mapBusinessCentralInvoiceToCollectionsQueueItem(
  invoice: BusinessCentralInvoiceRecord,
  scenarios: ReturnType<typeof indexLearningScenarios>,
): OperatorConsoleResponse["collectionsQueue"][number] {
  const learning =
    scenarios["billing_seed_1"]?.collections ??
    buildSparseCollectionsLearningFallback({
      contactName: invoice.contactName,
      contactEmail: invoice.email,
      hasDueDate: Boolean(invoice.dueDate),
    });

  return {
    id: invoice.externalId,
    ...(invoice.customerNumber ? { accountReference: invoice.customerNumber } : {}),
    accountName: invoice.customerName,
    accountTier: "Standard",
    overdueAmount: formatCurrency(invoice.remainingAmountCents),
    promiseDue: invoice.dueDate ?? "No due date",
    nextAction: `Review ${invoice.invoiceNumber}`,
    rationale: `Business Central ${invoice.status} invoice`,
    ...(invoice.contactName ? { contactName: invoice.contactName } : {}),
    ...(invoice.email ? { contactEmail: invoice.email } : {}),
    outstandingAmount: formatCurrency(invoice.totalAmountCents),
    oldestInvoiceAge: invoice.invoiceDate ?? "BC invoice",
    averageAge: invoice.companyName ?? "Business Central",
    assignee: "ERP Sync",
    dueLabel: invoice.dueDate ?? "No due date",
    learning,
  };
}

function isInvoiceIndexEntryEligibleForCollectionsQueue(invoice: InvoiceIndexEntry) {
  return (
    invoice.openAmountCents > 0 &&
    invoice.status !== "paid" &&
    invoice.status !== "voided" &&
    invoice.status !== "disputed"
  );
}

function readStringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function mapInvoiceIndexEntryToCollectionsQueueItem(
  invoice: InvoiceIndexEntry,
  scenarios: ReturnType<typeof indexLearningScenarios>,
): OperatorConsoleResponse["collectionsQueue"][number] {
  const accountName = invoice.billingAccountName ?? invoice.customerName;
  const billingAccountId = invoice.billingAccountId;
  const contactName = readStringMetadata(invoice.metadata, "contactName");
  const contactEmail = readStringMetadata(invoice.metadata, "contactEmail");
  const overdueAmountCents = getOverdueOpenAmountCents(invoice);
  const attentionAmountCents = overdueAmountCents > 0 ? overdueAmountCents : invoice.openAmountCents;
  const learning =
    (billingAccountId ? scenarios[billingAccountId]?.collections : undefined) ??
    buildSparseCollectionsLearningFallback({
      contactName,
      contactEmail,
      hasDueDate: Boolean(invoice.dueDate),
    });

  return {
    id: billingAccountId ?? invoice.canonicalInvoiceId ?? invoice.externalId ?? invoice.id,
    ...(invoice.customerReference ?? billingAccountId
      ? { accountReference: invoice.customerReference ?? billingAccountId }
      : {}),
    accountName,
    accountTier: readStringMetadata(invoice.metadata, "accountTier") === "strategic" ? "Strategic" : "Standard",
    overdueAmount: formatCurrency(attentionAmountCents),
    promiseDue: invoice.dueDate ?? "No due date",
    nextAction: `Review ${invoice.invoiceNumber}`,
    rationale:
      invoice.importMode === "seed_fallback"
        ? "Seed demo open invoice remains eligible for safe collections review."
        : `${invoice.sourceLabel} ${invoice.status} invoice remains eligible for collections review.`,
    ...(contactName ? { contactName } : {}),
    ...(contactEmail ? { contactEmail } : {}),
    outstandingAmount: formatCurrency(invoice.openAmountCents),
    oldestInvoiceAge: invoice.issuedAt ?? "Imported invoice",
    averageAge:
      invoice.daysPastDue !== undefined
        ? `${invoice.daysPastDue} days past due`
        : invoice.sourceLabel,
    assignee: "Collections",
    dueLabel: invoice.dueDate ?? "No due date",
    learning,
  };
}

function buildSparseCollectionsLearningFallback(input: {
  contactName: string | undefined;
  contactEmail: string | undefined;
  hasDueDate: boolean;
}): LearningCollectionsSummary {
  const contactName = input.contactName ?? "Verified AR contact";
  const contactMethod = input.contactEmail ?? "existing verified email";

  return {
    preferredContactRecommendation: {
      contactName,
      contactMethod,
      reasonSummary: "Using the linked verified collections contact because learned contact history is still sparse.",
      sparseFallback: true,
    },
    preferredChannelRecommendation: {
      channel: "email",
      reasonSummary: "Email remains the default channel until stronger verified multi-channel evidence is available.",
      sparseFallback: true,
    },
    preferredSendTiming: {
      label: input.hasDueDate ? "Business hours before due time" : "Next business-hours send window",
      reasonSummary: "Timing falls back to safe business-hour outreach because historical timing data is sparse.",
      sparseFallback: true,
    },
    documentBundleRecommendation: {
      label: "Invoice copy only",
      reasonSummary: "Start with the minimum verified bundle and expand only when the customer asks for more documents.",
      sparseFallback: true,
    },
    ptpReliabilityIndicator: {
      level: "unknown",
      reasonSummary: "No reliable promise-to-pay history is available for this live ERP row yet.",
    },
    nextBestActionScore: {
      action: "send_email_grouped_reminder",
      score: 0.51,
      channel: "email",
      reasonSummary: "Email remains the safest default action until stronger learned behavior is available.",
      channelReasonSummaries: [
        {
          channel: "email",
          summary: "Verified email contact is available and email is the MVP default.",
        },
      ],
      rankedRecommendations: [
        {
          action: "send_email_grouped_reminder",
          score: 0.51,
          channel: "email",
          blockedBySafety: false,
          reasonSummary: "Email remains the safest default action until stronger learned behavior is available.",
        },
      ],
      sparseFallback: true,
    },
  };
}

function hydrateCollectionsQueueWithPersistedLearning(input: {
  collectionsQueue: OperatorConsoleResponse["collectionsQueue"];
  databaseUrl: string;
  tenantId: string;
}): OperatorConsoleResponse["collectionsQueue"] {
  return input.collectionsQueue.map((item) => {
    const persisted = loadPersistedCollectionsLearning({
      databaseUrl: input.databaseUrl,
      tenantId: input.tenantId,
      ...(typeof item.id === "string" && item.id.startsWith("bill-")
        ? { billingAccountId: item.id }
        : {}),
      ...(item.accountReference ? { accountNumber: item.accountReference } : {}),
      ...(item.contactEmail ? { contactEmail: item.contactEmail } : {}),
    });

    return {
      ...item,
      learning:
        persisted ??
        item.learning ??
        buildSparseCollectionsLearningFallback({
          contactName: item.contactName,
          contactEmail: item.contactEmail,
          hasDueDate: Boolean(item.dueLabel && item.dueLabel !== "No due date"),
        }),
    };
  });
}

function resolveWorkspaceLearning(input: {
  businessCentralConnected: boolean;
  collectionsQueue: OperatorConsoleResponse["collectionsQueue"];
  demoWorkspace?: LearningWorkspaceSummary;
  databaseUrl: string;
  tenantId: string;
  billingAccountId: string;
}): LearningWorkspaceSummary | undefined {
  const persisted = loadPersistedWorkspaceLearning({
    databaseUrl: input.databaseUrl,
    tenantId: input.tenantId,
    billingAccountId: input.billingAccountId,
  });
  if (persisted) {
    return persisted;
  }
  if (input.businessCentralConnected && input.collectionsQueue[0]?.learning) {
    return collectionsLearningToWorkspace(input.collectionsQueue[0].learning);
  }
  return input.demoWorkspace;
}

function loadPersistedCollectionsLearning(input: {
  databaseUrl: string;
  tenantId: string;
  billingAccountId?: string;
  accountNumber?: string;
  contactEmail?: string;
}): LearningCollectionsSummary | undefined {
  const row = loadPersistedLearningSummary(input);
  return row ? buildCollectionsLearningFromPersistedRow(row) : undefined;
}

function loadPersistedWorkspaceLearning(input: {
  databaseUrl: string;
  tenantId: string;
  billingAccountId: string;
}): LearningWorkspaceSummary | undefined {
  const row = loadPersistedLearningSummary(input);
  return row ? buildWorkspaceLearningFromPersistedRow(row) : undefined;
}
function buildCollectionsLearningFromPersistedRow(row: PersistedLearningSummaryRow): LearningCollectionsSummary {
  const preferredChannel =
    row.contactPreferredChannel ?? row.accountPreferredChannel ?? row.recommendedChannel ?? "email";
  const docBundle = inferDocumentBundleRecommendation(row.accountMetricsByChannel);
  const ptpReliability = inferPtpReliability(row.accountMetricsByChannel);
  const reasonSummary =
    row.recommendedReasonSummary ??
    row.contactExplanation?.[0]?.summary ??
    row.accountExplanation?.[0]?.summary ??
    "Using stored account behavior to guide the next safe collections action.";

  const rankedRecommendations: LearningCollectionsSummary["nextBestActionScore"]["rankedRecommendations"] = (row.candidateScores ?? [])
    .filter(
      (
        candidate,
      ): candidate is {
        action: string;
        score: number;
        channel?: "email" | "sms" | "call";
        blockedBySafety?: boolean;
        reasonSummary: string;
      } =>
        !!candidate &&
        typeof candidate === "object" &&
        typeof (candidate as Record<string, unknown>).action === "string" &&
        typeof (candidate as Record<string, unknown>).score === "number" &&
        typeof (candidate as Record<string, unknown>).reasonSummary === "string",
    )
    .map((candidate) => ({
      action: candidate.action,
      score: candidate.score,
      ...(candidate.channel ? { channel: candidate.channel } : {}),
      blockedBySafety: candidate.blockedBySafety === true,
      reasonSummary: candidate.reasonSummary,
    }));

  const channelReasonSummaries: LearningCollectionsSummary["nextBestActionScore"]["channelReasonSummaries"] = (row.candidateScores ?? [])
    .filter(
      (
        candidate,
      ): candidate is { channel: "email" | "sms" | "call"; reasonSummary: string } =>
        !!candidate &&
        typeof candidate === "object" &&
        typeof (candidate as Record<string, unknown>).channel === "string" &&
        typeof (candidate as Record<string, unknown>).reasonSummary === "string",
    )
    .map((candidate) => ({
      channel: candidate.channel,
      summary: candidate.reasonSummary,
    }));

  return {
    preferredContactRecommendation: {
      contactName: row.contactName ?? "Stored collections contact",
      ...(row.contactEmail ? { contactMethod: row.contactEmail } : {}),
      reasonSummary:
        row.contactExplanation?.[0]?.summary ??
        "Preferred contact comes from stored account and contact behavior history.",
      sparseFallback: false,
    },
    preferredChannelRecommendation: {
      channel: preferredChannel,
      reasonSummary:
        row.contactExplanation?.[0]?.summary ??
        row.accountExplanation?.[0]?.summary ??
        `Stored behavior currently favors ${preferredChannel}.`,
      sparseFallback: false,
    },
    preferredSendTiming: {
      label: "Configured business-hours send window",
      reasonSummary: "Stored learning exists, but send timing still stays within approved business-hour policy windows.",
      sparseFallback: false,
    },
    documentBundleRecommendation: {
      label: docBundle.label,
      reasonSummary: docBundle.reasonSummary,
      sparseFallback: false,
    },
    ptpReliabilityIndicator: ptpReliability,
    nextBestActionScore: {
      action: row.recommendedAction ?? "hold_for_review",
      ...(row.recommendedChannel ? { channel: row.recommendedChannel } : {}),
      score: typeof row.score === "number" ? row.score : 0.5,
      reasonSummary,
      channelReasonSummaries,
      rankedRecommendations,
      sparseFallback: false,
    },
  };
}

function buildWorkspaceLearningFromPersistedRow(row: PersistedLearningSummaryRow): LearningWorkspaceSummary {
  const collections = buildCollectionsLearningFromPersistedRow(row);
  const events = row.accountEvidenceSummary?.eventCount ?? 0;
  const feedback = row.accountEvidenceSummary?.feedbackCount ?? 0;
  const lookback = row.accountEvidenceSummary?.lookbackWindowDays ?? 90;
  const paymentFragments = [
    typeof row.avgDaysToPay === "number" ? `avg ${row.avgDaysToPay} days to pay` : undefined,
    typeof row.avgDaysLate === "number" ? `avg ${row.avgDaysLate} days late` : undefined,
    typeof row.promiseKeptRate === "number"
      ? `${Math.round(row.promiseKeptRate * 100)}% promise-kept rate`
      : undefined,
    typeof row.resendBeforePayRate === "number"
      ? `${Math.round(row.resendBeforePayRate * 100)}% resend-before-pay rate`
      : undefined,
    typeof row.parentPayerProbability === "number"
      ? `${Math.round(row.parentPayerProbability * 100)}% parent payer probability`
      : undefined,
    row.remittanceQualityLabel ? `${row.remittanceQualityLabel} remittance quality` : undefined,
  ].filter((fragment): fragment is string => Boolean(fragment));

  return {
    accountPaymentBehaviorSummary: {
      summary:
        paymentFragments.length > 0
          ? `Using ${events} stored learning events and ${feedback} operator feedback signals from the last ${lookback} days: ${paymentFragments.join(", ")}.`
          : events > 0 || feedback > 0
            ? `Using ${events} stored learning events and ${feedback} operator feedback signals from the last ${lookback} days.`
          : "Stored learning is available, but account payment behavior remains light and should be read conservatively.",
      sparseFallback: false,
    },
    preferredContactRecommendation: collections.preferredContactRecommendation,
    preferredChannelRecommendation: collections.preferredChannelRecommendation,
    preferredSendTiming: collections.preferredSendTiming,
    documentBundleRecommendation: collections.documentBundleRecommendation,
    ptpReliabilityIndicator: collections.ptpReliabilityIndicator,
    nextBestActionScore: collections.nextBestActionScore,
  };
}

function collectionsLearningToWorkspace(learning: LearningCollectionsSummary): LearningWorkspaceSummary {
  return {
    accountPaymentBehaviorSummary: {
      summary: "Live learning history is still sparse, so the workspace is showing the same safe guidance as the collections queue.",
      sparseFallback: true,
    },
    preferredContactRecommendation: learning.preferredContactRecommendation,
    preferredChannelRecommendation: learning.preferredChannelRecommendation,
    preferredSendTiming: learning.preferredSendTiming,
    documentBundleRecommendation: learning.documentBundleRecommendation,
    ptpReliabilityIndicator: learning.ptpReliabilityIndicator,
    nextBestActionScore: learning.nextBestActionScore,
  };
}

function inferDocumentBundleRecommendation(
  metricsByChannel: Record<string, unknown> | undefined,
): { label: string; reasonSummary: string } {
  const docRequestRate = readHighestMetricRate(metricsByChannel, "docRequestRate");
  if (docRequestRate >= 0.2) {
    return {
      label: "Invoice plus supporting documents",
      reasonSummary: "Stored behavior shows this account often asks for supporting documents before moving forward.",
    };
  }
  return {
    label: "Invoice copy only",
    reasonSummary: "Stored behavior does not show a strong document-heavy pattern for this account.",
  };
}

function inferPtpReliability(
  metricsByChannel: Record<string, unknown> | undefined,
): LearningCollectionsSummary["ptpReliabilityIndicator"] {
  const ptpKeptRate = readHighestMetricRate(metricsByChannel, "ptpKeptRate");
  if (ptpKeptRate >= 0.8) {
    return { level: "high", reasonSummary: "Stored behavior shows promises to pay are usually kept." };
  }
  if (ptpKeptRate >= 0.5) {
    return { level: "medium", reasonSummary: "Stored behavior shows mixed promise-to-pay follow-through." };
  }
  if (ptpKeptRate > 0) {
    return { level: "low", reasonSummary: "Stored behavior shows promises to pay are often missed." };
  }
  return { level: "unknown", reasonSummary: "There is not enough stored promise-to-pay history yet." };
}

function buildOutreachIntelligencePreview(input: {
  generatedAt: string;
  invoiceIndex: OperatorConsoleResponse["invoiceIndex"];
  customerIndex: CustomerIndexItem[];
  collectionsQueue: CollectionsQueueItem[];
  accountWorkspace: OperatorConsoleResponse["accountWorkspace"];
  invoiceDetail: InvoiceDetailData;
  paymentsQueue: PaymentQueueItem[];
}): OperatorConsoleResponse["outreachIntelligence"] {
  const principal: Principal = { id: "web_console", roles: ["ar_manager"] };
  const selectedCustomer =
    input.customerIndex.find(
      (item) => item.billingAccountId === input.accountWorkspace.billingAccountId,
    ) ?? input.customerIndex[0];
  const selectedQueueItem =
    input.collectionsQueue.find(
      (item) =>
        item.accountName === input.accountWorkspace.accountName ||
        item.accountReference === input.accountWorkspace.billingAccountId,
    ) ?? input.collectionsQueue[0];

  const account = {
    id: input.accountWorkspace.billingAccountId,
    createdAt: input.generatedAt,
    updatedAt: input.generatedAt,
    parentAccountId: selectedCustomer?.profileId ?? `parent_${input.accountWorkspace.billingAccountId}`,
    accountNumber:
      selectedQueueItem?.accountReference ?? input.accountWorkspace.billingAccountId,
    displayName: input.accountWorkspace.accountName,
    currency: "PHP",
    accountTier:
      input.accountWorkspace.accountTier.toLowerCase() === "strategic" ? ("strategic" as const) : ("standard" as const),
    status: "active" as const,
    centrallyPaid: input.accountWorkspace.notes.some((note) =>
      note.toLowerCase().includes("centrally paid"),
    ),
    metadata: {
      source: "operator_console",
    },
    ...(selectedCustomer?.branchNames[0]
      ? { branchId: slugifyLabel(selectedCustomer.branchNames[0]) }
      : {}),
  };

  const preferredContactName =
    selectedQueueItem?.contactName ??
    selectedQueueItem?.learning?.preferredContactRecommendation.contactName ??
    "Primary AP Contact";
  const preferredContactEmail =
    selectedCustomer?.primaryContactEmail ??
    selectedQueueItem?.contactEmail ??
    selectedQueueItem?.learning?.preferredContactRecommendation.contactMethod;
  const contact = {
    id: `contact_${account.id}`,
    createdAt: input.generatedAt,
    updatedAt: input.generatedAt,
    parentAccountId: account.parentAccountId,
    billingAccountId: account.id,
    scope: "billing_account" as const,
    scopeId: account.id,
    fullName: preferredContactName,
    role: "ap" as const,
    isPrimary: true,
    isVerified: Boolean(preferredContactEmail),
    allowAutoSend: Boolean(preferredContactEmail),
    recentSuccessfulResponses: 0,
    metadata: {
      source: "operator_console",
    },
    ...(preferredContactEmail && preferredContactEmail.includes("@")
      ? { email: preferredContactEmail }
      : {}),
  };

  const invoices = buildOutreachInvoices({
    generatedAt: input.generatedAt,
    billingAccountId: account.id,
    parentAccountId: account.parentAccountId,
    invoiceIndex: input.invoiceIndex,
    invoiceDetail: input.invoiceDetail,
    ...(account.branchId ? { branchId: account.branchId } : {}),
  });
  const accountMemorySignals = buildOutreachMemorySignals({
    ...(selectedQueueItem?.learning
      ? { collectionsLearning: selectedQueueItem.learning }
      : {}),
    ...(input.accountWorkspace.learning
      ? { workspaceLearning: input.accountWorkspace.learning }
      : {}),
  });
  const linkedPayments = buildOutreachPaymentSignals({
    invoiceDetail: input.invoiceDetail,
    paymentsQueue: input.paymentsQueue,
  });
  const linkedRemittances = buildOutreachRemittanceSignals(input.invoiceDetail);
  const promiseToPay = buildOutreachPromiseToPay({
    promiseStatus: input.accountWorkspace.promiseStatus,
    generatedAt: input.generatedAt,
  });
  const intent = inferOutreachIntent({
    nextAction: input.accountWorkspace.nextBestAction,
    promiseStatus: input.accountWorkspace.promiseStatus,
  });

  try {
    const service = getOutreachIntelligenceService();
    const email = service.generateEmailDraft({
      principal,
      tenantId: "default",
      channel: "email",
      intent,
      account,
      invoices,
      contact,
      operatorIntent: input.accountWorkspace.nextBestAction,
      ...(accountMemorySignals.length ? { accountMemorySignals } : {}),
      ...(linkedPayments.length ? { recentPayments: linkedPayments } : {}),
      ...(linkedRemittances.length ? { remittances: linkedRemittances } : {}),
      ...(promiseToPay ? { promiseToPay } : {}),
    });
    const previewThread = email.bundle.recentCommunications[0];

    const voice = service.generateVoiceAgentPayload({
      principal,
      tenantId: "default",
      channel: "voice_agent",
      intent,
      account,
      invoices,
      contact,
      ...(previewThread ? { currentThread: previewThread } : {}),
      accountMemorySignals: email.bundle.accountMemory.signals,
      recentPayments: email.bundle.paymentState.recentPayments,
      remittances: email.bundle.paymentState.remittances,
    });

    const sms = service.generateSmsDraft({
      principal,
      tenantId: "default",
      channel: "sms",
      intent,
      account,
      invoices,
      contact,
      ...(previewThread ? { currentThread: previewThread } : {}),
      accountMemorySignals: email.bundle.accountMemory.signals,
      recentPayments: email.bundle.paymentState.recentPayments,
      remittances: email.bundle.paymentState.remittances,
    });

    const retellHandoff = service.prepareExecutionHandoff({
      principal,
      tenantId: "default",
      bundleId: voice.bundle.id,
      channel: "voice_agent",
      provider: "retell",
      output: voice.payload,
      policy: voice.policy,
      metadata: {
        mode: "preview_only",
      },
    });

    return {
      contextSummary: {
        accountName: email.bundle.customerAccount.billingAccountName,
        billingAccountId: email.bundle.customerAccount.billingAccountId,
        branchLabels: email.bundle.customerAccount.branchIds,
        invoiceNumbers: email.bundle.receivables.invoices.map((invoice: { invoiceNumber: string }) => invoice.invoiceNumber),
        collectibleAmountLabel: formatCurrency(email.bundle.receivables.collectibleAmountCents),
        ...(email.bundle.receivables.disputedAmountCents > 0
          ? { disputedAmountLabel: formatCurrency(email.bundle.receivables.disputedAmountCents) }
          : {}),
        confidenceLabel: `${email.bundle.confidence.label} (${Math.round(email.bundle.confidence.score * 100)}%)`,
        contextSources: email.bundle.explanation.sourcesUsed,
      },
      warnings: email.policy.warnings.map((warning: string) => ({
        code: warning,
        label: warning.replaceAll("_", " "),
        detail: explainOutreachWarning(warning),
      })),
      emailDraft: {
        subjectSuggestions: email.draft.subjectSuggestions,
        body: email.draft.emailBody,
        toneLabel: email.draft.toneLabel,
        personalizationSummary: email.draft.personalizationSummary,
      },
      voiceAgent: {
        agentBrief: voice.payload.agentBrief,
        conversationGoal: voice.payload.conversationGoal,
        safeTalkingPoints: voice.payload.safeTalkingPoints,
        disallowedStatements: voice.payload.disallowedStatements,
        handoffConditions: voice.payload.handoffConditions,
        toneGuidance: voice.payload.toneGuidance,
        readiness: retellHandoff.handoff.readiness,
      },
      smsDraft: {
        variants: sms.draft.variants,
        toneLabel: sms.draft.toneLabel,
        purposeLabel: sms.draft.messagePurposeLabel,
        personalizationSummary: sms.draft.personalizationSummary,
      },
      previewMode:
        email.policy.outreachAllowed &&
        email.policy.channelRestrictions.autoSendAllowed &&
        !email.policy.approvalRequired
          ? "email_execution_ready"
          : "preview_only",
    };
  } catch (error) {
    console.warn("Outreach intelligence preview fell back to a local-safe preview.", error);
    const totalAmount = invoices.reduce((sum, invoice) => sum + invoice.amountCents, 0);
    const invoiceNumbers = invoices.map((invoice) => invoice.invoiceNumber);
    const body = [
      `Hi ${contact.fullName},`,
      "",
      `We are following up on ${invoiceNumbers.length} overdue invoice${invoiceNumbers.length === 1 ? "" : "s"} on your account with us.`,
      "",
      `The current collectible balance is ${formatCurrency(totalAmount)} across ${invoiceNumbers.join(", ")}.`,
      "",
      "If payment has already been scheduled, please share the remittance reference so our team can review it safely.",
      "",
      "Thank you,",
      "Yield AROS Collections",
    ].join("\n");

    return {
      contextSummary: {
        accountName: account.displayName,
        billingAccountId: account.id,
        branchLabels: account.branchId ? [account.branchId] : [],
        invoiceNumbers,
        collectibleAmountLabel: formatCurrency(totalAmount),
        confidenceLabel: "medium (fallback)",
        contextSources: ["current receivable context", "operator-console fallback"],
      },
      warnings: [],
      emailDraft: {
        subjectSuggestions: [
          `Follow-up on overdue invoices for ${account.displayName}`,
          `Payment status check for ${account.displayName}`,
        ],
        body,
        toneLabel: "conservative",
        personalizationSummary: `Used ${invoiceNumbers.length} invoice facts for ${account.displayName}.`,
      },
      voiceAgent: {
        agentBrief: `Follow up on open receivables for ${account.displayName} without over-claiming payment status.`,
        conversationGoal: "Confirm payment timing or remittance status while preserving billing-account context.",
        safeTalkingPoints: [
          `Follow up on overdue invoices ${invoiceNumbers.join(", ")}.`,
          `Current collectible balance is ${formatCurrency(totalAmount)}.`,
          "Ask for payment timing or a remittance reference.",
        ],
        disallowedStatements: [
          "Do not say payment has not been received with certainty.",
        ],
        handoffConditions: [
          "Escalate if the contact disputes the balance.",
          "Escalate if payment allocation is unclear.",
        ],
        toneGuidance: "Keep the tone calm, concise, and fact-based.",
        readiness: "preview_only",
      },
      smsDraft: {
        variants: [
          `Hi ${contact.fullName}, following up on overdue invoices for ${account.displayName}. Please share payment timing or a remittance reference when convenient.`,
        ],
        toneLabel: "conservative",
        purposeLabel: "payment_follow_up",
        personalizationSummary: `Used ${invoiceNumbers.length} invoice facts for ${account.displayName}.`,
      },
      previewMode: "preview_only",
    };
  }
}

function readHighestMetricRate(
  metricsByChannel: Record<string, unknown> | undefined,
  key: string,
): number {
  if (!metricsByChannel) {
    return 0;
  }
  return Math.max(
    0,
    ...Object.values(metricsByChannel).map((value) => {
      if (!value || typeof value !== "object") {
        return 0;
      }
      const metric = (value as Record<string, unknown>)[key];
      return typeof metric === "number" ? metric : 0;
    }),
  );
}

function buildOutreachInvoices(input: {
  generatedAt: string;
  billingAccountId: string;
  parentAccountId: string;
  branchId?: string;
  invoiceIndex: OperatorConsoleResponse["invoiceIndex"];
  invoiceDetail: InvoiceDetailData;
}): Invoice[] {
  const matchingInvoices = input.invoiceIndex.invoices
    .filter((invoice) => invoice.billingAccountId === input.billingAccountId)
    .slice(0, 3)
    .map(
      (invoice): Invoice => ({
        id: invoice.canonicalInvoiceId ?? invoice.id,
        createdAt: invoice.lastImportedAt ?? input.generatedAt,
        updatedAt: invoice.lastImportedAt ?? input.generatedAt,
        state: mapInvoiceIndexStatusToState(invoice.status, invoice.collectibleAmountCents),
        parentAccountId: invoice.parentAccountId ?? input.parentAccountId,
        billingAccountId: invoice.billingAccountId ?? input.billingAccountId,
        ...(invoice.branchId ? { branchId: invoice.branchId } : {}),
        invoiceNumber: invoice.invoiceNumber,
        currency: invoice.currency,
        amountCents: invoice.totalAmountCents,
        ...(invoice.collectibleAmountCents !== undefined
          ? { collectibleAmountCents: invoice.collectibleAmountCents }
          : {}),
        ...(invoice.dueDate ? { dueDate: invoice.dueDate } : {}),
        metadata: {
          sourceProvider: invoice.sourceProvider,
          sourceStatus: invoice.sourceStatus,
        },
      }),
    );

  if (matchingInvoices.length > 0) {
    return matchingInvoices;
  }

  return [
    {
      id: `invoice_${input.invoiceDetail.invoiceNumber}`,
      createdAt: input.generatedAt,
      updatedAt: input.generatedAt,
      state: mapInvoiceDetailStatusToState(input.invoiceDetail),
      parentAccountId: input.parentAccountId,
      billingAccountId: input.billingAccountId,
      ...(input.branchId ? { branchId: input.branchId } : {}),
      invoiceNumber: input.invoiceDetail.invoiceNumber,
      currency: "PHP",
      amountCents: parseCurrencyAmount(input.invoiceDetail.amount),
      ...(input.invoiceDetail.collectibleAmount
        ? { collectibleAmountCents: parseCurrencyAmount(input.invoiceDetail.collectibleAmount) }
        : {}),
      ...(input.invoiceDetail.disputedAmount
        ? { disputedAmountCents: parseCurrencyAmount(input.invoiceDetail.disputedAmount) }
        : {}),
      ...(normalizeConsoleDate(input.invoiceDetail.dueDate)
        ? { dueDate: normalizeConsoleDate(input.invoiceDetail.dueDate)! }
        : {}),
      metadata: {
        source: "operator_console_invoice_detail",
        disputeState: input.invoiceDetail.disputeState,
      },
    },
  ];
}

function buildOutreachMemorySignals(input: {
  collectionsLearning?: LearningCollectionsSummary;
  workspaceLearning?: LearningWorkspaceSummary;
}) {
  const signals: Array<{
    source: "operator_feedback" | "approved_pattern" | "contact_preference";
    label: string;
    summary: string;
    value?: string;
  }> = [];

  if (input.collectionsLearning?.preferredContactRecommendation) {
    signals.push({
      source: "contact_preference",
      label: "Preferred contact handling",
      summary: input.collectionsLearning.preferredContactRecommendation.reasonSummary,
      ...(input.collectionsLearning.preferredContactRecommendation.contactMethod
        ? {
            value:
              input.collectionsLearning.preferredContactRecommendation.contactMethod,
          }
        : {}),
    });
  }
  if (input.collectionsLearning?.preferredChannelRecommendation) {
    signals.push({
      source: "approved_pattern",
      label: "Preferred channel",
      summary: input.collectionsLearning.preferredChannelRecommendation.reasonSummary,
      value: input.collectionsLearning.preferredChannelRecommendation.channel,
    });
  }
  if (input.workspaceLearning?.accountPaymentBehaviorSummary?.summary) {
    signals.push({
      source: "operator_feedback",
      label: "Account payment behavior",
      summary: input.workspaceLearning.accountPaymentBehaviorSummary.summary,
    });
  }

  return signals.slice(0, 3);
}

function buildOutreachPaymentSignals(input: {
  invoiceDetail: InvoiceDetailData;
  paymentsQueue: PaymentQueueItem[];
}) {
  const linkedPayments = input.invoiceDetail.linkedStatuses
    .filter((item) => item.kind === "payment")
    .map((item) => ({
      id: item.id,
      occurredAt: new Date().toISOString(),
      amountCents: item.amount ? parseCurrencyAmount(item.amount) : 0,
      currency: "PHP",
      status: inferPaymentActivityStatus(item.status, item.detail),
      reference: item.reference,
    }));

  if (linkedPayments.length > 0) {
    return linkedPayments;
  }

  return input.paymentsQueue.slice(0, 2).map((payment, index) => ({
    id: payment.id,
    occurredAt: new Date(Date.now() - index * 24 * 60 * 60 * 1000).toISOString(),
    amountCents: parseCurrencyAmount(payment.amount),
    currency: "PHP",
    status: inferPaymentQueueStatus(payment.state),
    reference: payment.paymentReference,
  }));
}

function buildOutreachRemittanceSignals(invoiceDetail: InvoiceDetailData) {
  return invoiceDetail.linkedStatuses
    .filter((item) => item.kind === "remittance")
    .map((item) => ({
      id: item.id,
      occurredAt: new Date().toISOString(),
      state: inferRemittanceState(item.status, item.detail),
      ...(item.amount ? { amountCents: parseCurrencyAmount(item.amount) } : {}),
      summary: item.detail,
    }));
}

function buildOutreachPromiseToPay(input: {
  promiseStatus: string;
  generatedAt: string;
}) {
  if (!input.promiseStatus.toLowerCase().includes("promise")) {
    return undefined;
  }

  const lower = input.promiseStatus.toLowerCase();
  return {
    id: "operator_console_ptp",
    state: lower.includes("awaiting") || lower.includes("due today") ? ("due_today" as const) : ("accepted" as const),
    promisedDate: input.generatedAt.slice(0, 10),
    summary: input.promiseStatus,
  };
}

function inferOutreachIntent(input: {
  nextAction: string;
  promiseStatus: string;
}): "reminder" | "overdue_follow_up" | "request_remittance" | "ptp_follow_up" | "escalation" {
  const nextAction = input.nextAction.toLowerCase();
  const promiseStatus = input.promiseStatus.toLowerCase();

  if (promiseStatus.includes("promise")) {
    return "ptp_follow_up";
  }
  if (nextAction.includes("remittance")) {
    return "request_remittance";
  }
  if (nextAction.includes("escalat")) {
    return "escalation";
  }
  if (nextAction.includes("overdue") || nextAction.includes("approval")) {
    return "overdue_follow_up";
  }
  return "reminder";
}

function explainOutreachWarning(warning: string): string {
  switch (warning) {
    case "remittance_pending_review":
      return "A recent remittance exists but still needs review, so the copy avoids cash-application certainty.";
    case "branch_context_preserved":
      return "Branch context is kept visible so the operator can sanity-check the routing level.";
    case "billing_account_context_preserved":
      return "The draft remains scoped to the billing account rather than drifting into parent-level assumptions.";
    case "approval_required":
      return "The shared policy layer requires approval before this outreach can move beyond preview.";
    case "low_confidence_personalization":
      return "Personalization evidence is thin, so the shared engine intentionally falls back to safer copy.";
    case "unverified_contact":
      return "The selected contact is not verified for autonomous outreach, so the output remains preview-only.";
    case "cross_entity_ambiguity":
      return "Entity matching is still ambiguous, so the copy avoids certainty about payment ownership or application.";
    default:
      return "The shared policy layer surfaced this caution for operator review.";
  }
}

function mapInvoiceIndexStatusToState(
  status: OperatorConsoleResponse["invoiceIndex"]["invoices"][number]["status"],
  collectibleAmountCents: number | undefined,
) {
  if (status === "disputed") {
    return "disputed_full" as const;
  }
  if (status === "paid") {
    return "paid" as const;
  }
  if (status === "partial") {
    return "partially_paid" as const;
  }
  if (status === "voided") {
    return "voided" as const;
  }
  return collectibleAmountCents !== undefined && collectibleAmountCents === 0
    ? ("partially_paid" as const)
    : ("matched_to_erp" as const);
}

function mapInvoiceDetailStatusToState(invoiceDetail: InvoiceDetailData) {
  const status = `${invoiceDetail.status} ${invoiceDetail.disputeState}`.toLowerCase();
  if (status.includes("dispute")) {
    return "disputed_full" as const;
  }
  return "matched_to_erp" as const;
}

function inferPaymentActivityStatus(status: string, detail: string) {
  const normalized = `${status} ${detail}`.toLowerCase();
  if (normalized.includes("review")) {
    return "review_required" as const;
  }
  if (normalized.includes("appl")) {
    return "applied" as const;
  }
  if (normalized.includes("post")) {
    return "posted" as const;
  }
  return "pending" as const;
}

function inferPaymentQueueStatus(state: string) {
  const normalized = state.toLowerCase();
  if (normalized.includes("review")) {
    return "review_required" as const;
  }
  if (normalized.includes("auto-applied") || normalized.includes("applied")) {
    return "applied" as const;
  }
  return "posted" as const;
}

function inferRemittanceState(status: string, detail: string) {
  const normalized = `${status} ${detail}`.toLowerCase();
  if (normalized.includes("review")) {
    return "review_required" as const;
  }
  if (normalized.includes("linked")) {
    return "linked_to_payment" as const;
  }
  if (normalized.includes("parsed")) {
    return "parsed_structured" as const;
  }
  return "received_unparsed" as const;
}

function normalizeConsoleDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function parseCurrencyAmount(value: string) {
  const numeric = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

function slugifyLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatExceptionBreakdown(items: Array<{ type: string; count: number }>) {
  return items.map((item) => `${item.count} ${item.type.replace(/_/g, " ")}`).join(" • ");
}

function resolveDemoDataEnabled(envValue: boolean, nodeEnv: string) {
  const demoDataOverride = process.env.ENABLE_DEMO_DATA?.trim().toLowerCase();
  if (demoDataOverride !== undefined && ["false", "0", "no", "off"].includes(demoDataOverride)) {
    return false;
  }
  if (demoDataOverride !== undefined && ["true", "1", "yes", "on"].includes(demoDataOverride)) {
    return true;
  }

  return envValue === true || nodeEnv === "test" || process.env.VITEST === "true";
}

function scenarioActions(
  scenarios: Array<{ id: string; availableActions?: OperatorAction[] }>,
  scenarioId: string
) {
  return scenarios.find((scenario) => scenario.id === scenarioId)?.availableActions ?? [];
}

function formatCurrency(valueCents: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(valueCents / 100);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
