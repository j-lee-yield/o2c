import type { CustomerInvoice } from "@o2c/domain";
import type { InvoiceHierarchyContext } from "../client/in-memory-customer-hierarchy-repository.js";
import { InMemoryCustomerHierarchyRepository } from "../client/in-memory-customer-hierarchy-repository.js";

export class HierarchyQueries {
  private readonly repository: InMemoryCustomerHierarchyRepository;

  constructor(repository: InMemoryCustomerHierarchyRepository) {
    this.repository = repository;
  }

  getInvoiceRollup(invoiceId: string): InvoiceHierarchyContext | undefined {
    return this.repository.getInvoiceContext(invoiceId);
  }

  listBranchesForBillingAccount(billingAccountId: string) {
    return this.repository.getBranchesByBillingAccount(billingAccountId);
  }

  listSiblingBillingAccounts(billingAccountId: string) {
    return this.repository.getSiblingBillingAccounts(billingAccountId);
  }

  listInvoicesForBillingAccount(invoices: CustomerInvoice[], billingAccountId: string): CustomerInvoice[] {
    return invoices.filter((invoice) => invoice.billingAccountId === billingAccountId);
  }
}
