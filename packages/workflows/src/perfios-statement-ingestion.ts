import type { AuditLogger } from "@o2c/audit";
import type {
  AuditContext,
  BankTransactionDuplicateStatus,
  BankTransactionReviewStatus,
  BankTransactionSettlementHint,
  BankTransactionSettlementStatus,
  DuplicateSignalInput,
  PerfiosAutomationEligibility,
  PerfiosConfidenceLevel,
  PerfiosHumanCorrectedFields,
  PerfiosHumanFieldCorrection,
  PerfiosInferredDirection,
  PerfiosNormalizedStatementRecord,
  PerfiosNormalizedTransactionRecord,
  PerfiosParsedBankStatement,
  PerfiosParsedStatementDraft,
  PerfiosParsedTransactionDraft,
  PerfiosRawStatementPayloadRecord,
  ReviewDecision,
  UploadedDocumentEnvelope,
} from "@o2c/contracts";

import { classifyDuplicateSignals } from "./ingestion-foundation.js";

export interface PerfiosStatementParser {
  parse(request: { document: UploadedDocumentEnvelope; fileReference: string }): Promise<PerfiosParsedBankStatement>;
}

export interface PerfiosRawPayloadRepository {
  save(input: Omit<PerfiosRawStatementPayloadRecord, "raw_payload_id">): Promise<PerfiosRawStatementPayloadRecord>;
}

export interface PerfiosStatementRepository {
  save(input: Omit<PerfiosNormalizedStatementRecord, "statement_id">): Promise<PerfiosNormalizedStatementRecord>;
}

export interface PerfiosTransactionRepository {
  saveMany(
    input: Array<Omit<PerfiosNormalizedTransactionRecord, "transaction_id">>
  ): Promise<PerfiosNormalizedTransactionRecord[]>;
}

export interface PerfiosDuplicateDetector {
  detectStatementDuplicateSignals(input: {
    document: UploadedDocumentEnvelope;
    statement: PerfiosParsedStatementDraft;
    rawPayload: Record<string, unknown>;
  }): Promise<DuplicateSignalInput>;
  detectTransactionDuplicateSignals(input: {
    document: UploadedDocumentEnvelope;
    statement: PerfiosParsedStatementDraft;
    transactions: PerfiosParsedTransactionDraft[];
  }): Promise<Record<string, DuplicateSignalInput>>;
}

export interface PerfiosStatementIngestionDependencies {
  parser: PerfiosStatementParser;
  rawPayloadRepository: PerfiosRawPayloadRepository;
  statementRepository: PerfiosStatementRepository;
  transactionRepository: PerfiosTransactionRepository;
  duplicateDetector: PerfiosDuplicateDetector;
  auditLogger: AuditLogger;
  now?: () => string;
}

export interface PerfiosConfidencePolicy {
  highConfidenceMin: number;
  mediumConfidenceMin: number;
}

export interface PerfiosDuplicatePolicy {
  suspectedDuplicateMinSimilarity: number;
}

export interface PerfiosStatementIngestionPolicy {
  confidence: PerfiosConfidencePolicy;
  duplicates: PerfiosDuplicatePolicy;
}

export const defaultPerfiosStatementIngestionPolicy: PerfiosStatementIngestionPolicy = {
  confidence: {
    highConfidenceMin: 0.9,
    mediumConfidenceMin: 0.75,
  },
  duplicates: {
    suspectedDuplicateMinSimilarity: 0.92,
  },
};

export interface PerfiosTransactionIngestionDecision {
  external_transaction_id?: string;
  parser_confidence_level: PerfiosConfidenceLevel;
  automation_eligibility: PerfiosAutomationEligibility;
  duplicate_flag: boolean;
  duplicate_status: BankTransactionDuplicateStatus;
  candidate_payment_flag: boolean;
  settlement_hint: BankTransactionSettlementHint;
  settlement_status: BankTransactionSettlementStatus;
  review_status: BankTransactionReviewStatus;
  reconciliation_ready: boolean;
  review?: ReviewDecision;
}

