import type { StatefulEntity } from "../../shared/state-machine.js";

export const remittanceStates = [
  "received_unparsed",
  "parsed_structured",
  "linked_to_payment",
  "linked_to_invoice_candidate",
  "review_required",
  "resolved",
  "orphaned"
] as const;

export type RemittanceState = (typeof remittanceStates)[number];

export interface Remittance extends StatefulEntity<RemittanceState> {
  uploadedDocumentId?: string;
  paymentId?: string;
  sourceChannel: "email" | "edi" | "portal" | "api";
  rawPayload?: Record<string, unknown>;
  metadata: Record<string, unknown>;
}
