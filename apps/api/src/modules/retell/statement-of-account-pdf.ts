import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import type { BillingAccount, Contact, CustomerInvoice } from "@o2c/domain";
import type { EmailAttachmentInput } from "@o2c/workflows";

type PdfLibModule = {
  PDFDocument: {
    create(): Promise<{
      addPage(size?: [number, number]): {
        getSize(): { width: number; height: number };
        drawText(text: string, options: Record<string, unknown>): void;
        drawLine(options: Record<string, unknown>): void;
        drawRectangle(options: Record<string, unknown>): void;
      };
      embedFont(font: unknown): Promise<{
        widthOfTextAtSize(text: string, size: number): number;
      }>;
      save(): Promise<Uint8Array>;
    }>;
  };
  StandardFonts: {
    Helvetica: unknown;
    HelveticaBold: unknown;
  };
  rgb(r: number, g: number, b: number): unknown;
};

type PlaywrightModule = {
  chromium: {
    launch(options?: Record<string, unknown>): Promise<{
      newPage(): Promise<{
        setContent(html: string, options?: Record<string, unknown>): Promise<void>;
        pdf(options?: Record<string, unknown>): Promise<Buffer>;
        close(): Promise<void>;
      }>;
      close(): Promise<void>;
    }>;
  };
};

export async function createStatementOfAccountPdfAttachment(input: {
  account: BillingAccount;
  contact: Contact;
  invoices: CustomerInvoice[];
  asOf: string;
  statementSnapshotId?: string;
}): Promise<EmailAttachmentInput> {
  const fileName = buildStatementFileName(input.account.accountNumber, input.asOf);

  try {
    const html = renderStatementOfAccountHtml(input);
    const pdfBuffer = await renderHtmlToPdf(html);
    return {
      fileName,
      mimeType: "application/pdf",
      contentBase64: pdfBuffer.toString("base64")
    };
  } catch {
    const pdfBytes = await renderFallbackPdf(input);
    return {
      fileName,
      mimeType: "application/pdf",
      contentBase64: Buffer.from(pdfBytes).toString("base64")
    };
  }
}

async function renderHtmlToPdf(html: string) {
  const playwright = loadPlaywright();
  const browser = await playwright.chromium.launch({
    headless: true
  });

  try {
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: "load" });
      return await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        margin: {
          top: "12mm",
          right: "12mm",
          bottom: "12mm",
          left: "12mm"
        }
      });
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

function loadPlaywright(): PlaywrightModule {
  const require = createRequire(import.meta.url);
  const candidates = [
    process.env.WORKSPACE_NODE_MODULES_PATH
      ? path.join(process.env.WORKSPACE_NODE_MODULES_PATH, "playwright")
      : undefined,
    path.join(
      homedir(),
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"
    ),
    "playwright"
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      if (candidate === "playwright" || existsSync(candidate)) {
        return require(candidate) as PlaywrightModule;
      }
    } catch {
      continue;
    }
  }

  throw new Error("Playwright is not available for SOA PDF rendering.");
}

