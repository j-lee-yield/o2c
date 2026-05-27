import { describe, expect, it } from "vitest";
import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import type { ActorContext, Contact } from "@o2c/domain";
import { makeBillingAccount } from "@o2c/testkit";
import {
  AdaptiveWorkflowDecisionService,
  InMemoryWorkflowExecutionRepository,
} from "./adaptive-workflow.js";
import { CollectionsWorkspaceService } from "./collections-workspace.js";
import {
  WorkflowInteractionDecisionService,
  normalizeWorkflowOutcomeFromCallOutcome,
  normalizeWorkflowOutcomeFromCommunicationMessage,
} from "./workflow-interaction-outcomes.js";

const actor: ActorContext = {
  actorId: "system_policy",
  actorRole: "system",
};

function createContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "contact_1",
    parentAccountId: "parent_1",
    billingAccountId: "billing_1",
    scope: "billing_account",
    scopeId: "billing_1",
    fullName: "AP Contact",
    email: "ap@example.com",
    phoneNumber: "+63 917 555 0100",
    role: "ap",
    isPrimary: true,
    isVerified: true,
    allowAutoSend: true,
    recentSuccessfulResponses: 3,
    metadata: {},
    createdAt: "2026-04-08T00:00:00.000Z",
    updatedAt: "2026-04-08T00:00:00.000Z",
    ...overrides,
  };
}

function createIntegrationFixture() {
  const activityStore = new InMemoryImmutableActivityLogStore();
  const repository = new InMemoryWorkflowExecutionRepository();
  let idCounter = 0;
  const decisions = new AdaptiveWorkflowDecisionService({
    activityStore,
    repository,
    now: () => "2026-04-20T09:00:00.000Z",
    idGenerator: (prefix) => `${prefix}_${++idCounter}`,
  });
  const interactions = new WorkflowInteractionDecisionService(decisions);
  const execution = decisions.createExecution({
    actor,
    tenantId: "default",
    workflowId: "workflow_1",
    billingAccountId: "billing_1",
    parentAccountId: "parent_1",
  });

  return { decisions, interactions, execution, activityStore };
}

describe("workflow interaction normalization", () => {
  it("normalizes a clear promise-to-pay from a call transcript", () => {
    const normalized = normalizeWorkflowOutcomeFromCallOutcome({
      sourceId: "call_1",
      billingAccountId: "billing_1",
      contactId: "contact_1",
      outcome: {
        disposition: "connected",
        operatorReviewRequired: false,
        promisedDate: "2026-04-25",
        transcriptSummary: "We will pay on 2026-04-25 once treasury releases the funds.",
        transcriptSegments: [
          { speaker: "customer", text: "We will pay on 2026-04-25 once treasury releases the funds." },
        ],
        metadata: {},
        occurredAt: "2026-04-20T09:00:00.000Z",
      },
    });

    expect(normalized.outcome).toBe("promise_to_pay");
    expect(normalized.confidence).toBeGreaterThan(0.9);
  });

  it("normalizes an explicit do-not-call request and recommends call suppression", () => {
    const normalized = normalizeWorkflowOutcomeFromCallOutcome({
      sourceId: "call_2",
      billingAccountId: "billing_1",
      contactId: "contact_1",
      outcome: {
        disposition: "connected",
        operatorReviewRequired: false,
        transcriptSummary: "Do not call this number again. Send everything by email.",
        transcriptSegments: [
          { speaker: "customer", text: "Do not call this number again. Send everything by email." },
        ],
        metadata: {},
        occurredAt: "2026-04-20T09:00:00.000Z",
      },
    });

    expect(normalized.outcome).toBe("do_not_call");
    expect(normalized.recommendedContactAction).toBe("suppress_call_channel");
  });
});

