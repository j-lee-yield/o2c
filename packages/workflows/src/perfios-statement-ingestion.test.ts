import { describe, expect, it } from "vitest";

import { InMemoryAuditLogger } from "@o2c/audit";
import type {
  DuplicateSignalInput,
  PerfiosNormalizedStatementRecord,
  PerfiosNormalizedTransactionRecord,
  PerfiosParsedBankStatement,
  PerfiosRawStatementPayloadRecord,
} from "@o2c/contracts";

import {
  MockPerfiosStatementParser,
  applyPerfiosTransactionHumanCorrection,
  classifyPerfiosConfidence,
  defaultPerfiosStatementIngestionPolicy,
  ingestPerfiosBankStatement,
} from "./perfios-statement-ingestion.js";

const auditContext = {
  actorId: "system",
  actorType: "automation" as const,
  correlationId: "corr-perfios-1",
  occurredAt: "2026-03-26T00:00:00.000Z",
};

describe("Perfios statement ingestion", () => {
  it("stores raw payload, normalized statement, and normalized transactions with confidence policy applied", async () => {
    const auditLogger = new InMemoryAuditLogger();
    const rawPayloadRepository = new InMemoryPerfiosRawPayloadRepository();
    const statementRepository = new InMemoryPerfiosStatementRepository();
    const transactionRepository = new InMemoryPerfiosTransactionRepository();
    const duplicateDetector = new StubPerfiosDuplicateDetector();
    const parser = new MockPerfiosStatementParser(makeParsedStatement());

    const result = await ingestPerfiosBankStatement({
      document: makeParsedStatement().document,
      fileReference: "documents/bank-statement.pdf",
      auditContext,
      deps: {
        parser,
        rawPayloadRepository,
        statementRepository,
        transactionRepository,
        duplicateDetector,
        auditLogger,
        now: () => "2026-03-26T00:00:00.000Z",
      },
    });

    expect(result.raw_payload.source_provider).toBe("perfios");
    expect(result.statement.source_provider).toBe("perfios");
    expect(result.statement.account_number_masked).toBe("XXXX-4321");
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions[0]).toMatchObject({
      external_transaction_id: "txn-100",
      parser_confidence_level: "high",
      automation_eligibility: "matching_suggestions_and_auto_apply_evaluation",
      duplicate_flag: false,
      reconciliation_ready: true,
    });
    expect(result.transactions[1]).toMatchObject({
      external_transaction_id: "txn-101",
      parser_confidence_level: "medium",
      automation_eligibility: "matching_suggestions_only",
      duplicate_flag: false,
      reconciliation_ready: true,
    });
    expect(result.transactions[2]).toMatchObject({
      external_transaction_id: "txn-102",
      parser_confidence_level: "low",
      automation_eligibility: "blocked_pending_correction",
      duplicate_flag: false,
      reconciliation_ready: false,
    });
    expect(result.transaction_decisions[2]!.review?.queue).toBe("ingestion_review");
    expect(auditLogger.events).toHaveLength(1);
  });

  it("flags duplicate transactions conservatively while still persisting normalized records", async () => {
    const auditLogger = new InMemoryAuditLogger();
    const parser = new MockPerfiosStatementParser(makeParsedStatement());

    const result = await ingestPerfiosBankStatement({
      document: makeParsedStatement().document,
      fileReference: "documents/bank-statement.pdf",
      auditContext,
      deps: {
        parser,
        rawPayloadRepository: new InMemoryPerfiosRawPayloadRepository(),
        statementRepository: new InMemoryPerfiosStatementRepository(),
        transactionRepository: new InMemoryPerfiosTransactionRepository(),
        duplicateDetector: new StubPerfiosDuplicateDetector({
          transactions: {
            "txn-101": { sameBusinessKey: true } satisfies DuplicateSignalInput,
          },
        }),
        auditLogger,
        now: () => "2026-03-26T00:00:00.000Z",
      },
    });

    expect(result.transactions[1]!.duplicate_flag).toBe(true);
    expect(result.transactions[1]!.automation_eligibility).toBe("blocked_pending_correction");
    expect(result.transaction_decisions[1]!.review?.queue).toBe("duplicate_review");
  });

  it("allows human correction without discarding the original field history", () => {
    const corrected = applyPerfiosTransactionHumanCorrection(
      {
        transaction_id: "txn-record-1",
        statement_id: "stmt-1",
        external_transaction_id: "txn-102",
        date: "2026-03-23",
        description: "Unknown transfer",
        amount: 25000,
        balance: 500000,
        inferred_direction: "credit",
        parser_confidence: 0.4,
        parser_confidence_level: "low",
        duplicate_flag: true,
        duplicate_status: "suspected_duplicate",
        candidate_payment_flag: true,
        settlement_hint: "transfer",
        settlement_status: "settled",
        review_status: "needs_review",
        human_corrected_fields: {},
        automation_eligibility: "blocked_pending_correction",
        reconciliation_ready: false,
        created_at: "2026-03-26T00:00:00.000Z",
      },
      {
        corrected_at: "2026-03-26T01:00:00.000Z",
        corrected_by: "collector_1",
        fields: {
          description: "Customer payment from ACME",
          parser_confidence: 0.91,
        },
        policy: defaultPerfiosStatementIngestionPolicy.confidence,
        reason: "Matched against remittance advice",
      }
    );

    expect(corrected.description).toBe("Customer payment from ACME");
    expect(corrected.parser_confidence_level).toBe("high");
    expect(corrected.automation_eligibility).toBe(
      "matching_suggestions_and_auto_apply_evaluation"
    );
    expect(corrected.duplicate_flag).toBe(false);
    expect(corrected.human_corrected_fields.description?.previous_value).toBe("Unknown transfer");
    expect(corrected.human_corrected_fields.parser_confidence?.corrected_value).toBe(0.91);
  });

  it("keeps confidence policy centrally revisable", () => {
    expect(
      classifyPerfiosConfidence(0.82, {
        highConfidenceMin: 0.95,
        mediumConfidenceMin: 0.8,
      })
    ).toBe("medium");
  });
});

