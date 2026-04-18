import type { AuditLogger } from "@o2c/audit";
import type {
  AuditContext,
  DuplicateDetectionResult,
  DuplicateSignalInput,
  PerfiosParsedBankStatement,
  PerfiosParsedTransactionDraft,
  ReviewDecision,
  YieldBirInvoiceExtraction,
  YieldRemittanceExtraction,
} from "@o2c/contracts";

export interface IngestionFoundationDependencies {
  auditLogger: AuditLogger;
}

export interface IngestionPolicyConfig {
  bir: {
    provisionalInvoiceMinConfidence: number;
    matchingSuggestionMinConfidence: number;
  };
  perfios: {
    provisionalTransactionMinConfidence: number;
    suspectedDuplicateMinSimilarity: number;
  };
  remittance: {
    autoLinkCandidateMinConfidence: number;
    suspectedDuplicateMinSimilarity: number;
  };
}

export const defaultIngestionPolicyConfig: IngestionPolicyConfig = {
  bir: {
    provisionalInvoiceMinConfidence: 0.95,
    matchingSuggestionMinConfidence: 0.9,
  },
  perfios: {
    provisionalTransactionMinConfidence: 0.9,
    suspectedDuplicateMinSimilarity: 0.92,
  },
  remittance: {
    autoLinkCandidateMinConfidence: 0.85,
    suspectedDuplicateMinSimilarity: 0.92,
  }
};

export interface BirInvoiceIngestionDecision {
  duplicateCheck: DuplicateDetectionResult;
  createProvisionalInvoice: boolean;
  createMatchingSuggestion: boolean;
  review?: ReviewDecision;
  collectionsEligibility: "blocked_pending_match_or_confirmation" | "eligible";
}

export interface BankStatementTransactionDecision {
  transactionId: string;
  route: "create_provisional_payment_candidate" | "queue_review";
  review?: ReviewDecision;
}

export interface BankStatementIngestionDecision {
  duplicateCheck: DuplicateDetectionResult;
  persistRawPayload: true;
  persistNormalizedTransactions: true;
  review?: ReviewDecision;
  transactionDecisions: BankStatementTransactionDecision[];
}

export interface RemittanceIngestionDecision {
  duplicateCheck: DuplicateDetectionResult;
  route: "link_payment_candidate" | "link_invoice_candidate" | "queue_review";
  review?: ReviewDecision;
}

export function classifyDuplicateSignals(
  input: DuplicateSignalInput,
  options: { suspectedDuplicateMinSimilarity: number }
): DuplicateDetectionResult {
  const reasons: string[] = [];

  if (input.sameDocumentChecksum) {
    reasons.push("matching_document_checksum");
  }

  if (input.sameProviderRecordId) {
    reasons.push("matching_provider_record_id");
  }

  if (input.sameBusinessKey) {
    reasons.push("matching_business_key");
  }

  if ((input.fuzzySimilarityScore ?? 0) >= options.suspectedDuplicateMinSimilarity) {
    reasons.push("high_similarity");
  }

  if (input.sameDocumentChecksum || input.sameProviderRecordId) {
    return {
      classification: "exact_duplicate",
      reasons,
      matchedEntityIds: []
    };
  }

  if (input.sameBusinessKey || (input.fuzzySimilarityScore ?? 0) >= options.suspectedDuplicateMinSimilarity) {
    return {
      classification: "suspected_duplicate",
      reasons,
      matchedEntityIds: []
    };
  }

  return {
    classification: "unique",
    reasons,
    matchedEntityIds: []
  };
}

export async function evaluateBirInvoiceIngestion(params: {
  extraction: YieldBirInvoiceExtraction;
  duplicateSignals?: DuplicateSignalInput;
  erpMatched: boolean;
  humanConfirmed: boolean;
  auditContext: AuditContext;
  deps: IngestionFoundationDependencies;
  policy?: IngestionPolicyConfig;
}): Promise<BirInvoiceIngestionDecision> {
  const policy = params.policy ?? defaultIngestionPolicyConfig;
  const duplicateCheck = classifyDuplicateSignals(params.duplicateSignals ?? {}, {
    suspectedDuplicateMinSimilarity: policy.remittance.suspectedDuplicateMinSimilarity
  });

  const blockedForDuplicate = duplicateCheck.classification !== "unique";
  const createProvisionalInvoice =
    !blockedForDuplicate &&
    params.extraction.overallConfidence >= policy.bir.provisionalInvoiceMinConfidence;
  const createMatchingSuggestion =
    !blockedForDuplicate &&
    params.extraction.overallConfidence >= policy.bir.matchingSuggestionMinConfidence;
  const collectionsEligibility =
    params.erpMatched || params.humanConfirmed
      ? "eligible"
      : "blocked_pending_match_or_confirmation";
  const review: ReviewDecision | undefined = blockedForDuplicate
    ? {
        queue: "duplicate_review",
        reasons: duplicateCheck.reasons.length > 0 ? duplicateCheck.reasons : ["possible_duplicate"],
        blocking: true
      }
    : !createProvisionalInvoice
      ? {
          queue: "ingestion_review",
          reasons: ["bir_confidence_below_provisional_threshold"],
          blocking: true
        }
      : undefined;

  const decision: BirInvoiceIngestionDecision = {
    duplicateCheck,
    createProvisionalInvoice,
    createMatchingSuggestion,
    ...(review ? { review } : {}),
    collectionsEligibility
  };

  await params.deps.auditLogger.log(params.auditContext, {
    action: "ingestion.bir_invoice_evaluated",
    entityId: params.extraction.document.documentId,
    entityType: "uploaded_document",
    metadata: {
      provider: params.extraction.provider,
      overallConfidence: params.extraction.overallConfidence,
      createProvisionalInvoice,
      createMatchingSuggestion,
      collectionsEligibility,
      duplicateClassification: duplicateCheck.classification
    },
  });

  return decision;
}

