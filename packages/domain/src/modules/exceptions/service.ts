import { ExceptionTransitionService } from "./machine.js";
import { CollectionAutomationBlockedByExceptionError } from "./errors.js";
import { createEntityMetadata } from "../../shared/types.js";
import {
  createExceptionOwnerAssignment,
  createExceptionPlaybook,
  createExceptionSla,
  createExceptionWorkflowBlockers,
  defaultSummaryByKind,
  selectRecommendedNextAction,
} from "./playbooks.js";
import type {
  DomainException,
  ExceptionKind,
  ExceptionLikelyMatch,
  ExceptionWorkflowName,
} from "./schema.js";

export interface ExceptionCreationInput {
  id: string;
  entityType: string;
  entityId: string;
  kind: ExceptionKind;
  createdAt: string;
  severity?: DomainException["severity"];
  summary?: string;
  details?: string;
  metadata?: Record<string, unknown>;
}

export interface ExceptionTriageInput {
  actorId: string;
  actorRole: "ar_collector" | "ar_manager" | "controller" | "admin" | "system";
  hasPaymentEvidence?: boolean;
  paymentEvidenceType?: "proof_of_payment" | "remittance" | "bank_reference";
  requestedAdditionalProof?: boolean;
  searchBankData?: boolean;
  likelyMatches?: ExceptionLikelyMatch[];
  routeToCashApplicationReview?: boolean;
  notes?: string;
}

export class ExceptionCreationService {
  create(input: ExceptionCreationInput): DomainException {
    const playbook = createExceptionPlaybook(input.kind);

    return {
      id: input.id,
      ...createEntityMetadata({
        at: input.createdAt,
        actorId: "system_exception_creation",
        actorRole: "system"
      }),
      kind: input.kind,
      entityType: input.entityType,
      entityId: input.entityId,
      severity: input.severity ?? defaultSeverityByKind(input.kind),
      summary: input.summary ?? defaultSummaryByKind(input.kind),
      ...(input.details ? { details: input.details } : {}),
      owner: createExceptionOwnerAssignment(input.kind),
      sla: createExceptionSla({ kind: input.kind, createdAt: input.createdAt }),
      playbook,
      recommendedNextAction: selectRecommendedNextAction(playbook),
      workflowBlockers: createExceptionWorkflowBlockers({ kind: input.kind }),
      state: "open_new",
      metadata: {
        kind: input.kind,
        ...cloneJson(input.metadata ?? {}),
      },
    };
  }
}

export class ExceptionTriageService {
  private readonly transitions = new ExceptionTransitionService();

  triage(exception: DomainException, input: ExceptionTriageInput): DomainException {
    const targetState = selectTriageState(exception, input);
    const transitionContext = {
      actorId: input.actorId,
      actorRole: input.actorRole,
    } as const;
    const transitioned = advanceExceptionThroughTriage(
      this.transitions,
      exception,
      targetState,
      transitionContext
    );

    const playbook = createExceptionPlaybook(exception.kind);
    const likelyMatches = cloneJson(input.likelyMatches ?? []);
    const updatedMetadata = {
      ...transitioned.metadata,
      ...(input.paymentEvidenceType ? { paymentEvidenceType: input.paymentEvidenceType } : {}),
      paymentEvidencePresent: input.hasPaymentEvidence ?? false,
      ...(input.requestedAdditionalProof ? { proofRequestedAt: transitioned.updatedAt } : {}),
      ...(input.searchBankData ? { bankSearchStartedAt: transitioned.updatedAt } : {}),
      ...(likelyMatches.length > 0 ? { likelyMatches } : {}),
      ...(input.routeToCashApplicationReview ? { routeToCashApplicationReview: true } : {}),
      ...(input.notes ? { triageNotes: input.notes } : {}),
    };

    return {
      ...transitioned,
      owner: input.routeToCashApplicationReview
        ? {
            ownerRole: "ar_manager",
            queue: "cash_application_review",
            rationale: "Cash application review is required because safe matching is unresolved.",
          }
        : transitioned.owner,
      recommendedNextAction: determineRecommendedAction(playbook, input),
      metadata: updatedMetadata,
      updatedAt: transitioned.updatedAt,
    };
  }

  canResumeCollections(exception: DomainException, now: string): boolean {
    if (exception.kind !== "already_paid" && exception.kind !== "proof_remittance_received_not_matched") {
      return exception.state === "resolved" || exception.state === "dismissed";
    }

    if (exception.state === "resolved" || exception.state === "dismissed") {
      return true;
    }

    const evidencePresent = exception.metadata.paymentEvidencePresent === true;
    const policyWindowEndsAt = exception.sla.policyWindowEndsAt;
    if (evidencePresent || !policyWindowEndsAt) {
      return false;
    }

    return Date.parse(now) >= Date.parse(policyWindowEndsAt);
  }
}

