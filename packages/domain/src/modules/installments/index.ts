import { defineModule } from "../../shared/define-module.js";
import { createEntityMetadata } from "../../shared/types.js";
import {
  InstallmentLineTransitionService,
} from "./machine.js";
import type {
  InstallmentAllocationDecision,
  InstallmentAllocationInput,
  InstallmentAllocationPolicy,
  InstallmentLine,
  InstallmentLineStatus,
  InstallmentPlan,
  InstallmentPlanSummary,
} from "./schema.js";

export const installmentsModule = defineModule({
  name: "installments",
  boundedContext: "billing",
  description: "Installment receivable schedules layered onto ERP-backed invoices.",
  capabilities: ["line-level receivable aging", "installment allocation", "promise and dispute linkage"],
  integrations: ["erp", "cash_application", "collections"],
  lifecycle: "draft",
});

export class CrossEntityInstallmentAllocationAmbiguityError extends Error {
  constructor(message = "Installment allocation is blocked by cross-entity ambiguity.") {
    super(message);
    this.name = "CrossEntityInstallmentAllocationAmbiguityError";
  }
}

export class InstallmentManualAllocationRequiredError extends Error {
  constructor(message = "Manual installment allocation input is required for this policy.") {
    super(message);
    this.name = "InstallmentManualAllocationRequiredError";
  }
}

export class DisputedInstallmentLineAutoChaseBlockedError extends Error {
  readonly installmentLineId: string;

  constructor(installmentLineId: string) {
    super(`Installment line "${installmentLineId}" cannot auto-trigger collections while disputed.`);
    this.name = "DisputedInstallmentLineAutoChaseBlockedError";
    this.installmentLineId = installmentLineId;
  }
}

export function createInstallmentPlan(params: {
  id: string;
  tenantId?: string;
  createdAt: string;
  billingAccountId: string;
  branchId?: string;
  parentInvoiceId?: string;
  erpReference?: string;
  currency: string;
  totalContractAmountCents: number;
  numberOfInstallments: number;
  cadence: InstallmentPlan["cadence"];
  planStartDate: string;
  status?: InstallmentPlan["state"];
  metadata?: Record<string, unknown>;
}): InstallmentPlan {
  return {
    id: params.id,
    installmentPlanId: params.id,
    ...createEntityMetadata({
      at: params.createdAt,
      ...(params.tenantId ? { tenantId: params.tenantId } : {}),
      actorId: "system",
      actorRole: "system",
    }),
    billingAccountId: params.billingAccountId,
    ...(params.branchId ? { branchId: params.branchId } : {}),
    ...(params.parentInvoiceId ? { parentInvoiceId: params.parentInvoiceId } : {}),
    ...(params.erpReference ? { erpReference: params.erpReference } : {}),
    currency: params.currency,
    totalContractAmountCents: params.totalContractAmountCents,
    numberOfInstallments: params.numberOfInstallments,
    cadence: params.cadence,
    planStartDate: params.planStartDate,
    state: params.status ?? "active",
    metadata: params.metadata ?? {},
  };
}

export function createInstallmentLine(params: {
  id: string;
  tenantId?: string;
  createdAt: string;
  installmentPlanId: string;
  parentInvoiceId?: string;
  billingAccountId: string;
  branchId?: string;
  currency: string;
  sequenceNumber: number;
  dueDate: string;
  scheduledAmountCents: number;
  paidAmountCents?: number;
  remainingAmountCents?: number;
  status?: InstallmentLineStatus;
  daysPastDue?: number;
  lastPromiseToPayDate?: string;
  metadata?: Record<string, unknown>;
}): InstallmentLine {
  const paidAmountCents = params.paidAmountCents ?? 0;
  return {
    id: params.id,
    installmentLineId: params.id,
    ...createEntityMetadata({
      at: params.createdAt,
      ...(params.tenantId ? { tenantId: params.tenantId } : {}),
      actorId: "system",
      actorRole: "system",
    }),
    installmentPlanId: params.installmentPlanId,
    ...(params.parentInvoiceId ? { parentInvoiceId: params.parentInvoiceId } : {}),
    billingAccountId: params.billingAccountId,
    ...(params.branchId ? { branchId: params.branchId } : {}),
    currency: params.currency,
    sequenceNumber: params.sequenceNumber,
    dueDate: params.dueDate,
    scheduledAmountCents: params.scheduledAmountCents,
    paidAmountCents,
    remainingAmountCents: params.remainingAmountCents ?? Math.max(0, params.scheduledAmountCents - paidAmountCents),
    daysPastDue: params.daysPastDue ?? 0,
    ...(params.lastPromiseToPayDate ? { lastPromiseToPayDate: params.lastPromiseToPayDate } : {}),
    state: params.status ?? "future",
    metadata: params.metadata ?? {},
  };
}

