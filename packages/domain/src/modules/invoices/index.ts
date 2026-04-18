import { defineModule } from "../../shared/define-module.js";
import type { CustomerInvoice } from "./schema.js";
export type { CustomerInvoice } from "./schema.js";

export const invoicesModule = defineModule({
  name: "invoices",
  boundedContext: "billing",
  description: "Receivables invoices, schedules, and balance snapshots.",
  capabilities: ["invoice ingestion", "due dates", "document references"],
  integrations: ["erp", "billing"],
  lifecycle: "draft"
});

export class DisputedInvoiceAutoChaseBlockedError extends Error {
  readonly invoiceId: string;

  constructor(invoiceId: string) {
    super(`Invoice "${invoiceId}" cannot auto-trigger collections while disputed.`);
    this.name = "DisputedInvoiceAutoChaseBlockedError";
    this.invoiceId = invoiceId;
  }
}

export class StrategicAccountApprovalRequiredError extends Error {
  readonly billingAccountId: string;

  constructor(billingAccountId: string) {
    super(`Billing account "${billingAccountId}" requires approval before collections send.`);
    this.name = "StrategicAccountApprovalRequiredError";
    this.billingAccountId = billingAccountId;
  }
}

function readAmountMetadata(
  invoice: CustomerInvoice,
  key: "collectibleAmountCents" | "disputedAmountCents"
): number | undefined {
  const directValue = invoice[key];
  if (Number.isInteger(directValue)) {
    const amount = directValue as number;
    if (amount >= 0 && amount <= invoice.amountCents) {
      return amount;
    }
  }

  const value = invoice.metadata[key];
  if (!Number.isInteger(value)) {
    return undefined;
  }

  const amount = value as number;
  if (amount < 0 || amount > invoice.amountCents) {
    return undefined;
  }

  return amount;
}

export function getCollectibleAmountCents(invoice: CustomerInvoice): number {
  if (invoice.state !== "disputed_partial") {
    return invoice.amountCents;
  }

  const explicitCollectibleAmount = readAmountMetadata(invoice, "collectibleAmountCents");
  if (explicitCollectibleAmount !== undefined) {
    return explicitCollectibleAmount;
  }

  const disputedAmount = readAmountMetadata(invoice, "disputedAmountCents");
  if (disputedAmount !== undefined) {
    return Math.max(invoice.amountCents - disputedAmount, 0);
  }

  return 0;
}

export function canAutoChaseInvoice(invoice: CustomerInvoice): boolean {
  if (invoice.state === "disputed_full") {
    return false;
  }

  if (invoice.state === "disputed_partial") {
    return getCollectibleAmountCents(invoice) > 0;
  }

  return true;
}
