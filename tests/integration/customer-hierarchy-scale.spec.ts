import { describe, expect, it } from "vitest";

import { InMemoryCustomerHierarchyRepository } from "../../packages/database/src/index.js";
import {
  CashApplicationRoutingService,
  CollectionsRoutingService,
  createRoutingPolicy
} from "../../packages/routing/src/index.js";
import { buildHundredsOfBranchesFixture } from "../../packages/seed/src/fixtures/customer-hierarchy.js";

describe("customer hierarchy scale", () => {
  it("handles customers with hundreds of branches without changing routing semantics", () => {
    const fixture = buildHundredsOfBranchesFixture(400);
    const repository = new InMemoryCustomerHierarchyRepository(fixture);
    const policy = createRoutingPolicy();

    const collectionsService = new CollectionsRoutingService(repository, policy);
    const cashApplicationService = new CashApplicationRoutingService(repository, policy);

    expect(collectionsService.getRouteForInvoice("invoice-1-400")).toMatchObject({
      ownerAccountId: "bill-acme-1",
      branchId: "branch-1-400"
    });
    expect(cashApplicationService.search({ billingAccountId: "bill-acme-1" }).branches).toHaveLength(
      400
    );
  });
});
