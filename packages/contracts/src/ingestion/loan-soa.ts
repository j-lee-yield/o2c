import type { ConnectorProvider } from "../integrations/connectors.js";
import type { ParsedField, UploadedDocumentEnvelope } from "./normalization.js";

export type LoanSoaSourceProvider = Extract<ConnectorProvider, "yield"> | "native_heuristic";

export type LoanSoaDpdBucket =
  | "current"
  | "days_1_30"
  | "days_31_60"
  | "days_61_90"
  | "days_91_120"
  | "days_120_plus";

export interface LoanSoaMoneyField extends ParsedField<number> {
  currency?: string;
}

export interface LoanSoaPaymentApplicationLine {
  paidAt?: ParsedField<string>;
  paymentReference?: ParsedField<string>;
  amountAppliedCents: LoanSoaMoneyField;
  appliedPrincipalCents?: LoanSoaMoneyField;
  appliedInterestCents?: LoanSoaMoneyField;
  appliedDstCents?: LoanSoaMoneyField;
  appliedPenaltyCents?: LoanSoaMoneyField;
  resultingRunningBalanceCents?: LoanSoaMoneyField;
}

export interface LoanSoaRunningBalanceLine {
  asOf?: ParsedField<string>;
  principalBalanceCents?: LoanSoaMoneyField;
  interestBalanceCents?: LoanSoaMoneyField;
  dstBalanceCents?: LoanSoaMoneyField;
  penaltyBalanceCents?: LoanSoaMoneyField;
  totalBalanceCents: LoanSoaMoneyField;
}

export interface ParsedLoanSoaResult {
  parser: LoanSoaSourceProvider;
  document: UploadedDocumentEnvelope;
  overallConfidence: number;
  lenderName?: ParsedField<string>;
  facilityReference?: ParsedField<string>;
  statementReference?: ParsedField<string>;
  statementDate?: ParsedField<string>;
  periodStart?: ParsedField<string>;
  periodEnd?: ParsedField<string>;
  openingBalanceCents?: LoanSoaMoneyField;
  closingBalanceCents?: LoanSoaMoneyField;
  principalDueCents?: LoanSoaMoneyField;
  interestDueCents?: LoanSoaMoneyField;
  dstDueCents?: LoanSoaMoneyField;
  penaltyDueCents?: LoanSoaMoneyField;
  totalDueCents?: LoanSoaMoneyField;
  daysPastDue?: ParsedField<number>;
  daysPastDueBucket?: ParsedField<LoanSoaDpdBucket>;
  paymentApplications: LoanSoaPaymentApplicationLine[];
  runningBalances: LoanSoaRunningBalanceLine[];
  rawPayload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface LoanSoaParser {
  parse(input: UploadedDocumentEnvelope): Promise<ParsedLoanSoaResult>;
}
