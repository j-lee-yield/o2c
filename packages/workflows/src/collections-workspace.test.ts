import { describe, expect, it } from "vitest";
import type { Contact } from "@o2c/domain";
import { makeBillingAccount } from "@o2c/testkit";
import { createSendingIdentity } from "@o2c/domain";

import { CollectionsWorkspaceService } from "./collections-workspace.js";

function createContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "contact_1",
    parentAccountId: "parent_1",
    billingAccountId: "billing_1",
    scope: "billing_account",
    scopeId: "billing_1",
    fullName: "AP Contact",
    email: "ap@example.com",
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

describe("CollectionsWorkspaceService", () => {
  it("builds an email inbox item and reply review from an inbound reply", () => {
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
      displayName: "Acme Retail",
    });
    const service = new CollectionsWorkspaceService({
      now: () => "2026-04-08T02:00:00.000Z",
      idGenerator: (prefix) => `${prefix}_1`,
    });

    const result = service.ingestInboundEmail({
      account,
      contact: createContact(),
      subjectLine: "Re: Overdue invoices",
      body: "We will pay on 2026-04-11 for PHP 250.00.",
      fromAddress: "treasury@example.com",
      toAddress: "collector@example.com",
    });

    const workspace = service.getWorkspace(account);
    const review = service.getReplyReview(result.message.id);

    expect(workspace.emailInbox.items).toHaveLength(1);
    expect(workspace.emailInbox.items[0]?.replyReviewRequired).toBe(false);
    expect(result.promiseToPayExtraction?.extracted).toBe(true);
    expect(result.tasks.map((task) => task.kind)).toContain("follow_up_promise_to_pay");
    expect(review?.analysis.classification).toBe("promise_to_pay");
    expect(review?.recommendedDraftStatus).toBe("ready_to_send");
  });

  it("blocks reply drafts after a bounce without weakening contact safeguards", () => {
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
    });
    const service = new CollectionsWorkspaceService({
      now: () => "2026-04-08T03:00:00.000Z",
      idGenerator: (prefix) => `${prefix}_${Math.random().toString(16).slice(2, 6)}`,
    });
    const contact = createContact({ isVerified: false, allowAutoSend: false });

    service.recordEmailBounce({
      account,
      destination: contact.email ?? "ap@example.com",
      contactId: contact.id,
      failure: {
        failureKind: "bounce",
        reasonSummary: "Mailbox rejected the recipient.",
      },
    });

    const draft = service.createReplyDraft({
      account,
      contact,
      threadId: "thread_1",
      bodyPreview: "Following up on the bounced reply.",
      bodyText: "Please confirm the right verified AP contact before we continue.",
    });

    expect(draft.status).toBe("blocked");
    expect(draft.emailFirstProductionBehavior).toBe(true);
    expect(draft.metadata.contactVerified).toBe(false);
  });

  it("keeps call inbox available while staying manual-only for day-1 production", () => {
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
    });
    const service = new CollectionsWorkspaceService({
      now: () => "2026-04-08T04:00:00.000Z",
      idGenerator: (prefix) => `${prefix}_1`,
    });

    const call = service.recordCallSession({
      account,
      contact: createContact(),
      provider: "other",
      disposition: "callback_requested",
      answered: true,
      transcriptSummary: "Buyer requested a callback after lunch.",
      transcriptSegments: [{ speaker: "customer", text: "Please call back after lunch." }],
    });

    const workspace = service.getWorkspace(account);
    const detail = service.getCallDetail(call.callSession.id);

    expect(workspace.callInbox.productionMode).toBe("manual_only");
    expect(workspace.callInbox.items[0]?.disposition).toBe("callback_requested");
    expect(call.tasks.map((task) => task.kind)).toContain("schedule_callback");
    expect(detail?.emailFirstProductionBehavior).toBe(true);
    expect(detail?.approvalRequired).toBe(true);
  });

  it("threads sender identity readiness into reply drafts", () => {
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
    });
    const senderIdentity = createSendingIdentity({
      id: "identity_1",
      provider: "gmail",
      authMode: "oauth2",
      senderEmail: "collector@example.com",
      connectionStatus: "connected",
      permissionStatus: "granted",
      healthState: "healthy",
      createdAt: "2026-04-08T00:00:00.000Z",
    });
    const service = new CollectionsWorkspaceService({
      now: () => "2026-04-08T05:00:00.000Z",
      idGenerator: (prefix) => `${prefix}_1`,
    });

    const draft = service.createReplyDraft({
      account,
      contact: createContact(),
      senderIdentity,
      threadId: "thread_1",
      subjectLine: "Re: Collections follow-up",
      bodyPreview: "Sharing the reviewed response.",
    });

    expect(draft.status).toBe("ready_to_send");
    expect(draft.senderIdentityHook?.canSend).toBe(true);
    expect(draft.senderIdentityHook?.senderEmail).toBe("collector@example.com");
  });
});
