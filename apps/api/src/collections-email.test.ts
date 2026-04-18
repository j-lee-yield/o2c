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

describe("collections email preview API", () => {
  it("returns grouped reminder planning and provider hook payload", async () => {
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
    const response = await app.inject({
      method: "POST",
      url: "/v1/collections/email-preview",
      payload: {
        principal: {
          id: "api-test",
          roles: ["ar_collector"],
        },
        account,
        sendWindow: {
          timezone: "UTC",
          startHour: 0,
          endHour: 24,
          allowedWeekdays: [1, 2, 3, 4, 5, 6, 7],
        },
        contact: {
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
          recentSuccessfulResponses: 3,
          metadata: {},
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
            dueDate: "2099-03-25",
          },
          {
            id: "inv_2",
            createdAt: "2026-03-26T00:00:00.000Z",
            updatedAt: "2026-03-26T00:00:00.000Z",
            billingAccountId: account.id,
            parentAccountId: account.parentAccountId,
            branchId: "branch_2",
            state: "partially_paid",
            invoiceNumber: "INV-1002",
            currency: "PHP",
            amountCents: 20000,
            metadata: {},
            dueDate: "2099-03-29",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.workspace.groupingMode).toBe("billing_account");
    expect(body.reminderDraft.deliveryState).toBe("ready");
    expect(body.emailProviderHook.templateKey).toBe("collections_grouped_email_v1");
    expect(body.emailProviderHook.invoices).toHaveLength(2);
    expect(body.communicationAttempt.channel).toBe("email");
    expect(body.communicationAttempt.provider).toBe("internal");
    expect(body.communicationAttempt.status).toBe("queued");
  });

  it("rejects id-only preview requests when the database is unavailable", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/collections/email-preview",
      payload: {
        principal: {
          id: "api-test",
          roles: ["ar_collector"],
        },
        accountId: "billing-default",
        invoiceIds: ["inv_1"],
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().message).toContain("live database connection");
  });
});
