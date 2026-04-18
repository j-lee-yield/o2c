import { createHash } from "node:crypto";
import { InMemoryAuditLogger } from "@o2c/audit";
import {
  createDatabaseClientConfig,
  executeSqlCommand,
  isDatabaseAvailable,
  jsonLiteral,
  queryJsonRows,
  quoteLiteral,
} from "@o2c/database";
import type {
  BankTransactionSettlementStatus,
  DuplicateSignalInput,
  PaymentCandidateRecord,
  PaymentReviewReasonCode,
  PerfiosNormalizedStatementRecord,
  PerfiosNormalizedTransactionRecord,
  PerfiosParsedBankStatement,
  PerfiosRawStatementPayloadRecord,
} from "@o2c/contracts";
import { ingestPerfiosBankStatement, MockPerfiosStatementParser } from "@o2c/workflows";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseBankStatementFile } from "./bank-statement-file-parser.js";

const auditContextSchema = z.object({
  actorId: z.string().min(1),
  actorType: z.enum(["user", "system", "automation"]),
  correlationId: z.string().min(1),
  occurredAt: z.string().min(1),
});

const duplicateSignalSchema = z.object({
  sameDocumentChecksum: z.boolean().optional(),
  sameProviderRecordId: z.boolean().optional(),
  sameBusinessKey: z.boolean().optional(),
  fuzzySimilarityScore: z.number().optional(),
});

const uploadedDocumentSchema = z.object({
  documentId: z.string().min(1),
  fileName: z.string().min(1).optional(),
  checksum: z.string().min(1),
  mimeType: z.string().min(1).optional(),
  source: z.enum(["email", "portal", "api", "manual"]),
  uploadedAt: z.string().min(1),
});

