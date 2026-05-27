import type { BillingAccount, CommunicationAttempt, Contact } from "@o2c/domain";
import type { CollectionsVoicePreCallPlan } from "@o2c/workflows";
import type { RetellCreatePhoneCallRequest } from "./client.js";

export type RetellPayloadMapperInput = {
  plan: CollectionsVoicePreCallPlan;
  account: BillingAccount;
  contact: Contact;
  communicationAttempt: CommunicationAttempt;
  fromNumber: string;
  overrideAgentId?: string;
  tenantId: string;
};

export type RetellInboundRoutingPayloadInput = {
  plan: CollectionsVoicePreCallPlan;
  account: BillingAccount;
  contact: Contact;
  callerPhoneNumber: string;
  tenantId: string;
  fallbackReason?: string;
};

export type RetellInboundRoutingPayload = {
  metadata: Record<string, unknown>;
  retell_llm_dynamic_variables: Record<string, string>;
};

export class RetellPayloadMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetellPayloadMappingError";
  }
}

export function buildRetellOutboundCollectionsCallPayload(
  input: RetellPayloadMapperInput
): RetellCreatePhoneCallRequest {
  if (!input.contact.phone) {
    throw new RetellPayloadMappingError("Retell call payload requires a contact phone number.");
  }

  if (!input.plan.safetyDecision.allowed) {
    throw new RetellPayloadMappingError(
      `Blocked Retell pre-call plan cannot create a sendable payload: ${input.plan.safetyDecision.blockedReasons.join(", ")}`
    );
  }

  const output = input.plan.preCallOutput;
  const context = buildRetellPayloadContext(input);
  const retellOverdue = buildRetellOverdueDynamicVariables(input.plan, input.account.currency);
  const metadata = {
    tenant_id: input.tenantId,
    tenant_slug: input.tenantId,
    communication_attempt_id: input.communicationAttempt.id,
    pre_call_plan_id: input.plan.id,
    soa_id: context.statementSnapshotId,
    statement_snapshot_id: context.statementSnapshotId,
    post_call_automation: "email_recap_and_soa",
    post_call_email_recap: true,
    post_call_send_soa: true,
    triggered_by: context.triggeredBy,
    campaign_id: context.campaignId,
    parent_account_id: input.account.parentAccountId,
    customer_id: context.customerId,
    billing_account_id: input.account.id,
    billing_account_number: input.account.accountNumber,
    contact_id: input.contact.id,
    contact_email: input.contact.email ?? "",
    current_handler_contact_id: output.current_handler_contact_id,
    routing_level: input.plan.routingContext.routingLevel,
    branch_id: input.plan.routingContext.branchId ?? null,
    branch_name: context.branchName,
    branch_ids: input.plan.routingContext.branchIds.join(","),
    invoice_ids: input.plan.eligibleInvoiceIds.join(","),
    excluded_invoice_ids: input.plan.excludedInvoiceIds.join(","),
    bucket_has_overdue: retellOverdue.hasOverdue,
    bucket_has_due_today: output.has_due_today,
    bucket_has_pre_due: output.has_pre_due,
    bucket_overdue_total_cents: output.overdue_without_promise_total,
    bucket_due_today_total_cents: output.due_today_total,
    bucket_pre_due_total_cents: output.pre_due_total,
    bucket_balance_total_cents: output.balance_total,
    bucket_overall_balance_total_cents: output.overall_balance_total,
    oldest_overdue_days: retellOverdue.oldestDays,
    date_bucket_has_overdue: output.has_overdue,
    date_bucket_overdue_total_cents: output.overdue_total,
    date_bucket_oldest_overdue_days: output.oldest_overdue_days,
    verified_contact_status: output.verified_contact_status,
    right_party_check_required: output.right_party_check_required,
    handler_verification_source: output.handler_verification_source,
    current_account_handler_role: output.current_account_handler_role,
    handler_handoff_possible: output.handler_handoff_possible,
    known_new_handler_name: output.known_new_handler_name,
    known_new_handler_phone: output.known_new_handler_phone,
    known_new_handler_email: output.known_new_handler_email,
    routing_update_recommended: output.routing_update_recommended,
    live_transfer_possible: output.live_transfer_possible,
    handoff_follow_up_required: output.handoff_follow_up_required,
    handler_handoff_blocked_reason: output.handler_handoff_blocked_reason,
    priority_groups: input.plan.priorityGroups.map((group) => group.name).join(","),
    call_priority_groups: input.plan.callPriorityGroups,
    call_objective: output.call_objective,
    call_priority_flags: output.call_priority_flags,
    has_broken_promises: output.has_broken_promises,
    has_active_future_promises: output.has_active_future_promises,
    has_overdue_without_promise: output.has_overdue_without_promise,
    overdue_without_promise_count: output.overdue_without_promise_count,
    overdue_without_promise_total_cents: output.overdue_without_promise_total,
    has_disputed_invoices: output.has_disputed_invoices,
    disputed_invoice_count: output.disputed_invoice_count,
    blocked_reason: output.blocked_reason
  };

  return {
    from_number: input.fromNumber,
    to_number: input.contact.phone,
    ...(input.overrideAgentId ? { override_agent_id: input.overrideAgentId } : {}),
    metadata,
    retell_llm_dynamic_variables: stringifyDynamicVariables({
      customer_name: input.account.displayName,
      contact_name: input.contact.fullName,
      contact_email: input.contact.email ?? "",
      company_name: context.companyName,
      currency: input.account.currency,
      billing_account_id: input.account.id,
      billing_account_name: input.account.displayName,
      billing_account_number: input.account.accountNumber,
      post_call_automation: "email_recap_and_soa",
      post_call_email_recap: true,
      post_call_send_soa: true,
      parent_account_id: input.account.parentAccountId,
      branch_id: input.plan.routingContext.branchId ?? "",
      branch_name: context.branchName,
      branch_ids: input.plan.routingContext.branchIds.join(", "),
      invoice_count: input.plan.eligibleInvoiceIds.length,
      invoice_numbers: input.plan.balanceInvoices
        .map((invoice) => invoice.invoiceNumber)
        .join(", "),
      verified_contact_status: output.verified_contact_status,
      current_account_handler_name: output.current_account_handler_name,
      current_account_handler_role: output.current_account_handler_role,
      handler_verification_source: output.handler_verification_source,
      right_party_check_required: output.right_party_check_required,
      handler_handoff_possible: output.handler_handoff_possible,
      current_contact_may_no_longer_be_handler: output.current_contact_may_no_longer_be_handler,
      known_new_handler_name: output.known_new_handler_name,
      known_new_handler_phone: output.known_new_handler_phone,
      known_new_handler_email: output.known_new_handler_email,
      known_new_handler_contact_id: output.known_new_handler_contact_id,
      routing_update_recommended: output.routing_update_recommended,
      live_transfer_possible: output.live_transfer_possible,
      handoff_follow_up_required: output.handoff_follow_up_required,
      handler_handoff_blocked_reason: output.handler_handoff_blocked_reason,
      contact_handoff_capture_fields: input.plan.handlerContext.handoffCaptureFields.join(", "),
      has_overdue: retellOverdue.hasOverdue,
      has_due_today: output.has_due_today,
      has_pre_due: output.has_pre_due,
      overdue_total: retellOverdue.total,
      due_today_total: formatMoney(output.due_today_total, input.account.currency),
      pre_due_total: formatMoney(output.pre_due_total, input.account.currency),
      balance_total: formatMoney(output.balance_total, input.account.currency),
      overall_balance_total: formatMoney(output.overall_balance_total, input.account.currency),
      oldest_overdue_days: retellOverdue.oldestDays,
      overdue_summary: retellOverdue.summary,
      has_date_overdue: output.has_overdue,
      date_overdue_total: formatMoney(output.overdue_total, input.account.currency),
      date_oldest_overdue_days: output.oldest_overdue_days,
      date_overdue_summary: output.overdue_summary,
      due_today_summary: output.due_today_summary,
      pre_due_summary: output.pre_due_summary,
      has_broken_promises: output.has_broken_promises,
      broken_promise_total: formatMoney(output.broken_promise_total, input.account.currency),
      broken_promise_count: output.broken_promise_count,
      broken_promise_summary: output.broken_promise_summary,
      has_overdue_without_promise: output.has_overdue_without_promise,
      overdue_without_promise_total: formatMoney(
        output.overdue_without_promise_total,
        input.account.currency
      ),
      overdue_without_promise_count: output.overdue_without_promise_count,
      overdue_without_promise_summary: output.overdue_without_promise_summary,
      has_due_today_without_promise: output.has_due_today_without_promise,
      due_today_without_promise_total: formatMoney(
        output.due_today_without_promise_total,
        input.account.currency
      ),
      due_today_without_promise_count: output.due_today_without_promise_count,
      due_today_without_promise_summary: output.due_today_without_promise_summary,
      has_pre_due_without_promise: output.has_pre_due_without_promise,
      pre_due_without_promise_total: formatMoney(
        output.pre_due_without_promise_total,
        input.account.currency
      ),
      pre_due_without_promise_count: output.pre_due_without_promise_count,
      pre_due_without_promise_summary: output.pre_due_without_promise_summary,
      has_active_future_promises: output.has_active_future_promises,
      active_future_promise_total: formatMoney(
        output.active_future_promise_total,
        input.account.currency
      ),
      active_future_promise_count: output.active_future_promise_count,
      active_future_promise_summary: output.active_future_promise_summary,
      earliest_active_promise_date: output.earliest_active_promise_date,
      has_disputed_invoices: output.has_disputed_invoices,
      disputed_invoice_total: formatMoney(output.disputed_invoice_total, input.account.currency),
      disputed_invoice_count: output.disputed_invoice_count,
      disputed_invoice_summary: output.disputed_invoice_summary,
      blocked_reason: output.blocked_reason,
      call_priority_groups_json: JSON.stringify(input.plan.callPriorityGroups),
      call_priority_plan: output.call_priority_plan,
      call_objective: output.call_objective,
      payment_methods: context.paymentMethods,
      human_transfer_number: context.humanTransferNumber,
      call_priority_flags: output.call_priority_flags,
      operator_summary: output.operator_summary,
      debug_summary: output.debug_summary,
      safe_goal: buildSafeGoal(input.plan, input.account),
      prohibited_topics:
        "Do not offer discounts, settlements, write-offs, or payment plans. Do not chase disputed invoices.",
      handoff_condition:
        "Before discussing invoice groups, ask whether invoice handling has moved to a different company contact. If so, capture the new handler and mark for safe follow-up before continuing.",
      post_call_outcome_schema: JSON.stringify(buildPostCallOutcomeSchema())
    })
  };
}