async function renderFallbackPdf(input: {
  account: BillingAccount;
  contact: Contact;
  invoices: CustomerInvoice[];
  asOf: string;
  statementSnapshotId?: string;
}) {
  const pdfLib = loadPdfLib();
  const pdf = await pdfLib.PDFDocument.create();
  const pageSize: [number, number] = [595.32, 841.92];
  const titleFont = await pdf.embedFont(pdfLib.StandardFonts.HelveticaBold);
  const bodyFont = await pdf.embedFont(pdfLib.StandardFonts.Helvetica);
  const sortedInvoices = [...input.invoices].sort((left, right) =>
    `${left.dueDate ?? left.invoiceDate ?? ""}`.localeCompare(
      `${right.dueDate ?? right.invoiceDate ?? ""}`
    )
  );
  const issuer = deriveIssuerProfile(sortedInvoices);
  const customerAddress = deriveCustomerAddressSummary(input.contact);
  const statementNumber = buildStatementNumber(input.account.id, input.asOf);
  const termsSummary = readStatementTermsSummary(sortedInvoices);
  const marginX = 50;
  const tableWidth = 495;
  const rowsPerPage = 34;
  const pages = chunkInvoices(sortedInvoices, rowsPerPage);
  const black = pdfLib.rgb(0, 0, 0);
  const gold = pdfLib.rgb(0.78, 0.66, 0.27);
  const headerGray = pdfLib.rgb(0.75, 0.75, 0.75);

  for (const [pageIndex, invoiceChunk] of pages.entries()) {
    const page = pdf.addPage(pageSize);
    const { width } = page.getSize();

    if (pageIndex === 0) {
      drawFallbackText(page, "ACD-07", {
        x: width - 88,
        y: 772,
        size: 7,
        font: bodyFont,
        color: black
      });
      drawFallbackText(page, "Rev. 1", {
        x: width - 88,
        y: 758,
        size: 7,
        font: bodyFont,
        color: black
      });
      drawFallbackText(page, "052719", {
        x: width - 88,
        y: 744,
        size: 7,
        font: bodyFont,
        color: black
      });
      drawFallbackText(page, issuer.companyName, {
        x: marginX,
        y: 728,
        size: 24,
        font: titleFont,
        color: gold
      });
      drawFallbackText(page, issuer.addressSummary, {
        x: marginX,
        y: 688,
        size: 10,
        font: bodyFont,
        color: black
      });
      drawFallbackText(page, issuer.contactLine, {
        x: marginX,
        y: 670,
        size: 10,
        font: bodyFont,
        color: black
      });
      drawFallbackText(page, "STATEMENT OF ACCOUNT", {
        x: 386,
        y: 688,
        size: 13,
        font: titleFont,
        color: black
      });
      drawFallbackText(page, statementNumber, {
        x: 438,
        y: 672,
        size: 12,
        font: titleFont,
        color: black
      });

      drawFallbackBox(page, marginX, 598, tableWidth, 64, black);
      drawFallbackLine(page, marginX + 360, 598, marginX + 360, 662, black);
      drawFallbackLine(page, marginX + 360, 630, marginX + tableWidth, 630, black);
      drawFallbackText(page, "Name and Address of Customer:", {
        x: marginX + 4,
        y: 646,
        size: 10,
        font: bodyFont,
        color: black
      });
      drawFallbackText(page, input.account.displayName, {
        x: marginX + 4,
        y: 628,
        size: 11,
        font: bodyFont,
        color: black
      });
      drawFallbackMultiline(page, customerAddress, {
        x: marginX + 4,
        y: 614,
        size: 9,
        font: bodyFont,
        color: black,
        lineHeight: 11,
        maxLines: 3
      });
      drawFallbackText(page, "Print Date:", {
        x: marginX + 364,
        y: 646,
        size: 10,
        font: bodyFont,
        color: black
      });
      drawFallbackText(page, formatDisplayDate(input.asOf), {
        x: marginX + 438,
        y: 632,
        size: 11,
        font: titleFont,
        color: black
      });
      drawFallbackText(page, "Terms:", {
        x: marginX + 364,
        y: 614,
        size: 10,
        font: bodyFont,
        color: black
      });
      drawFallbackText(page, termsSummary, {
        x: marginX + 426,
        y: 600,
        size: 11,
        font: titleFont,
        color: black
      });
    }

    const tableTop = pageIndex === 0 ? 598 : 760;
    const headerHeight = 16;
    const rowHeight = 14;
    const columnWidths = [72, 72, 78, 72, 136, 65];
    const columnLabels = ["DATE", "REFERENCE", "TERMS", "DUE DATE", "P.O./S.O.#", "AMOUNT"];
    let y = tableTop - headerHeight;

    page.drawRectangle({
      x: marginX,
      y,
      width: tableWidth,
      height: headerHeight,
      color: headerGray,
      borderColor: black,
      borderWidth: 1
    });
    drawFallbackVerticalGrid(page, marginX, y, headerHeight, columnWidths, black);
    let x = marginX;
    for (const [index, label] of columnLabels.entries()) {
      const cellWidth = columnWidths[index] ?? 0;
      drawFallbackText(page, label, {
        x: x + 4,
        y: y + 4,
        size: 9,
        font: titleFont,
        color: black
      });
      x += cellWidth;
    }

    y -= rowHeight;
    for (const invoice of invoiceChunk) {
      drawFallbackBox(page, marginX, y, tableWidth, rowHeight, black);
      drawFallbackVerticalGrid(page, marginX, y, rowHeight, columnWidths, black);
      const values = [
        formatStatementDate(invoice.invoiceDate ?? invoice.dueDate),
        invoice.invoiceNumber,
        readInvoiceTerms(invoice),
        formatStatementDate(invoice.dueDate),
        readInvoicePoSo(invoice),
        formatAccountingAmount(invoice.amountCents)
      ];
      x = marginX;
      for (const [index, value] of values.entries()) {
        const cellWidth = columnWidths[index] ?? 0;
        const isAmount = index === values.length - 1;
        const textWidth = isAmount ? bodyFont.widthOfTextAtSize(value, 8) : 0;
        drawFallbackText(page, value, {
          x: isAmount ? x + cellWidth - textWidth - 4 : x + 4,
          y: y + 4,
          size: 8,
          font: bodyFont,
          color: black
        });
        x += cellWidth;
      }
      y -= rowHeight;
    }

    if (pageIndex === pages.length - 1) {
      drawFallbackText(page, "******************NOTHING FOLLOWS *****************", {
        x: 186,
        y: y - 5,
        size: 9,
        font: titleFont,
        color: black
      });
      const footerY = Math.max(86, y - 42);
      drawFallbackText(
        page,
        "This is a system-generated Statement of Account and does not require a signature.",
        { x: 112, y: footerY, size: 8, font: bodyFont, color: black }
      );
      drawFallbackText(page, "Please disregard invoices if payment has been made.", {
        x: 184,
        y: footerY - 13,
        size: 8,
        font: bodyFont,
        color: black
      });
      drawFallbackText(page, `Note: Please make checks payable to ${issuer.payeeName}.`, {
        x: 112,
        y: footerY - 26,
        size: 8,
        font: bodyFont,
        color: black
      });
      drawFallbackText(page, "Total", {
        x: 376,
        y: footerY - 52,
        size: 10,
        font: titleFont,
        color: black
      });
      const total = formatPesoTotal(sumInvoiceAmounts(sortedInvoices), input.account.currency);
      drawFallbackText(page, total, {
        x: 500 - titleFont.widthOfTextAtSize(total, 10),
        y: footerY - 52,
        size: 10,
        font: titleFont,
        color: black
      });
      drawFallbackText(page, "Prepared by:", {
        x: marginX,
        y: 54,
        size: 9,
        font: bodyFont,
        color: black
      });
      drawFallbackText(page, issuer.preparedBy, {
        x: marginX + 40,
        y: 28,
        size: 9,
        font: titleFont,
        color: black
      });
      drawFallbackText(page, "Checked by:", {
        x: 230,
        y: 54,
        size: 9,
        font: bodyFont,
        color: black
      });
      drawFallbackText(page, "Noted by:", {
        x: 410,
        y: 54,
        size: 9,
        font: bodyFont,
        color: black
      });
    }

    if (pages.length > 1) {
      page.drawText(`Page ${pageIndex + 1} of ${pages.length}`, {
        x: width - 110,
        y: 24,
        size: 9,
        font: bodyFont,
        color: pdfLib.rgb(0.35, 0.45, 0.58)
      });
    }
  }

  return pdf.save();
}

