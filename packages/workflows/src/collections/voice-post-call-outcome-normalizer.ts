import type {
  VoicePostCallCallbackRequest,
  VoicePostCallContactHandoff,
  VoicePostCallDisputeCapture,
  VoicePostCallFollowUpAction,
  VoicePostCallNonCommitment,
  VoicePostCallPaidAlreadyClaim,
  VoicePostCallPartialPaymentCommitment,
  VoicePostCallPaymentPlanRequest,
  VoicePostCallPromiseUpdate,
  VoicePostCallRoutingChangeRequest
} from "./voice-pre-call.js";

export type NormalizedVoicePostCallOutcomeKind =
  | "promise_to_pay"
  | "partial_payment_commitment"
  | "payment_plan_request"
  | "non_commitment"
  | "paid_already"
  | "dispute"
  | "callback_requested"
  | "handler_handoff"
  | "routing_change"
  | "support_request"
  | "information_only"
  | "mixed";

export interface NormalizeVoicePostCallOutcomeInput {
  invoiceIds: string[];
  defaultCurrency?: string;
  occurredAt: string;
  disposition?: string;
  transcriptSummary?: string;
  transcriptText?: string;
  analysis?: Record<string, unknown>;
  extractedVariables?: Record<string, unknown>;
}

export interface NormalizedVoicePostCallOutcome {
  outcome: NormalizedVoicePostCallOutcomeKind;
  disposition?: string;
  promisedDate?: string;
  promisedAmountCents?: number;
  operatorReviewRequired?: boolean;
  promiseUpdate?: VoicePostCallPromiseUpdate;
  partialPaymentCommitment?: VoicePostCallPartialPaymentCommitment;
  paymentPlanRequest?: VoicePostCallPaymentPlanRequest;
  nonCommitment?: VoicePostCallNonCommitment;
  paidAlreadyClaim?: VoicePostCallPaidAlreadyClaim;
  dispute?: VoicePostCallDisputeCapture;
  callback?: VoicePostCallCallbackRequest;
  contactHandoff?: VoicePostCallContactHandoff;
  routingChangeRequest?: VoicePostCallRoutingChangeRequest;
  followUpActions: VoicePostCallFollowUpAction[];
}

export function normalizeVoicePostCallOutcome(
  input: NormalizeVoicePostCallOutcomeInput
): NormalizedVoicePostCallOutcome {
  const analysis = input.analysis ?? {};
  const extractedVariables = input.extractedVariables ?? {};
  const structuredOutcome = readRecord(
    readFirst(analysis, ["post_call_outcome", "postCallOutcome", "call_outcome", "callOutcome", "outcome"]) ??
      readFirst(extractedVariables, ["post_call_outcome", "postCallOutcome", "call_outcome", "callOutcome", "outcome"])
  );
  const source = mergeRecords(extractedVariables, analysis, structuredOutcome);
  const invoiceIds = readStringArray(
    readFirst(source, ["invoiceIds", "invoice_ids", "linkedInvoiceIds", "linked_invoice_ids"]),
    input.invoiceIds
  );
  const text = `${input.transcriptSummary ?? ""}\n${input.transcriptText ?? ""}`.toLowerCase();
  const promisedDate = resolvePromisedDate(source, text);
  const promisedAmountCents = readNumber(
    readFirst(source, [
      "promisedAmountCents",
      "promised_amount_cents",
      "promiseAmountCents",
      "promise_amount_cents",
      "paymentPromiseAmountCents",
      "payment_promise_amount_cents"
    ])
  );
  const explicitOutcome = normalizeOutcomeKind(
    readString(
      readFirst(source, [
        "outcomeType",
        "outcome_type",
        "outcome",
        "classification",
        "category",
        "callOutcome",
        "call_outcome"
      ])
    )
  );
  const dispute = resolveDisputeCapture({ source, invoiceIds, text });
  const promiseUpdate = resolvePromiseUpdate({
    source,
    invoiceIds,
    defaultCurrency: input.defaultCurrency,
    promisedDate,
    promisedAmountCents,
    text,
    dispute
  });
  const partialPaymentCommitment = resolvePartialPaymentCommitment({
    source,
    invoiceIds,
    defaultCurrency: input.defaultCurrency,
    promisedDate,
    text
  });
  const paymentPlanRequest = resolvePaymentPlanRequest({
    source,
    invoiceIds,
    defaultCurrency: input.defaultCurrency,
    text
  });
  const nonCommitment = resolveNonCommitment({ source, invoiceIds, text });
  const paidAlreadyClaim = resolvePaidAlreadyClaim({
    source,
    invoiceIds,
    defaultCurrency: input.defaultCurrency,
    text
  });
  const callback = resolveCallbackRequest({ source, text });
  const contactHandoff = resolveContactHandoff({ source, text });
  const routingChangeRequest = resolveRoutingChangeRequest({ source, invoiceIds });
  const followUpActions = resolveFollowUpActions({
    source,
    text,
    occurredAt: input.occurredAt
  });
  const operatorReviewRequired =
    readBoolean(readFirst(source, ["operatorReviewRequired", "operator_review_required"])) ??
    Boolean(dispute?.disputeScope === "whole_account_or_balance" || dispute?.disputeScope === "unclear");
  const outcome = resolveOutcomeKind({
    explicitOutcome,
    promiseUpdate,
    partialPaymentCommitment,
    paymentPlanRequest,
    nonCommitment,
    paidAlreadyClaim,
    dispute,
    callback,
    contactHandoff,
    routingChangeRequest,
    followUpActions
  });

  return {
    outcome,
    ...(input.disposition ? { disposition: input.disposition } : {}),
    ...(promisedDate ? { promisedDate } : {}),
    ...(promisedAmountCents !== undefined ? { promisedAmountCents } : {}),
    ...(operatorReviewRequired !== undefined ? { operatorReviewRequired } : {}),
    ...(promiseUpdate ? { promiseUpdate } : {}),
    ...(partialPaymentCommitment ? { partialPaymentCommitment } : {}),
    ...(paymentPlanRequest ? { paymentPlanRequest } : {}),
    ...(nonCommitment ? { nonCommitment } : {}),
    ...(paidAlreadyClaim ? { paidAlreadyClaim } : {}),
    ...(dispute ? { dispute } : {}),
    ...(callback ? { callback } : {}),
    ...(contactHandoff ? { contactHandoff } : {}),
    ...(routingChangeRequest ? { routingChangeRequest } : {}),
    followUpActions
  };
}

