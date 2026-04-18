import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { BillingAccount, Contact, Invoice } from "@o2c/domain";
import { getEmailOutboundService, getGmailConnectionService } from "../bootstrap/email-integration-service.js";

const roleSchema = z.enum(["ar_collector", "ar_manager", "controller", "admin"]);

const principalSchema = z.object({
  id: z.string(),
  roles: z.array(roleSchema),
});

const accountSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  parentAccountId: z.string(),
  branchId: z.string().optional(),
  accountNumber: z.string(),
  displayName: z.string(),
  currency: z.string(),
  accountTier: z.enum(["standard", "strategic"]),
  erpCustomerId: z.string().optional(),
  status: z.enum(["active", "inactive"]),
  centrallyPaid: z.boolean(),
  metadata: z.record(z.string(), z.unknown()),
});

const contactSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  parentAccountId: z.string(),
  billingAccountId: z.string().optional(),
  branchId: z.string().optional(),
  invoiceId: z.string().optional(),
  scope: z.enum(["parent_account", "billing_account", "branch", "invoice"]),
  scopeId: z.string(),
  fullName: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  role: z.enum([
    "customer",
    "collector",
    "approver",
    "internal",
    "ap",
    "shared_finance",
    "treasury",
    "branch",
    "invoice",
  ]),
  isPrimary: z.boolean(),
  isVerified: z.boolean(),
  allowAutoSend: z.boolean(),
  recentSuccessfulResponses: z.number().int(),
  metadata: z.record(z.string(), z.unknown()),
});

const invoiceSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  state: z.enum([
    "uploaded_unmatched",
    "synced_open",
    "matched_to_erp",
    "partially_paid",
    "paid",
    "disputed_partial",
    "disputed_full",
    "credit_pending",
    "writeback_pending",
    "writeback_failed",
    "voided",
  ]),
  parentAccountId: z.string(),
  billingAccountId: z.string(),
  branchId: z.string().optional(),
  invoiceContactId: z.string().optional(),
  uploadedDocumentId: z.string().optional(),
  invoiceDate: z.string().optional(),
  invoiceNumber: z.string(),
  currency: z.string(),
  amountCents: z.number().int(),
  provisionalSource: z.literal("bir_upload").optional(),
  dueDate: z.string().optional(),
  disputedAmountCents: z.number().int().optional(),
  metadata: z.record(z.string(), z.unknown()),
});

const sendingIdentityConnectSchema = z.object({
  principal: principalSchema.optional(),
  provider: z.enum(["internal", "gmail", "microsoft_graph", "smtp", "transactional", "other"]),
  authMode: z.enum(["oauth2", "service_account", "smtp_password", "api_key", "delegated_token", "other"]),
  senderEmail: z.string().email(),
  displayName: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  sendAsEmail: z.string().email().optional(),
  sendOnBehalfOfEmail: z.string().email().optional(),
  allowedTenantId: z.string().optional(),
  allowedSupplierScope: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
});

const reminderRequestSchema = z.object({
  principal: principalSchema,
  account: accountSchema,
  invoices: z.array(invoiceSchema).min(1),
  contact: contactSchema,
  senderIdentityId: z.string().optional(),
  scope: z.enum(["account", "invoice"]).optional(),
  sendWindow: z.object({
    timezone: z.string(),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    allowedWeekdays: z.array(z.number().int().min(1).max(7)),
  }).optional(),
});

const sendRequestSchema = z.object({
  principal: principalSchema,
  account: accountSchema,
  invoices: z.array(invoiceSchema).min(1),
  contact: contactSchema,
  senderIdentityId: z.string().optional(),
  workflowKind: z.enum([
    "grouped_reminder",
    "invoice_level_reminder",
    "resend_documents",
    "request_remittance",
    "ptp_follow_up",
    "escalate_to_owner",
  ]),
  subjectLine: z.string().optional(),
  bodyPreview: z.string().optional(),
  contentTemplateKey: z.string().optional(),
  documentIds: z.array(z.string()).optional(),
  sendWindow: z.object({
    timezone: z.string(),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    allowedWeekdays: z.array(z.number().int().min(1).max(7)),
  }).optional(),
});

