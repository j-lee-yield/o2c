import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import { createActivityLogDomainHelpers } from "@o2c/audit";
import { loadEnv } from "@o2c/config";
import {
  createDatabaseClientConfig,
  isDatabaseAvailable,
  PostgresImmutableActivityLogStore,
  queryJsonRows
} from "@o2c/database";
import type { BillingAccount, Contact, CustomerInvoice, PromiseToPay } from "@o2c/domain";
import {
  buildRetellLiveAccountSnapshot,
  buildRetellLiveCallbackRequest,
  buildRetellLiveNonCommitment,
  buildRetellLivePartialPaymentCommitment,
  buildRetellLivePaymentPlanRequest,
  buildRetellLiveCreatePromiseToPay,
  buildRetellLiveDisputeCapture,
  buildRetellLiveGroupInvoiceDetails,
  buildRetellLiveHandlerHandoff,
  buildRetellLivePaidAlreadyClaim,
  buildRetellLiveSendStatementOfAccountDecision,
  buildRetellLiveSendInvoiceCopyDecision,
  buildRetellLiveSendPaymentLinkDecision,
  buildRetellLiveUpdatePromiseToPay,
  resolveCollectionsVoicePreCallAsOf,
  type RetellLiveFunctionBaseInput,
  type RetellLiveFunctionResponse
} from "@o2c/workflows";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { getCallInboxService } from "../../bootstrap/call-inbox-service.js";
import { getEmailOutboundService } from "../../bootstrap/email-integration-service.js";
import { createOperatorConsoleCanonicalImportService } from "../../bootstrap/operator-console-canonical-import-service.js";
import { runRetellCallInboxSync } from "../../bootstrap/retell-call-inbox-sync-service.js";
import { getTaskService } from "../../bootstrap/task-service.js";
import { RetellConfigurationError, RetellHttpClient, RetellProviderError } from "./client.js";
import {
  parseRetellWebhookEnvelope,
  postCallOutcomeToCallInboxUpsert,
  retellCallToCallInboxUpsert,
  retellWebhookToCallInboxUpsert,
  toCallInboxTaskReferences
} from "./call-inbox-adapter.js";
import { buildRetellCustomFunctionCatalog } from "./custom-functions.catalog.js";
import { loadPromiseToPayContextRows } from "./promise-to-pay-loader.js";
import { scheduleRetellPostCallAutomation } from "./post-call-automation.js";
import { buildRetellStatementEmailBody } from "./email-copy.js";
import { createStatementOfAccountPdfAttachment } from "./statement-of-account-pdf.js";
import {
  RetellPreCallOrchestrationService,
  type RetellCollectionsCallResult,
  type RetellPostCallOutcomeResult,
  type RetellInboundRoutingResult
} from "./service.js";
import { verifyRetellCustomFunctionSignature } from "./signature.js";

const roleSchema = z.enum(["ar_collector", "ar_manager", "controller", "admin"]);

const principalSchema = z.object({
  id: z.string(),
  roles: z.array(roleSchema)
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
  metadata: z.record(z.string(), z.unknown())
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
    "invoice"
  ]),
  isPrimary: z.boolean(),
  isVerified: z.boolean(),
  allowAutoSend: z.boolean(),
  recentSuccessfulResponses: z.number().int(),
  metadata: z.record(z.string(), z.unknown())
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
    "voided"
  ]),
  sellerEntityId: z.string().optional(),
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
  disputedAmountCents: z.number().int().optional(),
  provisionalSource: z.literal("bir_upload").optional(),
  dueDate: z.string().optional(),
  metadata: z.record(z.string(), z.unknown())
});

const promiseToPaySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  state: z.enum([
    "detected_unconfirmed",
    "accepted",
    "due_today",
    "kept",
    "broken",
    "superseded",
    "cancelled"
  ]),
  parentAccountId: z.string(),
  billingAccountId: z.string(),
  contactId: z.string().optional(),
  installmentLineIds: z.array(z.string()).optional(),
  promisedAmountCents: z.number().int(),
  currency: z.string(),
  promiseDate: z.string(),
  metadata: z.record(z.string(), z.unknown())
});

const callWindowSchema = z.object({
  timezone: z.string(),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
  allowedWeekdays: z.array(z.number().int().min(1).max(7))
});

const baseCallRequestSchema = z.object({
  principal: principalSchema,
  tenantId: z.string().min(1).optional(),
  asOf: z.string().optional(),
  preDueWindowDays: z.number().int().min(0).max(60).optional(),
  callWindow: callWindowSchema.optional(),
  approvalRequestId: z.string().optional(),
  retell: z
    .object({
      fromNumber: z.string().min(1).optional(),
      overrideAgentId: z.string().min(1).optional()
    })
    .optional()
});

const inlineCallRequestSchema = baseCallRequestSchema.extend({
  account: accountSchema,
  contact: contactSchema,
  invoices: z.array(invoiceSchema).min(1),
  promisesToPay: z.array(promiseToPaySchema).optional()
});

const referenceCallRequestSchema = baseCallRequestSchema.extend({
  billingAccountId: z.string().min(1),
  contactId: z.string().min(1),
  invoiceIds: z.array(z.string().min(1)).optional()
});

const outboundCallRequestSchema = z.union([inlineCallRequestSchema, referenceCallRequestSchema]);

type OutboundCallRequest = z.infer<typeof outboundCallRequestSchema>;

const inboundCallRequestSchema = baseCallRequestSchema.extend({
  callerPhoneNumber: z.string().min(1),
  billingAccountId: z.string().min(1).optional(),
  accounts: z.array(accountSchema).optional(),
  contacts: z.array(contactSchema).optional(),
  account: accountSchema.optional(),
  contact: contactSchema.optional(),
  invoices: z.array(invoiceSchema).optional(),
  promisesToPay: z.array(promiseToPaySchema).optional()
});

type InboundCallRequest = z.infer<typeof inboundCallRequestSchema>;

const transcriptSegmentSchema = z.object({
  speaker: z.enum(["agent", "customer", "unknown"]),
  startedAtSeconds: z.number().optional(),
  text: z.string()
});

const nullableOptional = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  schema.nullish().transform((value) => value ?? undefined);

const nullableOptionalString = nullableOptional(z.string());
const nullableOptionalNonEmptyString = nullableOptional(z.string().min(1));
const nullableOptionalNonNegativeInteger = nullableOptional(z.number().int().nonnegative());
const nullableOptionalBoolean = nullableOptional(z.boolean());

const postCallOutcomeRequestSchema = z.object({
  principal: principalSchema,
  tenantId: nullableOptionalNonEmptyString,
  billingAccountId: z.string().min(1),
  parentAccountId: nullableOptionalNonEmptyString,
  branchId: nullableOptionalNonEmptyString,
  contactId: nullableOptionalNonEmptyString,
  communicationAttemptId: z.string().min(1),
  providerCallId: nullableOptionalNonEmptyString,
  preCallPlanId: nullableOptionalNonEmptyString,
  occurredAt: nullableOptionalString,
  answered: nullableOptionalBoolean,
  durationSeconds: nullableOptionalNonNegativeInteger,
  disposition: z.enum([
    "connected",
    "missed",
    "voicemail_left",
    "wrong_contact",
    "callback_requested",
    "good_to_pay",
    "operator_review_required"
  ]),
  promisedAmountCents: nullableOptionalNonNegativeInteger,
  promisedDate: nullableOptionalString,
  transcriptUri: nullableOptionalString,
  transcriptSummary: nullableOptionalString,
  transcriptSegments: nullableOptional(z.array(transcriptSegmentSchema)),
  sentimentLabel: nullableOptional(z.enum(["positive", "neutral", "negative"])),
  operatorReviewRequired: nullableOptionalBoolean,
  contactHandoff: nullableOptional(
    z.object({
      currentContactId: nullableOptionalString,
      newHandlerName: z.string().min(1),
      newHandlerEmail: nullableOptional(z.string().email()),
      newHandlerPhone: nullableOptionalString,
      newHandlerRole: nullableOptionalString,
      newHandlerReachable: nullableOptionalBoolean,
      verificationStatus: nullableOptional(
        z.enum(["unverified", "self_verified", "operator_verified"])
      ),
      notes: nullableOptionalString
    })
  ),
  routingChangeRequest: nullableOptional(
    z.object({
      requestedRoutingLevel: nullableOptional(
        z.enum(["parent_account", "billing_account", "branch", "invoice"])
      ),
      requestedBillingAccountId: nullableOptionalString,
      requestedBranchId: nullableOptionalString,
      requestedContactId: nullableOptionalString,
      reason: z.string().min(1)
    })
  ),
  promiseUpdate: nullableOptional(
    z.object({
      promiseToPayId: nullableOptionalString,
      invoiceIds: z.array(z.string().min(1)),
      promisedDate: nullableOptionalString,
      promisedAmountCents: nullableOptionalNonNegativeInteger,
      currency: nullableOptionalString,
      status: nullableOptional(z.enum(["new", "updated", "kept", "broken", "cancelled"])),
      notes: nullableOptionalString
    })
  ),
  partialPaymentCommitment: nullableOptional(
    z.object({
      invoiceIds: z.array(z.string().min(1)),
      promisedAmountCents: z.number().int().positive(),
      promisedDate: nullableOptionalString,
      currency: nullableOptionalString,
      groupName: nullableOptional(
        z.enum([
          "broken_promises",
          "overdue_without_promise",
          "due_today_without_promise",
          "pre_due_without_promise",
          "active_future_promises",
          "routine_reminders"
        ])
      ),
      remainderDisposition: nullableOptional(
        z.enum([
          "uncommitted",
          "customer_requested_payment_plan",
          "customer_disputed_remainder",
          "follow_up_required"
        ])
      ),
      notes: nullableOptionalString
    })
  ),
  paymentPlanRequest: nullableOptional(
    z.object({
      invoiceIds: z.array(z.string().min(1)),
      requestedInstallmentCount: nullableOptional(z.number().int().positive()),
      requestedAmountCents: nullableOptional(z.number().int().positive()),
      currency: nullableOptionalString,
      requestedCadence: nullableOptional(z.enum(["weekly", "biweekly", "monthly", "custom"])),
      requestedFirstPaymentDate: nullableOptionalString,
      groupName: nullableOptional(
        z.enum([
          "broken_promises",
          "overdue_without_promise",
          "due_today_without_promise",
          "pre_due_without_promise",
          "active_future_promises",
          "routine_reminders"
        ])
      ),
      summary: z.string().min(1),
      notes: nullableOptionalString
    })
  ),
  nonCommitment: nullableOptional(
    z.object({
      invoiceIds: z.array(z.string().min(1)),
      groupName: nullableOptional(
        z.enum([
          "broken_promises",
          "overdue_without_promise",
          "due_today_without_promise",
          "pre_due_without_promise",
          "active_future_promises",
          "routine_reminders"
        ])
      ),
      reason: nullableOptionalString,
      callbackRequested: nullableOptionalBoolean,
      notes: nullableOptionalString
    })
  ),
  paidAlreadyClaim: nullableOptional(
    z.object({
      invoiceIds: z.array(z.string().min(1)),
      amountCents: nullableOptionalNonNegativeInteger,
      currency: nullableOptionalString,
      paidAt: nullableOptionalString,
      reference: nullableOptionalString,
      remittanceExpected: nullableOptionalBoolean,
      notes: nullableOptionalString
    })
  ),
  dispute: nullableOptional(
    z.object({
      invoiceIds: z.array(z.string().min(1)),
      disputeType: z.enum(["billing", "service", "delivery", "unknown"]),
      amountCents: nullableOptionalNonNegativeInteger,
      currency: nullableOptionalString,
      summary: z.string().min(1)
    })
  ),
  callback: nullableOptional(
    z.object({
      requestedAt: nullableOptionalString,
      dueAt: nullableOptionalString,
      timezone: nullableOptionalString,
      notes: nullableOptionalString
    })
  ),
  followUpActions: nullableOptional(
    z.array(
      z.object({
        title: z.string().min(1),
        description: nullableOptionalString,
        dueAt: nullableOptionalString,
        requiresHumanReview: nullableOptionalBoolean,
        metadata: nullableOptional(z.record(z.string(), z.unknown()))
      })
    )
  )
});

const finalizeCallOutcomeRequestSchema = postCallOutcomeRequestSchema.extend({
  principal: nullableOptional(principalSchema),
  functionCallId: nullableOptionalNonEmptyString,
  communicationAttemptId: nullableOptionalNonEmptyString
});

const retellCallInboxSyncRequestSchema = z.object({
  tenantId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  paginationKey: z.string().min(1).optional(),
  filterCriteria: z.record(z.string(), z.unknown()).optional(),
  sortOrder: z.enum(["ascending", "descending"]).optional()
});

const optionalRetellStringSchema = z
  .string()
  .nullable()
  .optional()
  .transform((value) => value ?? undefined);

const optionalRetellNonEmptyStringSchema = z
  .string()
  .min(1)
  .nullable()
  .optional()
  .transform((value) => value ?? undefined);

const retellFunctionContextSchema = z.object({
  principal: principalSchema.optional(),
  tenantId: optionalRetellNonEmptyStringSchema,
  functionCallId: optionalRetellNonEmptyStringSchema,
  asOf: optionalRetellStringSchema,
  preDueWindowDays: z.number().int().min(0).max(60).optional(),
  billingAccountId: optionalRetellNonEmptyStringSchema,
  contactId: optionalRetellNonEmptyStringSchema,
  callerPhoneNumber: optionalRetellNonEmptyStringSchema,
  communicationAttemptId: optionalRetellNonEmptyStringSchema,
  providerCallId: optionalRetellNonEmptyStringSchema,
  preCallPlanId: optionalRetellNonEmptyStringSchema,
  statementSnapshotId: optionalRetellNonEmptyStringSchema,
  frozenInvoiceIds: z.array(z.string().min(1)).optional(),
  frozenGroupNames: z
    .array(
      z.enum([
        "broken_promises",
        "overdue_without_promise",
        "due_today_without_promise",
        "pre_due_without_promise",
        "active_future_promises",
        "routine_reminders"
      ])
    )
    .optional(),
  account: accountSchema.optional(),
  contact: contactSchema.optional(),
  invoices: z.array(invoiceSchema).optional(),
  promisesToPay: z.array(promiseToPaySchema).optional()
});

const retellFunctionGroupSchema = retellFunctionContextSchema.extend({
  groupName: z.enum([
    "broken_promises",
    "overdue_without_promise",
    "due_today_without_promise",
    "pre_due_without_promise",
    "active_future_promises",
    "routine_reminders"
  ]),
  invoiceIds: z
    .array(z.string().min(1))
    .nullable()
    .optional()
    .transform((value) => value ?? undefined)
});

const retellFunctionCreatePromiseSchema = retellFunctionContextSchema.extend({
  promiseToPayId: z.string().min(1).optional(),
  invoiceIds: z.array(z.string().min(1)).min(1),
  promisedDate: z.string().min(1),
  promisedAmountCents: z.number().int().nonnegative().optional(),
  currency: z.string().min(1).optional(),
  notes: z.string().optional()
});

const retellFunctionUpdatePromiseSchema = retellFunctionContextSchema.extend({
  promiseToPayId: z.string().min(1),
  invoiceIds: z.array(z.string().min(1)).min(1),
  status: z.enum(["updated", "kept", "broken", "cancelled"]),
  promisedDate: z.string().min(1).optional(),
  promisedAmountCents: z.number().int().nonnegative().optional(),
  currency: z.string().min(1).optional(),
  notes: z.string().optional()
});

const retellFunctionPaidAlreadySchema = retellFunctionContextSchema.extend({
  invoiceIds: z.array(z.string().min(1)).min(1),
  amountCents: z.number().int().nonnegative().optional(),
  currency: z.string().min(1).optional(),
  paidAt: z.string().optional(),
  reference: z.string().optional(),
  remittanceExpected: z.boolean().optional(),
  notes: z.string().optional()
});

