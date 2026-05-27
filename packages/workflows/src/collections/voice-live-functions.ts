import type {
  InvoiceFollowUpBucketLine,
  VoiceDisputeScope,
  VoicePostCallPersistencePlan,
  VoicePreCallPriorityGroup,
  VoicePreCallPriorityGroupName
} from "@o2c/contracts";
import {
  createPromiseToPayFromReply,
  decidePromiseToPayAcceptance,
  getCollectibleAmountCents,
  type BillingAccount,
  type CollectionReplyAnalysis,
  type Contact,
  type CustomerInvoice,
  type PromiseToPay
} from "@o2c/domain";
import {
  buildCollectionsVoicePreCallPlan,
  buildVoicePostCallPersistencePlan,
  type CollectionsVoicePreCallPlan
} from "./voice-pre-call.js";
import {
  classifyVoiceDisputeScope,
  decideVoiceDisputeContinuation,
  freezeVoiceDisputedScope
} from "./dispute-continuation.js";

export type RetellLiveFunctionStatus =
  | "ok"
  | "blocked"
  | "captured"
  | "queued"
  | "needs_follow_up";

export interface RetellLiveFunctionContext {
  account: BillingAccount;
  contact: Contact;
  invoices: CustomerInvoice[];
  promisesToPay?: PromiseToPay[];
  asOf: string;
  preDueWindowDays?: number;
  planId?: string;
  statementSnapshotId?: string;
  frozenInvoiceIds?: string[];
  frozenGroupNames?: VoicePreCallPriorityGroupName[];
}

export interface RetellLiveFunctionBaseInput extends RetellLiveFunctionContext {
  functionId: string;
  occurredAt: string;
  communicationAttemptId?: string;
  providerCallId?: string;
  preCallPlanId?: string;
}

export interface RetellLiveFunctionResponse {
  ok: boolean;
  status: RetellLiveFunctionStatus;
  message: string;
  blockedReason?: string;
  billingAccountId: string;
  branchId?: string;
  contactId: string;
  planId?: string;
  groupSummaries?: RetellLiveGroupSummary[];
  invoices?: RetellLiveInvoiceDetail[];
  promiseToPay?: PromiseToPay;
  persistencePlan?: VoicePostCallPersistencePlan;
  nextStep?: string;
  metadata?: Record<string, unknown>;
}

export interface RetellLiveGroupSummary {
  name: string;
  label: string;
  count: number;
  totalCents: number;
  summary: string;
  treatmentMode: string;
}

export interface RetellLiveInvoiceDetail {
  invoiceId: string;
  invoiceNumber: string;
  currency: string;
  amountCents: number;
  dueDate?: string;
  daysPastDue?: number;
  branchId?: string;
  promiseStatus?: string;
  promiseToPayId?: string;
  promiseDate?: string;
}

export function buildRetellLiveAccountSnapshot(
  input: RetellLiveFunctionBaseInput
): RetellLiveFunctionResponse {
  const plan = buildLivePlan(input);
  const groupSummaries = summarizeGroups(plan, input);
  const groupRoutingMetadata = buildGroupRoutingMetadata(groupSummaries);
  return withContext(input, {
    ok: plan.safetyDecision.allowed,
    status: plan.safetyDecision.allowed ? "ok" : "blocked",
    message: plan.safetyDecision.allowed
      ? `Account snapshot ready. ${plan.preCallOutput.call_priority_plan}`
      : `Use safe path: ${plan.safetyDecision.blockedReasons.join(", ")}.`,
    ...(plan.safetyDecision.blockedReasons[0]
      ? { blockedReason: plan.safetyDecision.blockedReasons[0] }
      : {}),
    planId: plan.id,
    groupSummaries,
    ...groupRoutingMetadata,
    metadata: {
      callObjective: plan.preCallOutput.call_objective,
      verifiedContactStatus: plan.preCallOutput.verified_contact_status,
      rightPartyCheckRequired: plan.preCallOutput.right_party_check_required,
      balanceTotalCents: plan.preCallOutput.balance_total,
      callPriorityPlan: plan.preCallOutput.call_priority_plan,
      ...groupRoutingMetadata
    }
  });
}

export function buildRetellLiveGroupInvoiceDetails(
  input: RetellLiveFunctionBaseInput & {
    groupName: VoicePreCallPriorityGroupName;
    invoiceIds?: string[];
  }
): RetellLiveFunctionResponse {
  const plan = buildLivePlan(input);
  const groupInvoices = getGroupInvoices(plan, input.groupName, input);
  const invoiceFilter = input.invoiceIds && input.invoiceIds.length > 0
    ? new Set(input.invoiceIds)
    : undefined;
  const invoices = groupInvoices
    .filter((invoice) => !invoiceFilter || invoiceFilter.has(invoice.invoiceId))
    .map(toInvoiceDetail);

  return withContext(input, {
    ok: true,
    status: "ok",
    message:
      invoices.length > 0
        ? `${invoices.length} invoice(s) found for ${input.groupName}.`
        : `No invoices found for ${input.groupName}.`,
    planId: plan.id,
    invoices,
    metadata: {
      groupName: input.groupName,
      callObjective: plan.preCallOutput.call_objective
    }
  });
}

