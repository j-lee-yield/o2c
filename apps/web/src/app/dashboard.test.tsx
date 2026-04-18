import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dashboard } from "./dashboard.js";
import { loadOperatorConsoleData } from "./data.js";

describe("Dashboard", () => {
  it("renders the command center as its own page", async () => {
    const data = await loadOperatorConsoleData();
    const html = renderToStaticMarkup(<Dashboard data={data} page="home" />);

    expect(html).toContain("Getting set up");
    expect(html).toContain("Enable sending and receiving emails through Yield");
    expect(html).toContain("Tasks");
    expect(html).toContain("Today");
    expect(html).toContain("open tasks");
    expect(html).toContain("Respond to");
    expect(html).toContain("Open Tasks by Age");
    expect(html).toContain("Task types");
    expect(html).toContain("Customers");
    expect(html).toContain("Collect");
    expect(html).toContain("Credit Line");
    expect(html).toContain("Analytics");
    expect(html).not.toContain("Collections queue");
  });

  it("renders routed collections and cash application pages", async () => {
    const data = await loadOperatorConsoleData({
      controlCenterSelectedTemplateId: "cc_template_seed_5",
    });
    const analyticsHtml = renderToStaticMarkup(<Dashboard data={data} page="analytics" />);
    const borrowingHtml = renderToStaticMarkup(<Dashboard data={data} page="borrowing" />);
    const facilitiesHtml = renderToStaticMarkup(<Dashboard data={data} page="credit-facilities" />);
    const statementHtml = renderToStaticMarkup(<Dashboard data={data} page="loan-statement" />);
    const repaymentsHtml = renderToStaticMarkup(<Dashboard data={data} page="loan-repayments" />);
    const alertsHtml = renderToStaticMarkup(<Dashboard data={data} page="loan-alerts" />);
    const loanTasksHtml = renderToStaticMarkup(<Dashboard data={data} page="loan-tasks" />);
    const invoicesHtml = renderToStaticMarkup(<Dashboard data={data} page="invoices" />);
    const customersHtml = renderToStaticMarkup(<Dashboard data={data} page="customers" />);
    const customerDetailHtml = renderToStaticMarkup(
      <Dashboard data={data} page="customers" customerId={data.customerIndex[0]?.profileId} customerTab="overview" />
    );
    const collectionsHtml = renderToStaticMarkup(<Dashboard data={data} page="collections" />);
    const controlCenterHtml = renderToStaticMarkup(<Dashboard data={data} page="control-center" />);
    const controlCenterCallAgentHtml = renderToStaticMarkup(
      <Dashboard data={data} page="control-center" controlCenterTab="call-agent" />,
    );
    const controlCenterTemplateDrawerHtml = renderToStaticMarkup(
      <Dashboard
        data={data}
        page="control-center"
        controlCenterTab="email-templates"
        controlCenterSelectedTemplateId="cc_template_seed_5"
      />,
    );
    const controlCenterStageModalHtml = renderToStaticMarkup(
      <Dashboard
        data={data}
        page="control-center"
        controlCenterExpandedWorkflowId={data.controlCenter?.workflows[0]?.id}
        controlCenterStageModalWorkflowId={data.controlCenter?.workflows[0]?.id}
        controlCenterStageModalChannel="email"
        controlCenterStageModalTemplateMode="pre_saved_template"
      />,
    );
    const cashHtml = renderToStaticMarkup(<Dashboard data={data} page="cash-application" />);
    const cashPaymentsHtml = renderToStaticMarkup(
      <Dashboard data={data} page="cash-application" cashAppTab="payments" />,
    );
    const cashBankHtml = renderToStaticMarkup(
      <Dashboard data={data} page="cash-application" cashAppTab="bank-transactions" />,
    );

    expect(analyticsHtml).toContain("Analytics");
    expect(analyticsHtml).toContain("Collections vs Target");
    expect(analyticsHtml).toContain("Aging Balance");
    expect(analyticsHtml).toContain("DSO Trend");
    expect(analyticsHtml).toContain("Top Customers by Balance");
    expect(analyticsHtml).toContain("Avg Collection Time");
    expect(borrowingHtml).toContain("Credit Line");
    expect(borrowingHtml).toContain("Repayment workbench");
    expect(facilitiesHtml).toContain("Credit Line Facilities");
    expect(facilitiesHtml).toContain("Security Bank Revolver");
    expect(statementHtml).toContain("Loan statement detail");
    expect(statementHtml).toContain("Payment applications");
    expect(repaymentsHtml).toContain("Repayment history");
    expect(repaymentsHtml).toContain("PYMT-88912");
    expect(alertsHtml).toContain("Credit Line Alerts");
    expect(alertsHtml).toContain("Past due repayment");
    expect(loanTasksHtml).toContain("Credit Line Tasks");
    expect(loanTasksHtml).toContain("Confirm repayment release with treasury");
    expect(invoicesHtml).toContain("Imported invoices");
    expect(invoicesHtml).toContain("Unified invoice index across ERP and accounting imports");
    expect(invoicesHtml).toContain("By platform");
    expect(customersHtml).toContain("Customers");
    expect(customersHtml).toContain("Search by name, ID, account number, or user");
    expect(customersHtml).toContain("Open Invoices");
    expect(customersHtml).toContain("Export");
    expect(customerDetailHtml).toContain("Yield Insights");
    expect(customerDetailHtml).toContain("Contacts");
    expect(customerDetailHtml).toContain("Pause Outreach");
    expect(customerDetailHtml).toContain("AP Portal");

    expect(collectionsHtml).toContain("Collections");
    expect(collectionsHtml).toContain("Email Inbox");
    expect(collectionsHtml).toContain("Call Inbox");
    expect(collectionsHtml).toContain("Configure");
    expect(collectionsHtml).toContain("Compose a collections-safe reply from the inbox thread.");
    expect(collectionsHtml).toContain("Send Email");
    expect(collectionsHtml).toContain("/collections/compose");
    expect(collectionsHtml).not.toContain("AI Activity (Last 2 hours)");
    expect(controlCenterHtml).toContain("Control Center");
    expect(controlCenterHtml).toContain("Workflows");
    expect(controlCenterHtml).toContain("Email Templates");
    expect(controlCenterHtml).toContain("Call Agent");
    expect(controlCenterHtml).toContain("Config");
    expect(controlCenterHtml).toContain("New Workflow");
    expect(controlCenterHtml).toContain("Configure time based email or call triggers");
    expect(controlCenterHtml).not.toContain('class="control-center-workflow-row" open=""');
    expect(controlCenterCallAgentHtml).toContain("Provider payload");
    expect(controlCenterTemplateDrawerHtml).toContain("Template Preview");
    expect(controlCenterTemplateDrawerHtml).toContain("Save Template");
    expect(controlCenterTemplateDrawerHtml).toContain("ar-manager@yieldaros.example");
    expect(controlCenterTemplateDrawerHtml).toContain("Auto Correct");
    expect(controlCenterTemplateDrawerHtml).toContain("Luzon Distributor Group - Manila");
    expect(controlCenterTemplateDrawerHtml).toContain("Balance overdue:");
    expect(controlCenterStageModalHtml).toContain("Add Stage");
    expect(controlCenterStageModalHtml).toContain("Email");
    expect(controlCenterStageModalHtml).toContain("Call");
    expect(controlCenterStageModalHtml).toContain("SMS");

    expect(cashHtml).toContain("Cash App");
    expect(cashHtml).toContain("in pending payments");
    expect(cashHtml).toContain("This Week&#x27;s Summary");
    expect(cashHtml).toContain("Agent Highlights");
    expect(cashHtml).toContain("Bank Transactions");
    expect(cashHtml).toContain("Remittances");
    expect(cashPaymentsHtml).toContain("Documentation");
    expect(cashPaymentsHtml).toContain("Export");
    expect(cashBankHtml).toContain("Upload Bank Statement");
    expect(cashBankHtml).toContain("Potential Payment");
  });

  it("renders deductions list and detail views", async () => {
    const data = await loadOperatorConsoleData();
    const deductionsHtml = renderToStaticMarkup(<Dashboard data={data} page="exceptions" pathname="/deductions" />);
    const deductionDetailHtml = renderToStaticMarkup(
      <Dashboard data={data} page="exceptions" pathname="/deductions/DM3241407UNLOAD" />,
    );

    expect(deductionsHtml).toContain("Export Deductions");
    expect(deductionsHtml).toContain("Pre-deduction");
    expect(deductionsHtml).toContain("DM3241407UNLOAD");
    expect(deductionsHtml).toContain("Upload Document");

    expect(deductionDetailHtml).toContain("Back to deductions");
    expect(deductionDetailHtml).toContain("Deduction: DM3241407UNLOAD");
    expect(deductionDetailHtml).toContain("Credit Memo Draft");
    expect(deductionDetailHtml).toContain("Sync credit memo");
  });

  it("keeps secondary detail pages available", async () => {
    const data = await loadOperatorConsoleData();
    const inboxHtml = renderToStaticMarkup(<Dashboard data={data} page="inbox" />);
    const onboardingHtml = renderToStaticMarkup(
      <Dashboard
        data={data}
        page="onboarding"
        onboardingImportStatus={{
          lane: "payments",
          status: "success",
          importedCount: 2,
          heldCount: 1,
          reviewCount: 1,
          message: "2 bank transactions normalized, 1 row was held safely.",
          notes: ["Row 4: Missing or invalid transaction date."],
        }}
      />,
    );
    const accountHtml = renderToStaticMarkup(<Dashboard data={data} page="account-workspace" />);
    const invoiceHtml = renderToStaticMarkup(<Dashboard data={data} page="invoice-detail" />);
    const inventoryHtml = renderToStaticMarkup(<Dashboard data={data} page="screen-inventory" />);
    const dataSourcesHtml = renderToStaticMarkup(<Dashboard data={data} page="data-sources" />);
    const integrationsHtml = renderToStaticMarkup(<Dashboard data={data} page="integrations" />);
    const quickBooksConnectHtml = renderToStaticMarkup(
      <Dashboard
        data={data}
        page="quickbooks-connect"
        quickbooksConnect={{
          kind: "connected",
          accessMode: "read_write",
          scopes: [
            "com.intuit.quickbooks.accounting",
            "openid",
            "profile",
            "email",
            "offline_access",
          ],
          readableObjects: ["invoices", "customers", "contacts", "payments"],
          writableObjects: ["payment writeback staging", "cash application writeback preview"],
          companyName: "Acme QuickBooks",
          environment: "sandbox",
          connectionHealth: "connected",
          callbackStatus: "connected",
          callbackMessage: "Acme QuickBooks is now authorized for Yield AROS.",
        }}
      />,
    );
    const sapBusinessOneConnectHtml = renderToStaticMarkup(
      <Dashboard
        data={data}
        page="sap-business-one-connect"
        sapBusinessOneConnect={{
          kind: "connected",
          accessMode: "read_write",
          authStrategy: "basic_auth",
          readableObjects: ["invoices", "customers", "payments"],
          writableObjects: ["payment writeback staging", "cash application writeback preview"],
          companyName: "Acme SAP B1",
          companyDatabase: "SBODEMO_PH",
          callbackStatus: "connected",
          callbackMessage: "Acme SAP B1 is now connected to Yield AROS.",
          testStatus: "success",
          testMessage: "Acme SAP B1 responded successfully.",
          latestSyncRun: {
            status: "succeeded",
            invoicesSyncedCount: 12,
            customersSyncedCount: 4,
            paymentsSyncedCount: 3,
            startedAt: "2026-04-10T09:00:00.000Z",
            completedAt: "2026-04-10T09:02:00.000Z",
          },
          recentSyncRuns: [
            {
              runId: "sap-run-1",
              status: "succeeded",
              syncScope: ["invoices", "customers", "payments"],
              invoicesSyncedCount: 12,
              customersSyncedCount: 4,
              paymentsSyncedCount: 3,
              startedAt: "2026-04-10T09:00:00.000Z",
              completedAt: "2026-04-10T09:02:00.000Z",
            },
          ],
          scheduler: {
            enabled: true,
            intervalMinutes: 15,
            running: false,
            nextRunAt: "2026-04-10T09:15:00.000Z",
          },
        }}
      />,
    );

    expect(inboxHtml).toContain("Tasks");
    expect(inboxHtml).toContain("Global task queue across collections, cash app, deductions, and operations");
    expect(inboxHtml).toContain("Advanced Filters");
    expect(inboxHtml).toContain("Follow up on overdue invoices");
    expect(inboxHtml).toContain("Pending Approval");
    expect(onboardingHtml).toContain("Guided Onboarding");
    expect(onboardingHtml).toContain("Same-day setup path");
    expect(onboardingHtml).toContain("Date,Cheque Number,Description,Amount,Balance,Category");
    expect(accountHtml).toContain("Customer profile");
    expect(accountHtml).toContain("Contact summary");
    expect(accountHtml).toContain("Credit profile");
    expect(accountHtml).toContain("Learning guidance");
    expect(accountHtml).toContain("Payment behavior:");
    expect(invoiceHtml).toContain("Invoice detail");
    expect(invoiceHtml).toContain("Awaiting approval");
    expect(inventoryHtml).toContain("Screen inventory summary");
    expect(dataSourcesHtml).toContain("Data Sources");
    expect(dataSourcesHtml).toContain("action=\"/data-sources/uploads\"");
    expect(dataSourcesHtml).toContain("action=\"/data-sources/integrations\"");
    expect(integrationsHtml).toContain("Connect QuickBooks");
    expect(integrationsHtml).toContain("Connect SAP B1");
    expect(integrationsHtml).toContain("Connect Gmail");
    expect(integrationsHtml).toContain("/integrations/quickbooks");
    expect(integrationsHtml).toContain("/integrations/sap-business-one");
    expect(integrationsHtml).toContain("action=\"/integrations/email/connect\"");
    expect(quickBooksConnectHtml).toContain("Connect QuickBooks Online");
    expect(quickBooksConnectHtml).toContain("Connect production company");
    expect(quickBooksConnectHtml).toContain("Use sandbox company");
    expect(quickBooksConnectHtml).toContain("Read + Write");
    expect(quickBooksConnectHtml).toContain("Acme QuickBooks is now authorized for Yield AROS.");
    expect(sapBusinessOneConnectHtml).toContain("Connect SAP Business One");
    expect(sapBusinessOneConnectHtml).toContain("Service Layer credentials");
    expect(sapBusinessOneConnectHtml).toContain("Test connection");
    expect(sapBusinessOneConnectHtml).toContain("Sync now");
    expect(sapBusinessOneConnectHtml).toContain("Recent sync runs");
    expect(sapBusinessOneConnectHtml).toContain("Acme SAP B1 is now connected to Yield AROS.");
    expect(sapBusinessOneConnectHtml).toContain("Every 15 minutes");
  });
});
