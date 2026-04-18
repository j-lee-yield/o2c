import { loadEnv } from "@o2c/config";
import { listDataSourceRuntimeSnapshot } from "../modules/data-sources-runtime.js";
import { mergeInvoiceEntriesWithoutDuplicates } from "../modules/invoice-import-dedupe.js";
import type {
  AccountProfileSummary,
  ControlCenterConsoleData,
  ControlCenterTemplatePreview,
  CustomerIndexItem,
  CustomerProfileTabSummary,
  CustomerProfileWorkspaceData,
  DashboardSummaryCard,
  ExceptionCountSummary,
  HomeAgingBalanceReadModel,
  HomeCollectionsMetricsReadModel,
  HomeSetupChecklistReadModel,
  HomeSnapshotMetricsReadModel,
  HomeTaskSummaryReadModel,
  InvoiceIndexEntry,
  InvoiceAgingAnalytics,
  InvoiceDetailData as ContractInvoiceDetailData,
  LinkedPaymentRemittanceSummary,
  InvoiceIndexProviderSummary,
  InvoiceIndexResponse,
  InvoiceIndexStatus,
  InvoiceIndexStatusSummary,
  LearningCashApplicationSummary,
  LearningCollectionsSummary,
  LearningExceptionSummary,
  LearningWorkspaceSummary,
  NextActionSummaryCard,
  OverdueExposureSummary,
  CollectibleVsDisputedSummary,
} from "@o2c/contracts";
import {
  buildDemoSeedBundle,
  buildLearningLayerDemoScenarios,
  buildPilotReadinessSnapshot,
} from "@o2c/seed";

export interface SourceBadge {
  kind: "live" | "seeded" | "stub";
  label: string;
  detail: string;
}

export interface MetricTile {
  label: string;
  value: string;
  detail: string;
}

export interface ActionSummary {
  id: string;
  title: string;
  summary: string;
  severity: "normal" | "attention" | "critical";
}

export interface CollectionsQueueItem {
  id: string;
  accountName: string;
  accountTier: string;
  overdueAmount: string;
  promiseDue: string;
  nextAction: string;
  rationale: string;
  contactName?: string;
  contactEmail?: string;
  outstandingAmount?: string;
  oldestInvoiceAge?: string;
  averageAge?: string;
  assignee?: string;
  dueLabel?: string;
  learning?: LearningCollectionsSummary;
}

export interface AccountWorkspaceData {
  accountName: string;
  billingAccountId: string;
  parentAccount: string;
  accountTier: string;
  owner: string;
  balanceOpen: string;
  overdueAmount: string;
  promiseStatus: string;
  nextBestAction: string;
  notes: string[];
  collectibleAmount?: string;
  disputedAmount?: string;
  linkedStatus?: string;
  learning?: LearningWorkspaceSummary;
}

export interface InvoiceDetailData extends ContractInvoiceDetailData {}

export interface PaymentQueueItem {
  id: string;
  paymentReference: string;
  accountName: string;
  amount: string;
  state: string;
  recommendation: string;
  source: string;
  actions?: OperatorAction[];
}

export interface CashApplicationMatchItem {
  invoiceId: string;
  invoiceNumber: string;
  invoiceAmountCents: number;
  paymentAmountCents: number;
  differenceCents: number;
  confidence: number;
  rationale: string;
  learning?: LearningCashApplicationSummary;
}

export interface CashApplicationHighlightedPayment {
  paymentId: string;
  paymentReference: string;
  accountName: string;
  amountCents: number;
  receivedOn: string;
  method: string;
  reviewLabel: string;
  severityLabel: string;
  footerTag: string;
  settlementStatus?: string;
  sourceBankTransactionIds?: string[];
  withholdingSummary?: {
    recognizedAmountCents: number;
    evidenceStatus?: string;
  };
  matches: CashApplicationMatchItem[];
}

export interface CashAppBankAccount {
  id: string;
  bankName: string;
  accountMasked: string;
  currency: string;
  routingLevel: "billing_account";
  billingAccountId: string;
  branchCoverage: string[];
  sourceStatus: "verified" | "seeded";
}

export interface CashAppBankTransaction {
  id: string;
  bankAccountId: string;
  paymentId?: string;
  postedAt: string;
  reference: string;
  description: string;
  amountCents: number;
  direction: "credit" | "debit";
  matchStatus: "linked_payment" | "review_required" | "unmatched";
}

export interface CashAppRemittanceItem {
  id: string;
  paymentId?: string;
  source: string;
  payerName?: string;
  receivedAt: string;
  state: string;
  invoiceReferences: string[];
  amountCents?: number;
  summary: string;
}

export interface PaymentResidualAction {
  code:
    | "unapplied_cash"
    | "overpayment_hold"
    | "customer_short_pay"
    | "withholding_under_review"
    | "bank_charge_adjustment"
    | "writeoff";
  label: string;
  detail: string;
  riskLabel: string;
  defaultSelected?: boolean;
}

export interface CashAppOverviewSummary {
  totalBankedTodayCents: number;
  totalAppliedTodayCents: number;
  reviewQueueCount: number;
  remittanceAwaitingLinkCount: number;
  writebackPendingCount: number;
  unappliedCashCents: number;
}

export interface CashAppReviewRow {
  paymentId: string;
  paymentReference: string;
  accountName: string;
  bankReference?: string;
  amountCents: number;
  state: string;
  reviewReason: string;
  receivedOn: string;
  remittanceState: string;
  writebackStatus: string;
  residualAmountCents: number;
  residualType?: string;
  recommendedAction: string;
  matches: CashApplicationMatchItem[];
}

export interface CashAppAllocationLine {
  invoiceId: string;
  invoiceNumber: string;
  branchId?: string;
  invoiceAmountCents: number;
  openAmountCents: number;
  applyAmountCents: number;
  source: "suggested_match" | "invoice_search";
  status: "suggested" | "selected" | "applied_partial";
  rationale: string;
}

export interface CashAppFinalizeFlow {
  status: "ready" | "review_required" | "blocked";
  primaryActionLabel: string;
  helperText: string;
  requiresApproval: boolean;
}

export interface CashAppWritebackStatus {
  state: "not_started" | "staged" | "pending" | "failed" | "completed";
  detail: string;
  erpReference?: string;
}

export interface CashApplicationSession {
  id: string;
  paymentId: string;
  activeTab: "overview" | "payments" | "bank_transactions" | "remittances";
  allocationLines: CashAppAllocationLine[];
  availableInvoiceSearchResults: CashAppAllocationLine[];
  residualAmountCents: number;
  residualAction: PaymentResidualAction;
  residualActionOptions: PaymentResidualAction[];
  withholdingSummary?: {
    recognizedAmountCents: number;
    evidenceStatus?: string;
    autoClosureAllowed: boolean;
  };
  buyerTaxProfile?: {
    buyerTaxProfileId: string;
    profileId: string;
    tenantId: string;
    isTopWithholdingAgent?: boolean;
    withholdingDefaultType: "none" | "goods" | "services" | "mixed" | "special_goods";
    defaultWithholdingRateBps?: number;
    requires2307ForClosure: boolean;
    historicalWithholdingBehaviorScore?: number;
    notes?: string;
    source: "supplier_set" | "learned" | "mixed";
  };
  writebackPreview?: {
    provider: string;
    providerLabel: string;
    target: "applied_cash";
    supportStatus: "supported" | "manual_required" | "blocked";
    outcome:
      | "cash_only_exact"
      | "cash_only_partial"
      | "cash_with_withholding"
      | "cash_with_residual";
    reason?: string;
    manualSteps: string[];
    payload: Record<string, unknown>;
  };
  finalizeFlow: CashAppFinalizeFlow;
  writebackStatus: CashAppWritebackStatus;
}

export interface CashAppContextPanel {
  paymentNotes: string[];
  remittanceNotes: string[];
  policyGuardrails: string[];
  linkedEntities: Array<{
    kind: "invoice" | "payment_application" | "remittance";
    label: string;
    detail: string;
  }>;
  withholdingNotes?: string[];
}

export interface CashApplicationQueueData {
  summary: {
    autoAppliedToday: number;
    needsReview: number;
    unmatched: number;
    partialApplied: number;
    totalUnappliedCashCents: number;
  };
  overviewSummary: CashAppOverviewSummary;
  bankAccount?: CashAppBankAccount;
  reviewRows: CashAppReviewRow[];
  bankTransactions: CashAppBankTransaction[];
  remittances: CashAppRemittanceItem[];
  activeSession?: CashApplicationSession;
  contextPanel?: CashAppContextPanel;
  highlightedPayment?: CashApplicationHighlightedPayment;
}

export type LoanDpdBucket =
  | "current"
  | "days_1_30"
  | "days_31_60"
  | "days_61_90"
  | "days_91_120"
  | "days_120_plus";

export interface LoanDashboardData {
  title: string;
  totalCommittedLimitCents: number;
  totalOutstandingCents: number;
  totalAvailableCents: number;
  dueThisWeekCents: number;
  overdueCents: number;
  facilityCount: number;
  facilitiesInArrearsCount: number;
  alertCount: number;
  taskCount: number;
  actionPath: string;
}

export interface CreditFacilityData {
  id: string;
  facilityName: string;
  lenderName: string;
  borrowerLegalName: string;
  currency: string;
  committedLimit: string;
  outstandingBalance: string;
  availableToDraw: string;
  nextDueDate: string;
  daysPastDue: number;
  daysPastDueBucket: LoanDpdBucket;
  utilizationPercent: number;
  status: "active" | "watchlist" | "suspended" | "closed";
  actionPath: string;
}

export interface LoanStatementPaymentApplicationData {
  id: string;
  paidAt: string;
  paymentReference: string;
  amountApplied: string;
  appliedPrincipal: string;
  appliedInterest: string;
  appliedDst: string;
  appliedPenalty: string;
  resultingRunningBalance: string;
}

export interface LoanStatementData {
  facilityId: string;
  facilityName: string;
  lenderName: string;
  statementReference: string;
  statementDate: string;
  periodLabel: string;
  source: string;
  openingBalance: string;
  closingBalance: string;
  principalDue: string;
  interestDue: string;
  dstDue: string;
  penaltyDue: string;
  totalDue: string;
  daysPastDue: number;
  daysPastDueBucket: LoanDpdBucket;
  runningBalanceNote: string;
  paymentApplications: LoanStatementPaymentApplicationData[];
}

export interface LoanRepaymentData {
  id: string;
  paidAt: string;
  paymentReference: string;
  amount: string;
  appliedPrincipal: string;
  appliedInterest: string;
  appliedDst: string;
  appliedPenalty: string;
  resultingBalance: string;
  status: "scheduled" | "posted" | "returned" | "reversed";
}

export interface LoanAlertData {
  id: string;
  facilityId: string;
  facilityName: string;
  severity: "info" | "warning" | "critical";
  title: string;
  summary: string;
  dueAt: string;
  actionPath: string;
}

export interface LoanTaskData {
  id: string;
  facilityId: string;
  facilityName: string;
  title: string;
  owner: string;
  queue: "operations" | "finance" | "treasury" | "legal";
  dueAt: string;
  state: "open" | "in_progress" | "blocked" | "completed";
  actionPath: string;
}

export interface TaskQueueItem {
  id: string;
  taskCode: string;
  title: string;
  relatedRecord?: string;
  amountLabel: string;
  type: "collection" | "cash_app" | "deduction" | "integration" | "credit_line";
  customerName: string;
  status: "open" | "in_progress" | "pending_approval";
  priority: "high" | "medium" | "low";
  assigneeName: string;
  assigneeInitials: string;
  createdLabel: string;
  dueDateLabel: string;
  actionPath: string;
}

export interface ExceptionQueueItem {
  id: string;
  type: string;
  accountName: string;
  amount: string;
  summary: string;
  nextAction: string;
  actions?: OperatorAction[];
  learning?: LearningExceptionSummary;
}

export interface ApprovalQueueItem {
  id: string;
  requestType: string;
  status: string;
  assigneeRole: string;
  summary: string;
  nextAction: string;
  actions?: OperatorAction[];
}

export interface OperatorAction {
  label: string;
  path: string;
}

export interface FeedItem {
  id: string;
  at: string;
  actor: string;
  summary: string;
  outcome: string;
}

export interface IntegrationItem {
  id: string;
  name: string;
  status: "healthy" | "warning" | "error";
  detail: string;
  nextAction: string;
}

export interface EmailSendingIdentityItem {
  id: string;
  provider: string;
  senderEmail: string;
  displayName?: string;
  authMode: string;
  connectionStatus: string;
  permissionStatus: string;
  healthState: string;
  scopes: string[];
  isDefault: boolean;
  sendAsEmail?: string;
  sendOnBehalfOfEmail?: string;
  lastSyncAt?: string;
  lastSendCheckAt?: string;
}

export interface EmailInboxMessageItem {
  providerMessageId: string;
  providerThreadId?: string;
  subjectLine?: string;
  fromEmail?: string;
  fromName?: string;
  toEmail?: string;
  snippet?: string;
  receivedAt?: string;
  labelIds: string[];
  unread: boolean;
  direction: "inbound" | "outbound";
}

export interface EmailInboxThreadItem {
  senderIdentityId: string;
  providerThreadId: string;
  subjectLine?: string;
  snippet?: string;
  participants: string[];
  latestMessageAt?: string;
  unreadCount: number;
  messages: EmailInboxMessageItem[];
}

export interface EmailInboxData {
  selectedSenderIdentityId?: string;
  resultSizeEstimate: number;
  messages: EmailInboxMessageItem[];
  selectedThread?: EmailInboxThreadItem;
  error?: string;
}

export interface DataSourceIntegrationItem {
  id: string;
  name: string;
  category: string;
  status: "connected" | "pending";
  syncFrequency: string;
  detail: string;
  createdAt: string;
}

export interface DataSourceUploadItem {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  uploadedAt: string;
  sourceLabel: string;
  status: "processing" | "review";
  detail: string;
  importedInvoiceCount?: number;
  duplicateInvoiceCount?: number;
  heldRowCount?: number;
  reviewNotes?: string[];
}

export interface AutomationRuleItem {
  id: string;
  name: string;
  scope: string;
  behavior: string;
  auditTrail: string;
}

export interface ScreenInventoryItem {
  screen: string;
  source: string;
  status: string;
}

export interface ScreenState {
  kind: "loading" | "empty" | "error";
  title: string;
  message: string;
}

export interface OdooConnectSelectionState {
  kind: "select_database";
  state: string;
  baseUrl: string;
  username: string;
  databases: string[];
}

export interface OdooConnectErrorState {
  kind: "error";
  message: string;
}

export interface EmailConnectErrorState {
  kind: "error";
  message: string;
}

export interface EmailConnectStatusState {
  kind: "success";
  provider: "gmail";
  senderEmail: string;
}

export interface QuickBooksConnectViewState {
  kind: "not_connected" | "connected";
  accessMode: "read_write";
  scopes: string[];
  readableObjects: string[];
  writableObjects: string[];
  companyName?: string;
  environment?: "production" | "sandbox";
  connectionHealth?: "connected" | "refresh_expiring" | "reconnect_required";
  reconnectReason?: string;
  needsReconnect?: boolean;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  callbackStatus?: "connected" | "error";
  callbackMessage?: string;
}

export interface SapBusinessOneConnectViewState {
  kind: "not_connected" | "connected";
  accessMode: "read_write";
  authStrategy: "basic_auth";
  readableObjects: string[];
  writableObjects: string[];
  companyName?: string;
  companyDatabase?: string;
  callbackStatus?: "connected" | "error";
  callbackMessage?: string;
  testStatus?: "success" | "error";
  testMessage?: string;
  latestSyncRun?: {
    status: "running" | "succeeded" | "failed";
    invoicesSyncedCount: number;
    customersSyncedCount: number;
    paymentsSyncedCount: number;
    startedAt: string;
    completedAt?: string;
    errorMessage?: string;
  };
  recentSyncRuns?: Array<{
    runId: string;
    status: "running" | "succeeded" | "failed";
    syncScope: string[];
    invoicesSyncedCount: number;
    customersSyncedCount: number;
    paymentsSyncedCount: number;
    startedAt: string;
    completedAt?: string;
    errorMessage?: string;
  }>;
  scheduler?: {
    enabled: boolean;
    intervalMinutes: number;
    running: boolean;
    nextRunAt?: string;
    lastAttemptedAt?: string;
  };
}

export interface InboxReplyStatusState {
  kind: "sent" | "approval_needed";
  message: string;
}

export interface InboxReplyErrorState {
  kind: "error";
  message: string;
}

export interface CollectionsComposeStatusState {
  kind: "sent" | "approval_needed";
  message: string;
}

export interface CollectionsComposeErrorState {
  kind: "error";
  message: string;
}

export interface OutreachConsoleWarning {
  code: string;
  label: string;
  detail: string;
}

