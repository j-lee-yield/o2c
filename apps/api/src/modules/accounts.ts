import { createHash } from "node:crypto";
import { loadEnv } from "@o2c/config";
import {
  createDatabaseClientConfig,
  executeSqlCommand,
  isDatabaseAvailable,
  jsonLiteral,
  queryJsonRows,
  quoteLiteral,
} from "@o2c/database";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  type ImportedAccountRecord,
  parseAccountImportFile,
} from "./account-import-file-parser.js";

const auditContextSchema = z.object({
  actorId: z.string().min(1),
  actorType: z.enum(["user", "system", "automation"]),
  correlationId: z.string().min(1),
  occurredAt: z.string().min(1),
});

const importContactSchema = z.object({
  externalId: z.string().min(1).optional(),
  fullName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(1).optional(),
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
  scope: z.enum(["parent_account", "billing_account", "branch"]),
  isPrimary: z.boolean().optional(),
  isVerified: z.boolean().optional(),
  allowAutoSend: z.boolean().optional(),
  recentSuccessfulResponses: z.number().int().nonnegative().optional(),
});

const importBranchSchema = z.object({
  externalId: z.string().min(1).optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  region: z.string().min(1).optional(),
  countryCode: z.string().min(1).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

const importBillingAccountSchema = z.object({
  externalId: z.string().min(1).optional(),
  accountNumber: z.string().min(1),
  displayName: z.string().min(1),
  currency: z.string().min(1).optional(),
  accountTier: z.enum(["standard", "strategic"]).optional(),
  erpCustomerId: z.string().min(1).optional(),
  centrallyPaid: z.boolean().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

const importParentAccountSchema = z.object({
  externalId: z.string().min(1).optional(),
  name: z.string().min(1),
  externalReference: z.string().min(1).optional(),
  centrallyServiced: z.boolean().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

const importedAccountRecordSchema = z.object({
  parentAccount: importParentAccountSchema,
  billingAccount: importBillingAccountSchema,
  branch: importBranchSchema.optional(),
  contact: importContactSchema.optional(),
});

const accountImportSchema = z.object({
  records: z.array(importedAccountRecordSchema).min(1),
  auditContext: auditContextSchema.optional(),
});

const fileHeadersSchema = z.object({
  "x-file-name": z.string().min(1),
  "x-upload-id": z.string().min(1).optional(),
});

type ImportedAccountEntityRecord = {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  status: "active" | "inactive";
  metadata: Record<string, unknown>;
};

type ImportedParentAccount = ImportedAccountEntityRecord & {
  name: string;
  externalReference?: string;
  centrallyServiced?: boolean;
};

type ImportedBillingAccount = ImportedAccountEntityRecord & {
  parentAccountId: string;
  branchId?: string;
  accountNumber: string;
  displayName: string;
  currency: string;
  accountTier: "standard" | "strategic";
  erpCustomerId?: string;
  centrallyPaid: boolean;
};

type ImportedBranch = ImportedAccountEntityRecord & {
  parentAccountId: string;
  billingAccountId: string;
  code: string;
  name: string;
  region?: string;
  countryCode?: string;
};

type ImportedContact = ImportedAccountEntityRecord & {
  parentAccountId: string;
  billingAccountId?: string;
  branchId?: string;
  invoiceId?: string;
  scope: "parent_account" | "billing_account" | "branch";
  scopeId: string;
  fullName: string;
  email?: string;
  phone?: string;
  role:
    | "customer"
    | "collector"
    | "approver"
    | "internal"
    | "ap"
    | "shared_finance"
    | "treasury"
    | "branch"
    | "invoice";
  isPrimary: boolean;
  isVerified: boolean;
  allowAutoSend: boolean;
  recentSuccessfulResponses: number;
};

type AccountImportPersistResult = {
  parentAccounts: ImportedParentAccount[];
  billingAccounts: ImportedBillingAccount[];
  branches: ImportedBranch[];
  contacts: ImportedContact[];
  insertedCounts: {
    parentAccounts: number;
    billingAccounts: number;
    branches: number;
    contacts: number;
  };
};

type ImportedAccountListItem = {
  billingAccountId: string;
  parentAccountId: string;
  parentAccountName: string;
  parentAccountExternalReference?: string;
  billingAccountNumber: string;
  billingAccountName: string;
  currency: string;
  accountTier: "standard" | "strategic";
  centrallyPaid: boolean;
  branchId?: string;
  branchCode?: string;
  branchName?: string;
  contactCount: number;
  primaryContactEmail?: string;
  status: "active" | "inactive";
};

interface AccountImportStore {
  importRecords(params: {
    tenantId: string;
    records: ImportedAccountRecord[];
    auditContext: z.infer<typeof auditContextSchema>;
  }): Promise<AccountImportPersistResult>;
  listAccounts(tenantId: string): Promise<ImportedAccountListItem[]>;
}

class InMemoryAccountImportStore implements AccountImportStore {
  private readonly parentAccounts = new Map<string, ImportedParentAccount>();
  private readonly billingAccounts = new Map<string, ImportedBillingAccount>();
  private readonly branches = new Map<string, ImportedBranch>();
  private readonly contacts = new Map<string, ImportedContact>();

  async importRecords(params: {
    tenantId: string;
    records: ImportedAccountRecord[];
    auditContext: z.infer<typeof auditContextSchema>;
  }): Promise<AccountImportPersistResult> {
    const parentAccounts: ImportedParentAccount[] = [];
    const billingAccounts: ImportedBillingAccount[] = [];
    const branches: ImportedBranch[] = [];
    const contacts: ImportedContact[] = [];

    for (const record of params.records) {
      const persisted = materializeImportedAccountRecord(params.tenantId, record, params.auditContext.occurredAt);
      this.parentAccounts.set(persisted.parentAccount.id, persisted.parentAccount);
      this.billingAccounts.set(persisted.billingAccount.id, persisted.billingAccount);
      if (persisted.branch) {
        this.branches.set(persisted.branch.id, persisted.branch);
      }
      if (persisted.contact) {
        this.contacts.set(persisted.contact.id, persisted.contact);
      }
      parentAccounts.push(persisted.parentAccount);
      billingAccounts.push(persisted.billingAccount);
      if (persisted.branch) {
        branches.push(persisted.branch);
      }
      if (persisted.contact) {
        contacts.push(persisted.contact);
      }
    }

    return {
      parentAccounts,
      billingAccounts,
      branches,
      contacts,
      insertedCounts: {
        parentAccounts: parentAccounts.length,
        billingAccounts: billingAccounts.length,
        branches: branches.length,
        contacts: contacts.length,
      },
    };
  }

  async listAccounts(): Promise<ImportedAccountListItem[]> {
    return [...this.billingAccounts.values()]
      .map((billingAccount) => {
        const parentAccount = this.parentAccounts.get(billingAccount.parentAccountId);
        const branch = billingAccount.branchId ? this.branches.get(billingAccount.branchId) : undefined;
        const contacts = [...this.contacts.values()].filter(
          (contact) =>
            contact.billingAccountId === billingAccount.id ||
            contact.parentAccountId === billingAccount.parentAccountId,
        );
        const primaryContact = contacts.find((contact) => contact.isPrimary && contact.email);

        return {
          billingAccountId: billingAccount.id,
          parentAccountId: billingAccount.parentAccountId,
          parentAccountName: parentAccount?.name ?? "Unknown parent account",
          ...(parentAccount?.externalReference
            ? { parentAccountExternalReference: parentAccount.externalReference }
            : {}),
          billingAccountNumber: billingAccount.accountNumber,
          billingAccountName: billingAccount.displayName,
          currency: billingAccount.currency,
          accountTier: billingAccount.accountTier,
          centrallyPaid: billingAccount.centrallyPaid,
          ...(branch ? { branchId: branch.id, branchCode: branch.code, branchName: branch.name } : {}),
          contactCount: contacts.length,
          ...(primaryContact?.email ? { primaryContactEmail: primaryContact.email } : {}),
          status: billingAccount.status,
        };
      })
      .sort((left, right) => left.billingAccountName.localeCompare(right.billingAccountName));
  }
}

class PostgresAccountImportStore implements AccountImportStore {
  constructor(private readonly databaseUrl: string) {}

  async importRecords(params: {
    tenantId: string;
    records: ImportedAccountRecord[];
    auditContext: z.infer<typeof auditContextSchema>;
  }): Promise<AccountImportPersistResult> {
    const parentAccounts: ImportedParentAccount[] = [];
    const billingAccounts: ImportedBillingAccount[] = [];
    const branches: ImportedBranch[] = [];
    const contacts: ImportedContact[] = [];

    for (const record of params.records) {
      const persisted = materializeImportedAccountRecord(params.tenantId, record, params.auditContext.occurredAt);

      executeSqlCommand(
        this.databaseUrl,
        `
          INSERT INTO parent_account (
            id, tenant_id, version, created_at, updated_at, deleted_at,
            created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
            name, external_reference, status, centrally_serviced, metadata
          ) VALUES (
            '${quoteLiteral(persisted.parentAccount.id)}'::uuid,
            '${quoteLiteral(persisted.parentAccount.tenantId)}',
            ${persisted.parentAccount.version},
            '${quoteLiteral(persisted.parentAccount.createdAt)}'::timestamptz,
            '${quoteLiteral(persisted.parentAccount.updatedAt)}'::timestamptz,
            NULL,
            ${nullableText(params.auditContext.actorId)},
            ${nullableText(params.auditContext.actorType)},
            ${nullableText(params.auditContext.actorId)},
            ${nullableText(params.auditContext.actorType)},
            '${quoteLiteral(persisted.parentAccount.name)}',
            ${nullableText(persisted.parentAccount.externalReference)},
            '${quoteLiteral(persisted.parentAccount.status)}',
            ${nullableBoolean(persisted.parentAccount.centrallyServiced)},
            '${jsonLiteral(persisted.parentAccount.metadata)}'::jsonb
          )
          ON CONFLICT (id)
          DO UPDATE SET
            version = parent_account.version + 1,
            updated_at = EXCLUDED.updated_at,
            updated_by_actor_id = EXCLUDED.updated_by_actor_id,
            updated_by_actor_role = EXCLUDED.updated_by_actor_role,
            name = EXCLUDED.name,
            external_reference = COALESCE(EXCLUDED.external_reference, parent_account.external_reference),
            status = EXCLUDED.status,
            centrally_serviced = COALESCE(EXCLUDED.centrally_serviced, parent_account.centrally_serviced),
            metadata = parent_account.metadata || EXCLUDED.metadata;
        `,
      );

      executeSqlCommand(
        this.databaseUrl,
        `
          INSERT INTO billing_account (
            id, tenant_id, version, created_at, updated_at, deleted_at,
            created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
            parent_account_id, branch_id, account_number, display_name, currency, account_tier,
            erp_customer_id, status, centrally_paid, metadata
          ) VALUES (
            '${quoteLiteral(persisted.billingAccount.id)}'::uuid,
            '${quoteLiteral(persisted.billingAccount.tenantId)}',
            ${persisted.billingAccount.version},
            '${quoteLiteral(persisted.billingAccount.createdAt)}'::timestamptz,
            '${quoteLiteral(persisted.billingAccount.updatedAt)}'::timestamptz,
            NULL,
            ${nullableText(params.auditContext.actorId)},
            ${nullableText(params.auditContext.actorType)},
            ${nullableText(params.auditContext.actorId)},
            ${nullableText(params.auditContext.actorType)},
            '${quoteLiteral(persisted.billingAccount.parentAccountId)}'::uuid,
            ${nullableUuid(persisted.billingAccount.branchId)},
            '${quoteLiteral(persisted.billingAccount.accountNumber)}',
            '${quoteLiteral(persisted.billingAccount.displayName)}',
            '${quoteLiteral(persisted.billingAccount.currency)}',
            '${quoteLiteral(persisted.billingAccount.accountTier)}',
            ${nullableText(persisted.billingAccount.erpCustomerId)},
            '${quoteLiteral(persisted.billingAccount.status)}',
            ${persisted.billingAccount.centrallyPaid ? "TRUE" : "FALSE"},
            '${jsonLiteral(persisted.billingAccount.metadata)}'::jsonb
          )
          ON CONFLICT (id)
          DO UPDATE SET
            version = billing_account.version + 1,
            updated_at = EXCLUDED.updated_at,
            updated_by_actor_id = EXCLUDED.updated_by_actor_id,
            updated_by_actor_role = EXCLUDED.updated_by_actor_role,
            parent_account_id = EXCLUDED.parent_account_id,
            branch_id = COALESCE(EXCLUDED.branch_id, billing_account.branch_id),
            account_number = EXCLUDED.account_number,
            display_name = EXCLUDED.display_name,
            currency = EXCLUDED.currency,
            account_tier = EXCLUDED.account_tier,
            erp_customer_id = COALESCE(EXCLUDED.erp_customer_id, billing_account.erp_customer_id),
            status = EXCLUDED.status,
            centrally_paid = EXCLUDED.centrally_paid,
            metadata = billing_account.metadata || EXCLUDED.metadata;
        `,
      );

      if (persisted.branch) {
        executeSqlCommand(
          this.databaseUrl,
          `
            INSERT INTO branch (
              id, tenant_id, version, created_at, updated_at, deleted_at,
              created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
              parent_account_id, billing_account_id, code, name, region, country_code, status, metadata
            ) VALUES (
              '${quoteLiteral(persisted.branch.id)}'::uuid,
              '${quoteLiteral(persisted.branch.tenantId)}',
              ${persisted.branch.version},
              '${quoteLiteral(persisted.branch.createdAt)}'::timestamptz,
              '${quoteLiteral(persisted.branch.updatedAt)}'::timestamptz,
              NULL,
              ${nullableText(params.auditContext.actorId)},
              ${nullableText(params.auditContext.actorType)},
              ${nullableText(params.auditContext.actorId)},
              ${nullableText(params.auditContext.actorType)},
              '${quoteLiteral(persisted.branch.parentAccountId)}'::uuid,
              '${quoteLiteral(persisted.branch.billingAccountId)}'::uuid,
              '${quoteLiteral(persisted.branch.code)}',
              '${quoteLiteral(persisted.branch.name)}',
              ${nullableText(persisted.branch.region)},
              ${nullableText(persisted.branch.countryCode)},
              '${quoteLiteral(persisted.branch.status)}',
              '${jsonLiteral(persisted.branch.metadata)}'::jsonb
            )
            ON CONFLICT (id)
            DO UPDATE SET
              version = branch.version + 1,
              updated_at = EXCLUDED.updated_at,
              updated_by_actor_id = EXCLUDED.updated_by_actor_id,
              updated_by_actor_role = EXCLUDED.updated_by_actor_role,
              code = EXCLUDED.code,
              name = EXCLUDED.name,
              region = COALESCE(EXCLUDED.region, branch.region),
              country_code = COALESCE(EXCLUDED.country_code, branch.country_code),
              status = EXCLUDED.status,
              metadata = branch.metadata || EXCLUDED.metadata;
          `,
        );

        executeSqlCommand(
          this.databaseUrl,
          `
            UPDATE billing_account
            SET branch_id = '${quoteLiteral(persisted.branch.id)}'::uuid,
                updated_at = '${quoteLiteral(persisted.branch.updatedAt)}'::timestamptz
            WHERE id = '${quoteLiteral(persisted.billingAccount.id)}'::uuid;
          `,
        );
      }

      if (persisted.contact) {
        executeSqlCommand(
          this.databaseUrl,
          `
            INSERT INTO contact (
              id, tenant_id, version, created_at, updated_at, deleted_at,
              created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
              parent_account_id, billing_account_id, branch_id, invoice_id, scope, scope_id,
              full_name, email, phone, role, is_primary, is_verified, allow_auto_send,
              recent_successful_responses, metadata
            ) VALUES (
              '${quoteLiteral(persisted.contact.id)}'::uuid,
              '${quoteLiteral(persisted.contact.tenantId)}',
              ${persisted.contact.version},
              '${quoteLiteral(persisted.contact.createdAt)}'::timestamptz,
              '${quoteLiteral(persisted.contact.updatedAt)}'::timestamptz,
              NULL,
              ${nullableText(params.auditContext.actorId)},
              ${nullableText(params.auditContext.actorType)},
              ${nullableText(params.auditContext.actorId)},
              ${nullableText(params.auditContext.actorType)},
              '${quoteLiteral(persisted.contact.parentAccountId)}'::uuid,
              ${nullableUuid(persisted.contact.billingAccountId)},
              ${nullableUuid(persisted.contact.branchId)},
              NULL,
              '${quoteLiteral(persisted.contact.scope)}',
              '${quoteLiteral(persisted.contact.scopeId)}',
              '${quoteLiteral(persisted.contact.fullName)}',
              ${nullableText(persisted.contact.email)},
              ${nullableText(persisted.contact.phone)},
              '${quoteLiteral(persisted.contact.role)}',
              ${persisted.contact.isPrimary ? "TRUE" : "FALSE"},
              ${persisted.contact.isVerified ? "TRUE" : "FALSE"},
              ${persisted.contact.allowAutoSend ? "TRUE" : "FALSE"},
              ${persisted.contact.recentSuccessfulResponses},
              '${jsonLiteral(persisted.contact.metadata)}'::jsonb
            )
            ON CONFLICT (id)
            DO UPDATE SET
              version = contact.version + 1,
              updated_at = EXCLUDED.updated_at,
              updated_by_actor_id = EXCLUDED.updated_by_actor_id,
              updated_by_actor_role = EXCLUDED.updated_by_actor_role,
              parent_account_id = EXCLUDED.parent_account_id,
              billing_account_id = COALESCE(EXCLUDED.billing_account_id, contact.billing_account_id),
              branch_id = COALESCE(EXCLUDED.branch_id, contact.branch_id),
              scope = EXCLUDED.scope,
              scope_id = EXCLUDED.scope_id,
              full_name = EXCLUDED.full_name,
              email = COALESCE(EXCLUDED.email, contact.email),
              phone = COALESCE(EXCLUDED.phone, contact.phone),
              role = EXCLUDED.role,
              is_primary = EXCLUDED.is_primary,
              is_verified = EXCLUDED.is_verified,
              allow_auto_send = EXCLUDED.allow_auto_send,
              recent_successful_responses = EXCLUDED.recent_successful_responses,
              metadata = contact.metadata || EXCLUDED.metadata;
          `,
        );
      }

      parentAccounts.push(persisted.parentAccount);
      billingAccounts.push({
        ...persisted.billingAccount,
        ...(persisted.branch ? { branchId: persisted.branch.id } : {}),
      });
      if (persisted.branch) {
        branches.push(persisted.branch);
      }
      if (persisted.contact) {
        contacts.push(persisted.contact);
      }
    }

    return {
      parentAccounts,
      billingAccounts,
      branches,
      contacts,
      insertedCounts: {
        parentAccounts: parentAccounts.length,
        billingAccounts: billingAccounts.length,
        branches: branches.length,
        contacts: contacts.length,
      },
    };
  }

  async listAccounts(tenantId: string): Promise<ImportedAccountListItem[]> {
    return queryJsonRows<ImportedAccountListItem>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            billing_account.id::text AS "billingAccountId",
            parent_account.id::text AS "parentAccountId",
            parent_account.name AS "parentAccountName",
            parent_account.external_reference AS "parentAccountExternalReference",
            billing_account.account_number AS "billingAccountNumber",
            billing_account.display_name AS "billingAccountName",
            billing_account.currency,
            billing_account.account_tier AS "accountTier",
            billing_account.centrally_paid AS "centrallyPaid",
            branch.id::text AS "branchId",
            branch.code AS "branchCode",
            branch.name AS "branchName",
            COUNT(contact.id)::integer AS "contactCount",
            MAX(contact.email) FILTER (WHERE contact.is_primary) AS "primaryContactEmail",
            billing_account.status
          FROM billing_account
          INNER JOIN parent_account
            ON parent_account.id = billing_account.parent_account_id
           AND parent_account.deleted_at IS NULL
          LEFT JOIN branch
            ON branch.id = billing_account.branch_id
           AND branch.deleted_at IS NULL
          LEFT JOIN contact
            ON contact.billing_account_id = billing_account.id
           AND contact.deleted_at IS NULL
          WHERE billing_account.tenant_id = '${quoteLiteral(tenantId)}'
            AND billing_account.deleted_at IS NULL
          GROUP BY
            billing_account.id,
            parent_account.id,
            branch.id
          ORDER BY billing_account.display_name ASC
        ) q;
      `,
    );
  }
}

const inMemoryStore = new InMemoryAccountImportStore();

export const registerAccountRoutes = (app: FastifyInstance): void => {
  ensureCsvFileParsers(app);

  app.get("/v1/accounts", async () => ({
    module: "accounts",
    status: "implemented",
    capabilities: [
      "parent account import",
      "billing account import",
      "branch import",
      "contact import",
      "raw csv account upload",
      "durable account persistence when database is available",
    ],
    items: await createAccountStore().listAccounts(loadEnv().DEFAULT_TENANT_SLUG),
  }));

  app.post("/v1/accounts/imports", async (request, reply) => {
    const body = accountImportSchema.parse(request.body ?? {});
    const env = loadEnv();
    const auditContext = body.auditContext ?? {
      actorId: "account_import_endpoint",
      actorType: "automation" as const,
      correlationId: `account_import_${Date.now()}`,
      occurredAt: new Date().toISOString(),
    };

    const result = await createAccountStore().importRecords({
      tenantId: env.DEFAULT_TENANT_SLUG,
      records: body.records.map(normalizeImportedAccountRecord),
      auditContext,
    });

    return reply.status(201).send({
      provider: "spreadsheet_upload",
      persistenceMode: describePersistenceMode(),
      ...summarizeImportResult(result),
    });
  });

  app.post("/v1/accounts/imports/file", async (request, reply) => {
    const headers = fileHeadersSchema.parse(request.headers);
    const fileImport = parseAccountImportFile({
      fileName: headers["x-file-name"],
      buffer: readBinaryBody(request.body),
    });
    const env = loadEnv();
    const uploadId = headers["x-upload-id"] ?? `account_upload_${Date.now()}`;
    const auditContext = {
      actorId: "account_import_file_endpoint",
      actorType: "automation" as const,
      correlationId: `account_import_file_${uploadId}`,
      occurredAt: new Date().toISOString(),
    };
    const result = await createAccountStore().importRecords({
      tenantId: env.DEFAULT_TENANT_SLUG,
      records: fileImport.records,
      auditContext,
    });

    return reply.status(201).send({
      provider: "spreadsheet_upload",
      uploadId,
      fileName: headers["x-file-name"],
      sheetName: fileImport.sheetName,
      heldRows: fileImport.heldRows,
      persistenceMode: describePersistenceMode(),
      ...summarizeImportResult(result),
    });
  });
};

function createAccountStore(): AccountImportStore {
  const databaseUrl = createDatabaseClientConfig().connectionString;
  if (databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl)) {
    return new PostgresAccountImportStore(databaseUrl);
  }

  return inMemoryStore;
}

function describePersistenceMode() {
  const databaseUrl = createDatabaseClientConfig().connectionString;
  return databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl) ? "postgres" : "in_memory";
}

function normalizeImportedAccountRecord(record: z.infer<typeof importedAccountRecordSchema>): ImportedAccountRecord {
  return {
    parentAccount: {
      name: record.parentAccount.name,
      status: record.parentAccount.status ?? "active",
      ...(record.parentAccount.externalId ? { externalId: record.parentAccount.externalId } : {}),
      ...(record.parentAccount.externalReference
        ? { externalReference: record.parentAccount.externalReference }
        : {}),
      ...(record.parentAccount.centrallyServiced !== undefined
        ? { centrallyServiced: record.parentAccount.centrallyServiced }
        : {}),
    },
    billingAccount: {
      accountNumber: record.billingAccount.accountNumber,
      displayName: record.billingAccount.displayName,
      currency: record.billingAccount.currency ?? "PHP",
      accountTier: record.billingAccount.accountTier ?? "standard",
      centrallyPaid: record.billingAccount.centrallyPaid ?? false,
      status: record.billingAccount.status ?? "active",
      ...(record.billingAccount.externalId ? { externalId: record.billingAccount.externalId } : {}),
      ...(record.billingAccount.erpCustomerId ? { erpCustomerId: record.billingAccount.erpCustomerId } : {}),
    },
    ...(record.branch
      ? {
          branch: {
            code: record.branch.code,
            name: record.branch.name,
            status: record.branch.status ?? "active",
            ...(record.branch.externalId ? { externalId: record.branch.externalId } : {}),
            ...(record.branch.region ? { region: record.branch.region } : {}),
            ...(record.branch.countryCode ? { countryCode: record.branch.countryCode } : {}),
          },
        }
      : {}),
    ...(record.contact
      ? {
          contact: {
            fullName: record.contact.fullName,
            role: record.contact.role,
            scope: record.contact.scope,
            isPrimary: record.contact.isPrimary ?? false,
            isVerified: record.contact.isVerified ?? false,
            allowAutoSend: record.contact.allowAutoSend ?? false,
            recentSuccessfulResponses: record.contact.recentSuccessfulResponses ?? 0,
            ...(record.contact.externalId ? { externalId: record.contact.externalId } : {}),
            ...(record.contact.email ? { email: record.contact.email } : {}),
            ...(record.contact.phone ? { phone: record.contact.phone } : {}),
          },
        }
      : {}),
  };
}

function materializeImportedAccountRecord(
  tenantId: string,
  record: ImportedAccountRecord,
  occurredAt: string,
): {
  parentAccount: ImportedParentAccount;
  billingAccount: ImportedBillingAccount;
  branch?: ImportedBranch;
  contact?: ImportedContact;
} {
  const parentAccountId = coerceIdentifierToUuid(
    record.parentAccount.externalId ??
      `${tenantId}:parent:${record.parentAccount.externalReference ?? record.parentAccount.name}`,
  );
  const branchId = record.branch
    ? coerceIdentifierToUuid(
        record.branch.externalId ??
          `${tenantId}:branch:${record.billingAccount.accountNumber}:${record.branch.code}:${record.branch.name}`,
      )
    : undefined;
  const billingAccountId = coerceIdentifierToUuid(
    record.billingAccount.externalId ??
      `${tenantId}:billing:${parentAccountId}:${record.billingAccount.accountNumber}`,
  );
  const parentAccount: ImportedParentAccount = {
    id: parentAccountId,
    tenantId,
    version: 1,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    name: record.parentAccount.name,
    status: record.parentAccount.status,
    metadata: {
      source: "account_import",
      ...(record.parentAccount.externalId ? { externalId: record.parentAccount.externalId } : {}),
    },
    ...(record.parentAccount.externalReference
      ? { externalReference: record.parentAccount.externalReference }
      : {}),
    ...(record.parentAccount.centrallyServiced !== undefined
      ? { centrallyServiced: record.parentAccount.centrallyServiced }
      : {}),
  };

  const billingAccount: ImportedBillingAccount = {
    id: billingAccountId,
    tenantId,
    version: 1,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    parentAccountId,
    accountNumber: record.billingAccount.accountNumber,
    displayName: record.billingAccount.displayName,
    currency: record.billingAccount.currency,
    accountTier: record.billingAccount.accountTier,
    centrallyPaid: record.billingAccount.centrallyPaid,
    status: record.billingAccount.status,
    metadata: {
      source: "account_import",
      ...(record.billingAccount.externalId ? { externalId: record.billingAccount.externalId } : {}),
    },
    ...(branchId ? { branchId } : {}),
    ...(record.billingAccount.erpCustomerId ? { erpCustomerId: record.billingAccount.erpCustomerId } : {}),
  };

  const branch: ImportedBranch | undefined = record.branch
    ? {
        id: branchId!,
        tenantId,
        version: 1,
        createdAt: occurredAt,
        updatedAt: occurredAt,
        parentAccountId,
        billingAccountId,
        code: record.branch.code,
        name: record.branch.name,
        status: record.branch.status,
        metadata: {
          source: "account_import",
          ...(record.branch.externalId ? { externalId: record.branch.externalId } : {}),
        },
        ...(record.branch.region ? { region: record.branch.region } : {}),
        ...(record.branch.countryCode ? { countryCode: record.branch.countryCode } : {}),
      }
    : undefined;

  const contact: ImportedContact | undefined = record.contact
    ? (() => {
        const scopeId =
          record.contact.scope === "branch" && branch
            ? branch.id
            : record.contact.scope === "parent_account"
              ? parentAccountId
              : billingAccountId;

        return compactOptionalObject<ImportedContact>({
          id: coerceIdentifierToUuid(
            record.contact.externalId ??
              `${tenantId}:contact:${billingAccountId}:${record.contact.scope}:${record.contact.email ?? record.contact.phone ?? record.contact.fullName}`,
          ),
          tenantId,
          version: 1,
          createdAt: occurredAt,
          updatedAt: occurredAt,
          parentAccountId,
          scope: record.contact.scope,
          scopeId,
          fullName: record.contact.fullName,
          role: record.contact.role,
          isPrimary: record.contact.isPrimary,
          isVerified: record.contact.isVerified,
          allowAutoSend: record.contact.allowAutoSend,
          recentSuccessfulResponses: record.contact.recentSuccessfulResponses,
          metadata: {
            source: "account_import",
            ...(record.contact.externalId ? { externalId: record.contact.externalId } : {}),
          },
          ...(record.contact.email ? { email: record.contact.email } : {}),
          ...(record.contact.phone ? { phone: record.contact.phone } : {}),
          ...(record.contact.scope !== "parent_account" ? { billingAccountId } : {}),
          ...(record.contact.scope === "branch" && branch ? { branchId: branch.id } : {}),
        });
      })()
    : undefined;

  return {
    parentAccount,
    billingAccount,
    ...(branch ? { branch } : {}),
    ...(contact ? { contact } : {}),
  };
}

function summarizeImportResult(result: AccountImportPersistResult) {
  return {
    importedParentAccountCount: result.insertedCounts.parentAccounts,
    importedBillingAccountCount: result.insertedCounts.billingAccounts,
    importedBranchCount: result.insertedCounts.branches,
    importedContactCount: result.insertedCounts.contacts,
    parentAccounts: dedupeById(result.parentAccounts).slice(0, 25),
    billingAccounts: dedupeById(result.billingAccounts).slice(0, 25),
    branches: dedupeById(result.branches).slice(0, 25),
    contacts: dedupeById(result.contacts).slice(0, 25),
  };
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function ensureCsvFileParsers(app: FastifyInstance) {
  for (const contentType of ["text/csv", "application/csv", "application/octet-stream"]) {
    if (app.hasContentTypeParser(contentType)) {
      continue;
    }

    app.addContentTypeParser(contentType, { parseAs: "buffer" }, (_request, body, done) => {
      done(null, body);
    });
  }
}

function readBinaryBody(body: unknown) {
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (typeof body === "string") {
    return Buffer.from(body, "utf8");
  }
  throw new Error("Account file upload requires a binary request body.");
}

function coerceIdentifierToUuid(value: string) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return value.toLowerCase();
  }

  const hash = createHash("sha1").update(value).digest("hex").slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function nullableText(value?: string) {
  return value ? `'${quoteLiteral(value)}'` : "NULL";
}

function nullableUuid(value?: string) {
  return value ? `'${quoteLiteral(value)}'::uuid` : "NULL";
}

function nullableBoolean(value?: boolean) {
  if (typeof value !== "boolean") {
    return "NULL";
  }

  return value ? "TRUE" : "FALSE";
}

function compactOptionalObject<T>(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
