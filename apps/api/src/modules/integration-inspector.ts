import { randomUUID } from "node:crypto";
import { loadEnv } from "@o2c/config";
import {
  createDatabaseClientConfig,
  executeSqlCommand,
  isDatabaseAvailable,
  jsonLiteral,
  quoteLiteral,
} from "@o2c/database";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  getBusinessCentralIntegrationStatus,
  loadBusinessCentralCustomers,
  loadBusinessCentralPayments,
  loadBusinessCentralSalesInvoices,
} from "../integrations/business-central.js";
import { getOdooIntegrationStatus, loadOdooInvoices } from "../integrations/odoo.js";
import {
  getQuickBooksIntegrationStatus,
  loadQuickBooksCustomers,
  loadQuickBooksInvoices,
  loadQuickBooksPayments,
} from "../integrations/quickbooks.js";
import {
  getSapBusinessOneIntegrationStatus,
  loadSapBusinessOneCustomers,
  loadSapBusinessOneInvoices,
  loadSapBusinessOnePayments,
} from "../integrations/sap-business-one.js";

const providerSchema = z.enum([
  "quickbooks",
  "business-central",
  "sap-business-one",
  "odoo",
]);

const inspectorQuerySchema = z.object({
  tenantSlug: z.string().min(1).optional(),
  provider: providerSchema.optional(),
});

type ProviderId = z.infer<typeof providerSchema>;

interface SummaryAccumulatorInput {
  invoices?: Array<{
    currencyCode?: string;
    totalAmountCents?: number;
    remainingAmountCents?: number;
  }>;
  customers?: unknown[];
  contacts?: unknown[];
  payments?: Array<{
    currencyCode?: string;
    amountCents?: number;
    unappliedAmountCents?: number;
  }>;
}

export const registerIntegrationInspectorRoutes = (app: FastifyInstance): void => {
  app.get("/v1/integrations/inspector", async (request, reply) => {
    try {
      const query = inspectorQuerySchema.parse(request.query ?? {});
      const tenantSlug = query.tenantSlug ?? loadEnv().DEFAULT_TENANT_SLUG;
      const providers = query.provider ? [query.provider] : providerSchema.options;

      const snapshots = await Promise.all(
        providers.map((provider) => loadProviderSnapshot(provider, tenantSlug)),
      );

      return reply.send({
        generatedAt: new Date().toISOString(),
        tenantSlug,
        providers: snapshots,
      });
    } catch (error) {
      return replyFromInspectorError(reply, error);
    }
  });
};

async function loadProviderSnapshot(provider: ProviderId, tenantSlug: string) {
  switch (provider) {
    case "quickbooks":
      return loadQuickBooksSnapshot(tenantSlug);
    case "business-central":
      return loadBusinessCentralSnapshot(tenantSlug);
    case "sap-business-one":
      return loadSapBusinessOneSnapshot(tenantSlug);
    case "odoo":
      return loadOdooSnapshot(tenantSlug);
  }
}

