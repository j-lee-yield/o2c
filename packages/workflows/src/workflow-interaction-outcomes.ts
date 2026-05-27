import type {
  ActorContext,
  CallOutcome,
  CallSession,
  CollectionReplyAnalysis,
  CommunicationMessage,
  ContactDeliveryStatus,
  ControlCenterStructuredOutcome,
  ControlCenterWorkflowExecution,
} from "@o2c/domain";
import type { EvaluateAndApplyDecisionResult } from "./adaptive-workflow.js";
import { AdaptiveWorkflowDecisionService } from "./adaptive-workflow.js";

export const workflowInteractionOutcomeTypes = [
  "paid",
  "promise_to_pay",
  "payment_in_process",
  "requested_invoice_copy",
  "dispute_billing",
  "dispute_service",
  "wrong_contact",
  "bad_phone",
  "bounce_or_invalid_email",
  "do_not_call",
  "email_only",
  "call_back_after_date",
  "legal_threat",
  "low_confidence",
  "no_meaningful_signal",
] as const;
export type WorkflowInteractionOutcomeType =
  (typeof workflowInteractionOutcomeTypes)[number];

export const workflowInteractionSourceTypes = [
  "call_outcome",
  "call_session",
  "communication_message",
  "delivery_status",
] as const;
export type WorkflowInteractionSourceType =
  (typeof workflowInteractionSourceTypes)[number];

export const workflowInteractionContactActions = [
  "none",
  "suppress_call_channel",
  "suppress_email_channel",
] as const;
export type WorkflowInteractionContactAction =
  (typeof workflowInteractionContactActions)[number];

export interface WorkflowInteractionOutcome {
  interactionKey: string;
  sourceType: WorkflowInteractionSourceType;
  sourceId: string;
  billingAccountId: string;
  contactId?: string;
  outcome: WorkflowInteractionOutcomeType;
  confidence: number;
  evidenceSummary: string;
  rationale: string;
  requiresHumanReview: boolean;
  recommendedContactAction: WorkflowInteractionContactAction;
  effectiveUntil?: string;
  metadata: Record<string, unknown>;
}

export interface ApplyWorkflowInteractionOutcomeInput {
  actor: ActorContext;
  asOf: string;
  execution: ControlCenterWorkflowExecution;
  normalizedOutcome: WorkflowInteractionOutcome;
}

export interface ApplyWorkflowInteractionOutcomeResult {
  skipped: boolean;
  normalizedOutcome: WorkflowInteractionOutcome;
  execution: ControlCenterWorkflowExecution;
  decisionResult?: EvaluateAndApplyDecisionResult;
}

export class WorkflowInteractionDecisionService {
  constructor(
    private readonly decisions: AdaptiveWorkflowDecisionService,
  ) {}

  applyNormalizedOutcome(
    input: ApplyWorkflowInteractionOutcomeInput,
  ): ApplyWorkflowInteractionOutcomeResult {
    const processedKeys = readProcessedInteractionKeys(input.execution.metadata);
    if (processedKeys.includes(input.normalizedOutcome.interactionKey)) {
      return {
        skipped: true,
        normalizedOutcome: input.normalizedOutcome,
        execution: input.execution,
      };
    }

    const structuredOutcome = toStructuredWorkflowOutcome(input.normalizedOutcome);
    const decisionResult = this.decisions.evaluateAndApply({
      actor: input.actor,
      execution: input.execution,
      outcomes: [structuredOutcome],
      asOf: input.asOf,
      metadata: {
        processedInteractionKeys: [...processedKeys, input.normalizedOutcome.interactionKey],
        lastInteractionKey: input.normalizedOutcome.interactionKey,
        lastInteractionOutcome: input.normalizedOutcome,
      },
    });

    return {
      skipped: false,
      normalizedOutcome: input.normalizedOutcome,
      execution: decisionResult.execution,
      decisionResult,
    };
  }

  applyCallSessionOutcome(input: {
    actor: ActorContext;
    asOf: string;
    execution: ControlCenterWorkflowExecution;
    callSession: CallSession;
  }): ApplyWorkflowInteractionOutcomeResult {
    return this.applyNormalizedOutcome({
      actor: input.actor,
      asOf: input.asOf,
      execution: input.execution,
      normalizedOutcome: normalizeWorkflowOutcomeFromCallSession(input.callSession),
    });
  }

