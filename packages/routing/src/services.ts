import type { BillingAccount, Contact, CustomerInvoice, RoutingLevel } from "@o2c/domain";
import { defaultRoutingLevel } from "@o2c/domain";
import type { InvoiceHierarchyContext } from "@o2c/database";
import { InMemoryCustomerHierarchyRepository } from "@o2c/database";
import type { RoutingPolicy } from "./policy-config.js";
import {
  BillingAccountNotFoundError,
  InvoiceHierarchyContextNotFoundError,
} from "./errors.js";

export interface CollectionRoute {
  level: RoutingLevel;
  ownerAccountId: string;
  branchId: string | undefined;
  parentAccountId: string;
  reason: string;
}

export interface CashApplicationSuggestion {
  account: BillingAccount;
  decision: "auto_apply" | "suggest";
  reason: "centralized_payer" | "cross_billing_signal";
}

export interface CashApplicationSearchResult {
  primaryBillingAccount: BillingAccount;
  branches: NonNullable<InvoiceHierarchyContext["branch"]>[];
  siblingBillingAccounts: CashApplicationSuggestion[];
  searchOrder: RoutingPolicy["cashApplication"]["searchOrder"];
}

export interface ContactResolution {
  kind: "resolved_contact";
  contact: Contact;
  canAutoSend: boolean;
  requiresApproval: boolean;
}

export interface ContactMissingException {
  kind: "contact_missing_exception";
  invoiceId: string;
  billingAccountId: string;
  branchId: string | undefined;
  reason: "no_verified_contact";
}

export class CollectionsRoutingService {
  constructor(
    private readonly repository: InMemoryCustomerHierarchyRepository,
    private readonly policy: RoutingPolicy
  ) {}

  getRouteForInvoice(invoiceId: string): CollectionRoute {
    const context = this.repository.getInvoiceContext(invoiceId);
    if (!context) {
      throw new InvoiceHierarchyContextNotFoundError(invoiceId);
    }

    return {
      level: this.policy.collections.defaultLevel,
      ownerAccountId: context.billingAccount.id,
      branchId: context.branch?.id,
      parentAccountId: context.parentAccount.id,
      reason: "Billing account is the default collections routing level."
    };
  }
}

export class CashApplicationRoutingService {
  constructor(
    private readonly repository: InMemoryCustomerHierarchyRepository,
    private readonly policy: RoutingPolicy
  ) {}

  search(options: {
    billingAccountId: string;
    references?: Array<{ kind: string; value: string }>;
    remittanceHints?: Array<{ kind: string; value: string }>;
  }): CashApplicationSearchResult {
    const billingAccount = this.repository.getBillingAccount(options.billingAccountId);
    if (!billingAccount) {
      throw new BillingAccountNotFoundError(options.billingAccountId);
    }

    const billingConfiguration = this.repository.getConfigurationForBillingAccount(billingAccount.id);
    const parentConfiguration = this.repository.getConfigurationForParentAccount(
      billingAccount.parentAccountId
    );
    const crossBillingSignal = Boolean(
      options.references?.some((reference) => reference.kind === "sibling_billing_account") ||
        options.remittanceHints?.some((hint) => hint.kind === "cross_billing_reference")
    );
    const centralizedPayer = Boolean(
      billingAccount.centrallyPaid ||
        billingConfiguration?.centralizedPayerEnabled ||
        parentConfiguration?.centralizedPayerEnabled
    );

    return {
      primaryBillingAccount: billingAccount,
      branches: this.repository.getBranchesByBillingAccount(billingAccount.id),
      siblingBillingAccounts:
        centralizedPayer || crossBillingSignal
          ? this.repository.getSiblingBillingAccounts(billingAccount.id).map((account) => ({
              account,
              decision:
                centralizedPayer && this.policy.cashApplication.allowAutoApplyAcrossBillingAccounts
                  ? "auto_apply"
                  : "suggest",
              reason: centralizedPayer ? "centralized_payer" : "cross_billing_signal"
            }))
          : [],
      searchOrder: this.policy.cashApplication.searchOrder
    };
  }
}

