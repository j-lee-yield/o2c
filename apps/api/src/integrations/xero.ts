export type XeroInvoiceRow = {
  InvoiceID: string;
  InvoiceNumber?: string;
  Contact?: {
    ContactID?: string;
    ContactNumber?: string;
    Name?: string;
    EmailAddress?: string;
  };
  CurrencyCode?: string;
  Total?: number;
  AmountDue?: number;
  DueDateString?: string;
  DateString?: string;
  Status?: string;
  Reference?: string;
  BrandingThemeID?: string;
  LineAmountTypes?: string;
};

export type XeroInvoiceRecord = {
  externalId: string;
  invoiceNumber: string;
  customerName: string;
  customerNumber?: string;
  email?: string;
  currencyCode: string;
  totalAmountCents: number;
  remainingAmountCents: number;
  dueDate?: string;
  invoiceDate?: string;
  status: string;
  companyId: string;
  companyName?: string;
  parentAccountName?: string;
  branchName?: string;
  branchReference?: string;
};

export function mapXeroInvoiceRow(input: {
  tenantId: string;
  companyName?: string;
  invoice: XeroInvoiceRow;
}): XeroInvoiceRecord {
  const hierarchyHints = parseHierarchyReference(input.invoice.Reference);
  const amountDueCents = decimalToCents(input.invoice.AmountDue ?? input.invoice.Total ?? 0);
  const customerNumber = readDefinedTrimmed(
    input.invoice.Contact?.ContactNumber,
    input.invoice.Contact?.ContactID,
  );

  return {
    externalId: input.invoice.InvoiceID,
    invoiceNumber: input.invoice.InvoiceNumber?.trim() || input.invoice.InvoiceID,
    customerName: input.invoice.Contact?.Name?.trim() || "Unknown customer",
    ...(customerNumber ? { customerNumber } : {}),
    ...(input.invoice.Contact?.EmailAddress ? { email: input.invoice.Contact.EmailAddress.trim() } : {}),
    currencyCode: input.invoice.CurrencyCode?.trim() || "PHP",
    totalAmountCents: decimalToCents(input.invoice.Total ?? 0),
    remainingAmountCents: amountDueCents,
    ...(input.invoice.DueDateString ? { dueDate: input.invoice.DueDateString } : {}),
    ...(input.invoice.DateString ? { invoiceDate: input.invoice.DateString } : {}),
    status: mapXeroStatus(input.invoice.Status, amountDueCents, input.invoice.Total ?? 0),
    companyId: input.tenantId,
    ...(input.companyName ? { companyName: input.companyName } : {}),
    ...(hierarchyHints.parentAccountName ? { parentAccountName: hierarchyHints.parentAccountName } : {}),
    ...(hierarchyHints.branchName ? { branchName: hierarchyHints.branchName } : {}),
    ...(hierarchyHints.branchReference ? { branchReference: hierarchyHints.branchReference } : {}),
  };
}

function mapXeroStatus(
  sourceStatus: string | undefined,
  amountDueCents: number,
  totalAmount: number,
) {
  const normalizedStatus = sourceStatus?.trim().toUpperCase();
  if (normalizedStatus === "VOIDED" || normalizedStatus === "DELETED") {
    return "voided";
  }
  if (normalizedStatus === "PAID" || amountDueCents <= 0) {
    return "paid";
  }
  if (amountDueCents < decimalToCents(totalAmount)) {
    return "partial";
  }
  return normalizedStatus === "AUTHORISED" || normalizedStatus === "SUBMITTED" ? "open" : "open";
}

function parseHierarchyReference(reference: string | undefined) {
  if (!reference) {
    return {};
  }

  return reference.split("|").reduce<{
    parentAccountName?: string;
    branchName?: string;
    branchReference?: string;
  }>((accumulator, segment) => {
    const [rawKey, rawValue] = segment.split(":");
    const key = rawKey?.trim().toLowerCase();
    const value = rawValue?.trim();
    if (!key || !value) {
      return accumulator;
    }
    if (key === "parent") {
      accumulator.parentAccountName = value;
    } else if (key === "branch") {
      accumulator.branchName = value;
    } else if (key === "branch_code") {
      accumulator.branchReference = value;
    }
    return accumulator;
  }, {});
}

function decimalToCents(value: number) {
  return Math.round(value * 100);
}

function readDefinedTrimmed(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}
