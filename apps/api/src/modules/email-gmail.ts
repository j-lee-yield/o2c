import { loadEnv } from "@o2c/config";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { getGmailConnectionService } from "../bootstrap/email-integration-service.js";

const connectQuerySchema = z.object({
  returnTo: z.string().url().optional(),
  requestedEmail: z.string().email().optional(),
  makeDefault: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional(),
});

const callbackQuerySchema = z.object({
  state: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  error_description: z.string().optional(),
});

export const registerGmailIntegrationRoutes = (app: FastifyInstance): void => {
  app.get("/v1/integrations/email/gmail/connect", async (request, reply) => {
    try {
      const env = loadEnv();
      const query = connectQuerySchema.parse(request.query);
      const gmailConnectionService = getGmailConnectionService();
      const session = gmailConnectionService.createConnectSession({
        returnTo: query.returnTo ?? `http://127.0.0.1:${env.WEB_PORT}/integrations`,
        ...(query.requestedEmail ? { requestedEmail: query.requestedEmail } : {}),
        ...(query.makeDefault !== undefined
          ? { makeDefault: query.makeDefault === true || query.makeDefault === "true" }
          : {}),
        requestedByPrincipalId: "web_console",
        requestedByPrincipalRoles: ["ar_manager"],
      });

      if (!session) {
        return reply.status(400).send({
          message: "Gmail connection is not configured.",
        });
      }

      return reply.redirect(session.authorizationUrl);
    } catch (error) {
      return replyFromGmailError(reply, error);
    }
  });

  app.get("/v1/integrations/email/gmail/callback", async (request, reply) => {
    try {
      const env = loadEnv();
      const query = callbackQuerySchema.parse(request.query);
      const defaultReturnTo = new URL(`http://127.0.0.1:${env.WEB_PORT}/integrations`);
      if (query.error) {
        defaultReturnTo.searchParams.set("emailConnectError", query.error_description ?? query.error);
        return reply.redirect(defaultReturnTo.toString());
      }

      if (!query.state || !query.code) {
        return reply.status(400).send({
          message: "Gmail callback is missing the authorization code or state.",
        });
      }

      const gmailConnectionService = getGmailConnectionService();
      const result = await gmailConnectionService.completeConnectSession({
        state: query.state,
        code: query.code,
      });
      const target = new URL(result.returnTo);
      target.searchParams.set("emailConnected", "gmail");
      target.searchParams.set("emailSender", result.identity.senderEmail);
      return reply.redirect(target.toString());
    } catch (error) {
      const target = new URL(`http://127.0.0.1:${loadEnv().WEB_PORT}/integrations`);
      target.searchParams.set(
        "emailConnectError",
        error instanceof Error ? error.message : "Gmail connection failed.",
      );
      return reply.redirect(target.toString());
    }
  });
};

function replyFromGmailError(reply: FastifyReply, error: unknown) {
  if (error instanceof z.ZodError) {
    return reply.status(400).send({ message: "Invalid Gmail connection request.", issues: error.issues });
  }
  if (error instanceof Error) {
    return reply.status(502).send({ message: error.message });
  }

  return reply.status(502).send({ message: "Gmail connection request failed." });
}