export class ContactRoutingService {
  constructor(
    private readonly repository: InMemoryCustomerHierarchyRepository,
    private readonly policy: RoutingPolicy
  ) {}

  resolveInvoiceContact(invoiceId: string): ContactResolution | ContactMissingException {
    const context = this.repository.getInvoiceContext(invoiceId);
    if (!context) {
      throw new InvoiceHierarchyContextNotFoundError(invoiceId);
    }

    const contact = firstVerifiedByPrecedence([
      this.filterRoles(this.repository.getContacts("billing_account", context.billingAccount.id), [
        "ap",
        "shared_finance"
      ]),
      this.collectInvoiceAndBranchCandidates(context),
      this.allowParentLevelContacts(context)
        ? this.filterRoles(this.repository.getContacts("parent_account", context.parentAccount.id), [
            "treasury",
            "ap"
          ])
        : []
    ]);

    if (!contact) {
      return {
        kind: "contact_missing_exception",
        invoiceId,
        billingAccountId: context.billingAccount.id,
        branchId: context.branch?.id,
        reason: "no_verified_contact"
      };
    }

    const canAutoSend = this.canAutoSend(contact);
    return {
      kind: "resolved_contact",
      contact,
      canAutoSend,
      requiresApproval: !canAutoSend
    };
  }

  private collectInvoiceAndBranchCandidates(context: InvoiceHierarchyContext): Contact[] {
    const candidates: Contact[] = [];
    const invoiceSpecificContact = this.repository.findInvoiceSpecificContact(context.invoice.id);
    if (invoiceSpecificContact) {
      candidates.push(invoiceSpecificContact);
    }

    if (context.branch) {
      candidates.push(
        ...this.filterRoles(this.repository.getContacts("branch", context.branch.id), ["branch"])
      );
    }

    return candidates;
  }

  private allowParentLevelContacts(context: InvoiceHierarchyContext): boolean {
    const billingConfiguration = this.repository.getConfigurationForBillingAccount(
      context.billingAccount.id
    );
    const parentConfiguration = this.repository.getConfigurationForParentAccount(
      context.parentAccount.id
    );

    return Boolean(
      context.billingAccount.centrallyPaid ||
        billingConfiguration?.centralizedPayerEnabled ||
        parentConfiguration?.centralizedPayerEnabled ||
        parentConfiguration?.centrallyServiced
    );
  }

  private filterRoles(contacts: Contact[], roles: Contact["role"][]): Contact[] {
    return contacts.filter((contact) => roles.includes(contact.role));
  }

  private canAutoSend(contact: Contact): boolean {
    if (this.policy.contactRouting.autoSendRequiresVerifiedContact && !contact.isVerified) {
      return false;
    }

    if (this.policy.contactRouting.autoSendRequiresAllowFlag && !contact.allowAutoSend) {
      return false;
    }

    return true;
  }
}

export function routeInvoiceForCollections(invoice: CustomerInvoice): CollectionRoute {
  return {
    level: defaultRoutingLevel(),
    ownerAccountId: invoice.billingAccountId,
    branchId: invoice.branchId,
    parentAccountId: invoice.parentAccountId,
    reason: "Billing account is the default collections routing level."
  };
}

function firstVerifiedByPrecedence(groups: Contact[][]): Contact | undefined {
  for (const group of groups) {
    const strongest = [...group]
      .filter((contact) => contact.isVerified)
      .sort((left, right) => {
        const responseDelta = right.recentSuccessfulResponses - left.recentSuccessfulResponses;
        if (responseDelta !== 0) {
          return responseDelta;
        }
        return left.id.localeCompare(right.id);
      })[0];

    if (strongest) {
      return strongest;
    }
  }

  return undefined;
}
