import { loadEnv } from "@o2c/config";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { getQuickBooksConnectionService } from "../bootstrap/quickbooks-connection-service.js";
import {
  getQuickBooksIntegrationStatus,
  isQuickBooksConfigured,
  loadQuickBooksCustomers,
  loadQuickBooksInvoices,
  loadQuickBooksPayments,
} from "../integrations/quickbooks.js";

const connectQuerySchema = z.object({
  tenantSlug: z.string().min(1).optional(),
  returnTo: z.string().url().optional(),
  environment: z.enum(["production", "sandbox"]).optional(),
  realmId: z.string().min(1).optional(),
});

const callbackQuerySchema = z.object({
  state: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  realmId: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  error_description: z.string().optional(),
});

const quickBooksAuthorizationSummary = {
  provider: "quickbooks_online",
  accessMode: "read_write",
  scopes: [
    "com.intuit.quickbooks.accounting",
    "openid",
    "profile",
    "email",
    "offline_access",
  ],
  readableObjects: ["invoices", "customers", "contacts", "payments"],
  writableObjects: ["payment_writeback_staging", "cash_application_writeback_preview"],
} as const;

export const registerQuickBooksRoutes = (app: FastifyInstance): void => {
  app.get("/v1/integrations/quickbooks/connection", async (_request, reply) => {
    const env = loadEnv();
    const service = getQuickBooksConnectionService();
    return reply.send({
      status: getQuickBooksIntegrationStatus(env.DEFAULT_TENANT_SLUG),
      connection: service.getConnectionSummary(env.DEFAULT_TENANT_SLUG) ?? null,
      connectSetup: service.getConnectSetupStatus(),
      authorization: quickBooksAuthorizationSummary,
    });
  });

  app.get("/v1/integrations/quickbooks/connect", async (request, reply) => {
    try {
      const env = loadEnv();
      const query = connectQuerySchema.parse(request.query);
      const service = getQuickBooksConnectionService();
      const session = service.createConnectSession({
        tenantSlug: query.tenantSlug ?? env.DEFAULT_TENANT_SLUG,
        returnTo: query.returnTo ?? `http://127.0.0.1:${env.WEB_PORT}/integrations/quickbooks`,
        ...(query.environment ? { environment: query.environment } : {}),
        ...(query.realmId ? { realmId: query.realmId } : {}),
      });

      if (!session) {
        return reply.status(400).send({
          message: "QuickBooks customer connection is not configured.",
        });
      }

      return reply.redirect(session.authorizationUrl);
    } catch (error) {
      return replyFromQuickBooksError(reply, error);
    }
  });

  app.get("/v1/integrations/quickbooks/callback", async (request, reply) => {
    try {
      const env = loadEnv();
      const query = callbackQuerySchema.parse(request.query);
      if (query.error) {
        const target = new URL(`http://127.0.0.1:${env.WEB_PORT}/integrations/quickbooks`);
        target.searchParams.set("quickbooks", "error");
        target.searchParams.set("message", query.error_description ?? query.error);
        return reply.redirect(target.toString());
      }

      if (!query.state || !query.code) {
        return reply.status(400).send({
          message: "QuickBooks callback is missing the authorization code or state.",
        });
      }

      const result = await getQuickBooksConnectionService().completeConnectSession({
        state: query.state,
        code: query.code,
        ...(query.realmId ? { realmId: query.realmId } : {}),
      });
      const target = new URL(result.returnTo);
      target.searchParams.set("quickbooks", "connected");
      target.searchParams.set(
        "company",
        result.connection.companyName ?? result.connection.realmId,
      );
      return reply.redirect(target.toString());
    } catch (error) {
      return replyFromQuickBooksError(reply, error);
    }
  });

  app.get("/v1/integrations/quickbooks/invoices", async (_request, reply) => {
    try {
      if (!isQuickBooksConfigured()) {
        return reply.status(400).send({
          message: "QuickBooks integration is not configured for this tenant.",
        });
      }

      const result = await loadQuickBooksInvoices(loadEnv().DEFAULT_TENANT_SLUG);
      return reply.send(result);
    } catch (error) {
      return replyFromQuickBooksError(reply, error);
    }
  });

  app.get("/v1/integrations/quickbooks/customers", async (_request, reply) => {
    try {
      if (!isQuickBooksConfigured()) {
        return reply.status(400).send({
          message: "QuickBooks integration is not configured for this tenant.",
        });
      }

      const result = await loadQuickBooksCustomers(loadEnv().DEFAULT_TENANT_SLUG);
      return reply.send(result);
    } catch (error) {
      return replyFromQuickBooksError(reply, error);
    }
  });

  app.get("/v1/integrations/quickbooks/contacts", async (_request, reply) => {
    try {
      if (!isQuickBooksConfigured()) {
        return reply.status(400).send({
          message: "QuickBooks integration is not configured for this tenant.",
        });
      }

      const result = await loadQuickBooksCustomers(loadEnv().DEFAULT_TENANT_SLUG);
      return reply.send(
        result
          ? {
              company: result.company,
              contacts: result.contacts,
            }
          : undefined,
      );
    } catch (error) {
      return replyFromQuickBooksError(reply, error);
    }
  });

  app.get("/v1/integrations/quickbooks/payments", async (_request, reply) => {
    try {
      if (!isQuickBooksConfigured()) {
        return reply.status(400).send({
          message: "QuickBooks integration is not configured for this tenant.",
        });
      }

      const result = await loadQuickBooksPayments(loadEnv().DEFAULT_TENANT_SLUG);
      return reply.send(result);
    } catch (error) {
      return replyFromQuickBooksError(reply, error);
    }
  });

  app.post("/v1/integrations/quickbooks/validate", async (_request, reply) => {
    try {
      const tenantSlug = loadEnv().DEFAULT_TENANT_SLUG;
      const [invoices, customers, payments] = await Promise.all([
        loadQuickBooksInvoices(tenantSlug),
        loadQuickBooksCustomers(tenantSlug),
        loadQuickBooksPayments(tenantSlug),
      ]);

      return reply.send({
        status: "validated",
        provider: "quickbooks",
        tenantSlug,
        counts: {
          invoices: invoices?.invoices?.length ?? 0,
          customers: customers?.customers?.length ?? 0,
          contacts: customers?.contacts?.length ?? 0,
          payments: payments?.payments?.length ?? 0,
        },
      });
    } catch (error) {
      return replyFromQuickBooksError(reply, error);
    }
  });
};

function replyFromQuickBooksError(reply: FastifyReply, error: unknown) {
  if (error instanceof z.ZodError) {
    return reply
      .status(400)
      .send({ message: "Invalid QuickBooks request.", issues: error.issues });
  }
  if (error instanceof Error) {
    return reply.status(502).send({ message: error.message });
  }

  return reply.status(502).send({ message: "QuickBooks request failed." });
}
