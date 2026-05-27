import { createHash } from "node:crypto";
import type { Principal } from "@o2c/auth";
import { loadEnv } from "@o2c/config";
import type { CustomerProfileIngestionPayload } from "@o2c/domain";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { getBusinessCentralConnectionService } from "../bootstrap/business-central-connection-service.js";
import {
  type BusinessCentralContactRecord,
  type BusinessCentralCustomerRecord,
  type BusinessCentralInvoiceRecord,
  type BusinessCentralPaymentRecord,
  getBusinessCentralIntegrationStatus,
  loadBusinessCentralCustomers,
  loadBusinessCentralPayments,
  isBusinessCentralConfigured,
  loadBusinessCentralSalesInvoices,
} from "../integrations/business-central.js";
import { ingestCustomerProfilePayload } from "./customer-profiles.js";
import { createInvoiceSyncService } from "./invoice-imports.js";

const connectQuerySchema = z.object({
  tenantSlug: z.string().min(1).optional(),
  returnTo: z.string().url().optional(),
  environment: z.string().min(1).optional(),
  loginHint: z.string().email().optional(),
  domainHint: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
});

const connectSelectionParamsSchema = z.object({
  state: z.string().min(1),
});

const connectSelectionBodySchema = z.object({
  state: z.string().min(1),
  companyId: z.string().min(1),
});

const callbackQuerySchema = z.object({
  state: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  error_description: z.string().optional(),
});

