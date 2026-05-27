import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dashboard } from "./dashboard.js";
import { loadOperatorConsoleData, type OperatorConsoleData } from "./data.js";

describe("Collections call inbox dashboard", () => {
  it("renders call inbox rows and call detail/transcript modals", async () => {
    const data = await loadOperatorConsoleData();
    const startedAt = "2026-05-08T05:17:00.000Z";
    const call: OperatorConsoleData["callInbox"]["calls"][number] = {
      id: "call_test_1",
      tenantId: "tenant_1",
      provider: "retell",
      providerCallId: "retell_call_1",
      billingAccountId: "billing_1",
      branchId: "branch_1",
      customerName: "Perkins, Wong and Evans",
      customerPhone: "+1 716 860 9532",
      fromNumber: "+1 213 561 6499",
      toNumber: "+1 716 860 9532",
      direction: "outbound",
      status: "completed",
      providerStatus: "ended",
      startedAt,
      durationSeconds: 56,
      voicemail: false,
      sentiment: "positive",
      classifications: ["Payment promise", "Support request"],
      workflowName: "Overdue collections",
      requestedBy: "Matthew Breckon",
      approverName: "Juan Cruz",
      invoiceRefs: [
        { invoiceNumber: "PER-FS6667", billingAccountId: "billing_1", branchId: "branch_1" },
      ],
      summary: "Customer requested invoice copies and a payment link.",
      transcriptSegments: [
        { speaker: "agent", text: "Do you have a moment to chat about your account?" },
        { speaker: "customer", text: "Please send the invoices and payment link." },
      ],
      taskRefs: [
        {
          id: "task_1",
          title: "Payment promises",
          status: "open",
          taskType: "promise_to_pay",
          ownerTeam: "collections",
        },
      ],
      openTasksCount: 1,
      metadata: {},
      createdAt: startedAt,
      updatedAt: startedAt,
    };

    data.callInbox = {
      generatedAt: "2026-05-08T05:30:00.000Z",
      source: {
        kind: "live",
        label: "Call inbox API",
        detail: "Loaded from normalized call inbox read models.",
      },
      total: 1,
      filters: {},
      items: [
        {
          id: call.id,
          providerCallId: call.providerCallId,
          customerName: call.customerName,
          customerPhone: call.customerPhone,
          billingAccountId: call.billingAccountId,
          branchId: call.branchId,
          direction: call.direction,
          status: call.status,
          providerStatus: call.providerStatus,
          startedAt: call.startedAt,
          durationSeconds: call.durationSeconds,
          voicemail: call.voicemail,
          sentiment: call.sentiment,
          classifications: call.classifications,
          workflowName: call.workflowName,
          requestedBy: call.requestedBy,
          approverName: call.approverName,
          invoiceNumbers: call.invoiceRefs.map((invoice) => invoice.invoiceNumber),
          openTasksCount: call.openTasksCount,
        },
      ],
      calls: [call],
      exportPath: "/collections/call-inbox/export",
    };

    const html = renderToStaticMarkup(
      <Dashboard data={data} page="collections" collectionsTab="call-inbox" />,
    );

    expect(html).toContain("Call Inbox");
    expect(html).toContain("Direction");
    expect(html).toContain("Classification");
    expect(html).toContain("Voicemail");
    expect(html).toContain("Date range");
    expect(html).toContain('name="dateFrom"');
    expect(html).toContain('name="dateTo"');
    expect(html).not.toContain('name="date"');
    expect(html).toContain("Perkins, Wong and Evans");
    expect(html).toContain("Payment promise");
    expect(html).toContain("Call Details");
    expect(html).toContain("Transcript");
    expect(html).toContain("Payment promises");
    expect(html).toContain("/collections/call-inbox/export");

    const filteredHtml = renderToStaticMarkup(
      <Dashboard
        data={data}
        page="collections"
        collectionsTab="call-inbox"
        collectionsCallFilters={{
          direction: "inbound",
          status: "completed",
          voicemail: "no",
          dateFrom: "2026-05-09",
          dateTo: "2026-05-10",
        }}
      />,
    );
    expect(filteredHtml).toContain("No calls match these filters.");
    expect(filteredHtml).not.toContain('href="#call-detail-call_test_1"');

    const dateRangeHtml = renderToStaticMarkup(
      <Dashboard
        data={data}
        page="collections"
        collectionsTab="call-inbox"
        collectionsCallFilters={{
          dateFrom: "2026-05-08",
          dateTo: "2026-05-08",
        }}
      />,
    );
    expect(dateRangeHtml).toContain("May 8, 2026");
    expect(dateRangeHtml).toContain("Clear dates");
    expect(dateRangeHtml).toContain("Perkins, Wong and Evans");
  });
});
