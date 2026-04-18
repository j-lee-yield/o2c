import { describe, expect, it } from "vitest";

import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import type { Principal } from "@o2c/auth";
import type { Contact } from "@o2c/domain";
import { makeBillingAccount, makeInvoice } from "@o2c/testkit";

import { CollectionsOutreachIntelligenceService } from "./outreach-intelligence.js";
import { InMemoryOutreachContextStore } from "./outreach-intelligence-context.js";

const principal: Principal = { id: "collector_1", roles: ["ar_collector"] };

function createService() {
  return new CollectionsOutreachIntelligenceService({
    activityStore: new InMemoryImmutableActivityLogStore(),
    now: () => "2026-04-15T09:00:00.000Z",
    idGenerator: (prefix) => `${prefix}_1`,
  });
}

function createContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "contact_1",
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
    parentAccountId: "parent_1",
    billingAccountId: "billing_1",
    branchId: "branch_1",
    scope: "billing_account",
    scopeId: "billing_1",
    fullName: "Maria Santos",
    email: "maria@example.com",
    phone: "+639171234567",
    role: "ap",
    isPrimary: true,
    isVerified: true,
    allowAutoSend: true,
    recentSuccessfulResponses: 2,
    metadata: {},
    ...overrides,
  };
}

describe("CollectionsOutreachIntelligenceService", () => {
  it("reuses the same retrieval and policy core for email, voice, and SMS", () => {
    const service = createService();
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
      branchId: "branch_1",
      displayName: "Metro Retail Group - Makati",
    });
    const contact = createContact();
    const invoices = [
      makeInvoice({
        id: "inv_1",
        billingAccountId: account.id,
        parentAccountId: account.parentAccountId,
        branchId: "branch_1",
        state: "matched_to_erp",
        invoiceNumber: "INV-1001",
        amountCents: 125_000,
        dueDate: "2026-04-10",
      }),
    ];
    const currentThread = {
      id: "thread_1",
      source: "current_thread" as const,
      channel: "email" as const,
      contactId: contact.id,
      billingAccountId: account.id,
      providerThreadId: "gmail-thread-1",
      subjectLine: "Re: INV-1001",
      participants: [contact.email ?? "", "collector@example.com"],
      lastMessageAt: "2026-04-14T10:00:00.000Z",
      messages: [
        {
          id: "msg_1",
          direction: "inbound" as const,
          occurredAt: "2026-04-14T10:00:00.000Z",
          bodyPreview: "Please send a quick follow-up tomorrow.",
        },
      ],
    };

    const email = service.generateEmailDraft({
      principal,
      tenantId: "tenant_1",
      channel: "email",
      intent: "reminder",
      account,
      invoices,
      contact,
      currentThread,
    });
    const voice = service.generateVoiceAgentPayload({
      principal,
      tenantId: "tenant_1",
      channel: "voice_agent",
      intent: "reminder",
      account,
      invoices,
      contact,
      currentThread,
    });
    const sms = service.generateSmsDraft({
      principal,
      tenantId: "tenant_1",
      channel: "sms",
      intent: "reminder",
      account,
      invoices,
      contact,
      currentThread,
    });

    expect(email.bundle.invoiceIds).toEqual(voice.bundle.invoiceIds);
    expect(voice.bundle.invoiceIds).toEqual(sms.bundle.invoiceIds);
    expect(email.policy.reviewStatus).toBe(voice.policy.reviewStatus);
    expect(voice.policy.reviewStatus).toBe(sms.policy.reviewStatus);
    expect(email.bundle.explanation.selectedThreadIds).toEqual(["thread_1"]);
  });

  it("does not generate chase copy for disputed invoices across any channel", () => {
    const service = createService();
    const account = makeBillingAccount({ id: "billing_1", parentAccountId: "parent_1" });
    const contact = createContact();
    const invoices = [
      makeInvoice({
        id: "inv_disputed",
        billingAccountId: account.id,
        parentAccountId: account.parentAccountId,
        state: "disputed_full",
        invoiceNumber: "INV-DISPUTED",
        amountCents: 200_000,
      }),
    ];

    const email = service.generateEmailDraft({
      principal,
      tenantId: "tenant_1",
      channel: "email",
      intent: "overdue_follow_up",
      account,
      invoices,
      contact,
    });
    const voice = service.generateVoiceAgentPayload({
      principal,
      tenantId: "tenant_1",
      channel: "voice_agent",
      intent: "overdue_follow_up",
      account,
      invoices,
      contact,
    });
    const sms = service.generateSmsDraft({
      principal,
      tenantId: "tenant_1",
      channel: "sms",
      intent: "overdue_follow_up",
      account,
      invoices,
      contact,
    });

    expect(email.policy.outreachAllowed).toBe(false);
    expect(email.draft.emailBody).toContain("reviewing the account details");
    expect(voice.payload.disallowedStatements.join(" ")).toContain("Do not use chase language");
    expect(sms.draft.variants[0]).toContain("review");
  });

  it("marks unverified contacts as blocked for auto-send and preserves warnings", () => {
    const service = createService();
    const account = makeBillingAccount({ id: "billing_1", parentAccountId: "parent_1" });
    const contact = createContact({ isVerified: false, allowAutoSend: false });
    const invoices = [
      makeInvoice({
        id: "inv_1",
        billingAccountId: account.id,
        parentAccountId: account.parentAccountId,
        state: "matched_to_erp",
      }),
    ];

    const result = service.generateEmailDraft({
      principal,
      tenantId: "tenant_1",
      channel: "email",
      intent: "reminder",
      account,
      invoices,
      contact,
    });

    expect(result.policy.outreachAllowed).toBe(false);
    expect(result.policy.channelRestrictions.autoSendAllowed).toBe(false);
    expect(result.draft.warnings).toContain("unverified_contact");
  });

  it("produces conservative output when cross-entity ambiguity exists", () => {
    const service = createService();
    const account = makeBillingAccount({ id: "billing_1", parentAccountId: "parent_1" });
    const contact = createContact();
    const invoices = [
      makeInvoice({
        id: "inv_1",
        billingAccountId: account.id,
        parentAccountId: account.parentAccountId,
        state: "matched_to_erp",
      }),
    ];

    const result = service.generateSmsDraft({
      principal,
      tenantId: "tenant_1",
      channel: "sms",
      intent: "request_remittance",
      account,
      invoices,
      contact,
      crossEntityAmbiguity: {
        isAmbiguous: true,
        reason: "Two legal entities could plausibly own the incoming payment.",
      },
    });

    expect(result.policy.approvalRequired).toBe(true);
    expect(result.policy.confidenceLow).toBe(true);
    expect(result.draft.variants[0]).toContain("confirm the right paying entity");
  });

  it("preserves billing-account and branch context in the bundle", () => {
    const service = createService();
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
      branchId: "branch_hq",
      displayName: "Northpoint Wholesale - Manila",
    });
    const contact = createContact({ branchId: "branch_hq" });
    const invoices = [
      makeInvoice({
        id: "inv_1",
        billingAccountId: account.id,
        parentAccountId: account.parentAccountId,
        branchId: "branch_hq",
        state: "matched_to_erp",
      }),
      makeInvoice({
        id: "inv_2",
        billingAccountId: account.id,
        parentAccountId: account.parentAccountId,
        branchId: "branch_satellite",
        state: "matched_to_erp",
      }),
    ];

    const result = service.previewContext({
      principal,
      tenantId: "tenant_1",
      channel: "email",
      intent: "reminder",
      account,
      invoices,
      contact,
    });

    expect(result.bundle.customerAccount.billingAccountId).toBe("billing_1");
    expect(result.bundle.customerAccount.branchIds).toEqual(["branch_hq", "branch_satellite"]);
    expect(result.bundle.riskFlags).toContain("billing_account_context_preserved");
    expect(result.bundle.riskFlags).toContain("branch_context_preserved");
  });

  it("prioritizes the current thread over unrelated inbox messages", () => {
    const service = createService();
    const account = makeBillingAccount({ id: "billing_1", parentAccountId: "parent_1" });
    const contact = createContact();
    const invoices = [
      makeInvoice({
        id: "inv_1",
        billingAccountId: account.id,
        parentAccountId: account.parentAccountId,
        state: "matched_to_erp",
      }),
    ];

    const result = service.previewContext({
      principal,
      tenantId: "tenant_1",
      channel: "email",
      intent: "reminder",
      account,
      invoices,
      contact,
      currentThread: {
        id: "thread_current",
        source: "current_thread",
        channel: "email",
        contactId: contact.id,
        billingAccountId: account.id,
        participants: [contact.email ?? ""],
        messages: [
          {
            id: "msg_current",
            direction: "inbound",
            occurredAt: "2026-04-14T09:00:00.000Z",
            bodyPreview: "Can you follow up tomorrow?",
          },
        ],
      },
      relatedThreads: [
        {
          id: "thread_related",
          source: "related_thread",
          channel: "email",
          contactId: contact.id,
          billingAccountId: account.id,
          participants: [contact.email ?? ""],
          messages: [
            {
              id: "msg_related",
              direction: "outbound",
              occurredAt: "2026-04-10T09:00:00.000Z",
              bodyPreview: "Past reminder",
            },
          ],
        },
      ],
      broadInboxFallbackThreads: [
        {
          id: "thread_unrelated",
          source: "broad_inbox_fallback",
          channel: "email",
          contactId: "other_contact",
          billingAccountId: "other_billing",
          participants: ["other@example.com"],
          messages: [
            {
              id: "msg_other",
              direction: "inbound",
              occurredAt: "2026-04-13T09:00:00.000Z",
              bodyPreview: "Unrelated thread",
            },
          ],
        },
      ],
    });

    expect(result.bundle.explanation.selectedThreadIds[0]).toBe("thread_current");
    expect(result.bundle.explanation.omittedThreadIds).toContain("thread_unrelated");
  });

  it("returns voice-safe guidance and concise SMS output", () => {
    const service = createService();
    const account = makeBillingAccount({ id: "billing_1", parentAccountId: "parent_1" });
    const contact = createContact();
    const invoices = [
      makeInvoice({
        id: "inv_1",
        billingAccountId: account.id,
        parentAccountId: account.parentAccountId,
        state: "matched_to_erp",
        invoiceNumber: "INV-1001",
      }),
    ];

    const voice = service.generateVoiceAgentPayload({
      principal,
      tenantId: "tenant_1",
      channel: "voice_agent",
      intent: "reminder",
      account,
      invoices,
      contact,
    });
    const sms = service.generateSmsDraft({
      principal,
      tenantId: "tenant_1",
      channel: "sms",
      intent: "reminder",
      account,
      invoices,
      contact,
    });

    expect(voice.payload.safeTalkingPoints.length).toBeGreaterThan(0);
    expect(voice.payload.disallowedStatements.length).toBeGreaterThanOrEqual(0);
    expect(voice.payload.postCallOutcomeSchema.some((field) => field.field === "disposition")).toBe(true);
    expect(sms.draft.variants.every((variant) => variant.length <= 320)).toBe(true);
  });

  it("records audit events for generation, feedback, and handoff preparation", () => {
    const service = createService();
    const account = makeBillingAccount({ id: "billing_1", parentAccountId: "parent_1" });
    const contact = createContact();
    const invoices = [
      makeInvoice({
        id: "inv_1",
        billingAccountId: account.id,
        parentAccountId: account.parentAccountId,
        state: "matched_to_erp",
      }),
    ];

    const voice = service.generateVoiceAgentPayload({
      principal,
      tenantId: "tenant_1",
      channel: "voice_agent",
      intent: "reminder",
      account,
      invoices,
      contact,
    });
    const feedback = service.recordOperatorFeedback({
      principal,
      tenantId: "tenant_1",
      bundleId: voice.bundle.id,
      channel: "voice_agent",
      action: "accepted",
      originalOutput: voice.payload as unknown as Record<string, unknown>,
      notes: "Looks safe for a controlled Retell handoff.",
    });
    const handoff = service.prepareExecutionHandoff({
      principal,
      tenantId: "tenant_1",
      bundleId: voice.bundle.id,
      channel: "voice_agent",
      provider: "retell",
      output: voice.payload,
      policy: voice.policy,
      metadata: { agentVersion: "preview" },
    });

    expect(voice.activityEntries.map((entry) => entry.action)).toContain("collections.outreach.requested");
    expect(voice.activityEntries.map((entry) => entry.action)).toContain("collections.outreach.voice_payload_generated");
    expect(feedback.activityEntries[0]?.action).toBe("collections.outreach.operator_accepted");
    expect(handoff.activityEntries[0]?.action).toBe("collections.outreach.execution_handoff_prepared");
    expect(handoff.handoff.provider).toBe("retell");
  });

  it("hydrates missing targeted retrieval data from the shared context store", () => {
    const service = new CollectionsOutreachIntelligenceService({
      activityStore: new InMemoryImmutableActivityLogStore(),
      contextStore: new InMemoryOutreachContextStore({
        accountMemorySignals: [
          {
            source: "approved_pattern",
            label: "Preferred wording",
            summary: "Use a calm reminder and ask for remittance confirmation before escalating.",
          },
        ],
        relatedThreads: [
          {
            id: "thread_store_1",
            source: "related_thread",
            channel: "email",
            contactId: "contact_1",
            billingAccountId: "billing_1",
            participants: ["maria@example.com"],
            messages: [
              {
                id: "msg_store_1",
                direction: "inbound",
                occurredAt: "2026-04-13T09:00:00.000Z",
                bodyPreview: "Please check if the remittance has already been matched.",
              },
            ],
          },
        ],
        recentPayments: [
          {
            id: "payment_1",
            occurredAt: "2026-04-14T09:00:00.000Z",
            amountCents: 50_000,
            currency: "PHP",
            status: "posted",
          },
        ],
      }),
      now: () => "2026-04-15T09:00:00.000Z",
      idGenerator: (prefix) => `${prefix}_hydrated`,
    });
    const account = makeBillingAccount({ id: "billing_1", parentAccountId: "parent_1" });
    const contact = createContact();
    const invoices = [
      makeInvoice({
        id: "inv_1",
        billingAccountId: account.id,
        parentAccountId: account.parentAccountId,
        state: "matched_to_erp",
      }),
    ];

    const result = service.previewContext({
      principal,
      tenantId: "tenant_1",
      channel: "email",
      intent: "reminder",
      account,
      invoices,
      contact,
    });

    expect(result.bundle.accountMemory.signals[0]?.label).toBe("Preferred wording");
    expect(result.bundle.recentCommunications[0]?.id).toBe("thread_store_1");
    expect(result.bundle.paymentState.recentPayments[0]?.id).toBe("payment_1");
  });

  it("derives conservative ambiguity defaults when multiple seller entities are present", () => {
    const service = createService();
    const account = makeBillingAccount({ id: "billing_1", parentAccountId: "parent_1" });
    const contact = createContact();
    const invoices = [
      makeInvoice({
        id: "inv_1",
        billingAccountId: account.id,
        parentAccountId: account.parentAccountId,
        state: "matched_to_erp",
        sellerEntityId: "entity_a",
      }),
      makeInvoice({
        id: "inv_2",
        billingAccountId: account.id,
        parentAccountId: account.parentAccountId,
        state: "matched_to_erp",
        sellerEntityId: "entity_b",
      }),
    ];

    const result = service.generateEmailDraft({
      principal,
      tenantId: "tenant_1",
      channel: "email",
      intent: "request_remittance",
      account,
      invoices,
      contact,
    });

    expect(result.policy.approvalRequired).toBe(true);
    expect(result.policy.confidenceLow).toBe(true);
    expect(result.bundle.explanation.notes.join(" ")).toContain("Multiple seller entities");
  });
});
