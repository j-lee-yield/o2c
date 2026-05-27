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
  paymentTermsId?: string;
  paymentTermsCode?: string;
  externalDocumentNumber?: string;
  orderNumber?: string;
  invoiceDate?: string;
  postingDate?: string;
  dueDate?: string;
  currencyCode?: string;
  remainingAmount?: number;
  totalAmountIncludingTax?: number;
  status?: string;
  lastModifiedDateTime?: string;
};

type BusinessCentralCustomer = {
  id: string;
  number?: string;
  displayName?: string;
  type?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  phoneNumber?: string;
  email?: string;
  currencyCode?: string;
  paymentTermsId?: string;
  paymentMethodId?: string;
  blocked?: string;
  lastModifiedDateTime?: string;
};

type BusinessCentralCustomerPayment = {
  id: string;
  customerId?: string;
  customerNumber?: string;
  contactId?: string;
  postingDate?: string;
  documentNumber?: string;
  externalDocumentNumber?: string;
  amount?: number;
  appliesToInvoiceId?: string;
  appliesToInvoiceNumber?: string;
  description?: string;
  comment?: string;
  lastModifiedDateTime?: string;
};

type BusinessCentralPaymentTerm = {
  id: string;
  code?: string;
  displayName?: string;
  description?: string;
};

type BusinessCentralCompanyInformation = {
  id?: string;
  displayName?: string;
  name?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  phoneNumber?: string;
  faxNumber?: string;
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
  paymentTermsCode?: string;
  paymentTermsLabel?: string;
  customerPurchaseOrderNumber?: string;
  salesOrderNumber?: string;
  externalDocumentNumber?: string;
  issuerCompanyName?: string;
  issuerAddressSummary?: string;
  issuerPhone?: string;
  issuerFax?: string;
};

export type BusinessCentralCustomerRecord = {
  externalId: string;
  customerNumber?: string;
  displayName: string;
  currencyCode: string;
  email?: string;
  phone?: string;
  status: "active" | "inactive";
  billAddressSummary?: string;
};

export type BusinessCentralContactRecord = {
  externalId: string;
  customerExternalId: string;
  fullName: string;
  email?: string;
  phone?: string;
  role: "accounts_payable";
};

