import type {
  InvoiceFollowUpBucketLine,
  InvoiceFollowUpBucketName,
  InvoiceFollowUpBucketOutput,
  InvoiceFollowUpTreatmentGroups,
  InvoicePromiseTreatmentStatus,
  VoicePostCallPersistenceAction,
  VoicePostCallPersistencePlan,
  VoicePreCallBlockReason,
  VoicePreCallHandlerContext,
  VoicePreCallHandlerVerificationSource,
  VoicePreCallObjective,
  VoicePreCallOutput,
  VoicePreCallPriorityGroup,
  VoicePreCallPriorityGroupName,
  VoicePreCallRoutingContext,
  VoicePreCallSafetyDecision
} from "@o2c/contracts";
import {
  defaultCollectionSendWindow,
  evaluatePromiseToPayState,
  getCollectibleAmountCents,
  isWithinCollectionSendWindow,
  type BillingAccount,
  type CollectionSendWindow,
  type Contact,
  type CustomerInvoice,
  type PromiseToPay,
  type PromiseToPayState
} from "@o2c/domain";

export interface CollectionsVoicePreCallPlanInput {
  planId?: string;
  account: BillingAccount;
  contact: Contact;
  invoices: CustomerInvoice[];
  promisesToPay?: PromiseToPay[];
  asOf: string;
  preDueWindowDays?: number;
  callWindow?: CollectionSendWindow;
  approvalRequestId?: string;
}

export interface InvoiceFollowUpBucketComputation {
  bucketOutput: InvoiceFollowUpBucketOutput;
  bucketedInvoices: Record<InvoiceFollowUpBucketName, InvoiceFollowUpBucketLine[]>;
  treatmentGroups: InvoiceFollowUpTreatmentGroups;
  balanceInvoices: InvoiceFollowUpBucketLine[];
  overallBalanceInvoices: InvoiceFollowUpBucketLine[];
  brokenPromiseInvoices: InvoiceFollowUpBucketLine[];
  overdueWithoutPromiseInvoices: InvoiceFollowUpBucketLine[];
  dueTodayWithoutPromiseInvoices: InvoiceFollowUpBucketLine[];
  preDueWithoutPromiseInvoices: InvoiceFollowUpBucketLine[];
  activeFuturePromiseInvoices: InvoiceFollowUpBucketLine[];
  routineReminderInvoices: InvoiceFollowUpBucketLine[];
  disputedInvoices: InvoiceFollowUpBucketLine[];
  priorityGroups: VoicePreCallPriorityGroup[];
  callPriorityGroups: VoicePreCallPriorityGroup[];
  excludedInvoiceIds: string[];
  blockedReason?: VoicePreCallBlockReason;
}

export interface CollectionsVoicePreCallPlan {
  id: string;
  preparedAt: string;
  routingContext: VoicePreCallRoutingContext;
  handlerContext: VoicePreCallHandlerContext;
  bucketOutput: InvoiceFollowUpBucketOutput;
  preCallOutput: VoicePreCallOutput;
  bucketedInvoices: Record<InvoiceFollowUpBucketName, InvoiceFollowUpBucketLine[]>;
  treatmentGroups: InvoiceFollowUpTreatmentGroups;
  balanceInvoices: InvoiceFollowUpBucketLine[];
  overallBalanceInvoices: InvoiceFollowUpBucketLine[];
  brokenPromiseInvoices: InvoiceFollowUpBucketLine[];
  overdueWithoutPromiseInvoices: InvoiceFollowUpBucketLine[];
  dueTodayWithoutPromiseInvoices: InvoiceFollowUpBucketLine[];
  preDueWithoutPromiseInvoices: InvoiceFollowUpBucketLine[];
  activeFuturePromiseInvoices: InvoiceFollowUpBucketLine[];
  routineReminderInvoices: InvoiceFollowUpBucketLine[];
  disputedInvoices: InvoiceFollowUpBucketLine[];
  priorityGroups: VoicePreCallPriorityGroup[];
  callPriorityGroups: VoicePreCallPriorityGroup[];
  excludedInvoiceIds: string[];
  blockedReason?: VoicePreCallBlockReason;
  safetyDecision: VoicePreCallSafetyDecision;
  callWindow: CollectionSendWindow;
  preDueWindowDays: number;
  invoiceIds: string[];
  eligibleInvoiceIds: string[];
}

export interface VoicePostCallContactHandoff {
  currentContactId?: string;
  newHandlerName: string;
  newHandlerEmail?: string;
  newHandlerPhone?: string;
  newHandlerRole?: string;
  newHandlerReachable?: boolean;
  verificationStatus?: "unverified" | "self_verified" | "operator_verified";
  notes?: string;
}

export interface VoicePostCallRoutingChangeRequest {
  requestedRoutingLevel?: "parent_account" | "billing_account" | "branch" | "invoice";
  requestedBillingAccountId?: string;
  requestedBranchId?: string;
  requestedContactId?: string;
  reason: string;
}

export interface VoicePostCallPromiseUpdate {
  promiseToPayId?: string;
  invoiceIds: string[];
  promisedDate?: string;
  promisedAmountCents?: number;
  currency?: string;
  status?: "new" | "updated" | "kept" | "broken" | "cancelled";
  notes?: string;
}

export interface VoicePostCallPartialPaymentCommitment {
  invoiceIds: string[];
  promisedAmountCents: number;
  promisedDate?: string;
  currency?: string;
  groupName?: string;
  remainderDisposition?:
    | "uncommitted"
    | "customer_requested_payment_plan"
    | "customer_disputed_remainder"
    | "follow_up_required";
  notes?: string;
}

export interface VoicePostCallPaymentPlanRequest {
  invoiceIds: string[];
  requestedInstallmentCount?: number;
  requestedAmountCents?: number;
  currency?: string;
  requestedCadence?: "weekly" | "biweekly" | "monthly" | "custom";
  requestedFirstPaymentDate?: string;
  groupName?: string;
  summary: string;
  notes?: string;
}

export interface VoicePostCallNonCommitment {
  invoiceIds: string[];
  groupName?: string;
  reason?: string;
  callbackRequested?: boolean;
  notes?: string;
}

export interface VoicePostCallPaidAlreadyClaim {
  invoiceIds: string[];
  amountCents?: number;
  currency?: string;
  paidAt?: string;
  reference?: string;
  remittanceExpected?: boolean;
  notes?: string;
}

export interface VoicePostCallDisputeCapture {
  invoiceIds: string[];
  disputeType: "billing" | "service" | "delivery" | "unknown";
  amountCents?: number;
  currency?: string;
  summary: string;
  disputeScope?: string;
  groupName?: string;
  frozenScopeSummary?: string;
  nextActionAfterDispute?: string;
  continuationReason?: string;
}

export interface VoicePostCallCallbackRequest {
  requestedAt?: string;
  dueAt?: string;
  timezone?: string;
  notes?: string;
}

export interface VoicePostCallFollowUpAction {
  title: string;
  description?: string;
  dueAt?: string;
  requiresHumanReview?: boolean;
  metadata?: Record<string, unknown>;
}

export interface VoicePostCallPersistencePlanInput {
  id?: string;
  billingAccountId: string;
  parentAccountId?: string;
  branchId?: string;
  contactId?: string;
  communicationAttemptId: string;
  providerCallId?: string;
  preCallPlanId?: string;
  occurredAt: string;
  disposition: string;
  operatorReviewRequired?: boolean;
  contactHandoff?: VoicePostCallContactHandoff;
  routingChangeRequest?: VoicePostCallRoutingChangeRequest;
  promiseUpdate?: VoicePostCallPromiseUpdate;
  partialPaymentCommitment?: VoicePostCallPartialPaymentCommitment;
  paymentPlanRequest?: VoicePostCallPaymentPlanRequest;
  nonCommitment?: VoicePostCallNonCommitment;
  paidAlreadyClaim?: VoicePostCallPaidAlreadyClaim;
  dispute?: VoicePostCallDisputeCapture;
  callback?: VoicePostCallCallbackRequest;
  followUpActions?: VoicePostCallFollowUpAction[];
}

const defaultPreDueWindowDays = 7;
const chaseableInvoiceStates = new Set<CustomerInvoice["state"]>([
  "synced_open",
  "matched_to_erp",
  "partially_paid"
]);

