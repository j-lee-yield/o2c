import type { Role } from "@o2c/auth";

import type {
  ExceptionKind,
  ExceptionOwnerAssignment,
  ExceptionPlaybook,
  ExceptionRecommendedAction,
  ExceptionSla,
  ExceptionWorkflowBlocker,
} from "./schema.js";

export function createExceptionPlaybook(kind: ExceptionKind): ExceptionPlaybook {
  switch (kind) {
    case "already_paid":
    case "proof_remittance_received_not_matched":
      return playbook(kind, true, [
        step(
          "collect_payment_evidence",
          "Collect payment evidence",
          "ar_collector",
          "Parse any proof or remittance received. If none was attached, request bank proof and the invoice references before continuing."
        ),
        step(
          "search_payment_ledgers",
          "Search payment and remittance ledgers",
          "ar_manager",
          "Search bank, unapplied cash, and remittance records for likely matches before any customer chase resumes."
        ),
        step(
          "route_cash_application_review",
          "Route to cash application review",
          "ar_manager",
          "Send likely matches or unresolved evidence to cash application review when a safe automatic match is not available."
        ),
        step(
          "resume_only_after_policy_window",
          "Resume only after policy window",
          "ar_collector",
          "Collections may resume only after the policy window expires and no supporting evidence emerges."
        ),
      ]);
    case "wrong_contact":
      return playbook(kind, true, [
        step(
          "source_verified_contact",
          "Source verified contact",
          "ar_collector",
          "Find a verified AP or treasury contact before any outbound reminder is sent."
        ),
      ]);
    case "invoice_not_received":
      return playbook(kind, true, [
        step(
          "resend_invoice_packet",
          "Resend invoice packet",
          "ar_collector",
          "Send the invoice copy and delivery references, then confirm the right recipient."
        ),
      ]);
    case "short_payment":
      return playbook(kind, true, [
        step(
          "reconcile_short_payment",
          "Reconcile short payment",
          "ar_manager",
          "Validate deductions, shortages, and remittance references before further collection action."
        ),
      ]);
    case "overpayment":
      return playbook(kind, true, [
        step(
          "review_overpayment",
          "Review overpayment",
          "ar_manager",
          "Review unapplied excess cash and decide whether to allocate, refund, or keep on account."
        ),
      ]);
    case "partial_dispute":
      return playbook(kind, true, [
        step(
          "split_disputed_balance",
          "Split disputed balance",
          "ar_manager",
          "Pause only the disputed amount and preserve the undisputed balance for controlled follow-up."
        ),
      ]);
    case "full_dispute":
      return playbook(kind, true, [
        step(
          "route_full_dispute",
          "Route full dispute",
          "ar_manager",
          "Pause all chase activity and route the invoice into dispute resolution with supporting evidence."
        ),
      ]);
    case "missing_supporting_docs":
      return playbook(kind, true, [
        step(
          "collect_supporting_docs",
          "Collect supporting documents",
          "ar_collector",
          "Gather the requested invoice support before any customer-facing follow-up resumes."
        ),
      ]);
    case "credit_memo_pending":
      return playbook(kind, true, [
        step(
          "track_credit_memo",
          "Track credit memo",
          "ar_manager",
          "Monitor the credit memo until ERP balance relief is posted."
        ),
      ]);
    case "promise_to_pay_follow_up":
      return playbook(kind, false, [
        step(
          "monitor_promised_date",
          "Monitor promised date",
          "ar_collector",
          "Follow the promise-to-pay schedule and escalate only if the promise is missed."
        ),
      ]);
    case "strategic_account_escalation":
      return playbook(kind, true, [
        step(
          "submit_strategic_review",
          "Submit strategic review",
          "controller",
          "Route the account history and proposed action through the strategic account control path."
        ),
      ]);
    case "erp_sync_inconsistency":
      return playbook(kind, true, [
        step(
          "reconcile_erp_sync",
          "Reconcile ERP sync",
          "controller",
          "Investigate the source-of-truth mismatch before customer balances are acted on."
        ),
      ]);
    case "duplicate_invoice_suspicion":
      return playbook(kind, true, [
        step(
          "review_duplicate_invoice",
          "Review duplicate invoice",
          "controller",
          "Confirm whether the invoice is duplicated before any chase or writeback proceeds."
        ),
      ]);
    case "unidentified_payer_unapplied_cash":
      return playbook(kind, true, [
        step(
          "identify_unapplied_cash",
          "Identify unapplied cash",
          "ar_manager",
          "Search payer references, statements, and remittances to identify the unapplied cash owner."
        ),
      ]);
  }
}

export function createExceptionOwnerAssignment(kind: ExceptionKind): ExceptionOwnerAssignment {
  switch (kind) {
    case "wrong_contact":
      return {
        ownerRole: "ar_collector",
        queue: "master_data",
        rationale: "Verified contact repair is needed before compliant outreach.",
      };
    case "already_paid":
    case "proof_remittance_received_not_matched":
    case "short_payment":
    case "overpayment":
    case "unidentified_payer_unapplied_cash":
      return {
        ownerRole: "ar_manager",
        queue: "cash_application_review",
        rationale: "Cash application review is required before balances can be trusted.",
      };
    case "partial_dispute":
    case "full_dispute":
    case "credit_memo_pending":
      return {
        ownerRole: "ar_manager",
        queue: "dispute_resolution",
        rationale: "Balance relief or dispute validation must complete before outreach resumes.",
      };
    case "strategic_account_escalation":
      return {
        ownerRole: "controller",
        queue: "strategic_controls",
        rationale: "Strategic accounts require tighter human control before action.",
      };
    case "erp_sync_inconsistency":
    case "duplicate_invoice_suspicion":
      return {
        ownerRole: "controller",
        queue: "integration_ops",
        rationale: "System-of-record inconsistencies require controlled investigation.",
      };
    case "invoice_not_received":
    case "missing_supporting_docs":
    case "promise_to_pay_follow_up":
      return {
        ownerRole: "ar_collector",
        queue: "collections_ops",
        rationale: "Collector follow-up can resolve the issue within standard controls.",
      };
  }
}