const inboxQuerySchema = z.object({
  senderIdentityId: z.string().uuid().optional(),
  maxResults: z.coerce.number().int().min(1).max(50).optional(),
});

const inboxThreadParamsSchema = z.object({
  threadId: z.string().min(1),
});

const inboxThreadQuerySchema = z.object({
  senderIdentityId: z.string().uuid().optional(),
});

const inboxReplySchema = z.object({
  principal: principalSchema,
  senderIdentityId: z.string().uuid().optional(),
  providerThreadId: z.string().min(1),
  replyToProviderMessageId: z.string().optional(),
  account: accountSchema,
  contact: contactSchema,
  invoices: z.array(invoiceSchema).optional(),
  subjectLine: z.string().min(1),
  bodyPreview: z.string().min(1),
});

export const registerEmailOutboundRoutes = (app: FastifyInstance): void => {
  app.post("/v1/email/sending-identities/connect", async (request, reply) => {
    const emailService = getEmailOutboundService();
    const parsed = sendingIdentityConnectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid sending identity connection request.",
        issues: parsed.error.issues,
      });
    }

    const identity = emailService.connectSendingIdentity({
      provider: parsed.data.provider,
      authMode: parsed.data.authMode,
      senderEmail: parsed.data.senderEmail,
      ...(parsed.data.displayName ? { displayName: parsed.data.displayName } : {}),
      ...(parsed.data.scopes ? { scopes: parsed.data.scopes } : {}),
      ...(parsed.data.sendAsEmail ? { sendAsEmail: parsed.data.sendAsEmail } : {}),
      ...(parsed.data.sendOnBehalfOfEmail
        ? { sendOnBehalfOfEmail: parsed.data.sendOnBehalfOfEmail }
        : {}),
      ...(parsed.data.allowedTenantId
        ? { allowedTenantId: parsed.data.allowedTenantId }
        : {}),
      ...(parsed.data.allowedSupplierScope
        ? { allowedSupplierScope: parsed.data.allowedSupplierScope }
        : {}),
      ...(parsed.data.isDefault !== undefined ? { isDefault: parsed.data.isDefault } : {}),
      ...(parsed.data.principal ? { principal: parsed.data.principal } : {}),
    });
    return reply.send(identity);
  });

  app.get("/v1/email/sending-identities", async () => {
    const emailService = getEmailOutboundService();
    return {
      identities: emailService.listSendingIdentities(),
    };
  });

  app.post("/v1/email/sending-identities/:identityId/default", async (request) => {
    const emailService = getEmailOutboundService();
    const params = z.object({ identityId: z.string() }).parse(request.params);
    return emailService.setDefaultSendingIdentity(params.identityId);
  });

  app.post("/v1/email/sending-identities/:identityId/validate", async (request, reply) => {
    const emailService = getEmailOutboundService();
    const gmailConnectionService = getGmailConnectionService();
    const params = z.object({ identityId: z.string() }).parse(request.params);
    const identity = emailService.listSendingIdentities().find((item) => item.id === params.identityId);
    if (!identity) {
      return reply.status(404).send({
        message: "Sending identity was not found.",
      });
    }
    if (identity.provider === "gmail") {
      return gmailConnectionService.validateIdentity(identity);
    }
    return emailService.validateSendingIdentityHealth(params.identityId);
  });

  app.post("/v1/email/outbound/preview", async (request, reply) => {
    const emailService = getEmailOutboundService();
    const parsed = reminderRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid outbound email preview request.",
        issues: parsed.error.issues,
      });
    }

    return emailService.previewReminder({
      principal: parsed.data.principal,
      account: toBillingAccount(parsed.data.account),
      invoices: parsed.data.invoices.map(toInvoice),
      contact: toContact(parsed.data.contact),
      ...(parsed.data.senderIdentityId
        ? { senderIdentityId: parsed.data.senderIdentityId }
        : {}),
      ...(parsed.data.scope ? { scope: parsed.data.scope } : {}),
      ...(parsed.data.sendWindow ? { sendWindow: parsed.data.sendWindow } : {}),
    });
  });

  app.post("/v1/email/outbound/draft", async (request, reply) => {
    const emailService = getEmailOutboundService();
    const parsed = reminderRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid outbound email draft request.",
        issues: parsed.error.issues,
      });
    }

    return emailService.draftReminder({
      principal: parsed.data.principal,
      account: toBillingAccount(parsed.data.account),
      invoices: parsed.data.invoices.map(toInvoice),
      contact: toContact(parsed.data.contact),
      ...(parsed.data.senderIdentityId
        ? { senderIdentityId: parsed.data.senderIdentityId }
        : {}),
      ...(parsed.data.scope ? { scope: parsed.data.scope } : {}),
      ...(parsed.data.sendWindow ? { sendWindow: parsed.data.sendWindow } : {}),
    });
  });

  app.post("/v1/email/outbound/send", async (request, reply) => {
    const emailService = getEmailOutboundService();
    const parsed = sendRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid outbound email send request.",
        issues: parsed.error.issues,
      });
    }

    if (
      parsed.data.workflowKind === "grouped_reminder" ||
      parsed.data.workflowKind === "invoice_level_reminder"
    ) {
      return emailService.sendReminder({
        principal: parsed.data.principal,
        account: toBillingAccount(parsed.data.account),
        invoices: parsed.data.invoices.map(toInvoice),
        contact: toContact(parsed.data.contact),
        scope: parsed.data.workflowKind === "invoice_level_reminder" ? "invoice" : "account",
        ...(parsed.data.senderIdentityId
          ? { senderIdentityId: parsed.data.senderIdentityId }
          : {}),
        ...(parsed.data.sendWindow ? { sendWindow: parsed.data.sendWindow } : {}),
      });
    }

    if (parsed.data.workflowKind === "resend_documents") {
      return emailService.sendResendDocuments({
        principal: parsed.data.principal,
        account: toBillingAccount(parsed.data.account),
        invoices: parsed.data.invoices.map(toInvoice),
        contact: toContact(parsed.data.contact),
        ...(parsed.data.senderIdentityId
          ? { senderIdentityId: parsed.data.senderIdentityId }
          : {}),
        subjectLine: parsed.data.subjectLine ?? "Requested invoice documents",
        bodyPreview: parsed.data.bodyPreview ?? "Sending the requested invoice bundle.",
        ...(parsed.data.documentIds ? { documentIds: parsed.data.documentIds } : {}),
      });
    }

    return emailService.sendWorkflowEmail({
      principal: parsed.data.principal,
      account: toBillingAccount(parsed.data.account),
      invoices: parsed.data.invoices.map(toInvoice),
      contact: toContact(parsed.data.contact),
      workflowKind: parsed.data.workflowKind,
      subjectLine: parsed.data.subjectLine ?? "Collections follow-up",
      bodyPreview: parsed.data.bodyPreview ?? "Following up on your account.",
      ...(parsed.data.senderIdentityId
        ? { senderIdentityId: parsed.data.senderIdentityId }
        : {}),
      ...(parsed.data.contentTemplateKey
        ? { contentTemplateKey: parsed.data.contentTemplateKey }
        : {}),
    });
  });

  app.get("/v1/email/conversations/:communicationAttemptId", async (request, reply) => {
    const emailService = getEmailOutboundService();
    const params = z.object({ communicationAttemptId: z.string() }).parse(request.params);
    const conversation = emailService.getConversationMetadata(params.communicationAttemptId);
    if (!conversation) {
      return reply.status(404).send({
        message: `Conversation metadata for ${params.communicationAttemptId} was not found.`,
      });
    }

    return conversation;
  });

  app.get("/v1/email/inbox", async (request, reply) => {
    const gmailConnectionService = getGmailConnectionService();
    const parsed = inboxQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid inbox query.",
        issues: parsed.error.issues,
      });
    }

    try {
      return await gmailConnectionService.listInboxMessages({
        ...(parsed.data.senderIdentityId
          ? { senderIdentityId: parsed.data.senderIdentityId }
          : {}),
        ...(parsed.data.maxResults !== undefined
          ? { maxResults: parsed.data.maxResults }
          : {}),
      });
    } catch (error) {
      return reply.status(400).send({
        message:
          error instanceof Error ? error.message : "Inbox messages could not be loaded.",
      });
    }
  });

  app.get("/v1/email/inbox/threads/:threadId", async (request, reply) => {
    const gmailConnectionService = getGmailConnectionService();
    const params = inboxThreadParamsSchema.parse(request.params);
    const parsed = inboxThreadQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid inbox thread query.",
        issues: parsed.error.issues,
      });
    }

    try {
      return await gmailConnectionService.getInboxThread({
        providerThreadId: params.threadId,
        ...(parsed.data.senderIdentityId
          ? { senderIdentityId: parsed.data.senderIdentityId }
          : {}),
      });
    } catch (error) {
      return reply.status(400).send({
        message: error instanceof Error ? error.message : "Inbox thread could not be loaded.",
      });
    }
  });

  app.post("/v1/email/inbox/reply", async (request, reply) => {
    const emailService = getEmailOutboundService();
    const parsed = inboxReplySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid inbox reply request.",
        issues: parsed.error.issues,
      });
    }

    return emailService.sendInboxReply({
      principal: parsed.data.principal,
      ...(parsed.data.senderIdentityId
        ? { senderIdentityId: parsed.data.senderIdentityId }
        : {}),
      providerThreadId: parsed.data.providerThreadId,
      ...(parsed.data.replyToProviderMessageId
        ? { replyToProviderMessageId: parsed.data.replyToProviderMessageId }
        : {}),
      account: toBillingAccount(parsed.data.account),
      contact: toContact(parsed.data.contact),
      ...(parsed.data.invoices ? { invoices: parsed.data.invoices.map(toInvoice) } : {}),
      subjectLine: parsed.data.subjectLine,
      bodyPreview: parsed.data.bodyPreview,
    });
  });
};