const retellFunctionPartialPaymentSchema = retellFunctionContextSchema.extend({
  invoiceIds: z.array(z.string().min(1)).min(1),
  promisedAmountCents: z.number().int().positive(),
  promisedDate: z.string().min(1).optional(),
  currency: z.string().min(1).optional(),
  groupName: z
    .enum([
      "broken_promises",
      "overdue_without_promise",
      "due_today_without_promise",
      "pre_due_without_promise",
      "active_future_promises",
      "routine_reminders"
    ])
    .optional(),
  remainderDisposition: z
    .enum([
      "uncommitted",
      "customer_requested_payment_plan",
      "customer_disputed_remainder",
      "follow_up_required"
    ])
    .optional(),
  notes: z.string().optional()
});

const retellFunctionPaymentPlanRequestSchema = retellFunctionContextSchema.extend({
  invoiceIds: z.array(z.string().min(1)).min(1),
  summary: z.string().min(1),
  requestedInstallmentCount: z.number().int().positive().optional(),
  requestedAmountCents: z.number().int().positive().optional(),
  currency: z.string().min(1).optional(),
  requestedCadence: z.enum(["weekly", "biweekly", "monthly", "custom"]).optional(),
  requestedFirstPaymentDate: z.string().min(1).optional(),
  groupName: z
    .enum([
      "broken_promises",
      "overdue_without_promise",
      "due_today_without_promise",
      "pre_due_without_promise",
      "active_future_promises",
      "routine_reminders"
    ])
    .optional(),
  notes: z.string().optional()
});

const retellFunctionNonCommitmentSchema = retellFunctionContextSchema.extend({
  invoiceIds: z.array(z.string().min(1)).min(1),
  groupName: z
    .enum([
      "broken_promises",
      "overdue_without_promise",
      "due_today_without_promise",
      "pre_due_without_promise",
      "active_future_promises",
      "routine_reminders"
    ])
    .optional(),
  reason: z.string().optional(),
  callbackRequested: z.boolean().optional(),
  dueAt: z.string().optional(),
  timezone: z.string().optional(),
  notes: z.string().optional()
});

const retellFunctionDisputeSchema = retellFunctionContextSchema.extend({
  invoiceIds: z.array(z.string().min(1)).min(1),
  disputeType: z.enum(["billing", "service", "delivery", "unknown"]),
  amountCents: z.number().int().nonnegative().optional(),
  currency: z.string().min(1).optional(),
  summary: z.string().min(1),
  disputeScope: z
    .enum([
      "invoice_subset",
      "current_group_only",
      "whole_account_or_balance",
      "routing_or_handler_issue",
      "unclear"
    ])
    .optional(),
  groupName: z
    .enum([
      "broken_promises",
      "overdue_without_promise",
      "due_today_without_promise",
      "pre_due_without_promise",
      "active_future_promises",
      "routine_reminders"
    ])
    .optional(),
  groupInvoiceIds: z.array(z.string().min(1)).optional(),
  disputeReason: z.string().optional(),
  notes: z.string().optional()
});

const retellFunctionCallbackSchema = retellFunctionContextSchema.extend({
  requestedAt: z.string().optional(),
  dueAt: z.string().optional(),
  timezone: z.string().optional(),
  notes: z.string().optional()
});

const retellFunctionHandlerHandoffSchema = retellFunctionContextSchema.extend({
  newHandlerName: z.string().min(1).optional(),
  newHandlerEmail: z.string().email().optional(),
  newHandlerPhone: z.string().optional(),
  newHandlerRole: z.string().optional(),
  newHandlerReachable: z.boolean().optional(),
  routingShouldUpdate: z.boolean().optional(),
  requestedRoutingLevel: z
    .enum(["parent_account", "billing_account", "branch", "invoice"])
    .optional(),
  requestedBranchId: z.string().min(1).optional(),
  notes: z.string().optional()
});

const retellFunctionSendInvoiceCopySchema = retellFunctionContextSchema.extend({
  invoiceIds: z.array(z.string().min(1)).min(1),
  deliveryChannel: z.enum(["email", "sms"]).optional(),
  destination: optionalRetellStringSchema
});

const retellFunctionSendSoaSchema = retellFunctionContextSchema.extend({
  deliveryChannel: z.literal("email").optional(),
  destination: optionalRetellStringSchema,
  notes: optionalRetellStringSchema,
  callSummary: optionalRetellStringSchema,
  call_summary: optionalRetellStringSchema,
  transcriptSummary: optionalRetellStringSchema,
  transcript_summary: optionalRetellStringSchema,
  summary: optionalRetellStringSchema
});

const retellFunctionSendPaymentLinkSchema = retellFunctionSendInvoiceCopySchema.extend({
  amountCents: z.number().int().nonnegative().optional()
});

const operatorConsoleImportRequestSchema = z.object({
  tenantId: z.string().min(1).optional(),
  customerName: z.string().min(1).optional(),
  customerReference: z.string().min(1).optional(),
  maxAccounts: z.number().int().min(1).max(200).optional(),
  defaultPhoneNumber: z.string().min(1).optional(),
  markContactsVerified: z.boolean().optional()
});

const databaseUrl = createDatabaseClientConfig().connectionString;
const retellFunctionRawBodies = new WeakMap<FastifyRequest, string>();
let operatorConsoleCanonicalImportServiceForTests:
  | ReturnType<typeof createOperatorConsoleCanonicalImportService>
  | undefined;

type PostCallOutcomeRequest = z.infer<typeof postCallOutcomeRequestSchema>;
type FinalizeCallOutcomeRequest = z.infer<typeof finalizeCallOutcomeRequestSchema>;
type RetellFunctionContextRequest = z.infer<typeof retellFunctionContextSchema>;
type RetellFunctionSendSoaRequest = z.infer<typeof retellFunctionSendSoaSchema>;
type RetellFunctionPrincipal = z.infer<typeof principalSchema>;

export function setOperatorConsoleCanonicalImportServiceForTests(
  service?: ReturnType<typeof createOperatorConsoleCanonicalImportService>
) {
  operatorConsoleCanonicalImportServiceForTests = service;
}

