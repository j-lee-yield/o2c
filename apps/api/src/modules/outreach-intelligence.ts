import type {
  OutreachCommunicationHistory,
  OutreachDeductionOrException,
  OutreachEmailDraft,
  OutreachOperatorFeedbackSignal,
  OutreachPaymentActivity,
  OutreachPolicyDecision,
  OutreachPromiseToPayStatus,
  OutreachRemittanceStatus,
  OutreachSmsDraft,
  VoiceAgentContextPayload,
} from "@o2c/contracts";
import {
  type OutreachGenerationInput,
} from "@o2c/workflows";
import type { BillingAccount, Contact, Invoice } from "@o2c/domain";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getGmailConnectionService } from "../bootstrap/email-integration-service.js";
import { getOutreachIntelligenceService } from "../bootstrap/outreach-intelligence-service.js";

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
  collectibleAmountCents: z.number().int().optional(),
  provisionalSource: z.literal("bir_upload").optional(),
  dueDate: z.string().optional(),
  disputedAmountCents: z.number().int().optional(),
  metadata: z.record(z.string(), z.unknown()),
});

const messageSchema = z.object({
  id: z.string(),
  direction: z.enum(["inbound", "outbound"]),
  occurredAt: z.string(),
  subjectLine: z.string().optional(),
  bodyPreview: z.string(),
  matchedInvoiceIds: z.array(z.string()).optional(),
});

const threadSchema = z.object({
  id: z.string(),
  source: z.enum(["current_thread", "related_thread", "broad_inbox_fallback"]),
  channel: z.literal("email"),
  contactId: z.string().optional(),
  billingAccountId: z.string().optional(),
  providerThreadId: z.string().optional(),
  subjectLine: z.string().optional(),
  participants: z.array(z.string()),
  lastMessageAt: z.string().optional(),
  messages: z.array(messageSchema),
});

const memorySignalSchema = z.object({
  source: z.enum(["operator_feedback", "approved_pattern", "contact_preference"]),
  label: z.string(),
  summary: z.string(),
  value: z.string().optional(),
});

const paymentSchema = z.object({
  id: z.string(),
  occurredAt: z.string(),
  amountCents: z.number().int(),
  currency: z.string(),
  status: z.enum(["pending", "posted", "applied", "review_required"]),
  reference: z.string().optional(),
  matchedInvoiceIds: z.array(z.string()).optional(),
});

const remittanceSchema = z.object({
  id: z.string(),
  occurredAt: z.string(),
  state: z.enum([
    "received_unparsed",
    "parsed_structured",
    "linked_to_payment",
    "linked_to_invoice_candidate",
    "review_required",
    "resolved",
    "orphaned",
  ]),
  amountCents: z.number().int().optional(),
  linkedInvoiceIds: z.array(z.string()).optional(),
  summary: z.string().optional(),
});

const deductionSchema = z.object({
  id: z.string(),
  invoiceId: z.string().optional(),
  amountCents: z.number().int().optional(),
  state: z.string(),
  summary: z.string(),
});

const promiseToPaySchema = z.object({
  id: z.string(),
  state: z.enum([
    "detected_unconfirmed",
    "accepted",
    "due_today",
    "kept",
    "broken",
    "superseded",
    "cancelled",
  ]),
  promisedDate: z.string().optional(),
  promisedAmountCents: z.number().int().optional(),
  summary: z.string().optional(),
});

const gmailThreadLookupSchema = z.object({
  providerThreadId: z.string().min(1),
  senderIdentityId: z.string().optional(),
});

