import { AuthorizationError, assertAnyRole, type Principal, type Role } from "@o2c/auth";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  CashApplicationActionNotAllowedError,
  CashApplicationCandidateNotFoundError,
  CashApplicationRecordNotFoundError,
  getCashApplicationService,
} from "../bootstrap/cash-application-service.js";

const paymentParamsSchema = z.object({
  paymentId: z.string().min(1),
});

const writebackQuerySchema = z.object({
  provider: z.enum(["odoo", "quickbooks_online"]).optional(),
});

const paymentCandidateParamsSchema = z.object({
  paymentId: z.string().min(1),
  invoiceId: z.string().min(1),
});

const residualOverrideBodySchema = z.object({
  residualType: z.enum([
    "unapplied_cash",
    "overpayment_hold",
    "customer_short_pay",
    "withholding_under_review",
    "bank_charge_adjustment",
    "writeoff",
  ]),
  reasonCode: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
});

export const registerCashApplicationRoutes = (app: FastifyInstance): void => {
  app.get("/v1/cash-application/queue", async (request, reply) => {
    try {
      parsePrincipal(request);
      const service = await getCashApplicationService();
      return reply.send(await service.getConsoleView());
    } catch (error) {
      return replyFromCashApplicationError(reply, error);
    }
  });

  app.get("/v1/cash-application/:paymentId/finality", async (request, reply) => {
    try {
      parsePrincipal(request);
      const params = paymentParamsSchema.parse(request.params);
      const service = await getCashApplicationService();
      return reply.send(await service.getFinalityView(params.paymentId));
    } catch (error) {
      return replyFromCashApplicationError(reply, error);
    }
  });

  app.get("/v1/cash-application/:paymentId/writeback-preview", async (request, reply) => {
    try {
      parsePrincipal(request);
      const params = paymentParamsSchema.parse(request.params);
      const query = writebackQuerySchema.parse(request.query ?? {});
      const service = await getCashApplicationService();
      return reply.send(await service.getWritebackPreview(params.paymentId, query.provider));
    } catch (error) {
      return replyFromCashApplicationError(reply, error);
    }
  });

  app.post("/v1/cash-application/:paymentId/apply/:invoiceId", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      assertAnyRole(principal, ["controller", "admin"], { action: "cash_application.apply" });
      const params = paymentCandidateParamsSchema.parse(request.params);
      const service = await getCashApplicationService();
      const result = await service.applySuggestedMatch(principal, params.paymentId, params.invoiceId);
      return reply.send(result);
    } catch (error) {
      return replyFromCashApplicationError(reply, error);
    }
  });

  app.post("/v1/cash-application/:paymentId/split/:invoiceId", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      assertAnyRole(principal, ["controller", "admin"], { action: "cash_application.split" });
      const params = paymentCandidateParamsSchema.parse(request.params);
      const service = await getCashApplicationService();
      const result = await service.splitSuggestedMatch(principal, params.paymentId, params.invoiceId);
      return reply.send(result);
    } catch (error) {
      return replyFromCashApplicationError(reply, error);
    }
  });

  app.post("/v1/cash-application/:paymentId/hold", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      assertAnyRole(principal, ["ar_manager", "controller", "admin"], {
        action: "cash_application.hold",
      });
      const params = paymentParamsSchema.parse(request.params);
      const service = await getCashApplicationService();
      const result = await service.holdAsUnapplied(principal, params.paymentId);
      return reply.send(result);
    } catch (error) {
      return replyFromCashApplicationError(reply, error);
    }
  });

  app.post("/v1/cash-application/:paymentId/reject", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      assertAnyRole(principal, ["ar_manager", "controller", "admin"], {
        action: "cash_application.reject",
      });
      const params = paymentParamsSchema.parse(request.params);
      const service = await getCashApplicationService();
      const result = await service.rejectAllSuggestions(principal, params.paymentId);
      return reply.send(result);
    } catch (error) {
      return replyFromCashApplicationError(reply, error);
    }
  });

  app.post("/v1/cash-application/:paymentId/manual-review", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      assertAnyRole(principal, ["ar_manager", "controller", "admin"], {
        action: "cash_application.manual_review",
      });
      const params = paymentParamsSchema.parse(request.params);
      const service = await getCashApplicationService();
      const result = await service.flagForManualReview(principal, params.paymentId);
      return reply.send(result);
    } catch (error) {
      return replyFromCashApplicationError(reply, error);
    }
  });

  app.put("/v1/cash-application/:paymentId/residual", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      assertAnyRole(principal, ["ar_manager", "controller", "admin"], {
        action: "cash_application.override_residual",
      });
      const params = paymentParamsSchema.parse(request.params);
      const body = residualOverrideBodySchema.parse(request.body ?? {});
      const service = await getCashApplicationService();
      const result = await service.overrideResidualAction(principal, params.paymentId, {
        residualType: body.residualType,
        ...(body.reasonCode ? { reasonCode: body.reasonCode } : {}),
        ...(body.note ? { note: body.note } : {}),
      });
      return reply.send(result);
    } catch (error) {
      return replyFromCashApplicationError(reply, error);
    }
  });

  app.post("/v1/cash-application/:paymentId/writeback/stage", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      assertAnyRole(principal, ["controller", "admin"], {
        action: "cash_application.stage_writeback",
      });
      const params = paymentParamsSchema.parse(request.params);
      const query = writebackQuerySchema.parse(request.query ?? {});
      const service = await getCashApplicationService();
      const result = await service.stageWritebackForProvider(
        principal,
        params.paymentId,
        query.provider,
      );
      return reply.send(result);
    } catch (error) {
      return replyFromCashApplicationError(reply, error);
    }
  });
};

function parsePrincipal(request: FastifyRequest): Principal {
  const principalId = request.headers["x-principal-id"];
  const principalRoles = request.headers["x-principal-roles"];
  const id =
    typeof principalId === "string" && principalId.trim().length > 0
      ? principalId
      : "collector_api";
  const roles = parseRoles(principalRoles);
  return { id, roles };
}

function parseRoles(header: string | string[] | undefined): Role[] {
  const rawValue =
    typeof header === "string" ? header : Array.isArray(header) ? header.join(",") : "";
  const roles = rawValue
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is Role =>
      role === "ar_collector" ||
      role === "ar_manager" ||
      role === "controller" ||
      role === "admin"
    );
  return roles.length > 0 ? roles : ["ar_collector"];
}

function replyFromCashApplicationError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthorizationError) {
    return reply.status(403).send({ message: error.message, details: error.details });
  }
  if (error instanceof CashApplicationRecordNotFoundError) {
    return reply.status(404).send({ message: error.message, paymentId: error.paymentId });
  }
  if (error instanceof CashApplicationCandidateNotFoundError) {
    return reply
      .status(404)
      .send({ message: error.message, paymentId: error.paymentId, invoiceId: error.invoiceId });
  }
  if (error instanceof CashApplicationActionNotAllowedError) {
    return reply.status(409).send({ message: error.message });
  }
  if (error instanceof z.ZodError) {
    return reply.status(400).send({ message: "Invalid cash application request.", issues: error.issues });
  }
  throw error;
}