export const registerRetellRoutes = (app: FastifyInstance): void => {
  registerRetellFunctionRawBodyCapture(app);

  app.get("/v1/retell", async () => ({
    module: "retell_pre_call_orchestration",
    status: "implemented",
    capabilities: [
      "statement-of-account invoice bucketing",
      "voice outreach safety validation",
      "Retell dynamic variable mapping",
      "outbound Retell phone call creation",
      "promise-aware call priority planning",
      "post-call persistence planning",
      "activity audit logging",
      "operator console read-model import for Retell testing"
    ]
  }));

  app.post("/v1/retell/webhooks/calls", handleRetellCallInboxWebhook);
  app.post("/v1/retell/webhook", handleRetellCallInboxWebhook);
  app.post("/v1/retell/collections/call-inbox/sync", handleRetellCallInboxSync);

  app.post("/v1/retell/testing/import-operator-console-read-model", async (request, reply) => {
    try {
      const body = operatorConsoleImportRequestSchema.parse(request.body ?? {});
      const env = loadEnv();
      const tenantId = body.tenantId ?? env.DEFAULT_TENANT_SLUG;
      const service =
        operatorConsoleCanonicalImportServiceForTests ??
        createOperatorConsoleCanonicalImportService();
      const occurredAt = new Date().toISOString();
      const result = await service.materializeFromOperatorConsoleReadModel({
        tenantId,
        auditContext: {
          actorId: "retell_operator_console_import_endpoint",
          actorType: "automation",
          correlationId: `retell_operator_console_import_${Date.now()}`,
          occurredAt
        },
        ...(body.customerName ? { customerName: body.customerName } : {}),
        ...(body.customerReference ? { customerReference: body.customerReference } : {}),
        ...(body.maxAccounts ? { maxAccounts: body.maxAccounts } : {}),
        ...(body.defaultPhoneNumber ? { defaultPhoneNumber: body.defaultPhoneNumber } : {}),
        ...(body.markContactsVerified !== undefined
          ? { markContactsVerified: body.markContactsVerified }
          : {})
      });

      appendOperatorConsoleImportAudit({
        tenantId,
        occurredAt,
        requestBody: body,
        result
      });

      return reply.send({
        ...result,
        filters: {
          ...(body.customerName ? { customerName: body.customerName } : {}),
          ...(body.customerReference ? { customerReference: body.customerReference } : {}),
          maxAccounts: body.maxAccounts ?? 25,
          markContactsVerified: body.markContactsVerified ?? false,
          defaultPhoneNumberApplied: Boolean(body.defaultPhoneNumber)
        }
      });
    } catch (error) {
      return reply.status(400).send({
        message:
          error instanceof Error
            ? error.message
            : "Operator console read-model import request could not be processed."
      });
    }
  });

  app.get("/retell/functions", async (request) => {
    const env = loadEnv();
    const publicBaseUrl = resolveRetellFunctionPublicBaseUrl(
      request,
      env.RETELL_CUSTOM_FUNCTION_BASE_URL
    );

    return {
      module: "retell_custom_functions",
      status: "implemented",
      publicBaseUrl,
      httpsRecommended: true,
      payloadMode: "args_only",
      lowLatencyGuidance: {
        defaultPostCallEndpoint: "/v1/retell/webhooks/calls",
        summary:
          "Use live functions only for immediate caller-facing actions. Do not put send-soa or finalize-call-outcome in the default live terminal path; terminal webhooks should drive outcome persistence, tasking, activity, and recap/SOA sending."
      },
      signature: {
        required: Boolean(env.RETELL_CUSTOM_FUNCTION_SECRET ?? env.RETELL_API_KEY),
        header: "x-retell-signature",
        algorithm: "hmac-sha256",
        secretEnv: env.RETELL_CUSTOM_FUNCTION_SECRET
          ? "RETELL_CUSTOM_FUNCTION_SECRET"
          : env.RETELL_API_KEY
            ? "RETELL_API_KEY"
            : ""
      },
      functions: buildRetellCustomFunctionCatalog(publicBaseUrl ? { publicBaseUrl } : {})
    };
  });

  app.post("/retell/functions/get-account-snapshot", async (request, reply) =>
    handleRetellFunction({
      request,
      reply,
      functionName: "get-account-snapshot",
      schema: retellFunctionContextSchema,
      build: (base) => buildRetellLiveAccountSnapshot(base)
    })
  );

  app.post("/retell/functions/get-group-invoice-details", async (request, reply) =>
    handleRetellFunction({
      request,
      reply,
      functionName: "get-group-invoice-details",
      schema: retellFunctionGroupSchema,
      build: (base, body) =>
        buildRetellLiveGroupInvoiceDetails({
          ...base,
          groupName: body.groupName,
          ...(body.invoiceIds ? { invoiceIds: body.invoiceIds } : {})
        })
    })
  );

  app.post("/retell/functions/create-promise-to-pay", async (request, reply) =>
    handleRetellFunction({
      request,
      reply,
      functionName: "create-promise-to-pay",
      schema: retellFunctionCreatePromiseSchema,
      build: (base, body) =>
        buildRetellLiveCreatePromiseToPay({
          ...base,
          id: body.promiseToPayId ?? `ptp_${base.functionId}`,
          invoiceIds: body.invoiceIds,
          promisedDate: body.promisedDate,
          ...(body.promisedAmountCents !== undefined
            ? { promisedAmountCents: body.promisedAmountCents }
            : {}),
          ...(body.currency ? { currency: body.currency } : {}),
          ...(body.notes ? { notes: body.notes } : {})
        })
    })
  );

  app.post("/retell/functions/update-promise-to-pay", async (request, reply) =>
    handleRetellFunction({
      request,
      reply,
      functionName: "update-promise-to-pay",
      schema: retellFunctionUpdatePromiseSchema,
      build: (base, body) =>
        buildRetellLiveUpdatePromiseToPay({
          ...base,
          promiseToPayId: body.promiseToPayId,
          invoiceIds: body.invoiceIds,
          status: body.status,
          ...(body.promisedDate ? { promisedDate: body.promisedDate } : {}),
          ...(body.promisedAmountCents !== undefined
            ? { promisedAmountCents: body.promisedAmountCents }
            : {}),
          ...(body.currency ? { currency: body.currency } : {}),
          ...(body.notes ? { notes: body.notes } : {})
        })
    })
  );

  app.post("/retell/functions/log-paid-already", async (request, reply) =>
    handleRetellFunction({
      request,
      reply,
      functionName: "log-paid-already",
      schema: retellFunctionPaidAlreadySchema,
      build: (base, body) =>
        buildRetellLivePaidAlreadyClaim({
          ...base,
          invoiceIds: body.invoiceIds,
          ...(body.amountCents !== undefined ? { amountCents: body.amountCents } : {}),
          ...(body.currency ? { currency: body.currency } : {}),
          ...(body.paidAt ? { paidAt: body.paidAt } : {}),
          ...(body.reference ? { reference: body.reference } : {}),
          ...(body.remittanceExpected !== undefined
            ? { remittanceExpected: body.remittanceExpected }
            : {}),
          ...(body.notes ? { notes: body.notes } : {})
        })
    })
  );

  app.post("/retell/functions/capture-partial-payment-commitment", async (request, reply) =>
    handleRetellFunction({
      request,
      reply,
      functionName: "capture-partial-payment-commitment",
      schema: retellFunctionPartialPaymentSchema,
      build: (base, body) =>
        buildRetellLivePartialPaymentCommitment({
          ...base,
          invoiceIds: body.invoiceIds,
          promisedAmountCents: body.promisedAmountCents,
          ...(body.promisedDate ? { promisedDate: body.promisedDate } : {}),
          ...(body.currency ? { currency: body.currency } : {}),
          ...(body.groupName ? { currentGroupName: body.groupName } : {}),
          ...(body.remainderDisposition ? { remainderDisposition: body.remainderDisposition } : {}),
          ...(body.notes ? { notes: body.notes } : {})
        })
    })
  );

  app.post("/retell/functions/request-payment-plan-review", async (request, reply) =>
    handleRetellFunction({
      request,
      reply,
      functionName: "request-payment-plan-review",
      schema: retellFunctionPaymentPlanRequestSchema,
      build: (base, body) =>
        buildRetellLivePaymentPlanRequest({
          ...base,
          invoiceIds: body.invoiceIds,
          summary: body.summary,
          ...(body.requestedInstallmentCount !== undefined
            ? { requestedInstallmentCount: body.requestedInstallmentCount }
            : {}),
          ...(body.requestedAmountCents !== undefined
            ? { requestedAmountCents: body.requestedAmountCents }
            : {}),
          ...(body.currency ? { currency: body.currency } : {}),
          ...(body.requestedCadence ? { requestedCadence: body.requestedCadence } : {}),
          ...(body.requestedFirstPaymentDate
            ? { requestedFirstPaymentDate: body.requestedFirstPaymentDate }
            : {}),
          ...(body.groupName ? { currentGroupName: body.groupName } : {}),
          ...(body.notes ? { notes: body.notes } : {})
        })
    })
  );

  app.post("/retell/functions/capture-non-commitment", async (request, reply) =>
    handleRetellFunction({
      request,
      reply,
      functionName: "capture-non-commitment",
      schema: retellFunctionNonCommitmentSchema,
      build: (base, body) =>
        buildRetellLiveNonCommitment({
          ...base,
          invoiceIds: body.invoiceIds,
          ...(body.groupName ? { currentGroupName: body.groupName } : {}),
          ...(body.reason ? { reason: body.reason } : {}),
          ...(body.callbackRequested !== undefined
            ? { callbackRequested: body.callbackRequested }
            : {}),
          ...(body.dueAt ? { dueAt: body.dueAt } : {}),
          ...(body.timezone ? { timezone: body.timezone } : {}),
          ...(body.notes ? { notes: body.notes } : {})
        })
    })
  );

  app.post("/retell/functions/mark-dispute", async (request, reply) =>
    handleRetellFunction({
      request,
      reply,
      functionName: "mark-dispute",
      schema: retellFunctionDisputeSchema,
      build: (base, body) =>
        buildRetellLiveDisputeCapture({
          ...base,
          invoiceIds: body.invoiceIds,
          disputeType: body.disputeType,
          summary: body.summary,
          ...(body.amountCents !== undefined ? { amountCents: body.amountCents } : {}),
          ...(body.currency ? { currency: body.currency } : {}),
          ...(body.disputeScope ? { disputeScope: body.disputeScope } : {}),
          ...(body.groupName ? { currentGroupName: body.groupName } : {}),
          ...(body.groupInvoiceIds ? { currentGroupInvoiceIds: body.groupInvoiceIds } : {}),
          ...(body.disputeReason ? { disputeReason: body.disputeReason } : {}),
          ...(body.notes ? { notes: body.notes } : {})
        })
    })
  );

  app.post("/retell/functions/request-callback", async (request, reply) =>
    handleRetellFunction({
      request,
      reply,
      functionName: "request-callback",
      schema: retellFunctionCallbackSchema,
      build: (base, body) =>
        buildRetellLiveCallbackRequest({
          ...base,
          ...(body.requestedAt ? { requestedAt: body.requestedAt } : {}),
          ...(body.dueAt ? { dueAt: body.dueAt } : {}),
          ...(body.timezone ? { timezone: body.timezone } : {}),
          ...(body.notes ? { notes: body.notes } : {})
        })
    })
  );

  app.post("/retell/functions/capture-handler-handoff", async (request, reply) =>
    handleRetellFunction({
      request,
      reply,
      functionName: "capture-handler-handoff",
      schema: retellFunctionHandlerHandoffSchema,
      build: (base, body) =>
        buildRetellLiveHandlerHandoff({
          ...base,
          ...(body.newHandlerName ? { newHandlerName: body.newHandlerName } : {}),
          ...(body.newHandlerEmail ? { newHandlerEmail: body.newHandlerEmail } : {}),
          ...(body.newHandlerPhone ? { newHandlerPhone: body.newHandlerPhone } : {}),
          ...(body.newHandlerRole ? { newHandlerRole: body.newHandlerRole } : {}),
          ...(body.newHandlerReachable !== undefined
            ? { newHandlerReachable: body.newHandlerReachable }
            : {}),
          ...(body.routingShouldUpdate !== undefined
            ? { routingShouldUpdate: body.routingShouldUpdate }
            : {}),
          ...(body.requestedRoutingLevel
            ? { requestedRoutingLevel: body.requestedRoutingLevel }
            : {}),
          ...(body.requestedBranchId ? { requestedBranchId: body.requestedBranchId } : {}),
          ...(body.notes ? { notes: body.notes } : {})
        })
    })
  );

  app.post("/retell/functions/send-invoice-copy", async (request, reply) =>
    handleRetellFunction({
      request,
      reply,
      functionName: "send-invoice-copy",
      schema: retellFunctionSendInvoiceCopySchema,
      build: (base, body) =>
        buildRetellLiveSendInvoiceCopyDecision({
          ...base,
          invoiceIds: body.invoiceIds,
          ...(body.deliveryChannel ? { deliveryChannel: body.deliveryChannel } : {}),
          ...(body.destination ? { destination: body.destination } : {})
        })
    })
  );

  app.post("/retell/functions/send-soa", async (request, reply) =>
    handleRetellFunction({
      request,
      reply,
      functionName: "send-soa",
      schema: retellFunctionSendSoaSchema,
      build: async (base, body, context) => {
        const decision = buildRetellLiveSendStatementOfAccountDecision({
          ...base,
          ...(body.deliveryChannel ? { deliveryChannel: body.deliveryChannel } : {}),
          ...(body.destination ? { destination: body.destination } : {}),
          ...(body.notes ? { notes: body.notes } : {})
        });

        if (!decision.ok) {
          return decision;
        }

        const destination = body.destination?.trim();
        if (
          destination &&
          base.contact.email &&
          destination.toLowerCase() !== base.contact.email.toLowerCase()
        ) {
          return {
            ...decision,
            ok: false,
            status: "blocked",
            message:
              "Statement of account was not auto-sent because the requested destination is not the verified contact email.",
            blockedReason: "unverified_contact_destination"
          };
        }

        const attachment = await createStatementOfAccountPdfAttachment({
          account: base.account,
          contact: base.contact,
          invoices: base.invoices,
          asOf: base.asOf,
          ...(base.statementSnapshotId ? { statementSnapshotId: base.statementSnapshotId } : {})
        });
        const callSummaryResolution = await resolveSendSoaCallSummary({
          body,
          tenantId: context.tenantId,
          account: base.account,
          contact: base.contact
        });
        const callSummary = callSummaryResolution.summary;
        const emailBodyPreview = buildRetellStatementEmailBody({
          account: base.account,
          contact: base.contact,
          ...(callSummary ? { callSummary } : {})
        });

        const emailService = getEmailOutboundService();
        const sendResult = await emailService.sendResendDocuments({
          principal: {
            id: context.principal.id,
            roles: context.principal.roles
          },
          account: base.account,
          invoices: base.invoices,
          contact: {
            ...base.contact,
            ...(destination ? { email: destination } : {})
          },
          subjectLine: `Statement of Account - ${base.account.displayName}`,
          bodyPreview: emailBodyPreview,
          documentIds: base.statementSnapshotId ? [base.statementSnapshotId] : [],
          attachments: [attachment]
        });

        if (sendResult.deliveryState === "sent") {
          return {
            ...decision,
            message: "Statement of account email sent to the verified contact.",
            metadata: {
              ...decision.metadata,
              deliveryState: sendResult.deliveryState,
              communicationAttemptId: sendResult.communicationAttempt?.id ?? "",
              provider: sendResult.communicationAttempt?.provider ?? "",
              attachmentFileName: attachment.fileName,
              callSummaryIncluded: Boolean(callSummary),
              callSummarySource: callSummaryResolution.source,
              ...(callSummary ? { callSummary } : {}),
              emailBodyPreview
            }
          };
        }

        if (sendResult.deliveryState === "approval_needed") {
          return {
            ...decision,
            ok: false,
            status: "needs_follow_up",
            message: "Statement of account is queued for approval before sending.",
            blockedReason: sendResult.failureReason ?? "approval_required",
            metadata: {
              ...decision.metadata,
              deliveryState: sendResult.deliveryState,
              approvalRequestId: sendResult.approvalRequest?.id ?? "",
              attachmentFileName: attachment.fileName,
              callSummaryIncluded: Boolean(callSummary),
              callSummarySource: callSummaryResolution.source,
              ...(callSummary ? { callSummary } : {}),
              emailBodyPreview
            }
          };
        }

        return {
          ...decision,
          ok: false,
          status: "blocked",
          message: "Statement of account email could not be sent automatically.",
          blockedReason: sendResult.failureReason ?? sendResult.deliveryState,
          metadata: {
            ...decision.metadata,
            deliveryState: sendResult.deliveryState,
            attachmentFileName: attachment.fileName,
            callSummaryIncluded: Boolean(callSummary),
            callSummarySource: callSummaryResolution.source,
            ...(callSummary ? { callSummary } : {}),
            emailBodyPreview
          }
        };
      }
    })
  );

  app.post("/retell/functions/send-payment-link", async (request, reply) =>
    handleRetellFunction({
      request,
      reply,
      functionName: "send-payment-link",
      schema: retellFunctionSendPaymentLinkSchema,
      build: (base, body) =>
        buildRetellLiveSendPaymentLinkDecision({
          ...base,
          invoiceIds: body.invoiceIds,
          ...(body.amountCents !== undefined ? { amountCents: body.amountCents } : {}),
          ...(body.deliveryChannel ? { deliveryChannel: body.deliveryChannel } : {}),
          ...(body.destination ? { destination: body.destination } : {})
        })
    })
  );

  app.post("/retell/functions/finalize-call-outcome", async (request, reply) => {
    const signature = verifyRetellFunctionRequest(request);
    if (!signature.verified) {
      return reply.status(401).send({
        ok: false,
        status: "blocked",
        message: "Retell custom-function signature verification failed.",
        blockedReason: signature.reason
      });
    }

    const normalizedRequestBody = normalizeRetellFunctionRequestContext(
      request.body,
      request.query,
      request.headers
    );
    const parsed = finalizeCallOutcomeRequestSchema.safeParse(normalizedRequestBody);
    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        status: "blocked",
        message: "Invalid Retell finalize-call-outcome request.",
        issues: parsed.error.issues
      });
    }

    const result = await recordRetellCollectionsCallOutcome(
      withDefaultRetellFunctionPrincipal(parsed.data)
    );

    return reply.send(toRetellFinalizeCallOutcomeResponse(result));
  });

  app.post("/v1/retell/collections/outbound-call", async (request, reply) => {
    const parsed = outboundCallRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid Retell collections outbound call request.",
        issues: parsed.error.issues
      });
    }

    const resolved = resolveCallInput(parsed.data);
    if ("error" in resolved) {
      return reply.status(resolved.statusCode).send({ message: resolved.error });
    }

    const env = loadEnv();
    const tenantId = parsed.data.tenantId ?? env.DEFAULT_TENANT_SLUG;
    const taskService = await getTaskService();
    const service = new RetellPreCallOrchestrationService({
      activityStore: getActivityStore(resolved.account.id, tenantId),
      retellClient: new RetellHttpClient({
        ...(env.RETELL_API_KEY ? { apiKey: env.RETELL_API_KEY } : {}),
        ...(env.RETELL_BASE_URL ? { baseUrl: env.RETELL_BASE_URL } : {})
      }),
      taskService,
      config: {
        tenantId,
        ...(env.RETELL_FROM_NUMBER ? { fromNumber: env.RETELL_FROM_NUMBER } : {}),
        ...(env.RETELL_OUTBOUND_AGENT_ID ? { overrideAgentId: env.RETELL_OUTBOUND_AGENT_ID } : {})
      },
      repeatedBrokenPromiseThreshold: env.COLLECTIONS_BROKEN_PROMISE_ESCALATION_THRESHOLD,
      repeatedBrokenPromiseWindowDays: env.COLLECTIONS_BROKEN_PROMISE_ESCALATION_WINDOW_DAYS
    });

    try {
      const result = await service.startInvoiceFollowUpCall({
        principal: parsed.data.principal,
        account: resolved.account,
        contact: resolved.contact,
        invoices: resolved.invoices,
        ...(resolved.promisesToPay.length > 0 ? { promisesToPay: resolved.promisesToPay } : {}),
        ...(parsed.data.asOf ? { asOf: parsed.data.asOf } : {}),
        ...(parsed.data.preDueWindowDays !== undefined
          ? { preDueWindowDays: parsed.data.preDueWindowDays }
          : {}),
        ...(parsed.data.callWindow ? { callWindow: parsed.data.callWindow } : {}),
        ...(parsed.data.approvalRequestId
          ? { approvalRequestId: parsed.data.approvalRequestId }
          : {}),
        ...(parsed.data.retell?.fromNumber ? { fromNumber: parsed.data.retell.fromNumber } : {}),
        ...(parsed.data.retell?.overrideAgentId
          ? { overrideAgentId: parsed.data.retell.overrideAgentId }
          : {})
      });

      const callInboxRecord = await upsertCallInboxFromOutboundStart({
        tenantId,
        principal: parsed.data.principal,
        result,
        account: resolved.account,
        contact: resolved.contact,
        invoices: resolved.invoices
      });

      return reply.send({
        ...toOutboundCallResponse(result),
        ...(callInboxRecord ? { callInboxRecord } : {})
      });
    } catch (error) {
      if (error instanceof RetellConfigurationError) {
        return reply.status(503).send({ message: error.message });
      }

      if (error instanceof RetellProviderError) {
        return reply.status(502).send({
          message: error.message,
          providerStatusCode: error.statusCode,
          providerBody: error.providerBody
        });
      }

      throw error;
    }
  });

  app.post("/v1/retell/collections/inbound-call", async (request, reply) => {
    const parsed = inboundCallRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid Retell collections inbound call request.",
        issues: parsed.error.issues
      });
    }

    const resolved = resolveInboundCallInput(parsed.data);
    if ("fallbackReason" in resolved) {
      return reply.send(
        toInboundFallbackResponse(parsed.data.callerPhoneNumber, resolved.fallbackReason)
      );
    }

    const env = loadEnv();
    const tenantId = parsed.data.tenantId ?? env.DEFAULT_TENANT_SLUG;
    const taskService = await getTaskService();
    const service = new RetellPreCallOrchestrationService({
      activityStore: getActivityStore(resolved.account.id, tenantId),
      retellClient: new RetellHttpClient({
        ...(env.RETELL_API_KEY ? { apiKey: env.RETELL_API_KEY } : {}),
        ...(env.RETELL_BASE_URL ? { baseUrl: env.RETELL_BASE_URL } : {})
      }),
      taskService,
      config: {
        tenantId,
        ...(env.RETELL_FROM_NUMBER ? { fromNumber: env.RETELL_FROM_NUMBER } : {}),
        ...(env.RETELL_OUTBOUND_AGENT_ID ? { overrideAgentId: env.RETELL_OUTBOUND_AGENT_ID } : {})
      },
      repeatedBrokenPromiseThreshold: env.COLLECTIONS_BROKEN_PROMISE_ESCALATION_THRESHOLD,
      repeatedBrokenPromiseWindowDays: env.COLLECTIONS_BROKEN_PROMISE_ESCALATION_WINDOW_DAYS
    });

    const result = service.resolveInboundCollectionsCall({
      principal: parsed.data.principal,
      callerPhoneNumber: parsed.data.callerPhoneNumber,
      account: resolved.account,
      contact: resolved.contact,
      invoices: resolved.invoices,
      ...(resolved.promisesToPay.length > 0 ? { promisesToPay: resolved.promisesToPay } : {}),
      ...(parsed.data.asOf ? { asOf: parsed.data.asOf } : {}),
      ...(parsed.data.preDueWindowDays !== undefined
        ? { preDueWindowDays: parsed.data.preDueWindowDays }
        : {}),
      ...(parsed.data.callWindow ? { callWindow: parsed.data.callWindow } : {})
    });

    return reply.send(toInboundCallResponse(result));
  });

  app.post("/v1/retell/collections/call-outcome", async (request, reply) => {
    const parsed = postCallOutcomeRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid Retell collections call outcome request.",
        issues: parsed.error.issues
      });
    }

    const env = loadEnv();
    const tenantId = parsed.data.tenantId ?? env.DEFAULT_TENANT_SLUG;
    const taskService = await getTaskService();
    const service = new RetellPreCallOrchestrationService({
      activityStore: getActivityStore(parsed.data.billingAccountId, tenantId),
      retellClient: new RetellHttpClient({
        ...(env.RETELL_API_KEY ? { apiKey: env.RETELL_API_KEY } : {}),
        ...(env.RETELL_BASE_URL ? { baseUrl: env.RETELL_BASE_URL } : {})
      }),
      taskService,
      config: {
        tenantId,
        ...(env.RETELL_FROM_NUMBER ? { fromNumber: env.RETELL_FROM_NUMBER } : {}),
        ...(env.RETELL_OUTBOUND_AGENT_ID ? { overrideAgentId: env.RETELL_OUTBOUND_AGENT_ID } : {})
      },
      repeatedBrokenPromiseThreshold: env.COLLECTIONS_BROKEN_PROMISE_ESCALATION_THRESHOLD,
      repeatedBrokenPromiseWindowDays: env.COLLECTIONS_BROKEN_PROMISE_ESCALATION_WINDOW_DAYS
    });

    const result = await service.recordPostCallOutcome({
      principal: parsed.data.principal,
      billingAccountId: parsed.data.billingAccountId,
      ...(parsed.data.parentAccountId ? { parentAccountId: parsed.data.parentAccountId } : {}),
      ...(parsed.data.branchId ? { branchId: parsed.data.branchId } : {}),
      ...(parsed.data.contactId ? { contactId: parsed.data.contactId } : {}),
      communicationAttemptId: parsed.data.communicationAttemptId,
      ...(parsed.data.providerCallId ? { providerCallId: parsed.data.providerCallId } : {}),
      ...(parsed.data.preCallPlanId ? { preCallPlanId: parsed.data.preCallPlanId } : {}),
      ...(parsed.data.occurredAt ? { occurredAt: parsed.data.occurredAt } : {}),
      ...(parsed.data.promisedAmountCents !== undefined
        ? { promisedAmountCents: parsed.data.promisedAmountCents }
        : {}),
      ...(parsed.data.promisedDate ? { promisedDate: parsed.data.promisedDate } : {}),
      ...(parsed.data.transcriptUri ? { transcriptUri: parsed.data.transcriptUri } : {}),
      ...(parsed.data.transcriptSummary
        ? { transcriptSummary: parsed.data.transcriptSummary }
        : {}),
      ...(parsed.data.transcriptSegments
        ? { transcriptSegments: parsed.data.transcriptSegments }
        : {}),
      ...(parsed.data.sentimentLabel ? { sentimentLabel: parsed.data.sentimentLabel } : {}),
      disposition: parsed.data.disposition,
      ...(parsed.data.operatorReviewRequired !== undefined
        ? { operatorReviewRequired: parsed.data.operatorReviewRequired }
        : {}),
      ...(parsed.data.contactHandoff
        ? { contactHandoff: toContactHandoff(parsed.data.contactHandoff) }
        : {}),
      ...(parsed.data.routingChangeRequest
        ? { routingChangeRequest: toRoutingChangeRequest(parsed.data.routingChangeRequest) }
        : {}),
      ...(parsed.data.promiseUpdate
        ? { promiseUpdate: toPromiseUpdate(parsed.data.promiseUpdate) }
        : {}),
      ...(parsed.data.partialPaymentCommitment
        ? {
            partialPaymentCommitment: toPartialPaymentCommitment(
              parsed.data.partialPaymentCommitment
            )
          }
        : {}),
      ...(parsed.data.paymentPlanRequest
        ? { paymentPlanRequest: toPaymentPlanRequest(parsed.data.paymentPlanRequest) }
        : {}),
      ...(parsed.data.nonCommitment
        ? { nonCommitment: toNonCommitment(parsed.data.nonCommitment) }
        : {}),
      ...(parsed.data.paidAlreadyClaim
        ? { paidAlreadyClaim: toPaidAlreadyClaim(parsed.data.paidAlreadyClaim) }
        : {}),
      ...(parsed.data.dispute ? { dispute: toDisputeCapture(parsed.data.dispute) } : {}),
      ...(parsed.data.callback ? { callback: toCallbackRequest(parsed.data.callback) } : {}),
      ...(parsed.data.followUpActions
        ? { followUpActions: parsed.data.followUpActions.map(toFollowUpAction) }
        : {})
    });

    const callInboxRecord = await upsertCallInboxFromPostCallOutcome({
      tenantId,
      input: parsed.data,
      result
    });

    return reply.send({
      ...result,
      ...(callInboxRecord ? { callInboxRecord } : {})
    });
  });
};

