import { loadEnv } from "@o2c/config";
import { getQuickBooksConnectionService } from "../bootstrap/quickbooks-connection-service.js";

type QuickBooksReference = {
  value?: string;
  name?: string;
};

type QuickBooksEmail = {
  Address?: string;
};

type QuickBooksPhone = {
  FreeFormNumber?: string;
};

type QuickBooksTxnTaxDetail = {
  TotalTax?: number;
};

type QuickBooksAddress = {
  Line1?: string;
  City?: string;
  CountrySubDivisionCode?: string;
  PostalCode?: string;
};

export type QuickBooksInvoiceRow = {
  Id: string;
  DocNumber?: string;
  CustomerRef?: QuickBooksReference;
  BillEmail?: {
    Address?: string;
  };
  CurrencyRef?: QuickBooksReference;
  TotalAmt?: number;
  Balance?: number;
  DueDate?: string;
  TxnDate?: string;
  MetaData?: {
    LastUpdatedTime?: string;
  };
  PrivateNote?: string;
  TxnTaxDetail?: QuickBooksTxnTaxDetail;
  DepartmentRef?: QuickBooksReference;
  SalesTermRef?: QuickBooksReference;
  CustomField?: Array<{
    Name?: string;
    StringValue?: string;
  }>;
};

export type QuickBooksCustomerRow = {
  Id: string;
  DisplayName?: string;
  CompanyName?: string;
  PrimaryEmailAddr?: QuickBooksEmail;
  PrimaryPhone?: QuickBooksPhone;
  Mobile?: QuickBooksPhone;
  CurrencyRef?: QuickBooksReference;
  ParentRef?: QuickBooksReference;
  BillAddr?: QuickBooksAddress;
  Active?: boolean;
};

export type QuickBooksPaymentRow = {
  Id: string;
  CustomerRef?: QuickBooksReference;
  TotalAmt?: number;
  UnappliedAmt?: number;
  CurrencyRef?: QuickBooksReference;
  TxnDate?: string;
  PaymentRefNum?: string;
  PrivateNote?: string;
  Line?: Array<{
    LinkedTxn?: Array<{
      TxnId?: string;
      TxnType?: string;
    }>;
  }>;
};

type QuickBooksCustomField = NonNullable<QuickBooksInvoiceRow["CustomField"]>[number];

export type QuickBooksInvoiceRecord = {
  externalId: string;
  invoiceNumber: string;
  customerName: string;
  customerNumber?: string;
  email?: string;
  currencyCode: string;
  totalAmountCents: number;
  remainingAmountCents: number;
  dueDate?: string;
  invoiceDate?: string;
  status: string;
  companyId: string;
  companyName?: string;
  parentAccountName?: string;
  branchName?: string;
  branchReference?: string;
};

export type QuickBooksCustomerRecord = {
  externalId: string;
  displayName: string;
  parentAccountName?: string;
  currencyCode: string;
  email?: string;
  phone?: string;
  status: "active" | "inactive";
  billAddressSummary?: string;
};

export type QuickBooksContactRecord = {
  externalId: string;
  customerExternalId: string;
  fullName: string;
  email?: string;
  phone?: string;
  role: "accounts_payable";
};

export type QuickBooksPaymentRecord = {
  externalId: string;
  customerName: string;
  customerNumber?: string;
  paymentReference: string;
  currencyCode: string;
  amountCents: number;
  unappliedAmountCents: number;
  receivedAt: string;
  linkedInvoiceIds: string[];
  memo?: string;
};

export type QuickBooksIntegrationStatus =
  | {
      kind: "customer_connected";
      realmId: string;
      companyName?: string;
      tenantSlug: string;
      environment: "production" | "sandbox";
      connectionHealth: "connected" | "refresh_expiring" | "reconnect_required";
      needsReconnect: boolean;
      reconnectReason?: string;
      accessTokenExpiresAt: string;
      refreshTokenExpiresAt?: string;
    }
  | { kind: "not_configured" };

export function getQuickBooksIntegrationStatus(
  tenantSlug: string,
): QuickBooksIntegrationStatus {
  const connection = getQuickBooksConnectionService().getConnectionSummary(tenantSlug);
  if (!connection) {
    return { kind: "not_configured" };
  }

  return {
    kind: "customer_connected",
    realmId: connection.realmId,
    environment: connection.environment,
    connectionHealth: connection.connectionHealth,
    needsReconnect: connection.needsReconnect,
    accessTokenExpiresAt: connection.accessTokenExpiresAt,
    ...(connection.refreshTokenExpiresAt
      ? { refreshTokenExpiresAt: connection.refreshTokenExpiresAt }
      : {}),
    ...(connection.reconnectReason ? { reconnectReason: connection.reconnectReason } : {}),
    ...(connection.companyName ? { companyName: connection.companyName } : {}),
    tenantSlug,
  };
}

export function isQuickBooksConfigured() {
  return (
    getQuickBooksIntegrationStatus(loadEnv().DEFAULT_TENANT_SLUG).kind === "customer_connected"
  );
}

