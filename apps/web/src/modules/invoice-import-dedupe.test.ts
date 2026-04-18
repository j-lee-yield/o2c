import { describe, expect, it } from "vitest";
import type { InvoiceIndexEntry } from "@o2c/contracts";
import {
  buildInvoiceImportIdentity,
  mergeInvoiceEntriesWithoutDuplicates,
} from "./invoice-import-dedupe.js";

function buildInvoice(overrides?: Partial<InvoiceIndexEntry>): InvoiceIndexEntry {
  return {
    id: "invoice-1",
    sourceProvider: "spreadsheet_upload",
    sourceKind: "spreadsheet",
    sourceLabel: "Upload",
    importMode: "manual_upload",
    customerName: "Citihomes",
    invoiceNumber: "6632",
    currency: "PHP",
    totalAmountCents: 8324550,
    openAmountCents: 8324550,
    paidAmountCents: 0,
    status: "open",
    sourceStatus: "open",
    issuedAt: "2024-06-19",
    dueDate: "2024-08-12",
    tags: ["manual-upload"],
    metadata: {},
    ...overrides,
  };
}

describe("invoice spreadsheet dedupe", () => {
  it("treats repeated uploads of the same invoice as duplicates", () => {
    const firstUpload = buildInvoice({ id: "upload-a:2" });
    const secondUpload = buildInvoice({ id: "upload-b:2", lastImportedAt: "2026-04-06T10:00:00.000Z" });

    expect(buildInvoiceImportIdentity(firstUpload)).toBe(buildInvoiceImportIdentity(secondUpload));

    const result = mergeInvoiceEntriesWithoutDuplicates([firstUpload], [secondUpload]);

    expect(result.invoices).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
  });

  it("skips spreadsheet rows that duplicate an existing invoice from another source", () => {
    const erpInvoice = buildInvoice({
      id: "erp-6632",
      sourceProvider: "odoo",
      sourceKind: "erp",
      sourceLabel: "ERP",
      importMode: "live_connection",
      billingAccountName: "Citihomes",
    });
    const spreadsheetInvoice = buildInvoice({
      id: "upload-c:2",
      sourceProvider: "spreadsheet_upload",
      sourceKind: "spreadsheet",
      sourceLabel: "sample invoice - Sheet1.csv",
      importMode: "manual_upload",
    });

    const result = mergeInvoiceEntriesWithoutDuplicates([erpInvoice], [spreadsheetInvoice]);

    expect(result.invoices).toHaveLength(1);
    expect(result.invoices[0]?.id).toBe("erp-6632");
    expect(result.duplicateCount).toBe(1);
  });

  it("keeps distinct invoices when a business field meaningfully differs", () => {
    const firstInvoice = buildInvoice({ id: "upload-a:2" });
    const secondInvoice = buildInvoice({
      id: "upload-a:3",
      invoiceNumber: "6633",
      totalAmountCents: 9124550,
      openAmountCents: 9124550,
    });

    const result = mergeInvoiceEntriesWithoutDuplicates([firstInvoice], [secondInvoice]);

    expect(result.invoices).toHaveLength(2);
    expect(result.duplicateCount).toBe(0);
  });
});
