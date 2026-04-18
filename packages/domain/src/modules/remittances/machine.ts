import {
  TransitionError,
  TransitionService,
  type TransitionAuditHook,
  type TransitionContext,
  type StateMachineDefinition
} from "../../shared/state-machine.js";
import type { Remittance, RemittanceState } from "./schema.js";

const requiresParsedPayload = (remittance: Remittance): void => {
  if (!remittance.rawPayload || Object.keys(remittance.rawPayload).length === 0) {
    throw new TransitionError("Structured remittances require parsed payload.");
  }
};

const requiresPaymentLinkFlag = (
  _remittance: Remittance,
  context: TransitionContext
): void => {
  if (context.metadata?.paymentLinked !== true) {
    throw new TransitionError("Linking a remittance to a payment requires paymentLinked metadata.");
  }
};

export const remittanceStateMachine: StateMachineDefinition<Remittance, RemittanceState> = {
  name: "remittance",
  terminalStates: ["resolved", "orphaned"],
  terminalOverridePolicy: "admin_manual_reopen",
  transitions: {
    received_unparsed: ["parsed_structured", "review_required", "orphaned"],
    parsed_structured: [
      "linked_to_payment",
      "linked_to_invoice_candidate",
      "review_required",
      "orphaned"
    ],
    linked_to_payment: ["resolved", "review_required"],
    linked_to_invoice_candidate: ["resolved", "review_required"],
    review_required: ["linked_to_payment", "linked_to_invoice_candidate", "resolved", "orphaned"],
    resolved: [],
    orphaned: []
  },
  guards: {
    received_unparsed: {
      parsed_structured: [requiresParsedPayload]
    },
    parsed_structured: {
      linked_to_payment: [requiresParsedPayload, requiresPaymentLinkFlag],
      linked_to_invoice_candidate: [requiresParsedPayload]
    },
    review_required: {
      linked_to_payment: [requiresPaymentLinkFlag]
    }
  }
};

export class RemittanceTransitionService extends TransitionService<Remittance, RemittanceState> {
  constructor(auditHook?: TransitionAuditHook<RemittanceState>) {
    super(remittanceStateMachine, auditHook);
  }
}
