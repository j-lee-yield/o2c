import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/o2c_test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.DEFAULT_TENANT_SLUG = "test-tenant";
process.env.JWT_ISSUER = "test-issuer";
process.env.JWT_AUDIENCE = "test-audience";
process.env.JWT_PUBLIC_KEY = "test-public-key";
process.env.JWT_PRIVATE_KEY = "test-private-key";
process.env.RETELL_API_KEY = "retell-test-key";
process.env.RETELL_FROM_NUMBER = "+14155550100";
process.env.RETELL_OUTBOUND_AGENT_ID = "agent_test";

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-04-29T02:00:00.000Z"));

const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
  return new Response(
    JSON.stringify({
      call_type: "phone_call",
      call_id: "call_test_123",
      call_status: "registered",
      agent_id: "agent_test",
      from_number: body.from_number,
      to_number: body.to_number,
      direction: "outbound",
      metadata: body.metadata,
      retell_llm_dynamic_variables: body.retell_llm_dynamic_variables
    }),
    {
      status: 201,
      headers: { "Content-Type": "application/json" }
    }
  );
});

vi.stubGlobal("fetch", fetchMock);

const { buildApiApp } = await import("./app.js");

const app = buildApiApp();

afterAll(async () => {
  await app.close();
  vi.useRealTimers();
});

beforeEach(() => {
  fetchMock.mockClear();
});

const principal = {
  id: "api-test",
  roles: ["ar_collector"]
} as const;

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
  metadata: {
    branchName: "Makati Branch",
    campaignId: "campaign_april_follow_up",
    companyName: "Metro Retail Group",
    customerId: "customer_1",
    humanTransferNumber: "+63285550123",
    paymentMethods: ["bank transfer", "check deposit"],
    soaId: "soa_snapshot_1",
    triggeredBy: "operator_console"
  }
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
    handlerVerificationSource: "seeded_ap_handler"
  }
};

function makeInvoicePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv_test",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    state: "matched_to_erp",
    parentAccountId: "parent_1",
    billingAccountId: "billing_1",
    branchId: "branch_1",
    invoiceNumber: "INV-TEST",
    currency: "PHP",
    amountCents: 100_000,
    dueDate: "2026-04-20",
    metadata: {},
    ...overrides
  };
}

function makePromisePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "ptp_test",
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