export function buildRetellInboundCollectionsRoutingPayload(
  input: RetellInboundRoutingPayloadInput
): RetellInboundRoutingPayload {
  const output = input.plan.preCallOutput;
  const metadataSources = [input.account.metadata, input.contact.metadata];
  const statementSnapshotId =
    readFirstString(metadataSources, [
      "soaId",
      "soa_id",
      "statementSnapshotId",
      "statement_snapshot_id",
      "statementId",
      "statement_id"
    ]) ?? "";
  const customerId =
    readFirstString(metadataSources, ["customerId", "customer_id"]) ??
    input.account.erpCustomerId ??
    input.account.parentAccountId;
  const branchName = readFirstString(metadataSources, ["branchName", "branch_name"]) ?? "";
  const companyName =
    readFirstString(metadataSources, ["companyName", "company_name", "customerName"]) ??
    input.account.displayName;
  const humanTransferNumber =
    readFirstString(metadataSources, [
      "humanTransferNumber",
      "human_transfer_number",
      "collectorPhone",
      "collectionsDeskPhone"
    ]) ?? "";
  const paymentMethods = readPaymentMethods(metadataSources);
  const routingStatus = input.fallbackReason ? "fallback" : "routed";
  const retellOverdue = buildRetellOverdueDynamicVariables(input.plan, input.account.currency);

  return {
    metadata: {
      tenant_id: input.tenantId,
      tenant_slug: input.tenantId,
      caller_phone_number: input.callerPhoneNumber,
      routing_status: routingStatus,
      fallback_reason: input.fallbackReason ?? "",
      blocked_reasons: input.plan.safetyDecision.blockedReasons,
      pre_call_plan_id: input.plan.id,
      soa_id: statementSnapshotId,
      statement_snapshot_id: statementSnapshotId,
      parent_account_id: input.account.parentAccountId,
      customer_id: customerId,
      billing_account_id: input.account.id,
      billing_account_number: input.account.accountNumber,
      contact_id: input.contact.id,
      current_handler_contact_id: output.current_handler_contact_id,
      verified_contact_status: output.verified_contact_status,
      handler_verification_source: output.handler_verification_source,
      routing_level: input.plan.routingContext.routingLevel,
      branch_id: input.plan.routingContext.branchId ?? null,
      branch_name: branchName,
      branch_ids: input.plan.routingContext.branchIds.join(","),
      call_objective: output.call_objective,
      call_priority_groups: input.plan.callPriorityGroups,
      call_priority_plan: output.call_priority_plan,
      has_broken_promises: output.has_broken_promises,
      has_active_future_promises: output.has_active_future_promises,
      has_overdue_without_promise: output.has_overdue_without_promise,
      has_disputed_invoices: output.has_disputed_invoices
    },
    retell_llm_dynamic_variables: stringifyDynamicVariables({
      inbound_call: true,
      routing_status: routingStatus,
      fallback_reason: input.fallbackReason ?? "",
      caller_phone_number: input.callerPhoneNumber,
      customer_name: input.account.displayName,
      contact_name: input.contact.fullName,
      company_name: companyName,
      currency: input.account.currency,
      balance_total: formatMoney(output.balance_total, input.account.currency),
      billing_account_id: input.account.id,
      billing_account_name: input.account.displayName,
      billing_account_number: input.account.accountNumber,
      parent_account_id: input.account.parentAccountId,
      branch_id: input.plan.routingContext.branchId ?? "",
      branch_name: branchName,
      branch_ids: input.plan.routingContext.branchIds.join(", "),
      verified_contact_status: output.verified_contact_status,
      handler_verification_source: output.handler_verification_source,
      current_account_handler_name: output.current_account_handler_name,
      current_account_handler_role: output.current_account_handler_role,
      current_handler_contact_id: output.current_handler_contact_id,
      right_party_check_required: output.right_party_check_required,
      handler_handoff_possible: output.handler_handoff_possible,
      current_contact_may_no_longer_be_handler: output.current_contact_may_no_longer_be_handler,
      known_new_handler_name: output.known_new_handler_name,
      known_new_handler_phone: output.known_new_handler_phone,
      known_new_handler_email: output.known_new_handler_email,
      routing_update_recommended: output.routing_update_recommended,
      live_transfer_possible: output.live_transfer_possible,
      handoff_follow_up_required: output.handoff_follow_up_required,
      handler_handoff_blocked_reason: output.handler_handoff_blocked_reason,
      has_overdue: retellOverdue.hasOverdue,
      overdue_total: retellOverdue.total,
      overdue_summary: retellOverdue.summary,
      oldest_overdue_days: retellOverdue.oldestDays,
      has_broken_promises: output.has_broken_promises,
      broken_promise_total: formatMoney(output.broken_promise_total, input.account.currency),
      broken_promise_count: output.broken_promise_count,
      broken_promise_summary: output.broken_promise_summary,
      has_overdue_without_promise: output.has_overdue_without_promise,
      overdue_without_promise_total: formatMoney(
        output.overdue_without_promise_total,
        input.account.currency
      ),
      overdue_without_promise_count: output.overdue_without_promise_count,
      overdue_without_promise_summary: output.overdue_without_promise_summary,
      has_due_today_without_promise: output.has_due_today_without_promise,
      due_today_without_promise_total: formatMoney(
        output.due_today_without_promise_total,
        input.account.currency
      ),
      due_today_without_promise_count: output.due_today_without_promise_count,
      due_today_without_promise_summary: output.due_today_without_promise_summary,
      has_pre_due_without_promise: output.has_pre_due_without_promise,
      pre_due_without_promise_total: formatMoney(
        output.pre_due_without_promise_total,
        input.account.currency
      ),
      pre_due_without_promise_count: output.pre_due_without_promise_count,
      pre_due_without_promise_summary: output.pre_due_without_promise_summary,
      has_active_future_promises: output.has_active_future_promises,
      active_future_promise_total: formatMoney(
        output.active_future_promise_total,
        input.account.currency
      ),
      active_future_promise_count: output.active_future_promise_count,
      active_future_promise_summary: output.active_future_promise_summary,
      earliest_active_promise_date: output.earliest_active_promise_date,
      has_disputed_invoices: output.has_disputed_invoices,
      disputed_invoice_count: output.disputed_invoice_count,
      disputed_invoice_summary: output.disputed_invoice_summary,
      call_priority_groups_json: JSON.stringify(input.plan.callPriorityGroups),
      call_priority_plan: output.call_priority_plan,
      call_objective: output.call_objective,
      call_priority_flags: output.call_priority_flags,
      payment_methods: paymentMethods,
      human_transfer_number: humanTransferNumber,
      safe_goal: input.fallbackReason
        ? "Route this inbound caller to a safer human review path before discussing invoice details."
        : buildSafeGoal(input.plan, input.account),
      prohibited_topics:
        "Do not offer discounts, settlements, write-offs, or payment plans. Do not chase disputed invoices.",
      handoff_condition:
        "Before discussing invoice groups, ask whether invoice handling has moved to a different company contact. If so, capture the new handler and mark for safe follow-up before continuing.",
      post_call_outcome_schema: JSON.stringify(buildPostCallOutcomeSchema())
    })
  };
}