export async function loadQuickBooksInvoices(
  tenantSlug = loadEnv().DEFAULT_TENANT_SLUG,
) {
  const connection = getQuickBooksConnectionService().getConnectionSummary(tenantSlug);
  if (!connection) {
    return undefined;
  }

  const token = await getQuickBooksConnectionService().getAccessToken(tenantSlug);
  if (!token) {
    return undefined;
  }

  const rows = await fetchInvoices({
    accessToken: token,
    realmId: connection.realmId,
    environment: connection.environment,
  });

  return {
    company: {
      id: connection.realmId,
      ...(connection.companyName ? { displayName: connection.companyName } : {}),
    },
    invoices: rows.map((invoice) =>
      mapQuickBooksInvoiceRow({
        realmId: connection.realmId,
        ...(connection.companyName ? { companyName: connection.companyName } : {}),
        invoice,
      }),
    ),
  };
}

export async function loadQuickBooksCustomers(
  tenantSlug = loadEnv().DEFAULT_TENANT_SLUG,
) {
  const connection = getQuickBooksConnectionService().getConnectionSummary(tenantSlug);
  if (!connection) {
    return undefined;
  }

  const token = await getQuickBooksConnectionService().getAccessToken(tenantSlug);
  if (!token) {
    return undefined;
  }

  const rows = await executeQuickBooksQuery<QuickBooksCustomerRow>({
    accessToken: token,
    realmId: connection.realmId,
    environment: connection.environment,
    query: "SELECT * FROM Customer ORDERBY MetaData.LastUpdatedTime DESC MAXRESULTS 50",
    entityKey: "Customer",
  });

  return {
    company: {
      id: connection.realmId,
      ...(connection.companyName ? { displayName: connection.companyName } : {}),
    },
    customers: rows.map(mapQuickBooksCustomerRow),
    contacts: rows.map(mapQuickBooksContactRow).filter((value): value is QuickBooksContactRecord => Boolean(value)),
  };
}

export async function loadQuickBooksPayments(
  tenantSlug = loadEnv().DEFAULT_TENANT_SLUG,
) {
  const connection = getQuickBooksConnectionService().getConnectionSummary(tenantSlug);
  if (!connection) {
    return undefined;
  }

  const token = await getQuickBooksConnectionService().getAccessToken(tenantSlug);
  if (!token) {
    return undefined;
  }

  const rows = await executeQuickBooksQuery<QuickBooksPaymentRow>({
    accessToken: token,
    realmId: connection.realmId,
    environment: connection.environment,
    query: "SELECT * FROM Payment ORDERBY MetaData.LastUpdatedTime DESC MAXRESULTS 50",
    entityKey: "Payment",
  });

  return {
    company: {
      id: connection.realmId,
      ...(connection.companyName ? { displayName: connection.companyName } : {}),
    },
    payments: rows.map(mapQuickBooksPaymentRow),
  };
}

export function mapQuickBooksInvoiceRow(input: {
  realmId: string;
  companyName?: string;
  invoice: QuickBooksInvoiceRow;
}): QuickBooksInvoiceRecord {
  const customFieldLookup = new Map(
    (input.invoice.CustomField ?? [])
      .filter(
        (field): field is QuickBooksCustomField & { Name: string } =>
          typeof field.Name === "string",
      )
      .map((field) => [field.Name.trim().toLowerCase(), field.StringValue?.trim()]),
  );
  const parentAccountName = customFieldLookup.get("parent_account");
  const branchReference =
    readDefinedTrimmed(
      customFieldLookup.get("branch_code"),
      input.invoice.DepartmentRef?.value,
      input.invoice.DepartmentRef?.name,
    ) ?? undefined;
  const branchName =
    readDefinedTrimmed(
      customFieldLookup.get("branch_name"),
      input.invoice.DepartmentRef?.name,
    ) ?? undefined;
  const remainingAmountCents = decimalToCents(
    input.invoice.Balance ?? input.invoice.TotalAmt ?? 0,
  );

  return {
    externalId: input.invoice.Id,
    invoiceNumber: input.invoice.DocNumber?.trim() || input.invoice.Id,
    customerName: input.invoice.CustomerRef?.name?.trim() || "Unknown customer",
    ...(input.invoice.CustomerRef?.value
      ? { customerNumber: input.invoice.CustomerRef.value.trim() }
      : {}),
    ...(input.invoice.BillEmail?.Address
      ? { email: input.invoice.BillEmail.Address.trim() }
      : {}),
    currencyCode: input.invoice.CurrencyRef?.value?.trim() || "PHP",
    totalAmountCents: decimalToCents(input.invoice.TotalAmt ?? 0),
    remainingAmountCents,
    ...(input.invoice.DueDate ? { dueDate: input.invoice.DueDate } : {}),
    ...(input.invoice.TxnDate ? { invoiceDate: input.invoice.TxnDate } : {}),
    status: mapQuickBooksStatus(remainingAmountCents, input.invoice.TotalAmt ?? 0),
    companyId: input.realmId,
    ...(input.companyName ? { companyName: input.companyName } : {}),
    ...(parentAccountName ? { parentAccountName } : {}),
    ...(branchName ? { branchName } : {}),
    ...(branchReference ? { branchReference } : {}),
  };
}

