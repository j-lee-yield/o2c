import type { LearningChannel, LearningReason } from "./schema.js";
import type { PaymentBehaviorSnapshot } from "./service.js";

export interface CustomerProfileMetric {
  value?: number;
  numerator: number;
  denominator: number;
  reasonSummary: string;
}

export interface CustomerProfileRemittanceQuality {
  label: "high" | "medium" | "low" | "unknown";
  structuredRate?: number;
  linkedRate?: number;
  totalRemittances: number;
  reasonSummary: string;
}

export interface CustomerProfilePreferredContact {
  contactId?: string;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  preferredChannel?: LearningChannel;
  reasonSummary: string;
}

export interface CustomerProfileNextBestAction {
  action: string;
  channel?: LearningChannel;
  score?: number;
  reasonSummary: string;
}

export interface CustomerProfileComputationPolicy {
  thresholds: {
    remittanceQualityHighRate: number;
    remittanceQualityMediumRate: number;
    groupedReminderStrongRate: number;
    resendBeforePayLikelyRate: number;
    unreliablePromiseKeptRate: number;
    highWrongContactRate: number;
    parentPayerHighProbability: number;
  };
}

export interface CustomerProfileAggregateInput {
  billingAccountId: string;
  accountNumber?: string;
  accountName?: string;
  parentAccountId?: string;
  parentAccountName?: string;
  generatedAt: string;
  preferredChannel?: LearningChannel;
  fallbackChannel?: LearningChannel;
  preferredContact: CustomerProfilePreferredContact;
  nextBestAction?: CustomerProfileNextBestAction;
  avgDaysToPay?: number;
  avgDaysLate?: number;
  groupedReminderAttempts: number;
  groupedReminderPayments: number;
  resendAttempts: number;
  resendPayments: number;
  remittanceTotalCount: number;
  remittanceStructuredCount: number;
  remittanceLinkedCount: number;
  promiseObservedCount: number;
  promiseKeptCount: number;
  communicationAttemptCount: number;
  wrongContactCount: number;
  parentPayerObservations: number;
  parentPayerSignals: number;
  accountExplanation?: LearningReason[];
  contactExplanation?: LearningReason[];
}

export interface CustomerProfileReadModel {
  billingAccountId: string;
  accountNumber?: string;
  accountName?: string;
  parentAccountId?: string;
  parentAccountName?: string;
  preferredChannel?: LearningChannel;
  fallbackChannel?: LearningChannel;
  preferredContact: CustomerProfilePreferredContact;
  nextBestAction?: CustomerProfileNextBestAction;
  paymentBehaviorSnapshot: PaymentBehaviorSnapshot;
  explanation: LearningReason[];
  generatedAt: string;
}

export function defaultCustomerProfileComputationPolicy(): CustomerProfileComputationPolicy {
  return {
    thresholds: {
      remittanceQualityHighRate: 0.8,
      remittanceQualityMediumRate: 0.5,
      groupedReminderStrongRate: 0.5,
      resendBeforePayLikelyRate: 0.4,
      unreliablePromiseKeptRate: 0.55,
      highWrongContactRate: 0.3,
      parentPayerHighProbability: 0.6,
    },
  };
}

