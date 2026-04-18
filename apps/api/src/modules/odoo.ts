import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { loadEnv } from "@o2c/config";
import { getOdooConnectionService } from "../bootstrap/odoo-connection-service.js";
import {
  createOdooInvoice,
  deleteOdooInvoice,
  getOdooIntegrationStatus,
  getOdooInvoice,
  loadOdooInvoices,
  updateOdooInvoice,
} from "../integrations/odoo.js";

const connectBodySchema = z.object({
  tenantSlug: z.string().min(1).optional(),
  returnTo: z.string().url().optional(),
  baseUrl: z.string().url(),
  database: z.string().min(1).optional(),
  username: z.string().min(1),
  password: z.string().min(1),
  companyId: z.string().min(1).optional(),
  defaultJournalId: z.string().min(1).optional(),
  defaultProductId: z.string().min(1).optional(),
});

const connectSelectionParamsSchema = z.object({
  state: z.string().uuid(),
});

const connectSelectionBodySchema = z.object({
  state: z.string().uuid(),
  database: z.string().min(1),
});

const invoiceCreateSchema = z.object({
  customerReference: z.string().min(1).optional(),
  customerName: z.string().min(1).optional(),
  partnerId: z.coerce.number().int().positive().optional(),
  invoiceNumber: z.string().min(1),
  amountCents: z.coerce.number().int().positive(),
  currencyCode: z.string().min(1).optional(),
  dueDate: z.string().min(1).optional(),
  invoiceDate: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
}).refine(
  (value) => value.partnerId || value.customerReference || value.customerName,
  { message: "Provide partnerId, customerReference, or customerName." },
);

const invoiceUpdateSchema = z.object({
  dueDate: z.string().min(1).optional(),
  invoiceDate: z.string().min(1).optional(),
  amountCents: z.coerce.number().int().positive().optional(),
  description: z.string().min(1).optional(),
}).refine(
  (value) => Object.keys(value).length > 0,
  { message: "Provide at least one invoice field to update." },
);