function loadPdfLib(): PdfLibModule {
  const require = createRequire(import.meta.url);
  const candidates = [
    process.env.WORKSPACE_NODE_MODULES_PATH
      ? path.join(process.env.WORKSPACE_NODE_MODULES_PATH, "pdf-lib")
      : undefined,
    path.join(
      homedir(),
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pdf-lib"
    ),
    "pdf-lib"
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      if (candidate === "pdf-lib" || existsSync(candidate)) {
        return require(candidate) as PdfLibModule;
      }
    } catch {
      continue;
    }
  }

  throw new Error("Statement-of-account PDF generation requires pdf-lib at runtime.");
}

function renderStatementOfAccountHtml(input: {
  account: BillingAccount;
  contact: Contact;
  invoices: CustomerInvoice[];
  asOf: string;
  statementSnapshotId?: string;
}) {
  const sortedInvoices = [...input.invoices].sort((left, right) =>
    `${left.dueDate ?? left.invoiceDate ?? ""}`.localeCompare(
      `${right.dueDate ?? right.invoiceDate ?? ""}`
    )
  );
  const issuer = deriveIssuerProfile(sortedInvoices);
  const customerAddress = deriveCustomerAddressSummary(input.contact);
  const statementNumber = buildStatementNumber(input.account.id, input.asOf);
  const termsSummary = readStatementTermsSummary(sortedInvoices);
  const balance = sumInvoiceAmounts(sortedInvoices);
  const overdueBalance = sumOverdueAmounts(sortedInvoices, input.asOf);

  const rows = sortedInvoices
    .map((invoice) => {
      const values = [
        formatStatementDate(invoice.invoiceDate ?? invoice.dueDate),
        escapeHtml(invoice.invoiceNumber),
        escapeHtml(readInvoiceTerms(invoice)),
        formatStatementDate(invoice.dueDate),
        escapeHtml(readInvoicePoSo(invoice)),
        formatAccountingAmount(invoice.amountCents)
      ];
      return `<tr>${values
        .map((value, index) => {
          const align = index === values.length - 1 ? "right" : "left";
          return `<td style="${statementCellStyle(align)}">${value}</td>`;
        })
        .join("")}</tr>`;
    })
    .join("");

  const snapshotLine = input.statementSnapshotId
    ? `<div style="color:#5f7491;margin-top:12px;font-size:12px;">Snapshot ${escapeHtml(
        input.statementSnapshotId
      )}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SOA - ${escapeHtml(input.account.displayName)}</title>
    <style>
      @page { size: A4; margin: 14mm 16mm; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #fff; color: #111; }
      main { width: 100%; margin: 0 auto; }
      .statement-shell { position: relative; background: #fff; padding-top: 26px; }
      .revision { position: absolute; top: 0; right: 4px; font-size: 8px; line-height: 1.7; font-style: italic; text-align: left; }
      .header-grid { display: grid; grid-template-columns: minmax(0, 1fr) 265px; column-gap: 24px; align-items: end; margin-bottom: 4px; }
      .brand-row { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
      .brand-emblem { width: 54px; height: 40px; position: relative; }
      .brand-emblem::before, .brand-emblem::after { content: ""; position: absolute; top: 2px; width: 28px; height: 30px; background: linear-gradient(135deg, #c4a84d, #f0dd8a); }
      .brand-emblem::before { left: 4px; clip-path: polygon(100% 0, 0 14%, 72% 100%); }
      .brand-emblem::after { right: 4px; clip-path: polygon(0 0, 100% 14%, 28% 100%); }
      .brand-name { color: #d2bd63; font-size: 29px; font-weight: 800; letter-spacing: -1px; }
      .issuer-lines { font-size: 12px; font-style: italic; line-height: 1.6; margin-left: 4px; }
      .statement-title { text-align: center; font-size: 16px; font-weight: 800; line-height: 1.15; }
      .statement-number { display: block; margin-top: 2px; }
      .statement-block { display: grid; grid-template-columns: minmax(0, 1fr) 228px; border: 1.4px solid #111; margin-top: 2px; margin-bottom: 0; }
      .customer-box { min-height: 78px; padding: 8px 8px 7px; border-right: 1.2px solid #111; font-size: 13px; font-style: italic; line-height: 1.45; }
      .customer-name { margin-top: 4px; font-size: 14px; font-weight: 500; font-style: italic; }
      .customer-address { font-size: 13px; font-weight: 500; white-space: pre-line; }
      .info-box { display: grid; grid-template-rows: 1fr 1fr; }
      .info-row { display: grid; grid-template-columns: 1fr; padding: 6px 8px; font-size: 12px; font-style: italic; }
      .info-row + .info-row { border-top: 1.2px solid #111; }
      .info-value { align-self: end; justify-self: end; padding-right: 20px; font-size: 14px; font-weight: 700; font-style: italic; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
      thead { display: table-header-group; }
      thead tr { background: #bfbfbf; }
      th { padding: 4px 5px 3px; border: 1px solid #111; text-align: center; font-size: 12px; font-weight: 800; }
      td { border: 1px solid #888; padding: 3px 5px 2px; color: #111; font-style: italic; line-height: 1.15; overflow-wrap: anywhere; }
      td.amount { text-align: right; font-style: italic; white-space: nowrap; }
      .date-col { width: 13%; }
      .reference-col { width: 13%; }
      .terms-col { width: 14%; }
      .due-col { width: 14%; }
      .po-so-col { width: 25%; }
      .amount-col { width: 21%; }
      .nothing-follows { text-align: center; font-size: 12px; font-weight: 800; padding: 8px 0 6px; border-left: 1px solid #888; border-right: 1px solid #888; }
      .total-grid { display: grid; grid-template-columns: minmax(0, 1fr) 180px 180px; border-top: 1px solid #111; font-size: 13px; font-weight: 800; }
      .total-label { grid-column: 2; text-align: right; padding: 6px 16px 5px 0; }
      .total-value { text-align: right; padding: 6px 5px 5px 0; }
      .note { margin-top: 14px; text-align: center; font-size: 11px; line-height: 1.6; }
      .signature-grid { margin-top: 28px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; font-size: 12px; }
      .signature-name { margin-top: 26px; text-align: center; font-weight: 700; }
      .query-note { margin-top: 18px; font-size: 12px; text-align: center; }
    </style>
  </head>
  <body>
    <main>
      <section class="statement-shell">
        <div class="revision">
          <div>ACD-07</div>
          <div>Rev. 1</div>
          <div>052719</div>
        </div>
        <header class="header-grid">
          <div>
            <div class="brand-row">
              <div class="brand-emblem"></div>
              <div class="brand-name">${escapeHtml(issuer.companyName)}</div>
            </div>
            <div class="issuer-lines">
              <div>${escapeHtml(issuer.addressSummary)}</div>
              <div>${escapeHtml(issuer.contactLine)}</div>
            </div>
          </div>
          <div class="statement-title">
            <div>STATEMENT OF ACCOUNT</div>
            <span class="statement-number">${escapeHtml(statementNumber)}</span>
            ${snapshotLine}
          </div>
        </header>

        <section class="statement-block">
          <div class="customer-box">
            <div>Name and Address of Customer:</div>
            <div class="customer-name">${escapeHtml(input.account.displayName)}</div>
            <div class="customer-address">${escapeHtml(customerAddress)}</div>
          </div>
          <div class="info-box">
            <div class="info-row">
              <div>Print Date:</div>
              <div class="info-value">${escapeHtml(formatDisplayDate(input.asOf))}</div>
            </div>
            <div class="info-row">
              <div>Terms:</div>
              <div class="info-value">${escapeHtml(termsSummary)}</div>
            </div>
          </div>
        </section>

        <table>
          <thead>
            <tr>
              <th class="date-col">DATE</th>
              <th class="reference-col">REFERENCE</th>
              <th class="terms-col">TERMS</th>
              <th class="due-col">DUE DATE</th>
              <th class="po-so-col">P.O./S.O.#</th>
              <th class="amount-col">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <div class="nothing-follows">******************NOTHING FOLLOWS *****************</div>
        <section class="note">
          <div>This is a system-generated Statement of Account and does not require a signature.</div>
          <div>Please disregard invoices if payment has been made.</div>
          <div>Note: Please make checks payable to ${escapeHtml(issuer.payeeName)}.</div>
        </section>
        <section class="total-grid">
          <div></div>
          <div class="total-label">Total</div>
          <div class="total-value">${escapeHtml(formatPesoTotal(balance, input.account.currency))}</div>
          <div></div>
          <div class="total-label">Overdue</div>
          <div class="total-value">${escapeHtml(formatPesoTotal(overdueBalance, input.account.currency))}</div>
        </section>
        <section class="signature-grid">
          <div>
            <div>Prepared by:</div>
            <div class="signature-name">${escapeHtml(issuer.preparedBy)}</div>
          </div>
          <div>
            <div>Checked by:</div>
          </div>
          <div>
            <div>Noted by:</div>
          </div>
        </section>
        <div class="query-note">Should you have any queries on the above, please contact our Accounting Department.</div>
      </section>
    </main>
  </body>
</html>`;
}

