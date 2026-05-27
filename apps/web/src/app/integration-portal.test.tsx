import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ClientConnectAccessDeniedPage,
  ClientConnectInvitePage,
  IntegrationInspectorPage,
  IntegrationPortalPage,
  type ClientConnectInviteData,
  type IntegrationInspectorPageData,
  type IntegrationPortalData,
} from "./integration-portal.js";
import { loadIntegrationPortalData } from "./integration-portal-data.js";

const providers = [
  {
    provider: "quickbooks" as const,
    label: "QuickBooks Online",
    tenantSlug: "acme-pilot",
    connectionStatus: "connected" as const,
    detail: "QuickBooks records are available for inspection.",
    companyName: "Acme QuickBooks",
    pulledObjects: ["invoices", "customers", "contacts", "payments"],
    summary: {
      invoiceCount: 8,
      customerCount: 5,
      contactCount: 5,
      paymentCount: 2,
      totalInvoiceAmountCents: 5200000,
      totalOpenInvoiceAmountCents: 1800000,
      totalPaymentAmountCents: 1500000,
      totalUnappliedPaymentAmountCents: 250000,
      currencyCodes: ["PHP"],
    },
    raw: {
      invoices: [{ externalId: "inv-1" }],
      payments: [{ externalId: "pay-1" }],
    },
  },
  {
    provider: "business-central" as const,
    label: "Business Central",
    tenantSlug: "acme-pilot",
    connectionStatus: "not_connected" as const,
    detail: "No Business Central company is connected for this tenant yet.",
    pulledObjects: ["invoices"],
    summary: {
      invoiceCount: 0,
      customerCount: 0,
      contactCount: 0,
      paymentCount: 0,
      totalInvoiceAmountCents: 0,
      totalOpenInvoiceAmountCents: 0,
      totalPaymentAmountCents: 0,
      totalUnappliedPaymentAmountCents: 0,
      currencyCodes: [],
    },
    raw: {},
  },
  {
    provider: "sap-business-one" as const,
    label: "SAP Business One",
    tenantSlug: "acme-pilot",
    connectionStatus: "not_connected" as const,
    detail: "No SAP Business One company is connected for this tenant yet.",
    pulledObjects: ["invoices", "customers", "payments"],
    summary: {
      invoiceCount: 0,
      customerCount: 0,
      contactCount: 0,
      paymentCount: 0,
      totalInvoiceAmountCents: 0,
      totalOpenInvoiceAmountCents: 0,
      totalPaymentAmountCents: 0,
      totalUnappliedPaymentAmountCents: 0,
      currencyCodes: [],
    },
    raw: {},
  },
];

