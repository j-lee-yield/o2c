import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Dashboard,
  type DashboardPage,
  type OnboardingImportStatus,
} from "./app/dashboard.js";
import {
  loadIntegrationInspectorPageData,
  loadIntegrationPortalData,
} from "./app/integration-portal-data.js";
import {
  ClientConnectAccessDeniedPage,
  ClientConnectInvitePage,
  type ClientConnectInviteData,
  IntegrationInspectorPage,
  IntegrationPortalPage,
} from "./app/integration-portal.js";
import {
  loadOperatorConsoleData,
  loadQuickBooksConnectViewState,
  loadSapBusinessOneConnectViewState,
} from "./app/data.js";

export async function renderDashboardHtml(
  pathname = "/",
  options?: {
    cashAppTab?: string | undefined;
    customerId?: string | undefined;
    customerTab?: string | undefined;
    odooConnectState?: string | undefined;
    odooConnectError?: string | undefined;
    emailConnectError?: string | undefined;
    emailConnected?: string | undefined;
    emailSender?: string | undefined;
    quickbooksStatus?: string | undefined;
    quickbooksMessage?: string | undefined;
    quickbooksCompany?: string | undefined;
    sapStatus?: string | undefined;
    sapMessage?: string | undefined;
    sapCompany?: string | undefined;
    sapTestStatus?: string | undefined;
    sapTestMessage?: string | undefined;
    inboxSenderIdentityId?: string | undefined;
    inboxThreadId?: string | undefined;
    inboxReplyStatus?: string | undefined;
    inboxReplyError?: string | undefined;
    collectionsComposeStatus?: string | undefined;
    collectionsComposeError?: string | undefined;
    onboardingImportStatus?: OnboardingImportStatus | undefined;
    controlCenterTab?: "workflows" | "email-templates" | "call-agent" | "config" | undefined;
    controlCenterExpandedWorkflowId?: string | undefined;
    controlCenterSelectedTemplateId?: string | undefined;
    controlCenterStageModalWorkflowId?: string | undefined;
    controlCenterStageModalChannel?: "email" | "call" | "sms" | undefined;
    controlCenterStageModalTemplateMode?: "pre_saved_template" | "ai_generated" | undefined;
  },
): Promise<string> {
  const page = pageFromPath(pathname);
  const consoleData = await loadOperatorConsoleData({
    odooConnectState: options?.odooConnectState,
    odooConnectError: options?.odooConnectError,
    emailConnectError: options?.emailConnectError,
    emailConnected: options?.emailConnected,
    emailSender: options?.emailSender,
    page,
    inboxSenderIdentityId: options?.inboxSenderIdentityId,
    inboxThreadId: options?.inboxThreadId,
    inboxReplyStatus: options?.inboxReplyStatus,
    inboxReplyError: options?.inboxReplyError,
    collectionsComposeStatus: options?.collectionsComposeStatus,
    collectionsComposeError: options?.collectionsComposeError,
    controlCenterSelectedTemplateId: options?.controlCenterSelectedTemplateId,
  });
  const quickbooksConnect = await loadQuickBooksConnectViewState({
    quickbooksStatus: options?.quickbooksStatus,
    quickbooksMessage: options?.quickbooksMessage,
    quickbooksCompany: options?.quickbooksCompany,
  });
  const sapBusinessOneConnect = await loadSapBusinessOneConnectViewState({
    sapStatus: options?.sapStatus,
    sapMessage: options?.sapMessage,
    sapCompany: options?.sapCompany,
    sapTestStatus: options?.sapTestStatus,
    sapTestMessage: options?.sapTestMessage,
  });

  const html = renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>O2C Operator Console MVP</title>
      </head>
      <body style={{ margin: 0 }}>
        <Dashboard
          data={consoleData}
          page={page}
          pathname={pathname}
          {...(options?.cashAppTab ? { cashAppTab: options.cashAppTab } : {})}
          {...(options?.customerId ? { customerId: options.customerId } : {})}
          {...(options?.customerTab ? { customerTab: options.customerTab } : {})}
          odooConnect={consoleData.odooConnect}
          odooConnectError={consoleData.odooConnectError}
          {...(consoleData.emailConnectError
            ? { emailConnectError: consoleData.emailConnectError }
            : {})}
          {...(consoleData.emailConnectStatus
            ? { emailConnectStatus: consoleData.emailConnectStatus }
            : {})}
          {...(options?.onboardingImportStatus
            ? { onboardingImportStatus: options.onboardingImportStatus }
            : {})}
          {...(options?.controlCenterTab
            ? { controlCenterTab: options.controlCenterTab }
            : {})}
          {...(options?.controlCenterExpandedWorkflowId
            ? { controlCenterExpandedWorkflowId: options.controlCenterExpandedWorkflowId }
            : {})}
          {...(options?.controlCenterSelectedTemplateId
            ? { controlCenterSelectedTemplateId: options.controlCenterSelectedTemplateId }
            : {})}
          {...(options?.controlCenterStageModalWorkflowId
            ? { controlCenterStageModalWorkflowId: options.controlCenterStageModalWorkflowId }
            : {})}
          {...(options?.controlCenterStageModalChannel
            ? { controlCenterStageModalChannel: options.controlCenterStageModalChannel }
            : {})}
          {...(options?.controlCenterStageModalTemplateMode
            ? { controlCenterStageModalTemplateMode: options.controlCenterStageModalTemplateMode }
            : {})}
          {...(quickbooksConnect ? { quickbooksConnect } : {})}
          {...(sapBusinessOneConnect ? { sapBusinessOneConnect } : {})}
        />
      </body>
    </html>
  );

  return `<!DOCTYPE html>${html}`;
}