function resolvePromiseUpdate(input: {
  source: Record<string, unknown>;
  invoiceIds: string[];
  defaultCurrency?: string;
  promisedDate?: string;
  promisedAmountCents?: number;
  text: string;
  dispute?: VoicePostCallDisputeCapture;
}): VoicePostCallPromiseUpdate | undefined {
  const promise = readRecord(
    readFirst(input.source, ["promiseUpdate", "promise_update", "promise", "promise_to_pay"])
  );
  const promisedDate =
    input.promisedDate ?? readString(readFirst(promise, ["promisedDate", "promised_date", "promiseDate", "promise_date"]));
  const promisedAmountCents =
    input.promisedAmountCents ??
    readNumber(readFirst(promise, ["promisedAmountCents", "promised_amount_cents", "amountCents", "amount_cents"]));
  const rawStatus =
    readString(readFirst(promise, ["status", "promiseStatus", "promise_status"])) ??
    readString(readFirst(input.source, ["promiseStatus", "promise_status"]));
  const status = normalizePromiseStatus(rawStatus);
  const promiseToPayId =
    readString(readFirst(promise, ["promiseToPayId", "promise_to_pay_id"])) ??
    readString(readFirst(input.source, ["promiseToPayId", "promise_to_pay_id"]));
  const hasPromiseSignal =
    Boolean(promisedDate || promisedAmountCents !== undefined || promiseToPayId || rawStatus) ||
    /\b(promised?|committed?|will pay|settle|pay on|payment by|pay next|pay today)\b/i.test(input.text);
  const candidateInvoiceIds = readStringArray(
    readFirst(promise, ["invoiceIds", "invoice_ids", "promiseInvoiceIds", "promise_invoice_ids"]),
    readStringArray(
      readFirst(input.source, ["promiseInvoiceIds", "promise_invoice_ids"]),
      input.invoiceIds
    )
  );
  const disputedInvoiceIds = new Set(input.dispute?.invoiceIds ?? []);
  const touchesDispute =
    input.dispute &&
    (["whole_account_or_balance", "unclear"].includes(input.dispute.disputeScope ?? "") ||
      candidateInvoiceIds.some((invoiceId) => disputedInvoiceIds.has(invoiceId)));
  if (!hasPromiseSignal || touchesDispute) {
    return undefined;
  }

  return {
    invoiceIds: candidateInvoiceIds,
    ...(promiseToPayId ? { promiseToPayId } : {}),
    ...(promisedDate ? { promisedDate } : {}),
    ...(promisedAmountCents !== undefined
      ? { promisedAmountCents }
      : {}),
    currency:
      readString(promise.currency) ??
      readString(readFirst(input.source, ["promiseCurrency", "promise_currency"])) ??
      input.defaultCurrency,
    status: status ?? "new",
    ...(readString(promise.notes) ?? readString(readFirst(input.source, ["promiseNotes", "promise_notes"]))
      ? { notes: readString(promise.notes) ?? readString(readFirst(input.source, ["promiseNotes", "promise_notes"])) }
      : {})
  };
}

