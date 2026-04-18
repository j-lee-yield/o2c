import type { BillingAccount, Contact } from "../accounts/schema.js";
import type { CustomerInvoice } from "../invoices/schema.js";
import type { CollectionReplyAnalysis } from "../collections/schema.js";

import type { PromiseToPay, PromiseToPayState } from "./schema.js";
import { createEntityMetadata } from "../../shared/types.js";

export interface PromiseToPayAcceptanceDecision {
  nextState: Extract<PromiseToPayState, "detected_unconfirmed" | "accepted">;
  autoAccepted: boolean;
  reasons: string[];
}

export function createPromiseToPayFromReply(params: {
  id: string;
  now: string;
  account: BillingAccount;
  invoices: CustomerInvoice[];
  analysis: CollectionReplyAnalysis;
  contact?: Contact;
}): PromiseToPay {
  const primaryInvoice = params.invoices[0];

  return {
    id: params.id,
    ...createEntityMetadata({
      at: params.now,
      actorId: "system_collections_reply",
      actorRole: "system"
    }),
    parentAccountId: params.account.parentAccountId,
    billingAccountId: params.account.id,
    ...(params.contact ? { contactId: params.contact.id } : {}),
    promisedAmountCents:
      params.analysis.ptp?.promisedAmountCents ?? primaryInvoice?.amountCents ?? 0,
    currency: params.analysis.ptp?.currency ?? primaryInvoice?.currency ?? params.account.currency,
    promiseDate: params.analysis.ptp?.promiseDate ?? params.now.slice(0, 10),
    state: "detected_unconfirmed",
    metadata: {
      invoiceIds: params.invoices.map((invoice) => invoice.id),
      extractionConfidence: params.analysis.ptp?.confidence ?? params.analysis.confidence,
      extractionRiskFlags: params.analysis.ptp?.riskFlags ?? [],
    },
  };
}

export function decidePromiseToPayAcceptance(params: {
  account: BillingAccount;
  contact?: Pick<Contact, "isVerified" | "allowAutoSend">;
  promiseToPay: PromiseToPay;
}): PromiseToPayAcceptanceDecision {
  const reasons: string[] = [];
  const extractionRiskFlags = asStringArray(params.promiseToPay.metadata.extractionRiskFlags);

  if (params.account.accountTier === "strategic") {
    reasons.push("strategic_account");
  }
  if (!params.contact?.isVerified) {
    reasons.push("recipient_not_verified");
  }
  if (!params.contact?.allowAutoSend) {
    reasons.push("recipient_not_auto_send_ready");
  }
  if (extractionRiskFlags.length > 0) {
    reasons.push(...extractionRiskFlags);
  }

  return {
    nextState: reasons.length === 0 ? "accepted" : "detected_unconfirmed",
    autoAccepted: reasons.length === 0,
    reasons,
  };
}

export function evaluatePromiseToPayState(params: {
  promiseToPay: PromiseToPay;
  asOfDate: string;
  settledAmountCents?: number;
}): PromiseToPayState {
  const asOfDay = params.asOfDate.slice(0, 10);

  if (params.settledAmountCents !== undefined && params.settledAmountCents >= params.promiseToPay.promisedAmountCents) {
    return "kept";
  }

  if (params.promiseToPay.state === "accepted" && asOfDay === params.promiseToPay.promiseDate) {
    return "due_today";
  }

  if (
    (params.promiseToPay.state === "accepted" || params.promiseToPay.state === "due_today") &&
    asOfDay > params.promiseToPay.promiseDate
  ) {
    return "broken";
  }

  return params.promiseToPay.state;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}