export const registerOdooRoutes = (app: FastifyInstance): void => {
  app.get("/v1/integrations/odoo/connection", async (_request, reply) => {
    const env = loadEnv();
    const service = getOdooConnectionService();
    return reply.send({
      status: getOdooIntegrationStatus(env.DEFAULT_TENANT_SLUG),
      connection: service.getConnectionSummary(env.DEFAULT_TENANT_SLUG) ?? null,
    });
  });

  app.get("/v1/integrations/odoo/connect/:state", async (request, reply) => {
    const { state } = connectSelectionParamsSchema.parse(request.params ?? {});
    const selection = getOdooConnectionService().getPendingDatabaseSelection(state);
    if (!selection) {
      return reply.status(404).send({ message: "Odoo database selection session was not found." });
    }

    return reply.send({
      status: "select_database",
      selection,
    });
  });

  app.post("/v1/integrations/odoo/connect", async (request, reply) => {
    try {
      const env = loadEnv();
      const payload = connectBodySchema.parse(request.body ?? {});
      const result = await getOdooConnectionService().connectTenant({
        tenantSlug: payload.tenantSlug ?? env.DEFAULT_TENANT_SLUG,
        returnTo: payload.returnTo ?? `http://127.0.0.1:${env.WEB_PORT}/integrations`,
        credentials: {
          baseUrl: payload.baseUrl,
          username: payload.username,
          password: payload.password,
          ...(payload.database ? { database: payload.database } : {}),
          ...(payload.companyId ? { companyId: payload.companyId } : {}),
          ...(payload.defaultJournalId ? { defaultJournalId: payload.defaultJournalId } : {}),
          ...(payload.defaultProductId ? { defaultProductId: payload.defaultProductId } : {}),
        },
      });

      if (result.kind === "select_database") {
        return reply.send({
          status: "select_database",
          selection: result.selection,
        });
      }

      return reply.send({
        status: "connected",
        returnTo: result.returnTo,
        connection: result.connection,
      });
    } catch (error) {
      return replyFromOdooError(reply, error);
    }
  });

  app.post("/v1/integrations/odoo/connect/select", async (request, reply) => {
    try {
      const payload = connectSelectionBodySchema.parse(request.body ?? {});
      const result = await getOdooConnectionService().completeDatabaseSelection({
        state: payload.state,
        database: payload.database,
      });

      return reply.send({
        status: "connected",
        returnTo: result.returnTo,
        connection: result.connection,
      });
    } catch (error) {
      return replyFromOdooError(reply, error);
    }
  });

  app.get("/v1/integrations/odoo/invoices", async (_request, reply) => {
    try {
      const result = await loadOdooInvoices(loadEnv().DEFAULT_TENANT_SLUG);
      if (!result) {
        return reply.status(400).send({ message: "Odoo is not connected for this tenant." });
      }
      return reply.send(result);
    } catch (error) {
      return replyFromOdooError(reply, error);
    }
  });

  app.get("/v1/integrations/odoo/invoices/:invoiceId", async (request, reply) => {
    try {
      const invoiceId = z.coerce.number().int().positive().parse((request.params as { invoiceId?: string }).invoiceId);
      const invoice = await getOdooInvoice(invoiceId, loadEnv().DEFAULT_TENANT_SLUG);
      if (!invoice) {
        return reply.status(404).send({ message: "Odoo invoice not found." });
      }
      return reply.send({ invoice });
    } catch (error) {
      return replyFromOdooError(reply, error);
    }
  });

  app.post("/v1/integrations/odoo/invoices", async (request, reply) => {
    try {
      const payload = invoiceCreateSchema.parse(request.body ?? {});
      const invoice = await createOdooInvoice(
        {
          invoiceNumber: payload.invoiceNumber,
          amountCents: payload.amountCents,
          ...(payload.customerReference ? { customerReference: payload.customerReference } : {}),
          ...(payload.customerName ? { customerName: payload.customerName } : {}),
          ...(payload.partnerId ? { partnerId: payload.partnerId } : {}),
          ...(payload.currencyCode ? { currencyCode: payload.currencyCode } : {}),
          ...(payload.dueDate ? { dueDate: payload.dueDate } : {}),
          ...(payload.invoiceDate ? { invoiceDate: payload.invoiceDate } : {}),
          ...(payload.description ? { description: payload.description } : {}),
        },
        loadEnv().DEFAULT_TENANT_SLUG,
      );
      return reply.status(201).send({ invoice });
    } catch (error) {
      return replyFromOdooError(reply, error);
    }
  });

  app.patch("/v1/integrations/odoo/invoices/:invoiceId", async (request, reply) => {
    try {
      const invoiceId = z.coerce.number().int().positive().parse((request.params as { invoiceId?: string }).invoiceId);
      const payload = invoiceUpdateSchema.parse(request.body ?? {});
      const invoice = await updateOdooInvoice(
        invoiceId,
        {
          ...(payload.dueDate ? { dueDate: payload.dueDate } : {}),
          ...(payload.invoiceDate ? { invoiceDate: payload.invoiceDate } : {}),
          ...(payload.amountCents !== undefined ? { amountCents: payload.amountCents } : {}),
          ...(payload.description ? { description: payload.description } : {}),
        },
        loadEnv().DEFAULT_TENANT_SLUG,
      );
      return reply.send({ invoice });
    } catch (error) {
      return replyFromOdooError(reply, error);
    }
  });

  app.delete("/v1/integrations/odoo/invoices/:invoiceId", async (request, reply) => {
    try {
      const invoiceId = z.coerce.number().int().positive().parse((request.params as { invoiceId?: string }).invoiceId);
      await deleteOdooInvoice(invoiceId, loadEnv().DEFAULT_TENANT_SLUG);
      return reply.status(204).send();
    } catch (error) {
      return replyFromOdooError(reply, error);
    }
  });

  app.post("/v1/integrations/odoo/validate", async (_request, reply) => {
    try {
      const tenantSlug = loadEnv().DEFAULT_TENANT_SLUG;
      const result = await loadOdooInvoices(tenantSlug);
      return reply.send({
        status: "validated",
        provider: "odoo",
        tenantSlug,
        counts: {
          invoices: result?.invoices?.length ?? 0,
        },
      });
    } catch (error) {
      return replyFromOdooError(reply, error);
    }
  });
};

function replyFromOdooError(reply: FastifyReply, error: unknown) {
  if (error instanceof z.ZodError) {
    return reply.status(400).send({ message: "Invalid Odoo request.", issues: error.issues });
  }
  if (error instanceof Error) {
    const statusCode =
      error.message.includes("not found") ? 404 :
      error.message.includes("Only draft") ? 409 :
      error.message.includes("Provide ") ? 400 :
      502;
    return reply.status(statusCode).send({ message: error.message });
  }

  return reply.status(502).send({ message: "Odoo request failed." });
}
