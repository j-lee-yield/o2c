export interface ParsedBankStatementTransactionDraft {
  external_transaction_id?: string;
  date: string;
  cheque_number?: string;
  description: string;
  amount: number;
  balance?: number;
  category?: string;
  parser_confidence: number;
  source_row: number;
}

export interface BankStatementFileParseResult {
  statement: {
    account_name?: string;
    account_number_masked?: string;
    currency: string;
    parser_confidence: number;
  };
  transactions: ParsedBankStatementTransactionDraft[];
  heldRows: Array<{
    rowNumber: number;
    reason: string;
  }>;
  sheetName: string;
}

export function parseBankStatementFile(input: {
  fileName: string;
  buffer: Buffer;
}): BankStatementFileParseResult {
  if (!input.fileName.toLowerCase().endsWith(".csv")) {
    throw new Error("Raw bank statement upload currently supports CSV files only.");
  }

  const rows = parseCsv(input.buffer.toString("utf8"));
  if (rows.length === 0) {
    return {
      statement: {
        currency: "PHP",
        parser_confidence: 0,
      },
      transactions: [],
      heldRows: [{ rowNumber: 1, reason: "CSV file does not contain any readable rows." }],
      sheetName: "CSV",
    };
  }

  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    return {
      statement: {
        currency: "PHP",
        parser_confidence: 0,
      },
      transactions: [],
      heldRows: [{ rowNumber: 1, reason: "CSV file does not contain a header row." }],
      sheetName: "CSV",
    };
  }

  const headers = headerRow.map((value) => normalizeHeader(value));
  const transactions: ParsedBankStatementTransactionDraft[] = [];
  const heldRows: Array<{ rowNumber: number; reason: string }> = [];

  dataRows.forEach((values, index) => {
    const rowNumber = index + 2;
    const row = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? ""]));

    if (isBlankRow(row)) {
      return;
    }

    const date = normalizeDate(pickString(row, ["date", "transaction_date", "posted_at"]));
    const description = pickString(row, ["description", "memo", "narration", "particulars"]);
    const amount = parseNumber(pickString(row, ["amount", "transaction_amount"]));
    const balance = parseNumber(pickString(row, ["balance", "running_balance"]));
    const chequeNumber = pickString(row, ["cheque_number", "check_number", "cheque_no", "check_no"]);
    const category = pickString(row, ["category", "transaction_category"]);

    if (!date) {
      heldRows.push({ rowNumber, reason: "Missing or invalid transaction date." });
      return;
    }
    if (!description) {
      heldRows.push({ rowNumber, reason: `Transaction on ${date} is missing a description.` });
      return;
    }
    if (amount === undefined || amount === 0) {
      heldRows.push({ rowNumber, reason: `Transaction ${description} has an invalid amount.` });
      return;
    }

    transactions.push({
      external_transaction_id:
        pickString(row, ["external_transaction_id", "transaction_id", "reference_id"]) ??
        `bank_csv:${input.fileName}:${rowNumber}`,
      date,
      description,
      amount,
      parser_confidence: 0.97,
      source_row: rowNumber,
      ...(chequeNumber ? { cheque_number: chequeNumber } : {}),
      ...(balance !== undefined ? { balance } : {}),
      ...(category ? { category } : {}),
    });
  });

  return {
    statement: {
      account_name: stripExtension(input.fileName),
      currency: "PHP",
      parser_confidence: transactions.length > 0 ? 0.97 : 0,
    },
    transactions,
    heldRows,
    sheetName: "CSV",
  };
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

function parseNumber(value?: string) {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/\((.*)\)/, "-$1").replace(/[^0-9.-]/g, "");
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeDate(value?: string) {
  if (!value) {
    return undefined;
  }

  const slashDateMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashDateMatch) {
    const month = Number.parseInt(slashDateMatch[1] ?? "", 10);
    const day = Number.parseInt(slashDateMatch[2] ?? "", 10);
    const rawYear = Number.parseInt(slashDateMatch[3] ?? "", 10);
    const year = (slashDateMatch[3]?.length ?? 0) === 2 ? 2000 + rawYear : rawYear;

    if (Number.isFinite(month) && Number.isFinite(day) && Number.isFinite(year)) {
      return `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }

  return undefined;
}

function isBlankRow(row: Record<string, unknown>) {
  return Object.values(row).every((value) => String(value ?? "").trim().length === 0);
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}
