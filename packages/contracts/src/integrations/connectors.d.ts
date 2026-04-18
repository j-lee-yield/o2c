import type { ConnectorDescriptor, IntegrationProvider } from "./framework.js";
export type ConnectorProvider = IntegrationProvider;
export type ConnectorSyncOperation = "pull_customers" | "pull_contacts" | "pull_invoices" | "pull_invoice_lines" | "pull_payments" | "pull_unapplied_cash" | "pull_currency" | "pull_payment_terms" | "pull_dispute_flags" | "push_collection_statuses" | "push_notes" | "push_promise_to_pay" | "push_applied_cash" | "push_dispute_status";
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
export declare const defaultConnectorCatalog: ConnectorDescriptor[];
//# sourceMappingURL=connectors.d.ts.map