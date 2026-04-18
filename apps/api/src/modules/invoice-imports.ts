import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { loadEnv } from "@o2c/config";
import { createDatabaseClientConfig, isDatabaseAvailable } from "@o2c/database";
import { loadBusinessCentralSalesInvoices } from "../integrations/business-central.js";
import { loadOdooInvoices } from "../integrations/odoo.js";
import { loadQuickBooksInvoices } from "../integrations/quickbooks.js";
import { loadSapBusinessOneInvoices } from "../integrations/sap-business-one.js";
import {
  createImportedInvoiceSyncService,
  InMemoryCanonicalInvoicePersistenceStore,
} from "../bootstrap/imported-invoice-sync-service.js";
import { parseSpreadsheetInvoiceFile } from "./spreadsheet-invoice-file-parser.js";

const syncRequestSchema = z.object({
  provider: z.enum(["business_central", "odoo", "quickbooks_online", "sap_business_one"]).optional(),
});

const auditContextSchema = z.object({
  actorId: z.string().min(1),
  actorType: z.enum(["user", "system", "automation"]),
  correlationId: z.string().min(1),
  occurredAt: z.string().min(1),
});

const spreadsheetInvoiceSchema = z.object({
  externalId: z.string().min(1),
  invoiceNumber: z.string().min(1),
  customerName: z.string().min(1),
  customerNumber: z.string().min(1).optional(),
  contactName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  currencyCode: z.string().min(1),
  totalAmountCents: z.number().int(),
  remainingAmountCents: z.number().int(),
  dueDate: z.string().min(1).optional(),
  invoiceDate: z.string().min(1).optional(),
  status: z.string().min(1),
  companyId: z.string().min(1).optional(),
  companyName: z.string().min(1).optional(),
  parentAccountName: z.string().min(1).optional(),
  parentAccountReference: z.string().min(1).optional(),
  branchName: z.string().min(1).optional(),
  branchReference: z.string().min(1).optional(),
});

const spreadsheetImportSchema = z.object({
  invoices: z.array(spreadsheetInvoiceSchema).min(1),
  auditContext: auditContextSchema.optional(),
});

const spreadsheetFileHeadersSchema = z.object({
  "x-file-name": z.string().min(1),
  "x-upload-id": z.string().min(1).optional(),
});

const inMemorySpreadsheetInvoiceStore = new InMemoryCanonicalInvoicePersistenceStore();

function createInvoiceSyncService() {
  const databaseUrl = createDatabaseClientConfig().connectionString;
  const store =
    databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl)
      ? undefined
      : inMemorySpreadsheetInvoiceStore;

  return createImportedInvoiceSyncService(store ? { store } : undefined);
}

