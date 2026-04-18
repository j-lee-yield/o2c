import {
  TransitionError,
  TransitionService,
  type TransitionAuditHook,
  type TransitionContext,
  type StateMachineDefinition
} from "../../shared/state-machine.js";
import type { DomainException, ExceptionState } from "./schema.js";

const requiresSummary = (exception: DomainException): void => {
  if (!exception.summary.trim()) {
    throw new TransitionError("Exceptions require a summary.");
  }
};

const requiresResolutionReason = (
  _exception: DomainException,
  context: TransitionContext
): void => {
  if (!context.reason?.trim()) {
    throw new TransitionError("Resolving or dismissing an exception requires a reason.");
  }
};

export const exceptionStateMachine: StateMachineDefinition<DomainException, ExceptionState> = {
  name: "exception",
  terminalStates: ["resolved", "dismissed"],
  terminalOverridePolicy: "admin_manual_reopen",
  transitions: {
    open_new: ["triaged", "dismissed"],
    triaged: ["waiting_on_customer", "waiting_on_internal", "ready_for_resolution", "dismissed"],
    waiting_on_customer: ["ready_for_resolution", "dismissed"],
    waiting_on_internal: ["ready_for_resolution", "dismissed"],
    ready_for_resolution: ["resolved", "dismissed"],
    resolved: [],
    dismissed: []
  },
  guards: {
    open_new: {
      triaged: [requiresSummary],
      dismissed: [requiresResolutionReason]
    },
    triaged: {
      dismissed: [requiresResolutionReason]
    },
    waiting_on_customer: {
      dismissed: [requiresResolutionReason]
    },
    waiting_on_internal: {
      dismissed: [requiresResolutionReason]
    },
    ready_for_resolution: {
      resolved: [requiresResolutionReason],
      dismissed: [requiresResolutionReason]
    }
  }
};

export class ExceptionTransitionService extends TransitionService<
  DomainException,
  ExceptionState
> {
  constructor(
    auditHook?: TransitionAuditHook<ExceptionState>
  ) {
    super(exceptionStateMachine, auditHook);
  }
}
