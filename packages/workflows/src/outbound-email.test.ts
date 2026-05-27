import { describe, expect, it } from "vitest";

import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import type { Principal } from "@o2c/auth";
import type {
  CommunicationAttempt,
  EmailDraftResult,
  EmailOutcome,
  EmailProviderAdapter,
  EmailReplyMetadata,
  EmailFailureMetadata,
} from "@o2c/domain";
import { makeBillingAccount, makeInvoice } from "@o2c/testkit";

import {
  InMemoryCommunicationProviderRegistry,
  InternalEmailStubAdapter,
  createCommunicationProviderDescriptor,
} from "./communication-providers.js";
import {
  OutboundEmailWorkflowService,
  type CommunicationAttemptStore,
} from "./outbound-email.js";

const collector: Principal = { id: "collector_1", roles: ["ar_collector"] };

function createContact(overrides: Record<string, unknown> = {}) {
  return {
    id: "contact_1",
    parentAccountId: "parent-default",
    billingAccountId: "billing-default",
    scope: "billing_account",
    scopeId: "billing-default",
    fullName: "AP Contact",
    email: "ap@example.com",
    role: "ap",
    isPrimary: true,
    isVerified: true,
    allowAutoSend: true,
    recentSuccessfulResponses: 2,
    metadata: {},
    createdAt: "2026-03-26T00:00:00.000Z",
    updatedAt: "2026-03-26T00:00:00.000Z",
    ...overrides,
  };
}

class FailingEmailAdapter extends InternalEmailStubAdapter implements EmailProviderAdapter {
  async sendEmail(_input: {
    attempt: CommunicationAttempt;
  }) {
    throw new Error("provider_send_failed");
  }

  async createDraft(input: {
    attempt: CommunicationAttempt;
  }): Promise<EmailDraftResult> {
    return super.createDraft(input);
  }

  async replyToThread(_input: {
    attempt: CommunicationAttempt;
    providerThreadId: string;
    replyToProviderMessageId?: string;
  }) {
    throw new Error("provider_send_failed");
  }

  async forwardMessage(input: {
    attempt: CommunicationAttempt;
    providerMessageId: string;
  }) {
    return super.forwardMessage(input);
  }

  async fetchDeliveryStatus(_input: {
    providerMessageId: string;
  }): Promise<EmailOutcome[]> {
    return [];
  }

  async fetchReplyMetadata(_input: {
    providerMessageId: string;
  }): Promise<EmailReplyMetadata[]> {
    return [];
  }

  async fetchOpenEvents(_input: {
    providerMessageId: string;
  }): Promise<EmailOutcome[]> {
    return [];
  }

  async fetchBounceFailureMetadata(_input: {
    providerMessageId: string;
  }): Promise<EmailFailureMetadata[]> {
    return [];
  }
}

function createService(options?: {
  providerRegistry?: InMemoryCommunicationProviderRegistry;
  communicationAttemptStore?: CommunicationAttemptStore;
}) {
  return new OutboundEmailWorkflowService({
    activityStore: new InMemoryImmutableActivityLogStore(),
    providerRegistry: options?.providerRegistry,
    communicationAttemptStore: options?.communicationAttemptStore,
    now: () => "2026-03-26T09:00:00.000Z",
    idGenerator: (prefix) => `${prefix}_1`,
  });
}

class CapturingCommunicationAttemptStore implements CommunicationAttemptStore {
  private readonly attempts = new Map<string, CommunicationAttempt>();

  save(attempt: CommunicationAttempt): void {
    this.attempts.set(attempt.id, attempt);
  }

  get(attemptId: string): CommunicationAttempt | undefined {
    return this.attempts.get(attemptId);
  }
}