  applyMessageOutcome(input: {
    actor: ActorContext;
    asOf: string;
    execution: ControlCenterWorkflowExecution;
    message: CommunicationMessage;
  }): ApplyWorkflowInteractionOutcomeResult {
    return this.applyNormalizedOutcome({
      actor: input.actor,
      asOf: input.asOf,
      execution: input.execution,
      normalizedOutcome: normalizeWorkflowOutcomeFromCommunicationMessage(input.message),
    });
  }

  applyDeliveryStatusOutcome(input: {
    actor: ActorContext;
    asOf: string;
    execution: ControlCenterWorkflowExecution;
    status: ContactDeliveryStatus;
  }): ApplyWorkflowInteractionOutcomeResult {
    return this.applyNormalizedOutcome({
      actor: input.actor,
      asOf: input.asOf,
      execution: input.execution,
      normalizedOutcome: normalizeWorkflowOutcomeFromDeliveryStatus(input.status),
    });
  }
}

export function normalizeWorkflowOutcomeFromCallOutcome(input: {
  sourceId: string;
  billingAccountId: string;
  contactId?: string;
  outcome: Pick<
    CallOutcome,
    | "disposition"
    | "operatorReviewRequired"
    | "promisedAmountCents"
    | "promisedDate"
    | "transcriptSummary"
    | "transcriptSegments"
    | "metadata"
    | "occurredAt"
  >;
}): WorkflowInteractionOutcome {
  const transcriptText = buildTranscriptText({
    summary: input.outcome.transcriptSummary,
    segments: input.outcome.transcriptSegments,
  });
  const lowerText = transcriptText.toLowerCase();
  const interactionKey = `call_outcome:${input.sourceId}`;

  if (hasLegalThreat(lowerText)) {
    return buildWorkflowInteractionOutcome({
      interactionKey,
      sourceType: "call_outcome",
      sourceId: input.sourceId,
      billingAccountId: input.billingAccountId,
      contactId: input.contactId,
      outcome: "legal_threat",
      confidence: 0.99,
      evidenceSummary: pickEvidenceSnippet(transcriptText, ["lawyer", "legal", "sue", "court"]),
      rationale: "The transcript contains explicit legal escalation language.",
      requiresHumanReview: true,
      recommendedContactAction: "none",
      metadata: { callDisposition: input.outcome.disposition },
    });
  }

  if (hasDoNotCall(lowerText)) {
    return buildWorkflowInteractionOutcome({
      interactionKey,
      sourceType: "call_outcome",
      sourceId: input.sourceId,
      billingAccountId: input.billingAccountId,
      contactId: input.contactId,
      outcome: "do_not_call",
      confidence: 0.99,
      evidenceSummary: pickEvidenceSnippet(transcriptText, ["do not call", "stop calling", "remove this number"]),
      rationale: "The customer explicitly revoked permission for further call outreach.",
      requiresHumanReview: false,
      recommendedContactAction: "suppress_call_channel",
      metadata: { callDisposition: input.outcome.disposition },
    });
  }

  if (input.outcome.disposition === "wrong_contact" || hasWrongContact(lowerText)) {
    return buildWorkflowInteractionOutcome({
      interactionKey,
      sourceType: "call_outcome",
      sourceId: input.sourceId,
      billingAccountId: input.billingAccountId,
      contactId: input.contactId,
      outcome: "wrong_contact",
      confidence: 0.98,
      evidenceSummary: pickEvidenceSnippet(transcriptText, ["wrong contact", "wrong person", "not the right contact"]),
      rationale: "The call reached the wrong party and the current call channel should be suppressed for this contact.",
      requiresHumanReview: false,
      recommendedContactAction: "suppress_call_channel",
      metadata: { callDisposition: input.outcome.disposition },
    });
  }

  if (hasBadPhone(lowerText)) {
    return buildWorkflowInteractionOutcome({
      interactionKey,
      sourceType: "call_outcome",
      sourceId: input.sourceId,
      billingAccountId: input.billingAccountId,
      contactId: input.contactId,
      outcome: "bad_phone",
      confidence: 0.97,
      evidenceSummary: pickEvidenceSnippet(transcriptText, ["wrong number", "invalid number", "disconnected", "out of service"]),
      rationale: "The phone number appears invalid or unusable for future call attempts.",
      requiresHumanReview: false,
      recommendedContactAction: "suppress_call_channel",
      metadata: { callDisposition: input.outcome.disposition },
    });
  }

  if (hasEmailOnly(lowerText)) {
    return buildWorkflowInteractionOutcome({
      interactionKey,
      sourceType: "call_outcome",
      sourceId: input.sourceId,
      billingAccountId: input.billingAccountId,
      contactId: input.contactId,
      outcome: "email_only",
      confidence: 0.95,
      evidenceSummary: pickEvidenceSnippet(transcriptText, ["email", "send it by email", "email me"]),
      rationale: "The customer prefers future outreach through email instead of calls.",
      requiresHumanReview: false,
      recommendedContactAction: "suppress_call_channel",
      metadata: { callDisposition: input.outcome.disposition },
    });
  }

  const callbackAt = readExplicitDate(lowerText);
  if (input.outcome.disposition === "callback_requested" || hasCallbackRequest(lowerText)) {
    return buildWorkflowInteractionOutcome({
      interactionKey,
      sourceType: "call_outcome",
      sourceId: input.sourceId,
      billingAccountId: input.billingAccountId,
      contactId: input.contactId,
      outcome: "call_back_after_date",
      confidence: callbackAt ? 0.9 : 0.78,
      evidenceSummary: pickEvidenceSnippet(transcriptText, ["call back", "callback", "after"]),
      rationale: "The customer requested a later callback time, so the workflow should pause until then.",
      requiresHumanReview: false,
      recommendedContactAction: "none",
      ...(callbackAt ? { effectiveUntil: callbackAt } : {}),
      metadata: {
        callDisposition: input.outcome.disposition,
        ...(callbackAt ? { callbackAt } : {}),
      },
    });
  }

  if (hasServiceDispute(lowerText)) {
    return buildWorkflowInteractionOutcome({
      interactionKey,
      sourceType: "call_outcome",
      sourceId: input.sourceId,
      billingAccountId: input.billingAccountId,
      contactId: input.contactId,
      outcome: "dispute_service",
      confidence: 0.92,
      evidenceSummary: pickEvidenceSnippet(transcriptText, ["not delivered", "damaged", "service issue", "quality issue"]),
      rationale: "The customer raised a service or fulfillment dispute that should escalate for review.",
      requiresHumanReview: true,
      recommendedContactAction: "none",
      metadata: { callDisposition: input.outcome.disposition },
    });
  }

  if (hasBillingDispute(lowerText)) {
    return buildWorkflowInteractionOutcome({
      interactionKey,
      sourceType: "call_outcome",
      sourceId: input.sourceId,
      billingAccountId: input.billingAccountId,
      contactId: input.contactId,
      outcome: "dispute_billing",
      confidence: 0.92,
      evidenceSummary: pickEvidenceSnippet(transcriptText, ["wrong amount", "incorrect invoice", "billing issue", "credit memo"]),
      rationale: "The customer raised a billing dispute that should escalate for review.",
      requiresHumanReview: true,
      recommendedContactAction: "none",
      metadata: { callDisposition: input.outcome.disposition },
    });
  }

  if (hasRequestedInvoiceCopy(lowerText)) {
    return buildWorkflowInteractionOutcome({
      interactionKey,
      sourceType: "call_outcome",
      sourceId: input.sourceId,
      billingAccountId: input.billingAccountId,
      contactId: input.contactId,
      outcome: "requested_invoice_copy",
      confidence: 0.9,
      evidenceSummary: pickEvidenceSnippet(transcriptText, ["invoice", "copy", "statement", "resend"]),
      rationale: "The customer asked for an invoice copy or supporting documents.",
      requiresHumanReview: false,
      recommendedContactAction: "none",
      metadata: { callDisposition: input.outcome.disposition },
    });
  }

  if (input.outcome.promisedDate || input.outcome.promisedAmountCents !== undefined || hasPromiseToPay(lowerText)) {
    return buildWorkflowInteractionOutcome({
      interactionKey,
      sourceType: "call_outcome",
      sourceId: input.sourceId,
      billingAccountId: input.billingAccountId,
      contactId: input.contactId,
      outcome: "promise_to_pay",
      confidence: input.outcome.promisedDate ? 0.93 : 0.84,
      evidenceSummary: input.outcome.promisedDate
        ? `Promise captured for ${input.outcome.promisedDate}.`
        : pickEvidenceSnippet(transcriptText, ["pay on", "will pay", "promise", "settle"]),
      rationale: "The interaction contains a payment commitment that should move the workflow to PTP follow-up.",
      requiresHumanReview: false,
      recommendedContactAction: "none",
      metadata: {
        callDisposition: input.outcome.disposition,
        ...(input.outcome.promisedDate ? { promisedDate: input.outcome.promisedDate } : {}),
        ...(input.outcome.promisedAmountCents !== undefined
          ? { promisedAmountCents: input.outcome.promisedAmountCents }
          : {}),
      },
    });
  }

  if (hasPaymentInProcess(lowerText)) {
    return buildWorkflowInteractionOutcome({
      interactionKey,
      sourceType: "call_outcome",
      sourceId: input.sourceId,
      billingAccountId: input.billingAccountId,
      contactId: input.contactId,
      outcome: "payment_in_process",
      confidence: 0.87,
      evidenceSummary: pickEvidenceSnippet(transcriptText, ["processing", "for approval", "payment is on the way"]),
      rationale: "The customer indicated that payment is already moving internally.",
      requiresHumanReview: false,
      recommendedContactAction: "none",
      metadata: { callDisposition: input.outcome.disposition },
    });
  }

  if (input.outcome.operatorReviewRequired || isAmbiguousSignal(lowerText)) {
    return buildWorkflowInteractionOutcome({
      interactionKey,
      sourceType: "call_outcome",
      sourceId: input.sourceId,
      billingAccountId: input.billingAccountId,
      contactId: input.contactId,
      outcome: "low_confidence",
      confidence: 0.35,
      evidenceSummary: transcriptText.length > 0 ? transcriptText.slice(0, 160) : "Transcript did not contain a clear workflow signal.",
      rationale: "The transcript did not contain a confident actionable signal and should be reviewed by a human.",
      requiresHumanReview: true,
      recommendedContactAction: "none",
      metadata: { callDisposition: input.outcome.disposition },
    });
  }

  return buildWorkflowInteractionOutcome({
    interactionKey,
    sourceType: "call_outcome",
    sourceId: input.sourceId,
    billingAccountId: input.billingAccountId,
    contactId: input.contactId,
    outcome: "no_meaningful_signal",
    confidence: 0.62,
    evidenceSummary: "No workflow-changing signal was detected in the call outcome.",
    rationale: "The call does not require a workflow change.",
    requiresHumanReview: false,
    recommendedContactAction: "none",
    metadata: { callDisposition: input.outcome.disposition },
  });
}

