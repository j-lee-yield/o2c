import type { BillingAccount, CustomerInvoice, Payment } from "@o2c/domain";
import type { CashApplicationAllocationResult } from "./cash-application.js";

export type PilotMetricKey =
  | "dso_improvement_days"
  | "overdue_balance_reduced_percent"
  | "cash_collected_from_in_scope_invoices"
  | "auto_applied_cash_percent"
  | "collector_hours_saved"
  | "touch_to_promise_rate"
  | "promise_to_pay_kept_rate"
  | "unmatched_cash_aging_days"
  | "dispute_identification_speed_hours";

export interface PilotMetricDefinition {
  key: PilotMetricKey;
  label: string;
  description: string;
  unit: "days" | "percent" | "currency_cents" | "hours";
  objective: "increase" | "decrease";
  priority: "primary" | "secondary";
}

export interface PilotMetricHooks {
  onScenarioEvaluated?: (scenario: PilotScenarioMetricInput) => void;
  onMetricsComputed?: (metrics: PilotReadinessMetrics) => void;
}

export interface PilotScenarioMetricInput {
  scenarioId: string;
  route: "auto_apply" | "approval_required" | "review_required";
  account: BillingAccount;
  payment: Payment;
  invoices: CustomerInvoice[];
  allocations: CashApplicationAllocationResult[];
  appliedAmountCents: number;
  unappliedAmountCents: number;
  overdueBalanceBeforeCents?: number;
  overdueBalanceAfterCents?: number;
  inScopeCashCollectedCents?: number;
  collectorMinutesBefore?: number;
  collectorMinutesAfter?: number;
  touchCount?: number;
  promiseCount?: number;
  promisesKeptCount?: number;
  unmatchedCashAgingDaysBefore?: number;
  unmatchedCashAgingDaysAfter?: number;
  disputeIdentificationHoursBefore?: number;
  disputeIdentificationHoursAfter?: number;
}

export interface PilotReadinessMetrics {
  evaluatedPayments: number;
  autoAppliedPayments: number;
  pendingApprovals: number;
  reviewQueueItems: number;
  branchPreservedAllocations: number;
  autoAppliedCashCents: number;
  unappliedCashCents: number;
  baselineDsoDays: number;
  projectedDsoDays: number;
  dsoImprovementDays: number;
  overdueBalanceReducedCents: number;
  overdueBalanceReducedPercent: number;
  cashCollectedFromInScopeInvoicesCents: number;
  autoAppliedCashPercent: number;
  collectorHoursSaved: number;
  touchToPromiseRate: number;
  promiseToPayKeptRate: number;
  baselineUnmatchedCashAgingDays: number;
  unmatchedCashAgingDays: number;
  unmatchedCashAgingImprovementDays: number;
  baselineDisputeIdentificationSpeedHours: number;
  disputeIdentificationSpeedHours: number;
  disputeIdentificationImprovementHours: number;
}

export const pilotMetricDefinitions: PilotMetricDefinition[] = [
  {
    key: "dso_improvement_days",
    label: "DSO improvement",
    description: "Days sales outstanding improvement from pilot cash moves on in-scope invoices.",
    unit: "days",
    objective: "increase",
    priority: "primary",
  },
  {
    key: "overdue_balance_reduced_percent",
    label: "% overdue balance reduced",
    description: "Percentage reduction in overdue AR balance across the in-scope pilot stories.",
    unit: "percent",
    objective: "increase",
    priority: "secondary",
  },
  {
    key: "cash_collected_from_in_scope_invoices",
    label: "Cash collected from in-scope invoices",
    description: "Applied cash collected against invoices included in the pilot scope.",
    unit: "currency_cents",
    objective: "increase",
    priority: "secondary",
  },
  {
    key: "auto_applied_cash_percent",
    label: "Auto-applied cash %",
    description: "Share of in-scope collected cash that the pilot can auto-apply conservatively.",
    unit: "percent",
    objective: "increase",
    priority: "secondary",
  },
  {
    key: "collector_hours_saved",
    label: "Collector hours saved",
    description: "Estimated collector hours saved versus the current manual operating model.",
    unit: "hours",
    objective: "increase",
    priority: "secondary",
  },
  {
    key: "touch_to_promise_rate",
    label: "Touch-to-promise rate",
    description: "Percent of in-scope touches that convert into a promise-to-pay.",
    unit: "percent",
    objective: "increase",
    priority: "secondary",
  },
  {
    key: "promise_to_pay_kept_rate",
    label: "Promise-to-pay kept rate",
    description: "Percent of recorded promises that are kept within the pilot stories.",
    unit: "percent",
    objective: "increase",
    priority: "secondary",
  },
  {
    key: "unmatched_cash_aging_days",
    label: "Unmatched cash aging",
    description: "Average unmatched cash aging after pilot handling of exception and proof-of-payment scenarios.",
    unit: "days",
    objective: "decrease",
    priority: "secondary",
  },
  {
    key: "dispute_identification_speed_hours",
    label: "Dispute identification speed",
    description: "Average hours to identify a dispute or short-pay reason in the pilot journey.",
    unit: "hours",
    objective: "decrease",
    priority: "secondary",
  },
];

