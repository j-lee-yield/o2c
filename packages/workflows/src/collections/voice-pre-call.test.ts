import { describe, expect, it } from "vitest";
import type { Contact, PromiseToPay } from "@o2c/domain";
import { makeBillingAccount, makeInvoice } from "@o2c/testkit";
import {
  buildCollectionsVoicePreCallPlan,
  buildVoicePostCallPersistencePlan,
  computeInvoiceFollowUpBuckets,
  resolveCollectionsVoicePreCallAsOf
} from "./voice-pre-call.js";

const asOf = "2026-04-29T02:00:00.000Z";

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "contact_1",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    parentAccountId: "parent_1",
    billingAccountId: "billing_1",
    branchId: "branch_1",
    scope: "billing_account",
    scopeId: "billing_1",
    fullName: "Maria Santos",
    email: "maria@example.com",
    phone: "+639171234567",
    role: "ap",
    isPrimary: true,
    isVerified: true,
    allowAutoSend: true,
    recentSuccessfulResponses: 2,
    metadata: {},
    ...overrides
  };
}

function makePromiseToPay(overrides: Partial<PromiseToPay> = {}): PromiseToPay {
  return {
    id: "ptp_1",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    state: "accepted",
    parentAccountId: "parent_1",
    billingAccountId: "billing_1",
    contactId: "contact_1",
    promisedAmountCents: 100_000,
    currency: "PHP",
    promiseDate: "2026-05-05",
    metadata: {},
    ...overrides
  };
}

function makeOpenInvoice(overrides: Parameters<typeof makeInvoice>[0] = {}) {
  return makeInvoice({
    id: "inv_open",
    state: "matched_to_erp",
    parentAccountId: "parent_1",
    billingAccountId: "billing_1",
    branchId: "branch_1",
    invoiceNumber: "INV-OPEN",
    amountCents: 100_000,
    dueDate: "2026-04-20",
    ...overrides
  });
}

