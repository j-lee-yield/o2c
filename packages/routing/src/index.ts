import type { CustomerInvoice, RoutingLevel } from "@o2c/domain";
import { defaultRoutingLevel } from "@o2c/domain";

export type CollectionRoute = {
  level: RoutingLevel;
  ownerAccountId: string;
  branchId?: string;
  parentAccountId: string;
  reason: string;
};

export function routeInvoiceForCollections(invoice: CustomerInvoice): CollectionRoute {
  return {
    level: defaultRoutingLevel(),
    ownerAccountId: invoice.billingAccountId,
    parentAccountId: invoice.parentAccountId,
    ...(invoice.branchId ? { branchId: invoice.branchId } : {}),
    reason: "Billing account is the default collections routing level for Sprint 1.",
  };
}
