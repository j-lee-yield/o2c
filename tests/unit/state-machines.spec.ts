import { describe, expect, it } from "vitest";

import {
  ExceptionTransitionService,
  InMemoryTransitionAuditHook,
  InvoiceTransitionService,
  PaymentTransitionService,
  PromiseToPayTransitionService,
  RemittanceTransitionService,
  TransitionError
} from "../../packages/domain/src/index";
import {
  makeException,
  makeInvoice,
  makePayment,
  makePromiseToPay,
  makeRemittance
} from "../../packages/seed/src/factories";

const invoiceTransitionMatrix = {
  uploaded_unmatched: ["matched_to_erp", "voided"],
  synced_open: [
    "partially_paid",
    "paid",
    "disputed_partial",
    "disputed_full",
    "credit_pending",
    "writeback_pending",
    "voided"
  ],
  matched_to_erp: [
    "partially_paid",
    "paid",
    "disputed_partial",
    "disputed_full",
    "credit_pending",
    "writeback_pending",
    "voided"
  ],
  partially_paid: ["paid", "disputed_partial", "credit_pending", "writeback_pending"],
  paid: [],
  disputed_partial: ["partially_paid", "paid", "credit_pending"],
  disputed_full: ["synced_open", "credit_pending", "voided"],
  credit_pending: ["synced_open", "partially_paid", "paid", "voided"],
  writeback_pending: ["synced_open", "partially_paid", "paid", "writeback_failed"],
  writeback_failed: ["writeback_pending", "synced_open", "partially_paid"],
  voided: []
} as const;

const paymentTransitionMatrix = {
  ingested_unmatched: ["candidate_match_found", "unapplied_cash", "reversed"],
  candidate_match_found: [
    "auto_applied",
    "review_required",
    "manually_applied",
    "unapplied_cash"
  ],
  review_required: ["manually_applied", "partially_applied", "unapplied_cash", "reversed"],
  auto_applied: ["writeback_pending", "writeback_failed"],
  manually_applied: ["writeback_pending", "writeback_failed"],
  partially_applied: ["writeback_pending", "unapplied_cash", "writeback_failed"],
  unapplied_cash: ["candidate_match_found", "manually_applied", "partially_applied"],
  reversed: [],
  writeback_pending: ["auto_applied", "manually_applied", "partially_applied", "writeback_failed"],
  writeback_failed: ["writeback_pending", "manually_applied", "partially_applied"]
} as const;

const remittanceTransitionMatrix = {
  received_unparsed: ["parsed_structured", "review_required", "orphaned"],
  parsed_structured: [
    "linked_to_payment",
    "linked_to_invoice_candidate",
    "review_required",
    "orphaned"
  ],
  linked_to_payment: ["resolved", "review_required"],
  linked_to_invoice_candidate: ["resolved", "review_required"],
  review_required: ["linked_to_payment", "linked_to_invoice_candidate", "resolved", "orphaned"],
  resolved: [],
  orphaned: []
} as const;

const promiseToPayTransitionMatrix = {
  detected_unconfirmed: ["accepted", "cancelled"],
  accepted: ["due_today", "superseded", "cancelled"],
  due_today: ["kept", "broken", "superseded"],
  kept: [],
  broken: ["accepted", "superseded"],
  superseded: [],
  cancelled: []
} as const;

const exceptionTransitionMatrix = {
  open_new: ["triaged", "dismissed"],
  triaged: ["waiting_on_customer", "waiting_on_internal", "ready_for_resolution", "dismissed"],
  waiting_on_customer: ["ready_for_resolution", "dismissed"],
  waiting_on_internal: ["ready_for_resolution", "dismissed"],
  ready_for_resolution: ["resolved", "dismissed"],
  resolved: [],
  dismissed: []
} as const;