const baseRequestSchema = z.object({
  principal: principalSchema,
  tenantId: z.string().min(1),
  channel: z.enum(["email", "voice_agent", "sms"]),
  intent: z.enum([
    "reminder",
    "overdue_follow_up",
    "request_remittance",
    "resend_documents",
    "ptp_follow_up",
    "escalation",
    "exception_resolution",
  ]),
  account: accountSchema,
  invoices: z.array(invoiceSchema).min(1),
  contact: contactSchema,
  operatorIntent: z.string().optional(),
  currentThread: threadSchema.optional(),
  relatedThreads: z.array(threadSchema).optional(),
  broadInboxFallbackThreads: z.array(threadSchema).optional(),
  accountMemorySignals: z.array(memorySignalSchema).optional(),
  recentPayments: z.array(paymentSchema).optional(),
  remittances: z.array(remittanceSchema).optional(),
  deductions: z.array(deductionSchema).optional(),
  promiseToPay: promiseToPaySchema.optional(),
  crossEntityAmbiguity: z
    .object({
      isAmbiguous: z.boolean(),
      reason: z.string(),
    })
    .optional(),
  gmailThreadLookup: gmailThreadLookupSchema.optional(),
});

const feedbackSchema = z.object({
  principal: principalSchema,
  tenantId: z.string().min(1),
  bundleId: z.string().min(1),
  channel: z.enum(["email", "voice_agent", "sms"]),
  action: z.enum(["edited", "accepted", "rejected"]),
  originalOutput: z.record(z.string(), z.unknown()),
  editedOutput: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().optional(),
});

const executionHandoffSchema = z.object({
  principal: principalSchema,
  tenantId: z.string().min(1),
  bundleId: z.string().min(1),
  channel: z.enum(["email", "voice_agent", "sms"]),
  provider: z.enum(["retell", "sms_stub", "email_stub"]),
  output: z.record(z.string(), z.unknown()),
  policy: z.object({
    outreachAllowed: z.boolean(),
    operatorReviewRequired: z.boolean(),
    approvalRequired: z.boolean(),
    escalationRequired: z.boolean(),
    confidenceLow: z.boolean(),
    reviewStatus: z.enum(["ready_for_review", "blocked", "approval_required"]),
    disallowedStatements: z.array(z.string()),
    prohibitedClaims: z.array(z.string()),
    warnings: z.array(
      z.enum([
        "disputed_invoice",
        "unverified_contact",
        "cross_entity_ambiguity",
        "branch_context_preserved",
        "billing_account_context_preserved",
        "approval_required",
        "low_confidence_personalization",
        "broad_inbox_fallback_used",
        "promise_to_pay_broken",
        "remittance_pending_review",
        "deduction_or_exception_open",
      ]),
    ),
    channelRestrictions: z.object({
      email: z.array(z.string()),
      voiceAgent: z.array(z.string()),
      sms: z.array(z.string()),
      autoSendAllowed: z.boolean(),
      handoffAllowed: z.boolean(),
    }),
    rationale: z.array(z.string()),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const registerOutreachIntelligenceRoutes = (app: FastifyInstance): void => {
  app.get("/v1/collections/outreach", async () => ({
    module: "collections_outreach_intelligence",
    status: "implemented",
    capabilities: [
      "context bundle generation",
      "email drafting",
      "voice-agent payload generation",
      "sms drafting",
      "operator feedback logging",
      "execution handoff preparation",
    ],
  }));

  app.post("/v1/collections/outreach/context-bundle", async (request, reply) => {
    const parsed = baseRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid outreach context request.",
        issues: parsed.error.issues,
      });
    }

    const input = await resolveGenerationInput(parsed.data);
    return getService().previewContext(input);
  });

  app.post("/v1/collections/outreach/context-preview", async (request, reply) => {
    const parsed = baseRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid outreach context preview request.",
        issues: parsed.error.issues,
      });
    }

    const input = await resolveGenerationInput(parsed.data);
    return getService().previewContext(input);
  });

  app.post("/v1/collections/outreach/email-draft", async (request, reply) => {
    const parsed = baseRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid outreach email draft request.",
        issues: parsed.error.issues,
      });
    }

    const input = await resolveGenerationInput({ ...parsed.data, channel: "email" });
    return getService().generateEmailDraft(input);
  });

  app.post("/v1/collections/outreach/voice-agent-context", async (request, reply) => {
    const parsed = baseRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid voice-agent context request.",
        issues: parsed.error.issues,
      });
    }

    const input = await resolveGenerationInput({ ...parsed.data, channel: "voice_agent" });
    return getService().generateVoiceAgentPayload(input);
  });

  app.post("/v1/collections/outreach/sms-draft", async (request, reply) => {
    const parsed = baseRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid outreach SMS draft request.",
        issues: parsed.error.issues,
      });
    }

    const input = await resolveGenerationInput({ ...parsed.data, channel: "sms" });
    return getService().generateSmsDraft(input);
  });

  app.post("/v1/collections/outreach/operator-feedback", async (request, reply) => {
    const parsed = feedbackSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid outreach operator feedback request.",
        issues: parsed.error.issues,
      });
    }

    const feedbackInput = {
      principal: parsed.data.principal,
      tenantId: parsed.data.tenantId,
      bundleId: parsed.data.bundleId,
      channel: parsed.data.channel,
      action: parsed.data.action,
      originalOutput: parsed.data.originalOutput,
      ...(parsed.data.editedOutput ? { editedOutput: parsed.data.editedOutput } : {}),
      ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
    };
    return getService().recordOperatorFeedback(feedbackInput);
  });

  app.post("/v1/collections/outreach/execution-handoff", async (request, reply) => {
    const parsed = executionHandoffSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid outreach execution handoff request.",
        issues: parsed.error.issues,
      });
    }

    return getService().prepareExecutionHandoff({
      principal: parsed.data.principal,
      tenantId: parsed.data.tenantId,
      bundleId: parsed.data.bundleId,
      channel: parsed.data.channel,
      provider: parsed.data.provider,
      output: parsed.data.output as unknown as OutreachEmailDraft | VoiceAgentContextPayload | OutreachSmsDraft,
      policy: parsed.data.policy as OutreachPolicyDecision,
      ...(parsed.data.metadata ? { metadata: parsed.data.metadata } : {}),
    });
  });
};

