import { describe, expect, it } from "vitest";
import type {
  VoicePostCallPersistenceAction,
  VoicePostCallPersistencePlan,
} from "@o2c/contracts";
import type { Task } from "@o2c/domain";
import type { ImmutableActivityLogEntry } from "@o2c/audit";
import { buildVoicePostCallTasks } from "./voice-post-call-tasking.js";

function makePlan(actions: VoicePostCallPersistenceAction[], overrides: Partial<VoicePostCallPersistencePlan> = {}): VoicePostCallPersistencePlan {
  return {
    id: "plan_tasking_1",
    billingAccountId: "billing_1",
    parentAccountId: "parent_1",
    branchId: "branch_1",
    contactId: "contact_1",
    communicationAttemptId: "attempt_1",
    providerCallId: "call_1",
    preCallPlanId: "preplan_1",
    occurredAt: "2026-05-07T01:00:00.000Z",
    disposition: "connected",
    actions,
    operatorReviewRequired: false,
    followUpSafeMode: "normal",
    auditSummary: "summary",
    ...overrides
  };
}

function makeAction(
  kind: VoicePostCallPersistenceAction["kind"],
  metadata: Record<string, unknown> = {},
  overrides: Partial<VoicePostCallPersistenceAction> = {}
): VoicePostCallPersistenceAction {
  return {
    kind,
    title: kind,
    description: kind,
    requiresHumanReview: false,
    metadata,
    ...overrides
  };
}