function advanceExceptionThroughTriage(
  transitions: ExceptionTransitionService,
  exception: DomainException,
  targetState: DomainException["state"],
  context: { actorId: string; actorRole: ExceptionTriageInput["actorRole"] }
): DomainException {
  if (exception.state === targetState) {
    return exception;
  }

  if (exception.state === "open_new" && targetState !== "triaged") {
    const triaged = transitions.transition(exception, "triaged", context);
    return transitions.transition(triaged, targetState, context);
  }

  return transitions.transition(exception, targetState, context);
}

export function createTypedException(params: ExceptionCreationInput): DomainException {
  return new ExceptionCreationService().create(params);
}

export function assertNoWorkflowBlockers(params: {
  workflow: ExceptionWorkflowName;
  invoices: Array<{ id: string; billingAccountId?: string }>;
  exceptions?: DomainException[];
  now: string;
}): void {
  const invoiceIds = params.invoices.map((invoice) => invoice.id);
  const billingAccountIds = params.invoices
    .map((invoice) => invoice.billingAccountId)
    .filter((value): value is string => typeof value === "string");
  const triageService = new ExceptionTriageService();
  const blocking = (params.exceptions ?? []).find((exception) => {
    if (exception.state === "resolved" || exception.state === "dismissed") {
      return false;
    }

    const referencesInvoice = referencesAnyInvoice(exception, invoiceIds);
    const referencesBillingAccount =
      exception.entityType === "billing_account" &&
      billingAccountIds.includes(exception.entityId);

    if (!referencesInvoice && !referencesBillingAccount) {
      return false;
    }

    return exception.workflowBlockers.some((blocker) => {
      if (blocker.workflow !== params.workflow) {
        return false;
      }

      if (blocker.releaseMode === "manual_resolution") {
        return true;
      }

      return !triageService.canResumeCollections(exception, params.now);
    });
  });

  if (blocking) {
    throw new CollectionAutomationBlockedByExceptionError({
      exceptionId: blocking.id,
      exceptionKind: blocking.kind,
      invoiceIds,
    });
  }
}

function selectTriageState(exception: DomainException, input: ExceptionTriageInput): DomainException["state"] {
  if (input.routeToCashApplicationReview || input.searchBankData) {
    return "waiting_on_internal";
  }

  if (exception.kind === "already_paid" || exception.kind === "proof_remittance_received_not_matched") {
    return input.hasPaymentEvidence ? "waiting_on_internal" : "waiting_on_customer";
  }

  return "triaged";
}

function determineRecommendedAction(
  playbook: DomainException["playbook"],
  input: ExceptionTriageInput
): DomainException["recommendedNextAction"] {
  const fallbackAction = firstPlaybookStep(playbook);

  if (input.routeToCashApplicationReview) {
    return playbook.steps.find((step) => step.code === "route_cash_application_review") ?? fallbackAction;
  }

  if (input.searchBankData || (input.likelyMatches?.length ?? 0) > 0) {
    return playbook.steps.find((step) => step.code === "search_payment_ledgers") ?? fallbackAction;
  }

  return fallbackAction;
}

function referencesAnyInvoice(exception: DomainException, invoiceIds: string[]) {
  const referencedInvoiceIds = Array.isArray(exception.metadata.invoiceIds)
    ? exception.metadata.invoiceIds.filter((value): value is string => typeof value === "string")
    : [];

  return referencedInvoiceIds.some((invoiceId) => invoiceIds.includes(invoiceId));
}

function defaultSeverityByKind(kind: ExceptionKind): DomainException["severity"] {
  switch (kind) {
    case "strategic_account_escalation":
    case "erp_sync_inconsistency":
    case "duplicate_invoice_suspicion":
      return "critical";
    case "already_paid":
    case "proof_remittance_received_not_matched":
    case "full_dispute":
    case "unidentified_payer_unapplied_cash":
      return "high";
    case "partial_dispute":
    case "short_payment":
    case "overpayment":
    case "credit_memo_pending":
      return "medium";
    default:
      return "low";
  }
}

function firstPlaybookStep(
  playbook: DomainException["playbook"]
): DomainException["recommendedNextAction"] {
  const [firstStep] = playbook.steps;
  if (!firstStep) {
    throw new Error(`Exception playbook "${playbook.kind}" must define at least one step.`);
  }

  return firstStep;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
