import {
  DeterministicOperatorFeedbackCaptureService,
  type AccountBehaviorProfile,
  type ContactBehaviorProfile,
  type LearningEvent,
  type OperatorFeedback,
  operatorFeedbackTargets,
  operatorFeedbackTypes,
} from "@o2c/domain";
import {
  createDatabaseClientConfig,
  isDatabaseAvailable,
  loadPersistedCustomerProfile,
  PostgresLearningLayerRecomputeService,
  PostgresLearningLayerRuntimeStore,
} from "@o2c/database";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

const feedbackCaptureService = new DeterministicOperatorFeedbackCaptureService();
const databaseUrl = createDatabaseClientConfig().connectionString;

const recordSchema = z.record(z.string(), z.unknown());

const feedbackSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1).optional(),
  feedbackType: z.enum(operatorFeedbackTypes),
  targetType: z.enum(operatorFeedbackTargets),
  targetId: z.string().min(1),
  occurredAt: z.string().min(1),
  parentAccountId: z.string().min(1).optional(),
  billingAccountId: z.string().min(1).optional(),
  branchId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  linkedLearningEventId: z.string().min(1).optional(),
  linkedNextBestActionScoreId: z.string().min(1).optional(),
  reasonCode: z.string().min(1),
  comment: z.string().min(1).optional(),
  beforePayload: recordSchema.optional(),
  afterPayload: recordSchema.optional(),
  appliesToFutureScoring: z.boolean(),
  preservesSafetyRules: z.boolean(),
  metadata: recordSchema.optional(),
});

const accountRecomputeSchema = z.object({
  profileId: z.string().min(1),
  scope: z.enum(["parent_account", "billing_account", "branch"]),
  scopeId: z.string().min(1),
  parentAccountId: z.string().min(1),
  billingAccountId: z.string().min(1).optional(),
  branchId: z.string().min(1).optional(),
  metadata: recordSchema.optional(),
});

const contactRecomputeSchema = z.object({
  profileId: z.string().min(1),
  contactId: z.string().min(1),
  parentAccountId: z.string().min(1),
  billingAccountId: z.string().min(1).optional(),
  branchId: z.string().min(1).optional(),
  verificationSnapshot: z.object({
    emailVerified: z.boolean(),
    smsNumberVerified: z.boolean(),
    phoneNumberVerified: z.boolean(),
  }),
  metadata: recordSchema.optional(),
});

const captureRequestSchema = z.object({
  feedback: feedbackSchema,
  history: z
    .object({
      events: z.array(recordSchema).optional(),
      feedback: z.array(recordSchema).optional(),
    })
    .optional(),
  recomputeProfiles: z
    .object({
      account: accountRecomputeSchema.optional(),
      contact: contactRecomputeSchema.optional(),
    })
    .optional(),
});

const customerProfileQuerySchema = z.object({
  billingAccountId: z.string().min(1).optional(),
  accountNumber: z.string().min(1).optional(),
  contactEmail: z.string().min(1).optional(),
});

const recomputeRequestSchema = z.object({
  tenantId: z.string().min(1).optional(),
  billingAccountId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  parentAccountId: z.string().min(1).optional(),
  branchId: z.string().min(1).optional(),
  computedAt: z.string().min(1).optional(),
});

