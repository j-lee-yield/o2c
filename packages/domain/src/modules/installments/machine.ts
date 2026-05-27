import {
  TransitionError,
  TransitionService,
  type StateMachineDefinition,
  type TransitionAuditHook,
  type TransitionContext,
} from "../../shared/state-machine.js";
import type { InstallmentLine, InstallmentLineStatus } from "./schema.js";

const requiresPromiseDate = (line: InstallmentLine): void => {
  if (!line.lastPromiseToPayDate) {
    throw new TransitionError("Promised installment lines require a promise date.");
  }
};

const requiresPositiveScheduledAmount = (line: InstallmentLine): void => {
  if (!Number.isInteger(line.scheduledAmountCents) || line.scheduledAmountCents <= 0) {
    throw new TransitionError("Installment lines require a positive scheduled amount.");
  }
};

const requiresReason = (_line: InstallmentLine, context: TransitionContext): void => {
  if (!context.reason?.trim()) {
    throw new TransitionError("Installment line transition requires a reason.");
  }
};

export const installmentLineStateMachine: StateMachineDefinition<
  InstallmentLine,
  InstallmentLineStatus
> = {
  name: "installment_line",
  terminalStates: ["paid", "restructured"],
  terminalOverridePolicy: "admin_manual_correction",
  transitions: {
    future: ["due", "disputed", "restructured", "paid"],
    due: ["partially_paid", "overdue", "promised", "disputed", "paid", "restructured"],
    partially_paid: ["overdue", "promised", "disputed", "paid", "restructured"],
    overdue: ["partially_paid", "promised", "disputed", "paid", "restructured"],
    promised: ["partially_paid", "overdue", "disputed", "paid", "restructured"],
    disputed: ["due", "partially_paid", "paid", "restructured"],
    paid: [],
    restructured: [],
  },
  guards: {
    future: {
      due: [requiresPositiveScheduledAmount],
      paid: [requiresPositiveScheduledAmount],
    },
    due: {
      promised: [requiresPromiseDate],
      restructured: [requiresReason],
    },
    partially_paid: {
      promised: [requiresPromiseDate],
      restructured: [requiresReason],
    },
    overdue: {
      promised: [requiresPromiseDate],
      restructured: [requiresReason],
    },
    promised: {
      overdue: [requiresReason],
      restructured: [requiresReason],
    },
    disputed: {
      due: [requiresReason],
      restructured: [requiresReason],
    },
  },
};

export class InstallmentLineTransitionService extends TransitionService<
  InstallmentLine,
  InstallmentLineStatus
> {
  constructor(auditHook?: TransitionAuditHook<InstallmentLineStatus>) {
    super(installmentLineStateMachine, auditHook);
  }
}