describe("buildVoicePostCallTasks", () => {
  const config = {
    repeatedBrokenPromiseThreshold: 2,
    repeatedBrokenPromiseWindowDays: 90
  } as const;

  it("creates an invoice dispute review task", () => {
    const tasks = buildVoicePostCallTasks(
      {
        persistencePlan: makePlan([
          makeAction("dispute", {
            invoiceIds: ["inv_1"],
            disputeType: "billing"
          })
        ]),
        disposition: "connected",
        existingTasks: []
      },
      config
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      taskType: "invoice_dispute_review",
      linkedInvoiceIds: ["inv_1"],
      ownerTeam: "collections_billing_ops_customer_service"
    });
  });

  it("creates an account manager callback task", () => {
    const tasks = buildVoicePostCallTasks(
      {
        persistencePlan: makePlan([
          makeAction("callback", {}, { dueAt: "2026-05-08T02:00:00.000Z" })
        ]),
        disposition: "callback_requested",
        existingTasks: []
      },
      config
    );

    expect(tasks[0]).toMatchObject({
      taskType: "account_manager_callback",
      dueAt: "2026-05-08T02:00:00.000Z"
    });
  });

  it("creates a payment plan review task", () => {
    const tasks = buildVoicePostCallTasks(
      {
        persistencePlan: makePlan([
          makeAction("payment_plan_request", {
            invoiceIds: ["inv_1"],
            summary: "Asked for installments"
          })
        ]),
        disposition: "connected",
        existingTasks: []
      },
      config
    );

    expect(tasks[0]).toMatchObject({
      taskType: "payment_plan_review",
      linkedInvoiceIds: ["inv_1"]
    });
  });

  it("creates a contact verification review task for wrong contact and handoff", () => {
    const tasks = buildVoicePostCallTasks(
      {
        persistencePlan: makePlan([
          makeAction("contact_handoff", {
            newHandlerName: "Ana Reyes"
          })
        ]),
        disposition: "wrong_contact",
        existingTasks: []
      },
      config
    );

    expect(tasks[0]).toMatchObject({
      taskType: "contact_verification_review"
    });
  });

  it("creates a non-commitment follow-up task", () => {
    const tasks = buildVoicePostCallTasks(
      {
        persistencePlan: makePlan([
          makeAction("non_commitment", {
            invoiceIds: ["inv_1"],
            reason: "No approved date yet"
          })
        ]),
        disposition: "connected",
        existingTasks: []
      },
      config
    );

    expect(tasks[0]).toMatchObject({
      taskType: "non_commitment_follow_up",
      linkedInvoiceIds: ["inv_1"]
    });
  });

  it("creates a concise paid-already follow-up summary with call context kept separate", () => {
    const tasks = buildVoicePostCallTasks(
      {
        persistencePlan: makePlan([
          makeAction("paid_already_claim", {
            invoiceIds: ["inv_1"]
          })
        ]),
        disposition: "connected",
        existingTasks: [],
        transcriptSummary:
          "Long call summary: customer said payment was made by bank transfer and AP will email proof."
      },
      config
    );

    expect(tasks[0]).toMatchObject({
      taskType: "payment_collection_follow_up",
      summary:
        "Customer said payment was already made; verify remittance or payment evidence before changing invoice status.",
      recommendedNextAction:
        "Check remittance/payment records, match evidence to invoices, and update the account only after verification.",
      transcriptSnippet:
        "Long call summary: customer said payment was made by bank transfer and AP will email proof."
    });
    expect(tasks[0]?.summary).not.toContain("Long call summary");
  });

  it("creates a payment collection follow-up task only when good-to-pay is not already covered by promise monitoring", () => {
    const withoutPromiseUpdate = buildVoicePostCallTasks(
      {
        persistencePlan: makePlan([]),
        disposition: "connected",
        existingTasks: [],
        promisedDate: "2026-05-09"
      },
      config
    );

    expect(withoutPromiseUpdate[0]).toMatchObject({
      taskType: "payment_collection_follow_up"
    });

    const explicitGoodToPay = buildVoicePostCallTasks(
      {
        persistencePlan: makePlan([]),
        disposition: "good_to_pay",
        existingTasks: []
      },
      config
    );

    expect(explicitGoodToPay[0]).toMatchObject({
      taskType: "payment_collection_follow_up"
    });

    const withPromiseUpdate = buildVoicePostCallTasks(
      {
        persistencePlan: makePlan([
          makeAction("promise_update", {
            invoiceIds: ["inv_1"],
            status: "new"
          })
        ]),
        disposition: "connected",
        existingTasks: [],
        promisedDate: "2026-05-09"
      },
      config
    );

    expect(withPromiseUpdate).toHaveLength(1);
    expect(withPromiseUpdate[0]).toMatchObject({
      taskType: "follow_up_promise_to_pay",
      linkedInvoiceIds: ["inv_1"]
    });
  });

  it("creates support follow-up tasks from next-step call outcomes", () => {
    const tasks = buildVoicePostCallTasks(
      {
        persistencePlan: makePlan([
          makeAction(
            "next_step_follow_up",
            {
              invoiceIds: ["inv_1"],
              category: "support_request"
            },
            {
              title: "Send supporting documents",
              description: "Customer asked for delivery receipts and invoice copies.",
              dueAt: "2026-05-08T01:00:00.000Z",
              requiresHumanReview: true
            }
          )
        ]),
        disposition: "connected",
        existingTasks: []
      },
      config
    );

    expect(tasks[0]).toMatchObject({
      taskType: "support_request_follow_up",
      linkedInvoiceIds: ["inv_1"],
      ownerTeam: "collections_support",
      priority: "high",
      dueAt: "2026-05-08T01:00:00.000Z"
    });
  });

  it("creates a broken promise escalation task when the rolling threshold is met", () => {
    const history: ImmutableActivityLogEntry[] = [
      {
        id: "activity_1",
        occurredAt: "2026-04-20T01:00:00.000Z",
        action: "collections.voice.post_call.promise_update",
        actorId: "api",
        actorRole: "ar_collector",
        entityType: "billing_account",
        entityId: "billing_1",
        after: {
          metadata: {
            status: "broken",
            invoiceIds: ["inv_1"],
            promiseToPayId: "ptp_1"
          }
        },
        metadata: {
          communicationAttemptId: "attempt_previous"
        }
      },
      {
        id: "activity_2",
        occurredAt: "2026-05-07T01:00:00.000Z",
        action: "collections.voice.post_call.promise_update",
        actorId: "api",
        actorRole: "ar_collector",
        entityType: "billing_account",
        entityId: "billing_1",
        after: {
          metadata: {
            status: "broken",
            invoiceIds: ["inv_2"],
            promiseToPayId: "ptp_2"
          }
        },
        metadata: {
          communicationAttemptId: "attempt_1"
        }
      }
    ];

    const tasks = buildVoicePostCallTasks(
      {
        persistencePlan: makePlan([
          makeAction("promise_update", {
            invoiceIds: ["inv_2"],
            status: "broken",
            promiseToPayId: "ptp_2"
          })
        ]),
        disposition: "connected",
        existingTasks: [],
        historicalActivityEntries: history
      },
      config
    );

    expect(tasks[0]).toMatchObject({
      taskType: "broken_promise_escalation"
    });
  });

  it("does not create a duplicate task when the idempotency key already exists", () => {
    const existingTasks: Task[] = [
      {
        id: "task_existing",
        taskType: "invoice_dispute_review",
        title: "Invoice dispute review",
        kind: "invoice_dispute_review",
        status: "open",
        origin: "workflow_generated",
        surfaces: ["collections"],
        billingAccountId: "billing_1",
        sourceLinks: [],
        auditTrail: [],
        metadata: {
          idempotencyKey: "attempt_1:invoice_dispute_review:inv_1"
        },
        createdAt: "2026-05-07T01:00:00.000Z",
        updatedAt: "2026-05-07T01:00:00.000Z",
        version: 1
      }
    ];

    const tasks = buildVoicePostCallTasks(
      {
        persistencePlan: makePlan([
          makeAction("dispute", {
            invoiceIds: ["inv_1"]
          })
        ]),
        disposition: "connected",
        existingTasks
      },
      config
    );

    expect(tasks).toHaveLength(0);
  });
});
