import {
  TransitionError,
  TransitionService,
  type TransitionAuditHook,
  type TransitionContext,
  type StateMachineDefinition
} from "../../shared/state-machine.js";
import type { PromiseToPay, PromiseToPayState } from "./schema.js";

const requiresFutureOrCurrentDate = (promiseToPay: PromiseToPay): void => {
  if (!promiseToPay.promiseDate) {
    throw new TransitionError("Promise-to-pay requires a promise date.");
  }
};

const requiresOutcomeReason = (_promise: PromiseToPay, context: TransitionContext): void => {
  if (!context.reason?.trim()) {
    throw new TransitionError("Promise-to-pay outcome transitions require a reason.");
  }
};

export const promiseToPayStateMachine: StateMachineDefinition<PromiseToPay, PromiseToPayState> = {
  name: "promise_to_pay",
  terminalStates: ["kept", "superseded", "cancelled"],
  terminalOverridePolicy: "admin_manual_reopen",
  transitions: {
    detected_unconfirmed: ["accepted", "cancelled"],
    accepted: ["due_today", "superseded", "cancelled"],
    due_today: ["kept", "broken", "superseded"],
    kept: [],
    broken: ["accepted", "superseded"],
    superseded: [],
    cancelled: []
  },
  guards: {
    detected_unconfirmed: {
      accepted: [requiresFutureOrCurrentDate]
    },
    accepted: {
      superseded: [requiresOutcomeReason],
      cancelled: [requiresOutcomeReason]
    },
    due_today: {
      kept: [requiresOutcomeReason],
      broken: [requiresOutcomeReason],
      superseded: [requiresOutcomeReason]
    },
    broken: {
      accepted: [requiresFutureOrCurrentDate],
      superseded: [requiresOutcomeReason]
    }
  }
};

export class PromiseToPayTransitionService extends TransitionService<
  PromiseToPay,
  PromiseToPayState
> {
  constructor(
    auditHook?: TransitionAuditHook<PromiseToPayState>
  ) {
    super(promiseToPayStateMachine, auditHook);
  }
}