export interface OutreachConsoleData {
  contextSummary: {
    accountName: string;
    billingAccountId: string;
    branchLabels: string[];
    invoiceNumbers: string[];
    collectibleAmountLabel: string;
    disputedAmountLabel?: string;
    confidenceLabel: string;
    contextSources: string[];
  };
  warnings: OutreachConsoleWarning[];
  emailDraft: {
    subjectSuggestions: string[];
    body: string;
    toneLabel: string;
    personalizationSummary: string;
  };
  voiceAgent: {
    agentBrief: string;
    conversationGoal: string;
    safeTalkingPoints: string[];
    disallowedStatements: string[];
    handoffConditions: string[];
    toneGuidance: string;
    readiness: "preview_only" | "handoff_ready";
  };
  smsDraft: {
    variants: string[];
    toneLabel: string;
    purposeLabel: string;
    personalizationSummary: string;
  };
  previewMode: "preview_only" | "email_execution_ready";
}

export interface OperatorConsoleData {
  generatedAt: string;
  commandCenterSource: SourceBadge;
  approvalsSource: SourceBadge;
  approvalsFallbackActive: boolean;
  invoiceIndex: InvoiceIndexResponse;
  metrics: MetricTile[];
  actionSummaries: ActionSummary[];
  dashboardSummaryCards: DashboardSummaryCard[];
  homeSetupChecklist: HomeSetupChecklistReadModel;
  homeTaskSummary: HomeTaskSummaryReadModel;
  homeCollectionsMetrics: HomeCollectionsMetricsReadModel;
  homeSnapshotMetrics: HomeSnapshotMetricsReadModel;
  homeAgingBalance: HomeAgingBalanceReadModel;
  outreachIntelligence: OutreachConsoleData;
  controlCenter: ControlCenterConsoleData;
  controlCenterTemplatePreview?: ControlCenterTemplatePreview;
  invoiceAgingAnalytics: InvoiceAgingAnalytics;
  overdueExposure: OverdueExposureSummary;
  collectibleVsDisputed: CollectibleVsDisputedSummary;
  linkedPaymentRemittanceStatus: LinkedPaymentRemittanceSummary;
  exceptionCounts: ExceptionCountSummary;
  customerIndex: CustomerIndexItem[];
  customerProfile: CustomerProfileWorkspaceData;
  accountProfileSummaries: AccountProfileSummary[];
  nextActionSummaryCards: NextActionSummaryCard[];
  collectionsQueue: CollectionsQueueItem[];
  accountWorkspace: AccountWorkspaceData;
  invoiceDetail: InvoiceDetailData;
  paymentsQueue: PaymentQueueItem[];
  cashApplicationQueue: CashApplicationQueueData;
  loanDashboard: LoanDashboardData;
  creditFacilities: CreditFacilityData[];
  loanStatementDetail: LoanStatementData;
  loanRepaymentHistory: LoanRepaymentData[];
  loanAlerts: LoanAlertData[];
  loanTasks: LoanTaskData[];
  taskQueue: TaskQueueItem[];
  exceptionsQueue: ExceptionQueueItem[];
  approvalsQueue: ApprovalQueueItem[];
  aiFeed: FeedItem[];
  integrations: IntegrationItem[];
  emailSendingIdentities: EmailSendingIdentityItem[];
  emailInbox: EmailInboxData;
  dataSourceIntegrations: DataSourceIntegrationItem[];
  dataSourceUploads: DataSourceUploadItem[];
  automationRules: AutomationRuleItem[];
  exceptionBreakdown: Array<{ type: string; count: number }>;
  screenInventory: ScreenInventoryItem[];
  screenStates: {
    collectionsEmpty: ScreenState;
    approvalsEmpty: ScreenState;
    aiLoading: ScreenState;
    integrationError: ScreenState;
  };
  odooConnect?: OdooConnectSelectionState;
  odooConnectError?: OdooConnectErrorState;
  emailConnectError?: EmailConnectErrorState;
  emailConnectStatus?: EmailConnectStatusState;
  inboxReplyStatus?: InboxReplyStatusState;
  inboxReplyError?: InboxReplyErrorState;
  collectionsComposeStatus?: CollectionsComposeStatusState;
  collectionsComposeError?: CollectionsComposeErrorState;
}

interface ApprovalQueueApiResponse {
  items: Array<Record<string, unknown>>;
}

interface EmailSendingIdentityApiResponse {
  identities: Array<Record<string, unknown>>;
}

interface EmailInboxApiResponse {
  senderIdentity?: Record<string, unknown>;
  resultSizeEstimate?: unknown;
  messages?: Array<Record<string, unknown>>;
}

interface EmailInboxThreadApiResponse {
  thread?: Record<string, unknown>;
}

interface PilotReadinessSnapshotLike {
  generatedAt: string;
  metrics: {
    autoAppliedCashCents: number;
    unappliedCashCents: number;
    autoAppliedPayments: number;
  };
  scenarios: Array<{
    id: string;
    title: string;
    route: string;
    paymentAmountCents: number;
    appliedAmountCents: number;
    approvalStatus?: string;
    exceptionKind?: string;
    availableActions?: OperatorAction[];
  }>;
  runtimeEvents?: Array<{
    id: string;
    at: string;
    actor: string;
    summary: string;
    outcome: string;
  }>;
}