function deriveIssuerProfile(invoices: CustomerInvoice[]) {
  const metadata = invoices[0]?.metadata ?? {};
  const companyName =
    readString(metadata, "issuerCompanyName") ??
    readString(metadata, "companyName") ??
    "Yield AROS";
  const addressSummary =
    readString(metadata, "issuerAddressSummary") ??
    "Issuer company profile still needs full Business Central company-information mapping.";
  const phone = readString(metadata, "issuerPhone");
  const fax = readString(metadata, "issuerFax");
  const contactLine =
    phone && fax
      ? `Tel. Nos. ${phone}   Fax ${fax}`
      : phone
        ? `Tel. Nos. ${phone}`
        : fax
          ? `Fax ${fax}`
          : "Contact details not yet mapped";
  const payeeName =
    readString(metadata, "issuerPayeeName") ?? readString(metadata, "payeeName") ?? companyName;
  const preparedBy = readString(metadata, "preparedBy") ?? "AR Team";
  return { companyName, addressSummary, contactLine, payeeName, preparedBy };
}

function deriveCustomerAddressSummary(contact: Contact) {
  const metadata = contact.metadata ?? {};
  return (
    readString(metadata, "billAddressSummary") ??
    readString(metadata, "addressSummary") ??
    readString(metadata, "mailingAddress") ??
    "Billing address not yet mapped from Business Central company profile."
  );
}

