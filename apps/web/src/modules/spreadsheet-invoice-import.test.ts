import { describe, expect, it } from "vitest";
import { write, utils } from "xlsx";
import { parseSpreadsheetInvoiceImport } from "./spreadsheet-invoice-import.js";

describe("parseSpreadsheetInvoiceImport", () => {
  it("imports invoice rows from csv uploads", async () => {
    const csv = [
      "Invoice Number,Customer Name,Amount,Open Amount,Due Date,Invoice Date,Branch Name",
      "INV-1001,Metro Retail Group,1500.25,500.25,2026-04-30,2026-04-01,Makati",
    ].join("\n");

    const file = new File([csv], "metro-invoices.csv", { type: "text/csv" });
    const result = await parseSpreadsheetInvoiceImport({
      uploadId: "upload-1",
      fileName: file.name,
      file,
    });

    expect(result.heldRows).toHaveLength(0);
    expect(result.invoices).toHaveLength(1);
    expect(result.invoices[0]?.invoiceNumber).toBe("INV-1001");
    expect(result.invoices[0]?.customerName).toBe("Metro Retail Group");
    expect(result.invoices[0]?.totalAmountCents).toBe(150025);
    expect(result.invoices[0]?.openAmountCents).toBe(50025);
    expect(result.invoices[0]?.status).toBe("partial");
    expect(result.invoices[0]?.branchName).toBe("Makati");
  });

  it("holds malformed rows from xlsx uploads instead of importing them", async () => {
    const worksheet = utils.json_to_sheet([
      {
        "Invoice Number": "INV-2001",
        "Customer Name": "Northpoint Wholesale",
        Amount: "2500",
      },
      {
        "Invoice Number": "",
        "Customer Name": "Missing Invoice",
        Amount: "1200",
      },
    ]);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, "Invoices");
    const buffer = write(workbook, { type: "buffer", bookType: "xlsx" });
    const file = new File([buffer], "northpoint.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const result = await parseSpreadsheetInvoiceImport({
      uploadId: "upload-2",
      fileName: file.name,
      file,
    });

    expect(result.sheetName).toBe("Invoices");
    expect(result.invoices).toHaveLength(1);
    expect(result.invoices[0]?.sourceProvider).toBe("spreadsheet_upload");
    expect(result.heldRows).toEqual([
      {
        rowNumber: 3,
        reason: "Missing invoice number.",
      },
    ]);
  });

  it("supports the provided sample invoices workbook header shape", async () => {
    const csv = [
      "Client Name,Invoice Issue Date,Countering Date (Start of Terms),Due Date,Invoice No.,Terms,Invoice Amount,__EMPTY",
      "Citihomes,6/19/24,6/28/24,8/12/24,6632,45,\"₱83,245.50\",",
    ].join("\n");

    const file = new File([csv], "sample-invoices2.csv", { type: "text/csv" });
    const result = await parseSpreadsheetInvoiceImport({
      uploadId: "upload-3",
      fileName: file.name,
      file,
    });

    expect(result.heldRows).toHaveLength(0);
    expect(result.invoices).toHaveLength(1);
    expect(result.invoices[0]?.customerName).toBe("Citihomes");
    expect(result.invoices[0]?.invoiceNumber).toBe("6632");
    expect(result.invoices[0]?.totalAmountCents).toBe(8324550);
    expect(result.invoices[0]?.dueDate).toBe("2024-08-12");
    expect(result.invoices[0]?.issuedAt).toBe("2024-06-19");
  });
});