export async function loadOperatorConsoleData(options?: {
  odooConnectState?: string | undefined;
  odooConnectError?: string | undefined;
  emailConnectError?: string | undefined;
  emailConnected?: string | undefined;
  emailSender?: string | undefined;
  page?: string | undefined;
  inboxSenderIdentityId?: string | undefined;
  inboxThreadId?: string | undefined;
  inboxReplyStatus?: string | undefined;
  inboxReplyError?: string | undefined;
  collectionsComposeStatus?: string | undefined;
  collectionsComposeError?: string | undefined;
  controlCenterSelectedTemplateId?: string | undefined;
}): Promise<OperatorConsoleData> {
  const apiConsoleData = await loadOperatorConsoleFromApi(options);
  const odooConnect = await loadOdooConnectSelection(options?.odooConnectState);
  const odooConnectError =
    options?.odooConnectError && options.odooConnectError.trim().length > 0
      ? {
          kind: "error" as const,
          message: options.odooConnectError.trim(),
        }
      : undefined;
  const emailConnectError =
    options?.emailConnectError && options.emailConnectError.trim().length > 0
      ? {
          kind: "error" as const,
          message: options.emailConnectError.trim(),
        }
      : undefined;
  const emailConnectStatus =
    options?.emailConnected === "gmail" && options.emailSender?.trim()
      ? {
          kind: "success" as const,
          provider: "gmail" as const,
          senderEmail: options.emailSender.trim(),
        }
      : undefined;
  const inboxReplyStatus =
    options?.inboxReplyStatus === "sent"
      ? {
          kind: "sent" as const,
          message: "Reply sent successfully.",
        }
      : options?.inboxReplyStatus === "approval_needed"
        ? {
            kind: "approval_needed" as const,
            message: "Reply is queued for approval before it can be sent.",
          }
        : undefined;
  const inboxReplyError =
    options?.inboxReplyError && options.inboxReplyError.trim().length > 0
      ? {
          kind: "error" as const,
          message: options.inboxReplyError.trim(),
        }
      : undefined;
  const collectionsComposeStatus =
    options?.collectionsComposeStatus === "sent"
      ? {
          kind: "sent" as const,
          message: "Collections email sent successfully.",
        }
      : options?.collectionsComposeStatus === "approval_needed"
        ? {
            kind: "approval_needed" as const,
            message: "Collections email is queued for approval before it can be sent.",
          }
        : undefined;
  const collectionsComposeError =
    options?.collectionsComposeError && options.collectionsComposeError.trim().length > 0
      ? {
          kind: "error" as const,
          message: options.collectionsComposeError.trim(),
        }
      : undefined;
  if (apiConsoleData) {
    return {
      ...apiConsoleData,
      ...(odooConnect ? { odooConnect } : {}),
      ...(odooConnectError ? { odooConnectError } : {}),
      ...(emailConnectError ? { emailConnectError } : {}),
      ...(emailConnectStatus ? { emailConnectStatus } : {}),
      ...(inboxReplyStatus ? { inboxReplyStatus } : {}),
      ...(inboxReplyError ? { inboxReplyError } : {}),
      ...(collectionsComposeStatus ? { collectionsComposeStatus } : {}),
      ...(collectionsComposeError ? { collectionsComposeError } : {}),
      ...(apiConsoleData.controlCenterTemplatePreview
        ? { controlCenterTemplatePreview: apiConsoleData.controlCenterTemplatePreview }
        : {}),
    };
  }

  const pilotReadiness = await loadPilotReadinessSnapshot();
  const snapshot = pilotReadiness.snapshot;
  const demo = buildDemoSeedBundle();
  const learningScenarios = Object.fromEntries(
    buildLearningLayerDemoScenarios().map((scenario) => [scenario.billingAccountId, scenario]),
  );
  const approvals = await loadApprovalQueue();
  const invoiceIndex = await loadInvoiceIndex();
  const emailSendingIdentities = await loadEmailSendingIdentities();
  const emailInbox = shouldLoadCollectionsInbox(options?.page)
    ? await loadEmailInbox({
        identities: emailSendingIdentities,
        ...(options?.inboxSenderIdentityId
          ? { selectedSenderIdentityId: options.inboxSenderIdentityId }
          : {}),
        ...(options?.inboxThreadId ? { selectedThreadId: options.inboxThreadId } : {}),
      })
    : buildEmptyEmailInbox({
        identities: emailSendingIdentities,
        ...(options?.inboxSenderIdentityId
          ? { selectedSenderIdentityId: options.inboxSenderIdentityId }
          : {}),
      });

  const collectionsQueue: CollectionsQueueItem[] = [
    {
      id: "queue-makati",
      accountName: "Metro Retail Group - Makati",
      accountTier: "Standard",
      overdueAmount: formatCurrency(1500000),
      promiseDue: "Today, 3:00 PM",
      nextAction: "Confirm receipt and close promise if remittance arrives.",
      rationale: "Invoice matched cleanly and the branch context is already preserved.",
      ...(learningScenarios["billing_seed_1"]?.collections
        ? { learning: learningScenarios["billing_seed_1"].collections }
        : {}),
    },
    {
      id: "queue-strategic",
      accountName: "Metro Retail Group - Strategic Procurement",
      accountTier: "Strategic",
      overdueAmount: formatCurrency(2450000),
      promiseDue: "Today, 5:30 PM",
      nextAction: "Hold outreach until controller approves the strategic cash application.",
      rationale: "Central payer behavior is active, but routing still stays on the billing account.",
      ...(learningScenarios["billing_seed_1"]?.collections
        ? { learning: learningScenarios["billing_seed_1"].collections }
        : {}),
    },
    {
      id: "queue-northpoint",
      accountName: "Northpoint Wholesale - Manila",
      accountTier: "Standard",
      overdueAmount: formatCurrency(875000),
      promiseDue: "No promise logged",
      nextAction: "Call treasury contact to identify the payer before any application attempt.",
      rationale: "Unknown payer remains unapplied by policy.",
      ...(learningScenarios["billing_sparse_demo"]?.collections
        ? { learning: learningScenarios["billing_sparse_demo"].collections }
        : {}),
    },
  ];

  const exceptionBreakdown = tallyExceptions(snapshot.scenarios);
  const demoApprovals = buildSeededApprovals(snapshot.scenarios);

  const approvalsQueue =
    approvals.items.length > 0
      ? approvals.items
      : demoApprovals;
  const approvalsFallbackActive = approvals.source.kind === "live" && approvals.items.length === 0;

  const approvalsPending = approvals.items.length > 0 ? approvals.items.length : demoApprovals.length;
  const dataSourcesRuntime = listDataSourceRuntimeSnapshot();
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

  const accountWorkspace: AccountWorkspaceData = {
    accountName: "Metro Retail Group - Strategic Procurement",
    billingAccountId: "bill-strat-1",
    parentAccount: demo.parentAccounts[0]?.name ?? "Metro Retail Group",
    accountTier: "Strategic",
    owner: "AR Manager - Luzon",
    balanceOpen: formatCurrency(2450000),
    overdueAmount: formatCurrency(2450000),
    promiseStatus: "Promise due today, awaiting proof of payment",
    nextBestAction: "Review approval packet, then release the controller-only application path.",
    collectibleAmount: formatCurrency(0),
    disputedAmount: formatCurrency(2450000),
    linkedStatus: "Remittance evidence is present, but invoice automation stays blocked until the dispute is resolved.",
    notes: [
      "Centrally paid behavior is active, but visibility stays attached to the billing account.",
      "Invoice remains branch-tagged as branch-hq for downstream reconciliation.",
      "No auto-chase task was created because the invoice is under tighter strategic controls.",
    ],
    ...(learningScenarios["billing_seed_1"]?.workspace
      ? { learning: learningScenarios["billing_seed_1"].workspace }
      : {}),
  };

  const invoiceDetail: InvoiceDetailData = {
    invoiceNumber: demo.invoices[1]?.invoiceNumber ?? "SI-1002",
    billingAccountId: demo.invoices[1]?.billingAccountId ?? "bill-2",
    branchId: demo.invoices[1]?.branchId ?? "branch-hq",
    status: "Disputed full",
    amount: formatCurrency(demo.invoices[1]?.amountCents ?? 2450000),
    dueDate: "2026-03-26",
    disputeState: "Dispute hold in effect",
    nextAction: "Wait for dispute resolution or controller decision before any collector follow-up.",
    explanation: "The UI preserves branch routing on the invoice and blocks auto-chase while the dispute is open.",
    collectibleAmount: formatCurrency(0),
    disputedAmount: formatCurrency(demo.invoices[1]?.amountCents ?? 2450000),
    linkedStatuses: [
      {
        id: "linked-payment-1",
        kind: "payment",
        reference: "RCPT-9001",
        status: "Awaiting approval",
        amount: formatCurrency(2450000),
        detail: "Linked payment is held behind the strategic approval gate.",
      },
      {
        id: "linked-remittance-1",
        kind: "remittance",
        reference: "RMT-STRAT-001",
        status: "Awaiting dispute resolution",
        detail: "Remittance proof is visible, but collections remain blocked while the invoice is disputed.",
      },
    ],
  };

  const paymentsQueue: PaymentQueueItem[] = [
    {
      id: "payment-1",
      paymentReference: "RCPT-7788",
      accountName: "Metro Retail Group - Makati",
      amount: formatCurrency(1500000),
      state: "Auto-applied",
      recommendation: "Posted with no-regret confidence and full invoice match.",
      source: "Seeded workflow path",
      actions: scenarioActions(snapshot.scenarios, "distributor-exact-auto-apply"),
    },
    {
      id: "payment-2",
      paymentReference: "RCPT-9001",
      accountName: "Metro Retail Group - Strategic Procurement",
      amount: formatCurrency(2450000),
      state: "Awaiting approval",
      recommendation: "Requires controller signoff because the billing account is strategic.",
      source: approvals.source.label,
      actions: scenarioActions(snapshot.scenarios, "manufacturer-centralized-payer-approval"),
    },
    {
      id: "payment-3",
      paymentReference: "UNKNOWN-875",
      accountName: "Northpoint Wholesale - Manila",
      amount: formatCurrency(875000),
      state: "Unapplied cash",
      recommendation: "Resolve payer identity before any money movement.",
      source: "Seeded workflow path",
      actions: scenarioActions(snapshot.scenarios, "importer-proof-upload-unmatched-cash"),
    },
  ];

  const cashApplicationQueue: CashApplicationQueueData = {
    summary: {
      autoAppliedToday: 1,
      needsReview: 1,
      unmatched: 1,
      partialApplied: 1,
      totalUnappliedCashCents: 43500000,
    },
    overviewSummary: {
      totalBankedTodayCents: 90500000,
      totalAppliedTodayCents: 45600000,
      reviewQueueCount: 1,
      remittanceAwaitingLinkCount: 2,
      writebackPendingCount: 1,
      unappliedCashCents: 43500000,
    },
    bankAccount: {
      id: "bank-bill-puregold",
      bankName: "BDO Unibank",
      accountMasked: "****-1045",
      currency: "PHP",
      routingLevel: "billing_account",
      billingAccountId: "bill-puregold",
      branchCoverage: ["branch-pasig"],
      sourceStatus: "seeded",
    },
    reviewRows: [
      {
        paymentId: "cash_payment_1",
        paymentReference: "PAY-2024-0235",
        accountName: "Puregold Price Club Inc.",
        bankReference: "PAY-2024-0235",
        amountCents: 32000000,
        state: "needs review",
        reviewReason: "Remittance advice is still incomplete, so the operator must confirm the allocation.",
        receivedOn: "3/28/2026",
        remittanceState: "Awaiting remittance verification",
        writebackStatus: "Writeback is blocked until review, residual treatment, and remittance checks are complete.",
        residualAmountCents: 0,
        recommendedAction: "Confirm allocation, choose residual treatment, then stage writeback.",
        matches: [
          {
            invoiceId: "invoice-0945",
            invoiceNumber: "INV-2024-0945",
            invoiceAmountCents: 32000000,
            paymentAmountCents: 32000000,
            differenceCents: 0,
            confidence: 0.82,
            rationale: "Exact invoice amount match and linked payer evidence were found.",
            ...(learningScenarios["billing_seed_1"]?.cashApplication
              ? { learning: learningScenarios["billing_seed_1"].cashApplication }
              : {}),
          },
          {
            invoiceId: "invoice-0946",
            invoiceNumber: "INV-2024-0946",
            invoiceAmountCents: 31500000,
            paymentAmountCents: 32000000,
            differenceCents: 500000,
            confidence: 0.65,
            rationale: "Invoice number is plausible but the variance keeps this on manual review.",
            ...(learningScenarios["billing_sparse_demo"]?.cashApplication
              ? { learning: learningScenarios["billing_sparse_demo"].cashApplication }
              : {}),
          },
        ],
      },
      {
        paymentId: "cash_payment_3",
        paymentReference: "UNKNOWN-875",
        accountName: "Northpoint Wholesale - Manila",
        amountCents: 875000,
        state: "unmatched",
        reviewReason: "Payer identification is still insufficient for a safe application.",
        receivedOn: "3/28/2026",
        remittanceState: "No remittance linked",
        writebackStatus: "Writeback is blocked until payer identity and evidence are confirmed.",
        residualAmountCents: 875000,
        recommendedAction: "Collect remittance or bank proof before any money movement.",
        matches: [],
      },
      {
        paymentId: "cash_payment_4",
        paymentReference: "PAY-2024-0237",
        accountName: "Robinsons Supermarket Corp.",
        amountCents: 45000000,
        state: "partial applied",
        reviewReason: "Residual cash remains after application and needs an explicit operator action.",
        receivedOn: "3/28/2026",
        remittanceState: "Linked or reviewable evidence on file",
        writebackStatus: "Ready to stage ERP writeback once the allocation pack is finalized.",
        residualAmountCents: 7500000,
        recommendedAction: "Resolve the residual before staging or retrying ERP writeback.",
        matches: [],
      },
    ],
    bankTransactions: [
      {
        id: "bank-txn-1",
        bankAccountId: "bank-bill-puregold",
        paymentId: "cash_payment_1",
        postedAt: "2026-03-28T00:00:00.000Z",
        reference: "PAY-2024-0235",
        description: "Bank transfer credit for Puregold Price Club Inc.",
        amountCents: 32000000,
        direction: "credit",
        matchStatus: "review_required",
      },
      {
        id: "bank-txn-2",
        bankAccountId: "bank-bill-puregold",
        postedAt: "2026-03-28T00:01:00.000Z",
        reference: "PAY-2024-0235-FEE",
        description: "Bank fee placeholder visible until residual treatment is finalized.",
        amountCents: 2500,
        direction: "debit",
        matchStatus: "unmatched",
      },
    ],
    remittances: [
      {
        id: "remittance-1",
        paymentId: "cash_payment_1",
        source: "email",
        payerName: "Puregold Price Club Inc.",
        receivedAt: "2026-03-28T02:15:00.000Z",
        state: "review_required",
        invoiceReferences: ["INV-2024-0945", "INV-2024-0946"],
        amountCents: 32000000,
        summary: "Payment landed before advice was verified, so the remittance stays in review.",
      },
      {
        id: "remittance-2",
        source: "uploaded_proof",
        receivedAt: "2026-03-28T02:20:00.000Z",
        state: "parsed_structured",
        invoiceReferences: ["INV-2024-0945"],
        summary: "Uploaded proof remains visible but does not override payment or remittance state rules.",
      },
    ],
    activeSession: {
      id: "session-cash-payment-1",
      paymentId: "cash_payment_1",
      activeTab: "overview",
      allocationLines: [
        {
          invoiceId: "invoice-0945",
          invoiceNumber: "INV-2024-0945",
          branchId: "branch-pasig",
          invoiceAmountCents: 32000000,
          openAmountCents: 32000000,
          applyAmountCents: 32000000,
          source: "suggested_match",
          status: "selected",
          rationale: "Exact invoice amount match and linked payer evidence were found.",
        },
      ],
      availableInvoiceSearchResults: [
        {
          invoiceId: "invoice-0945",
          invoiceNumber: "INV-2024-0945",
          branchId: "branch-pasig",
          invoiceAmountCents: 32000000,
          openAmountCents: 32000000,
          applyAmountCents: 32000000,
          source: "invoice_search",
          status: "selected",
          rationale: "Centralized payer history helps explain why this invoice is the safest match.",
        },
        {
          invoiceId: "invoice-0946",
          invoiceNumber: "INV-2024-0946",
          branchId: "branch-pasig",
          invoiceAmountCents: 31500000,
          openAmountCents: 31500000,
          applyAmountCents: 31500000,
          source: "invoice_search",
          status: "suggested",
          rationale: "Possible alternate invoice, but the variance keeps it in manual review.",
        },
      ],
      residualAmountCents: 0,
      residualAction: {
        code: "unapplied_cash",
        label: "Leave as unapplied cash",
        detail: "Safe default while the remaining funds stay parked and visible to operators.",
        riskLabel: "Lowest risk",
        defaultSelected: true,
      },
      residualActionOptions: [
        {
          code: "unapplied_cash",
          label: "Leave as unapplied cash",
          detail: "Safe default while the remaining funds stay parked and visible to operators.",
          riskLabel: "Lowest risk",
          defaultSelected: true,
        },
        {
          code: "overpayment_hold",
          label: "Hold as overpayment",
          detail: "Keep confirmed excess cash available for sibling invoices or later direction.",
          riskLabel: "Conservative",
        },
        {
          code: "customer_short_pay",
          label: "Mark as customer short pay",
          detail: "Use when the buyer paid less than expected and no withholding evidence closes the gap.",
          riskLabel: "Needs triage",
        },
        {
          code: "withholding_under_review",
          label: "Hold as withholding under review",
          detail: "Preserve the shortfall as a possible tax withholding until evidence is confirmed.",
          riskLabel: "Needs tax review",
        },
        {
          code: "bank_charge_adjustment",
          label: "Treat as bank fee",
          detail: "Only valid when policy and evidence support a small bank-charge variance.",
          riskLabel: "Controlled override",
        },
        {
          code: "writeoff",
          label: "Propose write-off",
          detail: "Use only for approved residual cleanup after the business decision is explicit.",
          riskLabel: "Approval required",
        },
      ],
      finalizeFlow: {
        status: "review_required",
        primaryActionLabel: "Finalize allocation and stage writeback",
        helperText: "Finalization only stages writeback after operator-reviewed allocations, preserving payment_application and remittance safety rules.",
        requiresApproval: false,
      },
      writebackStatus: {
        state: "not_started",
        detail: "Writeback is blocked until review, residual treatment, and remittance checks are complete.",
      },
    },
    contextPanel: {
      paymentNotes: [
        "Puregold is routed at the billing-account level by default.",
        "Branch identity is preserved on every selected invoice before any payment_application is staged.",
        "No silent ERP divergence is allowed if the operator rejects the suggested allocation.",
      ],
      remittanceNotes: [
        "Conflicting or missing remittance evidence keeps the payment in review.",
        "Parsed proof is visible to the operator but does not silently alter ERP truth.",
      ],
      policyGuardrails: [
        "No auto-apply under cross-entity ambiguity or remittance conflict.",
        "Disputed invoices must stay out of automatic chase and unsafe application flows.",
        "Failed or unavailable writeback paths must remain visible before finalize is allowed.",
      ],
      linkedEntities: [
        {
          kind: "invoice",
          label: "INV-2024-0945",
          detail: "₱320,000.00 open • branch-pasig",
        },
        {
          kind: "invoice",
          label: "INV-2024-0946",
          detail: "₱315,000.00 open • branch-pasig",
        },
        {
          kind: "remittance",
          label: "remittance-1",
          detail: "Awaiting remittance verification",
        },
      ],
    },
    highlightedPayment: {
      paymentId: "cash_payment_1",
      paymentReference: "PAY-2024-0235",
      accountName: "Puregold Price Club Inc.",
      amountCents: 32000000,
      receivedOn: "3/28/2026",
      method: "Bank Transfer",
      reviewLabel: "Review Suggested",
      severityLabel: "Medium",
      footerTag: "Missing Remittance Advice",
      matches: [
        {
          invoiceId: "invoice-0945",
          invoiceNumber: "INV-2024-0945",
          invoiceAmountCents: 32000000,
          paymentAmountCents: 32000000,
          differenceCents: 0,
          confidence: 0.82,
          rationale: "Exact invoice amount match and linked payer evidence were found.",
          ...(learningScenarios["billing_seed_1"]?.cashApplication
            ? { learning: learningScenarios["billing_seed_1"].cashApplication }
            : {}),
        },
        {
          invoiceId: "invoice-0946",
          invoiceNumber: "INV-2024-0946",
          invoiceAmountCents: 31500000,
          paymentAmountCents: 32000000,
          differenceCents: 500000,
          confidence: 0.65,
          rationale: "Invoice number is plausible but the variance keeps this on manual review.",
          ...(learningScenarios["billing_sparse_demo"]?.cashApplication
            ? { learning: learningScenarios["billing_sparse_demo"].cashApplication }
            : {}),
        },
      ],
    },
  };

  const loanDashboard: LoanDashboardData = {
    title: "Borrowing dashboard",
    totalCommittedLimitCents: 42_500_000_00,
    totalOutstandingCents: 28_420_000_00,
    totalAvailableCents: 14_080_000_00,
    dueThisWeekCents: 3_480_000_00,
    overdueCents: 1_250_000_00,
    facilityCount: 3,
    facilitiesInArrearsCount: 1,
    alertCount: 3,
    taskCount: 4,
    actionPath: "/borrowing",
  };

  const creditFacilities: CreditFacilityData[] = [
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
      actionPath: "/borrowing/facilities",
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
      actionPath: "/borrowing/facilities",
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
      actionPath: "/borrowing/facilities",
    },
  ];

  const loanStatementDetail: LoanStatementData = {
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

  const loanRepaymentHistory: LoanRepaymentData[] = [
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

  const loanAlerts: LoanAlertData[] = [
    {
      id: "loan-alert-1",
      facilityId: "fac-bpi-003",
      facilityName: "BPI Bridge Loan",
      severity: "critical",
      title: "Past due repayment",
      summary: "The March 31 SOA shows the bridge loan is 17 DPD and still accruing penalty.",
      dueAt: "2026-04-09",
      actionPath: "/borrowing/alerts",
    },
    {
      id: "loan-alert-2",
      facilityId: "fac-secb-002",
      facilityName: "Security Bank Revolver",
      severity: "warning",
      title: "Facility near max utilization",
      summary:
        "Available headroom is below PHP 100K and new drawdowns should be reviewed carefully.",
      dueAt: "2026-04-10",
      actionPath: "/borrowing/alerts",
    },
    {
      id: "loan-alert-3",
      facilityId: "fac-bdo-001",
      facilityName: "BDO Working Capital Line",
      severity: "info",
      title: "Fresh SOA ready for review",
      summary: "The lender statement parsed cleanly and is ready for repayment reconciliation.",
      dueAt: "2026-04-12",
      actionPath: "/borrowing/statement",
    },
  ];

  const loanTasks: LoanTaskData[] = [
    {
      id: "loan-task-1",
      facilityId: "fac-bpi-003",
      facilityName: "BPI Bridge Loan",
      title: "Confirm repayment release with treasury",
      owner: "Treasury Lead",
      queue: "treasury",
      dueAt: "2026-04-09",
      state: "open",
      actionPath: "/borrowing/tasks",
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
      actionPath: "/borrowing/tasks",
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
      actionPath: "/borrowing/tasks",
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
      actionPath: "/borrowing/tasks",
    },
  ];

  const taskQueue: TaskQueueItem[] = [
    {
      id: "task-001",
      taskCode: "TSK-001",
      title: "Follow up on overdue invoices",
      relatedRecord: "INV-2026-1234",
      amountLabel: "₱456,000",
      type: "collection",
      customerName: "SM Retail Inc.",
      status: "open",
      priority: "high",
      assigneeName: "Maria Santos",
      assigneeInitials: "M",
      createdLabel: "14h ago",
      dueDateLabel: "Apr 8, 05:00 PM",
      actionPath: "/collections",
    },
    {
      id: "task-002",
      taskCode: "TSK-002",
      title: "Review payment allocation",
      amountLabel: "₱234,500",
      type: "cash_app",
      customerName: "Puregold Price Club",
      status: "in_progress",
      priority: "high",
      assigneeName: "Juan Cruz",
      assigneeInitials: "J",
      createdLabel: "13h ago",
      dueDateLabel: "—",
      actionPath: "/cash-application",
    },
    {
      id: "task-003",
      taskCode: "TSK-003",
      title: "Validate deduction claim documentation",
      amountLabel: "₱12,500",
      type: "deduction",
      customerName: "Robinsons Supermarket",
      status: "pending_approval",
      priority: "medium",
      assigneeName: "Ana Reyes",
      assigneeInitials: "A",
      createdLabel: "Apr 7",
      dueDateLabel: "—",
      actionPath: "/exceptions",
    },
    {
      id: "task-004",
      taskCode: "TSK-004",
      title: "Confirm payment promise from call",
      relatedRecord: "INV-2026-1189",
      amountLabel: "₱89,000",
      type: "collection",
      customerName: "Wilcon Depot Inc.",
      status: "open",
      priority: "high",
      assigneeName: "Maria Santos",
      assigneeInitials: "M",
      createdLabel: "11h ago",
      dueDateLabel: "Apr 9, 12:00 PM",
      actionPath: "/collections",
    },
    {
      id: "task-005",
      taskCode: "TSK-005",
      title: "Review SAP sync discrepancies",
      amountLabel: "—",
      type: "integration",
      customerName: "—",
      status: "open",
      priority: "low",
      assigneeName: "Juan Cruz",
      assigneeInitials: "J",
      createdLabel: "15h ago",
      dueDateLabel: "—",
      actionPath: "/integrations",
    },
    {
      id: "task-006",
      taskCode: "TSK-006",
      title: "Process drawdown request",
      amountLabel: "₱500,000",
      type: "credit_line",
      customerName: "—",
      status: "pending_approval",
      priority: "high",
      assigneeName: "Ana Reyes",
      assigneeInitials: "A",
      createdLabel: "13h ago",
      dueDateLabel: "—",
      actionPath: "/approvals",
    },
    {
      id: "task-007",
      taskCode: "TSK-007",
      title: "Match unidentified bank transaction",
      amountLabel: "₱125,000",
      type: "cash_app",
      customerName: "SM Hypermarket",
      status: "open",
      priority: "medium",
      assigneeName: "Juan Cruz",
      assigneeInitials: "J",
      createdLabel: "Apr 7",
      dueDateLabel: "—",
      actionPath: "/cash-application",
    },
    {
      id: "task-008",
      taskCode: "TSK-008",
      title: "Update contact information",
      amountLabel: "—",
      type: "collection",
      customerName: "Mercury Drug",
      status: "open",
      priority: "low",
      assigneeName: "Maria Santos",
      assigneeInitials: "M",
      createdLabel: "Apr 7",
      dueDateLabel: "—",
      actionPath: "/customers",
    },
  ];

  const exceptionsQueue: ExceptionQueueItem[] = [
    {
      id: "exception-1",
      type: exceptionBreakdown[0]?.type ?? "payer_unidentified",
      accountName: "Northpoint Wholesale - Manila",
      amount: formatCurrency(875000),
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
      amount: formatCurrency(2450000),
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
      : [
          {
            id: "ai-1",
            at: "09:02",
            actor: "Execution console",
            summary: "Auto-applied RCPT-7788 to SI-1001 with branch context retained.",
            outcome: "No manual step required.",
          },
          {
            id: "ai-2",
            at: "09:16",
            actor: "Approval policy",
            summary: "Escalated strategic payment RCPT-9001 for controller review.",
            outcome: "Collector outreach held pending approval.",
          },
          {
            id: "ai-3",
            at: "09:28",
            actor: "Exception router",
            summary: "Stopped UNKNOWN-875 from application because payer identity confidence was low.",
            outcome: "Next action is a treasury callback, not an ERP writeback.",
          },
        ];

  const integrations: IntegrationItem[] = [
    {
      id: "erp",
      name: "ERP invoice sync",
      status: "healthy",
      detail: "Reference invoice metadata is available for seeded reconciliation flows.",
      nextAction: "No action.",
    },
    {
      id: "sap-business-one",
      name: "SAP Business One",
      status: "warning",
      detail: "Service Layer connection flow is available, but no live SAP Business One company is connected in the fallback demo state.",
      nextAction: "Open Integrations and connect an SAP Business One company.",
    },
    {
      id: "quickbooks",
      name: "QuickBooks Online",
      status: "warning",
      detail: "Connection flow is available, but no live QuickBooks company is connected in the fallback demo state.",
      nextAction: "Open Integrations and connect a QuickBooks company.",
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

  const automationRules: AutomationRuleItem[] = [
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
  ];

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
      detail: formatCurrency(3100000) + " committed for follow-up.",
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
      detail: approvals.source.detail,
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
  const dashboardSummaryCards = buildDashboardSummaryCards(metrics);
  const invoiceAgingAnalytics = buildInvoiceAgingAnalytics(invoiceIndex, snapshot.generatedAt);
  const homeSetupChecklist = buildHomeSetupChecklist({
    emailSendingIdentityCount: emailSendingIdentities.length,
    integrations,
  });
  const overdueExposure = buildOverdueExposure(invoiceIndex);
  const collectibleVsDisputed = buildCollectibleVsDisputed(invoiceIndex);
  const linkedPaymentRemittanceStatus: LinkedPaymentRemittanceSummary = {
    invoicesWithLinkedPaymentsCount: 2,
    paymentsAwaitingReviewCount: cashApplicationQueue.summary.needsReview,
    unappliedPaymentsCount: paymentsQueue.filter((item) => item.state === "Unapplied cash").length,
    remittancesLinkedToPaymentCount: 1,
    remittancesAwaitingReviewCount: 1,
    remittancesOrphanedCount: 0,
  };
  const exceptionCounts: ExceptionCountSummary = {
    totalOpen: exceptionBreakdown.reduce((sum, item) => sum + item.count, 0),
    highSeverity: exceptionsQueue.length,
    waitingOnCustomer: 1,
    readyForResolution: 0,
    byType: exceptionBreakdown,
  };
  const accountProfileSummaries = buildAccountProfileSummaries({
    invoiceIndex,
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
    cashReviewCount: cashApplicationQueue.summary.needsReview,
    actionSummaries,
  });
  const homeTaskSummary = buildHomeTaskSummary({
    accountProfileSummaries,
    collectionsQueue,
    approvalsQueue,
    exceptionsQueue,
    cashApplicationQueue,
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
  const outreachIntelligence = buildSeedOutreachIntelligence();
  const controlCenter = buildSeedControlCenter();

  const screenInventory: ScreenInventoryItem[] = [
    { screen: "Home / command center", source: "Pilot readiness API + seeds", status: "Implemented" },
    { screen: "Imported invoice index", source: invoiceIndex.source.label, status: "Implemented" },
    { screen: "Collections queue", source: "Seeded demo view", status: "Implemented" },
    { screen: "Control Center", source: "Seeded control center view", status: "Implemented" },
    { screen: "Account workspace", source: "Seeded demo view", status: "Implemented" },
    { screen: "Invoice detail", source: "Seeded demo view", status: "Implemented" },
    { screen: "Payments / cash application queue", source: "Approvals API + seeds", status: "Implemented" },
    { screen: "Borrowing dashboard", source: "Seeded borrowing view", status: "Implemented" },
    { screen: "Credit facility list", source: "Seeded borrowing view", status: "Implemented" },
    { screen: "Loan statement detail", source: "Seeded borrowing view", status: "Implemented" },
    { screen: "Repayment history", source: "Seeded borrowing view", status: "Implemented" },
    { screen: "Loan alerts and tasks", source: "Seeded borrowing view", status: "Implemented" },
    { screen: "Exceptions queue", source: "Seeded workflow output", status: "Implemented" },
    { screen: "Approvals queue", source: approvals.source.label, status: "Implemented" },
    { screen: "AI activity feed", source: "Seeded operator summaries", status: "Implemented" },
    { screen: "Integration settings", source: "Frontend stub with real endpoint references", status: "Implemented" },
    { screen: "Rules and automations", source: "Seeded policy catalog", status: "Implemented" },
  ];

  const seededTemplatePreview = options?.controlCenterSelectedTemplateId
    ? buildSeedControlCenterTemplatePreview(
        options.controlCenterSelectedTemplateId,
        buildSeedControlCenter(),
      )
    : undefined;

  return {
    generatedAt: snapshot.generatedAt,
    commandCenterSource: pilotReadiness.source,
    approvalsSource: approvals.source,
    approvalsFallbackActive,
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
    cashApplicationQueue,
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
    emailSendingIdentities,
    emailInbox,
    dataSourceIntegrations: dataSourcesRuntime.integrations,
    dataSourceUploads: dataSourcesRuntime.uploads,
    automationRules,
    exceptionBreakdown,
    screenInventory,
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
    ...(odooConnect ? { odooConnect } : {}),
    ...(odooConnectError ? { odooConnectError } : {}),
    ...(emailConnectError ? { emailConnectError } : {}),
    ...(emailConnectStatus ? { emailConnectStatus } : {}),
    ...(inboxReplyStatus ? { inboxReplyStatus } : {}),
    ...(inboxReplyError ? { inboxReplyError } : {}),
    ...(collectionsComposeStatus ? { collectionsComposeStatus } : {}),
    ...(collectionsComposeError ? { collectionsComposeError } : {}),
    ...(seededTemplatePreview ? { controlCenterTemplatePreview: seededTemplatePreview } : {}),
  };
}

async function loadOperatorConsoleFromApi(options?: {
  page?: string | undefined;
  inboxSenderIdentityId?: string | undefined;
  inboxThreadId?: string | undefined;
  controlCenterSelectedTemplateId?: string | undefined;
}): Promise<OperatorConsoleData | undefined> {
  const apiBaseUrl = resolveApiBaseUrl();
  const runtimeFetch = getRuntimeFetch();
  const dataSourcesRuntime = listDataSourceRuntimeSnapshot();

  if (!apiBaseUrl || !runtimeFetch) {
    return undefined;
  }

  try {
    const response = await runtimeFetch(joinUrl(apiBaseUrl, "/v1/operator-console"));
    if (!response.ok) {
      return undefined;
    }

    const body = (await response.json()) as Partial<OperatorConsoleData>;
    if (!isOperatorConsoleData(body)) {
      return undefined;
    }

    const invoiceIndex = await loadInvoiceIndex();
    const screenInventory = body.screenInventory?.some(
      (item) => item.screen === "Imported invoice index",
    )
      ? body.screenInventory
      : [
          ...(body.screenInventory ?? []),
          {
            screen: "Imported invoice index",
            source: invoiceIndex.source.label,
            status: "Implemented",
          },
        ];
    const accountProfileSummaries = buildAccountProfileSummaries({
      invoiceIndex,
      collectionsQueue: body.collectionsQueue ?? [],
      promisesDueToday: 2,
    });

    const emailSendingIdentities = await loadEmailSendingIdentities();
    const emailInbox = shouldLoadCollectionsInbox(options?.page)
      ? await loadEmailInbox({
          identities: emailSendingIdentities,
          ...(options?.inboxSenderIdentityId
            ? { selectedSenderIdentityId: options.inboxSenderIdentityId }
            : {}),
          ...(options?.inboxThreadId ? { selectedThreadId: options.inboxThreadId } : {}),
        })
      : buildEmptyEmailInbox({
          identities: emailSendingIdentities,
          ...(options?.inboxSenderIdentityId
            ? { selectedSenderIdentityId: options.inboxSenderIdentityId }
            : {}),
        });
    let controlCenterTemplatePreview: ControlCenterTemplatePreview | undefined;
    if (options?.controlCenterSelectedTemplateId) {
      const previewResponse = await runtimeFetch(
        joinUrl(
          apiBaseUrl,
          `/v1/control-center/templates/${encodeURIComponent(options.controlCenterSelectedTemplateId)}/preview`,
        ),
      );
      if (previewResponse.ok) {
        const previewPayload = (await previewResponse.json()) as {
          preview?: ControlCenterTemplatePreview;
        };
        controlCenterTemplatePreview = previewPayload.preview;
      }
    }

    return {
      ...body,
      invoiceIndex,
      accountProfileSummaries,
      screenInventory,
      outreachIntelligence: body.outreachIntelligence ?? buildSeedOutreachIntelligence(),
      controlCenter: body.controlCenter ?? buildSeedControlCenter(),
      loanDashboard:
        body.loanDashboard ??
        ({
          title: "Borrowing dashboard",
          totalCommittedLimitCents: 42_500_000_00,
          totalOutstandingCents: 28_420_000_00,
          totalAvailableCents: 14_080_000_00,
          dueThisWeekCents: 3_480_000_00,
          overdueCents: 1_250_000_00,
          facilityCount: 3,
          facilitiesInArrearsCount: 1,
          alertCount: 3,
          taskCount: 4,
          actionPath: "/borrowing",
        } satisfies LoanDashboardData),
      creditFacilities:
        body.creditFacilities ??
        ([
          {
            id: "fac-bdo-001",
            facilityName: "BDO Working Capital Line",
            lenderName: "BDO Unibank",
            borrowerLegalName: "Yield AROS Manufacturing Inc.",
            currency: "PHP",
            committedLimit: "PHP 20.5M",
            outstandingBalance: "PHP 13.7M",
            availableToDraw: "PHP 6.8M",
            nextDueDate: "2026-04-12",
            daysPastDue: 0,
            daysPastDueBucket: "current",
            utilizationPercent: 67,
            status: "active",
            actionPath: "/borrowing/facilities",
          },
        ] satisfies CreditFacilityData[]),
      loanStatementDetail:
        body.loanStatementDetail ??
        ({
          facilityId: "fac-bpi-003",
          facilityName: "BPI Bridge Loan",
          lenderName: "BPI",
          statementReference: "SOA-BPI-2026-03-31",
          statementDate: "2026-03-31",
          periodLabel: "Mar 1, 2026 to Mar 31, 2026",
          source: "Lender SOA upload",
          openingBalance: "PHP 3.45M",
          closingBalance: "PHP 2.82M",
          principalDue: "PHP 2.5M",
          interestDue: "PHP 210K",
          dstDue: "PHP 35K",
          penaltyDue: "PHP 75K",
          totalDue: "PHP 2.82M",
          daysPastDue: 17,
          daysPastDueBucket: "days_1_30",
          runningBalanceNote:
            "SOA parsing preserved principal, interest, DST, penalty, payment applications, and running balances.",
          paymentApplications: [
            {
              id: "loan-app-1",
              paidAt: "2026-03-18",
              paymentReference: "PYMT-88912",
              amountApplied: "PHP 650K",
              appliedPrincipal: "PHP 500K",
              appliedInterest: "PHP 110K",
              appliedDst: "PHP 15K",
              appliedPenalty: "PHP 25K",
              resultingRunningBalance: "PHP 2.82M",
            },
          ],
        } satisfies LoanStatementData),
      loanRepaymentHistory:
        body.loanRepaymentHistory ??
        ([
          {
            id: "loan-pay-1",
            paidAt: "2026-03-18",
            paymentReference: "PYMT-88912",
            amount: "PHP 650K",
            appliedPrincipal: "PHP 500K",
            appliedInterest: "PHP 110K",
            appliedDst: "PHP 15K",
            appliedPenalty: "PHP 25K",
            resultingBalance: "PHP 2.82M",
            status: "posted",
          },
        ] satisfies LoanRepaymentData[]),
      loanAlerts:
        body.loanAlerts ??
        ([
          {
            id: "loan-alert-1",
            facilityId: "fac-bpi-003",
            facilityName: "BPI Bridge Loan",
            severity: "critical",
            title: "Past due repayment",
            summary: "The March 31 SOA shows the bridge loan is 17 DPD and still accruing penalty.",
            dueAt: "2026-04-09",
            actionPath: "/borrowing/alerts",
          },
        ] satisfies LoanAlertData[]),
      loanTasks:
        body.loanTasks ??
        ([
          {
            id: "loan-task-1",
            facilityId: "fac-bpi-003",
            facilityName: "BPI Bridge Loan",
            title: "Confirm repayment release with treasury",
            owner: "Treasury Lead",
            queue: "treasury",
            dueAt: "2026-04-09",
            state: "open",
            actionPath: "/borrowing/tasks",
          },
        ] satisfies LoanTaskData[]),
      taskQueue:
        body.taskQueue ??
        ([
          {
            id: "task-001",
            taskCode: "TSK-001",
            title: "Follow up on overdue invoices",
            relatedRecord: "INV-2026-1234",
            amountLabel: "₱456,000",
            type: "collection",
            customerName: "SM Retail Inc.",
            status: "open",
            priority: "high",
            assigneeName: "Maria Santos",
            assigneeInitials: "M",
            createdLabel: "14h ago",
            dueDateLabel: "Apr 8, 05:00 PM",
            actionPath: "/collections",
          },
        ] satisfies TaskQueueItem[]),
      emailSendingIdentities,
      emailInbox,
      ...(controlCenterTemplatePreview ? { controlCenterTemplatePreview } : {}),
      dataSourceIntegrations: dataSourcesRuntime.integrations,
      dataSourceUploads: dataSourcesRuntime.uploads,
    };
  } catch {
    return undefined;
  }
}

function buildSeedControlCenterTemplatePreview(
  templateId: string,
  controlCenter: ControlCenterConsoleData,
): ControlCenterTemplatePreview | undefined {
  const template = controlCenter.templates.find((item) => item.id === templateId);
  if (!template) {
    return undefined;
  }
  const seed = buildDemoSeedBundle();
  const account =
    seed.billingAccounts.find((billingAccount) => billingAccount.id === template.previewSeedKey) ??
    seed.billingAccounts[0];
  if (!account) {
    return undefined;
  }
  const contact = {
    id: "seed-preview-contact",
    createdAt: "2026-04-15T00:00:00.000Z",
    updatedAt: "2026-04-15T00:00:00.000Z",
    parentAccountId: account.parentAccountId,
    billingAccountId: account.id,
    scope: "billing_account" as const,
    scopeId: account.id,
    fullName: "Maria Santos",
    email: "maria.santos@example.com",
    role: "ap" as const,
    isPrimary: true,
    isVerified: true,
    allowAutoSend: true,
    recentSuccessfulResponses: 4,
    metadata: {},
  };
  return buildLocalControlCenterTemplatePreview(template, {
    account,
    contact,
    invoices: seed.invoices.filter((invoice) => invoice.billingAccountId === account.id),
    paymentUrl: `https://pay.yieldaros.example/accounts/${account.id}`,
    asOfDate: "2026-04-16",
  });
}

function buildLocalControlCenterTemplatePreview(
  template: ControlCenterConsoleData["templates"][number],
  input: {
    account: { displayName: string; currency: string; accountNumber: string; erpCustomerId?: string };
    contact: { fullName: string; email?: string };
    invoices: Array<{
      state: string;
      invoiceNumber: string;
      dueDate?: string;
      currency: string;
      amountCents: number;
      collectibleAmountCents?: number;
      disputedAmountCents?: number;
    }>;
    paymentUrl: string;
    asOfDate: string;
  },
): ControlCenterTemplatePreview {
  const eligibleInvoices = input.invoices.filter((invoice) => !["paid", "voided", "credit_pending"].includes(invoice.state));
  const amountForInvoice = (invoice: (typeof eligibleInvoices)[number]) =>
    typeof invoice.collectibleAmountCents === "number"
      ? invoice.collectibleAmountCents
      : Math.max(invoice.amountCents - (invoice.disputedAmountCents ?? 0), 0);
  const overdueInvoices = eligibleInvoices.filter((invoice) => invoice.dueDate && invoice.dueDate < input.asOfDate);
  const upcomingInvoices = eligibleInvoices.filter((invoice) => invoice.dueDate && invoice.dueDate >= input.asOfDate);
  const formatMoney = (cents: number, currency: string) =>
    `${currency} ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = (value?: string) =>
    value
      ? new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        })
      : "no due date";
  const overdueBalance = overdueInvoices.reduce((sum, invoice) => sum + amountForInvoice(invoice), 0);
  const upcomingBalance = upcomingInvoices.reduce((sum, invoice) => sum + amountForInvoice(invoice), 0);
  const totalBalance = eligibleInvoices.reduce((sum, invoice) => sum + amountForInvoice(invoice), 0);
  const variables: Record<string, string> = {
    customer_name: input.contact.fullName,
    customer_email: input.contact.email ?? "maria.santos@example.com",
    customer_company_name: input.account.displayName,
    billing_account_name: input.account.displayName,
    customer_external_id: input.account.erpCustomerId ?? input.account.accountNumber,
    overdue_invoice_summary:
      overdueInvoices.length > 0
        ? overdueInvoices
            .map(
              (invoice) =>
                `- Invoice ${invoice.invoiceNumber}: ${formatMoney(amountForInvoice(invoice), invoice.currency)} due on ${formatDate(invoice.dueDate)}`,
            )
            .join("\n")
        : "- No overdue invoices in the preview account.",
    overdue_balance: formatMoney(overdueBalance, input.account.currency),
    upcoming_balance: formatMoney(upcomingBalance, input.account.currency),
    total_account_balance: formatMoney(totalBalance, input.account.currency),
    payment_url: input.paymentUrl,
    num_upcoming_invoices: String(upcomingInvoices.length),
  };
  const replaceAliases = (value: string) => {
    const replacements: Array<[string, string | undefined]> = [
      ["{{customer_name}}", variables.customer_name],
      ["{{customer_email}}", variables.customer_email],
      ["{{customer_company_name}}", variables.customer_company_name],
      ["{{billing_account_name}}", variables.billing_account_name],
      ["{{customer_external_id}}", variables.customer_external_id],
      ["{{overdue_invoice_summary}}", variables.overdue_invoice_summary],
      ["{{overdue_balance}}", variables.overdue_balance],
      ["{{upcoming_balance}}", variables.upcoming_balance],
      ["{{total_account_balance}}", variables.total_account_balance],
      ["{{payment_url}}", variables.payment_url],
      ["Customer Name", variables.customer_name],
      ["Customer Company Name", variables.customer_company_name],
      ["Overdue Invoices Summary", variables.overdue_invoice_summary],
      ["Overdue Balance", variables.overdue_balance],
      ["Upcoming Balance", variables.upcoming_balance],
      ["Total Account Balance", variables.total_account_balance],
      ["Payment URL", variables.payment_url],
    ];
    return replacements.reduce((output, [from, to]) => output.replaceAll(from, to ?? ""), value);
  };
  const applyConditionals = (value: string) =>
    value.replace(/\{%\s*if\s+num_upcoming_invoices\s*>\s*0\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/gi, (_match, content: string) =>
      upcomingInvoices.length > 0 ? content : "",
    );
  const finalize = (value: string) =>
    (template.autoCorrectEnabled ? value.replaceAll(" dont ", " don't ").replaceAll(" cant ", " can't ") : value)
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  return {
    subject: finalize(replaceAliases(applyConditionals(template.subject))),
    body: finalize(replaceAliases(applyConditionals(template.body))),
    sampleVariables: variables,
  };
}

export async function loadQuickBooksConnectViewState(options?: {
  quickbooksStatus?: string | undefined;
  quickbooksMessage?: string | undefined;
  quickbooksCompany?: string | undefined;
}): Promise<QuickBooksConnectViewState> {
  const apiBaseUrl = resolveApiBaseUrl();
  const runtimeFetch = getRuntimeFetch();
  const callbackStatus =
    options?.quickbooksStatus === "connected" || options?.quickbooksStatus === "error"
      ? options.quickbooksStatus
      : undefined;
  const callbackMessage =
    options?.quickbooksMessage && options.quickbooksMessage.trim().length > 0
      ? options.quickbooksMessage.trim()
      : callbackStatus === "connected" && options?.quickbooksCompany?.trim()
        ? `${options.quickbooksCompany.trim()} is now authorized for Yield AROS.`
        : undefined;
  const fallbackState: QuickBooksConnectViewState = {
    kind: "not_connected",
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
    ...(callbackStatus ? { callbackStatus } : {}),
    ...(callbackMessage ? { callbackMessage } : {}),
    ...(options?.quickbooksCompany?.trim()
      ? { companyName: options.quickbooksCompany.trim() }
      : {}),
  };

  if (!apiBaseUrl || !runtimeFetch) {
    return fallbackState;
  }

  try {
    const response = await runtimeFetch(joinUrl(apiBaseUrl, "/v1/integrations/quickbooks/connection"));
    if (!response.ok) {
      return fallbackState;
    }

    const body = (await response.json()) as {
      status?: Record<string, unknown>;
      connection?: Record<string, unknown> | null;
      authorization?: {
        accessMode?: unknown;
        scopes?: unknown;
        readableObjects?: unknown;
        writableObjects?: unknown;
      };
    };
    const authorization = body.authorization ?? {};
    const status = body.status ?? {};
    const connection = body.connection ?? undefined;

    return {
      kind:
        typeof status.kind === "string" && status.kind === "customer_connected"
          ? "connected"
          : "not_connected",
      accessMode: authorization.accessMode === "read_write" ? "read_write" : "read_write",
      scopes: Array.isArray(authorization.scopes)
        ? authorization.scopes.filter((value): value is string => typeof value === "string")
        : fallbackState.scopes,
      readableObjects: Array.isArray(authorization.readableObjects)
        ? authorization.readableObjects.filter((value): value is string => typeof value === "string")
        : fallbackState.readableObjects,
      writableObjects: Array.isArray(authorization.writableObjects)
        ? authorization.writableObjects.filter((value): value is string => typeof value === "string")
        : fallbackState.writableObjects,
      ...(typeof status.companyName === "string"
        ? { companyName: status.companyName }
        : typeof connection === "object" &&
            connection !== null &&
            typeof connection.companyName === "string"
          ? { companyName: connection.companyName }
          : fallbackState.companyName
            ? { companyName: fallbackState.companyName }
            : {}),
      ...(typeof status.environment === "string" &&
      (status.environment === "production" || status.environment === "sandbox")
        ? { environment: status.environment }
        : {}),
      ...(typeof status.connectionHealth === "string" &&
      (status.connectionHealth === "connected" ||
        status.connectionHealth === "refresh_expiring" ||
        status.connectionHealth === "reconnect_required")
        ? { connectionHealth: status.connectionHealth }
        : {}),
      ...(typeof status.reconnectReason === "string"
        ? { reconnectReason: status.reconnectReason }
        : {}),
      ...(typeof status.needsReconnect === "boolean"
        ? { needsReconnect: status.needsReconnect }
        : {}),
      ...(typeof status.accessTokenExpiresAt === "string"
        ? { accessTokenExpiresAt: status.accessTokenExpiresAt }
        : {}),
      ...(typeof status.refreshTokenExpiresAt === "string"
        ? { refreshTokenExpiresAt: status.refreshTokenExpiresAt }
        : {}),
      ...(callbackStatus ? { callbackStatus } : {}),
      ...(callbackMessage ? { callbackMessage } : {}),
    };
  } catch {
    return fallbackState;
  }
}

export async function loadSapBusinessOneConnectViewState(options?: {
  sapStatus?: string | undefined;
  sapMessage?: string | undefined;
  sapCompany?: string | undefined;
  sapTestStatus?: string | undefined;
  sapTestMessage?: string | undefined;
}): Promise<SapBusinessOneConnectViewState> {
  const apiBaseUrl = resolveApiBaseUrl();
  const runtimeFetch = getRuntimeFetch();
  const callbackStatus =
    options?.sapStatus === "connected" || options?.sapStatus === "error"
      ? options.sapStatus
      : undefined;
  const callbackMessage =
    options?.sapMessage && options.sapMessage.trim().length > 0
      ? options.sapMessage.trim()
      : callbackStatus === "connected" && options?.sapCompany?.trim()
        ? `${options.sapCompany.trim()} is now connected to Yield AROS.`
        : undefined;
  const testStatus =
    options?.sapTestStatus === "success" || options?.sapTestStatus === "error"
      ? options.sapTestStatus
      : undefined;
  const testMessage =
    options?.sapTestMessage && options.sapTestMessage.trim().length > 0
      ? options.sapTestMessage.trim()
      : undefined;
  const fallbackState: SapBusinessOneConnectViewState = {
    kind: "not_connected",
    accessMode: "read_write",
    authStrategy: "basic_auth",
    readableObjects: ["invoices", "customers", "payments"],
    writableObjects: ["payment writeback staging", "cash application writeback preview"],
    ...(callbackStatus ? { callbackStatus } : {}),
    ...(callbackMessage ? { callbackMessage } : {}),
    ...(testStatus ? { testStatus } : {}),
    ...(testMessage ? { testMessage } : {}),
    ...(options?.sapCompany?.trim() ? { companyName: options.sapCompany.trim() } : {}),
  };

  if (!apiBaseUrl || !runtimeFetch) {
    return fallbackState;
  }

  try {
    const response = await runtimeFetch(
      joinUrl(apiBaseUrl, "/v1/integrations/sap-business-one/connection"),
    );
    if (!response.ok) {
      return fallbackState;
    }

    const body = (await response.json()) as {
      status?: Record<string, unknown>;
      connection?: Record<string, unknown> | null;
      sync?: {
        latestRun?: Record<string, unknown> | null;
        recentRuns?: Array<Record<string, unknown>>;
        scheduler?: Record<string, unknown> | null;
      };
      authorization?: {
        accessMode?: unknown;
        authStrategy?: unknown;
        readableObjects?: unknown;
        writableObjects?: unknown;
      };
    };
    const authorization = body.authorization ?? {};
    const status = body.status ?? {};
    const connection = body.connection ?? undefined;
    const sync = body.sync ?? {};

    return {
      kind: typeof status.kind === "string" && status.kind === "connected" ? "connected" : "not_connected",
      accessMode: authorization.accessMode === "read_write" ? "read_write" : "read_write",
      authStrategy: authorization.authStrategy === "basic_auth" ? "basic_auth" : "basic_auth",
      readableObjects: Array.isArray(authorization.readableObjects)
        ? authorization.readableObjects.filter((value): value is string => typeof value === "string")
        : fallbackState.readableObjects,
      writableObjects: Array.isArray(authorization.writableObjects)
        ? authorization.writableObjects.filter((value): value is string => typeof value === "string")
        : fallbackState.writableObjects,
      ...(typeof status.companyName === "string"
        ? { companyName: status.companyName }
        : typeof connection === "object" &&
            connection !== null &&
            typeof connection.companyName === "string"
          ? { companyName: connection.companyName }
          : fallbackState.companyName
            ? { companyName: fallbackState.companyName }
            : {}),
      ...(typeof status.companyDatabase === "string"
        ? { companyDatabase: status.companyDatabase }
        : typeof connection === "object" &&
            connection !== null &&
            typeof connection.companyDatabase === "string"
          ? { companyDatabase: connection.companyDatabase }
          : {}),
      ...(callbackStatus ? { callbackStatus } : {}),
      ...(callbackMessage ? { callbackMessage } : {}),
      ...(testStatus ? { testStatus } : {}),
      ...(testMessage ? { testMessage } : {}),
      ...(typeof sync.latestRun === "object" &&
      sync.latestRun !== null &&
      typeof sync.latestRun.status === "string" &&
      typeof sync.latestRun.startedAt === "string"
        ? {
            latestSyncRun: {
              status:
                sync.latestRun.status === "running" ||
                sync.latestRun.status === "failed"
                  ? sync.latestRun.status
                  : "succeeded",
              invoicesSyncedCount:
                typeof sync.latestRun.invoicesSyncedCount === "number"
                  ? sync.latestRun.invoicesSyncedCount
                  : 0,
              customersSyncedCount:
                typeof sync.latestRun.customersSyncedCount === "number"
                  ? sync.latestRun.customersSyncedCount
                  : 0,
              paymentsSyncedCount:
                typeof sync.latestRun.paymentsSyncedCount === "number"
                  ? sync.latestRun.paymentsSyncedCount
                  : 0,
              startedAt: sync.latestRun.startedAt,
              ...(typeof sync.latestRun.completedAt === "string"
                ? { completedAt: sync.latestRun.completedAt }
                : {}),
              ...(typeof sync.latestRun.errorMessage === "string"
                ? { errorMessage: sync.latestRun.errorMessage }
                : {}),
            },
          }
        : {}),
      ...(Array.isArray(sync.recentRuns)
        ? {
            recentSyncRuns: sync.recentRuns
              .filter(
                (value): value is Record<string, unknown> =>
                  typeof value === "object" && value !== null,
              )
              .map((run, index) => ({
                runId: typeof run.runId === "string" ? run.runId : `sap-run-${index + 1}`,
                status:
                  run.status === "running" || run.status === "failed"
                    ? run.status
                    : "succeeded",
                syncScope: Array.isArray(run.syncScope)
                  ? run.syncScope.filter((value): value is string => typeof value === "string")
                  : [],
                invoicesSyncedCount:
                  typeof run.invoicesSyncedCount === "number" ? run.invoicesSyncedCount : 0,
                customersSyncedCount:
                  typeof run.customersSyncedCount === "number" ? run.customersSyncedCount : 0,
                paymentsSyncedCount:
                  typeof run.paymentsSyncedCount === "number" ? run.paymentsSyncedCount : 0,
                startedAt:
                  typeof run.startedAt === "string" ? run.startedAt : new Date().toISOString(),
                ...(typeof run.completedAt === "string"
                  ? { completedAt: run.completedAt }
                  : {}),
                ...(typeof run.errorMessage === "string"
                  ? { errorMessage: run.errorMessage }
                  : {}),
              })),
          }
        : {}),
      ...(typeof sync.scheduler === "object" &&
      sync.scheduler !== null &&
      typeof sync.scheduler.enabled === "boolean" &&
      typeof sync.scheduler.intervalMinutes === "number" &&
      typeof sync.scheduler.running === "boolean"
        ? {
            scheduler: {
              enabled: sync.scheduler.enabled,
              intervalMinutes: sync.scheduler.intervalMinutes,
              running: sync.scheduler.running,
              ...(typeof sync.scheduler.nextRunAt === "string"
                ? { nextRunAt: sync.scheduler.nextRunAt }
                : {}),
              ...(typeof sync.scheduler.lastAttemptedAt === "string"
                ? { lastAttemptedAt: sync.scheduler.lastAttemptedAt }
                : {}),
            },
          }
        : {}),
    };
  } catch {
    return fallbackState;
  }
}

async function loadEmailSendingIdentities(): Promise<EmailSendingIdentityItem[]> {
  const apiBaseUrl = resolveApiBaseUrl();
  const runtimeFetch = getRuntimeFetch();

  if (!apiBaseUrl || !runtimeFetch) {
    return [];
  }

  try {
    const response = await runtimeFetch(joinUrl(apiBaseUrl, "/v1/email/sending-identities"));
    if (!response.ok) {
      return [];
    }

    const body = (await response.json()) as Partial<EmailSendingIdentityApiResponse>;
    if (!Array.isArray(body.identities)) {
      return [];
    }

    return body.identities.map((identity, index) => ({
      id: asString(identity.id, `sender-${index + 1}`),
      provider: asString(identity.provider, "unknown"),
      senderEmail: asString(identity.senderEmail, "unknown@example.com"),
      authMode: asString(identity.authMode, "unknown"),
      connectionStatus: asString(identity.connectionStatus, "unknown"),
      permissionStatus: asString(identity.permissionStatus, "unknown"),
      healthState: asString(identity.healthState, "unknown"),
      scopes: Array.isArray(identity.scopes)
        ? identity.scopes.filter((value): value is string => typeof value === "string")
        : [],
      isDefault: identity.isDefault === true,
      ...(typeof identity.displayName === "string" ? { displayName: identity.displayName } : {}),
      ...(typeof identity.sendAsEmail === "string"
        ? { sendAsEmail: identity.sendAsEmail }
        : {}),
      ...(typeof identity.sendOnBehalfOfEmail === "string"
        ? { sendOnBehalfOfEmail: identity.sendOnBehalfOfEmail }
        : {}),
      ...(typeof identity.lastSyncAt === "string" ? { lastSyncAt: identity.lastSyncAt } : {}),
      ...(typeof identity.lastSendCheckAt === "string"
        ? { lastSendCheckAt: identity.lastSendCheckAt }
        : {}),
    }));
  } catch {
    return [];
  }
}

function shouldLoadCollectionsInbox(page?: string) {
  return page === "inbox" || page === "collections";
}

async function loadEmailInbox(input: {
  identities: EmailSendingIdentityItem[];
  selectedSenderIdentityId?: string;
  selectedThreadId?: string;
}): Promise<EmailInboxData> {
  const apiBaseUrl = resolveApiBaseUrl();
  const runtimeFetch = getRuntimeFetch();
  const connectedGmailIdentities = input.identities.filter(
    (identity) => identity.provider === "gmail" && identity.connectionStatus === "connected",
  );
  const selectedIdentity =
    connectedGmailIdentities.find((identity) => identity.id === input.selectedSenderIdentityId) ??
    connectedGmailIdentities.find((identity) => identity.isDefault) ??
    connectedGmailIdentities[0];

  if (!apiBaseUrl || !runtimeFetch || !selectedIdentity) {
    return buildEmptyEmailInbox({
      identities: input.identities,
      ...(input.selectedSenderIdentityId
        ? { selectedSenderIdentityId: input.selectedSenderIdentityId }
        : {}),
    });
  }

  try {
    const inboxUrl = new URL(joinUrl(apiBaseUrl, "/v1/email/inbox"));
    inboxUrl.searchParams.set("senderIdentityId", selectedIdentity.id);
    const inboxResponse = await runtimeFetch(inboxUrl.toString());
    if (!inboxResponse.ok) {
      const error = await inboxResponse.json().catch(async () => ({
        message: await inboxResponse.text(),
      })) as { message?: string };
      return {
        ...buildEmptyEmailInbox({
          identities: input.identities,
          selectedSenderIdentityId: selectedIdentity.id,
        }),
        error: error.message ?? "Inbox messages could not be loaded.",
      };
    }

    const inboxBody = (await inboxResponse.json()) as EmailInboxApiResponse;
    const messages = Array.isArray(inboxBody.messages)
      ? inboxBody.messages.map((message, index) => toEmailInboxMessageItem(message, index))
      : [];
    let selectedThread: EmailInboxThreadItem | undefined;

    if (input.selectedThreadId) {
      const threadUrl = new URL(
        joinUrl(
          apiBaseUrl,
          `/v1/email/inbox/threads/${encodeURIComponent(input.selectedThreadId)}`,
        ),
      );
      threadUrl.searchParams.set("senderIdentityId", selectedIdentity.id);
      const threadResponse = await runtimeFetch(threadUrl.toString());
      if (threadResponse.ok) {
        const threadBody = (await threadResponse.json()) as EmailInboxThreadApiResponse;
        if (threadBody.thread && typeof threadBody.thread === "object") {
          selectedThread = toEmailInboxThreadItem(threadBody.thread);
        }
      }
    }

    return {
      selectedSenderIdentityId: selectedIdentity.id,
      resultSizeEstimate:
        typeof inboxBody.resultSizeEstimate === "number" ? inboxBody.resultSizeEstimate : messages.length,
      messages,
      ...(selectedThread ? { selectedThread } : {}),
    };
  } catch {
    return {
      ...buildEmptyEmailInbox({
        identities: input.identities,
        selectedSenderIdentityId: selectedIdentity.id,
      }),
      error: "Inbox messages could not be loaded.",
    };
  }
}

function buildEmptyEmailInbox(input: {
  identities: EmailSendingIdentityItem[];
  selectedSenderIdentityId?: string;
}): EmailInboxData {
  const connectedGmailIdentities = input.identities.filter(
    (identity) => identity.provider === "gmail" && identity.connectionStatus === "connected",
  );
  const selectedIdentity =
    connectedGmailIdentities.find((identity) => identity.id === input.selectedSenderIdentityId) ??
    connectedGmailIdentities.find((identity) => identity.isDefault) ??
    connectedGmailIdentities[0];

  return {
    ...(selectedIdentity ? { selectedSenderIdentityId: selectedIdentity.id } : {}),
    resultSizeEstimate: 0,
    messages: [],
  };
}

function toEmailInboxMessageItem(input: Record<string, unknown>, index: number): EmailInboxMessageItem {
  const direction = input.direction === "outbound" ? "outbound" : "inbound";
  return {
    providerMessageId: asString(input.providerMessageId, `message-${index + 1}`),
    ...(typeof input.providerThreadId === "string"
      ? { providerThreadId: input.providerThreadId }
      : {}),
    ...(typeof input.subjectLine === "string" ? { subjectLine: input.subjectLine } : {}),
    ...(typeof input.fromEmail === "string" ? { fromEmail: input.fromEmail } : {}),
    ...(typeof input.fromName === "string" ? { fromName: input.fromName } : {}),
    ...(typeof input.toEmail === "string" ? { toEmail: input.toEmail } : {}),
    ...(typeof input.snippet === "string" ? { snippet: input.snippet } : {}),
    ...(typeof input.receivedAt === "string" ? { receivedAt: input.receivedAt } : {}),
    labelIds: Array.isArray(input.labelIds)
      ? input.labelIds.filter((value): value is string => typeof value === "string")
      : [],
    unread: input.unread === true,
    direction,
  };
}

function toEmailInboxThreadItem(input: Record<string, unknown>): EmailInboxThreadItem {
  return {
    senderIdentityId: asString(input.senderIdentityId, "unknown-sender"),
    providerThreadId: asString(input.providerThreadId, "unknown-thread"),
    ...(typeof input.subjectLine === "string" ? { subjectLine: input.subjectLine } : {}),
    ...(typeof input.snippet === "string" ? { snippet: input.snippet } : {}),
    participants: Array.isArray(input.participants)
      ? input.participants.filter((value): value is string => typeof value === "string")
      : [],
    ...(typeof input.latestMessageAt === "string"
      ? { latestMessageAt: input.latestMessageAt }
      : {}),
    unreadCount: typeof input.unreadCount === "number" ? input.unreadCount : 0,
    messages: Array.isArray(input.messages)
      ? input.messages.map((message, index) =>
          toEmailInboxMessageItem(
            typeof message === "object" && message !== null ? (message as Record<string, unknown>) : {},
            index,
          ),
        )
      : [],
  };
}

async function loadOdooConnectSelection(state?: string) {
  if (!state) {
    return undefined;
  }

  const apiBaseUrl = resolveApiBaseUrl();
  const runtimeFetch = getRuntimeFetch();
  if (!apiBaseUrl || !runtimeFetch) {
    return undefined;
  }

  try {
    const response = await runtimeFetch(
      joinUrl(apiBaseUrl, `/v1/integrations/odoo/connect/${encodeURIComponent(state)}`),
    );
    if (!response.ok) {
      return undefined;
    }

    const body = (await response.json()) as {
      status?: string;
      selection?: {
        state?: string;
        baseUrl?: string;
        username?: string;
        databases?: unknown;
      };
    };

    if (
      body.status !== "select_database" ||
      !body.selection ||
      typeof body.selection.state !== "string" ||
      typeof body.selection.baseUrl !== "string" ||
      typeof body.selection.username !== "string" ||
      !Array.isArray(body.selection.databases)
    ) {
      return undefined;
    }

    const databases = body.selection.databases.filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    if (databases.length === 0) {
      return undefined;
    }

    return {
      kind: "select_database" as const,
      state: body.selection.state,
      baseUrl: body.selection.baseUrl,
      username: body.selection.username,
      databases,
    };
  } catch {
    return undefined;
  }
}

async function loadInvoiceIndex(): Promise<InvoiceIndexResponse> {
  const apiBaseUrl = resolveApiBaseUrl();
  const runtimeFetch = getRuntimeFetch();
  const runtimeImports = listDataSourceRuntimeSnapshot().importedInvoices;

  if (!apiBaseUrl || !runtimeFetch) {
    return mergeRuntimeInvoicesIntoIndex(buildSeedInvoiceIndex(), runtimeImports);
  }

  try {
    const response = await runtimeFetch(joinUrl(apiBaseUrl, "/v1/invoices"));
    if (!response.ok) {
      throw new OperatorConsoleSourceError(
        `Invoice index returned ${response.status}.`,
        "invoice_index_unavailable",
      );
    }

    const body = (await response.json()) as Partial<InvoiceIndexResponse>;
    if (!isInvoiceIndexResponse(body)) {
      throw new OperatorConsoleSourceError(
        "Invoice index payload was malformed.",
        "invoice_index_unavailable",
      );
    }

    return mergeRuntimeInvoicesIntoIndex(body, runtimeImports);
  } catch {
    return mergeRuntimeInvoicesIntoIndex(buildSeedInvoiceIndex(), runtimeImports);
  }
}

async function loadPilotReadinessSnapshot(): Promise<{
  snapshot: PilotReadinessSnapshotLike;
  source: SourceBadge;
}> {
  const apiBaseUrl = resolveApiBaseUrl();
  const runtimeFetch = getRuntimeFetch();

  if (!apiBaseUrl || !runtimeFetch) {
    return {
      snapshot: buildPilotReadinessSnapshot(),
      source: {
        kind: "seeded",
        label: "Seed-backed workflow model",
        detail: "Set O2C_API_BASE_URL in a runtime with fetch support to load /v1/pilot-readiness.",
      },
    };
  }

  try {
    const response = await runtimeFetch(joinUrl(apiBaseUrl, "/v1/pilot-readiness"));
    if (!response.ok) {
      throw new OperatorConsoleSourceError(
        `Pilot readiness returned ${response.status}.`,
        "pilot_readiness_unavailable"
      );
    }

    const body = (await response.json()) as Partial<PilotReadinessSnapshotLike>;
    if (
      typeof body.generatedAt !== "string" ||
      !body.metrics ||
      !Array.isArray(body.scenarios)
    ) {
      throw new OperatorConsoleSourceError(
        "Pilot readiness payload was malformed.",
        "pilot_readiness_unavailable"
      );
    }

    return {
      snapshot: body as PilotReadinessSnapshotLike,
      source: {
        kind: "live",
        label: "Live pilot readiness API",
        detail: "Fetched from /v1/pilot-readiness.",
      },
    };
  } catch (error) {
    return {
      snapshot: buildPilotReadinessSnapshot(),
      source: {
        kind: "seeded",
        label: "Seed fallback",
        detail:
          error instanceof Error
            ? `Pilot readiness API was unavailable: ${error.message}`
            : "Pilot readiness API was unavailable.",
      },
    };
  }
}

async function loadApprovalQueue(): Promise<{
  items: ApprovalQueueItem[];
  source: SourceBadge;
}> {
  const apiBaseUrl = resolveApiBaseUrl();
  const runtimeFetch = getRuntimeFetch();

  if (!apiBaseUrl || !runtimeFetch) {
    return {
      items: [],
      source: {
        kind: "seeded",
        label: "Seeded approvals",
        detail: "Set O2C_API_BASE_URL in a runtime with fetch support to load live approval queue data.",
      },
    };
  }

  try {
    const response = await runtimeFetch(joinUrl(apiBaseUrl, "/v1/approvals/queue"), {
      headers: {
        "x-principal-id": "web_console",
        "x-principal-roles": "controller,ar_manager",
      },
    });

    if (!response.ok) {
      throw new OperatorConsoleSourceError(
        `Approvals queue returned ${response.status}.`,
        "approval_queue_unavailable"
      );
    }

    const body = (await response.json()) as ApprovalQueueApiResponse;
    const items = Array.isArray(body.items)
      ? body.items.map((item, index) => ({
          id: asString(item.id, `approval-${index + 1}`),
          requestType: asString(item.requestType, "approval_request"),
          status: asString(item.status, "pending_approval"),
          assigneeRole: asString(item.assigneeRole, "controller"),
          summary: asString((item.payload as Record<string, unknown> | undefined)?.summary, "Approval request"),
          nextAction: "Open the request, confirm policy context, then approve or reject.",
          actions: [],
        }))
      : [];

    return {
      items,
      source: {
        kind: "live",
        label: "Live approvals API",
        detail: items.length > 0 ? "Fetched from /v1/approvals/queue." : "Fetched from API with no open items.",
      },
    };
  } catch (error) {
    return {
      items: [],
      source: {
        kind: "seeded",
        label: "Seed fallback",
        detail:
          error instanceof Error
            ? `Approvals API was unavailable: ${error.message}`
            : "Approvals API was unavailable.",
      },
    };
  }
}

function buildSeededApprovals(
  scenarios: Array<{
    id: string;
    title: string;
    route: string;
    approvalStatus?: string;
  }>
): ApprovalQueueItem[] {
  return scenarios
    .filter((scenario) => scenario.route === "approval_required")
    .map((scenario) => ({
      id: `${scenario.id}-approval`,
      requestType: "cash_application_review",
      status: scenario.approvalStatus ?? "pending_approval",
      assigneeRole: "controller",
      summary: scenario.title,
      nextAction: "Review evidence packet and either release or reject the application.",
    }));
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

function formatExceptionBreakdown(items: Array<{ type: string; count: number }>) {
  return items.map((item) => `${item.count} ${humanize(item.type)}`).join(" • ");
}

function buildDashboardSummaryCards(metrics: MetricTile[]): DashboardSummaryCard[] {
  return [
    buildDashboardSummaryCard(metrics, "Cash collected today", "cash_collected_today", "success"),
    buildDashboardSummaryCard(metrics, "Overdue at risk", "overdue_at_risk", "danger", "View collections", "/collections"),
    buildDashboardSummaryCard(metrics, "Promises due today", "promises_due_today", "warning"),
    buildDashboardSummaryCard(metrics, "Unapplied cash", "unapplied_cash", "info", "Review payments", "/cash-application"),
    buildDashboardSummaryCard(metrics, "Approvals pending", "approvals_pending", "violet", "Review approvals", "/approvals"),
  ];
}

function buildDashboardSummaryCard(
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
  integrations: IntegrationItem[];
}): HomeSetupChecklistReadModel {
  const emailConnected = input.emailSendingIdentityCount > 0;
  const erpConnected = input.integrations.some(
    (item) =>
      (item.name === "Business Central" ||
        item.name === "SAP Business One" ||
        item.name === "Odoo" ||
        item.name === "QuickBooks Online" ||
        item.name === "Dynamics 365 Business Central") &&
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
      const count = collectionsCount + exceptionCount + approvalCount;

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
      actionPath: "/cash-application",
    },
  ].filter((item) => item.count > 0);

  const allTasks = [
    ...tasksByType,
    {
      id: "all_customer_work",
      label: "All customer work",
      detail: "Combined operational workload across customers and task types.",
      count: tasksByCustomer.reduce((sum, item) => sum + item.count, 0),
      actionPath: "/inbox",
    },
  ].filter((item) => item.count > 0);

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

function buildInvoiceAgingAnalytics(
  invoiceIndex: InvoiceIndexResponse,
  asOf: string,
): InvoiceAgingAnalytics {
  const buckets: InvoiceAgingAnalytics["buckets"] = [
    { id: "current", label: "Current", invoiceCount: 0, openAmountCents: 0, collectibleAmountCents: 0, disputedAmountCents: 0 },
    { id: "days_1_30", label: "1-30 days", invoiceCount: 0, openAmountCents: 0, collectibleAmountCents: 0, disputedAmountCents: 0 },
    { id: "days_31_60", label: "31-60 days", invoiceCount: 0, openAmountCents: 0, collectibleAmountCents: 0, disputedAmountCents: 0 },
    { id: "days_61_90", label: "61-90 days", invoiceCount: 0, openAmountCents: 0, collectibleAmountCents: 0, disputedAmountCents: 0 },
    { id: "days_90_plus", label: "90+ days", invoiceCount: 0, openAmountCents: 0, collectibleAmountCents: 0, disputedAmountCents: 0 },
  ];

  for (const invoice of invoiceIndex.invoices) {
    if (invoice.openAmountCents <= 0) {
      continue;
    }
    const bucketId = invoice.daysPastDue === undefined || invoice.daysPastDue <= 0
      ? "current"
      : invoice.daysPastDue <= 30
        ? "days_1_30"
        : invoice.daysPastDue <= 60
          ? "days_31_60"
          : invoice.daysPastDue <= 90
            ? "days_61_90"
            : "days_90_plus";
    const bucket = buckets.find((item) => item.id === bucketId);
    if (!bucket) {
      continue;
    }
    bucket.invoiceCount += 1;
    bucket.openAmountCents += invoice.openAmountCents;
    bucket.collectibleAmountCents += getCollectibleOpenAmountCents(invoice);
    bucket.disputedAmountCents += getDisputedOpenAmountCents(invoice);
  }

  return {
    asOf,
    buckets,
    overdueInvoiceCount: invoiceIndex.summary.overdueInvoiceCount,
    overdueOpenAmountCents: buckets.slice(1).reduce((sum, bucket) => sum + bucket.openAmountCents, 0),
    overdueCollectibleAmountCents: buckets.slice(1).reduce((sum, bucket) => sum + bucket.collectibleAmountCents, 0),
  };
}

function buildOverdueExposure(invoiceIndex: InvoiceIndexResponse): OverdueExposureSummary {
  const overdueInvoices = invoiceIndex.invoices.filter((invoice) => (invoice.daysPastDue ?? 0) > 0 && invoice.openAmountCents > 0);
  const severe = overdueInvoices.filter((invoice) => (invoice.daysPastDue ?? 0) > 60);
  return {
    overdueInvoiceCount: overdueInvoices.length,
    overdueOpenAmountCents: overdueInvoices.reduce((sum, invoice) => sum + invoice.openAmountCents, 0),
    overdueCollectibleAmountCents: overdueInvoices.reduce((sum, invoice) => sum + getCollectibleOpenAmountCents(invoice), 0),
    blockedDisputedAmountCents: overdueInvoices.reduce((sum, invoice) => sum + getDisputedOpenAmountCents(invoice), 0),
    severeOverdueInvoiceCount: severe.length,
    severeOverdueAmountCents: severe.reduce((sum, invoice) => sum + invoice.openAmountCents, 0),
  };
}

function buildCollectibleVsDisputed(invoiceIndex: InvoiceIndexResponse): CollectibleVsDisputedSummary {
  const openInvoices = invoiceIndex.invoices.filter((invoice) => invoice.openAmountCents > 0);
  const collectibleOpenAmountCents = openInvoices.reduce((sum, invoice) => sum + getCollectibleOpenAmountCents(invoice), 0);
  const disputedOpenAmountCents = openInvoices.reduce((sum, invoice) => sum + getDisputedOpenAmountCents(invoice), 0);
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

function buildAccountProfileSummaries(input: {
  invoiceIndex: InvoiceIndexResponse;
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

  for (const invoice of input.invoiceIndex.invoices) {
    const key = invoice.billingAccountId ?? invoice.customerReference ?? invoice.customerName;
    const current = grouped.get(key) ?? {
      accountName: invoice.billingAccountName ?? invoice.customerName,
      ...(invoice.parentAccountName ? { parentAccountName: invoice.parentAccountName } : {}),
      openAmountCents: 0,
      overdueAmountCents: 0,
      collectibleAmountCents: 0,
      disputedAmountCents: 0,
      openInvoiceCount: 0,
    };
    if (invoice.openAmountCents > 0) {
      current.openAmountCents += invoice.openAmountCents;
      current.collectibleAmountCents += getCollectibleOpenAmountCents(invoice);
      current.disputedAmountCents += getDisputedOpenAmountCents(invoice);
      current.openInvoiceCount += 1;
      if ((invoice.daysPastDue ?? 0) > 0) {
        current.overdueAmountCents += invoice.openAmountCents;
      }
    }
    grouped.set(key, current);
  }

  const queueByName = new Map(input.collectionsQueue.map((item) => [item.accountName, item]));

  return [...grouped.entries()]
    .sort((left, right) => right[1].openAmountCents - left[1].openAmountCents)
    .map(([billingAccountId, summary], index) => {
      const queueItem = queueByName.get(summary.accountName);
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
        nextAction: queueItem?.nextAction ?? "Review the account workspace before any outreach.",
        linkedStatus:
          summary.disputedAmountCents > 0
            ? "Disputed exposure remains blocked from automation."
            : "Linked payment evidence is available for review.",
      };
    });
}

function buildCustomerIndex(input: {
  accountProfileSummaries: AccountProfileSummary[];
  collectionsQueue: CollectionsQueueItem[];
}): CustomerIndexItem[] {
  const queueByAccount = new Map(input.collectionsQueue.map((item) => [item.accountName, item]));

  return input.accountProfileSummaries.map((item) => {
    const queueItem = queueByAccount.get(item.accountName);
    const tabs: CustomerProfileTabSummary[] = [
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
  accountWorkspace: AccountWorkspaceData;
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
      ...(selectedIndex?.primaryContactEmail
        ? { primaryContactEmail: selectedIndex.primaryContactEmail }
        : {}),
      primaryContactRole: "ap",
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
  const [cashSummary, approvalSummary, exceptionSummary] = input.actionSummaries;
  return [
    {
      id: cashSummary?.id ?? "cash-review",
      title: cashSummary?.title ?? "Cash review requires confirmation.",
      summary: cashSummary?.summary ?? "Suggested matches are waiting for operator confirmation.",
      severity: cashSummary?.severity ?? "attention",
      count: input.cashReviewCount,
      actionLabel: "Open cash review",
      actionPath: "/cash-application",
    },
    {
      id: approvalSummary?.id ?? "approvals",
      title: approvalSummary?.title ?? "Approvals are pending.",
      summary: approvalSummary?.summary ?? "Sensitive actions remain held behind explicit approval gates.",
      severity: approvalSummary?.severity ?? "attention",
      count: input.approvalsPending,
      actionLabel: "Review approvals",
      actionPath: "/approvals",
    },
    {
      id: exceptionSummary?.id ?? "exceptions",
      title: exceptionSummary?.title ?? "Exceptions require follow-up.",
      summary: exceptionSummary?.summary ?? "Typed exceptions are waiting on the next safe action.",
      severity: exceptionSummary?.severity ?? "critical",
      count: input.exceptionCount,
      actionLabel: "Resolve exception",
      actionPath: "/exceptions",
    },
  ];
}

function getCollectibleOpenAmountCents(invoice: InvoiceIndexEntry) {
  if (invoice.status === "disputed") {
    return Math.min(invoice.collectibleAmountCents ?? 0, invoice.openAmountCents);
  }
  return invoice.openAmountCents;
}

function getDisputedOpenAmountCents(invoice: InvoiceIndexEntry) {
  if (invoice.status !== "disputed") {
    return 0;
  }
  return Math.max(invoice.openAmountCents - getCollectibleOpenAmountCents(invoice), 0);
}

function formatCurrency(valueCents: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(valueCents / 100);
}

function humanize(value: string) {
  return value.replace(/_/g, " ");
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function readEnv(name: string) {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[name]?.trim();
}

function resolveApiBaseUrl() {
  const explicitBaseUrl = readEnv("O2C_API_BASE_URL");
  if (explicitBaseUrl) {
    return explicitBaseUrl;
  }

  const env = loadEnv();
  const host = env.API_HOST === "0.0.0.0" ? "127.0.0.1" : env.API_HOST;
  return `http://${host}:${env.API_PORT}`;
}

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/$/, "")}${path}`;
}

function scenarioActions(
  scenarios: PilotReadinessSnapshotLike["scenarios"],
  scenarioId: string
) {
  return scenarios.find((scenario) => scenario.id === scenarioId)?.availableActions ?? [];
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function getRuntimeFetch():
  | ((
      input: string,
      init?: { headers?: Record<string, string> }
    ) => Promise<Response>)
  | undefined {
  return (globalThis as unknown as {
    fetch?: (
      input: string,
      init?: { headers?: Record<string, string> }
    ) => Promise<Response>;
  }).fetch;
}

function isOperatorConsoleData(value: Partial<OperatorConsoleData>): value is OperatorConsoleData {
  return (
    typeof value.generatedAt === "string" &&
    !!value.commandCenterSource &&
    !!value.approvalsSource &&
    Array.isArray(value.metrics) &&
    Array.isArray(value.collectionsQueue) &&
    !!value.controlCenter &&
    Array.isArray(value.paymentsQueue) &&
    !!value.cashApplicationQueue &&
    Array.isArray(value.exceptionsQueue) &&
    Array.isArray(value.approvalsQueue) &&
    Array.isArray(value.aiFeed) &&
    Array.isArray(value.integrations) &&
    Array.isArray(value.automationRules) &&
    Array.isArray(value.screenInventory) &&
    !!value.screenStates
  );
}

function buildSeedOutreachIntelligence(): OutreachConsoleData {
  return {
    contextSummary: {
      accountName: "Metro Retail Group - Makati",
      billingAccountId: "billing_seed_1",
      branchLabels: ["branch_makati"],
      invoiceNumbers: ["INV-24015", "INV-24018"],
      collectibleAmountLabel: "PHP 12,000.00",
      confidenceLabel: "medium (65%)",
      contextSources: [
        "current receivable context",
        "account-level collections memory",
        "relevant communication history",
      ],
    },
    warnings: [
      {
        code: "remittance_pending_review",
        label: "Remittance pending review",
        detail: "A recent remittance exists but still needs review, so the copy stays conservative about payment status.",
      },
      {
        code: "branch_context_preserved",
        label: "Branch context preserved",
        detail: "Known branch routing is visible so the operator can confirm the correct follow-up path.",
      },
    ],
    emailDraft: {
      subjectSuggestions: [
        "2 open invoices follow-up for Metro Retail Group - Makati",
        "Payment status check for Metro Retail Group - Makati",
      ],
      body:
        "Hi Maria Santos,\n\nWe are following up on the current conversation and checking whether payment timing or remittance details are already available.\n\n2 invoices currently show PHP 12,000.00 as collectible at the billing-account level.\n\nIf payment has already been released, please share the remittance reference and our team will review it before making any cash-application claims.\n\nThank you,\nYield AROS Collections",
      toneLabel: "conservative",
      personalizationSummary: "Used 2 invoice facts, 2 account-memory signals, 1 relevant thread for Metro Retail Group - Makati.",
    },
    voiceAgent: {
      agentBrief: "Follow up on open receivables for Metro Retail Group - Makati without over-claiming any payment status.",
      conversationGoal: "Confirm payment timing or remittance status while preserving billing-account and branch context.",
      safeTalkingPoints: [
        "We are following up on the current conversation and checking whether payment timing or remittance details are already available.",
        "2 invoices currently show PHP 12,000.00 as collectible at the billing-account level.",
        "If payment has already been released, please share the remittance reference and our team will review it before making any cash-application claims.",
      ],
      disallowedStatements: [
        "Do not say the remittance has already been matched.",
      ],
      handoffConditions: [
        "Escalate to a human operator if the contact disputes the balance.",
        "Escalate if entity ownership, branch routing, or cash application is unclear.",
      ],
      toneGuidance: "Keep the tone calm, short, and fact-based.",
      readiness: "preview_only",
    },
    smsDraft: {
      variants: [
        "Hi Maria Santos, this is Yield AROS following up on Metro Retail Group - Makati. Please reply with payment timing or remittance status when convenient.",
      ],
      toneLabel: "conservative",
      purposeLabel: "payment_follow_up",
      personalizationSummary: "Used 2 invoice facts, 2 account-memory signals, 1 relevant thread for Metro Retail Group - Makati.",
    },
    previewMode: "email_execution_ready",
  };
}

function buildSeedControlCenter(): ControlCenterConsoleData {
  return {
    workflows: [
      {
        id: "cc_workflow_seed_1",
        tenantId: "default",
        version: 1,
        createdAt: "2026-04-15T09:00:00.000Z",
        updatedAt: "2026-04-15T09:00:00.000Z",
        category: "collections",
        name: "Standard Overdue Collections",
        enabled: true,
        senderEmail: "collections@yieldaros.example",
        testEmailRecipient: "qa-collections@yieldaros.example",
        testCallRecipient: "+639171110000",
        timezone: "Asia/Manila",
        outreachWindowStart: "08:00",
        outreachWindowEnd: "17:30",
        outreachDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        weekendCallingEnabled: false,
        stageCount: 2,
        metadata: { demoCustomerCount: 42, seeded: true },
        approxTargetCount: 42,
        stages: [
          {
            id: "cc_stage_seed_1",
            tenantId: "default",
            version: 1,
            createdAt: "2026-04-15T09:00:00.000Z",
            updatedAt: "2026-04-15T09:00:00.000Z",
            workflowId: "cc_workflow_seed_1",
            order: 1,
            outreachType: "email",
            triggerType: "relative_due_date",
            triggerConfig: { comparator: "due_in_days", offsetDays: 3 },
            templateMode: "pre_saved_template",
            templateId: "cc_template_seed_1",
            notes: "Friendly pre-due reminder for verified AP contacts.",
            enabled: true,
            requiresApproval: false,
            riskHints: ["verified_contact_only", "preserve_branch_context"],
          },
          {
            id: "cc_stage_seed_2",
            tenantId: "default",
            version: 1,
            createdAt: "2026-04-15T09:00:00.000Z",
            updatedAt: "2026-04-15T09:00:00.000Z",
            workflowId: "cc_workflow_seed_1",
            order: 2,
            outreachType: "sms",
            triggerType: "response_gap",
            triggerConfig: { comparator: "no_response_after_prior_stage", referenceStageId: "cc_stage_seed_1" },
            templateMode: "ai_generated",
            aiStrategyId: "strategy_sms_conservative",
            notes: "Conservative short reminder after no response.",
            enabled: true,
            requiresApproval: true,
            riskHints: ["approval_for_non_email", "no_disputed_invoice_chasing"],
          },
        ],
      },
      {
        id: "cc_workflow_seed_2",
        tenantId: "default",
        version: 1,
        createdAt: "2026-04-15T09:00:00.000Z",
        updatedAt: "2026-04-15T09:00:00.000Z",
        category: "payments",
        name: "Payment Follow-up Escalations",
        enabled: false,
        senderEmail: "payments@yieldaros.example",
        timezone: "Asia/Manila",
        outreachWindowStart: "09:00",
        outreachWindowEnd: "16:30",
        outreachDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        weekendCallingEnabled: false,
        stageCount: 1,
        metadata: { demoCustomerCount: 18, seeded: true },
        approxTargetCount: 18,
        stages: [
          {
            id: "cc_stage_seed_3",
            tenantId: "default",
            version: 1,
            createdAt: "2026-04-15T09:00:00.000Z",
            updatedAt: "2026-04-15T09:00:00.000Z",
            workflowId: "cc_workflow_seed_2",
            order: 1,
            outreachType: "call",
            triggerType: "payment_signal_state",
            triggerConfig: { comparator: "remittance_missing_after_payment", offsetDays: 1 },
            templateMode: "ai_generated",
            aiStrategyId: "strategy_voice_remittance",
            notes: "Voice follow-up if payment is detected without remittance.",
            enabled: true,
            requiresApproval: true,
            riskHints: ["payment_signal_requires_careful_language"],
          },
        ],
      },
    ],
    templates: [
      {
        id: "cc_template_seed_1",
        tenantId: "default",
        version: 1,
        createdAt: "2026-04-15T09:00:00.000Z",
        updatedAt: "2026-04-15T09:00:00.000Z",
        name: "Invoice Due Today (Parent)",
        folderId: "cc_folder_seed_1",
        subject: "We're writing to politely [Account #] [Customer_external_id]",
        body: "Salutations {{name}}, we wanted to follow up on the invoices due today and confirm payment timing or remittance details.",
        ccEmails: ["collections@yieldaros.example"],
        channelCompatibility: ["email"],
        autoCorrectEnabled: true,
        isDefault: true,
        isArchived: false,
        previewSeedKey: "bill-default",
      },
      {
        id: "cc_template_seed_2",
        tenantId: "default",
        version: 1,
        createdAt: "2026-04-15T09:00:00.000Z",
        updatedAt: "2026-04-15T09:00:00.000Z",
        name: "Payment Portal",
        folderId: "cc_folder_seed_1",
        subject: "Payment Portal",
        body: "Pay now using the Portal URL and share your remittance confirmation once completed.",
        ccEmails: [],
        channelCompatibility: ["email"],
        autoCorrectEnabled: true,
        isDefault: false,
        isArchived: false,
        previewSeedKey: "bill-default",
      },
      {
        id: "cc_template_seed_3",
        tenantId: "default",
        version: 1,
        createdAt: "2026-04-15T09:00:00.000Z",
        updatedAt: "2026-04-15T09:00:00.000Z",
        name: "Request for remittance outreach",
        subject: "Need more information on your payment",
        body: "Hi, {{customer_name}}. As a follow up on Accounting, thank you for your payment. Could you share the remittance advice for matching?",
        ccEmails: [],
        channelCompatibility: ["email"],
        autoCorrectEnabled: true,
        isDefault: false,
        isArchived: false,
        previewSeedKey: "bill-default",
      },
      {
        id: "cc_template_seed_4",
        tenantId: "default",
        version: 1,
        createdAt: "2026-04-15T09:00:00.000Z",
        updatedAt: "2026-04-15T09:00:00.000Z",
        name: "Reminder (tasks for day 3)",
        subject: "Need you to check on {{customer_name}}",
        body: "Hey can you please follow up with {{customer_name}}. They owe us and we still do not have a response from the latest outreach.",
        ccEmails: [],
        channelCompatibility: ["email"],
        autoCorrectEnabled: false,
        isDefault: false,
        isArchived: false,
        previewSeedKey: "bill-default",
      },
      {
        id: "cc_template_seed_5",
        tenantId: "default",
        version: 1,
        createdAt: "2026-04-15T09:00:00.000Z",
        updatedAt: "2026-04-15T09:00:00.000Z",
        name: "7 days past due",
        subject: "Past due invoice with Customer Company Name",
        body:
          "Hello Customer Name,\n\nI wanted to let you know that you have an overdue balance with us. I wanted to check in and make sure you don't need anything from us.\n\nThe details of the outstanding invoices are as follows:\nOverdue Invoices Summary\n\nWe'd appreciate any status updates you have. I've attached the invoice and below is a URL to review your current account statement and provide payment, if you have not already done so.\nPayment URL\n\n{% if num_upcoming_invoices > 0 %}\nIn addition, you also have an additional balance of Upcoming Balance that will be due soon.\n{% endif %}\n\nIn summary, your current account status is:\nBalance overdue: Overdue Balance\nTotal account balance: Total Account Balance\n\nPlease let us know if you have any questions.",
        ccEmails: ["ar-manager@yieldaros.example"],
        channelCompatibility: ["email"],
        autoCorrectEnabled: true,
        isDefault: false,
        isArchived: false,
        previewSeedKey: "bill-default",
      },
      {
        id: "cc_template_seed_6",
        tenantId: "default",
        version: 1,
        createdAt: "2026-04-15T09:00:00.000Z",
        updatedAt: "2026-04-15T09:00:00.000Z",
        name: "Invoice is due today",
        subject: "Your Sender Company Name invoice is due today",
        body: "Hello {{customer_name}}, You have an invoice that is due today.",
        ccEmails: [],
        channelCompatibility: ["email"],
        autoCorrectEnabled: true,
        isDefault: false,
        isArchived: false,
        previewSeedKey: "bill-default",
      },
      {
        id: "cc_template_seed_7",
        tenantId: "default",
        version: 1,
        createdAt: "2026-04-15T09:00:00.000Z",
        updatedAt: "2026-04-15T09:00:00.000Z",
        name: "14 days past due",
        subject: "[ACTION REQUIRED] Your Sender Company Name invoice is 14 days overdue",
        body: "Hello {{customer_name}}, Thank you and hope you are having a great day but I wanted to note your invoice is still overdue.",
        ccEmails: ["controller@yieldaros.example"],
        channelCompatibility: ["email"],
        autoCorrectEnabled: true,
        isDefault: false,
        isArchived: false,
        previewSeedKey: "bill-default",
      },
      {
        id: "cc_template_seed_8",
        tenantId: "default",
        version: 1,
        createdAt: "2026-04-15T09:00:00.000Z",
        updatedAt: "2026-04-15T09:00:00.000Z",
        name: "21 days past due",
        subject: "[ACTION REQUIRED] Payment is needed on your Acme invoice",
        body: "Hello {{customer_name}}, We are from our team following up because your invoice remains unpaid and needs urgent review.",
        ccEmails: ["controller@yieldaros.example"],
        channelCompatibility: ["email"],
        autoCorrectEnabled: true,
        isDefault: false,
        isArchived: false,
        previewSeedKey: "bill-default",
      },
    ],
    folders: [
      {
        id: "cc_folder_seed_1",
        tenantId: "default",
        version: 1,
        createdAt: "2026-04-15T09:00:00.000Z",
        updatedAt: "2026-04-15T09:00:00.000Z",
        name: "Polish",
      },
    ],
    callAgentConfig: {
      id: "cc_call_agent_seed_1",
      tenantId: "default",
      version: 1,
      createdAt: "2026-04-15T09:00:00.000Z",
      updatedAt: "2026-04-15T09:00:00.000Z",
      phoneNumber: "+63 2 8555 0188",
      smsEnabled: true,
      outboundCallingEnabled: true,
      humanSupportNumber: "+63 2 8555 0199",
      handoffToHumanEnabled: true,
      manualAgentInstructions:
        "Stay factual, ask for remittance or payment timing, and route disputes to a human operator.",
      overrideOpeningLine: "Hello, this is Yield AROS following up on your receivables account.",
      callRecordingDisclaimerEnabled: true,
      providerType: "retell",
      providerConfigMetadata: { environment: "preview" },
      defaultBehaviorFlags: ["collect_branch_context", "capture_ptp", "escalate_on_dispute"],
    },
    config: {
      id: "cc_config_seed_1",
      tenantId: "default",
      version: 1,
      createdAt: "2026-04-15T09:00:00.000Z",
      updatedAt: "2026-04-15T09:00:00.000Z",
      defaultTimezone: "Asia/Manila",
      defaultSenderBehavior: "workflow_specific",
      allowedChannels: ["email", "sms", "call"],
      channelFallbackPolicy: "manual_review_only",
      sandboxMode: "test_recipients_only",
      defaultRiskApprovalMode: "strict",
      seededDemoFlags: { showSeedTargetCounts: true, allowPreviewHandoffs: true },
    },
    generationPreview: {
      email: {
        channel: "email",
        retrievedContext: {
          sourcesUsed: ["receivables", "threads", "learning_signals"],
          selectedThreadIds: ["thread_seed_1"],
          omittedThreadIds: [],
          retrievalOrder: ["current_receivable_context", "account_memory", "communication_history"],
          notes: ["Using verified AP contact only."],
        },
        policy: {
          outreachAllowed: true,
          operatorReviewRequired: false,
          approvalRequired: false,
          escalationRequired: false,
          confidenceLow: false,
          reviewStatus: "ready_for_review",
          disallowedStatements: [],
          prohibitedClaims: [],
          warnings: ["branch_context_preserved", "billing_account_context_preserved"],
          channelRestrictions: {
            email: [],
            voiceAgent: [],
            sms: [],
            autoSendAllowed: true,
            handoffAllowed: true,
          },
          rationale: ["Verified contact and collectible invoices only."],
        },
        emailDraft: {
          kind: "email",
          subjectSuggestions: ["Follow-up for Metro Retail Group - Makati invoices"],
          emailBody:
            "Hi Maria Santos,\n\nWe are following up on the open invoices for Metro Retail Group - Makati. If payment has already been released, please share the remittance reference so we can review it safely.\n\nThank you.",
          toneLabel: "conservative",
          personalizationSummary: "Used billing-account receivables, branch context, and one relevant thread.",
          warnings: ["branch_context_preserved"],
          contextUsed: {
            sourcesUsed: ["receivables", "threads", "learning_signals"],
            selectedThreadIds: ["thread_seed_1"],
            omittedThreadIds: [],
            retrievalOrder: ["current_receivable_context", "account_memory", "communication_history"],
            notes: ["Using verified AP contact only."],
          },
        },
      },
      sms: {
        channel: "sms",
        retrievedContext: {
          sourcesUsed: ["receivables", "learning_signals"],
          selectedThreadIds: [],
          omittedThreadIds: [],
          retrievalOrder: ["current_receivable_context", "account_memory"],
          notes: ["SMS remains approval-gated."],
        },
        policy: {
          outreachAllowed: false,
          operatorReviewRequired: true,
          approvalRequired: true,
          escalationRequired: false,
          confidenceLow: false,
          reviewStatus: "approval_required",
          disallowedStatements: [],
          prohibitedClaims: [],
          warnings: ["approval_required"],
          channelRestrictions: {
            email: [],
            voiceAgent: [],
            sms: ["Manual approval required before SMS send."],
            autoSendAllowed: false,
            handoffAllowed: false,
          },
          rationale: ["SMS is enabled only in supervised mode."],
        },
        smsDraft: {
          kind: "sms",
          variants: ["Yield AROS: Please reply with payment timing or remittance details for your open invoices."],
          messagePurposeLabel: "payment_follow_up",
          toneLabel: "conservative",
          personalizationSummary: "Concise reminder with no cash-application certainty.",
          warnings: ["approval_required"],
          contextUsed: {
            sourcesUsed: ["receivables", "learning_signals"],
            selectedThreadIds: [],
            omittedThreadIds: [],
            retrievalOrder: ["current_receivable_context", "account_memory"],
            notes: ["SMS remains approval-gated."],
          },
        },
      },
      voice: {
        channel: "voice_agent",
        retrievedContext: {
          sourcesUsed: ["receivables", "threads", "learning_signals"],
          selectedThreadIds: ["thread_seed_1"],
          omittedThreadIds: [],
          retrievalOrder: ["current_receivable_context", "account_memory", "communication_history"],
          notes: ["Call preview remains provider-ready only."],
        },
        policy: {
          outreachAllowed: false,
          operatorReviewRequired: true,
          approvalRequired: true,
          escalationRequired: false,
          confidenceLow: false,
          reviewStatus: "approval_required",
          disallowedStatements: ["Do not claim that a payment has already been applied."],
          prohibitedClaims: [],
          warnings: ["approval_required", "branch_context_preserved"],
          channelRestrictions: {
            email: [],
            voiceAgent: ["Human review required before outbound voice follow-up."],
            sms: [],
            autoSendAllowed: false,
            handoffAllowed: true,
          },
          rationale: ["Voice preview is available, but provider execution is not auto-enabled."],
        },
        voicePayload: {
          kind: "voice_agent",
          agentBrief: "Follow up on overdue receivables without over-claiming payment state.",
          conversationGoal: "Confirm payment timing or remittance status and preserve billing account plus branch context.",
          customerContext: ["Billing account: Metro Retail Group - Makati", "Verified AP contact: Maria Santos"],
          receivablesContext: ["2 open invoices", "Collectible exposure remains active"],
          safeTalkingPoints: ["Ask whether payment timing or remittance is already available."],
          disallowedStatements: ["Do not claim that a payment has already been applied."],
          objectionHandlingGuidance: ["Escalate disputes or ambiguity to a human operator."],
          handoffConditions: ["Dispute raised", "Wrong entity or branch identified", "Customer requests human support"],
          toneGuidance: "Keep the tone calm, respectful, and factual.",
          postCallOutcomeSchema: [{ field: "disposition", description: "Outcome of the call", required: true }],
          warnings: ["approval_required"],
          contextUsed: {
            sourcesUsed: ["receivables", "threads", "learning_signals"],
            selectedThreadIds: ["thread_seed_1"],
            omittedThreadIds: [],
            retrievalOrder: ["current_receivable_context", "account_memory", "communication_history"],
            notes: ["Call preview remains provider-ready only."],
          },
        },
      },
    },
    providerPreview: {
      providerType: "retell",
      readyForHandoff: true,
      payload: {
        phoneNumber: "+63 2 8555 0188",
        handoffToHumanEnabled: true,
        humanSupportNumber: "+63 2 8555 0199",
        disclaimerEnabled: true,
      },
    },
  };
}

class OperatorConsoleSourceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "approval_queue_unavailable"
      | "pilot_readiness_unavailable"
      | "invoice_index_unavailable"
  ) {
    super(message);
    this.name = "OperatorConsoleSourceError";
  }
}

function buildSeedInvoiceIndex(): InvoiceIndexResponse {
  const demo = buildDemoSeedBundle();
  const billingAccountById = new Map(
    demo.billingAccounts.map((billingAccount) => [billingAccount.id, billingAccount]),
  );
  const parentAccountById = new Map(
    demo.parentAccounts.map((parentAccount) => [parentAccount.id, parentAccount]),
  );
  const branchById = new Map(demo.branches.map((branch) => [branch.id, branch]));

  const invoices: InvoiceIndexEntry[] = demo.invoices.map((invoice) => {
    const billingAccount = billingAccountById.get(invoice.billingAccountId);
    const parentAccount = parentAccountById.get(invoice.parentAccountId);
    const branch = invoice.branchId ? branchById.get(invoice.branchId) : undefined;
    const status = normalizeSeedInvoiceStatus(invoice.state);
    const openAmountCents = deriveSeedOpenAmount(invoice.amountCents, status);
    const daysPastDue = computeDaysPastDue(invoice.dueDate);

    return {
      id: `seed_demo:${invoice.id}`,
      sourceProvider: "seed_demo",
      sourceKind: "seed",
      sourceLabel: "Seed demo catalog",
      importMode: "seed_fallback",
      canonicalInvoiceId: invoice.id,
      customerName: billingAccount?.displayName ?? invoice.billingAccountId,
      parentAccountId: invoice.parentAccountId,
      ...(parentAccount?.name ? { parentAccountName: parentAccount.name } : {}),
      billingAccountId: invoice.billingAccountId,
      ...(billingAccount?.displayName ? { billingAccountName: billingAccount.displayName } : {}),
      ...(invoice.branchId ? { branchId: invoice.branchId } : {}),
      ...(branch?.name ? { branchName: branch.name } : {}),
      invoiceNumber: invoice.invoiceNumber,
      currency: invoice.currency,
      totalAmountCents: invoice.amountCents,
      openAmountCents,
      paidAmountCents: Math.max(invoice.amountCents - openAmountCents, 0),
      status,
      sourceStatus: invoice.state,
      ...(invoice.invoiceDate ? { issuedAt: invoice.invoiceDate } : {}),
      ...(invoice.dueDate ? { dueDate: invoice.dueDate } : {}),
      ...(invoice.updatedAt ? { lastImportedAt: invoice.updatedAt } : {}),
      ...(daysPastDue !== undefined ? { daysPastDue } : {}),
      tags: [
        "seeded",
        status,
        ...(invoice.branchId ? ["branch-tagged"] : []),
        ...(invoice.state.startsWith("disputed_") ? ["collections-blocked"] : []),
      ],
      metadata: { ...invoice.metadata },
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    source: {
      kind: "seeded",
      label: "Seed-backed invoice index",
      detail: "API invoice index was unavailable, so the web app fell back to demo invoice fixtures.",
    },
    summary: {
      totalInvoices: invoices.length,
      totalAmountCents: invoices.reduce((sum, invoice) => sum + invoice.totalAmountCents, 0),
      openAmountCents: invoices.reduce((sum, invoice) => sum + invoice.openAmountCents, 0),
      openInvoiceCount: invoices.filter((invoice) => invoice.status === "open" || invoice.status === "partial").length,
      overdueInvoiceCount: invoices.filter((invoice) => (invoice.daysPastDue ?? 0) > 0 && invoice.openAmountCents > 0).length,
      disputedInvoiceCount: invoices.filter((invoice) => invoice.status === "disputed").length,
      paidInvoiceCount: invoices.filter((invoice) => invoice.status === "paid").length,
      connectedProviderCount: 0,
    },
    providers: buildProviderSummaries(invoices),
    statuses: buildStatusSummaries(invoices),
    invoices,
  };
}

function buildProviderSummaries(invoices: InvoiceIndexEntry[]): InvoiceIndexProviderSummary[] {
  const summaries = new Map<string, InvoiceIndexProviderSummary>();

  for (const invoice of invoices) {
    const existing = summaries.get(invoice.sourceProvider);
    if (existing) {
      existing.invoiceCount += 1;
      existing.openInvoiceCount += invoice.openAmountCents > 0 ? 1 : 0;
      existing.totalAmountCents += invoice.totalAmountCents;
      existing.openAmountCents += invoice.openAmountCents;
      continue;
    }

    summaries.set(invoice.sourceProvider, {
      provider: invoice.sourceProvider,
      label: invoice.sourceLabel,
      kind: invoice.sourceKind,
      importMode: invoice.importMode,
      invoiceCount: 1,
      openInvoiceCount: invoice.openAmountCents > 0 ? 1 : 0,
      totalAmountCents: invoice.totalAmountCents,
      openAmountCents: invoice.openAmountCents,
    });
  }

  return [...summaries.values()];
}

function buildStatusSummaries(invoices: InvoiceIndexEntry[]): InvoiceIndexStatusSummary[] {
  const statuses: InvoiceIndexStatus[] = ["open", "partial", "disputed", "paid", "voided"];
  return statuses.map((status) => {
    const matching = invoices.filter((invoice) => invoice.status === status);
    return {
      status,
      invoiceCount: matching.length,
      totalAmountCents: matching.reduce((sum, invoice) => sum + invoice.totalAmountCents, 0),
      openAmountCents: matching.reduce((sum, invoice) => sum + invoice.openAmountCents, 0),
    };
  });
}

function normalizeSeedInvoiceStatus(state: string): InvoiceIndexStatus {
  switch (state) {
    case "paid":
      return "paid";
    case "partially_paid":
      return "partial";
    case "disputed_partial":
    case "disputed_full":
      return "disputed";
    case "voided":
      return "voided";
    default:
      return "open";
  }
}

function deriveSeedOpenAmount(amountCents: number, status: InvoiceIndexStatus) {
  switch (status) {
    case "paid":
    case "voided":
      return 0;
    case "partial":
      return Math.round(amountCents / 2);
    default:
      return amountCents;
  }
}

function mergeRuntimeInvoicesIntoIndex(
  baseIndex: InvoiceIndexResponse,
  runtimeImports: InvoiceIndexEntry[],
): InvoiceIndexResponse {
  if (runtimeImports.length === 0) {
    return baseIndex;
  }

  const mergeResult = mergeInvoiceEntriesWithoutDuplicates(baseIndex.invoices, runtimeImports);
  const invoices = mergeResult.invoices.sort(sortInvoiceEntries);
  const importedCount = Math.max(runtimeImports.length - mergeResult.duplicateCount, 0);

  return {
    generatedAt: new Date().toISOString(),
    source: {
      kind: baseIndex.source.kind,
      label: baseIndex.source.label,
      detail: `${baseIndex.source.detail} Includes ${importedCount} unique manual spreadsheet invoice import${importedCount === 1 ? "" : "s"} in this session.`,
    },
    summary: buildInvoiceIndexSummaryFromEntries(invoices),
    providers: buildProviderSummaries(invoices),
    statuses: buildStatusSummaries(invoices),
    invoices,
  };
}

function buildInvoiceIndexSummaryFromEntries(entries: InvoiceIndexEntry[]): InvoiceIndexResponse["summary"] {
  return {
    totalInvoices: entries.length,
    totalAmountCents: entries.reduce((sum, invoice) => sum + invoice.totalAmountCents, 0),
    openAmountCents: entries.reduce((sum, invoice) => sum + invoice.openAmountCents, 0),
    openInvoiceCount: entries.filter((invoice) => invoice.status === "open" || invoice.status === "partial").length,
    overdueInvoiceCount: entries.filter((invoice) => (invoice.daysPastDue ?? 0) > 0 && invoice.openAmountCents > 0).length,
    disputedInvoiceCount: entries.filter((invoice) => invoice.status === "disputed").length,
    paidInvoiceCount: entries.filter((invoice) => invoice.status === "paid").length,
    connectedProviderCount: new Set(entries.map((invoice) => invoice.sourceProvider)).size,
  };
}

function sortInvoiceEntries(left: InvoiceIndexEntry, right: InvoiceIndexEntry) {
  const leftTimestamp = Date.parse(left.lastImportedAt ?? left.issuedAt ?? "");
  const rightTimestamp = Date.parse(right.lastImportedAt ?? right.issuedAt ?? "");
  return (Number.isFinite(rightTimestamp) ? rightTimestamp : 0) - (Number.isFinite(leftTimestamp) ? leftTimestamp : 0);
}

function computeDaysPastDue(dueDate?: string) {
  if (!dueDate) {
    return undefined;
  }

  const due = Date.parse(dueDate);
  if (!Number.isFinite(due)) {
    return undefined;
  }

  const diffDays = Math.floor((Date.now() - due) / 86_400_000);
  return diffDays > 0 ? diffDays : 0;
}

function isInvoiceIndexResponse(value: Partial<InvoiceIndexResponse>): value is InvoiceIndexResponse {
  return (
    typeof value.generatedAt === "string" &&
    !!value.source &&
    !!value.summary &&
    Array.isArray(value.providers) &&
    Array.isArray(value.statuses) &&
    Array.isArray(value.invoices)
  );
}
