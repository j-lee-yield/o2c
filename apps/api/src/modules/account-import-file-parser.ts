export interface ImportedAccountRecord {
  parentAccount: {
    externalId?: string;
    name: string;
    externalReference?: string;
    centrallyServiced?: boolean;
    status: "active" | "inactive";
  };
  billingAccount: {
    externalId?: string;
    accountNumber: string;
    displayName: string;
    currency: string;
    accountTier: "standard" | "strategic";
    erpCustomerId?: string;
    centrallyPaid: boolean;
    status: "active" | "inactive";
  };
  branch?: {
    externalId?: string;
    code: string;
    name: string;
    region?: string;
    countryCode?: string;
    status: "active" | "inactive";
  };
  contact?: {
    externalId?: string;
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
    scope: "parent_account" | "billing_account" | "branch";
    isPrimary: boolean;
    isVerified: boolean;
    allowAutoSend: boolean;
    recentSuccessfulResponses: number;
  };
}

export interface AccountImportFileParseResult {
  records: ImportedAccountRecord[];
  heldRows: Array<{
    rowNumber: number;
    reason: string;
  }>;
  sheetName: string;
}

export function parseAccountImportFile(input: {
  fileName: string;
  buffer: Buffer;
}): AccountImportFileParseResult {
  if (!input.fileName.toLowerCase().endsWith(".csv")) {
    throw new Error("Raw account import currently supports CSV files only.");
  }

  const rows = parseCsv(input.buffer.toString("utf8"));
  if (rows.length === 0) {
    return {
      records: [],
      heldRows: [{ rowNumber: 1, reason: "CSV file does not contain any readable rows." }],
      sheetName: "CSV",
    };
  }

  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    return {
      records: [],
      heldRows: [{ rowNumber: 1, reason: "CSV file does not contain a header row." }],
      sheetName: "CSV",
    };
  }

  const headers = headerRow.map((value) => normalizeHeader(value));
  const records: ImportedAccountRecord[] = [];
  const heldRows: Array<{ rowNumber: number; reason: string }> = [];

  dataRows.forEach((values, index) => {
    const rowNumber = index + 2;
    const row = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? ""]));

    if (isBlankRow(row)) {
      return;
    }

    const parentAccountName = pickString(row, [
      "parent_account_name",
      "parent_account",
      "company_name",
      "customer_group_name",
    ]);
    const billingAccountNumber = pickString(row, [
      "billing_account_number",
      "account_number",
      "customer_number",
      "erp_customer_number",
    ]);
    const billingAccountDisplayName = pickString(row, [
      "billing_account_name",
      "billing_account_display_name",
      "display_name",
      "customer_name",
      "account_name",
    ]);

    if (!parentAccountName) {
      heldRows.push({ rowNumber, reason: "Missing parent account name." });
      return;
    }
    if (!billingAccountNumber) {
      heldRows.push({ rowNumber, reason: `Account row for ${parentAccountName} is missing a billing account number.` });
      return;
    }
    if (!billingAccountDisplayName) {
      heldRows.push({
        rowNumber,
        reason: `Billing account ${billingAccountNumber} is missing a display name.`,
      });
      return;
    }

    const parentAccountExternalId = pickString(row, ["parent_account_id", "parent_account_external_id"]);
    const parentAccountExternalReference =
      pickString(row, ["parent_account_external_reference", "parent_account_reference"]) ??
      parentAccountExternalId;
    const parentAccountStatus = parseStatus(
      pickString(row, ["parent_account_status", "parent_status", "status"]),
    );
    const centrallyServiced = parseBoolean(pickString(row, ["centrally_serviced", "is_centrally_serviced"]));

    const billingAccountExternalId = pickString(row, ["billing_account_id", "billing_account_external_id"]);
    const erpCustomerId = pickString(row, ["erp_customer_id", "erp_customer_number"]);
    const accountTier = parseAccountTier(pickString(row, ["account_tier", "tier"]));
    const billingAccountStatus = parseStatus(
      pickString(row, ["billing_account_status", "billing_status", "status"]),
    );
    const centrallyPaid = parseBoolean(pickString(row, ["centrally_paid", "is_centrally_paid"])) ?? false;

    const branchCode = pickString(row, ["branch_code", "branch"]);
    const branchName = pickString(row, ["branch_name", "store_name", "site_name"]);
    const branchStatus = parseStatus(pickString(row, ["branch_status", "status"]));

    const contactFullName = pickString(row, ["contact_name", "full_name", "ap_contact_name"]);
    const contactRole = parseContactRole(pickString(row, ["contact_role", "role"]));

    const parentAccount: ImportedAccountRecord["parentAccount"] = {
      name: parentAccountName,
      status: parentAccountStatus,
      ...(parentAccountExternalId ? { externalId: parentAccountExternalId } : {}),
      ...(parentAccountExternalReference ? { externalReference: parentAccountExternalReference } : {}),
      ...(centrallyServiced !== undefined ? { centrallyServiced } : {}),
    };

    const billingAccount: ImportedAccountRecord["billingAccount"] = {
      accountNumber: billingAccountNumber,
      displayName: billingAccountDisplayName,
      currency: pickString(row, ["currency", "currency_code"]) ?? "PHP",
      accountTier,
      centrallyPaid,
      status: billingAccountStatus,
      ...(billingAccountExternalId ? { externalId: billingAccountExternalId } : {}),
      ...(erpCustomerId ? { erpCustomerId } : {}),
    };

    const branchExternalId = pickString(row, ["branch_id", "branch_external_id"]);
    const branchRegion = pickString(row, ["region", "branch_region"]);
    const branchCountryCode = pickString(row, ["country_code", "country"]);
    const branch: ImportedAccountRecord["branch"] | undefined =
      branchCode || branchName
        ? {
            code: branchCode ?? branchName ?? billingAccountNumber,
            name: branchName ?? branchCode ?? billingAccountDisplayName,
            status: branchStatus,
            ...(branchExternalId ? { externalId: branchExternalId } : {}),
            ...(branchRegion ? { region: branchRegion } : {}),
            ...(branchCountryCode ? { countryCode: branchCountryCode } : {}),
          }
        : undefined;

    const contactExternalId = pickString(row, ["contact_id", "contact_external_id"]);
    const contactEmail = pickString(row, ["contact_email", "email"]);
    const contactPhone = pickString(row, ["contact_phone", "phone"]);
    const contact: ImportedAccountRecord["contact"] | undefined = contactFullName
      ? {
          fullName: contactFullName,
          role: contactRole,
          scope: parseContactScope(
            pickString(row, ["contact_scope", "scope"]),
            Boolean(branchCode || branchName),
          ),
          isPrimary: parseBoolean(pickString(row, ["is_primary", "primary_contact"])) ?? false,
          isVerified: parseBoolean(pickString(row, ["is_verified", "verified"])) ?? false,
          allowAutoSend: parseBoolean(pickString(row, ["allow_auto_send", "auto_send"])) ?? false,
          recentSuccessfulResponses:
            parseInteger(pickString(row, ["recent_successful_responses", "successful_responses"])) ?? 0,
          ...(contactExternalId ? { externalId: contactExternalId } : {}),
          ...(contactEmail ? { email: contactEmail } : {}),
          ...(contactPhone ? { phone: contactPhone } : {}),
        }
      : undefined;

    records.push({
      parentAccount,
      billingAccount,
      ...(branch ? { branch } : {}),
      ...(contact ? { contact } : {}),
    });
  });

  return { records, heldRows, sheetName: "CSV" };
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