export function resolveCollectionsVoicePreCallAsOf(
  requestedAsOf: string | undefined,
  currentAsOf: string
): string {
  if (!requestedAsOf) {
    return currentAsOf;
  }

  const requestedManilaDate = toManilaDateOnly(requestedAsOf);
  const currentManilaDate = toManilaDateOnly(currentAsOf);

  // Live call buckets are date-sensitive. A stale Retell payload must not keep
  // yesterday's due-today/pre-due branches active after the Manila business date changes.
  if (requestedManilaDate && currentManilaDate && requestedManilaDate === currentManilaDate) {
    return requestedAsOf;
  }

  return currentAsOf;
}

export function buildCollectionsVoicePreCallPlan(
  input: CollectionsVoicePreCallPlanInput
): CollectionsVoicePreCallPlan {
  const preDueWindowDays =
    input.preDueWindowDays ??
    readPositiveInteger(input.account.metadata.voicePreDueWindowDays) ??
    defaultPreDueWindowDays;
  const callWindow = input.callWindow ?? defaultCollectionSendWindow();
  const buckets = computeInvoiceFollowUpBuckets({
    invoices: input.invoices,
    promisesToPay: input.promisesToPay ?? [],
    asOf: input.asOf,
    preDueWindowDays
  });
  const routingContext = buildVoicePreCallRoutingContext({
    account: input.account,
    contact: input.contact,
    invoices: input.invoices
  });
  const handlerContext = buildVoicePreCallHandlerContext({
    account: input.account,
    contact: input.contact
  });
  const preCallOutput = buildVoicePreCallOutput({
    bucketOutput: buckets.bucketOutput,
    handlerContext,
    priorityGroups: buckets.priorityGroups,
    callPriorityGroups: buckets.callPriorityGroups,
    account: input.account
  });
  const safetyDecision = validateVoicePreCallSafety({
    account: input.account,
    contact: input.contact,
    invoices: input.invoices,
    bucketOutput: buckets.bucketOutput,
    routingContext,
    handlerContext,
    callWindow,
    asOf: input.asOf,
    approvalRequestId: input.approvalRequestId
  });

  return {
    id: input.planId ?? `voice_pre_call_${input.asOf}`,
    preparedAt: input.asOf,
    routingContext,
    handlerContext,
    bucketOutput: buckets.bucketOutput,
    preCallOutput,
    bucketedInvoices: buckets.bucketedInvoices,
    treatmentGroups: buckets.treatmentGroups,
    balanceInvoices: buckets.balanceInvoices,
    overallBalanceInvoices: buckets.overallBalanceInvoices,
    brokenPromiseInvoices: buckets.brokenPromiseInvoices,
    overdueWithoutPromiseInvoices: buckets.overdueWithoutPromiseInvoices,
    dueTodayWithoutPromiseInvoices: buckets.dueTodayWithoutPromiseInvoices,
    preDueWithoutPromiseInvoices: buckets.preDueWithoutPromiseInvoices,
    activeFuturePromiseInvoices: buckets.activeFuturePromiseInvoices,
    routineReminderInvoices: buckets.routineReminderInvoices,
    disputedInvoices: buckets.disputedInvoices,
    priorityGroups: buckets.priorityGroups,
    callPriorityGroups: buckets.callPriorityGroups,
    excludedInvoiceIds: buckets.excludedInvoiceIds,
    ...(buckets.blockedReason ? { blockedReason: buckets.blockedReason } : {}),
    safetyDecision,
    callWindow,
    preDueWindowDays,
    invoiceIds: input.invoices.map((invoice) => invoice.id),
    eligibleInvoiceIds: buckets.balanceInvoices.map((invoice) => invoice.invoiceId)
  };
}

export function computeInvoiceFollowUpBuckets(input: {
  invoices: CustomerInvoice[];
  promisesToPay?: PromiseToPay[];
  asOf: string;
  preDueWindowDays?: number;
}): InvoiceFollowUpBucketComputation {
  const asOfDate = toManilaDateOnly(input.asOf);
  const preDueWindowDays = input.preDueWindowDays ?? defaultPreDueWindowDays;
  const promisesToPay = input.promisesToPay ?? [];
  const invoiceCount = input.invoices.length;
  const lineEntries = input.invoices.map((invoice) => ({
    invoice,
    line: toBucketLine({
      invoice,
      asOfDate,
      preDueWindowDays,
      promiseAssessment: assessInvoicePromise({
        invoice,
        invoiceCount,
        promisesToPay,
        asOfDate
      })
    })
  }));
  const positiveLineEntries = lineEntries.filter((entry) => entry.line.amountCents > 0);
  const overallBalanceInvoices = positiveLineEntries
    .filter((entry) => isBalanceBearingStatementInvoice(entry.invoice))
    .map((entry) => entry.line);
  const disputedInvoices = positiveLineEntries
    .filter((entry) => isDisputedInvoice(entry.invoice))
    .map((entry) => entry.line);
  const balanceInvoices = positiveLineEntries
    .filter((entry) => isEligibleForAutomatedVoiceChase(entry.invoice))
    .map((entry) => entry.line);
  const excludedInvoiceIds = input.invoices
    .filter((invoice) => !isEligibleForAutomatedVoiceChase(invoice))
    .map((invoice) => invoice.id);

  const overdue = balanceInvoices.filter((invoice) => invoice.dateBucket === "overdue");
  const dueToday = balanceInvoices.filter((invoice) => invoice.dateBucket === "due_today");
  const preDue = balanceInvoices.filter((invoice) => invoice.dateBucket === "pre_due");
  const routineReminders = balanceInvoices.filter((invoice) => invoice.dateBucket === "routine");
  const brokenPromises = balanceInvoices.filter(
    (invoice) => invoice.promiseStatus === "broken_promise"
  );
  const activeFuturePromises = balanceInvoices.filter(
    (invoice) => invoice.promiseStatus === "active_future_promise"
  );
  const overdueWithoutPromise = overdue.filter(hasNoPromise);
  const dueTodayWithoutPromise = dueToday.filter(hasNoPromise);
  const preDueWithoutPromise = preDue.filter(hasNoPromise);
  const routineWithoutPromise = routineReminders.filter(hasNoPromise);
  const treatmentGroups: InvoiceFollowUpTreatmentGroups = {
    brokenPromiseInvoices: brokenPromises,
    overdueWithoutPromiseInvoices: overdueWithoutPromise,
    dueTodayWithoutPromiseInvoices: dueTodayWithoutPromise,
    preDueWithoutPromiseInvoices: preDueWithoutPromise,
    activeFuturePromiseInvoices: activeFuturePromises,
    routineReminderInvoices: routineWithoutPromise,
    disputedInvoices
  };
  const priorityGroups = buildPriorityGroups({
    brokenPromises,
    overdueWithoutPromise,
    dueTodayWithoutPromise,
    preDueWithoutPromise,
    activeFuturePromises,
    routineWithoutPromise
  });
  const blockedReason =
    disputedInvoices.length > 0
      ? "disputed_invoice"
      : balanceInvoices.length === 0
        ? "no_collectible_invoices"
        : undefined;

  const bucketOutput: InvoiceFollowUpBucketOutput = {
    has_overdue: overdue.length > 0,
    has_due_today: dueToday.length > 0,
    has_pre_due: preDue.length > 0,
    overdue_total: sumAmounts(overdue),
    due_today_total: sumAmounts(dueToday),
    pre_due_total: sumAmounts(preDue),
    balance_total: sumAmounts(balanceInvoices),
    overall_balance_total: sumAmounts(overallBalanceInvoices),
    oldest_overdue_days: overdue.reduce(
      (max, invoice) => Math.max(max, invoice.daysPastDue ?? 0),
      0
    ),
    overdue_summary: summarizeBucket(overdue, "overdue"),
    due_today_summary: summarizeBucket(dueToday, "due_today"),
    pre_due_summary: summarizeBucket(preDue, "pre_due"),
    has_broken_promises: brokenPromises.length > 0,
    broken_promise_total: sumAmounts(brokenPromises),
    broken_promise_count: brokenPromises.length,
    broken_promise_summary: summarizePromiseTreatment(brokenPromises, "broken promise"),
    has_overdue_without_promise: overdueWithoutPromise.length > 0,
    overdue_without_promise_total: sumAmounts(overdueWithoutPromise),
    overdue_without_promise_count: overdueWithoutPromise.length,
    overdue_without_promise_summary: summarizeBucket(overdueWithoutPromise, "overdue"),
    has_due_today_without_promise: dueTodayWithoutPromise.length > 0,
    due_today_without_promise_total: sumAmounts(dueTodayWithoutPromise),
    due_today_without_promise_count: dueTodayWithoutPromise.length,
    due_today_without_promise_summary: summarizeBucket(dueTodayWithoutPromise, "due_today"),
    has_pre_due_without_promise: preDueWithoutPromise.length > 0,
    pre_due_without_promise_total: sumAmounts(preDueWithoutPromise),
    pre_due_without_promise_count: preDueWithoutPromise.length,
    pre_due_without_promise_summary: summarizeBucket(preDueWithoutPromise, "pre_due"),
    has_active_future_promises: activeFuturePromises.length > 0,
    active_future_promise_total: sumAmounts(activeFuturePromises),
    active_future_promise_count: activeFuturePromises.length,
    active_future_promise_summary: summarizePromiseTreatment(
      activeFuturePromises,
      "active promise"
    ),
    earliest_active_promise_date: earliestPromiseDate(activeFuturePromises) ?? "",
    has_disputed_invoices: disputedInvoices.length > 0,
    disputed_invoice_total: sumAmounts(disputedInvoices),
    disputed_invoice_count: disputedInvoices.length,
    disputed_invoice_summary: summarizeDisputedInvoices(disputedInvoices),
    blocked_reason: blockedReason ?? ""
  };

  return {
    bucketOutput,
    bucketedInvoices: {
      overdue,
      due_today: dueToday,
      pre_due: preDue
    },
    treatmentGroups,
    balanceInvoices,
    overallBalanceInvoices,
    brokenPromiseInvoices: brokenPromises,
    overdueWithoutPromiseInvoices: overdueWithoutPromise,
    dueTodayWithoutPromiseInvoices: dueTodayWithoutPromise,
    preDueWithoutPromiseInvoices: preDueWithoutPromise,
    activeFuturePromiseInvoices: activeFuturePromises,
    routineReminderInvoices: routineWithoutPromise,
    disputedInvoices,
    priorityGroups,
    callPriorityGroups: priorityGroups,
    excludedInvoiceIds,
    ...(blockedReason ? { blockedReason } : {})
  };
}