async function fetchInvoices(input: {
  accessToken: string;
  realmId: string;
  environment: "production" | "sandbox";
}) {
  return executeQuickBooksQuery<QuickBooksInvoiceRow>({
    ...input,
    query: "SELECT * FROM Invoice ORDERBY MetaData.LastUpdatedTime DESC MAXRESULTS 50",
    entityKey: "Invoice",
  });
}

function mapQuickBooksCustomerRow(customer: QuickBooksCustomerRow): QuickBooksCustomerRecord {
  const phone = readDefinedTrimmed(
    customer.PrimaryPhone?.FreeFormNumber,
    customer.Mobile?.FreeFormNumber,
  );

  return {
    externalId: customer.Id,
    displayName:
      readDefinedTrimmed(customer.DisplayName, customer.CompanyName) ?? "Unknown customer",
    ...(customer.ParentRef?.name ? { parentAccountName: customer.ParentRef.name.trim() } : {}),
    currencyCode: customer.CurrencyRef?.value?.trim() || "PHP",
    ...(customer.PrimaryEmailAddr?.Address
      ? { email: customer.PrimaryEmailAddr.Address.trim() }
      : {}),
    ...(phone ? { phone } : {}),
    status: customer.Active === false ? "inactive" : "active",
    ...(summarizeAddress(customer.BillAddr)
      ? { billAddressSummary: summarizeAddress(customer.BillAddr) }
      : {}),
  };
}

function mapQuickBooksContactRow(
  customer: QuickBooksCustomerRow,
): QuickBooksContactRecord | undefined {
  const email = customer.PrimaryEmailAddr?.Address?.trim();
  const phone = readDefinedTrimmed(
    customer.PrimaryPhone?.FreeFormNumber,
    customer.Mobile?.FreeFormNumber,
  );
  if (!email && !phone) {
    return undefined;
  }

  return {
    externalId: `customer-contact:${customer.Id}`,
    customerExternalId: customer.Id,
    fullName:
      readDefinedTrimmed(customer.DisplayName, customer.CompanyName) ?? "Accounts Payable Contact",
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    role: "accounts_payable",
  };
}

function mapQuickBooksPaymentRow(payment: QuickBooksPaymentRow): QuickBooksPaymentRecord {
  const linkedInvoiceIds = (payment.Line ?? []).flatMap((line) =>
    (line.LinkedTxn ?? [])
      .filter(
        (linked): linked is { TxnId: string; TxnType?: string } =>
          typeof linked.TxnId === "string" && linked.TxnId.trim().length > 0,
      )
      .map((linked) => linked.TxnId.trim()),
  );

  return {
    externalId: payment.Id,
    customerName: payment.CustomerRef?.name?.trim() || "Unknown customer",
    ...(payment.CustomerRef?.value
      ? { customerNumber: payment.CustomerRef.value.trim() }
      : {}),
    paymentReference: payment.PaymentRefNum?.trim() || payment.Id,
    currencyCode: payment.CurrencyRef?.value?.trim() || "PHP",
    amountCents: decimalToCents(payment.TotalAmt ?? 0),
    unappliedAmountCents: decimalToCents(payment.UnappliedAmt ?? 0),
    receivedAt: payment.TxnDate?.trim() || new Date().toISOString(),
    linkedInvoiceIds,
    ...(payment.PrivateNote?.trim() ? { memo: payment.PrivateNote.trim() } : {}),
  };
}

async function executeQuickBooksQuery<Row>(input: {
  accessToken: string;
  realmId: string;
  environment: "production" | "sandbox";
  query: string;
  entityKey: string;
}) {
  const query = encodeURIComponent(input.query);
  const response = await runtimeFetch()(
    `${getAccountingBaseUrl(input.environment)}/v3/company/${encodeURIComponent(input.realmId)}/query?query=${query}`,
    {
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`QuickBooks ${input.entityKey.toLowerCase()} query failed with ${response.status}.`);
  }

  const body = (await response.json()) as {
    QueryResponse?: Record<string, Row[] | undefined>;
  };
  const rows = body.QueryResponse?.[input.entityKey];
  return Array.isArray(rows) ? rows : [];
}

function getAccountingBaseUrl(environment: "production" | "sandbox") {
  return environment === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}

function mapQuickBooksStatus(balanceAmount: number, totalAmount: number) {
  const totalAmountCents = decimalToCents(totalAmount);
  if (totalAmountCents <= 0) {
    return "voided";
  }
  if (balanceAmount <= 0) {
    return "paid";
  }
  if (balanceAmount < totalAmountCents) {
    return "partial";
  }
  return "open";
}

function decimalToCents(value: number) {
  return Math.round(value * 100);
}

function readDefinedTrimmed(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

function summarizeAddress(address?: QuickBooksAddress) {
  if (!address) {
    return undefined;
  }

  const parts = [
    address.Line1,
    address.City,
    address.CountrySubDivisionCode,
    address.PostalCode,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return parts.length > 0 ? parts.join(", ") : undefined;
}

function runtimeFetch() {
  return globalThis.fetch as unknown as (
    input: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: URLSearchParams;
    },
  ) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}