export function calculateInstallmentDaysPastDue(dueDate: string, asOfDate: string): number {
  const due = new Date(`${dueDate}T00:00:00.000Z`);
  const asOf = new Date(`${asOfDate.slice(0, 10)}T00:00:00.000Z`);
  const diff = Math.floor((asOf.getTime() - due.getTime()) / 86_400_000);
  return Math.max(0, diff);
}

export function evaluateInstallmentLineState(params: {
  line: InstallmentLine;
  asOfDate: string;
  settledAmountCents?: number;
}): InstallmentLineStatus {
  const settledAmountCents = params.settledAmountCents ?? params.line.paidAmountCents;
  const remainingAmountCents = Math.max(0, params.line.scheduledAmountCents - settledAmountCents);
  const daysPastDue = calculateInstallmentDaysPastDue(params.line.dueDate, params.asOfDate);

  if (remainingAmountCents === 0) {
    return "paid";
  }
  if (params.line.state === "disputed") {
    return "disputed";
  }
  if (params.line.state === "restructured") {
    return "restructured";
  }
  if (params.line.lastPromiseToPayDate && params.line.lastPromiseToPayDate >= params.asOfDate.slice(0, 10)) {
    return "promised";
  }
  if (daysPastDue > 0) {
    return settledAmountCents > 0 ? "partially_paid" : "overdue";
  }
  if (params.line.dueDate === params.asOfDate.slice(0, 10)) {
    return settledAmountCents > 0 ? "partially_paid" : "due";
  }
  return settledAmountCents > 0 ? "partially_paid" : "future";
}

export function refreshInstallmentLine(params: {
  line: InstallmentLine;
  asOfDate: string;
  settledAmountCents?: number;
}): InstallmentLine {
  const paidAmountCents = params.settledAmountCents ?? params.line.paidAmountCents;
  const remainingAmountCents = Math.max(0, params.line.scheduledAmountCents - paidAmountCents);
  return {
    ...params.line,
    paidAmountCents,
    remainingAmountCents,
    daysPastDue: calculateInstallmentDaysPastDue(params.line.dueDate, params.asOfDate),
    state: evaluateInstallmentLineState(params),
  };
}

export function canAutoChaseInstallmentLine(line: InstallmentLine): boolean {
  return line.state !== "disputed" && line.remainingAmountCents > 0;
}

export function buildInstallmentPlanSummary(
  lines: InstallmentLine[],
  asOfDate: string,
): InstallmentPlanSummary {
  const refreshed = lines.map((line) => refreshInstallmentLine({ line, asOfDate }));
  const activeLines = refreshed.filter((line) => line.remainingAmountCents > 0);
  const overdueLines = activeLines.filter((line) => line.daysPastDue > 0 && line.state !== "disputed");
  const dueNowLines = activeLines.filter(
    (line) => line.daysPastDue === 0 && line.dueDate <= asOfDate.slice(0, 10) && line.state !== "future",
  );
  const futureLines = activeLines.filter((line) => line.dueDate > asOfDate.slice(0, 10));
  const nextLine = activeLines
    .filter((line) => line.dueDate >= asOfDate.slice(0, 10))
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.sequenceNumber - right.sequenceNumber)[0];

  return {
    totalRemainingBalanceCents: activeLines.reduce((sum, line) => sum + line.remainingAmountCents, 0),
    futureInstallmentsBalanceCents: futureLines.reduce((sum, line) => sum + line.remainingAmountCents, 0),
    dueNowInstallmentsBalanceCents: dueNowLines.reduce((sum, line) => sum + line.remainingAmountCents, 0),
    overdueInstallmentsBalanceCents: overdueLines.reduce((sum, line) => sum + line.remainingAmountCents, 0),
    ...(overdueLines.length > 0
      ? {
          oldestOverdueInstallmentDaysPastDue: Math.max(
            ...overdueLines.map((line) => line.daysPastDue),
          ),
        }
      : {}),
    missedInstallmentCount: overdueLines.length,
    ...(nextLine
      ? {
          nextInstallmentDueDate: nextLine.dueDate,
          nextInstallmentAmountCents: nextLine.remainingAmountCents,
        }
      : {}),
    activeInstallmentCount: activeLines.length,
  };
}