function readInvoiceTerms(invoice: CustomerInvoice) {
  const metadata = invoice.metadata ?? {};
  return (
    readString(metadata, "terms") ??
    readString(metadata, "paymentTermsCode") ??
    readString(metadata, "paymentTermsLabel") ??
    readString(metadata, "paymentTermsDescription") ??
    "Needs BC terms mapping"
  );
}

function readInvoicePoSo(invoice: CustomerInvoice) {
  const metadata = invoice.metadata ?? {};
  const poNumber =
    readString(metadata, "purchaseOrderNumber") ??
    readString(metadata, "customerPurchaseOrderNumber") ??
    readString(metadata, "poNumber");
  const soNumber =
    readString(metadata, "salesOrderNumber") ??
    readString(metadata, "soNumber") ??
    readString(metadata, "externalDocumentNumber");
  if (poNumber && soNumber) {
    return `${poNumber} / ${soNumber}`;
  }
  return poNumber ?? soNumber ?? "Needs BC PO/SO mapping";
}

function readStatementTermsSummary(invoices: CustomerInvoice[]) {
  const terms = [...new Set(invoices.map(readInvoiceTerms).filter(Boolean))];
  if (terms.length === 0) {
    return "Per invoice";
  }
  if (terms.length === 1) {
    return terms[0] ?? "Per invoice";
  }
  return "Per invoice";
}

