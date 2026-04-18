import type {
  ConnectorDescriptor,
  ConnectorConnectionReference,
  IntegrationProvider,
} from "./framework.js";

export type ConnectorProvider = IntegrationProvider;

export type ConnectorSyncOperation =
  | "pull_customers"
  | "pull_contacts"
  | "pull_invoices"
  | "pull_invoice_lines"
  | "pull_payments"
  | "pull_unapplied_cash"
  | "pull_currency"
  | "pull_payment_terms"
  | "pull_dispute_flags"
  | "push_collection_statuses"
  | "push_notes"
  | "push_promise_to_pay"
  | "push_applied_cash"
  | "push_dispute_status";

export interface ConnectorSyncRequest {
  tenantId: string;
  connectionId: string;
  provider: ConnectorProvider;
  operation: ConnectorSyncOperation;
  requestedAt: string;
  cursor?: string;
  maxBatchSize?: number;
}

export interface ErpCustomerRecord {
  externalId: string;
  parentAccountExternalId?: string;
  billingAccountExternalId?: string;
  branchExternalId?: string;
  displayName: string;
  currency: string;
  email?: string;
  metadata: Record<string, unknown>;
}

export interface ErpInvoiceRecord {
  externalId: string;
  billingAccountExternalId: string;
  parentAccountExternalId?: string;
  branchExternalId?: string;
  invoiceNumber: string;
  currency: string;
  amountCents: number;
  openAmountCents: number;
  dueDate?: string;
  issuedAt?: string;
  status: "open" | "partial" | "paid" | "disputed" | "voided";
  metadata: Record<string, unknown>;
}

export interface ErpPaymentRecord {
  externalId: string;
  billingAccountExternalId?: string;
  parentAccountExternalId?: string;
  branchExternalId?: string;
  paymentReference: string;
  currency: string;
  amountCents: number;
  receivedAt: string;
  unappliedAmountCents?: number;
  metadata: Record<string, unknown>;
}

export interface ConnectorSyncBatch {
  provider: ConnectorProvider;
  operation: ConnectorSyncOperation;
  customers?: ErpCustomerRecord[];
  invoices?: ErpInvoiceRecord[];
  payments?: ErpPaymentRecord[];
  nextCursor?: string;
  rawPayloadReference?: string;
}

export const defaultConnectorCatalog: ConnectorDescriptor[] = [
  {
    provider: "yield",
    kind: "document_ai",
    displayName: "Yield OCR and Parser",
    authStrategy: "service_account",
    capabilities: ["extract_bir_invoice", "ingest_remittance"],
    notes: "BIR invoice OCR/parser contract and remittance parsing handoff."
  },
  {
    provider: "perfios",
    kind: "bank_parser",
    displayName: "Perfios Adapter Contract",
    authStrategy: "api_key",
    capabilities: ["parse_bank_statement", "pull_payments", "pull_unapplied_cash"],
    notes: "Adapter contract only until live tenant payloads and credentials are available."
  },
  {
    provider: "netsuite",
    kind: "erp",
    displayName: "NetSuite ERP",
    authStrategy: "oauth2",
    capabilities: [
      "pull_customers",
      "pull_contacts",
      "pull_invoices",
      "pull_invoice_lines",
      "pull_payments",
      "pull_unapplied_cash",
      "pull_currency",
      "pull_payment_terms",
      "push_collection_statuses",
      "push_notes",
      "push_promise_to_pay",
      "push_applied_cash",
      "push_dispute_status"
    ]
  },
  {
    provider: "sap_business_one",
    kind: "erp",
    displayName: "SAP Business One",
    authStrategy: "basic_auth",
    capabilities: [
      "pull_customers",
      "pull_contacts",
      "pull_invoices",
      "pull_invoice_lines",
      "pull_payments",
      "pull_unapplied_cash",
      "pull_currency",
      "pull_payment_terms",
      "push_collection_statuses",
      "push_notes",
      "push_promise_to_pay",
      "push_applied_cash",
      "push_dispute_status"
    ],
    notes: "Service Layer adapter with guarded read access and conservative writeback staging."
  },
  {
    provider: "quickbooks_online",
    kind: "accounting",
    displayName: "QuickBooks Online",
    authStrategy: "oauth2",
    capabilities: [
      "pull_customers",
      "pull_contacts",
      "pull_invoices",
      "pull_invoice_lines",
      "pull_payments",
      "pull_unapplied_cash",
      "pull_currency",
      "pull_payment_terms",
      "push_collection_statuses",
      "push_notes",
      "push_promise_to_pay",
      "push_applied_cash",
      "push_dispute_status"
    ]
  },
  {
    provider: "xero",
    kind: "accounting",
    displayName: "Xero",
    authStrategy: "oauth2",
    capabilities: [
      "pull_customers",
      "pull_contacts",
      "pull_invoices",
      "pull_invoice_lines",
      "pull_payments",
      "pull_unapplied_cash",
      "pull_currency",
      "pull_payment_terms",
      "push_collection_statuses",
      "push_notes",
      "push_promise_to_pay",
      "push_applied_cash",
      "push_dispute_status"
    ]
  },
  {
    provider: "zoho_books",
    kind: "accounting",
    displayName: "Zoho Books",
    authStrategy: "oauth2",
    capabilities: [
      "pull_customers",
      "pull_contacts",
      "pull_invoices",
      "pull_invoice_lines",
      "pull_payments",
      "pull_unapplied_cash",
      "pull_currency",
      "pull_payment_terms",
      "push_collection_statuses",
      "push_notes",
      "push_promise_to_pay",
      "push_applied_cash",
      "push_dispute_status"
    ]
  },
  {
    provider: "odoo",
    kind: "accounting",
    displayName: "Odoo",
    authStrategy: "basic_auth",
    capabilities: [
      "pull_customers",
      "pull_contacts",
      "pull_invoices",
      "pull_invoice_lines",
      "pull_payments",
      "pull_unapplied_cash",
      "pull_currency",
      "pull_payment_terms",
      "push_collection_statuses",
      "push_notes",
      "push_promise_to_pay",
      "push_applied_cash",
      "push_dispute_status"
    ],
    notes: "JSON-RPC invoice adapter for import and dashboard-driven CRUD."
  },
  {
    provider: "dear_erp",
    kind: "erp",
    displayName: "Dear ERP",
    authStrategy: "api_key",
    capabilities: [
      "pull_customers",
      "pull_contacts",
      "pull_invoices",
      "pull_invoice_lines",
      "pull_payments",
      "pull_unapplied_cash",
      "pull_currency",
      "pull_payment_terms",
      "push_collection_statuses",
      "push_notes",
      "push_promise_to_pay",
      "push_applied_cash"
    ]
  },
  {
    provider: "google_sheets",
    kind: "spreadsheet",
    displayName: "Google Sheets Import",
    authStrategy: "service_account",
    capabilities: [
      "pull_customers",
      "pull_contacts",
      "pull_invoices",
      "pull_invoice_lines",
      "pull_payments",
      "pull_unapplied_cash",
      "pull_currency",
      "pull_payment_terms",
      "pull_dispute_flags"
    ],
    notes: "Import path only; intended for manual or scheduled sheet ingestion."
  },
  {
    provider: "email_inbox",
    kind: "email",
    displayName: "Email Inbox",
    authStrategy: "basic_auth",
    capabilities: ["pull_contacts", "pull_dispute_flags"],
    notes: "Ingress path for mailbox-driven remittance, dispute, and note capture."
  }
];
