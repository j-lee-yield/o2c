import type { AuditLogger } from "@o2c/audit";
import type {
  AllowedBirDownstreamAction,
  AuditContext,
  BirInvoiceDuplicateCandidate,
  BirInvoiceFieldKey,
  BirInvoiceFieldValue,
  BirInvoiceHierarchyContext,
  BirInvoiceParserResult,
  BirInvoiceReviewCase,
  ConfidenceBand,
  DuplicateDetectionResult,
  DuplicateSignalInput,
  ErpInvoiceCandidate,
  InvoiceMatchSuggestion,
  ProvisionalInvoiceDraft,
  ReviewDecision,
} from "@o2c/contracts";

import { classifyDuplicateSignals } from "./ingestion-foundation.js";

export class MissingBirInvoiceFieldError extends Error {
  readonly field: BirInvoiceFieldKey;

  constructor(field: BirInvoiceFieldKey) {
    super(`BIR invoice field "${field}" is required for provisional invoice creation.`);
    this.name = "MissingBirInvoiceFieldError";
    this.field = field;
  }
}

export interface BirInvoiceIngestionDependencies {
  auditLogger: AuditLogger;
}

export interface BirInvoiceIngestionPolicy {
  highConfidenceMin: number;
  mediumConfidenceMin: number;
  matchSuggestionMinScore: number;
  duplicateMinSimilarity: number;
}

export const defaultBirInvoiceIngestionPolicy: BirInvoiceIngestionPolicy = {
  highConfidenceMin: 0.9,
  mediumConfidenceMin: 0.75,
  matchSuggestionMinScore: 0.55,
  duplicateMinSimilarity: 0.88,
};

export function resolveBirInvoiceFieldValue<TValue>(
  field: BirInvoiceFieldValue<TValue> | undefined
): TValue | undefined {
  return field?.finalLocked ?? field?.humanCorrected ?? field?.normalized ?? field?.extracted;
}

export function determineBirInvoiceConfidenceBand(
  parserResult: BirInvoiceParserResult,
  policy: BirInvoiceIngestionPolicy = defaultBirInvoiceIngestionPolicy
): ConfidenceBand {
  const requiredFieldValues = [
    resolveBirInvoiceFieldValue(parserResult.sellerLegalEntity),
    resolveBirInvoiceFieldValue(parserResult.buyerName),
    resolveBirInvoiceFieldValue(parserResult.invoiceNumber),
    resolveBirInvoiceFieldValue(parserResult.invoiceDate),
    resolveBirInvoiceFieldValue(parserResult.totalAmountCents),
    resolveBirInvoiceFieldValue(parserResult.currency),
    resolveBirInvoiceFieldValue(parserResult.lineItemsSummary),
    resolveBirInvoiceFieldValue(parserResult.documentType),
  ];

  const requiredFieldConfidences = [
    parserResult.sellerLegalEntity.extractionConfidence,
    parserResult.buyerName.extractionConfidence,
    parserResult.invoiceNumber.extractionConfidence,
    parserResult.invoiceDate.extractionConfidence,
    parserResult.totalAmountCents.extractionConfidence,
    parserResult.currency.extractionConfidence,
    parserResult.lineItemsSummary.extractionConfidence,
    parserResult.documentType.extractionConfidence,
  ];

  const hasAllRequiredValues = requiredFieldValues.every((value) => value !== undefined);
  const minimumRequiredConfidence = Math.min(...requiredFieldConfidences);

  if (
    hasAllRequiredValues &&
    parserResult.metadata.overallConfidence >= policy.highConfidenceMin &&
    minimumRequiredConfidence >= policy.mediumConfidenceMin
  ) {
    return "high";
  }

  if (
    parserResult.metadata.overallConfidence >= policy.mediumConfidenceMin &&
    requiredFieldValues.filter((value) => value !== undefined).length >= 6
  ) {
    return "medium";
  }

  return "low";
}