export function buildVoicePreCallHandlerContext(input: {
  account: BillingAccount;
  contact: Contact;
}): VoicePreCallHandlerContext {
  const verificationSource = determineHandlerVerificationSource(input);
  const verifiedContactStatus = !input.contact.isVerified
    ? "unverified"
    : verificationSource === "unknown"
      ? "unknown"
      : "verified";
  const currentAccountHandlerName =
    readString(input.account.metadata.currentAccountHandlerName) ??
    readString(input.contact.metadata.currentAccountHandlerName) ??
    readString(input.contact.metadata.invoicePaymentHandlerName) ??
    (verifiedContactStatus === "verified" ? input.contact.fullName : undefined);
  const currentAccountHandlerRole =
    readString(input.account.metadata.currentAccountHandlerRole) ??
    readString(input.contact.metadata.currentAccountHandlerRole) ??
    readString(input.contact.metadata.invoicePaymentHandlerRole) ??
    (verifiedContactStatus === "verified" ? input.contact.role : undefined);
  const currentHandlerContactId =
    readString(input.account.metadata.currentHandlerContactId) ??
    readString(input.contact.metadata.currentHandlerContactId) ??
    (verifiedContactStatus === "verified" ? input.contact.id : undefined);
  const currentContactMayNoLongerBeHandler =
    readAnyBoolean(
      [input.contact.metadata, input.account.metadata],
      [
        "currentContactMayNoLongerBeHandler",
        "handlerHandoffPending",
        "paymentHandlerChanged",
        "wrongHandler"
      ]
    ) === true;
  const knownNewHandlerName = readFirstString(
    [input.contact.metadata, input.account.metadata],
    ["knownNewHandlerName", "newHandlerName", "handoffNewHandlerName"]
  );
  const knownNewHandlerPhone = readFirstString(
    [input.contact.metadata, input.account.metadata],
    ["knownNewHandlerPhone", "newHandlerPhone", "handoffNewHandlerPhone"]
  );
  const knownNewHandlerEmail = readFirstString(
    [input.contact.metadata, input.account.metadata],
    ["knownNewHandlerEmail", "newHandlerEmail", "handoffNewHandlerEmail"]
  );
  const knownNewHandlerContactId = readFirstString(
    [input.contact.metadata, input.account.metadata],
    ["knownNewHandlerContactId", "newHandlerContactId", "handoffNewHandlerContactId"]
  );
  const knownNewHandlerVerified =
    readAnyBoolean(
      [input.contact.metadata, input.account.metadata],
      ["knownNewHandlerVerified", "newHandlerVerified", "handoffNewHandlerVerified"]
    ) === true;
  const knownNewHandlerExists = Boolean(
    knownNewHandlerName ?? knownNewHandlerPhone ?? knownNewHandlerEmail ?? knownNewHandlerContactId
  );
  const routingUpdateRecommended =
    currentContactMayNoLongerBeHandler ||
    knownNewHandlerExists ||
    readAnyBoolean(
      [input.contact.metadata, input.account.metadata],
      ["routingShouldBeUpdated", "routingUpdateRecommended", "routingChangeRequested"]
    ) === true;
  const handlerHandoffPossible =
    currentContactMayNoLongerBeHandler || knownNewHandlerExists || routingUpdateRecommended;
  const liveTransferPossible =
    handlerHandoffPossible && knownNewHandlerVerified && Boolean(knownNewHandlerPhone);
  const handlerHandoffBlockedReason = determineHandlerHandoffBlockedReason({
    handlerHandoffPossible,
    knownNewHandlerExists,
    knownNewHandlerVerified,
    knownNewHandlerPhone
  });

  return {
    contactId: input.contact.id,
    contactName: input.contact.fullName,
    contactRole: input.contact.role,
    verifiedContactStatus,
    verificationSource,
    ...(currentAccountHandlerName ? { currentAccountHandlerName } : {}),
    ...(currentAccountHandlerRole ? { currentAccountHandlerRole } : {}),
    ...(currentHandlerContactId ? { currentHandlerContactId } : {}),
    rightPartyCheckRequired: verifiedContactStatus !== "verified",
    handlerHandoffPossible,
    currentContactMayNoLongerBeHandler,
    ...(knownNewHandlerName ? { knownNewHandlerName } : {}),
    ...(knownNewHandlerPhone ? { knownNewHandlerPhone } : {}),
    ...(knownNewHandlerEmail ? { knownNewHandlerEmail } : {}),
    ...(knownNewHandlerContactId ? { knownNewHandlerContactId } : {}),
    knownNewHandlerVerified,
    routingUpdateRecommended,
    liveTransferPossible,
    followUpRequired: handlerHandoffPossible && !liveTransferPossible,
    ...(handlerHandoffBlockedReason ? { handlerHandoffBlockedReason } : {}),
    handoffCaptureFields: [
      "new_handler_name",
      "new_handler_role",
      "new_handler_phone",
      "new_handler_email",
      "handoff_reason",
      "can_reach_new_handler_now"
    ]
  };
}

function determineHandlerVerificationSource(input: {
  account: BillingAccount;
  contact: Contact;
}): VoicePreCallHandlerVerificationSource {
  const explicitSource =
    toHandlerVerificationSource(input.contact.metadata.handlerVerificationSource) ??
    toHandlerVerificationSource(input.contact.metadata.verificationSource) ??
    toHandlerVerificationSource(input.account.metadata.handlerVerificationSource);
  if (explicitSource) {
    return explicitSource;
  }

  if (
    readBoolean(input.contact.metadata.verifiedInvoicePaymentHandler) === true ||
    readBoolean(input.contact.metadata.invoicePaymentHandler) === true ||
    readBoolean(input.account.metadata.operatorVerifiedHandler) === true
  ) {
    return "operator_set";
  }

  if (
    readBoolean(input.contact.metadata.selfVerifiedPriorCall) === true ||
    readBoolean(input.contact.metadata.self_verified_prior_call) === true
  ) {
    return "self_verified_prior_call";
  }

  if (
    readBoolean(input.contact.metadata.historicalPaymentHandler) === true ||
    readBoolean(input.contact.metadata.historical_handler) === true
  ) {
    return "historical";
  }

  return "unknown";
}