function withDefaultRetellFunctionPrincipal(
  input: FinalizeCallOutcomeRequest
): PostCallOutcomeRequest {
  const communicationAttemptId =
    input.communicationAttemptId ??
    input.providerCallId ??
    input.functionCallId ??
    `finalize_${input.billingAccountId}_${input.occurredAt ?? input.disposition}`;

  return {
    ...input,
    communicationAttemptId,
    principal: input.principal ?? defaultRetellFunctionPrincipal()
  };
}

async function handleRetellCallInboxWebhook(request: FastifyRequest, reply: FastifyReply) {
  const signature = verifyRetellWebhookRequest(request);
  if (!signature.verified) {
    return reply.status(401).send({
      ok: false,
      status: "blocked",
      message: "Retell webhook signature verification failed.",
      blockedReason: signature.reason
    });
  }

  const envelope = parseRetellWebhookEnvelope(request.body);
  if (!envelope) {
    return reply.status(400).send({
      ok: false,
      message: "Retell call webhook did not include a call_id."
    });
  }

  const receivedAt = new Date().toISOString();
  const tenantId = resolveRetellWebhookTenantId(request);
  const upsert = retellWebhookToCallInboxUpsert({
    tenantId,
    event: envelope.event,
    call: envelope.call,
    receivedAt
  });
  const result = await getCallInboxService().upsertCall(defaultRetellWebhookPrincipal(), upsert);
  const postCallAutomation = scheduleRetellPostCallAutomation({
    tenantId,
    event: envelope.event,
    call: envelope.call,
    callRecord: result.record
  });

  return reply.send({
    ok: true,
    status: "ingested",
    event: envelope.event,
    providerCallId: result.record.providerCallId,
    callRecordId: result.record.id,
    postCallAutomation,
    audit: {
      logged: Boolean(result.activityEntry),
      action: result.activityEntry?.action
    }
  });
}

async function handleRetellCallInboxSync(request: FastifyRequest, reply: FastifyReply) {
  const parsed = retellCallInboxSyncRequestSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    return reply.status(400).send({
      message: "Invalid Retell call inbox sync request.",
      issues: parsed.error.issues
    });
  }

  try {
    const env = loadEnv();
    const result = await runRetellCallInboxSync({
      tenantId: parsed.data.tenantId ?? env.DEFAULT_TENANT_SLUG,
      ...(parsed.data.limit ? { limit: parsed.data.limit } : {}),
      ...(parsed.data.paginationKey ? { paginationKey: parsed.data.paginationKey } : {}),
      ...(parsed.data.filterCriteria ? { filterCriteria: parsed.data.filterCriteria } : {}),
      ...(parsed.data.sortOrder ? { sortOrder: parsed.data.sortOrder } : {}),
      triggerSource: "manual_endpoint"
    });
    return reply.send(result);
  } catch (error) {
    if (error instanceof RetellConfigurationError) {
      return reply.status(503).send({ message: error.message });
    }

    if (error instanceof RetellProviderError) {
      return reply.status(502).send({
        message: error.message,
        providerStatusCode: error.statusCode,
        providerBody: error.providerBody
      });
    }

    throw error;
  }
}

async function recordRetellCollectionsCallOutcome(input: PostCallOutcomeRequest) {
  const env = loadEnv();
  const tenantId = input.tenantId ?? env.DEFAULT_TENANT_SLUG;
  const taskService = await getTaskService();
  const service = new RetellPreCallOrchestrationService({
    activityStore: getActivityStore(input.billingAccountId, tenantId),
    retellClient: new RetellHttpClient({
      ...(env.RETELL_API_KEY ? { apiKey: env.RETELL_API_KEY } : {}),
      ...(env.RETELL_BASE_URL ? { baseUrl: env.RETELL_BASE_URL } : {})
    }),
    taskService,
    config: {
      tenantId,
      ...(env.RETELL_FROM_NUMBER ? { fromNumber: env.RETELL_FROM_NUMBER } : {}),
      ...(env.RETELL_OUTBOUND_AGENT_ID ? { overrideAgentId: env.RETELL_OUTBOUND_AGENT_ID } : {})
    },
    repeatedBrokenPromiseThreshold: env.COLLECTIONS_BROKEN_PROMISE_ESCALATION_THRESHOLD,
    repeatedBrokenPromiseWindowDays: env.COLLECTIONS_BROKEN_PROMISE_ESCALATION_WINDOW_DAYS
  });

  const result = await service.recordPostCallOutcome({
    principal: input.principal,
    billingAccountId: input.billingAccountId,
    ...(input.parentAccountId ? { parentAccountId: input.parentAccountId } : {}),
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.contactId ? { contactId: input.contactId } : {}),
    communicationAttemptId: input.communicationAttemptId,
    ...(input.providerCallId ? { providerCallId: input.providerCallId } : {}),
    ...(input.preCallPlanId ? { preCallPlanId: input.preCallPlanId } : {}),
    ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    ...(input.promisedAmountCents !== undefined
      ? { promisedAmountCents: input.promisedAmountCents }
      : {}),
    ...(input.promisedDate ? { promisedDate: input.promisedDate } : {}),
    ...(input.transcriptUri ? { transcriptUri: input.transcriptUri } : {}),
    ...(input.transcriptSummary ? { transcriptSummary: input.transcriptSummary } : {}),
    ...(input.transcriptSegments ? { transcriptSegments: input.transcriptSegments } : {}),
    ...(input.sentimentLabel ? { sentimentLabel: input.sentimentLabel } : {}),
    disposition: input.disposition,
    ...(input.operatorReviewRequired !== undefined
      ? { operatorReviewRequired: input.operatorReviewRequired }
      : {}),
    ...(input.contactHandoff ? { contactHandoff: toContactHandoff(input.contactHandoff) } : {}),
    ...(input.routingChangeRequest
      ? { routingChangeRequest: toRoutingChangeRequest(input.routingChangeRequest) }
      : {}),
    ...(input.promiseUpdate ? { promiseUpdate: toPromiseUpdate(input.promiseUpdate) } : {}),
    ...(input.partialPaymentCommitment
      ? { partialPaymentCommitment: toPartialPaymentCommitment(input.partialPaymentCommitment) }
      : {}),
    ...(input.paymentPlanRequest
      ? { paymentPlanRequest: toPaymentPlanRequest(input.paymentPlanRequest) }
      : {}),
    ...(input.nonCommitment ? { nonCommitment: toNonCommitment(input.nonCommitment) } : {}),
    ...(input.paidAlreadyClaim
      ? { paidAlreadyClaim: toPaidAlreadyClaim(input.paidAlreadyClaim) }
      : {}),
    ...(input.dispute ? { dispute: toDisputeCapture(input.dispute) } : {}),
    ...(input.callback ? { callback: toCallbackRequest(input.callback) } : {}),
    ...(input.followUpActions
      ? { followUpActions: input.followUpActions.map(toFollowUpAction) }
      : {})
  });

  const callInboxRecord = await upsertCallInboxFromPostCallOutcome({
    tenantId,
    input,
    result
  });

  return {
    ...result,
    ...(callInboxRecord ? { callInboxRecord } : {})
  };
}

async function upsertCallInboxFromOutboundStart(input: {
  tenantId: string;
  principal: RetellFunctionPrincipal;
  result: RetellCollectionsCallResult;
  account: BillingAccount;
  contact: Contact;
  invoices: CustomerInvoice[];
}) {
  if (input.result.status !== "started") {
    return undefined;
  }

  const receivedAt = new Date().toISOString();
  const providerUpsert = retellCallToCallInboxUpsert({
    tenantId: input.tenantId,
    call: {
      ...input.result.retellCall,
      from_number: input.result.retellCall.from_number ?? input.result.retellPayload.from_number,
      to_number: input.result.retellCall.to_number ?? input.result.retellPayload.to_number,
      direction: input.result.retellCall.direction ?? "outbound",
      metadata: {
        ...(input.result.retellPayload.metadata ?? {}),
        ...(input.result.retellCall.metadata ?? {})
      },
      retell_llm_dynamic_variables: {
        ...(input.result.retellPayload.retell_llm_dynamic_variables ?? {}),
        ...(input.result.retellCall.retell_llm_dynamic_variables ?? {})
      }
    },
    event: "outbound_call_created",
    receivedAt
  });

  const result = await getCallInboxService().upsertCall(input.principal, {
    ...providerUpsert,
    customerName: input.account.displayName,
    ...(input.contact.phone ? { customerPhone: input.contact.phone } : {}),
    fromNumber: input.result.retellPayload.from_number,
    toNumber: input.result.retellPayload.to_number,
    direction: "outbound",
    status: providerUpsert.status === "completed" ? providerUpsert.status : "processing",
    startedAt: providerUpsert.startedAt ?? receivedAt,
    parentAccountId: input.account.parentAccountId,
    billingAccountId: input.account.id,
    ...(input.result.plan.routingContext.branchId
      ? { branchId: input.result.plan.routingContext.branchId }
      : input.contact.branchId
        ? { branchId: input.contact.branchId }
        : {}),
    contactId: input.contact.id,
    communicationAttemptId: input.result.communicationAttempt.id,
    preCallPlanId: input.result.plan.id,
    requestedBy: input.principal.id,
    invoiceRefs: input.invoices.map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      billingAccountId: invoice.billingAccountId,
      ...(invoice.branchId ? { branchId: invoice.branchId } : {}),
      amountCents: invoice.amountCents,
      currency: invoice.currency
    })),
    workflowName: humanizeIdentifier(input.result.plan.preCallOutput.call_objective),
    metadata: {
      ...(providerUpsert.metadata ?? {}),
      source: "retell_outbound_call_start",
      eventType: "call_initiated",
      communicationAttemptId: input.result.communicationAttempt.id,
      communication_attempt_id: input.result.communicationAttempt.id,
      providerCallId: input.result.retellCall.call_id,
      provider_call_id: input.result.retellCall.call_id,
      requestedBy: input.principal.id,
      requested_by: input.principal.id,
      callObjective: input.result.plan.preCallOutput.call_objective,
      call_objective: input.result.plan.preCallOutput.call_objective
    }
  });

  return result.record;
}

async function upsertCallInboxFromPostCallOutcome(input: {
  tenantId: string;
  input: PostCallOutcomeRequest;
  result: RetellPostCallOutcomeResult;
}) {
  const upsert = postCallOutcomeToCallInboxUpsert({
    tenantId: input.tenantId,
    billingAccountId: input.input.billingAccountId,
    ...(input.input.parentAccountId ? { parentAccountId: input.input.parentAccountId } : {}),
    ...(input.input.branchId ? { branchId: input.input.branchId } : {}),
    ...(input.input.contactId ? { contactId: input.input.contactId } : {}),
    communicationAttemptId: input.input.communicationAttemptId,
    ...(input.input.providerCallId ? { providerCallId: input.input.providerCallId } : {}),
    ...(input.input.preCallPlanId ? { preCallPlanId: input.input.preCallPlanId } : {}),
    occurredAt: input.input.occurredAt ?? new Date().toISOString(),
    ...(input.input.durationSeconds !== undefined
      ? { durationSeconds: input.input.durationSeconds }
      : {}),
    disposition: input.input.disposition,
    ...(input.input.transcriptUri ? { transcriptUri: input.input.transcriptUri } : {}),
    ...(input.input.transcriptSummary ? { transcriptSummary: input.input.transcriptSummary } : {}),
    ...(input.input.transcriptSegments
      ? { transcriptSegments: normalizePostCallTranscriptSegments(input.input.transcriptSegments) }
      : {}),
    ...(input.input.sentimentLabel ? { sentimentLabel: input.input.sentimentLabel } : {}),
    ...(input.input.operatorReviewRequired !== undefined
      ? { operatorReviewRequired: input.input.operatorReviewRequired }
      : {}),
    invoiceRefs: postCallOutcomeInvoiceRefs(input.input),
    taskRefs: toCallInboxTaskReferences(input.result.tasks),
    metadata: {
      source: "retell_post_call_outcome",
      disposition: input.input.disposition,
      answered: input.input.answered ?? null,
      persistencePlanId: input.result.persistencePlan.id,
      persistence_plan_id: input.result.persistencePlan.id
    }
  });

  if (!upsert) {
    return undefined;
  }

  const result = await getCallInboxService().upsertCall(input.input.principal, upsert);
  return result.record;
}