describe("invoice state machine", () => {
  it("matches the canonical transition matrix", () => {
    const service = new InvoiceTransitionService();

    expect(service.getTransitionMatrix()).toEqual(invoiceTransitionMatrix);
  });

  it("allows a valid transition and records audit metadata", () => {
    const auditHook = new InMemoryTransitionAuditHook();
    const service = new InvoiceTransitionService(auditHook);
    const invoice = makeInvoice({ state: "matched_to_erp" });

    const updated = service.transition(invoice, "paid", {
      actorId: "user_1",
      actorRole: "user",
      reason: "ERP payment sync"
    });

    expect(updated.state).toBe("paid");
    expect(auditHook.events).toHaveLength(1);
    expect(auditHook.events[0]).toMatchObject({
      machine: "invoice",
      from: "matched_to_erp",
      to: "paid",
      actorId: "user_1"
    });
  });

  it("rejects invalid transitions", () => {
    const service = new InvoiceTransitionService();
    const invoice = makeInvoice({ state: "uploaded_unmatched" });

    expect(() =>
      service.transition(invoice, "paid", {
        actorId: "user_1",
        actorRole: "user"
      })
    ).toThrowError(new TransitionError("Invalid invoice transition: uploaded_unmatched -> paid"));
  });

  it("does not allow syncing uploaded invoices directly to synced_open", () => {
    const service = new InvoiceTransitionService();
    const invoice = makeInvoice({ state: "uploaded_unmatched" });

    expect(() =>
      service.transition(invoice, "synced_open", {
        actorId: "user_1",
        actorRole: "user"
      })
    ).toThrowError(
      new TransitionError("Invalid invoice transition: uploaded_unmatched -> synced_open")
    );
  });

  it("requires admin override to reopen a terminal invoice", () => {
    const service = new InvoiceTransitionService();
    const invoice = makeInvoice({ state: "paid" });

    expect(() =>
      service.transition(invoice, "matched_to_erp", {
        actorId: "user_1",
        actorRole: "user"
      })
    ).toThrow(TransitionError);

    const reopened = service.transition(invoice, "matched_to_erp", {
      actorId: "admin_1",
      actorRole: "admin",
      overridePolicy: "admin_manual_rollback",
      reason: "Manual rollback"
    });

    expect(reopened.state).toBe("matched_to_erp");
  });
});

describe("payment state machine", () => {
  it("matches the canonical transition matrix", () => {
    const service = new PaymentTransitionService();

    expect(service.getTransitionMatrix()).toEqual(paymentTransitionMatrix);
  });

  it("allows applying a matched payment when match evidence exists", () => {
    const service = new PaymentTransitionService();
    const payment = makePayment({ state: "candidate_match_found" });

    const updated = service.transition(payment, "auto_applied", {
      actorId: "system_1",
      actorRole: "system",
      metadata: { matchEvidence: true }
    });

    expect(updated.state).toBe("auto_applied");
  });

  it("blocks application without match evidence", () => {
    const service = new PaymentTransitionService();
    const payment = makePayment({ state: "candidate_match_found" });

    expect(() =>
      service.transition(payment, "manually_applied", {
        actorId: "user_1",
        actorRole: "user"
      })
    ).toThrow(TransitionError);
  });

  it("keeps auto-applied payments inside the writeback flow", () => {
    const service = new PaymentTransitionService();
    const payment = makePayment({ state: "auto_applied" });

    expect(() =>
      service.transition(payment, "reversed", {
        actorId: "user_1",
        actorRole: "user"
      })
    ).toThrowError(new TransitionError("Invalid payment transition: auto_applied -> reversed"));
  });

  it("treats reversed as terminal unless manually corrected by admin", () => {
    const service = new PaymentTransitionService();
    const payment = makePayment({ state: "reversed" });

    const corrected = service.transition(payment, "review_required", {
      actorId: "admin_1",
      actorRole: "admin",
      overridePolicy: "admin_manual_correction",
      reason: "Correction"
    });

    expect(corrected.state).toBe("review_required");
  });
});

describe("remittance state machine", () => {
  it("matches the canonical transition matrix", () => {
    const service = new RemittanceTransitionService();

    expect(service.getTransitionMatrix()).toEqual(remittanceTransitionMatrix);
  });

  it("links a structured remittance to payment with evidence", () => {
    const service = new RemittanceTransitionService();
    const remittance = makeRemittance({ state: "parsed_structured" });

    const updated = service.transition(remittance, "linked_to_payment", {
      actorId: "user_1",
      actorRole: "user",
      metadata: { paymentLinked: true }
    });

    expect(updated.state).toBe("linked_to_payment");
  });

  it("rejects linking to payment without link evidence", () => {
    const service = new RemittanceTransitionService();
    const remittance = makeRemittance({ state: "parsed_structured" });

    expect(() =>
      service.transition(remittance, "linked_to_payment", {
        actorId: "user_1",
        actorRole: "user"
      })
    ).toThrow(TransitionError);
  });

  it("does not orphan a payment-linked remittance directly", () => {
    const service = new RemittanceTransitionService();
    const remittance = makeRemittance({ state: "linked_to_payment" });

    expect(() =>
      service.transition(remittance, "orphaned", {
        actorId: "user_1",
        actorRole: "user"
      })
    ).toThrowError(
      new TransitionError("Invalid remittance transition: linked_to_payment -> orphaned")
    );
  });

  it("allows admin reopen from terminal orphaned state", () => {
    const service = new RemittanceTransitionService();
    const remittance = makeRemittance({ state: "orphaned" });

    const reopened = service.transition(remittance, "review_required", {
      actorId: "admin_1",
      actorRole: "admin",
      overridePolicy: "admin_manual_reopen",
      reason: "Customer submitted follow-up"
    });

    expect(reopened.state).toBe("review_required");
  });
});