function toHandlerVerificationSource(
  value: unknown
): VoicePreCallHandlerVerificationSource | undefined {
  if (
    value === "historical" ||
    value === "self_verified_prior_call" ||
    value === "operator_set" ||
    value === "unknown"
  ) {
    return value;
  }

  if (value === "operator_confirmed_ap_owner" || value === "operator_confirmed") {
    return "operator_set";
  }

  if (value === "prior_call" || value === "self_verified_prior") {
    return "self_verified_prior_call";
  }

  if (value === "contact_record" || value === "verified_contact_record") {
    return "historical";
  }

  return undefined;
}

function determineHandlerHandoffBlockedReason(input: {
  handlerHandoffPossible: boolean;
  knownNewHandlerExists: boolean;
  knownNewHandlerVerified: boolean;
  knownNewHandlerPhone?: string;
}): string | undefined {
  if (!input.handlerHandoffPossible) {
    return undefined;
  }

  if (!input.knownNewHandlerExists) {
    return "new_handler_unknown";
  }

  if (!input.knownNewHandlerVerified) {
    return "new_handler_unverified";
  }

  if (!input.knownNewHandlerPhone) {
    return "new_handler_missing_phone";
  }

  return undefined;
}

export function validateVoicePreCallSafety(input: {
  account: BillingAccount;
  contact: Contact;
  invoices: CustomerInvoice[];
  bucketOutput: InvoiceFollowUpBucketOutput;
  routingContext: VoicePreCallRoutingContext;
  handlerContext: VoicePreCallHandlerContext;
  callWindow: CollectionSendWindow;
  asOf: string;
  approvalRequestId?: string;
}): VoicePreCallSafetyDecision {
  const blockedReasons: VoicePreCallBlockReason[] = [];
  const rationale: string[] = [];
  const warnings = [
    "billing_account_context_preserved",
    ...(input.routingContext.branchIds.length > 0 ? ["branch_context_preserved"] : [])
  ];

  if (!input.contact.phone) {
    blockedReasons.push("missing_phone");
    rationale.push("No phone number is available for the selected contact.");
  }

  if (!input.contact.isVerified || !input.contact.allowAutoSend) {
    blockedReasons.push("unverified_contact");
    rationale.push("Automated calls require a verified contact that allows automated outreach.");
  }

  if (
    readBoolean(input.account.metadata.doNotCall) === true ||
    readBoolean(input.contact.metadata.doNotCall) === true
  ) {
    blockedReasons.push("do_not_call");
    rationale.push("The account or contact has a do-not-call flag.");
  }

  if (
    readBoolean(input.account.metadata.voiceAgentAllowed) === false ||
    readBoolean(input.contact.metadata.voiceAgentAllowed) === false
  ) {
    blockedReasons.push("voice_agent_disabled");
    rationale.push("Voice-agent outreach is disabled by account or contact policy metadata.");
  }

  if (input.account.status !== "active") {
    blockedReasons.push("inactive_account");
    rationale.push("The billing account is not active.");
  }

  if (input.invoices.some(isDisputedInvoice)) {
    blockedReasons.push("disputed_invoice");
    rationale.push("Disputed invoices are excluded from automated chase behavior.");
  }

  if (input.invoices.some((invoice) => invoice.state === "uploaded_unmatched")) {
    blockedReasons.push("erp_not_verified");
    rationale.push("Uploaded or provisional invoices are not ERP-verified receivables.");
  }

  if (input.invoices.some((invoice) => invoice.state === "writeback_failed")) {
    blockedReasons.push("erp_divergence");
    rationale.push("ERP divergence must be resolved before automated customer outreach.");
  }

  if (input.invoices.some((invoice) => invoice.state === "credit_pending")) {
    blockedReasons.push("credit_pending");
    rationale.push("Open credit handling may change the collectible balance.");
  }

  if (hasAmbiguousRouting(input.account, input.contact, input.invoices)) {
    blockedReasons.push("ambiguous_routing");
    rationale.push(
      "Invoices, account, and contact do not resolve to a single billing account route."
    );
  }

  if (hasCrossEntityAmbiguity(input.invoices)) {
    blockedReasons.push("cross_entity_ambiguity");
    rationale.push("Multiple seller entities are present in the invoice set.");
  }

  if (
    requiresBranchContext(input.account, input.contact) &&
    input.routingContext.branchIds.length === 0
  ) {
    blockedReasons.push("missing_branch_context");
    rationale.push("Branch context is required for collections routing but was not available.");
  }

  if (!isWithinCollectionSendWindow(input.asOf, input.callWindow)) {
    blockedReasons.push("outside_call_window");
    rationale.push("The call is outside the configured collections contact window.");
  }

  if (input.account.accountTier === "strategic" && !input.approvalRequestId) {
    blockedReasons.push("approval_required");
    rationale.push("Strategic accounts require approval before automated voice outreach.");
  }

  if (input.bucketOutput.balance_total <= 0) {
    blockedReasons.push("no_collectible_invoices");
    rationale.push("No eligible open ERP invoice balance is available for the call.");
  }

  if (input.handlerContext.handlerHandoffBlockedReason) {
    blockedReasons.push("handler_handoff_requires_review");
    rationale.push(
      "Known handler handoff data requires routing review before automated voice outreach."
    );
  }

  const dedupedReasons = [...new Set(blockedReasons)];

  return {
    allowed: dedupedReasons.length === 0,
    blockedReasons: dedupedReasons,
    warnings,
    rationale
  };
}

