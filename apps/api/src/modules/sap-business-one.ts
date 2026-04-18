import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { loadEnv } from "@o2c/config";
import { getSapBusinessOneConnectionService } from "../bootstrap/sap-business-one-connection-service.js";
import { getSapBusinessOneSyncService } from "../bootstrap/sap-business-one-sync-service.js";
import {
  getSapBusinessOneIntegrationStatus,
  isSapBusinessOneConfigured,
  loadSapBusinessOneCustomers,
  loadSapBusinessOneInvoices,
  loadSapBusinessOnePayments,
} from "../integrations/sap-business-one.js";

const connectBodySchema = z.object({
  tenantSlug: z.string().min(1).optional(),
  returnTo: z.string().url().optional(),
  baseUrl: z.string().url(),
  companyDatabase: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  language: z.string().min(1).optional(),
});

const syncRequestSchema = z.object({
  scope: z
    .array(z.enum(["invoices", "customers", "payments"]))
    .min(1)
    .optional(),
});

export const registerSapBusinessOneRoutes = (app: FastifyInstance): void => {
  app.get("/v1/integrations/sap-business-one/connection", async (_request, reply) => {
    const env = loadEnv();
    const service = getSapBusinessOneConnectionService();
    return reply.send({
      status: getSapBusinessOneIntegrationStatus(env.DEFAULT_TENANT_SLUG),
      connection: service.getConnectionSummary(env.DEFAULT_TENANT_SLUG) ?? null,
      sync: {
        latestRun: service.getLatestSyncRun(env.DEFAULT_TENANT_SLUG) ?? null,
        recentRuns: service.listRecentSyncRuns(env.DEFAULT_TENANT_SLUG, 5),
        scheduler: getSapBusinessOneSyncService().getStatus(),
      },
      authorization: {
        provider: "sap_business_one",
        accessMode: "read_write",
        authStrategy: "basic_auth",
        readableObjects: ["invoices", "customers", "payments"],
        writableObjects: ["payment_writeback_staging", "cash_application_writeback_preview"],
      },
    });
  });

  app.post("/v1/integrations/sap-business-one/connect/test", async (request, reply) => {
    try {
      const payload = connectBodySchema.parse(request.body ?? {});
      const result = await getSapBusinessOneConnectionService().testConnection({
        credentials: {
          baseUrl: payload.baseUrl,
          companyDatabase: payload.companyDatabase,
          username: payload.username,
          password: payload.password,
          ...(payload.language ? { language: payload.language } : {}),
        },
      });

      return reply.send({
        status: "ok",
        result,
      });
    } catch (error) {
      return replyFromSapBusinessOneError(reply, error);
    }
  });

  app.post("/v1/integrations/sap-business-one/connect", async (request, reply) => {
    try {
      const env = loadEnv();
      const payload = connectBodySchema.parse(request.body ?? {});
      const result = await getSapBusinessOneConnectionService().connectTenant({
        tenantSlug: payload.tenantSlug ?? env.DEFAULT_TENANT_SLUG,
        returnTo:
          payload.returnTo ?? `http://127.0.0.1:${env.WEB_PORT}/integrations/sap-business-one`,
        credentials: {
          baseUrl: payload.baseUrl,
          companyDatabase: payload.companyDatabase,
          username: payload.username,
          password: payload.password,
          ...(payload.language ? { language: payload.language } : {}),
        },
      });

      return reply.send({
        status: "connected",
        returnTo: result.returnTo,
        connection: result.connection,
      });
    } catch (error) {
      return replyFromSapBusinessOneError(reply, error);
    }
  });

  app.post("/v1/integrations/sap-business-one/sync", async (request, reply) => {
    try {
      if (!isSapBusinessOneConfigured()) {
        return reply.status(400).send({
          message: "SAP Business One integration is not configured for this tenant.",
        });
      }

      const env = loadEnv();
      const payload = syncRequestSchema.parse(request.body ?? {});
      const scope = payload.scope ?? ["invoices", "customers", "payments"];
      const completed = await getSapBusinessOneSyncService().runManualSync(scope);

      return reply.send({
        status: "succeeded",
        run: completed,
      });
    } catch (error) {
      return replyFromSapBusinessOneError(reply, error);
    }
  });

  app.get("/v1/integrations/sap-business-one/invoices", async (_request, reply) => {
    try {
      if (!isSapBusinessOneConfigured()) {
        return reply.status(400).send({
          message: "SAP Business One integration is not configured for this tenant.",
        });
      }

      const result = await loadSapBusinessOneInvoices(loadEnv().DEFAULT_TENANT_SLUG);
      return reply.send(result);
    } catch (error) {
      return replyFromSapBusinessOneError(reply, error);
    }
  });

  app.get("/v1/integrations/sap-business-one/customers", async (_request, reply) => {
    try {
      if (!isSapBusinessOneConfigured()) {
        return reply.status(400).send({
          message: "SAP Business One integration is not configured for this tenant.",
        });
      }

      const result = await loadSapBusinessOneCustomers(loadEnv().DEFAULT_TENANT_SLUG);
      return reply.send(result);
    } catch (error) {
      return replyFromSapBusinessOneError(reply, error);
    }
  });

  app.get("/v1/integrations/sap-business-one/payments", async (_request, reply) => {
    try {
      if (!isSapBusinessOneConfigured()) {
        return reply.status(400).send({
          message: "SAP Business One integration is not configured for this tenant.",
        });
      }

      const result = await loadSapBusinessOnePayments(loadEnv().DEFAULT_TENANT_SLUG);
      return reply.send(result);
    } catch (error) {
      return replyFromSapBusinessOneError(reply, error);
    }
  });

  app.post("/v1/integrations/sap-business-one/validate", async (_request, reply) => {
    try {
      const tenantSlug = loadEnv().DEFAULT_TENANT_SLUG;
      const [invoices, customers, payments] = await Promise.all([
        loadSapBusinessOneInvoices(tenantSlug),
        loadSapBusinessOneCustomers(tenantSlug),
        loadSapBusinessOnePayments(tenantSlug),
      ]);
      return reply.send({
        status: "validated",
        provider: "sap-business-one",
        tenantSlug,
        counts: {
          invoices: invoices?.invoices?.length ?? 0,
          customers: customers?.customers?.length ?? 0,
          payments: payments?.payments?.length ?? 0,
        },
      });
    } catch (error) {
      return replyFromSapBusinessOneError(reply, error);
    }
  });
};

function replyFromSapBusinessOneError(reply: FastifyReply, error: unknown) {
  if (error instanceof z.ZodError) {
    return reply.status(400).send({
      message: "Invalid SAP Business One request.",
      issues: error.issues,
    });
  }
  if (error instanceof Error) {
    return reply.status(502).send({ message: error.message });
  }

  return reply.status(502).send({ message: "SAP Business One request failed." });
}
