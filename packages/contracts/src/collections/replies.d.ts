export declare const collectionReplyOutcomes: readonly ["promise_to_pay", "already_paid", "wrong_contact", "invoice_not_received", "request_for_docs", "partial_dispute", "full_dispute", "generic_no_action_reply"];
export type CollectionReplyOutcome = (typeof collectionReplyOutcomes)[number];
export declare const requestedDocumentTypes: readonly ["invoice", "statement_of_account", "delivery_receipt", "proof_of_delivery", "supporting"];
export type RequestedDocumentType = (typeof requestedDocumentTypes)[number];
export interface PromiseToPayExtractionContract {
    promiseDate?: string;
    promisedAmountCents?: number;
    currency?: string;
    confidence: number;
    riskFlags: string[];
}
export interface CollectionReplyInvoiceMatchContract {
    invoiceId: string;
    invoiceNumber: string;
    matchedBy: "invoice_number" | "provided_context";
}
export interface CollectionReplyClassificationContract {
    outcome: CollectionReplyOutcome;
    confidence: number;
    requiresHumanReview: boolean;
    reasons: string[];
    invoices: CollectionReplyInvoiceMatchContract[];
    requestedDocumentTypes: RequestedDocumentType[];
    ptp?: PromiseToPayExtractionContract;
}
//# sourceMappingURL=replies.d.ts.map