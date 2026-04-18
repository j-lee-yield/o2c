import type { ConnectorProvider } from "../integrations/connectors.js";
export interface ParsedField<TValue> {
    value?: TValue;
    confidence: number;
    rawText?: string;
}
export interface UploadedDocumentEnvelope {
    documentId: string;
    fileName?: string;
    checksum: string;
    mimeType?: string;
    source: "email" | "portal" | "api" | "manual";
    uploadedAt: string;
}
export interface YieldBirInvoiceExtraction {
    provider: Extract<ConnectorProvider, "yield">;
    document: UploadedDocumentEnvelope;
    overallConfidence: number;
    invoiceNumber: ParsedField<string>;
    supplierTin?: ParsedField<string>;
    customerName?: ParsedField<string>;
    billingAccountReference?: ParsedField<string>;
    branchReference?: ParsedField<string>;
    invoiceDate?: ParsedField<string>;
    dueDate?: ParsedField<string>;
    totalAmountCents?: ParsedField<number>;
    currency?: ParsedField<string>;
    lineCount?: ParsedField<number>;
    rawPayloadReference?: string;
    metadata?: Record<string, unknown>;
}
export interface RemittanceInvoiceReference {
    invoiceNumber?: string;
    amountCents?: number;
    currency?: string;
    confidence: number;
}
export interface YieldRemittanceExtraction {
    provider: Extract<ConnectorProvider, "yield"> | "native_heuristic";
    document: UploadedDocumentEnvelope;
    overallConfidence: number;
    remitterName?: ParsedField<string>;
    paymentReference?: ParsedField<string>;
    customerReference?: ParsedField<string>;
    referencedInvoices: RemittanceInvoiceReference[];
    rawPayloadReference?: string;
    metadata?: Record<string, unknown>;
}
//# sourceMappingURL=normalization.d.ts.map