function getService() {
  return getOutreachIntelligenceService();
}

async function resolveGenerationInput(
  input: z.infer<typeof baseRequestSchema>,
): Promise<OutreachGenerationInput> {
  const currentThread =
    (input.currentThread ? toThread(input.currentThread) : undefined) ??
    (input.gmailThreadLookup ? await loadGmailThread(input.gmailThreadLookup) : undefined);

  const resolved: OutreachGenerationInput = {
    principal: input.principal,
    tenantId: input.tenantId,
    channel: input.channel,
    intent: input.intent,
    account: toBillingAccount(input.account),
    invoices: input.invoices.map(toInvoice),
    contact: toContact(input.contact),
  };

  if (input.operatorIntent) {
    resolved.operatorIntent = input.operatorIntent;
  }
  if (currentThread) {
    resolved.currentThread = currentThread;
  }
  if (input.relatedThreads) {
    resolved.relatedThreads = input.relatedThreads.map(toThread);
  }
  if (input.broadInboxFallbackThreads) {
    resolved.broadInboxFallbackThreads = input.broadInboxFallbackThreads.map(toThread);
  }
  if (input.accountMemorySignals) {
    resolved.accountMemorySignals = input.accountMemorySignals.map(toMemorySignal);
  }
  if (input.recentPayments) {
    resolved.recentPayments = input.recentPayments.map(toPayment);
  }
  if (input.remittances) {
    resolved.remittances = input.remittances.map(toRemittance);
  }
  if (input.deductions) {
    resolved.deductions = input.deductions.map(toDeduction);
  }
  if (input.promiseToPay) {
    resolved.promiseToPay = toPromiseToPay(input.promiseToPay);
  }
  if (input.crossEntityAmbiguity) {
    resolved.crossEntityAmbiguity = input.crossEntityAmbiguity;
  }

  return resolved;
}