export function buildVoicePostCallPersistencePlan(
  input: VoicePostCallPersistencePlanInput
): VoicePostCallPersistencePlan {
  const actions: VoicePostCallPersistenceAction[] = [];

  if (input.contactHandoff) {
    actions.push({
      kind: "contact_handoff",
      title: "Review contact handoff",
      description:
        "The current handler said invoice handling moved to another person, so update contact routing only after verification.",
      requiresHumanReview: input.contactHandoff.verificationStatus !== "operator_verified",
      metadata: {
        currentContactId: input.contactHandoff.currentContactId ?? input.contactId,
        newHandlerName: input.contactHandoff.newHandlerName,
        newHandlerEmail: input.contactHandoff.newHandlerEmail,
        newHandlerPhone: input.contactHandoff.newHandlerPhone,
        newHandlerRole: input.contactHandoff.newHandlerRole,
        newHandlerReachable: input.contactHandoff.newHandlerReachable,
        verificationStatus: input.contactHandoff.verificationStatus ?? "unverified",
        notes: input.contactHandoff.notes
      }
    });

    if (input.contactHandoff.newHandlerReachable === false) {
      actions.push({
        kind: "next_step_follow_up",
        title: "Follow up with new handler",
        description: "The new invoice handler was identified but could not be reached immediately.",
        requiresHumanReview: false,
        metadata: {
          followUpReason: "handler_unreachable",
          newHandlerName: input.contactHandoff.newHandlerName,
          newHandlerPhone: input.contactHandoff.newHandlerPhone,
          newHandlerEmail: input.contactHandoff.newHandlerEmail
        }
      });
    }
  }

  if (input.routingChangeRequest) {
    actions.push({
      kind: "routing_change_request",
      title: "Review routing change request",
      description:
        "The call produced a requested account, branch, contact, or invoice routing change.",
      requiresHumanReview: true,
      metadata: {
        requestedRoutingLevel: input.routingChangeRequest.requestedRoutingLevel,
        requestedBillingAccountId: input.routingChangeRequest.requestedBillingAccountId,
        requestedBranchId: input.routingChangeRequest.requestedBranchId,
        requestedContactId: input.routingChangeRequest.requestedContactId,
        reason: input.routingChangeRequest.reason
      }
    });
  }

  if (input.promiseUpdate) {
    actions.push({
      kind: "promise_update",
      title: "Persist promise update",
      description:
        "A promise-to-pay signal was captured and should be reconciled against open invoice state.",
      requiresHumanReview: input.promiseUpdate.status === "broken",
      metadata: {
        promiseToPayId: input.promiseUpdate.promiseToPayId,
        invoiceIds: input.promiseUpdate.invoiceIds,
        promisedDate: input.promiseUpdate.promisedDate,
        promisedAmountCents: input.promiseUpdate.promisedAmountCents,
        currency: input.promiseUpdate.currency,
        status: input.promiseUpdate.status ?? "new",
        notes: input.promiseUpdate.notes
      }
    });
  }

  if (input.partialPaymentCommitment) {
    actions.push({
      kind: "partial_payment_commitment",
      title: "Review partial payment commitment",
      description:
        "The customer committed to only part of the balance, so preserve the commitment and route the remaining exposure for controlled follow-up.",
      // Partial payment handling changes the residual collections path and should stay reviewable.
      requiresHumanReview: true,
      metadata: {
        invoiceIds: input.partialPaymentCommitment.invoiceIds,
        promisedAmountCents: input.partialPaymentCommitment.promisedAmountCents,
        promisedDate: input.partialPaymentCommitment.promisedDate,
        currency: input.partialPaymentCommitment.currency,
        groupName: input.partialPaymentCommitment.groupName,
        remainderDisposition: input.partialPaymentCommitment.remainderDisposition,
        notes: input.partialPaymentCommitment.notes
      }
    });
  }

  if (input.paymentPlanRequest) {
    actions.push({
      kind: "payment_plan_request",
      title: "Review payment plan request",
      description:
        "The customer requested a payment plan or installment structure; do not negotiate terms automatically without approval.",
      // Product rules require human review for payment-plan language before any commitment is discussed.
      requiresHumanReview: true,
      metadata: {
        invoiceIds: input.paymentPlanRequest.invoiceIds,
        requestedInstallmentCount: input.paymentPlanRequest.requestedInstallmentCount,
        requestedAmountCents: input.paymentPlanRequest.requestedAmountCents,
        currency: input.paymentPlanRequest.currency,
        requestedCadence: input.paymentPlanRequest.requestedCadence,
        requestedFirstPaymentDate: input.paymentPlanRequest.requestedFirstPaymentDate,
        groupName: input.paymentPlanRequest.groupName,
        summary: input.paymentPlanRequest.summary,
        notes: input.paymentPlanRequest.notes
      }
    });
  }

  if (input.nonCommitment) {
    actions.push({
      kind: "non_commitment",
      title: "Record non-commitment outcome",
      description:
        "The customer did not commit to a promise-to-pay date, so keep the outcome structured for later follow-up and reporting.",
      requiresHumanReview: false,
      metadata: {
        invoiceIds: input.nonCommitment.invoiceIds,
        groupName: input.nonCommitment.groupName,
        reason: input.nonCommitment.reason,
        callbackRequested: input.nonCommitment.callbackRequested,
        notes: input.nonCommitment.notes
      }
    });
  }

  if (input.paidAlreadyClaim) {
    actions.push({
      kind: "paid_already_claim",
      title: "Review paid-already claim",
      description:
        "The customer reported payment already made; verify payment/remittance before changing receivable state.",
      requiresHumanReview: true,
      metadata: {
        invoiceIds: input.paidAlreadyClaim.invoiceIds,
        amountCents: input.paidAlreadyClaim.amountCents,
        currency: input.paidAlreadyClaim.currency,
        paidAt: input.paidAlreadyClaim.paidAt,
        reference: input.paidAlreadyClaim.reference,
        remittanceExpected: input.paidAlreadyClaim.remittanceExpected,
        notes: input.paidAlreadyClaim.notes
      }
    });
  }

  if (input.dispute) {
    actions.push({
      kind: "dispute",
      title: "Open dispute review",
      description:
        "The customer raised a dispute; stop automated chase on affected invoices until review is complete.",
      requiresHumanReview: true,
      metadata: {
        invoiceIds: input.dispute.invoiceIds,
        disputeType: input.dispute.disputeType,
        amountCents: input.dispute.amountCents,
        currency: input.dispute.currency,
        summary: input.dispute.summary,
        disputeScope: input.dispute.disputeScope,
        groupName: input.dispute.groupName,
        frozenScopeSummary: input.dispute.frozenScopeSummary,
        nextActionAfterDispute: input.dispute.nextActionAfterDispute,
        continuationReason: input.dispute.continuationReason
      }
    });
  }

  if (input.callback) {
    actions.push({
      kind: "callback",
      title: "Schedule callback",
      description: "The customer requested a callback.",
      requiresHumanReview: false,
      dueAt: input.callback.dueAt,
      metadata: {
        requestedAt: input.callback.requestedAt,
        dueAt: input.callback.dueAt,
        timezone: input.callback.timezone,
        notes: input.callback.notes
      }
    });
  }

  for (const followUpAction of input.followUpActions ?? []) {
    actions.push({
      kind: "next_step_follow_up",
      title: followUpAction.title,
      description: followUpAction.description ?? "Follow-up action captured from the call.",
      requiresHumanReview: followUpAction.requiresHumanReview ?? false,
      dueAt: followUpAction.dueAt,
      metadata: followUpAction.metadata ?? {}
    });
  }

  const operatorReviewRequired =
    input.operatorReviewRequired ?? actions.some((action) => action.requiresHumanReview);
  const handlerUnreachable =
    input.contactHandoff !== undefined && input.contactHandoff.newHandlerReachable === false;

  return {
    id: input.id ?? `voice_post_call_${input.communicationAttemptId}_${input.occurredAt}`,
    billingAccountId: input.billingAccountId,
    ...(input.parentAccountId ? { parentAccountId: input.parentAccountId } : {}),
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.contactId ? { contactId: input.contactId } : {}),
    communicationAttemptId: input.communicationAttemptId,
    ...(input.providerCallId ? { providerCallId: input.providerCallId } : {}),
    ...(input.preCallPlanId ? { preCallPlanId: input.preCallPlanId } : {}),
    occurredAt: input.occurredAt,
    disposition: input.disposition,
    actions,
    operatorReviewRequired,
    followUpSafeMode: handlerUnreachable
      ? "handler_unreachable"
      : operatorReviewRequired
        ? "manual_review"
        : "normal",
    auditSummary: summarizePostCallActions(actions)
  };
}

function buildVoicePreCallOutput(input: {
  bucketOutput: InvoiceFollowUpBucketOutput;
  handlerContext: VoicePreCallHandlerContext;
  priorityGroups: VoicePreCallPriorityGroup[];
  callPriorityGroups: VoicePreCallPriorityGroup[];
  account: BillingAccount;
}): VoicePreCallOutput {
  const callObjective = buildCallObjective({
    bucketOutput: input.bucketOutput,
    handlerContext: input.handlerContext,
    priorityGroups: input.callPriorityGroups
  });
  const callPriorityFlags = buildCallPriorityFlags({
    bucketOutput: input.bucketOutput,
    handlerContext: input.handlerContext,
    priorityGroups: input.callPriorityGroups,
    callObjective
  });
  return {
    ...input.bucketOutput,
    verified_contact_status: input.handlerContext.verifiedContactStatus,
    handler_verification_source: input.handlerContext.verificationSource,
    current_account_handler_name: input.handlerContext.currentAccountHandlerName ?? "",
    current_account_handler_role: input.handlerContext.currentAccountHandlerRole ?? "",
    current_handler_contact_id: input.handlerContext.currentHandlerContactId ?? "",
    right_party_check_required: input.handlerContext.rightPartyCheckRequired,
    handler_handoff_possible: input.handlerContext.handlerHandoffPossible,
    current_contact_may_no_longer_be_handler:
      input.handlerContext.currentContactMayNoLongerBeHandler,
    known_new_handler_name: input.handlerContext.knownNewHandlerName ?? "",
    known_new_handler_phone: input.handlerContext.knownNewHandlerPhone ?? "",
    known_new_handler_email: input.handlerContext.knownNewHandlerEmail ?? "",
    known_new_handler_contact_id: input.handlerContext.knownNewHandlerContactId ?? "",
    routing_update_recommended: input.handlerContext.routingUpdateRecommended,
    live_transfer_possible: input.handlerContext.liveTransferPossible,
    handoff_follow_up_required: input.handlerContext.followUpRequired,
    handler_handoff_blocked_reason: input.handlerContext.handlerHandoffBlockedReason ?? "",
    call_priority_plan: summarizePriorityPlan(input.callPriorityGroups),
    call_objective: callObjective,
    call_priority_flags: callPriorityFlags.join(","),
    operator_summary: buildOperatorSummary({
      account: input.account,
      bucketOutput: input.bucketOutput,
      handlerContext: input.handlerContext,
      priorityGroups: input.callPriorityGroups,
      callObjective
    }),
    debug_summary: buildDebugSummary({
      bucketOutput: input.bucketOutput,
      handlerContext: input.handlerContext,
      priorityGroups: input.callPriorityGroups,
      callObjective,
      callPriorityFlags
    })
  };
}

