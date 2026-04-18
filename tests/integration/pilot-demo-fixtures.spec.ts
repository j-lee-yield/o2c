import { describe, expect, it } from "vitest";

import {
  buildDemoSeedBundle,
  buildPilotDemoCatalog,
  buildPilotReadinessSnapshot,
} from "../../packages/seed/src/index.js";

describe("pilot demo fixtures", () => {
  it("builds pilot-ready fixture coverage for the target demo stories", () => {
    const catalog = buildPilotDemoCatalog();
    const bundle = buildDemoSeedBundle();

    expect(bundle.parentAccounts).toHaveLength(4);
    expect(bundle.billingAccounts).toHaveLength(6);
    expect(bundle.branches.length).toBeGreaterThanOrEqual(8);
    expect(bundle.payments).toHaveLength(6);
    expect(bundle.promisesToPay).toHaveLength(2);
    expect(
      catalog.scenarios.map((scenario) => scenario.industry)
    ).toEqual(expect.arrayContaining(["distributor", "manufacturer", "importer_wholesaler"]));
    expect(
      catalog.scenarios.flatMap((scenario) => scenario.tags)
    ).toEqual(
      expect.arrayContaining([
        "multi_branch_centralized_payer",
        "already_paid_not_yet_matched",
        "partial_dispute",
        "short_payment",
        "overpayment",
        "proof_of_payment_upload",
        "promise_kept",
        "promise_broken",
      ])
    );
  });

  it("exposes sample payloads, walkthrough steps, and KPI-oriented snapshot output", () => {
    const snapshot = buildPilotReadinessSnapshot();

    expect(snapshot.metrics.dsoImprovementDays).toBeGreaterThan(0);
    expect(snapshot.metrics.overdueBalanceReducedPercent).toBeGreaterThan(0);
    expect(snapshot.metrics.autoAppliedCashPercent).toBeGreaterThan(0);
    expect(snapshot.metrics.touchToPromiseRate).toBeGreaterThan(0);
    expect(snapshot.metrics.promiseToPayKeptRate).toBeGreaterThan(0);
    expect(snapshot.samplePayloads).toHaveLength(6);
    expect(snapshot.walkthrough).toHaveLength(6);
    expect(snapshot.seedScripts).toHaveLength(3);
    expect(snapshot.metricDefinitions.map((definition) => definition.key)).toEqual(
      expect.arrayContaining([
        "dso_improvement_days",
        "overdue_balance_reduced_percent",
        "cash_collected_from_in_scope_invoices",
        "auto_applied_cash_percent",
        "collector_hours_saved",
        "touch_to_promise_rate",
        "promise_to_pay_kept_rate",
        "unmatched_cash_aging_days",
        "dispute_identification_speed_hours",
      ])
    );
  });
});
