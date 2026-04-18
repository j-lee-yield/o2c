import type { ConnectorProvider } from "../integrations/connectors.js";
import type { CurrencyCode } from "../index.js";
import type { UploadedDocumentEnvelope } from "./normalization.js";

export type PerfiosSourceProvider = Extract<ConnectorProvider, "perfios">;

export type PerfiosConfidenceLevel = "high" | "medium" | "low";

export type PerfiosInferredDirection = "debit" | "credit" | "unknown";

export type BankTransactionDuplicateStatus =
  | "unknown"
  | "unique"
  | "exact_duplicate"
  | "suspected_duplicate";

export type BankTransactionSettlementHint = "instant" | "transfer" | "check" | "unknown";

export type BankTransactionSettlementStatus =
  | "pending_source_confirmation"
  | "pending_clearance"
  | "settled"
  | "reversed"
  | "failed_clearance";

export type BankTransactionReviewStatus = "none" | "needs_review" | "approved" | "exception";

export type PaymentCandidateConfidenceBand = "high" | "medium" | "low" | "unknown";

export type PaymentCandidateStatus =
  | "ingested_unmatched"
  | "candidate_match_found"
  | "review_required"
  | "unapplied_cash"
  | "promoted_to_payment"
  | "reversed";

export type PaymentReviewReasonCode =
  | "pending_check_clearance"
  | "possible_bir_withholding_unconfirmed"
  | "form_2307_missing"
  | "mixed_goods_services_tax_basis_unclear"
  | "short_payment_unexplained"
  | "cross_entity_payer_ambiguity"
  | "conflicting_remittance"
  | "bank_transaction_duplicate_suspected"
  | "writeback_path_unavailable"
  | "bank_charge_variance_review"
  | "reversal_risk_not_cleared";

export type PerfiosAutomationEligibility =
  | "matching_suggestions_and_auto_apply_evaluation"
  | "matching_suggestions_only"
  | "blocked_pending_correction";

export type PerfiosTransactionFieldName =
  | "external_transaction_id"
  | "date"
  | "cheque_number"
  | "description"
  | "amount"
  | "balance"
  | "category"
  | "parser_confidence"
  | "source_page"
  | "source_row";

export interface PerfiosHumanFieldCorrection<TValue = unknown> {
  previous_value?: TValue;
  corrected_value: TValue;
  corrected_at: string;
  corrected_by: string;
  reason?: string;
}

export type PerfiosHumanCorrectedFields = Partial<
  Record<PerfiosTransactionFieldName, PerfiosHumanFieldCorrection>
>;

export interface PerfiosRawStatementPayloadRecord {
  raw_payload_id: string;
  document_id: string;
  source_provider: PerfiosSourceProvider;
  payload: Record<string, unknown>;
  received_at: string;
}

export interface PerfiosParsedStatementDraft {
  bank_name?: string;
  account_name?: string;
  account_number_masked?: string;
  statement_period_start?: string;
  statement_period_end?: string;
  currency?: CurrencyCode;
  parser_confidence: number;
  metadata?: Record<string, unknown>;
}

export interface PerfiosParsedTransactionDraft {
  external_transaction_id?: string;
  date: string;
  cheque_number?: string;
  description: string;
  amount: number;
  balance?: number;
  category?: string;
  parser_confidence: number;
  source_page?: number;
  source_row?: number;
  metadata?: Record<string, unknown>;
}

export interface PerfiosParsedBankStatement {
  provider: PerfiosSourceProvider;
  document: UploadedDocumentEnvelope;
  raw_payload: Record<string, unknown>;
  statement: PerfiosParsedStatementDraft;
  transactions: PerfiosParsedTransactionDraft[];
}

export interface PerfiosNormalizedStatementRecord {
  statement_id: string;
  document_id: string;
  raw_payload_id: string;
  bank_name?: string;
  account_name?: string;
  account_number_masked?: string;
  statement_period_start?: string;
  statement_period_end?: string;
  currency?: CurrencyCode;
  source_provider: PerfiosSourceProvider;
  parser_confidence: number;
  parser_confidence_level: PerfiosConfidenceLevel;
  reconciliation_ready: boolean;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface PerfiosNormalizedTransactionRecord {
  transaction_id: string;
  statement_id: string;
  external_transaction_id?: string;
  date: string;
  cheque_number?: string;
  description: string;
  amount: number;
  balance?: number;
  category?: string;
  inferred_direction: PerfiosInferredDirection;
  parser_confidence: number;
  parser_confidence_level: PerfiosConfidenceLevel;
  source_page?: number;
  source_row?: number;
  duplicate_flag: boolean;
  duplicate_status: BankTransactionDuplicateStatus;
  candidate_payment_flag: boolean;
  settlement_hint: BankTransactionSettlementHint;
  settlement_status: BankTransactionSettlementStatus;
  review_status: BankTransactionReviewStatus;
  human_corrected_fields: PerfiosHumanCorrectedFields;
  automation_eligibility: PerfiosAutomationEligibility;
  reconciliation_ready: boolean;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentCandidateRecord {
  payment_candidate_id: string;
  tenant_id: string;
  statement_id: string;
  source_bank_transaction_ids: string[];
  customer_profile_id?: string;
  inferred_customer_profile_id?: string;
  payer_name?: string;
  amount_minor: number;
  currency: CurrencyCode;
  payment_reference?: string;
  settlement_hint: BankTransactionSettlementHint;
  settlement_status: BankTransactionSettlementStatus;
  confidence_score?: number;
  confidence_band: PaymentCandidateConfidenceBand;
  review_reason_codes: PaymentReviewReasonCode[];
  status: PaymentCandidateStatus;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}
