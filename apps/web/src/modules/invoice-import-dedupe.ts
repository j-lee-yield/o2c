import type { InvoiceIndexEntry } from "@o2c/contracts";

export interface MergeInvoiceEntriesResult {
  invoices: InvoiceIndexEntry[];
  duplicateCount: number;
}

export function buildInvoiceImportIdentity(invoice: InvoiceIndexEntry) {
  const customerAnchor = normalizeIdentityPart(
    invoice.billingAccountId ??
      invoice.customerReference ??
      invoice.billingAccountName ??
      invoice.customerName,
  );
  const branchAnchor = normalizeIdentityPart(invoice.branchId ?? invoice.branchName);

  return [
    normalizeIdentityPart(invoice.invoiceNumber),
    customerAnchor,
    branchAnchor,
    normalizeIdentityPart(invoice.currency),
    String(invoice.totalAmountCents),
    invoice.issuedAt ?? "",
    invoice.dueDate ?? "",
  ].join("|");
}

export function mergeInvoiceEntriesWithoutDuplicates(
  existingInvoices: InvoiceIndexEntry[],
  candidateInvoices: InvoiceIndexEntry[],
): MergeInvoiceEntriesResult {
  const invoicesByIdentity = new Map<string, InvoiceIndexEntry>();

  for (const invoice of existingInvoices) {
    invoicesByIdentity.set(buildInvoiceImportIdentity(invoice), invoice);
  }

  let duplicateCount = 0;
  for (const invoice of candidateInvoices) {
    const identity = buildInvoiceImportIdentity(invoice);
    if (invoicesByIdentity.has(identity)) {
      duplicateCount += 1;
      continue;
    }
    invoicesByIdentity.set(identity, invoice);
  }

  return {
    invoices: [...invoicesByIdentity.values()],
    duplicateCount,
  };
}

function normalizeIdentityPart(value?: string) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9|.-]+/g, "");
}