async function loadGmailThread(
  lookup: z.infer<typeof gmailThreadLookupSchema>,
): Promise<OutreachCommunicationHistory | undefined> {
  try {
    const gmail = getGmailConnectionService();
    const thread = await gmail.getInboxThread({
      providerThreadId: lookup.providerThreadId,
      ...(lookup.senderIdentityId ? { senderIdentityId: lookup.senderIdentityId } : {}),
    });

    return {
      id: thread.thread.providerThreadId,
      source: "current_thread",
      channel: "email",
      providerThreadId: thread.thread.providerThreadId,
      participants: thread.thread.participants,
      ...(thread.thread.subjectLine ? { subjectLine: thread.thread.subjectLine } : {}),
      ...(thread.thread.latestMessageAt ? { lastMessageAt: thread.thread.latestMessageAt } : {}),
      messages: thread.thread.messages.map((message) => ({
        id: message.providerMessageId,
        direction: message.direction,
        occurredAt: message.receivedAt ?? new Date().toISOString(),
        ...(message.subjectLine ? { subjectLine: message.subjectLine } : {}),
        bodyPreview: message.snippet ?? "",
      })),
    };
  } catch {
    return undefined;
  }
}

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
    ...(input.collectibleAmountCents !== undefined
      ? { collectibleAmountCents: input.collectibleAmountCents }
      : {}),
    ...(input.provisionalSource ? { provisionalSource: input.provisionalSource } : {}),
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    ...(input.disputedAmountCents !== undefined
      ? { disputedAmountCents: input.disputedAmountCents }
      : {}),
  };
}

function toThread(input: z.infer<typeof threadSchema>): OutreachCommunicationHistory {
  return {
    id: input.id,
    source: input.source,
    channel: "email",
    participants: input.participants,
    messages: input.messages.map((message) => ({
      id: message.id,
      direction: message.direction,
      occurredAt: message.occurredAt,
      bodyPreview: message.bodyPreview,
      ...(message.subjectLine ? { subjectLine: message.subjectLine } : {}),
      ...(message.matchedInvoiceIds ? { matchedInvoiceIds: message.matchedInvoiceIds } : {}),
    })),
    ...(input.contactId ? { contactId: input.contactId } : {}),
    ...(input.billingAccountId ? { billingAccountId: input.billingAccountId } : {}),
    ...(input.providerThreadId ? { providerThreadId: input.providerThreadId } : {}),
    ...(input.subjectLine ? { subjectLine: input.subjectLine } : {}),
    ...(input.lastMessageAt ? { lastMessageAt: input.lastMessageAt } : {}),
  };
}

function toMemorySignal(
  input: z.infer<typeof memorySignalSchema>,
): OutreachOperatorFeedbackSignal {
  return {
    source: input.source,
    label: input.label,
    summary: input.summary,
    ...(input.value ? { value: input.value } : {}),
  };
}

function toPayment(input: z.infer<typeof paymentSchema>): OutreachPaymentActivity {
  return {
    id: input.id,
    occurredAt: input.occurredAt,
    amountCents: input.amountCents,
    currency: input.currency,
    status: input.status,
    ...(input.reference ? { reference: input.reference } : {}),
    ...(input.matchedInvoiceIds ? { matchedInvoiceIds: input.matchedInvoiceIds } : {}),
  };
}

function toRemittance(input: z.infer<typeof remittanceSchema>): OutreachRemittanceStatus {
  return {
    id: input.id,
    occurredAt: input.occurredAt,
    state: input.state,
    ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
    ...(input.linkedInvoiceIds ? { linkedInvoiceIds: input.linkedInvoiceIds } : {}),
    ...(input.summary ? { summary: input.summary } : {}),
  };
}

function toDeduction(input: z.infer<typeof deductionSchema>): OutreachDeductionOrException {
  return {
    id: input.id,
    state: input.state,
    summary: input.summary,
    ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
    ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
  };
}

function toPromiseToPay(input: z.infer<typeof promiseToPaySchema>): OutreachPromiseToPayStatus {
  return {
    id: input.id,
    state: input.state,
    ...(input.promisedDate ? { promisedDate: input.promisedDate } : {}),
    ...(input.promisedAmountCents !== undefined
      ? { promisedAmountCents: input.promisedAmountCents }
      : {}),
    ...(input.summary ? { summary: input.summary } : {}),
  };
}
