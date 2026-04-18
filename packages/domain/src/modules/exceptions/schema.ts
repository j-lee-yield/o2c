import type { Role } from "@o2c/auth";
import type { StatefulEntity } from "../../shared/state-machine.js";

export const exceptionStates = [
  "open_new",
  "triaged",
  "waiting_on_customer",
  "waiting_on_internal",
  "ready_for_resolution",
  "resolved",
  "dismissed"
] as const;

export type ExceptionState = (typeof exceptionStates)[number];

export const exceptionKinds = [
  "invoice_not_received",
  "wrong_contact",
  "already_paid",
  "proof_remittance_received_not_matched",
  "short_payment",
  "overpayment",
  "partial_dispute",
  "full_dispute",
  "missing_supporting_docs",
  "credit_memo_pending",
  "promise_to_pay_follow_up",
  "strategic_account_escalation",
  "erp_sync_inconsistency",
  "duplicate_invoice_suspicion",
  "unidentified_payer_unapplied_cash",
] as const;

export type ExceptionKind = (typeof exceptionKinds)[number];

export const exceptionQueues = [
  "collections_ops",
  "cash_application_review",
  "dispute_resolution",
  "master_data",
  "strategic_controls",
  "integration_ops",
] as const;

export type ExceptionQueue = (typeof exceptionQueues)[number];

export const exceptionWorkflowNames = [
  "collection_cadence",
  "auto_cash_application",
  "auto_statement_resend",
  "erp_writeback",
] as const;

export type ExceptionWorkflowName = (typeof exceptionWorkflowNames)[number];

export interface ExceptionOwnerAssignment {
  ownerRole: Role;
  queue: ExceptionQueue;
  rationale: string;
}

export interface ExceptionSla {
  triageByAt: string;
  resolveByAt: string;
  policyWindowEndsAt?: string;
}

export interface ExceptionPlaybookStep {
  code: string;
  title: string;
  ownerRole: Role;
  instructions: string;
}

export interface ExceptionPlaybook {
  kind: ExceptionKind;
  autoChaseBlocked: boolean;
  steps: ExceptionPlaybookStep[];
}

export interface ExceptionRecommendedAction extends ExceptionPlaybookStep {}

export interface ExceptionWorkflowBlocker {
  workflow: ExceptionWorkflowName;
  reason: string;
  releaseMode: "manual_resolution" | "policy_window_if_no_evidence";
}

export interface ExceptionLikelyMatch {
  paymentId?: string;
  remittanceId?: string;
  invoiceId?: string;
  confidence: number;
  rationale: string;
}

export interface DomainException extends StatefulEntity<ExceptionState> {
  kind: ExceptionKind;
  entityType: string;
  entityId: string;
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  details?: string;
  owner: ExceptionOwnerAssignment;
  sla: ExceptionSla;
  playbook: ExceptionPlaybook;
  recommendedNextAction: ExceptionRecommendedAction;
  workflowBlockers: ExceptionWorkflowBlocker[];
  metadata: Record<string, unknown>;
}