export interface PerfiosStatementIngestionResult {
  raw_payload: PerfiosRawStatementPayloadRecord;
  statement: PerfiosNormalizedStatementRecord;
  transactions: PerfiosNormalizedTransactionRecord[];
  statement_review?: ReviewDecision;
  transaction_decisions: PerfiosTransactionIngestionDecision[];
}

type PerfiosCorrectableTransactionFields = Pick<
  PerfiosNormalizedTransactionRecord,
  | "external_transaction_id"
  | "date"
  | "cheque_number"
  | "description"
  | "amount"
  | "balance"
  | "category"
  | "parser_confidence"
  | "source_page"
  | "source_row"
>;

export class PerfiosStatementParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PerfiosStatementParseError";
  }
}

export async function ingestPerfiosBankStatement(params: {
  document: UploadedDocumentEnvelope;
  fileReference: string;
  auditContext: AuditContext;
  deps: PerfiosStatementIngestionDependencies;
  policy?: PerfiosStatementIngestionPolicy;
}): Promise<PerfiosStatementIngestionResult> {
  const policy = params.policy ?? defaultPerfiosStatementIngestionPolicy;
  const now = params.deps.now ?? (() => new Date().toISOString());
  const parsed = await params.deps.parser.parse({
    document: params.document,
    fileReference: params.fileReference,
  });

  validateParsedPerfiosStatement(parsed, params.document);

  const statementDuplicateSignals = await params.deps.duplicateDetector.detectStatementDuplicateSignals({
    document: parsed.document,
    statement: parsed.statement,
    rawPayload: parsed.raw_payload,
  });
  const transactionDuplicateSignals = await params.deps.duplicateDetector.detectTransactionDuplicateSignals({
    document: parsed.document,
    statement: parsed.statement,
    transactions: parsed.transactions,
  });

  const rawPayload = await params.deps.rawPayloadRepository.save({
    document_id: parsed.document.documentId,
    source_provider: "perfios",
    payload: parsed.raw_payload,
    received_at: now(),
  });

  const statementConfidenceLevel = classifyPerfiosConfidence(parsed.statement.parser_confidence, policy.confidence);
  const statementDuplicateCheck = classifyDuplicateSignals(statementDuplicateSignals, {
    suspectedDuplicateMinSimilarity: policy.duplicates.suspectedDuplicateMinSimilarity,
  });
  const statementReview: ReviewDecision | undefined =
    statementDuplicateCheck.classification !== "unique"
      ? {
          queue: "duplicate_review",
          reasons:
            statementDuplicateCheck.reasons.length > 0
              ? statementDuplicateCheck.reasons
              : ["possible_duplicate"],
          blocking: true,
        }
      : undefined;

  const statementToPersist: Omit<PerfiosNormalizedStatementRecord, "statement_id"> = {
    document_id: parsed.document.documentId,
    raw_payload_id: rawPayload.raw_payload_id,
    source_provider: "perfios",
    parser_confidence: parsed.statement.parser_confidence,
    parser_confidence_level: statementConfidenceLevel,
    reconciliation_ready: parsed.transactions.length > 0,
    created_at: now(),
    ...(parsed.statement.bank_name !== undefined ? { bank_name: parsed.statement.bank_name } : {}),
    ...(parsed.statement.account_name !== undefined
      ? { account_name: parsed.statement.account_name }
      : {}),
    ...(parsed.statement.account_number_masked !== undefined
      ? { account_number_masked: parsed.statement.account_number_masked }
      : {}),
    ...(parsed.statement.statement_period_start !== undefined
      ? { statement_period_start: parsed.statement.statement_period_start }
      : {}),
    ...(parsed.statement.statement_period_end !== undefined
      ? { statement_period_end: parsed.statement.statement_period_end }
      : {}),
    ...(parsed.statement.currency !== undefined ? { currency: parsed.statement.currency } : {}),
    ...(parsed.statement.metadata !== undefined ? { metadata: parsed.statement.metadata } : {}),
  };

  const statement = await params.deps.statementRepository.save(statementToPersist);

  const transactionsToPersist = parsed.transactions.map((transaction, index) => {
    const duplicateSignals = transactionDuplicateSignals[getTransactionDuplicateKey(transaction, index)] ?? {};
    const transactionDecision = evaluatePerfiosTransactionDraft(transaction, duplicateSignals, policy);
    const record: Omit<PerfiosNormalizedTransactionRecord, "transaction_id"> = {
      statement_id: statement.statement_id,
      date: transaction.date,
      description: transaction.description,
      inferred_direction: inferTransactionDirection(transaction),
      amount: transaction.amount,
      parser_confidence: transaction.parser_confidence,
      parser_confidence_level: transactionDecision.parser_confidence_level,
      duplicate_flag: transactionDecision.duplicate_flag,
      duplicate_status: transactionDecision.duplicate_status,
      candidate_payment_flag: transactionDecision.candidate_payment_flag,
      settlement_hint: transactionDecision.settlement_hint,
      settlement_status: transactionDecision.settlement_status,
      review_status: transactionDecision.review_status,
      human_corrected_fields: {},
      automation_eligibility: transactionDecision.automation_eligibility,
      reconciliation_ready: transactionDecision.reconciliation_ready,
      created_at: now(),
      ...(transaction.external_transaction_id !== undefined
        ? { external_transaction_id: transaction.external_transaction_id }
        : {}),
      ...(transaction.cheque_number !== undefined
        ? { cheque_number: transaction.cheque_number }
        : {}),
      ...(transaction.balance !== undefined
        ? { balance: transaction.balance }
        : {}),
      ...(transaction.category !== undefined
        ? { category: transaction.category }
        : {}),
      ...(transaction.source_page !== undefined ? { source_page: transaction.source_page } : {}),
      ...(transaction.source_row !== undefined ? { source_row: transaction.source_row } : {}),
      ...(transaction.metadata !== undefined ? { metadata: transaction.metadata } : {}),
    };

    return {
      record,
      decision: transactionDecision,
    };
  });

  const transactions = await params.deps.transactionRepository.saveMany(
    transactionsToPersist.map((entry) => entry.record)
  );

  await params.deps.auditLogger.log(params.auditContext, {
    action: "ingestion.bank_statement_ingested",
    entityId: parsed.document.documentId,
    entityType: "uploaded_document",
    metadata: {
      provider: parsed.provider,
      rawPayloadId: rawPayload.raw_payload_id,
      statementId: statement.statement_id,
      parserConfidenceLevel: statement.parser_confidence_level,
      transactionCount: transactions.length,
      duplicateClassification: statementDuplicateCheck.classification,
    },
  });

  return {
    raw_payload: rawPayload,
    statement,
    transactions,
    ...(statementReview ? { statement_review: statementReview } : {}),
    transaction_decisions: transactionsToPersist.map((entry) => entry.decision),
  };
}

