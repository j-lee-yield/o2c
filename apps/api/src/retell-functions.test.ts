import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/o2c_test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.DEFAULT_TENANT_SLUG = "test-tenant";
process.env.JWT_ISSUER = "test-issuer";
process.env.JWT_AUDIENCE = "test-audience";
process.env.JWT_PUBLIC_KEY = "test-public-key";
process.env.JWT_PRIVATE_KEY = "test-private-key";
process.env.RETELL_API_KEY = "retell-api-fallback-key";
process.env.RETELL_CUSTOM_FUNCTION_SECRET = "retell-function-secret";
process.env.RETELL_CUSTOM_FUNCTION_SKIP_SIGNATURE_VERIFICATION = "false";

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-04-29T02:00:00.000Z"));

vi.mock("./modules/retell/statement-of-account-pdf.js", () => ({
  createStatementOfAccountPdfAttachment: vi.fn(async () => ({
    fileName: "statement-of-account-test.pdf",
    mimeType: "application/pdf",
    contentBase64: "dGVzdA=="
  }))
}));

const { buildApiApp } = await import("./app.js");
const { chooseSafeBillingAccountContact, normalizeRetellFunctionRequestContext } =
  await import("./modules/retell/routes.js");
const { getEmailOutboundService } = await import("./bootstrap/email-integration-service.js");

const app = buildApiApp();

beforeAll(() => {
  const emailService = getEmailOutboundService();
  if (emailService.listSendingIdentities().length === 0) {
    emailService.connectSendingIdentity({
      provider: "internal",
      authMode: "api_key",
      senderEmail: "collections@test.example",
      displayName: "Collections",
      scopes: ["send"],
      isDefault: true
    });
  }
});

afterAll(async () => {
  await app.close();
  vi.useRealTimers();
});

const account = {
  id: "billing_1",
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  parentAccountId: "parent_1",
  branchId: "branch_1",
  accountNumber: "BA-1001",
  displayName: "Metro Retail - Makati",
  currency: "PHP",
  accountTier: "standard",
  status: "active",
  centrallyPaid: false,
  metadata: { branchName: "Makati Branch" }
};

const contact = {
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
  metadata: {
    verifiedInvoicePaymentHandler: true,
    handlerVerificationSource: "operator_set"
  }
};

const invoice = {
  id: "inv_overdue",
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  state: "matched_to_erp",
  parentAccountId: "parent_1",
  billingAccountId: "billing_1",
  branchId: "branch_1",
  invoiceNumber: "INV-1001",
  currency: "PHP",
  amountCents: 150_000,
  dueDate: "2026-04-20",
  metadata: {}
};

const dueTodayInvoice = {
  ...invoice,
  id: "inv_due_today",
  invoiceNumber: "INV-1002",
  amountCents: 80_000,
  dueDate: "2026-04-29"
};

const preDueInvoice = {
  ...invoice,
  id: "inv_pre_due",
  invoiceNumber: "INV-1003",
  amountCents: 60_000,
  dueDate: "2026-05-02"
};

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant_1",
    functionCallId: "fn_test",
    asOf: "2026-04-29T02:00:00.000Z",
    communicationAttemptId: "attempt_1",
    providerCallId: "call_1",
    account,
    contact,
    invoices: [invoice],
    ...overrides
  };
}