function resolvePartialPaymentCommitment(input: {
  source: Record<string, unknown>;
  invoiceIds: string[];
  defaultCurrency?: string;
  promisedDate?: string;
  text: string;
}): VoicePostCallPartialPaymentCommitment | undefined {
  const source = readRecord(
    readFirst(input.source, ["partialPaymentCommitment", "partial_payment_commitment"])
  );
  const promisedAmountCents =
    readNumber(readFirst(source, ["promisedAmountCents", "promised_amount_cents"])) ??
    readNumber(readFirst(input.source, ["partialPaymentAmountCents", "partial_payment_amount_cents"]));
  const hasSignal =
    promisedAmountCents !== undefined ||
    readBoolean(readFirst(input.source, ["partialPaymentCommitted", "partial_payment_committed"])) === true ||
    /\bpartial payment|part of the balance|pay part\b/i.test(input.text);
  if (!hasSignal || promisedAmountCents === undefined) {
    return undefined;
  }

  return {
    invoiceIds: readStringArray(
      readFirst(source, ["invoiceIds", "invoice_ids", "partialPaymentInvoiceIds", "partial_payment_invoice_ids"]),
      readStringArray(
        readFirst(input.source, ["partialPaymentInvoiceIds", "partial_payment_invoice_ids"]),
        input.invoiceIds
      )
    ),
    promisedAmountCents,
    ...(readString(readFirst(source, ["promisedDate", "promised_date"])) ?? input.promisedDate
      ? { promisedDate: readString(readFirst(source, ["promisedDate", "promised_date"])) ?? input.promisedDate }
      : {}),
    currency:
      readString(source.currency) ??
      readString(readFirst(input.source, ["partialPaymentCurrency", "partial_payment_currency"])) ??
      input.defaultCurrency,
    ...(readString(readFirst(source, ["groupName", "group_name"])) ?? readString(readFirst(input.source, ["partialPaymentGroupName", "partial_payment_group_name"]))
      ? { groupName: readString(readFirst(source, ["groupName", "group_name"])) ?? readString(readFirst(input.source, ["partialPaymentGroupName", "partial_payment_group_name"])) }
      : {}),
    ...(normalizeRemainderDisposition(readString(readFirst(source, ["remainderDisposition", "remainder_disposition"])))
      ? {
          remainderDisposition: normalizeRemainderDisposition(
            readString(readFirst(source, ["remainderDisposition", "remainder_disposition"]))
          )
        }
      : {}),
    ...(readString(source.notes) ?? readString(readFirst(input.source, ["partialPaymentNotes", "partial_payment_notes"]))
      ? { notes: readString(source.notes) ?? readString(readFirst(input.source, ["partialPaymentNotes", "partial_payment_notes"])) }
      : {})
  };
}

