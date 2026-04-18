import { loadEnv } from "@o2c/config";
import { getOdooConnectionService } from "../bootstrap/odoo-connection-service.js";

type OdooInvoiceRow = {
  id: number;
  name?: string;
  partner_id?: [number, string];
  invoice_date?: string;
  invoice_date_due?: string;
  currency_id?: [number, string];
  amount_total?: number;
  amount_residual?: number;
  state?: string;
  payment_state?: string;
  ref?: string;
  invoice_line_ids?: number[];
  company_id?: [number, string];
};

type OdooPartnerRow = {
  id: number;
  name?: string;
  ref?: string;
  email?: string;
};

type OdooCurrencyRow = {
  id: number;
  name?: string;
};

export type OdooInvoiceRecord = {
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
  partnerId: number;
};

export type OdooIntegrationStatus =
  | { kind: "customer_connected"; database: string; companyName?: string; tenantSlug: string }
  | { kind: "not_configured" };

export interface CreateOdooInvoiceInput {
  customerReference?: string | undefined;
  customerName?: string | undefined;
  partnerId?: number | undefined;
  invoiceNumber: string;
  amountCents: number;
  currencyCode?: string | undefined;
  dueDate?: string | undefined;
  invoiceDate?: string | undefined;
  description?: string | undefined;
}

export interface UpdateOdooInvoiceInput {
  dueDate?: string | undefined;
  invoiceDate?: string | undefined;
  amountCents?: number | undefined;
  description?: string | undefined;
}

export function getOdooIntegrationStatus(tenantSlug: string): OdooIntegrationStatus {
  const connection = getOdooConnectionService().getConnectionSummary(tenantSlug);
  if (!connection) {
    return { kind: "not_configured" };
  }

  return {
    kind: "customer_connected",
    database: connection.database,
    ...(connection.companyName ? { companyName: connection.companyName } : {}),
    tenantSlug,
  };
}

export function isOdooConfigured() {
  return getOdooIntegrationStatus(loadEnv().DEFAULT_TENANT_SLUG).kind === "customer_connected";
}

export async function loadOdooInvoices(tenantSlug = loadEnv().DEFAULT_TENANT_SLUG) {
  const access = await getAuthenticatedOdooAccess(tenantSlug);
  if (!access) {
    return undefined;
  }

  const invoiceRows = await executeKw<OdooInvoiceRow>(
    access,
    "account.move",
    "search_read",
    [[["move_type", "=", "out_invoice"]]],
    {
      fields: [
        "id",
        "name",
        "partner_id",
        "invoice_date",
        "invoice_date_due",
        "currency_id",
        "amount_total",
        "amount_residual",
        "state",
        "payment_state",
        "ref",
        "invoice_line_ids",
        "company_id",
      ],
      order: "write_date desc",
      limit: 50,
    },
  );

  const partnerIds = [...new Set(invoiceRows.map((row) => row.partner_id?.[0]).filter(isNumber))];
  const partners = await loadOdooPartners(access, partnerIds);
  const currencies = await loadOdooCurrencies(
    access,
    [...new Set(invoiceRows.map((row) => row.currency_id?.[0]).filter(isNumber))],
  );

  return {
    invoices: invoiceRows.map((row) => mapOdooInvoiceRow(row, partners, currencies)),
  };
}

export async function getOdooInvoice(
  invoiceId: number,
  tenantSlug = loadEnv().DEFAULT_TENANT_SLUG,
) {
  const access = await getAuthenticatedOdooAccess(tenantSlug);
  if (!access) {
    return undefined;
  }

  const [row] = await executeKw<OdooInvoiceRow>(access, "account.move", "read", [
    [invoiceId],
    [
      "id",
      "name",
      "partner_id",
      "invoice_date",
      "invoice_date_due",
      "currency_id",
      "amount_total",
      "amount_residual",
      "state",
      "payment_state",
      "ref",
      "invoice_line_ids",
      "company_id",
    ],
  ]);

  if (!row) {
    return undefined;
  }

  const partners = await loadOdooPartners(access, row.partner_id?.[0] ? [row.partner_id[0]] : []);
  const currencies = await loadOdooCurrencies(access, row.currency_id?.[0] ? [row.currency_id[0]] : []);
  return mapOdooInvoiceRow(row, partners, currencies);
}

