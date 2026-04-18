import type { StatefulEntity } from "../../shared/state-machine.js";

export const invoiceStates = [
  "uploaded_unmatched",
  "synced_open",
  "matched_to_erp",
  "partially_paid",
  "paid",
  "disputed_partial",
  "disputed_full",
  "credit_pending",
  "writeback_pending",
  "writeback_failed",
  "voided"
] as const;

export type InvoiceState = (typeof invoiceStates)[number];

export interface Invoice extends StatefulEntity<InvoiceState> {
  sellerEntityId?: string;
  parentAccountId: string;
  billingAccountId: string;
  branchId?: string;
  invoiceContactId?: string;
  uploadedDocumentId?: string;
  invoiceDate?: string;
  invoiceNumber: string;
  currency: string;
  amountCents: number;
  collectibleAmountCents?: number;
  disputedAmountCents?: number;
  provisionalSource?: "bir_upload";
  dueDate?: string;
  metadata: Record<string, unknown>;
}

export type CustomerInvoice = Invoice;
