import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildControlCenterConsoleData, getControlCenterService } from "../bootstrap/control-center-service.js";
import { getEmailOutboundService } from "../bootstrap/email-integration-service.js";

const registeredApps = new WeakSet<FastifyInstance>();

const roleSchema = z.enum(["ar_collector", "ar_manager", "controller", "admin"]);

const principalSchema = z.object({
  id: z.string(),
  roles: z.array(roleSchema),
});

const workflowSchema = z.object({
  principal: principalSchema,
  tenantId: z.string().default("default"),
  category: z.enum(["collections", "payments"]),
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  senderIdentityId: z.string().optional(),
  senderEmail: z.string().email().optional(),
  testEmailRecipient: z.string().email().optional(),
  testCallRecipient: z.string().optional(),
  timezone: z.string(),
  outreachWindowStart: z.string(),
  outreachWindowEnd: z.string(),
  outreachDays: z.array(
    z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
  ),
  weekendCallingEnabled: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const workflowUpdateSchema = workflowSchema.partial().extend({
  principal: principalSchema,
});

const stageSchema = z.object({
  principal: principalSchema,
  tenantId: z.string().default("default"),
  workflowId: z.string(),
  order: z.number().int().positive().optional(),
  outreachType: z.enum(["email", "call", "sms"]),
  triggerType: z.enum([
    "relative_due_date",
    "promise_to_pay_state",
    "payment_signal_state",
    "response_gap",
    "manual_operator_trigger",
  ]),
  triggerConfig: z
    .object({
      comparator: z
        .enum([
          "due_in_days",
          "due_today",
          "days_past_due",
          "promise_missed",
          "remittance_missing_after_payment",
          "no_response_after_prior_stage",
          "manual",
        ])
        .optional(),
      offsetDays: z.number().int().optional(),
      referenceStageId: z.string().optional(),
      paymentSignalType: z.enum(["payment_detected", "remittance_missing"]).optional(),
      promiseState: z.enum(["accepted", "due_today", "broken"]).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .default({}),
  templateMode: z.enum(["pre_saved_template", "ai_generated"]),
  templateId: z.string().optional(),
  aiStrategyId: z.string().optional(),
  notes: z.string().optional(),
  enabled: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  riskHints: z.array(z.string()).optional(),
});

const stageUpdateSchema = stageSchema.partial().extend({ principal: principalSchema });

const reorderSchema = z.object({
  principal: principalSchema,
  orderedStageIds: z.array(z.string()).min(1),
});

const templateSchema = z.object({
  principal: principalSchema,
  tenantId: z.string().default("default"),
  name: z.string().min(1),
  folderId: z.string().optional(),
  subject: z.string(),
  body: z.string(),
  ccEmails: z.array(z.string().email()).optional(),
  channelCompatibility: z.array(z.enum(["email", "sms", "voice_agent"])).min(1),
  autoCorrectEnabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  previewSeedKey: z.string().optional(),
});

const templateUpdateSchema = templateSchema.partial().extend({
  principal: principalSchema,
  folderId: z.string().nullable().optional(),
});

const folderSchema = z.object({
  principal: principalSchema,
  tenantId: z.string().default("default"),
  name: z.string().min(1),
});

const callAgentUpdateSchema = z.object({
  principal: principalSchema,
  phoneNumber: z.string().optional(),
  smsEnabled: z.boolean().optional(),
  outboundCallingEnabled: z.boolean().optional(),
  humanSupportNumber: z.string().nullable().optional(),
  handoffToHumanEnabled: z.boolean().optional(),
  manualAgentInstructions: z.string().optional(),
  overrideOpeningLine: z.string().nullable().optional(),
  callRecordingDisclaimerEnabled: z.boolean().optional(),
  providerType: z.enum(["retell", "other"]).nullable().optional(),
  providerConfigMetadata: z.record(z.string(), z.unknown()).optional(),
  defaultBehaviorFlags: z.array(z.string()).optional(),
});

const configUpdateSchema = z.object({
  principal: principalSchema,
  defaultTimezone: z.string().optional(),
  defaultSenderBehavior: z.enum(["preferred_identity", "workflow_specific", "manual_selection"]).optional(),
  allowedChannels: z.array(z.enum(["email", "sms", "call"])).optional(),
  channelFallbackPolicy: z.enum(["none", "same_day_safe_fallback", "manual_review_only"]).optional(),
  sandboxMode: z.enum(["off", "test_recipients_only", "audit_preview_only"]).optional(),
  defaultRiskApprovalMode: z.enum(["standard", "strict"]).optional(),
  seededDemoFlags: z.record(z.string(), z.boolean()).optional(),
});

const feedbackSchema = z.object({
  principal: principalSchema,
  accepted: z.boolean(),
  notes: z.string().optional(),
});

const testEmailSchema = z.object({
  principal: principalSchema,
  senderIdentityId: z.string().optional(),
  recipientEmail: z.string().email(),
  workflowId: z.string().optional(),
  workflowName: z.string().optional(),
});

const workflowCustomerAssignmentSchema = z.object({
  principal: principalSchema,
  tenantId: z.string().default("default"),
  billingAccountId: z.string().min(1),
  parentAccountId: z.string().min(1),
  currentTrack: z
    .enum([
      "standard_reminders",
      "promise_to_pay",
      "issue_resolution",
      "email_only",
      "call_assisted",
      "manual_review",
    ])
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const workflowCustomerActionSchema = z.object({
  principal: principalSchema,
  reason: z.string().optional(),
  effectiveUntil: z.string().optional(),
});

export const registerControlCenterRoutes = (app: FastifyInstance): void => {
  if (registeredApps.has(app)) {
    return;
  }
  registeredApps.add(app);

  app.get("/v1/control-center", async () => buildControlCenterConsoleData());

  app.post("/v1/control-center/test-email", async (request, reply) => {
    const parsed = testEmailSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid control-center test email payload.", issues: parsed.error.issues });
    }

    const now = new Date().toISOString();
    const workflowName = parsed.data.workflowName?.trim() || "Control Center workflow";
    const context = buildControlCenterTestEmailContext({
      now,
      recipientEmail: parsed.data.recipientEmail,
      workflowId: parsed.data.workflowId ?? "control-center-test",
    });
    const result = await getEmailOutboundService().sendWorkflowEmail({
      principal: parsed.data.principal,
      ...(parsed.data.senderIdentityId ? { senderIdentityId: parsed.data.senderIdentityId } : {}),
      workflowKind: "request_remittance",
      account: context.account,
      invoices: context.invoices,
      contact: context.contact,
      subjectLine: `Control Center test: ${workflowName}`,
      bodyPreview: [
        "This is a Control Center test email from Yield AROS.",
        "",
        "It confirms the configured sender identity can send operator-approved workflow outreach.",
      ].join("\n"),
    });

    return reply.send({
      ...result,
      testContext: {
        billingAccountId: context.account.id,
        parentAccountId: context.account.parentAccountId,
        invoiceIds: context.invoices.map((invoice) => invoice.id),
      },
    });
  });

  app.get("/v1/control-center/workflows", async () => {
    return { workflows: getControlCenterService().listWorkflows() };
  });

  app.get("/v1/control-center/workflows/:workflowId", async (request) => {
    const params = z.object({ workflowId: z.string() }).parse(request.params);
    return getControlCenterService().getWorkflowDetail(params.workflowId);
  });

  app.get("/v1/control-center/workflows/:workflowId/customers", async (request) => {
    const params = z.object({ workflowId: z.string() }).parse(request.params);
    return { executions: getControlCenterService().listWorkflowExecutions(params.workflowId) };
  });

  app.post("/v1/control-center/workflows", async (request, reply) => {
    const parsed = workflowSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid workflow payload.", issues: parsed.error.issues });
    }
    return getControlCenterService().createWorkflow({
      principal: parsed.data.principal,
      tenantId: parsed.data.tenantId,
      category: parsed.data.category,
      name: parsed.data.name,
      timezone: parsed.data.timezone,
      outreachWindowStart: parsed.data.outreachWindowStart,
      outreachWindowEnd: parsed.data.outreachWindowEnd,
      outreachDays: parsed.data.outreachDays,
      ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
      ...(parsed.data.senderIdentityId ? { senderIdentityId: parsed.data.senderIdentityId } : {}),
      ...(parsed.data.senderEmail ? { senderEmail: parsed.data.senderEmail } : {}),
      ...(parsed.data.testEmailRecipient ? { testEmailRecipient: parsed.data.testEmailRecipient } : {}),
      ...(parsed.data.testCallRecipient ? { testCallRecipient: parsed.data.testCallRecipient } : {}),
      ...(parsed.data.weekendCallingEnabled !== undefined
        ? { weekendCallingEnabled: parsed.data.weekendCallingEnabled }
        : {}),
      ...(parsed.data.metadata ? { metadata: parsed.data.metadata } : {}),
    });
  });

  app.post("/v1/control-center/workflows/:workflowId/customers", async (request, reply) => {
    const params = z.object({ workflowId: z.string() }).parse(request.params);
    const parsed = workflowCustomerAssignmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ message: "Invalid workflow customer assignment payload.", issues: parsed.error.issues });
    }
    return getControlCenterService().assignWorkflowCustomer({
      principal: parsed.data.principal,
      tenantId: parsed.data.tenantId,
      workflowId: params.workflowId,
      billingAccountId: parsed.data.billingAccountId,
      parentAccountId: parsed.data.parentAccountId,
      ...(parsed.data.currentTrack ? { currentTrack: parsed.data.currentTrack } : {}),
      ...(parsed.data.metadata ? { metadata: parsed.data.metadata } : {}),
    });
  });

  app.post(
    "/v1/control-center/workflows/:workflowId/customers/:executionId/pause",
    async (request, reply) => {
      const params = z.object({ workflowId: z.string(), executionId: z.string() }).parse(request.params);
      const parsed = workflowCustomerActionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ message: "Invalid workflow customer pause payload.", issues: parsed.error.issues });
      }
      return getControlCenterService().pauseWorkflowCustomer({
        principal: parsed.data.principal,
        workflowId: params.workflowId,
        executionId: params.executionId,
        ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
        ...(parsed.data.effectiveUntil ? { effectiveUntil: parsed.data.effectiveUntil } : {}),
      });
    },
  );

  app.post(
    "/v1/control-center/workflows/:workflowId/customers/:executionId/resume",
    async (request, reply) => {
      const params = z.object({ workflowId: z.string(), executionId: z.string() }).parse(request.params);
      const parsed = workflowCustomerActionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ message: "Invalid workflow customer resume payload.", issues: parsed.error.issues });
      }
      return getControlCenterService().resumeWorkflowCustomer({
        principal: parsed.data.principal,
        workflowId: params.workflowId,
        executionId: params.executionId,
        ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
      });
    },
  );

  app.delete(
    "/v1/control-center/workflows/:workflowId/customers/:executionId",
    async (request, reply) => {
      const params = z.object({ workflowId: z.string(), executionId: z.string() }).parse(request.params);
      const parsed = z.object({ principal: principalSchema }).safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ message: "Invalid workflow customer unenroll payload.", issues: parsed.error.issues });
      }
      return getControlCenterService().unenrollWorkflowCustomer({
        principal: parsed.data.principal,
        workflowId: params.workflowId,
        executionId: params.executionId,
      });
    },
  );

  app.put("/v1/control-center/workflows/:workflowId", async (request, reply) => {
    const params = z.object({ workflowId: z.string() }).parse(request.params);
    const parsed = workflowUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid workflow update payload.", issues: parsed.error.issues });
    }
    return getControlCenterService().updateWorkflow(params.workflowId, {
      principal: parsed.data.principal,
      ...(parsed.data.tenantId ? { tenantId: parsed.data.tenantId } : {}),
      ...(parsed.data.category ? { category: parsed.data.category } : {}),
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
      ...(parsed.data.senderIdentityId ? { senderIdentityId: parsed.data.senderIdentityId } : {}),
      ...(parsed.data.senderEmail ? { senderEmail: parsed.data.senderEmail } : {}),
      ...(parsed.data.testEmailRecipient ? { testEmailRecipient: parsed.data.testEmailRecipient } : {}),
      ...(parsed.data.testCallRecipient ? { testCallRecipient: parsed.data.testCallRecipient } : {}),
      ...(parsed.data.timezone ? { timezone: parsed.data.timezone } : {}),
      ...(parsed.data.outreachWindowStart ? { outreachWindowStart: parsed.data.outreachWindowStart } : {}),
      ...(parsed.data.outreachWindowEnd ? { outreachWindowEnd: parsed.data.outreachWindowEnd } : {}),
      ...(parsed.data.outreachDays ? { outreachDays: parsed.data.outreachDays } : {}),
      ...(parsed.data.weekendCallingEnabled !== undefined
        ? { weekendCallingEnabled: parsed.data.weekendCallingEnabled }
        : {}),
      ...(parsed.data.metadata ? { metadata: parsed.data.metadata } : {}),
    });
  });

  app.post("/v1/control-center/workflows/:workflowId/toggle", async (request, reply) => {
    const params = z.object({ workflowId: z.string() }).parse(request.params);
    const parsed = z.object({ principal: principalSchema, enabled: z.boolean() }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid workflow toggle payload.", issues: parsed.error.issues });
    }
    return getControlCenterService().toggleWorkflow(params.workflowId, parsed.data);
  });

  app.delete("/v1/control-center/workflows/:workflowId", async (request, reply) => {
    const params = z.object({ workflowId: z.string() }).parse(request.params);
    const parsed = z.object({ principal: principalSchema }).safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid workflow delete payload.", issues: parsed.error.issues });
    }
    return getControlCenterService().deleteWorkflow(params.workflowId, parsed.data);
  });

  app.post("/v1/control-center/stages", async (request, reply) => {
    const parsed = stageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid stage payload.", issues: parsed.error.issues });
    }
    return getControlCenterService().addStage({
      principal: parsed.data.principal,
      tenantId: parsed.data.tenantId,
      workflowId: parsed.data.workflowId,
      outreachType: parsed.data.outreachType,
      triggerType: parsed.data.triggerType,
      triggerConfig: normalizeTriggerConfig(parsed.data.triggerConfig),
      templateMode: parsed.data.templateMode,
      ...(parsed.data.order !== undefined ? { order: parsed.data.order } : {}),
      ...(parsed.data.templateId ? { templateId: parsed.data.templateId } : {}),
      ...(parsed.data.aiStrategyId ? { aiStrategyId: parsed.data.aiStrategyId } : {}),
      ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
      ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
      ...(parsed.data.requiresApproval !== undefined
        ? { requiresApproval: parsed.data.requiresApproval }
        : {}),
      ...(parsed.data.riskHints ? { riskHints: parsed.data.riskHints } : {}),
    });
  });

  app.put("/v1/control-center/stages/:stageId", async (request, reply) => {
    const params = z.object({ stageId: z.string() }).parse(request.params);
    const parsed = stageUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid stage update payload.", issues: parsed.error.issues });
    }
    return getControlCenterService().updateStage(params.stageId, {
      principal: parsed.data.principal,
      ...(parsed.data.tenantId ? { tenantId: parsed.data.tenantId } : {}),
      ...(parsed.data.workflowId ? { workflowId: parsed.data.workflowId } : {}),
      ...(parsed.data.order !== undefined ? { order: parsed.data.order } : {}),
      ...(parsed.data.outreachType ? { outreachType: parsed.data.outreachType } : {}),
      ...(parsed.data.triggerType ? { triggerType: parsed.data.triggerType } : {}),
      ...(parsed.data.triggerConfig
        ? { triggerConfig: normalizeTriggerConfig(parsed.data.triggerConfig) }
        : {}),
      ...(parsed.data.templateMode ? { templateMode: parsed.data.templateMode } : {}),
      ...(parsed.data.templateId ? { templateId: parsed.data.templateId } : {}),
      ...(parsed.data.aiStrategyId ? { aiStrategyId: parsed.data.aiStrategyId } : {}),
      ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
      ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
      ...(parsed.data.requiresApproval !== undefined
        ? { requiresApproval: parsed.data.requiresApproval }
        : {}),
      ...(parsed.data.riskHints ? { riskHints: parsed.data.riskHints } : {}),
    });
  });

  app.post("/v1/control-center/workflows/:workflowId/stages/reorder", async (request, reply) => {
    const params = z.object({ workflowId: z.string() }).parse(request.params);
    const parsed = reorderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid stage reorder payload.", issues: parsed.error.issues });
    }
    return getControlCenterService().reorderStages(params.workflowId, parsed.data);
  });

  app.delete("/v1/control-center/stages/:stageId", async (request, reply) => {
    const params = z.object({ stageId: z.string() }).parse(request.params);
    const parsed = z.object({ principal: principalSchema }).safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid stage delete payload.", issues: parsed.error.issues });
    }
    return getControlCenterService().removeStage(params.stageId, parsed.data);
  });

  app.get("/v1/control-center/stages/:stageId/preview", async (request) => {
    const params = z.object({ stageId: z.string() }).parse(request.params);
    return getControlCenterService().previewStage(params.stageId);
  });

  app.get("/v1/control-center/templates", async (request) => {
    const query = z.object({ search: z.string().optional() }).parse(request.query);
    const service = getControlCenterService();
    return { templates: service.listTemplates(query.search), folders: service.listFolders() };
  });

  app.post("/v1/control-center/template-folders", async (request, reply) => {
    const parsed = folderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid template folder payload.", issues: parsed.error.issues });
    }
    return getControlCenterService().createFolder(parsed.data);
  });

  app.get("/v1/control-center/template-folders", async () => {
    return { folders: getControlCenterService().listFolders() };
  });

  app.post("/v1/control-center/templates", async (request, reply) => {
    const parsed = templateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid template payload.", issues: parsed.error.issues });
    }
    return getControlCenterService().createTemplate({
      principal: parsed.data.principal,
      tenantId: parsed.data.tenantId,
      name: parsed.data.name,
      subject: parsed.data.subject,
      body: parsed.data.body,
      ...(parsed.data.ccEmails ? { ccEmails: parsed.data.ccEmails } : {}),
      channelCompatibility: parsed.data.channelCompatibility,
      ...(parsed.data.autoCorrectEnabled !== undefined
        ? { autoCorrectEnabled: parsed.data.autoCorrectEnabled }
        : {}),
      ...(parsed.data.folderId ? { folderId: parsed.data.folderId } : {}),
      ...(parsed.data.isDefault !== undefined ? { isDefault: parsed.data.isDefault } : {}),
      ...(parsed.data.previewSeedKey ? { previewSeedKey: parsed.data.previewSeedKey } : {}),
    });
  });

  app.put("/v1/control-center/templates/:templateId", async (request, reply) => {
    const params = z.object({ templateId: z.string() }).parse(request.params);
    const parsed = templateUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid template update payload.", issues: parsed.error.issues });
    }
    return getControlCenterService().updateTemplate(params.templateId, {
      principal: parsed.data.principal,
      ...(parsed.data.tenantId ? { tenantId: parsed.data.tenantId } : {}),
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.folderId !== undefined ? { folderId: parsed.data.folderId } : {}),
      ...(parsed.data.subject ? { subject: parsed.data.subject } : {}),
      ...(parsed.data.body ? { body: parsed.data.body } : {}),
      ...(parsed.data.ccEmails ? { ccEmails: parsed.data.ccEmails } : {}),
      ...(parsed.data.channelCompatibility ? { channelCompatibility: parsed.data.channelCompatibility } : {}),
      ...(parsed.data.autoCorrectEnabled !== undefined
        ? { autoCorrectEnabled: parsed.data.autoCorrectEnabled }
        : {}),
      ...(parsed.data.isDefault !== undefined ? { isDefault: parsed.data.isDefault } : {}),
      ...(parsed.data.previewSeedKey ? { previewSeedKey: parsed.data.previewSeedKey } : {}),
    });
  });

  app.get("/v1/control-center/templates/:templateId/preview", async (request) => {
    const params = z.object({ templateId: z.string() }).parse(request.params);
    return getControlCenterService().previewTemplate(params.templateId);
  });

  app.post("/v1/control-center/templates/:templateId/archive", async (request, reply) => {
    const params = z.object({ templateId: z.string() }).parse(request.params);
    const parsed = z.object({ principal: principalSchema }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid template archive payload.", issues: parsed.error.issues });
    }
    return getControlCenterService().updateTemplate(params.templateId, {
      principal: parsed.data.principal,
      isArchived: true,
    });
  });

  app.get("/v1/control-center/call-agent", async () => {
    return { config: buildControlCenterConsoleData().callAgentConfig };
  });

  app.put("/v1/control-center/call-agent", async (request, reply) => {
    const parsed = callAgentUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid call-agent config payload.", issues: parsed.error.issues });
    }
    return getControlCenterService().updateCallAgent({
      principal: parsed.data.principal,
      ...(parsed.data.phoneNumber ? { phoneNumber: parsed.data.phoneNumber } : {}),
      ...(parsed.data.smsEnabled !== undefined ? { smsEnabled: parsed.data.smsEnabled } : {}),
      ...(parsed.data.outboundCallingEnabled !== undefined
        ? { outboundCallingEnabled: parsed.data.outboundCallingEnabled }
        : {}),
      ...(parsed.data.humanSupportNumber !== undefined
        ? { humanSupportNumber: parsed.data.humanSupportNumber }
        : {}),
      ...(parsed.data.handoffToHumanEnabled !== undefined
        ? { handoffToHumanEnabled: parsed.data.handoffToHumanEnabled }
        : {}),
      ...(parsed.data.manualAgentInstructions
        ? { manualAgentInstructions: parsed.data.manualAgentInstructions }
        : {}),
      ...(parsed.data.overrideOpeningLine !== undefined
        ? { overrideOpeningLine: parsed.data.overrideOpeningLine }
        : {}),
      ...(parsed.data.callRecordingDisclaimerEnabled !== undefined
        ? { callRecordingDisclaimerEnabled: parsed.data.callRecordingDisclaimerEnabled }
        : {}),
      ...(parsed.data.providerType !== undefined
        ? { providerType: parsed.data.providerType }
        : {}),
      ...(parsed.data.providerConfigMetadata
        ? { providerConfigMetadata: parsed.data.providerConfigMetadata }
        : {}),
      ...(parsed.data.defaultBehaviorFlags
        ? { defaultBehaviorFlags: parsed.data.defaultBehaviorFlags }
        : {}),
    });
  });

  app.get("/v1/control-center/call-agent/provider-preview", async () => {
    return getControlCenterService().previewCallAgentPayload();
  });

  app.get("/v1/control-center/config", async () => {
    return { config: getControlCenterService().getConfig() };
  });

  app.put("/v1/control-center/config", async (request, reply) => {
    const parsed = configUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid control-center config payload.", issues: parsed.error.issues });
    }
    return {
      config: getControlCenterService().updateConfig({
        principal: parsed.data.principal,
        ...(parsed.data.defaultTimezone ? { defaultTimezone: parsed.data.defaultTimezone } : {}),
        ...(parsed.data.defaultSenderBehavior
          ? { defaultSenderBehavior: parsed.data.defaultSenderBehavior }
          : {}),
        ...(parsed.data.allowedChannels ? { allowedChannels: parsed.data.allowedChannels } : {}),
        ...(parsed.data.channelFallbackPolicy
          ? { channelFallbackPolicy: parsed.data.channelFallbackPolicy }
          : {}),
        ...(parsed.data.sandboxMode ? { sandboxMode: parsed.data.sandboxMode } : {}),
        ...(parsed.data.defaultRiskApprovalMode
          ? { defaultRiskApprovalMode: parsed.data.defaultRiskApprovalMode }
          : {}),
        ...(parsed.data.seededDemoFlags ? { seededDemoFlags: parsed.data.seededDemoFlags } : {}),
      }),
    };
  });

  app.post("/v1/control-center/ai-generate/stages/:stageId", async (request, reply) => {
    const params = z.object({ stageId: z.string() }).parse(request.params);
    const parsed = z.object({ principal: principalSchema, workflowId: z.string().optional() }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid AI generation payload.", issues: parsed.error.issues });
    }
    return getControlCenterService().generateStageContent({
      principal: parsed.data.principal,
      stageId: params.stageId,
      ...(parsed.data.workflowId ? { workflowId: parsed.data.workflowId } : {}),
    });
  });

  app.get("/v1/control-center/ai-generate/stages/:stageId/context", async (request) => {
    const params = z.object({ stageId: z.string() }).parse(request.params);
    return getControlCenterService().generateStageContent({
      principal: { id: "context_preview", roles: ["ar_manager"] },
      stageId: params.stageId,
    }).generated.retrievedContext;
  });

  app.post("/v1/control-center/ai-generate/stages/:stageId/feedback", async (request, reply) => {
    const params = z.object({ stageId: z.string() }).parse(request.params);
    const parsed = feedbackSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid AI feedback payload.", issues: parsed.error.issues });
    }
    return getControlCenterService().recordGeneratedContentFeedback({
      principal: parsed.data.principal,
      stageId: params.stageId,
      accepted: parsed.data.accepted,
      ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
    });
  });
};