async function loadQuickBooksSnapshot(tenantSlug: string) {
  const startedAt = new Date().toISOString();
  const status = getQuickBooksIntegrationStatus(tenantSlug);
  const base = {
    provider: "quickbooks" as const,
    label: "QuickBooks Online",
    tenantSlug,
    pulledObjects: ["invoices", "customers", "contacts", "payments"],
  };

  if (status.kind !== "customer_connected") {
    const snapshot = {
      ...base,
      connectionStatus: "not_connected" as const,
      lifecycleState: "invite_created",
      detail: "No QuickBooks company is connected for this tenant yet.",
      summary: buildSummary({}),
      raw: {},
      validationStatus: "pending" as const,
    };
    persistProviderSnapshot(tenantSlug, snapshot, startedAt);
    return snapshot;
  }

  const [invoices, customers, payments] = await Promise.all([
    loadQuickBooksInvoices(tenantSlug),
    loadQuickBooksCustomers(tenantSlug),
    loadQuickBooksPayments(tenantSlug),
  ]);

  const summary = buildSummary({
    ...(invoices?.invoices ? { invoices: invoices.invoices } : {}),
    ...(customers?.customers ? { customers: customers.customers } : {}),
    ...(customers?.contacts ? { contacts: customers.contacts } : {}),
    ...(payments?.payments ? { payments: payments.payments } : {}),
  });

  const snapshot = {
    ...base,
    connectionStatus: "connected" as const,
    lifecycleState: summary.invoiceCount > 0 ? "validation_succeeded" : "connected_pending_validation",
    detail: "QuickBooks records are available for inspection.",
    companyName: status.companyName,
    environment: status.environment,
    summary,
    latestPullStartedAt: startedAt,
    latestPullCompletedAt: new Date().toISOString(),
    validationStatus: summary.invoiceCount > 0 ? ("validated" as const) : ("pending" as const),
    raw: {
      ...(invoices?.company ? { company: invoices.company } : {}),
      ...(invoices?.invoices ? { invoices: invoices.invoices } : {}),
      ...(customers?.customers ? { customers: customers.customers } : {}),
      ...(customers?.contacts ? { contacts: customers.contacts } : {}),
      ...(payments?.payments ? { payments: payments.payments } : {}),
    },
  };
  persistProviderSnapshot(tenantSlug, snapshot, startedAt);
  return snapshot;
}

async function loadBusinessCentralSnapshot(tenantSlug: string) {
  const startedAt = new Date().toISOString();
  const status = getBusinessCentralIntegrationStatus(tenantSlug);
  const base = {
    provider: "business-central" as const,
    label: "Business Central",
    tenantSlug,
    pulledObjects: ["invoices", "customers", "contacts", "payments"],
  };

  if (status.kind !== "customer_connected") {
    const snapshot = {
      ...base,
      connectionStatus: "not_connected" as const,
      lifecycleState: "invite_created",
      detail: "No Business Central company is connected for this tenant yet.",
      summary: buildSummary({}),
      raw: {},
      validationStatus: "pending" as const,
    };
    persistProviderSnapshot(tenantSlug, snapshot, startedAt);
    return snapshot;
  }

  const [invoices, customers, payments] = await Promise.all([
    loadBusinessCentralSalesInvoices(tenantSlug),
    loadBusinessCentralCustomers(tenantSlug),
    loadBusinessCentralPayments(tenantSlug),
  ]);
  const summary = buildSummary({
    ...(invoices?.invoices ? { invoices: invoices.invoices } : {}),
    ...(customers?.customers ? { customers: customers.customers } : {}),
    ...(customers?.contacts ? { contacts: customers.contacts } : {}),
    ...(payments?.payments ? { payments: payments.payments } : {}),
  });

  const snapshot = {
    ...base,
    connectionStatus: "connected" as const,
    lifecycleState: summary.invoiceCount > 0 ? "validation_succeeded" : "connected_pending_validation",
    detail: "Business Central records are available for inspection.",
    companyName: status.companyName,
    environment: status.environment,
    summary,
    latestPullStartedAt: startedAt,
    latestPullCompletedAt: new Date().toISOString(),
    validationStatus: summary.invoiceCount > 0 ? ("validated" as const) : ("pending" as const),
    raw: {
      ...(invoices?.company ? { company: invoices.company } : {}),
      ...(invoices?.invoices ? { invoices: invoices.invoices } : {}),
      ...(customers?.customers ? { customers: customers.customers } : {}),
      ...(customers?.contacts ? { contacts: customers.contacts } : {}),
      ...(payments?.payments ? { payments: payments.payments } : {}),
    },
  };
  persistProviderSnapshot(tenantSlug, snapshot, startedAt);
  return snapshot;
}

