import { describe, expect, it } from "vitest";

import {
  buildUnifiedCustomerProfileView,
  createCustomerProfileFromIngestion,
  defaultCustomerProfileMasteringPolicy,
  materializeProfileContacts,
  mergeCustomerProfileRecords,
  rankDuplicateCandidates,
} from "./index.js";

describe("customer profile mastering helpers", () => {
  it("scores strong duplicate candidates and keeps the threshold configurable", () => {
    const [existing] = [
      {
        id: "profile-existing",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
        status: "active" as const,
        canonicalName: "Metro Retail Group",
        legalEntityName: "Metro Retail Group Inc.",
        taxId: "TIN-445-221",
        billingAccountName: "Metro Retail Group - Makati",
        branchIds: ["branch-1"],
        branchNames: ["Makati"],
        contactIds: [],
        linkedInvoiceIds: ["invoice-1"],
        linkedPaymentIds: ["payment-1"],
        linkedRemittanceIds: [],
        linkedExceptionIds: [],
        linkedApprovalRequestIds: [],
        linkedTaskIds: [],
        sourceKinds: ["erp_accounting"] as const[],
        primaryContactEmail: "ap@metro.example",
        metadata: {},
      },
    ];

    const payload = {
      id: "ingestion-1",
      source: "spreadsheet_fallback" as const,
      occurredAt: "2026-04-02T00:00:00.000Z",
      hierarchy: {
        billingAccount: {
          id: "billing-2",
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
          parentAccountId: "parent-1",
          accountNumber: "BA-100",
          displayName: "Metro Retail Group - Makati",
          currency: "PHP",
          accountTier: "standard" as const,
          status: "active" as const,
          centrallyPaid: false,
          metadata: {},
        },
        branch: {
          id: "branch-2",
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
          parentAccountId: "parent-1",
          billingAccountId: "billing-2",
          code: "MKT",
          name: "Makati",
          status: "active" as const,
          metadata: {},
        },
      },
      legalEntityName: "Metro Retail Group Inc.",
      taxId: "TIN-445-221",
      contacts: [{ fullName: "AP Team", email: "ap@metro.example", role: "ap" as const }],
      invoices: [
        {
          id: "invoice-1",
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
          state: "synced_open" as const,
          parentAccountId: "parent-1",
          billingAccountId: "billing-2",
          invoiceNumber: "INV-1",
          currency: "PHP",
          amountCents: 100,
          metadata: {},
        },
      ],
    };

    const [candidate] = rankDuplicateCandidates(payload, [existing]);
    expect(candidate.breakdown.confidence).toBeGreaterThanOrEqual(
      defaultCustomerProfileMasteringPolicy().duplicate.autoMergeMinConfidence,
    );
  });

  it("keeps contact survivorship conservative and prefers verified data", () => {
    const contacts = materializeProfileContacts({
      profileId: "profile-1",
      source: "erp_accounting",
      occurredAt: "2026-04-02T00:00:00.000Z",
      actor: { actorId: "system", actorRole: "system" },
      contacts: [
        {
          id: "contact-1",
          fullName: "AP Team",
          email: "ap@example.com",
          role: "shared_finance",
          isVerified: false,
        },
      ],
    });

    const merged = materializeProfileContacts({
      profileId: "profile-1",
      source: "spreadsheet_fallback",
      occurredAt: "2026-04-03T00:00:00.000Z",
      actor: { actorId: "system", actorRole: "system" },
      contacts: [
        {
          id: "contact-2",
          fullName: "Maria Santos",
          email: "ap@example.com",
          phone: "+63 917 111 2222",
          role: "ap",
          isVerified: true,
          allowAutoSend: true,
        },
      ],
      existingContacts: contacts,
    });

    expect(merged).toHaveLength(1);
    expect(merged[0]?.fullName).toBe("Maria Santos");
    expect(merged[0]?.isVerified).toBe(true);
    expect(merged[0]?.isPrimaryEmail).toBe(true);
  });

  it("merges profile links into the surviving aggregate", () => {
    const target = {
      id: "profile-target",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
      status: "active" as const,
      canonicalName: "Target",
      branchIds: ["branch-1"],
      branchNames: ["Makati"],
      contactIds: ["contact-1"],
      linkedInvoiceIds: ["invoice-1"],
      linkedPaymentIds: [],
      linkedRemittanceIds: [],
      linkedExceptionIds: [],
      linkedApprovalRequestIds: [],
      linkedTaskIds: [],
      sourceKinds: ["erp_accounting"] as const[],
      metadata: {},
    };
    const source = {
      ...target,
      id: "profile-source",
      canonicalName: "Source",
      linkedInvoiceIds: ["invoice-2"],
      linkedPaymentIds: ["payment-1"],
      sourceKinds: ["document_extracted"] as const[],
    };

    const contacts = materializeProfileContacts({
      profileId: "profile-target",
      source: "erp_accounting",
      occurredAt: "2026-04-02T00:00:00.000Z",
      actor: { actorId: "system", actorRole: "system" },
      contacts: [{ id: "contact-1", fullName: "AP", email: "ap@example.com", role: "ap", isVerified: true }],
    });

    const merged = mergeCustomerProfileRecords({
      target,
      source,
      contacts,
      occurredAt: "2026-04-02T00:00:00.000Z",
      actor: { actorId: "user-1", actorRole: "ar_manager" },
    });

    expect(merged.mergedTarget.linkedInvoiceIds).toContain("invoice-2");
    expect(merged.mergedTarget.linkedPaymentIds).toContain("payment-1");
    expect(merged.mergedSource.status).toBe("merged");
  });

  it("builds a unified view that surfaces linked objects and a concise summary", () => {
    const contacts = materializeProfileContacts({
      profileId: "profile-1",
      source: "erp_accounting",
      occurredAt: "2026-04-02T00:00:00.000Z",
      actor: { actorId: "system", actorRole: "system" },
      contacts: [{ id: "contact-1", fullName: "AP", email: "ap@example.com", role: "ap", isVerified: true }],
    });
    const profile = createCustomerProfileFromIngestion({
      id: "profile-1",
      occurredAt: "2026-04-02T00:00:00.000Z",
      actor: { actorId: "system", actorRole: "system" },
      contacts,
      payload: {
        id: "ingestion-2",
        source: "erp_accounting",
        occurredAt: "2026-04-02T00:00:00.000Z",
        hierarchy: {},
        billingAccountName: "Metro Retail Group",
        contacts: [],
      },
    });

    const view = buildUnifiedCustomerProfileView({
      profile,
      contacts,
      invoices: [],
      payments: [],
      remittances: [],
      exceptions: [],
      approvals: [],
      tasks: [],
      mergeSuggestions: [],
      branches: [],
    });

    expect(view.conciseSummary).toContain("Metro Retail Group");
    expect(view.contacts[0]?.email).toBe("ap@example.com");
    expect(view.summary?.preferredContact.contactEmail).toBe("ap@example.com");
    expect(view.customerProfile.overviewSummary.hierarchySummary).toContain("billing");
    expect(view.customerProfile.contactSummary.hasVerifiedPrimaryContact).toBe(true);
    expect(view.customerProfile.tabs.map((tab) => tab.label)).toContain("AP Portal");
    expect(view.customerIndexEntry.completenessScore).toBeGreaterThan(0);
  });
});
