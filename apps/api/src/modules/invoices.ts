import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  createInstallmentLine,
  getCollectibleAmountCents,
  type CustomerInvoice,
  type InstallmentLine,
} from "@o2c/domain";
import {
  defaultConnectorCatalog,
  type ErpInvoiceRecord,
  type InvoiceIndexEntry,
  type InvoiceIndexFilters,
  type InvoiceIndexImportMode,
  type InvoiceIndexMoreFilter,
  type InvoiceIndexProvider,
  type InvoiceIndexProviderSummary,
  type InvoiceIndexResponse,
  type InvoiceIndexSourceKind,
  type InvoiceIndexStatus,
  type InvoiceIndexStatusSummary,
  type InvoiceIndexTypeFilter,
} from "@o2c/contracts";
import { buildDemoSeedBundle } from "@o2c/seed";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getBusinessCentralIntegrationStatus,
  loadBusinessCentralSalesInvoices,
  type BusinessCentralInvoiceRecord,
} from "../integrations/business-central.js";
import {
  getQuickBooksIntegrationStatus,
  loadQuickBooksInvoices,
  type QuickBooksInvoiceRecord,
} from "../integrations/quickbooks.js";
import { loadEnv } from "@o2c/config";

interface PersistedInvoiceSnapshotRow {
  id: string;
  sourceProvider: string;
  sourceKind: InvoiceIndexSourceKind;
  externalId: string;
  canonicalInvoiceId?: string;
  customerName: string;
  customerReference?: string;
  parentAccountId?: string;
  parentAccountName?: string;
  billingAccountId?: string;
  billingAccountName?: string;
  branchId?: string;
  branchName?: string;
  invoiceNumber: string;
  currency: string;
  totalAmountCents: number;
  openAmountCents: number;
  collectibleAmountCents?: number;
  sourceStatus: string;
  issuedAt?: string;
  dueDate?: string;
  lastImportedAt: string;
  canonicalState?: CustomerInvoice["state"];
  canonicalMetadata?: Record<string, unknown>;
  snapshotMetadata?: Record<string, unknown>;
  canonicalizationStatus: string;
  holdReason?: string;
}

interface InvoiceIndexBuildOptions {
  databaseUrl?: string;
  tenantId?: string;
  now?: () => string;
  filters?: InvoiceIndexFilters;
  loadPersistedEntries?: (databaseUrl: string, tenantId: string) => InvoiceIndexEntry[];
  loadActivePromiseSummaries?: (databaseUrl: string, tenantId: string) => InvoicePromiseSummary[];
  loadBusinessCentral?: (
    tenantId: string,
  ) => Promise<{ invoices: BusinessCentralInvoiceRecord[] } | undefined>;
  loadQuickBooks?: (
    tenantId: string,
  ) => Promise<{ invoices: QuickBooksInvoiceRecord[] } | undefined>;
  getBusinessCentralStatusForTenant?: typeof getBusinessCentralIntegrationStatus;
  getQuickBooksStatusForTenant?: typeof getQuickBooksIntegrationStatus;
}

type InvoiceIndexFilterInput = {
  q?: string | undefined;
  status?: InvoiceIndexFilters["status"] | undefined;
  type?: InvoiceIndexTypeFilter | undefined;
  more?: InvoiceIndexMoreFilter | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
};

type InvoiceSourceDescriptor = {
  provider: InvoiceIndexProvider;
  label: string;
  kind: InvoiceIndexSourceKind;
  importMode: InvoiceIndexImportMode;
};

type SeedBundle = ReturnType<typeof buildDemoSeedBundle>;

interface ActiveInvoicePromiseSummaryRow {
  id: string;
  billingAccountId: string;
  contactId?: string;
  promisedAmountCents: number;
  currency: string;
  promiseDate: string;
  state: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

interface InvoicePromiseSummary {
  id: string;
  billingAccountId: string;
  contactId?: string;
  promisedAmountCents: number;
  currency: string;
  promiseDate: string;
  state: string;
  updatedAt: string;
  invoiceIds: string[];
}

const connectorDescriptorByProvider = new Map(
  defaultConnectorCatalog.map((descriptor) => [
    descriptor.provider,
    {
      provider: descriptor.provider,
      label: descriptor.displayName,
      kind: descriptor.kind,
      importMode: "live_connection" as const,
    },
  ]),
);

const businessCentralDescriptor: InvoiceSourceDescriptor = {
  provider: "business_central",
  label: "Business Central",
  kind: "accounting",
  importMode: "live_connection",
};

const seedDescriptor: InvoiceSourceDescriptor = {
  provider: "seed_demo",
  label: "Seed demo catalog",
  kind: "seed",
  importMode: "seed_fallback",
};

const invoiceIndexStatusFilters = ["all", "open", "partial", "paid", "disputed", "voided"] as const;
const invoiceIndexTypeFilters = [
  "all",
  "live_connection",
  "manual_upload",
  "seed_fallback",
  "installment_plan",
  "standard_invoice",
] as const;
const invoiceIndexMoreFilters = [
  "all",
  "overdue",
  "due_today",
  "due_soon",
  "with_promise",
  "with_balance",
  "with_branch",
  "missing_branch",
] as const;

const invoiceIndexQuerySchema = z.object({
  q: z.string().trim().max(160).optional(),
  status: z.enum(invoiceIndexStatusFilters).optional(),
  type: z.enum(invoiceIndexTypeFilters).optional(),
  more: z.enum(invoiceIndexMoreFilters).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export const registerInvoiceIndexRoutes = (app: FastifyInstance): void => {
  app.get("/v1/invoices", async (request, reply) => {
    const query = invoiceIndexQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        message: "Invalid invoice index query.",
        issues: query.error.issues,
      });
    }

    return buildInvoiceIndexResponse({
      filters: normalizeInvoiceIndexFilters(query.data),
    });
  });

  app.get("/v1/invoices/export", async (request, reply) => {
    const query = invoiceIndexQuerySchema.omit({ page: true, pageSize: true }).safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        message: "Invalid invoice export query.",
        issues: query.error.issues,
      });
    }

    try {
      const invoiceIndex = await buildInvoiceIndexResponse({
        filters: normalizeInvoiceIndexFilters(query.data),
      });
      const pdf = renderInvoiceIndexExportPdf({
        invoiceIndex,
        filters: invoiceIndex.filters ?? {},
      });
      const generatedDate = formatManilaDateKey(new Date());
      reply
        .header("content-type", "application/pdf")
        .header(
          "content-disposition",
          `attachment; filename="yield-aros-invoices-${generatedDate}.pdf"`,
        )
        .send(pdf);
    } catch (error) {
      app.log.error({ err: error }, "Invoice PDF export failed");
      return reply.status(503).send({
        message: "Invoice PDF generation is unavailable in this environment.",
      });
    }
  });

  app.post("/v1/invoices/:invoiceId/attachment", async (request, reply) => {
    const env = loadEnv();
    const params = z.object({ invoiceId: z.string().min(1) }).safeParse(request.params);
    const body = z.object({
      fileName: z.string().min(1),
      mimeType: z.string().optional(),
      contentBase64: z.string().min(1),
      uploadedBy: z.string().min(1).optional(),
    }).safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.status(400).send({
        message: "Invalid invoice attachment upload request.",
        issues: [
          ...(params.success ? [] : params.error.issues),
          ...(body.success ? [] : body.error.issues),
        ],
      });
    }

    try {
      return attachInvoicePhysicalDocument({
        databaseUrl: env.DATABASE_URL,
        tenantId: env.DEFAULT_TENANT_SLUG,
        invoiceId: params.data.invoiceId,
        fileName: body.data.fileName,
        ...(body.data.mimeType ? { mimeType: body.data.mimeType } : {}),
        contentBase64: body.data.contentBase64,
        uploadedBy: body.data.uploadedBy ?? "web_console",
      });
    } catch (error) {
      return reply.status(400).send({
        message:
          error instanceof Error ? error.message : "Invoice attachment could not be stored.",
      });
    }
  });
};

