import { describe, expect, it } from "vitest";

import { InMemoryCustomerHierarchyRepository } from "../../packages/database/src/index.js";
import {
  BillingAccountNotFoundError,
  CashApplicationRoutingService,
  CollectionsRoutingService,
  ContactRoutingService,
  InvoiceHierarchyContextNotFoundError,
  createRoutingPolicy
} from "../../packages/routing/src/index.js";
import { buildRealisticMultiBranchFixture } from "../../packages/seed/src/fixtures/customer-hierarchy.js";

describe("routing services", () => {
  it("routes collections to the billing account by default", () => {
    const repository = new InMemoryCustomerHierarchyRepository(buildRealisticMultiBranchFixture());
    const service = new CollectionsRoutingService(repository, createRoutingPolicy());

    expect(service.getRouteForInvoice("invoice-1-2")).toMatchObject({
      level: "billing_account",
      ownerAccountId: "bill-acme-1",
      branchId: "branch-1-2",
      parentAccountId: "parent-acme"
    });
  });

  it("searches billing account first, then branches, and only suggests siblings when signaled", () => {
    const repository = new InMemoryCustomerHierarchyRepository(
      buildRealisticMultiBranchFixture({ siblingBillingAccounts: 3 })
    );
    const service = new CashApplicationRoutingService(repository, createRoutingPolicy());

    const search = service.search({
      billingAccountId: "bill-acme-1",
      remittanceHints: [{ kind: "cross_billing_reference", value: "bill-acme-2" }]
    });

    expect(search.primaryBillingAccount.id).toBe("bill-acme-1");
    expect(search.branches).toHaveLength(4);
    expect(search.siblingBillingAccounts).toHaveLength(2);
    expect(search.siblingBillingAccounts.every((candidate) => candidate.decision === "suggest")).toBe(true);
  });

  it("does not include sibling billing accounts without centralized payer or signal", () => {
    const repository = new InMemoryCustomerHierarchyRepository(
      buildRealisticMultiBranchFixture({ siblingBillingAccounts: 3 })
    );
    const service = new CashApplicationRoutingService(repository, createRoutingPolicy());

    expect(service.search({ billingAccountId: "bill-acme-1" }).siblingBillingAccounts).toHaveLength(0);
  });

  it("permits cross-billing auto-apply only for centralized payers", () => {
    const repository = new InMemoryCustomerHierarchyRepository(
      buildRealisticMultiBranchFixture({ centralizedPayer: true, siblingBillingAccounts: 2 })
    );
    const service = new CashApplicationRoutingService(
      repository,
      createRoutingPolicy({
        cashApplication: {
          allowAutoApplyAcrossBillingAccounts: true,
          searchOrder: [
            "billing_account",
            "branches_under_billing",
            "sibling_billing_accounts_if_centralized_or_indicated"
          ]
        }
      })
    );

    expect(
      service.search({
        billingAccountId: "bill-acme-1",
        references: [{ kind: "sibling_billing_account", value: "bill-acme-2" }]
      }).siblingBillingAccounts[0]?.decision
    ).toBe("auto_apply");
  });

  it("prefers verified billing AP history over invoice or branch contacts", () => {
    const fixture = buildRealisticMultiBranchFixture();
    fixture.contacts = fixture.contacts.map((contact) =>
      contact.id === "contact-invoice-1-1"
        ? { ...contact, recentSuccessfulResponses: 99 }
        : contact
    );
    const repository = new InMemoryCustomerHierarchyRepository(fixture);
    const service = new ContactRoutingService(repository, createRoutingPolicy());
    const resolution = service.resolveInvoiceContact("invoice-1-1");

    expect(resolution.kind).toBe("resolved_contact");
    if (resolution.kind === "resolved_contact") {
      expect(resolution.contact.email).toBe("ap-1@acme.example");
      expect(resolution.canAutoSend).toBe(true);
    }
  });

  it("creates a contact-missing exception when no verified contact exists", () => {
    const fixture = buildRealisticMultiBranchFixture();
    fixture.contacts = fixture.contacts
      .filter((contact) => contact.id !== "contact-bill-acme-1-ap")
      .map((contact) =>
        contact.id === "contact-invoice-1-1" || contact.id === "contact-branch-1-1"
          ? { ...contact, isVerified: false, allowAutoSend: false }
          : contact
      );
    const repository = new InMemoryCustomerHierarchyRepository(fixture);
    const service = new ContactRoutingService(repository, createRoutingPolicy());

    expect(service.resolveInvoiceContact("invoice-1-1")).toMatchObject({
      kind: "contact_missing_exception",
      reason: "no_verified_contact"
    });
  });

  it("throws typed exceptions for missing hierarchy context or billing accounts", () => {
    const repository = new InMemoryCustomerHierarchyRepository(buildRealisticMultiBranchFixture());
    const policy = createRoutingPolicy();

    expect(() => new CollectionsRoutingService(repository, policy).getRouteForInvoice("missing")).toThrowError(
      InvoiceHierarchyContextNotFoundError
    );
    expect(() =>
      new ContactRoutingService(repository, policy).resolveInvoiceContact("missing")
    ).toThrowError(InvoiceHierarchyContextNotFoundError);
    expect(() =>
      new CashApplicationRoutingService(repository, policy).search({
        billingAccountId: "missing"
      })
    ).toThrowError(BillingAccountNotFoundError);
  });
});
