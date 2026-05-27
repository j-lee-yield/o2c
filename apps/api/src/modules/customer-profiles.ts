import { InMemoryAuditLogger } from "@o2c/audit";
import { AuthorizationError, assertAnyRole, type Principal, type Role } from "@o2c/auth";
import { createHash } from "node:crypto";
import type { CustomerProfileIngestionPayload } from "@o2c/domain";
import {
  CustomerProfileMasteringService,
  InMemoryCustomerProfileMasteringStore,
} from "@o2c/workflows";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { getTaskService } from "../bootstrap/task-service.js";
import { getBuyerTaxProfileStore } from "../bootstrap/payment-finality-store.js";

const auditContextSchema = z.object({
  actorId: z.string().min(1),
  actorType: z.enum(["user", "system", "automation"]),
  correlationId: z.string().min(1),
  occurredAt: z.string().min(1),
});

const roleSchema = z.enum([
  "customer",
  "collector",
  "approver",
  "internal",
  "ap",
  "shared_finance",
  "treasury",
  "branch",
  "invoice",
]);

const contactInputSchema = z.object({
  id: z.string().min(1).optional(),
  fullName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(1).optional(),
  role: roleSchema,
  isPrimary: z.boolean().optional(),
  isVerified: z.boolean().optional(),
  allowAutoSend: z.boolean().optional(),
  recentSuccessfulResponses: z.number().int().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const parentAccountSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1).optional(),
  name: z.string().min(1),
  status: z.enum(["active", "inactive"]).default("active"),
  externalReference: z.string().min(1).optional(),
  centrallyServiced: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const billingAccountSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1).optional(),
  parentAccountId: z.string().min(1),
  branchId: z.string().min(1).optional(),
  accountNumber: z.string().min(1),
  displayName: z.string().min(1),
  currency: z.string().min(1).default("PHP"),
  accountTier: z.enum(["standard", "strategic"]).default("standard"),
  erpCustomerId: z.string().min(1).optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  centrallyPaid: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const branchSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1).optional(),
  parentAccountId: z.string().min(1),
  billingAccountId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  region: z.string().min(1).optional(),
  countryCode: z.string().min(1).optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const invoiceSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1).optional(),
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
  ]).default("synced_open"),
  parentAccountId: z.string().min(1),
  billingAccountId: z.string().min(1),
  branchId: z.string().min(1).optional(),
  invoiceContactId: z.string().min(1).optional(),
  uploadedDocumentId: z.string().min(1).optional(),
  invoiceDate: z.string().min(1).optional(),
  invoiceNumber: z.string().min(1),
  currency: z.string().min(1).default("PHP"),
  amountCents: z.number().int(),
  collectibleAmountCents: z.number().int().optional(),
  disputedAmountCents: z.number().int().optional(),
  provisionalSource: z.literal("bir_upload").optional(),
  dueDate: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const paymentSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1).optional(),
  state: z.enum([
    "ingested_unmatched",
    "candidate_match_found",
    "review_required",
    "auto_applied",
    "manually_applied",
    "partially_applied",
    "unapplied_cash",
    "reversed",
    "writeback_pending",
    "writeback_failed",
  ]).default("ingested_unmatched"),
  parentAccountId: z.string().min(1),
  billingAccountId: z.string().min(1).optional(),
  uploadedDocumentId: z.string().min(1).optional(),
  paymentReference: z.string().min(1),
  currency: z.string().min(1).default("PHP"),
  amountCents: z.number().int(),
  receivedAt: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const remittanceSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1).optional(),
  state: z.enum([
    "received_unparsed",
    "parsed_structured",
    "linked_to_payment",
    "linked_to_invoice_candidate",
    "review_required",
    "resolved",
    "orphaned",
  ]).default("received_unparsed"),
  uploadedDocumentId: z.string().min(1).optional(),
  paymentId: z.string().min(1).optional(),
  sourceChannel: z.enum(["email", "edi", "portal", "api"]),
  rawPayload: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const exceptionSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1).optional(),
  state: z.enum([
    "open_new",
    "triaged",
    "waiting_on_customer",
    "waiting_on_internal",
    "ready_for_resolution",
    "resolved",
    "dismissed",
  ]).default("open_new"),
  kind: z.enum([
    "invoice_not_received",
    "wrong_contact",
    "already_paid",
    "proof_remittance_received_not_matched",
    "short_payment",
    "overpayment",
    "partial_dispute",
    "full_dispute",
    "missing_supporting_docs",
    "credit_memo_pending",
    "promise_to_pay_follow_up",
    "strategic_account_escalation",
    "erp_sync_inconsistency",
    "duplicate_invoice_suspicion",
    "unidentified_payer_unapplied_cash",
  ]),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  summary: z.string().min(1),
  details: z.string().min(1).optional(),
  owner: z.object({
    ownerRole: z.enum(["ar_collector", "ar_manager", "controller", "admin"]),
    queue: z.enum([
      "collections_ops",
      "cash_application_review",
      "dispute_resolution",
      "master_data",
      "strategic_controls",
      "integration_ops",
    ]),
    rationale: z.string().min(1),
  }),
  sla: z.object({
    triageByAt: z.string().min(1),
    resolveByAt: z.string().min(1),
    policyWindowEndsAt: z.string().min(1).optional(),
  }),
  playbook: z.object({
    kind: z.string().min(1),
    autoChaseBlocked: z.boolean(),
    steps: z.array(
      z.object({
        code: z.string().min(1),
        title: z.string().min(1),
        ownerRole: z.enum(["ar_collector", "ar_manager", "controller", "admin"]),
        instructions: z.string().min(1),
      }),
    ),
  }),
  recommendedNextAction: z.object({
    code: z.string().min(1),
    title: z.string().min(1),
    ownerRole: z.enum(["ar_collector", "ar_manager", "controller", "admin"]),
    instructions: z.string().min(1),
  }),
  workflowBlockers: z.array(
    z.object({
      workflow: z.enum([
        "collection_cadence",
        "auto_cash_application",
        "auto_statement_resend",
        "erp_writeback",
      ]),
      reason: z.string().min(1),
      releaseMode: z.enum(["manual_resolution", "policy_window_if_no_evidence"]),
    }),
  ),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const sourceReferenceSchema = z.object({
  objectType: z.string().min(1),
  objectId: z.string().min(1),
});

const ingestionSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["erp_accounting", "spreadsheet_fallback", "document_extracted"]),
  occurredAt: z.string().min(1),
  hierarchy: z.object({
    parentAccount: parentAccountSchema.optional(),
    billingAccount: billingAccountSchema.optional(),
    branch: branchSchema.optional(),
  }),
  legalEntityName: z.string().min(1).optional(),
  billingAccountName: z.string().min(1).optional(),
  taxId: z.string().min(1).optional(),
  contacts: z.array(contactInputSchema),
  invoices: z.array(invoiceSchema).optional(),
  payments: z.array(paymentSchema).optional(),
  remittances: z.array(remittanceSchema).optional(),
  exceptions: z.array(exceptionSchema).optional(),
  sourceReferences: z.array(sourceReferenceSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const mergeSuggestionParamsSchema = z.object({
  suggestionId: z.string().min(1),
});

const profileParamsSchema = z.object({
  profileId: z.string().min(1),
});

const resolvePrimaryContactSchema = z.object({
  selectedContactId: z.string().min(1),
  auditContext: auditContextSchema,
});

const taskQuerySchema = z.object({
  executionType: z.enum(["ai", "human"]).optional(),
  status: z.enum(["open", "in_progress", "completed", "cancelled"]).optional(),
});

const firstClassTaskQuerySchema = z.object({
  status: z.enum(["open", "completed", "closed", "dismissed", "deleted"]).optional(),
  origin: z.enum(["ai_generated", "system_generated", "workflow_generated", "manual"]).optional(),
  surface: z.enum(["home", "customers", "collections", "cash_app", "deductions", "org_credit_line"]).optional(),
});

const buyerTaxProfileSchema = z.object({
  isTopWithholdingAgent: z.boolean().optional(),
  withholdingDefaultType: z.enum(["none", "goods", "services", "mixed", "special_goods"]),
  defaultWithholdingRateBps: z.number().int().nonnegative().optional(),
  requires2307ForClosure: z.boolean().default(false),
  historicalWithholdingBehaviorScore: z.number().min(0).max(1).optional(),
  notes: z.string().min(1).optional(),
});

let store = new InMemoryCustomerProfileMasteringStore();
let auditLogger = new InMemoryAuditLogger();
let service = new CustomerProfileMasteringService({ store, auditLogger });

export async function ingestCustomerProfilePayload(input: {
  principal?: Principal;
  auditContext?: z.infer<typeof auditContextSchema>;
  payload: CustomerProfileIngestionPayload;
}) {
  const principal = input.principal ?? {
    id: "integration_customer_profile_sync",
    roles: ["ar_manager" satisfies Role],
  };
  const auditContext = input.auditContext ?? {
    actorId: principal.id,
    actorType: "automation" as const,
    correlationId: `customer-profile-${input.payload.id}`,
    occurredAt: input.payload.occurredAt,
  };

  return service.ingest(principal, auditContext, input.payload);
}

export function resetCustomerProfileMasteringStateForTests() {
  store = new InMemoryCustomerProfileMasteringStore();
  auditLogger = new InMemoryAuditLogger();
  service = new CustomerProfileMasteringService({ store, auditLogger });
}

export const registerCustomerProfileRoutes = (app: FastifyInstance): void => {
  app.get("/v1/customer_profiles", async () => ({
    module: "customer_profiles",
    status: "implemented",
    capabilities: [
      "customer profile aggregate",
      "customer/contact ingestion",
      "duplicate review queue",
      "contact survivorship",
      "profile tasks",
      "unified profile view",
    ],
  }));

  app.post("/v1/customer_profiles/ingestions", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      const body = ingestionSchema.parse(request.body);
      const auditContext = auditContextSchema.parse(request.headers["x-audit-context"]
        ? JSON.parse(String(request.headers["x-audit-context"]))
        : {
            actorId: principal.id,
            actorType: "user",
            correlationId: `customer-profile-${body.id}`,
            occurredAt: body.occurredAt,
          });

      const result = await service.ingest(principal, auditContext, normalizeIngestion(body));
      return reply.status(201).send(result);
    } catch (error) {
      return replyFromCustomerProfileError(reply, error);
    }
  });

  app.get("/v1/customer_profiles/review-queue", async () => {
    return { items: service.listReviewQueue() };
  });

  app.get("/v1/customer_profiles/index", async () => {
    return { items: service.listCustomerIndex() };
  });

  app.post("/v1/customer_profiles/merge-suggestions/:suggestionId/approve", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      assertAnyRole(principal, ["ar_manager", "controller", "admin"], {
        action: "customer_profiles.approve_merge_suggestion",
      });
      const params = mergeSuggestionParamsSchema.parse(request.params);
      const auditContext = buildAuditContext(request, principal, `merge-approve-${params.suggestionId}`);
      const result = await service.approveMergeSuggestion(principal, auditContext, params.suggestionId);
      return reply.send(result);
    } catch (error) {
      return replyFromCustomerProfileError(reply, error);
    }
  });

  app.post("/v1/customer_profiles/merge-suggestions/:suggestionId/reject", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      assertAnyRole(principal, ["ar_manager", "controller", "admin"], {
        action: "customer_profiles.reject_merge_suggestion",
      });
      const params = mergeSuggestionParamsSchema.parse(request.params);
      const auditContext = buildAuditContext(request, principal, `merge-reject-${params.suggestionId}`);
      const result = await service.rejectMergeSuggestion(principal, auditContext, params.suggestionId);
      return reply.send(result);
    } catch (error) {
      return replyFromCustomerProfileError(reply, error);
    }
  });

  app.post("/v1/customer_profiles/:profileId/primary-contact-conflicts/resolve", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      assertAnyRole(principal, ["ar_manager", "controller", "admin"], {
        action: "customer_profiles.resolve_primary_contact_conflict",
      });
      const params = profileParamsSchema.parse(request.params);
      const body = resolvePrimaryContactSchema.parse(request.body);
      const result = await service.resolvePrimaryContactConflict(
        principal,
        body.auditContext,
        params.profileId,
        body.selectedContactId,
      );
      return reply.send(result);
    } catch (error) {
      return replyFromCustomerProfileError(reply, error);
    }
  });

  app.get("/v1/customer_profiles/:profileId", async (request, reply) => {
    try {
      const params = profileParamsSchema.parse(request.params);
      return reply.send(service.getUnifiedProfile(params.profileId));
    } catch (error) {
      return replyFromCustomerProfileError(reply, error);
    }
  });

  app.get("/v1/customer_profiles/:profileId/buyer-tax-profile", async (request, reply) => {
    try {
      const params = profileParamsSchema.parse(request.params);
      const profile = await getBuyerTaxProfileStore().get(params.profileId);
      if (!profile) {
        return reply.status(404).send({ message: "Buyer tax profile was not found.", profileId: params.profileId });
      }
      return reply.send(profile);
    } catch (error) {
      return replyFromCustomerProfileError(reply, error);
    }
  });

  app.put("/v1/customer_profiles/:profileId/buyer-tax-profile", async (request, reply) => {
    try {
      const principal = parsePrincipal(request);
      assertAnyRole(principal, ["ar_manager", "controller", "admin"], {
        action: "customer_profiles.upsert_buyer_tax_profile",
      });
      const params = profileParamsSchema.parse(request.params);
      const body = buyerTaxProfileSchema.parse(request.body);
      const store = getBuyerTaxProfileStore();
      const existing = await store.get(params.profileId);
      const profile = await store.upsert({
        buyerTaxProfileId: existing?.buyerTaxProfileId ?? deterministicUuid(`buyer-tax-profile:${params.profileId}`),
        profileId: params.profileId,
        tenantId: "default",
        withholdingDefaultType: body.withholdingDefaultType,
        requires2307ForClosure: body.requires2307ForClosure,
        source: existing ? "mixed" : "supplier_set",
        ...(body.isTopWithholdingAgent !== undefined ? { isTopWithholdingAgent: body.isTopWithholdingAgent } : {}),
        ...(body.defaultWithholdingRateBps !== undefined
          ? { defaultWithholdingRateBps: body.defaultWithholdingRateBps }
          : {}),
        ...(body.historicalWithholdingBehaviorScore !== undefined
          ? { historicalWithholdingBehaviorScore: body.historicalWithholdingBehaviorScore }
          : existing?.historicalWithholdingBehaviorScore !== undefined
            ? { historicalWithholdingBehaviorScore: existing.historicalWithholdingBehaviorScore }
            : {}),
        ...(body.notes ? { notes: `supplier_set | ${body.notes}` } : existing?.notes ? { notes: existing.notes } : {}),
      });
      return reply.send(profile);
    } catch (error) {
      return replyFromCustomerProfileError(reply, error);
    }
  });

  app.get("/v1/customer_profiles/tasks", async (request, reply) => {
    try {
      const query = taskQuerySchema.parse(request.query);
      return reply.send({
        items: service.listTasks({
          ...(query.executionType ? { executionType: query.executionType } : {}),
          ...(query.status ? { status: query.status } : {}),
        }),
      });
    } catch (error) {
      return replyFromCustomerProfileError(reply, error);
    }
  });

  app.get("/v1/customer_profiles/:profileId/tasks", async (request, reply) => {
    try {
      const params = profileParamsSchema.parse(request.params);
      const query = firstClassTaskQuerySchema.parse(request.query);
      const taskService = await getTaskService();
      const workflowTasks = service
        .listTasks()
        .filter((task) => task.customerProfileId === params.profileId)
        .filter((task) => {
          if (query.status && task.status !== query.status) {
            return false;
          }
          return true;
        });
      const firstClassTasks = await taskService.listForCustomer(params.profileId, {
        ...(query.status ? { status: query.status } : {}),
        ...(query.origin ? { origin: query.origin } : {}),
        ...(query.surface ? { surface: query.surface } : {}),
      });
      const billingAccountTasks = await taskService.list({
        billingAccountId: params.profileId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.origin ? { origin: query.origin } : {}),
        ...(query.surface ? { surface: query.surface } : {}),
      });
      return reply.send({
        items: dedupeTasksById([...firstClassTasks, ...billingAccountTasks, ...workflowTasks]),
      });
    } catch (error) {
      return replyFromCustomerProfileError(reply, error);
    }
  });
};