function buildVoicePreCallRoutingContext(input: {
  account: BillingAccount;
  contact: Contact;
  invoices: CustomerInvoice[];
}): VoicePreCallRoutingContext {
  const branchIds = [
    ...new Set(
      [
        input.account.branchId,
        input.contact.branchId,
        ...input.invoices.map((invoice) => invoice.branchId)
      ].filter((branchId): branchId is string => Boolean(branchId))
    )
  ];

  return {
    routingLevel: "billing_account",
    parentAccountId: input.account.parentAccountId,
    billingAccountId: input.account.id,
    contactId: input.contact.id,
    ...(branchIds.length === 1 ? { branchId: branchIds[0] } : {}),
    branchIds
  };
}

function isEligibleForAutomatedVoiceChase(invoice: CustomerInvoice): boolean {
  return (
    chaseableInvoiceStates.has(invoice.state) &&
    !isDisputedInvoice(invoice) &&
    readOpenCollectibleAmountCents(invoice) > 0
  );
}

function isBalanceBearingStatementInvoice(invoice: CustomerInvoice): boolean {
  return invoice.state !== "paid" && invoice.state !== "voided";
}

function toBucketLine(input: {
  invoice: CustomerInvoice;
  asOfDate?: string;
  preDueWindowDays: number;
  promiseAssessment: PromiseAssessment;
}): InvoiceFollowUpBucketLine {
  const dueDate = input.invoice.dueDate ? toDateOnly(input.invoice.dueDate) : undefined;
  const dateBucket =
    dueDate && input.asOfDate
      ? determineDateBucket({
          dueDate,
          asOfDate: input.asOfDate,
          preDueWindowDays: input.preDueWindowDays
        })
      : undefined;
  const daysPastDue =
    dateBucket === "overdue" && dueDate && input.asOfDate
      ? diffDays(dueDate, input.asOfDate)
      : undefined;

  return {
    invoiceId: input.invoice.id,
    invoiceNumber: input.invoice.invoiceNumber,
    currency: input.invoice.currency,
    amountCents: readOpenCollectibleAmountCents(input.invoice),
    ...(dueDate ? { dueDate } : {}),
    ...(daysPastDue !== undefined ? { daysPastDue } : {}),
    ...(input.invoice.branchId ? { branchId: input.invoice.branchId } : {}),
    ...(dateBucket ? { dateBucket } : {}),
    promiseStatus: input.promiseAssessment.status,
    ...(input.promiseAssessment.promiseToPayId
      ? { promiseToPayId: input.promiseAssessment.promiseToPayId }
      : {}),
    ...(input.promiseAssessment.promiseDate
      ? { promiseDate: input.promiseAssessment.promiseDate }
      : {}),
    ...(input.promiseAssessment.promiseState
      ? { promiseState: input.promiseAssessment.promiseState }
      : {}),
    ...(input.promiseAssessment.promisedAmountCents !== undefined
      ? { promisedAmountCents: input.promiseAssessment.promisedAmountCents }
      : {})
  };
}

interface PromiseAssessment {
  status: InvoicePromiseTreatmentStatus;
  promiseToPayId?: string;
  promiseDate?: string;
  promiseState?: PromiseToPayState;
  promisedAmountCents?: number;
}

function assessInvoicePromise(input: {
  invoice: CustomerInvoice;
  invoiceCount: number;
  promisesToPay: PromiseToPay[];
  asOfDate?: string;
}): PromiseAssessment {
  const relevantPromises = input.promisesToPay
    .filter((promise) => promise.billingAccountId === input.invoice.billingAccountId)
    .filter((promise) =>
      promiseReferencesInvoice({
        promise,
        invoiceId: input.invoice.id,
        invoiceCount: input.invoiceCount
      })
    )
    .map((promise) => ({
      promise,
      promiseDate: toDateOnly(promise.promiseDate),
      effectiveState:
        input.asOfDate && toDateOnly(promise.promiseDate)
          ? evaluatePromiseToPayState({
              promiseToPay: promise,
              asOfDate: input.asOfDate
            })
          : promise.state
    }));

  const brokenPromise = relevantPromises
    .filter((entry) => entry.effectiveState === "broken" || entry.promise.state === "broken")
    .sort(sortPromiseEntries)[0];
  if (brokenPromise) {
    return {
      status: "broken_promise",
      promiseToPayId: brokenPromise.promise.id,
      promiseDate: brokenPromise.promiseDate,
      promiseState: brokenPromise.effectiveState,
      promisedAmountCents: brokenPromise.promise.promisedAmountCents
    };
  }

  const activeFuturePromise = relevantPromises
    .filter(
      (entry) =>
        isActivePromiseState(entry.effectiveState) &&
        Boolean(entry.promiseDate) &&
        Boolean(input.asOfDate) &&
        compareDateOnly(entry.promiseDate ?? "", input.asOfDate ?? "") >= 0
    )
    .sort(sortPromiseEntries)[0];
  if (activeFuturePromise) {
    return {
      status: "active_future_promise",
      promiseToPayId: activeFuturePromise.promise.id,
      promiseDate: activeFuturePromise.promiseDate,
      promiseState: activeFuturePromise.effectiveState,
      promisedAmountCents: activeFuturePromise.promise.promisedAmountCents
    };
  }

  return {
    status: "no_promise"
  };
}

function promiseReferencesInvoice(input: {
  promise: PromiseToPay;
  invoiceId: string;
  invoiceCount: number;
}): boolean {
  const invoiceIds = [
    ...readStringArray(input.promise.metadata.invoiceIds),
    ...readStringArray(input.promise.metadata.invoice_ids),
    ...(readString(input.promise.metadata.invoiceId)
      ? [readString(input.promise.metadata.invoiceId) as string]
      : [])
  ];

  if (invoiceIds.length > 0) {
    return invoiceIds.includes(input.invoiceId);
  }

  return (
    input.invoiceCount === 1 || readBoolean(input.promise.metadata.appliesToBillingAccount) === true
  );
}

function isActivePromiseState(state: PromiseToPayState): boolean {
  return state === "accepted" || state === "due_today";
}

function sortPromiseEntries(
  left: { promise: PromiseToPay; promiseDate?: string },
  right: { promise: PromiseToPay; promiseDate?: string }
): number {
  const leftDate = left.promiseDate ?? "9999-12-31";
  const rightDate = right.promiseDate ?? "9999-12-31";
  return compareDateOnly(leftDate, rightDate);
}

function determineDateBucket(input: {
  dueDate: string;
  asOfDate: string;
  preDueWindowDays: number;
}): InvoiceFollowUpBucketLine["dateBucket"] {
  const comparison = compareDateOnly(input.dueDate, input.asOfDate);
  if (comparison < 0) {
    return "overdue";
  }
  if (comparison === 0) {
    return "due_today";
  }
  const daysUntilDue = diffDays(input.asOfDate, input.dueDate);
  return daysUntilDue <= input.preDueWindowDays ? "pre_due" : "routine";
}

