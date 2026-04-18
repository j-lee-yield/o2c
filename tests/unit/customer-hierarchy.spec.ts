import { describe, expect, it } from "vitest";

import {
  customerHierarchyDdl,
  customerHierarchyTables,
  HierarchyQueries,
  InMemoryCustomerHierarchyRepository
} from "../../packages/database/src/index.js";
import {
  buildRealisticMultiBranchFixture,
  buildSimpleCustomerFixture
} from "../../packages/seed/src/fixtures/customer-hierarchy.js";

describe("customer hierarchy foundation", () => {
  it("exposes schema support for hierarchy rollups", () => {
    expect(customerHierarchyTables.billingAccounts).toBe("billing_accounts");
    expect(customerHierarchyDdl).toContain("create table branches");
    expect(customerHierarchyDdl).toContain("branch_id text references branches");
  });

  it("supports simple customers reusing the same entity across all three levels", () => {
    const fixture = buildSimpleCustomerFixture();

    expect(fixture.parentAccounts[0]?.id).toBe("simple-customer");
    expect(fixture.billingAccounts[0]?.id).toBe("simple-customer");
    expect(fixture.branches[0]?.id).toBe("simple-customer");
    expect(fixture.invoices[0]?.branchId).toBe("simple-customer");
  });

  it("rejects branches that do not roll up to a known billing account", () => {
    const fixture = buildRealisticMultiBranchFixture({ siblingBillingAccounts: 1 });
    fixture.branches[0] = {
      ...fixture.branches[0]!,
      billingAccountId: "missing-billing"
    };

    expect(() => new InMemoryCustomerHierarchyRepository(fixture)).toThrow(
      /must roll up to a known billing account/
    );
  });

  it("rejects invoices that point at unknown branches", () => {
    const fixture = buildRealisticMultiBranchFixture({ siblingBillingAccounts: 1 });
    fixture.invoices[0] = {
      ...fixture.invoices[0]!,
      branchId: "missing-branch"
    };

    expect(() => new InMemoryCustomerHierarchyRepository(fixture)).toThrow(
      /references unknown branch/
    );
  });

  it("provides hierarchy-aware query helpers", () => {
    const fixture = buildRealisticMultiBranchFixture({ siblingBillingAccounts: 3 });
    const repository = new InMemoryCustomerHierarchyRepository(fixture);
    const queries = new HierarchyQueries(repository);

    expect(queries.getInvoiceRollup("invoice-1-3")?.parentAccount.id).toBe("parent-acme");
    expect(queries.listBranchesForBillingAccount("bill-acme-1")).toHaveLength(4);
    expect(queries.listSiblingBillingAccounts("bill-acme-1").map((account) => account.id)).toEqual([
      "bill-acme-2",
      "bill-acme-3"
    ]);
  });
});
