import { afterAll, describe, expect, it } from "vitest";

import { buildApiApp } from "./app.js";

const app = buildApiApp();

afterAll(async () => {
  await app.close();
});

describe("customer profile mastering API", () => {
  it("creates a customer profile from extracted data and returns the unified aggregate fields", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/customer_profiles/ingestions",
      headers: {
        "x-principal-id": "manager-api",
        "x-principal-roles": "ar_manager",
      },
      payload: {
        id: "customer-api-1",
        source: "erp_accounting",
        occurredAt: "2026-04-03T10:00:00.000Z",
        hierarchy: {
          parentAccount: {
            id: "parent-api-1",
            name: "Metro Group",
          },
          billingAccount: {
            id: "billing-api-1",
            parentAccountId: "parent-api-1",
            accountNumber: "BA-001",
            displayName: "Metro Group - Makati",
          },
          branch: {
            id: "branch-api-1",
            parentAccountId: "parent-api-1",
            billingAccountId: "billing-api-1",
            code: "MKT",
            name: "Makati",
          },
        },
        legalEntityName: "Metro Group Inc.",
        contacts: [
          {
            id: "contact-api-1",
            fullName: "Maria Santos",
            email: "maria@metro.example",
            phone: "+63 917 111 2222",
            role: "ap",
            isVerified: true,
            allowAutoSend: true,
          },
        ],
        invoices: [
          {
            id: "invoice-api-1",
            parentAccountId: "parent-api-1",
            billingAccountId: "billing-api-1",
            branchId: "branch-api-1",
            invoiceNumber: "INV-100",
            amountCents: 100000,
          },
        ],
        payments: [
          {
            id: "payment-api-1",
            parentAccountId: "parent-api-1",
            billingAccountId: "billing-api-1",
            paymentReference: "PAY-100",
            amountCents: 100000,
            receivedAt: "2026-04-03T10:00:00.000Z",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.profile.canonicalName).toBe("Metro Group - Makati");
    expect(body.contacts[0].isPrimaryEmail).toBe(true);

    const profileResponse = await app.inject({
      method: "GET",
      url: "/v1/customer_profiles/customer-api-1",
    });

    expect(profileResponse.statusCode).toBe(200);
    const profileBody = profileResponse.json();
    expect(profileBody.invoices).toHaveLength(1);
    expect(profileBody.payments).toHaveLength(1);
    expect(profileBody.conciseSummary).toContain("Metro Group - Makati");
    expect(profileBody.customerProfile.financialSummary.openAmountCents).toBe(100000);
    expect(profileBody.customerProfile.tabs.map((tab: { label: string }) => tab.label)).toContain("Deductions");

    const indexResponse = await app.inject({
      method: "GET",
      url: "/v1/customer_profiles/index",
    });

    expect(indexResponse.statusCode).toBe(200);
    expect(indexResponse.json().items[0]?.profileId).toBe("customer-api-1");
  });

  it("routes below-99% duplicate candidates to the review queue", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/customer_profiles/ingestions",
      headers: {
        "x-principal-id": "manager-api",
        "x-principal-roles": "ar_manager",
      },
      payload: {
        id: "customer-review-target",
        source: "erp_accounting",
        occurredAt: "2026-04-03T11:00:00.000Z",
        hierarchy: {},
        legalEntityName: "Bravo Trading",
        contacts: [{ fullName: "AP", email: "ap@bravo.example", role: "ap", isVerified: true }],
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/customer_profiles/ingestions",
      headers: {
        "x-principal-id": "manager-api",
        "x-principal-roles": "ar_manager",
      },
      payload: {
        id: "customer-review-source",
        source: "spreadsheet_fallback",
        occurredAt: "2026-04-03T11:05:00.000Z",
        hierarchy: {},
        legalEntityName: "Bravo Trading Limited",
        billingAccountName: "Bravo Trading",
        contacts: [{ fullName: "Treasury", email: "treasury@bravo.example", role: "treasury" }],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.mergeSuggestion.status).toBe("pending_review");

    const queueResponse = await app.inject({
      method: "GET",
      url: "/v1/customer_profiles/review-queue",
    });
    expect(queueResponse.statusCode).toBe(200);
    expect(queueResponse.json().items.length).toBeGreaterThan(0);
  });

  it("approves and rejects merge suggestions via the API", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/customer_profiles/ingestions",
      headers: {
        "x-principal-id": "manager-api",
        "x-principal-roles": "ar_manager",
      },
      payload: {
        id: "customer-approve-source",
        source: "spreadsheet_fallback",
        occurredAt: "2026-04-03T12:00:00.000Z",
        hierarchy: {},
        legalEntityName: "Bravo Trading Holdings",
        billingAccountName: "Bravo Trading",
        contacts: [{ fullName: "AP 2", email: "ap2@bravo.example", role: "ap" }],
      },
    });
    const mergeSuggestionId = createResponse.json().mergeSuggestion.id;

    const approveResponse = await app.inject({
      method: "POST",
      url: `/v1/customer_profiles/merge-suggestions/${mergeSuggestionId}/approve`,
      headers: {
        "x-principal-id": "manager-api",
        "x-principal-roles": "ar_manager",
      },
    });
    expect(approveResponse.statusCode).toBe(200);
    expect(approveResponse.json().suggestion.status).toBe("approved");

    const rejectSeed = await app.inject({
      method: "POST",
      url: "/v1/customer_profiles/ingestions",
      headers: {
        "x-principal-id": "manager-api",
        "x-principal-roles": "ar_manager",
      },
      payload: {
        id: "customer-reject-source",
        source: "spreadsheet_fallback",
        occurredAt: "2026-04-03T12:10:00.000Z",
        hierarchy: {},
        legalEntityName: "Bravo Trading Services",
        billingAccountName: "Bravo Trading",
        contacts: [{ fullName: "AP 3", email: "ap3@bravo.example", role: "ap" }],
      },
    });
    const rejectSuggestionId = rejectSeed.json().mergeSuggestion.id;

    const rejectResponse = await app.inject({
      method: "POST",
      url: `/v1/customer_profiles/merge-suggestions/${rejectSuggestionId}/reject`,
      headers: {
        "x-principal-id": "manager-api",
        "x-principal-roles": "ar_manager",
      },
    });
    expect(rejectResponse.statusCode).toBe(200);
    expect(rejectResponse.json().suggestion.status).toBe("rejected");
  });

  it("lists AI and human tasks separately", async () => {
    const humanResponse = await app.inject({
      method: "GET",
      url: "/v1/customer_profiles/tasks?executionType=human",
    });
    expect(humanResponse.statusCode).toBe(200);
    expect(Array.isArray(humanResponse.json().items)).toBe(true);
  });

  it("allows supplier-set buyer tax profiles for new buyers", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/customer_profiles/ingestions",
      headers: {
        "x-principal-id": "manager-api",
        "x-principal-roles": "ar_manager",
      },
      payload: {
        id: "customer-tax-profile-1",
        source: "erp_accounting",
        occurredAt: "2026-04-03T12:30:00.000Z",
        hierarchy: {},
        legalEntityName: "Withholding Buyer Inc.",
        contacts: [{ fullName: "Treasury", email: "treasury@withholding.example", role: "treasury" }],
      },
    });

    const putResponse = await app.inject({
      method: "PUT",
      url: "/v1/customer_profiles/customer-tax-profile-1/buyer-tax-profile",
      headers: {
        "x-principal-id": "manager-api",
        "x-principal-roles": "ar_manager",
      },
      payload: {
        isTopWithholdingAgent: true,
        withholdingDefaultType: "goods",
        defaultWithholdingRateBps: 100,
        requires2307ForClosure: false,
        notes: "Supplier-set for a new buyer before historical payments exist.",
      },
    });

    expect(putResponse.statusCode).toBe(200);
    expect(putResponse.json().withholdingDefaultType).toBe("goods");

    const getResponse = await app.inject({
      method: "GET",
      url: "/v1/customer_profiles/customer-tax-profile-1/buyer-tax-profile",
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json().isTopWithholdingAgent).toBe(true);
    expect(getResponse.json().requires2307ForClosure).toBe(false);
  });

  it("rejects collector attempts to approve customer review actions", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/customer_profiles/ingestions",
      headers: {
        "x-principal-id": "manager-api",
        "x-principal-roles": "ar_manager",
      },
      payload: {
        id: "customer-collector-review-target",
        source: "erp_accounting",
        occurredAt: "2026-04-03T13:00:00.000Z",
        hierarchy: {},
        legalEntityName: "Collector Review Target",
        contacts: [{ fullName: "AP", email: "ap@collector-target.example", role: "ap", isVerified: true }],
      },
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/customer_profiles/ingestions",
      headers: {
        "x-principal-id": "manager-api",
        "x-principal-roles": "ar_manager",
      },
      payload: {
        id: "customer-collector-review-source",
        source: "spreadsheet_fallback",
        occurredAt: "2026-04-03T13:05:00.000Z",
        hierarchy: {},
        legalEntityName: "Collector Review Source",
        billingAccountName: "Collector Review Target",
        contacts: [{ fullName: "AP 4", email: "ap4@collector-target.example", role: "ap" }],
      },
    });

    const suggestionId = createResponse.json().mergeSuggestion.id;
    const response = await app.inject({
      method: "POST",
      url: `/v1/customer_profiles/merge-suggestions/${suggestionId}/approve`,
      headers: {
        "x-principal-id": "collector-api",
        "x-principal-roles": "ar_collector",
      },
    });

    expect(response.statusCode).toBe(403);
  });
});