export function detectBirInvoiceDuplicates(params: {
  parserResult: BirInvoiceParserResult;
  candidates?: BirInvoiceDuplicateCandidate[];
  policy?: BirInvoiceIngestionPolicy;
}): DuplicateDetectionResult {
  const policy = params.policy ?? defaultBirInvoiceIngestionPolicy;
  const parserResult = params.parserResult;
  const candidates = params.candidates ?? [];
  const matchedEntityIds = new Set<string>();

  let strongestSignals: DuplicateSignalInput = {};
  let strongestScore = 0;

  for (const candidate of candidates) {
    const score = computeBirDuplicateSimilarity(parserResult, candidate);
    const sameDocumentChecksum = candidate.fileHash === parserResult.metadata.fileHash;
    const sameBusinessKey =
      normalizeText(candidate.invoiceNumber) ===
        normalizeText(resolveBirInvoiceFieldValue(parserResult.invoiceNumber)) &&
      normalizeText(candidate.sellerLegalEntity) ===
        normalizeText(resolveBirInvoiceFieldValue(parserResult.sellerLegalEntity)) &&
      normalizeText(candidate.buyerName) ===
        normalizeText(resolveBirInvoiceFieldValue(parserResult.buyerName)) &&
      candidate.totalAmountCents === resolveBirInvoiceFieldValue(parserResult.totalAmountCents) &&
      normalizeText(candidate.invoiceDate) ===
        normalizeText(resolveBirInvoiceFieldValue(parserResult.invoiceDate));

    const currentSignals: DuplicateSignalInput = {
      sameDocumentChecksum,
      sameBusinessKey,
      fuzzySimilarityScore: score,
    };

    if (sameDocumentChecksum || sameBusinessKey || score >= policy.duplicateMinSimilarity) {
      matchedEntityIds.add(candidate.entityId);
    }

    if (sameDocumentChecksum || sameBusinessKey || score > strongestScore) {
      strongestScore = score;
      strongestSignals = currentSignals;
    }
  }

  const classified = classifyDuplicateSignals(strongestSignals, {
    suspectedDuplicateMinSimilarity: policy.duplicateMinSimilarity,
  });

  return {
    ...classified,
    matchedEntityIds: [...matchedEntityIds],
  };
}

export function createProvisionalInvoiceDraft(params: {
  parserResult: BirInvoiceParserResult;
  hierarchy: BirInvoiceHierarchyContext;
  invoiceId?: string;
}): ProvisionalInvoiceDraft {
  const invoiceNumber = requireBirInvoiceField(params.parserResult, "invoiceNumber");
  const invoiceDate = requireBirInvoiceField(params.parserResult, "invoiceDate");
  const amountCents = requireBirInvoiceField(params.parserResult, "totalAmountCents");
  const currency = requireBirInvoiceField(params.parserResult, "currency");
  const sellerLegalEntity = requireBirInvoiceField(params.parserResult, "sellerLegalEntity");
  const buyerName = requireBirInvoiceField(params.parserResult, "buyerName");
  const branchId =
    resolveBirInvoiceFieldValue(params.parserResult.branchId) ?? params.hierarchy.branchId;

  return {
    invoiceId: params.invoiceId ?? `prov-${params.parserResult.document.documentId}`,
    parentAccountId: params.hierarchy.parentAccountId,
    billingAccountId: params.hierarchy.billingAccountId,
    ...(branchId ? { branchId } : {}),
    invoiceNumber,
    invoiceDate,
    amountCents,
    currency,
    sellerLegalEntity,
    buyerName,
    uploadedDocumentId: params.parserResult.document.documentId,
    metadata: {
      provisionalSource: "bir_upload",
      parserVersion: params.parserResult.metadata.parserVersion,
      fileHash: params.parserResult.metadata.fileHash,
      poNumber: resolveBirInvoiceFieldValue(params.parserResult.poNumber),
      tin: resolveBirInvoiceFieldValue(params.parserResult.tin),
      businessStyle: resolveBirInvoiceFieldValue(params.parserResult.businessStyle),
      deliveryOrBillToAddress: resolveBirInvoiceFieldValue(
        params.parserResult.deliveryOrBillToAddress
      ),
      receivedStampPresent: resolveBirInvoiceFieldValue(params.parserResult.receivedStampPresent),
      signaturePresent: resolveBirInvoiceFieldValue(params.parserResult.signaturePresent),
      lineItemsSummary: resolveBirInvoiceFieldValue(params.parserResult.lineItemsSummary),
      documentType: resolveBirInvoiceFieldValue(params.parserResult.documentType),
    },
  };
}