function postCallOutcomeInvoiceRefs(input: PostCallOutcomeRequest) {
  const invoiceIds = uniqueStrings([
    ...(input.promiseUpdate?.invoiceIds ?? []),
    ...(input.partialPaymentCommitment?.invoiceIds ?? []),
    ...(input.paymentPlanRequest?.invoiceIds ?? []),
    ...(input.nonCommitment?.invoiceIds ?? []),
    ...(input.paidAlreadyClaim?.invoiceIds ?? []),
    ...(input.dispute?.invoiceIds ?? [])
  ]);

  return invoiceIds.map((invoiceId) => ({
    invoiceId,
    invoiceNumber: invoiceId,
    billingAccountId: input.billingAccountId,
    ...(input.branchId ? { branchId: input.branchId } : {})
  }));
}

function normalizePostCallTranscriptSegments(
  segments: NonNullable<PostCallOutcomeRequest["transcriptSegments"]>
) {
  return segments.map((segment) => ({
    speaker: segment.speaker,
    text: segment.text,
    ...(segment.startedAtSeconds !== undefined
      ? { startedAtSeconds: segment.startedAtSeconds }
      : {})
  }));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function toRetellFinalizeCallOutcomeResponse(
  result: Awaited<ReturnType<typeof recordRetellCollectionsCallOutcome>>
) {
  return {
    ok: true,
    status: result.status,
    message: `Call outcome recorded. ${result.tasks.length} task(s) created.`,
    taskCount: result.tasks.length,
    taskTypes: result.tasks.map((task) => task.taskType),
    tasks: result.tasks.map((task) => ({
      id: task.id,
      taskType: task.taskType,
      billingAccountId: task.billingAccountId,
      ...(task.contactId ? { contactId: task.contactId } : {}),
      ...(task.branchId ? { branchId: task.branchId } : {}),
      priority: task.priority,
      ownerTeam: task.ownerTeam,
      dueAt: task.dueAt,
      summary: task.summary,
      recommendedNextAction: task.recommendedNextAction,
      status: task.status
    })),
    persistencePlan: {
      id: result.persistencePlan.id,
      followUpSafeMode: result.persistencePlan.followUpSafeMode,
      operatorReviewRequired: result.persistencePlan.operatorReviewRequired,
      actions: result.persistencePlan.actions.map((action) => ({
        kind: action.kind,
        title: action.title,
        requiresHumanReview: action.requiresHumanReview,
        ...(action.dueAt ? { dueAt: action.dueAt } : {})
      }))
    },
    audit: {
      logged: true,
      actionCount: result.activityEntries.length
    }
  };
}

async function handleRetellFunction<TBody extends RetellFunctionContextRequest>(input: {
  request: FastifyRequest;
  reply: FastifyReply;
  functionName: string;
  schema: z.ZodType<TBody, z.ZodTypeDef, unknown>;
  build: (
    base: RetellLiveFunctionBaseInput,
    body: TBody,
    context: {
      principal: RetellFunctionPrincipal;
      tenantId: string;
    }
  ) => RetellLiveFunctionResponse | Promise<RetellLiveFunctionResponse>;
}) {
  const signature = verifyRetellFunctionRequest(input.request);
  if (!signature.verified) {
    return input.reply.status(401).send({
      ok: false,
      status: "blocked",
      message: "Retell custom-function signature verification failed.",
      blockedReason: signature.reason
    });
  }

  const normalizedRequestBody = normalizeRetellFunctionRequestContext(
    input.request.body,
    input.request.query,
    input.request.headers
  );
  const parsed = input.schema.safeParse(normalizedRequestBody);
  if (!parsed.success) {
    return input.reply.status(400).send({
      ok: false,
      status: "blocked",
      message: `Invalid Retell custom-function request for ${input.functionName}.`,
      issues: parsed.error.issues
    });
  }

  const resolved = resolveRetellFunctionBaseInput(parsed.data);
  if ("error" in resolved) {
    return input.reply.status(resolved.statusCode).send({
      ok: false,
      status: "blocked",
      message: resolved.error,
      blockedReason: resolved.reason
    });
  }

  const result = await input.build(resolved.base, parsed.data, {
    principal: resolved.principal,
    tenantId: resolved.tenantId
  });
  const auditEntry = appendRetellFunctionAudit({
    functionName: input.functionName,
    result,
    requestBody: parsed.data,
    principal: resolved.principal,
    tenantId: resolved.tenantId,
    account: resolved.base.account,
    contact: resolved.base.contact
  });

  return input.reply.send(toRetellFunctionAgentResponse(result, auditEntry.action, auditEntry.id));
}

export function normalizeRetellFunctionRequestContext(
  body: unknown,
  query: unknown,
  headers: FastifyRequest["headers"]
) {
  if (!isPlainObject(body)) {
    return body;
  }

  const normalized = { ...body };
  const queryValues = isPlainObject(query) ? query : {};

  assignRetellFunctionContextValue(normalized, "tenantId", queryValues, headers, {
    bodyKeys: ["tenant_id"],
    queryKeys: ["tenantId", "tenant_id"],
    headerKeys: ["x-tenant-id", "x-tenant"]
  });
  assignRetellFunctionContextValue(normalized, "billingAccountId", queryValues, headers, {
    bodyKeys: ["billing_account_id"],
    queryKeys: ["billingAccountId", "billing_account_id"],
    headerKeys: ["x-billing-account-id", "x-billing-account"]
  });
  assignRetellFunctionContextValue(normalized, "contactId", queryValues, headers, {
    bodyKeys: ["contact_id"],
    queryKeys: ["contactId", "contact_id"],
    headerKeys: ["x-contact-id", "x-contact"]
  });
  assignRetellFunctionContextValue(normalized, "callerPhoneNumber", queryValues, headers, {
    bodyKeys: ["caller_phone_number"],
    queryKeys: ["callerPhoneNumber", "caller_phone_number"],
    headerKeys: ["x-caller-phone-number", "x-caller-phone"]
  });
  assignRetellFunctionContextValue(normalized, "communicationAttemptId", queryValues, headers, {
    bodyKeys: [
      "communication_attempt_id",
      "communication_attempt",
      "attempt_id",
      "tool_call_id",
      "toolCallId",
      "function_call_id",
      "functionCallId"
    ],
    queryKeys: ["communicationAttemptId", "communication_attempt_id"],
    headerKeys: ["x-communication-attempt-id", "x-communication-attempt"]
  });
  assignRetellFunctionContextValue(normalized, "providerCallId", queryValues, headers, {
    bodyKeys: ["provider_call_id", "call_id", "retell_call_id"],
    queryKeys: ["providerCallId", "provider_call_id"],
    headerKeys: ["x-provider-call-id", "x-call-id"]
  });
  assignRetellFunctionContextValue(normalized, "preCallPlanId", queryValues, headers, {
    bodyKeys: ["pre_call_plan_id", "plan_id"],
    queryKeys: ["preCallPlanId", "pre_call_plan_id"],
    headerKeys: ["x-pre-call-plan-id", "x-plan-id"]
  });
  assignRetellFunctionContextValue(normalized, "functionCallId", queryValues, headers, {
    bodyKeys: ["function_call_id", "tool_call_id", "toolCallId"],
    queryKeys: ["functionCallId", "function_call_id", "tool_call_id"],
    headerKeys: ["x-function-call-id", "x-tool-call-id"]
  });

  return normalized;
}

function assignRetellFunctionContextValue(
  target: Record<string, unknown>,
  field: string,
  query: Record<string, unknown>,
  headers: FastifyRequest["headers"],
  aliases: {
    bodyKeys?: string[];
    queryKeys: string[];
    headerKeys: string[];
  }
) {
  if (isResolvedRetellContextValue(target[field])) {
    return;
  }
  delete target[field];

  for (const key of aliases.bodyKeys ?? []) {
    const value = firstResolvedContextValue(target[key]);
    if (value) {
      target[field] = value;
      return;
    }
  }

  for (const key of aliases.queryKeys) {
    const value = firstResolvedContextValue(query[key]);
    if (value) {
      target[field] = value;
      return;
    }
  }

  for (const key of aliases.headerKeys) {
    const value = firstResolvedContextValue(headers[key]);
    if (value) {
      target[field] = value;
      return;
    }
  }
}

function firstResolvedContextValue(value: unknown) {
  if (Array.isArray(value)) {
    for (const candidate of value) {
      if (isResolvedRetellContextValue(candidate)) {
        return candidate;
      }
    }
    return undefined;
  }

  return isResolvedRetellContextValue(value) ? value : undefined;
}

function isResolvedRetellContextValue(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  const normalized = trimmed.toLowerCase();
  if (
    normalized === "unknown" ||
    normalized === "null" ||
    normalized === "undefined" ||
    normalized === "n/a" ||
    normalized === "na"
  ) {
    return false;
  }

  return !/^\{\{.+\}\}$/.test(trimmed);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function verifyRetellFunctionRequest(request: FastifyRequest) {
  const env = loadEnv();
  if (env.RETELL_CUSTOM_FUNCTION_SKIP_SIGNATURE_VERIFICATION) {
    return { verified: true, skipped: true as const, reason: "signature_verification_skipped" };
  }
  const secret = env.RETELL_CUSTOM_FUNCTION_SECRET ?? env.RETELL_API_KEY;
  const rawBody = retellFunctionRawBodies.get(request);
  return verifyRetellCustomFunctionSignature({
    headers: request.headers,
    body: request.body,
    ...(rawBody ? { rawBody } : {}),
    ...(secret ? { secret } : {})
  });
}

function verifyRetellWebhookRequest(request: FastifyRequest) {
  const env = loadEnv();
  if (env.RETELL_CUSTOM_FUNCTION_SKIP_SIGNATURE_VERIFICATION) {
    return { verified: true, skipped: true as const, reason: "signature_verification_skipped" };
  }
  const secret =
    env.RETELL_WEBHOOK_SECRET ?? env.RETELL_CUSTOM_FUNCTION_SECRET ?? env.RETELL_API_KEY;
  const rawBody = retellFunctionRawBodies.get(request);
  return verifyRetellCustomFunctionSignature({
    headers: request.headers,
    body: request.body,
    ...(rawBody ? { rawBody } : {}),
    ...(secret ? { secret } : {})
  });
}

function registerRetellFunctionRawBodyCapture(app: FastifyInstance) {
  app.addHook("preParsing", (request, _reply, payload, done) => {
    if (request.method !== "POST" || !isRetellSignedUrl(request.url)) {
      done(null, payload);
      return;
    }

    const chunks: Buffer[] = [];
    payload.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    payload.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      retellFunctionRawBodies.set(request, rawBody);
      const replay = Readable.from([rawBody]);
      Object.assign(replay, { receivedEncodedLength: Buffer.byteLength(rawBody) });
      done(null, replay);
    });
    payload.on("error", done);
  });
}

function isRetellFunctionUrl(url: string): boolean {
  return url === "/retell/functions" || url.startsWith("/retell/functions/");
}

function isRetellWebhookUrl(url: string): boolean {
  return url === "/v1/retell/webhook" || url === "/v1/retell/webhooks/calls";
}

function isRetellSignedUrl(url: string): boolean {
  return isRetellFunctionUrl(url) || isRetellWebhookUrl(url);
}

function resolveRetellWebhookTenantId(request: FastifyRequest): string {
  const env = loadEnv();
  const query = isPlainObject(request.query) ? request.query : {};
  const headers = request.headers;
  const body = isPlainObject(request.body) ? request.body : {};
  const call = isPlainObject(body.call) ? body.call : body;
  const metadata = isPlainObject(call.metadata) ? call.metadata : {};
  const dynamicVariables = isPlainObject(call.retell_llm_dynamic_variables)
    ? call.retell_llm_dynamic_variables
    : {};

  return (
    firstResolvedContextValue(query.tenantId) ??
    firstResolvedContextValue(query.tenant_id) ??
    firstResolvedContextValue(headers["x-tenant-id"]) ??
    firstResolvedContextValue(headers["x-tenant"]) ??
    firstResolvedContextValue(body.tenantId) ??
    firstResolvedContextValue(body.tenant_id) ??
    firstResolvedContextValue(metadata.tenantId) ??
    firstResolvedContextValue(metadata.tenant_id) ??
    firstResolvedContextValue(dynamicVariables.tenantId) ??
    firstResolvedContextValue(dynamicVariables.tenant_id) ??
    env.DEFAULT_TENANT_SLUG
  );
}

function defaultRetellWebhookPrincipal(): RetellFunctionPrincipal {
  return {
    id: "retell_webhook",
    roles: ["ar_collector"]
  };
}

function resolveRetellFunctionPublicBaseUrl(
  request: FastifyRequest,
  configuredBaseUrl: string | undefined
): string | undefined {
  const query = request.query as { baseUrl?: unknown } | undefined;
  if (typeof query?.baseUrl === "string" && query.baseUrl.trim().length > 0) {
    return query.baseUrl.trim().replace(/\/+$/, "");
  }
  if (configuredBaseUrl?.trim()) {
    return configuredBaseUrl.trim().replace(/\/+$/, "");
  }

  const forwardedProto = readSingleHeader(request.headers["x-forwarded-proto"]);
  const forwardedHost = readSingleHeader(request.headers["x-forwarded-host"]);
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto.split(",")[0]?.trim() ?? "https"}://${forwardedHost
      .split(",")[0]
      ?.trim()}`;
  }

  const host = readSingleHeader(request.headers.host);
  if (!host) {
    return undefined;
  }
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}`;
}

function readSingleHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value.find((entry) => entry.trim().length > 0)?.trim();
  }
  return value?.trim() || undefined;
}

function resolveRetellFunctionBaseInput(input: RetellFunctionContextRequest):
  | {
      base: RetellLiveFunctionBaseInput;
      principal: RetellFunctionPrincipal;
      tenantId: string;
    }
  | { statusCode: 422; error: string; reason: string } {
  const env = loadEnv();
  const tenantId = input.tenantId ?? env.DEFAULT_TENANT_SLUG;
  const account = input.account
    ? toBillingAccount(input.account)
    : input.billingAccountId && isDatabaseAvailable(databaseUrl)
      ? loadBillingAccount(input.billingAccountId)
      : undefined;
  if (!account) {
    return {
      statusCode: 422,
      error: "Retell custom function requires billing account context.",
      reason: "missing_billing_account_context"
    };
  }

  let contact = input.contact ? toContact(input.contact) : undefined;
  if (contact && !contactBelongsToBillingAccount(contact, account.id)) {
    contact = undefined;
  }
  if (!contact && input.contactId && isDatabaseAvailable(databaseUrl)) {
    const candidate = loadContact(input.contactId);
    contact =
      candidate && contactBelongsToBillingAccount(candidate, account.id) ? candidate : undefined;
  }
  if (!contact && input.callerPhoneNumber && isDatabaseAvailable(databaseUrl)) {
    contact = chooseInboundContact(loadContactsByPhone(input.callerPhoneNumber));
    if (contact && !contactBelongsToBillingAccount(contact, account.id)) {
      contact = undefined;
    }
  }
  if (!contact && account && isDatabaseAvailable(databaseUrl)) {
    contact = chooseSafeBillingAccountContact(loadContactsByBillingAccount(account.id));
  }
  if (!contact) {
    return {
      statusCode: 422,
      error: "Retell custom function requires contact context.",
      reason: "missing_contact_context"
    };
  }

  const inlineInvoices = (input.invoices ?? []).map(toInvoice);
  const invoices =
    inlineInvoices.length > 0
      ? inlineInvoices
      : isDatabaseAvailable(databaseUrl)
        ? loadStatementOfAccountInvoices({ billingAccountId: account.id })
        : [];
  const promisesToPay =
    input.promisesToPay?.map(toPromiseToPay) ??
    (isDatabaseAvailable(databaseUrl)
      ? loadPromiseToPayContext({
          billingAccountId: account.id,
          contactId: contact.id,
          invoiceIds: invoices.map((invoice) => invoice.id)
        })
      : []);
  const principal = input.principal ?? defaultRetellFunctionPrincipal();
  const occurredAt = resolveCollectionsVoicePreCallAsOf(input.asOf, new Date().toISOString());
  const functionId = input.functionCallId ?? randomUUID();

  return {
    principal,
    tenantId,
    base: {
      functionId,
      occurredAt,
      account,
      contact,
      invoices,
      promisesToPay,
      asOf: occurredAt,
      planId: input.preCallPlanId ?? `retell_live_${functionId}`,
      ...(input.preDueWindowDays !== undefined ? { preDueWindowDays: input.preDueWindowDays } : {}),
      ...(input.frozenInvoiceIds ? { frozenInvoiceIds: input.frozenInvoiceIds } : {}),
      ...(input.frozenGroupNames ? { frozenGroupNames: input.frozenGroupNames } : {}),
      ...(input.communicationAttemptId
        ? { communicationAttemptId: input.communicationAttemptId }
        : {}),
      ...(input.providerCallId ? { providerCallId: input.providerCallId } : {}),
      ...(input.preCallPlanId ? { preCallPlanId: input.preCallPlanId } : {}),
      ...(input.statementSnapshotId ? { statementSnapshotId: input.statementSnapshotId } : {})
    }
  };
}

