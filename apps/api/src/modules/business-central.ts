import { loadEnv } from "@o2c/config";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { getBusinessCentralConnectionService } from "../bootstrap/business-central-connection-service.js";
import {
  getBusinessCentralIntegrationStatus,
  isBusinessCentralConfigured,
  loadBusinessCentralSalesInvoices,
} from "../integrations/business-central.js";

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

  app.post("/v1/integrations/business-central/validate", async (_request, reply) => {
    try {
      const tenantSlug = loadEnv().DEFAULT_TENANT_SLUG;
      const result = await loadBusinessCentralSalesInvoices(tenantSlug);
      return reply.send({
        status: "validated",
        provider: "business-central",
        tenantSlug,
        counts: {
          invoices: result?.invoices?.length ?? 0,
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