export async function suggestInvoiceMatches(params: {
  parserResult: BirInvoiceParserResult;
  candidates?: ErpInvoiceCandidate[];
  auditContext: AuditContext;
  deps: BirInvoiceIngestionDependencies;
  policy?: BirInvoiceIngestionPolicy;
}): Promise<InvoiceMatchSuggestion[]> {
  const policy = params.policy ?? defaultBirInvoiceIngestionPolicy;
  const suggestions = (params.candidates ?? [])
    .map((candidate) => {
      const reasons: string[] = [];
      let score = 0;

      if (
        normalizeText(candidate.invoiceNumber) ===
        normalizeText(resolveBirInvoiceFieldValue(params.parserResult.invoiceNumber))
      ) {
        reasons.push("exact_invoice_number");
        score += 0.55;
      }

      if (candidate.amountCents === resolveBirInvoiceFieldValue(params.parserResult.totalAmountCents)) {
        reasons.push("exact_amount");
        score += 0.15;
      }

      if (candidate.currency === resolveBirInvoiceFieldValue(params.parserResult.currency)) {
        reasons.push("matching_currency");
        score += 0.1;
      }

      if (normalizeText(candidate.buyerName) === normalizeText(resolveBirInvoiceFieldValue(params.parserResult.buyerName))) {
        reasons.push("matching_buyer");
        score += 0.1;
      }

      if (
        normalizeText(candidate.sellerLegalEntity) ===
        normalizeText(resolveBirInvoiceFieldValue(params.parserResult.sellerLegalEntity))
      ) {
        reasons.push("matching_seller");
        score += 0.05;
      }

      if (
        normalizeText(candidate.invoiceDate) ===
        normalizeText(resolveBirInvoiceFieldValue(params.parserResult.invoiceDate))
      ) {
        reasons.push("matching_invoice_date");
        score += 0.05;
      }

      return {
        invoiceId: candidate.invoiceId,
        score: Math.min(score, 1),
        reasons,
      };
    })
    .filter((suggestion) => suggestion.score >= policy.matchSuggestionMinScore)
    .sort((left, right) => right.score - left.score)
    .map((suggestion) => ({
      ...suggestion,
      confidenceBand: scoreToConfidenceBand(suggestion.score),
    }));

  await params.deps.auditLogger.log(params.auditContext, {
    action: "ingestion.bir_invoice_match_suggestions_built",
    entityId: params.parserResult.document.documentId,
    entityType: "uploaded_document",
    metadata: {
      candidateCount: (params.candidates ?? []).length,
      suggestionCount: suggestions.length,
      topScore: suggestions[0]?.score ?? 0,
    },
  });

  return suggestions;
}