function normalizeTriggerConfig(
  input: z.infer<typeof stageSchema>["triggerConfig"],
) {
  return {
    ...(input.comparator ? { comparator: input.comparator } : {}),
    ...(input.offsetDays !== undefined ? { offsetDays: input.offsetDays } : {}),
    ...(input.referenceStageId ? { referenceStageId: input.referenceStageId } : {}),
    ...(input.paymentSignalType ? { paymentSignalType: input.paymentSignalType } : {}),
    ...(input.promiseState ? { promiseState: input.promiseState } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function buildControlCenterTestEmailContext(input: {
  now: string;
  recipientEmail: string;
  workflowId: string;
}) {
  const parentAccountId = "11111111-1111-4111-8111-111111111111";
  const billingAccountId = "22222222-2222-4222-8222-222222222222";
  const contactId = "33333333-3333-4333-8333-333333333333";
  const invoiceId = "44444444-4444-4444-8444-444444444444";
  const metadata = { source: "control_center_test", workflowId: input.workflowId };

  return {
    account: {
      id: billingAccountId,
      createdAt: input.now,
      updatedAt: input.now,
      parentAccountId,
      accountNumber: "CONTROL-CENTER-TEST",
      displayName: "Control Center Test Account",
      currency: "PHP",
      accountTier: "standard" as const,
      status: "active" as const,
      centrallyPaid: false,
      metadata,
    },
    contact: {
      id: contactId,
      createdAt: input.now,
      updatedAt: input.now,
      parentAccountId,
      billingAccountId,
      scope: "billing_account" as const,
      scopeId: billingAccountId,
      fullName: "Control Center test recipient",
      email: input.recipientEmail,
      role: "ap" as const,
      isPrimary: true,
      isVerified: true,
      allowAutoSend: true,
      recentSuccessfulResponses: 1,
      metadata,
    },
    invoices: [
      {
        id: invoiceId,
        createdAt: input.now,
        updatedAt: input.now,
        state: "synced_open" as const,
        parentAccountId,
        billingAccountId,
        invoiceNumber: "CC-TEST-001",
        currency: "PHP",
        amountCents: 100,
        dueDate: input.now.slice(0, 10),
        metadata,
      },
    ],
  };
}