export function allocatePaymentToInstallmentLines(params: {
  paymentAmountCents: number;
  accountBillingAccountId: string;
  accountBranchId?: string;
  paymentCurrency: string;
  lines: InstallmentLine[];
  policy: InstallmentAllocationPolicy;
  manualAllocations?: Array<{ installmentLineId: string; amountCents: number }>;
  erpAllocations?: Array<{ installmentLineId: string; amountCents: number }>;
}): InstallmentAllocationDecision {
  const conflictingEntity = params.lines.some(
    (line) =>
      line.billingAccountId !== params.accountBillingAccountId ||
      line.currency !== params.paymentCurrency ||
      (params.accountBranchId && line.branchId && line.branchId !== params.accountBranchId),
  );
  if (conflictingEntity) {
    throw new CrossEntityInstallmentAllocationAmbiguityError();
  }

  const allocatableLines = params.lines.filter((line) => line.remainingAmountCents > 0);
  if (allocatableLines.some((line) => line.state === "disputed")) {
    const disputedLine = allocatableLines.find((line) => line.state === "disputed");
    throw new DisputedInstallmentLineAutoChaseBlockedError(disputedLine?.installmentLineId ?? "unknown");
  }

  let requestedAllocations: Array<{ installmentLineId: string; amountCents: number }>;
  switch (params.policy) {
    case "manual_allocation":
      if (!params.manualAllocations || params.manualAllocations.length === 0) {
        throw new InstallmentManualAllocationRequiredError();
      }
      requestedAllocations = params.manualAllocations;
      break;
    case "erp_provided_allocation":
      if (!params.erpAllocations || params.erpAllocations.length === 0) {
        throw new InstallmentManualAllocationRequiredError("ERP-provided installment allocation data is required.");
      }
      requestedAllocations = params.erpAllocations;
      break;
    default:
      requestedAllocations = [];
      break;
  }

  let remaining = params.paymentAmountCents;
  const lineById = new Map(allocatableLines.map((line) => [line.installmentLineId, line]));
  const orderedLines =
    params.policy === "oldest_due_first"
      ? [...allocatableLines].sort(
          (left, right) =>
            right.daysPastDue - left.daysPastDue ||
            left.dueDate.localeCompare(right.dueDate) ||
            left.sequenceNumber - right.sequenceNumber,
        )
      : requestedAllocations
          .map((allocation) => lineById.get(allocation.installmentLineId))
          .filter((line): line is InstallmentLine => Boolean(line));

  const allocations: InstallmentAllocationInput[] = [];
  for (const line of orderedLines) {
    if (remaining <= 0) {
      break;
    }
    const explicitAmount =
      params.policy === "oldest_due_first"
        ? undefined
        : requestedAllocations.find((allocation) => allocation.installmentLineId === line.installmentLineId)?.amountCents;
    const amountCents = Math.min(line.remainingAmountCents, explicitAmount ?? remaining, remaining);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      continue;
    }
    allocations.push({ line, amountCents });
    remaining -= amountCents;
  }

  const appliedAmountCents = allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
  return {
    policy: params.policy,
    allocations,
    appliedAmountCents,
    unappliedAmountCents: params.paymentAmountCents - appliedAmountCents,
    auditPayload: {
      policy: params.policy,
      installmentLineIds: allocations.map((allocation) => allocation.line.installmentLineId),
      branchIds: [...new Set(allocations.map((allocation) => allocation.line.branchId).filter(Boolean))],
      appliedAmountCents,
      unappliedAmountCents: params.paymentAmountCents - appliedAmountCents,
    },
  };
}

export function settleInstallmentAllocations(
  lines: InstallmentLine[],
  allocations: InstallmentAllocationInput[],
  asOfDate: string,
): InstallmentLine[] {
  const byId = new Map(
    allocations.map((allocation) => [allocation.line.installmentLineId, allocation.amountCents]),
  );
  const transitions = new InstallmentLineTransitionService();
  return lines.map((line) => {
    const appliedAmountCents = byId.get(line.installmentLineId);
    if (!appliedAmountCents) {
      return refreshInstallmentLine({ line, asOfDate });
    }
    const refreshed = refreshInstallmentLine({
      line: {
        ...line,
        paidAmountCents: line.paidAmountCents + appliedAmountCents,
      },
      asOfDate,
    });
    const nextState = refreshed.remainingAmountCents === 0 ? "paid" : refreshed.state;
    if (nextState === line.state) {
      return refreshed;
    }
    return transitions.transition(refreshed, nextState, {
      actorId: "system_cash_application",
      actorRole: "system",
      occurredAt: asOfDate,
      reason: "installment_payment_allocation",
    });
  });
}

export * from "./schema.js";
export * from "./machine.js";