export async function buildBirInvoiceReviewCase(params: {
  parserResult: BirInvoiceParserResult;
  hierarchy: BirInvoiceHierarchyContext;
  duplicateCandidates?: BirInvoiceDuplicateCandidate[];
  erpCandidates?: ErpInvoiceCandidate[];
  erpMatched?: boolean;
  humanConfirmed?: boolean;
  auditContext: AuditContext;
  deps: BirInvoiceIngestionDependencies;
  policy?: BirInvoiceIngestionPolicy;
}): Promise<BirInvoiceReviewCase> {
  const policy = params.policy ?? defaultBirInvoiceIngestionPolicy;
  const confidenceBand = determineBirInvoiceConfidenceBand(params.parserResult, policy);
  const duplicateCheck = detectBirInvoiceDuplicates({
    parserResult: params.parserResult,
    policy,
    ...(params.duplicateCandidates ? { candidates: params.duplicateCandidates } : {}),
  });
  const collectionsEligibility =
    params.erpMatched || params.humanConfirmed
      ? "eligible"
      : "blocked_pending_match_or_confirmation";

  const duplicateReview: ReviewDecision | undefined =
    duplicateCheck.classification !== "unique"
      ? {
          queue: "duplicate_review",
          reasons: duplicateCheck.reasons.length > 0 ? duplicateCheck.reasons : ["possible_duplicate"],
          blocking: true,
        }
      : undefined;

  let uploadedDocumentBehavior: BirInvoiceReviewCase["uploadedDocumentBehavior"];
  let review: ReviewDecision | undefined = duplicateReview;
  let provisionalInvoice: ProvisionalInvoiceDraft | undefined;
  let allowedDownstreamActions: AllowedBirDownstreamAction[] = [];
  let matchSuggestions: InvoiceMatchSuggestion[] = [];

  if (duplicateReview) {
    uploadedDocumentBehavior = "create_review_draft";
  } else if (confidenceBand === "high") {
    uploadedDocumentBehavior = "create_or_update_provisional_invoice";
    provisionalInvoice = createProvisionalInvoiceDraft({
      parserResult: params.parserResult,
      hierarchy: params.hierarchy,
    });
    matchSuggestions = await suggestInvoiceMatches({
      parserResult: params.parserResult,
      auditContext: params.auditContext,
      deps: params.deps,
      policy,
      ...(params.erpCandidates ? { candidates: params.erpCandidates } : {}),
    });
    allowedDownstreamActions = [
      ...(matchSuggestions.some((suggestion) => suggestion.score >= 0.95)
        ? []
        : (["create_provisional_invoice"] as const)),
      "suggest_match_to_erp_invoice",
      "attach_document_to_invoice",
      "expose_in_resend_flow",
      "support_cash_application",
      "support_exception_resolution",
    ];
  } else if (confidenceBand === "medium") {
    uploadedDocumentBehavior = "create_review_draft";
    review = {
      queue: "ingestion_review",
      reasons: ["bir_invoice_requires_human_review"],
      blocking: true,
    };
  } else {
    uploadedDocumentBehavior = "store_document_only";
  }

  const reviewCase: BirInvoiceReviewCase = {
    documentId: params.parserResult.document.documentId,
    confidenceBand,
    uploadedDocumentBehavior,
    duplicateCheck,
    ...(review ? { review } : {}),
    parserResult: params.parserResult,
    ...(provisionalInvoice ? { provisionalInvoice } : {}),
    matchSuggestions,
    allowedDownstreamActions,
    collectionsEligibility,
  };

  await params.deps.auditLogger.log(params.auditContext, {
    action: "ingestion.bir_invoice_review_case_built",
    entityId: params.parserResult.document.documentId,
    entityType: "uploaded_document",
    metadata: {
      confidenceBand,
      uploadedDocumentBehavior,
      duplicateClassification: duplicateCheck.classification,
      provisionalInvoiceCreated: Boolean(provisionalInvoice),
      suggestionCount: matchSuggestions.length,
      collectionsEligibility,
    },
  });

  return reviewCase;
}

function requireBirInvoiceField<TKey extends BirInvoiceFieldKey>(
  parserResult: BirInvoiceParserResult,
  field: TKey
): NonNullable<ReturnType<typeof resolveBirInvoiceFieldValue<(typeof parserResult)[TKey] extends BirInvoiceFieldValue<infer TValue> ? TValue : never>>> {
  const fieldValue = resolveBirInvoiceFieldValue(
    parserResult[field] as
      | BirInvoiceFieldValue<
          (typeof parserResult)[TKey] extends BirInvoiceFieldValue<infer TValue> ? TValue : never
        >
      | undefined
  );

  if (fieldValue === undefined) {
    throw new MissingBirInvoiceFieldError(field);
  }

  return fieldValue as NonNullable<typeof fieldValue>;
}

function computeBirDuplicateSimilarity(
  parserResult: BirInvoiceParserResult,
  candidate: BirInvoiceDuplicateCandidate
): number {
  let score = 0;

  if (
    normalizeText(candidate.invoiceNumber) ===
    normalizeText(resolveBirInvoiceFieldValue(parserResult.invoiceNumber))
  ) {
    score += 0.35;
  }

  if (
    normalizeText(candidate.sellerLegalEntity) ===
    normalizeText(resolveBirInvoiceFieldValue(parserResult.sellerLegalEntity))
  ) {
    score += 0.2;
  }

  if (
    normalizeText(candidate.buyerName) === normalizeText(resolveBirInvoiceFieldValue(parserResult.buyerName))
  ) {
    score += 0.2;
  }

  if (candidate.totalAmountCents === resolveBirInvoiceFieldValue(parserResult.totalAmountCents)) {
    score += 0.15;
  }

  if (candidate.currency === resolveBirInvoiceFieldValue(parserResult.currency)) {
    score += 0.05;
  }

  if (
    normalizeText(candidate.invoiceDate) === normalizeText(resolveBirInvoiceFieldValue(parserResult.invoiceDate))
  ) {
    score += 0.05;
  }

  return Number(score.toFixed(2));
}

function normalizeText(value: string | number | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function scoreToConfidenceBand(score: number): ConfidenceBand {
  if (score >= 0.9) {
    return "high";
  }

  if (score >= 0.75) {
    return "medium";
  }

  return "low";
}
