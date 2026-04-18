import type { DomainEntity } from "../../shared/types.js";

export interface ParentAccount extends DomainEntity {
  name: string;
  externalReference?: string;
  status: "active" | "inactive";
  centrallyServiced?: boolean;
  metadata: Record<string, unknown>;
}

export interface Branch extends DomainEntity {
  parentAccountId: string;
  billingAccountId: string;
  code: string;
  name: string;
  region?: string;
  countryCode?: string;
  status: "active" | "inactive";
  metadata: Record<string, unknown>;
}

export interface BillingAccount extends DomainEntity {
  parentAccountId: string;
  branchId?: string;
  accountNumber: string;
  displayName: string;
  currency: string;
  accountTier: "standard" | "strategic";
  erpCustomerId?: string;
  status: "active" | "inactive";
  centrallyPaid: boolean;
  metadata: Record<string, unknown>;
}

export const routingLevels = ["parent_account", "billing_account", "branch"] as const;

export type RoutingLevel = (typeof routingLevels)[number];

export type ContactScope = "parent_account" | "billing_account" | "branch" | "invoice";

export type ContactRole =
  | "customer"
  | "collector"
  | "approver"
  | "internal"
  | "ap"
  | "shared_finance"
  | "treasury"
  | "branch"
  | "invoice";

export interface Contact extends DomainEntity {
  parentAccountId: string;
  billingAccountId?: string;
  branchId?: string;
  invoiceId?: string;
  scope: ContactScope;
  scopeId: string;
  fullName: string;
  email?: string;
  phone?: string;
  role: ContactRole;
  isPrimary: boolean;
  isVerified: boolean;
  allowAutoSend: boolean;
  recentSuccessfulResponses: number;
  metadata: Record<string, unknown>;
}

export interface CustomerConfiguration extends DomainEntity {
  parentAccountId?: string;
  billingAccountId?: string;
  centralizedPayerEnabled: boolean;
  centrallyServiced: boolean;
}

export interface CustomerHierarchy {
  parentAccounts: ParentAccount[];
  billingAccounts: BillingAccount[];
  branches: Branch[];
  contacts: Contact[];
  configurations: CustomerConfiguration[];
}

export function defaultRoutingLevel(): RoutingLevel {
  return "billing_account";
}