async function loadSapBusinessOneSnapshot(tenantSlug: string) {
  const startedAt = new Date().toISOString();
  const status = getSapBusinessOneIntegrationStatus(tenantSlug);
  const base = {
    provider: "sap-business-one" as const,
    label: "SAP Business One",
    tenantSlug,
    pulledObjects: ["invoices", "customers", "payments"],
  };

  if (status.kind !== "connected") {
    const snapshot = {
      ...base,
      connectionStatus: "not_connected" as const,
      lifecycleState: "invite_created",
      detail: "No SAP Business One company is connected for this tenant yet.",
      summary: buildSummary({}),
      raw: {},
      validationStatus: "pending" as const,
    };
    persistProviderSnapshot(tenantSlug, snapshot, startedAt);
    return snapshot;
  }

  const [invoices, customers, payments] = await Promise.all([
    loadSapBusinessOneInvoices(tenantSlug),
    loadSapBusinessOneCustomers(tenantSlug),
    loadSapBusinessOnePayments(tenantSlug),
  ]);
  const summary = buildSummary({
    ...(invoices?.invoices ? { invoices: invoices.invoices } : {}),
    ...(customers?.customers ? { customers: customers.customers } : {}),
    ...(payments?.payments ? { payments: payments.payments } : {}),
  });

  const snapshot = {
    ...base,
    connectionStatus: "connected" as const,
    lifecycleState: summary.invoiceCount > 0 ? "validation_succeeded" : "connected_pending_validation",
    detail: "SAP Business One records are available for inspection.",
    companyName: status.companyName ?? status.companyDatabase,
    summary,
    latestPullStartedAt: startedAt,
    latestPullCompletedAt: new Date().toISOString(),
    validationStatus: summary.invoiceCount > 0 ? ("validated" as const) : ("pending" as const),
    raw: {
      ...(invoices?.company ? { company: invoices.company } : {}),
      ...(invoices?.invoices ? { invoices: invoices.invoices } : {}),
      ...(customers?.customers ? { customers: customers.customers } : {}),
      ...(payments?.payments ? { payments: payments.payments } : {}),
    },
  };
  persistProviderSnapshot(tenantSlug, snapshot, startedAt);
  return snapshot;
}

async function loadOdooSnapshot(tenantSlug: string) {
  const startedAt = new Date().toISOString();
  const status = getOdooIntegrationStatus(tenantSlug);
  const base = {
    provider: "odoo" as const,
    label: "Odoo",
    tenantSlug,
    pulledObjects: ["invoices"],
  };

  if (status.kind !== "customer_connected") {
    const snapshot = {
      ...base,
      connectionStatus: "not_connected" as const,
      lifecycleState: "invite_created",
      detail: "No Odoo database is connected for this tenant yet.",
      summary: buildSummary({}),
      raw: {},
      validationStatus: "pending" as const,
    };
    persistProviderSnapshot(tenantSlug, snapshot, startedAt);
    return snapshot;
  }

  const invoices = await loadOdooInvoices(tenantSlug);
  const summary = buildSummary({
    ...(invoices?.invoices ? { invoices: invoices.invoices } : {}),
  });

  const snapshot = {
    ...base,
    connectionStatus: "connected" as const,
    lifecycleState: summary.invoiceCount > 0 ? "validation_succeeded" : "connected_pending_validation",
    detail: "Odoo invoice data is available for inspection.",
    companyName: status.companyName ?? status.database,
    summary,
    latestPullStartedAt: startedAt,
    latestPullCompletedAt: new Date().toISOString(),
    validationStatus: summary.invoiceCount > 0 ? ("validated" as const) : ("pending" as const),
    raw: {
      ...(invoices?.invoices ? { invoices: invoices.invoices } : {}),
    },
  };
  persistProviderSnapshot(tenantSlug, snapshot, startedAt);
  return snapshot;
}

function buildSummary(input: SummaryAccumulatorInput) {
  const invoices = input.invoices ?? [];
  const customers = input.customers ?? [];
  const contacts = input.contacts ?? [];
  const payments = input.payments ?? [];
  const currencyCodes = new Set<string>();

  let totalInvoiceAmountCents = 0;
  let totalOpenInvoiceAmountCents = 0;
  let totalPaymentAmountCents = 0;
  let totalUnappliedPaymentAmountCents = 0;

  for (const invoice of invoices) {
    totalInvoiceAmountCents += invoice.totalAmountCents ?? 0;
    totalOpenInvoiceAmountCents += invoice.remainingAmountCents ?? 0;
    if (invoice.currencyCode) {
      currencyCodes.add(invoice.currencyCode);
    }
  }

  for (const payment of payments) {
    totalPaymentAmountCents += payment.amountCents ?? 0;
    totalUnappliedPaymentAmountCents += payment.unappliedAmountCents ?? 0;
    if (payment.currencyCode) {
      currencyCodes.add(payment.currencyCode);
    }
  }

  return {
    invoiceCount: invoices.length,
    customerCount: customers.length,
    contactCount: contacts.length,
    paymentCount: payments.length,
    totalInvoiceAmountCents,
    totalOpenInvoiceAmountCents,
    totalPaymentAmountCents,
    totalUnappliedPaymentAmountCents,
    currencyCodes: [...currencyCodes],
  };
}

