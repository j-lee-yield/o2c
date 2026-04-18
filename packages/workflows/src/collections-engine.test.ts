import { describe, expect, it } from "vitest";

import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import type { Principal } from "@o2c/auth";
import { createTypedException, type Contact } from "@o2c/domain";
import { makeBillingAccount, makeInvoice, makeUploadedDocument } from "@o2c/testkit";

import { CollectionsWorkflowEngine } from "./collections-engine.js";

const collector: Principal = { id: "collector_1", roles: ["ar_collector"] };

function createContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "contact_1",
    parentAccountId: "parent-default",
    billingAccountId: "billing-default",
    scope: "billing_account",
    scopeId: "billing-default",
    fullName: "AP Contact",
    email: "ap@example.com",
    role: "ap",
    isPrimary: true,
    isVerified: true,
    allowAutoSend: true,
    recentSuccessfulResponses: 5,
    metadata: {},
    createdAt: "2026-03-26T00:00:00.000Z",
    updatedAt: "2026-03-26T00:00:00.000Z",
    ...overrides,
  };
}

function createEngine(now = "2026-03-26T09:00:00.000Z") {
  return new CollectionsWorkflowEngine({
    activityStore: new InMemoryImmutableActivityLogStore(),
    now: () => now,
    idGenerator: (prefix) => `${prefix}_1`,
  });
}

