import type { ConnectorProvider } from "../integrations/connectors.js";
import type { AuditContext, CurrencyCode } from "../index.js";
import type { DuplicateDetectionResult, ReviewDecision } from "./review.js";
import type { UploadedDocumentEnvelope } from "./normalization.js";
export declare const birInvoiceFieldKeys: readonly ["sellerLegalEntity", "buyerName", "invoiceNumber", "invoiceDate", "totalAmountCents", "currency", "poNumber", "lineItemsSummary", "documentType", "tin", "businessStyle", "deliveryOrBillToAddress", "receivedStampPresent", "signaturePresent", "branchId"];
export type BirInvoiceFieldKey = (typeof birInvoiceFieldKeys)[number];
export type ConfidenceBand = "high" | "medium" | "low";
export type UploadedDocumentBehavior = "create_or_update_provisional_invoice" | "create_review_draft" | "store_document_only";
export type AllowedBirDownstreamAction = "create_provisional_invoice" | "suggest_match_to_erp_invoice" | "attach_document_to_invoice" | "expose_in_resend_flow" | "support_cash_application" | "support_exception_resolution";
export interface BirInvoiceLineItemSummary {
    description: string;
    quantity?: number;
    unitPriceCents?: number;
    lineAmountCents?: number;
}
export interface BirInvoiceFieldValue<TValue> {
    extracted?: TValue;
    normalized?: TValue;
    humanCorrected?: TValue;
    finalLocked?: TValue;
    extractionConfidence: number;
    confidenceBand: ConfidenceBand;
    rawText?: string;
}
export interface BirInvoiceParserMetadata {
    fileHash: string;
    parserVersion: string;
    overallConfidence: number;
}
export type BirInvoiceDocumentType = "bir_sales_invoice" | "bir_service_invoice" | "bir_receiving_copy" | "unknown";
export interface BirInvoiceParserResult {
    provider: Extract<ConnectorProvider, "yield">;
    document: UploadedDocumentEnvelope;
    metadata: BirInvoiceParserMetadata;
    sellerLegalEntity: BirInvoiceFieldValue<string>;
    buyerName: BirInvoiceFieldValue<string>;
    invoiceNumber: BirInvoiceFieldValue<string>;
    invoiceDate: BirInvoiceFieldValue<string>;
    totalAmountCents: BirInvoiceFieldValue<number>;
    currency: BirInvoiceFieldValue<CurrencyCode>;
    poNumber?: BirInvoiceFieldValue<string>;
    lineItemsSummary: BirInvoiceFieldValue<BirInvoiceLineItemSummary[]>;
    documentType: BirInvoiceFieldValue<BirInvoiceDocumentType>;
    tin?: BirInvoiceFieldValue<string>;
    businessStyle?: BirInvoiceFieldValue<string>;
    deliveryOrBillToAddress?: BirInvoiceFieldValue<string>;
    receivedStampPresent?: BirInvoiceFieldValue<boolean>;
    signaturePresent?: BirInvoiceFieldValue<boolean>;
    branchId?: BirInvoiceFieldValue<string>;
}
export interface BirInvoiceDuplicateCandidate {
    entityId: string;
    documentId?: string;
    fileHash?: string;
    sellerLegalEntity?: string;
    buyerName?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    totalAmountCents?: number;
    currency?: CurrencyCode;
}
export interface BirInvoiceHierarchyContext {
    parentAccountId: string;
    billingAccountId: string;
    branchId?: string;
}
export interface ErpInvoiceCandidate {
    invoiceId: string;
    parentAccountId: string;
    billingAccountId: string;
    branchId?: string;
    invoiceNumber: string;
    invoiceDate?: string;
    amountCents: number;
    currency: CurrencyCode;
    buyerName?: string;
    sellerLegalEntity?: string;
}
export interface InvoiceMatchSuggestion {
    invoiceId: string;
    confidenceBand: ConfidenceBand;
    score: number;
    reasons: string[];
}
export interface ProvisionalInvoiceDraft {
    invoiceId: string;
    parentAccountId: string;
    billingAccountId: string;
    branchId?: string;
    invoiceNumber: string;
    invoiceDate: string;
    amountCents: number;
    currency: CurrencyCode;
    sellerLegalEntity: string;
    buyerName: string;
    uploadedDocumentId: string;
    metadata: Record<string, unknown>;
}
export interface BirInvoiceReviewCase {
    documentId: string;
    confidenceBand: ConfidenceBand;
    uploadedDocumentBehavior: UploadedDocumentBehavior;
    duplicateCheck: DuplicateDetectionResult;
    review?: ReviewDecision;
    parserResult: BirInvoiceParserResult;
    provisionalInvoice?: ProvisionalInvoiceDraft;
    matchSuggestions: InvoiceMatchSuggestion[];
    allowedDownstreamActions: AllowedBirDownstreamAction[];
    collectionsEligibility: "blocked_pending_match_or_confirmation" | "eligible";
}
export interface BirInvoiceReviewPreviewRequest {
    parserResult: BirInvoiceParserResult;
    hierarchy: BirInvoiceHierarchyContext;
    duplicateCandidates?: BirInvoiceDuplicateCandidate[];
    erpCandidates?: ErpInvoiceCandidate[];
    erpMatched?: boolean;
    humanConfirmed?: boolean;
}
export type BirInvoiceCaseStatus = "pending_review" | "locked";
export interface BirInvoiceCaseRecord {
    documentId: string;
    uploadedDocument: UploadedDocumentEnvelope & {
        documentType: "bir_invoice";
        storageKey?: string;
        uploadedBy: string;
    };
    parserResult: BirInvoiceParserResult;
    hierarchy: BirInvoiceHierarchyContext;
    duplicateCandidates: BirInvoiceDuplicateCandidate[];
    erpCandidates: ErpInvoiceCandidate[];
    reviewCase: BirInvoiceReviewCase;
    status: BirInvoiceCaseStatus;
    humanConfirmed: boolean;
    matchedErpInvoiceId?: string;
    lockedAt?: string;
    lockedByActorId?: string;
    createdAt: string;
    updatedAt: string;
}
export interface CreateBirInvoiceCaseRequest extends BirInvoiceReviewPreviewRequest {
    auditContext: AuditContext;
    storageKey?: string;
    uploadedBy?: string;
}
export interface BirInvoiceFieldCorrectionInput {
    value: unknown;
    lock?: boolean;
}
export interface ReviewBirInvoiceCaseRequest {
    auditContext: AuditContext;
    corrections?: Partial<Record<BirInvoiceFieldKey, BirInvoiceFieldCorrectionInput>>;
    lockDocument?: boolean;
    humanConfirmed?: boolean;
    selectedErpInvoiceId?: string;
    overrideDuplicateBlock?: boolean;
}
//# sourceMappingURL=bir-invoice.d.ts.map