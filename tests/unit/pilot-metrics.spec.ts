import { describe, expect, it } from "vitest";

import { makeBillingAccount, makeInvoice, makePayment } from "../../packages/testkit/src/index.js";
import { buildPilotReadinessMetrics } from "../../packages/workflows/src/index.js";

describe("pilot readiness metrics", () => {
  it("computes secondary KPI metrics and invokes instrumentation hooks", () => {
    const scenarioIds: string[] = [];
    let computedDso = 0;

    const metrics = buildPilotReadinessMetrics({
      asOf: "2026-03-26T00:00:00.000Z",
      hooks: {
        onScenarioEvaluated: (scenario) => scenarioIds.push(scenario.scenarioId),
        onMetricsComputed: (scenarioMetrics) => {
          computedDso = scenarioMetrics.dsoImprovementDays;
        },
      },
      scenarios: [
        {
          scenarioId: "metric-scenario-1",
          route: "auto_apply",
          account: makeBillingAccount({ id: "bill-1" }),
          payment: makePayment({ id: "pay-1", billingAccountId: "bill-1", amountCents: 100_000 }),
          invoices: [
            makeInvoice({
              id: "inv-1",
              billingAccountId: "bill-1",
              amountCents: 100_000,
              invoiceDate: "2026-03-01",
              dueDate: "2026-03-15",
            }),
          ],
          allocations: [
            {
              invoiceId: "inv-1",
              invoiceNumber: "INV-1",
              billingAccountId: "bill-1",
              branchId: "branch-1",
              appliedAmountCents: 100_000,
              resultingInvoiceState: "paid",
            },
          ],
          appliedAmountCents: 100_000,
          unappliedAmountCents: 0,
          overdueBalanceBeforeCents: 100_000,
          overdueBalanceAfterCents: 0,
          inScopeCashCollectedCents: 100_000,
          collectorMinutesBefore: 90,
          collectorMinutesAfter: 15,
          touchCount: 2,
          promiseCount: 1,
          promisesKeptCount: 1,
          unmatchedCashAgingDaysBefore: 10,
          unmatchedCashAgingDaysAfter: 2,
          disputeIdentificationHoursBefore: 24,
          disputeIdentificationHoursAfter: 4,
        },
      ],
    });

    expect(scenarioIds).toEqual(["metric-scenario-1"]);
    expect(computedDso).toBe(metrics.dsoImprovementDays);
    expect(metrics.overdueBalanceReducedPercent).toBe(100);
    expect(metrics.autoAppliedCashPercent).toBe(100);
    expect(metrics.collectorHoursSaved).toBe(1.25);
    expect(metrics.touchToPromiseRate).toBe(50);
    expect(metrics.promiseToPayKeptRate).toBe(100);
    expect(metrics.unmatchedCashAgingDays).toBe(2);
    expect(metrics.disputeIdentificationSpeedHours).toBe(4);
  });
});
