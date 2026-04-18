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

describe("operator feedback API", () => {
  it("captures feedback, emits a learning event, and updates behavior profiles", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/learning_layer/operator-feedback",
      headers: {
        "x-principal-id": "collector-1",
        "x-tenant-id": "tenant-acme",
      },
      payload: {
        feedback: {
          id: "feedback-api-1",
          feedbackType: "contact_override",
          targetType: "contact",
          targetId: "contact-1",
          occurredAt: "2026-03-31T12:00:00.000Z",
          parentAccountId: "parent-1",
          billingAccountId: "billing-1",
          contactId: "contact-1",
          reasonCode: "sms_contact_confirmed",
          appliesToFutureScoring: true,
          preservesSafetyRules: true,
          beforePayload: {
            preferredChannel: "email",
            smsNumberVerified: false,
          },
          afterPayload: {
            preferredChannel: "sms",
            smsNumberVerified: true,
          },
        },
        recomputeProfiles: {
          account: {
            profileId: "account-profile-1",
            scope: "billing_account",
            scopeId: "billing-1",
            parentAccountId: "parent-1",
            billingAccountId: "billing-1",
          },
          contact: {
            profileId: "contact-profile-1",
            contactId: "contact-1",
            parentAccountId: "parent-1",
            billingAccountId: "billing-1",
            verificationSnapshot: {
              emailVerified: true,
              smsNumberVerified: false,
              phoneNumberVerified: false,
            },
          },
        },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();

    expect(body.feedback.feedbackType).toBe("contact_override");
    expect(body.feedback.createdByActorId).toBe("collector-1");
    expect(body.emittedEvents[0]?.eventType).toBe("operator_contact_overridden");
    expect(body.updatedAccountProfile.preferredChannel).toBe("sms");
    expect(body.updatedContactProfile.verificationSnapshot.smsNumberVerified).toBe(true);
  });

  it("marks the learning layer module as implemented", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/learning_layer",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("implemented");
    expect(body.capabilities).toContain("operator feedback capture");
    expect(body.capabilities).toContain("customer profile read model");
  });

  it("validates customer profile lookups before touching the database", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/learning_layer/customer-profiles",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("billingAccountId or accountNumber is required");
  });

  it("accepts an empty recompute body and routes it through the recompute endpoint", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/learning_layer/recompute",
      payload: {},
    });

    expect([202, 503]).toContain(response.statusCode);
  });
});