export type BusinessCentralPaymentRecord = {
  externalId: string;
  customerExternalId?: string;
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

export async function loadBusinessCentralCustomers(tenantSlug = loadEnv().DEFAULT_TENANT_SLUG) {
  const context = await getBusinessCentralContext(tenantSlug);
  if (!context) {
    return undefined;
  }

  const rows = await fetchCustomers(
    context.baseUrl,
    context.connection.environment,
    context.token,
    context.connection.companyId,
  );

  return {
    company: context.company,
    customers: rows.map(mapCustomer),
    contacts: rows
      .map(mapContact)
      .filter((value): value is BusinessCentralContactRecord => Boolean(value)),
  };
}

export async function loadBusinessCentralPayments(tenantSlug = loadEnv().DEFAULT_TENANT_SLUG) {
  const context = await getBusinessCentralContext(tenantSlug);
  if (!context) {
    return undefined;
  }

  const [payments, customers] = await Promise.all([
    fetchCustomerPayments(
      context.baseUrl,
      context.connection.environment,
      context.token,
      context.connection.companyId,
    ),
    fetchCustomers(
      context.baseUrl,
      context.connection.environment,
      context.token,
      context.connection.companyId,
    ),
  ]);
  const customerLookup = new Map(
    customers.map((customer) => [customer.id, customer.displayName ?? customer.number ?? customer.id]),
  );

  return {
    company: context.company,
    payments: payments.map((payment) => mapPayment(payment, customerLookup)),
  };
}

async function loadBusinessCentralSalesInvoicesFromCustomerConnection(tenantSlug: string) {
  const context = await getBusinessCentralContext(tenantSlug);
  if (!context) {
    return undefined;
  }
  const [invoices, customers, paymentTerms, companyInformation] = await Promise.all([
    fetchSalesInvoices(
      context.baseUrl,
      context.connection.environment,
      context.token,
      context.connection.companyId,
    ),
    fetchCustomers(
      context.baseUrl,
      context.connection.environment,
      context.token,
      context.connection.companyId,
    ),
    fetchPaymentTermsSafe(
      context.baseUrl,
      context.connection.environment,
      context.token,
      context.connection.companyId,
    ),
    fetchCompanyInformationSafe(
      context.baseUrl,
      context.connection.environment,
      context.token,
      context.connection.companyId,
    ),
  ]);
  const customerLookup = new Map(customers.map((customer) => [customer.id, customer]));
  const paymentTermsLookup = new Map(paymentTerms.map((term) => [term.id, term]));

  return {
    company: context.company,
    invoices: invoices.map((invoice) =>
      mapInvoice(
        context.company,
        invoice,
        customerLookup.get(invoice.customerId ?? ""),
        paymentTermsLookup,
        companyInformation,
      ),
    ),
  };
}

async function fetchSalesInvoices(
  baseUrl: string,
  environment: string,
  token: string,
  companyId: string
) {
  const url = new URL(`${baseUrl}/v2.0/${environment}/api/v2.0/companies(${companyId})/salesInvoices`);
  url.search = new URLSearchParams({
    $top: "200",
    $orderby: "lastModifiedDateTime desc",
  }).toString();

  return fetchPagedBusinessCentralCollection<BusinessCentralSalesInvoice>({
    initialUrl: url.toString(),
    token,
    errorLabel: "salesInvoices",
  });
}

async function fetchCustomers(
  baseUrl: string,
  environment: string,
  token: string,
  companyId: string,
) {
  const url = new URL(`${baseUrl}/v2.0/${environment}/api/v2.0/companies(${companyId})/customers`);
  url.search = new URLSearchParams({
    $top: "200",
    $orderby: "lastModifiedDateTime desc",
  }).toString();

  return fetchPagedBusinessCentralCollection<BusinessCentralCustomer>({
    initialUrl: url.toString(),
    token,
    errorLabel: "customers",
  });
}

async function fetchCustomerPayments(
  baseUrl: string,
  environment: string,
  token: string,
  companyId: string,
) {
  const url = new URL(`${baseUrl}/v2.0/${environment}/api/v2.0/companies(${companyId})/customerPayments`);
  url.search = new URLSearchParams({
    $top: "200",
    $orderby: "lastModifiedDateTime desc",
  }).toString();

  return fetchPagedBusinessCentralCollection<BusinessCentralCustomerPayment>({
    initialUrl: url.toString(),
    token,
    errorLabel: "customerPayments",
  });
}

async function fetchPagedBusinessCentralCollection<T>(input: {
  initialUrl: string;
  token: string;
  errorLabel: string;
}) {
  const rows: T[] = [];
  let nextUrl: string | undefined = input.initialUrl;

  while (nextUrl) {
    const response = await runtimeFetch()(nextUrl, {
      headers: {
        authorization: `Bearer ${input.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Business Central ${input.errorLabel} request failed with ${response.status}.`);
    }

    const body = (await response.json()) as {
      value?: T[];
      "@odata.nextLink"?: string;
      odataNextLink?: string;
    };

    if (Array.isArray(body.value)) {
      rows.push(...body.value);
    }

    const candidate =
      typeof body["@odata.nextLink"] === "string"
        ? body["@odata.nextLink"].trim()
        : typeof body.odataNextLink === "string"
          ? body.odataNextLink.trim()
          : "";
    nextUrl = candidate.length > 0 ? candidate : undefined;
  }

  return rows;
}

async function fetchPaymentTermsSafe(
  baseUrl: string,
  environment: string,
  token: string,
  companyId: string,
) {
  try {
    const url = new URL(`${baseUrl}/v2.0/${environment}/api/v2.0/companies(${companyId})/paymentTerms`);
    url.search = new URLSearchParams({
      $top: "200",
      $orderby: "displayName asc",
    }).toString();

    return await fetchPagedBusinessCentralCollection<BusinessCentralPaymentTerm>({
      initialUrl: url.toString(),
      token,
      errorLabel: "paymentTerms",
    });
  } catch {
    return [];
  }
}

async function fetchCompanyInformationSafe(
  baseUrl: string,
  environment: string,
  token: string,
  companyId: string,
) {
  try {
    const url = new URL(
      `${baseUrl}/v2.0/${environment}/api/v2.0/companies(${companyId})/companyInformation`,
    );
    const rows = await fetchPagedBusinessCentralCollection<BusinessCentralCompanyInformation>({
      initialUrl: url.toString(),
      token,
      errorLabel: "companyInformation",
    });
    return rows[0];
  } catch {
    return undefined;
  }
}

function mapInvoice(
  company: BusinessCentralCompany,
  invoice: BusinessCentralSalesInvoice,
  customer: BusinessCentralCustomer | undefined,
  paymentTermsLookup: Map<string, BusinessCentralPaymentTerm>,
  companyInformation: BusinessCentralCompanyInformation | undefined,
): BusinessCentralInvoiceRecord {
  const paymentTerm =
    (invoice.paymentTermsId?.trim()
      ? paymentTermsLookup.get(invoice.paymentTermsId.trim())
      : undefined) ??
    (customer?.paymentTermsId?.trim()
      ? paymentTermsLookup.get(customer.paymentTermsId.trim())
      : undefined);
  const issuerAddressSummary = formatAddressSummary(companyInformation);
  const issuerCompanyName =
    companyInformation?.displayName?.trim() ||
    companyInformation?.name?.trim() ||
    company.displayName ||
    company.name;
  const invoiceDate = invoice.invoiceDate ?? invoice.postingDate;
  const companyName = company.displayName ?? company.name;
  const paymentTermsLabel = paymentTerm?.displayName?.trim() || paymentTerm?.description?.trim();

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
    ...(invoiceDate ? { invoiceDate } : {}),
    status: (invoice.status ?? "Open").toLowerCase(),
    companyId: company.id,
    ...(companyName ? { companyName } : {}),
    ...(invoice.paymentTermsCode?.trim()
      ? { paymentTermsCode: invoice.paymentTermsCode.trim() }
      : paymentTerm?.code?.trim()
        ? { paymentTermsCode: paymentTerm.code.trim() }
        : {}),
    ...(paymentTermsLabel ? { paymentTermsLabel } : {}),
    ...(invoice.externalDocumentNumber?.trim()
      ? { customerPurchaseOrderNumber: invoice.externalDocumentNumber.trim() }
      : {}),
    ...(invoice.orderNumber?.trim() ? { salesOrderNumber: invoice.orderNumber.trim() } : {}),
    ...(invoice.externalDocumentNumber?.trim()
      ? { externalDocumentNumber: invoice.externalDocumentNumber.trim() }
      : {}),
    ...(issuerCompanyName ? { issuerCompanyName } : {}),
    ...(issuerAddressSummary ? { issuerAddressSummary } : {}),
    ...(companyInformation?.phoneNumber?.trim() ? { issuerPhone: companyInformation.phoneNumber.trim() } : {}),
    ...(companyInformation?.faxNumber?.trim() ? { issuerFax: companyInformation.faxNumber.trim() } : {}),
  };
}

function mapCustomer(customer: BusinessCentralCustomer): BusinessCentralCustomerRecord {
  const addressParts = [
    customer.addressLine1,
    customer.addressLine2,
    customer.city,
    customer.state,
    customer.country,
    customer.postalCode,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return {
    externalId: customer.id,
    ...(customer.number?.trim() ? { customerNumber: customer.number.trim() } : {}),
    displayName: customer.displayName?.trim() || customer.number?.trim() || customer.id,
    currencyCode: customer.currencyCode?.trim() || "PHP",
    ...(customer.email?.trim() ? { email: customer.email.trim() } : {}),
    ...(customer.phoneNumber?.trim() ? { phone: customer.phoneNumber.trim() } : {}),
    status: customer.blocked?.trim() ? "inactive" : "active",
    ...(addressParts.length > 0 ? { billAddressSummary: addressParts.join(", ") } : {}),
  };
}

function mapContact(
  customer: BusinessCentralCustomer,
): BusinessCentralContactRecord | undefined {
  const email = customer.email?.trim();
  const phone = customer.phoneNumber?.trim();
  if (!email && !phone) {
    return undefined;
  }

  return {
    externalId: `customer-contact:${customer.id}`,
    customerExternalId: customer.id,
    fullName: customer.displayName?.trim() || customer.number?.trim() || customer.id,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    role: "accounts_payable",
  };
}

function mapPayment(
  payment: BusinessCentralCustomerPayment,
  customerLookup: Map<string, string>,
): BusinessCentralPaymentRecord {
  const memo = payment.description?.trim() || payment.comment?.trim();
  return {
    externalId: payment.id,
    ...(payment.customerId?.trim() ? { customerExternalId: payment.customerId.trim() } : {}),
    customerName:
      (payment.customerId ? customerLookup.get(payment.customerId) : undefined) ??
      payment.customerNumber?.trim() ??
      "Unknown customer",
    ...(payment.customerNumber?.trim() ? { customerNumber: payment.customerNumber.trim() } : {}),
    paymentReference:
      payment.documentNumber?.trim() ||
      payment.externalDocumentNumber?.trim() ||
      payment.id,
    currencyCode: "PHP",
    amountCents: decimalToCents(payment.amount ?? 0),
    unappliedAmountCents: 0,
    receivedAt:
      payment.postingDate?.trim() ||
      payment.lastModifiedDateTime?.trim() ||
      new Date(0).toISOString(),
    linkedInvoiceIds: payment.appliesToInvoiceId?.trim() ? [payment.appliesToInvoiceId.trim()] : [],
    ...(memo ? { memo } : {}),
  };
}

async function getBusinessCentralContext(tenantSlug: string) {
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
    readEnv(
      (loadEnv() as unknown as Record<string, string | number | undefined>)
        .INTEGRATION_BUSINESS_CENTRAL_BASE_URL,
    ) ?? "https://api.businesscentral.dynamics.com";
  const company: BusinessCentralCompany = {
    id: connection.companyId,
    ...(connection.companyName ? { displayName: connection.companyName } : {}),
  };

  return {
    connection,
    token,
    baseUrl,
    company,
  };
}

function decimalToCents(value: number) {
  return Math.round(value * 100);
}

function formatAddressSummary(value: BusinessCentralCompanyInformation | undefined) {
  if (!value) {
    return undefined;
  }
  const parts = [
    value.addressLine1,
    value.addressLine2,
    value.city,
    value.state,
    value.country,
    value.postalCode,
  ]
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item));
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function readEnv(value: string | number | undefined) {
  if (typeof value === "number") {
    return String(value);
  }
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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