const perfiosStatementDraftSchema = z.object({
  bank_name: z.string().min(1).optional(),
  account_name: z.string().min(1).optional(),
  account_number_masked: z.string().min(1).optional(),
  statement_period_start: z.string().min(1).optional(),
  statement_period_end: z.string().min(1).optional(),
  currency: z.string().min(1).optional(),
  parser_confidence: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const perfiosTransactionDraftSchema = z.object({
  external_transaction_id: z.string().min(1).optional(),
  date: z.string().min(1),
  cheque_number: z.string().min(1).optional(),
  description: z.string().min(1),
  amount: z.number(),
  balance: z.number().optional(),
  category: z.string().min(1).optional(),
  parser_confidence: z.number(),
  source_page: z.number().int().optional(),
  source_row: z.number().int().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const perfiosParsedStatementSchema = z.object({
  provider: z.literal("perfios"),
  document: uploadedDocumentSchema,
  raw_payload: z.record(z.string(), z.unknown()),
  statement: perfiosStatementDraftSchema,
  transactions: z.array(perfiosTransactionDraftSchema),
});

const perfiosIngestionSchema = z.object({
  parsedStatement: perfiosParsedStatementSchema,
  auditContext: auditContextSchema,
  duplicateSignals: z
    .object({
      statement: duplicateSignalSchema.optional(),
      transactions: z.record(z.string(), duplicateSignalSchema).optional(),
    })
    .optional(),
});

const statementParamsSchema = z.object({
  statementId: z.string().min(1),
});

const fileHeadersSchema = z.object({
  "x-file-name": z.string().min(1),
  "x-upload-id": z.string().min(1).optional(),
});

const paymentCandidateParamsSchema = z.object({
  candidateId: z.string().min(1),
});

const promotePaymentCandidateSchema = z.object({
  parentAccountId: z.string().min(1),
  billingAccountId: z.string().min(1).optional(),
  paymentReference: z.string().min(1).optional(),
  customerProfileId: z.string().min(1).optional(),
  auditContext: auditContextSchema,
});

type StoredBankStatementIngestionRecord = {
  rawPayload: PerfiosRawStatementPayloadRecord;
  statement: PerfiosNormalizedStatementRecord;
  transactions: PerfiosNormalizedTransactionRecord[];
  statementReview?: { queue: string; reasons: string[]; blocking: boolean };
  transactionDecisions: Array<{
    external_transaction_id?: string;
    parser_confidence_level: "high" | "medium" | "low";
    automation_eligibility:
      | "matching_suggestions_and_auto_apply_evaluation"
      | "matching_suggestions_only"
      | "blocked_pending_correction";
    duplicate_flag: boolean;
    reconciliation_ready: boolean;
    review?: { queue: string; reasons: string[]; blocking: boolean };
  }>;
  ingestedAt: string;
};

interface BankStatementReadStore {
  save(record: StoredBankStatementIngestionRecord): Promise<void>;
  list(): Promise<Array<{
    statementId: string;
    rawPayloadId: string;
    accountName?: string;
    bankName?: string;
    parserConfidenceLevel: string;
    normalizedTransactionCount: number;
    readyTransactionCount: number;
    reviewRequiredTransactionCount: number;
    ingestedAt: string;
  }>>;
  get(statementId: string): Promise<StoredBankStatementIngestionRecord | undefined>;
}

interface PaymentCandidateStore {
  upsertMany(candidates: PaymentCandidateRecord[]): Promise<PaymentCandidateRecord[]>;
  list(): Promise<PaymentCandidateRecord[]>;
  get(candidateId: string): Promise<PaymentCandidateRecord | undefined>;
  markPromoted(candidateId: string, updatedAt: string): Promise<void>;
}

interface PaymentRecordStore {
  create(input: {
    paymentId: string;
    tenantId: string;
    parentAccountId: string;
    billingAccountId?: string;
    uploadedDocumentId?: string;
    paymentReference: string;
    amountCents: number;
    currency: string;
    receivedAt: string;
    settlementStatus: BankTransactionSettlementStatus;
    sourcePaymentCandidateId: string;
    finalityConfirmedAt: string;
    state: "candidate_match_found" | "unapplied_cash";
    metadata: Record<string, unknown>;
    auditContext: z.infer<typeof auditContextSchema>;
  }): Promise<{ id: string; state: string; settlementStatus: string }>;
}

class InMemoryPerfiosRawPayloadRepository {
  private counter = 0;
  readonly records: PerfiosRawStatementPayloadRecord[] = [];

  async save(
    input: Omit<PerfiosRawStatementPayloadRecord, "raw_payload_id">,
  ): Promise<PerfiosRawStatementPayloadRecord> {
    this.counter += 1;
    const record = { raw_payload_id: `raw_${this.counter}`, ...input };
    this.records.push(record);
    return record;
  }
}

class InMemoryPerfiosStatementRepository {
  private counter = 0;
  readonly records: PerfiosNormalizedStatementRecord[] = [];

  async save(
    input: Omit<PerfiosNormalizedStatementRecord, "statement_id">,
  ): Promise<PerfiosNormalizedStatementRecord> {
    this.counter += 1;
    const record = { statement_id: `statement_${this.counter}`, ...input };
    this.records.push(record);
    return record;
  }
}

class InMemoryPerfiosTransactionRepository {
  private counter = 0;
  readonly records: PerfiosNormalizedTransactionRecord[] = [];

  async saveMany(
    input: Array<Omit<PerfiosNormalizedTransactionRecord, "transaction_id">>,
  ): Promise<PerfiosNormalizedTransactionRecord[]> {
    const records = input.map((entry) => {
      this.counter += 1;
      return { transaction_id: `transaction_${this.counter}`, ...entry };
    });

    this.records.push(...records);
    return records;
  }
}

class StaticDuplicateDetector {
  private readonly signals: {
    statement?: DuplicateSignalInput;
    transactions?: Record<string, DuplicateSignalInput>;
  };

  constructor(
    signals?: {
      statement?: DuplicateSignalInput;
      transactions?: Record<string, DuplicateSignalInput>;
    },
  ) {
    this.signals = signals ?? {};
  }

  async detectStatementDuplicateSignals(): Promise<DuplicateSignalInput> {
    return this.signals.statement ?? {};
  }

  async detectTransactionDuplicateSignals(): Promise<Record<string, DuplicateSignalInput>> {
    return this.signals.transactions ?? {};
  }
}

class InMemoryBankStatementStore implements BankStatementReadStore {
  private readonly records = new Map<string, StoredBankStatementIngestionRecord>();

  async save(record: StoredBankStatementIngestionRecord): Promise<void> {
    this.records.set(record.statement.statement_id, record);
  }

  async list() {
    return Array.from(this.records.values())
      .slice()
      .reverse()
      .map((record) => summarizeRecord(record));
  }

  async get(statementId: string): Promise<StoredBankStatementIngestionRecord | undefined> {
    return this.records.get(statementId);
  }
}

class InMemoryPaymentCandidateStore implements PaymentCandidateStore {
  private readonly records = new Map<string, PaymentCandidateRecord>();

  async upsertMany(candidates: PaymentCandidateRecord[]): Promise<PaymentCandidateRecord[]> {
    for (const candidate of candidates) {
      this.records.set(candidate.payment_candidate_id, candidate);
    }
    return candidates;
  }

  async list(): Promise<PaymentCandidateRecord[]> {
    return [...this.records.values()].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  }

  async get(candidateId: string): Promise<PaymentCandidateRecord | undefined> {
    return this.records.get(candidateId);
  }

  async markPromoted(candidateId: string, updatedAt: string): Promise<void> {
    const record = this.records.get(candidateId);
    if (!record) {
      return;
    }
    this.records.set(candidateId, {
      ...record,
      status: "promoted_to_payment",
      updated_at: updatedAt,
    });
  }
}

class InMemoryPaymentRecordStore implements PaymentRecordStore {
  private readonly records = new Map<string, { id: string; state: string; settlementStatus: string }>();

  async create(input: {
    paymentId: string;
    tenantId: string;
    parentAccountId: string;
    billingAccountId?: string;
    uploadedDocumentId?: string;
    paymentReference: string;
    amountCents: number;
    currency: string;
    receivedAt: string;
    settlementStatus: BankTransactionSettlementStatus;
    sourcePaymentCandidateId: string;
    finalityConfirmedAt: string;
    state: "candidate_match_found" | "unapplied_cash";
    metadata: Record<string, unknown>;
    auditContext: z.infer<typeof auditContextSchema>;
  }): Promise<{ id: string; state: string; settlementStatus: string }> {
    const record = {
      id: input.paymentId,
      state: input.state,
      settlementStatus: input.settlementStatus,
    };
    this.records.set(input.paymentId, record);
    return record;
  }
}

class PostgresPerfiosRawPayloadRepository {
  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId: string,
  ) {}

  async save(
    input: Omit<PerfiosRawStatementPayloadRecord, "raw_payload_id">,
  ): Promise<PerfiosRawStatementPayloadRecord> {
    const raw_payload_id = deterministicTextId(
      "perfios_raw_payload",
      `${this.tenantId}:${input.document_id}:${input.received_at}:${JSON.stringify(input.payload)}`,
    );
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO perfios_raw_statement_payload (
          raw_payload_id,
          tenant_id,
          document_id,
          source_provider,
          payload,
          received_at,
          created_at,
          updated_at
        ) VALUES (
          '${quoteLiteral(raw_payload_id)}',
          '${quoteLiteral(this.tenantId)}',
          '${quoteLiteral(input.document_id)}',
          '${quoteLiteral(input.source_provider)}',
          '${jsonLiteral(input.payload)}'::jsonb,
          '${quoteLiteral(input.received_at)}'::timestamptz,
          '${quoteLiteral(input.received_at)}'::timestamptz,
          '${quoteLiteral(input.received_at)}'::timestamptz
        )
        ON CONFLICT (raw_payload_id)
        DO UPDATE SET
          payload = EXCLUDED.payload,
          received_at = EXCLUDED.received_at,
          updated_at = EXCLUDED.updated_at;
      `,
    );

    return { raw_payload_id, ...input };
  }
}

class PostgresPerfiosStatementRepository {
  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId: string,
  ) {}

  async save(
    input: Omit<PerfiosNormalizedStatementRecord, "statement_id">,
  ): Promise<PerfiosNormalizedStatementRecord> {
    const statement_id = deterministicTextId(
      "perfios_statement",
      `${this.tenantId}:${input.document_id}:${input.raw_payload_id}`,
    );
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO perfios_normalized_statement (
          statement_id,
          tenant_id,
          document_id,
          raw_payload_id,
          bank_name,
          account_name,
          account_number_masked,
          statement_period_start,
          statement_period_end,
          currency,
          source_provider,
          parser_confidence,
          parser_confidence_level,
          reconciliation_ready,
          metadata,
          created_at,
          updated_at
        ) VALUES (
          '${quoteLiteral(statement_id)}',
          '${quoteLiteral(this.tenantId)}',
          '${quoteLiteral(input.document_id)}',
          '${quoteLiteral(input.raw_payload_id)}',
          ${nullableText(input.bank_name)},
          ${nullableText(input.account_name)},
          ${nullableText(input.account_number_masked)},
          ${nullableDate(input.statement_period_start)},
          ${nullableDate(input.statement_period_end)},
          ${nullableText(input.currency)},
          '${quoteLiteral(input.source_provider)}',
          ${input.parser_confidence},
          '${quoteLiteral(input.parser_confidence_level)}',
          ${input.reconciliation_ready ? "TRUE" : "FALSE"},
          ${nullableJson(input.metadata)},
          '${quoteLiteral(input.created_at)}'::timestamptz,
          '${quoteLiteral(input.created_at)}'::timestamptz
        )
        ON CONFLICT (statement_id)
        DO UPDATE SET
          bank_name = EXCLUDED.bank_name,
          account_name = EXCLUDED.account_name,
          account_number_masked = EXCLUDED.account_number_masked,
          statement_period_start = EXCLUDED.statement_period_start,
          statement_period_end = EXCLUDED.statement_period_end,
          currency = EXCLUDED.currency,
          parser_confidence = EXCLUDED.parser_confidence,
          parser_confidence_level = EXCLUDED.parser_confidence_level,
          reconciliation_ready = EXCLUDED.reconciliation_ready,
          metadata = EXCLUDED.metadata,
          updated_at = EXCLUDED.updated_at;
      `,
    );

    return { statement_id, ...input };
  }
}

class PostgresPerfiosTransactionRepository {
  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId: string,
  ) {}

  async saveMany(
    input: Array<Omit<PerfiosNormalizedTransactionRecord, "transaction_id">>,
  ): Promise<PerfiosNormalizedTransactionRecord[]> {
    const records = input.map((entry, index) => ({
      transaction_id: deterministicTextId(
        "perfios_transaction",
        `${this.tenantId}:${entry.statement_id}:${entry.external_transaction_id ?? `${entry.date}:${entry.description}:${entry.source_row ?? index}`}`,
      ),
      ...entry,
    }));

    for (const record of records) {
      executeSqlCommand(
        this.databaseUrl,
        `
          INSERT INTO perfios_normalized_transaction (
            transaction_id,
            tenant_id,
            statement_id,
            external_transaction_id,
            date,
            cheque_number,
            description,
            amount,
            balance,
            category,
            inferred_direction,
            parser_confidence,
            parser_confidence_level,
            source_page,
            source_row,
            duplicate_flag,
            duplicate_status,
            candidate_payment_flag,
            settlement_hint,
            settlement_status,
            review_status,
            human_corrected_fields,
            automation_eligibility,
            reconciliation_ready,
            metadata,
            created_at,
            updated_at
          ) VALUES (
            '${quoteLiteral(record.transaction_id)}',
            '${quoteLiteral(this.tenantId)}',
            '${quoteLiteral(record.statement_id)}',
            ${nullableText(record.external_transaction_id)},
            '${quoteLiteral(record.date)}'::date,
            ${nullableText(record.cheque_number)},
            '${quoteLiteral(record.description)}',
            ${Math.round(record.amount)},
            ${nullableBigint(record.balance)},
            ${nullableText(record.category)},
            '${quoteLiteral(record.inferred_direction)}',
            ${record.parser_confidence},
            '${quoteLiteral(record.parser_confidence_level)}',
            ${nullableInteger(record.source_page)},
            ${nullableInteger(record.source_row)},
            ${record.duplicate_flag ? "TRUE" : "FALSE"},
            '${quoteLiteral(record.duplicate_status)}',
            ${record.candidate_payment_flag ? "TRUE" : "FALSE"},
            '${quoteLiteral(record.settlement_hint)}',
            '${quoteLiteral(record.settlement_status)}',
            '${quoteLiteral(record.review_status)}',
            '${jsonLiteral(record.human_corrected_fields)}'::jsonb,
            '${quoteLiteral(record.automation_eligibility)}',
            ${record.reconciliation_ready ? "TRUE" : "FALSE"},
            ${nullableJson(record.metadata)},
            '${quoteLiteral(record.created_at)}'::timestamptz,
            '${quoteLiteral(record.created_at)}'::timestamptz
          )
          ON CONFLICT (transaction_id)
          DO UPDATE SET
            cheque_number = EXCLUDED.cheque_number,
            description = EXCLUDED.description,
            amount = EXCLUDED.amount,
            balance = EXCLUDED.balance,
            category = EXCLUDED.category,
            inferred_direction = EXCLUDED.inferred_direction,
            parser_confidence = EXCLUDED.parser_confidence,
            parser_confidence_level = EXCLUDED.parser_confidence_level,
            source_page = EXCLUDED.source_page,
            source_row = EXCLUDED.source_row,
            duplicate_flag = EXCLUDED.duplicate_flag,
            duplicate_status = EXCLUDED.duplicate_status,
            candidate_payment_flag = EXCLUDED.candidate_payment_flag,
            settlement_hint = EXCLUDED.settlement_hint,
            settlement_status = EXCLUDED.settlement_status,
            review_status = EXCLUDED.review_status,
            human_corrected_fields = EXCLUDED.human_corrected_fields,
            automation_eligibility = EXCLUDED.automation_eligibility,
            reconciliation_ready = EXCLUDED.reconciliation_ready,
            metadata = EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at;
        `,
      );
    }

    return records;
  }
}

class PostgresBankStatementStore implements BankStatementReadStore {
  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId: string,
  ) {}

  async save(record: StoredBankStatementIngestionRecord): Promise<void> {
    executeSqlCommand(
      this.databaseUrl,
      `
        UPDATE perfios_normalized_statement
        SET metadata = COALESCE(metadata, '{}'::jsonb) || '${jsonLiteral({
          statementReview: record.statementReview ?? null,
          transactionDecisions: record.transactionDecisions,
          ingestedAt: record.ingestedAt,
        })}'::jsonb,
            updated_at = '${quoteLiteral(record.ingestedAt)}'::timestamptz
        WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
          AND statement_id = '${quoteLiteral(record.statement.statement_id)}';
      `,
    );
  }

  async list() {
    type StatementSummaryRow = {
      statementId: string;
      rawPayloadId: string;
      accountName?: string;
      bankName?: string;
      parserConfidenceLevel: string;
      normalizedTransactionCount: number;
      readyTransactionCount: number;
      reviewRequiredTransactionCount: number;
      ingestedAt: string;
    };

    return queryJsonRows<StatementSummaryRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            statement.statement_id AS "statementId",
            statement.raw_payload_id AS "rawPayloadId",
            statement.account_name AS "accountName",
            statement.bank_name AS "bankName",
            statement.parser_confidence_level AS "parserConfidenceLevel",
            COALESCE(txn.transaction_count, 0)::integer AS "normalizedTransactionCount",
            COALESCE(txn.ready_count, 0)::integer AS "readyTransactionCount",
            COALESCE(txn.review_count, 0)::integer AS "reviewRequiredTransactionCount",
            COALESCE(statement.metadata->>'ingestedAt', statement.created_at::text) AS "ingestedAt"
          FROM perfios_normalized_statement statement
          LEFT JOIN (
            SELECT
              statement_id,
              COUNT(*) AS transaction_count,
              COUNT(*) FILTER (WHERE reconciliation_ready) AS ready_count,
              COUNT(*) FILTER (WHERE duplicate_flag OR parser_confidence_level = 'low') AS review_count
            FROM perfios_normalized_transaction
            WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
            GROUP BY statement_id
          ) txn
            ON txn.statement_id = statement.statement_id
          WHERE statement.tenant_id = '${quoteLiteral(this.tenantId)}'
          ORDER BY statement.created_at DESC
        ) q;
      `,
    );
  }

  async get(statementId: string): Promise<StoredBankStatementIngestionRecord | undefined> {
    type StatementRow = {
      rawPayload: PerfiosRawStatementPayloadRecord;
      statement: PerfiosNormalizedStatementRecord;
      transactions: PerfiosNormalizedTransactionRecord[];
      metadata: Record<string, unknown> | null;
    };

    const [row] = queryJsonRows<StatementRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            json_build_object(
              'raw_payload_id', payload.raw_payload_id,
              'document_id', payload.document_id,
              'source_provider', payload.source_provider,
              'payload', payload.payload,
              'received_at', payload.received_at
            ) AS "rawPayload",
            json_build_object(
              'statement_id', statement.statement_id,
              'document_id', statement.document_id,
              'raw_payload_id', statement.raw_payload_id,
              'bank_name', statement.bank_name,
              'account_name', statement.account_name,
              'account_number_masked', statement.account_number_masked,
              'statement_period_start', statement.statement_period_start,
              'statement_period_end', statement.statement_period_end,
              'currency', statement.currency,
              'source_provider', statement.source_provider,
              'parser_confidence', statement.parser_confidence,
              'parser_confidence_level', statement.parser_confidence_level,
              'reconciliation_ready', statement.reconciliation_ready,
              'created_at', statement.created_at,
              'metadata', statement.metadata
            ) AS "statement",
            (
              SELECT COALESCE(json_agg(json_build_object(
                'transaction_id', txn.transaction_id,
                'statement_id', txn.statement_id,
                'external_transaction_id', txn.external_transaction_id,
                'date', txn.date,
                'cheque_number', txn.cheque_number,
                'description', txn.description,
                'amount', txn.amount,
                'balance', txn.balance,
                'category', txn.category,
                'inferred_direction', txn.inferred_direction,
                'parser_confidence', txn.parser_confidence,
                'parser_confidence_level', txn.parser_confidence_level,
                'source_page', txn.source_page,
                'source_row', txn.source_row,
                'duplicate_flag', txn.duplicate_flag,
                'duplicate_status', txn.duplicate_status,
                'candidate_payment_flag', txn.candidate_payment_flag,
                'settlement_hint', txn.settlement_hint,
                'settlement_status', txn.settlement_status,
                'review_status', txn.review_status,
                'human_corrected_fields', txn.human_corrected_fields,
                'automation_eligibility', txn.automation_eligibility,
                'reconciliation_ready', txn.reconciliation_ready,
                'created_at', txn.created_at,
                'metadata', txn.metadata
              ) ORDER BY txn.date DESC, txn.source_row ASC), '[]'::json) AS transactions
              FROM perfios_normalized_transaction txn
              WHERE txn.tenant_id = '${quoteLiteral(this.tenantId)}'
                AND txn.statement_id = statement.statement_id
            ) AS "transactions",
            statement.metadata AS "metadata"
          FROM perfios_normalized_statement statement
          INNER JOIN perfios_raw_statement_payload payload
            ON payload.raw_payload_id = statement.raw_payload_id
          WHERE statement.tenant_id = '${quoteLiteral(this.tenantId)}'
            AND statement.statement_id = '${quoteLiteral(statementId)}'
          LIMIT 1
        ) q;
      `,
    );

    if (!row) {
      return undefined;
    }

    const statementMetadata = row.metadata ?? {};
    const statementReview = readStatementReview(statementMetadata);
    const transactionDecisions = readTransactionDecisions(statementMetadata, row.transactions);
    const ingestedAt =
      typeof statementMetadata.ingestedAt === "string" ? statementMetadata.ingestedAt : row.statement.created_at;

    return {
      rawPayload: row.rawPayload,
      statement: row.statement,
      transactions: row.transactions,
      ...(statementReview ? { statementReview } : {}),
      transactionDecisions,
      ingestedAt,
    };
  }
}

