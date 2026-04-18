import { loadEnv } from "@o2c/config";
import { getBusinessCentralConnectionService } from "../bootstrap/business-central-connection-service.js";

type BusinessCentralCompany = {
  id: string;
  name?: string;
  displayName?: string;
};

type BusinessCentralSalesInvoice = {
  id: string;
  number: string;
  customerId?: string;
  customerNumber?: string;
  customerName?: string;
  billToCustomerNumber?: string;
  billToName?: string;
  shipToContact?: string;
  email?: string;
  invoiceDate?: string;
  postingDate?: string;
  dueDate?: string;
  currencyCode?: string;
  remainingAmount?: number;
  totalAmountIncludingTax?: number;
  status?: string;
  lastModifiedDateTime?: string;
};

export type BusinessCentralInvoiceRecord = {
  externalId: string;
  invoiceNumber: string;
  customerName: string;
  customerNumber?: string;
  contactName?: string;
  email?: string;
  currencyCode: string;
  totalAmountCents: number;
  remainingAmountCents: number;
  dueDate?: string;
  invoiceDate?: string;
  status: string;
  companyId: string;
  companyName?: string;
};

type BusinessCentralLegacyConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  environment: string;
  companyId?: string;
  companyName?: string;
  baseUrl: string;
};

export type BusinessCentralIntegrationStatus =
  | { kind: "customer_connected"; companyName?: string; environment: string; tenantSlug: string }
  | { kind: "not_configured" };

export function isBusinessCentralConfigured() {
  return getBusinessCentralIntegrationStatus(loadEnv().DEFAULT_TENANT_SLUG).kind === "customer_connected";
}

export function getBusinessCentralIntegrationStatus(tenantSlug: string): BusinessCentralIntegrationStatus {
  const connectionService = getBusinessCentralConnectionService();
  const connection = connectionService.getConnectionSummary(tenantSlug);
  if (connection) {
    return {
      kind: "customer_connected",
      ...(connection.companyName ? { companyName: connection.companyName } : {}),
      environment: connection.environment,
      tenantSlug,
    };
  }

  return { kind: "not_configured" };
}

export async function loadBusinessCentralSalesInvoices(tenantSlug = loadEnv().DEFAULT_TENANT_SLUG) {
  return loadBusinessCentralSalesInvoicesFromCustomerConnection(tenantSlug);
}

async function loadBusinessCentralSalesInvoicesFromCustomerConnection(tenantSlug: string) {
  const connectionService = getBusinessCentralConnectionService();
  const connection = connectionService.getConnectionSummary(tenantSlug);
  if (!connection) {
    return undefined;
  }

  const token = await connectionService.getAccessToken(tenantSlug);
  if (!token) {
    return undefined;
  }

  const baseUrl =
    readEnv((loadEnv() as unknown as Record<string, string | number | undefined>).INTEGRATION_BUSINESS_CENTRAL_BASE_URL) ??
    "https://api.businesscentral.dynamics.com";
  const company: BusinessCentralCompany = {
    id: connection.companyId,
    ...(connection.companyName ? { displayName: connection.companyName } : {}),
  };
  const invoices = await fetchSalesInvoices(baseUrl, connection.environment, token, connection.companyId);

  return {
    company,
    invoices: invoices.map((invoice) => mapInvoice(company, invoice)),
  };
}

async function fetchSalesInvoices(
  baseUrl: string,
  environment: string,
  token: string,
  companyId: string
) {
  const query = new URLSearchParams({
    $top: "25",
    $orderby: "lastModifiedDateTime desc",
  });
  const response = await runtimeFetch()(
    `${baseUrl}/v2.0/${environment}/api/v2.0/companies(${companyId})/salesInvoices?${query.toString()}`,
    {
      headers: {
        authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Business Central salesInvoices request failed with ${response.status}.`);
  }

  const body = (await response.json()) as { value?: BusinessCentralSalesInvoice[] };
  return Array.isArray(body.value) ? body.value : [];
}

function mapInvoice(company: BusinessCentralCompany, invoice: BusinessCentralSalesInvoice): BusinessCentralInvoiceRecord {
  return {
    externalId: invoice.id,
    invoiceNumber: invoice.number,
    customerName: invoice.customerName ?? invoice.billToName ?? "Unknown customer",
    ...(invoice.customerNumber ? { customerNumber: invoice.customerNumber } : {}),
    ...(invoice.shipToContact ? { contactName: invoice.shipToContact } : {}),
    ...(invoice.email ? { email: invoice.email } : {}),
    currencyCode: invoice.currencyCode ?? "PHP",
    totalAmountCents: decimalToCents(invoice.totalAmountIncludingTax ?? 0),
    remainingAmountCents: decimalToCents(invoice.remainingAmount ?? invoice.totalAmountIncludingTax ?? 0),
    ...(invoice.dueDate ? { dueDate: invoice.dueDate } : {}),
    ...(invoice.invoiceDate ?? invoice.postingDate
      ? { invoiceDate: invoice.invoiceDate ?? invoice.postingDate }
      : {}),
    status: (invoice.status ?? "Open").toLowerCase(),
    companyId: company.id,
    ...(company.displayName ?? company.name ? { companyName: company.displayName ?? company.name } : {}),
  };
}

function decimalToCents(value: number) {
  return Math.round(value * 100);
}

function readEnv(value: string | number | undefined) {
  return typeof value === "number" ? String(value) : value?.trim();
}

function runtimeFetch() {
  return globalThis.fetch as unknown as (
    input: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: URLSearchParams;
    }
  ) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}