export async function evaluateBankStatementIngestion(params: {
  statement: PerfiosParsedBankStatement;
  statementDuplicateSignals?: DuplicateSignalInput;
  transactionDuplicateSignals?: Record<string, DuplicateSignalInput>;
  auditContext: AuditContext;
  deps: IngestionFoundationDependencies;
  policy?: IngestionPolicyConfig;
}): Promise<BankStatementIngestionDecision> {
  const policy = params.policy ?? defaultIngestionPolicyConfig;
  const duplicateCheck = classifyDuplicateSignals(params.statementDuplicateSignals ?? {}, {
    suspectedDuplicateMinSimilarity: policy.perfios.suspectedDuplicateMinSimilarity
  });
  const review: ReviewDecision | undefined =
    duplicateCheck.classification !== "unique"
      ? {
          queue: "duplicate_review",
          reasons: duplicateCheck.reasons.length > 0 ? duplicateCheck.reasons : ["possible_duplicate"],
          blocking: true
        }
      : undefined;

  const transactionDecisions = params.statement.transactions.map((transaction) => {
    const duplicateSignals =
      params.transactionDuplicateSignals?.[
        transaction.external_transaction_id ?? transaction.description
      ];

    return evaluateBankStatementTransaction({
      transaction,
      ...(duplicateSignals ? { duplicateSignals } : {}),
      policy
    });
  });

  await params.deps.auditLogger.log(params.auditContext, {
    action: "ingestion.bank_statement_evaluated",
    entityId: params.statement.document.documentId,
    entityType: "uploaded_document",
    metadata: {
      provider: params.statement.provider,
      overallConfidence: params.statement.statement.parser_confidence,
      transactionCount: params.statement.transactions.length,
      duplicateClassification: duplicateCheck.classification
    },
  });

  return {
    duplicateCheck,
    persistRawPayload: true,
    persistNormalizedTransactions: true,
    ...(review ? { review } : {}),
    transactionDecisions
  };
}

export async function evaluateRemittanceIngestion(params: {
  extraction: YieldRemittanceExtraction;
  duplicateSignals?: DuplicateSignalInput;
  matchedPaymentCount: number;
  matchedInvoiceCount: number;
  auditContext: AuditContext;
  deps: IngestionFoundationDependencies;
  policy?: IngestionPolicyConfig;
}): Promise<RemittanceIngestionDecision> {
  const policy = params.policy ?? defaultIngestionPolicyConfig;
  const duplicateCheck = classifyDuplicateSignals(params.duplicateSignals ?? {}, {
    suspectedDuplicateMinSimilarity: policy.remittance.suspectedDuplicateMinSimilarity
  });

  let route: RemittanceIngestionDecision["route"] = "queue_review";
  let review: ReviewDecision | undefined;

  if (duplicateCheck.classification !== "unique") {
    review = {
      queue: "duplicate_review",
      reasons: duplicateCheck.reasons.length > 0 ? duplicateCheck.reasons : ["possible_duplicate"],
      blocking: true
    };
  } else if (params.matchedPaymentCount === 1) {
    route = "link_payment_candidate";
  } else if (
    params.matchedPaymentCount === 0 &&
    params.matchedInvoiceCount >= 1 &&
    params.extraction.overallConfidence >= policy.remittance.autoLinkCandidateMinConfidence
  ) {
    route = "link_invoice_candidate";
  } else {
    review = {
      queue: "matching_review",
      reasons: ["ambiguous_or_low_confidence_remittance"],
      blocking: true
    };
  }

  await params.deps.auditLogger.log(params.auditContext, {
    action: "ingestion.remittance_evaluated",
    entityId: params.extraction.document.documentId,
    entityType: "uploaded_document",
    metadata: {
      provider: params.extraction.provider,
      overallConfidence: params.extraction.overallConfidence,
      matchedPaymentCount: params.matchedPaymentCount,
      matchedInvoiceCount: params.matchedInvoiceCount,
      route,
      duplicateClassification: duplicateCheck.classification
    },
  });

  return {
    duplicateCheck,
    route,
    ...(review ? { review } : {})
  };
}

function evaluateBankStatementTransaction(params: {
  transaction: PerfiosParsedTransactionDraft;
  duplicateSignals?: DuplicateSignalInput;
  policy: IngestionPolicyConfig;
}): BankStatementTransactionDecision {
  const duplicateCheck = classifyDuplicateSignals(params.duplicateSignals ?? {}, {
    suspectedDuplicateMinSimilarity: params.policy.perfios.suspectedDuplicateMinSimilarity
  });

  if (duplicateCheck.classification !== "unique") {
    return {
      transactionId: params.transaction.external_transaction_id ?? params.transaction.description,
      route: "queue_review",
      review: {
        queue: "duplicate_review",
        reasons: duplicateCheck.reasons.length > 0 ? duplicateCheck.reasons : ["possible_duplicate"],
        blocking: true
      }
    };
  }

  if (params.transaction.parser_confidence >= params.policy.perfios.provisionalTransactionMinConfidence) {
    return {
      transactionId: params.transaction.external_transaction_id ?? params.transaction.description,
      route: "create_provisional_payment_candidate"
    };
  }

  return {
    transactionId: params.transaction.external_transaction_id ?? params.transaction.description,
    route: "queue_review",
    review: {
      queue: "ingestion_review",
      reasons: ["perfios_transaction_confidence_below_threshold"],
      blocking: true
    }
  };
}
