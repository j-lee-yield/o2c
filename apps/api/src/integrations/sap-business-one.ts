import { loadEnv } from "@o2c/config";
import {
  buildSapBusinessOneCookieHeader,
  getSapBusinessOneConnectionService,
  type SapBusinessOneTenantConnection,
} from "../bootstrap/sap-business-one-connection-service.js";

export type SapBusinessOneInvoiceRow = {
  DocEntry: number;
  DocNum?: number;
  CardCode?: string;
  CardName?: string;
  DocCurrency?: string;
  DocTotal?: number;
  PaidToDate?: number;
  DocDueDate?: string;
  DocDate?: string;
  DocumentStatus?: "bost_Open" | "bost_Close";
  Cancelled?: "tYES" | "tNO";
  Comments?: string;
  BPLName?: string;
  BPL_IDAssignedToInvoice?: number;
};

export type SapBusinessOneBusinessPartnerRow = {
  CardCode: string;
  CardName?: string;
  Currency?: string;
  E_Mail?: string;
  Phone1?: string;
  Phone2?: string;
  GroupCode?: number;
  FederalTaxID?: string;
  Valid?: "tYES" | "tNO";
};

export type SapBusinessOneIncomingPaymentRow = {
  DocEntry: number;
  DocNum?: number;
  CardCode?: string;
  CardName?: string;
  DocCurrency?: string;
  DocDate?: string;
  TransferSum?: number;
  CashSum?: number;
  CheckSum?: number;
  Remarks?: string;
  PaymentInvoices?: Array<{
    DocEntry?: number;
  }>;
};

export type SapBusinessOneInvoiceRecord = {
  externalId: string;
  invoiceNumber: string;
  customerName: string;
  customerNumber?: string;
  currencyCode: string;
  totalAmountCents: number;
  remainingAmountCents: number;
  dueDate?: string;
  invoiceDate?: string;
  status: string;
  companyId: string;
  companyName?: string;
  branchName?: string;
  branchReference?: string;
};

export type SapBusinessOneCustomerRecord = {
  externalId: string;
  displayName: string;
  currencyCode: string;
  email?: string;
  phone?: string;
  taxId?: string;
  status: "active" | "inactive";
};

export type SapBusinessOnePaymentRecord = {
  externalId: string;
  customerName: string;
  customerNumber?: string;
  paymentReference: string;
  currencyCode: string;
  amountCents: number;
  receivedAt: string;
  linkedInvoiceIds: string[];
  memo?: string;
};

export type SapBusinessOneIntegrationStatus =
  | { kind: "connected"; companyDatabase: string; companyName?: string; tenantSlug: string }
  | { kind: "not_configured" };

export function getSapBusinessOneIntegrationStatus(
  tenantSlug: string,
): SapBusinessOneIntegrationStatus {
  const connection = getSapBusinessOneConnectionService().getConnectionSummary(tenantSlug);
  if (!connection) {
    return { kind: "not_configured" };
  }

  return {
    kind: "connected",
    companyDatabase: connection.companyDatabase,
    ...(connection.companyName ? { companyName: connection.companyName } : {}),
    tenantSlug,
  };
}

export function isSapBusinessOneConfigured() {
  return (
    getSapBusinessOneIntegrationStatus(loadEnv().DEFAULT_TENANT_SLUG).kind === "connected"
  );
}

export async function loadSapBusinessOneInvoices(
  tenantSlug = loadEnv().DEFAULT_TENANT_SLUG,
) {
  const connection = getSapBusinessOneConnectionService().getConnectionSummary(tenantSlug);
  if (!connection) {
    return undefined;
  }

  const rows = await executeSapBusinessOneGet<SapBusinessOneInvoiceRow>({
    tenantSlug,
    path: "/Invoices?$top=25&$orderby=DocEntry desc",
  });

  return {
    company: {
      id: connection.companyDatabase,
      ...(connection.companyName
        ? { displayName: connection.companyName }
        : { displayName: connection.companyDatabase }),
    },
    invoices: rows.map((row) => mapSapBusinessOneInvoiceRow(row, connection)),
  };
}

export async function loadSapBusinessOneCustomers(
  tenantSlug = loadEnv().DEFAULT_TENANT_SLUG,
) {
  const connection = getSapBusinessOneConnectionService().getConnectionSummary(tenantSlug);
  if (!connection) {
    return undefined;
  }

  const rows = await executeSapBusinessOneGet<SapBusinessOneBusinessPartnerRow>({
    tenantSlug,
    path: "/BusinessPartners?$top=50&$orderby=CardCode",
  });

  return {
    company: {
      id: connection.companyDatabase,
      ...(connection.companyName
        ? { displayName: connection.companyName }
        : { displayName: connection.companyDatabase }),
    },
    customers: rows.map(mapSapBusinessOneBusinessPartnerRow),
  };
}

export async function loadSapBusinessOnePayments(
  tenantSlug = loadEnv().DEFAULT_TENANT_SLUG,
) {
  const connection = getSapBusinessOneConnectionService().getConnectionSummary(tenantSlug);
  if (!connection) {
    return undefined;
  }

  const rows = await executeSapBusinessOneGet<SapBusinessOneIncomingPaymentRow>({
    tenantSlug,
    path: "/IncomingPayments?$top=50&$orderby=DocEntry desc",
  });

  return {
    company: {
      id: connection.companyDatabase,
      ...(connection.companyName
        ? { displayName: connection.companyName }
        : { displayName: connection.companyDatabase }),
    },
    payments: rows.map(mapSapBusinessOneIncomingPaymentRow),
  };
}