export function buildRetellLiveCreatePromiseToPay(
  input: RetellLiveFunctionBaseInput & {
    id: string;
    invoiceIds: string[];
    promisedDate: string;
    promisedAmountCents?: number;
    currency?: string;
    notes?: string;
  }
): RetellLiveFunctionResponse {
  const frozenReason = validateNotFrozenForPaymentPressure(input, input.invoiceIds);
  if (frozenReason) {
    return blocked(
      input,
      frozenReason,
      "Promise capture is blocked for the disputed frozen scope. Use dispute follow-up."
    );
  }

  const selectedInvoices = selectInvoices(input, input.invoiceIds);
  const unsafeInvoice = selectedInvoices.find(isFullyDisputed);
  if (unsafeInvoice) {
    return blocked(input, "disputed_invoice", "I cannot record a chase promise for a disputed invoice.");
  }

  const analysis = buildPromiseAnalysis({
    invoices: selectedInvoices,
    promisedDate: input.promisedDate,
    promisedAmountCents: input.promisedAmountCents,
    currency: input.currency
  });
  const promiseToPay = createPromiseToPayFromReply({
    id: input.id,
    now: input.occurredAt,
    account: input.account,
    invoices: selectedInvoices,
    analysis,
    contact: input.contact
  });
  const acceptance = decidePromiseToPayAcceptance({
    account: input.account,
    contact: input.contact,
    promiseToPay
  });
  const acceptedPromise: PromiseToPay = {
    ...promiseToPay,
    state: acceptance.nextState,
    metadata: {
      ...promiseToPay.metadata,
      source: "retell_live_function",
      autoAccepted: acceptance.autoAccepted,
      acceptanceReasons: acceptance.reasons,
      notes: input.notes
    }
  };
  const persistencePlan = buildPromisePersistencePlan(input, {
    invoiceIds: input.invoiceIds,
    promiseToPayId: acceptedPromise.id,
    promisedDate: acceptedPromise.promiseDate,
    promisedAmountCents: acceptedPromise.promisedAmountCents,
    currency: acceptedPromise.currency,
    status: "new",
    notes: input.notes
  });

  return withContext(input, {
    ok: true,
    status: "captured",
    message: acceptance.autoAccepted
      ? `Promise captured for ${input.promisedDate}.`
      : `Promise captured for review before it is treated as confirmed.`,
    promiseToPay: acceptedPromise,
    persistencePlan,
    metadata: {
      autoAccepted: acceptance.autoAccepted,
      acceptanceReasons: acceptance.reasons
    }
  });
}

export function buildRetellLiveUpdatePromiseToPay(
  input: RetellLiveFunctionBaseInput & {
    promiseToPayId: string;
    invoiceIds: string[];
    status: "updated" | "kept" | "broken" | "cancelled";
    promisedDate?: string;
    promisedAmountCents?: number;
    currency?: string;
    notes?: string;
  }
): RetellLiveFunctionResponse {
  const frozenReason = validateNotFrozenForPaymentPressure(input, input.invoiceIds);
  if (frozenReason) {
    return blocked(
      input,
      frozenReason,
      "Promise update is blocked for the disputed frozen scope. Use dispute follow-up."
    );
  }

  const persistencePlan = buildPromisePersistencePlan(input, {
    invoiceIds: input.invoiceIds,
    promiseToPayId: input.promiseToPayId,
    status: input.status,
    ...(input.promisedDate ? { promisedDate: input.promisedDate } : {}),
    ...(input.promisedAmountCents !== undefined
      ? { promisedAmountCents: input.promisedAmountCents }
      : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.notes ? { notes: input.notes } : {})
  });

  return withContext(input, {
    ok: true,
    status: "captured",
    message:
      input.status === "broken"
        ? "Broken promise captured for recovery follow-up."
        : "Promise update captured.",
    persistencePlan
  });
}

