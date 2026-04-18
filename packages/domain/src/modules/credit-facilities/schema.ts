import { createEntityMetadata, type DomainEntity } from "../../shared/types.js";

export const creditFacilityStates = ["active", "watchlist", "suspended", "closed"] as const;
export type CreditFacilityState = (typeof creditFacilityStates)[number];

export const loanDrawdownStates = ["draft", "outstanding", "repaid", "restructured", "written_off"] as const;
export type LoanDrawdownState = (typeof loanDrawdownStates)[number];

export const loanStatementSources = ["lender_soa", "portal_export", "manual_upload", "api_sync"] as const;
export type LoanStatementSource = (typeof loanStatementSources)[number];

export const loanPaymentStates = ["scheduled", "posted", "returned", "reversed"] as const;
export type LoanPaymentState = (typeof loanPaymentStates)[number];

export const loanTaskStates = ["open", "in_progress", "blocked", "completed"] as const;
export type LoanTaskState = (typeof loanTaskStates)[number];

export const loanAlertSeverities = ["info", "warning", "critical"] as const;
export type LoanAlertSeverity = (typeof loanAlertSeverities)[number];

export const loanDocumentTypes = ["facility_offer", "statement_of_account", "promissory_note", "repayment_proof", "correspondence", "other"] as const;
export type LoanDocumentType = (typeof loanDocumentTypes)[number];

export const loanDpdBuckets = [
  "current",
  "days_1_30",
  "days_31_60",
  "days_61_90",
  "days_91_120",
  "days_120_plus",
] as const;
export type LoanDpdBucket = (typeof loanDpdBuckets)[number];

export interface CreditFacility extends DomainEntity {
  organizationId: string;
  facilityName: string;
  lenderName: string;
  borrowerLegalName: string;
  currency: string;
  limitAmountCents: number;
  committedAmountCents: number;
  availableAmountCents: number;
  maturityDate?: string;
  interestRateBps?: number;
  penaltyRateBps?: number;
  state: CreditFacilityState;
  metadata: Record<string, unknown>;
}

export interface CreditLineSummary extends DomainEntity {
  creditFacilityId: string;
  currency: string;
  totalOutstandingCents: number;
  principalOutstandingCents: number;
  accruedInterestCents: number;
  accruedDstCents: number;
  accruedPenaltyCents: number;
  totalPaidCents: number;
  availableToDrawCents: number;
  utilizationRatio: number;
  daysPastDue: number;
  daysPastDueBucket: LoanDpdBucket;
  nextDueDate?: string;
  metadata: Record<string, unknown>;
}

export interface LoanDrawdown extends DomainEntity {
  creditFacilityId: string;
  drawdownReference: string;
  currency: string;
  principalAmountCents: number;
  drawdownDate: string;
  maturityDate?: string;
  state: LoanDrawdownState;
  metadata: Record<string, unknown>;
}

export interface LoanStatementPaymentApplication {
  id: string;
  paidAt: string;
  paymentReference: string;
  amountAppliedCents: number;
  appliedPrincipalCents: number;
  appliedInterestCents: number;
  appliedDstCents: number;
  appliedPenaltyCents: number;
  resultingRunningBalanceCents?: number;
  metadata: Record<string, unknown>;
}

export interface LoanStatementRunningBalance {
  id: string;
  asOf: string;
  principalBalanceCents: number;
  interestBalanceCents: number;
  dstBalanceCents: number;
  penaltyBalanceCents: number;
  totalBalanceCents: number;
}

export interface LoanStatement extends DomainEntity {
  creditFacilityId: string;
  statementReference: string;
  source: LoanStatementSource;
  statementDate: string;
  periodStart?: string;
  periodEnd?: string;
  openingBalanceCents: number;
  closingBalanceCents: number;
  principalDueCents: number;
  interestDueCents: number;
  dstDueCents: number;
  penaltyDueCents: number;
  totalDueCents: number;
  daysPastDue: number;
  daysPastDueBucket: LoanDpdBucket;
  paymentApplications: LoanStatementPaymentApplication[];
  runningBalances: LoanStatementRunningBalance[];
  metadata: Record<string, unknown>;
}

export interface LoanPayment extends DomainEntity {
  creditFacilityId: string;
  paymentReference: string;
  currency: string;
  amountCents: number;
  paidAt: string;
  state: LoanPaymentState;
  metadata: Record<string, unknown>;
}

export interface LoanPaymentApplication extends DomainEntity {
  creditFacilityId: string;
  loanPaymentId: string;
  loanStatementId?: string;
  currency: string;
  amountAppliedCents: number;
  appliedPrincipalCents: number;
  appliedInterestCents: number;
  appliedDstCents: number;
  appliedPenaltyCents: number;
  resultingOutstandingCents?: number;
  metadata: Record<string, unknown>;
}

export interface LoanBalanceSnapshot extends DomainEntity {
  creditFacilityId: string;
  capturedAt: string;
  currency: string;
  principalOutstandingCents: number;
  accruedInterestCents: number;
  accruedDstCents: number;
  accruedPenaltyCents: number;
  totalOutstandingCents: number;
  availableToDrawCents: number;
  daysPastDue: number;
  daysPastDueBucket: LoanDpdBucket;
  metadata: Record<string, unknown>;
}

