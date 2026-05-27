import type { StatefulEntity } from "../../shared/state-machine.js";

export const installmentPlanStatuses = [
  "active",
  "completed",
  "defaulted",
  "restructured",
  "cancelled",
] as const;

export type InstallmentPlanStatus = (typeof installmentPlanStatuses)[number];

export const installmentCadences = ["weekly", "monthly", "quarterly", "custom"] as const;

export type InstallmentCadence = (typeof installmentCadences)[number];

export const installmentLineStatuses = [
  "future",
  "due",
  "partially_paid",
  "overdue",
  "promised",
  "disputed",
  "paid",
  "restructured",
] as const;

export type InstallmentLineStatus = (typeof installmentLineStatuses)[number];

export interface InstallmentPlan extends StatefulEntity<InstallmentPlanStatus> {
  installmentPlanId: string;
  tenantId: string;
  billingAccountId: string;
  branchId?: string;
  parentInvoiceId?: string;
  erpReference?: string;
  currency: string;
  totalContractAmountCents: number;
  numberOfInstallments: number;
  cadence: InstallmentCadence;
  planStartDate: string;
  metadata: Record<string, unknown>;
}

export interface InstallmentLine extends StatefulEntity<InstallmentLineStatus> {
  installmentLineId: string;
  installmentPlanId: string;
  parentInvoiceId?: string;
  billingAccountId: string;
  branchId?: string;
  currency: string;
  sequenceNumber: number;
  dueDate: string;
  scheduledAmountCents: number;
  paidAmountCents: number;
  remainingAmountCents: number;
  daysPastDue: number;
  lastPromiseToPayDate?: string;
  metadata: Record<string, unknown>;
}

export interface InstallmentPlanSummary {
  totalRemainingBalanceCents: number;
  futureInstallmentsBalanceCents: number;
  dueNowInstallmentsBalanceCents: number;
  overdueInstallmentsBalanceCents: number;
  oldestOverdueInstallmentDaysPastDue?: number;
  missedInstallmentCount: number;
  nextInstallmentDueDate?: string;
  nextInstallmentAmountCents?: number;
  activeInstallmentCount: number;
}

export const installmentAllocationPolicies = [
  "oldest_due_first",
  "manual_allocation",
  "erp_provided_allocation",
] as const;

export type InstallmentAllocationPolicy = (typeof installmentAllocationPolicies)[number];

export interface InstallmentAllocationInput {
  line: InstallmentLine;
  amountCents: number;
}

export interface InstallmentAllocationDecision {
  policy: InstallmentAllocationPolicy;
  allocations: InstallmentAllocationInput[];
  appliedAmountCents: number;
  unappliedAmountCents: number;
  auditPayload: Record<string, unknown>;
}