export function buildPilotReadinessMetrics(params: {
  asOf: string;
  scenarios: PilotScenarioMetricInput[];
  hooks?: PilotMetricHooks;
}): PilotReadinessMetrics {
  params.scenarios.forEach((scenario) => params.hooks?.onScenarioEvaluated?.(scenario));

  const baselineWeightedDays = params.scenarios.flatMap((scenario) =>
    scenario.invoices.map((invoice) => ({
      amountCents: invoice.amountCents,
      openDays: invoice.invoiceDate ? daysBetween(invoice.invoiceDate, params.asOf) : 0,
      remainingCents:
        invoice.amountCents -
        appliedAmountForInvoice(invoice.id, scenario.allocations, scenario.route),
    }))
  );

  const baselineTotal = baselineWeightedDays.reduce((sum, item) => sum + item.amountCents, 0);
  const projectedTotal = baselineWeightedDays.reduce((sum, item) => sum + item.remainingCents, 0);
  const baselineWeighted = baselineWeightedDays.reduce(
    (sum, item) => sum + item.amountCents * item.openDays,
    0
  );
  const projectedWeighted = baselineWeightedDays.reduce(
    (sum, item) => sum + item.remainingCents * item.openDays,
    0
  );

  const autoAppliedCashCents = params.scenarios
    .filter((scenario) => scenario.route === "auto_apply")
    .reduce((sum, scenario) => sum + scenario.appliedAmountCents, 0);
  const unappliedCashCents = params.scenarios.reduce(
    (sum, scenario) => sum + scenario.unappliedAmountCents,
    0
  );
  const overdueBalanceBeforeCents = params.scenarios.reduce(
    (sum, scenario) => sum + (scenario.overdueBalanceBeforeCents ?? outstandingOverdueBalance(scenario.invoices)),
    0
  );
  const overdueBalanceAfterCents = params.scenarios.reduce(
    (sum, scenario) =>
      sum + (scenario.overdueBalanceAfterCents ?? Math.max(0, outstandingOverdueBalance(scenario.invoices) - scenario.appliedAmountCents)),
    0
  );
  const cashCollectedFromInScopeInvoicesCents = params.scenarios.reduce(
    (sum, scenario) => sum + (scenario.inScopeCashCollectedCents ?? scenario.appliedAmountCents),
    0
  );
  const collectorMinutesBefore = params.scenarios.reduce(
    (sum, scenario) => sum + (scenario.collectorMinutesBefore ?? 0),
    0
  );
  const collectorMinutesAfter = params.scenarios.reduce(
    (sum, scenario) => sum + (scenario.collectorMinutesAfter ?? 0),
    0
  );
  const touchCount = params.scenarios.reduce((sum, scenario) => sum + (scenario.touchCount ?? 0), 0);
  const promiseCount = params.scenarios.reduce((sum, scenario) => sum + (scenario.promiseCount ?? 0), 0);
  const promisesKeptCount = params.scenarios.reduce(
    (sum, scenario) => sum + (scenario.promisesKeptCount ?? 0),
    0
  );
  const unmatchedCashAgingBefore = average(
    params.scenarios
      .map((scenario) => scenario.unmatchedCashAgingDaysBefore)
      .filter((value): value is number => typeof value === "number")
  );
  const unmatchedCashAgingAfter = average(
    params.scenarios
      .map((scenario) => scenario.unmatchedCashAgingDaysAfter)
      .filter((value): value is number => typeof value === "number")
  );
  const disputeIdentificationSpeedBefore = average(
    params.scenarios
      .map((scenario) => scenario.disputeIdentificationHoursBefore)
      .filter((value): value is number => typeof value === "number")
  );
  const disputeIdentificationSpeedAfter = average(
    params.scenarios
      .map((scenario) => scenario.disputeIdentificationHoursAfter)
      .filter((value): value is number => typeof value === "number")
  );

  const metrics: PilotReadinessMetrics = {
    evaluatedPayments: params.scenarios.length,
    autoAppliedPayments: params.scenarios.filter((scenario) => scenario.route === "auto_apply").length,
    pendingApprovals: params.scenarios.filter((scenario) => scenario.route === "approval_required").length,
    reviewQueueItems: params.scenarios.filter((scenario) => scenario.route === "review_required").length,
    branchPreservedAllocations: params.scenarios
      .flatMap((scenario) => scenario.allocations)
      .filter((allocation) => allocation.branchId).length,
    autoAppliedCashCents,
    unappliedCashCents,
    baselineDsoDays: ratio(baselineWeighted, baselineTotal),
    projectedDsoDays: ratio(projectedWeighted, projectedTotal),
    dsoImprovementDays: Number(
      (ratio(baselineWeighted, baselineTotal) - ratio(projectedWeighted, projectedTotal)).toFixed(2)
    ),
    overdueBalanceReducedCents: overdueBalanceBeforeCents - overdueBalanceAfterCents,
    overdueBalanceReducedPercent: percent(
      overdueBalanceBeforeCents - overdueBalanceAfterCents,
      overdueBalanceBeforeCents
    ),
    cashCollectedFromInScopeInvoicesCents,
    autoAppliedCashPercent: percent(autoAppliedCashCents, cashCollectedFromInScopeInvoicesCents),
    collectorHoursSaved: Number(((collectorMinutesBefore - collectorMinutesAfter) / 60).toFixed(2)),
    touchToPromiseRate: percent(promiseCount, touchCount),
    promiseToPayKeptRate: percent(promisesKeptCount, promiseCount),
    baselineUnmatchedCashAgingDays: unmatchedCashAgingBefore,
    unmatchedCashAgingDays: unmatchedCashAgingAfter,
    unmatchedCashAgingImprovementDays: Number(
      (unmatchedCashAgingBefore - unmatchedCashAgingAfter).toFixed(2)
    ),
    baselineDisputeIdentificationSpeedHours: disputeIdentificationSpeedBefore,
    disputeIdentificationSpeedHours: disputeIdentificationSpeedAfter,
    disputeIdentificationImprovementHours: Number(
      (disputeIdentificationSpeedBefore - disputeIdentificationSpeedAfter).toFixed(2)
    ),
  };

  params.hooks?.onMetricsComputed?.(metrics);

  return metrics;
}

function daysBetween(from: string, to: string) {
  return Number(
    Math.max(0, (Date.parse(to) - Date.parse(`${from}T00:00:00.000Z`)) / (1000 * 60 * 60 * 24)).toFixed(2)
  );
}

function ratio(numerator: number, denominator: number) {
  if (denominator === 0) {
    return 0;
  }

  return Number((numerator / denominator).toFixed(2));
}

function percent(numerator: number, denominator: number) {
  if (denominator === 0) {
    return 0;
  }

  return Number(((numerator / denominator) * 100).toFixed(2));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function appliedAmountForInvoice(
  invoiceId: string,
  allocations: CashApplicationAllocationResult[],
  route: PilotScenarioMetricInput["route"]
) {
  if (route !== "auto_apply") {
    return 0;
  }

  return allocations.find((allocation) => allocation.invoiceId === invoiceId)?.appliedAmountCents ?? 0;
}

function outstandingOverdueBalance(invoices: CustomerInvoice[]) {
  return invoices.reduce((sum, invoice) => {
    if (!invoice.dueDate) {
      return sum;
    }

    return sum + invoice.amountCents;
  }, 0);
}