export function normalizeInvoiceIndexFilters(input?: InvoiceIndexFilterInput): InvoiceIndexFilters {
  const filters: InvoiceIndexFilters = {};
  const q = input?.q?.trim();
  if (q) {
    filters.q = q;
  }
  if (input?.status && invoiceIndexStatusFilters.includes(input.status)) {
    filters.status = input.status;
  }
  if (input?.type && invoiceIndexTypeFilters.includes(input.type)) {
    filters.type = input.type;
  }
  if (input?.more && invoiceIndexMoreFilters.includes(input.more)) {
    filters.more = input.more;
  }
  if (typeof input?.page === "number" && Number.isFinite(input.page) && input.page > 0) {
    filters.page = Math.floor(input.page);
  }
  if (typeof input?.pageSize === "number" && Number.isFinite(input.pageSize) && input.pageSize > 0) {
    filters.pageSize = Math.min(Math.floor(input.pageSize), 200);
  }
  return filters;
}

export function applyInvoiceIndexReadModelFilters(
  response: InvoiceIndexResponse,
  inputFilters?: InvoiceIndexFilters,
): InvoiceIndexResponse {
  const filters = normalizeInvoiceIndexFilters(inputFilters);
  const todayDateKey = formatManilaDateKey(new Date(response.generatedAt));
  const filteredInvoices = response.invoices.filter((invoice) =>
    invoiceMatchesInvoiceIndexFilters(invoice, filters, todayDateKey),
  );
  const pageSize = filters.pageSize;
  const page = filters.page ?? (pageSize ? 1 : undefined);
  const totalPages = pageSize ? Math.max(Math.ceil(filteredInvoices.length / pageSize), 1) : undefined;
  const clampedPage = page && totalPages ? Math.min(page, totalPages) : page;
  const invoices = pageSize && clampedPage
    ? filteredInvoices.slice((clampedPage - 1) * pageSize, clampedPage * pageSize)
    : filteredInvoices;
  const pagination = pageSize && clampedPage && totalPages
    ? {
        page: clampedPage,
        pageSize,
        totalItems: filteredInvoices.length,
        totalPages,
        hasPreviousPage: clampedPage > 1,
        hasNextPage: clampedPage < totalPages,
      }
    : undefined;

  return {
    ...response,
    summary: buildInvoiceIndexSummary(filteredInvoices),
    providers: buildProviderSummaries(filteredInvoices),
    statuses: buildStatusSummaries(filteredInvoices),
    invoices,
    ...(Object.keys(filters).length > 0 ? { filters } : {}),
    ...(pagination ? { pagination } : {}),
  };
}

function invoiceMatchesInvoiceIndexFilters(
  invoice: InvoiceIndexEntry,
  filters: InvoiceIndexFilters,
  todayDateKey: string,
) {
  if (filters.status && filters.status !== "all" && invoice.status !== filters.status) {
    return false;
  }
  if (filters.type && filters.type !== "all" && !invoiceMatchesTypeFilter(invoice, filters.type)) {
    return false;
  }
  if (filters.more && filters.more !== "all" && !invoiceMatchesMoreFilter(invoice, filters.more, todayDateKey)) {
    return false;
  }
  if (filters.q && !invoiceMatchesSearch(invoice, filters.q)) {
    return false;
  }
  return true;
}

function invoiceMatchesTypeFilter(invoice: InvoiceIndexEntry, filter: Exclude<InvoiceIndexTypeFilter, "all">) {
  switch (filter) {
    case "live_connection":
    case "manual_upload":
    case "seed_fallback":
      return invoice.importMode === filter;
    case "installment_plan":
      return Boolean(invoice.installmentPlanId) || invoice.tags.includes("installment-plan");
    case "standard_invoice":
      return !invoice.installmentPlanId && !invoice.tags.includes("installment-plan");
  }
}

function invoiceMatchesMoreFilter(
  invoice: InvoiceIndexEntry,
  filter: Exclude<InvoiceIndexMoreFilter, "all">,
  todayDateKey: string,
) {
  switch (filter) {
    case "overdue":
      return isInvoiceOverdue(invoice, todayDateKey);
    case "due_today":
      return Boolean(invoice.dueDate) && invoice.dueDate === todayDateKey && invoice.openAmountCents > 0;
    case "due_soon": {
      if (!invoice.dueDate || invoice.openAmountCents <= 0) {
        return false;
      }
      return invoice.dueDate >= todayDateKey && invoice.dueDate <= addDaysToDateKey(todayDateKey, 7);
    }
    case "with_promise":
      return Boolean(
        invoice.metadata.promiseToPayId ??
        invoice.metadata.promiseToPayDate ??
        invoice.tags.find((tag) => tag.toLowerCase() === "promise-to-pay"),
      );
    case "with_balance":
      return invoice.openAmountCents > 0;
    case "with_branch":
      return Boolean(invoice.branchId || invoice.branchName);
    case "missing_branch":
      return !invoice.branchId && !invoice.branchName;
  }
}

