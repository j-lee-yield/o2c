import type { ContactRole, ContactScope, RoutingLevel } from "@o2c/domain";

export interface ContactRoutingPolicyEntry {
  scope: ContactScope;
  roles: ContactRole[];
}

export interface RoutingPolicy {
  collections: {
    defaultLevel: RoutingLevel;
  };
  cashApplication: {
    allowAutoApplyAcrossBillingAccounts: boolean;
    searchOrder: [
      "billing_account",
      "branches_under_billing",
      "sibling_billing_accounts_if_centralized_or_indicated"
    ];
  };
  contactRouting: {
    precedence: [ContactRoutingPolicyEntry, ContactRoutingPolicyEntry, ContactRoutingPolicyEntry];
    autoSendRequiresVerifiedContact: boolean;
    autoSendRequiresAllowFlag: boolean;
  };
}

export const defaultRoutingPolicy: RoutingPolicy = {
  collections: {
    defaultLevel: "billing_account"
  },
  cashApplication: {
    allowAutoApplyAcrossBillingAccounts: false,
    searchOrder: [
      "billing_account",
      "branches_under_billing",
      "sibling_billing_accounts_if_centralized_or_indicated"
    ]
  },
  contactRouting: {
    precedence: [
      { scope: "billing_account", roles: ["ap", "shared_finance"] },
      { scope: "invoice", roles: ["invoice", "branch"] },
      { scope: "parent_account", roles: ["treasury", "ap"] }
    ],
    autoSendRequiresVerifiedContact: true,
    autoSendRequiresAllowFlag: true
  }
};

export function createRoutingPolicy(overrides: Partial<RoutingPolicy> = {}): RoutingPolicy {
  return {
    collections: {
      ...defaultRoutingPolicy.collections,
      ...overrides.collections
    },
    cashApplication: {
      ...defaultRoutingPolicy.cashApplication,
      ...overrides.cashApplication
    },
    contactRouting: {
      ...defaultRoutingPolicy.contactRouting,
      ...overrides.contactRouting
    }
  };
}