function stringifyDynamicVariables(
  variables: Record<string, string | number | boolean>
): Record<string, string> {
  return Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, String(value)]));
}

function buildRetellOverdueDynamicVariables(
  plan: CollectionsVoicePreCallPlan,
  currency: string
): {
  hasOverdue: boolean;
  total: string;
  oldestDays: number;
  summary: string;
} {
  const withoutPromise = plan.overdueWithoutPromiseInvoices;

  return {
    // Retell legacy nodes treat "overdue" as the normal overdue branch. Keep
    // promise-managed invoices out so broken promises route to recovery first.
    hasOverdue: plan.preCallOutput.has_overdue_without_promise,
    total: formatMoney(plan.preCallOutput.overdue_without_promise_total, currency),
    oldestDays: withoutPromise.reduce(
      (max, invoice) => Math.max(max, invoice.daysPastDue ?? 0),
      0
    ),
    summary: plan.preCallOutput.overdue_without_promise_summary
  };
}

function buildRetellPayloadContext(input: RetellPayloadMapperInput): {
  branchName: string;
  campaignId: string;
  companyName: string;
  customerId: string;
  humanTransferNumber: string;
  paymentMethods: string;
  statementSnapshotId: string;
  triggeredBy: string;
} {
  const metadataSources = [
    input.communicationAttempt.metadata,
    input.account.metadata,
    input.contact.metadata
  ];
  const statementSnapshotId =
    readFirstString(metadataSources, [
      "soaId",
      "soa_id",
      "statementSnapshotId",
      "statement_snapshot_id",
      "statementId",
      "statement_id"
    ]) ?? "";
  const customerId =
    readFirstString(metadataSources, ["customerId", "customer_id"]) ??
    input.account.erpCustomerId ??
    input.account.parentAccountId;

  return {
    branchName: readFirstString(metadataSources, ["branchName", "branch_name"]) ?? "",
    campaignId: readFirstString(metadataSources, ["campaignId", "campaign_id"]) ?? "",
    companyName:
      readFirstString(metadataSources, ["companyName", "company_name", "customerName"]) ??
      input.account.displayName,
    customerId,
    humanTransferNumber:
      readFirstString(metadataSources, [
        "humanTransferNumber",
        "human_transfer_number",
        "collectorPhone",
        "collectionsDeskPhone"
      ]) ?? "",
    paymentMethods: readPaymentMethods(metadataSources),
    statementSnapshotId,
    triggeredBy:
      readFirstString(metadataSources, ["triggeredBy", "triggered_by"]) ??
      input.communicationAttempt.createdByActorId ??
      "system"
  };
}

