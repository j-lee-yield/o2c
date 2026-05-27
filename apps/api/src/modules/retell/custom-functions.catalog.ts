export interface RetellCustomFunctionCatalogEntry {
  name: string;
  method: "POST";
  payloadMode: "args_only";
  endpointPath: string;
  endpointUrl: string;
  callFlowNode: string;
  usage: "live_recommended" | "manual_fallback" | "legacy_fallback";
  flowGuidance: string;
  expectedRequestBody: Record<string, unknown>;
  responseExample: Record<string, unknown>;
}

export interface RetellCustomFunctionCatalogInput {
  publicBaseUrl?: string;
}

const commonContext = {
  tenantId: "tenant_1",
  billingAccountId: "billing_1",
  contactId: "contact_1",
  communicationAttemptId: "attempt_1",
  providerCallId: "call_123",
  account: "{ optional inline BillingAccount }",
  contact: "{ optional inline Contact }",
  invoices: "[ optional inline CustomerInvoice[] ]",
  promisesToPay: "[ optional inline PromiseToPay[] ]"
};

const baseCatalog = [
  {
    name: "get-account-snapshot",
    endpointPath: "/retell/functions/get-account-snapshot",
    callFlowNode: "opening_context_after_right_party_check",
    usage: "live_recommended",
    flowGuidance: "Use at call start only when Retell needs fresh account/invoice context for live branching.",
    expectedRequestBody: commonContext,
    responseExample: {
      ok: true,
      status: "ok",
      message: "Account snapshot ready.",
      groupSummaries: [{ name: "overdue_without_promise", count: 1, totalCents: 150000 }]
    }
  },
  {
    name: "get-group-invoice-details",
    endpointPath: "/retell/functions/get-group-invoice-details",
    callFlowNode: "invoice_group_treatment",
    usage: "live_recommended",
    flowGuidance: "Use during the call only when the caller asks which invoices are in a group.",
    expectedRequestBody: { ...commonContext, groupName: "overdue_without_promise" },
    responseExample: {
      ok: true,
      status: "ok",
      invoices: [{ invoiceId: "inv_1", invoiceNumber: "INV-1001", amountCents: 150000 }]
    }
  },
  {
    name: "create-promise-to-pay",
    endpointPath: "/retell/functions/create-promise-to-pay",
    callFlowNode: "promise_capture",
    usage: "legacy_fallback",
    flowGuidance:
      "Do not call in the default low-latency flow. Capture promise facts in Retell analysis/extracted variables and let post-call automation persist them.",
    expectedRequestBody: {
      ...commonContext,
      invoiceIds: ["inv_1"],
      promisedDate: "2026-05-03",
      promisedAmountCents: 150000
    },
    responseExample: {
      ok: true,
      status: "captured",
      message: "Promise captured for 2026-05-03."
    }
  },
  {
    name: "update-promise-to-pay",
    endpointPath: "/retell/functions/update-promise-to-pay",
    callFlowNode: "promise_confirmation_or_recovery",
    usage: "legacy_fallback",
    flowGuidance:
      "Do not call in the default low-latency flow. Existing promise revisions should be persisted from terminal webhook analysis.",
    expectedRequestBody: {
      ...commonContext,
      promiseToPayId: "ptp_1",
      invoiceIds: ["inv_1"],
      status: "kept"
    },
    responseExample: { ok: true, status: "captured", message: "Promise update captured." }
  },
  {
    name: "capture-partial-payment-commitment",
    endpointPath: "/retell/functions/capture-partial-payment-commitment",
    callFlowNode: "partial_payment_commitment_capture",
    usage: "legacy_fallback",
    flowGuidance:
      "Prefer post-call extraction. Use live only if the call must branch immediately on partial-payment capture.",
    expectedRequestBody: {
      ...commonContext,
      invoiceIds: ["inv_1"],
      promisedAmountCents: 75000,
      promisedDate: "2026-05-03",
      groupName: "overdue_without_promise",
      remainderDisposition: "follow_up_required"
    },
    responseExample: {
      ok: true,
      status: "captured",
      message: "Partial payment commitment captured for review and residual follow-up."
    }
  },
  {
    name: "request-payment-plan-review",
    endpointPath: "/retell/functions/request-payment-plan-review",
    callFlowNode: "payment_plan_request_capture",
    usage: "legacy_fallback",
    flowGuidance:
      "Prefer post-call extraction and task creation. Live use is only for immediate caller-facing branching.",
    expectedRequestBody: {
      ...commonContext,
      invoiceIds: ["inv_1"],
      summary: "Customer asked for a three-month installment plan.",
      requestedInstallmentCount: 3,
      requestedCadence: "monthly",
      groupName: "overdue_without_promise"
    },
    responseExample: {
      ok: true,
      status: "needs_follow_up",
      message: "Payment plan request captured for human review. Do not negotiate terms automatically."
    }
  },
  {
    name: "capture-non-commitment",
    endpointPath: "/retell/functions/capture-non-commitment",
    callFlowNode: "non_commitment_capture",
    usage: "legacy_fallback",
    flowGuidance:
      "Prefer post-call extraction. Non-commitment follow-up tasks are created after terminal webhook processing.",
    expectedRequestBody: {
      ...commonContext,
      invoiceIds: ["inv_1"],
      reason: "Customer cannot commit until internal approval is complete.",
      callbackRequested: true,
      dueAt: "2026-05-01T02:00:00.000Z"
    },
    responseExample: {
      ok: true,
      status: "captured",
      message: "Non-commitment captured for follow-up tracking."
    }
  },
  {
    name: "log-paid-already",
    endpointPath: "/retell/functions/log-paid-already",
    callFlowNode: "paid_already_claim",
    usage: "legacy_fallback",
    flowGuidance:
      "Prefer post-call extraction. Paid-already claims create verification/remittance follow-up after the call.",
    expectedRequestBody: { ...commonContext, invoiceIds: ["inv_1"], reference: "DEP-123" },
    responseExample: {
      ok: true,
      status: "captured",
      message: "Paid-already claim captured for cash application review."
    }
  },
  {
    name: "mark-dispute",
    endpointPath: "/retell/functions/mark-dispute",
    callFlowNode: "dispute_capture",
    usage: "manual_fallback",
    flowGuidance:
      "Use live only when dispute scope changes the remaining conversation. Otherwise persist dispute from post-call analysis.",
    expectedRequestBody: {
      ...commonContext,
      invoiceIds: ["inv_1"],
      disputeType: "billing",
      summary: "Customer says the quantity is wrong.",
      disputeScope: "invoice_subset",
      groupName: "overdue_without_promise",
      groupInvoiceIds: ["inv_1"]
    },
    responseExample: {
      ok: true,
      status: "captured",
      message: "Dispute captured and frozen.",
      metadata: {
        dispute_scope: "invoice_subset",
        can_continue_after_dispute: true,
        next_action_after_dispute: "continue_with_remaining_groups",
        frozen_scope_summary: "Frozen 1 disputed invoice(s)."
      }
    }
  },
  {
    name: "request-callback",
    endpointPath: "/retell/functions/request-callback",
    callFlowNode: "callback_scheduling",
    usage: "legacy_fallback",
    flowGuidance:
      "Prefer post-call extraction. Callback tasks are created from terminal webhook analysis.",
    expectedRequestBody: { ...commonContext, dueAt: "2026-05-01T02:00:00.000Z" },
    responseExample: { ok: true, status: "captured", message: "Callback request captured." }
  },
  {
    name: "capture-handler-handoff",
    endpointPath: "/retell/functions/capture-handler-handoff",
    callFlowNode: "handler_handoff_before_bucket_handling",
    usage: "manual_fallback",
    flowGuidance:
      "Use live only when a handler handoff changes who the agent should speak with during the call.",
    expectedRequestBody: {
      ...commonContext,
      newHandlerName: "Ana Reyes",
      newHandlerEmail: "ana@example.com",
      newHandlerReachable: false
    },
    responseExample: {
      ok: true,
      status: "needs_follow_up",
      message: "Handler handoff captured."
    }
  },
  {
    name: "send-invoice-copy",
    endpointPath: "/retell/functions/send-invoice-copy",
    callFlowNode: "document_request",
    usage: "live_recommended",
    flowGuidance:
      "Use only when the caller explicitly asks for invoice copies and immediate send is required.",
    expectedRequestBody: { ...commonContext, invoiceIds: ["inv_1"], deliveryChannel: "email" },
    responseExample: {
      ok: true,
      status: "queued",
      message: "Invoice copy send request is safe to queue for the verified contact."
    }
  },
  {
    name: "send-soa",
    endpointPath: "/retell/functions/send-soa",
    callFlowNode: "document_request",
    usage: "manual_fallback",
    flowGuidance:
      "Do not use in the default happy path. Recap plus SOA should normally be sent by webhook-backed post-call automation.",
    expectedRequestBody: {
      ...commonContext,
      statementSnapshotId: "soa_1",
      deliveryChannel: "email",
      destination: "ap@example.com",
      callSummary: "Customer requested the statement of account before confirming payment timing."
    },
    responseExample: {
      ok: true,
      status: "queued",
      message: "Statement of account email sent to the verified contact.",
      metadata: {
        automationAction: "send_statement_of_account",
        deliveryChannel: "email",
        destination: "ap@example.com",
        statementSnapshotId: "soa_1",
        callSummaryIncluded: true
      }
    }
  },
  {
    name: "finalize-call-outcome",
    endpointPath: "/retell/functions/finalize-call-outcome",
    callFlowNode: "post_call_finalization",
    usage: "manual_fallback",
    flowGuidance:
      "Do not use as the default terminal live node. Terminal webhooks should record outcomes, tasks, activity, and recap/SOA after the call.",
    expectedRequestBody: {
      ...commonContext,
      disposition: "connected",
      dispute: {
        invoiceIds: ["inv_1"],
        disputeType: "billing",
        summary: "Customer says the quantity is wrong."
      },
      callback: {
        dueAt: "2026-05-01T02:00:00.000Z",
        timezone: "Asia/Manila"
      },
      transcriptSummary: "Customer disputed one invoice and requested a callback."
    },
    responseExample: {
      ok: true,
      status: "recorded",
      message: "Call outcome recorded. 2 task(s) created.",
      taskCount: 2,
      taskTypes: ["invoice_dispute_review", "account_manager_callback"]
    }
  },
  {
    name: "send-payment-link",
    endpointPath: "/retell/functions/send-payment-link",
    callFlowNode: "payment_link_offer_after_authorization",
    usage: "manual_fallback",
    flowGuidance:
      "Use live only when the caller needs an immediate payment link and the contact/invoice scope passes safety checks.",
    expectedRequestBody: { ...commonContext, invoiceIds: ["inv_1"], amountCents: 150000 },
    responseExample: {
      ok: true,
      status: "queued",
      message: "Payment link send request is safe to queue for the verified contact."
    }
  }
] as const;

export function buildRetellCustomFunctionCatalog(
  input: RetellCustomFunctionCatalogInput = {}
): RetellCustomFunctionCatalogEntry[] {
  return baseCatalog.map((entry) => ({
    ...entry,
    method: "POST",
    payloadMode: "args_only",
    endpointUrl: joinPublicUrl(input.publicBaseUrl, entry.endpointPath)
  }));
}

export const retellCustomFunctionCatalog = buildRetellCustomFunctionCatalog();

function joinPublicUrl(publicBaseUrl: string | undefined, path: string): string {
  if (!publicBaseUrl) {
    return path;
  }
  return `${publicBaseUrl.replace(/\/+$/, "")}${path}`;
}