function sumOverdueAmounts(invoices: CustomerInvoice[], asOf: string) {
  const cutoff = toDateOnly(asOf);
  return invoices.reduce((total, invoice) => {
    const due = toDateOnly(invoice.dueDate);
    if (cutoff && due && due < cutoff) {
      return total + invoice.amountCents;
    }
    return total;
  }, 0);
}

function sumInvoiceAmounts(invoices: CustomerInvoice[]) {
  return invoices.reduce((total, invoice) => total + invoice.amountCents, 0);
}

function buildStatementNumber(customerId: string, asOf: string) {
  const yy = asOf.slice(2, 4) || "00";
  const suffix =
    customerId
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(-4)
      .toUpperCase() || "0000";
  return `${yy}-${suffix}`;
}

function formatDisplayDate(value?: string) {
  if (!value) {
    return "-";
  }
  return formatDateWithDashes(value, "2-digit");
}

function formatStatementDate(value?: string) {
  if (!value) {
    return "-";
  }
  return formatDateWithDashes(value, "numeric");
}

function formatCurrency(amountCents: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amountCents / 100);
}

function formatAccountingAmount(amountCents: number) {
  return new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amountCents / 100);
}

function formatPesoTotal(amountCents: number, currency = "PHP") {
  if (currency === "PHP") {
    return `P ${formatAccountingAmount(amountCents)}`;
  }
  return formatCurrency(amountCents, currency);
}

