export const canonicalSchemaVersion = "v1" as const;

export const canonicalObjectNames = [
  "parent_account",
  "billing_account",
  "branch",
  "contact",
  "uploaded_document",
  "invoice",
  "payment",
  "payment_application",
  "remittance",
  "promise_to_pay",
  "exception",
  "activity_log",
  "approval_request"
] as const;

export type CanonicalObjectName = (typeof canonicalObjectNames)[number];

export const canonicalStagingRecordNames = [
  "imported_invoice_snapshot",
  "uploaded_document_processing_record",
  "remittance_processing_record",
  "perfios_raw_statement_payload",
  "perfios_normalized_statement",
  "perfios_normalized_transaction"
] as const;

export type CanonicalStagingRecordName = (typeof canonicalStagingRecordNames)[number];

export interface CanonicalSourceMapping {
  sourceKey: string;
  sourceLabel: string;
  targetObject: CanonicalObjectName;
  mappingMode: "direct" | "staged";
  stagingRecord?: CanonicalStagingRecordName;
  status: "implemented";
  notes: string;
}

export const canonicalSourceMappings: readonly CanonicalSourceMapping[] = [
  {
    sourceKey: "business_central.invoice",
    sourceLabel: "Business Central invoice pull",
    targetObject: "invoice",
    mappingMode: "staged",
    stagingRecord: "imported_invoice_snapshot",
    status: "implemented",
    notes: "Imports first land in invoice snapshots, then upsert into the canonical invoice model when account matching is safe."
  },
  {
    sourceKey: "odoo.invoice",
    sourceLabel: "Odoo invoice pull",
    targetObject: "invoice",
    mappingMode: "staged",
    stagingRecord: "imported_invoice_snapshot",
    status: "implemented",
    notes: "Uses the imported invoice snapshot workflow before canonical invoice writes."
  },
  {
    sourceKey: "sap_business_one.invoice",
    sourceLabel: "SAP Business One invoice pull",
    targetObject: "invoice",
    mappingMode: "staged",
    stagingRecord: "imported_invoice_snapshot",
    status: "implemented",
    notes: "Service Layer invoice pulls land in imported snapshots before canonical invoice writes."
  },
  {
    sourceKey: "quickbooks_online.invoice",
    sourceLabel: "QuickBooks Online invoice pull",
    targetObject: "invoice",
    mappingMode: "staged",
    stagingRecord: "imported_invoice_snapshot",
    status: "implemented",
    notes: "Normalizes provider invoices through imported snapshots and canonical identity checks."
  },
  {
    sourceKey: "xero.invoice",
    sourceLabel: "Xero invoice pull",
    targetObject: "invoice",
    mappingMode: "staged",
    stagingRecord: "imported_invoice_snapshot",
    status: "implemented",
    notes: "Uses the same safe imported-invoice canonicalization flow as other accounting sources."
  },
  {
    sourceKey: "spreadsheet_upload.invoice",
    sourceLabel: "Manual spreadsheet invoice upload",
    targetObject: "invoice",
    mappingMode: "staged",
    stagingRecord: "imported_invoice_snapshot",
    status: "implemented",
    notes: "Manual spreadsheet rows map into the same imported invoice snapshot and canonical invoice flow."
  },
  {
    sourceKey: "yield.bir_invoice",
    sourceLabel: "Yield BIR invoice extraction",
    targetObject: "invoice",
    mappingMode: "staged",
    stagingRecord: "uploaded_document_processing_record",
    status: "implemented",
    notes: "OCR/parser output is stored in the uploaded document processing record before provisional or matched invoice writes."
  },
  {
    sourceKey: "yield.remittance",
    sourceLabel: "Yield remittance extraction",
    targetObject: "remittance",
    mappingMode: "staged",
    stagingRecord: "remittance_processing_record",
    status: "implemented",
    notes: "Parsed remittances persist canonical remittance records plus matching-review context."
  },
  {
    sourceKey: "native_heuristic.remittance",
    sourceLabel: "Mailbox-native remittance parsing",
    targetObject: "remittance",
    mappingMode: "staged",
    stagingRecord: "remittance_processing_record",
    status: "implemented",
    notes: "Native heuristics feed the same remittance and review pipeline as provider-backed remittance parsing."
  },
  {
    sourceKey: "perfios.bank_statement",
    sourceLabel: "Perfios bank statement parsing",
    targetObject: "payment",
    mappingMode: "staged",
    stagingRecord: "perfios_normalized_transaction",
    status: "implemented",
    notes: "Bank statements are normalized into typed transaction records that act as payment-ingestion staging objects."
  }
] as const;

export function listCanonicalSourceMappings(): CanonicalSourceMapping[] {
  return canonicalSourceMappings.map((mapping) => ({ ...mapping }));
}
