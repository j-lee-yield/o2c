import { describe, expect, it } from "vitest";
import {
  buildPersistedCustomerProfileQuery,
  buildPersistedLearningSummaryQuery,
  loadPersistedCustomerProfile,
  loadPersistedLearningSummary,
} from "./learning-layer-read-model.js";

describe("learning layer read model client", () => {
  it("builds a persisted learning query with account filters", () => {
    const sql = buildPersistedLearningSummaryQuery({
      databaseUrl: "postgres://demo",
      tenantId: "default",
      billingAccountId: "billing-1",
      accountNumber: "BA-1001",
      contactEmail: "collector@example.com",
    });

    expect(sql).toContain("FROM account_behavior_profile");
    expect(sql).toContain("FROM contact_behavior_profile");
    expect(sql).toContain("FROM next_best_action_score");
    expect(sql).toContain("FROM payment_application");
    expect(sql).toContain("FROM promise_to_pay");
    expect(sql).toContain("FROM remittance");
    expect(sql).toContain("billing_account.id = 'billing-1'");
    expect(sql).toContain("billing_account.account_number = 'BA-1001'");
    expect(sql).toContain("collector@example.com");
  });

  it("builds a persisted customer profile query", () => {
    const sql = buildPersistedCustomerProfileQuery({
      databaseUrl: "postgres://demo",
      tenantId: "default",
      billingAccountId: "billing-1",
    });

    expect(sql).toContain("preferredContactName");
    expect(sql).toContain("avgDaysToPay");
    expect(sql).toContain("groupedReminderAttempts");
    expect(sql).toContain("parentPayerSignals");
  });

  it("loads the first persisted learning row through the executor", () => {
    const row = loadPersistedLearningSummary(
      {
        databaseUrl: "postgres://demo",
        tenantId: "default",
        billingAccountId: "billing-1",
      },
      () => [
        {
          billingAccountId: "billing-1",
          preferredContactName: "Maria Santos",
          recommendedAction: "send_email_grouped_reminder",
          recommendedChannel: "email",
          groupedReminderAttempts: 2,
          groupedReminderPayments: 1,
          resendAttempts: 1,
          resendPayments: 1,
          remittanceTotalCount: 2,
          remittanceStructuredCount: 2,
          remittanceLinkedCount: 1,
          promiseObservedCount: 2,
          promiseKeptCount: 1,
          communicationAttemptCount: 4,
          wrongContactCount: 1,
          parentPayerObservations: 2,
          parentPayerSignals: 1,
        },
      ],
    );

    expect(row?.billingAccountId).toBe("billing-1");
    expect(row?.recommendedAction).toBe("send_email_grouped_reminder");
  });

  it("loads a persisted customer profile through the executor", () => {
    const row = loadPersistedCustomerProfile(
      {
        databaseUrl: "postgres://demo",
        tenantId: "default",
        billingAccountId: "billing-1",
      },
      () => [
        {
          billingAccountId: "billing-1",
          accountName: "Metro Retail Group",
          preferredContactName: "Maria Santos",
          preferredContactEmail: "maria@example.com",
          accountPreferredChannel: "email",
          avgDaysToPay: 19.4,
          avgDaysLate: 4.2,
          groupedReminderAttempts: 4,
          groupedReminderPayments: 2,
          resendAttempts: 3,
          resendPayments: 1,
          remittanceTotalCount: 5,
          remittanceStructuredCount: 4,
          remittanceLinkedCount: 4,
          promiseObservedCount: 6,
          promiseKeptCount: 5,
          communicationAttemptCount: 10,
          wrongContactCount: 1,
          parentPayerObservations: 5,
          parentPayerSignals: 3,
        },
      ],
    );

    expect(row?.billingAccountId).toBe("billing-1");
    expect(row?.preferredContact.contactName).toBe("Maria Santos");
    expect(row?.paymentBehaviorSnapshot.avgDaysToPay).toBe(19.4);
    expect(row?.paymentBehaviorSnapshot.promiseKeptRate).toBeCloseTo(0.83, 2);
  });

  it("returns undefined when no account identity is available", () => {
    const row = loadPersistedLearningSummary(
      {
        databaseUrl: "postgres://demo",
        tenantId: "default",
      },
      () => {
        throw new Error("should not execute");
      },
    );

    expect(row).toBeUndefined();
  });
});
