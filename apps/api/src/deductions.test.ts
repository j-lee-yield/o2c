import { describe, expect, it } from "vitest";
import { buildApiApp } from "./app.js";
import { getDeductionsAuditEntries } from "./bootstrap/deductions-service.js";

describe("deductions API", () => {
  it("returns a seeded deductions queue and detail workspace", async () => {
    const app = buildApiApp();

    const queueResponse = await app.inject({
      method: "GET",
      url: "/v1/deductions/queue",
    });

    expect(queueResponse.statusCode).toBe(200);
    const queueBody = queueResponse.json();
    expect(queueBody.items.length).toBeGreaterThan(0);
    expect(queueBody.items[0]?.reasonCode).toBe("pricing");

    const detailResponse = await app.inject({
      method: "GET",
      url: `/v1/deductions/${queueBody.items[0].deductionCaseId}`,
    });

    expect(detailResponse.statusCode).toBe(200);
    const detailBody = detailResponse.json();
    expect(detailBody.relatedRecords.invoice.label).toBe("INV-DED-1001");
    expect(detailBody.claims[0]?.claimNumber).toBe("CLAIM-7781");

    await app.close();
  });

  it("refreshes a draft and blocks sync until approval is approved", async () => {
    const app = buildApiApp();

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/v1/deductions/deduction-case-1/credit-memo/refresh",
      headers: {
        "x-principal-id": "controller_1",
        "x-principal-roles": "controller",
      },
    });

    expect(refreshResponse.statusCode).toBe(200);
    expect(refreshResponse.json().totalAmountCents).toBe(4_500_000);

    const syncResponse = await app.inject({
      method: "POST",
      url: "/v1/deductions/deduction-case-1/credit-memo/sync",
      headers: {
        "x-principal-id": "controller_1",
        "x-principal-roles": "controller",
      },
    });

    expect(syncResponse.statusCode).toBe(409);
    expect(syncResponse.json().message).toContain("approved linked approval request");

    await app.close();
  });

  it("accepts upload and AP portal hooks", async () => {
    const app = buildApiApp();

    const uploadResponse = await app.inject({
      method: "POST",
      url: "/v1/deductions/hooks/uploads",
      payload: {
        parentAccountId: "parent-upload-1",
        billingAccountId: "billing-upload-1",
        targetAmountCents: 125000,
        currency: "PHP",
        reasonCode: "pricing",
        detectedAt: "2026-04-08T01:00:00.000Z",
        uploadedDocumentIds: ["doc-1", "doc-2"],
        lineItems: [
          {
            lineNumber: 1,
            category: "pricing",
            description: "Promo accrual deduction",
            disputedAmountCents: 125000,
          },
        ],
      },
    });

    expect(uploadResponse.statusCode).toBe(200);
    expect(uploadResponse.json().deductionCase.sourceChannel).toBe("upload");

    const apPortalResponse = await app.inject({
      method: "POST",
      url: "/v1/deductions/hooks/ap-portal-jobs",
      payload: {
        parentAccountId: "parent-upload-1",
        billingAccountId: "billing-upload-1",
        sourceJobId: "portal-job-77",
        externalClaimReference: "PORTAL-CLAIM-77",
        targetAmountCents: 225000,
        currency: "PHP",
        reasonCode: "returns",
        detectedAt: "2026-04-08T02:00:00.000Z",
        claim: {
          claimNumber: "PORTAL-CLAIM-77",
          assertedAmountCents: 225000,
          assertedAt: "2026-04-08T02:00:00.000Z",
        },
      },
    });

    expect(apPortalResponse.statusCode).toBe(200);
    expect(apPortalResponse.json().deductionCase.sourceChannel).toBe("ap_portal");
    expect(
      getDeductionsAuditEntries().some((entry) => entry.action === "deductions.ap_portal_hook_recorded")
    ).toBe(true);

    await app.close();
  });

  it("forbids collectors from syncing credit memos", async () => {
    const app = buildApiApp();

    const response = await app.inject({
      method: "POST",
      url: "/v1/deductions/deduction-case-1/credit-memo/sync",
      headers: {
        "x-principal-id": "collector_1",
        "x-principal-roles": "ar_collector",
      },
    });

    expect(response.statusCode).toBe(403);

    await app.close();
  });
});