async function callRetellFunction(path: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/retell/functions/${path}`,
    headers: signedHeaders(payload),
    payload
  });
}

function signedHeaders(payload: Record<string, unknown>) {
  const serialized = JSON.stringify(payload);
  const signature = createHmac("sha256", process.env.RETELL_CUSTOM_FUNCTION_SECRET!)
    .update(serialized)
    .digest("hex");
  return { "x-retell-signature": `sha256=${signature}` };
}

function signedWebhookStyleHeaders(payload: Record<string, unknown>) {
  const serialized = JSON.stringify(payload);
  const timestamp = "1777875600000";
  const digest = createHmac("sha256", process.env.RETELL_CUSTOM_FUNCTION_SECRET!)
    .update(`${serialized}${timestamp}`)
    .digest("hex");
  return { "x-retell-signature": `v=${timestamp},d=${digest}` };
}

describe("Retell custom function endpoints", () => {
  it("returns a Retell setup manifest with full public endpoint URLs", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/retell/functions?baseUrl=https://retell-dev.example.com/"
    });

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      module: "retell_custom_functions",
      status: "implemented",
      publicBaseUrl: "https://retell-dev.example.com",
      payloadMode: "args_only",
      signature: {
        required: true,
        header: "x-retell-signature",
        algorithm: "hmac-sha256",
        secretEnv: "RETELL_CUSTOM_FUNCTION_SECRET"
      }
    });
    expect(body.functions).toHaveLength(15);
    expect(body.functions[0]).toMatchObject({
      name: "get-account-snapshot",
      method: "POST",
      payloadMode: "args_only",
      endpointPath: "/retell/functions/get-account-snapshot",
      endpointUrl: "https://retell-dev.example.com/retell/functions/get-account-snapshot"
    });
    expect(body.functions.map((entry: { name: string }) => entry.name)).toEqual(
      expect.arrayContaining([
        "capture-partial-payment-commitment",
        "request-payment-plan-review",
        "capture-non-commitment",
        "finalize-call-outcome",
        "send-soa"
      ])
    );
  });

  it("finalizes a call outcome and creates post-call tasks once", async () => {
    const payload = {
      tenantId: "tenant_1",
      billingAccountId: "billing_finalize_1",
      contactId: "contact_finalize_1",
      communicationAttemptId: "attempt_finalize_1",
      providerCallId: "call_finalize_1",
      preCallPlanId: "plan_finalize_1",
      occurredAt: "2026-04-29T03:00:00.000Z",
      disposition: "connected",
      transcriptSummary: "Customer disputed invoice INV-1001 and requested a callback.",
      dispute: {
        invoiceIds: ["inv_finalize_dispute"],
        disputeType: "billing",
        summary: "Customer says the billed quantity is wrong."
      },
      callback: {
        dueAt: "2026-04-30T02:00:00.000Z",
        timezone: "Asia/Manila"
      }
    };

    const response = await callRetellFunction("finalize-call-outcome", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      ok: true,
      status: "recorded",
      taskCount: 2
    });
    expect(body.taskTypes).toEqual(
      expect.arrayContaining(["invoice_dispute_review", "account_manager_callback"])
    );
    expect(body.tasks[0]).toMatchObject({
      billingAccountId: "billing_finalize_1"
    });
    expect(body.persistencePlan.actions.map((action: { kind: string }) => action.kind)).toEqual(
      expect.arrayContaining(["dispute", "callback"])
    );
  });

  it("finalizes a call outcome when Retell sends null optional sections", async () => {
    const payload = {
      tenantId: "tenant_1",
      billingAccountId: "billing_finalize_nulls",
      contactId: "contact_finalize_nulls",
      functionCallId: "tool_call_37f3fe",
      providerCallId: "call_finalize_nulls",
      occurredAt: null,
      durationSeconds: null,
      disposition: "connected",
      contactHandoff: null,
      paymentPlanRequest: null,
      nonCommitment: null,
      paidAlreadyClaim: null,
      dispute: null,
      callback: null
    };

    const response = await callRetellFunction("finalize-call-outcome", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      ok: true,
      status: "recorded",
      taskCount: 0
    });
    expect(body.persistencePlan).toMatchObject({
      followUpSafeMode: "normal",
      operatorReviewRequired: false,
      actions: []
    });
  });

  it("returns an account snapshot for args-only payloads", async () => {
    const payload = basePayload();
    const response = await callRetellFunction("get-account-snapshot", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      ok: true,
      status: "ok",
      billingAccountId: "billing_1",
      branchId: "branch_1",
      contactId: "contact_1",
      audit: {
        logged: true,
        action: "retell.custom_function.get-account-snapshot.ok"
      }
    });
    expect(body.groupSummaries[0]).toMatchObject({
      name: "overdue_without_promise",
      count: 1,
      totalCents: 150_000
    });
    expect(body).toMatchObject({
      primaryGroupName: "overdue_without_promise",
      overdue_without_promise_count: 1,
      active_future_promise_count: 0
    });
    expect(body.metadata).toMatchObject({
      verifiedContactStatus: "verified",
      rightPartyCheckRequired: false,
      primaryGroupName: "overdue_without_promise",
      primaryGroupCount: 1,
      primaryGroupTotalCents: 150_000,
      hasOverdueWithoutPromise: true,
      overdueWithoutPromiseCount: 1,
      overdueWithoutPromiseTotalCents: 150_000,
      has_overdue_without_promise: true,
      overdue_without_promise_count: 1,
      overdue_without_promise_total_cents: 150_000,
      hasActiveFuturePromises: false,
      activeFuturePromiseCount: 0,
      active_future_promise_count: 0,
      active_future_promises_count: 0
    });
  });

  it("refreshes stale custom-function asOf values before regrouping invoices", async () => {
    const payload = basePayload({
      asOf: "2026-04-28T02:00:00.000Z",
      invoices: [
        {
          ...invoice,
          id: "inv_stale_due_today",
          invoiceNumber: "INV-STALE-DUE-TODAY",
          dueDate: "2026-04-28"
        }
      ]
    });
    const response = await callRetellFunction("get-account-snapshot", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.groupSummaries).toEqual([
      expect.objectContaining({
        name: "overdue_without_promise",
        count: 1
      })
    ]);
    expect(body.groupSummaries).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "due_today_without_promise"
        })
      ])
    );
  });

  it("accepts Retell webhook-style signature headers", async () => {
    const payload = basePayload();
    const response = await app.inject({
      method: "POST",
      url: "/retell/functions/get-account-snapshot",
      headers: signedWebhookStyleHeaders(payload),
      payload
    });

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      ok: true,
      status: "ok",
      billingAccountId: "billing_1",
      contactId: "contact_1"
    });
  });

  it("can skip signature verification when the local testing flag is enabled", async () => {
    process.env.RETELL_CUSTOM_FUNCTION_SKIP_SIGNATURE_VERIFICATION = "true";
    try {
      const payload = basePayload();
      const response = await app.inject({
        method: "POST",
        url: "/retell/functions/get-account-snapshot",
        payload
      });

      expect(response.statusCode, response.payload).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({
        ok: true,
        status: "ok",
        billingAccountId: "billing_1",
        contactId: "contact_1"
      });
    } finally {
      process.env.RETELL_CUSTOM_FUNCTION_SKIP_SIGNATURE_VERIFICATION = "false";
    }
  });

  it("fills billing and contact context from query params when body values are unresolved", () => {
    const normalized = normalizeRetellFunctionRequestContext(
      {
        billingAccountId: "{{billing_account_id}}",
        contactId: "{{contact_id}}",
        communicationAttemptId: "{{communication_attempt_id}}"
      },
      {
        billingAccountId: "billing_1",
        contactId: "contact_1",
        communicationAttemptId: "attempt_1"
      },
      {}
    );

    expect(normalized).toMatchObject({
      billingAccountId: "billing_1",
      contactId: "contact_1",
      communicationAttemptId: "attempt_1"
    });
  });

  it("treats Retell unknown literals as unresolved so query params can win", () => {
    const normalized = normalizeRetellFunctionRequestContext(
      {
        billingAccountId: "unknown",
        contactId: "unknown",
        communicationAttemptId: "unknown"
      },
      {
        billing_account_id: "billing_1",
        contact_id: "contact_1",
        communication_attempt_id: "attempt_1"
      },
      {}
    );

    expect(normalized).toMatchObject({
      billingAccountId: "billing_1",
      contactId: "contact_1",
      communicationAttemptId: "attempt_1"
    });
  });

  it("fills Retell context from snake-case body aliases", () => {
    const normalized = normalizeRetellFunctionRequestContext(
      {
        billingAccountId: null,
        contactId: null,
        communicationAttemptId: null,
        providerCallId: null,
        billing_account_id: "billing_snake",
        contact_id: "contact_snake",
        provider_call_id: "call_snake",
        tool_call_id: "tool_snake"
      },
      {},
      {}
    );

    expect(normalized).toMatchObject({
      billingAccountId: "billing_snake",
      contactId: "contact_snake",
      communicationAttemptId: "tool_snake",
      providerCallId: "call_snake",
      functionCallId: "tool_snake"
    });
  });

  it("removes unresolved context placeholders when no fallback value exists", () => {
    const normalized = normalizeRetellFunctionRequestContext(
      {
        billingAccountId: "{{billingAccountId}}",
        contactId: "{{contactId}}",
        communicationAttemptId: "{{communicationAttemptId}}"
      },
      {},
      {}
    );

    expect(normalized).not.toHaveProperty("billingAccountId");
    expect(normalized).not.toHaveProperty("contactId");
    expect(normalized).not.toHaveProperty("communicationAttemptId");
  });

  it("returns a controlled 422 when required Retell context placeholders are unresolved", async () => {
    const payload = {
      billingAccountId: "{{billingAccountId}}",
      contactId: "{{contactId}}",
      deliveryChannel: "email"
    };
    const response = await callRetellFunction("send-soa", payload);

    expect(response.statusCode, response.payload).toBe(422);
    const body = response.json();
    expect(body).toMatchObject({
      ok: false,
      status: "blocked",
      blockedReason: "missing_billing_account_context"
    });
  });

  it("returns invoice details for a priority group", async () => {
    const payload = basePayload({ groupName: "overdue_without_promise" });
    const response = await callRetellFunction("get-group-invoice-details", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.invoices).toEqual([
      expect.objectContaining({
        invoiceId: "inv_overdue",
        invoiceNumber: "INV-1001",
        amountCents: 150_000,
        branchId: "branch_1",
        promiseStatus: "no_promise"
      })
    ]);
    expect(body.audit.action).toBe("retell.custom_function.get-group-invoice-details.ok");
  });

  it("treats null optional invoiceIds as omitted for group invoice details", async () => {
    const payload = basePayload({
      groupName: "overdue_without_promise",
      invoiceIds: null
    });
    const response = await callRetellFunction("get-group-invoice-details", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.invoices).toEqual([
      expect.objectContaining({
        invoiceId: "inv_overdue"
      })
    ]);
  });

  it("treats an empty invoiceIds array as omitted for group invoice details", async () => {
    const payload = basePayload({
      groupName: "overdue_without_promise",
      invoiceIds: []
    });
    const response = await callRetellFunction("get-group-invoice-details", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.invoices).toEqual([
      expect.objectContaining({
        invoiceId: "inv_overdue"
      })
    ]);
  });

  it("creates a promise-to-pay capture using shared promise logic", async () => {
    const payload = basePayload({
      invoiceIds: ["inv_overdue"],
      promisedDate: "2026-05-03",
      promisedAmountCents: 150_000,
      notes: "Customer promised during live call."
    });
    const response = await callRetellFunction("create-promise-to-pay", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      ok: true,
      status: "captured",
      promiseToPay: {
        id: "ptp_fn_test",
        state: "accepted",
        promiseDate: "2026-05-03",
        promisedAmountCents: 150_000
      }
    });
    expect(body.persistencePlan.actions).toEqual([
      expect.objectContaining({ kind: "promise_update", requiresHumanReview: false })
    ]);
  });

  it("updates an existing promise-to-pay", async () => {
    const payload = basePayload({
      promiseToPayId: "ptp_existing",
      invoiceIds: ["inv_overdue"],
      status: "kept",
      notes: "Customer confirmed payment was made."
    });
    const response = await callRetellFunction("update-promise-to-pay", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.status).toBe("captured");
    expect(body.persistencePlan.actions[0]).toMatchObject({
      kind: "promise_update",
      metadata: {
        promiseToPayId: "ptp_existing",
        status: "kept"
      }
    });
  });

  it("captures a partial payment commitment as a first-class outcome", async () => {
    const payload = basePayload({
      invoices: [invoice, dueTodayInvoice],
      invoiceIds: ["inv_overdue"],
      promisedAmountCents: 50_000,
      promisedDate: "2026-05-03",
      currency: "PHP",
      groupName: "overdue_without_promise",
      remainderDisposition: "follow_up_required",
      notes: "Customer can only pay part this week."
    });
    const response = await callRetellFunction("capture-partial-payment-commitment", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.status).toBe("captured");
    expect(body.metadata).toMatchObject({
      promisedAmountCents: 50_000,
      selectedBalanceCents: 150_000,
      remainingBalanceCents: 100_000,
      remainderDisposition: "follow_up_required"
    });
    expect(body.persistencePlan.actions.map((action: { kind: string }) => action.kind)).toEqual([
      "promise_update",
      "partial_payment_commitment"
    ]);
  });

  it("captures payment plan requests as review-required outcomes", async () => {
    const payload = basePayload({
      invoiceIds: ["inv_overdue"],
      summary: "Customer asked for a three-month installment plan.",
      requestedInstallmentCount: 3,
      requestedCadence: "monthly",
      groupName: "overdue_without_promise"
    });
    const response = await callRetellFunction("request-payment-plan-review", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      status: "needs_follow_up",
      nextStep: expect.stringContaining("approval review")
    });
    expect(body.persistencePlan.actions[0]).toMatchObject({
      kind: "payment_plan_request",
      requiresHumanReview: true,
      metadata: {
        requestedInstallmentCount: 3,
        requestedCadence: "monthly"
      }
    });
  });

  it("captures non-commitment outcomes and optional callback intent", async () => {
    const payload = basePayload({
      invoiceIds: ["inv_overdue"],
      groupName: "overdue_without_promise",
      reason: "Customer is waiting for internal approval.",
      callbackRequested: true,
      dueAt: "2026-04-30T02:00:00.000Z",
      timezone: "Asia/Manila"
    });
    const response = await callRetellFunction("capture-non-commitment", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.status).toBe("captured");
    expect(body.persistencePlan.actions.map((action: { kind: string }) => action.kind)).toEqual([
      "non_commitment",
      "callback"
    ]);
    expect(body.nextStep).toContain("callback");
  });

  it("logs a paid-already claim for cash application review", async () => {
    const payload = basePayload({
      invoiceIds: ["inv_overdue"],
      reference: "DEP-123",
      remittanceExpected: true
    });
    const response = await callRetellFunction("log-paid-already", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.status).toBe("captured");
    expect(body.persistencePlan.actions[0]).toMatchObject({
      kind: "paid_already_claim",
      requiresHumanReview: true,
      metadata: { reference: "DEP-123", remittanceExpected: true }
    });
  });

  it("marks a dispute and returns a safe next step", async () => {
    const payload = basePayload({
      invoices: [invoice, dueTodayInvoice],
      invoiceIds: ["inv_overdue"],
      disputeType: "billing",
      amountCents: 50_000,
      summary: "Customer says pricing is wrong.",
      disputeScope: "invoice_subset",
      groupName: "overdue_without_promise",
      groupInvoiceIds: ["inv_overdue"]
    });
    const response = await callRetellFunction("mark-dispute", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.status).toBe("captured");
    expect(body.nextStep).toContain("Continue with remaining groups");
    expect(body.metadata).toMatchObject({
      dispute_scope: "invoice_subset",
      can_continue_after_dispute: true,
      safe_remaining_groups_exist: true,
      next_action_after_dispute: "continue_with_remaining_groups",
      frozen_invoice_ids: ["inv_overdue"]
    });
    expect(body.persistencePlan.actions[0]).toMatchObject({
      kind: "dispute",
      requiresHumanReview: true,
      metadata: {
        disputeScope: "invoice_subset",
        nextActionAfterDispute: "continue_with_remaining_groups"
      }
    });
    expect(body.audit).toMatchObject({
      logged: true,
      action: "retell.custom_function.mark-dispute.captured"
    });
  });

  it("stops the call sequence for a whole-balance dispute", async () => {
    const payload = basePayload({
      invoices: [invoice, dueTodayInvoice],
      invoiceIds: ["inv_overdue", "inv_due_today"],
      disputeType: "billing",
      disputeScope: "whole_account_or_balance",
      summary: "Customer disputes the whole statement balance."
    });
    const response = await callRetellFunction("mark-dispute", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.metadata).toMatchObject({
      dispute_scope: "whole_account_or_balance",
      can_continue_after_dispute: false,
      next_action_after_dispute: "stop_and_escalate"
    });
    expect(body.nextStep).toContain("Stop automated collections");
  });

  it("routes handler disputes to handoff instead of continuing invoice handling", async () => {
    const payload = basePayload({
      invoices: [invoice, dueTodayInvoice],
      invoiceIds: ["inv_overdue"],
      disputeType: "unknown",
      summary: "I am not the right person; another AP contact handles this now."
    });
    const response = await callRetellFunction("mark-dispute", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.metadata).toMatchObject({
      dispute_scope: "routing_or_handler_issue",
      can_continue_after_dispute: false,
      next_action_after_dispute: "switch_to_handler_handoff"
    });
    expect(body.nextStep).toContain("handler handoff");
  });

  it("removes frozen disputed scope from later group invoice details", async () => {
    const payload = basePayload({
      invoices: [invoice, dueTodayInvoice, preDueInvoice],
      groupName: "due_today_without_promise",
      frozenInvoiceIds: ["inv_due_today"]
    });
    const response = await callRetellFunction("get-group-invoice-details", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.invoices).toEqual([]);
  });

  it("blocks promise capture on frozen disputed invoices", async () => {
    const payload = basePayload({
      invoiceIds: ["inv_overdue"],
      promisedDate: "2026-05-03",
      frozenInvoiceIds: ["inv_overdue"]
    });
    const response = await callRetellFunction("create-promise-to-pay", payload);

    expect(response.statusCode, response.payload).toBe(200);
    expect(response.json()).toMatchObject({
      ok: false,
      status: "blocked",
      blockedReason: "frozen_disputed_scope"
    });
  });

  it("captures callback requests", async () => {
    const payload = basePayload({
      dueAt: "2026-04-30T02:00:00.000Z",
      timezone: "Asia/Manila"
    });
    const response = await callRetellFunction("request-callback", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.status).toBe("captured");
    expect(body.persistencePlan.actions[0]).toMatchObject({
      kind: "callback",
      dueAt: "2026-04-30T02:00:00.000Z"
    });
  });

  it("captures handler handoff without authorizing newly discovered contacts", async () => {
    const payload = basePayload({
      newHandlerName: "Ana Reyes",
      newHandlerEmail: "ana@example.com",
      newHandlerReachable: false,
      routingShouldUpdate: true,
      requestedRoutingLevel: "branch",
      requestedBranchId: "branch_1"
    });
    const response = await callRetellFunction("capture-handler-handoff", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.status).toBe("needs_follow_up");
    expect(body.message).toContain("Do not treat the new handler as verified");
    expect(body.persistencePlan.actions.map((action: { kind: string }) => action.kind)).toEqual(
      expect.arrayContaining(["contact_handoff", "routing_change_request", "next_step_follow_up"])
    );
  });

  it("queues invoice copy requests only for verified contacts", async () => {
    const payload = basePayload({
      invoiceIds: ["inv_overdue"],
      deliveryChannel: "email"
    });
    const response = await callRetellFunction("send-invoice-copy", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      ok: true,
      status: "queued",
      metadata: {
        automationAction: "send_invoice_copy",
        deliveryChannel: "email",
        destination: "maria@example.com"
      }
    });
  });

  it("queues statement-of-account requests without requiring invoiceIds", async () => {
    const callSummary = "Mimsy asked for the SOA before confirming payment timing.";
    const payload = basePayload({
      statementSnapshotId: "soa_snapshot_1",
      deliveryChannel: "email",
      call_summary: callSummary
    });
    const response = await callRetellFunction("send-soa", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      ok: true,
      status: "queued",
      message: "Statement of account email sent to the verified contact.",
      metadata: {
        automationAction: "send_statement_of_account",
        deliveryChannel: "email",
        destination: "maria@example.com",
        statementSnapshotId: "soa_snapshot_1",
        provider: "internal",
        attachmentFileName: "statement-of-account-test.pdf",
        callSummaryIncluded: true,
        callSummary,
        emailBodyPreview: expect.stringContaining("Here is the recap from our conversation:")
      }
    });
    expect(body.metadata.communicationAttemptId).toEqual(expect.any(String));
    expect(body.metadata.emailBodyPreview).toContain("Mimsy asked for the SOA");
  });

  it("uses the finalized call recap when send-soa omits a direct summary", async () => {
    const callSummary =
      "Maria asked for the statement of account and said treasury will review it before confirming payment timing.";
    const finalizePayload = {
      tenantId: "tenant_1",
      billingAccountId: account.id,
      contactId: contact.id,
      communicationAttemptId: "attempt_soa_recap_1",
      providerCallId: "call_soa_recap_1",
      occurredAt: "2026-04-29T02:30:00.000Z",
      disposition: "connected",
      transcriptSummary: callSummary
    };

    const finalizeResponse = await callRetellFunction("finalize-call-outcome", finalizePayload);
    expect(finalizeResponse.statusCode, finalizeResponse.payload).toBe(200);

    const payload = basePayload({
      statementSnapshotId: "soa_snapshot_1",
      deliveryChannel: "email",
      communicationAttemptId: "attempt_soa_recap_1",
      providerCallId: "call_soa_recap_1"
    });
    const response = await callRetellFunction("send-soa", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      ok: true,
      status: "queued",
      metadata: {
        callSummaryIncluded: true,
        callSummarySource: "call_inbox",
        callSummary,
        emailBodyPreview: expect.stringContaining("Here is the recap from our conversation:")
      }
    });
    expect(body.metadata.emailBodyPreview).toContain(
      "Maria asked for the statement of account"
    );
  });

  it("treats null optional SOA fields as omitted", async () => {
    const payload = basePayload({
      statementSnapshotId: null,
      deliveryChannel: "email",
      destination: null,
      notes: null,
      callSummary: null,
      call_summary: null,
      transcriptSummary: null,
      transcript_summary: null,
      summary: null
    });
    const response = await callRetellFunction("send-soa", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      ok: true,
      status: "queued",
      message: "Statement of account email sent to the verified contact.",
      metadata: {
        automationAction: "send_statement_of_account",
        deliveryChannel: "email",
        destination: "maria@example.com",
        provider: "internal",
        attachmentFileName: "statement-of-account-test.pdf",
        callSummaryIncluded: false
      }
    });
    expect(body.metadata.statementSnapshotId).not.toBeNull();
    expect(body.metadata.emailBodyPreview).not.toContain("Here is the recap from our conversation:");
  });

  it("selects a safe billing-account contact when Retell omits contact context", () => {
    expect(
      chooseSafeBillingAccountContact([
        {
          ...contact,
          id: "contact_unverified",
          isPrimary: true,
          isVerified: false,
          allowAutoSend: false
        },
        {
          ...contact,
          id: "contact_verified",
          isPrimary: true,
          isVerified: true,
          allowAutoSend: true
        }
      ])
    ).toMatchObject({ id: "contact_verified" });
  });

  it("does not guess a billing-account contact when multiple safe contacts match", () => {
    expect(
      chooseSafeBillingAccountContact([
        {
          ...contact,
          id: "contact_verified_1",
          isPrimary: false,
          isVerified: true,
          allowAutoSend: true
        },
        {
          ...contact,
          id: "contact_verified_2",
          isPrimary: false,
          isVerified: true,
          allowAutoSend: true
        }
      ])
    ).toBeUndefined();
  });

  it("blocks payment links for unverified contacts", async () => {
    const payload = basePayload({
      contact: {
        ...contact,
        id: "contact_unverified",
        isVerified: false,
        allowAutoSend: false
      },
      invoiceIds: ["inv_overdue"],
      amountCents: 150_000
    });
    const response = await callRetellFunction("send-payment-link", payload);

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      ok: false,
      status: "blocked",
      blockedReason: "unverified_contact",
      audit: {
        logged: true,
        action: "retell.custom_function.send-payment-link.blocked"
      }
    });
  });

  it("rejects custom functions with an invalid signature", async () => {
    process.env.RETELL_CUSTOM_FUNCTION_SKIP_SIGNATURE_VERIFICATION = "false";
    const payload = basePayload();
    const response = await app.inject({
      method: "POST",
      url: "/retell/functions/get-account-snapshot",
      headers: { "x-retell-signature": "sha256=bad" },
      payload
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      ok: false,
      blockedReason: "signature_mismatch"
    });
  });

  it("falls back to RETELL_API_KEY for signatures when no custom-function secret is set", async () => {
    const previousSecret = process.env.RETELL_CUSTOM_FUNCTION_SECRET;
    process.env.RETELL_CUSTOM_FUNCTION_SECRET = "";
    const payload = basePayload({ functionCallId: "fn_api_key_fallback" });
    const signature = createHmac("sha256", process.env.RETELL_API_KEY!)
      .update(JSON.stringify(payload))
      .digest("hex");

    try {
      const response = await app.inject({
        method: "POST",
        url: "/retell/functions/get-account-snapshot",
        headers: { "x-retell-signature": `sha256=${signature}` },
        payload
      });

      expect(response.statusCode, response.payload).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        status: "ok"
      });
    } finally {
      if (previousSecret === undefined) {
        delete process.env.RETELL_CUSTOM_FUNCTION_SECRET;
      } else {
        process.env.RETELL_CUSTOM_FUNCTION_SECRET = previousSecret;
      }
    }
  });
});