export function buildRetellLivePartialPaymentCommitment(
  input: RetellLiveFunctionBaseInput & {
    invoiceIds: string[];
    promisedAmountCents: number;
    promisedDate?: string;
    currency?: string;
    currentGroupName?: VoicePreCallPriorityGroupName;
    remainderDisposition?:
      | "uncommitted"
      | "customer_requested_payment_plan"
      | "customer_disputed_remainder"
      | "follow_up_required";
    notes?: string;
  }
): RetellLiveFunctionResponse {
  const frozenReason = validateNotFrozenForPaymentPressure(input, input.invoiceIds);
  if (frozenReason) {
    return blocked(
      input,
      frozenReason,
      "Partial payment capture is blocked for the disputed frozen scope. Use dispute follow-up."
    );
  }

  const selectedInvoices = selectInvoices(input, input.invoiceIds);
  const unsafeInvoice = selectedInvoices.find(isFullyDisputed);
  if (unsafeInvoice) {
    return blocked(
      input,
      "disputed_invoice",
      "I cannot record a partial payment commitment for a disputed invoice."
    );
  }

  const invoiceBalanceCents = sumInvoiceBalance(selectedInvoices);
  if (input.promisedAmountCents <= 0) {
    return blocked(input, "invalid_partial_payment_amount", "Capture a positive partial payment amount.");
  }
  if (input.promisedAmountCents >= invoiceBalanceCents) {
    return blocked(
      input,
      "partial_payment_not_less_than_balance",
      "Use the standard promise capture when the customer is committing to the full selected balance."
    );
  }

  const persistencePlan = buildVoicePostCallPersistencePlan({
    ...basePersistenceInput(input, "partial_payment_commitment"),
    promiseUpdate: {
      invoiceIds: input.invoiceIds,
      ...(input.promisedDate ? { promisedDate: input.promisedDate } : {}),
      promisedAmountCents: input.promisedAmountCents,
      ...(input.currency ? { currency: input.currency } : {}),
      status: "new",
      ...(input.notes ? { notes: input.notes } : {})
    },
    partialPaymentCommitment: {
      invoiceIds: input.invoiceIds,
      promisedAmountCents: input.promisedAmountCents,
      ...(input.promisedDate ? { promisedDate: input.promisedDate } : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      ...(input.currentGroupName ? { groupName: input.currentGroupName } : {}),
      ...(input.remainderDisposition
        ? { remainderDisposition: input.remainderDisposition }
        : {}),
      ...(input.notes ? { notes: input.notes } : {})
    }
  });

  return withContext(input, {
    ok: true,
    status: "captured",
    message: "Partial payment commitment captured for review and residual follow-up.",
    persistencePlan,
    metadata: {
      promisedAmountCents: input.promisedAmountCents,
      selectedBalanceCents: invoiceBalanceCents,
      remainingBalanceCents: invoiceBalanceCents - input.promisedAmountCents,
      remainderDisposition: input.remainderDisposition ?? "follow_up_required",
      currentGroupName: input.currentGroupName ?? ""
    }
  });
}

export function buildRetellLivePaymentPlanRequest(
  input: RetellLiveFunctionBaseInput & {
    invoiceIds: string[];
    summary: string;
    requestedInstallmentCount?: number;
    requestedAmountCents?: number;
    currency?: string;
    requestedCadence?: "weekly" | "biweekly" | "monthly" | "custom";
    requestedFirstPaymentDate?: string;
    currentGroupName?: VoicePreCallPriorityGroupName;
    notes?: string;
  }
): RetellLiveFunctionResponse {
  const persistencePlan = buildVoicePostCallPersistencePlan({
    ...basePersistenceInput(input, "payment_plan_request"),
    paymentPlanRequest: {
      invoiceIds: input.invoiceIds,
      summary: input.summary,
      ...(input.requestedInstallmentCount !== undefined
        ? { requestedInstallmentCount: input.requestedInstallmentCount }
        : {}),
      ...(input.requestedAmountCents !== undefined
        ? { requestedAmountCents: input.requestedAmountCents }
        : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      ...(input.requestedCadence ? { requestedCadence: input.requestedCadence } : {}),
      ...(input.requestedFirstPaymentDate
        ? { requestedFirstPaymentDate: input.requestedFirstPaymentDate }
        : {}),
      ...(input.currentGroupName ? { groupName: input.currentGroupName } : {}),
      ...(input.notes ? { notes: input.notes } : {})
    }
  });

  return withContext(input, {
    ok: true,
    status: "needs_follow_up",
    message: "Payment plan request captured for human review. Do not negotiate terms automatically.",
    persistencePlan,
    nextStep: "Pause negotiation and route the payment plan request for approval review."
  });
}

export function buildRetellLiveNonCommitment(
  input: RetellLiveFunctionBaseInput & {
    invoiceIds: string[];
    currentGroupName?: VoicePreCallPriorityGroupName;
    reason?: string;
    callbackRequested?: boolean;
    dueAt?: string;
    timezone?: string;
    notes?: string;
  }
): RetellLiveFunctionResponse {
  const persistencePlan = buildVoicePostCallPersistencePlan({
    ...basePersistenceInput(input, "non_commitment"),
    nonCommitment: {
      invoiceIds: input.invoiceIds,
      ...(input.currentGroupName ? { groupName: input.currentGroupName } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.callbackRequested !== undefined
        ? { callbackRequested: input.callbackRequested }
        : {}),
      ...(input.notes ? { notes: input.notes } : {})
    },
    ...(input.callbackRequested
      ? {
          callback: {
            ...(input.dueAt ? { dueAt: input.dueAt } : {}),
            ...(input.timezone ? { timezone: input.timezone } : {}),
            ...(input.notes ? { notes: input.notes } : {})
          }
        }
      : {})
  });

  return withContext(input, {
    ok: true,
    status: "captured",
    message: "Non-commitment captured for follow-up tracking.",
    persistencePlan,
    nextStep: input.callbackRequested
      ? "Honor the callback path and avoid treating the account as newly promised."
      : "Record the non-commitment and continue with safe follow-up planning."
  });
}

export function buildRetellLivePaidAlreadyClaim(
  input: RetellLiveFunctionBaseInput & {
    invoiceIds: string[];
    amountCents?: number;
    currency?: string;
    paidAt?: string;
    reference?: string;
    remittanceExpected?: boolean;
    notes?: string;
  }
): RetellLiveFunctionResponse {
  const persistencePlan = buildVoicePostCallPersistencePlan({
    ...basePersistenceInput(input, "paid_already_claim"),
    paidAlreadyClaim: {
      invoiceIds: input.invoiceIds,
      ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      ...(input.paidAt ? { paidAt: input.paidAt } : {}),
      ...(input.reference ? { reference: input.reference } : {}),
      ...(input.remittanceExpected !== undefined
        ? { remittanceExpected: input.remittanceExpected }
        : {}),
      ...(input.notes ? { notes: input.notes } : {})
    }
  });
  return withContext(input, {
    ok: true,
    status: "captured",
    message: "Paid-already claim captured for cash application review.",
    persistencePlan
  });
}

export function buildRetellLiveDisputeCapture(
  input: RetellLiveFunctionBaseInput & {
    invoiceIds: string[];
    disputeType: "billing" | "service" | "delivery" | "unknown";
    summary: string;
    amountCents?: number;
    currency?: string;
    disputeScope?: VoiceDisputeScope;
    currentGroupName?: VoicePreCallPriorityGroupName;
    currentGroupInvoiceIds?: string[];
    disputeReason?: string;
    notes?: string;
  }
): RetellLiveFunctionResponse {
  const plan = buildLivePlan(input);
  const currentGroup = resolveCurrentGroup({
    plan,
    currentGroupName: input.currentGroupName,
    currentGroupInvoiceIds: input.currentGroupInvoiceIds,
    disputedInvoiceIds: input.invoiceIds
  });
  const disputeScope = classifyVoiceDisputeScope({
    explicitScope: input.disputeScope,
    summary: input.summary,
    notes: input.notes,
    disputedInvoiceIds: input.invoiceIds,
    currentGroupInvoiceIds: input.currentGroupInvoiceIds ?? currentGroup?.invoiceIds
  });
  const remainingGroups = buildRemainingGroups({
    groups: plan.callPriorityGroups,
    currentGroup
  });
  const continuationDecision = decideVoiceDisputeContinuation({
    disputeScope,
    disputedInvoiceIds: input.invoiceIds,
    ...(currentGroup ? { currentGroup } : {}),
    remainingGroups,
    handlerContext: plan.handlerContext
  });
  const persistencePlan = buildVoicePostCallPersistencePlan({
    ...basePersistenceInput(input, "dispute"),
    dispute: {
      invoiceIds: input.invoiceIds,
      disputeType: input.disputeType,
      summary: input.disputeReason ?? input.summary,
      ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      disputeScope,
      ...(currentGroup ? { groupName: currentGroup.name } : {}),
      frozenScopeSummary: continuationDecision.frozenScope.summary,
      nextActionAfterDispute: continuationDecision.nextAction,
      continuationReason: continuationDecision.continuationReason
    },
    followUpActions: [
      {
        title:
          continuationDecision.nextAction === "switch_to_handler_handoff"
            ? "Switch dispute call to handler handoff"
            : continuationDecision.shouldContinueCall
              ? "Continue with separate undisputed groups"
              : "Escalate disputed call path",
        description: continuationDecision.continuationReason,
        requiresHumanReview: !continuationDecision.shouldContinueCall,
        metadata: {
          disputeScope,
          frozenScope: continuationDecision.frozenScope,
          nextActionAfterDispute: continuationDecision.nextAction,
          safeRemainingGroups: continuationDecision.safeRemainingGroups.map((group) => group.name)
        }
      }
    ]
  });
  return withContext(input, {
    ok: true,
    status: "captured",
    message: buildDisputeCaptureMessage(continuationDecision),
    persistencePlan,
    nextStep: buildDisputeNextStep(continuationDecision),
    groupSummaries: continuationDecision.safeRemainingGroups.map(toGroupSummary),
    metadata: {
      dispute_scope: disputeScope,
      disputeScope,
      group_context: currentGroup?.name ?? "",
      groupContext: currentGroup?.name ?? "",
      invoice_scope: input.invoiceIds,
      invoiceScope: input.invoiceIds,
      dispute_reason: input.disputeReason ?? input.summary,
      disputeReason: input.disputeReason ?? input.summary,
      notes: input.notes ?? "",
      can_continue_after_dispute: continuationDecision.shouldContinueCall,
      canContinueAfterDispute: continuationDecision.shouldContinueCall,
      frozen_scope_summary: continuationDecision.frozenScope.summary,
      frozenScopeSummary: continuationDecision.frozenScope.summary,
      frozen_invoice_ids: continuationDecision.frozenScope.invoiceIds,
      frozenInvoiceIds: continuationDecision.frozenScope.invoiceIds,
      frozen_group_names: continuationDecision.frozenScope.groupNames,
      frozenGroupNames: continuationDecision.frozenScope.groupNames,
      safe_remaining_groups_exist: continuationDecision.safeRemainingGroupsExist,
      safeRemainingGroupsExist: continuationDecision.safeRemainingGroupsExist,
      next_action_after_dispute: continuationDecision.nextAction,
      nextActionAfterDispute: continuationDecision.nextAction,
      continuation_reason: continuationDecision.continuationReason,
      continuationReason: continuationDecision.continuationReason,
      safe_remaining_groups: continuationDecision.safeRemainingGroups.map((group) => group.name),
      safeRemainingGroups: continuationDecision.safeRemainingGroups.map((group) => group.name)
    }
  });
}

export function buildRetellLiveCallbackRequest(
  input: RetellLiveFunctionBaseInput & {
    requestedAt?: string;
    dueAt?: string;
    timezone?: string;
    notes?: string;
  }
): RetellLiveFunctionResponse {
  const persistencePlan = buildVoicePostCallPersistencePlan({
    ...basePersistenceInput(input, "callback_requested"),
    callback: {
      ...(input.requestedAt ? { requestedAt: input.requestedAt } : {}),
      ...(input.dueAt ? { dueAt: input.dueAt } : {}),
      ...(input.timezone ? { timezone: input.timezone } : {}),
      ...(input.notes ? { notes: input.notes } : {})
    }
  });
  return withContext(input, {
    ok: true,
    status: "captured",
    message: "Callback request captured.",
    persistencePlan
  });
}

export function buildRetellLiveHandlerHandoff(
  input: RetellLiveFunctionBaseInput & {
    newHandlerName?: string;
    newHandlerEmail?: string;
    newHandlerPhone?: string;
    newHandlerRole?: string;
    newHandlerReachable?: boolean;
    routingShouldUpdate?: boolean;
    requestedRoutingLevel?: "parent_account" | "billing_account" | "branch" | "invoice";
    requestedBranchId?: string;
    notes?: string;
  }
): RetellLiveFunctionResponse {
  if (!input.newHandlerName) {
    return blocked(input, "new_handler_missing", "Capture the new AP or finance handler name first.");
  }

  const persistencePlan = buildVoicePostCallPersistencePlan({
    ...basePersistenceInput(input, "handler_handoff"),
    contactHandoff: {
      currentContactId: input.contact.id,
      newHandlerName: input.newHandlerName,
      ...(input.newHandlerEmail ? { newHandlerEmail: input.newHandlerEmail } : {}),
      ...(input.newHandlerPhone ? { newHandlerPhone: input.newHandlerPhone } : {}),
      ...(input.newHandlerRole ? { newHandlerRole: input.newHandlerRole } : {}),
      ...(input.newHandlerReachable !== undefined
        ? { newHandlerReachable: input.newHandlerReachable }
        : {}),
      verificationStatus: "unverified",
      ...(input.notes ? { notes: input.notes } : {})
    },
    ...(input.routingShouldUpdate
      ? {
          routingChangeRequest: {
            reason: input.notes ?? "Customer reported a handler handoff during a Retell call.",
            ...(input.requestedRoutingLevel
              ? { requestedRoutingLevel: input.requestedRoutingLevel }
              : {}),
            requestedBillingAccountId: input.account.id,
            ...(input.requestedBranchId ? { requestedBranchId: input.requestedBranchId } : {})
          }
        }
      : {})
  });

  return withContext(input, {
    ok: true,
    status: input.newHandlerReachable === false ? "needs_follow_up" : "captured",
    message:
      "Handler handoff captured. Do not treat the new handler as verified until an operator confirms routing.",
    persistencePlan,
    nextStep:
      input.newHandlerReachable === false
        ? "Create safe follow-up for the new handler."
        : "Continue only after the live flow confirms the current caller is authorized."
  });
}

export function buildRetellLiveSendInvoiceCopyDecision(
  input: RetellLiveFunctionBaseInput & {
    invoiceIds: string[];
    deliveryChannel?: "email" | "sms";
    destination?: string;
  }
): RetellLiveFunctionResponse {
  const safety = validateAutoSendTarget(input, input.invoiceIds);
  if (safety) {
    return blocked(input, safety, "Invoice copy was not auto-sent. Use safe follow-up.");
  }

  return withContext(input, {
    ok: true,
    status: "queued",
    message: "Invoice copy send request is safe to queue for the verified contact.",
    metadata: {
      invoiceIds: input.invoiceIds,
      deliveryChannel: input.deliveryChannel ?? "email",
      destination: input.destination ?? input.contact.email ?? input.contact.phone ?? "",
      automationAction: "send_invoice_copy"
    }
  });
}

export function buildRetellLiveSendStatementOfAccountDecision(
  input: RetellLiveFunctionBaseInput & {
    deliveryChannel?: "email";
    destination?: string;
    notes?: string;
  }
): RetellLiveFunctionResponse {
  if (!input.contact.isVerified || !input.contact.allowAutoSend) {
    return blocked(input, "unverified_contact", "Statement of account was not auto-sent. Use safe follow-up.");
  }

  const destination = input.destination ?? input.contact.email ?? "";
  if (!destination) {
    return blocked(
      input,
      "missing_contact_destination",
      "Statement of account was not auto-sent because no verified email destination is available."
    );
  }

  return withContext(input, {
    ok: true,
    status: "queued",
    message: "Statement of account send request is safe to queue for the verified contact.",
    metadata: {
      deliveryChannel: "email",
      destination,
      statementSnapshotId: input.statementSnapshotId ?? "",
      automationAction: "send_statement_of_account",
      ...(input.notes ? { notes: input.notes } : {})
    }
  });
}

export function buildRetellLiveSendPaymentLinkDecision(
  input: RetellLiveFunctionBaseInput & {
    invoiceIds: string[];
    amountCents?: number;
    deliveryChannel?: "email" | "sms";
    destination?: string;
  }
): RetellLiveFunctionResponse {
  const frozenReason = validateNotFrozenForPaymentPressure(input, input.invoiceIds);
  if (frozenReason) {
    return blocked(
      input,
      frozenReason,
      "Payment link was not auto-sent because the selected scope is disputed and frozen."
    );
  }

  const safety = validateAutoSendTarget(input, input.invoiceIds);
  if (safety) {
    return blocked(input, safety, "Payment link was not auto-sent. Use safe follow-up.");
  }

  return withContext(input, {
    ok: true,
    status: "queued",
    message: "Payment link send request is safe to queue for the verified contact.",
    metadata: {
      invoiceIds: input.invoiceIds,
      amountCents: input.amountCents ?? sumInvoiceBalance(selectInvoices(input, input.invoiceIds)),
      deliveryChannel: input.deliveryChannel ?? "email",
      destination: input.destination ?? input.contact.email ?? input.contact.phone ?? "",
      automationAction: "send_payment_link"
    }
  });
}

function buildLivePlan(input: RetellLiveFunctionContext): CollectionsVoicePreCallPlan {
  return buildCollectionsVoicePreCallPlan({
    planId: input.planId,
    account: input.account,
    contact: input.contact,
    invoices: input.invoices,
    promisesToPay: input.promisesToPay ?? [],
    asOf: input.asOf,
    ...(input.preDueWindowDays !== undefined ? { preDueWindowDays: input.preDueWindowDays } : {})
  });
}

function summarizeGroups(
  plan: CollectionsVoicePreCallPlan,
  context?: RetellLiveFunctionContext
): RetellLiveGroupSummary[] {
  const groups =
    context && hasFrozenScope(context)
      ? freezeVoiceDisputedScope(plan.callPriorityGroups, frozenScopeFromContext(context))
      : plan.callPriorityGroups;

  return groups.map(toGroupSummary);
}

function getGroupInvoices(
  plan: CollectionsVoicePreCallPlan,
  groupName: VoicePreCallPriorityGroupName,
  context?: RetellLiveFunctionContext
): InvoiceFollowUpBucketLine[] {
  if (context?.frozenGroupNames?.includes(groupName)) {
    return [];
  }

  const invoiceIds = new Set(context?.frozenInvoiceIds ?? []);
  const filterFrozen = (invoices: InvoiceFollowUpBucketLine[]) =>
    invoices.filter((invoice) => !invoiceIds.has(invoice.invoiceId));

  switch (groupName) {
    case "broken_promises":
      return filterFrozen(plan.brokenPromiseInvoices);
    case "overdue_without_promise":
      return filterFrozen(plan.overdueWithoutPromiseInvoices);
    case "due_today_without_promise":
      return filterFrozen(plan.dueTodayWithoutPromiseInvoices);
    case "pre_due_without_promise":
      return filterFrozen(plan.preDueWithoutPromiseInvoices);
    case "active_future_promises":
      return filterFrozen(plan.activeFuturePromiseInvoices);
    case "routine_reminders":
      return filterFrozen(plan.routineReminderInvoices);
  }
}

function toGroupSummary(group: VoicePreCallPriorityGroup): RetellLiveGroupSummary {
  return {
    name: group.name,
    label: group.label,
    count: group.count,
    totalCents: group.totalCents,
    summary: group.summary,
    treatmentMode: group.treatmentMode
  };
}

function buildGroupRoutingMetadata(groups: RetellLiveGroupSummary[]): Record<string, unknown> {
  const byName = new Map(groups.map((group) => [group.name, group]));
  const primaryGroup = groups[0];
  const brokenPromises = byName.get("broken_promises");
  const overdueWithoutPromise = byName.get("overdue_without_promise");
  const dueTodayWithoutPromise = byName.get("due_today_without_promise");
  const preDueWithoutPromise = byName.get("pre_due_without_promise");
  const activeFuturePromises = byName.get("active_future_promises");
  const routineReminders = byName.get("routine_reminders");

  return {
    primaryGroupName: primaryGroup?.name ?? "",
    primaryGroupTreatmentMode: primaryGroup?.treatmentMode ?? "",
    primaryGroupCount: primaryGroup?.count ?? 0,
    primaryGroupTotalCents: primaryGroup?.totalCents ?? 0,
    primaryGroupSummary: primaryGroup?.summary ?? "None",

    ...groupRoutingFields("brokenPromises", "broken_promises", brokenPromises),
    ...groupRoutingFields("overdueWithoutPromise", "overdue_without_promise", overdueWithoutPromise),
    ...groupRoutingFields("dueTodayWithoutPromise", "due_today_without_promise", dueTodayWithoutPromise),
    ...groupRoutingFields("preDueWithoutPromise", "pre_due_without_promise", preDueWithoutPromise),
    ...groupRoutingFields("activeFuturePromises", "active_future_promises", activeFuturePromises),
    ...activeFuturePromiseAliases(activeFuturePromises),
    ...groupRoutingFields("routineReminders", "routine_reminders", routineReminders)
  };
}

function groupRoutingFields(
  camelName: string,
  snakeName: VoicePreCallPriorityGroupName,
  group?: RetellLiveGroupSummary
): Record<string, unknown> {
  const count = group?.count ?? 0;
  const totalCents = group?.totalCents ?? 0;
  const summary = group?.summary ?? "None";
  const hasGroup = count > 0;

  return {
    [`has${capitalize(camelName)}`]: hasGroup,
    [`${camelName}Count`]: count,
    [`${camelName}TotalCents`]: totalCents,
    [`${camelName}Summary`]: summary,
    [`has_${snakeName}`]: hasGroup,
    [`${snakeName}_count`]: count,
    [`${snakeName}_total_cents`]: totalCents,
    [`${snakeName}_summary`]: summary
  };
}

function capitalize(value: string): string {
  return value.length > 0 ? `${value[0]?.toUpperCase()}${value.slice(1)}` : value;
}

function activeFuturePromiseAliases(group?: RetellLiveGroupSummary): Record<string, unknown> {
  const count = group?.count ?? 0;
  const totalCents = group?.totalCents ?? 0;
  const summary = group?.summary ?? "None";

  return {
    activeFuturePromiseCount: count,
    activeFuturePromiseTotalCents: totalCents,
    activeFuturePromiseSummary: summary,
    active_future_promise_count: count,
    active_future_promise_total_cents: totalCents,
    active_future_promise_summary: summary
  };
}

function toInvoiceDetail(line: InvoiceFollowUpBucketLine): RetellLiveInvoiceDetail {
  return {
    invoiceId: line.invoiceId,
    invoiceNumber: line.invoiceNumber,
    currency: line.currency,
    amountCents: line.amountCents,
    ...(line.dueDate ? { dueDate: line.dueDate } : {}),
    ...(line.daysPastDue !== undefined ? { daysPastDue: line.daysPastDue } : {}),
    ...(line.branchId ? { branchId: line.branchId } : {}),
    promiseStatus: line.promiseStatus,
    ...(line.promiseToPayId ? { promiseToPayId: line.promiseToPayId } : {}),
    ...(line.promiseDate ? { promiseDate: line.promiseDate } : {})
  };
}

function selectInvoices(input: RetellLiveFunctionContext, invoiceIds: string[]): CustomerInvoice[] {
  const selected = input.invoices.filter((invoice) => invoiceIds.includes(invoice.id));
  return selected.length > 0 ? selected : input.invoices;
}

function resolveCurrentGroup(input: {
  plan: CollectionsVoicePreCallPlan;
  currentGroupName?: VoicePreCallPriorityGroupName;
  currentGroupInvoiceIds?: string[];
  disputedInvoiceIds: string[];
}): VoicePreCallPriorityGroup | undefined {
  if (input.currentGroupName) {
    return input.plan.callPriorityGroups.find((group) => group.name === input.currentGroupName);
  }

  const currentGroupInvoiceIds = new Set(input.currentGroupInvoiceIds ?? []);
  if (currentGroupInvoiceIds.size > 0) {
    return input.plan.callPriorityGroups.find((group) =>
      group.invoiceIds.some((invoiceId) => currentGroupInvoiceIds.has(invoiceId))
    );
  }

  const disputedInvoiceIds = new Set(input.disputedInvoiceIds);
  return input.plan.callPriorityGroups.find((group) =>
    group.invoiceIds.some((invoiceId) => disputedInvoiceIds.has(invoiceId))
  );
}

function buildRemainingGroups(input: {
  groups: VoicePreCallPriorityGroup[];
  currentGroup?: VoicePreCallPriorityGroup;
}): VoicePreCallPriorityGroup[] {
  if (!input.currentGroup) {
    return input.groups;
  }
  return input.groups.filter((group) => group.rank > input.currentGroup!.rank);
}

function buildDisputeCaptureMessage(
  decision: ReturnType<typeof decideVoiceDisputeContinuation>
): string {
  if (decision.nextAction === "switch_to_handler_handoff") {
    return "Dispute captured as a handler or routing issue. Switch to handoff flow before any invoice handling.";
  }
  if (decision.shouldContinueCall) {
    return "Dispute captured and frozen. It is safe to continue only with clearly separate undisputed groups.";
  }
  return "Dispute captured. Stop the collections sequence and route to human follow-up.";
}

function buildDisputeNextStep(
  decision: ReturnType<typeof decideVoiceDisputeContinuation>
): string {
  if (decision.nextAction === "switch_to_handler_handoff") {
    return "Switch to handler handoff flow. Do not continue invoice group handling.";
  }
  if (decision.shouldContinueCall) {
    return `Continue with remaining groups: ${decision.safeRemainingGroups
      .map((group) => group.name)
      .join(", ")}. Do not discuss the frozen scope.`;
  }
  return "Stop automated collections handling and route the disputed scope to human review.";
}

function hasFrozenScope(input: RetellLiveFunctionContext): boolean {
  return Boolean(input.frozenInvoiceIds?.length || input.frozenGroupNames?.length);
}

function frozenScopeFromContext(input: RetellLiveFunctionContext) {
  return {
    scope: "invoice_subset" as const,
    invoiceIds: input.frozenInvoiceIds ?? [],
    groupNames: input.frozenGroupNames ?? [],
    summary: "Frozen scope carried from earlier dispute in this call."
  };
}

function validateNotFrozenForPaymentPressure(
  input: RetellLiveFunctionContext,
  invoiceIds: string[]
): string | undefined {
  const frozenInvoiceIds = new Set(input.frozenInvoiceIds ?? []);
  if (invoiceIds.some((invoiceId) => frozenInvoiceIds.has(invoiceId))) {
    return "frozen_disputed_scope";
  }

  if (!input.frozenGroupNames?.length) {
    return undefined;
  }

  const plan = buildLivePlan(input);
  const selectedInvoiceIds = new Set(invoiceIds);
  const touchesFrozenGroup = input.frozenGroupNames.some((groupName) =>
    getGroupInvoices(plan, groupName).some((invoice) => selectedInvoiceIds.has(invoice.invoiceId))
  );
  return touchesFrozenGroup ? "frozen_disputed_scope" : undefined;
}

function buildPromiseAnalysis(input: {
  invoices: CustomerInvoice[];
  promisedDate: string;
  promisedAmountCents?: number;
  currency?: string;
}): CollectionReplyAnalysis {
  return {
    classification: "promise_to_pay",
    confidence: 1,
    requiresHumanReview: false,
    reasons: ["retell_live_function"],
    extractedPromiseDate: input.promisedDate,
    ...(input.promisedAmountCents !== undefined
      ? { extractedAmountCents: input.promisedAmountCents }
      : {}),
    invoices: input.invoices.map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      matchedBy: "provided_context"
    })),
    requestedDocumentTypes: [],
    ptp: {
      promiseDate: input.promisedDate,
      ...(input.promisedAmountCents !== undefined
        ? { promisedAmountCents: input.promisedAmountCents }
        : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      confidence: 1,
      riskFlags: []
    }
  };
}