export const registerBusinessCentralRoutes = (app: FastifyInstance): void => {
  app.get("/v1/integrations/business-central/connection", async (_request, reply) => {
    const env = loadEnv();
    const status = getBusinessCentralIntegrationStatus(env.DEFAULT_TENANT_SLUG);
    const connectionService = getBusinessCentralConnectionService();
    return reply.send({
      status,
      connection: connectionService.getConnectionSummary(env.DEFAULT_TENANT_SLUG) ?? null,
    });
  });

  app.get("/v1/integrations/business-central/connect/:state", async (request, reply) => {
    const { state } = connectSelectionParamsSchema.parse(request.params ?? {});
    const selection = getBusinessCentralConnectionService().getPendingCompanySelection(state);
    if (!selection) {
      return reply.status(404).send({ message: "Business Central company selection session was not found." });
    }

    return reply.send({
      status: "select_company",
      selection,
    });
  });

  app.get("/v1/integrations/business-central/connect", async (request, reply) => {
    try {
      const env = loadEnv();
      const query = connectQuerySchema.parse(request.query);
      const connectionService = getBusinessCentralConnectionService();
      const session = connectionService.createConnectSession({
        tenantSlug: query.tenantSlug ?? env.DEFAULT_TENANT_SLUG,
        returnTo: query.returnTo ?? `http://127.0.0.1:${env.WEB_PORT}/integrations`,
        ...(query.environment ? { environment: query.environment } : {}),
        ...(query.loginHint ? { loginHint: query.loginHint } : {}),
        ...(query.domainHint ? { domainHint: query.domainHint } : {}),
        ...(query.companyId ? { companyId: query.companyId } : {}),
      });

      if (!session) {
        return reply.status(400).send({
          message: "Business Central customer connection is not configured.",
        });
      }

      return reply.redirect(session.authorizationUrl);
    } catch (error) {
      return replyFromBusinessCentralError(reply, error);
    }
  });

  app.get("/v1/integrations/business-central/callback", async (request, reply) => {
    try {
      const env = loadEnv();
      const query = callbackQuerySchema.parse(request.query);
      if (query.error) {
        const connectionService = getBusinessCentralConnectionService();
        const session = query.state
          ? connectionService.abandonConnectSession(query.state)
          : undefined;
        const target = new URL(
          session?.returnTo ??
            (env.WEB_PORT
              ? `http://127.0.0.1:${env.WEB_PORT}/integrations`
              : "http://127.0.0.1:3000/integrations"),
        );
        target.searchParams.set("bc", "error");
        target.searchParams.set("message", query.error_description ?? query.error);
        return reply.redirect(target.toString());
      }

      if (!query.state || !query.code) {
        return reply.status(400).send({
          message: "Business Central callback is missing the authorization code or state.",
        });
      }

      const connectionService = getBusinessCentralConnectionService();
      const result = await connectionService.completeConnectSession({
        state: query.state,
        code: query.code,
      });
      const target =
        result.kind === "connected"
          ? new URL(result.returnTo)
          : new URL(result.selection.returnTo);
      if (result.kind === "select_company") {
        target.searchParams.set("bcConnectState", result.selection.state);
        return reply.redirect(target.toString());
      }
      target.searchParams.set("bc", "connected");
      target.searchParams.set("company", result.connection.companyName ?? result.connection.companyId);
      return reply.redirect(target.toString());
    } catch (error) {
      return replyFromBusinessCentralError(reply, error);
    }
  });

  app.post("/v1/integrations/business-central/connect/select", async (request, reply) => {
    try {
      const payload = connectSelectionBodySchema.parse(request.body ?? {});
      const result = getBusinessCentralConnectionService().completeCompanySelection({
        state: payload.state,
        companyId: payload.companyId,
      });

      return reply.send({
        status: "connected",
        returnTo: result.returnTo,
        connection: result.connection,
      });
    } catch (error) {
      return replyFromBusinessCentralError(reply, error);
    }
  });

  app.post("/v1/integrations/business-central/disconnect", async (_request, reply) => {
    try {
      const tenantSlug = loadEnv().DEFAULT_TENANT_SLUG;
      const disconnected = await getBusinessCentralConnectionService().disconnect(tenantSlug);

      return reply.send({
        status: disconnected ? "disconnected" : "not_connected",
        tenantSlug,
        ...(disconnected ? { connection: disconnected } : {}),
      });
    } catch (error) {
      return replyFromBusinessCentralError(reply, error);
    }
  });

  app.post("/v1/integrations/business-central/sync", async (_request, reply) => {
    try {
      const tenantSlug = loadEnv().DEFAULT_TENANT_SLUG;
      const [invoiceResult, customerSync] = await Promise.all([
        syncBusinessCentralInvoicesToPlatform(tenantSlug),
        syncBusinessCentralCustomerProfilesToPlatform(tenantSlug),
      ]);

      return reply.send({
        status: "completed",
        provider: "business-central",
        tenantSlug,
        invoices: invoiceResult,
        customers: customerSync,
      });
    } catch (error) {
      return replyFromBusinessCentralError(reply, error);
    }
  });

  app.get("/v1/integrations/business-central/invoices", async (_request, reply) => {
    try {
      if (!isBusinessCentralConfigured()) {
        return reply.status(400).send({
          message: "Business Central integration is not configured for this tenant.",
        });
      }

      const result = await loadBusinessCentralSalesInvoices(loadEnv().DEFAULT_TENANT_SLUG);
      return reply.send(result);
    } catch (error) {
      return replyFromBusinessCentralError(reply, error);
    }
  });

  app.get("/v1/integrations/business-central/customers", async (_request, reply) => {
    try {
      if (!isBusinessCentralConfigured()) {
        return reply.status(400).send({
          message: "Business Central integration is not configured for this tenant.",
        });
      }

      const result = await loadBusinessCentralCustomers(loadEnv().DEFAULT_TENANT_SLUG);
      return reply.send(result);
    } catch (error) {
      return replyFromBusinessCentralError(reply, error);
    }
  });

  app.get("/v1/integrations/business-central/payments", async (_request, reply) => {
    try {
      if (!isBusinessCentralConfigured()) {
        return reply.status(400).send({
          message: "Business Central integration is not configured for this tenant.",
        });
      }

      const result = await loadBusinessCentralPayments(loadEnv().DEFAULT_TENANT_SLUG);
      return reply.send(result);
    } catch (error) {
      return replyFromBusinessCentralError(reply, error);
    }
  });

  app.post("/v1/integrations/business-central/validate", async (_request, reply) => {
    try {
      const tenantSlug = loadEnv().DEFAULT_TENANT_SLUG;
      const [invoices, customers, payments] = await Promise.all([
        loadBusinessCentralSalesInvoices(tenantSlug),
        loadBusinessCentralCustomers(tenantSlug),
        loadBusinessCentralPayments(tenantSlug),
      ]);
      return reply.send({
        status: "validated",
        provider: "business-central",
        tenantSlug,
        counts: {
          invoices: invoices?.invoices?.length ?? 0,
          customers: customers?.customers?.length ?? 0,
          contacts: customers?.contacts?.length ?? 0,
          payments: payments?.payments?.length ?? 0,
        },
      });
    } catch (error) {
      return replyFromBusinessCentralError(reply, error);
    }
  });
};

function replyFromBusinessCentralError(reply: FastifyReply, error: unknown) {
  if (error instanceof z.ZodError) {
    return reply.status(400).send({ message: "Invalid Business Central request.", issues: error.issues });
  }
  if (error instanceof Error) {
    return reply.status(502).send({ message: error.message });
  }

  return reply.status(502).send({ message: "Business Central request failed." });
}

