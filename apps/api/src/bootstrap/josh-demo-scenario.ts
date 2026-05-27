import { createHash } from "node:crypto";
import { loadEnv } from "@o2c/config";
import {
  createDatabaseClientConfig,
  isDatabaseAvailable,
  queryJsonRows,
  quoteLiteral,
} from "@o2c/database";
import { createImportedInvoiceSyncService } from "./imported-invoice-sync-service.js";
import { createAccountStore, normalizeImportedAccountRecord } from "../modules/accounts.js";

function deterministicUuid(seed: string) {
  const hash = createHash("sha1").update(seed).digest("hex").slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
}

export const JOSH_DEMO_OCCURRED_AT = "2026-04-19T08:30:00.000Z";
export const JOSH_DEMO_DUE_AT = "2026-04-19T10:00:00.000Z";
export const JOSH_PARENT_ACCOUNT_ID = deterministicUuid("demo:josh:parent-account");
export const JOSH_BILLING_ACCOUNT_ID = "93e3318e-9b6b-57dc-aedc-e843a2d6491d";
export const JOSH_CONTACT_ID = "e55f2eab-239a-56e0-a311-26e13a4b8c66";
export const JOSH_CUSTOMER_PROFILE_ID = JOSH_BILLING_ACCOUNT_ID;
export const JOSH_PARENT_ACCOUNT_NAME = "Josh";
export const JOSH_BILLING_ACCOUNT_NAME = "Josh";
export const JOSH_ACCOUNT_NUMBER = "JOSH-BA-001";
export const JOSH_EMAIL = "joshua.l.lee94@gmail.com";
export const JOSH_INVOICE_EXTERNAL_IDS = [
  "josh-invoice-external-1001",
  "josh-invoice-external-1002",
  "josh-invoice-external-1003",
] as const;
export const JOSH_CANONICAL_INVOICE_IDS = [
  "41bd6f72-ad65-0179-4367-3d381b4098a5",
  "fcfead9a-295d-52d5-359b-6146971ac18d",
  "72dccaef-28ca-05a6-972d-1dc0a3138378",
] as const;
export const JOSH_SNAPSHOT_IDS = [
  "aa4731ab-0668-92c6-ff91-1cbadb880791",
  "e364bf63-b183-f50f-6cea-3fc06051cc3c",
  "bee8d9b6-cb7d-7208-68d0-cfaaa54a40c6",
] as const;

export const JOSH_DEMO_INVOICES = [
  {
    id: JOSH_CANONICAL_INVOICE_IDS[0],
    externalId: JOSH_INVOICE_EXTERNAL_IDS[0],
    snapshotId: JOSH_SNAPSHOT_IDS[0],
    invoiceNumber: "JOSH-INV-1001",
    amountCents: 125_000,
    invoiceDate: "2026-03-20",
    dueDate: "2026-04-02",
  },
  {
    id: JOSH_CANONICAL_INVOICE_IDS[1],
    externalId: JOSH_INVOICE_EXTERNAL_IDS[1],
    snapshotId: JOSH_SNAPSHOT_IDS[1],
    invoiceNumber: "JOSH-INV-1002",
    amountCents: 88_500,
    invoiceDate: "2026-03-25",
    dueDate: "2026-04-05",
  },
  {
    id: JOSH_CANONICAL_INVOICE_IDS[2],
    externalId: JOSH_INVOICE_EXTERNAL_IDS[2],
    snapshotId: JOSH_SNAPSHOT_IDS[2],
    invoiceNumber: "JOSH-INV-1003",
    amountCents: 191_250,
    invoiceDate: "2026-03-28",
    dueDate: "2026-04-08",
  },
] as const;

let seedPromise: Promise<void> | undefined;

export async function ensureJoshPersistentDemoScenarioSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = seedJoshPersistentDemoScenario();
  }

  await seedPromise;
}