function invoiceMatchesSearch(invoice: InvoiceIndexEntry, query: string) {
  const haystack = buildInvoiceSearchHaystack(invoice);
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

function buildInvoiceSearchHaystack(invoice: InvoiceIndexEntry) {
  const metadataValues = Object.entries(invoice.metadata)
    .filter(([key, value]) => {
      if (!["string", "number", "boolean"].includes(typeof value)) {
        return false;
      }
      return /invoice|account|customer|reference|po|so|email|contact|external|branch|promise/i.test(key);
    })
    .map(([, value]) => String(value));
  return [
    invoice.id,
    invoice.externalId,
    invoice.canonicalInvoiceId,
    invoice.invoiceNumber,
    invoice.customerName,
    invoice.customerReference,
    invoice.parentAccountId,
    invoice.parentAccountName,
    invoice.billingAccountId,
    invoice.billingAccountName,
    invoice.branchId,
    invoice.branchName,
    invoice.status,
    invoice.sourceStatus,
    invoice.sourceLabel,
    invoice.sourceProvider,
    invoice.importMode,
    invoice.issuedAt,
    invoice.dueDate,
    invoice.lastImportedAt,
    ...invoice.tags,
    ...metadataValues,
    formatInvoiceAmountForSearch(invoice.totalAmountCents),
    formatInvoiceAmountForSearch(invoice.openAmountCents),
    formatInvoiceAmountForSearch(invoice.paidAmountCents),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function isInvoiceOverdue(invoice: InvoiceIndexEntry, todayDateKey: string) {
  if (invoice.openAmountCents <= 0) {
    return false;
  }
  if ((invoice.daysPastDue ?? 0) > 0) {
    return true;
  }
  return Boolean(invoice.dueDate && invoice.dueDate < todayDateKey);
}

function formatInvoiceAmountForSearch(cents: number) {
  const amount = cents / 100;
  return [
    amount.toFixed(2),
    amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    `php ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  ].join(" ");
}

function formatManilaDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function addDaysToDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function renderInvoiceIndexExportPdf(input: {
  invoiceIndex: InvoiceIndexResponse;
  filters: InvoiceIndexFilters;
}) {
  const generatedAt = new Date(input.invoiceIndex.generatedAt);
  const lines = [
    "Yield AROS Invoice Export",
    `Generated: ${formatManilaDateTime(generatedAt)} Asia/Manila`,
    `Source: ${input.invoiceIndex.source.label}`,
    `Filters: ${describeInvoiceExportFilters(input.filters)}`,
    `Invoices: ${input.invoiceIndex.summary.totalInvoices}`,
    `Open balance: ${formatAsciiPhp(input.invoiceIndex.summary.openAmountCents)}`,
    `Total amount: ${formatAsciiPhp(input.invoiceIndex.summary.totalAmountCents)}`,
    "",
    fixedWidthColumns(["Invoice", "Customer", "Status", "Due", "Amount", "Open"], [16, 24, 10, 12, 14, 14]),
    fixedWidthColumns(["---------------", "-----------------------", "---------", "----------", "------------", "------------"], [16, 24, 10, 12, 14, 14]),
    ...input.invoiceIndex.invoices.map((invoice) =>
      fixedWidthColumns(
        [
          invoice.invoiceNumber,
          invoice.billingAccountName ?? invoice.customerName,
          invoice.status,
          invoice.dueDate ?? "-",
          formatAsciiPhp(invoice.totalAmountCents),
          formatAsciiPhp(invoice.openAmountCents),
        ],
        [16, 24, 10, 12, 14, 14],
      ),
    ),
  ];

  if (input.invoiceIndex.invoices.length === 0) {
    lines.push("No invoices match the current filters.");
  }

  return buildSimplePdf(lines);
}

function describeInvoiceExportFilters(filters: InvoiceIndexFilters) {
  const parts = [
    filters.q ? `Search "${filters.q}"` : undefined,
    filters.status && filters.status !== "all" ? `Status ${filters.status}` : undefined,
    filters.type && filters.type !== "all" ? `Type ${filters.type.replace(/_/g, " ")}` : undefined,
    filters.more && filters.more !== "all" ? `More ${filters.more.replace(/_/g, " ")}` : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("; ") : "None";
}

function formatManilaDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date).replace(/\u202f/g, " ");
}

function formatAsciiPhp(cents: number) {
  return `PHP ${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fixedWidthColumns(values: string[], widths: number[]) {
  return values
    .map((value, index) => sanitizePdfText(value).slice(0, widths[index] ?? 12).padEnd(widths[index] ?? 12, " "))
    .join("  ");
}

function buildSimplePdf(lines: string[]) {
  const pageLines = chunkLines(lines, 58);
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const pageObjectIds = pageLines.map((_, index) => 4 + index * 2);
  objects.push(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");

  for (const [index, page] of pageLines.entries()) {
    const pageObjectId = 4 + index * 2;
    const contentObjectId = pageObjectId + 1;
    const content = renderPdfContentStream(page);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`);
  }

  return Buffer.from(serializePdfObjects(objects), "ascii");
}

function renderPdfContentStream(lines: string[]) {
  return [
    "BT",
    "/F1 9 Tf",
    "12 TL",
    "42 800 Td",
    ...lines.map((line) => `(${escapePdfText(line)}) Tj T*`),
    "ET",
  ].join("\n");
}

function serializePdfObjects(objects: string[]) {
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, "ascii"));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(output, "ascii");
  output += `xref\n0 ${objects.length + 1}\n`;
  output += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return output;
}

function chunkLines(lines: string[], size: number) {
  const chunks: string[][] = [];
  for (let index = 0; index < lines.length; index += size) {
    chunks.push(lines.slice(index, index + size));
  }
  return chunks.length > 0 ? chunks : [[]];
}

function sanitizePdfText(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "?");
}

function escapePdfText(value: string) {
  return sanitizePdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function attachInvoicePhysicalDocument(input: {
  databaseUrl: string;
  tenantId: string;
  invoiceId: string;
  fileName: string;
  mimeType?: string;
  contentBase64: string;
  uploadedBy: string;
  now?: () => string;
}) {
  const now = input.now?.() ?? new Date().toISOString();
  const trimmedContent = input.contentBase64.replace(/\s+/g, "");
  if (trimmedContent.length === 0) {
    throw new Error("Invoice attachment content is empty.");
  }

  const invoice = queryJsonRows<{
    id: string;
    metadata?: Record<string, unknown>;
  }>(
    input.databaseUrl,
    `
      SELECT row_to_json(q)
      FROM (
        SELECT
          invoice.id::text AS id,
          COALESCE(invoice.metadata, '{}'::jsonb) AS metadata
        FROM invoice
        WHERE invoice.id = '${quoteLiteral(input.invoiceId)}'::uuid
          AND invoice.tenant_id = '${quoteLiteral(input.tenantId)}'
          AND invoice.deleted_at IS NULL
      ) q;
    `,
  )[0];

  if (!invoice) {
    throw new Error("Invoice record was not found.");
  }

  const uploadedDocumentId = randomUUID();
  const checksum = createHash("sha256").update(trimmedContent, "utf8").digest("hex");
  const nextInvoiceMetadata = {
    ...(invoice.metadata ?? {}),
    physicalInvoiceFileName: input.fileName,
    ...(input.mimeType ? { physicalInvoiceMimeType: input.mimeType } : {}),
    physicalInvoiceAttachedAt: now,
    physicalInvoiceAttachedBy: input.uploadedBy,
  };
  const documentMetadata = {
    externalDocumentId: uploadedDocumentId,
    fileName: input.fileName,
    ...(input.mimeType ? { mimeType: input.mimeType } : {}),
    contentBase64: trimmedContent,
    attachedToInvoiceId: input.invoiceId,
    attachedAt: now,
    attachedBy: input.uploadedBy,
  };

  const sql = `
    INSERT INTO uploaded_document (
      id, tenant_id, version, created_at, updated_at, deleted_at,
      created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
      document_type, source, storage_key, checksum, uploaded_by, uploaded_at, metadata
    ) VALUES (
      '${quoteLiteral(uploadedDocumentId)}'::uuid,
      '${quoteLiteral(input.tenantId)}',
      1,
      '${quoteLiteral(now)}'::timestamptz,
      '${quoteLiteral(now)}'::timestamptz,
      NULL,
      '${quoteLiteral(input.uploadedBy)}',
      'internal',
      '${quoteLiteral(input.uploadedBy)}',
      'internal',
      'invoice',
      'manual',
      '${quoteLiteral(`invoice-attachments/${input.invoiceId}/${uploadedDocumentId}/${input.fileName}`)}',
      '${quoteLiteral(checksum)}',
      '${quoteLiteral(input.uploadedBy)}',
      '${quoteLiteral(now)}'::timestamptz,
      '${jsonLiteral(documentMetadata)}'::jsonb
    );

    UPDATE invoice
    SET
      version = invoice.version + 1,
      updated_at = '${quoteLiteral(now)}'::timestamptz,
      updated_by_actor_id = '${quoteLiteral(input.uploadedBy)}',
      updated_by_actor_role = 'internal',
      uploaded_document_id = '${quoteLiteral(uploadedDocumentId)}'::uuid,
      metadata = '${jsonLiteral(nextInvoiceMetadata)}'::jsonb
    WHERE id = '${quoteLiteral(input.invoiceId)}'::uuid
      AND tenant_id = '${quoteLiteral(input.tenantId)}'
      AND deleted_at IS NULL;
  `;

  const result = spawnSync("psql", [input.databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || "Invoice attachment could not be stored.");
  }

  return {
    invoiceId: input.invoiceId,
    uploadedDocumentId,
    fileName: input.fileName,
    ...(input.mimeType ? { mimeType: input.mimeType } : {}),
    attachedAt: now,
  };
}

export async function buildInvoiceIndexResponse(
  options: InvoiceIndexBuildOptions = {},
): Promise<InvoiceIndexResponse> {
  const env = loadEnv();
  const tenantId = options.tenantId ?? env.DEFAULT_TENANT_SLUG;
  const databaseUrl = options.databaseUrl ?? env.DATABASE_URL;
  const loadPersistedEntries = options.loadPersistedEntries ?? loadPersistedInvoiceIndexEntries;
  const loadActivePromiseSummaries = options.loadActivePromiseSummaries ?? loadActiveInvoicePromiseSummaries;
  const loadBusinessCentral = options.loadBusinessCentral ?? loadBusinessCentralSalesInvoices;
  const loadQuickBooks = options.loadQuickBooks ?? loadQuickBooksInvoices;
  const getBusinessCentralStatusForTenant =
    options.getBusinessCentralStatusForTenant ?? getBusinessCentralIntegrationStatus;
  const getQuickBooksStatusForTenant =
    options.getQuickBooksStatusForTenant ?? getQuickBooksIntegrationStatus;
  const generatedAt = options.now?.() ?? new Date().toISOString();

  try {
    const persistedEntries = loadPersistedEntries(
      databaseUrl,
      tenantId,
    );
    if (persistedEntries.length > 0) {
      const sortedEntries = attachActivePromiseMetadata(sortInvoiceEntries(persistedEntries), {
        databaseUrl,
        tenantId,
        loadActivePromiseSummaries,
      });
      return applyInvoiceIndexReadModelFilters({
        generatedAt,
        source: {
          kind: "live",
          label: "Persisted imported invoice index",
          detail: `Loaded ${persistedEntries.length} stored imported invoices and canonical links from the database.`,
        },
        summary: buildInvoiceIndexSummary(sortedEntries),
        providers: buildProviderSummaries(sortedEntries),
        statuses: buildStatusSummaries(sortedEntries),
        invoices: sortedEntries,
      }, options.filters);
    }
  } catch (error) {
    const detail =
      error instanceof Error
        ? `Stored invoice index was unavailable: ${error.message}`
        : "Stored invoice index was unavailable.";
    const response = await buildFallbackInvoiceIndexResponse({
      env,
      generatedAt,
      businessCentralLoader: loadBusinessCentral,
      quickBooksLoader: loadQuickBooks,
      businessCentralStatus: getBusinessCentralStatusForTenant,
      quickBooksStatus: getQuickBooksStatusForTenant,
      tenantId,
      seedFallbackDetail: detail,
    });
    return applyInvoiceIndexReadModelFilters(response, options.filters);
  }

  const response = await buildFallbackInvoiceIndexResponse({
    env,
    generatedAt,
    businessCentralLoader: loadBusinessCentral,
    quickBooksLoader: loadQuickBooks,
    businessCentralStatus: getBusinessCentralStatusForTenant,
    quickBooksStatus: getQuickBooksStatusForTenant,
    tenantId,
  });

  return applyInvoiceIndexReadModelFilters(response, options.filters);
}

async function buildFallbackInvoiceIndexResponse(input: {
  env: ReturnType<typeof loadEnv>;
  generatedAt: string;
  tenantId: string;
  businessCentralLoader: (
    tenantId: string,
  ) => Promise<{ invoices: BusinessCentralInvoiceRecord[] } | undefined>;
  quickBooksLoader: (
    tenantId: string,
  ) => Promise<{ invoices: QuickBooksInvoiceRecord[] } | undefined>;
  businessCentralStatus: typeof getBusinessCentralIntegrationStatus;
  quickBooksStatus: typeof getQuickBooksIntegrationStatus;
  seedFallbackDetail?: string;
}): Promise<InvoiceIndexResponse> {
  const entries: InvoiceIndexEntry[] = [];
  let source: InvoiceIndexResponse["source"] = {
    kind: "live",
    label: "Empty invoice index",
    detail:
      input.seedFallbackDetail ??
      "No persisted or live ERP/accounting invoice pull is active.",
  };

  const businessCentralStatus = input.businessCentralStatus(input.tenantId);
  if (businessCentralStatus.kind !== "not_configured") {
    try {
      const businessCentral = await input.businessCentralLoader(input.tenantId);
      if (businessCentral && businessCentral.invoices.length > 0) {
        entries.unshift(
          ...businessCentral.invoices.map((invoice) => mapBusinessCentralInvoiceToIndexEntry(invoice))
        );
        source = {
          kind: "live",
          label: "Live ERP/accounting invoice index",
          detail: `Loaded ${businessCentral.invoices.length} live Business Central invoices.`,
        };
      }
    } catch (error) {
      source = {
        kind: "live",
        label: "Empty invoice index",
        detail:
          error instanceof Error
            ? `Business Central invoice pull was unavailable: ${error.message}`
            : "Business Central invoice pull was unavailable.",
      };
    }
  }

  const quickBooksStatus = input.quickBooksStatus(input.tenantId);
  if (quickBooksStatus.kind !== "not_configured") {
    try {
      const quickBooks = await input.quickBooksLoader(input.tenantId);
      if (quickBooks && quickBooks.invoices.length > 0) {
        entries.unshift(
          ...quickBooks.invoices.map((invoice) => mapQuickBooksInvoiceToIndexEntry(invoice)),
        );
        source = {
          kind: "live",
          label: "Live ERP/accounting invoice index",
          detail: `Loaded ${quickBooks.invoices.length} live QuickBooks invoices.`,
        };
      }
    } catch (error) {
      source = {
        kind: "live",
        label: "Empty invoice index",
        detail:
          error instanceof Error
            ? `QuickBooks invoice pull was unavailable: ${error.message}`
            : "QuickBooks invoice pull was unavailable.",
      };
    }
  }

  if (entries.length === 0 && isInvoiceDemoDataEnabled(input.env.ENABLE_DEMO_DATA, input.env.NODE_ENV)) {
    const seedEntries = buildSeedInvoiceEntries(buildDemoSeedBundle());
    entries.push(...seedEntries);
    source = {
      kind: "seeded",
      label: "Seed demo invoice index",
      detail: input.seedFallbackDetail
        ? `${input.seedFallbackDetail} Loaded ${seedEntries.length} demo invoices because ENABLE_DEMO_DATA is enabled.`
        : `Loaded ${seedEntries.length} demo invoices because ENABLE_DEMO_DATA is enabled.`,
    };
  }

  const sortedEntries = sortInvoiceEntries(entries);

  return {
    generatedAt: input.generatedAt,
    source,
    summary: buildInvoiceIndexSummary(sortedEntries),
    providers: buildProviderSummaries(sortedEntries),
    statuses: buildStatusSummaries(sortedEntries),
    invoices: sortedEntries,
  };
}

function isInvoiceDemoDataEnabled(envValue: boolean, nodeEnv: string) {
  const demoDataOverride = process.env.ENABLE_DEMO_DATA?.trim().toLowerCase();
  if (demoDataOverride !== undefined && ["false", "0", "no", "off"].includes(demoDataOverride)) {
    return false;
  }
  if (demoDataOverride !== undefined && ["true", "1", "yes", "on"].includes(demoDataOverride)) {
    return true;
  }

  return envValue === true || nodeEnv === "test" || process.env.VITEST === "true";
}

export function loadPersistedInvoiceIndexEntries(
  databaseUrl: string,
  tenantId: string,
): InvoiceIndexEntry[] {
  const rows = queryJsonRows<PersistedInvoiceSnapshotRow>(
    databaseUrl,
    `
      SELECT row_to_json(q)
      FROM (
        SELECT
          snapshot.id,
          snapshot.source_provider AS "sourceProvider",
          snapshot.source_kind AS "sourceKind",
          snapshot.external_id AS "externalId",
          snapshot.canonical_invoice_id AS "canonicalInvoiceId",
          snapshot.customer_name AS "customerName",
          snapshot.customer_reference AS "customerReference",
          COALESCE(invoice.parent_account_id, billing_account.parent_account_id) AS "parentAccountId",
          parent_account.name AS "parentAccountName",
          invoice.billing_account_id AS "billingAccountId",
          billing_account.display_name AS "billingAccountName",
          COALESCE(invoice.branch_id::text, billing_account.branch_id::text) AS "branchId",
          branch.name AS "branchName",
          snapshot.invoice_number AS "invoiceNumber",
          snapshot.currency,
          snapshot.total_amount_cents::bigint AS "totalAmountCents",
          snapshot.open_amount_cents::bigint AS "openAmountCents",
          snapshot.source_status AS "sourceStatus",
          snapshot.issued_at AS "issuedAt",
          snapshot.due_date AS "dueDate",
          snapshot.last_imported_at AS "lastImportedAt",
          invoice.state AS "canonicalState",
          COALESCE(invoice.metadata, '{}'::jsonb) AS "canonicalMetadata",
          snapshot.metadata AS "snapshotMetadata",
          snapshot.canonicalization_status AS "canonicalizationStatus",
          snapshot.hold_reason AS "holdReason"
        FROM imported_invoice_snapshot snapshot
        LEFT JOIN invoice
          ON invoice.id = snapshot.canonical_invoice_id
         AND invoice.deleted_at IS NULL
        LEFT JOIN billing_account
          ON billing_account.id = invoice.billing_account_id
         AND billing_account.deleted_at IS NULL
        LEFT JOIN parent_account
          ON parent_account.id = COALESCE(invoice.parent_account_id, billing_account.parent_account_id)
         AND parent_account.deleted_at IS NULL
        LEFT JOIN branch
          ON branch.id = COALESCE(invoice.branch_id, billing_account.branch_id)
         AND branch.deleted_at IS NULL
        WHERE snapshot.tenant_id = '${quoteLiteral(tenantId)}'
          AND snapshot.deleted_at IS NULL
      ) q;
    `,
  );

  return rows.map(mapPersistedSnapshotToIndexEntry);
}

export function loadActiveInvoicePromiseSummaries(
  databaseUrl: string,
  tenantId: string,
): InvoicePromiseSummary[] {
  if (!databaseUrl.trim()) {
    return [];
  }

  const rows = queryJsonRows<ActiveInvoicePromiseSummaryRow>(
    databaseUrl,
    `
      SELECT row_to_json(q)
      FROM (
        SELECT
          id::text AS id,
          billing_account_id::text AS "billingAccountId",
          contact_id::text AS "contactId",
          promised_amount_cents::bigint AS "promisedAmountCents",
          currency,
          promise_date::text AS "promiseDate",
          state,
          updated_at::text AS "updatedAt",
          COALESCE(metadata, '{}'::jsonb) AS metadata
        FROM promise_to_pay
        WHERE tenant_id = '${quoteLiteral(tenantId)}'
          AND deleted_at IS NULL
          AND state IN ('detected_unconfirmed', 'accepted', 'due_today')
        ORDER BY promise_date ASC, updated_at DESC
      ) q;
    `,
  );

  return rows.map((row) => ({
    id: row.id,
    billingAccountId: row.billingAccountId,
    ...(row.contactId ? { contactId: row.contactId } : {}),
    promisedAmountCents: row.promisedAmountCents,
    currency: row.currency,
    promiseDate: row.promiseDate,
    state: row.state,
    updatedAt: row.updatedAt,
    invoiceIds: readStringList(
      row.metadata?.invoiceIds ??
        row.metadata?.invoice_ids ??
        row.metadata?.invoiceId ??
        row.metadata?.invoice_id,
    ),
  }));
}

function attachActivePromiseMetadata(
  entries: InvoiceIndexEntry[],
  input: {
    databaseUrl: string;
    tenantId: string;
    loadActivePromiseSummaries: (databaseUrl: string, tenantId: string) => InvoicePromiseSummary[];
  },
): InvoiceIndexEntry[] {
  let promises: InvoicePromiseSummary[];
  try {
    promises = input.loadActivePromiseSummaries(input.databaseUrl, input.tenantId);
  } catch {
    return entries;
  }

  const promiseByInvoiceId = new Map<string, InvoicePromiseSummary>();
  for (const promise of promises) {
    for (const invoiceId of promise.invoiceIds) {
      const existing = promiseByInvoiceId.get(invoiceId);
      if (!existing || comparePromiseFreshness(promise, existing) < 0) {
        promiseByInvoiceId.set(invoiceId, promise);
      }
    }
  }

  if (promiseByInvoiceId.size === 0) {
    return entries;
  }

  return entries.map((entry) => {
    const promise = resolveEntryPromise(entry, promiseByInvoiceId);
    if (!promise) {
      return entry;
    }

    return {
      ...entry,
      tags: entry.tags.includes("promise-to-pay") ? entry.tags : [...entry.tags, "promise-to-pay"],
      metadata: {
        ...entry.metadata,
        promiseToPayId: promise.id,
        promiseToPayDate: promise.promiseDate,
        promisedAmountCents: promise.promisedAmountCents,
        promiseToPayAmountCents: promise.promisedAmountCents,
        promiseToPayCurrency: promise.currency,
        promiseToPayState: promise.state,
        promiseToPayUpdatedAt: promise.updatedAt,
        promiseToPayInvoiceIds: promise.invoiceIds,
        promiseToPayInvoiceCount: promise.invoiceIds.length,
      },
    };
  });
}

function resolveEntryPromise(
  entry: InvoiceIndexEntry,
  promiseByInvoiceId: Map<string, InvoicePromiseSummary>,
) {
  const identifiers = [
    entry.canonicalInvoiceId,
    entry.id,
    entry.externalId,
    entry.invoiceNumber,
    readStringMetadata(entry.metadata, "invoiceId"),
    readStringMetadata(entry.metadata, "invoice_id"),
    readStringMetadata(entry.metadata, "canonicalInvoiceId"),
  ].filter((value): value is string => Boolean(value));

  return identifiers
    .map((identifier) => promiseByInvoiceId.get(identifier))
    .filter((promise): promise is InvoicePromiseSummary => Boolean(promise))
    .sort(comparePromiseFreshness)[0];
}

function comparePromiseFreshness(left: InvoicePromiseSummary, right: InvoicePromiseSummary) {
  const leftPromiseDate = safeTimestamp(left.promiseDate);
  const rightPromiseDate = safeTimestamp(right.promiseDate);
  if (leftPromiseDate !== rightPromiseDate) {
    return leftPromiseDate - rightPromiseDate;
  }

  return safeTimestamp(right.updatedAt) - safeTimestamp(left.updatedAt);
}

export function mapConnectorInvoiceToIndexEntry(
  invoice: ErpInvoiceRecord,
  provider: InvoiceIndexProvider,
): InvoiceIndexEntry {
  const descriptor = resolveDescriptor(provider);
  const status = normalizeConnectorStatus(invoice.status);
  const openAmountCents = Math.max(invoice.openAmountCents, 0);
  const customerName =
    readStringMetadata(invoice.metadata, "customerName") ?? invoice.billingAccountExternalId;
  const daysPastDue = computeDaysPastDue(invoice.dueDate);

  return {
    id: `${provider}:${invoice.externalId}`,
    sourceProvider: descriptor.provider,
    sourceKind: descriptor.kind,
    sourceLabel: descriptor.label,
    importMode: descriptor.importMode,
    externalId: invoice.externalId,
    customerName,
    ...(invoice.billingAccountExternalId
      ? { customerReference: invoice.billingAccountExternalId }
      : {}),
    ...(invoice.parentAccountExternalId
      ? { parentAccountId: invoice.parentAccountExternalId }
      : {}),
    ...(invoice.billingAccountExternalId
      ? { billingAccountId: invoice.billingAccountExternalId }
      : {}),
    ...(invoice.branchExternalId ? { branchId: invoice.branchExternalId } : {}),
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currency,
    totalAmountCents: invoice.amountCents,
    openAmountCents,
    paidAmountCents: Math.max(invoice.amountCents - openAmountCents, 0),
    status,
    sourceStatus: invoice.status,
    ...(invoice.issuedAt ? { issuedAt: invoice.issuedAt } : {}),
    ...(invoice.dueDate ? { dueDate: invoice.dueDate } : {}),
    ...(daysPastDue !== undefined ? { daysPastDue } : {}),
    tags: buildInvoiceTags({
      status,
      importMode: descriptor.importMode,
      ...(invoice.branchExternalId ? { branchId: invoice.branchExternalId } : {}),
    }),
    metadata: { ...invoice.metadata },
  };
}

export function mapBusinessCentralInvoiceToIndexEntry(
  invoice: BusinessCentralInvoiceRecord,
): InvoiceIndexEntry {
  const status = normalizeConnectorStatus(invoice.status);
  const openAmountCents = Math.max(invoice.remainingAmountCents, 0);
  const daysPastDue = computeDaysPastDue(invoice.dueDate);

  return {
    id: `business_central:${invoice.externalId}`,
    sourceProvider: businessCentralDescriptor.provider,
    sourceKind: businessCentralDescriptor.kind,
    sourceLabel: businessCentralDescriptor.label,
    importMode: businessCentralDescriptor.importMode,
    externalId: invoice.externalId,
    customerName: invoice.customerName,
    ...(invoice.customerNumber ? { customerReference: invoice.customerNumber } : {}),
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currencyCode,
    totalAmountCents: invoice.totalAmountCents,
    openAmountCents,
    paidAmountCents: Math.max(invoice.totalAmountCents - openAmountCents, 0),
    status,
    sourceStatus: invoice.status,
    ...(invoice.invoiceDate ? { issuedAt: invoice.invoiceDate } : {}),
    ...(invoice.dueDate ? { dueDate: invoice.dueDate } : {}),
    ...(daysPastDue !== undefined ? { daysPastDue } : {}),
    tags: buildInvoiceTags({
      status,
      importMode: businessCentralDescriptor.importMode,
      ...(invoice.contactName ? { contactName: invoice.contactName } : {}),
    }),
    metadata: {
      companyId: invoice.companyId,
      ...(invoice.companyName ? { companyName: invoice.companyName } : {}),
      ...(invoice.contactName ? { contactName: invoice.contactName } : {}),
      ...(invoice.email ? { email: invoice.email } : {}),
      ...(invoice.paymentTermsCode ? { paymentTermsCode: invoice.paymentTermsCode } : {}),
      ...(invoice.paymentTermsLabel ? { paymentTermsLabel: invoice.paymentTermsLabel } : {}),
      ...(invoice.customerPurchaseOrderNumber
        ? { customerPurchaseOrderNumber: invoice.customerPurchaseOrderNumber }
        : {}),
      ...(invoice.salesOrderNumber ? { salesOrderNumber: invoice.salesOrderNumber } : {}),
      ...(invoice.externalDocumentNumber ? { externalDocumentNumber: invoice.externalDocumentNumber } : {}),
      ...(invoice.issuerCompanyName ? { issuerCompanyName: invoice.issuerCompanyName } : {}),
      ...(invoice.issuerAddressSummary ? { issuerAddressSummary: invoice.issuerAddressSummary } : {}),
      ...(invoice.issuerPhone ? { issuerPhone: invoice.issuerPhone } : {}),
      ...(invoice.issuerFax ? { issuerFax: invoice.issuerFax } : {}),
    },
  };
}

export function mapQuickBooksInvoiceToIndexEntry(
  invoice: QuickBooksInvoiceRecord,
): InvoiceIndexEntry {
  const status = normalizeConnectorStatus(invoice.status);
  const openAmountCents = Math.max(invoice.remainingAmountCents, 0);
  const daysPastDue = computeDaysPastDue(invoice.dueDate);

  return {
    id: `quickbooks_online:${invoice.externalId}`,
    sourceProvider: "quickbooks_online",
    sourceKind: "accounting",
    sourceLabel: "QuickBooks Online",
    importMode: "live_connection",
    externalId: invoice.externalId,
    customerName: invoice.customerName,
    ...(invoice.customerNumber ? { customerReference: invoice.customerNumber } : {}),
    ...(invoice.parentAccountName ? { parentAccountName: invoice.parentAccountName } : {}),
    ...(invoice.branchReference ? { branchId: invoice.branchReference } : {}),
    ...(invoice.branchName ? { branchName: invoice.branchName } : {}),
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currencyCode,
    totalAmountCents: invoice.totalAmountCents,
    openAmountCents,
    paidAmountCents: Math.max(invoice.totalAmountCents - openAmountCents, 0),
    status,
    sourceStatus: invoice.status,
    ...(invoice.invoiceDate ? { issuedAt: invoice.invoiceDate } : {}),
    ...(invoice.dueDate ? { dueDate: invoice.dueDate } : {}),
    ...(daysPastDue !== undefined ? { daysPastDue } : {}),
    tags: buildInvoiceTags({
      status,
      importMode: "live_connection",
    }),
    metadata: {
      companyId: invoice.companyId,
      ...(invoice.companyName ? { companyName: invoice.companyName } : {}),
      ...(invoice.email ? { email: invoice.email } : {}),
    },
  };
}

export function mapPersistedSnapshotToIndexEntry(
  row: PersistedInvoiceSnapshotRow,
): InvoiceIndexEntry {
  const provider = normalizePersistedProvider(row.sourceProvider);
  const descriptor = resolveDescriptor(provider);
  const status = row.canonicalState
    ? normalizeCanonicalStatus(row.canonicalState)
    : normalizeConnectorStatus(row.sourceStatus);
  const metadata = {
    ...(row.snapshotMetadata ?? {}),
    ...(row.canonicalMetadata ?? {}),
    canonicalizationStatus: row.canonicalizationStatus,
    ...(row.holdReason ? { holdReason: row.holdReason } : {}),
  };
  const collectibleAmountCents = deriveCollectibleAmount({
    canonicalState: row.canonicalState,
    totalAmountCents: row.totalAmountCents,
    metadata,
  });
  const installmentSummary = deriveInstallmentSummary(metadata);
  const openAmountCents = installmentSummary?.totalRemainingBalanceCents ?? row.openAmountCents;
  const daysPastDue = installmentSummary?.oldestOverdueInstallmentDaysPastDue ?? computeDaysPastDue(row.dueDate);

  return {
    id: `${provider}:${row.externalId}`,
    sourceProvider: provider,
    sourceKind: row.sourceKind,
    sourceLabel: descriptor.label,
    importMode: descriptor.importMode,
    externalId: row.externalId,
    ...(row.canonicalInvoiceId ? { canonicalInvoiceId: row.canonicalInvoiceId } : {}),
    customerName: row.billingAccountName ?? row.customerName,
    ...(row.customerReference ? { customerReference: row.customerReference } : {}),
    ...(row.parentAccountId ? { parentAccountId: row.parentAccountId } : {}),
    ...(row.parentAccountName ? { parentAccountName: row.parentAccountName } : {}),
    ...(row.billingAccountId ? { billingAccountId: row.billingAccountId } : {}),
    ...(row.billingAccountName ? { billingAccountName: row.billingAccountName } : {}),
    ...(row.branchId ? { branchId: row.branchId } : {}),
    ...(row.branchName ? { branchName: row.branchName } : {}),
    invoiceNumber: row.invoiceNumber,
    currency: row.currency,
    totalAmountCents: row.totalAmountCents,
    openAmountCents,
    ...(installmentSummary
      ? {
          overdueAmountCents: installmentSummary.overdueInstallmentsBalanceCents,
          dueNowAmountCents: installmentSummary.dueNowInstallmentsBalanceCents,
          futureAmountCents: installmentSummary.futureInstallmentsBalanceCents,
          ...(installmentSummary.installmentPlanId
            ? { installmentPlanId: installmentSummary.installmentPlanId }
            : {}),
          ...(installmentSummary.oldestOverdueInstallmentDaysPastDue !== undefined
            ? {
                oldestOverdueInstallmentDaysPastDue:
                  installmentSummary.oldestOverdueInstallmentDaysPastDue,
              }
            : {}),
          missedInstallmentCount: installmentSummary.missedInstallmentCount,
          ...(installmentSummary.nextInstallmentDueDate
            ? { nextInstallmentDueDate: installmentSummary.nextInstallmentDueDate }
            : {}),
          ...(installmentSummary.nextInstallmentAmountCents !== undefined
            ? { nextInstallmentAmountCents: installmentSummary.nextInstallmentAmountCents }
            : {}),
        }
      : {}),
    ...(collectibleAmountCents !== undefined ? { collectibleAmountCents } : {}),
    paidAmountCents: Math.max(row.totalAmountCents - openAmountCents, 0),
    status,
    sourceStatus: row.sourceStatus,
    ...(row.issuedAt ? { issuedAt: row.issuedAt } : {}),
    ...(row.dueDate ? { dueDate: row.dueDate } : {}),
    ...(row.lastImportedAt ? { lastImportedAt: row.lastImportedAt } : {}),
    ...(daysPastDue !== undefined ? { daysPastDue } : {}),
    tags: buildInvoiceTags({
      status,
      importMode: descriptor.importMode,
      ...(row.branchId ? { branchId: row.branchId } : {}),
      ...(readStringMetadata(metadata, "contactName")
        ? { contactName: readStringMetadata(metadata, "contactName") }
        : {}),
      ...(row.canonicalState ? { canonicalState: row.canonicalState } : {}),
    }).concat(row.canonicalInvoiceId ? ["canonical-linked"] : ["held-import"]),
    metadata,
  };
}

function buildSeedInvoiceEntries(seed: SeedBundle): InvoiceIndexEntry[] {
  const billingAccountById = new Map(
    seed.billingAccounts.map((billingAccount) => [billingAccount.id, billingAccount]),
  );
  const parentAccountById = new Map(
    seed.parentAccounts.map((parentAccount) => [parentAccount.id, parentAccount]),
  );
  const branchById = new Map(seed.branches.map((branch) => [branch.id, branch]));

  return seed.invoices.map((invoice) =>
    mapSeedInvoiceToIndexEntry(invoice, {
      ...(billingAccountById.get(invoice.billingAccountId)?.displayName
        ? { billingAccountName: billingAccountById.get(invoice.billingAccountId)?.displayName }
        : {}),
      ...(parentAccountById.get(invoice.parentAccountId)?.name
        ? { parentAccountName: parentAccountById.get(invoice.parentAccountId)?.name }
        : {}),
      ...(invoice.branchId && branchById.get(invoice.branchId)?.name
        ? { branchName: branchById.get(invoice.branchId)?.name }
        : {}),
    }),
  );
}

export function mapSeedInvoiceToIndexEntry(
  invoice: CustomerInvoice,
  names: {
    billingAccountName?: string | undefined;
    parentAccountName?: string | undefined;
    branchName?: string | undefined;
  },
): InvoiceIndexEntry {
  const status = normalizeCanonicalStatus(invoice.state);
  const installmentSummary = deriveInstallmentSummary(invoice.metadata);
  const openAmountCents =
    installmentSummary?.totalRemainingBalanceCents ?? deriveSeedOpenAmount(invoice, status);
  const collectibleAmountCents = deriveCollectibleAmount({
    canonicalState: invoice.state,
    totalAmountCents: invoice.amountCents,
    invoice,
    metadata: invoice.metadata,
  });
  const daysPastDue =
    installmentSummary?.oldestOverdueInstallmentDaysPastDue ?? computeDaysPastDue(invoice.dueDate);

  return {
    id: `seed_demo:${invoice.id}`,
    sourceProvider: seedDescriptor.provider,
    sourceKind: seedDescriptor.kind,
    sourceLabel: seedDescriptor.label,
    importMode: seedDescriptor.importMode,
    canonicalInvoiceId: invoice.id,
    customerName: names.billingAccountName ?? invoice.billingAccountId,
    parentAccountId: invoice.parentAccountId,
    ...(names.parentAccountName ? { parentAccountName: names.parentAccountName } : {}),
    billingAccountId: invoice.billingAccountId,
    ...(names.billingAccountName ? { billingAccountName: names.billingAccountName } : {}),
    ...(invoice.branchId ? { branchId: invoice.branchId } : {}),
    ...(names.branchName ? { branchName: names.branchName } : {}),
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currency,
    totalAmountCents: invoice.amountCents,
    openAmountCents,
    ...(installmentSummary
      ? {
          overdueAmountCents: installmentSummary.overdueInstallmentsBalanceCents,
          dueNowAmountCents: installmentSummary.dueNowInstallmentsBalanceCents,
          futureAmountCents: installmentSummary.futureInstallmentsBalanceCents,
          ...(installmentSummary.installmentPlanId
            ? { installmentPlanId: installmentSummary.installmentPlanId }
            : {}),
          ...(installmentSummary.oldestOverdueInstallmentDaysPastDue !== undefined
            ? {
                oldestOverdueInstallmentDaysPastDue:
                  installmentSummary.oldestOverdueInstallmentDaysPastDue,
              }
            : {}),
          missedInstallmentCount: installmentSummary.missedInstallmentCount,
          ...(installmentSummary.nextInstallmentDueDate
            ? { nextInstallmentDueDate: installmentSummary.nextInstallmentDueDate }
            : {}),
          ...(installmentSummary.nextInstallmentAmountCents !== undefined
            ? { nextInstallmentAmountCents: installmentSummary.nextInstallmentAmountCents }
            : {}),
        }
      : {}),
    ...(collectibleAmountCents !== undefined ? { collectibleAmountCents } : {}),
    paidAmountCents: Math.max(invoice.amountCents - openAmountCents, 0),
    status,
    sourceStatus: invoice.state,
    ...(invoice.invoiceDate ? { issuedAt: invoice.invoiceDate } : {}),
    ...(invoice.dueDate ? { dueDate: invoice.dueDate } : {}),
    ...(invoice.updatedAt ? { lastImportedAt: invoice.updatedAt } : {}),
    ...(daysPastDue !== undefined ? { daysPastDue } : {}),
    tags: buildInvoiceTags({
      status,
      importMode: seedDescriptor.importMode,
      canonicalState: invoice.state,
      ...(invoice.branchId ? { branchId: invoice.branchId } : {}),
    }).concat(installmentSummary ? ["installment-plan"] : []),
    metadata: { ...invoice.metadata },
  };
}

function buildInvoiceIndexSummary(entries: InvoiceIndexEntry[]): InvoiceIndexResponse["summary"] {
  return {
    totalInvoices: entries.length,
    totalAmountCents: entries.reduce((sum, entry) => sum + entry.totalAmountCents, 0),
    openAmountCents: entries.reduce((sum, entry) => sum + entry.openAmountCents, 0),
    openInvoiceCount: entries.filter((entry) => entry.status === "open" || entry.status === "partial").length,
    overdueInvoiceCount: entries.filter((entry) => getEntryOverdueAmountCents(entry) > 0).length,
    disputedInvoiceCount: entries.filter((entry) => entry.status === "disputed").length,
    paidInvoiceCount: entries.filter((entry) => entry.status === "paid").length,
    connectedProviderCount: new Set(
      entries
        .filter((entry) => entry.importMode === "live_connection")
        .map((entry) => entry.sourceProvider),
    ).size,
  };
}

function getEntryOverdueAmountCents(entry: InvoiceIndexEntry): number {
  if (typeof entry.overdueAmountCents === "number") {
    return entry.overdueAmountCents;
  }
  return (entry.daysPastDue ?? 0) > 0 ? entry.openAmountCents : 0;
}

function deriveInstallmentSummary(metadata: Record<string, unknown>): ({
  totalRemainingBalanceCents: number;
  futureInstallmentsBalanceCents: number;
  dueNowInstallmentsBalanceCents: number;
  overdueInstallmentsBalanceCents: number;
  oldestOverdueInstallmentDaysPastDue?: number;
  missedInstallmentCount: number;
  nextInstallmentDueDate?: string;
  nextInstallmentAmountCents?: number;
  activeInstallmentCount: number;
  installmentPlanId?: string;
}) | undefined {
  const plan = readRecordMetadata(metadata, "installmentPlan");
  const lineRecords = readRecordArrayMetadata(metadata, "installmentLines");
  if (lineRecords.length === 0) {
    return undefined;
  }

  const lines: InstallmentLine[] = lineRecords.map((line, index) => {
    const parentInvoiceId = readStringRecord(line, "parentInvoiceId");
    const branchId = readStringRecord(line, "branchId");
    const lastPromiseToPayDate = readStringRecord(line, "lastPromiseToPayDate");
    return createInstallmentLine({
      id: readStringRecord(line, "installmentLineId") ?? `installment-line-${index + 1}`,
      createdAt: readStringRecord(line, "createdAt") ?? "2026-01-01T00:00:00.000Z",
      installmentPlanId:
        readStringRecord(line, "installmentPlanId") ??
        readStringRecord(plan, "installmentPlanId") ??
        "installment-plan",
      ...(parentInvoiceId ? { parentInvoiceId } : {}),
      billingAccountId: readStringRecord(line, "billingAccountId") ?? "billing-account",
      ...(branchId ? { branchId } : {}),
      currency: readStringRecord(line, "currency") ?? "PHP",
      sequenceNumber: readNumberRecord(line, "sequenceNumber") ?? index + 1,
      dueDate: readStringRecord(line, "dueDate") ?? "2026-01-01",
      scheduledAmountCents: readNumberRecord(line, "scheduledAmountCents") ?? 0,
      paidAmountCents: readNumberRecord(line, "paidAmountCents") ?? 0,
      remainingAmountCents: readNumberRecord(line, "remainingAmountCents") ?? 0,
      status: normalizeInstallmentLineStatus(readStringRecord(line, "status")),
      daysPastDue: readNumberRecord(line, "daysPastDue") ?? 0,
      ...(lastPromiseToPayDate ? { lastPromiseToPayDate } : {}),
      metadata: line,
    });
  });

  const activeLines = lines.filter((line) => line.remainingAmountCents > 0);
  const overdueLines = activeLines.filter(
    (line) => line.state === "overdue" || (line.daysPastDue ?? 0) > 0,
  );
  const dueNowLines = activeLines.filter((line) =>
    line.state === "due" || line.state === "partially_paid" || line.state === "promised",
  );
  const futureLines = activeLines.filter((line) => line.state === "future");
  const nextLine = activeLines
    .filter((line) => line.state !== "overdue")
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.sequenceNumber - right.sequenceNumber)[0];
  const summary = {
    totalRemainingBalanceCents: activeLines.reduce((sum, line) => sum + line.remainingAmountCents, 0),
    futureInstallmentsBalanceCents: futureLines.reduce((sum, line) => sum + line.remainingAmountCents, 0),
    dueNowInstallmentsBalanceCents: dueNowLines.reduce((sum, line) => sum + line.remainingAmountCents, 0),
    overdueInstallmentsBalanceCents: overdueLines.reduce((sum, line) => sum + line.remainingAmountCents, 0),
    ...(overdueLines.length > 0
      ? {
          oldestOverdueInstallmentDaysPastDue: Math.max(...overdueLines.map((line) => line.daysPastDue ?? 0)),
        }
      : {}),
    missedInstallmentCount: overdueLines.length,
    ...(nextLine ? { nextInstallmentDueDate: nextLine.dueDate, nextInstallmentAmountCents: nextLine.remainingAmountCents } : {}),
    activeInstallmentCount: activeLines.length,
  };
  const installmentPlanId =
    readStringRecord(plan, "installmentPlanId") ?? readStringRecord(lines[0]?.metadata ?? {}, "installmentPlanId");
  return {
    ...summary,
    ...(installmentPlanId ? { installmentPlanId } : {}),
  };
}

function normalizeInstallmentLineStatus(value: string | undefined): InstallmentLine["state"] {
  switch (value) {
    case "due":
    case "partially_paid":
    case "overdue":
    case "promised":
    case "disputed":
    case "paid":
    case "restructured":
      return value;
    default:
      return "future";
  }
}

function readRecordMetadata(value: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const candidate = value[key];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return undefined;
  }
  return candidate as Record<string, unknown>;
}

function readRecordArrayMetadata(value: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const candidate = value[key];
  return Array.isArray(candidate)
    ? candidate.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    : [];
}

function readStringRecord(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const candidate = value?.[key];
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

function readNumberRecord(value: Record<string, unknown> | undefined, key: string): number | undefined {
  const candidate = value?.[key];
  return Number.isInteger(candidate) ? (candidate as number) : undefined;
}

function buildProviderSummaries(entries: InvoiceIndexEntry[]): InvoiceIndexProviderSummary[] {
  const grouped = new Map<string, InvoiceIndexProviderSummary>();

  for (const entry of entries) {
    const existing = grouped.get(entry.sourceProvider);
    if (existing) {
      existing.invoiceCount += 1;
      existing.openInvoiceCount += entry.openAmountCents > 0 ? 1 : 0;
      existing.totalAmountCents += entry.totalAmountCents;
      existing.openAmountCents += entry.openAmountCents;
      continue;
    }

    grouped.set(entry.sourceProvider, {
      provider: entry.sourceProvider,
      label: entry.sourceLabel,
      kind: entry.sourceKind,
      importMode: entry.importMode,
      invoiceCount: 1,
      openInvoiceCount: entry.openAmountCents > 0 ? 1 : 0,
      totalAmountCents: entry.totalAmountCents,
      openAmountCents: entry.openAmountCents,
    });
  }

  return [...grouped.values()].sort((left, right) => right.invoiceCount - left.invoiceCount);
}

function buildStatusSummaries(entries: InvoiceIndexEntry[]): InvoiceIndexStatusSummary[] {
  const statuses: InvoiceIndexStatus[] = ["open", "partial", "disputed", "paid", "voided"];
  return statuses.map((status) => {
    const matching = entries.filter((entry) => entry.status === status);
    return {
      status,
      invoiceCount: matching.length,
      totalAmountCents: matching.reduce((sum, entry) => sum + entry.totalAmountCents, 0),
      openAmountCents: matching.reduce((sum, entry) => sum + entry.openAmountCents, 0),
    };
  });
}

function normalizeCanonicalStatus(state: CustomerInvoice["state"]): InvoiceIndexStatus {
  switch (state) {
    case "paid":
      return "paid";
    case "partially_paid":
      return "partial";
    case "disputed_partial":
    case "disputed_full":
      return "disputed";
    case "voided":
      return "voided";
    default:
      return "open";
  }
}

function normalizeConnectorStatus(status: string): InvoiceIndexStatus {
  switch (status) {
    case "paid":
      return "paid";
    case "partial":
    case "partially_paid":
      return "partial";
    case "disputed":
      return "disputed";
    case "voided":
      return "voided";
    default:
      return "open";
  }
}

function normalizePersistedProvider(provider: string): InvoiceIndexProvider {
  if (provider === "business_central" || provider === "seed_demo") {
    return provider;
  }

  return provider as InvoiceIndexProvider;
}

function deriveSeedOpenAmount(invoice: CustomerInvoice, status: InvoiceIndexStatus) {
  const metadataOpenAmount = readNumericMetadata(invoice.metadata, "openAmountCents");
  if (typeof metadataOpenAmount === "number") {
    return metadataOpenAmount;
  }

  switch (status) {
    case "paid":
    case "voided":
      return 0;
    case "partial":
      return Math.round(invoice.amountCents / 2);
    default:
      return invoice.amountCents;
  }
}

function deriveCollectibleAmount(input: {
  canonicalState: CustomerInvoice["state"] | undefined;
  totalAmountCents: number;
  invoice?: CustomerInvoice;
  metadata: Record<string, unknown>;
}): number | undefined {
  if (input.canonicalState !== "disputed_partial") {
    return undefined;
  }

  if (input.invoice) {
    const collectibleAmount = getCollectibleAmountCents(input.invoice);
    return collectibleAmount > 0 ? collectibleAmount : undefined;
  }

  const collectibleFromMetadata = readNumericMetadata(input.metadata, "collectibleAmountCents");
  if (
    collectibleFromMetadata !== undefined &&
    collectibleFromMetadata >= 0 &&
    collectibleFromMetadata <= input.totalAmountCents
  ) {
    return collectibleFromMetadata;
  }

  const disputedAmount = readNumericMetadata(input.metadata, "disputedAmountCents");
  if (
    disputedAmount !== undefined &&
    disputedAmount >= 0 &&
    disputedAmount <= input.totalAmountCents
  ) {
    return Math.max(input.totalAmountCents - disputedAmount, 0);
  }

  return undefined;
}

function computeDaysPastDue(dueDate?: string) {
  if (!dueDate) {
    return undefined;
  }

  const due = Date.parse(dueDate);
  if (!Number.isFinite(due)) {
    return undefined;
  }

  const diffMs = Date.now() - due;
  const diffDays = Math.floor(diffMs / 86_400_000);
  return diffDays > 0 ? diffDays : 0;
}

function sortInvoiceEntries(entries: InvoiceIndexEntry[]) {
  return [...entries].sort((left, right) => {
    const leftImported = left.lastImportedAt ?? left.issuedAt ?? "";
    const rightImported = right.lastImportedAt ?? right.issuedAt ?? "";
    return rightImported.localeCompare(leftImported);
  });
}

function buildInvoiceTags(input: {
  status: InvoiceIndexStatus;
  importMode: InvoiceIndexImportMode;
  branchId?: string | undefined;
  contactName?: string | undefined;
  canonicalState?: string | undefined;
}) {
  const tags = [
    input.importMode === "live_connection"
      ? "live"
      : input.importMode === "manual_upload"
        ? "manual-upload"
        : "seeded",
    input.status,
  ];

  if (input.branchId) {
    tags.push("branch-tagged");
  }

  if (input.contactName) {
    tags.push("contact-visible");
  }

  if (input.canonicalState?.startsWith("disputed_")) {
    tags.push("collections-blocked");
  }

  return tags;
}

function resolveDescriptor(provider: InvoiceIndexProvider): InvoiceSourceDescriptor {
  if (provider === "business_central") {
    return businessCentralDescriptor;
  }

  if (provider === "spreadsheet_upload") {
    return {
      provider,
      label: "Spreadsheet upload",
      kind: "spreadsheet",
      importMode: "manual_upload",
    };
  }

  if (provider === "seed_demo") {
    return seedDescriptor;
  }

  return connectorDescriptorByProvider.get(provider) ?? {
    provider,
    label: provider,
    kind: "accounting",
    importMode: "live_connection",
  };
}

function readNumericMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "number" ? value : undefined;
}

function readStringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
}

function safeTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function queryJsonRows<T>(databaseUrl: string, sql: string): T[] {
  const result = spawnSync("psql", [databaseUrl, "-t", "-A", "-c", sql], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || "psql query failed.");
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

function quoteLiteral(value: string) {
  return value.replaceAll("'", "''");
}

function jsonLiteral(value: unknown) {
  return quoteLiteral(JSON.stringify(value));
}
