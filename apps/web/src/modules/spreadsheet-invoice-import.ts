import { read, utils } from "xlsx";
import type { InvoiceIndexEntry, InvoiceIndexStatus } from "@o2c/contracts";

export interface SpreadsheetInvoiceImportResult {
  invoices: InvoiceIndexEntry[];
  heldRows: Array<{
    rowNumber: number;
    reason: string;
  }>;
  sheetName: string;
}

export async function parseSpreadsheetInvoiceImport(input: {
  uploadId: string;
  fileName: string;
  file: File;
}): Promise<SpreadsheetInvoiceImportResult> {
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const workbook = read(buffer, {
    type: "buffer",
    cellDates: false,
    dense: false,
  });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return {
      invoices: [],
      heldRows: [{ rowNumber: 1, reason: "Workbook does not contain a readable sheet." }],
      sheetName: "Unknown",
    };
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return {
      invoices: [],
      heldRows: [{ rowNumber: 1, reason: `Sheet ${sheetName} could not be read.` }],
      sheetName,
    };
  }
  const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  const invoices: InvoiceIndexEntry[] = [];
  const heldRows: Array<{ rowNumber: number; reason: string }> = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (isBlankRow(row)) {
      return;
    }

    const invoiceNumber = pickString(row, [
      "invoice_number",
      "invoice_no",
      "invoice_no_",
      "invoice",
      "invoice_id",
      "document_number",
      "docnum",
    ]);
    const customerName =
      pickString(row, [
        "customer_name",
        "client_name",
        "customer",
        "account_name",
        "buyer_name",
        "billing_account_name",
        "cardname",
      ]) ?? "";
    const totalAmountCents = parseCurrencyCents(
      pickString(row, ["total_amount", "amount", "invoice_amount", "invoice_amount_", "total", "doctotal"]),
    );
    const openAmountCandidate = parseCurrencyCents(
      pickString(row, ["open_amount", "outstanding_amount", "remaining_amount", "balance_due"]),
    );

    if (!invoiceNumber) {
      heldRows.push({ rowNumber, reason: "Missing invoice number." });
      return;
    }
    if (!customerName) {
      heldRows.push({ rowNumber, reason: `Invoice ${invoiceNumber} is missing a customer name.` });
      return;
    }
    if (totalAmountCents === undefined || totalAmountCents <= 0) {
      heldRows.push({ rowNumber, reason: `Invoice ${invoiceNumber} has an invalid total amount.` });
      return;
    }

    const currency = pickString(row, ["currency", "currency_code"]) ?? "PHP";
    const openAmountCents = clampOpenAmount(openAmountCandidate ?? totalAmountCents, totalAmountCents);
    const statusLabel = pickString(row, ["status", "invoice_status", "source_status"]);
    const status = resolveStatus({
      totalAmountCents,
      openAmountCents,
      ...(statusLabel ? { statusLabel } : {}),
    });
    const invoiceDate = normalizeDate(
      pickString(row, [
        "invoice_date",
        "invoice_issue_date",
        "issue_date",
        "date",
        "document_date",
      ]),
    );
    const dueDate = normalizeDate(pickString(row, ["due_date", "due", "due_on"]));

    const externalId = pickString(row, ["external_id", "source_id"]);
    const customerReference = pickString(row, ["customer_reference", "customer_number", "account_number", "cardcode"]);
    const parentAccountName = pickString(row, ["parent_account_name", "parent_account"]);
    const billingAccountId = pickString(row, ["billing_account_id"]);
    const billingAccountName =
      pickString(row, ["billing_account_name", "billing_account"]) ??
      pickString(row, ["account_name"]);
    const branchId = pickString(row, ["branch_id"]);
    const branchName = pickString(row, ["branch_name", "branch"]);

    const daysPastDue = computeDaysPastDue(dueDate);

    invoices.push({
      id: `spreadsheet_upload:${input.uploadId}:${rowNumber}`,
      sourceProvider: "spreadsheet_upload",
      sourceKind: "spreadsheet",
      sourceLabel: input.fileName,
      importMode: "manual_upload",
      ...(externalId ? { externalId } : {}),
      customerName,
      ...(customerReference ? { customerReference } : {}),
      ...(parentAccountName ? { parentAccountName } : {}),
      ...(billingAccountId ? { billingAccountId } : {}),
      ...(billingAccountName ? { billingAccountName } : {}),
      ...(branchId ? { branchId } : {}),
      ...(branchName ? { branchName } : {}),
      invoiceNumber,
      currency,
      totalAmountCents,
      openAmountCents,
      collectibleAmountCents: status === "disputed" ? 0 : openAmountCents,
      paidAmountCents: Math.max(totalAmountCents - openAmountCents, 0),
      status,
      sourceStatus: pickString(row, ["status", "invoice_status", "source_status"]) ?? status,
      ...(invoiceDate ? { issuedAt: invoiceDate } : {}),
      ...(dueDate ? { dueDate } : {}),
      lastImportedAt: new Date().toISOString(),
      ...(daysPastDue !== undefined ? { daysPastDue } : {}),
      tags: [
        "manual-upload",
        "spreadsheet",
        status,
        ...(pickString(row, ["branch_name", "branch", "branch_id"]) ? ["branch-tagged"] : []),
      ],
      metadata: {
        fileName: input.fileName,
        sheetName,
        rowNumber,
      },
    });
  });

  return { invoices, heldRows, sheetName };
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pickString(row: Record<string, unknown>, aliases: string[]) {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined || value === null) {
      continue;
    }
    normalized.set(normalizeHeader(key), String(value).trim());
  }

  for (const alias of aliases) {
    const value = normalized.get(alias);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function parseCurrencyCents(value?: string) {
  if (!value) {
    return undefined;
  }
  const normalized = value
    .replace(/\((.*)\)/, "-$1")
    .replace(/[^0-9.-]/g, "");
  const numeric = Number.parseFloat(normalized);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return Math.round(numeric * 100);
}

function normalizeDate(value?: string) {
  if (!value) {
    return undefined;
  }

  const slashDateMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashDateMatch) {
    const monthText = slashDateMatch[1];
    const dayText = slashDateMatch[2];
    const yearText = slashDateMatch[3];
    if (!monthText || !dayText || !yearText) {
      return undefined;
    }
    const month = Number.parseInt(monthText, 10);
    const day = Number.parseInt(dayText, 10);
    const rawYear = Number.parseInt(yearText, 10);
    const year = yearText.length === 2 ? 2000 + rawYear : rawYear;

    if (
      Number.isFinite(month) &&
      Number.isFinite(day) &&
      Number.isFinite(year) &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    ) {
      return `${year.toString().padStart(4, "0")}-${monthText.padStart(2, "0")}-${dayText.padStart(2, "0")}`;
    }
  }

  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }

  const excelSerial = Number.parseFloat(value);
  if (Number.isFinite(excelSerial) && excelSerial > 25569) {
    const jsDate = new Date(Math.round((excelSerial - 25569) * 86_400_000));
    return jsDate.toISOString().slice(0, 10);
  }

  return undefined;
}

function resolveStatus(input: {
  statusLabel?: string;
  totalAmountCents: number;
  openAmountCents: number;
}): InvoiceIndexStatus {
  const label = input.statusLabel?.toLowerCase() ?? "";
  if (label.includes("disput")) {
    return "disputed";
  }
  if (label.includes("void")) {
    return "voided";
  }
  if (label.includes("paid") || input.openAmountCents === 0) {
    return "paid";
  }
  if (input.openAmountCents < input.totalAmountCents) {
    return "partial";
  }
  return "open";
}

function clampOpenAmount(openAmountCents: number, totalAmountCents: number) {
  if (openAmountCents < 0) {
    return 0;
  }
  if (openAmountCents > totalAmountCents) {
    return totalAmountCents;
  }
  return openAmountCents;
}

function isBlankRow(row: Record<string, unknown>) {
  return Object.values(row).every((value) => String(value ?? "").trim().length === 0);
}

function computeDaysPastDue(dueDate?: string) {
  if (!dueDate) {
    return undefined;
  }

  const due = Date.parse(dueDate);
  if (!Number.isFinite(due)) {
    return undefined;
  }

  const diffDays = Math.floor((Date.now() - due) / 86_400_000);
  return diffDays > 0 ? diffDays : 0;
}