export function buildCustomerProfileReadModel(
  input: CustomerProfileAggregateInput,
  policy: Partial<CustomerProfileComputationPolicy> = {},
): CustomerProfileReadModel {
  const mergedPolicy = mergeCustomerProfilePolicy(policy);
  const groupedReminderEffectiveness = buildRateMetric(
    input.groupedReminderPayments,
    input.groupedReminderAttempts,
    input.groupedReminderAttempts > 0
      ? input.groupedReminderPayments / input.groupedReminderAttempts >=
        mergedPolicy.thresholds.groupedReminderStrongRate
        ? "Grouped reminders are converting into payment at a strong rate."
        : "Grouped reminders are being used, but conversion remains mixed."
      : "No grouped reminder history is available yet.",
  );
  const resendBeforePayMetric = buildRateMetric(
    input.resendPayments,
    input.resendAttempts,
    input.resendAttempts > 0
      ? "This rate reflects how often a resend sequence is followed by payment."
      : "No resend-before-pay history is available yet.",
  );
  const promiseKeptRate = buildRateMetric(
    input.promiseKeptCount,
    input.promiseObservedCount,
    input.promiseObservedCount > 0
      ? "Promise reliability is based on accepted promises that reached a kept or broken outcome."
      : "No promise-to-pay outcomes are available yet.",
  );
  const wrongContactRate = buildRateMetric(
    input.wrongContactCount,
    input.communicationAttemptCount,
    input.communicationAttemptCount > 0
      ? "Wrong-contact rate is measured against stored communication attempts."
      : "No communication-attempt history is available yet.",
  );
  const parentPayerProbability = buildRateMetric(
    input.parentPayerSignals,
    input.parentPayerObservations,
    input.parentPayerObservations > 0
      ? "Parent payer probability reflects how often payment came from outside the invoice billing account but inside the same parent hierarchy."
      : "No cross-account payer observations are available yet.",
  );
  const remittanceQuality = buildRemittanceQuality(input, mergedPolicy);
  const snapshot: PaymentBehaviorSnapshot = {
    ...(input.avgDaysToPay !== undefined ? { avgDaysToPay: roundMetric(input.avgDaysToPay) } : {}),
    ...(input.avgDaysLate !== undefined ? { avgDaysLate: roundMetric(input.avgDaysLate) } : {}),
    ...(groupedReminderEffectiveness ? { groupedReminderEffectiveness } : {}),
    ...(resendBeforePayMetric?.value !== undefined
      ? {
          resendBeforePayRate: resendBeforePayMetric.value,
          resendBeforePayLikely:
            resendBeforePayMetric.value >= mergedPolicy.thresholds.resendBeforePayLikelyRate,
        }
      : {}),
    ...(remittanceQuality ? { remittanceQuality } : {}),
    ...(promiseKeptRate?.value !== undefined
      ? {
          promiseKeptRate: promiseKeptRate.value,
          ptpKeptRate: promiseKeptRate.value,
          unreliablePromiseToPay:
            promiseKeptRate.value < mergedPolicy.thresholds.unreliablePromiseKeptRate,
        }
      : {}),
    ...(wrongContactRate?.value !== undefined
      ? {
          wrongContactRate: wrongContactRate.value,
        }
      : {}),
    ...(parentPayerProbability?.value !== undefined
      ? {
          parentPayerProbability: parentPayerProbability.value,
          parentPaysForChildren:
            parentPayerProbability.value >= mergedPolicy.thresholds.parentPayerHighProbability,
          centralizedPayer:
            parentPayerProbability.value >= mergedPolicy.thresholds.parentPayerHighProbability,
          centralizedPayerConfidence: parentPayerProbability.value,
        }
      : {}),
  };

  const explanation: LearningReason[] = [
    {
      code: "customer_profile_compiled",
      summary:
        input.accountName && input.billingAccountId
          ? `Compiled explainable customer profile for ${input.accountName} (${input.billingAccountId}).`
          : `Compiled explainable customer profile for ${input.billingAccountId}.`,
    },
    ...(input.accountExplanation?.slice(0, 2) ?? []),
    ...(input.contactExplanation?.slice(0, 2) ?? []),
  ];

  return {
    billingAccountId: input.billingAccountId,
    ...(input.accountNumber ? { accountNumber: input.accountNumber } : {}),
    ...(input.accountName ? { accountName: input.accountName } : {}),
    ...(input.parentAccountId ? { parentAccountId: input.parentAccountId } : {}),
    ...(input.parentAccountName ? { parentAccountName: input.parentAccountName } : {}),
    ...(input.preferredChannel ? { preferredChannel: input.preferredChannel } : {}),
    ...(input.fallbackChannel ? { fallbackChannel: input.fallbackChannel } : {}),
    preferredContact: input.preferredContact,
    ...(input.nextBestAction ? { nextBestAction: input.nextBestAction } : {}),
    paymentBehaviorSnapshot: snapshot,
    explanation,
    generatedAt: input.generatedAt,
  };
}

function mergeCustomerProfilePolicy(
  policy: Partial<CustomerProfileComputationPolicy>,
): CustomerProfileComputationPolicy {
  const defaults = defaultCustomerProfileComputationPolicy();
  return {
    ...defaults,
    ...policy,
    thresholds: {
      ...defaults.thresholds,
      ...(policy.thresholds ?? {}),
    },
  };
}

function buildRateMetric(
  numerator: number,
  denominator: number,
  reasonSummary: string,
): CustomerProfileMetric | undefined {
  if (denominator <= 0) {
    return {
      numerator,
      denominator,
      reasonSummary,
    };
  }

  return {
    value: roundMetric(numerator / denominator),
    numerator,
    denominator,
    reasonSummary,
  };
}

function buildRemittanceQuality(
  input: CustomerProfileAggregateInput,
  policy: CustomerProfileComputationPolicy,
): CustomerProfileRemittanceQuality | undefined {
  if (input.remittanceTotalCount <= 0) {
    return {
      label: "unknown",
      totalRemittances: 0,
      reasonSummary: "No remittance history is available yet.",
    };
  }

  const structuredRate = roundMetric(
    input.remittanceStructuredCount / input.remittanceTotalCount,
  );
  const linkedRate = roundMetric(input.remittanceLinkedCount / input.remittanceTotalCount);
  const minRate = Math.min(structuredRate, linkedRate);
  const label =
    minRate >= policy.thresholds.remittanceQualityHighRate
      ? "high"
      : minRate >= policy.thresholds.remittanceQualityMediumRate
        ? "medium"
        : "low";

  return {
    label,
    structuredRate,
    linkedRate,
    totalRemittances: input.remittanceTotalCount,
    reasonSummary:
      label === "high"
        ? "Remittances are usually structured and linked cleanly."
        : label === "medium"
          ? "Remittance parsing is useful, but some operator cleanup is still common."
          : "Remittance quality is still inconsistent and should be read conservatively.",
  };
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}