export function createExceptionSla(params: {
  kind: ExceptionKind;
  createdAt: string;
}): ExceptionSla {
  const triageHours = params.kind === "strategic_account_escalation" ? 4 : 8;
  const resolveHours = resolveHoursByKind(params.kind);
  const policyWindowHours =
    params.kind === "already_paid" || params.kind === "proof_remittance_received_not_matched"
      ? 72
      : undefined;

  return {
    triageByAt: addHours(params.createdAt, triageHours),
    resolveByAt: addHours(params.createdAt, resolveHours),
    ...(policyWindowHours !== undefined
      ? { policyWindowEndsAt: addHours(params.createdAt, policyWindowHours) }
      : {}),
  };
}

export function createExceptionWorkflowBlockers(params: {
  kind: ExceptionKind;
}): ExceptionWorkflowBlocker[] {
  switch (params.kind) {
    case "promise_to_pay_follow_up":
      return [];
    case "already_paid":
    case "proof_remittance_received_not_matched":
      return [
        {
          workflow: "collection_cadence",
          reason: "Payment claim or remittance evidence must be reconciled before collections continue.",
          releaseMode: "policy_window_if_no_evidence",
        },
      ];
    case "invoice_not_received":
    case "wrong_contact":
    case "short_payment":
    case "overpayment":
    case "partial_dispute":
    case "full_dispute":
    case "missing_supporting_docs":
    case "credit_memo_pending":
    case "strategic_account_escalation":
    case "erp_sync_inconsistency":
    case "duplicate_invoice_suspicion":
      return [
        {
          workflow: "collection_cadence",
          reason: "Unsafe collection action is paused until the exception is resolved.",
          releaseMode: "manual_resolution",
        },
      ];
    case "unidentified_payer_unapplied_cash":
      return [
        {
          workflow: "collection_cadence",
          reason: "Collections should pause while unapplied cash is identified.",
          releaseMode: "manual_resolution",
        },
        {
          workflow: "auto_cash_application",
          reason: "Automatic cash application is unsafe while the payer is not identified.",
          releaseMode: "manual_resolution",
        },
      ];
  }
}

export function defaultSummaryByKind(kind: ExceptionKind): string {
  switch (kind) {
    case "invoice_not_received":
      return "Customer reports the invoice was not received.";
    case "wrong_contact":
      return "Collections message reached the wrong or unverified contact.";
    case "already_paid":
      return "Customer claims the invoice was already paid.";
    case "proof_remittance_received_not_matched":
      return "Proof or remittance was received but the payment is not yet matched.";
    case "short_payment":
      return "Received payment is lower than the expected invoice balance.";
    case "overpayment":
      return "Received payment exceeds the referenced invoice balance.";
    case "partial_dispute":
      return "Customer disputes part of the invoice balance.";
    case "full_dispute":
      return "Customer disputes the full invoice balance.";
    case "missing_supporting_docs":
      return "Supporting documents are missing for safe customer follow-up.";
    case "credit_memo_pending":
      return "Credit memo is pending and the invoice balance is not yet relieved.";
    case "promise_to_pay_follow_up":
      return "Promise-to-pay requires follow-up monitoring.";
    case "strategic_account_escalation":
      return "Strategic account requires escalated review before collections action.";
    case "erp_sync_inconsistency":
      return "ERP or ledger data is inconsistent with the collections balance.";
    case "duplicate_invoice_suspicion":
      return "Possible duplicate invoice detected.";
    case "unidentified_payer_unapplied_cash":
      return "Incoming cash cannot yet be linked to a payer or invoice.";
  }
}

export function selectRecommendedNextAction(playbook: ExceptionPlaybook): ExceptionRecommendedAction {
  const [firstStep] = playbook.steps;
  if (!firstStep) {
    throw new Error(`Exception playbook "${playbook.kind}" must define at least one step.`);
  }

  return firstStep;
}

function playbook(
  kind: ExceptionKind,
  autoChaseBlocked: boolean,
  steps: ExceptionPlaybook["steps"]
): ExceptionPlaybook {
  return {
    kind,
    autoChaseBlocked,
    steps,
  };
}

function step(code: string, title: string, ownerRole: Role, instructions: string) {
  return { code, title, ownerRole, instructions };
}

function resolveHoursByKind(kind: ExceptionKind): number {
  switch (kind) {
    case "strategic_account_escalation":
    case "erp_sync_inconsistency":
    case "duplicate_invoice_suspicion":
      return 72;
    case "already_paid":
    case "proof_remittance_received_not_matched":
    case "short_payment":
    case "overpayment":
    case "unidentified_payer_unapplied_cash":
      return 48;
    case "partial_dispute":
    case "full_dispute":
    case "credit_memo_pending":
      return 120;
    default:
      return 24;
  }
}

function addHours(isoTimestamp: string, hours: number): string {
  return new Date(Date.parse(isoTimestamp) + hours * 60 * 60 * 1000).toISOString();
}