export function normalizeWorkflowOutcomeFromCallSession(
  callSession: CallSession,
): WorkflowInteractionOutcome {
  const existing = readPersistedWorkflowOutcome(callSession.metadata);
  if (existing) {
    return existing;
  }

  return normalizeWorkflowOutcomeFromCallOutcome({
    sourceId: callSession.id,
    billingAccountId: callSession.billingAccountId,
    ...(callSession.contactId ? { contactId: callSession.contactId } : {}),
    outcome: {
      disposition: callSession.disposition,
      operatorReviewRequired: callSession.operatorReviewRequired,
      transcriptSummary: callSession.transcriptSummary,
      transcriptSegments: callSession.transcriptSegments,
      metadata: callSession.metadata,
      occurredAt: callSession.startedAt,
    },
  });
}

export function normalizeWorkflowOutcomeFromReplyAnalysis(input: {
  sourceId: string;
  billingAccountId: string;
  contactId?: string;
  analysis: CollectionReplyAnalysis;
  bodyText?: string;
}): WorkflowInteractionOutcome {
  const lowerText = (input.bodyText ?? "").toLowerCase();
  const interactionKey = `communication_message:${input.sourceId}`;

  switch (input.analysis.classification) {
    case "promise_to_pay":
      return buildWorkflowInteractionOutcome({
        interactionKey,
        sourceType: "communication_message",
        sourceId: input.sourceId,
        billingAccountId: input.billingAccountId,
        contactId: input.contactId,
        outcome: "promise_to_pay",
        confidence: input.analysis.confidence,
        evidenceSummary:
          input.analysis.extractedPromiseDate
            ? `Promise captured for ${input.analysis.extractedPromiseDate}.`
            : "The customer committed to paying in a follow-up reply.",
        rationale: "Existing reply classification already detected a promise to pay.",
        requiresHumanReview: input.analysis.requiresHumanReview,
        recommendedContactAction: "none",
        metadata: {
          replyClassification: input.analysis.classification,
          reasons: input.analysis.reasons,
          ...(input.analysis.extractedPromiseDate
            ? { promisedDate: input.analysis.extractedPromiseDate }
            : {}),
          ...(input.analysis.extractedAmountCents !== undefined
            ? { promisedAmountCents: input.analysis.extractedAmountCents }
            : {}),
        },
      });
    case "invoice_not_received":
    case "request_for_docs":
      return buildWorkflowInteractionOutcome({
        interactionKey,
        sourceType: "communication_message",
        sourceId: input.sourceId,
        billingAccountId: input.billingAccountId,
        contactId: input.contactId,
        outcome: "requested_invoice_copy",
        confidence: input.analysis.confidence,
        evidenceSummary: "The customer asked for an invoice copy or supporting documents.",
        rationale: "Existing reply classification already detected a document resend request.",
        requiresHumanReview: false,
        recommendedContactAction: "none",
        metadata: {
          replyClassification: input.analysis.classification,
          requestedDocumentTypes: input.analysis.requestedDocumentTypes,
        },
      });
    case "wrong_contact":
      return buildWorkflowInteractionOutcome({
        interactionKey,
        sourceType: "communication_message",
        sourceId: input.sourceId,
        billingAccountId: input.billingAccountId,
        contactId: input.contactId,
        outcome: "wrong_contact",
        confidence: input.analysis.confidence,
        evidenceSummary: "The sender said they are not the correct contact for this account.",
        rationale: "The reply indicates the current contact channel should be suppressed rather than opting the account out.",
        requiresHumanReview: false,
        recommendedContactAction: "suppress_email_channel",
        metadata: {
          replyClassification: input.analysis.classification,
          reasons: input.analysis.reasons,
        },
      });
    case "partial_dispute":
    case "full_dispute":
      return buildWorkflowInteractionOutcome({
        interactionKey,
        sourceType: "communication_message",
        sourceId: input.sourceId,
        billingAccountId: input.billingAccountId,
        contactId: input.contactId,
        outcome: hasServiceDispute(lowerText) ? "dispute_service" : "dispute_billing",
        confidence: input.analysis.confidence,
        evidenceSummary: "The customer raised a dispute that needs controlled resolution.",
        rationale: "The reply dispute classification should escalate the workflow for review.",
        requiresHumanReview: true,
        recommendedContactAction: "none",
        metadata: {
          replyClassification: input.analysis.classification,
          reasons: input.analysis.reasons,
        },
      });
    case "already_paid":
    case "remittance_advice":
      return buildWorkflowInteractionOutcome({
        interactionKey,
        sourceType: "communication_message",
        sourceId: input.sourceId,
        billingAccountId: input.billingAccountId,
        contactId: input.contactId,
        outcome: "paid",
        confidence: input.analysis.confidence,
        evidenceSummary: "The customer reported that payment was already made or remittance was sent.",
        rationale: "The reply contains a payment resolution signal that should pause further chase activity.",
        requiresHumanReview: true,
        recommendedContactAction: "none",
        metadata: {
          replyClassification: input.analysis.classification,
          reasons: input.analysis.reasons,
        },
      });
    default:
      if (input.analysis.requiresHumanReview && input.analysis.confidence < 0.7) {
        return buildWorkflowInteractionOutcome({
          interactionKey,
          sourceType: "communication_message",
          sourceId: input.sourceId,
          billingAccountId: input.billingAccountId,
          contactId: input.contactId,
          outcome: "low_confidence",
          confidence: input.analysis.confidence,
          evidenceSummary: "The reply classification was too uncertain for autonomous action.",
          rationale: "Low-confidence reply analysis should escalate for human review.",
          requiresHumanReview: true,
          recommendedContactAction: "none",
          metadata: {
            replyClassification: input.analysis.classification,
            reasons: input.analysis.reasons,
          },
        });
      }

      return buildWorkflowInteractionOutcome({
        interactionKey,
        sourceType: "communication_message",
        sourceId: input.sourceId,
        billingAccountId: input.billingAccountId,
        contactId: input.contactId,
        outcome: "no_meaningful_signal",
        confidence: input.analysis.confidence,
        evidenceSummary: "The email reply did not contain a workflow-changing signal.",
        rationale: "The current workflow can continue unchanged.",
        requiresHumanReview: false,
        recommendedContactAction: "none",
        metadata: {
          replyClassification: input.analysis.classification,
          reasons: input.analysis.reasons,
        },
      });
  }
}

