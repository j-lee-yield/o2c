import type { AuditLogger } from "@o2c/audit";
import { InvoiceTransitionService } from "@o2c/domain";
import type {
  BirInvoiceCaseRecord,
  BirInvoiceDuplicateCandidate,
  BirInvoiceFieldCorrectionInput,
  BirInvoiceFieldKey,
  BirInvoiceFieldValue,
  BirInvoiceHierarchyContext,
  BirInvoiceParserResult,
  CreateBirInvoiceCaseRequest,
  ErpInvoiceCandidate,
  ReviewBirInvoiceCaseRequest,
} from "@o2c/contracts";
import type { UploadedDocument, Invoice } from "@o2c/domain";

import {
  buildBirInvoiceReviewCase,
  createProvisionalInvoiceDraft,
  MissingBirInvoiceFieldError,
  resolveBirInvoiceFieldValue,
} from "./bir-invoice-ingestion.js";

export interface StoredBirInvoiceCaseRecord extends BirInvoiceCaseRecord {
  provisionalInvoice?: Invoice;
}

export interface BirInvoiceCaseRepository {
  save(record: StoredBirInvoiceCaseRecord): Promise<void>;
  get(documentId: string): Promise<StoredBirInvoiceCaseRecord | undefined>;
}

export interface BirInvoiceReviewServiceDependencies {
  auditLogger: AuditLogger;
  repository: BirInvoiceCaseRepository;
  now?: () => string;
}

export class BirInvoiceCaseNotFoundError extends Error {
  readonly documentId: string;

  constructor(documentId: string) {
    super(`BIR invoice case "${documentId}" was not found.`);
    this.name = "BirInvoiceCaseNotFoundError";
    this.documentId = documentId;
  }
}

export class BirInvoiceCaseLockedError extends Error {
  readonly documentId: string;

  constructor(documentId: string) {
    super(`BIR invoice case "${documentId}" is locked and cannot be changed.`);
    this.name = "BirInvoiceCaseLockedError";
    this.documentId = documentId;
  }
}

export class BirInvoiceMatchCandidateNotFoundError extends Error {
  readonly documentId: string;
  readonly invoiceId: string;

  constructor(documentId: string, invoiceId: string) {
    super(`ERP invoice "${invoiceId}" is not a known candidate for "${documentId}".`);
    this.name = "BirInvoiceMatchCandidateNotFoundError";
    this.documentId = documentId;
    this.invoiceId = invoiceId;
  }
}

export class InMemoryBirInvoiceCaseRepository implements BirInvoiceCaseRepository {
  private readonly records = new Map<string, StoredBirInvoiceCaseRecord>();

  async save(record: StoredBirInvoiceCaseRecord): Promise<void> {
    this.records.set(record.documentId, structuredClone(record));
  }

  async get(documentId: string): Promise<StoredBirInvoiceCaseRecord | undefined> {
    const record = this.records.get(documentId);
    return record ? structuredClone(record) : undefined;
  }
}

export class BirInvoiceReviewService {
  private readonly now: () => string;
  private readonly invoiceTransitions = new InvoiceTransitionService();