function normalizeIngestion(body: z.infer<typeof ingestionSchema>): CustomerProfileIngestionPayload {
  const hierarchy = {
    ...(body.hierarchy.parentAccount
      ? {
          parentAccount: compactOptionalObject<
            NonNullable<CustomerProfileIngestionPayload["hierarchy"]["parentAccount"]>
          >({
            ...body.hierarchy.parentAccount,
            createdAt: body.hierarchy.parentAccount.createdAt ?? body.occurredAt,
            updatedAt: body.hierarchy.parentAccount.updatedAt ?? body.occurredAt,
            metadata: body.hierarchy.parentAccount.metadata ?? {},
          }),
        }
      : {}),
    ...(body.hierarchy.billingAccount
      ? {
          billingAccount: compactOptionalObject<
            NonNullable<CustomerProfileIngestionPayload["hierarchy"]["billingAccount"]>
          >({
            ...body.hierarchy.billingAccount,
            createdAt: body.hierarchy.billingAccount.createdAt ?? body.occurredAt,
            updatedAt: body.hierarchy.billingAccount.updatedAt ?? body.occurredAt,
            metadata: body.hierarchy.billingAccount.metadata ?? {},
          }),
        }
      : {}),
    ...(body.hierarchy.branch
      ? {
          branch: compactOptionalObject<
            NonNullable<CustomerProfileIngestionPayload["hierarchy"]["branch"]>
          >({
            ...body.hierarchy.branch,
            createdAt: body.hierarchy.branch.createdAt ?? body.occurredAt,
            updatedAt: body.hierarchy.branch.updatedAt ?? body.occurredAt,
            metadata: body.hierarchy.branch.metadata ?? {},
          }),
        }
      : {}),
  };

  const contacts = body.contacts.map((contact) =>
    compactOptionalObject<CustomerProfileIngestionPayload["contacts"][number]>({
      ...contact,
      ...(contact.metadata ? { metadata: contact.metadata } : {}),
    }),
  );

  const invoices = body.invoices?.map((invoice) =>
    compactOptionalObject<NonNullable<CustomerProfileIngestionPayload["invoices"]>[number]>({
      ...invoice,
      createdAt: invoice.createdAt ?? body.occurredAt,
      updatedAt: invoice.updatedAt ?? body.occurredAt,
      metadata: invoice.metadata ?? {},
    }),
  );

  const payments = body.payments?.map((payment) =>
    compactOptionalObject<NonNullable<CustomerProfileIngestionPayload["payments"]>[number]>({
      ...payment,
      createdAt: payment.createdAt ?? body.occurredAt,
      updatedAt: payment.updatedAt ?? body.occurredAt,
      metadata: payment.metadata ?? {},
    }),
  );

  const remittances = body.remittances?.map((remittance) =>
    compactOptionalObject<NonNullable<CustomerProfileIngestionPayload["remittances"]>[number]>({
      ...remittance,
      createdAt: remittance.createdAt ?? body.occurredAt,
      updatedAt: remittance.updatedAt ?? body.occurredAt,
      metadata: remittance.metadata ?? {},
    }),
  );

  const exceptions = body.exceptions?.map((exception) =>
    compactOptionalObject<NonNullable<CustomerProfileIngestionPayload["exceptions"]>[number]>({
      ...exception,
      createdAt: exception.createdAt ?? body.occurredAt,
      updatedAt: exception.updatedAt ?? body.occurredAt,
      metadata: exception.metadata ?? {},
    }),
  );

  return {
    id: body.id,
    source: body.source,
    occurredAt: body.occurredAt,
    hierarchy,
    ...(body.legalEntityName ? { legalEntityName: body.legalEntityName } : {}),
    ...(body.billingAccountName ? { billingAccountName: body.billingAccountName } : {}),
    ...(body.taxId ? { taxId: body.taxId } : {}),
    contacts,
    ...(invoices ? { invoices } : {}),
    ...(payments ? { payments } : {}),
    ...(remittances ? { remittances } : {}),
    ...(exceptions ? { exceptions } : {}),
    ...(body.sourceReferences ? { sourceReferences: body.sourceReferences } : {}),
    ...(body.metadata ? { metadata: body.metadata } : {}),
  };
}