function toBillingAccount(input: z.infer<typeof accountSchema>): BillingAccount {
  return {
    id: input.id,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    parentAccountId: input.parentAccountId,
    accountNumber: input.accountNumber,
    displayName: input.displayName,
    currency: input.currency,
    accountTier: input.accountTier,
    status: input.status,
    centrallyPaid: input.centrallyPaid,
    metadata: input.metadata,
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.erpCustomerId ? { erpCustomerId: input.erpCustomerId } : {}),
  };
}

function toContact(input: z.infer<typeof contactSchema>): Contact {
  return {
    id: input.id,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    parentAccountId: input.parentAccountId,
    scope: input.scope,
    scopeId: input.scopeId,
    fullName: input.fullName,
    role: input.role,
    isPrimary: input.isPrimary,
    isVerified: input.isVerified,
    allowAutoSend: input.allowAutoSend,
    recentSuccessfulResponses: input.recentSuccessfulResponses,
    metadata: input.metadata,
    ...(input.billingAccountId ? { billingAccountId: input.billingAccountId } : {}),
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
    ...(input.email ? { email: input.email } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
  };
}

function toInvoice(input: z.infer<typeof invoiceSchema>): Invoice {
  return {
    id: input.id,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    state: input.state,
    parentAccountId: input.parentAccountId,
    billingAccountId: input.billingAccountId,
    invoiceNumber: input.invoiceNumber,
    currency: input.currency,
    amountCents: input.amountCents,
    metadata: input.metadata,
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.invoiceContactId ? { invoiceContactId: input.invoiceContactId } : {}),
    ...(input.uploadedDocumentId ? { uploadedDocumentId: input.uploadedDocumentId } : {}),
    ...(input.invoiceDate ? { invoiceDate: input.invoiceDate } : {}),
    ...(input.provisionalSource ? { provisionalSource: input.provisionalSource } : {}),
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    ...(input.disputedAmountCents !== undefined
      ? { disputedAmountCents: input.disputedAmountCents }
      : {}),
  };
}