describe("OutboundEmailWorkflowService", () => {
  it("sends a grouped reminder through the connected mailbox identity and stores conversation metadata", async () => {
    const service = createService();
    const account = makeBillingAccount({ id: "billing-default", parentAccountId: "parent-default" });
    const contact = createContact();
    const identity = service.connectSendingIdentity({
      provider: "gmail",
      authMode: "oauth2",
      senderEmail: "collector@example.com",
      displayName: "Yield Collector",
      scopes: ["gmail.send", "gmail.modify"],
      isDefault: true,
      principal: collector,
    });

    const result = await service.sendReminder({
      principal: collector,
      account,
      contact,
      senderIdentityId: identity.id,
      invoices: [
        makeInvoice({
          id: "inv_1",
          billingAccountId: account.id,
          parentAccountId: account.parentAccountId,
          state: "matched_to_erp",
          dueDate: "2026-03-20",
        }),
      ],
    });

    expect(result.deliveryState).toBe("sent");
    expect(result.communicationAttempt?.provider).toBe("gmail");
    expect(result.communicationAttempt?.senderIdentityId).toBe(identity.id);
    expect(result.threadReference?.providerThreadId).toContain("gmail-thread");
    expect(
      result.activityEntries.some((entry) => entry.action === "email.outbound.sent"),
    ).toBe(true);

    const conversation = service.getConversationMetadata(result.communicationAttempt!.id);
    expect(conversation?.senderIdentityId).toBe(identity.id);
    expect(conversation?.workflowIntent).toBe("grouped_reminder");
  });

  it("persists provider send details on the communication attempt store", async () => {
    const attemptStore = new CapturingCommunicationAttemptStore();
    const service = createService({ communicationAttemptStore: attemptStore });
    const account = makeBillingAccount({ id: "billing-default", parentAccountId: "parent-default" });
    const contact = createContact();
    const identity = service.connectSendingIdentity({
      provider: "gmail",
      authMode: "oauth2",
      senderEmail: "collector@example.com",
      scopes: ["gmail.send", "gmail.modify"],
      isDefault: true,
      principal: collector,
    });

    const result = await service.sendResendDocuments({
      principal: collector,
      account,
      contact,
      senderIdentityId: identity.id,
      subjectLine: "Documents",
      bodyPreview: "Attached are the requested documents.",
      invoices: [
        makeInvoice({
          id: "inv_1",
          billingAccountId: account.id,
          parentAccountId: account.parentAccountId,
          state: "matched_to_erp",
        }),
      ],
    });

    const savedAttempt = attemptStore.get(result.communicationAttempt!.id);
    expect(savedAttempt?.status).toBe("sent");
    expect(savedAttempt?.providerMessageId).toContain("gmail-message");
    expect(savedAttempt?.providerThreadId).toContain("gmail-thread");
  });

  it("keeps approval gating intact for unverified resend recipients", async () => {
    const service = createService();
    const account = makeBillingAccount({ id: "billing-default", parentAccountId: "parent-default" });
    const identity = service.connectSendingIdentity({
      provider: "microsoft_graph",
      authMode: "oauth2",
      senderEmail: "collector@example.com",
      scopes: ["Mail.Send"],
      isDefault: true,
    });

    const result = await service.sendResendDocuments({
      principal: collector,
      account,
      contact: createContact({
        isVerified: false,
        allowAutoSend: false,
      }),
      senderIdentityId: identity.id,
      invoices: [
        makeInvoice({
          id: "inv_2",
          billingAccountId: account.id,
          parentAccountId: account.parentAccountId,
          state: "matched_to_erp",
        }),
      ],
      subjectLine: "Requested invoice documents",
      bodyPreview: "Sending the requested bundle.",
    });

    expect(result.deliveryState).toBe("approval_needed");
    expect(result.approvalRequest?.status).toBe("pending_approval");
    expect(result.failureReason).toBe("unverified_contact");
  });

  it("blocks sends from disconnected mailbox identities", async () => {
    const service = createService();
    const account = makeBillingAccount({ id: "billing-default", parentAccountId: "parent-default" });
    const identity = service.connectSendingIdentity({
      provider: "gmail",
      authMode: "oauth2",
      senderEmail: "collector@example.com",
      scopes: [],
      isDefault: true,
    });

    service.validateSendingIdentityHealth(identity.id);

    const result = await service.sendWorkflowEmail({
      principal: collector,
      account,
      contact: createContact(),
      senderIdentityId: identity.id,
      invoices: [
        makeInvoice({
          id: "inv_3",
          billingAccountId: account.id,
          parentAccountId: account.parentAccountId,
          state: "matched_to_erp",
        }),
      ],
      workflowKind: "request_remittance",
      subjectLine: "Please send remittance advice",
      bodyPreview: "Following up on remittance.",
    });

    expect(result.deliveryState).toBe("blocked");
    expect(result.failureReason).toBe("sending_identity_unhealthy");
  });

  it("surfaces provider failures and preserves auditability", async () => {
    const registry = new InMemoryCommunicationProviderRegistry().register({
      descriptor: createCommunicationProviderDescriptor({
        channel: "email",
        provider: "other",
        displayName: "Failing Mail Provider",
        maturity: "email_complete",
      }),
      adapter: new FailingEmailAdapter(),
      normalizer: new FailingEmailAdapter(),
    });
    const service = createService({ providerRegistry: registry });
    const account = makeBillingAccount({ id: "billing-default", parentAccountId: "parent-default" });
    const identity = service.connectSendingIdentity({
      provider: "other",
      authMode: "api_key",
      senderEmail: "collector@example.com",
      scopes: ["send"],
      isDefault: true,
    });

    const result = await service.sendWorkflowEmail({
      principal: collector,
      account,
      contact: createContact(),
      senderIdentityId: identity.id,
      invoices: [
        makeInvoice({
          id: "inv_4",
          billingAccountId: account.id,
          parentAccountId: account.parentAccountId,
          state: "matched_to_erp",
        }),
      ],
      workflowKind: "request_remittance",
      subjectLine: "Please send remittance advice",
      bodyPreview: "Following up on remittance.",
    });

    expect(result.deliveryState).toBe("failed");
    expect(result.failureReason).toContain("provider_send_failed");
    expect(
      result.activityEntries.some((entry) => entry.action === "email.outbound.failed"),
    ).toBe(true);
  });
});
