import { afterAll, describe, expect, it } from "vitest";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/o2c_test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.DEFAULT_TENANT_SLUG = "test-tenant";
process.env.JWT_ISSUER = "test-issuer";
process.env.JWT_AUDIENCE = "test-audience";
process.env.JWT_PUBLIC_KEY = "test-public-key";
process.env.JWT_PRIVATE_KEY = "test-private-key";

const { buildApiApp } = await import("./app.js");

const app = buildApiApp();

afterAll(async () => {
  await app.close();
});

function buildPayload() {
  return {
    principal: {
      id: "api-test",
      roles: ["ar_collector"],
    },
    tenantId: "tenant_1",
    channel: "email",
    intent: "reminder",
    account: {
      id: "billing_1",
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
      parentAccountId: "parent_1",
      branchId: "branch_1",
      accountNumber: "BA-001",
      displayName: "Metro Retail Group - Makati",
      currency: "PHP",
      accountTier: "standard",
      status: "active",
      centrallyPaid: false,
      metadata: {},
    },
    contact: {
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
      recentSuccessfulResponses: 4,
      metadata: {},
    },
    invoices: [
      {
        id: "inv_1",
        createdAt: "2026-04-10T00:00:00.000Z",
        updatedAt: "2026-04-10T00:00:00.000Z",
        state: "matched_to_erp",
        parentAccountId: "parent_1",
        billingAccountId: "billing_1",
        branchId: "branch_1",
        invoiceNumber: "INV-1001",
        currency: "PHP",
        amountCents: 155000,
        dueDate: "2026-04-11",
        metadata: {},
      },
    ],
    currentThread: {
      id: "thread_1",
      source: "current_thread",
      channel: "email",
      contactId: "contact_1",
      billingAccountId: "billing_1",
      providerThreadId: "gmail-thread-1",
      subjectLine: "Re: INV-1001",
      participants: ["maria@example.com", "collector@example.com"],
      lastMessageAt: "2026-04-14T10:00:00.000Z",
      messages: [
        {
          id: "msg_1",
          direction: "inbound",
          occurredAt: "2026-04-14T10:00:00.000Z",
          bodyPreview: "Please follow up tomorrow.",
        },
      ],
    },
    accountMemorySignals: [
      {
        source: "approved_pattern",
        label: "Tone",
        summary: "Keep wording polite and concise for this AP team.",
      },
    ],
  };
}

describe("collections outreach intelligence API", () => {
  it("returns a shared context bundle preview", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/collections/outreach/context-preview",
      payload: buildPayload(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.bundle.customerAccount.billingAccountId).toBe("billing_1");
    expect(body.bundle.explanation.selectedThreadIds).toEqual(["thread_1"]);
    expect(body.policy.operatorReviewRequired).toBe(true);
  });

  it("generates email, voice-agent, and SMS outputs from the same input", async () => {
    const [email, voice, sms] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/v1/collections/outreach/email-draft",
        payload: buildPayload(),
      }),
      app.inject({
        method: "POST",
        url: "/v1/collections/outreach/voice-agent-context",
        payload: { ...buildPayload(), channel: "voice_agent" },
      }),
      app.inject({
        method: "POST",
        url: "/v1/collections/outreach/sms-draft",
        payload: { ...buildPayload(), channel: "sms" },
      }),
    ]);

    expect(email.statusCode).toBe(200);
    expect(voice.statusCode).toBe(200);
    expect(sms.statusCode).toBe(200);
    expect(email.json().bundle.invoiceIds).toEqual(voice.json().bundle.invoiceIds);
    expect(voice.json().payload.safeTalkingPoints.length).toBeGreaterThan(0);
    expect(sms.json().draft.variants[0]).toContain("Yield AROS");
  });

  it("records operator feedback and prepares provider handoff metadata", async () => {
    const draftResponse = await app.inject({
      method: "POST",
      url: "/v1/collections/outreach/voice-agent-context",
      payload: { ...buildPayload(), channel: "voice_agent" },
    });
    const draftBody = draftResponse.json();

    const feedbackResponse = await app.inject({
      method: "POST",
      url: "/v1/collections/outreach/operator-feedback",
      payload: {
        principal: buildPayload().principal,
        tenantId: "tenant_1",
        bundleId: draftBody.bundle.id,
        channel: "voice_agent",
        action: "accepted",
        originalOutput: draftBody.payload,
        notes: "Safe to review for a Retell handoff.",
      },
    });

    const handoffResponse = await app.inject({
      method: "POST",
      url: "/v1/collections/outreach/execution-handoff",
      payload: {
        principal: buildPayload().principal,
        tenantId: "tenant_1",
        bundleId: draftBody.bundle.id,
        channel: "voice_agent",
        provider: "retell",
        output: draftBody.payload,
        policy: draftBody.policy,
        metadata: {
          providerIntent: "preview-only",
        },
      },
    });

    expect(feedbackResponse.statusCode).toBe(200);
    expect(feedbackResponse.json().recorded).toBe(true);
    expect(handoffResponse.statusCode).toBe(200);
    expect(handoffResponse.json().handoff.provider).toBe("retell");
  });
});