export function normalizeWorkflowOutcomeFromCommunicationMessage(
  message: CommunicationMessage,
): WorkflowInteractionOutcome {
  const existing = readPersistedWorkflowOutcome(message.metadata);
  if (existing) {
    return existing;
  }

  return normalizeWorkflowOutcomeFromReplyAnalysis({
    sourceId: message.id,
    billingAccountId: message.billingAccountId,
    ...(message.contactId ? { contactId: message.contactId } : {}),
    analysis:
      message.replyAnalysis ?? {
        classification: "generic_no_action_reply",
        confidence: 0.5,
        requiresHumanReview: false,
        reasons: ["message_without_reply_analysis"],
        invoices: [],
        requestedDocumentTypes: [],
      },
    bodyText: message.bodyText,
  });
}

export function normalizeWorkflowOutcomeFromDeliveryStatus(
  status: ContactDeliveryStatus,
): WorkflowInteractionOutcome {
  const existing = readPersistedWorkflowOutcome(status.metadata);
  if (existing) {
    return existing;
  }

  return buildWorkflowInteractionOutcome({
    interactionKey: `delivery_status:${status.id}`,
    sourceType: "delivery_status",
    sourceId: status.id,
    billingAccountId: status.billingAccountId,
    ...(status.contactId ? { contactId: status.contactId } : {}),
    outcome: "bounce_or_invalid_email",
    confidence: status.state === "invalid" ? 0.98 : 0.95,
    evidenceSummary:
      status.lastBounceReason ??
      (status.state === "invalid"
        ? "The email destination is invalid."
        : "The latest email attempt bounced."),
    rationale: "The current email destination should be suppressed until the contact is repaired.",
    requiresHumanReview: false,
    recommendedContactAction: "suppress_email_channel",
    metadata: {
      deliveryState: status.state,
      ...(status.lastBounceReason ? { lastBounceReason: status.lastBounceReason } : {}),
    },
  });
}

