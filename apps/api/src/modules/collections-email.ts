import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import { createDatabaseClientConfig, isDatabaseAvailable, PostgresImmutableActivityLogStore, queryJsonRows } from "@o2c/database";
import type { BillingAccount, Contact, Invoice } from "@o2c/domain";
import { CollectionsWorkflowEngine } from "@o2c/workflows";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const roleSchema = z.enum(["ar_collector", "ar_manager", "controller", "admin"]);

const principalSchema = z.object({
  id: z.string(),
  roles: z.array(roleSchema),
});

const sendWindowSchema = z.object({
  timezone: z.string(),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
  allowedWeekdays: z.array(z.number().int().min(1).max(7)),
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
  metadata: z.record(z.string(), z.unknown()),
});

const previewSchema = z.object({
  principal: principalSchema,
  account: accountSchema,
  invoices: z.array(invoiceSchema).min(1),
  contact: contactSchema.optional(),
  scope: z.enum(["account", "invoice"]).optional(),
  sendWindow: sendWindowSchema.optional(),
});

const referencePreviewSchema = z.object({
  principal: principalSchema,
  accountId: z.string().min(1),
  invoiceIds: z.array(z.string().min(1)).min(1),
  contactId: z.string().min(1).optional(),
  scope: z.enum(["account", "invoice"]).optional(),
  sendWindow: sendWindowSchema.optional(),
});

const databaseUrl = createDatabaseClientConfig().connectionString;
const previewRequestSchema = z.union([previewSchema, referencePreviewSchema]);

export const registerCollectionsEmailRoutes = (app: FastifyInstance): void => {
  app.post("/v1/collections/email-preview", async (request, reply) => {
    const parsedBody = previewRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        message: "Invalid collections email preview request.",
        issues: parsedBody.error.issues,
      });
    }

    const input = await resolvePreviewInput(parsedBody.data);
    if ("error" in input) {
      return reply.status(input.statusCode).send({ message: input.error });
    }

    const { principal, account, invoices, contact, scope, sendWindow } = input;
    const engine = getCollectionsEngine();
    const result = engine.planReminder({
      principal,
      account,
      invoices,
      ...(contact ? { contact } : {}),
      ...(scope ? { scope } : {}),
      ...(sendWindow ? { sendWindow } : {}),
    });
    return reply.send(result);
  });
};

function getCollectionsEngine(): CollectionsWorkflowEngine {
  const databaseBacked = databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl);

  return new CollectionsWorkflowEngine({
    activityStore: databaseBacked
      ? new PostgresImmutableActivityLogStore(databaseUrl)
      : new InMemoryImmutableActivityLogStore(),
  });
}

async function resolvePreviewInput(
  input: z.infer<typeof previewRequestSchema>,
): Promise<
  | {
      principal: z.infer<typeof principalSchema>;
      account: BillingAccount;
      invoices: Invoice[];
      contact?: Contact;
      scope?: "account" | "invoice";
      sendWindow?: z.infer<typeof sendWindowSchema>;
    }
  | { statusCode: 422; error: string }
> {
  if ("account" in input) {
    return {
      principal: input.principal,
      account: toBillingAccount(input.account),
      invoices: input.invoices.map(toInvoice),
      ...(input.contact ? { contact: toContact(input.contact) } : {}),
      ...(input.scope ? { scope: input.scope } : {}),
      ...(input.sendWindow ? { sendWindow: input.sendWindow } : {}),
    };
  }

  const databaseBacked = databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl);
  if (!databaseBacked) {
    return {
      statusCode: 422,
      error: "Collections reference preview requires a live database connection.",
    };
  }

  const account = loadBillingAccount(input.accountId);
  if (!account) {
    return {
      statusCode: 422,
      error: `Billing account ${input.accountId} was not found.`,
    };
  }

  const invoices = loadInvoices(input.invoiceIds);
  if (invoices.length !== input.invoiceIds.length) {
    return {
      statusCode: 422,
      error: "One or more invoices could not be resolved for collections preview.",
    };
  }

  const contact = input.contactId ? loadContact(input.contactId) : undefined;
  if (input.contactId && !contact) {
    return {
      statusCode: 422,
      error: `Contact ${input.contactId} was not found.`,
    };
  }

  return {
    principal: input.principal,
    account,
    invoices,
    ...(contact ? { contact } : {}),
    ...(input.scope ? { scope: input.scope } : {}),
    ...(input.sendWindow ? { sendWindow: input.sendWindow } : {}),
  };
}

type BillingAccountRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  parentAccountId: string;
  branchId?: string;
  accountNumber: string;
  displayName: string;
  currency: string;
  accountTier: "standard" | "strategic";
  erpCustomerId?: string;
  status: "active" | "inactive";
  centrallyPaid: boolean;
  metadata: Record<string, unknown>;
};

type ContactRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  parentAccountId: string;
  billingAccountId?: string;
  branchId?: string;
  invoiceId?: string;
  scope: "parent_account" | "billing_account" | "branch" | "invoice";
  scopeId: string;
  fullName: string;
  email?: string;
  phone?: string;
  role: z.infer<typeof contactSchema>["role"];
  isPrimary: boolean;
  isVerified: boolean;
  allowAutoSend: boolean;
  recentSuccessfulResponses: number;
  metadata: Record<string, unknown>;
};

type InvoiceRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  state: z.infer<typeof invoiceSchema>["state"];
  parentAccountId: string;
  billingAccountId: string;
  branchId?: string;
  invoiceContactId?: string;
  uploadedDocumentId?: string;
  invoiceDate?: string;
  invoiceNumber: string;
  currency: string;
  amountCents: number;
  provisionalSource?: "bir_upload";
  dueDate?: string;
  metadata: Record<string, unknown>;
};

function loadBillingAccount(accountId: string): BillingAccount | undefined {
  const [row] = queryJsonRows<BillingAccountRow>(
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
          AND id = '${accountId.replace(/'/g, "''")}'::uuid
        LIMIT 1
      ) q
    `,
  );

  return row ? toBillingAccount(row) : undefined;
}

function loadContact(contactId: string): Contact | undefined {
  const [row] = queryJsonRows<ContactRow>(
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
          AND id = '${contactId.replace(/'/g, "''")}'::uuid
        LIMIT 1
      ) q
    `,
  );

  return row ? toContact(row) : undefined;
}

function loadInvoices(invoiceIds: string[]): Invoice[] {
  const quotedIds = invoiceIds.map((invoiceId) => `'${invoiceId.replace(/'/g, "''")}'::uuid`).join(", ");
  const rows = queryJsonRows<InvoiceRow>(
    databaseUrl,
    `
      SELECT row_to_json(q)
      FROM (
        SELECT
          id::text AS "id",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          state,
          parent_account_id::text AS "parentAccountId",
          billing_account_id::text AS "billingAccountId",
          branch_id::text AS "branchId",
          invoice_contact_id::text AS "invoiceContactId",
          uploaded_document_id::text AS "uploadedDocumentId",
          invoice_date AS "invoiceDate",
          invoice_number AS "invoiceNumber",
          currency,
          amount_cents::integer AS "amountCents",
          provisional_source AS "provisionalSource",
          due_date AS "dueDate",
          metadata
        FROM invoice
        WHERE deleted_at IS NULL
          AND id IN (${quotedIds})
      ) q
    `,
  );

  return rows.map(toInvoice);
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
    ...(input.provisionalSource ? { provisionalSource: input.provisionalSource } : {}),
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
  };
}