describe("promise-to-pay state machine", () => {
  it("matches the canonical transition matrix", () => {
    const service = new PromiseToPayTransitionService();

    expect(service.getTransitionMatrix()).toEqual(promiseToPayTransitionMatrix);
  });

  it("moves from accepted to due_today", () => {
    const service = new PromiseToPayTransitionService();
    const promise = makePromiseToPay({ state: "accepted" });

    const updated = service.transition(promise, "due_today", {
      actorId: "system_1",
      actorRole: "system"
    });

    expect(updated.state).toBe("due_today");
  });

  it("requires a reason to complete the promise outcome", () => {
    const service = new PromiseToPayTransitionService();
    const promise = makePromiseToPay({ state: "due_today" });

    expect(() =>
      service.transition(promise, "kept", {
        actorId: "user_1",
        actorRole: "user"
      })
    ).toThrow(TransitionError);
  });

  it("does not allow accepted promises to resolve directly to kept", () => {
    const service = new PromiseToPayTransitionService();
    const promise = makePromiseToPay({ state: "accepted" });

    expect(() =>
      service.transition(promise, "kept", {
        actorId: "user_1",
        actorRole: "user",
        reason: "Collected early"
      })
    ).toThrowError(
      new TransitionError("Invalid promise_to_pay transition: accepted -> kept")
    );
  });

  it("allows admin reopen from kept", () => {
    const service = new PromiseToPayTransitionService();
    const promise = makePromiseToPay({ state: "kept" });

    const reopened = service.transition(promise, "accepted", {
      actorId: "admin_1",
      actorRole: "admin",
      overridePolicy: "admin_manual_reopen",
      reason: "Recorded against wrong promise"
    });

    expect(reopened.state).toBe("accepted");
  });
});

describe("exception state machine", () => {
  it("matches the canonical transition matrix", () => {
    const service = new ExceptionTransitionService();

    expect(service.getTransitionMatrix()).toEqual(exceptionTransitionMatrix);
  });

  it("resolves an exception from ready_for_resolution", () => {
    const service = new ExceptionTransitionService();
    const exception = makeException({ state: "ready_for_resolution" });

    const updated = service.transition(exception, "resolved", {
      actorId: "user_1",
      actorRole: "user",
      reason: "Issue cleared"
    });

    expect(updated.state).toBe("resolved");
  });

  it("rejects resolution without a reason", () => {
    const service = new ExceptionTransitionService();
    const exception = makeException({ state: "ready_for_resolution" });

    expect(() =>
      service.transition(exception, "resolved", {
        actorId: "user_1",
        actorRole: "user"
      })
    ).toThrow(TransitionError);
  });

  it("requires triage before waiting on customer", () => {
    const service = new ExceptionTransitionService();
    const exception = makeException({ state: "open_new" });

    expect(() =>
      service.transition(exception, "waiting_on_customer", {
        actorId: "user_1",
        actorRole: "user"
      })
    ).toThrowError(
      new TransitionError("Invalid exception transition: open_new -> waiting_on_customer")
    );
  });

  it("allows admin reopen from dismissed", () => {
    const service = new ExceptionTransitionService();
    const exception = makeException({ state: "dismissed" });

    const reopened = service.transition(exception, "triaged", {
      actorId: "admin_1",
      actorRole: "admin",
      overridePolicy: "admin_manual_reopen",
      reason: "Dismissed incorrectly"
    });

    expect(reopened.state).toBe("triaged");
  });
});
