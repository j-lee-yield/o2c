import type {
  LearningCashApplicationSummary,
  LearningCollectionsSummary,
  LearningExceptionSummary,
  LearningWorkspaceSummary,
} from "./learning-ui.js";
import type { ControlCenterConsoleData } from "./control-center.js";
import type { InvoiceIndexResponse } from "./invoices/index.js";

export interface SourceBadge {
  kind: "live" | "seeded" | "stub";
  label: string;
  detail: string;
}

export interface OperatorAction {
  label: string;
  path: string;
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

export interface DashboardSummaryCard {
  id: string;
  title: string;
  value: string;
  detail: string;
  tone: "success" | "danger" | "warning" | "info" | "violet" | "neutral";
  actionLabel?: string;
  actionPath?: string;
}

export interface InvoiceAgingBucket {
  id: "current" | "days_1_30" | "days_31_60" | "days_61_90" | "days_90_plus";
  label: string;
  invoiceCount: number;
  openAmountCents: number;
  collectibleAmountCents: number;
  disputedAmountCents: number;
}

export interface InvoiceAgingAnalytics {
  asOf: string;
  buckets: InvoiceAgingBucket[];
  overdueInvoiceCount: number;
  overdueOpenAmountCents: number;
  overdueCollectibleAmountCents: number;
}

export interface OverdueExposureSummary {
  overdueInvoiceCount: number;
  overdueOpenAmountCents: number;
  overdueCollectibleAmountCents: number;
  blockedDisputedAmountCents: number;
  severeOverdueInvoiceCount: number;
  severeOverdueAmountCents: number;
}

export interface CollectibleVsDisputedSummary {
  collectibleOpenAmountCents: number;
  disputedOpenAmountCents: number;
  partialDisputeCollectibleAmountCents: number;
  fullyDisputedAmountCents: number;
  collectibleCoverageRatio: number;
}

export interface LinkedPaymentRemittanceSummary {
  invoicesWithLinkedPaymentsCount: number;
  paymentsAwaitingReviewCount: number;
  unappliedPaymentsCount: number;
  remittancesLinkedToPaymentCount: number;
  remittancesAwaitingReviewCount: number;
  remittancesOrphanedCount: number;
}

export interface ExceptionCountSummary {
  totalOpen: number;
  highSeverity: number;
  waitingOnCustomer: number;
  readyForResolution: number;
  byType: Array<{ type: string; count: number }>;
}

export interface AccountProfileSummary {
  billingAccountId: string;
  accountName: string;
  parentAccountName?: string;
  accountTier: "standard" | "strategic" | "unknown";
  openAmount: string;
  overdueAmount: string;
  collectibleAmount: string;
  disputedAmount: string;
  openInvoiceCount: number;
  promisesDueToday: number;
  nextAction: string;
  linkedStatus: string;
}

export type CustomerProfileTabId =
  | "overview"
  | "invoices"
  | "tasks"
  | "activity"
  | "payments"
  | "ap_portal"
  | "deductions";

export interface CustomerProfileTabSummary {
  id: CustomerProfileTabId;
  label: string;
  itemCount: number;
  status: "ready" | "attention" | "empty";
}

export interface CustomerIndexItem {
  profileId: string;
  canonicalName: string;
  status: "active" | "pending_review" | "merged";
  accountTier: "standard" | "strategic" | "unknown";
  parentAccountName?: string;
  billingAccountId?: string;
  billingAccountName?: string;
  branchNames: string[];
  primaryContactEmail?: string;
  openAmount: string;
  overdueAmount: string;
  collectibleAmount: string;
  disputedAmount: string;
  openInvoiceCount: number;
  taskCount: number;
  completenessScore: number;
  nextAction: string;
  hasPendingReview: boolean;
  tabs: CustomerProfileTabSummary[];
}

export interface CustomerOverviewSummary {
  canonicalName: string;
  legalEntityName?: string;
  taxId?: string;
  status: "active" | "pending_review" | "merged";
  accountTier: "standard" | "strategic" | "unknown";
  parentAccountName?: string;
  billingAccountName?: string;
  branchNames: string[];
  hierarchySummary: string;
}

export interface CustomerContactSummary {
  totalContacts: number;
  verifiedContacts: number;
  autoSendEligibleContacts: number;
  sharedMailboxContacts: number;
  hasVerifiedPrimaryContact: boolean;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  primaryContactRole?: string;
}

export interface CustomerInsightSummary {
  conciseSummary: string;
  preferredChannel?: string;
  nextBestAction?: string;
  remittanceQuality?: string;
  centralizedPayerConfidence?: number;
  duplicateReviewPending: boolean;
  primaryContactReviewPending: boolean;
  explanation: string[];
}

export interface CustomerFinancialSummary {
  currency: string;
  openAmount: string;
  overdueAmount: string;
  collectibleAmount: string;
  disputedAmount: string;
  unappliedCashAmount: string;
  openInvoiceCount: number;
  overdueInvoiceCount: number;
  disputedInvoiceCount: number;
  paymentCount: number;
  remittanceCount: number;
  lastPaymentAt?: string;
}

export interface CustomerCompletenessCheckItem {
  id: string;
  label: string;
  status: "complete" | "warning" | "missing";
  detail: string;
}

export interface CustomerCompletenessCheck {
  score: number;
  completedCount: number;
  totalCount: number;
  status: "complete" | "warning" | "missing";
  items: CustomerCompletenessCheckItem[];
}

export interface CustomerProfileNoteItem {
  id: string;
  kind: "system" | "operator" | "credit" | "collections";
  body: string;
  source: string;
  createdAt: string;
}

export interface CustomerCreditProfileSummary {
  riskLevel: "low" | "medium" | "high" | "unknown";
  hasCreditHold: boolean;
  hasOverdueBalance: boolean;
  internalCreditLimit?: string;
  availableCredit?: string;
  blockedReasons: string[];
}

export interface CustomerProfileWorkspaceData {
  profileId: string;
  overviewSummary: CustomerOverviewSummary;
  contactSummary: CustomerContactSummary;
  insightSummary: CustomerInsightSummary;
  financialSummary: CustomerFinancialSummary;
  completenessCheck: CustomerCompletenessCheck;
  notes: CustomerProfileNoteItem[];
  creditProfile: CustomerCreditProfileSummary;
  tabs: CustomerProfileTabSummary[];
  learning?: LearningWorkspaceSummary;
}

export interface NextActionSummaryCard {
  id: string;
  title: string;
  summary: string;
  severity: "normal" | "attention" | "critical";
  count: number;
  actionLabel?: string;
  actionPath?: string;
}

export interface CollectionsQueueItem {
  id: string;
  accountReference?: string;
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

export interface InvoiceLinkedStatusItem {
  id: string;
  kind: "payment" | "remittance";
  reference: string;
  status: string;
  amount?: string;
  detail: string;
}

export interface InvoiceDetailData {
  invoiceNumber: string;
  billingAccountId: string;
  branchId: string;
  status: string;
  amount: string;
  dueDate: string;
  disputeState: string;
  nextAction: string;
  explanation: string;
  collectibleAmount?: string;
  disputedAmount?: string;
  linkedStatuses: InvoiceLinkedStatusItem[];
}

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

export type LoanDpdBucket =
  | "current"
  | "days_1_30"
  | "days_31_60"
  | "days_61_90"
  | "days_91_120"
  | "days_120_plus";

export interface LoanDashboardReadModel {
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

export interface CreditFacilityListItem {
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

export interface LoanStatementDetailPaymentApplication {
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

export interface LoanStatementDetailData {
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
  paymentApplications: LoanStatementDetailPaymentApplication[];
}

export interface LoanRepaymentHistoryItem {
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

export interface LoanAlertQueueItem {
  id: string;
  facilityId: string;
  facilityName: string;
  severity: "info" | "warning" | "critical";
  title: string;
  summary: string;
  dueAt: string;
  actionPath: string;
}

export interface LoanTaskQueueItem {
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

export interface HomeSetupChecklistItem {
  id: string;
  title: string;
  detail: string;
  status: "complete" | "pending";
  actionLabel?: string;
  actionPath?: string;
}

export interface HomeSetupChecklistReadModel {
  title: string;
  outstandingCount: number;
  items: HomeSetupChecklistItem[];
}

export interface HomeTaskSummaryItem {
  id: string;
  label: string;
  detail: string;
  count: number;
  actionPath: string;
}

export interface HomeTaskSummaryView {
  id: "by_customer" | "by_task_type" | "all_tasks";
  label: string;
  totalCount: number;
  actionPath: string;
  items: HomeTaskSummaryItem[];
}

export interface HomeTaskSummaryReadModel {
  title: string;
  views: HomeTaskSummaryView[];
}

export interface HomeCollectionsMetricsReadModel {
  title: string;
  periodLabel: string;
  outreachActivityCount: number;
  collectedAmountCents: number;
  automatedTaskCount: number;
  totalCollectedAmountCents: number;
  actionPath: string;
}

export interface HomeSnapshotMetricsReadModel {
  title: string;
  openInvoiceCount: number;
  outstandingBalanceCents: number;
  overdueInvoiceCount: number;
  overdueBalanceCents: number;
  actionPath: string;
}

export interface HomeAgingBalanceBucket {
  id: InvoiceAgingBucket["id"];
  label: string;
  openAmountCents: number;
  invoiceCount: number;
  actionPath: string;
}

export interface HomeAgingBalanceReadModel {
  title: string;
  subtitle: string;
  asOf: string;
  buckets: HomeAgingBalanceBucket[];
  actionPath: string;
}

export interface OutreachConsoleWarning {
  code: string;
  label: string;
  detail: string;
}

export interface OutreachConsolePreview {
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

export interface OperatorConsoleResponse {
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
  outreachIntelligence: OutreachConsolePreview;
  controlCenter: ControlCenterConsoleData;
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
  loanDashboard: LoanDashboardReadModel;
  creditFacilities: CreditFacilityListItem[];
  loanStatementDetail: LoanStatementDetailData;
  loanRepaymentHistory: LoanRepaymentHistoryItem[];
  loanAlerts: LoanAlertQueueItem[];
  loanTasks: LoanTaskQueueItem[];
  exceptionsQueue: ExceptionQueueItem[];
  approvalsQueue: ApprovalQueueItem[];
  aiFeed: FeedItem[];
  integrations: IntegrationItem[];
  automationRules: AutomationRuleItem[];
  exceptionBreakdown: Array<{ type: string; count: number }>;
  screenInventory: ScreenInventoryItem[];
  screenStates: {
    collectionsEmpty: ScreenState;
    approvalsEmpty: ScreenState;
    aiLoading: ScreenState;
    integrationError: ScreenState;
  };
}
