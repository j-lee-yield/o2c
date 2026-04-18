import type {
  OutreachCommunicationHistory,
  OutreachDeductionOrException,
  OutreachOperatorFeedbackSignal,
  OutreachPaymentActivity,
  OutreachPromiseToPayStatus,
  OutreachRemittanceStatus,
} from "@o2c/contracts";

import type { OutreachGenerationInput } from "./outreach-intelligence.js";

export interface OutreachContextSupplement {
  currentThread?: OutreachCommunicationHistory;
  relatedThreads?: OutreachCommunicationHistory[];
  broadInboxFallbackThreads?: OutreachCommunicationHistory[];
  accountMemorySignals?: OutreachOperatorFeedbackSignal[];
  recentPayments?: OutreachPaymentActivity[];
  remittances?: OutreachRemittanceStatus[];
  deductions?: OutreachDeductionOrException[];
  promiseToPay?: OutreachPromiseToPayStatus;
  crossEntityAmbiguity?: {
    isAmbiguous: boolean;
    reason: string;
  };
}

export interface OutreachContextStore {
  loadContextSupplement(input: OutreachGenerationInput): OutreachContextSupplement;
}

export class InMemoryOutreachContextStore implements OutreachContextStore {
  constructor(private readonly supplement: OutreachContextSupplement = {}) {}

  loadContextSupplement(): OutreachContextSupplement {
    return this.supplement;
  }
}

export function mergeOutreachGenerationInput(
  input: OutreachGenerationInput,
  supplement: OutreachContextSupplement | undefined,
): OutreachGenerationInput {
  if (!supplement) {
    return deriveOutreachDefaults(input);
  }

  return deriveOutreachDefaults({
    ...input,
    currentThread: input.currentThread ?? supplement.currentThread,
    relatedThreads:
      input.relatedThreads ?? (supplement.relatedThreads?.length ? supplement.relatedThreads : undefined),
    broadInboxFallbackThreads:
      input.broadInboxFallbackThreads ??
      (supplement.broadInboxFallbackThreads?.length
        ? supplement.broadInboxFallbackThreads
        : undefined),
    accountMemorySignals:
      input.accountMemorySignals ??
      (supplement.accountMemorySignals?.length ? supplement.accountMemorySignals : undefined),
    recentPayments:
      input.recentPayments ?? (supplement.recentPayments?.length ? supplement.recentPayments : undefined),
    remittances: input.remittances ?? (supplement.remittances?.length ? supplement.remittances : undefined),
    deductions: input.deductions ?? (supplement.deductions?.length ? supplement.deductions : undefined),
    promiseToPay: input.promiseToPay ?? supplement.promiseToPay,
    crossEntityAmbiguity: input.crossEntityAmbiguity ?? supplement.crossEntityAmbiguity,
  });
}

function deriveOutreachDefaults(input: OutreachGenerationInput): OutreachGenerationInput {
  if (input.crossEntityAmbiguity) {
    return input;
  }

  const sellerEntityIds = [
    ...new Set(
      input.invoices
        .map((invoice) => invoice.sellerEntityId)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  ];

  if (sellerEntityIds.length <= 1) {
    return input;
  }

  return {
    ...input,
    crossEntityAmbiguity: {
      isAmbiguous: true,
      reason:
        "Multiple seller entities are represented in the invoice set, so the outreach must avoid cash-application certainty.",
    },
  };
}