export async function createOdooInvoice(
  input: CreateOdooInvoiceInput,
  tenantSlug = loadEnv().DEFAULT_TENANT_SLUG,
) {
  const access = await getAuthenticatedOdooAccess(tenantSlug);
  if (!access) {
    throw new Error("Odoo is not connected for this tenant.");
  }
  if (!access.connection.defaultProductId) {
    throw new Error("INTEGRATION_ODOO_DEFAULT_PRODUCT_ID is required to create invoices safely.");
  }

  const partnerId = await resolveOdooPartnerId(access, input);
  const currencyId = input.currencyCode ? await resolveOdooCurrencyId(access, input.currencyCode) : undefined;
  const values: Record<string, unknown> = {
    move_type: "out_invoice",
    partner_id: partnerId,
    ...(input.invoiceDate ? { invoice_date: input.invoiceDate } : {}),
    ...(input.dueDate ? { invoice_date_due: input.dueDate } : {}),
    ...(access.connection.defaultJournalId ? { journal_id: Number(access.connection.defaultJournalId) } : {}),
    ...(currencyId ? { currency_id: currencyId } : {}),
    invoice_line_ids: [
      [
        0,
        0,
        {
          product_id: Number(access.connection.defaultProductId),
          name: input.description?.trim() || input.invoiceNumber,
          quantity: 1,
          price_unit: centsToDecimal(input.amountCents),
        },
      ],
    ],
  };

  const invoiceId = await executeScalar<number>(access, "account.move", "create", [[values]]);
  if (!invoiceId) {
    throw new Error("Odoo did not return a created invoice id.");
  }

  return getOdooInvoice(invoiceId, tenantSlug);
}

export async function updateOdooInvoice(
  invoiceId: number,
  input: UpdateOdooInvoiceInput,
  tenantSlug = loadEnv().DEFAULT_TENANT_SLUG,
) {
  const access = await getAuthenticatedOdooAccess(tenantSlug);
  if (!access) {
    throw new Error("Odoo is not connected for this tenant.");
  }

  const [row] = await executeKw<OdooInvoiceRow>(access, "account.move", "read", [[invoiceId], ["state", "invoice_line_ids"]]);
  if (!row) {
    throw new Error("Odoo invoice was not found.");
  }
  if (row.state !== "draft") {
    throw new Error("Only draft Odoo invoices can be updated from the dashboard.");
  }

  const values: Record<string, unknown> = {
    ...(input.invoiceDate ? { invoice_date: input.invoiceDate } : {}),
    ...(input.dueDate ? { invoice_date_due: input.dueDate } : {}),
  };
  const hasWriteFields = Object.keys(values).length > 0;
  if (hasWriteFields) {
    await executeScalar<boolean>(access, "account.move", "write", [[invoiceId], values]);
  }

  if ((input.amountCents !== undefined || input.description !== undefined) && row.invoice_line_ids?.[0]) {
    const lineValues: Record<string, unknown> = {
      ...(input.amountCents !== undefined ? { price_unit: centsToDecimal(input.amountCents) } : {}),
      ...(input.description ? { name: input.description } : {}),
    };
    await executeScalar<boolean>(access, "account.move.line", "write", [[[row.invoice_line_ids[0]], lineValues]]);
  }

  return getOdooInvoice(invoiceId, tenantSlug);
}

export async function deleteOdooInvoice(
  invoiceId: number,
  tenantSlug = loadEnv().DEFAULT_TENANT_SLUG,
) {
  const access = await getAuthenticatedOdooAccess(tenantSlug);
  if (!access) {
    throw new Error("Odoo is not connected for this tenant.");
  }

  const [row] = await executeKw<OdooInvoiceRow>(access, "account.move", "read", [[invoiceId], ["state"]]);
  if (!row) {
    throw new Error("Odoo invoice was not found.");
  }
  if (row.state !== "draft") {
    throw new Error("Only draft Odoo invoices can be deleted from the dashboard.");
  }

  await executeScalar<boolean>(access, "account.move", "unlink", [[invoiceId]]);
}

async function getAuthenticatedOdooAccess(tenantSlug: string) {
  const access = await getOdooConnectionService().getAuthenticatedConnection(tenantSlug);
  if (!access) {
    return undefined;
  }

  return access;
}

async function resolveOdooPartnerId(
  access: NonNullable<Awaited<ReturnType<typeof getAuthenticatedOdooAccess>>>,
  input: CreateOdooInvoiceInput,
) {
  if (input.partnerId) {
    return input.partnerId;
  }

  let partners: OdooPartnerRow[] = [];
  if (input.customerReference?.trim()) {
    partners = await executeKw<OdooPartnerRow>(access, "res.partner", "search_read", [
      [["ref", "=", input.customerReference.trim()]],
    ], { fields: ["id", "name", "ref", "email"], limit: 2 });
  } else if (input.customerName?.trim()) {
    partners = await executeKw<OdooPartnerRow>(access, "res.partner", "search_read", [
      [["name", "=", input.customerName.trim()]],
    ], { fields: ["id", "name", "ref", "email"], limit: 2 });
  }

  if (partners.length !== 1 || !partners[0]?.id) {
    throw new Error("Expected exactly one matching Odoo customer for invoice creation.");
  }

  return partners[0].id;
}

async function resolveOdooCurrencyId(
  access: NonNullable<Awaited<ReturnType<typeof getAuthenticatedOdooAccess>>>,
  currencyCode: string,
) {
  const currencies = await executeKw<OdooCurrencyRow>(access, "res.currency", "search_read", [
    [["name", "=", currencyCode.trim().toUpperCase()]],
  ], { fields: ["id", "name"], limit: 1 });

  return currencies[0]?.id;
}