describe("voice pre-call invoice follow-up planning", () => {
  it("computes overdue, due-today, and pre-due SOA buckets in cents", () => {
    const invoices = [
      makeInvoice({
        id: "inv_overdue",
        state: "matched_to_erp",
        parentAccountId: "parent_1",
        billingAccountId: "billing_1",
        branchId: "branch_1",
        invoiceNumber: "INV-OVERDUE",
        amountCents: 100_000,
        dueDate: "2026-04-20"
      }),
      makeInvoice({
        id: "inv_today",
        state: "synced_open",
        parentAccountId: "parent_1",
        billingAccountId: "billing_1",
        invoiceNumber: "INV-TODAY",
        amountCents: 25_000,
        dueDate: "2026-04-29"
      }),
      makeInvoice({
        id: "inv_predue",
        state: "partially_paid",
        parentAccountId: "parent_1",
        billingAccountId: "billing_1",
        invoiceNumber: "INV-PRE",
        amountCents: 75_000,
        collectibleAmountCents: 40_000,
        dueDate: "2026-05-03"
      }),
      makeInvoice({
        id: "inv_later",
        state: "matched_to_erp",
        parentAccountId: "parent_1",
        billingAccountId: "billing_1",
        invoiceNumber: "INV-LATER",
        amountCents: 60_000,
        dueDate: "2026-06-01"
      })
    ];

    const result = computeInvoiceFollowUpBuckets({
      invoices,
      asOf,
      preDueWindowDays: 7
    });

    expect(result.bucketOutput).toMatchObject({
      has_overdue: true,
      has_due_today: true,
      has_pre_due: true,
      overdue_total: 100_000,
      due_today_total: 25_000,
      pre_due_total: 40_000,
      balance_total: 225_000,
      oldest_overdue_days: 9
    });
    expect(result.bucketOutput.overdue_summary).toContain("INV-OVERDUE");
    expect(result.bucketOutput.pre_due_summary).toContain("INV-PRE");
  });

  it("regroups stale invoice metadata from the current Manila date and promise state", () => {
    const invoices = [
      makeOpenInvoice({
        id: "jarc_dt_001",
        invoiceNumber: "JARC-DT-001",
        amountCents: 112_200,
        dueDate: "2026-05-13",
        metadata: { invoiceGroup: "due_today_without_promise" }
      }),
      makeOpenInvoice({
        id: "jarc_dt_002",
        invoiceNumber: "JARC-DT-002",
        amountCents: 58_800,
        dueDate: "2026-05-13",
        metadata: { invoiceGroup: "due_today_without_promise" }
      }),
      makeOpenInvoice({
        id: "jarc_pd_001",
        invoiceNumber: "JARC-PD-001",
        amountCents: 153_400,
        dueDate: "2026-05-14",
        metadata: { invoiceGroup: "pre_due_without_promise" }
      }),
      makeOpenInvoice({
        id: "jarc_pd_002",
        invoiceNumber: "JARC-PD-002",
        amountCents: 79_750,
        dueDate: "2026-05-16",
        metadata: { invoiceGroup: "pre_due_without_promise" }
      })
    ];

    const promisesToPay = [
      makePromiseToPay({
        id: "ptp_jarc_pd_002",
        promiseDate: "2026-05-16",
        metadata: { invoiceIds: ["jarc_pd_002"] }
      })
    ];

    const result = computeInvoiceFollowUpBuckets({
      invoices,
      promisesToPay,
      asOf: "2026-05-14T10:00:00.000+08:00",
      preDueWindowDays: 7
    });

    expect(result.overdueWithoutPromiseInvoices.map((invoice) => invoice.invoiceNumber)).toEqual([
      "JARC-DT-001",
      "JARC-DT-002"
    ]);
    expect(result.dueTodayWithoutPromiseInvoices.map((invoice) => invoice.invoiceNumber)).toEqual([
      "JARC-PD-001"
    ]);
    expect(result.preDueWithoutPromiseInvoices).toEqual([]);
    expect(result.activeFuturePromiseInvoices.map((invoice) => invoice.invoiceNumber)).toEqual([
      "JARC-PD-002"
    ]);
    expect(result.bucketOutput).toMatchObject({
      overdue_without_promise_count: 2,
      due_today_without_promise_count: 1,
      pre_due_without_promise_count: 0,
      active_future_promise_count: 1
    });
  });

  it("refreshes stale live-call asOf values to the current Manila business date", () => {
    expect(
      resolveCollectionsVoicePreCallAsOf(
        "2026-05-13T10:00:00.000+08:00",
        "2026-05-14T10:00:00.000+08:00"
      )
    ).toBe("2026-05-14T10:00:00.000+08:00");
    expect(
      resolveCollectionsVoicePreCallAsOf(
        "2026-05-14T08:00:00.000+08:00",
        "2026-05-14T10:00:00.000+08:00"
      )
    ).toBe("2026-05-14T08:00:00.000+08:00");
  });

  it("blocks automated calls when any invoice is disputed", () => {
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
      branchId: "branch_1",
      metadata: {}
    });
    const contact = makeContact();
    const invoices = [
      makeInvoice({
        id: "inv_disputed",
        state: "disputed_full",
        parentAccountId: "parent_1",
        billingAccountId: "billing_1",
        branchId: "branch_1",
        invoiceNumber: "INV-DISPUTED",
        amountCents: 120_000,
        dueDate: "2026-04-01"
      })
    ];

    const plan = buildCollectionsVoicePreCallPlan({
      planId: "plan_1",
      account,
      contact,
      invoices,
      asOf
    });

    expect(plan.safetyDecision.allowed).toBe(false);
    expect(plan.safetyDecision.blockedReasons).toEqual(
      expect.arrayContaining(["disputed_invoice", "no_collectible_invoices"])
    );
    expect(plan.eligibleInvoiceIds).toEqual([]);
  });

  it("blocks unverified contacts and ambiguous billing-account routing", () => {
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
      metadata: {}
    });
    const contact = makeContact({
      isVerified: false,
      allowAutoSend: false,
      billingAccountId: "billing_other"
    });
    const invoices = [
      makeInvoice({
        id: "inv_wrong_route",
        state: "matched_to_erp",
        parentAccountId: "parent_1",
        billingAccountId: "billing_other",
        invoiceNumber: "INV-OTHER",
        amountCents: 80_000,
        dueDate: "2026-04-20"
      })
    ];

    const plan = buildCollectionsVoicePreCallPlan({
      planId: "plan_2",
      account,
      contact,
      invoices,
      asOf
    });

    expect(plan.safetyDecision.allowed).toBe(false);
    expect(plan.safetyDecision.blockedReasons).toEqual(
      expect.arrayContaining(["unverified_contact", "ambiguous_routing"])
    );
    expect(plan.preCallOutput).toMatchObject({
      verified_contact_status: "unverified",
      handler_verification_source: "unknown",
      right_party_check_required: true
    });
  });

  it("skips right-party check only for a verified invoice-payment handler", () => {
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
      branchId: "branch_1",
      metadata: {
        currentAccountHandlerName: "Maria Santos",
        currentAccountHandlerRole: "AP manager",
        currentHandlerContactId: "contact_1"
      }
    });
    const contact = makeContact({
      metadata: {
        verifiedInvoicePaymentHandler: true,
        handlerVerificationSource: "operator_set"
      }
    });

    const plan = buildCollectionsVoicePreCallPlan({
      planId: "plan_verified_handler",
      account,
      contact,
      invoices: [makeOpenInvoice()],
      asOf
    });

    expect(plan.preCallOutput).toMatchObject({
      verified_contact_status: "verified",
      handler_verification_source: "operator_set",
      current_account_handler_name: "Maria Santos",
      current_account_handler_role: "AP manager",
      current_handler_contact_id: "contact_1",
      right_party_check_required: false
    });
    expect(plan.safetyDecision.blockedReasons).not.toContain("handler_handoff_requires_review");
  });

  it("requires live right-party check for a verified contact without handler proof", () => {
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
      metadata: {}
    });
    const contact = makeContact({
      isVerified: true,
      allowAutoSend: true,
      metadata: {}
    });

    const plan = buildCollectionsVoicePreCallPlan({
      planId: "plan_unknown_handler",
      account,
      contact,
      invoices: [makeOpenInvoice()],
      asOf
    });

    expect(plan.safetyDecision.allowed).toBe(true);
    expect(plan.preCallOutput).toMatchObject({
      verified_contact_status: "unknown",
      handler_verification_source: "unknown",
      right_party_check_required: true
    });
  });

  it("captures known handler handoff data and marks live transfer possible only when verified", () => {
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
      branchId: "branch_1",
      metadata: {}
    });
    const contact = makeContact({
      metadata: {
        verifiedInvoicePaymentHandler: true,
        handlerVerificationSource: "historical",
        currentContactMayNoLongerBeHandler: true,
        knownNewHandlerName: "Ana Reyes",
        knownNewHandlerPhone: "+639188887777",
        knownNewHandlerEmail: "ana@example.com",
        knownNewHandlerVerified: true
      }
    });

    const plan = buildCollectionsVoicePreCallPlan({
      planId: "plan_known_handoff",
      account,
      contact,
      invoices: [makeOpenInvoice()],
      asOf
    });

    expect(plan.safetyDecision.allowed).toBe(true);
    expect(plan.preCallOutput).toMatchObject({
      verified_contact_status: "verified",
      handler_handoff_possible: true,
      current_contact_may_no_longer_be_handler: true,
      known_new_handler_name: "Ana Reyes",
      known_new_handler_phone: "+639188887777",
      known_new_handler_email: "ana@example.com",
      routing_update_recommended: true,
      live_transfer_possible: true,
      handoff_follow_up_required: false,
      handler_handoff_blocked_reason: ""
    });
  });

  it("blocks safely when pre-call handoff data is insufficient or unverified", () => {
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
      branchId: "branch_1",
      metadata: {}
    });
    const unknownNewHandlerPlan = buildCollectionsVoicePreCallPlan({
      planId: "plan_unknown_new_handler",
      account,
      contact: makeContact({
        metadata: {
          verifiedInvoicePaymentHandler: true,
          handlerVerificationSource: "historical",
          currentContactMayNoLongerBeHandler: true
        }
      }),
      invoices: [makeOpenInvoice()],
      asOf
    });
    const unverifiedNewHandlerPlan = buildCollectionsVoicePreCallPlan({
      planId: "plan_unverified_new_handler",
      account,
      contact: makeContact({
        metadata: {
          verifiedInvoicePaymentHandler: true,
          handlerVerificationSource: "historical",
          currentContactMayNoLongerBeHandler: true,
          knownNewHandlerName: "Ana Reyes",
          knownNewHandlerPhone: "+639188887777",
          knownNewHandlerVerified: false
        }
      }),
      invoices: [makeOpenInvoice()],
      asOf
    });

    expect(unknownNewHandlerPlan.safetyDecision.allowed).toBe(false);
    expect(unknownNewHandlerPlan.safetyDecision.blockedReasons).toContain(
      "handler_handoff_requires_review"
    );
    expect(unknownNewHandlerPlan.preCallOutput).toMatchObject({
      handler_handoff_possible: true,
      handoff_follow_up_required: true,
      handler_handoff_blocked_reason: "new_handler_unknown"
    });
    expect(unverifiedNewHandlerPlan.safetyDecision.allowed).toBe(false);
    expect(unverifiedNewHandlerPlan.safetyDecision.blockedReasons).toContain(
      "handler_handoff_requires_review"
    );
    expect(unverifiedNewHandlerPlan.preCallOutput).toMatchObject({
      known_new_handler_name: "Ana Reyes",
      handler_handoff_blocked_reason: "new_handler_unverified"
    });
  });

  it("distinguishes live-transfer handoff from safe follow-up handoff", () => {
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
      branchId: "branch_1",
      metadata: {}
    });
    const liveTransferPlan = buildCollectionsVoicePreCallPlan({
      planId: "plan_live_transfer_handoff",
      account,
      contact: makeContact({
        metadata: {
          verifiedInvoicePaymentHandler: true,
          handlerVerificationSource: "historical",
          currentContactMayNoLongerBeHandler: true,
          knownNewHandlerName: "Ana Reyes",
          knownNewHandlerPhone: "+639188887777",
          knownNewHandlerEmail: "ana@example.com",
          knownNewHandlerVerified: true
        }
      }),
      invoices: [makeOpenInvoice()],
      asOf
    });
    const followUpPlan = buildCollectionsVoicePreCallPlan({
      planId: "plan_follow_up_handoff",
      account,
      contact: makeContact({
        metadata: {
          verifiedInvoicePaymentHandler: true,
          handlerVerificationSource: "historical",
          currentContactMayNoLongerBeHandler: true,
          knownNewHandlerName: "Ana Reyes",
          knownNewHandlerEmail: "ana@example.com",
          knownNewHandlerVerified: true
        }
      }),
      invoices: [makeOpenInvoice()],
      asOf
    });

    expect(liveTransferPlan.safetyDecision.allowed).toBe(true);
    expect(liveTransferPlan.preCallOutput).toMatchObject({
      call_objective: "mixed_collections_call_with_handler_check",
      handler_handoff_possible: true,
      routing_update_recommended: true,
      live_transfer_possible: true,
      handoff_follow_up_required: false,
      handler_handoff_blocked_reason: ""
    });
    expect(followUpPlan.safetyDecision.allowed).toBe(false);
    expect(followUpPlan.safetyDecision.blockedReasons).toContain("handler_handoff_requires_review");
    expect(followUpPlan.preCallOutput).toMatchObject({
      call_objective: "mixed_collections_call_with_handler_check",
      handler_handoff_possible: true,
      routing_update_recommended: true,
      live_transfer_possible: false,
      handoff_follow_up_required: true,
      handler_handoff_blocked_reason: "new_handler_missing_phone"
    });
  });

  it("segments overdue invoices with active promises away from overdue no-promise chase", () => {
    const invoices = [
      makeOpenInvoice({
        id: "inv_overdue_promised",
        invoiceNumber: "INV-OVERDUE-PTP",
        amountCents: 120_000,
        dueDate: "2026-04-20"
      }),
      makeOpenInvoice({
        id: "inv_overdue_without_promise",
        invoiceNumber: "INV-OVERDUE-NO-PTP",
        amountCents: 80_000,
        dueDate: "2026-04-22"
      })
    ];

    const result = computeInvoiceFollowUpBuckets({
      invoices,
      promisesToPay: [
        makePromiseToPay({
          id: "ptp_future_for_overdue",
          promisedAmountCents: 120_000,
          promiseDate: "2026-05-05",
          metadata: { invoiceIds: ["inv_overdue_promised"] }
        })
      ],
      asOf
    });

    expect(result.bucketedInvoices.overdue.map((invoice) => invoice.invoiceId)).toEqual([
      "inv_overdue_promised",
      "inv_overdue_without_promise"
    ]);
    expect(result.activeFuturePromiseInvoices.map((invoice) => invoice.invoiceId)).toEqual([
      "inv_overdue_promised"
    ]);
    expect(result.overdueWithoutPromiseInvoices.map((invoice) => invoice.invoiceId)).toEqual([
      "inv_overdue_without_promise"
    ]);
    expect(result.bucketOutput).toMatchObject({
      has_overdue_without_promise: true,
      overdue_without_promise_count: 1,
      overdue_without_promise_total: 80_000,
      has_active_future_promises: true,
      active_future_promise_count: 1,
      active_future_promise_total: 120_000,
      earliest_active_promise_date: "2026-05-05",
      overall_balance_total: 200_000,
      blocked_reason: ""
    });
    expect(result.priorityGroups.map((group) => group.name)).toEqual([
      "overdue_without_promise",
      "active_future_promises"
    ]);
  });

  it("treats due-today and pre-due invoices with future promises as confirmations", () => {
    const invoices = [
      makeOpenInvoice({
        id: "inv_due_today_promised",
        invoiceNumber: "INV-DUE-TODAY-PTP",
        amountCents: 70_000,
        dueDate: "2026-04-29"
      }),
      makeOpenInvoice({
        id: "inv_pre_due_promised",
        invoiceNumber: "INV-PRE-DUE-PTP",
        amountCents: 50_000,
        dueDate: "2026-05-03"
      })
    ];

    const result = computeInvoiceFollowUpBuckets({
      invoices,
      promisesToPay: [
        makePromiseToPay({
          id: "ptp_due_today_future",
          promisedAmountCents: 70_000,
          promiseDate: "2026-05-04",
          metadata: { invoiceIds: ["inv_due_today_promised"] }
        }),
        makePromiseToPay({
          id: "ptp_pre_due_future",
          promisedAmountCents: 50_000,
          promiseDate: "2026-05-06",
          metadata: { invoiceIds: ["inv_pre_due_promised"] }
        })
      ],
      asOf
    });

    expect(result.bucketedInvoices.due_today.map((invoice) => invoice.invoiceId)).toEqual([
      "inv_due_today_promised"
    ]);
    expect(result.bucketedInvoices.pre_due.map((invoice) => invoice.invoiceId)).toEqual([
      "inv_pre_due_promised"
    ]);
    expect(result.dueTodayWithoutPromiseInvoices).toEqual([]);
    expect(result.preDueWithoutPromiseInvoices).toEqual([]);
    expect(result.activeFuturePromiseInvoices.map((invoice) => invoice.invoiceId)).toEqual([
      "inv_due_today_promised",
      "inv_pre_due_promised"
    ]);
    expect(result.bucketOutput).toMatchObject({
      has_due_today: true,
      has_pre_due: true,
      has_due_today_without_promise: false,
      due_today_without_promise_count: 0,
      has_pre_due_without_promise: false,
      pre_due_without_promise_count: 0,
      has_active_future_promises: true,
      active_future_promise_count: 2,
      active_future_promise_total: 120_000,
      earliest_active_promise_date: "2026-05-04"
    });
    expect(result.priorityGroups.map((group) => group.name)).toEqual(["active_future_promises"]);
  });

  it("prioritizes broken promises ahead of routine reminders", () => {
    const result = computeInvoiceFollowUpBuckets({
      invoices: [
        makeOpenInvoice({
          id: "inv_broken_routine",
          invoiceNumber: "INV-BROKEN-ROUTINE",
          amountCents: 90_000,
          dueDate: "2026-06-10"
        }),
        makeOpenInvoice({
          id: "inv_routine",
          invoiceNumber: "INV-ROUTINE",
          amountCents: 40_000,
          dueDate: "2026-06-12"
        })
      ],
      promisesToPay: [
        makePromiseToPay({
          id: "ptp_broken_routine",
          promisedAmountCents: 90_000,
          promiseDate: "2026-04-20",
          metadata: { invoiceIds: ["inv_broken_routine"] }
        })
      ],
      asOf
    });

    expect(result.brokenPromiseInvoices.map((invoice) => invoice.invoiceId)).toEqual([
      "inv_broken_routine"
    ]);
    expect(result.routineReminderInvoices.map((invoice) => invoice.invoiceId)).toEqual([
      "inv_routine"
    ]);
    expect(result.priorityGroups.map((group) => group.name)).toEqual([
      "broken_promises",
      "routine_reminders"
    ]);
    expect(result.priorityGroups[0]).toMatchObject({
      name: "broken_promises",
      totalCents: 90_000
    });
  });

  it("preserves disputed invoices separately and excludes zero-balance invoices from chase groups", () => {
    const result = computeInvoiceFollowUpBuckets({
      invoices: [
        makeOpenInvoice({
          id: "inv_disputed",
          state: "disputed_full",
          invoiceNumber: "INV-DISPUTED",
          amountCents: 120_000,
          dueDate: "2026-04-15"
        }),
        makeOpenInvoice({
          id: "inv_zero",
          invoiceNumber: "INV-ZERO",
          amountCents: 0,
          dueDate: "2026-04-15"
        }),
        makeOpenInvoice({
          id: "inv_chaseable",
          invoiceNumber: "INV-CHASEABLE",
          amountCents: 30_000,
          dueDate: "2026-04-20"
        })
      ],
      asOf
    });

    expect(result.disputedInvoices.map((invoice) => invoice.invoiceId)).toEqual(["inv_disputed"]);
    expect(result.overdueWithoutPromiseInvoices.map((invoice) => invoice.invoiceId)).toEqual([
      "inv_chaseable"
    ]);
    expect(result.balanceInvoices.map((invoice) => invoice.invoiceId)).not.toContain("inv_zero");
    expect(result.excludedInvoiceIds).toEqual(expect.arrayContaining(["inv_disputed", "inv_zero"]));
    expect(result.bucketOutput).toMatchObject({
      has_disputed_invoices: true,
      disputed_invoice_count: 1,
      disputed_invoice_total: 120_000,
      balance_total: 30_000,
      overall_balance_total: 150_000,
      blocked_reason: "disputed_invoice"
    });
    expect(result.bucketOutput.disputed_invoice_summary).toContain("INV-DISPUTED");
    expect(result.blockedReason).toBe("disputed_invoice");
  });

  it("plans only active future promises as a confirmation call, not a chase", () => {
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
      branchId: "branch_1",
      metadata: {}
    });
    const contact = makeContact({
      metadata: {
        verifiedInvoicePaymentHandler: true,
        handlerVerificationSource: "operator_set"
      }
    });

    const plan = buildCollectionsVoicePreCallPlan({
      planId: "plan_active_promises_only",
      account,
      contact,
      invoices: [
        makeOpenInvoice({
          id: "inv_active_only",
          invoiceNumber: "INV-ACTIVE-ONLY",
          amountCents: 110_000,
          dueDate: "2026-04-29"
        })
      ],
      promisesToPay: [
        makePromiseToPay({
          id: "ptp_active_only",
          promisedAmountCents: 110_000,
          promiseDate: "2026-05-06",
          metadata: { invoiceIds: ["inv_active_only"] }
        })
      ],
      asOf
    });

    expect(plan.callPriorityGroups.map((group) => group.name)).toEqual(["active_future_promises"]);
    expect(plan.callPriorityGroups[0]).toMatchObject({
      treatmentMode: "confirmation",
      requiresFreshChase: false,
      confirmationOriented: true
    });
    expect(plan.preCallOutput).toMatchObject({
      call_objective: "confirm_active_promises_only",
      call_priority_flags: expect.stringContaining("confirmation_only"),
      operator_summary: expect.stringContaining("active future promises first")
    });
    expect(plan.preCallOutput.call_priority_plan).toContain("active future promises");
    expect(plan.preCallOutput.call_priority_plan).not.toContain("overdue without promise");
  });

  it("plans broken promises before active future promise confirmations", () => {
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
      branchId: "branch_1",
      metadata: {}
    });
    const contact = makeContact({
      metadata: {
        verifiedInvoicePaymentHandler: true,
        handlerVerificationSource: "historical"
      }
    });

    const plan = buildCollectionsVoicePreCallPlan({
      planId: "plan_broken_and_active",
      account,
      contact,
      invoices: [
        makeOpenInvoice({
          id: "inv_broken_priority",
          invoiceNumber: "INV-BROKEN-PRIORITY",
          amountCents: 90_000,
          dueDate: "2026-04-15"
        }),
        makeOpenInvoice({
          id: "inv_active_priority",
          invoiceNumber: "INV-ACTIVE-PRIORITY",
          amountCents: 70_000,
          dueDate: "2026-04-29"
        })
      ],
      promisesToPay: [
        makePromiseToPay({
          id: "ptp_broken_priority",
          promisedAmountCents: 90_000,
          promiseDate: "2026-04-20",
          metadata: { invoiceIds: ["inv_broken_priority"] }
        }),
        makePromiseToPay({
          id: "ptp_active_priority",
          promisedAmountCents: 70_000,
          promiseDate: "2026-05-05",
          metadata: { invoiceIds: ["inv_active_priority"] }
        })
      ],
      asOf
    });

    expect(plan.callPriorityGroups.map((group) => group.name)).toEqual([
      "broken_promises",
      "active_future_promises"
    ]);
    expect(plan.callPriorityGroups[0]).toMatchObject({
      treatmentMode: "recovery",
      requiresFreshChase: true
    });
    expect(plan.preCallOutput).toMatchObject({
      call_objective: "recover_broken_promises_and_confirm_existing_promises",
      call_priority_flags: expect.stringContaining("broken_promise_recovery")
    });
    expect(plan.preCallOutput.call_priority_flags).toContain("active_promise_confirmation");
  });

  it("plans overdue without promise before due-today without promise", () => {
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
      branchId: "branch_1",
      metadata: {}
    });
    const contact = makeContact({
      metadata: {
        verifiedInvoicePaymentHandler: true,
        handlerVerificationSource: "operator_set"
      }
    });

    const plan = buildCollectionsVoicePreCallPlan({
      planId: "plan_overdue_due_today",
      account,
      contact,
      invoices: [
        makeOpenInvoice({
          id: "inv_overdue_unpromised",
          invoiceNumber: "INV-OVERDUE-UNPROMISED",
          amountCents: 130_000,
          dueDate: "2026-04-20"
        }),
        makeOpenInvoice({
          id: "inv_due_today_unpromised",
          invoiceNumber: "INV-DUE-TODAY-UNPROMISED",
          amountCents: 60_000,
          dueDate: "2026-04-29"
        })
      ],
      asOf
    });

    expect(plan.callPriorityGroups.map((group) => group.name)).toEqual([
      "overdue_without_promise",
      "due_today_without_promise"
    ]);
    expect(plan.preCallOutput).toMatchObject({
      call_objective: "secure_unpromised_overdue_and_confirm_due_today",
      overdue_without_promise_count: 1,
      due_today_without_promise_count: 1
    });
    expect(plan.preCallOutput.call_priority_plan).toContain("1. overdue without promise");
    expect(plan.preCallOutput.call_priority_plan).toContain("2. due today without promise");
  });

  it("reflects verified and unverified contact state in live-call flags", () => {
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
      branchId: "branch_1",
      metadata: {}
    });
    const verifiedPlan = buildCollectionsVoicePreCallPlan({
      planId: "plan_verified_flags",
      account,
      contact: makeContact({
        metadata: {
          verifiedInvoicePaymentHandler: true,
          handlerVerificationSource: "operator_set"
        }
      }),
      invoices: [makeOpenInvoice()],
      asOf
    });
    const unverifiedPlan = buildCollectionsVoicePreCallPlan({
      planId: "plan_unverified_flags",
      account,
      contact: makeContact({
        isVerified: false,
        allowAutoSend: false,
        metadata: {}
      }),
      invoices: [makeOpenInvoice()],
      asOf
    });

    expect(verifiedPlan.preCallOutput).toMatchObject({
      verified_contact_status: "verified",
      right_party_check_required: false,
      call_priority_flags: expect.stringContaining("right_party_verified")
    });
    expect(unverifiedPlan.preCallOutput).toMatchObject({
      verified_contact_status: "unverified",
      right_party_check_required: true,
      call_priority_flags: expect.stringContaining("right_party_check_required")
    });
    expect(unverifiedPlan.safetyDecision.blockedReasons).toContain("unverified_contact");
  });

  it("prioritizes broken promises ahead of date buckets and treats active promises separately", () => {
    const account = makeBillingAccount({
      id: "billing_1",
      parentAccountId: "parent_1",
      branchId: "branch_1",
      metadata: {}
    });
    const contact = makeContact({
      metadata: {
        verifiedInvoicePaymentHandler: true,
        handlerVerificationSource: "operator_confirmed_ap_owner"
      }
    });
    const invoices = [
      makeInvoice({
        id: "inv_broken",
        state: "matched_to_erp",
        parentAccountId: "parent_1",
        billingAccountId: "billing_1",
        branchId: "branch_1",
        invoiceNumber: "INV-BROKEN",
        amountCents: 200_000,
        dueDate: "2026-04-20"
      }),
      makeInvoice({
        id: "inv_due_today_promised",
        state: "matched_to_erp",
        parentAccountId: "parent_1",
        billingAccountId: "billing_1",
        branchId: "branch_1",
        invoiceNumber: "INV-PROMISED",
        amountCents: 75_000,
        dueDate: "2026-04-29"
      }),
      makeInvoice({
        id: "inv_overdue_no_promise",
        state: "synced_open",
        parentAccountId: "parent_1",
        billingAccountId: "billing_1",
        branchId: "branch_1",
        invoiceNumber: "INV-OVERDUE-NO-PTP",
        amountCents: 50_000,
        dueDate: "2026-04-25"
      })
    ];
    const promisesToPay = [
      makePromiseToPay({
        id: "ptp_broken",
        promisedAmountCents: 200_000,
        promiseDate: "2026-04-24",
        metadata: { invoiceIds: ["inv_broken"] }
      }),
      makePromiseToPay({
        id: "ptp_active",
        promisedAmountCents: 75_000,
        promiseDate: "2026-05-05",
        metadata: { invoiceIds: ["inv_due_today_promised"] }
      })
    ];

    const plan = buildCollectionsVoicePreCallPlan({
      planId: "plan_promise",
      account,
      contact,
      invoices,
      promisesToPay,
      asOf: "2026-04-28T18:30:00.000Z",
      callWindow: {
        timezone: "Asia/Manila",
        startHour: 0,
        endHour: 24,
        allowedWeekdays: [1, 2, 3, 4, 5, 6, 7]
      }
    });

    expect(plan.preCallOutput).toMatchObject({
      has_broken_promises: true,
      broken_promise_total: 200_000,
      broken_promise_count: 1,
      has_overdue_without_promise: true,
      overdue_without_promise_total: 50_000,
      has_due_today_without_promise: false,
      due_today_without_promise_total: 0,
      has_active_future_promises: true,
      active_future_promise_total: 75_000,
      active_future_promise_count: 1,
      earliest_active_promise_date: "2026-05-05",
      verified_contact_status: "verified",
      handler_verification_source: "operator_set",
      right_party_check_required: false
    });
    expect(plan.priorityGroups.map((group) => group.name)).toEqual([
      "broken_promises",
      "overdue_without_promise",
      "active_future_promises"
    ]);
    expect(plan.preCallOutput.call_priority_plan).toContain("1. broken promises");
    expect(plan.preCallOutput.call_objective).toBe(
      "recover_broken_promises_and_secure_unpromised_overdue"
    );
    expect(plan.bucketedInvoices.due_today.map((invoice) => invoice.invoiceId)).toEqual([
      "inv_due_today_promised"
    ]);
  });

  it("returns a post-call persistence plan for handoff, claims, disputes, callbacks, and follow-up", () => {
    const plan = buildVoicePostCallPersistencePlan({
      id: "post_call_1",
      billingAccountId: "billing_1",
      parentAccountId: "parent_1",
      branchId: "branch_1",
      contactId: "contact_1",
      communicationAttemptId: "attempt_1",
      providerCallId: "call_1",
      preCallPlanId: "plan_1",
      occurredAt: "2026-04-29T03:00:00.000Z",
      disposition: "callback_requested",
      contactHandoff: {
        currentContactId: "contact_1",
        newHandlerName: "Ana Reyes",
        newHandlerEmail: "ana@example.com",
        newHandlerReachable: false,
        verificationStatus: "self_verified"
      },
      routingChangeRequest: {
        requestedRoutingLevel: "branch",
        requestedBranchId: "branch_2",
        reason: "Customer said this branch now handles invoice approvals."
      },
      promiseUpdate: {
        invoiceIds: ["inv_1"],
        promisedDate: "2026-05-03",
        promisedAmountCents: 100_000,
        currency: "PHP"
      },
      partialPaymentCommitment: {
        invoiceIds: ["inv_1"],
        promisedAmountCents: 40_000,
        promisedDate: "2026-05-03",
        currency: "PHP",
        groupName: "overdue_without_promise",
        remainderDisposition: "follow_up_required"
      },
      paymentPlanRequest: {
        invoiceIds: ["inv_1"],
        requestedInstallmentCount: 3,
        requestedCadence: "monthly",
        groupName: "overdue_without_promise",
        summary: "Customer asked for a three-month plan."
      },
      nonCommitment: {
        invoiceIds: ["inv_1"],
        groupName: "overdue_without_promise",
        reason: "Awaiting treasury approval.",
        callbackRequested: true
      },
      paidAlreadyClaim: {
        invoiceIds: ["inv_2"],
        reference: "DEP-123",
        remittanceExpected: true
      },
      dispute: {
        invoiceIds: ["inv_3"],
        disputeType: "billing",
        summary: "Customer says the invoice amount is wrong."
      },
      callback: {
        dueAt: "2026-04-30T02:00:00.000Z",
        timezone: "Asia/Manila"
      },
      followUpActions: [
        {
          title: "Send SOA copy",
          description: "Customer requested a statement copy."
        }
      ]
    });

    expect(plan.followUpSafeMode).toBe("handler_unreachable");
    expect(plan.operatorReviewRequired).toBe(true);
    expect(plan.actions.map((action) => action.kind)).toEqual([
      "contact_handoff",
      "next_step_follow_up",
      "routing_change_request",
      "promise_update",
      "partial_payment_commitment",
      "payment_plan_request",
      "non_commitment",
      "paid_already_claim",
      "dispute",
      "callback",
      "next_step_follow_up"
    ]);
    expect(plan.actions.find((action) => action.kind === "dispute")?.requiresHumanReview).toBe(
      true
    );
  });
});
