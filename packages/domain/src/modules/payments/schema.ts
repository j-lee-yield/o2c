import type { StatefulEntity } from "../../shared/state-machine.js";

export const paymentStates = [
  "ingested_unmatched",
  "candidate_match_found",
  "review_required",
  "auto_applied",
  "manually_applied",
  "partially_applied",
  "unapplied_cash",
  "reversed",
  "writeback_pending",
  "writeback_failed"
] as const;

export type PaymentState = (typeof paymentStates)[number];

export type PaymentSettlementStatus =
  | "pending_source_confirmation"
  | "pending_clearance"
  | "settled"
  | "reversed"
  | "failed_clearance";

export interface Payment extends StatefulEntity<PaymentState> {
  parentAccountId: string;
  billingAccountId?: string;
  uploadedDocumentId?: string;
  paymentReference: string;
  currency: string;
  amountCents: number;
  receivedAt: string;
  settlementStatus?: PaymentSettlementStatus;
  sourcePaymentCandidateId?: string;
  finalityConfirmedAt?: string;
  metadata: Record<string, unknown>;
}