function readPaymentMethods(records: Array<Record<string, unknown>>): string {
  for (const record of records) {
    const value =
      record.paymentMethods ??
      record.payment_methods ??
      record.availablePaymentMethods ??
      record.available_payment_methods;
    if (Array.isArray(value)) {
      const methods = value
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.trim());
      if (methods.length > 0) {
        return methods.join(", ");
      }
    }
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function readFirstString(
  records: Array<Record<string, unknown>>,
  keys: string[]
): string | undefined {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }

  return undefined;
}

function buildSafeGoal(plan: CollectionsVoicePreCallPlan, account: BillingAccount): string {
  if (plan.preCallOutput.has_broken_promises) {
    return `Resolve broken promise status for ${account.displayName}, then capture a safe next step or remittance evidence.`;
  }

  if (plan.preCallOutput.has_overdue_without_promise) {
    return `Confirm receipt of the statement of account for ${account.displayName}, ask for payment timing on overdue invoices, and request remittance advice when available.`;
  }

  if (plan.preCallOutput.has_due_today_without_promise) {
    return `Confirm receipt of invoices due today for ${account.displayName} and ask when payment or remittance advice should be expected.`;
  }

  if (plan.preCallOutput.has_active_future_promises) {
    return `Confirm active payment promise details for ${account.displayName}; avoid treating promised invoices as routine reminders.`;
  }

  return `Confirm receipt of upcoming invoices for ${account.displayName} and ask whether any supporting documents are needed.`;
}