function formatDateWithDashes(value: string, day: "numeric" | "2-digit") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const parts = new Intl.DateTimeFormat("en-PH", {
    day,
    month: "short",
    year: "2-digit",
    timeZone: "Asia/Manila"
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return [part("day"), part("month"), part("year")].filter(Boolean).join("-");
}

function toDateOnly(value?: string) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) {
    return match[0];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

function buildStatementFileName(accountNumber: string, asOf: string) {
  const safeDate = (asOf || "").slice(0, 10) || "statement";
  return `statement-of-account-${accountNumber}-${safeDate}.pdf`;
}

function readString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function statementCellStyle(textAlign: string) {
  return `border:1px solid #c7d2df;padding:6px 10px;text-align:${textAlign};color:#1f2f46;`;
}

function chunkInvoices(invoices: CustomerInvoice[], size: number) {
  if (invoices.length === 0) {
    return [[]];
  }
  const chunks: CustomerInvoice[][] = [];
  for (let index = 0; index < invoices.length; index += size) {
    chunks.push(invoices.slice(index, index + size));
  }
  return chunks;
}

type FallbackPage = {
  drawText(text: string, options: Record<string, unknown>): void;
  drawLine(options: Record<string, unknown>): void;
  drawRectangle(options: Record<string, unknown>): void;
};

type FallbackFont = {
  widthOfTextAtSize(text: string, size: number): number;
};

function drawFallbackText(
  page: FallbackPage,
  text: string,
  options: {
    x: number;
    y: number;
    size: number;
    font: FallbackFont;
    color: unknown;
    maxWidth?: number;
  }
) {
  page.drawText(text, {
    x: options.x,
    y: options.y,
    size: options.size,
    font: options.font,
    color: options.color,
    ...(options.maxWidth ? { maxWidth: options.maxWidth } : {})
  });
}

function drawFallbackMultiline(
  page: FallbackPage,
  text: string,
  options: {
    x: number;
    y: number;
    size: number;
    font: FallbackFont;
    color: unknown;
    lineHeight: number;
    maxLines: number;
  }
) {
  const lines = text.split(/\r?\n/).slice(0, options.maxLines);
  for (const [index, line] of lines.entries()) {
    drawFallbackText(page, line, {
      x: options.x,
      y: options.y - index * options.lineHeight,
      size: options.size,
      font: options.font,
      color: options.color
    });
  }
}

function drawFallbackBox(
  page: FallbackPage,
  x: number,
  y: number,
  width: number,
  height: number,
  color: unknown
) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: color,
    borderWidth: 1
  });
}

function drawFallbackLine(
  page: FallbackPage,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color: unknown
) {
  page.drawLine({
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    color,
    thickness: 1
  });
}

function drawFallbackVerticalGrid(
  page: FallbackPage,
  x: number,
  y: number,
  height: number,
  widths: number[],
  color: unknown
) {
  let cursor = x;
  for (const width of widths.slice(0, -1)) {
    cursor += width;
    drawFallbackLine(page, cursor, y, cursor, y + height, color);
  }
}
