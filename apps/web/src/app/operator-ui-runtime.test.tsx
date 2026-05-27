import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { Dashboard } from "./dashboard.js";
import { loadOperatorConsoleData, type OperatorConsoleData, type TaskQueueItem } from "./data.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalDemoData = process.env.ENABLE_DEMO_DATA;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalDemoData === undefined) {
    delete process.env.ENABLE_DEMO_DATA;
  } else {
    process.env.ENABLE_DEMO_DATA = originalDemoData;
  }
});

describe("operator UI runtime surfaces", () => {
  it("renders the Email Inbox empty state without collections demo fallback rows", async () => {
    const data = await loadOperatorConsoleData({ page: "collections" });
    const html = renderToStaticMarkup(
      <Dashboard
        data={{
          ...data,
          emailInbox: { ...data.emailInbox, resultSizeEstimate: 0, messages: [] },
          callInbox: { ...data.callInbox, total: 0, items: [], calls: [] },
          collectionsQueue: [
            {
              id: "demo-queue-row",
              accountName: "Demo Customer",
              accountTier: "standard",
              overdueAmount: "PHP 1",
              promiseDue: "Today",
              nextAction: "Demo fallback action",
              rationale: "Should not appear in Email Inbox",
              contactEmail: "demo@example.test",
              assignee: "Juan Cruz",
            },
          ],
        }}
        page="collections"
      />,
    );

    expect(html).toContain("No email threads loaded.");
    expect(html).not.toContain("demo@example.test");
    expect(html).not.toContain("Demo fallback action");
    expect(html).toContain('href="/collections?tab=call-inbox"');
    expect(html).not.toContain("SMS Inbox");
    expect(html).not.toContain("Configure");
    expect(html).not.toContain('id="collections-call-inbox"');
    expect(html).not.toContain("No completed calls yet.");
  });

  it("renders Call Inbox as its own selected collections tab", async () => {
    const data = await loadOperatorConsoleData({ page: "collections", collectionsTab: "call-inbox" });
    const html = renderToStaticMarkup(
      <Dashboard
        data={{
          ...data,
          emailInbox: { ...data.emailInbox, resultSizeEstimate: 0, messages: [] },
          callInbox: { ...data.callInbox, total: 0, items: [], calls: [] },
        }}
        page="collections"
        collectionsTab="call-inbox"
      />,
    );

    expect(html).toContain('href="/collections?tab=email"');
    expect(html).toContain('id="collections-call-inbox"');
    expect(html).toContain("No completed calls yet.");
    expect(html).not.toContain("No email threads loaded.");
  });

  it("renders real email rows with thread, task, and compose controls", async () => {
    const data = await loadOperatorConsoleData({ page: "collections" });
    const task: TaskQueueItem = {
      id: "task-acme-follow-up",
      taskCode: "TASK-ACME-1",
      title: "Follow up on Acme remittance",
      relatedRecord: "INV-ACME-1",
      amountLabel: "PHP 10,000.00",
      type: "collection",
      customerName: "Acme Corp",
      status: "open",
      priority: "high",
      assigneeName: "Operator",
      assigneeInitials: "OP",
      createdLabel: "Today",
      dueDateLabel: "Today",
      actionPath: "/tasks",
      brief: "Customer asked for invoice context before payment release.",
    };
    const emailData: OperatorConsoleData = {
      ...data,
      emailSendingIdentities: [
        {
          id: "gmail-sender-1",
          provider: "gmail",
          senderEmail: "ar@example.com",
          displayName: "AR Team",
          authMode: "oauth",
          connectionStatus: "connected",
          permissionStatus: "ready",
          healthState: "healthy",
          scopes: ["gmail.send"],
          isDefault: true,
        },
      ],
      emailInbox: {
        selectedSenderIdentityId: "gmail-sender-1",
        resultSizeEstimate: 2,
        messages: [
          {
            providerMessageId: "msg-acme-1",
            providerThreadId: "thread-acme-1",
            subjectLine: "Question about INV-ACME-1",
            fromEmail: "ap@acme.example",
            fromName: "Acme AP",
            toEmail: "ar@example.com",
            snippet: "Can you send the latest statement before we release payment?",
            bodyText: "Can you send the latest statement before we release payment?\nTreasury needs the full SOA before approval.",
            receivedAt: "2026-05-17T01:00:00.000Z",
            labelIds: ["UNREAD"],
            unread: true,
            direction: "inbound",
          },
          {
            providerMessageId: "msg-unlinked-1",
            providerThreadId: "thread-unlinked-1",
            subjectLine: "Supplier announcement",
            fromEmail: "vendor@example.test",
            fromName: "Vendor Contact",
            toEmail: "ar@example.com",
            snippet: "This sender is not linked to an O2C customer record.",
            receivedAt: "2026-05-16T01:00:00.000Z",
            labelIds: [],
            unread: false,
            direction: "inbound",
          },
        ],
        selectedThread: {
          senderIdentityId: "gmail-sender-1",
          providerThreadId: "thread-acme-1",
          subjectLine: "Question about INV-ACME-1",
          snippet: "Can you send the latest statement before we release payment?",
          participants: ["ap@acme.example", "ar@example.com"],
          latestMessageAt: "2026-05-17T01:00:00.000Z",
          unreadCount: 1,
          messages: [
            {
              providerMessageId: "msg-acme-1",
              providerThreadId: "thread-acme-1",
              subjectLine: "Question about INV-ACME-1",
              fromEmail: "ap@acme.example",
              fromName: "Acme AP",
              toEmail: "ar@example.com",
              snippet: "Can you send the latest statement before we release payment?",
              bodyText: "Can you send the latest statement before we release payment?\nTreasury needs the full SOA before approval.",
              receivedAt: "2026-05-17T01:00:00.000Z",
              labelIds: ["UNREAD"],
              unread: true,
              direction: "inbound",
            },
            {
              providerMessageId: "msg-acme-2",
              providerThreadId: "thread-acme-1",
              subjectLine: "Re: Question about INV-ACME-1",
              fromEmail: "ar@example.com",
              fromName: "AR Team",
              toEmail: "ap@acme.example",
              snippet: "Sharing invoice context for review.",
              bodyText: "Sharing invoice context for review.\nPlease confirm once payment is released.",
              receivedAt: "2026-05-17T02:00:00.000Z",
              labelIds: ["SENT"],
              unread: false,
              direction: "outbound",
            },
          ],
        },
      },
      collectionsComposeDraft: {
        composeId: "collections-email-detail-thread-acme-1",
        generator: "template",
        subjectLine: "Re: Question about INV-ACME-1",
        body: "Draft with attached invoice context.",
        attachments: [
          {
            kind: "invoice",
            spec: "INV-ACME-1",
            label: "Invoice INV-ACME-1.pdf",
          },
        ],
      },
      customerIndex: [
        {
          ...(data.customerIndex[0] ?? {
            status: "active",
            accountTier: "standard",
            branchNames: [],
            openAmount: "PHP 0.00",
            overdueAmount: "PHP 0.00",
            collectibleAmount: "PHP 0.00",
            disputedAmount: "PHP 0.00",
            openInvoiceCount: 0,
            taskCount: 0,
            completenessScore: 100,
            nextAction: "Review account",
            hasPendingReview: false,
            tabs: [],
          }),
          profileId: "profile-acme",
          canonicalName: "Acme Corp",
          billingAccountId: "bill-acme",
          billingAccountName: "Acme Corp",
          primaryContactEmail: "ap@acme.example",
        },
      ],
      invoiceIndex: {
        ...data.invoiceIndex,
        invoices: [
          ...data.invoiceIndex.invoices,
          {
            id: "invoice-acme-1",
            sourceProvider: "spreadsheet_upload",
            sourceKind: "file_upload",
            sourceLabel: "Manual import",
            importMode: "manual_upload",
            customerName: "Acme Corp",
            billingAccountId: "bill-acme",
            billingAccountName: "Acme Corp",
            parentAccountId: "parent-acme",
            parentAccountName: "Acme Holdings",
            invoiceNumber: "INV-ACME-1",
            currency: "PHP",
            totalAmountCents: 10_000_00,
            openAmountCents: 10_000_00,
            overdueAmountCents: 10_000_00,
            paidAmountCents: 0,
            status: "open",
            sourceStatus: "Open",
            daysPastDue: 4,
            tags: [],
            metadata: {},
          },
        ],
      },
      taskQueue: [task],
    };

    const html = renderToStaticMarkup(<Dashboard data={emailData} page="collections" />);

    expect(html).toContain("All");
    expect(html).toContain("Unread");
    expect(html).toContain("Sent");
    expect(html).toContain("Drafts");
    expect(html).toContain("Acme Corp");
    expect(html).toContain("Vendor Contact");
    expect(html).toContain("collections-unlinked-badge");
    expect(html).toContain("collections-email-row is-unread");
    expect(html).toContain("collections-email-row is-read");
    expect(html).toContain('<option value="profile-acme">Acme Corp</option>');
    expect(html).not.toContain('<option value="Vendor Contact">Vendor Contact</option>');
    expect(html).toContain("ap@acme.example");
    expect(html).toContain("Invoice references");
    expect(html).toContain("INV-ACME-1");
    expect(html).toContain("Email Thread");
    expect(html).toContain("<details");
    expect(html).toContain("Treasury needs the full SOA before approval.");
    expect(html).toContain("Sharing invoice context for review.");
    expect(html).toContain("Tasks <span>1</span>");
    expect(html).toContain("AI");
    expect(html).toContain("Template");
    expect(html).toContain("Email template");
    expect(html).toContain("Apply template");
    expect(html).toContain('action="/collections/compose"');
    expect(html).toContain('encType="multipart/form-data"');
    expect(html).toContain('name="subjectLine"');
    expect(html).toContain('readOnly=""');
    expect(html).toContain('data-email-format-command="bold"');
    expect(html).toContain("Attach invoice(s)");
    expect(html).toContain("Attach SOA");
    expect(html).toContain('name="collectionsComposeDraftAttachment"');
    expect(html).not.toContain('name="workflow"');
    expect(html).toContain("Draft with attached invoice context.");
    expect(html).toContain("Follow up on Acme remittance");

    const customerFilteredHtml = renderToStaticMarkup(
      <Dashboard
        data={emailData}
        page="collections"
        collectionsEmailFilters={{ customer: "profile-acme", q: "statement" }}
      />,
    );
    expect(customerFilteredHtml).toContain("Acme Corp");
    expect(customerFilteredHtml).not.toContain("vendor@example.test");

    const unmatchedHtml = renderToStaticMarkup(
      <Dashboard
        data={emailData}
        page="collections"
        collectionsEmailFilters={{ customer: "profile-acme", q: "vendor" }}
      />,
    );
    expect(unmatchedHtml).toContain("No email threads match these filters.");
  });

  it("preserves Call Agent settings form wiring after the UX refactor", async () => {
    const data = await loadOperatorConsoleData({ page: "control-center" });
    const html = renderToStaticMarkup(
      <Dashboard data={data} page="control-center" controlCenterTab="call-agent" />,
    );

    expect(html).toContain("Call Routing");
    expect(html).toContain("Call agent number");
    expect(html).toContain("Inbound/outbound SMS enabled");
    expect(html).toContain('action="/control-center/call-agent/update"');
    expect(html).toContain('name="outboundCallingEnabled"');
    expect(html).toContain('readOnly=""');
    expect(html).toContain('disabled="" aria-disabled="true"');
    expect(html).not.toContain("Customer support transfer number");
    expect(html).not.toContain("Opening Line Configuration");
    expect(html).not.toContain("Call Recording Disclaimer");
    expect(html).not.toContain("Voice agent preview");
    expect(html).not.toContain("Provider payload");
    expect(html).not.toContain('name="phoneNumber"');
    expect(html).not.toContain('name="humanSupportNumber"');
    expect(html).not.toContain('name="overrideOpeningLine"');
    expect(html).not.toContain('name="callRecordingDisclaimerEnabled"');
  });

  it("suppresses demo operational data when the explicit demo flag is off", async () => {
    process.env.NODE_ENV = "development";
    process.env.ENABLE_DEMO_DATA = "false";

    const data = await loadOperatorConsoleData({ page: "collections" });
    const html = renderToStaticMarkup(<Dashboard data={data} page="collections" />);
    const callHtml = renderToStaticMarkup(
      <Dashboard data={data} page="collections" collectionsTab="call-inbox" />,
    );

    expect(html).toContain("No email threads loaded.");
    expect(callHtml).toContain("No completed calls yet.");
    expect(html).not.toContain("SM Retail Inc.");
    expect(html).not.toContain("Perkins, Wong and Evans");
    expect(callHtml).not.toContain("Perkins, Wong and Evans");
  });
});