function contactBelongsToBillingAccount(contact: Contact, billingAccountId: string): boolean {
  if (contact.billingAccountId && contact.billingAccountId !== billingAccountId) {
    return false;
  }
  if (contact.scope === "billing_account" && contact.scopeId !== billingAccountId) {
    return false;
  }
  return true;
}

function appendRetellFunctionAudit(input: {
  functionName: string;
  result: RetellLiveFunctionResponse;
  requestBody: RetellFunctionContextRequest;
  principal: RetellFunctionPrincipal;
  tenantId: string;
  account: BillingAccount;
  contact: Contact;
}) {
  const audit = createActivityLogDomainHelpers({
    store: getActivityStore(input.account.id, input.tenantId),
    idGenerator: randomUUID,
    now: () => new Date().toISOString()
  });
  return audit.append({
    actorId: input.principal.id,
    actorRole: input.principal.roles[0] ?? "ar_collector",
    action: `retell.custom_function.${input.functionName}.${input.result.status}`,
    entityType: "billing_account",
    entityId: input.account.id,
    after: serializeRouteJson(input.result),
    metadata: {
      eventType: "retell_custom_function",
      functionName: input.functionName,
      status: input.result.status,
      ok: input.result.ok,
      blockedReason: input.result.blockedReason ?? "",
      billingAccountId: input.account.id,
      billing_account_id: input.account.id,
      parentAccountId: input.account.parentAccountId,
      parent_account_id: input.account.parentAccountId,
      branchId: input.result.branchId ?? "",
      branch_id: input.result.branchId ?? "",
      contactId: input.contact.id,
      contact_id: input.contact.id,
      communicationAttemptId:
        typeof input.requestBody.communicationAttemptId === "string"
          ? input.requestBody.communicationAttemptId
          : "",
      communication_attempt_id:
        typeof input.requestBody.communicationAttemptId === "string"
          ? input.requestBody.communicationAttemptId
          : "",
      providerCallId:
        typeof input.requestBody.providerCallId === "string"
          ? input.requestBody.providerCallId
          : "",
      provider_call_id:
        typeof input.requestBody.providerCallId === "string"
          ? input.requestBody.providerCallId
          : "",
      persistenceActionKinds:
        input.result.persistencePlan?.actions.map((action) => action.kind) ?? [],
      invoiceIds: readRequestInvoiceIds(input.requestBody),
      disputeScope: readStringMetadata(input.result.metadata, "disputeScope"),
      dispute_scope: readStringMetadata(input.result.metadata, "dispute_scope"),
      canContinueAfterDispute: readBooleanMetadata(
        input.result.metadata,
        "canContinueAfterDispute"
      ),
      can_continue_after_dispute: readBooleanMetadata(
        input.result.metadata,
        "can_continue_after_dispute"
      ),
      nextActionAfterDispute: readStringMetadata(input.result.metadata, "nextActionAfterDispute"),
      next_action_after_dispute: readStringMetadata(
        input.result.metadata,
        "next_action_after_dispute"
      ),
      frozenScopeSummary: readStringMetadata(input.result.metadata, "frozenScopeSummary"),
      frozen_scope_summary: readStringMetadata(input.result.metadata, "frozen_scope_summary")
    }
  });
}

function appendOperatorConsoleImportAudit(input: {
  tenantId: string;
  occurredAt: string;
  requestBody: z.infer<typeof operatorConsoleImportRequestSchema>;
  result: Awaited<
    ReturnType<
      ReturnType<
        typeof createOperatorConsoleCanonicalImportService
      >["materializeFromOperatorConsoleReadModel"]
    >
  >;
}) {
  const entityId =
    input.result.callableTargets[0]?.billingAccountId ??
    input.result.nonCallableTargets[0]?.billingAccountId ??
    input.tenantId;
  const audit = createActivityLogDomainHelpers({
    store: getActivityStore(entityId, input.tenantId),
    idGenerator: randomUUID,
    now: () => input.occurredAt
  });

  return audit.append({
    actorId: "retell_operator_console_import_endpoint",
    actorRole: "system",
    action: `retell.operator_console_import.${input.result.status}`,
    entityType: "billing_account",
    entityId,
    after: serializeRouteJson(input.result),
    metadata: {
      eventType: "retell_operator_console_import",
      tenantId: input.tenantId,
      tenant_id: input.tenantId,
      customerName: input.requestBody.customerName ?? "",
      customer_name: input.requestBody.customerName ?? "",
      customerReference: input.requestBody.customerReference ?? "",
      customer_reference: input.requestBody.customerReference ?? "",
      importedSnapshotCount: input.result.importedSnapshotCount,
      imported_snapshot_count: input.result.importedSnapshotCount,
      importedBillingAccountCount: input.result.importedBillingAccountCount,
      imported_billing_account_count: input.result.importedBillingAccountCount,
      importedContactCount: input.result.importedContactCount,
      imported_contact_count: input.result.importedContactCount,
      canonicalInvoiceCount: input.result.canonicalInvoiceCount,
      canonical_invoice_count: input.result.canonicalInvoiceCount,
      callableTargetCount: input.result.callableTargets.length,
      callable_target_count: input.result.callableTargets.length,
      nonCallableTargetCount: input.result.nonCallableTargets.length,
      non_callable_target_count: input.result.nonCallableTargets.length,
      markContactsVerified: input.requestBody.markContactsVerified ?? false,
      mark_contacts_verified: input.requestBody.markContactsVerified ?? false,
      defaultPhoneNumberApplied: Boolean(input.requestBody.defaultPhoneNumber),
      default_phone_number_applied: Boolean(input.requestBody.defaultPhoneNumber)
    }
  });
}

function toRetellFunctionAgentResponse(
  result: RetellLiveFunctionResponse,
  auditAction: string,
  auditEntryId: string
) {
  const groupRoutingFields = result.metadata
    ? pickRetellGroupRoutingAgentFields(result.metadata)
    : {};

  return {
    ok: result.ok,
    status: result.status,
    message: result.message,
    ...(result.blockedReason ? { blockedReason: result.blockedReason } : {}),
    billingAccountId: result.billingAccountId,
    ...(result.branchId ? { branchId: result.branchId } : {}),
    contactId: result.contactId,
    ...(result.planId ? { planId: result.planId } : {}),
    ...(result.groupSummaries ? { groupSummaries: result.groupSummaries } : {}),
    ...(result.invoices ? { invoices: result.invoices } : {}),
    ...(result.promiseToPay
      ? {
          promiseToPay: {
            id: result.promiseToPay.id,
            state: result.promiseToPay.state,
            promiseDate: result.promiseToPay.promiseDate,
            promisedAmountCents: result.promiseToPay.promisedAmountCents,
            currency: result.promiseToPay.currency
          }
        }
      : {}),
    ...(result.persistencePlan
      ? {
          persistencePlan: {
            id: result.persistencePlan.id,
            followUpSafeMode: result.persistencePlan.followUpSafeMode,
            operatorReviewRequired: result.persistencePlan.operatorReviewRequired,
            actions: result.persistencePlan.actions.map((action) => ({
              kind: action.kind,
              title: action.title,
              requiresHumanReview: action.requiresHumanReview,
              ...(action.dueAt ? { dueAt: action.dueAt } : {}),
              metadata: action.metadata
            }))
          }
        }
      : {}),
    ...(result.nextStep ? { nextStep: result.nextStep } : {}),
    ...groupRoutingFields,
    ...(result.metadata ? { metadata: result.metadata } : {}),
    audit: {
      logged: true,
      action: auditAction,
      entryId: auditEntryId
    }
  };
}

function pickRetellGroupRoutingAgentFields(metadata: Record<string, unknown>) {
  const fieldNames = [
    "primaryGroupName",
    "primaryGroupTreatmentMode",
    "primaryGroupCount",
    "primaryGroupTotalCents",
    "primaryGroupSummary",
    "hasBrokenPromises",
    "brokenPromisesCount",
    "brokenPromisesTotalCents",
    "brokenPromisesSummary",
    "has_broken_promises",
    "broken_promises_count",
    "broken_promises_total_cents",
    "broken_promises_summary",
    "hasOverdueWithoutPromise",
    "overdueWithoutPromiseCount",
    "overdueWithoutPromiseTotalCents",
    "overdueWithoutPromiseSummary",
    "has_overdue_without_promise",
    "overdue_without_promise_count",
    "overdue_without_promise_total_cents",
    "overdue_without_promise_summary",
    "hasDueTodayWithoutPromise",
    "dueTodayWithoutPromiseCount",
    "dueTodayWithoutPromiseTotalCents",
    "dueTodayWithoutPromiseSummary",
    "has_due_today_without_promise",
    "due_today_without_promise_count",
    "due_today_without_promise_total_cents",
    "due_today_without_promise_summary",
    "hasPreDueWithoutPromise",
    "preDueWithoutPromiseCount",
    "preDueWithoutPromiseTotalCents",
    "preDueWithoutPromiseSummary",
    "has_pre_due_without_promise",
    "pre_due_without_promise_count",
    "pre_due_without_promise_total_cents",
    "pre_due_without_promise_summary",
    "hasActiveFuturePromises",
    "activeFuturePromisesCount",
    "activeFuturePromisesTotalCents",
    "activeFuturePromisesSummary",
    "has_active_future_promises",
    "active_future_promises_count",
    "active_future_promises_total_cents",
    "active_future_promises_summary",
    "activeFuturePromiseCount",
    "activeFuturePromiseTotalCents",
    "activeFuturePromiseSummary",
    "active_future_promise_count",
    "active_future_promise_total_cents",
    "active_future_promise_summary",
    "hasRoutineReminders",
    "routineRemindersCount",
    "routineRemindersTotalCents",
    "routineRemindersSummary",
    "has_routine_reminders",
    "routine_reminders_count",
    "routine_reminders_total_cents",
    "routine_reminders_summary"
  ];

  return Object.fromEntries(
    fieldNames
      .filter((fieldName) => metadata[fieldName] !== undefined)
      .map((fieldName) => [fieldName, metadata[fieldName]])
  );
}

function defaultRetellFunctionPrincipal(): RetellFunctionPrincipal {
  return {
    id: "retell_custom_function",
    roles: ["ar_collector"]
  };
}

function readRequestInvoiceIds(input: RetellFunctionContextRequest): string[] {
  const candidate = (input as Record<string, unknown>).invoiceIds;
  return Array.isArray(candidate)
    ? candidate.filter((value): value is string => typeof value === "string")
    : [];
}