function resolvePaymentPlanRequest(input: {
  source: Record<string, unknown>;
  invoiceIds: string[];
  defaultCurrency?: string;
  text: string;
}): VoicePostCallPaymentPlanRequest | undefined {
  const source = readRecord(
    readFirst(input.source, ["paymentPlanRequest", "payment_plan_request"])
  );
  const summary =
    readString(source.summary) ??
    readString(readFirst(input.source, ["paymentPlanSummary", "payment_plan_summary"]));
  const hasSignal =
    Boolean(summary) ||
    readBoolean(readFirst(input.source, ["paymentPlanRequested", "payment_plan_requested"])) === true ||
    /\b(payment plan|installment|instalment|pay over|split payment)\b/i.test(input.text);
  if (!hasSignal) {
    return undefined;
  }

  return {
    invoiceIds: readStringArray(
      readFirst(source, ["invoiceIds", "invoice_ids", "paymentPlanInvoiceIds", "payment_plan_invoice_ids"]),
      readStringArray(
        readFirst(input.source, ["paymentPlanInvoiceIds", "payment_plan_invoice_ids"]),
        input.invoiceIds
      )
    ),
    ...(readNumber(readFirst(source, ["requestedInstallmentCount", "requested_installment_count"])) ??
      readNumber(readFirst(input.source, ["requestedInstallmentCount", "requested_installment_count", "paymentPlanInstallmentCount", "payment_plan_installment_count"])) !== undefined
      ? {
          requestedInstallmentCount:
            readNumber(readFirst(source, ["requestedInstallmentCount", "requested_installment_count"])) ??
            readNumber(readFirst(input.source, ["requestedInstallmentCount", "requested_installment_count", "paymentPlanInstallmentCount", "payment_plan_installment_count"]))
        }
      : {}),
    ...(readNumber(readFirst(source, ["requestedAmountCents", "requested_amount_cents"])) ??
      readNumber(readFirst(input.source, ["requestedAmountCents", "requested_amount_cents", "paymentPlanAmountCents", "payment_plan_amount_cents"])) !== undefined
      ? {
          requestedAmountCents:
            readNumber(readFirst(source, ["requestedAmountCents", "requested_amount_cents"])) ??
            readNumber(readFirst(input.source, ["requestedAmountCents", "requested_amount_cents", "paymentPlanAmountCents", "payment_plan_amount_cents"]))
        }
      : {}),
    currency:
      readString(source.currency) ??
      readString(readFirst(input.source, ["paymentPlanCurrency", "payment_plan_currency", "currency"])) ??
      input.defaultCurrency,
    ...(normalizeCadence(
      readString(readFirst(source, ["requestedCadence", "requested_cadence"])) ??
        readString(readFirst(input.source, ["requestedCadence", "requested_cadence", "paymentPlanCadence", "payment_plan_cadence"]))
    )
      ? {
          requestedCadence: normalizeCadence(
            readString(readFirst(source, ["requestedCadence", "requested_cadence"])) ??
              readString(readFirst(input.source, ["requestedCadence", "requested_cadence", "paymentPlanCadence", "payment_plan_cadence"]))
          )
        }
      : {}),
    ...(readString(readFirst(source, ["requestedFirstPaymentDate", "requested_first_payment_date"])) ??
      readString(readFirst(input.source, ["requestedFirstPaymentDate", "requested_first_payment_date", "paymentPlanFirstPaymentDate", "payment_plan_first_payment_date"]))
      ? {
          requestedFirstPaymentDate:
            readString(readFirst(source, ["requestedFirstPaymentDate", "requested_first_payment_date"])) ??
            readString(readFirst(input.source, ["requestedFirstPaymentDate", "requested_first_payment_date", "paymentPlanFirstPaymentDate", "payment_plan_first_payment_date"]))
        }
      : {}),
    ...(readString(readFirst(source, ["groupName", "group_name"])) ? { groupName: readString(readFirst(source, ["groupName", "group_name"])) } : {}),
    summary: summary ?? "Customer requested a payment plan or installment review.",
    ...(readString(source.notes) ? { notes: readString(source.notes) } : {})
  };
}