function buildPriorityGroups(input: {
  brokenPromises: InvoiceFollowUpBucketLine[];
  overdueWithoutPromise: InvoiceFollowUpBucketLine[];
  dueTodayWithoutPromise: InvoiceFollowUpBucketLine[];
  preDueWithoutPromise: InvoiceFollowUpBucketLine[];
  activeFuturePromises: InvoiceFollowUpBucketLine[];
  routineWithoutPromise: InvoiceFollowUpBucketLine[];
}): VoicePreCallPriorityGroup[] {
  return [
    buildPriorityGroup({
      name: "broken_promises",
      rank: 1,
      label: "broken promises",
      invoices: input.brokenPromises,
      treatment: "Resolve missed promise status before discussing normal reminders.",
      treatmentMode: "recovery",
      retellInstruction:
        "Start with missed promise recovery. Ask what happened, request a concrete next step, and capture remittance evidence if payment was already made.",
      requiresFreshChase: true,
      confirmationOriented: false,
      summary: summarizePromiseTreatment(input.brokenPromises, "broken promise")
    }),
    buildPriorityGroup({
      name: "overdue_without_promise",
      rank: 2,
      label: "overdue without promise",
      invoices: input.overdueWithoutPromise,
      treatment: "Ask for payment timing or remittance advice on overdue invoices.",
      treatmentMode: "collection",
      retellInstruction:
        "Ask for payment timing or remittance advice on overdue invoices that do not have an active promise.",
      requiresFreshChase: true,
      confirmationOriented: false,
      summary: summarizeBucket(input.overdueWithoutPromise, "overdue")
    }),
    buildPriorityGroup({
      name: "due_today_without_promise",
      rank: 3,
      label: "due today without promise",
      invoices: input.dueTodayWithoutPromise,
      treatment: "Confirm today's expected payment timing.",
      treatmentMode: "collection",
      retellInstruction:
        "Confirm whether invoices due today are scheduled for payment today and capture expected timing.",
      requiresFreshChase: true,
      confirmationOriented: false,
      summary: summarizeBucket(input.dueTodayWithoutPromise, "due_today")
    }),
    buildPriorityGroup({
      name: "pre_due_without_promise",
      rank: 4,
      label: "pre-due without promise / at-risk",
      invoices: input.preDueWithoutPromise,
      treatment: "Confirm receipt and ask if anything blocks upcoming payment.",
      treatmentMode: "collection",
      retellInstruction:
        "Confirm receipt for upcoming invoices and ask whether any documents or blockers put payment at risk.",
      requiresFreshChase: true,
      confirmationOriented: false,
      summary: summarizeBucket(input.preDueWithoutPromise, "pre_due")
    }),
    buildPriorityGroup({
      name: "active_future_promises",
      rank: 5,
      label: "active future promises",
      invoices: input.activeFuturePromises,
      treatment: "Confirm active promise details; do not treat as a normal reminder.",
      treatmentMode: "confirmation",
      retellInstruction:
        "Confirm the existing promise date and amount. Do not treat these invoices as a fresh collection chase.",
      requiresFreshChase: false,
      confirmationOriented: true,
      summary: summarizePromiseTreatment(input.activeFuturePromises, "active promise")
    }),
    buildPriorityGroup({
      name: "routine_reminders",
      rank: 6,
      label: "routine reminders",
      invoices: input.routineWithoutPromise,
      treatment: "Use only if higher-priority groups are complete.",
      treatmentMode: "routine",
      retellInstruction:
        "Use as a low-priority receipt check only after higher-priority groups are complete.",
      requiresFreshChase: false,
      confirmationOriented: true,
      summary: summarizeRoutineReminder(input.routineWithoutPromise)
    })
  ].filter((group) => group.count > 0);
}

function buildPriorityGroup(input: {
  name: VoicePreCallPriorityGroupName;
  rank: number;
  label: string;
  invoices: InvoiceFollowUpBucketLine[];
  treatment: string;
  treatmentMode: VoicePreCallPriorityGroup["treatmentMode"];
  retellInstruction: string;
  requiresFreshChase: boolean;
  confirmationOriented: boolean;
  summary: string;
}): VoicePreCallPriorityGroup {
  return {
    name: input.name,
    rank: input.rank,
    label: input.label,
    invoiceIds: input.invoices.map((invoice) => invoice.invoiceId),
    count: input.invoices.length,
    totalCents: sumAmounts(input.invoices),
    summary: input.summary,
    treatment: input.treatment,
    treatmentMode: input.treatmentMode,
    retellInstruction: input.retellInstruction,
    requiresFreshChase: input.requiresFreshChase,
    confirmationOriented: input.confirmationOriented
  };
}

function hasNoPromise(invoice: InvoiceFollowUpBucketLine): boolean {
  return invoice.promiseStatus === "no_promise";
}

function readOpenCollectibleAmountCents(invoice: CustomerInvoice): number {
  const directCollectible = readInvoiceAmount(invoice, "collectibleAmountCents");
  if (directCollectible !== undefined) {
    return directCollectible;
  }

  const metadataOpenAmount = readPositiveInteger(invoice.metadata.openAmountCents);
  if (metadataOpenAmount !== undefined && metadataOpenAmount <= invoice.amountCents) {
    return metadataOpenAmount;
  }

  const metadataCollectible = readPositiveInteger(invoice.metadata.collectibleAmountCents);
  if (metadataCollectible !== undefined && metadataCollectible <= invoice.amountCents) {
    return metadataCollectible;
  }

  return getCollectibleAmountCents(invoice);
}

function readInvoiceAmount(
  invoice: CustomerInvoice,
  key: "collectibleAmountCents" | "disputedAmountCents"
): number | undefined {
  const amount = invoice[key];
  return typeof amount === "number" &&
    Number.isInteger(amount) &&
    amount >= 0 &&
    amount <= invoice.amountCents
    ? amount
    : undefined;
}

function hasAmbiguousRouting(
  account: BillingAccount,
  contact: Contact,
  invoices: CustomerInvoice[]
): boolean {
  const parentAccountIds = new Set(invoices.map((invoice) => invoice.parentAccountId));
  const billingAccountIds = new Set(invoices.map((invoice) => invoice.billingAccountId));
  const contactBillingMismatch =
    Boolean(contact.billingAccountId) && contact.billingAccountId !== account.id;
  const contactParentMismatch = contact.parentAccountId !== account.parentAccountId;

  return (
    parentAccountIds.size !== 1 ||
    !parentAccountIds.has(account.parentAccountId) ||
    billingAccountIds.size !== 1 ||
    !billingAccountIds.has(account.id) ||
    contactBillingMismatch ||
    contactParentMismatch
  );
}

function hasCrossEntityAmbiguity(invoices: CustomerInvoice[]): boolean {
  return (
    new Set(
      invoices
        .map((invoice) => invoice.sellerEntityId)
        .filter((sellerEntityId): sellerEntityId is string => Boolean(sellerEntityId))
    ).size > 1
  );
}

function requiresBranchContext(account: BillingAccount, contact: Contact): boolean {
  return (
    readAnyBoolean(
      [contact.metadata, account.metadata],
      ["branchRequiredForCollections", "requiresBranchContext", "branch_context_required"]
    ) === true
  );
}

function summarizeBucket(
  invoices: InvoiceFollowUpBucketLine[],
  bucketName: InvoiceFollowUpBucketName
): string {
  if (invoices.length === 0) {
    return "None";
  }

  return withOverflow(invoices, (invoice) => {
    const amount = formatMoney(invoice.amountCents, invoice.currency);
    const branchSuffix = invoice.branchId ? `, branch ${invoice.branchId}` : "";
    if (bucketName === "overdue") {
      return `${invoice.invoiceNumber}: ${amount}, ${invoice.daysPastDue ?? 0} days overdue${branchSuffix}`;
    }
    if (bucketName === "due_today") {
      return `${invoice.invoiceNumber}: ${amount}, due today${branchSuffix}`;
    }
    return `${invoice.invoiceNumber}: ${amount}, due ${invoice.dueDate ?? "soon"}${branchSuffix}`;
  });
}

function summarizePromiseTreatment(
  invoices: InvoiceFollowUpBucketLine[],
  label: "active promise" | "broken promise"
): string {
  if (invoices.length === 0) {
    return "None";
  }

  return withOverflow(invoices, (invoice) => {
    const amount = formatMoney(invoice.amountCents, invoice.currency);
    const promiseDate = invoice.promiseDate ? ` promised ${invoice.promiseDate}` : "";
    const branchSuffix = invoice.branchId ? `, branch ${invoice.branchId}` : "";
    return `${invoice.invoiceNumber}: ${amount}, ${label}${promiseDate}${branchSuffix}`;
  });
}

function summarizeDisputedInvoices(invoices: InvoiceFollowUpBucketLine[]): string {
  if (invoices.length === 0) {
    return "None";
  }

  return withOverflow(invoices, (invoice) => {
    const amount = formatMoney(invoice.amountCents, invoice.currency);
    const dueDate = invoice.dueDate ? `, due ${invoice.dueDate}` : "";
    const branchSuffix = invoice.branchId ? `, branch ${invoice.branchId}` : "";
    return `${invoice.invoiceNumber}: ${amount}, disputed${dueDate}${branchSuffix}`;
  });
}

function summarizeRoutineReminder(invoices: InvoiceFollowUpBucketLine[]): string {
  if (invoices.length === 0) {
    return "None";
  }

  return withOverflow(invoices, (invoice) => {
    const amount = formatMoney(invoice.amountCents, invoice.currency);
    return `${invoice.invoiceNumber}: ${amount}, due ${invoice.dueDate ?? "later"}`;
  });
}