function mapSapBusinessOneInvoiceRow(
  invoice: SapBusinessOneInvoiceRow,
  connection: SapBusinessOneTenantConnection,
): SapBusinessOneInvoiceRecord {
  const totalAmountCents = decimalToCents(invoice.DocTotal ?? 0);
  const paidAmountCents = decimalToCents(invoice.PaidToDate ?? 0);
  const remainingAmountCents = Math.max(totalAmountCents - paidAmountCents, 0);

  return {
    externalId: String(invoice.DocEntry),
    invoiceNumber:
      typeof invoice.DocNum === "number" ? String(invoice.DocNum) : String(invoice.DocEntry),
    customerName: invoice.CardName?.trim() || "Unknown customer",
    ...(invoice.CardCode?.trim() ? { customerNumber: invoice.CardCode.trim() } : {}),
    currencyCode: invoice.DocCurrency?.trim() || "PHP",
    totalAmountCents,
    remainingAmountCents,
    ...(invoice.DocDueDate ? { dueDate: invoice.DocDueDate } : {}),
    ...(invoice.DocDate ? { invoiceDate: invoice.DocDate } : {}),
    status: mapSapBusinessOneInvoiceStatus(invoice),
    companyId: connection.companyDatabase,
    ...(connection.companyName ? { companyName: connection.companyName } : {}),
    ...(invoice.BPLName?.trim() ? { branchName: invoice.BPLName.trim() } : {}),
    ...(typeof invoice.BPL_IDAssignedToInvoice === "number"
      ? { branchReference: String(invoice.BPL_IDAssignedToInvoice) }
      : {}),
  };
}

function mapSapBusinessOneBusinessPartnerRow(
  customer: SapBusinessOneBusinessPartnerRow,
): SapBusinessOneCustomerRecord {
  const phone = customer.Phone1?.trim() || customer.Phone2?.trim();
  return {
    externalId: customer.CardCode,
    displayName: customer.CardName?.trim() || customer.CardCode,
    currencyCode: customer.Currency?.trim() || "PHP",
    ...(customer.E_Mail?.trim() ? { email: customer.E_Mail.trim() } : {}),
    ...(phone ? { phone } : {}),
    ...(customer.FederalTaxID?.trim() ? { taxId: customer.FederalTaxID.trim() } : {}),
    status: customer.Valid === "tNO" ? "inactive" : "active",
  };
}

function mapSapBusinessOneIncomingPaymentRow(
  payment: SapBusinessOneIncomingPaymentRow,
): SapBusinessOnePaymentRecord {
  const amount =
    (payment.TransferSum ?? 0) + (payment.CashSum ?? 0) + (payment.CheckSum ?? 0);

  return {
    externalId: String(payment.DocEntry),
    customerName: payment.CardName?.trim() || "Unknown customer",
    ...(payment.CardCode?.trim() ? { customerNumber: payment.CardCode.trim() } : {}),
    paymentReference:
      typeof payment.DocNum === "number" ? String(payment.DocNum) : String(payment.DocEntry),
    currencyCode: payment.DocCurrency?.trim() || "PHP",
    amountCents: decimalToCents(amount),
    receivedAt: payment.DocDate ?? new Date().toISOString(),
    linkedInvoiceIds: Array.isArray(payment.PaymentInvoices)
      ? payment.PaymentInvoices
          .map((item) =>
            typeof item.DocEntry === "number" ? String(item.DocEntry) : undefined,
          )
          .filter((value): value is string => Boolean(value))
      : [],
    ...(payment.Remarks?.trim() ? { memo: payment.Remarks.trim() } : {}),
  };
}

async function executeSapBusinessOneGet<Row>(input: {
  tenantSlug: string;
  path: string;
}) {
  const service = getSapBusinessOneConnectionService();
  const context = await service.getAuthenticatedRequestContext(input.tenantSlug);
  if (!context) {
    return [] as Row[];
  }

  let response = await runtimeFetch()(`${context.baseUrl}/b1s/v1${input.path}`, {
    headers: {
      cookie: context.cookieHeader,
      accept: "application/json",
    },
  });

  if (response.status === 401 || response.status === 403) {
    const refreshed = await service.refreshSession(input.tenantSlug);
    if (refreshed) {
      response = await runtimeFetch()(`${refreshed.baseUrl}/b1s/v1${input.path}`, {
        headers: {
          cookie: buildSapBusinessOneCookieHeader(refreshed),
          accept: "application/json",
        },
      });
    }
  }

  if (!response.ok) {
    throw new Error(`SAP Business One request failed with ${response.status}.`);
  }

  const body = (await response.json()) as { value?: Row[] };
  return Array.isArray(body.value) ? body.value : [];
}

function mapSapBusinessOneInvoiceStatus(input: SapBusinessOneInvoiceRow) {
  if (input.Cancelled === "tYES") {
    return "voided";
  }

  if (input.DocumentStatus === "bost_Close") {
    return "paid";
  }

  const total = decimalToCents(input.DocTotal ?? 0);
  const paid = decimalToCents(input.PaidToDate ?? 0);
  if (paid > 0 && paid < total) {
    return "partial";
  }

  return "open";
}

function decimalToCents(value: number) {
  return Math.round(value * 100);
}

function runtimeFetch() {
  return globalThis.fetch as unknown as (
    input: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
    }
  ) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}
