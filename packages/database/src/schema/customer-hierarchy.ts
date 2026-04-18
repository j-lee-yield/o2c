export const customerHierarchyTables = {
  parentAccounts: "parent_accounts",
  billingAccounts: "billing_accounts",
  branches: "branches",
  invoices: "invoices",
  contacts: "contacts",
  customerConfigurations: "customer_configurations"
} as const;

export const customerHierarchyDdl = `
create table parent_accounts (
  id text primary key,
  name text not null,
  status text not null,
  centrally_serviced boolean default false
);

create table billing_accounts (
  id text primary key,
  parent_account_id text not null references parent_accounts(id),
  account_number text not null,
  display_name text not null,
  currency text not null,
  status text not null,
  centrally_paid boolean not null default false
);

create table branches (
  id text primary key,
  parent_account_id text not null references parent_accounts(id),
  billing_account_id text not null references billing_accounts(id),
  code text not null,
  name text not null,
  status text not null default 'active'
);

create table invoices (
  id text primary key,
  parent_account_id text not null references parent_accounts(id),
  billing_account_id text not null references billing_accounts(id),
  branch_id text references branches(id),
  invoice_number text not null
);

create table contacts (
  id text primary key,
  parent_account_id text not null references parent_accounts(id),
  billing_account_id text references billing_accounts(id),
  branch_id text references branches(id),
  invoice_id text references invoices(id),
  scope text not null,
  scope_id text not null,
  email text,
  role text not null,
  is_verified boolean not null default false,
  allow_auto_send boolean not null default false,
  recent_successful_responses integer not null default 0
);

create table customer_configurations (
  id text primary key,
  parent_account_id text references parent_accounts(id),
  billing_account_id text references billing_accounts(id),
  centralized_payer_enabled boolean not null default false,
  centrally_serviced boolean not null default false
);
`.trim();