describe("Retell pre-call orchestration API", () => {
  it("creates a Retell outbound call with string-only dynamic variables", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/outbound-call",
      payload: {
        principal,
        tenantId: "tenant_1",
        asOf: "2026-04-29T02:00:00.000Z",
        account,
        contact,
        invoices: [
          {
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
          }
        ]
      }
    });

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.status).toBe("started");
    expect(body.verifiedContactStatus).toBe("verified");
    expect(body.handlerContext).toMatchObject({
      contactId: "contact_1",
      verifiedContactStatus: "verified",
      verificationSource: "operator_set",
      currentAccountHandlerName: "Maria Santos",
      currentAccountHandlerRole: "ap",
      currentHandlerContactId: "contact_1",
      rightPartyCheckRequired: false,
      handlerHandoffPossible: false
    });
    expect(body.callObjective).toBe("secure_unpromised_overdue");
    expect(body.groupSummaries).toEqual([
      expect.objectContaining({
        name: "overdue_without_promise",
        rank: 2,
        count: 1,
        totalCents: 150_000
      })
    ]);
    expect(body.retellCallId).toBe("call_test_123");
    expect(body.callInboxRecord).toMatchObject({
      provider: "retell",
      providerCallId: "call_test_123",
      billingAccountId: "billing_1",
      contactId: "contact_1",
      direction: "outbound",
      status: "processing",
      requestedBy: "api-test",
      openTasksCount: 0,
    });
    expect(body.plan.bucketOutput).toMatchObject({
      has_overdue: true,
      overdue_total: 150_000,
      balance_total: 150_000
    });
    expect(body.plan.preCallOutput).toMatchObject({
      verified_contact_status: "verified",
      handler_verification_source: "operator_set",
      current_account_handler_name: "Maria Santos",
      current_account_handler_role: "ap",
      right_party_check_required: false,
      handler_handoff_possible: false,
      has_overdue_without_promise: true,
      overdue_without_promise_total: 150_000,
      call_objective: "secure_unpromised_overdue"
    });
    expect(body.retellPayload.from_number).toBe("+14155550100");
    expect(body.retellPayload.to_number).toBe("+639171234567");
    expect(body.retellPayload.override_agent_id).toBe("agent_test");
    expect(body.retellPayload.metadata).toMatchObject({
      tenant_slug: "tenant_1",
      billing_account_id: "billing_1",
      customer_id: "customer_1",
      contact_id: "contact_1",
      current_handler_contact_id: "contact_1",
      soa_id: "soa_snapshot_1",
      statement_snapshot_id: "soa_snapshot_1",
      triggered_by: "operator_console",
      campaign_id: "campaign_april_follow_up",
      branch_name: "Makati Branch"
    });
    expect(
      Object.values(body.retellPayload.retell_llm_dynamic_variables).every(
        (value) => typeof value === "string"
      )
    ).toBe(true);
    expect(body.retellPayload.retell_llm_dynamic_variables.customer_name).toBe(
      "Metro Retail - Makati"
    );
    expect(body.retellPayload.retell_llm_dynamic_variables.contact_name).toBe("Maria Santos");
    expect(body.retellPayload.retell_llm_dynamic_variables.contact_email).toBe("maria@example.com");
    expect(body.retellPayload.retell_llm_dynamic_variables.company_name).toBe("Metro Retail Group");
    expect(body.retellPayload.retell_llm_dynamic_variables.currency).toBe("PHP");
    expect(body.retellPayload.retell_llm_dynamic_variables.balance_total).toBe("PHP 1,500.00");
    expect(body.retellPayload.retell_llm_dynamic_variables.payment_methods).toBe(
      "bank transfer, check deposit"
    );
    expect(body.retellPayload.retell_llm_dynamic_variables.human_transfer_number).toBe(
      "+63285550123"
    );
    expect(body.retellPayload.retell_llm_dynamic_variables.branch_name).toBe("Makati Branch");
    expect(body.retellPayload.retell_llm_dynamic_variables.has_overdue).toBe("true");
    expect(body.retellPayload.retell_llm_dynamic_variables.overdue_total).toBe("PHP 1,500.00");
    expect(body.retellPayload.retell_llm_dynamic_variables.right_party_check_required).toBe(
      "false"
    );
    expect(body.retellPayload.retell_llm_dynamic_variables.verified_contact_status).toBe(
      "verified"
    );
    expect(body.retellPayload.retell_llm_dynamic_variables.handler_verification_source).toBe(
      "operator_set"
    );
    expect(body.retellPayload.retell_llm_dynamic_variables.current_account_handler_name).toBe(
      "Maria Santos"
    );
    expect(body.retellPayload.retell_llm_dynamic_variables.current_account_handler_role).toBe("ap");
    expect(body.retellPayload.retell_llm_dynamic_variables.handler_handoff_possible).toBe("false");
    expect(body.retellPayload.retell_llm_dynamic_variables.call_objective).toBe(
      "secure_unpromised_overdue"
    );
    expect(body.retellPayload.retell_llm_dynamic_variables.call_priority_flags).toContain(
      "right_party_verified"
    );
    expect(body.retellPayload.retell_llm_dynamic_variables.call_priority_groups_json).toContain(
      "overdue_without_promise"
    );
    expect(body.retellPayload.retell_llm_dynamic_variables.operator_summary).toContain(
      "overdue without promise first"
    );
    expect(body.retellPayload.retell_llm_dynamic_variables.known_new_handler_name).toBe("");
    expect(body.retellPayload.retell_llm_dynamic_variables.known_new_handler_phone).toBe("");
    expect(body.retellPayload.retell_llm_dynamic_variables.known_new_handler_email).toBe("");
    expect(body.retellPayload.retell_llm_dynamic_variables.call_priority_plan).toContain(
      "overdue without promise"
    );
    expect(body.retellPayload.retell_llm_dynamic_variables.post_call_outcome_schema).toContain(
      "contactHandoff"
    );
    const activityActions = body.activityEntries.map((entry: { action: string }) => entry.action);
    expect(activityActions).toEqual(
      expect.arrayContaining([
        "retell.precall.ready",
        "retell.precall.contact_verification_evaluated",
        "communication.attempt.created",
        "retell.outbound_call.created",
        "retell.outbound_call.call_created"
      ])
    );
    const verificationEntry = body.activityEntries.find(
      (entry: { action: string }) =>
        entry.action === "retell.precall.contact_verification_evaluated"
    );
    expect(verificationEntry.metadata).toMatchObject({
      eventType: "contact_verification_evaluated",
      billing_account_id: "billing_1",
      contact_id: "contact_1",
      current_handler_contact_id: "contact_1",
      verified_contact_status: "verified",
      handler_verification_source: "operator_set",
      branch_id: "branch_1",
      overdue_without_promise_count: 1,
      overdue_without_promise_total_cents: 150_000,
      callObjective: "secure_unpromised_overdue",
      call_priority_plan: expect.stringContaining("overdue without promise")
    });
    const callCreatedEntry = body.activityEntries.find(
      (entry: { action: string }) => entry.action === "retell.outbound_call.call_created"
    );
    expect(callCreatedEntry.metadata).toMatchObject({
      eventType: "call_created",
      billing_account_id: "billing_1",
      contact_id: "contact_1",
      provider_call_id: "call_test_123",
      verified_contact_status: "verified",
      overdue_without_promise_count: 1,
      active_future_promise_count: 0,
      callObjective: "secure_unpromised_overdue",
      callPriorityPlan: expect.stringContaining("overdue without promise")
    });
    expect(body.activityEntries[0].metadata).toMatchObject({
      verifiedContactStatus: "verified",
      handlerVerificationSource: "operator_set",
      currentAccountHandlerName: "Maria Santos",
      rightPartyCheckRequired: false,
      handlerHandoffPossible: false,
      callObjective: "secure_unpromised_overdue",
      callPriorityFlags: expect.stringContaining("right_party_verified"),
      routingUpdateRecommended: false
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes stale outbound-call asOf before computing Retell branch variables", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/outbound-call",
      payload: {
        principal,
        tenantId: "tenant_1",
        asOf: "2026-04-28T02:00:00.000Z",
        account,
        contact,
        invoices: [
          makeInvoicePayload({
            id: "inv_stale_due_today",
            invoiceNumber: "INV-STALE-DUE-TODAY",
            dueDate: "2026-04-28"
          })
        ]
      }
    });

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.plan.preparedAt).toBe("2026-04-29T02:00:00.000Z");
    expect(body.plan.bucketOutput).toMatchObject({
      overdue_without_promise_count: 1,
      due_today_without_promise_count: 0,
      has_due_today_without_promise: false
    });
    expect(body.retellPayload.retell_llm_dynamic_variables.has_due_today_without_promise).toBe(
      "false"
    );
  });

  it("returns a typed provider error when Retell cannot be reached", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/outbound-call",
      payload: {
        principal,
        tenantId: "tenant_1",
        asOf: "2026-04-29T02:00:00.000Z",
        account,
        contact,
        invoices: [
          makeInvoicePayload({
            id: "inv_network_failure",
            invoiceNumber: "INV-NETWORK-FAILURE"
          })
        ]
      }
    });

    expect(response.statusCode, response.payload).toBe(502);
    const body = response.json();
    expect(body).toMatchObject({
      providerStatusCode: 502,
      message: expect.stringContaining("before receiving a response")
    });
    expect(JSON.parse(body.providerBody)).toMatchObject({
      error: "retell_network_error",
      message: "fetch failed",
      baseUrl: "https://api.retellai.com"
    });
  });

  it("returns blocked pre-call context for an unverified contact", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/outbound-call",
      payload: {
        principal,
        tenantId: "tenant_1",
        asOf: "2026-04-29T02:00:00.000Z",
        account,
        contact: {
          ...contact,
          id: "contact_unverified",
          isVerified: false,
          allowAutoSend: false,
          recentSuccessfulResponses: 0,
          metadata: {}
        },
        invoices: [
          makeInvoicePayload({
            id: "inv_unverified_contact",
            invoiceNumber: "INV-UNVERIFIED",
            amountCents: 90_000
          })
        ]
      }
    });

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.status).toBe("blocked");
    expect(body.blockedReason).toBe("unverified_contact");
    expect(body.verifiedContactStatus).toBe("unverified");
    expect(body.handlerContext).toMatchObject({
      verifiedContactStatus: "unverified",
      verificationSource: "unknown",
      rightPartyCheckRequired: true,
      handlerHandoffPossible: false
    });
    expect(body.callObjective).toBe("secure_unpromised_overdue");
    expect(body.groupSummaries).toEqual([
      expect.objectContaining({
        name: "overdue_without_promise",
        count: 1
      })
    ]);
    expect(body.retellCallId).toBeUndefined();
    expect(body.retellPayload).toBeUndefined();
    expect(body.retellCall).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks known handler handoff before invoice group treatment when new handler data is insufficient", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/outbound-call",
      payload: {
        principal,
        tenantId: "tenant_1",
        asOf: "2026-04-29T02:00:00.000Z",
        account,
        contact: {
          ...contact,
          metadata: {
            verifiedInvoicePaymentHandler: true,
            handlerVerificationSource: "historical",
            currentContactMayNoLongerBeHandler: true
          }
        },
        invoices: [
          makeInvoicePayload({
            id: "inv_handoff",
            invoiceNumber: "INV-HANDOFF",
            amountCents: 110_000
          })
        ]
      }
    });

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.status).toBe("blocked");
    expect(body.blockedReason).toBe("handler_handoff_requires_review");
    expect(body.verifiedContactStatus).toBe("verified");
    expect(body.callObjective).toBe("mixed_collections_call_with_handler_check");
    expect(body.handlerContext).toMatchObject({
      verifiedContactStatus: "verified",
      verificationSource: "historical",
      rightPartyCheckRequired: false,
      handlerHandoffPossible: true,
      currentContactMayNoLongerBeHandler: true,
      routingUpdateRecommended: true,
      liveTransferPossible: false,
      followUpRequired: true,
      handlerHandoffBlockedReason: "new_handler_unknown"
    });
    expect(body.groupSummaries[0]).toMatchObject({
      name: "overdue_without_promise",
      count: 1
    });
    expect(body.activityEntries.map((entry: { action: string }) => entry.action)).toEqual(
      expect.arrayContaining([
        "retell.precall.contact_verification_evaluated",
        "retell.precall.handler_handoff_detected",
        "retell.precall.call_blocked"
      ])
    );
    const handoffEntry = body.activityEntries.find(
      (entry: { action: string }) => entry.action === "retell.precall.handler_handoff_detected"
    );
    expect(handoffEntry.metadata).toMatchObject({
      eventType: "handler_handoff_detected",
      billing_account_id: "billing_1",
      contact_id: "contact_1",
      verified_contact_status: "verified",
      handler_verification_source: "historical",
      handler_handoff_possible: true,
      current_contact_may_no_longer_be_handler: true,
      routing_update_recommended: true,
      handler_handoff_blocked_reason: "new_handler_unknown",
      blockedReasons: expect.arrayContaining(["handler_handoff_requires_review"])
    });
    expect(body.retellPayload).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a Retell call with live-transfer handoff context when the new verified handler is reachable", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/outbound-call",
      payload: {
        principal,
        tenantId: "tenant_1",
        asOf: "2026-04-29T02:00:00.000Z",
        account,
        contact: {
          ...contact,
          metadata: {
            verifiedInvoicePaymentHandler: true,
            handlerVerificationSource: "historical",
            currentContactMayNoLongerBeHandler: true,
            knownNewHandlerName: "Ana Reyes",
            knownNewHandlerPhone: "+639188887777",
            knownNewHandlerEmail: "ana@example.com",
            knownNewHandlerVerified: true
          }
        },
        invoices: [
          makeInvoicePayload({
            id: "inv_live_transfer_handoff",
            invoiceNumber: "INV-LIVE-HANDOFF",
            amountCents: 125_000
          })
        ]
      }
    });

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    const vars = body.retellPayload.retell_llm_dynamic_variables;

    expect(body.status).toBe("started");
    expect(body.callObjective).toBe("mixed_collections_call_with_handler_check");
    expect(body.handlerContext).toMatchObject({
      handlerHandoffPossible: true,
      currentContactMayNoLongerBeHandler: true,
      knownNewHandlerName: "Ana Reyes",
      knownNewHandlerPhone: "+639188887777",
      knownNewHandlerEmail: "ana@example.com",
      knownNewHandlerVerified: true,
      routingUpdateRecommended: true,
      liveTransferPossible: true,
      followUpRequired: false,
      handlerHandoffBlockedReason: ""
    });
    expect(vars.handler_handoff_possible).toBe("true");
    expect(vars.live_transfer_possible).toBe("true");
    expect(vars.handoff_follow_up_required).toBe("false");
    expect(vars.known_new_handler_name).toBe("Ana Reyes");
    expect(vars.known_new_handler_phone).toBe("+639188887777");
    expect(vars.call_objective).toBe("mixed_collections_call_with_handler_check");
    expect(body.activityEntries.map((entry: { action: string }) => entry.action)).toEqual(
      expect.arrayContaining([
        "retell.precall.handler_handoff_detected",
        "retell.outbound_call.created",
        "retell.outbound_call.call_created"
      ])
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks handler handoff for safe follow-up when a verified new handler has no reachable phone", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/outbound-call",
      payload: {
        principal,
        tenantId: "tenant_1",
        asOf: "2026-04-29T02:00:00.000Z",
        account,
        contact: {
          ...contact,
          metadata: {
            verifiedInvoicePaymentHandler: true,
            handlerVerificationSource: "historical",
            currentContactMayNoLongerBeHandler: true,
            knownNewHandlerName: "Ana Reyes",
            knownNewHandlerEmail: "ana@example.com",
            knownNewHandlerVerified: true
          }
        },
        invoices: [
          makeInvoicePayload({
            id: "inv_follow_up_handoff",
            invoiceNumber: "INV-FOLLOW-UP-HANDOFF",
            amountCents: 125_000
          })
        ]
      }
    });

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();

    expect(body.status).toBe("blocked");
    expect(body.blockedReason).toBe("handler_handoff_requires_review");
    expect(body.callObjective).toBe("mixed_collections_call_with_handler_check");
    expect(body.handlerContext).toMatchObject({
      handlerHandoffPossible: true,
      routingUpdateRecommended: true,
      liveTransferPossible: false,
      followUpRequired: true,
      handlerHandoffBlockedReason: "new_handler_missing_phone"
    });
    const handoffEntry = body.activityEntries.find(
      (entry: { action: string }) => entry.action === "retell.precall.handler_handoff_detected"
    );
    expect(handoffEntry.metadata).toMatchObject({
      eventType: "handler_handoff_detected",
      known_new_handler_name: "Ana Reyes",
      handler_handoff_blocked_reason: "new_handler_missing_phone"
    });
    expect(body.retellPayload).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks when branch context is required but not available", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/outbound-call",
      payload: {
        principal,
        tenantId: "tenant_1",
        asOf: "2026-04-29T02:00:00.000Z",
        account: {
          ...account,
          branchId: undefined,
          metadata: {
            ...account.metadata,
            requiresBranchContext: true
          }
        },
        contact: {
          ...contact,
          branchId: undefined
        },
        invoices: [
          makeInvoicePayload({
            id: "inv_missing_branch",
            invoiceNumber: "INV-MISSING-BRANCH",
            branchId: undefined
          })
        ]
      }
    });

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.status).toBe("blocked");
    expect(body.blockedReason).toBe("missing_branch_context");
    expect(body.blockedReasons).toContain("missing_branch_context");
    expect(body.plan.routingContext.branchIds).toEqual([]);
    expect(body.retellPayload).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps mixed promise-state groups into Retell dynamic variables", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/outbound-call",
      payload: {
        principal,
        tenantId: "tenant_1",
        asOf: "2026-04-29T02:00:00.000Z",
        account,
        contact,
        invoices: [
          {
            id: "inv_broken",
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
            state: "matched_to_erp",
            parentAccountId: "parent_1",
            billingAccountId: "billing_1",
            branchId: "branch_1",
            invoiceNumber: "INV-BROKEN",
            currency: "PHP",
            amountCents: 200_000,
            dueDate: "2026-04-20",
            metadata: {}
          },
          {
            id: "inv_overdue",
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
            state: "matched_to_erp",
            parentAccountId: "parent_1",
            billingAccountId: "billing_1",
            branchId: "branch_1",
            invoiceNumber: "INV-OVERDUE",
            currency: "PHP",
            amountCents: 80_000,
            dueDate: "2026-04-21",
            metadata: {}
          },
          {
            id: "inv_due_today_promise",
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
            state: "matched_to_erp",
            parentAccountId: "parent_1",
            billingAccountId: "billing_1",
            branchId: "branch_1",
            invoiceNumber: "INV-DUE-TODAY-PTP",
            currency: "PHP",
            amountCents: 70_000,
            dueDate: "2026-04-29",
            metadata: {}
          }
        ],
        promisesToPay: [
          {
            id: "ptp_broken",
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
            state: "accepted",
            parentAccountId: "parent_1",
            billingAccountId: "billing_1",
            contactId: "contact_1",
            promisedAmountCents: 200_000,
            currency: "PHP",
            promiseDate: "2026-04-20",
            metadata: { invoiceIds: ["inv_broken"] }
          },
          {
            id: "ptp_active",
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
            state: "accepted",
            parentAccountId: "parent_1",
            billingAccountId: "billing_1",
            contactId: "contact_1",
            promisedAmountCents: 70_000,
            currency: "PHP",
            promiseDate: "2026-05-05",
            metadata: { invoiceIds: ["inv_due_today_promise"] }
          }
        ]
      }
    });

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    const vars = body.retellPayload.retell_llm_dynamic_variables;

    expect(body.status).toBe("started");
    expect(body.callObjective).toBe("recover_broken_promises_and_secure_unpromised_overdue");
    expect(body.groupSummaries.map((group: { name: string }) => group.name)).toEqual([
      "broken_promises",
      "overdue_without_promise",
      "active_future_promises"
    ]);
    expect(body.groupSummaries[0]).toMatchObject({
      name: "broken_promises",
      count: 1,
      totalCents: 200_000,
      treatmentMode: "recovery"
    });
    expect(Object.values(vars).every((value) => typeof value === "string")).toBe(true);
    expect(vars.has_broken_promises).toBe("true");
    expect(vars.broken_promise_total).toBe("PHP 2,000.00");
    expect(vars.broken_promise_count).toBe("1");
    expect(vars.broken_promise_summary).toContain("INV-BROKEN");
    expect(vars.has_overdue_without_promise).toBe("true");
    expect(vars.overdue_without_promise_total).toBe("PHP 800.00");
    expect(vars.overdue_without_promise_count).toBe("1");
    expect(vars.overdue_without_promise_summary).toContain("INV-OVERDUE");
    expect(vars.has_overdue).toBe("true");
    expect(vars.overdue_total).toBe("PHP 800.00");
    expect(vars.oldest_overdue_days).toBe("8");
    expect(vars.overdue_summary).toContain("INV-OVERDUE");
    expect(vars.overdue_summary).not.toContain("INV-BROKEN");
    expect(vars.date_overdue_summary).toContain("INV-BROKEN");
    expect(vars.has_due_today_without_promise).toBe("false");
    expect(vars.due_today_without_promise_total).toBe("PHP 0.00");
    expect(vars.due_today_without_promise_summary).toBe("None");
    expect(vars.has_active_future_promises).toBe("true");
    expect(vars.active_future_promise_total).toBe("PHP 700.00");
    expect(vars.active_future_promise_count).toBe("1");
    expect(vars.active_future_promise_summary).toContain("INV-DUE-TODAY-PTP");
    expect(vars.earliest_active_promise_date).toBe("2026-05-05");
    expect(vars.call_priority_plan).toContain("1. broken promises");
    expect(vars.call_priority_plan).toContain("2. overdue without promise");
    expect(vars.call_objective).toBe("recover_broken_promises_and_secure_unpromised_overdue");
    expect(body.retellPayload.metadata).toMatchObject({
      bucket_has_overdue: true,
      bucket_overdue_total_cents: 80_000,
      oldest_overdue_days: 8,
      date_bucket_has_overdue: true,
      date_bucket_overdue_total_cents: 280_000,
      has_overdue_without_promise: true,
      overdue_without_promise_count: 1,
      overdue_without_promise_total_cents: 80_000
    });
    const callCreatedEntry = body.activityEntries.find(
      (entry: { action: string }) => entry.action === "retell.outbound_call.call_created"
    );
    expect(callCreatedEntry.metadata).toMatchObject({
      eventType: "call_created",
      billing_account_id: "billing_1",
      contact_id: "contact_1",
      provider_call_id: "call_test_123",
      broken_promise_count: 1,
      broken_promise_total_cents: 200_000,
      overdue_without_promise_count: 1,
      overdue_without_promise_total_cents: 80_000,
      due_today_without_promise_count: 0,
      active_future_promise_count: 1,
      active_future_promise_total_cents: 70_000,
      callObjective: "recover_broken_promises_and_secure_unpromised_overdue",
      callPriorityPlan: expect.stringContaining("broken promises")
    });
  });

  it("treats a due-today invoice with an active future promise as promise confirmation", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/outbound-call",
      payload: {
        principal,
        tenantId: "tenant_1",
        asOf: "2026-04-29T02:00:00.000Z",
        account,
        contact,
        invoices: [
          makeInvoicePayload({
            id: "inv_due_today_active_promise",
            invoiceNumber: "INV-DUE-TODAY-ACTIVE",
            amountCents: 75_000,
            dueDate: "2026-04-29"
          })
        ],
        promisesToPay: [
          makePromisePayload({
            id: "ptp_due_today_active",
            promisedAmountCents: 75_000,
            promiseDate: "2026-05-04",
            metadata: { invoiceIds: ["inv_due_today_active_promise"] }
          })
        ]
      }
    });

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    const vars = body.retellPayload.retell_llm_dynamic_variables;

    expect(body.status).toBe("started");
    expect(body.callObjective).toBe("confirm_active_promises_only");
    expect(body.groupSummaries).toEqual([
      expect.objectContaining({
        name: "active_future_promises",
        rank: 5,
        count: 1,
        totalCents: 75_000,
        treatmentMode: "confirmation"
      })
    ]);
    expect(body.plan.preCallOutput).toMatchObject({
      has_due_today: true,
      has_due_today_without_promise: false,
      due_today_without_promise_total: 0,
      has_active_future_promises: true,
      active_future_promise_total: 75_000,
      earliest_active_promise_date: "2026-05-04"
    });
    expect(vars.has_due_today_without_promise).toBe("false");
    expect(vars.has_active_future_promises).toBe("true");
    expect(vars.active_future_promise_summary).toContain("INV-DUE-TODAY-ACTIVE");
    expect(vars.call_objective).toBe("confirm_active_promises_only");
    expect(body.retellCallId).toBe("call_test_123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a pre-due invoice with an active future promise as promise confirmation", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/outbound-call",
      payload: {
        principal,
        tenantId: "tenant_1",
        asOf: "2026-04-29T02:00:00.000Z",
        account,
        contact,
        invoices: [
          makeInvoicePayload({
            id: "inv_pre_due_active_promise",
            invoiceNumber: "INV-PRE-DUE-ACTIVE",
            amountCents: 65_000,
            dueDate: "2026-05-03"
          })
        ],
        promisesToPay: [
          makePromisePayload({
            id: "ptp_pre_due_active",
            promisedAmountCents: 65_000,
            promiseDate: "2026-05-07",
            metadata: { invoiceIds: ["inv_pre_due_active_promise"] }
          })
        ]
      }
    });

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    const vars = body.retellPayload.retell_llm_dynamic_variables;

    expect(body.status).toBe("started");
    expect(body.callObjective).toBe("confirm_active_promises_only");
    expect(body.groupSummaries).toEqual([
      expect.objectContaining({
        name: "active_future_promises",
        rank: 5,
        count: 1,
        totalCents: 65_000,
        treatmentMode: "confirmation"
      })
    ]);
    expect(body.plan.preCallOutput).toMatchObject({
      has_pre_due: true,
      has_pre_due_without_promise: false,
      pre_due_without_promise_total: 0,
      has_active_future_promises: true,
      active_future_promise_total: 65_000,
      earliest_active_promise_date: "2026-05-07"
    });
    expect(vars.has_pre_due_without_promise).toBe("false");
    expect(vars.has_active_future_promises).toBe("true");
    expect(vars.active_future_promise_summary).toContain("INV-PRE-DUE-ACTIVE");
    expect(vars.call_objective).toBe("confirm_active_promises_only");
    expect(body.retellCallId).toBe("call_test_123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns a safe blocked outcome and does not call Retell for disputed invoices", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/outbound-call",
      payload: {
        principal,
        tenantId: "tenant_1",
        asOf: "2026-04-29T02:00:00.000Z",
        account,
        contact,
        invoices: [
          {
            id: "inv_disputed",
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
            state: "disputed_full",
            parentAccountId: "parent_1",
            billingAccountId: "billing_1",
            branchId: "branch_1",
            invoiceNumber: "INV-DISPUTED",
            currency: "PHP",
            amountCents: 150_000,
            dueDate: "2026-04-20",
            metadata: {}
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("blocked");
    expect(body.blockedReason).toBe("disputed_invoice");
    expect(body.verifiedContactStatus).toBe("verified");
    expect(body.callObjective).toBe("safe_human_review_required");
    expect(body.handlerContext).toMatchObject({
      verifiedContactStatus: "verified",
      rightPartyCheckRequired: false,
      handlerHandoffPossible: false
    });
    expect(body.groupSummaries).toEqual([]);
    expect(body.plan.safetyDecision.blockedReasons).toContain("disputed_invoice");
    expect(body.activityEntries[0].action).toBe("retell.precall.blocked");
    expect(body.activityEntries.map((entry: { action: string }) => entry.action)).toEqual(
      expect.arrayContaining([
        "retell.precall.contact_verification_evaluated",
        "retell.precall.call_blocked"
      ])
    );
    const blockedEntry = body.activityEntries.find(
      (entry: { action: string }) => entry.action === "retell.precall.call_blocked"
    );
    expect(blockedEntry.metadata).toMatchObject({
      eventType: "call_blocked",
      billing_account_id: "billing_1",
      contact_id: "contact_1",
      blockedReason: "disputed_invoice",
      blocked_reason: "disputed_invoice",
      verified_contact_status: "verified",
      disputed_invoice_count: 1,
      disputed_invoice_summary: expect.stringContaining("INV-DISPUTED"),
      callObjective: "safe_human_review_required"
    });
    expect(body.retellPayload).toBeUndefined();
    expect(body.retellCall).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("routes a verified inbound caller with current handler context", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/inbound-call",
      payload: {
        principal,
        tenantId: "tenant_1",
        callerPhoneNumber: "+639171234567",
        asOf: "2026-04-29T02:00:00.000Z",
        accounts: [account],
        contacts: [contact],
        invoices: [
          makeInvoicePayload({
            id: "inv_inbound_verified",
            invoiceNumber: "INV-INBOUND-VERIFIED",
            amountCents: 100_000
          })
        ]
      }
    });

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    const vars = body.retell_llm_dynamic_variables;

    expect(body.status).toBe("routed");
    expect(body.verifiedContactStatus).toBe("verified");
    expect(body.handlerContext).toMatchObject({
      contactId: "contact_1",
      currentHandlerContactId: "contact_1",
      rightPartyCheckRequired: false,
      handlerHandoffPossible: false
    });
    expect(body.routingContext).toMatchObject({
      routingLevel: "billing_account",
      billingAccountId: "billing_1",
      branchId: "branch_1"
    });
    expect(body.callObjective).toBe("secure_unpromised_overdue");
    expect(body.groupSummaries[0]).toMatchObject({
      name: "overdue_without_promise",
      count: 1
    });
    expect(Object.values(vars).every((value) => typeof value === "string")).toBe(true);
    expect(vars.inbound_call).toBe("true");
    expect(vars.verified_contact_status).toBe("verified");
    expect(vars.right_party_check_required).toBe("false");
    expect(vars.call_priority_plan).toContain("overdue without promise");
    expect(body.activityEntries.map((entry: { action: string }) => entry.action)).toContain(
      "retell.inbound_call.routed"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("routes an unverified inbound caller with right-party check required", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/inbound-call",
      payload: {
        principal,
        tenantId: "tenant_1",
        callerPhoneNumber: "+639171234567",
        asOf: "2026-04-29T02:00:00.000Z",
        accounts: [account],
        contacts: [
          {
            ...contact,
            id: "contact_unverified_inbound",
            isVerified: false,
            allowAutoSend: false,
            recentSuccessfulResponses: 0,
            metadata: {}
          }
        ],
        invoices: [
          makeInvoicePayload({
            id: "inv_inbound_unverified",
            invoiceNumber: "INV-INBOUND-UNVERIFIED"
          })
        ]
      }
    });

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    const vars = body.retell_llm_dynamic_variables;

    expect(body.status).toBe("routed");
    expect(body.verifiedContactStatus).toBe("unverified");
    expect(body.plan.safetyDecision.blockedReasons).toContain("unverified_contact");
    expect(body.handlerContext).toMatchObject({
      verifiedContactStatus: "unverified",
      verificationSource: "unknown",
      rightPartyCheckRequired: true
    });
    expect(vars.verified_contact_status).toBe("unverified");
    expect(vars.right_party_check_required).toBe("true");
    expect(vars.call_priority_flags).toContain("right_party_check_required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exposes historical handler handoff context for an inbound caller", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/inbound-call",
      payload: {
        principal,
        tenantId: "tenant_1",
        callerPhoneNumber: "+639171234567",
        asOf: "2026-04-29T02:00:00.000Z",
        accounts: [account],
        contacts: [
          {
            ...contact,
            metadata: {
              verifiedInvoicePaymentHandler: true,
              handlerVerificationSource: "historical",
              currentContactMayNoLongerBeHandler: true,
              knownNewHandlerName: "Ana Reyes",
              knownNewHandlerEmail: "ana@example.com"
            }
          }
        ],
        invoices: [
          makeInvoicePayload({
            id: "inv_inbound_handoff",
            invoiceNumber: "INV-INBOUND-HANDOFF"
          })
        ]
      }
    });

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    const vars = body.retell_llm_dynamic_variables;

    expect(body.status).toBe("routed");
    expect(body.callObjective).toBe("mixed_collections_call_with_handler_check");
    expect(body.handlerContext).toMatchObject({
      verifiedContactStatus: "verified",
      verificationSource: "historical",
      handlerHandoffPossible: true,
      currentContactMayNoLongerBeHandler: true,
      knownNewHandlerName: "Ana Reyes",
      followUpRequired: true,
      handlerHandoffBlockedReason: "new_handler_unverified"
    });
    expect(vars.handler_handoff_possible).toBe("true");
    expect(vars.known_new_handler_name).toBe("Ana Reyes");
    expect(vars.handler_handoff_blocked_reason).toBe("new_handler_unverified");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prioritizes broken promises for an inbound caller", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/inbound-call",
      payload: {
        principal,
        tenantId: "tenant_1",
        callerPhoneNumber: "+639171234567",
        asOf: "2026-04-29T02:00:00.000Z",
        accounts: [account],
        contacts: [contact],
        invoices: [
          makeInvoicePayload({
            id: "inv_inbound_broken",
            invoiceNumber: "INV-INBOUND-BROKEN",
            amountCents: 220_000,
            dueDate: "2026-04-20"
          }),
          makeInvoicePayload({
            id: "inv_inbound_overdue",
            invoiceNumber: "INV-INBOUND-OVERDUE",
            amountCents: 80_000,
            dueDate: "2026-04-21"
          })
        ],
        promisesToPay: [
          makePromisePayload({
            id: "ptp_inbound_broken",
            promisedAmountCents: 220_000,
            promiseDate: "2026-04-20",
            metadata: { invoiceIds: ["inv_inbound_broken"] }
          })
        ]
      }
    });

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    const vars = body.retell_llm_dynamic_variables;

    expect(body.status).toBe("routed");
    expect(body.groupSummaries.map((group: { name: string }) => group.name)).toEqual([
      "broken_promises",
      "overdue_without_promise"
    ]);
    expect(body.groupSummaries[0]).toMatchObject({
      name: "broken_promises",
      treatmentMode: "recovery",
      count: 1,
      totalCents: 220_000
    });
    expect(body.callObjective).toBe("recover_broken_promises_and_secure_unpromised_overdue");
    expect(vars.has_broken_promises).toBe("true");
    expect(vars.broken_promise_summary).toContain("INV-INBOUND-BROKEN");
    expect(vars.has_overdue).toBe("true");
    expect(vars.overdue_total).toBe("PHP 800.00");
    expect(vars.oldest_overdue_days).toBe("8");
    expect(vars.overdue_summary).toContain("INV-INBOUND-OVERDUE");
    expect(vars.overdue_summary).not.toContain("INV-INBOUND-BROKEN");
    expect(vars.call_priority_plan).toContain("1. broken promises");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns confirmation-only context when inbound caller has only active future promises", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/inbound-call",
      payload: {
        principal,
        tenantId: "tenant_1",
        callerPhoneNumber: "+639171234567",
        asOf: "2026-04-29T02:00:00.000Z",
        accounts: [account],
        contacts: [contact],
        invoices: [
          makeInvoicePayload({
            id: "inv_inbound_active_promise",
            invoiceNumber: "INV-INBOUND-ACTIVE",
            amountCents: 75_000,
            dueDate: "2026-04-29"
          })
        ],
        promisesToPay: [
          makePromisePayload({
            id: "ptp_inbound_active",
            promisedAmountCents: 75_000,
            promiseDate: "2026-05-04",
            metadata: { invoiceIds: ["inv_inbound_active_promise"] }
          })
        ]
      }
    });

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    const vars = body.retell_llm_dynamic_variables;

    expect(body.status).toBe("routed");
    expect(body.callObjective).toBe("confirm_active_promises_only");
    expect(body.groupSummaries).toEqual([
      expect.objectContaining({
        name: "active_future_promises",
        treatmentMode: "confirmation",
        count: 1
      })
    ]);
    expect(vars.has_active_future_promises).toBe("true");
    expect(vars.has_due_today_without_promise).toBe("false");
    expect(vars.call_objective).toBe("confirm_active_promises_only");
    expect(vars.safe_goal).toContain("Confirm active payment promise");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("routes disputed-only inbound context to a safer fallback", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/inbound-call",
      payload: {
        principal,
        tenantId: "tenant_1",
        callerPhoneNumber: "+639171234567",
        asOf: "2026-04-29T02:00:00.000Z",
        accounts: [account],
        contacts: [contact],
        invoices: [
          makeInvoicePayload({
            id: "inv_inbound_disputed",
            invoiceNumber: "INV-INBOUND-DISPUTED",
            state: "disputed_full",
            amountCents: 120_000
          })
        ]
      }
    });

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    const vars = body.retell_llm_dynamic_variables;

    expect(body.status).toBe("fallback");
    expect(body.fallbackReason).toBe("disputed_invoice");
    expect(body.callObjective).toBe("safe_human_review_required");
    expect(body.groupSummaries).toEqual([]);
    expect(vars.routing_status).toBe("fallback");
    expect(vars.fallback_reason).toBe("disputed_invoice");
    expect(vars.safe_goal).toContain("safer human review");
    expect(body.activityEntries.map((entry: { action: string }) => entry.action)).toContain(
      "retell.inbound_call.fallback_routed"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records post-call handoff and follow-up persistence actions without calling Retell", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/call-outcome",
      payload: {
        principal,
        tenantId: "tenant_1",
        billingAccountId: account.id,
        parentAccountId: account.parentAccountId,
        branchId: account.branchId,
        contactId: contact.id,
        communicationAttemptId: "attempt_1",
        providerCallId: "call_test_123",
        preCallPlanId: "plan_1",
        occurredAt: "2026-04-29T03:00:00.000Z",
        disposition: "callback_requested",
        contactHandoff: {
          currentContactId: contact.id,
          newHandlerName: "Ana Reyes",
          newHandlerEmail: "ana@example.com",
          newHandlerReachable: false,
          verificationStatus: "self_verified"
        },
        promiseUpdate: {
          invoiceIds: ["inv_overdue"],
          promisedDate: "2026-05-03",
          promisedAmountCents: 150_000,
          currency: "PHP"
        },
        partialPaymentCommitment: {
          invoiceIds: ["inv_overdue"],
          promisedAmountCents: 50_000,
          promisedDate: "2026-05-04",
          currency: "PHP",
          groupName: "overdue_without_promise",
          remainderDisposition: "follow_up_required"
        },
        paymentPlanRequest: {
          invoiceIds: ["inv_overdue"],
          requestedInstallmentCount: 3,
          requestedCadence: "monthly",
          groupName: "overdue_without_promise",
          summary: "Customer asked for installments over three months."
        },
        nonCommitment: {
          invoiceIds: ["inv_overdue"],
          groupName: "overdue_without_promise",
          reason: "Still waiting for internal signoff.",
          callbackRequested: true
        },
        routingChangeRequest: {
          requestedRoutingLevel: "branch",
          requestedBranchId: "branch_2",
          requestedContactId: "contact_new_handler",
          reason: "Customer said a different branch AP handler now owns payment follow-up."
        },
        paidAlreadyClaim: {
          invoiceIds: ["inv_paid_claim"],
          reference: "DEP-123",
          remittanceExpected: true
        },
        dispute: {
          invoiceIds: ["inv_disputed_claim"],
          disputeType: "billing",
          summary: "Customer said the amount is wrong."
        },
        callback: {
          dueAt: "2026-04-30T02:00:00.000Z",
          timezone: "Asia/Manila"
        },
        followUpActions: [
          {
            title: "Verify new handler before next automated outreach",
            requiresHumanReview: true,
            metadata: { reason: "handler_handoff_verification" }
          }
        ]
      }
    });

    expect(response.statusCode, response.payload).toBe(200);
    const body = response.json();
    expect(body.status).toBe("recorded");
    expect(body.persistencePlan.followUpSafeMode).toBe("handler_unreachable");
    expect(body.persistencePlan.actions.map((action: { kind: string }) => action.kind)).toEqual(
      expect.arrayContaining([
        "contact_handoff",
        "next_step_follow_up",
        "routing_change_request",
        "promise_update",
        "partial_payment_commitment",
        "payment_plan_request",
        "non_commitment",
        "paid_already_claim",
        "dispute",
        "callback"
      ])
    );
    expect(body.activityEntries.map((entry: { action: string }) => entry.action)).toEqual(
      expect.arrayContaining([
        "retell.call_outcome.received",
        "collections.voice.post_call.persistence_planned",
        "collections.voice.post_call.contact_handoff",
        "collections.voice.post_call.routing_change_requested",
        "collections.voice.post_call.callback_required",
        "collections.voice.post_call.promise_monitoring_requested",
        "collections.voice.post_call.partial_payment_follow_up_requested",
        "collections.voice.post_call.payment_plan_review_requested",
        "collections.voice.post_call.non_commitment_follow_up_requested",
        "collections.voice.post_call.dispute_follow_up_requested"
      ])
    );
    const routingChangeEntry = body.activityEntries.find(
      (entry: { action: string }) =>
        entry.action === "collections.voice.post_call.routing_change_requested"
    );
    expect(routingChangeEntry.metadata).toMatchObject({
      eventType: "routing_change_requested",
      billing_account_id: "billing_1",
      contact_id: "contact_1",
      provider_call_id: "call_test_123",
      action_kind: "routing_change_request",
      requires_human_review: true
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
