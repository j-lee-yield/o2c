import type { SpreadsheetImportedInvoiceRecord } from "../bootstrap/imported-invoice-sync-service.js";

export interface SpreadsheetInvoiceFileImportResult {
  invoices: SpreadsheetImportedInvoiceRecord[];
  heldRows: Array<{
    rowNumber: number;
    reason: string;
  }>;
  sheetName: string;
}

export function parseSpreadsheetInvoiceFile(input: {
  uploadId: string;
  fileName: string;
  buffer: Buffer;
}): SpreadsheetInvoiceFileImportResult {
  if (!input.fileName.toLowerCase().endsWith(".csv")) {
    throw new Error("Raw spreadsheet upload currently supports CSV files only.");
  }

  const rows = parseCsv(input.buffer.toString("utf8"));
  if (rows.length === 0) {
    return {
      invoices: [],
      heldRows: [{ rowNumber: 1, reason: "CSV file does not contain any readable rows." }],
      sheetName: "CSV",
    };
  }

  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    return {
      invoices: [],
      heldRows: [{ rowNumber: 1, reason: "CSV file does not contain a header row." }],
      sheetName: "CSV",
    };
  }

  const headers = headerRow.map((value) => normalizeHeader(value));
  const invoices: SpreadsheetImportedInvoiceRecord[] = [];
  const heldRows: Array<{ rowNumber: number; reason: string }> = [];

  dataRows.forEach((values, index) => {
    const rowNumber = index + 2;
    const row = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? ""]));

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

    const currencyCode = pickString(row, ["currency", "currency_code"]) ?? "PHP";
    const remainingAmountCents = clampOpenAmount(
      openAmountCandidate ?? totalAmountCents,
      totalAmountCents,
    );
    const statusLabel = pickString(row, ["status", "invoice_status", "source_status"]);
    const status = resolveStatus({
      totalAmountCents,
      openAmountCents: remainingAmountCents,
      ...(statusLabel ? { statusLabel } : {}),
    });

    const externalId =
      pickString(row, ["external_id", "source_id"]) ?? `spreadsheet_upload:${input.uploadId}:${rowNumber}`;

    const customerNumber = pickString(row, [
      "customer_reference",
      "customer_number",
      "account_number",
      "cardcode",
    ]);
    const contactName = pickString(row, ["contact_name", "collector_contact", "attention_to"]);
    const email = pickString(row, ["email", "contact_email"]);
    const dueDate = normalizeDate(pickString(row, ["due_date", "due", "due_on"]));
    const invoiceDate = normalizeDate(
      pickString(row, ["invoice_date", "invoice_issue_date", "issue_date", "date", "document_date"]),
    );
    const companyId = pickString(row, ["company_id", "seller_entity_id"]);
    const companyName = pickString(row, ["company_name", "seller_entity_name"]);
    const parentAccountName = pickString(row, ["parent_account_name", "parent_account"]);
    const parentAccountReference = pickString(row, ["parent_account_reference", "parent_account_id"]);
    const branchName = pickString(row, ["branch_name", "branch"]);
    const branchReference = pickString(row, ["branch_id", "branch_reference"]);

    invoices.push({
      externalId,
      invoiceNumber,
      customerName,
      currencyCode,
      totalAmountCents,
      remainingAmountCents,
      status,
      ...(customerNumber ? { customerNumber } : {}),
      ...(contactName ? { contactName } : {}),
      ...(email ? { email } : {}),
      ...(dueDate ? { dueDate } : {}),
      ...(invoiceDate ? { invoiceDate } : {}),
      ...(companyId ? { companyId } : {}),
      ...(companyName ? { companyName } : {}),
      ...(parentAccountName ? { parentAccountName } : {}),
      ...(parentAccountReference ? { parentAccountReference } : {}),
      ...(branchName ? { branchName } : {}),
      ...(branchReference ? { branchReference } : {}),
    });
  });

  return { invoices, heldRows, sheetName: "CSV" };
}

function parseCsv(content: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const nextCharacter = content[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && character === ",") {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (!inQuotes && (character === "\n" || character === "\r")) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows.map((row) => row.map((value) => value.trim()));
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pickString(row: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[alias];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function parseCurrencyCents(value?: string) {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/\((.*)\)/, "-$1").replace(/[^0-9.-]/g, "");
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

  return undefined;
}

function resolveStatus(input: {
  statusLabel?: string;
  totalAmountCents: number;
  openAmountCents: number;
}) {
  const label = input.statusLabel?.toLowerCase() ?? "";
  if (label.includes("disput")) {
    return "disputed";
  }
  if (label.includes("paid") && input.openAmountCents === 0) {
    return "paid";
  }
  if (label.includes("partial") || input.openAmountCents < input.totalAmountCents) {
    return "partially_paid";
  }
  if (label.includes("void")) {
    return "voided";
  }
  return "open";
}

function clampOpenAmount(openAmountCents: number, totalAmountCents: number) {
  return Math.max(0, Math.min(openAmountCents, totalAmountCents));
}

function isBlankRow(row: Record<string, unknown>) {
  return Object.values(row).every((value) => String(value ?? "").trim().length === 0);
}
