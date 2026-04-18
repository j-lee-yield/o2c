import type { StatefulEntity } from "../../shared/state-machine.js";

export const promiseToPayStates = [
  "detected_unconfirmed",
  "accepted",
  "due_today",
  "kept",
  "broken",
  "superseded",
  "cancelled"
] as const;

export type PromiseToPayState = (typeof promiseToPayStates)[number];

export interface PromiseToPay extends StatefulEntity<PromiseToPayState> {
  parentAccountId: string;
  billingAccountId: string;
  contactId?: string;
  promisedAmountCents: number;
  currency: string;
  promiseDate: string;
  metadata: Record<string, unknown>;
}