export function toStructuredWorkflowOutcome(
  normalized: WorkflowInteractionOutcome,
): ControlCenterStructuredOutcome {
  switch (normalized.outcome) {
    case "paid":
      return buildStructuredOutcome("paid", normalized);
    case "promise_to_pay":
      return buildStructuredOutcome("promise_to_pay", normalized);
    case "payment_in_process":
      return buildStructuredOutcome("payment_in_process", normalized);
    case "requested_invoice_copy":
      return buildStructuredOutcome("resend_requested", normalized);
    case "dispute_billing":
    case "dispute_service":
      return buildStructuredOutcome("dispute", normalized);
    case "wrong_contact":
      return buildStructuredOutcome("wrong_contact", normalized);
    case "bad_phone":
      return buildStructuredOutcome("invalid_number", normalized);
    case "bounce_or_invalid_email":
      return buildStructuredOutcome("bounced_email", normalized);
    case "do_not_call":
      return buildStructuredOutcome("do_not_call", normalized);
    case "email_only":
      return buildStructuredOutcome("email_only", normalized);
    case "call_back_after_date":
      return buildStructuredOutcome("call_back_after_date", normalized);
    case "legal_threat":
      return buildStructuredOutcome("legal_risk", normalized);
    case "low_confidence":
      return buildStructuredOutcome("low_confidence", normalized);
    case "no_meaningful_signal":
    default:
      return buildStructuredOutcome("no_response", normalized);
  }
}

