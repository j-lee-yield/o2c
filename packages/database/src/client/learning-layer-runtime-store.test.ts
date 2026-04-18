import { describe, expect, it } from "vitest";
import { buildLearningLayerContextWhereClause } from "./learning-layer-runtime-store.js";

describe("buildLearningLayerContextWhereClause", () => {
  it("prefers the narrowest available entity context while preserving all known identifiers", () => {
    const clause = buildLearningLayerContextWhereClause(
      {
        tenantId: "tenant-acme",
        targetType: "contact",
        targetId: "contact-1",
        parentAccountId: "parent-1",
        billingAccountId: "billing-1",
        contactId: "contact-1",
      },
      "history",
    );

    expect(clause).toContain("history.contact_id = 'contact-1'::uuid");
    expect(clause).toContain("history.billing_account_id = 'billing-1'::uuid");
    expect(clause).toContain("history.parent_account_id = 'parent-1'::uuid");
  });

  it("falls back to TRUE when the request has no canonical context ids", () => {
    const clause = buildLearningLayerContextWhereClause(
      {
        tenantId: "tenant-acme",
        targetType: "message",
        targetId: "msg-1",
      },
      "feedback",
    );

    expect(clause).toBe("TRUE");
  });
});