export function classifyPerfiosConfidence(
  confidence: number,
  policy: PerfiosConfidencePolicy
): PerfiosConfidenceLevel {
  if (confidence >= policy.highConfidenceMin) {
    return "high";
  }

  if (confidence >= policy.mediumConfidenceMin) {
    return "medium";
  }

  return "low";
}

export function resolvePerfiosAutomationEligibility(
  confidenceLevel: PerfiosConfidenceLevel
): PerfiosAutomationEligibility {
  if (confidenceLevel === "high") {
    return "matching_suggestions_and_auto_apply_evaluation";
  }

  if (confidenceLevel === "medium") {
    return "matching_suggestions_only";
  }

  return "blocked_pending_correction";
}

export function applyPerfiosTransactionHumanCorrection<
  TRecord extends PerfiosNormalizedTransactionRecord,
>(
  record: TRecord,
  params: {
    corrected_at: string;
    corrected_by: string;
    fields: Partial<PerfiosCorrectableTransactionFields>;
    reason?: string;
    policy?: PerfiosConfidencePolicy;
  }
): TRecord {
  const updatedRecord = { ...record } as TRecord;
  const correctedFields: PerfiosHumanCorrectedFields = {
    ...record.human_corrected_fields,
  };

  for (const [fieldName, correctedValue] of Object.entries(params.fields)) {
    const typedFieldName = fieldName as keyof PerfiosCorrectableTransactionFields;
    const previousValue = updatedRecord[typedFieldName as keyof TRecord];
    const correction: PerfiosHumanFieldCorrection = {
      previous_value: previousValue,
      corrected_value: correctedValue,
      corrected_at: params.corrected_at,
      corrected_by: params.corrected_by,
      ...(params.reason ? { reason: params.reason } : {}),
    };

    (updatedRecord as unknown as PerfiosCorrectableTransactionFields)[typedFieldName] =
      correctedValue as never;
    correctedFields[typedFieldName] = correction;
  }

  updatedRecord.human_corrected_fields = correctedFields;
  updatedRecord.duplicate_flag = false;
  updatedRecord.duplicate_status = "unique";
  updatedRecord.review_status = "approved";

  if (params.fields.amount !== undefined) {
    updatedRecord.inferred_direction = inferTransactionDirection(updatedRecord);
  }

  updatedRecord.settlement_hint = inferSettlementHint(updatedRecord);
  updatedRecord.settlement_status = inferSettlementStatus(updatedRecord);
  updatedRecord.candidate_payment_flag = updatedRecord.inferred_direction === "credit";
  const confidencePolicy = params.policy ?? defaultPerfiosStatementIngestionPolicy.confidence;
  updatedRecord.parser_confidence_level = classifyPerfiosConfidence(
    updatedRecord.parser_confidence,
    confidencePolicy
  );
  updatedRecord.automation_eligibility = resolvePerfiosAutomationEligibility(
    updatedRecord.parser_confidence_level
  );
  updatedRecord.reconciliation_ready = true;

  return updatedRecord;
}