function buildStructuredOutcome(
  outcome: ControlCenterStructuredOutcome["outcome"],
  normalized: WorkflowInteractionOutcome,
): ControlCenterStructuredOutcome {
  return {
    outcome,
    confidence: normalized.confidence,
    evidenceSummary: normalized.evidenceSummary,
    metadata: {
      sourceType: normalized.sourceType,
      sourceId: normalized.sourceId,
      interactionKey: normalized.interactionKey,
      normalizedOutcome: normalized.outcome,
      recommendedContactAction: normalized.recommendedContactAction,
      rationale: normalized.rationale,
      ...(normalized.effectiveUntil ? { effectiveUntil: normalized.effectiveUntil } : {}),
      ...normalized.metadata,
    },
  };
}

function buildWorkflowInteractionOutcome(
  input: WorkflowInteractionOutcome,
): WorkflowInteractionOutcome {
  return {
    ...input,
    confidence: clampConfidence(input.confidence),
    metadata: { ...input.metadata },
  };
}

function buildTranscriptText(input: {
  summary?: string;
  segments?: Array<{ text: string }>;
}) {
  return [input.summary, ...(input.segments ?? []).map((segment) => segment.text)]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
}

function readPersistedWorkflowOutcome(
  metadata: Record<string, unknown>,
): WorkflowInteractionOutcome | undefined {
  const value = metadata.workflowOutcome;
  return isWorkflowInteractionOutcome(value) ? value : undefined;
}