async function syncBusinessCentralInvoicesToPlatform(tenantSlug: string) {
  const invoices = await loadBusinessCentralSalesInvoices(tenantSlug);
  if (!invoices) {
    throw new Error("Business Central invoice pull is not configured for this tenant.");
  }

  const auditContext = {
    actorId: "business_central_sync",
    actorType: "automation" as const,
    correlationId: `business-central-invoice-sync:${Date.now()}`,
    occurredAt: new Date().toISOString(),
  };

  const result = await createInvoiceSyncService().syncBusinessCentralInvoices({
    tenantId: tenantSlug,
    invoices: invoices.invoices,
    auditContext,
  });

  return {
    pulledCount: invoices.invoices.length,
    importedCount: result.importedCount,
    canonicalUpsertedCount: result.canonicalUpsertedCount,
    pendingAccountMappingCount: result.pendingAccountMappingCount,
    heldInvalidCount: result.heldInvalidCount,
  };
}

async function syncBusinessCentralCustomerProfilesToPlatform(tenantSlug: string) {
  const [customersResult, paymentsResult, invoicesResult] = await Promise.all([
    loadBusinessCentralCustomers(tenantSlug),
    loadBusinessCentralPayments(tenantSlug),
    loadBusinessCentralSalesInvoices(tenantSlug),
  ]);

  if (!customersResult) {
    throw new Error("Business Central customer pull is not configured for this tenant.");
  }

  const customers = customersResult.customers;
  const contacts = customersResult.contacts;
  const payments = paymentsResult?.payments ?? [];
  const invoices = invoicesResult?.invoices ?? [];

  const contactsByCustomer = new Map<string, BusinessCentralContactRecord[]>();
  for (const contact of contacts) {
    const items = contactsByCustomer.get(contact.customerExternalId) ?? [];
    items.push(contact);
    contactsByCustomer.set(contact.customerExternalId, items);
  }

  const paymentsByCustomer = new Map<string, BusinessCentralPaymentRecord[]>();
  for (const payment of payments) {
    for (const key of uniqueKeys([
      payment.customerExternalId,
      payment.customerNumber,
    ])) {
      pushGroupedValue(paymentsByCustomer, key, payment);
    }
  }

  const invoicesByCustomer = new Map<string, BusinessCentralInvoiceRecord[]>();
  for (const invoice of invoices) {
    for (const key of uniqueKeys([
      invoice.customerNumber,
    ])) {
      pushGroupedValue(invoicesByCustomer, key, invoice);
    }
  }

  const principal: Principal = {
    id: "business_central_sync",
    roles: ["ar_manager"],
  };

  let syncedProfiles = 0;
  let syncedPayments = 0;
  let syncedInvoices = 0;

  for (const customer of customers) {
    const customerKeys = uniqueKeys([
      customer.externalId,
      customer.customerNumber,
    ]);
    const payload = buildBusinessCentralCustomerProfilePayload({
      tenantSlug,
      customer,
      contacts: contactsByCustomer.get(customer.externalId) ?? [],
      payments: collectGroupedValues(paymentsByCustomer, customerKeys),
      invoices: collectGroupedValues(invoicesByCustomer, customerKeys),
    });
    await ingestCustomerProfilePayload({
      principal,
      auditContext: {
        actorId: principal.id,
        actorType: "automation",
        correlationId: `business-central-customer-sync:${payload.id}`,
        occurredAt: payload.occurredAt,
      },
      payload,
    });
    syncedProfiles += 1;
    syncedPayments += payload.payments?.length ?? 0;
    syncedInvoices += payload.invoices?.length ?? 0;
  }

  return {
    pulledCustomerCount: customers.length,
    pulledContactCount: contacts.length,
    pulledPaymentCount: payments.length,
    pulledInvoiceReferenceCount: invoices.length,
    syncedProfileCount: syncedProfiles,
    syncedPaymentHistoryCount: syncedPayments,
    syncedInvoiceHistoryCount: syncedInvoices,
  };
}

function pushGroupedValue<T>(map: Map<string, T[]>, key: string, value: T) {
  const items = map.get(key) ?? [];
  items.push(value);
  map.set(key, items);
}

function uniqueKeys(keys: Array<string | undefined>) {
  return [...new Set(keys.map((key) => key?.trim()).filter((key): key is string => Boolean(key)))];
}

function collectGroupedValues<T>(map: Map<string, T[]>, keys: string[]) {
  const seen = new Set<T>();
  const values: T[] = [];
  for (const key of keys) {
    for (const item of map.get(key) ?? []) {
      if (seen.has(item)) {
        continue;
      }
      seen.add(item);
      values.push(item);
    }
  }
  return values;
}

