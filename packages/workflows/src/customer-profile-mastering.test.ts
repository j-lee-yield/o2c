import { describe, expect, it } from "vitest";

import { InMemoryAuditLogger } from "@o2c/audit";
import { CustomerProfileMasteringService, InMemoryCustomerProfileMasteringStore } from "./customer-profile-mastering.js";

describe("customer profile mastering workflow", () => {
  it("routes duplicate matches below 99% confidence to human review", async () => {
    const auditLogger = new InMemoryAuditLogger();
    const store = new InMemoryCustomerProfileMasteringStore();
    const service = new CustomerProfileMasteringService({ store, auditLogger });
    const principal = { id: "manager-1", roles: ["ar_manager"] as const };
    const auditContext = {
      actorId: "manager-1",
      actorType: "user" as const,
      correlationId: "corr-1",
      occurredAt: "2026-04-03T00:00:00.000Z",
    };

    await service.ingest(principal, auditContext, {
      id: "profile-existing",
      source: "erp_accounting",
      occurredAt: auditContext.occurredAt,
      hierarchy: {},
      legalEntityName: "Metro Retail Group",
      contacts: [{ fullName: "AP", email: "ap@metro.example", role: "ap", isVerified: true }],
    });

    const result = await service.ingest(principal, auditContext, {
      id: "profile-new",
      source: "spreadsheet_fallback",
      occurredAt: auditContext.occurredAt,
      hierarchy: {},
      legalEntityName: "Metro Retail Group Limited",
      billingAccountName: "Metro Retail Group",
      contacts: [{ fullName: "Maria Santos", email: "maria@metro.example", role: "ap" }],
    });

    expect(result.profile.status).toBe("pending_review");
    expect(result.mergeSuggestion?.status).toBe("pending_review");
    expect(result.reviewTask?.taskType).toBe("review_duplicate_customer");
  });

  it("supports safe creation from ERP, spreadsheet, and extracted document sources", async () => {
    const auditLogger = new InMemoryAuditLogger();
    const store = new InMemoryCustomerProfileMasteringStore();
    const service = new CustomerProfileMasteringService({ store, auditLogger });
    const principal = { id: "ops-1", roles: ["ar_manager"] as const };
    const auditContext = {
      actorId: "ops-1",
      actorType: "user" as const,
      correlationId: "corr-2",
      occurredAt: "2026-04-03T01:00:00.000Z",
    };

    for (const [id, source] of [
      ["erp-profile", "erp_accounting"],
      ["sheet-profile", "spreadsheet_fallback"],
      ["doc-profile", "document_extracted"],
    ] as const) {
      const result = await service.ingest(principal, auditContext, {
        id,
        source,
        occurredAt: auditContext.occurredAt,
        hierarchy: {},
        billingAccountName: `${source}-customer`,
        contacts: [{ fullName: "AP", role: "ap" }],
      });
      expect(result.profile.id).toBe(id);
      expect(result.profile.sourceKinds).toContain(source);
    }
  });

  it("creates tasks with customer linkage and audit trails", async () => {
    const auditLogger = new InMemoryAuditLogger();
    const store = new InMemoryCustomerProfileMasteringStore();
    const service = new CustomerProfileMasteringService({ store, auditLogger });
    const principal = { id: "manager-2", roles: ["ar_manager"] as const };
    const auditContext = {
      actorId: "manager-2",
      actorType: "user" as const,
      correlationId: "corr-3",
      occurredAt: "2026-04-03T02:00:00.000Z",
    };

    await service.ingest(principal, auditContext, {
      id: "profile-a",
      source: "erp_accounting",
      occurredAt: auditContext.occurredAt,
      hierarchy: {},
      legalEntityName: "Alpha Foods",
      contacts: [{ fullName: "AP", email: "ap@alpha.example", role: "ap", isVerified: true }],
    });
    const result = await service.ingest(principal, auditContext, {
      id: "profile-b",
      source: "spreadsheet_fallback",
      occurredAt: auditContext.occurredAt,
      hierarchy: {},
      legalEntityName: "Alpha Foods Corp",
      billingAccountName: "Alpha Foods",
      contacts: [{ fullName: "AP Team", email: "ap@alpha.example", role: "shared_finance" }],
    });

    const tasks = service.listTasks({ executionType: "human" });
    expect(tasks[0]?.customerProfileId).toBe(result.profile.id);
    expect(tasks[0]?.auditTrail[0]?.action).toBe("task.created");
  });

  it("approves and rejects merge suggestions safely", async () => {
    const auditLogger = new InMemoryAuditLogger();
    const store = new InMemoryCustomerProfileMasteringStore();
    const service = new CustomerProfileMasteringService({ store, auditLogger });
    const principal = { id: "manager-3", roles: ["ar_manager"] as const };
    const auditContext = {
      actorId: "manager-3",
      actorType: "user" as const,
      correlationId: "corr-4",
      occurredAt: "2026-04-03T03:00:00.000Z",
    };

    await service.ingest(principal, auditContext, {
      id: "merge-target",
      source: "erp_accounting",
      occurredAt: auditContext.occurredAt,
      hierarchy: {},
      legalEntityName: "Bravo Trading",
      contacts: [{ fullName: "AP", email: "ap@bravo.example", role: "ap", isVerified: true }],
    });
    const pending = await service.ingest(principal, auditContext, {
      id: "merge-source",
      source: "spreadsheet_fallback",
      occurredAt: auditContext.occurredAt,
      hierarchy: {},
      legalEntityName: "Bravo Trading Limited",
      billingAccountName: "Bravo Trading",
      contacts: [{ fullName: "Bravo AP", email: "finance@bravo.example", role: "shared_finance" }],
    });
    const approved = await service.approveMergeSuggestion(
      principal,
      auditContext,
      pending.mergeSuggestion!.id,
    );
    expect(approved.suggestion.status).toBe("approved");

    const secondPending = await service.ingest(principal, auditContext, {
      id: "merge-source-2",
      source: "spreadsheet_fallback",
      occurredAt: auditContext.occurredAt,
      hierarchy: {},
      legalEntityName: "Bravo Trading Holdings",
      billingAccountName: "Bravo Trading",
      contacts: [{ fullName: "Treasury", email: "treasury@bravo.example", role: "treasury" }],
    });
    const rejected = await service.rejectMergeSuggestion(
      principal,
      auditContext,
      secondPending.mergeSuggestion!.id,
    );
    expect(rejected.suggestion.status).toBe("rejected");
    expect(rejected.profile.status).toBe("active");
  });

  it("records audit events for material mastering actions", async () => {
    const auditLogger = new InMemoryAuditLogger();
    const store = new InMemoryCustomerProfileMasteringStore();
    const service = new CustomerProfileMasteringService({ store, auditLogger });
    const principal = { id: "manager-4", roles: ["ar_manager"] as const };
    const auditContext = {
      actorId: "manager-4",
      actorType: "user" as const,
      correlationId: "corr-5",
      occurredAt: "2026-04-03T04:00:00.000Z",
    };

    await service.ingest(principal, auditContext, {
      id: "audit-profile",
      source: "erp_accounting",
      occurredAt: auditContext.occurredAt,
      hierarchy: {},
      legalEntityName: "Audit Co",
      contacts: [{ fullName: "AP", email: "ap@audit.example", role: "ap", isVerified: true }],
    });

    expect(auditLogger.events.map(({ event }) => event.action)).toContain("customer_profile.ingested");
  });
});