function withOverflow(
  invoices: InvoiceFollowUpBucketLine[],
  formatter: (invoice: InvoiceFollowUpBucketLine) => string
): string {
  const visible = invoices.slice(0, 3).map(formatter);
  const remaining = invoices.length - visible.length;
  return remaining > 0 ? `${visible.join("; ")}; and ${remaining} more` : visible.join("; ");
}

function summarizePriorityPlan(groups: VoicePreCallPriorityGroup[]): string {
  if (groups.length === 0) {
    return "safe human review: no chaseable invoice groups";
  }

  return groups
    .map(
      (group, index) => `${index + 1}. ${group.label}: ${group.count} invoice(s), ${group.summary}`
    )
    .join(" | ");
}

function buildCallObjective(input: {
  bucketOutput: InvoiceFollowUpBucketOutput;
  handlerContext: VoicePreCallHandlerContext;
  priorityGroups: VoicePreCallPriorityGroup[];
}): VoicePreCallObjective {
  if (input.priorityGroups.length === 0 || input.bucketOutput.blocked_reason) {
    return "safe_human_review_required";
  }

  if (input.handlerContext.handlerHandoffPossible) {
    return "mixed_collections_call_with_handler_check";
  }

  const groupNames = new Set(input.priorityGroups.map((group) => group.name));
  const hasBrokenPromises = groupNames.has("broken_promises");
  const hasOverdueWithoutPromise = groupNames.has("overdue_without_promise");
  const hasDueTodayWithoutPromise = groupNames.has("due_today_without_promise");
  const hasPreDueWithoutPromise = groupNames.has("pre_due_without_promise");
  const hasActiveFuturePromises = groupNames.has("active_future_promises");
  const hasRoutineReminders = groupNames.has("routine_reminders");

  if (hasBrokenPromises && hasOverdueWithoutPromise) {
    return "recover_broken_promises_and_secure_unpromised_overdue";
  }

  if (hasBrokenPromises) {
    return "recover_broken_promises_and_confirm_existing_promises";
  }

  if (hasOverdueWithoutPromise && hasActiveFuturePromises) {
    return "secure_unpromised_overdue_and_confirm_existing_promises";
  }

  if (hasOverdueWithoutPromise && hasDueTodayWithoutPromise) {
    return "secure_unpromised_overdue_and_confirm_due_today";
  }

  if (hasOverdueWithoutPromise) {
    return "secure_unpromised_overdue";
  }

  if (hasDueTodayWithoutPromise || hasPreDueWithoutPromise) {
    return "confirm_due_today_and_pre_due_without_promise";
  }

  if (hasActiveFuturePromises && !hasRoutineReminders) {
    return "confirm_active_promises_only";
  }

  return "routine_reminder_only";
}

function buildCallPriorityFlags(input: {
  bucketOutput: InvoiceFollowUpBucketOutput;
  handlerContext: VoicePreCallHandlerContext;
  priorityGroups: VoicePreCallPriorityGroup[];
  callObjective: VoicePreCallObjective;
}): string[] {
  const flags = new Set<string>();
  flags.add(
    input.handlerContext.rightPartyCheckRequired
      ? "right_party_check_required"
      : "right_party_verified"
  );

  if (input.handlerContext.handlerHandoffPossible) {
    flags.add("handler_handoff_risk");
  }
  if (input.handlerContext.handlerHandoffBlockedReason) {
    flags.add("handler_handoff_requires_review");
  }
  if (input.bucketOutput.blocked_reason || input.priorityGroups.length === 0) {
    flags.add("safe_human_path");
  }
  if (input.bucketOutput.has_disputed_invoices) {
    flags.add("disputed_invoice_excluded");
  }
  if (input.bucketOutput.has_broken_promises) {
    flags.add("broken_promise_recovery");
  }
  if (input.bucketOutput.has_active_future_promises) {
    flags.add("active_promise_confirmation");
  }
  if (input.callObjective === "confirm_active_promises_only") {
    flags.add("confirmation_only");
  }

  return [...flags];
}

function buildOperatorSummary(input: {
  account: BillingAccount;
  bucketOutput: InvoiceFollowUpBucketOutput;
  handlerContext: VoicePreCallHandlerContext;
  priorityGroups: VoicePreCallPriorityGroup[];
  callObjective: VoicePreCallObjective;
}): string {
  const handlerNote = input.handlerContext.handlerHandoffPossible
    ? " Handler handoff risk is known; confirm handler before invoice treatment."
    : input.handlerContext.rightPartyCheckRequired
      ? " Right-party check is required before invoice treatment."
      : " Contact is verified as invoice-payment handler.";

  if (input.bucketOutput.blocked_reason || input.priorityGroups.length === 0) {
    return `${input.account.displayName}: safe human review required; ${input.bucketOutput.blocked_reason || "no_chaseable_groups"}.${handlerNote}`;
  }

  const firstGroup = input.priorityGroups[0];
  const summary = firstGroup
    ? `${input.account.displayName}: ${firstGroup.label} first; objective ${input.callObjective}.`
    : `${input.account.displayName}: no automated priority group.`;

  return `${summary}${handlerNote}`;
}

function buildDebugSummary(input: {
  bucketOutput: InvoiceFollowUpBucketOutput;
  handlerContext: VoicePreCallHandlerContext;
  priorityGroups: VoicePreCallPriorityGroup[];
  callObjective: VoicePreCallObjective;
  callPriorityFlags: string[];
}): string {
  const groups =
    input.priorityGroups
      .map((group) => `${group.rank}:${group.name}:${group.count}:${group.totalCents}`)
      .join("|") || "none";

  return [
    `objective=${input.callObjective}`,
    `groups=${groups}`,
    `flags=${input.callPriorityFlags.join(",") || "none"}`,
    `blocked=${input.bucketOutput.blocked_reason || "none"}`,
    `handler=${input.handlerContext.verifiedContactStatus}`,
    `right_party=${input.handlerContext.rightPartyCheckRequired}`,
    `handoff=${input.handlerContext.handlerHandoffPossible}`
  ].join("; ");
}

function earliestPromiseDate(invoices: InvoiceFollowUpBucketLine[]): string | undefined {
  return invoices
    .map((invoice) => invoice.promiseDate)
    .filter((value): value is string => Boolean(value))
    .sort(compareDateOnly)[0];
}

function summarizePostCallActions(actions: VoicePostCallPersistenceAction[]): string {
  if (actions.length === 0) {
    return "No post-call persistence actions were captured.";
  }

  return actions.map((action) => `${action.kind}: ${action.title}`).join("; ");
}

function sumAmounts(invoices: InvoiceFollowUpBucketLine[]): number {
  return invoices.reduce((sum, invoice) => sum + invoice.amountCents, 0);
}

function formatMoney(amountCents: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amountCents / 100)}`;
}

function compareDateOnly(left: string, right: string): number {
  return Date.parse(`${left}T00:00:00.000Z`) - Date.parse(`${right}T00:00:00.000Z`);
}

function diffDays(startDate: string, endDate: string): number {
  const diffMs = Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`);
  return Math.floor(diffMs / 86_400_000);
}

function toDateOnly(value: string): string | undefined {
  const candidate = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) && !Number.isNaN(Date.parse(candidate))
    ? candidate
    : undefined;
}

function toManilaDateOnly(value: string): string | undefined {
  const dateOnly = toDateOnly(value);
  if (dateOnly && value.length === 10) {
    return dateOnly;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return dateOnly;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(parsed);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : dateOnly;
}

function isDisputedInvoice(invoice: CustomerInvoice): boolean {
  const disputedAmount = readInvoiceAmount(invoice, "disputedAmountCents");
  const metadataDisputedAmount = readPositiveInteger(invoice.metadata.disputedAmountCents);
  return (
    invoice.state === "disputed_full" ||
    invoice.state === "disputed_partial" ||
    (disputedAmount ?? 0) > 0 ||
    (metadataDisputedAmount ?? 0) > 0
  );
}

function readPositiveInteger(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readFirstString(
  records: Array<Record<string, unknown>>,
  keys: string[]
): string | undefined {
  for (const record of records) {
    for (const key of keys) {
      const value = readString(record[key]);
      if (value) {
        return value;
      }
    }
  }

  return undefined;
}

function readAnyBoolean(
  records: Array<Record<string, unknown>>,
  keys: string[]
): boolean | undefined {
  for (const record of records) {
    for (const key of keys) {
      const value = readBoolean(record[key]);
      if (value !== undefined) {
        return value;
      }
    }
  }

  return undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
}
