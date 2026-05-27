import type {
  BillingAccount,
  Branch,
  Contact,
  CustomerConfiguration,
  CustomerHierarchy,
  CustomerInvoice,
  ParentAccount
} from "@o2c/domain";

export type InvoiceHierarchyContext = {
  invoice: CustomerInvoice;
  branch: Branch | undefined;
  billingAccount: BillingAccount;
  parentAccount: ParentAccount;
}

type HierarchyFixture = CustomerHierarchy & { invoices: CustomerInvoice[] };

export class InMemoryCustomerHierarchyRepository {
  private readonly parentById: Map<string, ParentAccount>;
  private readonly billingById: Map<string, BillingAccount>;
  private readonly branchById: Map<string, Branch>;
  private readonly invoiceById: Map<string, CustomerInvoice>;
  private readonly contactById: Map<string, Contact>;
  private readonly branchesByBillingId: Map<string, Branch[]>;
  private readonly billingByParentId: Map<string, BillingAccount[]>;
  private readonly contactsByScope: Map<string, Contact[]>;
  private readonly configByBillingId: Map<string, CustomerConfiguration>;
  private readonly configByParentId: Map<string, CustomerConfiguration>;

  constructor(private readonly data: HierarchyFixture) {
    validateHierarchy(data);
    this.parentById = indexBy(data.parentAccounts);
    this.billingById = indexBy(data.billingAccounts);
    this.branchById = indexBy(data.branches);
    this.invoiceById = indexBy(data.invoices);
    this.contactById = indexBy(data.contacts);
    this.branchesByBillingId = new Map();
    this.billingByParentId = new Map();
    this.contactsByScope = new Map();
    this.configByBillingId = new Map();
    this.configByParentId = new Map();

    for (const branch of data.branches) {
      appendGrouped(this.branchesByBillingId, branch.billingAccountId, branch);
    }
    for (const account of data.billingAccounts) {
      appendGrouped(this.billingByParentId, account.parentAccountId, account);
    }
    for (const contact of data.contacts) {
      appendGrouped(this.contactsByScope, `${contact.scope}:${contact.scopeId}`, contact);
    }
    for (const configuration of data.configurations) {
      if (configuration.billingAccountId) {
        this.configByBillingId.set(configuration.billingAccountId, configuration);
      }
      if (configuration.parentAccountId) {
        this.configByParentId.set(configuration.parentAccountId, configuration);
      }
    }
  }

  getInvoiceContext(invoiceId: string): InvoiceHierarchyContext | undefined {
    const invoice = this.invoiceById.get(invoiceId);
    if (!invoice) {
      return undefined;
    }

    const billingAccount = this.billingById.get(invoice.billingAccountId);
    const parentAccount = this.parentById.get(invoice.parentAccountId);
    if (!billingAccount || !parentAccount) {
      throw new Error(`invoice ${invoiceId} is missing hierarchy context`);
    }

    return {
      invoice,
      branch: invoice.branchId ? this.branchById.get(invoice.branchId) : undefined,
      billingAccount,
      parentAccount
    };
  }

  getBillingAccount(billingAccountId: string): BillingAccount | undefined {
    return this.billingById.get(billingAccountId);
  }

  getBranchesByBillingAccount(billingAccountId: string): Branch[] {
    return this.branchesByBillingId.get(billingAccountId) ?? [];
  }

  getBillingAccountsByParent(parentAccountId: string): BillingAccount[] {
    return this.billingByParentId.get(parentAccountId) ?? [];
  }

  getSiblingBillingAccounts(billingAccountId: string): BillingAccount[] {
    const billingAccount = this.billingById.get(billingAccountId);
    if (!billingAccount) {
      return [];
    }

    return this.getBillingAccountsByParent(billingAccount.parentAccountId).filter(
      (candidate) => candidate.id !== billingAccountId
    );
  }

  getContacts(scope: Contact["scope"], scopeId: string): Contact[] {
    return this.contactsByScope.get(`${scope}:${scopeId}`) ?? [];
  }

  findInvoiceSpecificContact(invoiceId: string): Contact | undefined {
    const invoice = this.invoiceById.get(invoiceId);
    if (!invoice?.invoiceContactId) {
      return undefined;
    }

    return this.contactById.get(invoice.invoiceContactId);
  }

  getConfigurationForBillingAccount(billingAccountId: string): CustomerConfiguration | undefined {
    return this.configByBillingId.get(billingAccountId);
  }

  getConfigurationForParentAccount(parentAccountId: string): CustomerConfiguration | undefined {
    return this.configByParentId.get(parentAccountId);
  }
}

function validateHierarchy(data: HierarchyFixture): void {
  const parentIds = new Set(data.parentAccounts.map((account) => account.id));
  const billingIds = new Set(data.billingAccounts.map((account) => account.id));
  const branchIds = new Set(data.branches.map((branch) => branch.id));

  for (const billingAccount of data.billingAccounts) {
    if (!parentIds.has(billingAccount.parentAccountId)) {
      throw new Error(`billing account ${billingAccount.id} must roll up to a known parent account`);
    }
  }

  for (const branch of data.branches) {
    if (!billingIds.has(branch.billingAccountId)) {
      throw new Error(`branch ${branch.id} must roll up to a known billing account`);
    }
  }

  for (const invoice of data.invoices) {
    if (!billingIds.has(invoice.billingAccountId)) {
      throw new Error(`invoice ${invoice.id} must roll up to a known billing account`);
    }
    if (!parentIds.has(invoice.parentAccountId)) {
      throw new Error(`invoice ${invoice.id} must roll up to a known parent account`);
    }
    if (invoice.branchId && !branchIds.has(invoice.branchId)) {
      throw new Error(`invoice ${invoice.id} references unknown branch ${invoice.branchId}`);
    }
  }
}

function indexBy<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function appendGrouped<T>(grouped: Map<string, T[]>, key: string, item: T): void {
  const bucket = grouped.get(key);
  if (bucket) {
    bucket.push(item);
    return;
  }
  grouped.set(key, [item]);
}
