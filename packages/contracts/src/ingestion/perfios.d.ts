import type { ConnectorProvider } from "../integrations/connectors.js";
import type { CurrencyCode } from "../index.js";
import type { UploadedDocumentEnvelope } from "./normalization.js";
export type PerfiosSourceProvider = Extract<ConnectorProvider, "perfios">;
export type PerfiosConfidenceLevel = "high" | "medium" | "low";
export type PerfiosInferredDirection = "debit" | "credit" | "unknown";
export type PerfiosAutomationEligibility = "matching_suggestions_and_auto_apply_evaluation" | "matching_suggestions_only" | "blocked_pending_correction";
export type PerfiosTransactionFieldName = "external_transaction_id" | "transaction_date" | "value_date" | "description" | "reference_number" | "debit_amount" | "credit_amount" | "running_balance" | "inferred_direction" | "parser_confidence" | "source_page" | "source_row";
export interface PerfiosHumanFieldCorrection<TValue = unknown> {
    previous_value?: TValue;
    corrected_value: TValue;
    corrected_at: string;
    corrected_by: string;
    reason?: string;
}
export type PerfiosHumanCorrectedFields = Partial<Record<PerfiosTransactionFieldName, PerfiosHumanFieldCorrection>>;
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
    transaction_date: string;
    value_date?: string;
    description: string;
    reference_number?: string;
    debit_amount?: number;
    credit_amount?: number;
    running_balance?: number;
    inferred_direction?: PerfiosInferredDirection;
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
    transaction_date: string;
    value_date?: string;
    description: string;
    reference_number?: string;
    debit_amount?: number;
    credit_amount?: number;
    running_balance?: number;
    inferred_direction: PerfiosInferredDirection;
    parser_confidence: number;
    parser_confidence_level: PerfiosConfidenceLevel;
    source_page?: number;
    source_row?: number;
    duplicate_flag: boolean;
    human_corrected_fields: PerfiosHumanCorrectedFields;
    automation_eligibility: PerfiosAutomationEligibility;
    reconciliation_ready: boolean;
    created_at: string;
    metadata?: Record<string, unknown>;
}
//# sourceMappingURL=perfios.d.ts.map