function buildPromisePersistencePlan(
  input: RetellLiveFunctionBaseInput,
  promiseUpdate: NonNullable<Parameters<typeof buildVoicePostCallPersistencePlan>[0]["promiseUpdate"]>
): VoicePostCallPersistencePlan {
  return buildVoicePostCallPersistencePlan({
    ...basePersistenceInput(input, "promise_update"),
    promiseUpdate
  });
}

function basePersistenceInput(input: RetellLiveFunctionBaseInput, disposition: string) {
  return {
    id: input.functionId,
    billingAccountId: input.account.id,
    parentAccountId: input.account.parentAccountId,
    ...(input.account.branchId || input.contact.branchId
      ? { branchId: input.account.branchId ?? input.contact.branchId }
      : {}),
    contactId: input.contact.id,
    communicationAttemptId: input.communicationAttemptId ?? input.functionId,
    ...(input.providerCallId ? { providerCallId: input.providerCallId } : {}),
    ...(input.preCallPlanId ? { preCallPlanId: input.preCallPlanId } : {}),
    occurredAt: input.occurredAt,
    disposition
  };
}

function validateAutoSendTarget(
  input: RetellLiveFunctionContext,
  invoiceIds: string[]
): string | undefined {
  if (!input.contact.isVerified || !input.contact.allowAutoSend) {
    return "unverified_contact";
  }
  if (!input.contact.email && !input.contact.phone) {
    return "missing_contact_destination";
  }
  const selectedInvoices = selectInvoices(input, invoiceIds);
  if (selectedInvoices.some(isFullyDisputed)) {
    return "disputed_invoice";
  }
  return undefined;
}

function isFullyDisputed(invoice: CustomerInvoice): boolean {
  return invoice.state === "disputed_full" || getCollectibleAmountCents(invoice) <= 0;
}

function sumInvoiceBalance(invoices: CustomerInvoice[]): number {
  return invoices.reduce((sum, invoice) => sum + Math.max(getCollectibleAmountCents(invoice), 0), 0);
}

function blocked(
  input: RetellLiveFunctionContext,
  blockedReason: string,
  message: string
): RetellLiveFunctionResponse {
  return withContext(input, {
    ok: false,
    status: "blocked",
    message,
    blockedReason
  });
}

function withContext(
  input: RetellLiveFunctionContext,
  response: Omit<RetellLiveFunctionResponse, "billingAccountId" | "contactId" | "branchId">
): RetellLiveFunctionResponse {
  return {
    ...response,
    billingAccountId: input.account.id,
    ...(input.account.branchId ?? input.contact.branchId
      ? { branchId: input.account.branchId ?? input.contact.branchId }
      : {}),
    contactId: input.contact.id
  };
}
