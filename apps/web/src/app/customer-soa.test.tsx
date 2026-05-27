import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dashboard } from "./dashboard.js";
import { loadOperatorConsoleData } from "./data.js";
import { renderCustomerStatementHtmlFromData } from "../server.js";

describe("customer SOA flow", () => {
  it("renders a Generate SOA action on the customer detail page", async () => {
    const data = await loadOperatorConsoleData();
    const customerId = "customer-soa-1";
    const preparedData = {
      ...data,
      customerIndex: [
        {
          profileId: customerId,
          canonicalName: "Contoso Retail",
          status: "active",
          accountTier: "standard",
          parentAccountName: "Contoso Group",
          billingAccountId: "bill-contoso-1",
          billingAccountName: "Contoso Retail",
          branchNames: [],
          primaryContactEmail: "ap@contoso.example",
          openAmount: "₱71,700.00",
          overdueAmount: "₱0.00",
          collectibleAmount: "₱71,700.00",
          disputedAmount: "₱0.00",
          openInvoiceCount: 1,
          taskCount: 0,
          completenessScore: 0.95,
          nextAction: "Email statement",
          hasPendingReview: false,
          tabs: [
            { id: "overview", label: "Overview", itemCount: 0, status: "ready" },
            { id: "invoices", label: "Invoices", itemCount: 1, status: "ready" },
            { id: "tasks", label: "Tasks", itemCount: 0, status: "empty" },
            { id: "activity", label: "Activity", itemCount: 0, status: "empty" },
            { id: "payments", label: "Payments", itemCount: 0, status: "empty" },
            { id: "ap_portal", label: "AP Portal", itemCount: 0, status: "empty" },
          ],
        },
      ],
      invoiceIndex: {
        ...data.invoiceIndex,
        invoices: [
          {
            id: "business_central:invoice-1",
            sourceProvider: "business_central",
            sourceKind: "accounting",
            sourceLabel: "Business Central",
            importMode: "live_connection",
            externalId: "invoice-1",
            customerName: "Contoso Retail",
            customerReference: "C-100",
            billingAccountId: "bill-contoso-1",
            billingAccountName: "Contoso Retail",
            invoiceNumber: "INV-1001",
            currency: "PHP",
            totalAmountCents: 7_170_000,
            openAmountCents: 7_170_000,
            paidAmountCents: 0,
            status: "open",
            sourceStatus: "open",
            issuedAt: "2026-04-20",
            dueDate: "2026-05-20",
            tags: [],
            metadata: {
              issuerCompanyName: "Contoso Medical Supply",
              issuerAddressSummary: "200 Elizalde Street, Paranaque City",
              issuerPhone: "+632 806-9267",
              issuerFax: "+632 801-4406",
              paymentTermsCode: "30D/NET",
              paymentTermsLabel: "30 Days Net",
              customerPurchaseOrderNumber: "PO-7781",
              salesOrderNumber: "SO1-017785",
            },
          },
        ],
      },
    };
    const html = renderToStaticMarkup(
      <Dashboard data={preparedData} page="customers" customerId={customerId} customerTab="overview" />,
    );

    expect(html).toContain("Generate SOA");
    expect(html).toContain("/customers/soa?customer=");
  });

  it("renders the printable customer statement page", async () => {
    const data = await loadOperatorConsoleData();
    const customerId = "customer-soa-1";
    const preparedData = {
      ...data,
      customerIndex: [
        {
          profileId: customerId,
          canonicalName: "Contoso Retail",
          status: "active",
          accountTier: "standard",
          parentAccountName: "Contoso Group",
          billingAccountId: "bill-contoso-1",
          billingAccountName: "Contoso Retail",
          branchNames: [],
          primaryContactEmail: "ap@contoso.example",
          openAmount: "₱71,700.00",
          overdueAmount: "₱0.00",
          collectibleAmount: "₱71,700.00",
          disputedAmount: "₱0.00",
          openInvoiceCount: 1,
          taskCount: 0,
          completenessScore: 0.95,
          nextAction: "Email statement",
          hasPendingReview: false,
          tabs: [{ id: "overview", label: "Overview", itemCount: 0, status: "ready" }],
        },
      ],
      invoiceIndex: {
        ...data.invoiceIndex,
        invoices: [
          {
            id: "business_central:invoice-1",
            sourceProvider: "business_central",
            sourceKind: "accounting",
            sourceLabel: "Business Central",
            importMode: "live_connection",
            externalId: "invoice-1",
            customerName: "Contoso Retail",
            customerReference: "C-100",
            billingAccountId: "bill-contoso-1",
            billingAccountName: "Contoso Retail",
            invoiceNumber: "INV-1001",
            currency: "PHP",
            totalAmountCents: 7_170_000,
            openAmountCents: 7_170_000,
            paidAmountCents: 0,
            status: "open",
            sourceStatus: "open",
            issuedAt: "2026-04-20",
            dueDate: "2026-05-20",
            tags: [],
            metadata: {
              issuerCompanyName: "Contoso Medical Supply",
              issuerAddressSummary: "200 Elizalde Street, Paranaque City",
              issuerPhone: "+632 806-9267",
              issuerFax: "+632 801-4406",
              paymentTermsCode: "30D/NET",
              paymentTermsLabel: "30 Days Net",
              customerPurchaseOrderNumber: "PO-7781",
              salesOrderNumber: "SO1-017785",
            },
          },
        ],
      },
    };
    const html = renderCustomerStatementHtmlFromData({
      data: preparedData,
      customerId,
      asOf: "2026-04-24",
    });

    expect(html).toContain("Statement of Account");
    expect(html).toContain("Refresh statement");
    expect(html).toContain("Print / Save PDF");
    expect(html).toContain("Current SOA generation gaps");
    expect(html).toContain("30D/NET");
    expect(html).toContain("PO-7781");
  });
});