  constructor(private readonly deps: BirInvoiceReviewServiceDependencies) {
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  async createCase(input: CreateBirInvoiceCaseRequest): Promise<StoredBirInvoiceCaseRecord> {
    const timestamp = this.now();
    const reviewCase = await buildBirInvoiceReviewCase({
      parserResult: input.parserResult,
      hierarchy: input.hierarchy,
      auditContext: input.auditContext,
      deps: { auditLogger: this.deps.auditLogger },
      ...(input.duplicateCandidates ? { duplicateCandidates: input.duplicateCandidates } : {}),
      ...(input.erpCandidates ? { erpCandidates: input.erpCandidates } : {}),
      ...(input.erpMatched !== undefined ? { erpMatched: input.erpMatched } : {}),
      ...(input.humanConfirmed !== undefined ? { humanConfirmed: input.humanConfirmed } : {}),
    });

    const uploadedDocument = toUploadedDocument(input, timestamp);
    const provisionalInvoice = this.buildPersistedProvisionalInvoice({
      parserResult: input.parserResult,
      hierarchy: input.hierarchy,
      timestamp,
      collectionsEligibility: reviewCase.collectionsEligibility,
      allowManualCreation: false,
      hasDuplicateBlock: reviewCase.duplicateCheck.classification !== "unique",
    });

    const record: StoredBirInvoiceCaseRecord = {
      documentId: input.parserResult.document.documentId,
      uploadedDocument: {
        ...input.parserResult.document,
        documentType: "bir_invoice",
        ...(input.storageKey ? { storageKey: input.storageKey } : {}),
        uploadedBy: input.uploadedBy ?? input.auditContext.actorId,
      },
      parserResult: structuredClone(input.parserResult),
      hierarchy: structuredClone(input.hierarchy),
      duplicateCandidates: structuredClone(input.duplicateCandidates ?? []),
      erpCandidates: structuredClone(input.erpCandidates ?? []),
      reviewCase,
      status: "pending_review",
      humanConfirmed: input.humanConfirmed ?? false,
      ...(input.erpMatched && input.erpCandidates?.[0]
        ? { matchedErpInvoiceId: input.erpCandidates[0].invoiceId }
        : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(provisionalInvoice ? { provisionalInvoice } : {}),
    };

    await this.deps.repository.save(record);
    await this.deps.auditLogger.log(input.auditContext, {
      action: "ingestion.bir_invoice_case_saved",
      entityId: record.documentId,
      entityType: "uploaded_document",
      metadata: {
        status: record.status,
        confidenceBand: record.reviewCase.confidenceBand,
        provisionalInvoiceCreated: Boolean(record.provisionalInvoice),
      },
    });

    return record;
  }

  async getCase(documentId: string): Promise<StoredBirInvoiceCaseRecord> {
    const record = await this.deps.repository.get(documentId);
    if (!record) {
      throw new BirInvoiceCaseNotFoundError(documentId);
    }

    return record;
  }

  async reviewCase(
    documentId: string,
    input: ReviewBirInvoiceCaseRequest,
  ): Promise<StoredBirInvoiceCaseRecord> {
    const existing = await this.getCase(documentId);
    if (existing.status === "locked") {
      throw new BirInvoiceCaseLockedError(documentId);
    }

    const timestamp = this.now();
    const nextParserResult = structuredClone(existing.parserResult);
    applyCorrections(nextParserResult, input.corrections ?? {}, input.lockDocument === true);
    const duplicateCandidatesForEvaluation =
      input.overrideDuplicateBlock === true ? [] : existing.duplicateCandidates;

    const matchedErpInvoiceId =
      input.selectedErpInvoiceId ??
      existing.matchedErpInvoiceId;

    if (
      matchedErpInvoiceId &&
      !existing.erpCandidates.some((candidate) => candidate.invoiceId === matchedErpInvoiceId)
    ) {
      throw new BirInvoiceMatchCandidateNotFoundError(documentId, matchedErpInvoiceId);
    }

    const humanConfirmed = input.humanConfirmed ?? existing.humanConfirmed;
    const reviewCase = await buildBirInvoiceReviewCase({
      parserResult: nextParserResult,
      hierarchy: existing.hierarchy,
      duplicateCandidates: duplicateCandidatesForEvaluation,
      erpCandidates: existing.erpCandidates,
      erpMatched: Boolean(matchedErpInvoiceId),
      humanConfirmed,
      auditContext: input.auditContext,
      deps: { auditLogger: this.deps.auditLogger },
    });

    const provisionalInvoice = this.buildPersistedProvisionalInvoice({
      parserResult: nextParserResult,
      hierarchy: existing.hierarchy,
      timestamp,
      collectionsEligibility: reviewCase.collectionsEligibility,
      allowManualCreation: input.lockDocument === true,
      hasDuplicateBlock:
        input.overrideDuplicateBlock === true
          ? false
          : reviewCase.duplicateCheck.classification !== "unique",
      existingInvoiceId: existing.provisionalInvoice?.id,
      matchedErpInvoiceId,
    });

    const updatedRecord: StoredBirInvoiceCaseRecord = {
      ...existing,
      parserResult: nextParserResult,
      reviewCase,
      humanConfirmed,
      updatedAt: timestamp,
      ...(matchedErpInvoiceId ? { matchedErpInvoiceId } : {}),
      ...(provisionalInvoice ? { provisionalInvoice } : {}),
      ...(input.lockDocument
        ? {
            status: "locked",
            lockedAt: timestamp,
            lockedByActorId: input.auditContext.actorId,
          }
        : {}),
    };

    await this.deps.repository.save(updatedRecord);
    await this.deps.auditLogger.log(input.auditContext, {
      action: input.lockDocument
        ? "ingestion.bir_invoice_case_locked"
        : "ingestion.bir_invoice_case_reviewed",
      entityId: documentId,
      entityType: "uploaded_document",
      metadata: {
        status: updatedRecord.status,
        confidenceBand: updatedRecord.reviewCase.confidenceBand,
        humanConfirmed,
        matchedErpInvoice: Boolean(matchedErpInvoiceId),
        provisionalInvoiceCreated: Boolean(updatedRecord.provisionalInvoice),
        duplicateOverrideApplied: input.overrideDuplicateBlock === true,
      },
    });

    return updatedRecord;
  }

  private buildPersistedProvisionalInvoice(params: {
    parserResult: BirInvoiceParserResult;
    hierarchy: BirInvoiceHierarchyContext;
    timestamp: string;
    collectionsEligibility: StoredBirInvoiceCaseRecord["reviewCase"]["collectionsEligibility"];
    allowManualCreation: boolean;
    hasDuplicateBlock: boolean;
    existingInvoiceId?: string;
    matchedErpInvoiceId?: string;
  }): Invoice | undefined {
    if (params.hasDuplicateBlock) {
      return undefined;
    }

    const canCreateAutomatically =
      params.allowManualCreation ||
      determineRequiredFieldCompleteness(params.parserResult) === "complete";

    if (!canCreateAutomatically) {
      return undefined;
    }

    let draft;
    try {
      draft = createProvisionalInvoiceDraft({
        parserResult: params.parserResult,
        hierarchy: params.hierarchy,
        ...(params.existingInvoiceId ? { invoiceId: params.existingInvoiceId } : {}),
      });
    } catch (error) {
      if (error instanceof MissingBirInvoiceFieldError) {
        return undefined;
      }
      throw error;
    }

    const canonicalIdentityKey = createCanonicalInvoiceIdentityKey({
      sellerEntityId: draft.sellerLegalEntity,
      billingAccountId: draft.billingAccountId,
      invoiceNumber: draft.invoiceNumber,
      invoiceDate: draft.invoiceDate,
      amountCents: draft.amountCents,
    });

    let invoice: Invoice = {
      id: draft.invoiceId,
      createdAt: params.timestamp,
      updatedAt: params.timestamp,
      state: "uploaded_unmatched",
      sellerEntityId: draft.sellerLegalEntity,
      parentAccountId: draft.parentAccountId,
      billingAccountId: draft.billingAccountId,
      ...(draft.branchId ? { branchId: draft.branchId } : {}),
      uploadedDocumentId: draft.uploadedDocumentId,
      invoiceDate: draft.invoiceDate,
      invoiceNumber: draft.invoiceNumber,
      currency: draft.currency,
      amountCents: draft.amountCents,
      provisionalSource: "bir_upload",
      metadata: {
        ...draft.metadata,
        canonicalIdentityKey,
        collectionsEligibility: params.collectionsEligibility,
        requiresHumanReview: params.collectionsEligibility !== "eligible",
      },
    };

    if (params.matchedErpInvoiceId) {
      invoice = this.invoiceTransitions.transition(invoice, "matched_to_erp", {
        actorId: "system",
        actorRole: "admin",
        occurredAt: params.timestamp,
        reason: "erp_match_confirmed",
        metadata: {
          matchedErpInvoiceId: params.matchedErpInvoiceId,
        },
      });
      invoice.metadata = {
        ...invoice.metadata,
        matchedErpInvoiceId: params.matchedErpInvoiceId,
        matchedAt: params.timestamp,
      };
    }

    return invoice;
  }
}

function applyCorrections(
  parserResult: BirInvoiceParserResult,
  corrections: Partial<Record<BirInvoiceFieldKey, BirInvoiceFieldCorrectionInput>>,
  lockDocument: boolean,
): void {
  for (const [field, correction] of Object.entries(corrections) as [
    BirInvoiceFieldKey,
    BirInvoiceFieldCorrectionInput | undefined,
  ][]) {
    if (!correction) {
      continue;
    }

    const current = parserResult[field] as BirInvoiceFieldValue<unknown> | undefined;
    if (!current) {
      continue;
    }

    current.humanCorrected = correction.value;
    if (correction.lock || lockDocument) {
      current.finalLocked = correction.value;
    }
  }

  if (!lockDocument) {
    return;
  }

  for (const field of birInvoiceLockableFields) {
    const current = parserResult[field];
    if (!current) {
      continue;
    }

    if (current.finalLocked === undefined) {
      (current as BirInvoiceFieldValue<unknown>).finalLocked = resolveBirInvoiceFieldValue(
        current as BirInvoiceFieldValue<unknown>,
      );
    }
  }
}

const birInvoiceLockableFields: BirInvoiceFieldKey[] = [
  "sellerLegalEntity",
  "buyerName",
  "invoiceNumber",
  "invoiceDate",
  "totalAmountCents",
  "currency",
  "poNumber",
  "lineItemsSummary",
  "documentType",
  "tin",
  "businessStyle",
  "deliveryOrBillToAddress",
  "receivedStampPresent",
  "signaturePresent",
  "branchId",
];

function determineRequiredFieldCompleteness(parserResult: BirInvoiceParserResult) {
  const requiredFields: BirInvoiceFieldKey[] = [
    "sellerLegalEntity",
    "buyerName",
    "invoiceNumber",
    "invoiceDate",
    "totalAmountCents",
    "currency",
  ];

  return requiredFields.every(
    (field) =>
      resolveBirInvoiceFieldValue(
        parserResult[field] as BirInvoiceFieldValue<unknown> | undefined,
      ) !== undefined,
  )
    ? "complete"
    : "incomplete";
}

function toUploadedDocument(
  input: CreateBirInvoiceCaseRequest,
  timestamp: string,
): UploadedDocument {
  return {
    id: input.parserResult.document.documentId,
    createdAt: timestamp,
    updatedAt: timestamp,
    documentType: "bir_invoice",
    source: input.parserResult.document.source,
    storageKey: input.storageKey ?? `uploads/${input.parserResult.document.documentId}`,
    checksum: input.parserResult.metadata.fileHash,
    uploadedBy: input.uploadedBy ?? input.auditContext.actorId,
    uploadedAt: input.parserResult.document.uploadedAt,
    behavior: input.humanConfirmed
      ? "create_or_update_provisional_invoice"
      : undefined,
    metadata: {
      fileName: input.parserResult.document.fileName,
      mimeType: input.parserResult.document.mimeType,
      parserVersion: input.parserResult.metadata.parserVersion,
      overallConfidence: input.parserResult.metadata.overallConfidence,
    },
  };
}

function createCanonicalInvoiceIdentityKey(input: {
  sellerEntityId: string;
  billingAccountId: string;
  invoiceNumber: string;
  invoiceDate: string;
  amountCents: number;
}) {
  return [
    input.sellerEntityId,
    input.billingAccountId,
    input.invoiceNumber,
    input.invoiceDate,
    String(input.amountCents),
  ].join(":");
}