function isWorkflowInteractionOutcome(value: unknown): value is WorkflowInteractionOutcome {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<WorkflowInteractionOutcome>;
  return (
    typeof candidate.interactionKey === "string" &&
    typeof candidate.sourceType === "string" &&
    typeof candidate.sourceId === "string" &&
    typeof candidate.billingAccountId === "string" &&
    typeof candidate.outcome === "string" &&
    typeof candidate.confidence === "number" &&
    typeof candidate.evidenceSummary === "string" &&
    typeof candidate.rationale === "string" &&
    typeof candidate.requiresHumanReview === "boolean" &&
    typeof candidate.recommendedContactAction === "string" &&
    Boolean(candidate.metadata && typeof candidate.metadata === "object")
  );
}

function readProcessedInteractionKeys(metadata: Record<string, unknown>) {
  const value = metadata.processedInteractionKeys;
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, value));
}

function pickEvidenceSnippet(text: string, phrases: string[]) {
  const lower = text.toLowerCase();
  for (const phrase of phrases) {
    const index = lower.indexOf(phrase);
    if (index >= 0) {
      return text.slice(Math.max(0, index - 20), Math.min(text.length, index + 120)).trim();
    }
  }
  return text.slice(0, 160).trim() || "No transcript evidence was available.";
}

function readExplicitDate(text: string): string | undefined {
  const isoMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (isoMatch) {
    return `${isoMatch}T00:00:00.000Z`;
  }

  const slashMatch = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (!slashMatch) {
    return undefined;
  }

  const [, month, day, year] = slashMatch;
  if (!month || !day || !year) {
    return undefined;
  }

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`;
}

function hasPromiseToPay(text: string) {
  return /\b(promise|commit|will pay|pay on|settle on|payment on)\b/.test(text);
}

function hasPaymentInProcess(text: string) {
  return /\b(payment in process|processing payment|for approval|bank processing|payment is on the way|payment queued)\b/.test(text);
}

function hasRequestedInvoiceCopy(text: string) {
  return /\b(resend|invoice copy|copy of invoice|statement of account|soa|send the invoice|supporting docs|documents)\b/.test(text);
}

function hasBillingDispute(text: string) {
  return /\b(wrong amount|incorrect invoice|billing issue|credit memo|pricing issue|invoice is incorrect|bill is wrong)\b/.test(text);
}

function hasServiceDispute(text: string) {
  return /\b(not delivered|service issue|damaged|quality issue|short shipped|missing items|delivery problem)\b/.test(text);
}

function hasWrongContact(text: string) {
  return /\b(wrong contact|wrong person|not the right contact|i do not handle this)\b/.test(text);
}

function hasBadPhone(text: string) {
  return /\b(wrong number|invalid number|disconnected|out of service|cannot be reached)\b/.test(text);
}

function hasDoNotCall(text: string) {
  return /\b(do not call|don't call|stop calling|remove this number|no more calls)\b/.test(text);
}

function hasEmailOnly(text: string) {
  return /\b(email only|send it by email|email me instead|use email)\b/.test(text);
}

function hasCallbackRequest(text: string) {
  return /\b(call back|callback|call me back)\b/.test(text);
}

function hasLegalThreat(text: string) {
  return /\b(lawyer|legal action|sue|court|attorney)\b/.test(text);
}

function isAmbiguousSignal(text: string) {
  return text.length > 0 && text.length < 40;
}
