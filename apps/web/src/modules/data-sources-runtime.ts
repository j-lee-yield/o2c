import type { InvoiceIndexEntry } from "@o2c/contracts";
import { mergeInvoiceEntriesWithoutDuplicates } from "./invoice-import-dedupe.js";

export interface DataSourceIntegrationRecord {
  id: string;
  name: string;
  category: string;
  status: "connected" | "pending";
  syncFrequency: string;
  detail: string;
  createdAt: string;
}

export interface DataSourceUploadRecord {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  uploadedAt: string;
  sourceLabel: string;
  status: "processing" | "review";
  detail: string;
  importedInvoiceCount?: number;
  duplicateInvoiceCount?: number;
  heldRowCount?: number;
  reviewNotes?: string[];
}

export interface DataSourcesRuntimeSnapshot {
  integrations: DataSourceIntegrationRecord[];
  uploads: DataSourceUploadRecord[];
  importedInvoices: InvoiceIndexEntry[];
}

const runtimeState: DataSourcesRuntimeSnapshot = {
  integrations: [
    {
      id: "sap-business-one",
      name: "SAP Business One",
      category: "ERP",
      status: "connected",
      syncFrequency: "Every 30 minutes",
      detail: "Customers, invoices, and payments are syncing cleanly.",
      createdAt: "2026-04-06T08:45:00.000Z",
    },
    {
      id: "google-workspace",
      name: "Google Workspace",
      category: "Email",
      status: "connected",
      syncFrequency: "Real-time",
      detail: "Inbox and remittance attachments are monitored.",
      createdAt: "2026-04-06T08:55:00.000Z",
    },
    {
      id: "google-sheets",
      name: "Google Sheets",
      category: "Spreadsheet",
      status: "connected",
      syncFrequency: "Daily at 8:00 AM",
      detail: "Payment schedules and customer masters are imported.",
      createdAt: "2026-04-06T09:05:00.000Z",
    },
    {
      id: "bpi-corporate-banking",
      name: "BPI Corporate Banking",
      category: "Bank",
      status: "connected",
      syncFrequency: "Every 2 hours",
      detail: "Statements and transaction feeds are available for matching.",
      createdAt: "2026-04-06T09:15:00.000Z",
    },
  ],
  uploads: [
    {
      id: "upload-q1-2026-invoices",
      fileName: "Q1_2026_Invoices.xlsx",
      fileSizeBytes: 2_420_000,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      uploadedAt: "2026-04-06T10:30:00.000Z",
      sourceLabel: "Manual upload",
      status: "review",
      detail: "47 invoices, 12 customers",
    },
    {
      id: "upload-march-statements",
      fileName: "March_Statements.pdf",
      fileSizeBytes: 934_000,
      mimeType: "application/pdf",
      uploadedAt: "2026-04-06T09:45:00.000Z",
      sourceLabel: "Manual upload",
      status: "processing",
      detail: "Processing...",
    },
  ],
  importedInvoices: [],
};

export function listDataSourceRuntimeSnapshot(): DataSourcesRuntimeSnapshot {
  return {
    integrations: [...runtimeState.integrations],
    uploads: [...runtimeState.uploads],
    importedInvoices: [...runtimeState.importedInvoices],
  };
}

export function createDataSourceIntegration(input: {
  name: string;
  category: string;
  syncFrequency: string;
  detail?: string;
}) {
  const now = new Date().toISOString();
  const record: DataSourceIntegrationRecord = {
    id: slugify(`${input.category}-${input.name}-${now}`),
    name: input.name.trim(),
    category: input.category.trim(),
    status: "connected",
    syncFrequency: input.syncFrequency.trim(),
    detail:
      input.detail?.trim() ||
      "Connection saved. Map fields and review the first sync before downstream updates.",
    createdAt: now,
  };

  runtimeState.integrations.unshift(record);
  return record;
}

export function createDataSourceUpload(input: {
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  sourceLabel?: string;
  status?: "processing" | "review";
  detail?: string;
  importedInvoiceCount?: number;
  duplicateInvoiceCount?: number;
  heldRowCount?: number;
  reviewNotes?: string[];
}) {
  const now = new Date().toISOString();
  const lowerName = input.fileName.toLowerCase();
  const isSpreadsheet = lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls") || lowerName.endsWith(".csv");
  const record: DataSourceUploadRecord = {
    id: slugify(`upload-${input.fileName}-${now}`),
    fileName: input.fileName,
    fileSizeBytes: input.fileSizeBytes,
    mimeType: input.mimeType,
    uploadedAt: now,
    sourceLabel: input.sourceLabel?.trim() || "Manual upload",
    status: input.status ?? (isSpreadsheet ? "review" : "processing"),
    detail:
      input.detail ??
      (isSpreadsheet ? "Uploaded and ready for mapping review" : "File received and queued for extraction"),
    ...(input.importedInvoiceCount !== undefined ? { importedInvoiceCount: input.importedInvoiceCount } : {}),
    ...(input.duplicateInvoiceCount !== undefined ? { duplicateInvoiceCount: input.duplicateInvoiceCount } : {}),
    ...(input.heldRowCount !== undefined ? { heldRowCount: input.heldRowCount } : {}),
    ...(input.reviewNotes ? { reviewNotes: input.reviewNotes } : {}),
  };

  runtimeState.uploads.unshift(record);
  return record;
}

export function recordImportedInvoices(entries: InvoiceIndexEntry[]) {
  const result = mergeInvoiceEntriesWithoutDuplicates(runtimeState.importedInvoices, entries);
  runtimeState.importedInvoices = result.invoices;
  return {
    importedInvoiceCount: Math.max(entries.length - result.duplicateCount, 0),
    duplicateInvoiceCount: result.duplicateCount,
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