describe("integration portal pages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the client-facing portal", () => {
    const data: IntegrationPortalData = {
      tenantSlug: "acme-pilot",
      clientName: "Acme Foods",
      providers,
      token: "signed-token",
      inspectorPath: "/integrations/inspector?tenantSlug=acme-pilot&client=Acme%20Foods",
      banner: {
        provider: "quickbooks",
        status: "connected",
        message: "Acme QuickBooks connected successfully.",
      },
    };

    const html = renderToStaticMarkup(<IntegrationPortalPage data={data} />);

    expect(html).toContain("Securely connect your accounting platform");
    expect(html).toContain("Bank-grade encryption");
    expect(html).toContain("connected successfully.");
    expect(html).toContain("Connect Business Central");
    expect(html).toContain("Unavailable for this pilot");
    expect(html).toContain("Pulled Data Results");
    expect(html).toContain("Refresh Data");
    expect(html).toContain("Data validation complete");
    expect(html).toContain("/connect/accounting/business-central?token=signed-token");
    expect(html).not.toContain("Connect SAP Business One");
  });

  it("promotes a successful Business Central callback into the connected portal state", async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () =>
      ({
        ok: false,
        json: async () => ({}),
      }) as Response) as typeof fetch;

    const data = await loadIntegrationPortalData({
      tenantSlug: "acme-pilot",
      clientName: "Acme Foods",
      token: "signed-token",
      businessCentralStatus: "connected",
      companyName: "Yield Finance",
    });

    const html = renderToStaticMarkup(<IntegrationPortalPage data={data} />);

    expect(html).toContain("Yield Finance connected successfully.");
    expect(html).not.toContain("Connect Business Central");
    expect(html).toContain("Sync now");
    expect(html).toContain("Disconnect");
    expect(html).toContain('/connect/accounting/business-central/sync');
    expect(html).toContain('/connect/accounting/business-central/disconnect');
    expect(html).toContain("Pulled Data Results");
    expect(html).toContain("Connection established");
    expect(html).toContain("Yield is now pulling the initial accounting data for review.");

    global.fetch = originalFetch;
  });

  it("renders Business Central company choices as visible radio options", () => {
    const data: IntegrationPortalData = {
      tenantSlug: "acme-pilot",
      clientName: "Acme Foods",
      providers,
      token: "signed-token",
      inspectorPath: "/integrations/inspector?tenantSlug=acme-pilot&client=Acme%20Foods",
      businessCentralSelection: {
        state: "bc-state-1",
        environment: "production",
        companies: [
          { id: "company-1", name: "Contoso Holding" },
          { id: "company-2", name: "Contoso Manufacturing" },
        ],
      },
    };

    const html = renderToStaticMarkup(<IntegrationPortalPage data={data} />);

    expect(html).toContain("Contoso Holding");
    expect(html).toContain("Contoso Manufacturing");
    expect(html).toContain('type="radio"');
  });

  it("falls back to the company id when a Business Central selection name is blank", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          selection: {
            state: "bc-state-1",
            environment: "production",
            companies: [
              { id: "company-1", name: "" },
              { id: "company-2", name: "Contoso Manufacturing" },
            ],
          },
        }),
      })),
    );

    const data = await loadIntegrationPortalData({
      tenantSlug: "acme-pilot",
      clientName: "Acme Foods",
      token: "signed-token",
      businessCentralConnectState: "bc-state-1",
    });

    const html = renderToStaticMarkup(<IntegrationPortalPage data={data} />);

    expect(html).toContain("company-1");
    expect(html).toContain("Contoso Manufacturing");
  });

  it("renders the inspector page with raw payload blocks", () => {
    const data: IntegrationInspectorPageData = {
      tenantSlug: "acme-pilot",
      clientName: "Acme Foods",
      providers,
      portalPath: "/connect/accounting?tenantSlug=acme-pilot&client=Acme%20Foods",
    };

    const html = renderToStaticMarkup(<IntegrationInspectorPage data={data} />);

    expect(html).toContain("Pulled data for Acme Foods");
    expect(html).toContain("Raw Invoices");
    expect(html).toContain("Raw Payments");
    expect(html).toContain("Open client connect page");
    expect(html).toContain("No raw payload has been pulled for this provider yet.");
  });

  it("renders invite generation and denied-access screens", () => {
    const inviteData: ClientConnectInviteData = {
      tenantSlug: "acme-pilot",
      clientName: "Acme Foods",
      portalLink: "http://127.0.0.1:3000/connect/accounting?token=signed-token",
      inspectorLink: "http://127.0.0.1:3000/integrations/inspector?token=signed-token",
      statusMessage: "Client link created.",
      invites: [
        {
          inviteId: "invite-1",
          tenantSlug: "acme-pilot",
          clientName: "Acme Foods",
          status: "active",
          createdAtLabel: "Apr 16, 2026, 08:00",
          updatedAtLabel: "Apr 16, 2026, 08:00",
          createdByLabel: "web_console (controller)",
        },
      ],
    };

    const inviteHtml = renderToStaticMarkup(<ClientConnectInvitePage data={inviteData} />);
    const deniedHtml = renderToStaticMarkup(
      <ClientConnectAccessDeniedPage
        title="This invite link has expired"
        message="Generate a fresh signed link before asking the client to retry the connection."
      />,
    );

    expect(inviteHtml).toContain("Create a client connect link");
    expect(inviteHtml).toContain("http://127.0.0.1:3000/connect/accounting?token=signed-token");
    expect(inviteHtml).toContain("Issued links");
    expect(deniedHtml).toContain("This invite link has expired");
    expect(deniedHtml).toContain("Generate a fresh signed link");
  });
});
