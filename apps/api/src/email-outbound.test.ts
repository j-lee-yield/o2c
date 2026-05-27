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

const principal = {
  id: "api-test",
  roles: ["ar_collector"],
} as const;

const account = {
  id: "billing-default",
  createdAt: "2026-03-26T00:00:00.000Z",
  updatedAt: "2026-03-26T00:00:00.000Z",
  parentAccountId: "parent-default",
  accountNumber: "BA-DEFAULT",
  displayName: "Default Billing Account",
  currency: "PHP",
  accountTier: "standard",
  status: "active",
  centrallyPaid: false,
  metadata: {},
};

const contact = {
  id: "contact_1",
  createdAt: "2026-03-26T00:00:00.000Z",
  updatedAt: "2026-03-26T00:00:00.000Z",
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
};

describe("email outbound API", () => {
  it("connects a sending identity and sends a grouped reminder", async () => {
    const connect = await app.inject({
      method: "POST",
      url: "/v1/email/sending-identities/connect",
      payload: {
        principal,
        provider: "internal",
        authMode: "other",
        senderEmail: "collector@example.com",
        displayName: "Yield Collector",
        scopes: ["internal.send"],
        isDefault: true,
      },
    });

    expect(connect.statusCode).toBe(200);
    const identity = connect.json();

    const send = await app.inject({
      method: "POST",
      url: "/v1/email/outbound/send",
      payload: {
        principal,
        account,
        contact,
        senderIdentityId: identity.id,
        workflowKind: "grouped_reminder",
        sendWindow: {
          timezone: "UTC",
          startHour: 0,
          endHour: 24,
          allowedWeekdays: [1, 2, 3, 4, 5, 6, 7],
        },
        invoices: [
          {
            id: "inv_1",
            createdAt: "2026-03-26T00:00:00.000Z",
            updatedAt: "2026-03-26T00:00:00.000Z",
            billingAccountId: account.id,
            parentAccountId: account.parentAccountId,
            state: "matched_to_erp",
            invoiceNumber: "INV-1001",
            currency: "PHP",
            amountCents: 10000,
            metadata: {},
          },
        ],
      },
    });

    expect(send.statusCode).toBe(200);
    const sendBody = send.json();
    expect(sendBody.deliveryState).toBe("sent");
    expect(sendBody.communicationAttempt.senderIdentityId).toBe(identity.id);
    expect(sendBody.activityEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "email.outbound.sent",
          actorId: principal.id,
          entityType: "communication_attempt",
          metadata: expect.objectContaining({
            workflowKind: "grouped_reminder",
            senderIdentityId: identity.id,
            billingAccountId: account.id,
          }),
        }),
      ]),
    );
  });

  it("returns conversation metadata for a sent email attempt", async () => {
    const connect = await app.inject({
      method: "POST",
      url: "/v1/email/sending-identities/connect",
      payload: {
        principal,
        provider: "microsoft_graph",
        authMode: "oauth2",
        senderEmail: "owner@example.com",
        scopes: ["Mail.Send"],
      },
    });
    const identity = connect.json();

    const send = await app.inject({
      method: "POST",
      url: "/v1/email/outbound/send",
      payload: {
        principal,
        account,
        contact,
        senderIdentityId: identity.id,
        workflowKind: "request_remittance",
        subjectLine: "Please send remittance advice",
        bodyPreview: "Following up on remittance.",
        ccEmails: ["finance@example.com"],
        invoices: [
          {
            id: "inv_2",
            createdAt: "2026-03-26T00:00:00.000Z",
            updatedAt: "2026-03-26T00:00:00.000Z",
            billingAccountId: account.id,
            parentAccountId: account.parentAccountId,
            state: "matched_to_erp",
            invoiceNumber: "INV-1002",
            currency: "PHP",
            amountCents: 15000,
            metadata: {},
          },
        ],
      },
    });

    const attemptId = send.json().communicationAttempt.id;
    expect(send.json().communicationAttempt.metadata.ccEmails).toEqual(["finance@example.com"]);
    const conversation = await app.inject({
      method: "GET",
      url: `/v1/email/conversations/${attemptId}`,
    });

    expect(conversation.statusCode).toBe(200);
    expect(conversation.json().communicationAttemptId).toBe(attemptId);
  });

  it("routes inbox replies to approval when contact verification is unknown", async () => {
    const connect = await app.inject({
      method: "POST",
      url: "/v1/email/sending-identities/connect",
      payload: {
        principal,
        provider: "internal",
        authMode: "other",
        senderEmail: "collector@example.com",
        scopes: ["internal.send"],
        isDefault: true,
      },
    });
    const identity = connect.json();

    const replyResponse = await app.inject({
      method: "POST",
      url: "/v1/email/inbox/reply",
      payload: {
        principal,
        senderIdentityId: identity.id,
        providerThreadId: "thread-1",
        replyToProviderMessageId: `${identity.id}:message-1`,
        account,
        contact: {
          ...contact,
          isVerified: false,
          allowAutoSend: false,
        },
        subjectLine: "Re: Invoice follow-up",
        bodyPreview: "Thanks, we received your note.",
      },
    });

    expect(replyResponse.statusCode).toBe(200);
    expect(replyResponse.json().deliveryState).toBe("approval_needed");
  });
});
