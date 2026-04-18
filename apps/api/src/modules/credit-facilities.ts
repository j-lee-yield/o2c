import type { FastifyInstance } from "fastify";

type LoanDashboardReadModel = {
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
};

type CreditFacilityListItem = {
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
  daysPastDueBucket: string;
  utilizationPercent: number;
  status: string;
  actionPath: string;
};

type LoanStatementDetailData = {
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
  daysPastDueBucket: string;
  runningBalanceNote: string;
  paymentApplications: Array<{
    id: string;
    paidAt: string;
    paymentReference: string;
    amountApplied: string;
    appliedPrincipal: string;
    appliedInterest: string;
    appliedDst: string;
    appliedPenalty: string;
    resultingRunningBalance: string;
  }>;
};

type LoanRepaymentHistoryItem = {
  id: string;
  paidAt: string;
  paymentReference: string;
  amount: string;
  appliedPrincipal: string;
  appliedInterest: string;
  appliedDst: string;
  appliedPenalty: string;
  resultingBalance: string;
  status: string;
};

type LoanAlertQueueItem = {
  id: string;
  facilityId: string;
  facilityName: string;
  severity: string;
  title: string;
  summary: string;
  dueAt: string;
  actionPath: string;
};

type LoanTaskQueueItem = {
  id: string;
  facilityId: string;
  facilityName: string;
  title: string;
  owner: string;
  queue: string;
  dueAt: string;
  state: string;
  actionPath: string;
};

const loanDashboard: LoanDashboardReadModel = {
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

const creditFacilities: CreditFacilityListItem[] = [
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
    actionPath: "/org-credit-line/demo/facilities",
  },
  {
    id: "fac-secb-002",
    facilityName: "Security Bank Revolver",
    lenderName: "Security Bank",
    borrowerLegalName: "Yield AROS Manufacturing Inc.",
    currency: "PHP",
    committedLimit: "PHP 12M",
    outstandingBalance: "PHP 11.9M",
    availableToDraw: "PHP 0.1M",
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
    committedLimit: "PHP 10M",
    outstandingBalance: "PHP 2.82M",
    availableToDraw: "PHP 7.18M",
    nextDueDate: "2026-04-05",
    daysPastDue: 17,
    daysPastDueBucket: "days_1_30",
    utilizationPercent: 28,
    status: "watchlist",
    actionPath: "/org-credit-line/demo/facilities",
  },
];

const loanStatementDetail: LoanStatementDetailData = {
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
};

const loanRepaymentHistory: LoanRepaymentHistoryItem[] = [
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
  {
    id: "loan-pay-2",
    paidAt: "2026-02-15",
    paymentReference: "PYMT-86107",
    amount: "PHP 1.1M",
    appliedPrincipal: "PHP 900K",
    appliedInterest: "PHP 160K",
    appliedDst: "PHP 20K",
    appliedPenalty: "PHP 20K",
    resultingBalance: "PHP 3.45M",
    status: "posted",
  },
];

const loanAlerts: LoanAlertQueueItem[] = [
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
    summary:
      "Available headroom is below PHP 100K and new drawdowns should be reviewed carefully.",
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

const loanTasks: LoanTaskQueueItem[] = [
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

export const registerCreditFacilityRoutes = (app: FastifyInstance): void => {
  app.get("/v1/credit_facilities", async () => ({
    module: "credit_facilities",
    status: "demo_stub",
    disclaimer:
      "Org credit line remains a demo/stub surface until approval, audit, and source-of-truth wiring are complete.",
    loanDashboard,
    creditFacilities,
    loanStatementDetail,
    loanRepaymentHistory,
    loanAlerts,
    loanTasks,
  }));
};