export interface LoanTask extends DomainEntity {
  creditFacilityId: string;
  title: string;
  description: string;
  owner: string;
  dueAt?: string;
  state: LoanTaskState;
  queue: "operations" | "finance" | "treasury" | "legal";
  metadata: Record<string, unknown>;
}

export interface LoanDocument extends DomainEntity {
  creditFacilityId: string;
  documentType: LoanDocumentType;
  documentId: string;
  fileName: string;
  uploadedAt: string;
  metadata: Record<string, unknown>;
}

export interface LoanAlert extends DomainEntity {
  creditFacilityId: string;
  severity: LoanAlertSeverity;
  title: string;
  summary: string;
  dueAt?: string;
  metadata: Record<string, unknown>;
}

export function deriveLoanDpdBucket(daysPastDue: number): LoanDpdBucket {
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
  if (daysPastDue <= 120) {
    return "days_91_120";
  }
  return "days_120_plus";
}

export function createCreditLineSummary(input: {
  id: string;
  createdAt: string;
  creditFacilityId: string;
  currency: string;
  limitAmountCents: number;
  principalOutstandingCents: number;
  accruedInterestCents: number;
  accruedDstCents: number;
  accruedPenaltyCents: number;
  totalPaidCents: number;
  daysPastDue: number;
  nextDueDate?: string;
  metadata?: Record<string, unknown>;
}): CreditLineSummary {
  const totalOutstandingCents =
    input.principalOutstandingCents +
    input.accruedInterestCents +
    input.accruedDstCents +
    input.accruedPenaltyCents;

  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.createdAt,
      actorId: "system_credit_line",
      actorRole: "system",
    }),
    creditFacilityId: input.creditFacilityId,
    currency: input.currency,
    totalOutstandingCents,
    principalOutstandingCents: input.principalOutstandingCents,
    accruedInterestCents: input.accruedInterestCents,
    accruedDstCents: input.accruedDstCents,
    accruedPenaltyCents: input.accruedPenaltyCents,
    totalPaidCents: input.totalPaidCents,
    availableToDrawCents: Math.max(input.limitAmountCents - input.principalOutstandingCents, 0),
    utilizationRatio:
      input.limitAmountCents > 0
        ? input.principalOutstandingCents / input.limitAmountCents
        : 0,
    daysPastDue: input.daysPastDue,
    daysPastDueBucket: deriveLoanDpdBucket(input.daysPastDue),
    ...(input.nextDueDate ? { nextDueDate: input.nextDueDate } : {}),
    metadata: input.metadata ?? {},
  };
}

export function createLoanBalanceSnapshotFromStatement(input: {
  id: string;
  createdAt: string;
  creditFacilityId: string;
  currency: string;
  facilityLimitCents: number;
  statement: Pick<
    LoanStatement,
    | "closingBalanceCents"
    | "principalDueCents"
    | "interestDueCents"
    | "dstDueCents"
    | "penaltyDueCents"
    | "daysPastDue"
    | "daysPastDueBucket"
  >;
  metadata?: Record<string, unknown>;
}): LoanBalanceSnapshot {
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.createdAt,
      actorId: "system_credit_line",
      actorRole: "system",
    }),
    creditFacilityId: input.creditFacilityId,
    capturedAt: input.createdAt,
    currency: input.currency,
    principalOutstandingCents: input.statement.principalDueCents,
    accruedInterestCents: input.statement.interestDueCents,
    accruedDstCents: input.statement.dstDueCents,
    accruedPenaltyCents: input.statement.penaltyDueCents,
    totalOutstandingCents: input.statement.closingBalanceCents,
    availableToDrawCents: Math.max(
      input.facilityLimitCents - input.statement.principalDueCents,
      0,
    ),
    daysPastDue: input.statement.daysPastDue,
    daysPastDueBucket: input.statement.daysPastDueBucket,
    metadata: input.metadata ?? {},
  };
}

export function createLoanAlertFromSummary(input: {
  id: string;
  createdAt: string;
  creditFacilityId: string;
  summary: Pick<CreditLineSummary, "daysPastDue" | "utilizationRatio" | "nextDueDate">;
}): LoanAlert | undefined {
  if (input.summary.daysPastDue > 0) {
    return {
      id: input.id,
      ...createEntityMetadata({
        at: input.createdAt,
        actorId: "system_credit_line",
        actorRole: "system",
      }),
      creditFacilityId: input.creditFacilityId,
      severity: input.summary.daysPastDue > 30 ? "critical" : "warning",
      title: "Loan repayment overdue",
      summary: `Facility is ${input.summary.daysPastDue} days past due and needs treasury follow-up.`,
      ...(input.summary.nextDueDate ? { dueAt: input.summary.nextDueDate } : {}),
      metadata: {
        trigger: "dpd_threshold",
      },
    };
  }

  if (input.summary.utilizationRatio >= 0.9) {
    return {
      id: input.id,
      ...createEntityMetadata({
        at: input.createdAt,
        actorId: "system_credit_line",
        actorRole: "system",
      }),
      creditFacilityId: input.creditFacilityId,
      severity: "warning",
      title: "Facility nearing full utilization",
      summary: "Available headroom is below 10% of the committed line.",
      ...(input.summary.nextDueDate ? { dueAt: input.summary.nextDueDate } : {}),
      metadata: {
        trigger: "utilization_threshold",
      },
    };
  }

  return undefined;
}