describe("WorkflowInteractionDecisionService", () => {
  it("switches the workflow to the promise-to-pay track for a clear call commitment", () => {
    const { interactions, execution } = createIntegrationFixture();
    const workspace = new CollectionsWorkspaceService({
      now: () => "2026-04-20T09:00:00.000Z",
      idGenerator: (prefix) => `${prefix}_1`,
    });
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
      displayName: "Acme Retail",
    });

    const call = workspace.recordCallSession({
      account,
      contact: createContact(),
      provider: "other",
      disposition: "connected",
      answered: true,
      operatorReviewRequired: false,
      promisedDate: "2026-04-25",
      transcriptSummary: "We will pay on 2026-04-25.",
      transcriptSegments: [{ speaker: "customer", text: "We will pay on 2026-04-25." }],
    });

    const result = interactions.applyCallSessionOutcome({
      actor,
      asOf: "2026-04-20T09:00:00.000Z",
      execution,
      callSession: call.callSession,
    });

    expect(result.skipped).toBe(false);
    expect(result.normalizedOutcome.outcome).toBe("promise_to_pay");
    expect(result.execution.currentTrack).toBe("promise_to_pay");
    expect(result.execution.lastDecisionAction).toBe("switch_track");
  });

  it("switches to email-only after an explicit do-not-call instruction", () => {
    const { interactions, execution } = createIntegrationFixture();
    const workspace = new CollectionsWorkspaceService({
      now: () => "2026-04-20T09:00:00.000Z",
      idGenerator: (prefix) => `${prefix}_2`,
    });
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
      displayName: "Acme Retail",
    });

    const call = workspace.recordCallSession({
      account,
      contact: createContact(),
      provider: "other",
      disposition: "connected",
      answered: true,
      operatorReviewRequired: false,
      transcriptSummary: "Please do not call again. Send updates by email only.",
      transcriptSegments: [
        { speaker: "customer", text: "Please do not call again. Send updates by email only." },
      ],
    });

    const result = interactions.applyCallSessionOutcome({
      actor,
      asOf: "2026-04-20T09:00:00.000Z",
      execution,
      callSession: call.callSession,
    });

    expect(result.normalizedOutcome.outcome).toBe("do_not_call");
    expect(result.execution.currentTrack).toBe("email_only");
    expect(result.execution.lastDecisionAction).toBe("switch_track");
  });

  it("escalates disputes from inbound email replies", () => {
    const { interactions, execution } = createIntegrationFixture();
    const workspace = new CollectionsWorkspaceService({
      now: () => "2026-04-20T09:00:00.000Z",
      idGenerator: (prefix) => `${prefix}_3`,
    });
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
      displayName: "Acme Retail",
    });

    const email = workspace.ingestInboundEmail({
      account,
      contact: createContact(),
      subjectLine: "Re: Invoice follow-up",
      body: "We dispute this invoice because the amount is incorrect and a credit memo is pending.",
      fromAddress: "ap@example.com",
      toAddress: "collector@example.com",
    });
    const normalized = normalizeWorkflowOutcomeFromCommunicationMessage(email.message);

    const result = interactions.applyMessageOutcome({
      actor,
      asOf: "2026-04-20T09:00:00.000Z",
      execution,
      message: email.message,
    });

    expect(normalized.outcome).toBe("dispute_billing");
    expect(result.execution.status).toBe("manual_review");
    expect(result.execution.lastDecisionAction).toBe("escalate_for_review");
  });

  it("routes ambiguous transcripts to human review", () => {
    const { interactions, execution } = createIntegrationFixture();
    const workspace = new CollectionsWorkspaceService({
      now: () => "2026-04-20T09:00:00.000Z",
      idGenerator: (prefix) => `${prefix}_4`,
    });
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
    });

    const call = workspace.recordCallSession({
      account,
      contact: createContact(),
      provider: "other",
      disposition: "operator_review_required",
      answered: true,
      operatorReviewRequired: true,
      transcriptSummary: "Maybe later.",
      transcriptSegments: [{ speaker: "customer", text: "Maybe later." }],
    });

    const result = interactions.applyCallSessionOutcome({
      actor,
      asOf: "2026-04-20T09:00:00.000Z",
      execution,
      callSession: call.callSession,
    });

    expect(result.normalizedOutcome.outcome).toBe("low_confidence");
    expect(result.execution.status).toBe("manual_review");
    expect(result.execution.requiresHumanReview).toBe(true);
  });

  it("treats wrong contact as channel suppression plus pause, not full account opt-out", () => {
    const { interactions, execution } = createIntegrationFixture();
    const workspace = new CollectionsWorkspaceService({
      now: () => "2026-04-20T09:00:00.000Z",
      idGenerator: (prefix) => `${prefix}_5`,
    });
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
    });

    const call = workspace.recordCallSession({
      account,
      contact: createContact(),
      provider: "other",
      disposition: "wrong_contact",
      answered: true,
      operatorReviewRequired: false,
      transcriptSummary: "You have the wrong person.",
      transcriptSegments: [{ speaker: "customer", text: "You have the wrong person." }],
    });

    const result = interactions.applyCallSessionOutcome({
      actor,
      asOf: "2026-04-20T09:00:00.000Z",
      execution,
      callSession: call.callSession,
    });

    expect(result.normalizedOutcome.outcome).toBe("wrong_contact");
    expect(result.normalizedOutcome.recommendedContactAction).toBe("suppress_call_channel");
    expect(result.execution.status).toBe("paused");
    expect(result.execution.lastDecisionAction).toBe("pause");
    expect(result.execution.status).not.toBe("opted_out");
  });

  it("skips duplicate reactions for the same interaction key", () => {
    const { interactions, execution } = createIntegrationFixture();
    const workspace = new CollectionsWorkspaceService({
      now: () => "2026-04-20T09:00:00.000Z",
      idGenerator: (prefix) => `${prefix}_6`,
    });
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
    });

    const call = workspace.recordCallSession({
      account,
      contact: createContact(),
      provider: "other",
      disposition: "connected",
      answered: true,
      operatorReviewRequired: false,
      transcriptSummary: "Please do not call again.",
      transcriptSegments: [{ speaker: "customer", text: "Please do not call again." }],
    });

    const first = interactions.applyCallSessionOutcome({
      actor,
      asOf: "2026-04-20T09:00:00.000Z",
      execution,
      callSession: call.callSession,
    });
    const second = interactions.applyCallSessionOutcome({
      actor,
      asOf: "2026-04-20T09:05:00.000Z",
      execution: first.execution,
      callSession: call.callSession,
    });

    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(true);
    expect(second.execution).toEqual(first.execution);
  });
});