function readStringMetadata(metadata: Record<string, unknown> | undefined, key: string): string {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

function readBooleanMetadata(
  metadata: Record<string, unknown> | undefined,
  key: string
): boolean | "" {
  const value = metadata?.[key];
  return typeof value === "boolean" ? value : "";
}

type SendSoaCallSummaryResolution = {
  summary?: string;
  source: "request" | "call_inbox" | "activity_log" | "none";
};

async function resolveSendSoaCallSummary(input: {
  body: RetellFunctionSendSoaRequest;
  tenantId: string;
  account: BillingAccount;
  contact: Contact;
}): Promise<SendSoaCallSummaryResolution> {
  const requestSummary = resolveSendSoaRequestCallSummary(input.body);
  if (requestSummary) {
    return { summary: requestSummary, source: "request" };
  }

  const callInboxSummary = await resolveCallInboxCallSummary(input);
  if (callInboxSummary) {
    return { summary: callInboxSummary, source: "call_inbox" };
  }

  const activitySummary = resolveActivityLogCallSummary(input);
  if (activitySummary) {
    return { summary: activitySummary, source: "activity_log" };
  }

  return { source: "none" };
}

function resolveSendSoaRequestCallSummary(body: RetellFunctionSendSoaRequest): string | undefined {
  return normalizeCustomerFacingCallSummary(
    body.callSummary ??
      body.call_summary ??
      body.transcriptSummary ??
      body.transcript_summary ??
      body.summary
  );
}

async function resolveCallInboxCallSummary(input: {
  body: RetellFunctionSendSoaRequest;
  tenantId: string;
  account: BillingAccount;
  contact: Contact;
}): Promise<string | undefined> {
  try {
    const identifiers = retellCallSummaryIdentifiers(input.body);
    const calls = await getCallInboxService().listCalls({
      customer: input.account.id
    });
    const records = (
      await Promise.all(
        calls.items
          .filter((item) => item.billingAccountId === input.account.id)
          .map((item) => getCallInboxService().getCall(item.id))
      )
    ).filter((record): record is NonNullable<typeof record> => Boolean(record));

    return records
      .filter((record) => record.tenantId === input.tenantId)
      .filter((record) => record.billingAccountId === input.account.id)
      .filter(
        (record) => !record.contactId || record.contactId === input.contact.id || identifiers.size > 0
      )
      .map((record) => ({
        record,
        summary: normalizeCustomerFacingCallSummary(record.summary),
        exactMatch:
          identifiers.has(record.providerCallId) ||
          identifiers.has(record.communicationAttemptId ?? "") ||
          identifiers.has(record.preCallPlanId ?? "")
      }))
      .filter((entry) => entry.summary)
      .filter((entry) =>
        identifiers.size > 0 ? entry.exactMatch : isRecentCallSummary(entry.record.startedAt)
      )
      .sort((left, right) => {
        if (left.exactMatch !== right.exactMatch) {
          return left.exactMatch ? -1 : 1;
        }

        return right.record.startedAt.localeCompare(left.record.startedAt);
      })[0]?.summary;
  } catch {
    return undefined;
  }
}

function resolveActivityLogCallSummary(input: {
  body: RetellFunctionSendSoaRequest;
  tenantId: string;
  account: BillingAccount;
  contact: Contact;
}): string | undefined {
  if (!databaseUrl || !isUuid(input.account.id) || !isDatabaseAvailable(databaseUrl)) {
    return undefined;
  }

  const identifiers = [...retellCallSummaryIdentifiers(input.body)];
  const exactMatchExpression =
    identifiers.length > 0
      ? `
        (
          COALESCE(payload #>> '{metadata,communicationAttemptId}', '') = ANY(${sqlTextArray(identifiers)})
          OR COALESCE(payload #>> '{metadata,communication_attempt_id}', '') = ANY(${sqlTextArray(identifiers)})
          OR COALESCE(payload #>> '{after,communicationAttemptId}', '') = ANY(${sqlTextArray(identifiers)})
          OR COALESCE(payload #>> '{metadata,providerCallId}', '') = ANY(${sqlTextArray(identifiers)})
          OR COALESCE(payload #>> '{metadata,provider_call_id}', '') = ANY(${sqlTextArray(identifiers)})
          OR COALESCE(payload #>> '{after,providerCallId}', '') = ANY(${sqlTextArray(identifiers)})
          OR COALESCE(payload #>> '{metadata,preCallPlanId}', '') = ANY(${sqlTextArray(identifiers)})
          OR COALESCE(payload #>> '{metadata,pre_call_plan_id}', '') = ANY(${sqlTextArray(identifiers)})
        )
      `
      : "false";

  try {
    const [row] = queryJsonRows<{ summary?: string }>(
      databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT summary
          FROM (
            SELECT
              occurred_at,
              (${exactMatchExpression}) AS exact_match,
              COALESCE(
                NULLIF(payload #>> '{after,transcriptSummary}', ''),
                NULLIF(payload #>> '{after,transcript_summary}', ''),
                NULLIF(payload #>> '{metadata,transcriptSummary}', ''),
                NULLIF(payload #>> '{metadata,transcript_summary}', ''),
                NULLIF(payload #>> '{after,transcriptSnippet}', ''),
                NULLIF(payload #>> '{metadata,transcriptSnippet}', ''),
                NULLIF(payload #>> '{after,metadata,transcriptSnippet}', '')
              ) AS summary
            FROM activity_log
            WHERE tenant_id = '${quoteSql(input.tenantId)}'
              AND entity_type = 'billing_account'
              AND entity_id = '${quoteSql(input.account.id)}'::uuid
              AND action IN (
                'retell.call_outcome.received',
                'collections.voice.post_call.persistence_planned',
                'collections.voice.post_call.task_created'
              )
              AND (
                COALESCE(payload #>> '{metadata,contactId}', '') IN ('', '${quoteSql(input.contact.id)}')
                OR COALESCE(payload #>> '{metadata,contact_id}', '') IN ('', '${quoteSql(input.contact.id)}')
              )
              AND ${
                identifiers.length > 0
                  ? `(${exactMatchExpression})`
                  : "occurred_at >= now() - interval '24 hours'"
              }
          ) candidates
          WHERE summary IS NOT NULL
          ORDER BY exact_match DESC, occurred_at DESC
          LIMIT 1
        ) q
      `
    );

    return normalizeCustomerFacingCallSummary(row?.summary);
  } catch {
    return undefined;
  }
}

function retellCallSummaryIdentifiers(body: RetellFunctionSendSoaRequest): Set<string> {
  return new Set(
    uniqueStrings([
      body.communicationAttemptId ?? "",
      body.providerCallId ?? "",
      body.preCallPlanId ?? "",
      body.functionCallId ?? ""
    ])
  );
}

function isRecentCallSummary(startedAt: string): boolean {
  const timestamp = new Date(startedAt).getTime();
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return Date.now() - timestamp <= 24 * 60 * 60 * 1000;
}

function sqlTextArray(values: string[]): string {
  return `ARRAY[${values.map((value) => `'${quoteSql(value)}'`).join(", ")}]::text[]`;
}

function normalizeCustomerFacingCallSummary(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || /^\{\{.+\}\}$/.test(normalized)) {
    return undefined;
  }

  return normalized.length > 700 ? `${normalized.slice(0, 697).trimEnd()}...` : normalized;
}

function toOutboundCallResponse(result: RetellCollectionsCallResult) {
  const output = result.plan.preCallOutput;
  const blockedReason =
    result.status === "blocked"
      ? (result.plan.safetyDecision.blockedReasons[0] ??
        result.plan.bucketOutput.blocked_reason ??
        "blocked")
      : undefined;

  return {
    status: result.status,
    ...(blockedReason ? { blockedReason } : {}),
    blockedReasons: result.plan.safetyDecision.blockedReasons,
    verifiedContactStatus: output.verified_contact_status,
    handlerContext: {
      contactId: result.plan.handlerContext.contactId,
      contactName: result.plan.handlerContext.contactName,
      contactRole: result.plan.handlerContext.contactRole,
      verifiedContactStatus: result.plan.handlerContext.verifiedContactStatus,
      verificationSource: result.plan.handlerContext.verificationSource,
      currentAccountHandlerName: result.plan.handlerContext.currentAccountHandlerName ?? "",
      currentAccountHandlerRole: result.plan.handlerContext.currentAccountHandlerRole ?? "",
      currentHandlerContactId: result.plan.handlerContext.currentHandlerContactId ?? "",
      rightPartyCheckRequired: result.plan.handlerContext.rightPartyCheckRequired,
      handlerHandoffPossible: result.plan.handlerContext.handlerHandoffPossible,
      currentContactMayNoLongerBeHandler:
        result.plan.handlerContext.currentContactMayNoLongerBeHandler,
      knownNewHandlerName: result.plan.handlerContext.knownNewHandlerName ?? "",
      knownNewHandlerPhone: result.plan.handlerContext.knownNewHandlerPhone ?? "",
      knownNewHandlerEmail: result.plan.handlerContext.knownNewHandlerEmail ?? "",
      knownNewHandlerContactId: result.plan.handlerContext.knownNewHandlerContactId ?? "",
      knownNewHandlerVerified: result.plan.handlerContext.knownNewHandlerVerified,
      routingUpdateRecommended: result.plan.handlerContext.routingUpdateRecommended,
      liveTransferPossible: result.plan.handlerContext.liveTransferPossible,
      followUpRequired: result.plan.handlerContext.followUpRequired,
      handlerHandoffBlockedReason: result.plan.handlerContext.handlerHandoffBlockedReason ?? ""
    },
    callObjective: output.call_objective,
    groupSummaries: result.plan.callPriorityGroups.map((group) => ({
      name: group.name,
      rank: group.rank,
      label: group.label,
      count: group.count,
      totalCents: group.totalCents,
      summary: group.summary,
      treatmentMode: group.treatmentMode,
      retellInstruction: group.retellInstruction
    })),
    ...(result.status === "started" ? { retellCallId: result.retellCall.call_id } : {}),
    plan: result.plan,
    activityEntries: result.activityEntries,
    ...(result.status === "started"
      ? {
          communicationAttempt: result.communicationAttempt,
          retellPayload: result.retellPayload,
          retellCall: result.retellCall
        }
      : {})
  };
}

function toInboundCallResponse(result: RetellInboundRoutingResult) {
  return {
    status: result.status,
    ...(result.fallbackReason ? { blockedReason: result.fallbackReason } : {}),
    ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
    verifiedContactStatus: result.verifiedContactStatus,
    routingContext: result.routingContext,
    handlerContext: {
      contactId: result.handlerContext.contactId,
      contactName: result.handlerContext.contactName,
      contactRole: result.handlerContext.contactRole,
      verifiedContactStatus: result.handlerContext.verifiedContactStatus,
      verificationSource: result.handlerContext.verificationSource,
      currentAccountHandlerName: result.handlerContext.currentAccountHandlerName ?? "",
      currentAccountHandlerRole: result.handlerContext.currentAccountHandlerRole ?? "",
      currentHandlerContactId: result.handlerContext.currentHandlerContactId ?? "",
      rightPartyCheckRequired: result.handlerContext.rightPartyCheckRequired,
      handlerHandoffPossible: result.handlerContext.handlerHandoffPossible,
      currentContactMayNoLongerBeHandler: result.handlerContext.currentContactMayNoLongerBeHandler,
      knownNewHandlerName: result.handlerContext.knownNewHandlerName ?? "",
      knownNewHandlerPhone: result.handlerContext.knownNewHandlerPhone ?? "",
      knownNewHandlerEmail: result.handlerContext.knownNewHandlerEmail ?? "",
      knownNewHandlerContactId: result.handlerContext.knownNewHandlerContactId ?? "",
      knownNewHandlerVerified: result.handlerContext.knownNewHandlerVerified,
      routingUpdateRecommended: result.handlerContext.routingUpdateRecommended,
      liveTransferPossible: result.handlerContext.liveTransferPossible,
      followUpRequired: result.handlerContext.followUpRequired,
      handlerHandoffBlockedReason: result.handlerContext.handlerHandoffBlockedReason ?? ""
    },
    callObjective: result.callObjective,
    groupSummaries: result.groupSummaries,
    retellRoutingPayload: result.retellRoutingPayload,
    retell_llm_dynamic_variables: result.retell_llm_dynamic_variables,
    plan: result.plan,
    activityEntries: result.activityEntries
  };
}

function toInboundFallbackResponse(callerPhoneNumber: string, fallbackReason: string) {
  const dynamicVariables = stringifyInboundFallbackVariables({
    inbound_call: true,
    routing_status: "fallback",
    fallback_reason: fallbackReason,
    caller_phone_number: callerPhoneNumber,
    verified_contact_status: "unknown",
    handler_verification_source: "unknown",
    right_party_check_required: true,
    handler_handoff_possible: false,
    call_objective: "safe_human_review_required",
    call_priority_plan: "safe human review: caller could not be matched to a billing account",
    safe_goal:
      "Route this inbound caller to a human collections fallback before discussing invoice details."
  });

  return {
    status: "fallback",
    blockedReason: fallbackReason,
    fallbackReason,
    verifiedContactStatus: "unknown",
    routingContext: {
      routingLevel: "billing_account",
      parentAccountId: "",
      billingAccountId: "",
      contactId: "",
      branchIds: []
    },
    handlerContext: {
      contactId: "",
      contactName: "",
      contactRole: "",
      verifiedContactStatus: "unknown",
      verificationSource: "unknown",
      currentAccountHandlerName: "",
      currentAccountHandlerRole: "",
      currentHandlerContactId: "",
      rightPartyCheckRequired: true,
      handlerHandoffPossible: false,
      currentContactMayNoLongerBeHandler: false,
      knownNewHandlerName: "",
      knownNewHandlerPhone: "",
      knownNewHandlerEmail: "",
      knownNewHandlerContactId: "",
      knownNewHandlerVerified: false,
      routingUpdateRecommended: false,
      liveTransferPossible: false,
      followUpRequired: true,
      handlerHandoffBlockedReason: fallbackReason
    },
    callObjective: "safe_human_review_required",
    groupSummaries: [],
    retellRoutingPayload: {
      metadata: {
        caller_phone_number: callerPhoneNumber,
        routing_status: "fallback",
        fallback_reason: fallbackReason,
        call_objective: "safe_human_review_required"
      },
      retell_llm_dynamic_variables: dynamicVariables
    },
    retell_llm_dynamic_variables: dynamicVariables,
    activityEntries: []
  };
}

function resolveInboundCallInput(input: InboundCallRequest):
  | {
      account: BillingAccount;
      contact: Contact;
      invoices: CustomerInvoice[];
      promisesToPay: PromiseToPay[];
    }
  | { fallbackReason: string } {
  const inlineAccounts = [
    ...(input.account ? [toBillingAccount(input.account)] : []),
    ...(input.accounts ?? []).map(toBillingAccount)
  ];
  const inlineContacts = [
    ...(input.contact ? [toContact(input.contact)] : []),
    ...(input.contacts ?? []).map(toContact)
  ];

  if (inlineAccounts.length > 0 || inlineContacts.length > 0 || input.invoices) {
    return resolveInlineInboundCallInput({
      callerPhoneNumber: input.callerPhoneNumber,
      ...(input.billingAccountId ? { billingAccountId: input.billingAccountId } : {}),
      accounts: inlineAccounts,
      contacts: inlineContacts,
      invoices: (input.invoices ?? []).map(toInvoice),
      promisesToPay: (input.promisesToPay ?? []).map(toPromiseToPay)
    });
  }

  if (!isDatabaseAvailable(databaseUrl)) {
    return { fallbackReason: "caller_lookup_unavailable" };
  }

  const matchingContacts = loadContactsByPhone(input.callerPhoneNumber);
  if (matchingContacts.length === 0) {
    return { fallbackReason: "caller_not_identified" };
  }

  const contact = chooseInboundContact(matchingContacts);
  if (!contact) {
    return { fallbackReason: "ambiguous_caller_phone" };
  }

  const billingAccountId =
    contact.billingAccountId ??
    (contact.scope === "billing_account" ? contact.scopeId : input.billingAccountId);
  if (!billingAccountId) {
    return { fallbackReason: "missing_billing_account_context" };
  }

  const account = loadBillingAccount(billingAccountId);
  if (!account) {
    return { fallbackReason: "billing_account_not_found" };
  }

  const invoices = loadStatementOfAccountInvoices({ billingAccountId });
  if (invoices.length === 0) {
    return { fallbackReason: "no_statement_invoices" };
  }

  return {
    account,
    contact,
    invoices,
    promisesToPay: loadPromiseToPayContext({
      billingAccountId,
      contactId: contact.id,
      invoiceIds: invoices.map((invoice) => invoice.id)
    })
  };
}

function resolveInlineInboundCallInput(input: {
  callerPhoneNumber: string;
  billingAccountId?: string;
  accounts: BillingAccount[];
  contacts: Contact[];
  invoices: CustomerInvoice[];
  promisesToPay: PromiseToPay[];
}):
  | {
      account: BillingAccount;
      contact: Contact;
      invoices: CustomerInvoice[];
      promisesToPay: PromiseToPay[];
    }
  | { fallbackReason: string } {
  const matchingContacts = input.contacts.filter((contact) =>
    phoneNumbersMatch(contact.phone, input.callerPhoneNumber)
  );
  if (matchingContacts.length === 0) {
    return { fallbackReason: "caller_not_identified" };
  }

  const contact = chooseInboundContact(matchingContacts);
  if (!contact) {
    return { fallbackReason: "ambiguous_caller_phone" };
  }

  const billingAccountId =
    contact.billingAccountId ??
    (contact.scope === "billing_account" ? contact.scopeId : input.billingAccountId);
  const account =
    input.accounts.find((candidate) => candidate.id === billingAccountId) ??
    (input.accounts.length === 1 ? input.accounts[0] : undefined);
  if (!account) {
    return { fallbackReason: "missing_billing_account_context" };
  }

  const invoices = input.invoices.filter((invoice) => invoice.billingAccountId === account.id);
  if (invoices.length === 0) {
    return { fallbackReason: "no_statement_invoices" };
  }

  const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
  return {
    account,
    contact,
    invoices,
    promisesToPay: input.promisesToPay.filter(
      (promise) =>
        promise.billingAccountId === account.id &&
        promiseReferencesAnyInvoice(promise, invoiceIds, invoices.length)
    )
  };
}

function resolveCallInput(input: OutboundCallRequest):
  | {
      account: BillingAccount;
      contact: Contact;
      invoices: CustomerInvoice[];
      promisesToPay: PromiseToPay[];
    }
  | { statusCode: 422; error: string } {
  if ("account" in input) {
    return {
      account: toBillingAccount(input.account),
      contact: toContact(input.contact),
      invoices: input.invoices.map(toInvoice),
      promisesToPay: (input.promisesToPay ?? []).map(toPromiseToPay)
    };
  }

  if (!isDatabaseAvailable(databaseUrl)) {
    return {
      statusCode: 422,
      error: "Retell reference calls require a live database connection."
    };
  }

  const account = loadBillingAccount(input.billingAccountId);
  if (!account) {
    return {
      statusCode: 422,
      error: `Billing account ${input.billingAccountId} was not found.`
    };
  }

  const contact = loadContact(input.contactId);
  if (!contact) {
    return {
      statusCode: 422,
      error: `Contact ${input.contactId} was not found.`
    };
  }

  const invoices = loadStatementOfAccountInvoices({
    billingAccountId: input.billingAccountId,
    ...(input.invoiceIds ? { invoiceIds: input.invoiceIds } : {})
  });
  if (invoices.length === 0) {
    return {
      statusCode: 422,
      error: "No statement-of-account invoices were found for the requested call."
    };
  }

  return {
    account,
    contact,
    invoices,
    promisesToPay: loadPromiseToPayContext({
      billingAccountId: input.billingAccountId,
      contactId: input.contactId,
      invoiceIds: invoices.map((invoice) => invoice.id)
    })
  };
}

function toContactHandoff(input: NonNullable<PostCallOutcomeRequest["contactHandoff"]>) {
  return {
    newHandlerName: input.newHandlerName,
    ...(input.currentContactId ? { currentContactId: input.currentContactId } : {}),
    ...(input.newHandlerEmail ? { newHandlerEmail: input.newHandlerEmail } : {}),
    ...(input.newHandlerPhone ? { newHandlerPhone: input.newHandlerPhone } : {}),
    ...(input.newHandlerRole ? { newHandlerRole: input.newHandlerRole } : {}),
    ...(input.newHandlerReachable !== undefined
      ? { newHandlerReachable: input.newHandlerReachable }
      : {}),
    ...(input.verificationStatus ? { verificationStatus: input.verificationStatus } : {}),
    ...(input.notes ? { notes: input.notes } : {})
  };
}

function toRoutingChangeRequest(
  input: NonNullable<PostCallOutcomeRequest["routingChangeRequest"]>
) {
  return {
    reason: input.reason,
    ...(input.requestedRoutingLevel ? { requestedRoutingLevel: input.requestedRoutingLevel } : {}),
    ...(input.requestedBillingAccountId
      ? { requestedBillingAccountId: input.requestedBillingAccountId }
      : {}),
    ...(input.requestedBranchId ? { requestedBranchId: input.requestedBranchId } : {}),
    ...(input.requestedContactId ? { requestedContactId: input.requestedContactId } : {})
  };
}

function toPromiseUpdate(input: NonNullable<PostCallOutcomeRequest["promiseUpdate"]>) {
  return {
    invoiceIds: input.invoiceIds,
    ...(input.promiseToPayId ? { promiseToPayId: input.promiseToPayId } : {}),
    ...(input.promisedDate ? { promisedDate: input.promisedDate } : {}),
    ...(input.promisedAmountCents !== undefined
      ? { promisedAmountCents: input.promisedAmountCents }
      : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.notes ? { notes: input.notes } : {})
  };
}

function toPartialPaymentCommitment(
  input: NonNullable<PostCallOutcomeRequest["partialPaymentCommitment"]>
) {
  return {
    invoiceIds: input.invoiceIds,
    promisedAmountCents: input.promisedAmountCents,
    ...(input.promisedDate ? { promisedDate: input.promisedDate } : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.groupName ? { groupName: input.groupName } : {}),
    ...(input.remainderDisposition ? { remainderDisposition: input.remainderDisposition } : {}),
    ...(input.notes ? { notes: input.notes } : {})
  };
}

function toPaymentPlanRequest(input: NonNullable<PostCallOutcomeRequest["paymentPlanRequest"]>) {
  return {
    invoiceIds: input.invoiceIds,
    summary: input.summary,
    ...(input.requestedInstallmentCount !== undefined
      ? { requestedInstallmentCount: input.requestedInstallmentCount }
      : {}),
    ...(input.requestedAmountCents !== undefined
      ? { requestedAmountCents: input.requestedAmountCents }
      : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.requestedCadence ? { requestedCadence: input.requestedCadence } : {}),
    ...(input.requestedFirstPaymentDate
      ? { requestedFirstPaymentDate: input.requestedFirstPaymentDate }
      : {}),
    ...(input.groupName ? { groupName: input.groupName } : {}),
    ...(input.notes ? { notes: input.notes } : {})
  };
}

function toNonCommitment(input: NonNullable<PostCallOutcomeRequest["nonCommitment"]>) {
  return {
    invoiceIds: input.invoiceIds,
    ...(input.groupName ? { groupName: input.groupName } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.callbackRequested !== undefined
      ? { callbackRequested: input.callbackRequested }
      : {}),
    ...(input.notes ? { notes: input.notes } : {})
  };
}

function toPaidAlreadyClaim(input: NonNullable<PostCallOutcomeRequest["paidAlreadyClaim"]>) {
  return {
    invoiceIds: input.invoiceIds,
    ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.paidAt ? { paidAt: input.paidAt } : {}),
    ...(input.reference ? { reference: input.reference } : {}),
    ...(input.remittanceExpected !== undefined
      ? { remittanceExpected: input.remittanceExpected }
      : {}),
    ...(input.notes ? { notes: input.notes } : {})
  };
}

function toDisputeCapture(input: NonNullable<PostCallOutcomeRequest["dispute"]>) {
  return {
    invoiceIds: input.invoiceIds,
    disputeType: input.disputeType,
    summary: input.summary,
    ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
    ...(input.currency ? { currency: input.currency } : {})
  };
}

function toCallbackRequest(input: NonNullable<PostCallOutcomeRequest["callback"]>) {
  return {
    ...(input.requestedAt ? { requestedAt: input.requestedAt } : {}),
    ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    ...(input.timezone ? { timezone: input.timezone } : {}),
    ...(input.notes ? { notes: input.notes } : {})
  };
}

function toFollowUpAction(input: NonNullable<PostCallOutcomeRequest["followUpActions"]>[number]) {
  return {
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    ...(input.requiresHumanReview !== undefined
      ? { requiresHumanReview: input.requiresHumanReview }
      : {}),
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
}

function stringifyInboundFallbackVariables(
  variables: Record<string, string | number | boolean>
): Record<string, string> {
  return Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, String(value)]));
}

function chooseInboundContact(contacts: Contact[]): Contact | undefined {
  const billingAccountIds = new Set(
    contacts
      .map(
        (contact) =>
          contact.billingAccountId ??
          (contact.scope === "billing_account" ? contact.scopeId : undefined)
      )
      .filter((billingAccountId): billingAccountId is string => Boolean(billingAccountId))
  );
  if (billingAccountIds.size > 1) {
    return undefined;
  }

  return [...contacts].sort((left, right) => {
    const leftScore =
      (left.isVerified ? 4 : 0) + (left.allowAutoSend ? 2 : 0) + (left.isPrimary ? 1 : 0);
    const rightScore =
      (right.isVerified ? 4 : 0) + (right.allowAutoSend ? 2 : 0) + (right.isPrimary ? 1 : 0);
    return rightScore - leftScore;
  })[0];
}

export function chooseSafeBillingAccountContact(contacts: Contact[]): Contact | undefined {
  const eligibleContacts = contacts.filter(
    (contact) => Boolean(contact.email) && contact.isVerified && contact.allowAutoSend
  );
  const primaryContacts = eligibleContacts.filter((contact) => contact.isPrimary);
  if (primaryContacts.length === 1) {
    return primaryContacts[0];
  }
  if (eligibleContacts.length === 1) {
    return eligibleContacts[0];
  }
  return undefined;
}

function phoneNumbersMatch(left: string | undefined, right: string): boolean {
  const leftDigits = normalizePhoneDigits(left);
  const rightDigits = normalizePhoneDigits(right);
  if (!leftDigits || !rightDigits) {
    return false;
  }

  return (
    leftDigits === rightDigits ||
    leftDigits.endsWith(rightDigits) ||
    rightDigits.endsWith(leftDigits) ||
    leftDigits.slice(-10) === rightDigits.slice(-10)
  );
}

function normalizePhoneDigits(value: string | undefined): string {
  return value?.replace(/\D/g, "") ?? "";
}

function promiseReferencesAnyInvoice(
  promise: PromiseToPay,
  invoiceIds: Set<string>,
  invoiceCount: number
): boolean {
  const referencedInvoiceIds = [
    ...readStringArray(promise.metadata.invoiceIds),
    ...readStringArray(promise.metadata.invoice_ids),
    ...(typeof promise.metadata.invoiceId === "string" ? [promise.metadata.invoiceId] : [])
  ];
  if (referencedInvoiceIds.length > 0) {
    return referencedInvoiceIds.some((invoiceId) => invoiceIds.has(invoiceId));
  }

  return invoiceCount === 1 || promise.metadata.appliesToBillingAccount === true;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
}

function getActivityStore(accountId: string, tenantId: string) {
  return databaseUrl.length > 0 && isUuid(accountId) && isDatabaseAvailable(databaseUrl)
    ? new PostgresImmutableActivityLogStore(databaseUrl, tenantId)
    : new InMemoryImmutableActivityLogStore();
}

function loadBillingAccount(accountId: string): BillingAccount | undefined {
  if (!isUuid(accountId)) {
    return undefined;
  }

  const [row] = queryJsonRows<z.infer<typeof accountSchema>>(
    databaseUrl,
    `
      SELECT row_to_json(q)
      FROM (
        SELECT
          id::text AS "id",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          parent_account_id::text AS "parentAccountId",
          branch_id::text AS "branchId",
          account_number AS "accountNumber",
          display_name AS "displayName",
          currency,
          account_tier AS "accountTier",
          erp_customer_id AS "erpCustomerId",
          status,
          centrally_paid AS "centrallyPaid",
          metadata
        FROM billing_account
        WHERE deleted_at IS NULL
          AND id = '${quoteSql(accountId)}'::uuid
        LIMIT 1
      ) q
    `
  );

  return row ? toBillingAccount(row) : undefined;
}

function loadContact(contactId: string): Contact | undefined {
  if (!isUuid(contactId)) {
    return undefined;
  }

  const [row] = queryJsonRows<z.infer<typeof contactSchema>>(
    databaseUrl,
    `
      SELECT row_to_json(q)
      FROM (
        SELECT
          id::text AS "id",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          parent_account_id::text AS "parentAccountId",
          billing_account_id::text AS "billingAccountId",
          branch_id::text AS "branchId",
          invoice_id::text AS "invoiceId",
          scope,
          scope_id AS "scopeId",
          full_name AS "fullName",
          email,
          phone,
          role,
          is_primary AS "isPrimary",
          is_verified AS "isVerified",
          allow_auto_send AS "allowAutoSend",
          recent_successful_responses::integer AS "recentSuccessfulResponses",
          metadata
        FROM contact
        WHERE deleted_at IS NULL
          AND id = '${quoteSql(contactId)}'::uuid
        LIMIT 1
      ) q
    `
  );

  return row ? toContact(row) : undefined;
}

function loadContactsByBillingAccount(billingAccountId: string): Contact[] {
  if (!isUuid(billingAccountId)) {
    return [];
  }

  const rows = queryJsonRows<z.infer<typeof contactSchema>>(
    databaseUrl,
    `
      SELECT row_to_json(q)
      FROM (
        SELECT
          id::text AS "id",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          parent_account_id::text AS "parentAccountId",
          billing_account_id::text AS "billingAccountId",
          branch_id::text AS "branchId",
          invoice_id::text AS "invoiceId",
          scope,
          scope_id AS "scopeId",
          full_name AS "fullName",
          email,
          phone,
          role,
          is_primary AS "isPrimary",
          is_verified AS "isVerified",
          allow_auto_send AS "allowAutoSend",
          recent_successful_responses::integer AS "recentSuccessfulResponses",
          metadata
        FROM contact
        WHERE deleted_at IS NULL
          AND billing_account_id = '${quoteSql(billingAccountId)}'::uuid
          AND email IS NOT NULL
        ORDER BY is_primary DESC, is_verified DESC, allow_auto_send DESC, recent_successful_responses DESC
        LIMIT 10
      ) q
    `
  );

  return rows.map(toContact);
}

function loadContactsByPhone(phoneNumber: string): Contact[] {
  const digits = normalizePhoneDigits(phoneNumber);
  if (!digits) {
    return [];
  }

  const rows = queryJsonRows<z.infer<typeof contactSchema>>(
    databaseUrl,
    `
      SELECT row_to_json(q)
      FROM (
        SELECT
          id::text AS "id",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          parent_account_id::text AS "parentAccountId",
          billing_account_id::text AS "billingAccountId",
          branch_id::text AS "branchId",
          invoice_id::text AS "invoiceId",
          scope,
          scope_id AS "scopeId",
          full_name AS "fullName",
          email,
          phone,
          role,
          is_primary AS "isPrimary",
          is_verified AS "isVerified",
          allow_auto_send AS "allowAutoSend",
          recent_successful_responses::integer AS "recentSuccessfulResponses",
          metadata
        FROM contact
        WHERE deleted_at IS NULL
          AND phone IS NOT NULL
          AND regexp_replace(phone, '[^0-9]', '', 'g') = '${quoteSql(digits)}'
        ORDER BY is_primary DESC, is_verified DESC, recent_successful_responses DESC
        LIMIT 10
      ) q
    `
  );

  return rows.map(toContact);
}

function loadStatementOfAccountInvoices(input: {
  billingAccountId: string;
  invoiceIds?: string[];
}): CustomerInvoice[] {
  const invoiceFilter = input.invoiceIds?.length
    ? `AND id IN (${input.invoiceIds
        .map((invoiceId) => `'${quoteSql(invoiceId)}'::uuid`)
        .join(", ")})`
    : "";
  const rows = queryJsonRows<z.infer<typeof invoiceSchema>>(
    databaseUrl,
    `
      SELECT row_to_json(q)
      FROM (
        SELECT
          id::text AS "id",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          state,
          seller_entity_id AS "sellerEntityId",
          parent_account_id::text AS "parentAccountId",
          billing_account_id::text AS "billingAccountId",
          branch_id::text AS "branchId",
          invoice_contact_id::text AS "invoiceContactId",
          uploaded_document_id::text AS "uploadedDocumentId",
          invoice_date AS "invoiceDate",
          invoice_number AS "invoiceNumber",
          currency,
          amount_cents::integer AS "amountCents",
          collectible_amount_cents::integer AS "collectibleAmountCents",
          disputed_amount_cents::integer AS "disputedAmountCents",
          due_date AS "dueDate",
          metadata
        FROM invoice
        WHERE deleted_at IS NULL
          AND billing_account_id = '${quoteSql(input.billingAccountId)}'::uuid
          ${invoiceFilter}
          AND state NOT IN ('paid', 'voided')
        ORDER BY due_date NULLS LAST, invoice_number
      ) q
    `
  );

  return rows.map(toInvoice);
}

function loadPromiseToPayContext(input: {
  billingAccountId: string;
  contactId: string;
  invoiceIds: string[];
}): PromiseToPay[] {
  const rows = loadPromiseToPayContextRows({
    databaseUrl,
    billingAccountId: input.billingAccountId,
    contactId: input.contactId,
    invoiceIds: input.invoiceIds
  });

  return rows.map(toPromiseToPay);
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
    ...(input.erpCustomerId ? { erpCustomerId: input.erpCustomerId } : {})
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
    ...(input.phone ? { phone: input.phone } : {})
  };
}

function toInvoice(input: z.infer<typeof invoiceSchema>): CustomerInvoice {
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
    ...(input.sellerEntityId ? { sellerEntityId: input.sellerEntityId } : {}),
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.invoiceContactId ? { invoiceContactId: input.invoiceContactId } : {}),
    ...(input.uploadedDocumentId ? { uploadedDocumentId: input.uploadedDocumentId } : {}),
    ...(input.invoiceDate ? { invoiceDate: input.invoiceDate } : {}),
    ...(input.collectibleAmountCents !== undefined
      ? { collectibleAmountCents: input.collectibleAmountCents }
      : {}),
    ...(input.disputedAmountCents !== undefined
      ? { disputedAmountCents: input.disputedAmountCents }
      : {}),
    ...(input.provisionalSource ? { provisionalSource: input.provisionalSource } : {}),
    ...(input.dueDate ? { dueDate: input.dueDate } : {})
  };
}

function toPromiseToPay(input: z.infer<typeof promiseToPaySchema>): PromiseToPay {
  return {
    id: input.id,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    state: input.state,
    parentAccountId: input.parentAccountId,
    billingAccountId: input.billingAccountId,
    ...(input.contactId ? { contactId: input.contactId } : {}),
    ...(input.installmentLineIds ? { installmentLineIds: input.installmentLineIds } : {}),
    promisedAmountCents: input.promisedAmountCents,
    currency: input.currency,
    promiseDate: input.promiseDate,
    metadata: input.metadata
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function quoteSql(value: string): string {
  return value.replace(/'/g, "''");
}

function serializeRouteJson<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
