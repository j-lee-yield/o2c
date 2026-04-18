import { describe, expect, it } from "vitest";
import { buildCustomerProfileReadModel } from "./customer-profiles.js";

describe("customer profile helpers", () => {
  it("builds an explainable payment behavior snapshot from aggregate metrics", () => {
    const profile = buildCustomerProfileReadModel({
      billingAccountId: "billing-1",
      accountName: "Metro Retail Group",
      generatedAt: "2026-04-01T00:00:00.000Z",
      preferredChannel: "email",
      preferredContact: {
        contactName: "Maria Santos",
        contactEmail: "maria@example.com",
        reasonSummary: "Preferred contact is verified and consistently responsive.",
      },
      avgDaysToPay: 21.4,
      avgDaysLate: 5.1,
      groupedReminderAttempts: 4,
      groupedReminderPayments: 2,
      resendAttempts: 5,
      resendPayments: 3,
      remittanceTotalCount: 6,
      remittanceStructuredCount: 5,
      remittanceLinkedCount: 5,
      promiseObservedCount: 4,
      promiseKeptCount: 3,
      communicationAttemptCount: 10,
      wrongContactCount: 1,
      parentPayerObservations: 5,
      parentPayerSignals: 4,
    });

    expect(profile.paymentBehaviorSnapshot.avgDaysToPay).toBe(21.4);
    expect(profile.paymentBehaviorSnapshot.groupedReminderEffectiveness?.value).toBe(0.5);
    expect(profile.paymentBehaviorSnapshot.resendBeforePayLikely).toBe(true);
    expect(profile.paymentBehaviorSnapshot.remittanceQuality?.label).toBe("high");
    expect(profile.paymentBehaviorSnapshot.promiseKeptRate).toBe(0.75);
    expect(profile.paymentBehaviorSnapshot.parentPayerProbability).toBe(0.8);
  });

  it("stays conservative when evidence is sparse", () => {
    const profile = buildCustomerProfileReadModel({
      billingAccountId: "billing-2",
      generatedAt: "2026-04-01T00:00:00.000Z",
      preferredContact: {
        contactName: "Fallback contact",
        reasonSummary: "Only a fallback contact is available.",
      },
      groupedReminderAttempts: 0,
      groupedReminderPayments: 0,
      resendAttempts: 0,
      resendPayments: 0,
      remittanceTotalCount: 0,
      remittanceStructuredCount: 0,
      remittanceLinkedCount: 0,
      promiseObservedCount: 0,
      promiseKeptCount: 0,
      communicationAttemptCount: 0,
      wrongContactCount: 0,
      parentPayerObservations: 0,
      parentPayerSignals: 0,
    });

    expect(profile.paymentBehaviorSnapshot.groupedReminderEffectiveness?.value).toBeUndefined();
    expect(profile.paymentBehaviorSnapshot.remittanceQuality?.label).toBe("unknown");
    expect(profile.paymentBehaviorSnapshot.promiseKeptRate).toBeUndefined();
    expect(profile.paymentBehaviorSnapshot.parentPayerProbability).toBeUndefined();
  });
});