class InMemoryPerfiosRawPayloadRepository {
  private counter = 0;
  readonly records: PerfiosRawStatementPayloadRecord[] = [];

  async save(
    input: Omit<PerfiosRawStatementPayloadRecord, "raw_payload_id">
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
    input: Omit<PerfiosNormalizedStatementRecord, "statement_id">
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
    input: Array<Omit<PerfiosNormalizedTransactionRecord, "transaction_id">>
  ): Promise<PerfiosNormalizedTransactionRecord[]> {
    const records = input.map((entry) => {
      this.counter += 1;
      return { transaction_id: `transaction_${this.counter}`, ...entry };
    });

    this.records.push(...records);
    return records;
  }
}

class StubPerfiosDuplicateDetector {
  constructor(
    private readonly responses: {
      statement?: DuplicateSignalInput;
      transactions?: Record<string, DuplicateSignalInput>;
    } = {}
  ) {}

  async detectStatementDuplicateSignals(): Promise<DuplicateSignalInput> {
    return this.responses.statement ?? {};
  }

  async detectTransactionDuplicateSignals(): Promise<Record<string, DuplicateSignalInput>> {
    return this.responses.transactions ?? {};
  }
}

function makeParsedStatement(): PerfiosParsedBankStatement {
  return {
    provider: "perfios",
    document: {
      documentId: "doc-bank-1",
      checksum: "sha256-bank-1",
      source: "portal",
      uploadedAt: "2026-03-26T00:00:00.000Z",
    },
    raw_payload: {
      requestId: "perfios-request-1",
      accountSummary: {
        accountNumber: "XXXX-4321",
      },
    },
    statement: {
      bank_name: "BDO",
      account_name: "Acme Trading Corp",
      account_number_masked: "XXXX-4321",
      statement_period_start: "2026-03-01",
      statement_period_end: "2026-03-31",
      currency: "PHP",
      parser_confidence: 0.93,
    },
    transactions: [
      {
        external_transaction_id: "txn-100",
        date: "2026-03-21",
        description: "Customer payment - ACME",
        amount: 100000,
        balance: 600000,
        category: "customer_payment",
        parser_confidence: 0.97,
        source_page: 1,
        source_row: 4,
      },
      {
        external_transaction_id: "txn-101",
        date: "2026-03-22",
        description: "Online transfer",
        amount: 40000,
        balance: 640000,
        category: "bank_transfer",
        parser_confidence: 0.8,
        source_page: 1,
        source_row: 5,
      },
      {
        external_transaction_id: "txn-102",
        date: "2026-03-23",
        description: "Unreadable row",
        amount: -25000,
        balance: 615000,
        category: "unclassified",
        parser_confidence: 0.45,
        source_page: 2,
        source_row: 1,
      },
    ],
  };
}