class PostgresPaymentCandidateStore implements PaymentCandidateStore {
  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId: string,
  ) {}

  async upsertMany(candidates: PaymentCandidateRecord[]): Promise<PaymentCandidateRecord[]> {
    for (const candidate of candidates) {
      executeSqlCommand(
        this.databaseUrl,
        `
          INSERT INTO payment_candidate (
            payment_candidate_id,
            tenant_id,
            statement_id,
            source_bank_transaction_ids,
            customer_profile_id,
            inferred_customer_profile_id,
            payer_name,
            amount_minor,
            currency,
            payment_reference,
            settlement_hint,
            settlement_status,
            confidence_score,
            confidence_band,
            review_reason_codes,
            status,
            metadata,
            created_at,
            updated_at
          ) VALUES (
            '${quoteLiteral(candidate.payment_candidate_id)}'::uuid,
            '${quoteLiteral(this.tenantId)}',
            '${quoteLiteral(candidate.statement_id)}',
            '${jsonLiteral(candidate.source_bank_transaction_ids)}'::jsonb,
            ${nullableUuid(candidate.customer_profile_id)},
            ${nullableUuid(candidate.inferred_customer_profile_id)},
            ${nullableText(candidate.payer_name)},
            ${candidate.amount_minor},
            '${quoteLiteral(candidate.currency)}',
            ${nullableText(candidate.payment_reference)},
            '${quoteLiteral(candidate.settlement_hint)}',
            '${quoteLiteral(candidate.settlement_status)}',
            ${typeof candidate.confidence_score === "number" ? candidate.confidence_score : "NULL"},
            '${quoteLiteral(candidate.confidence_band)}',
            '${jsonLiteral(candidate.review_reason_codes)}'::jsonb,
            '${quoteLiteral(candidate.status)}',
            ${nullableJson(candidate.metadata)},
            '${quoteLiteral(candidate.created_at)}'::timestamptz,
            '${quoteLiteral(candidate.updated_at)}'::timestamptz
          )
          ON CONFLICT (payment_candidate_id)
          DO UPDATE SET
            customer_profile_id = COALESCE(EXCLUDED.customer_profile_id, payment_candidate.customer_profile_id),
            inferred_customer_profile_id = COALESCE(EXCLUDED.inferred_customer_profile_id, payment_candidate.inferred_customer_profile_id),
            payer_name = COALESCE(EXCLUDED.payer_name, payment_candidate.payer_name),
            amount_minor = EXCLUDED.amount_minor,
            currency = EXCLUDED.currency,
            payment_reference = COALESCE(EXCLUDED.payment_reference, payment_candidate.payment_reference),
            settlement_hint = EXCLUDED.settlement_hint,
            settlement_status = EXCLUDED.settlement_status,
            confidence_score = COALESCE(EXCLUDED.confidence_score, payment_candidate.confidence_score),
            confidence_band = EXCLUDED.confidence_band,
            review_reason_codes = EXCLUDED.review_reason_codes,
            status = EXCLUDED.status,
            metadata = COALESCE(payment_candidate.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
            updated_at = EXCLUDED.updated_at;
        `,
      );
    }

    return candidates;
  }

  async list(): Promise<PaymentCandidateRecord[]> {
    return queryJsonRows<PaymentCandidateRecord>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            payment_candidate_id::text AS "payment_candidate_id",
            tenant_id,
            statement_id,
            source_bank_transaction_ids,
            customer_profile_id::text AS "customer_profile_id",
            inferred_customer_profile_id::text AS "inferred_customer_profile_id",
            payer_name,
            amount_minor,
            currency,
            payment_reference,
            settlement_hint,
            settlement_status,
            confidence_score,
            confidence_band,
            review_reason_codes,
            status,
            created_at,
            updated_at,
            metadata
          FROM payment_candidate
          WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
          ORDER BY updated_at DESC
        ) q;
      `,
    );
  }

  async get(candidateId: string): Promise<PaymentCandidateRecord | undefined> {
    const [candidate] = queryJsonRows<PaymentCandidateRecord>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            payment_candidate_id::text AS "payment_candidate_id",
            tenant_id,
            statement_id,
            source_bank_transaction_ids,
            customer_profile_id::text AS "customer_profile_id",
            inferred_customer_profile_id::text AS "inferred_customer_profile_id",
            payer_name,
            amount_minor,
            currency,
            payment_reference,
            settlement_hint,
            settlement_status,
            confidence_score,
            confidence_band,
            review_reason_codes,
            status,
            created_at,
            updated_at,
            metadata
          FROM payment_candidate
          WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
            AND payment_candidate_id = '${quoteLiteral(candidateId)}'::uuid
          LIMIT 1
        ) q;
      `,
    );
    return candidate;
  }

  async markPromoted(candidateId: string, updatedAt: string): Promise<void> {
    executeSqlCommand(
      this.databaseUrl,
      `
        UPDATE payment_candidate
        SET status = 'promoted_to_payment',
            updated_at = '${quoteLiteral(updatedAt)}'::timestamptz
        WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
          AND payment_candidate_id = '${quoteLiteral(candidateId)}'::uuid;
      `,
    );
  }
}

