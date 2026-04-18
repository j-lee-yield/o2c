import { createEntityMetadata, type DomainEntity } from "../../shared/types.js";

export const paymentApplicationStates = ["proposed", "applied", "reversed"] as const;

export type PaymentApplicationState = (typeof paymentApplicationStates)[number];

export interface PaymentApplication extends DomainEntity {
  paymentId: string;
  invoiceId: string;
  parentAccountId: string;
  billingAccountId: string;
  branchId?: string;
  currency: string;
  appliedAmountCents: number;
  state: PaymentApplicationState;
  source: "cash_application_workflow";
  correlationId?: string;
  rationale?: string;
  metadata: Record<string, unknown>;
}

export function createPaymentApplication(params: {
  id: string;
  createdAt: string;
  paymentId: string;
  invoiceId: string;
  parentAccountId: string;
  billingAccountId: string;
  branchId?: string;
  currency: string;
  appliedAmountCents: number;
  state: PaymentApplicationState;
  correlationId?: string;
  rationale?: string;
  metadata?: Record<string, unknown>;
}): PaymentApplication {
  return {
    id: params.id,
    ...createEntityMetadata({
      at: params.createdAt,
      actorId: "system_cash_application",
      actorRole: "system"
    }),
    paymentId: params.paymentId,
    invoiceId: params.invoiceId,
    parentAccountId: params.parentAccountId,
    billingAccountId: params.billingAccountId,
    ...(params.branchId ? { branchId: params.branchId } : {}),
    currency: params.currency,
    appliedAmountCents: params.appliedAmountCents,
    state: params.state,
    source: "cash_application_workflow",
    ...(params.correlationId ? { correlationId: params.correlationId } : {}),
    ...(params.rationale ? { rationale: params.rationale } : {}),
    metadata: params.metadata ?? {}
  };
}
