import {
  TransitionError,
  TransitionService,
  type TransitionAuditHook,
  type TransitionContext,
  type StateMachineDefinition
} from "../../shared/state-machine.js";
import type { Payment, PaymentState } from "./schema.js";

const positivePaymentAmountGuard = (payment: Payment): void => {
  if (payment.amountCents <= 0) {
    throw new TransitionError("Payment amount must be positive.");
  }
};

const requiresMatchEvidenceGuard = (
  _payment: Payment,
  context: TransitionContext
): void => {
  if (context.metadata?.matchEvidence !== true) {
    throw new TransitionError("Applying a payment requires matchEvidence metadata.");
  }
};

export const paymentStateMachine: StateMachineDefinition<Payment, PaymentState> = {
  name: "payment",
  terminalStates: ["reversed"],
  terminalOverridePolicy: "admin_manual_correction",
  transitions: {
    ingested_unmatched: ["candidate_match_found", "unapplied_cash", "reversed"],
    candidate_match_found: [
      "auto_applied",
      "manually_applied",
      "review_required",
      "unapplied_cash"
    ],
    review_required: ["manually_applied", "partially_applied", "unapplied_cash", "reversed"],
    auto_applied: ["writeback_pending", "writeback_failed"],
    manually_applied: ["writeback_pending", "writeback_failed"],
    partially_applied: ["writeback_pending", "unapplied_cash", "writeback_failed"],
    unapplied_cash: ["candidate_match_found", "manually_applied", "partially_applied"],
    reversed: [],
    writeback_pending: ["auto_applied", "manually_applied", "partially_applied", "writeback_failed"],
    writeback_failed: ["writeback_pending", "manually_applied", "partially_applied"]
  },
  guards: {
    candidate_match_found: {
      auto_applied: [positivePaymentAmountGuard, requiresMatchEvidenceGuard],
      manually_applied: [positivePaymentAmountGuard, requiresMatchEvidenceGuard]
    },
    review_required: {
      manually_applied: [positivePaymentAmountGuard, requiresMatchEvidenceGuard],
      partially_applied: [positivePaymentAmountGuard, requiresMatchEvidenceGuard]
    },
    unapplied_cash: {
      manually_applied: [positivePaymentAmountGuard, requiresMatchEvidenceGuard],
      partially_applied: [positivePaymentAmountGuard, requiresMatchEvidenceGuard]
    },
    writeback_failed: {
      writeback_pending: [positivePaymentAmountGuard]
    }
  }
};

export class PaymentTransitionService extends TransitionService<Payment, PaymentState> {
  constructor(auditHook?: TransitionAuditHook<PaymentState>) {
    super(paymentStateMachine, auditHook);
  }
}