function persistProviderSnapshot(
  tenantSlug: string,
  snapshot: {
    provider: ProviderId;
    connectionStatus: "connected" | "not_connected" | "error";
    lifecycleState?: string;
    summary: ReturnType<typeof buildSummary>;
    raw: Record<string, unknown>;
    errorMessage?: string;
    validationStatus?: "validated" | "failed" | "pending";
  },
  startedAt: string,
) {
  const db = createDatabaseClientConfig();
  if (!db.connectionString || !isDatabaseAvailable(db.connectionString)) {
    return;
  }

  const completedAt = new Date().toISOString();
  executeSqlCommand(
    db.connectionString,
    `
      INSERT INTO integration_pull_run (
        run_id,
        tenant_slug,
        provider,
        lifecycle_state,
        status,
        connection_status,
        summary,
        raw_payload,
        validation,
        error_message,
        started_at,
        completed_at,
        created_by_actor_id,
        created_by_actor_role,
        metadata
      )
      VALUES (
        '${quoteLiteral(randomUUID())}',
        '${quoteLiteral(tenantSlug)}',
        '${quoteLiteral(snapshot.provider)}',
        '${quoteLiteral(snapshot.lifecycleState ?? deriveLifecycleState(snapshot))}',
        '${quoteLiteral(snapshot.connectionStatus === "error" ? "failed" : "succeeded")}',
        '${quoteLiteral(snapshot.connectionStatus)}',
        '${jsonLiteral(snapshot.summary)}'::jsonb,
        '${jsonLiteral(snapshot.raw)}'::jsonb,
        '${jsonLiteral({ status: snapshot.validationStatus ?? deriveValidationStatus(snapshot) })}'::jsonb,
        ${snapshot.errorMessage ? `'${quoteLiteral(snapshot.errorMessage)}'` : "NULL"},
        '${quoteLiteral(startedAt)}'::timestamptz,
        '${quoteLiteral(completedAt)}'::timestamptz,
        'integration_inspector',
        'system',
        '${jsonLiteral({ source: "integration_inspector" })}'::jsonb
      )
    `,
  );
}

function deriveLifecycleState(snapshot: {
  connectionStatus: "connected" | "not_connected" | "error";
  summary: ReturnType<typeof buildSummary>;
}) {
  if (snapshot.connectionStatus !== "connected") {
    return "invite_created";
  }
  if (snapshot.summary.invoiceCount > 0 || snapshot.summary.customerCount > 0 || snapshot.summary.paymentCount > 0) {
    return "validation_succeeded";
  }
  return "connected_pending_validation";
}

function deriveValidationStatus(snapshot: {
  connectionStatus: "connected" | "not_connected" | "error";
  summary: ReturnType<typeof buildSummary>;
}) {
  if (snapshot.connectionStatus !== "connected") {
    return "pending";
  }
  if (snapshot.summary.invoiceCount > 0 || snapshot.summary.customerCount > 0 || snapshot.summary.paymentCount > 0) {
    return "validated";
  }
  return "pending";
}

function replyFromInspectorError(reply: FastifyReply, error: unknown) {
  if (error instanceof z.ZodError) {
    return reply
      .status(400)
      .send({ message: "Invalid integration inspector request.", issues: error.issues });
  }

  if (error instanceof Error) {
    return reply.status(502).send({ message: error.message });
  }

  return reply.status(502).send({ message: "Integration inspector request failed." });
}