describe("CollectionsWorkflowEngine.planReminder", () => {
  it("defaults to grouped billing-account reminders and preserves branch ids", () => {
    const engine = createEngine();
    const account = makeBillingAccount({ id: "billing-default", parentAccountId: "parent-default" });
    const contact = createContact();
    const invoices = [
      makeInvoice({
        id: "inv_1",
        billingAccountId: account.id,
        parentAccountId: account.parentAccountId,
        branchId: "branch_1",
        state: "matched_to_erp",
        dueDate: "2026-03-27",
      }),
      makeInvoice({
        id: "inv_2",
        billingAccountId: account.id,
        parentAccountId: account.parentAccountId,
        branchId: "branch_2",
        state: "partially_paid",
        dueDate: "2026-03-25",
      }),
    ];

    const result = engine.planReminder({
      principal: collector,
      account,
      invoices,
      contact,
    });

    expect(result.workspace.groupingMode).toBe("billing_account");
    expect(result.reminderDraft.groupingMode).toBe("billing_account");
    expect(result.reminderDraft.branchIds).toEqual(["branch_1", "branch_2"]);
    expect(result.reminderDraft.deliveryState).toBe("ready");
    expect(result.reminderDraft.urgentInvoiceIds).toEqual(["inv_1", "inv_2"]);
    expect(result.emailProviderHook?.groupingMode).toBe("billing_account");
    expect(result.communicationAttempt?.channel).toBe("email");
    expect(result.communicationAttempt?.provider).toBe("internal");
    expect(result.communicationAttempt?.status).toBe("queued");
    expect(result.activityEntries[0]?.action).toBe("collections.reminder.auto_send_planned");
    expect(result.learningEvents.map((event) => event.eventType)).toContain("communication_attempt_created");
  });

  it("moves overdue reminders into the payment-date stage", () => {
    const engine = createEngine("2026-03-26T10:00:00.000Z");
    const account = makeBillingAccount();

    const result = engine.planReminder({
      principal: collector,
      account,
      contact: createContact(),
      invoices: [
        makeInvoice({
          id: "inv_1",
          billingAccountId: account.id,
          parentAccountId: account.parentAccountId,
          state: "matched_to_erp",
          dueDate: "2026-03-15",
        }),
      ],
    });

    expect(result.reminderDraft.escalationStage).toBe("ask_for_payment_date");
    expect(result.reminderDraft.previewLine).toContain("ask for payment date");
  });

  it("routes strategic account reminders into approval-needed state", () => {
    const engine = createEngine();
    const account = makeBillingAccount({
      id: "billing-default",
      parentAccountId: "parent-default",
      accountTier: "strategic",
    });

    const result = engine.planReminder({
      principal: collector,
      account,
      invoices: [
        makeInvoice({
          id: "inv_1",
          billingAccountId: account.id,
          parentAccountId: account.parentAccountId,
          state: "matched_to_erp",
          dueDate: "2026-03-28",
        }),
      ],
      contact: createContact(),
    });

    expect(result.reminderDraft.deliveryState).toBe("approval_needed");
    expect(result.reminderDraft.sendStrategy).toBe("awaiting_approval");
    expect(result.approvalRequest?.status).toBe("pending_approval");
    expect(result.approvalRequest?.assigneeRole).toBe("ar_manager");
    expect(result.approvalQueue[0]?.approvalId).toBe("approval_1");
    expect(result.learningEvents.map((event) => event.eventType)).toContain("approval_requested");
  });

  it("routes partial disputes with an explicit collectible amount into approval instead of blocking", () => {
    const engine = createEngine();
    const account = makeBillingAccount();

    const result = engine.planReminder({
      principal: collector,
      account,
      contact: createContact(),
      invoices: [
        makeInvoice({
          id: "inv_1",
          billingAccountId: account.id,
          parentAccountId: account.parentAccountId,
          state: "disputed_partial",
          amountCents: 250_000,
          disputedAmountCents: 61_000,
          dueDate: "2026-03-24",
          metadata: {},
        }),
      ],
    });

    expect(result.reminderDraft.deliveryState).toBe("approval_needed");
    expect(result.reminderDraft.sendStrategy).toBe("awaiting_approval");
    expect(result.reminderDraft.blockedReason).toBeUndefined();
    expect(result.reminderDraft.invoiceRefs[0]?.amountCents).toBe(189_000);
    expect(result.approvalRequest?.status).toBe("pending_approval");
    expect(result.approvalRequest?.policyContext).toMatchObject({
      hasDisputedInvoice: true,
    });
  });

  it("blocks disputed invoices from reminder sends", () => {
    const engine = createEngine();
    const account = makeBillingAccount();

    const result = engine.planReminder({
      principal: collector,
      account,
      contact: createContact(),
      invoices: [
        makeInvoice({
          id: "inv_1",
          billingAccountId: account.id,
          parentAccountId: account.parentAccountId,
          state: "disputed_full",
          dueDate: "2026-03-24",
        }),
      ],
    });

    expect(result.reminderDraft.deliveryState).toBe("blocked");
    expect(result.reminderDraft.blockedReason).toBe("disputed_invoice");
    expect(result.approvalRequest).toBeUndefined();
  });

  it("blocks partial disputes when the undisputed amount is not explicitly tracked", () => {
    const engine = createEngine();
    const account = makeBillingAccount();

    const result = engine.planReminder({
      principal: collector,
      account,
      contact: createContact(),
      invoices: [
        makeInvoice({
          id: "inv_1",
          billingAccountId: account.id,
          parentAccountId: account.parentAccountId,
          state: "disputed_partial",
          dueDate: "2026-03-24",
        }),
      ],
    });

    expect(result.reminderDraft.deliveryState).toBe("blocked");
    expect(result.reminderDraft.blockedReason).toBe("disputed_invoice");
    expect(result.approvalRequest).toBeUndefined();
  });

  it("falls back to a typed contact exception when no email contact exists", () => {
    const engine = createEngine();
    const account = makeBillingAccount();

    const result = engine.planReminder({
      principal: collector,
      account,
      invoices: [
        makeInvoice({
          id: "inv_1",
          billingAccountId: account.id,
          parentAccountId: account.parentAccountId,
          state: "matched_to_erp",
        }),
      ],
      contact: createContact({ email: undefined }),
    });

    expect(result.reminderDraft.deliveryState).toBe("blocked");
    expect(result.reminderDraft.blockedReason).toBe("missing_contact");
    expect(result.exception?.state).toBe("triaged");
    expect(result.exception?.kind).toBe("wrong_contact");
    expect(result.exception?.owner.queue).toBe("master_data");
  });

  it("pauses collection cadence when an already-paid exception is still blocking", () => {
    const engine = createEngine();
    const account = makeBillingAccount({ id: "billing-default", parentAccountId: "parent-default" });
    const invoice = makeInvoice({
      id: "inv_1",
      billingAccountId: account.id,
      parentAccountId: account.parentAccountId,
      state: "matched_to_erp",
      dueDate: "2026-03-24",
    });
    const blockingException = {
      ...createTypedException({
        id: "exception_1",
        entityType: "billing_account",
        entityId: account.id,
        kind: "already_paid",
        createdAt: "2026-03-26T09:00:00.000Z",
        metadata: {
          billingAccountId: account.id,
          invoiceIds: [invoice.id],
          paymentEvidencePresent: true,
        },
      }),
      state: "triaged" as const,
    };

    const result = engine.planReminder({
      principal: collector,
      account,
      invoices: [invoice],
      contact: createContact(),
      openExceptions: [blockingException],
    });

    expect(result.reminderDraft.deliveryState).toBe("blocked");
    expect(result.reminderDraft.blockedReason).toBe("approval_required");
    expect(result.exception?.id).toBe("exception_1");
  });
});