function resolveNonCommitment(input: {
  source: Record<string, unknown>;
  invoiceIds: string[];
  text: string;
}): VoicePostCallNonCommitment | undefined {
  const source = readRecord(readFirst(input.source, ["nonCommitment", "non_commitment"]));
  const reason =
    readString(source.reason) ??
    readString(readFirst(input.source, ["nonCommitmentReason", "non_commitment_reason"]));
  const callbackRequested =
    readBoolean(readFirst(source, ["callbackRequested", "callback_requested"])) ??
    readBoolean(readFirst(input.source, ["callbackRequested", "callback_requested"]));
  const hasSignal =
    Boolean(reason) ||
    readBoolean(readFirst(input.source, ["nonCommitment", "non_commitment"])) === true ||
    /\b(no commitment|cannot commit|can't commit|not able to commit|unsure when|no payment date)\b/i.test(input.text);
  if (!hasSignal) {
    return undefined;
  }

  return {
    invoiceIds: readStringArray(
      readFirst(source, ["invoiceIds", "invoice_ids", "nonCommitmentInvoiceIds", "non_commitment_invoice_ids"]),
      readStringArray(
        readFirst(input.source, ["nonCommitmentInvoiceIds", "non_commitment_invoice_ids"]),
        input.invoiceIds
      )
    ),
    ...(readString(readFirst(source, ["groupName", "group_name"])) ? { groupName: readString(readFirst(source, ["groupName", "group_name"])) } : {}),
    ...(reason ? { reason } : {}),
    ...(callbackRequested !== undefined ? { callbackRequested } : {}),
    ...(readString(source.notes) ? { notes: readString(source.notes) } : {})
  };
}

function resolvePaidAlreadyClaim(input: {
  source: Record<string, unknown>;
  invoiceIds: string[];
  defaultCurrency?: string;
  text: string;
}): VoicePostCallPaidAlreadyClaim | undefined {
  const source = readRecord(
    readFirst(input.source, ["paidAlreadyClaim", "paid_already_claim", "paidAlready", "paid_already"])
  );
  const hasSignal =
    readBoolean(readFirst(input.source, ["paidAlready", "paid_already"])) === true ||
    Object.keys(source).length > 0 ||
    /\b(already paid|already been paid|payment sent|paid this|paid last|settled already)\b/i.test(input.text);
  if (!hasSignal) {
    return undefined;
  }

  return {
    invoiceIds: readStringArray(
      readFirst(source, ["invoiceIds", "invoice_ids", "paidInvoiceIds", "paid_invoice_ids"]),
      readStringArray(readFirst(input.source, ["paidInvoiceIds", "paid_invoice_ids"]), input.invoiceIds)
    ),
    ...(readNumber(readFirst(source, ["amountCents", "amount_cents"])) ??
      readNumber(readFirst(input.source, ["paidAmountCents", "paid_amount_cents"])) !== undefined
      ? {
          amountCents:
            readNumber(readFirst(source, ["amountCents", "amount_cents"])) ??
            readNumber(readFirst(input.source, ["paidAmountCents", "paid_amount_cents"]))
        }
      : {}),
    currency:
      readString(source.currency) ??
      readString(readFirst(input.source, ["paidCurrency", "paid_currency", "currency"])) ??
      input.defaultCurrency,
    ...(readString(readFirst(source, ["paidAt", "paid_at"])) ?? readString(readFirst(input.source, ["paidAt", "paid_at"]))
      ? { paidAt: readString(readFirst(source, ["paidAt", "paid_at"])) ?? readString(readFirst(input.source, ["paidAt", "paid_at"])) }
      : {}),
    ...(readString(source.reference) ?? readString(readFirst(input.source, ["paymentReference", "payment_reference", "paidReference", "paid_reference"]))
      ? {
          reference:
            readString(source.reference) ??
            readString(readFirst(input.source, ["paymentReference", "payment_reference", "paidReference", "paid_reference"]))
        }
      : {}),
    ...(readBoolean(readFirst(source, ["remittanceExpected", "remittance_expected"])) ??
      readBoolean(readFirst(input.source, ["remittanceExpected", "remittance_expected"])) !== undefined
      ? {
          remittanceExpected:
            readBoolean(readFirst(source, ["remittanceExpected", "remittance_expected"])) ??
            readBoolean(readFirst(input.source, ["remittanceExpected", "remittance_expected"]))
        }
      : {}),
    ...(readString(source.notes) ?? readString(readFirst(input.source, ["paidNotes", "paid_notes"]))
      ? { notes: readString(source.notes) ?? readString(readFirst(input.source, ["paidNotes", "paid_notes"])) }
      : {})
  };
}

function resolveDisputeCapture(input: {
  source: Record<string, unknown>;
  invoiceIds: string[];
  text: string;
}): VoicePostCallDisputeCapture | undefined {
  const source = readRecord(readFirst(input.source, ["dispute", "disputeCapture", "dispute_capture"]));
  const summary =
    readString(source.summary) ??
    readString(readFirst(input.source, ["disputeSummary", "dispute_summary"]));
  const hasSignal =
    Boolean(summary) ||
    readBoolean(readFirst(input.source, ["disputeRaised", "dispute_raised"])) === true ||
    /\b(dispute|wrong amount|incorrect invoice|quantity issue|not delivered|billing issue)\b/i.test(input.text);
  if (!hasSignal) {
    return undefined;
  }
  const invoiceIds = readStringArray(
    readFirst(source, ["invoiceIds", "invoice_ids", "disputedInvoiceIds", "disputed_invoice_ids"]),
    readStringArray(
      readFirst(input.source, [
        "disputedInvoiceIds",
        "disputed_invoice_ids",
        "disputeInvoiceIds",
        "dispute_invoice_ids"
      ]),
      input.invoiceIds
    )
  );
  const disputeType = normalizeDisputeType(
    readString(readFirst(source, ["disputeType", "dispute_type"])) ??
      readString(readFirst(input.source, ["disputeType", "dispute_type"]))
  );
  const amountCents =
    readNumber(readFirst(source, ["amountCents", "amount_cents", "disputeAmountCents", "dispute_amount_cents"])) ??
    readNumber(readFirst(input.source, ["disputeAmountCents", "dispute_amount_cents", "amountCents", "amount_cents"]));
  const currency =
    readString(source.currency) ??
    readString(readFirst(input.source, ["disputeCurrency", "dispute_currency", "currency"]));
  const disputeScope = normalizeDisputeScope(
    readString(readFirst(source, ["disputeScope", "dispute_scope"])) ??
      readString(readFirst(input.source, ["disputeScope", "dispute_scope"]))
  );
  const groupName =
    readString(readFirst(source, ["groupName", "group_name"])) ??
    readString(readFirst(input.source, ["disputeGroupName", "dispute_group_name", "groupName", "group_name"]));
  const frozenScopeSummary =
    readString(readFirst(source, ["frozenScopeSummary", "frozen_scope_summary"])) ??
    readString(readFirst(input.source, ["frozenScopeSummary", "frozen_scope_summary"]));
  const nextActionAfterDispute =
    readString(readFirst(source, ["nextActionAfterDispute", "next_action_after_dispute"])) ??
    readString(readFirst(input.source, ["nextActionAfterDispute", "next_action_after_dispute"]));
  const continuationReason =
    readString(readFirst(source, ["continuationReason", "continuation_reason"])) ??
    readString(readFirst(input.source, ["continuationReason", "continuation_reason"]));

  return {
    invoiceIds,
    disputeType,
    ...(amountCents !== undefined ? { amountCents } : {}),
    ...(currency ? { currency } : {}),
    summary: summary ?? "Customer raised a dispute during the call.",
    ...(disputeScope ? { disputeScope } : {}),
    ...(groupName ? { groupName } : {}),
    ...(frozenScopeSummary ? { frozenScopeSummary } : {}),
    ...(nextActionAfterDispute ? { nextActionAfterDispute } : {}),
    ...(continuationReason ? { continuationReason } : {})
  };
}

function resolveCallbackRequest(input: {
  source: Record<string, unknown>;
  text: string;
}): VoicePostCallCallbackRequest | undefined {
  const source = readRecord(readFirst(input.source, ["callback", "callbackRequest", "callback_request"]));
  const dueAt =
    readString(readFirst(source, ["dueAt", "due_at"])) ??
    readString(readFirst(input.source, ["callbackDueAt", "callback_due_at"]));
  const requestedAt = readString(readFirst(source, ["requestedAt", "requested_at"]));
  const notes =
    readString(source.notes) ??
    readString(readFirst(input.source, ["callbackNotes", "callback_notes"]));
  const hasSignal =
    Boolean(dueAt || requestedAt || notes) ||
    readBoolean(readFirst(input.source, ["callbackRequested", "callback_requested"])) === true ||
    /\b(call back|callback|call me back|call us back)\b/i.test(input.text);
  if (!hasSignal) {
    return undefined;
  }

  return {
    ...(requestedAt ? { requestedAt } : {}),
    ...(dueAt ? { dueAt } : {}),
    ...(readString(source.timezone) ?? readString(readFirst(input.source, ["callbackTimezone", "callback_timezone", "timezone"]))
      ? { timezone: readString(source.timezone) ?? readString(readFirst(input.source, ["callbackTimezone", "callback_timezone", "timezone"])) }
      : {}),
    ...(notes ? { notes } : {})
  };
}

function resolveContactHandoff(input: {
  source: Record<string, unknown>;
  text: string;
}): VoicePostCallContactHandoff | undefined {
  const source = readRecord(readFirst(input.source, ["contactHandoff", "contact_handoff", "handlerHandoff", "handler_handoff"]));
  const newHandlerName =
    readString(readFirst(source, ["newHandlerName", "new_handler_name"])) ??
    readString(readFirst(input.source, ["newHandlerName", "new_handler_name"]));
  const wrongContact =
    readBoolean(readFirst(input.source, ["wrongContact", "wrong_contact"])) === true ||
    /\b(wrong contact|not the right person|no longer handles|someone else handles)\b/i.test(input.text);
  if (!newHandlerName && !wrongContact) {
    return undefined;
  }

  return {
    currentContactId: readString(readFirst(source, ["currentContactId", "current_contact_id"])),
    newHandlerName: newHandlerName ?? "Unknown handler",
    newHandlerEmail: readString(readFirst(source, ["newHandlerEmail", "new_handler_email"])),
    newHandlerPhone: readString(readFirst(source, ["newHandlerPhone", "new_handler_phone"])),
    newHandlerRole: readString(readFirst(source, ["newHandlerRole", "new_handler_role"])),
    newHandlerReachable: readBoolean(readFirst(source, ["newHandlerReachable", "new_handler_reachable"])) ?? false,
    verificationStatus: "unverified",
    notes: readString(source.notes) ?? (wrongContact ? "Caller indicated this is the wrong contact." : undefined)
  };
}

function resolveRoutingChangeRequest(input: {
  source: Record<string, unknown>;
  invoiceIds: string[];
}): VoicePostCallRoutingChangeRequest | undefined {
  const source = readRecord(readFirst(input.source, ["routingChangeRequest", "routing_change_request"]));
  const reason = readString(source.reason);
  if (!reason) {
    return undefined;
  }

  return {
    requestedRoutingLevel: normalizeRoutingLevel(readString(readFirst(source, ["requestedRoutingLevel", "requested_routing_level"]))),
    requestedBillingAccountId: readString(readFirst(source, ["requestedBillingAccountId", "requested_billing_account_id"])),
    requestedBranchId: readString(readFirst(source, ["requestedBranchId", "requested_branch_id"])),
    requestedContactId: readString(readFirst(source, ["requestedContactId", "requested_contact_id"])),
    reason: `${reason}${input.invoiceIds.length > 0 ? ` Invoice context: ${input.invoiceIds.join(", ")}.` : ""}`
  };
}

function resolveFollowUpActions(input: {
  source: Record<string, unknown>;
  text: string;
  occurredAt: string;
}): VoicePostCallFollowUpAction[] {
  const raw = readFirst(input.source, ["followUpActions", "follow_up_actions"]);
  if (Array.isArray(raw)) {
    return raw
      .map(readRecord)
      .map((entry) => {
        const title = readString(entry.title);
        if (!title) {
          return undefined;
        }
        return {
          title,
          ...(readString(entry.description) ? { description: readString(entry.description) } : {}),
          ...(readString(readFirst(entry, ["dueAt", "due_at"])) ? { dueAt: readString(readFirst(entry, ["dueAt", "due_at"])) } : {}),
          ...(readBoolean(readFirst(entry, ["requiresHumanReview", "requires_human_review"])) !== undefined
            ? { requiresHumanReview: readBoolean(readFirst(entry, ["requiresHumanReview", "requires_human_review"])) }
            : {}),
          metadata: readRecord(entry.metadata)
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }

  const supportRequest =
    readString(readFirst(input.source, ["supportRequest", "support_request"])) ??
    (readBoolean(readFirst(input.source, ["stopCallsRequested", "stop_calls_requested"])) === true
      ? "Customer requested that calls stop; review outreach preferences before further collections calls."
      : undefined) ??
    (readBoolean(readFirst(input.source, ["transferRequested", "transfer_requested"])) === true
      ? "Customer requested a transfer or human follow-up during the call."
      : undefined) ??
    (/\b(send|provide|share).{0,30}(supporting document|supporting documents|proof of delivery|invoice copy)\b/i.test(input.text)
      ? "Customer requested supporting documents or invoice assistance."
      : undefined);
  if (!supportRequest) {
    return [];
  }

  return [
    {
      title: "Complete customer support request",
      description: supportRequest,
      dueAt: shiftIso(input.occurredAt, 2),
      requiresHumanReview: true,
      metadata: {
        category: "support_request"
      }
    }
  ];
}

function resolveOutcomeKind(input: {
  explicitOutcome?: NormalizedVoicePostCallOutcomeKind;
  promiseUpdate?: VoicePostCallPromiseUpdate;
  partialPaymentCommitment?: VoicePostCallPartialPaymentCommitment;
  paymentPlanRequest?: VoicePostCallPaymentPlanRequest;
  nonCommitment?: VoicePostCallNonCommitment;
  paidAlreadyClaim?: VoicePostCallPaidAlreadyClaim;
  dispute?: VoicePostCallDisputeCapture;
  callback?: VoicePostCallCallbackRequest;
  contactHandoff?: VoicePostCallContactHandoff;
  routingChangeRequest?: VoicePostCallRoutingChangeRequest;
  followUpActions: VoicePostCallFollowUpAction[];
}): NormalizedVoicePostCallOutcomeKind {
  const detected = [
    input.promiseUpdate,
    input.partialPaymentCommitment,
    input.paymentPlanRequest,
    input.nonCommitment,
    input.paidAlreadyClaim,
    input.dispute,
    input.callback,
    input.contactHandoff,
    input.routingChangeRequest,
    input.followUpActions.length > 0 ? input.followUpActions : undefined
  ].filter(Boolean);
  if (detected.length > 1) {
    return "mixed";
  }
  if (input.explicitOutcome) {
    return input.explicitOutcome;
  }
  if (input.promiseUpdate) return "promise_to_pay";
  if (input.partialPaymentCommitment) return "partial_payment_commitment";
  if (input.paymentPlanRequest) return "payment_plan_request";
  if (input.nonCommitment) return "non_commitment";
  if (input.paidAlreadyClaim) return "paid_already";
  if (input.dispute) return "dispute";
  if (input.callback) return "callback_requested";
  if (input.contactHandoff) return "handler_handoff";
  if (input.routingChangeRequest) return "routing_change";
  if (input.followUpActions.length > 0) return "support_request";
  return "information_only";
}

function resolvePromisedDate(source: Record<string, unknown>, text: string): string | undefined {
  const explicit = readString(
    readFirst(source, [
      "promisedDate",
      "promised_date",
      "promiseDate",
      "promise_date",
      "paymentPromiseDate",
      "payment_promise_date"
    ])
  );
  if (explicit) {
    return explicit;
  }
  return /\b(20\d{2}-\d{2}-\d{2})\b/.exec(text)?.[1];
}

function normalizeOutcomeKind(value: string | undefined): NormalizedVoicePostCallOutcomeKind | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, NormalizedVoicePostCallOutcomeKind> = {
    promise: "promise_to_pay",
    promise_update: "promise_to_pay",
    promised_payment: "promise_to_pay",
    partial_payment: "partial_payment_commitment",
    payment_plan: "payment_plan_request",
    paid_already_claim: "paid_already",
    already_paid: "paid_already",
    callback: "callback_requested",
    handler_handoff: "handler_handoff",
    wrong_contact: "handler_handoff",
    support: "support_request",
    support_follow_up: "support_request",
    info_only: "information_only"
  };
  const candidate = aliases[normalized] ?? normalized;
  return [
    "promise_to_pay",
    "partial_payment_commitment",
    "payment_plan_request",
    "non_commitment",
    "paid_already",
    "dispute",
    "callback_requested",
    "handler_handoff",
    "routing_change",
    "support_request",
    "information_only",
    "mixed"
  ].includes(candidate)
    ? (candidate as NormalizedVoicePostCallOutcomeKind)
    : undefined;
}

function normalizePromiseStatus(
  value: string | undefined
): "new" | "updated" | "kept" | "broken" | "cancelled" | undefined {
  if (
    value === "new" ||
    value === "updated" ||
    value === "kept" ||
    value === "broken" ||
    value === "cancelled"
  ) {
    return value;
  }
  return undefined;
}

function normalizeRemainderDisposition(value: string | undefined) {
  if (
    value === "uncommitted" ||
    value === "customer_requested_payment_plan" ||
    value === "customer_disputed_remainder" ||
    value === "follow_up_required"
  ) {
    return value;
  }
  return undefined;
}

function normalizeCadence(value: string | undefined) {
  if (value === "weekly" || value === "biweekly" || value === "monthly" || value === "custom") {
    return value;
  }
  return undefined;
}

function normalizeDisputeType(value: string | undefined): "billing" | "service" | "delivery" | "unknown" {
  if (value === "billing" || value === "service" || value === "delivery" || value === "unknown") {
    return value;
  }
  return "unknown";
}

function normalizeDisputeScope(value: string | undefined) {
  if (
    value === "invoice_subset" ||
    value === "current_group_only" ||
    value === "whole_account_or_balance" ||
    value === "routing_or_handler_issue" ||
    value === "unclear"
  ) {
    return value;
  }
  return undefined;
}

function normalizeRoutingLevel(value: string | undefined) {
  if (
    value === "parent_account" ||
    value === "billing_account" ||
    value === "branch" ||
    value === "invoice"
  ) {
    return value;
  }
  return undefined;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mergeRecords(...records: Array<Record<string, unknown>>): Record<string, unknown> {
  return Object.assign({}, ...records);
}

function readFirst(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  return undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return undefined;
}

function readStringArray(value: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value.filter((entry): entry is string => typeof entry === "string"));
  }
  if (typeof value === "string") {
    return uniqueStrings(value.split(","));
  }
  return fallback;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function shiftIso(iso: string, days: number) {
  const value = new Date(iso);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString();
}