async function seedJoshPersistentDemoScenario(): Promise<void> {
  const env = loadEnv();
  const databaseUrl = createDatabaseClientConfig().connectionString;
  if (!databaseUrl || !isDatabaseAvailable(databaseUrl)) {
    return;
  }

  if (hasPersistedJoshDemoScenario(databaseUrl, env.DEFAULT_TENANT_SLUG)) {
    return;
  }

  const accountStore = createAccountStore();
  const auditContext = {
    actorId: "josh_demo_seed",
    actorType: "automation" as const,
    correlationId: "josh_demo_seed_v1",
    occurredAt: JOSH_DEMO_OCCURRED_AT,
  };

  await accountStore.importRecords({
    tenantId: env.DEFAULT_TENANT_SLUG,
    records: [
      normalizeImportedAccountRecord({
        parentAccount: {
          externalId: JOSH_PARENT_ACCOUNT_ID,
          name: JOSH_PARENT_ACCOUNT_NAME,
          externalReference: "JOSH-PARENT-001",
          centrallyServiced: false,
          status: "active",
        },
        billingAccount: {
          externalId: JOSH_BILLING_ACCOUNT_ID,
          accountNumber: JOSH_ACCOUNT_NUMBER,
          displayName: JOSH_BILLING_ACCOUNT_NAME,
          currency: "PHP",
          accountTier: "standard",
          erpCustomerId: JOSH_ACCOUNT_NUMBER,
          centrallyPaid: false,
          status: "active",
        },
        contact: {
          externalId: JOSH_CONTACT_ID,
          fullName: "Josh",
          email: JOSH_EMAIL,
          role: "ap",
          scope: "billing_account",
          isPrimary: true,
          isVerified: true,
          allowAutoSend: true,
          recentSuccessfulResponses: 0,
        },
      }),
    ],
    auditContext,
  });

  const stableIds = JOSH_DEMO_INVOICES.flatMap((invoice) => [invoice.id, invoice.snapshotId]);
  let idCursor = 0;
  const syncService = createImportedInvoiceSyncService({
    now: () => JOSH_DEMO_OCCURRED_AT,
    idGenerator: () => {
      const nextId = stableIds[idCursor];
      idCursor += 1;
      return nextId ?? deterministicUuid(`demo:josh:fallback:${idCursor}`);
    },
  });

  await syncService.syncSpreadsheetInvoices({
    tenantId: env.DEFAULT_TENANT_SLUG,
    auditContext,
    invoices: JOSH_DEMO_INVOICES.map((invoice) => ({
      externalId: invoice.externalId,
      invoiceNumber: invoice.invoiceNumber,
      customerName: JOSH_BILLING_ACCOUNT_NAME,
      customerNumber: JOSH_ACCOUNT_NUMBER,
      contactName: "Josh",
      email: JOSH_EMAIL,
      currencyCode: "PHP",
      totalAmountCents: invoice.amountCents,
      remainingAmountCents: invoice.amountCents,
      dueDate: invoice.dueDate,
      invoiceDate: invoice.invoiceDate,
      status: "open",
      companyId: "yield-demo",
      companyName: "Yield",
      parentAccountName: JOSH_PARENT_ACCOUNT_NAME,
      parentAccountReference: "JOSH-PARENT-001",
    })),
  });
}

function hasPersistedJoshDemoScenario(databaseUrl: string, tenantId: string) {
  const [row] = queryJsonRows<{
    billingAccountPresent: boolean;
    contactPresent: boolean;
    invoiceCount: number;
  }>(
    databaseUrl,
    `
      SELECT row_to_json(q)
      FROM (
        SELECT
          EXISTS (
            SELECT 1
            FROM billing_account
            WHERE tenant_id = '${quoteLiteral(tenantId)}'
              AND deleted_at IS NULL
              AND account_number = '${quoteLiteral(JOSH_ACCOUNT_NUMBER)}'
          ) AS "billingAccountPresent",
          EXISTS (
            SELECT 1
            FROM contact
            WHERE tenant_id = '${quoteLiteral(tenantId)}'
              AND deleted_at IS NULL
              AND email = '${quoteLiteral(JOSH_EMAIL)}'
          ) AS "contactPresent",
          (
            SELECT COUNT(*)
            FROM invoice
            WHERE tenant_id = '${quoteLiteral(tenantId)}'
              AND deleted_at IS NULL
              AND invoice_number IN (
                ${JOSH_DEMO_INVOICES.map((invoice) => `'${quoteLiteral(invoice.invoiceNumber)}'`).join(", ")}
              )
          )::integer AS "invoiceCount"
      ) q;
    `,
  );

  return Boolean(row?.billingAccountPresent && row.contactPresent && row.invoiceCount >= JOSH_DEMO_INVOICES.length);
}