export async function renderIntegrationPortalHtml(options: {
  tenantSlug: string;
  clientName: string;
  token: string;
  quickbooksStatus?: string | undefined;
  quickbooksMessage?: string | undefined;
  businessCentralStatus?: string | undefined;
  businessCentralMessage?: string | undefined;
  sapStatus?: string | undefined;
  sapMessage?: string | undefined;
  odooStatus?: string | undefined;
  odooMessage?: string | undefined;
  companyName?: string | undefined;
  odooConnectState?: string | undefined;
  businessCentralConnectState?: string | undefined;
}): Promise<string> {
  const data = await loadIntegrationPortalData({
    tenantSlug: options.tenantSlug,
    clientName: options.clientName,
    token: options.token,
    quickbooksStatus: options.quickbooksStatus,
    quickbooksMessage: options.quickbooksMessage,
    businessCentralStatus: options.businessCentralStatus,
    businessCentralMessage: options.businessCentralMessage,
    sapStatus: options.sapStatus,
    sapMessage: options.sapMessage,
    odooStatus: options.odooStatus,
    odooMessage: options.odooMessage,
    companyName: options.companyName,
    odooConnectState: options.odooConnectState,
    businessCentralConnectState: options.businessCentralConnectState,
  });

  const html = renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Connect your accounting software | Yield AROS</title>
      </head>
      <body style={{ margin: 0 }}>
        <IntegrationPortalPage data={data} />
      </body>
    </html>,
  );

  return `<!DOCTYPE html>${html}`;
}

export async function renderIntegrationInspectorHtml(options: {
  tenantSlug: string;
  clientName: string;
  token: string;
}): Promise<string> {
  const data = await loadIntegrationInspectorPageData({
    tenantSlug: options.tenantSlug,
    clientName: options.clientName,
    token: options.token,
  });

  const html = renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Integration inspector | Yield AROS</title>
      </head>
      <body style={{ margin: 0 }}>
        <IntegrationInspectorPage data={data} />
      </body>
    </html>,
  );

  return `<!DOCTYPE html>${html}`;
}

export async function renderClientConnectInviteHtml(options: {
  data: ClientConnectInviteData;
}): Promise<string> {
  const html = renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Client connect invite | Yield AROS</title>
      </head>
      <body style={{ margin: 0 }}>
        <ClientConnectInvitePage data={options.data} />
      </body>
    </html>,
  );

  return `<!DOCTYPE html>${html}`;
}

export async function renderClientConnectAccessDeniedHtml(options: {
  title: string;
  message: string;
}): Promise<string> {
  const html = renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Client connect access denied | Yield AROS</title>
      </head>
      <body style={{ margin: 0 }}>
        <ClientConnectAccessDeniedPage title={options.title} message={options.message} />
      </body>
    </html>,
  );

  return `<!DOCTYPE html>${html}`;
}

function pageFromPath(pathname: string): DashboardPage {
  if (pathname.startsWith("/cash-app")) {
    return "cash-application";
  }

  if (pathname.startsWith("/integrations/quickbooks")) {
    return "quickbooks-connect";
  }

  if (pathname.startsWith("/integrations/sap-business-one")) {
    return "sap-business-one-connect";
  }

  if (pathname.startsWith("/deductions/") || pathname.startsWith("/exceptions/")) {
    return "exceptions";
  }

  if (pathname.startsWith("/org-credit-line/demo")) {
    return "borrowing";
  }

  switch (pathname) {
    case "/":
      return "home";
    case "/onboarding":
      return "onboarding";
    case "/inbox":
    case "/tasks":
      return "inbox";
    case "/analytics":
      return "analytics";
    case "/borrowing":
    case "/credit-line":
      return "borrowing";
    case "/borrowing/facilities":
    case "/credit-line/facilities":
      return "credit-facilities";
    case "/borrowing/statement":
    case "/credit-line/statement":
      return "loan-statement";
    case "/borrowing/repayments":
    case "/credit-line/repayments":
      return "loan-repayments";
    case "/borrowing/alerts":
    case "/credit-line/alerts":
      return "loan-alerts";
    case "/borrowing/tasks":
    case "/credit-line/tasks":
      return "loan-tasks";
    case "/invoices":
      return "invoices";
    case "/customers":
      return "customers";
    case "/collections":
      return "collections";
    case "/control-center":
      return "control-center";
    case "/cash-application":
      return "cash-application";
    case "/deductions":
    case "/exceptions":
      return "exceptions";
    case "/approvals":
      return "approvals";
    case "/ai-activity":
      return "ai-activity";
    case "/data-sources":
      return "data-sources";
    case "/integrations":
      return "integrations";
    case "/rules":
      return "rules";
    case "/account-workspace":
      return "account-workspace";
    case "/invoice-detail":
      return "invoice-detail";
    case "/screen-inventory":
      return "screen-inventory";
    default:
      return "home";
  }
}