function buildBusinessCentralCustomerProfilePayload(input: {
  tenantSlug: string;
  customer: BusinessCentralCustomerRecord;
  contacts: BusinessCentralContactRecord[];
  payments: BusinessCentralPaymentRecord[];
  invoices: BusinessCentralInvoiceRecord[];
}): CustomerProfileIngestionPayload {
  const occurredAt = new Date().toISOString();
  const parentAccountId = deterministicUuid(
    `bc-parent:${input.tenantSlug}:${input.customer.externalId}`,
  );
  const billingAccountId = deterministicUuid(
    `bc-billing:${input.tenantSlug}:${input.customer.externalId}`,
  );

  return {
    id: deterministicUuid(`bc-profile:${input.tenantSlug}:${input.customer.externalId}`),
    source: "erp_accounting",
    occurredAt,
    hierarchy: {
      parentAccount: {
        id: parentAccountId,
        createdAt: occurredAt,
        updatedAt: occurredAt,
        name: input.customer.displayName,
        status: input.customer.status === "inactive" ? "inactive" : "active",
        externalReference: input.customer.externalId,
        centrallyServiced: false,
        metadata: {
          source: "business_central",
        },
      },
      billingAccount: {
        id: billingAccountId,
        createdAt: occurredAt,
        updatedAt: occurredAt,
        parentAccountId,
        accountNumber: input.customer.externalId,
        displayName: input.customer.displayName,
        currency: input.customer.currencyCode,
        accountTier: "standard",
        erpCustomerId: input.customer.externalId,
        status: input.customer.status === "inactive" ? "inactive" : "active",
        centrallyPaid: false,
        metadata: {
          source: "business_central",
          ...(input.customer.billAddressSummary
            ? { billAddressSummary: input.customer.billAddressSummary }
            : {}),
        },
      },
    },
    legalEntityName: input.customer.displayName,
    billingAccountName: input.customer.displayName,
    contacts: input.contacts.map((contact, index) => ({
      id: deterministicUuid(`bc-contact:${input.tenantSlug}:${contact.externalId}`),
      fullName: contact.fullName,
      role: "ap",
      ...(contact.email ? { email: contact.email } : {}),
      ...(contact.phone ? { phone: contact.phone } : {}),
      isPrimary: index === 0,
      isVerified: Boolean(contact.email || contact.phone),
      allowAutoSend: Boolean(contact.email),
      recentSuccessfulResponses: 0,
      metadata: {
        source: "business_central",
        externalId: contact.externalId,
      },
    })),
    ...(input.invoices.length > 0
      ? {
          invoices: input.invoices.map((invoice) => ({
            id: deterministicUuid(`bc-history-invoice:${input.tenantSlug}:${invoice.externalId}`),
            createdAt: occurredAt,
            updatedAt: occurredAt,
            state:
              invoice.remainingAmountCents <= 0
                ? "paid"
                : invoice.remainingAmountCents < invoice.totalAmountCents
                  ? "partially_paid"
                  : "synced_open",
            parentAccountId,
            billingAccountId,
            invoiceNumber: invoice.invoiceNumber,
            currency: invoice.currencyCode,
            amountCents: invoice.totalAmountCents,
            collectibleAmountCents: invoice.remainingAmountCents,
            ...(invoice.invoiceDate ? { invoiceDate: invoice.invoiceDate } : {}),
            ...(invoice.dueDate ? { dueDate: invoice.dueDate } : {}),
            metadata: {
              source: "business_central",
              externalId: invoice.externalId,
              sourceStatus: invoice.status,
              companyId: invoice.companyId,
              ...(invoice.companyName ? { companyName: invoice.companyName } : {}),
            },
          })),
        }
      : {}),
    ...(input.payments.length > 0
      ? {
          payments: input.payments.map((payment) => ({
            id: deterministicUuid(`bc-history-payment:${input.tenantSlug}:${payment.externalId}`),
            createdAt: occurredAt,
            updatedAt: occurredAt,
            state: payment.linkedInvoiceIds.length > 0 ? "candidate_match_found" : "unapplied_cash",
            parentAccountId,
            billingAccountId,
            paymentReference: payment.paymentReference,
            currency: payment.currencyCode,
            amountCents: payment.amountCents,
            receivedAt: payment.receivedAt,
            metadata: {
              source: "business_central",
              externalId: payment.externalId,
              linkedInvoiceIds: payment.linkedInvoiceIds,
              unappliedAmountCents: payment.unappliedAmountCents,
              ...(payment.memo ? { memo: payment.memo } : {}),
            },
          })),
        }
      : {}),
    sourceReferences: [
      {
        objectType: "business_central_customer",
        objectId: input.customer.externalId,
      },
    ],
    metadata: {
      provider: "business_central",
    },
  };
}

function deterministicUuid(seed: string) {
  const hash = createHash("sha1").update(seed).digest("hex").slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