export function evaluatePerfiosTransactionDraft(
  transaction: PerfiosParsedTransactionDraft,
  duplicateSignals: DuplicateSignalInput,
  policy: PerfiosStatementIngestionPolicy
): PerfiosTransactionIngestionDecision {
  const confidenceLevel = classifyPerfiosConfidence(transaction.parser_confidence, policy.confidence);
  const duplicateCheck = classifyDuplicateSignals(duplicateSignals, {
    suspectedDuplicateMinSimilarity: policy.duplicates.suspectedDuplicateMinSimilarity,
  });

  if (duplicateCheck.classification !== "unique") {
    return {
      parser_confidence_level: confidenceLevel,
      automation_eligibility: "blocked_pending_correction",
      duplicate_flag: true,
      duplicate_status: duplicateCheck.classification,
      candidate_payment_flag: false,
      settlement_hint: inferSettlementHint(transaction),
      settlement_status: inferSettlementStatus(transaction),
      review_status: "needs_review",
      reconciliation_ready: false,
      ...(transaction.external_transaction_id !== undefined
        ? { external_transaction_id: transaction.external_transaction_id }
        : {}),
      review: {
        queue: "duplicate_review",
        reasons: duplicateCheck.reasons.length > 0 ? duplicateCheck.reasons : ["possible_duplicate"],
        blocking: true,
      },
    };
  }

  const automationEligibility = resolvePerfiosAutomationEligibility(confidenceLevel);
  const settlementHint = inferSettlementHint(transaction);
  const settlementStatus = inferSettlementStatus(transaction);
  const candidatePaymentFlag = inferTransactionDirection(transaction) === "credit";
  if (confidenceLevel === "low") {
    return {
      parser_confidence_level: confidenceLevel,
      automation_eligibility: automationEligibility,
      duplicate_flag: false,
      duplicate_status: "unique",
      candidate_payment_flag: candidatePaymentFlag,
      settlement_hint: settlementHint,
      settlement_status: settlementStatus,
      review_status: "needs_review",
      reconciliation_ready: false,
      ...(transaction.external_transaction_id !== undefined
        ? { external_transaction_id: transaction.external_transaction_id }
        : {}),
      review: {
        queue: "ingestion_review",
        reasons: ["perfios_transaction_low_confidence"],
        blocking: true,
      },
    };
  }

  return {
    parser_confidence_level: confidenceLevel,
    automation_eligibility: automationEligibility,
    duplicate_flag: false,
    duplicate_status: "unique",
    candidate_payment_flag: candidatePaymentFlag,
    settlement_hint: settlementHint,
    settlement_status: settlementStatus,
    review_status: settlementStatus === "settled" ? "none" : "needs_review",
    reconciliation_ready: settlementStatus === "settled",
    ...(transaction.external_transaction_id !== undefined
      ? { external_transaction_id: transaction.external_transaction_id }
      : {}),
  };
}