class PostgresPaymentRecordStore implements PaymentRecordStore {
  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId: string,
  ) {}

  async create(input: {
    paymentId: string;
    tenantId: string;
    parentAccountId: string;
    billingAccountId?: string;
    uploadedDocumentId?: string;
    paymentReference: string;
    amountCents: number;
    currency: string;
    receivedAt: string;
    settlementStatus: BankTransactionSettlementStatus;
    sourcePaymentCandidateId: string;
    finalityConfirmedAt: string;
    state: "candidate_match_found" | "unapplied_cash";
    metadata: Record<string, unknown>;
    auditContext: z.infer<typeof auditContextSchema>;
  }): Promise<{ id: string; state: string; settlementStatus: string }> {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO payment (
          id, tenant_id, version, created_at, updated_at, deleted_at,
          created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
          parent_account_id, billing_account_id, uploaded_document_id, payment_reference, amount_cents,
          currency, received_at, settlement_status, source_payment_candidate_id, finality_confirmed_at, state, metadata
        ) VALUES (
          '${quoteLiteral(input.paymentId)}'::uuid,
          '${quoteLiteral(this.tenantId)}',
          1,
          '${quoteLiteral(input.finalityConfirmedAt)}'::timestamptz,
          '${quoteLiteral(input.finalityConfirmedAt)}'::timestamptz,
          NULL,
          ${nullableText(input.auditContext.actorId)},
          ${nullableText(input.auditContext.actorType)},
          ${nullableText(input.auditContext.actorId)},
          ${nullableText(input.auditContext.actorType)},
          '${quoteLiteral(input.parentAccountId)}'::uuid,
          ${nullableUuid(input.billingAccountId)},
          ${nullableUuid(input.uploadedDocumentId)},
          '${quoteLiteral(input.paymentReference)}',
          ${input.amountCents},
          '${quoteLiteral(input.currency)}',
          '${quoteLiteral(input.receivedAt)}'::timestamptz,
          '${quoteLiteral(input.settlementStatus)}',
          '${quoteLiteral(input.sourcePaymentCandidateId)}'::uuid,
          '${quoteLiteral(input.finalityConfirmedAt)}'::timestamptz,
          '${quoteLiteral(input.state)}',
          '${jsonLiteral(input.metadata)}'::jsonb
        )
        ON CONFLICT (id)
        DO UPDATE SET
          updated_at = EXCLUDED.updated_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          billing_account_id = COALESCE(EXCLUDED.billing_account_id, payment.billing_account_id),
          payment_reference = EXCLUDED.payment_reference,
          amount_cents = EXCLUDED.amount_cents,
          currency = EXCLUDED.currency,
          received_at = EXCLUDED.received_at,
          settlement_status = EXCLUDED.settlement_status,
          source_payment_candidate_id = EXCLUDED.source_payment_candidate_id,
          finality_confirmed_at = EXCLUDED.finality_confirmed_at,
          state = EXCLUDED.state,
          metadata = payment.metadata || EXCLUDED.metadata;
      `,
    );

    return {
      id: input.paymentId,
      state: input.state,
      settlementStatus: input.settlementStatus,
    };
  }
}

const auditLogger = new InMemoryAuditLogger();
const inMemoryRawPayloadRepository = new InMemoryPerfiosRawPayloadRepository();
const inMemoryStatementRepository = new InMemoryPerfiosStatementRepository();
const inMemoryTransactionRepository = new InMemoryPerfiosTransactionRepository();
const inMemoryBankStatementStore = new InMemoryBankStatementStore();
const inMemoryPaymentCandidateStore = new InMemoryPaymentCandidateStore();
const inMemoryPaymentRecordStore = new InMemoryPaymentRecordStore();

export const registerPaymentRoutes = (app: FastifyInstance): void => {
  ensureBinaryFileParsers(app);

  app.get("/v1/payments", async () => ({
    module: "payments",
    status: "implemented",
    capabilities: [
      "bank statement normalization",
      "payment candidate creation from normalized bank credits",
      "settlement-aware promotion to final payments",
      "payment ingestion review routing",
      "statement-level readiness summary",
      "durable bank-statement persistence when database is available",
      "retrieval of normalized statement ingestions",
    ],
  }));

  app.post("/v1/payments/ingestions/bank-statements/file", async (request, reply) => {
    const headers = fileHeadersSchema.parse(request.headers);
    const uploadId = headers["x-upload-id"] ?? `bank_statement_upload_${Date.now()}`;
    const fileImport = parseBankStatementFile({
      fileName: headers["x-file-name"],
      buffer: readBinaryBody(request.body),
    });
    const occurredAt = new Date().toISOString();
    const persistence = createPersistence();
    const parsedStatement: PerfiosParsedBankStatement = {
      provider: "perfios",
      document: {
        documentId: uploadId,
        fileName: headers["x-file-name"],
        checksum: createHash("sha1").update(uploadId).digest("hex"),
        source: "manual",
        uploadedAt: occurredAt,
      },
      raw_payload: {
        uploadId,
        fileName: headers["x-file-name"],
      },
      statement: {
        bank_name: "Uploaded CSV",
        ...(fileImport.statement.account_name ? { account_name: fileImport.statement.account_name } : {}),
        ...(fileImport.statement.account_number_masked
          ? { account_number_masked: fileImport.statement.account_number_masked }
          : {}),
        currency: fileImport.statement.currency,
        parser_confidence: fileImport.statement.parser_confidence,
      },
      transactions: fileImport.transactions,
    };

    const auditContext = {
      actorId: "bank_statement_file_import_endpoint",
      actorType: "automation" as const,
      correlationId: `bank_statement_file_import_${uploadId}`,
      occurredAt,
    };
    const result = await ingestPerfiosBankStatement({
      document: parsedStatement.document,
      fileReference: headers["x-file-name"],
      auditContext,
      deps: {
        parser: new MockPerfiosStatementParser(parsedStatement),
        rawPayloadRepository: persistence.rawPayloadRepository,
        statementRepository: persistence.statementRepository,
        transactionRepository: persistence.transactionRepository,
        duplicateDetector: new StaticDuplicateDetector(),
        auditLogger,
      },
    });

    const storedRecord: StoredBankStatementIngestionRecord = {
      rawPayload: result.raw_payload,
      statement: result.statement,
      transactions: result.transactions,
      ...(result.statement_review ? { statementReview: result.statement_review } : {}),
      transactionDecisions: result.transaction_decisions,
      ingestedAt: occurredAt,
    };
    await persistence.bankStatementStore.save(storedRecord);
    const paymentCandidates = await persistence.paymentCandidateStore.upsertMany(
      buildPaymentCandidates({
        tenantId: "default",
        statement: result.statement,
        transactions: result.transactions,
        occurredAt,
      }),
    );

    return reply.status(201).send({
      provider: "bank_statement_upload",
      uploadId,
      fileName: headers["x-file-name"],
      sheetName: fileImport.sheetName,
      heldRows: fileImport.heldRows,
      statementId: result.statement.statement_id,
      rawPayloadId: result.raw_payload.raw_payload_id,
      normalizedTransactionCount: result.transactions.length,
      readyTransactionCount: result.transaction_decisions.filter(
        (decision) => decision.reconciliation_ready,
      ).length,
      reviewRequiredTransactionCount: result.transaction_decisions.filter(
        (decision) => decision.review !== undefined,
      ).length,
      paymentCandidateCount: paymentCandidates.length,
      finalPaymentCreationStatus: "pending_matching_and_payment_materialization",
      persistenceMode: persistence.mode,
    });
  });

  app.post("/v1/payments/ingestions/bank-statements/perfios", async (request, reply) => {
    const body = perfiosIngestionSchema.parse(request.body ?? {});
    const parsedStatement = body.parsedStatement as PerfiosParsedBankStatement;
    const persistence = createPersistence();
    const result = await ingestPerfiosBankStatement({
      document: parsedStatement.document,
      fileReference: parsedStatement.document.fileName ?? parsedStatement.document.documentId,
      auditContext: body.auditContext,
      deps: {
        parser: new MockPerfiosStatementParser(parsedStatement),
        rawPayloadRepository: persistence.rawPayloadRepository,
        statementRepository: persistence.statementRepository,
        transactionRepository: persistence.transactionRepository,
        duplicateDetector: new StaticDuplicateDetector(compactDuplicateSignals(body.duplicateSignals)),
        auditLogger,
      },
    });

    const storedRecord: StoredBankStatementIngestionRecord = {
      rawPayload: result.raw_payload,
      statement: result.statement,
      transactions: result.transactions,
      ...(result.statement_review ? { statementReview: result.statement_review } : {}),
      transactionDecisions: result.transaction_decisions,
      ingestedAt: body.auditContext.occurredAt,
    };
    await persistence.bankStatementStore.save(storedRecord);
    const paymentCandidates = await persistence.paymentCandidateStore.upsertMany(
      buildPaymentCandidates({
        tenantId: "default",
        statement: result.statement,
        transactions: result.transactions,
        occurredAt: body.auditContext.occurredAt,
      }),
    );

    return reply.status(201).send({
      statementId: result.statement.statement_id,
      rawPayloadId: result.raw_payload.raw_payload_id,
      normalizedTransactionCount: result.transactions.length,
      readyTransactionCount: result.transaction_decisions.filter(
        (decision) => decision.reconciliation_ready,
      ).length,
      reviewRequiredTransactionCount: result.transaction_decisions.filter(
        (decision) => decision.review !== undefined,
      ).length,
      paymentCandidateCount: paymentCandidates.length,
      finalPaymentCreationStatus: "pending_matching_and_payment_materialization",
      persistenceMode: persistence.mode,
      result,
    });
  });

  app.get("/v1/payments/ingestions/bank-statements", async () => ({
    items: await createPersistence().bankStatementStore.list(),
  }));

  app.get("/v1/payments/ingestions/bank-statements/:statementId", async (request, reply) => {
    const params = statementParamsSchema.parse(request.params);
    const record = await createPersistence().bankStatementStore.get(params.statementId);

    if (!record) {
      return reply.status(404).send({
        message: "Bank statement ingestion was not found.",
        statementId: params.statementId,
      });
    }

    return reply.send(record);
  });

  app.get("/v1/payments/candidates", async () => ({
    items: await createPersistence().paymentCandidateStore.list(),
  }));

  app.get("/v1/payments/candidates/:candidateId", async (request, reply) => {
    const params = paymentCandidateParamsSchema.parse(request.params);
    const candidate = await createPersistence().paymentCandidateStore.get(params.candidateId);

    if (!candidate) {
      return reply.status(404).send({
        message: "Payment candidate was not found.",
        candidateId: params.candidateId,
      });
    }

    return reply.send(candidate);
  });

  app.post("/v1/payments/candidates/:candidateId/promote", async (request, reply) => {
    const params = paymentCandidateParamsSchema.parse(request.params);
    const body = promotePaymentCandidateSchema.parse(request.body ?? {});
    const persistence = createPersistence();
    const candidate = await persistence.paymentCandidateStore.get(params.candidateId);

    if (!candidate) {
      return reply.status(404).send({
        message: "Payment candidate was not found.",
        candidateId: params.candidateId,
      });
    }

    const promotionCheck = evaluatePaymentCandidatePromotion(candidate);
    if (!promotionCheck.allowed) {
      return reply.status(409).send({
        message: "Payment candidate cannot be promoted to a final payment yet.",
        reviewReasonCodes: candidate.review_reason_codes,
        blockingReasons: promotionCheck.blockingReasons,
        settlementStatus: candidate.settlement_status,
        candidateStatus: candidate.status,
      });
    }

    const paymentId = deterministicUuid(`payment:${candidate.payment_candidate_id}`);
    const paymentReference =
      body.paymentReference ?? candidate.payment_reference ?? `BANK-${candidate.payment_candidate_id.slice(0, 8)}`;
    const finalPaymentState = body.billingAccountId ? "candidate_match_found" : "unapplied_cash";
    const payment = await persistence.paymentRecordStore.create({
      paymentId,
      tenantId: "default",
      parentAccountId: body.parentAccountId,
      ...(body.billingAccountId ? { billingAccountId: body.billingAccountId } : {}),
      paymentReference,
      amountCents: candidate.amount_minor,
      currency: candidate.currency,
      receivedAt: candidate.updated_at,
      settlementStatus: candidate.settlement_status,
      sourcePaymentCandidateId: candidate.payment_candidate_id,
      finalityConfirmedAt: body.auditContext.occurredAt,
      state: finalPaymentState,
      metadata: {
        source: "bank_transaction_promotion",
        statementId: candidate.statement_id,
        sourceBankTransactionIds: candidate.source_bank_transaction_ids,
        settlementHint: candidate.settlement_hint,
        reviewReasonCodes: candidate.review_reason_codes,
        ...(body.customerProfileId ? { customerProfileId: body.customerProfileId } : {}),
      },
      auditContext: body.auditContext,
    });
    await persistence.paymentCandidateStore.markPromoted(candidate.payment_candidate_id, body.auditContext.occurredAt);

    return reply.status(201).send({
      paymentId: payment.id,
      paymentState: payment.state,
      settlementStatus: payment.settlementStatus,
      candidateId: candidate.payment_candidate_id,
    });
  });
};

function ensureBinaryFileParsers(app: FastifyInstance) {
  const binaryContentTypes = [
    "text/csv",
    "application/csv",
    "application/octet-stream",
  ];

  for (const contentType of binaryContentTypes) {
    if (app.hasContentTypeParser(contentType)) {
      continue;
    }

    app.addContentTypeParser(contentType, { parseAs: "buffer" }, (_request, body, done) => {
      done(null, body);
    });
  }
}

function readBinaryBody(body: unknown) {
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (typeof body === "string") {
    return Buffer.from(body, "utf8");
  }
  throw new Error("Bank statement file upload requires a binary request body.");
}

function createPersistence() {
  const databaseUrl = createDatabaseClientConfig().connectionString;
  const tenantId = "default";
  if (databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl)) {
    return {
      mode: "postgres" as const,
      rawPayloadRepository: new PostgresPerfiosRawPayloadRepository(databaseUrl, tenantId),
      statementRepository: new PostgresPerfiosStatementRepository(databaseUrl, tenantId),
      transactionRepository: new PostgresPerfiosTransactionRepository(databaseUrl, tenantId),
      bankStatementStore: new PostgresBankStatementStore(databaseUrl, tenantId),
      paymentCandidateStore: new PostgresPaymentCandidateStore(databaseUrl, tenantId),
      paymentRecordStore: new PostgresPaymentRecordStore(databaseUrl, tenantId),
    };
  }

  return {
    mode: "in_memory" as const,
    rawPayloadRepository: inMemoryRawPayloadRepository,
    statementRepository: inMemoryStatementRepository,
    transactionRepository: inMemoryTransactionRepository,
    bankStatementStore: inMemoryBankStatementStore,
    paymentCandidateStore: inMemoryPaymentCandidateStore,
    paymentRecordStore: inMemoryPaymentRecordStore,
  };
}

function summarizeRecord(record: StoredBankStatementIngestionRecord) {
  return {
    statementId: record.statement.statement_id,
    rawPayloadId: record.rawPayload.raw_payload_id,
    parserConfidenceLevel: record.statement.parser_confidence_level,
    normalizedTransactionCount: record.transactions.length,
    readyTransactionCount: record.transactionDecisions.filter(
      (decision) => decision.reconciliation_ready,
    ).length,
    reviewRequiredTransactionCount: record.transactionDecisions.filter(
      (decision) => decision.review !== undefined,
    ).length,
    ingestedAt: record.ingestedAt,
    ...(record.statement.account_name ? { accountName: record.statement.account_name } : {}),
    ...(record.statement.bank_name ? { bankName: record.statement.bank_name } : {}),
  };
}

function buildPaymentCandidates(params: {
  tenantId: string;
  statement: PerfiosNormalizedStatementRecord;
  transactions: PerfiosNormalizedTransactionRecord[];
  occurredAt: string;
}): PaymentCandidateRecord[] {
  return params.transactions
    .filter((transaction) => transaction.inferred_direction === "credit")
    .map((transaction) => {
      const reviewReasonCodes = readPaymentCandidateReviewReasons(transaction);
      const confidenceBand = readPaymentCandidateConfidenceBand(transaction);
      const status = readPaymentCandidateStatus(transaction, reviewReasonCodes);
      const paymentReference = transaction.cheque_number ?? transaction.external_transaction_id;
      const candidateSeed = `${params.tenantId}:${transaction.transaction_id}`;

      return {
        payment_candidate_id: deterministicUuid(`payment_candidate:${candidateSeed}`),
        tenant_id: params.tenantId,
        statement_id: params.statement.statement_id,
        source_bank_transaction_ids: [transaction.transaction_id],
        amount_minor: transaction.amount,
        currency: params.statement.currency ?? "PHP",
        settlement_hint: transaction.settlement_hint,
        settlement_status: transaction.settlement_status,
        confidence_band: confidenceBand,
        review_reason_codes: reviewReasonCodes,
        status,
        created_at: params.occurredAt,
        updated_at: params.occurredAt,
        metadata: {
          normalizedTransactionId: transaction.transaction_id,
          reviewStatus: transaction.review_status,
          duplicateStatus: transaction.duplicate_status,
          parserConfidenceLevel: transaction.parser_confidence_level,
          candidatePaymentFlag: transaction.candidate_payment_flag,
        },
        ...(typeof transaction.parser_confidence === "number"
          ? { confidence_score: transaction.parser_confidence }
          : {}),
        ...(paymentReference ? { payment_reference: paymentReference } : {}),
      };
    });
}

function readPaymentCandidateReviewReasons(
  transaction: PerfiosNormalizedTransactionRecord,
): PaymentReviewReasonCode[] {
  const reasons = new Set<PaymentReviewReasonCode>();

  if (transaction.duplicate_status !== "unique") {
    reasons.add("bank_transaction_duplicate_suspected");
  }
  if (transaction.settlement_status === "pending_clearance") {
    reasons.add("pending_check_clearance");
  }
  if (transaction.settlement_status === "pending_source_confirmation") {
    reasons.add("reversal_risk_not_cleared");
  }
  if (transaction.review_status === "needs_review" && transaction.parser_confidence_level === "low") {
    reasons.add("cross_entity_payer_ambiguity");
  }

  return [...reasons];
}

function readPaymentCandidateConfidenceBand(
  transaction: PerfiosNormalizedTransactionRecord,
): PaymentCandidateRecord["confidence_band"] {
  return transaction.parser_confidence_level;
}

function readPaymentCandidateStatus(
  transaction: PerfiosNormalizedTransactionRecord,
  reviewReasonCodes: PaymentReviewReasonCode[],
): PaymentCandidateRecord["status"] {
  if (transaction.settlement_status === "reversed" || transaction.settlement_status === "failed_clearance") {
    return "reversed";
  }
  if (reviewReasonCodes.length > 0 || !transaction.candidate_payment_flag) {
    return "review_required";
  }

  return "ingested_unmatched";
}

function evaluatePaymentCandidatePromotion(candidate: PaymentCandidateRecord): {
  allowed: boolean;
  blockingReasons: string[];
} {
  const blockingReasons: string[] = [];

  if (candidate.status === "promoted_to_payment") {
    blockingReasons.push("candidate_already_promoted");
  }
  if (candidate.settlement_status !== "settled") {
    blockingReasons.push(`settlement_status_${candidate.settlement_status}`);
  }
  if (candidate.review_reason_codes.length > 0) {
    blockingReasons.push(...candidate.review_reason_codes);
  }
  if (candidate.status === "reversed") {
    blockingReasons.push("candidate_reversed");
  }

  return {
    allowed: blockingReasons.length === 0,
    blockingReasons,
  };
}

function readStatementReview(metadata: Record<string, unknown>) {
  const value = metadata.statementReview;
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.queue === "string" &&
    Array.isArray(record.reasons) &&
    typeof record.blocking === "boolean"
  ) {
    return {
      queue: record.queue,
      reasons: record.reasons.filter((reason): reason is string => typeof reason === "string"),
      blocking: record.blocking,
    };
  }

  return undefined;
}

function readTransactionDecisions(
  metadata: Record<string, unknown>,
  transactions: PerfiosNormalizedTransactionRecord[],
) {
  const rawDecisions = metadata.transactionDecisions;
  if (Array.isArray(rawDecisions)) {
    return rawDecisions as StoredBankStatementIngestionRecord["transactionDecisions"];
  }

  return transactions.map((transaction) => ({
    ...(transaction.external_transaction_id
      ? { external_transaction_id: transaction.external_transaction_id }
      : {}),
    parser_confidence_level: transaction.parser_confidence_level,
    automation_eligibility: transaction.automation_eligibility,
    duplicate_flag: transaction.duplicate_flag,
    reconciliation_ready: transaction.reconciliation_ready,
    ...(transaction.duplicate_flag || transaction.parser_confidence_level === "low"
      ? {
          review: {
            queue: transaction.duplicate_flag ? "duplicate_review" : "ingestion_review",
            reasons: transaction.duplicate_flag
              ? ["possible_duplicate"]
              : ["perfios_transaction_low_confidence"],
            blocking: true,
          },
        }
      : {}),
  }));
}

function compactDuplicateSignals(
  value: unknown,
):
  | {
      statement?: DuplicateSignalInput;
      transactions?: Record<string, DuplicateSignalInput>;
    }
  | undefined {
  if (!value) {
    return undefined;
  }

  const input = value as {
    statement?: Record<string, unknown>;
    transactions?: Record<string, Record<string, unknown>>;
  };
  const statement = compactDuplicateSignal(input.statement);
  const transactions = compactTransactionDuplicateSignals(input.transactions);
  const compacted = {
    ...(statement ? { statement } : {}),
    ...(transactions ? { transactions } : {}),
  };

  return Object.keys(compacted).length > 0 ? compacted : undefined;
}

function compactDuplicateSignal(value: Record<string, unknown> | undefined): DuplicateSignalInput | undefined {
  if (!value) {
    return undefined;
  }

  const compacted = {
    ...(typeof value.sameDocumentChecksum === "boolean"
      ? { sameDocumentChecksum: value.sameDocumentChecksum }
      : {}),
    ...(typeof value.sameProviderRecordId === "boolean"
      ? { sameProviderRecordId: value.sameProviderRecordId }
      : {}),
    ...(typeof value.sameBusinessKey === "boolean" ? { sameBusinessKey: value.sameBusinessKey } : {}),
    ...(typeof value.fuzzySimilarityScore === "number"
      ? { fuzzySimilarityScore: value.fuzzySimilarityScore }
      : {}),
  };

  return Object.keys(compacted).length > 0 ? compacted : undefined;
}

function compactTransactionDuplicateSignals(
  value: Record<string, Record<string, unknown>> | undefined,
): Record<string, DuplicateSignalInput> | undefined {
  if (!value) {
    return undefined;
  }

  const entries = Object.entries(value)
    .map(([transactionId, signal]) => [transactionId, compactDuplicateSignal(signal)] as const)
    .filter((entry): entry is readonly [string, DuplicateSignalInput] => entry[1] !== undefined);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function deterministicTextId(namespace: string, seed: string) {
  return `${namespace}_${createHash("sha1").update(seed).digest("hex").slice(0, 20)}`;
}

function deterministicUuid(seed: string) {
  const hash = createHash("sha1").update(seed).digest("hex").slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function nullableText(value?: string) {
  return value ? `'${quoteLiteral(value)}'` : "NULL";
}

function nullableUuid(value?: string) {
  return value ? `'${quoteLiteral(value)}'::uuid` : "NULL";
}

function nullableDate(value?: string) {
  return value ? `'${quoteLiteral(value)}'::date` : "NULL";
}

function nullableInteger(value?: number) {
  return Number.isInteger(value) ? String(value) : "NULL";
}

function nullableBigint(value?: number) {
  return typeof value === "number" ? String(Math.round(value)) : "NULL";
}

function nullableJson(value?: Record<string, unknown>) {
  return value ? `'${jsonLiteral(value)}'::jsonb` : "NULL";
}
