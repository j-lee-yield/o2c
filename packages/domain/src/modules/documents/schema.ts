import type { DomainEntity } from "../../shared/types.js";

export const uploadedDocumentTypes = [
  "invoice",
  "bir_invoice",
  "payment",
  "proof_of_payment",
  "remittance",
  "remittance_advice",
  "bank_statement",
  "statement_of_account",
  "delivery_receipt",
  "proof_of_delivery",
  "purchase_order",
  "official_receipt",
  "supporting",
  "supporting_other",
] as const;

export type UploadedDocumentType = (typeof uploadedDocumentTypes)[number];

export type UploadedDocumentBehavior =
  | "create_or_update_provisional_invoice"
  | "create_review_draft"
  | "store_document_only";

export interface UploadedDocument extends DomainEntity {
  documentType: UploadedDocumentType;
  source: "email" | "portal" | "api" | "manual";
  storageKey: string;
  checksum: string;
  uploadedBy: string;
  uploadedAt: string;
  behavior?: UploadedDocumentBehavior;
  metadata: Record<string, unknown>;
}