export const registerOperatorFeedbackRoutes = (app: FastifyInstance): void => {
  app.get("/v1/learning_layer", async () => ({
    module: "learning_layer",
    status: "implemented",
    capabilities: [
      "event ingestion",
      "behavior profiling",
      "customer profile read model",
      "operator supervision",
      "next best action scoring",
      "operator feedback capture",
      "profile recompute",
    ],
  }));

  app.get("/v1/learning_layer/customer-profiles", async (request, reply) => {
    const parsed = customerProfileQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid customer profile query.",
        issues: parsed.error.issues,
      });
    }

    const { billingAccountId, accountNumber, contactEmail } = parsed.data;
    if (!billingAccountId && !accountNumber) {
      return reply.status(400).send({
        message: "billingAccountId or accountNumber is required.",
      });
    }

    if (!(databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl))) {
      return reply.status(503).send({
        message: "Learning-layer database is unavailable.",
      });
    }

    const principal = parsePrincipal(request);
    const tenantId = principal.tenantId ?? "default";
    const profile = loadPersistedCustomerProfile({
      databaseUrl,
      tenantId,
      ...(billingAccountId ? { billingAccountId } : {}),
      ...(accountNumber ? { accountNumber } : {}),
      ...(contactEmail ? { contactEmail } : {}),
    });

    if (!profile) {
      return reply.status(404).send({
        message: "Customer profile not found.",
      });
    }

    return reply.send(profile);
  });

  app.post("/v1/learning_layer/recompute", async (request, reply) => {
    const parsed = recomputeRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid recompute request.",
        issues: parsed.error.issues,
      });
    }

    if (!(databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl))) {
      return reply.status(503).send({
        message: "Learning-layer database is unavailable.",
      });
    }

    const principal = parsePrincipal(request);
    const tenantId = parsed.data.tenantId ?? principal.tenantId ?? "default";
    const recomputeService = new PostgresLearningLayerRecomputeService(databaseUrl);
    const result = recomputeService.recompute({
      tenantId,
      ...(parsed.data.billingAccountId
        ? { billingAccountId: parsed.data.billingAccountId }
        : {}),
      ...(parsed.data.contactId ? { contactId: parsed.data.contactId } : {}),
      ...(parsed.data.parentAccountId
        ? { parentAccountId: parsed.data.parentAccountId }
        : {}),
      ...(parsed.data.branchId ? { branchId: parsed.data.branchId } : {}),
      ...(parsed.data.computedAt ? { computedAt: parsed.data.computedAt } : {}),
      actorId: principal.actorId,
    });

    return reply.status(202).send(result);
  });

  app.post("/v1/learning_layer/operator-feedback", async (request, reply) => {
    const parsed = captureRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid operator feedback request.",
        issues: parsed.error.issues,
      });
    }

    const principal = parsePrincipal(request);
    const { feedback, history, recomputeProfiles } = parsed.data;
    const tenantId = feedback.tenantId ?? principal.tenantId ?? "default";
    const databaseBacked = databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl);
    const runtimeStore =
      databaseBacked ? new PostgresLearningLayerRuntimeStore(databaseUrl) : undefined;
    const persistedHistory = runtimeStore?.loadHistory({
      tenantId,
      targetType: feedback.targetType,
      targetId: feedback.targetId,
      ...(feedback.parentAccountId ? { parentAccountId: feedback.parentAccountId } : {}),
      ...(feedback.billingAccountId ? { billingAccountId: feedback.billingAccountId } : {}),
      ...(feedback.branchId ? { branchId: feedback.branchId } : {}),
      ...(feedback.contactId ? { contactId: feedback.contactId } : {}),
    });
    const result = feedbackCaptureService.capture({
      id: feedback.id,
      feedbackType: feedback.feedbackType,
      targetType: feedback.targetType,
      targetId: feedback.targetId,
      occurredAt: feedback.occurredAt,
      reasonCode: feedback.reasonCode,
      appliesToFutureScoring: feedback.appliesToFutureScoring,
      preservesSafetyRules: feedback.preservesSafetyRules,
      ...(feedback.parentAccountId ? { parentAccountId: feedback.parentAccountId } : {}),
      ...(feedback.billingAccountId ? { billingAccountId: feedback.billingAccountId } : {}),
      ...(feedback.branchId ? { branchId: feedback.branchId } : {}),
      ...(feedback.contactId ? { contactId: feedback.contactId } : {}),
      ...(feedback.linkedLearningEventId
        ? { linkedLearningEventId: feedback.linkedLearningEventId }
        : {}),
      ...(feedback.linkedNextBestActionScoreId
        ? { linkedNextBestActionScoreId: feedback.linkedNextBestActionScoreId }
        : {}),
      ...(feedback.comment ? { comment: feedback.comment } : {}),
      ...(feedback.beforePayload ? { beforePayload: feedback.beforePayload } : {}),
      ...(feedback.afterPayload ? { afterPayload: feedback.afterPayload } : {}),
      ...(feedback.metadata ? { metadata: feedback.metadata } : {}),
      existingEvents: (
        persistedHistory?.events ?? history?.events ?? []
      ) as unknown as LearningEvent[],
      existingFeedback: (
        persistedHistory?.feedback ?? history?.feedback ?? []
      ) as unknown as OperatorFeedback[],
      ...(recomputeProfiles?.account
        ? {
            recomputeAccountProfile: {
              profileId: recomputeProfiles.account.profileId,
              scope: recomputeProfiles.account.scope,
              scopeId: recomputeProfiles.account.scopeId,
              parentAccountId: recomputeProfiles.account.parentAccountId,
              ...(recomputeProfiles.account.billingAccountId
                ? { billingAccountId: recomputeProfiles.account.billingAccountId }
                : {}),
              ...(recomputeProfiles.account.branchId
                ? { branchId: recomputeProfiles.account.branchId }
                : {}),
              ...(recomputeProfiles.account.metadata
                ? { metadata: recomputeProfiles.account.metadata }
                : {}),
            },
          }
        : {}),
      ...(recomputeProfiles?.contact
        ? {
            recomputeContactProfile: {
              profileId: recomputeProfiles.contact.profileId,
              contactId: recomputeProfiles.contact.contactId,
              parentAccountId: recomputeProfiles.contact.parentAccountId,
              verificationSnapshot: recomputeProfiles.contact.verificationSnapshot,
              ...(recomputeProfiles.contact.billingAccountId
                ? { billingAccountId: recomputeProfiles.contact.billingAccountId }
                : {}),
              ...(recomputeProfiles.contact.branchId
                ? { branchId: recomputeProfiles.contact.branchId }
                : {}),
              ...(recomputeProfiles.contact.metadata
                ? { metadata: recomputeProfiles.contact.metadata }
                : {}),
            },
          }
        : {}),
      actorId: principal.actorId,
      actorRole: "user",
      tenantId,
    });

    runtimeStore?.persistCapture(result);

    return reply.status(201).send({
      feedback: result.feedback,
      emittedEvents: result.emittedEvents,
      ...(result.updatedAccountProfile
        ? { updatedAccountProfile: result.updatedAccountProfile as AccountBehaviorProfile }
        : {}),
      ...(result.updatedContactProfile
        ? { updatedContactProfile: result.updatedContactProfile as ContactBehaviorProfile }
        : {}),
    });
  });
};

function parsePrincipal(request: FastifyRequest): {
  actorId: string;
  tenantId?: string;
} {
  const actorIdHeader = request.headers["x-principal-id"];
  const tenantHeader = request.headers["x-tenant-id"];
  return {
    actorId:
      typeof actorIdHeader === "string" && actorIdHeader.trim().length > 0
        ? actorIdHeader
        : "operator_feedback_api",
    ...(typeof tenantHeader === "string" && tenantHeader.trim().length > 0
      ? { tenantId: tenantHeader }
      : {}),
  };
}