function dedupeTasksById<T extends { id: string }>(tasks: T[]): T[] {
  const byId = new Map<string, T>();
  for (const task of tasks) {
    byId.set(task.id, task);
  }
  return [...byId.values()];
}

function parsePrincipal(request: FastifyRequest): Principal {
  const principalId = request.headers["x-principal-id"];
  const principalRoles = request.headers["x-principal-roles"];
  const id =
    typeof principalId === "string" && principalId.trim().length > 0
      ? principalId
      : "customer_profile_api";
  return {
    id,
    roles: parseRoles(principalRoles),
  };
}

function parseRoles(header: string | string[] | undefined): Role[] {
  const rawValue =
    typeof header === "string" ? header : Array.isArray(header) ? header.join(",") : "";
  const roles = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is Role =>
      value === "ar_collector" ||
      value === "ar_manager" ||
      value === "controller" ||
      value === "admin",
    );
  return roles.length > 0 ? roles : ["ar_manager"];
}

function buildAuditContext(request: FastifyRequest, principal: Principal, correlationId: string) {
  return {
    actorId: principal.id,
    actorType: "user" as const,
    correlationId,
    occurredAt:
      typeof request.headers["x-occurred-at"] === "string"
        ? request.headers["x-occurred-at"]
        : new Date().toISOString(),
  };
}

function replyFromCustomerProfileError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthorizationError) {
    return reply.status(403).send({ message: error.message, details: error.details });
  }
  if (error instanceof z.ZodError) {
    return reply.status(400).send({
      message: "Invalid customer profile request.",
      issues: error.issues,
    });
  }
  if (error instanceof Error && /was not found|No primary contact conflict/.test(error.message)) {
    return reply.status(404).send({ message: error.message });
  }
  if (error instanceof Error) {
    return reply.status(409).send({ message: error.message });
  }
  throw error;
}

function compactOptionalObject<T>(value: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function deterministicUuid(seed: string) {
  const hash = createHash("sha1").update(seed).digest("hex").slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