function formatMoney(amountCents: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amountCents / 100)}`;
}

function buildPostCallOutcomeSchema(): Array<{
  field: string;
  description: string;
  required: boolean;
}> {
  return [
    {
      field: "contactHandoff",
      description:
        "Capture new invoice handler name, role, phone/email, reachability, and verification status.",
      required: false
    },
    {
      field: "routingChangeRequest",
      description:
        "Capture requested billing account, branch, contact, or invoice routing updates for review.",
      required: false
    },
    {
      field: "promiseUpdate",
      description: "Capture new, updated, kept, broken, or cancelled promise-to-pay details.",
      required: false
    },
    {
      field: "partialPaymentCommitment",
      description:
        "Capture a dated commitment for only part of the selected invoice or group balance, including how the remainder should be handled.",
      required: false
    },
    {
      field: "paymentPlanRequest",
      description:
        "Capture customer requests for installment or payment-plan review without negotiating terms in the voice call.",
      required: false
    },
    {
      field: "nonCommitment",
      description:
        "Capture that the customer could not commit to a promise date, plus any reason or callback preference.",
      required: false
    },
    {
      field: "paidAlreadyClaim",
      description:
        "Capture paid-already claims and remittance/payment references without marking invoices paid.",
      required: false
    },
    {
      field: "dispute",
      description:
        "Capture billing, service, delivery, or unknown disputes and stop automated chase.",
      required: false
    },
    {
      field: "callback",
      description: "Capture requested callback date/time and notes.",
      required: false
    },
    {
      field: "followUpActions",
      description: "Capture safe next-step actions when immediate resolution is not possible.",
      required: false
    }
  ];
}