async function loadOdooPartners(
  access: NonNullable<Awaited<ReturnType<typeof getAuthenticatedOdooAccess>>>,
  partnerIds: number[],
) {
  if (partnerIds.length === 0) {
    return new Map<number, OdooPartnerRow>();
  }

  const rows = await executeKw<OdooPartnerRow>(access, "res.partner", "read", [partnerIds, ["name", "ref", "email"]]);
  return new Map(rows.map((row) => [row.id, row]));
}

async function loadOdooCurrencies(
  access: NonNullable<Awaited<ReturnType<typeof getAuthenticatedOdooAccess>>>,
  currencyIds: number[],
) {
  if (currencyIds.length === 0) {
    return new Map<number, OdooCurrencyRow>();
  }

  const rows = await executeKw<OdooCurrencyRow>(access, "res.currency", "read", [currencyIds, ["name"]]);
  return new Map(rows.map((row) => [row.id, row]));
}

function mapOdooInvoiceRow(
  row: OdooInvoiceRow,
  partners: Map<number, OdooPartnerRow>,
  currencies: Map<number, OdooCurrencyRow>,
): OdooInvoiceRecord {
  const partner = row.partner_id?.[0] ? partners.get(row.partner_id[0]) : undefined;
  return {
    externalId: String(row.id),
    invoiceNumber: row.name?.trim() || row.ref?.trim() || `ODOO-${row.id}`,
    customerName: partner?.name ?? row.partner_id?.[1] ?? "Unknown customer",
    ...(partner?.ref ? { customerNumber: partner.ref } : {}),
    ...(partner?.email ? { email: partner.email } : {}),
    currencyCode: row.currency_id?.[0] ? currencies.get(row.currency_id[0])?.name ?? "PHP" : "PHP",
    totalAmountCents: decimalToCents(row.amount_total ?? 0),
    remainingAmountCents: decimalToCents(row.amount_residual ?? row.amount_total ?? 0),
    ...(row.invoice_date_due ? { dueDate: row.invoice_date_due } : {}),
    ...(row.invoice_date ? { invoiceDate: row.invoice_date } : {}),
    status: mapOdooStatus(row),
    companyId: row.company_id?.[0] ? String(row.company_id[0]) : "odoo-company",
    ...(row.company_id?.[1] ? { companyName: row.company_id[1] } : {}),
    partnerId: row.partner_id?.[0] ?? 0,
  };
}

function mapOdooStatus(row: OdooInvoiceRow) {
  if (row.state === "cancel") {
    return "voided";
  }
  if (row.payment_state === "paid") {
    return "paid";
  }
  if ((row.amount_residual ?? 0) > 0 && (row.amount_total ?? 0) > (row.amount_residual ?? 0)) {
    return "partial";
  }
  return "open";
}

async function executeKw<T>(
  access: NonNullable<Awaited<ReturnType<typeof getAuthenticatedOdooAccess>>>,
  model: string,
  method: string,
  args: unknown[],
  kwargs?: Record<string, unknown>,
): Promise<T[]> {
  const response = await runtimeFetch()(`${access.config.baseUrl}/jsonrpc`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [
          access.config.database,
          access.connection.uid,
          access.config.password,
          model,
          method,
          args,
          ...(kwargs ? [kwargs] : []),
        ],
      },
      id: `odoo_${Date.now()}`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Odoo ${model}.${method} request failed with ${response.status}.`);
  }

  const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) {
    throw new Error(body.error.message ?? `Odoo ${model}.${method} request failed.`);
  }

  return Array.isArray(body.result) ? (body.result as T[]) : [];
}

async function executeScalar<T>(
  access: NonNullable<Awaited<ReturnType<typeof getAuthenticatedOdooAccess>>>,
  model: string,
  method: string,
  args: unknown[],
  kwargs?: Record<string, unknown>,
): Promise<T | undefined> {
  const response = await runtimeFetch()(`${access.config.baseUrl}/jsonrpc`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [
          access.config.database,
          access.connection.uid,
          access.config.password,
          model,
          method,
          args,
          ...(kwargs ? [kwargs] : []),
        ],
      },
      id: `odoo_${Date.now()}`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Odoo ${model}.${method} request failed with ${response.status}.`);
  }

  const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) {
    throw new Error(body.error.message ?? `Odoo ${model}.${method} request failed.`);
  }

  return body.result as T | undefined;
}

function decimalToCents(value: number) {
  return Math.round(value * 100);
}

function centsToDecimal(value: number) {
  return value / 100;
}

function isNumber(value: number | undefined): value is number {
  return typeof value === "number";
}

function runtimeFetch() {
  return globalThis.fetch as unknown as (
    input: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    }
  ) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}