describe("CollectionsWorkflowEngine.handleReply", () => {
  it("auto-accepts low-risk promise-to-pay replies and updates customer memory", () => {
    const engine = createEngine();
    const account = makeBillingAccount({ id: "billing-default", parentAccountId: "parent-default" });
    const result = engine.handleReply({
      principal: collector,
      account,
      contact: createContact(),
      invoices: [
        makeInvoice({
          id: "inv_1",
          invoiceNumber: "INV-2001",
          billingAccountId: account.id,
          parentAccountId: account.parentAccountId,
          amountCents: 250_00,
          currency: "PHP",
          state: "matched_to_erp",
        }),
      ],
      body: "We will pay INV-2001 in full on 2026-03-30 for PHP 250.00.",
    });

    expect(result.analysis.classification).toBe("promise_to_pay");
    expect(result.promiseToPay?.state).toBe("accepted");
    expect(result.promiseToPay?.promiseDate).toBe("2026-03-30");
    expect(result.promiseToPay?.promisedAmountCents).toBe(25000);
    expect(result.customerMemory.promiseToPayState).toBe("accepted");
    expect(result.activityEntries.map((entry) => entry.action)).toContain(
      "collections.reply.promise_to_pay_auto_accepted"
    );
  });

  it("keeps risky promise-to-pay replies unconfirmed for strategic accounts", () => {
    const engine = createEngine();
    const account = makeBillingAccount({
      id: "billing-default",
      parentAccountId: "parent-default",
      accountTier: "strategic",
    });
    const result = engine.handleReply({
      principal: collector,
      account,
      contact: createContact(),
      invoices: [
        makeInvoice({
          id: "inv_1",
          billingAccountId: account.id,
          parentAccountId: account.parentAccountId,
          state: "matched_to_erp",
        }),
      ],
      body: "We will try to pay next week once management approves.",
    });

    expect(result.analysis.classification).toBe("promise_to_pay");
    expect(result.promiseToPay?.state).toBe("detected_unconfirmed");
    expect(result.promiseToPay?.metadata.acceptanceReasons).toEqual(
      expect.arrayContaining(["strategic_account", "missing_promise_date", "missing_promised_amount"])
    );
  });

  it("creates the already-paid exception playbook for remittance replies", () => {
    const engine = createEngine();
    const account = makeBillingAccount({ id: "billing-default", parentAccountId: "parent-default" });
    const result = engine.handleReply({
      principal: collector,
      account,
      invoices: [
        makeInvoice({
          id: "inv_1",
          billingAccountId: account.id,
          parentAccountId: account.parentAccountId,
          state: "matched_to_erp",
        }),
      ],
      subject: "Already paid",
      body: "We already paid this invoice yesterday. Attached is the remittance advice.",
      hasAttachments: true,
    });

    expect(result.analysis.classification).toBe("already_paid");
    expect(result.exception?.state).toBe("waiting_on_internal");
    expect(result.exception?.kind).toBe("already_paid");
    expect(result.exception?.recommendedNextAction.code).toBe("search_payment_ledgers");
    expect(result.exception?.metadata.paymentEvidencePresent).toBe(true);
    expect(result.customerMemory.lastReplyClassification).toBe("already_paid");
    expect(result.learningEvents.map((event) => event.eventType)).toContain("payment_outcome_after_communication");
  });

  it("requests proof and keeps collections paused when an already-paid reply lacks evidence", () => {
    const engine = createEngine();
    const account = makeBillingAccount({ id: "billing-default", parentAccountId: "parent-default" });
    const result = engine.handleReply({
      principal: collector,
      account,
      invoices: [
        makeInvoice({
          id: "inv_1",
          billingAccountId: account.id,
          parentAccountId: account.parentAccountId,
          state: "matched_to_erp",
        }),
      ],
      subject: "Already paid",
      body: "This invoice was already paid.",
    });

    expect(result.exception?.state).toBe("waiting_on_customer");
    expect(result.exception?.kind).toBe("already_paid");
    expect(result.exception?.recommendedNextAction.code).toBe("collect_payment_evidence");
    expect(result.exception?.sla.policyWindowEndsAt).toBe("2026-03-29T09:00:00.000Z");
  });

  it("auto-sends a low-risk resend bundle when the buyer says the invoice was not received", () => {
    const engine = createEngine();
    const account = makeBillingAccount({ id: "billing-default", parentAccountId: "parent-default" });
    const invoice = makeInvoice({
      id: "inv_1",
      invoiceNumber: "INV-3001",
      billingAccountId: account.id,
      parentAccountId: account.parentAccountId,
      uploadedDocumentId: "doc-invoice-1",
      state: "matched_to_erp",
    });
    const result = engine.handleReply({
      principal: collector,
      account,
      contact: createContact(),
      invoices: [invoice],
      availableDocuments: [
        makeUploadedDocument({
          id: "doc-invoice-1",
          documentType: "invoice",
          storageKey: "docs/inv-3001.pdf",
        }),
      ],
      body: "We did not receive invoice INV-3001. Please resend the invoice copy.",
    });

    expect(result.analysis.classification).toBe("invoice_not_received");
    expect(result.resendBundle?.sendStrategy).toBe("auto_send");
    expect(result.exception).toBeUndefined();
    expect(result.customerMemory.servicingIssueOpen).toBe(true);
    expect(result.learningEvents.map((event) => event.eventType)).toContain("invoice_bundle_resent");
  });

  it("routes resend requests with missing docs to a servicing exception", () => {
    const engine = createEngine();
    const account = makeBillingAccount({ id: "billing-default", parentAccountId: "parent-default" });
    const invoice = makeInvoice({
      id: "inv_1",
      invoiceNumber: "INV-3002",
      billingAccountId: account.id,
      parentAccountId: account.parentAccountId,
      uploadedDocumentId: "doc-invoice-2",
      state: "matched_to_erp",
      metadata: {
        statement_of_accountDocumentId: "doc-soa-2",
      },
    });
    const result = engine.handleReply({
      principal: collector,
      account,
      contact: createContact(),
      invoices: [invoice],
      availableDocuments: [
        makeUploadedDocument({
          id: "doc-invoice-2",
          documentType: "invoice",
          storageKey: "docs/inv-3002.pdf",
        }),
      ],
      body: "Please resend INV-3002 together with the latest statement of account and supporting docs.",
    });

    expect(result.analysis.classification).toBe("request_for_docs");
    expect(result.resendBundle?.sendStrategy).toBe("manual_exception");
    expect(result.exception?.kind).toBe("missing_supporting_docs");
    expect(result.approvalRequest).toBeUndefined();
  });

  it("uses typed uploaded-document categories when assembling resend bundles", () => {
    const engine = createEngine();
    const account = makeBillingAccount({ id: "billing-default", parentAccountId: "parent-default" });
    const invoice = makeInvoice({
      id: "inv_soa_1",
      invoiceNumber: "INV-3002A",
      billingAccountId: account.id,
      parentAccountId: account.parentAccountId,
      uploadedDocumentId: "doc-invoice-typed",
      state: "matched_to_erp",
      metadata: {
        statement_of_accountDocumentId: "doc-soa-typed",
      },
    });
    const result = engine.handleReply({
      principal: collector,
      account,
      contact: createContact(),
      invoices: [invoice],
      availableDocuments: [
        makeUploadedDocument({
          id: "doc-invoice-typed",
          documentType: "bir_invoice",
          storageKey: "docs/inv-3002a.pdf",
        }),
        makeUploadedDocument({
          id: "doc-soa-typed",
          documentType: "statement_of_account",
          storageKey: "docs/soa-3002a.pdf",
        }),
      ],
      body: "Please resend INV-3002A together with the latest statement of account.",
    });

    expect(result.resendBundle?.sendStrategy).toBe("auto_send");
    expect(result.resendBundle?.documents.some((document) => document.sourceDocumentType === "statement_of_account")).toBe(true);
  });

  it("routes resend requests for unverified recipients to exception plus approval", () => {
    const engine = createEngine();
    const account = makeBillingAccount({ id: "billing-default", parentAccountId: "parent-default" });
    const invoice = makeInvoice({
      id: "inv_1",
      invoiceNumber: "INV-3003",
      billingAccountId: account.id,
      parentAccountId: account.parentAccountId,
      uploadedDocumentId: "doc-invoice-3",
      state: "matched_to_erp",
    });
    const result = engine.handleReply({
      principal: collector,
      account,
      contact: createContact({ isVerified: false, allowAutoSend: false }),
      invoices: [invoice],
      availableDocuments: [
        makeUploadedDocument({
          id: "doc-invoice-3",
          documentType: "invoice",
          storageKey: "docs/inv-3003.pdf",
        }),
      ],
      body: "Can you please resend invoice INV-3003 to this email address?",
    });

    expect(result.analysis.classification).toBe("request_for_docs");
    expect(result.resendBundle?.sendStrategy).toBe("awaiting_review");
    expect(result.exception?.kind).toBe("invoice_not_received");
    expect(result.approvalRequest?.status).toBe("pending_approval");
  });

  it("creates a typed exception when the reply says the recipient is the wrong contact", () => {
    const engine = createEngine();
    const account = makeBillingAccount({ id: "billing-default", parentAccountId: "parent-default" });
    const result = engine.handleReply({
      principal: collector,
      account,
      invoices: [
        makeInvoice({
          id: "inv_1",
          billingAccountId: account.id,
          parentAccountId: account.parentAccountId,
          state: "matched_to_erp",
        }),
      ],
      body: "You have the wrong contact. I no longer handle vendor invoices for this account.",
    });

    expect(result.analysis.classification).toBe("wrong_contact");
    expect(result.exception?.kind).toBe("wrong_contact");
    expect(result.customerMemory.wrongContactReported).toBe(true);
  });

  it("creates dispute exceptions for partial and full dispute replies", () => {
    const engine = createEngine();
    const account = makeBillingAccount({ id: "billing-default", parentAccountId: "parent-default" });
    const invoice = makeInvoice({
      id: "inv_9",
      invoiceNumber: "INV-9001",
      billingAccountId: account.id,
      parentAccountId: account.parentAccountId,
      state: "matched_to_erp",
    });

    const partial = engine.handleReply({
      principal: collector,
      account,
      invoices: [invoice],
      body: "We will short pay INV-9001 because there is a quantity issue on part of the delivery.",
    });
    const full = engine.handleReply({
      principal: collector,
      account,
      invoices: [invoice],
      body: "We dispute invoice INV-9001 in full and are not accepting this invoice.",
    });

    expect(partial.analysis.classification).toBe("partial_dispute");
    expect(full.analysis.classification).toBe("full_dispute");
    expect(partial.exception?.kind).toBe("partial_dispute");
    expect(full.customerMemory.disputedInvoiceIds).toEqual(["inv_9"]);
  });

  it("captures generic no-action replies without opening a new case", () => {
    const engine = createEngine();
    const account = makeBillingAccount({ id: "billing-default", parentAccountId: "parent-default" });
    const result = engine.handleReply({
      principal: collector,
      account,
      invoices: [
        makeInvoice({
          id: "inv_1",
          billingAccountId: account.id,
          parentAccountId: account.parentAccountId,
          state: "matched_to_erp",
        }),
      ],
      body: "Noted, thank you.",
    });

    expect(result.analysis.classification).toBe("generic_no_action_reply");
    expect(result.exception).toBeUndefined();
    expect(result.approvalRequest).toBeUndefined();
  });
});
