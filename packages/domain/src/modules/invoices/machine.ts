import {
  TransitionError,
  TransitionService,
  type TransitionAuditHook,
  type TransitionContext,
  type StateMachineDefinition
} from "../../shared/state-machine.js";
import type { Invoice, InvoiceState } from "./schema.js";

const positiveAmountGuard = (invoice: Invoice): void => {
  if (invoice.amountCents <= 0) {
    throw new TransitionError("Invoice amount must be positive.");
  }
};

const writebackReasonGuard = (_invoice: Invoice, context: TransitionContext): void => {
  if (!context.reason?.trim()) {
    throw new TransitionError("Writeback transitions require a reason.");
  }
};

export const invoiceStateMachine: StateMachineDefinition<Invoice, InvoiceState> = {
  name: "invoice",
  terminalStates: ["paid", "voided"],
  terminalOverridePolicy: "admin_manual_rollback",
  transitions: {
    uploaded_unmatched: ["matched_to_erp", "voided"],
    synced_open: [
      "partially_paid",
      "paid",
      "disputed_partial",
      "disputed_full",
      "credit_pending",
      "writeback_pending",
      "voided"
    ],
    matched_to_erp: [
      "partially_paid",
      "paid",
      "disputed_partial",
      "disputed_full",
      "credit_pending",
      "writeback_pending",
      "voided"
    ],
    partially_paid: ["paid", "disputed_partial", "credit_pending", "writeback_pending"],
    paid: [],
    disputed_partial: ["partially_paid", "paid", "credit_pending"],
    disputed_full: ["synced_open", "credit_pending", "voided"],
    credit_pending: ["synced_open", "partially_paid", "paid", "voided"],
    writeback_pending: ["synced_open", "partially_paid", "paid", "writeback_failed"],
    writeback_failed: ["writeback_pending", "synced_open", "partially_paid"],
    voided: []
  },
  guards: {
    synced_open: {
      paid: [positiveAmountGuard],
      partially_paid: [positiveAmountGuard],
      writeback_pending: [writebackReasonGuard]
    },
    matched_to_erp: {
      paid: [positiveAmountGuard],
      partially_paid: [positiveAmountGuard],
      writeback_pending: [writebackReasonGuard]
    },
    partially_paid: {
      paid: [positiveAmountGuard],
      writeback_pending: [writebackReasonGuard]
    },
    disputed_partial: {
      writeback_pending: [writebackReasonGuard]
    },
    credit_pending: {
      writeback_pending: [writebackReasonGuard]
    },
    writeback_failed: {
      writeback_pending: [writebackReasonGuard]
    }
  }
};

export class InvoiceTransitionService extends TransitionService<Invoice, InvoiceState> {
  constructor(auditHook?: TransitionAuditHook<InvoiceState>) {
    super(invoiceStateMachine, auditHook);
  }
}
