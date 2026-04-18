import type { LearningCashApplicationSummary, LearningCollectionsSummary, LearningExceptionSummary, LearningWorkspaceSummary } from "./learning-ui.js";
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
    byType: Array<{
        type: string;
        count: number;
    }>;
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
    matches: CashApplicationMatchItem[];
}
export interface CashApplicationQueueData {
    summary: {
        autoAppliedToday: number;
        needsReview: number;
        unmatched: number;
        partialApplied: number;
        totalUnappliedCashCents: number;
    };
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
export interface OperatorConsoleResponse {
    generatedAt: string;
    commandCenterSource: SourceBadge;
    approvalsSource: SourceBadge;
    approvalsFallbackActive: boolean;
    invoiceIndex: InvoiceIndexResponse;
    metrics: MetricTile[];
    actionSummaries: ActionSummary[];
    dashboardSummaryCards: DashboardSummaryCard[];
    invoiceAgingAnalytics: InvoiceAgingAnalytics;
    overdueExposure: OverdueExposureSummary;
    collectibleVsDisputed: CollectibleVsDisputedSummary;
    linkedPaymentRemittanceStatus: LinkedPaymentRemittanceSummary;
    exceptionCounts: ExceptionCountSummary;
    accountProfileSummaries: AccountProfileSummary[];
    nextActionSummaryCards: NextActionSummaryCard[];
    collectionsQueue: CollectionsQueueItem[];
    accountWorkspace: AccountWorkspaceData;
    invoiceDetail: InvoiceDetailData;
    paymentsQueue: PaymentQueueItem[];
    cashApplicationQueue: CashApplicationQueueData;
    exceptionsQueue: ExceptionQueueItem[];
    approvalsQueue: ApprovalQueueItem[];
    aiFeed: FeedItem[];
    integrations: IntegrationItem[];
    automationRules: AutomationRuleItem[];
    exceptionBreakdown: Array<{
        type: string;
        count: number;
    }>;
    screenInventory: ScreenInventoryItem[];
    screenStates: {
        collectionsEmpty: ScreenState;
        approvalsEmpty: ScreenState;
        aiLoading: ScreenState;
        integrationError: ScreenState;
    };
}
//# sourceMappingURL=operator-console.d.ts.map