function parseStatus(value?: string): "active" | "inactive" {
  if (!value) {
    return "active";
  }

  return /inactive|disabled|closed/i.test(value) ? "inactive" : "active";
}

function parseAccountTier(value?: string): "standard" | "strategic" {
  return /strategic|key/i.test(value ?? "") ? "strategic" : "standard";
}

function parseContactRole(
  value?: string,
): ImportedAccountRecord["contact"] extends infer T
  ? T extends { role: infer R }
    ? R
    : never
  : never {
  switch ((value ?? "").trim().toLowerCase()) {
    case "customer":
    case "collector":
    case "approver":
    case "internal":
    case "ap":
    case "shared_finance":
    case "treasury":
    case "branch":
    case "invoice":
      return value!.trim().toLowerCase() as ImportedAccountRecord["contact"] extends infer T
        ? T extends { role: infer R }
          ? R
          : never
        : never;
    default:
      return "ap";
  }
}

function parseContactScope(value: string | undefined, hasBranch: boolean) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "parent_account" || normalized === "billing_account" || normalized === "branch") {
    return normalized;
  }

  return hasBranch ? "branch" : "billing_account";
}

function parseBoolean(value?: string) {
  if (!value) {
    return undefined;
  }

  if (/^(true|yes|y|1)$/i.test(value)) {
    return true;
  }
  if (/^(false|no|n|0)$/i.test(value)) {
    return false;
  }

  return undefined;
}

function parseInteger(value?: string) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function isBlankRow(row: Record<string, unknown>) {
  return Object.values(row).every((value) => typeof value !== "string" || value.trim().length === 0);
}