export class MockPerfiosStatementParser implements PerfiosStatementParser {
  constructor(private readonly response: PerfiosParsedBankStatement) {}

  async parse(): Promise<PerfiosParsedBankStatement> {
    return JSON.parse(JSON.stringify(this.response)) as PerfiosParsedBankStatement;
  }
}

function validateParsedPerfiosStatement(
  parsed: PerfiosParsedBankStatement,
  document: UploadedDocumentEnvelope
): void {
  if (parsed.provider !== "perfios") {
    throw new PerfiosStatementParseError(`Unexpected provider: ${parsed.provider}`);
  }

  if (parsed.document.documentId !== document.documentId) {
    throw new PerfiosStatementParseError("Parsed document does not match requested document");
  }

  if (!parsed.raw_payload || Object.keys(parsed.raw_payload).length === 0) {
    throw new PerfiosStatementParseError("Perfios payload is required for audit/debug storage");
  }
}

function inferTransactionDirection(
  transaction:
    | PerfiosParsedTransactionDraft
    | Pick<PerfiosNormalizedTransactionRecord, "amount" | "inferred_direction">
): PerfiosInferredDirection {
  if (transaction.amount > 0) {
    return "credit";
  }

  if (transaction.amount < 0) {
    return "debit";
  }

  return "inferred_direction" in transaction ? transaction.inferred_direction ?? "unknown" : "unknown";
}

function inferSettlementHint(
  transaction:
    | PerfiosParsedTransactionDraft
    | Pick<PerfiosNormalizedTransactionRecord, "cheque_number" | "description" | "category">
): BankTransactionSettlementHint {
  const description = transaction.description.toLowerCase();
  const category = transaction.category?.toLowerCase();
  if (transaction.cheque_number || description.includes("check") || description.includes("cheque")) {
    return "check";
  }
  if (
    description.includes("transfer") ||
    description.includes("fund transfer") ||
    category?.includes("transfer")
  ) {
    return "transfer";
  }

  return "instant";
}

function inferSettlementStatus(
  transaction:
    | PerfiosParsedTransactionDraft
    | Pick<PerfiosNormalizedTransactionRecord, "cheque_number" | "description" | "category" | "inferred_direction">
): BankTransactionSettlementStatus {
  if (inferSettlementHint(transaction) === "check") {
    return "pending_clearance";
  }

  return "settled";
}

function getTransactionDuplicateKey(
  transaction: PerfiosParsedTransactionDraft,
  index: number
): string {
  return (
    transaction.external_transaction_id ??
    `${transaction.date}:${transaction.description}:${transaction.source_row ?? index}`
  );
}
