import type { ConnectorProvider } from "../integrations/connectors.js";
import type { ParsedField, RemittanceInvoiceReference, UploadedDocumentEnvelope } from "./normalization.js";
import type { DuplicateDetectionResult, ReviewDecision } from "./review.js";

export type RemittanceInputChannel = "email_inbox" | "upload" | "linked_payment_workflow";

export interface RemittanceAttachmentInput extends UploadedDocumentEnvelope {
  storageKey?: string;
}

export interface EmailInboxRemittanceInput {
  channel: "email_inbox";
  sourceId: string;
  receivedAt: string;
  fromEmail: string;
  fromName?: string;
  subject: string;
  bodyText: string;
  attachments: RemittanceAttachmentInput[];
  metadata?: Record<string, unknown>;
}

export interface UploadRemittanceInput {
  channel: "upload";
  sourceId: string;
  uploadedAt: string;
  uploadedBy: string;
  fileName?: string;
  bodyText: string;
  attachments: RemittanceAttachmentInput[];
  metadata?: Record<string, unknown>;
}

export interface LinkedPaymentWorkflowRemittanceInput {
  channel: "linked_payment_workflow";
  sourceId: string;
  linkedAt: string;
  paymentId: string;
  paymentReference?: string;
  bodyText: string;
  attachments: RemittanceAttachmentInput[];
  metadata?: Record<string, unknown>;
}

export type RemittanceSourceInput =
  | EmailInboxRemittanceInput
  | UploadRemittanceInput
  | LinkedPaymentWorkflowRemittanceInput;

export interface ParsedRemittanceAttachmentLink {
  documentId: string;
  role: "primary" | "supporting";
  confidence: number;
  fileName?: string;
}

export interface ParsedMoneyField extends ParsedField<number> {
  currency?: string;
}

export interface ParsedRemittanceResult {
  parser: ConnectorProvider | "native_heuristic";
  overallConfidence: number;
  payerName?: ParsedField<string>;
  payerEmail?: ParsedField<string>;
  paymentReference?: ParsedField<string>;
  totalAmount?: ParsedMoneyField;
  referencedInvoices: RemittanceInvoiceReference[];
  attachmentLinks: ParsedRemittanceAttachmentLink[];
  rawPayload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface PaymentMatchCandidate {
  paymentId: string;
  parentAccountId: string;
  billingAccountId?: string;
  paymentReference: string;
  currency: string;
  amountCents: number;
  receivedAt: string;
  confidence: number;
  reasons: string[];
  metadata?: Record<string, unknown>;
}

export interface InvoiceMatchCandidate {
  invoiceId: string;
  parentAccountId: string;
  billingAccountId: string;
  branchId?: string;
  invoiceNumber: string;
  currency: string;
  amountCents: number;
  confidence: number;
  reasons: string[];
  metadata?: Record<string, unknown>;
}

export interface RemittanceLinkContext {
  remittanceId: string;
  source: RemittanceSourceInput;
  parsed: ParsedRemittanceResult;
}

export interface RemittanceParser {
  parse(input: RemittanceSourceInput): Promise<ParsedRemittanceResult>;
}

export interface PaymentRemittanceLinker {
  findCandidates(context: RemittanceLinkContext): Promise<PaymentMatchCandidate[]>;
}

export interface InvoiceRemittanceLinker {
  findCandidates(context: RemittanceLinkContext): Promise<InvoiceMatchCandidate[]>;
}

export interface RemittanceIngestionOutcome {
  remittanceId: string;
  state:
    | "received_unparsed"
    | "parsed_structured"
    | "linked_to_payment"
    | "linked_to_invoice_candidate"
    | "review_required"
    | "resolved"
    | "orphaned";
  route: "link_payment_candidate" | "link_invoice_candidate" | "queue_review";
  linkedPaymentId?: string;
  candidatePaymentIds: string[];
  candidateInvoiceIds: string[];
  attachmentDocumentIds: string[];
  duplicateCheck: DuplicateDetectionResult;
  review?: ReviewDecision;
}

export interface RemittanceRecordView {
  remittanceId: string;
  sourceChannel: RemittanceInputChannel;
  state:
    | "received_unparsed"
    | "parsed_structured"
    | "linked_to_payment"
    | "linked_to_invoice_candidate"
    | "review_required"
    | "resolved"
    | "orphaned";
  payerName?: string;
  paymentReference?: string;
  totalAmountCents?: number;
  currency?: string;
  candidatePaymentIds: string[];
  candidateInvoiceIds: string[];
  attachmentDocumentIds: string[];
  review?: ReviewDecision;
}