export const registerInvoiceImportRoutes = (app: FastifyInstance): void => {
  ensureSpreadsheetFileParsers(app);

  app.post("/v1/invoices/imports/sync", async (request, reply) => {
    const query = syncRequestSchema.parse(request.query ?? {});
    const provider = query.provider ?? "business_central";

    const env = loadEnv();
    const syncService = createInvoiceSyncService();
    const auditContext = {
      actorId: "invoice_sync_endpoint",
      actorType: "automation" as const,
      correlationId: `invoice_sync_${Date.now()}`,
      occurredAt: new Date().toISOString(),
    };

    if (provider === "business_central") {
      const businessCentral = await loadBusinessCentralSalesInvoices(env.DEFAULT_TENANT_SLUG);
      if (!businessCentral) {
        return reply.status(400).send({
          message: "Business Central invoice pull is not configured for this tenant.",
        });
      }

      const result = await syncService.syncBusinessCentralInvoices({
        tenantId: env.DEFAULT_TENANT_SLUG,
        invoices: businessCentral.invoices,
        auditContext,
      });

      return reply.send({
        provider,
        importedCount: result.importedCount,
        canonicalUpsertedCount: result.canonicalUpsertedCount,
        pendingAccountMappingCount: result.pendingAccountMappingCount,
        heldInvalidCount: result.heldInvalidCount,
        snapshots: result.snapshots.slice(0, 25),
      });
    }

    if (provider === "quickbooks_online") {
      const quickbooks = await loadQuickBooksInvoices(env.DEFAULT_TENANT_SLUG);
      if (!quickbooks) {
        return reply.status(400).send({
          message: "QuickBooks invoice pull is not configured for this tenant.",
        });
      }

      const result = await syncService.syncQuickBooksInvoices({
        tenantId: env.DEFAULT_TENANT_SLUG,
        invoices: quickbooks.invoices,
        auditContext,
      });

      return reply.send({
        provider,
        importedCount: result.importedCount,
        canonicalUpsertedCount: result.canonicalUpsertedCount,
        pendingAccountMappingCount: result.pendingAccountMappingCount,
        heldInvalidCount: result.heldInvalidCount,
        snapshots: result.snapshots.slice(0, 25),
      });
    }

    if (provider === "sap_business_one") {
      const sapBusinessOne = await loadSapBusinessOneInvoices(env.DEFAULT_TENANT_SLUG);
      if (!sapBusinessOne) {
        return reply.status(400).send({
          message: "SAP Business One invoice pull is not configured for this tenant.",
        });
      }

      const result = await syncService.syncSapBusinessOneInvoices({
        tenantId: env.DEFAULT_TENANT_SLUG,
        invoices: sapBusinessOne.invoices,
        auditContext,
      });

      return reply.send({
        provider,
        importedCount: result.importedCount,
        canonicalUpsertedCount: result.canonicalUpsertedCount,
        pendingAccountMappingCount: result.pendingAccountMappingCount,
        heldInvalidCount: result.heldInvalidCount,
        snapshots: result.snapshots.slice(0, 25),
      });
    }

    const odoo = await loadOdooInvoices(env.DEFAULT_TENANT_SLUG);
    if (!odoo) {
      return reply.status(400).send({
        message: "Odoo invoice pull is not configured for this tenant.",
      });
    }

    const result = await syncService.syncOdooInvoices({
      tenantId: env.DEFAULT_TENANT_SLUG,
      invoices: odoo.invoices,
      auditContext,
    });

    return reply.send({
      provider,
      importedCount: result.importedCount,
      canonicalUpsertedCount: result.canonicalUpsertedCount,
      pendingAccountMappingCount: result.pendingAccountMappingCount,
      heldInvalidCount: result.heldInvalidCount,
      snapshots: result.snapshots.slice(0, 25),
    });
  });

  app.post("/v1/invoices/imports/spreadsheet", async (request, reply) => {
    const body = spreadsheetImportSchema.parse(request.body ?? {});
    const env = loadEnv();
    const syncService = createInvoiceSyncService();
    const auditContext = body.auditContext ?? {
      actorId: "spreadsheet_invoice_import_endpoint",
      actorType: "automation" as const,
      correlationId: `spreadsheet_invoice_import_${Date.now()}`,
      occurredAt: new Date().toISOString(),
    };

    const result = await syncService.syncSpreadsheetInvoices({
      tenantId: env.DEFAULT_TENANT_SLUG,
      invoices: body.invoices.map((invoice) => ({
        externalId: invoice.externalId,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        currencyCode: invoice.currencyCode,
        totalAmountCents: invoice.totalAmountCents,
        remainingAmountCents: invoice.remainingAmountCents,
        status: invoice.status,
        ...(invoice.customerNumber ? { customerNumber: invoice.customerNumber } : {}),
        ...(invoice.contactName ? { contactName: invoice.contactName } : {}),
        ...(invoice.email ? { email: invoice.email } : {}),
        ...(invoice.dueDate ? { dueDate: invoice.dueDate } : {}),
        ...(invoice.invoiceDate ? { invoiceDate: invoice.invoiceDate } : {}),
        ...(invoice.companyId ? { companyId: invoice.companyId } : {}),
        ...(invoice.companyName ? { companyName: invoice.companyName } : {}),
        ...(invoice.parentAccountName ? { parentAccountName: invoice.parentAccountName } : {}),
        ...(invoice.parentAccountReference ? { parentAccountReference: invoice.parentAccountReference } : {}),
        ...(invoice.branchName ? { branchName: invoice.branchName } : {}),
        ...(invoice.branchReference ? { branchReference: invoice.branchReference } : {}),
      })),
      auditContext,
    });

    return reply.status(201).send({
      provider: "spreadsheet_upload",
      importedCount: result.importedCount,
      skippedCount: result.skippedCount,
      canonicalUpsertedCount: result.canonicalUpsertedCount,
      pendingAccountMappingCount: result.pendingAccountMappingCount,
      heldInvalidCount: result.heldInvalidCount,
      snapshots: result.snapshots.slice(0, 25),
    });
  });

  app.post("/v1/invoices/imports/spreadsheet/file", async (request, reply) => {
    const headers = spreadsheetFileHeadersSchema.parse(request.headers);
    const buffer = readBinaryBody(request.body);
    const uploadId = headers["x-upload-id"] ?? `upload_${Date.now()}`;
    const fileImport = parseSpreadsheetInvoiceFile({
      uploadId,
      fileName: headers["x-file-name"],
      buffer,
    });
    const env = loadEnv();
    const syncService = createInvoiceSyncService();
    const auditContext = {
      actorId: "spreadsheet_invoice_file_import_endpoint",
      actorType: "automation" as const,
      correlationId: `spreadsheet_invoice_file_import_${uploadId}`,
      occurredAt: new Date().toISOString(),
    };

    const result = await syncService.syncSpreadsheetInvoices({
      tenantId: env.DEFAULT_TENANT_SLUG,
      invoices: fileImport.invoices,
      auditContext,
    });

    return reply.status(201).send({
      provider: "spreadsheet_upload",
      uploadId,
      fileName: headers["x-file-name"],
      sheetName: fileImport.sheetName,
      heldRows: fileImport.heldRows,
      importedCount: result.importedCount,
      skippedCount: result.skippedCount,
      canonicalUpsertedCount: result.canonicalUpsertedCount,
      pendingAccountMappingCount: result.pendingAccountMappingCount,
      heldInvalidCount: result.heldInvalidCount,
      snapshots: result.snapshots.slice(0, 25),
    });
  });
};

function ensureSpreadsheetFileParsers(app: FastifyInstance) {
  const binaryContentTypes = [
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
  ];

  for (const contentType of binaryContentTypes) {
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
  throw new Error("Spreadsheet file upload requires a binary request body.");
}
