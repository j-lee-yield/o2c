import type { ImmutableActivityLogEntry } from "@o2c/audit";
import type {
  VoicePostCallGeneratedTask,
  VoicePostCallPersistenceAction,
  VoicePostCallPersistencePlan,
  VoicePostCallTaskType,
} from "@o2c/contracts";
import type { Task } from "@o2c/domain";

export interface VoicePostCallTaskPolicyConfig {
  repeatedBrokenPromiseThreshold: number;
  repeatedBrokenPromiseWindowDays: number;
}

export interface BuildVoicePostCallTasksInput {
  persistencePlan: VoicePostCallPersistencePlan;
  disposition: string;
  existingTasks: Task[];
  historicalActivityEntries?: ImmutableActivityLogEntry[];
  transcriptSummary?: string;
  transcriptSegments?: Array<{
    speaker: "agent" | "customer" | "unknown";
    text: string;
  }>;
  promisedDate?: string;
  promisedAmountCents?: number;
}

export function buildVoicePostCallTasks(
  input: BuildVoicePostCallTasksInput,
  config: VoicePostCallTaskPolicyConfig
): VoicePostCallGeneratedTask[] {
  const transcriptSnippet = buildTranscriptSnippet(
    input.transcriptSummary,
    input.transcriptSegments ?? []
  );
  const occurredAt = input.persistencePlan.occurredAt;
  const tasks: VoicePostCallGeneratedTask[] = [];
  const contactVerificationAction = input.persistencePlan.actions.find(
    (action) => action.kind === "contact_handoff"
  );
  const routingChangeAction = input.persistencePlan.actions.find(
    (action) => action.kind === "routing_change_request"
  );
  const disputeAction = input.persistencePlan.actions.find((action) => action.kind === "dispute");
  const callbackAction = input.persistencePlan.actions.find((action) => action.kind === "callback");
  const paymentPlanAction = input.persistencePlan.actions.find(
    (action) => action.kind === "payment_plan_request"
  );
  const partialPaymentAction = input.persistencePlan.actions.find(
    (action) => action.kind === "partial_payment_commitment"
  );
  const nonCommitmentAction = input.persistencePlan.actions.find(
    (action) => action.kind === "non_commitment"
  );
  const paidAlreadyAction = input.persistencePlan.actions.find(
    (action) => action.kind === "paid_already_claim"
  );
  const promiseUpdateAction = input.persistencePlan.actions.find(
    (action) => action.kind === "promise_update"
  );
  const nextStepFollowUpActions = input.persistencePlan.actions.filter(
    (action) => action.kind === "next_step_follow_up"
  );

  if (disputeAction) {
    tasks.push(
      buildTask({
        taskType: "invoice_dispute_review",
        persistencePlan: input.persistencePlan,
        action: disputeAction,
        occurredAt,
        transcriptSnippet,
        summary:
          "Customer raised a dispute that requires invoice-scope review before further collections activity.",
        recommendedNextAction:
          "Validate disputed invoice scope, freeze chase scope, and follow up with customer.",
        ownerTeam: "collections_billing_ops_customer_service",
        priority: "high",
        dueAt: shiftIso(occurredAt, 1),
        idempotencySuffix: normalizeInvoiceSuffix(disputeAction),
      })
    );
  }

  if (callbackAction) {
    tasks.push(
      buildTask({
        taskType: "account_manager_callback",
        persistencePlan: input.persistencePlan,
        action: callbackAction,
        occurredAt,
        transcriptSnippet,
        summary: "Customer asked for a callback from the account owner or collections team.",
        recommendedNextAction: "Call customer back in requested time window.",
        ownerTeam: "account_manager_collections",
        priority: "high",
        dueAt: resolveDueAt(callbackAction.dueAt, shiftIso(occurredAt, 1)),
      })
    );
  }

  if (paymentPlanAction) {
    tasks.push(
      buildTask({
        taskType: "payment_plan_review",
        persistencePlan: input.persistencePlan,
        action: paymentPlanAction,
        occurredAt,
        transcriptSnippet,
        summary:
          "Customer requested a payment plan that requires a controlled credit review path.",
        recommendedNextAction: "Review proposed payment plan and decide approval path.",
        ownerTeam: "credit_account_manager",
        priority: "high",
        dueAt: shiftIso(occurredAt, 1),
        idempotencySuffix: normalizeInvoiceSuffix(paymentPlanAction),
      })
    );
  }

  if (shouldCreatePromiseFollowUp(promiseUpdateAction, partialPaymentAction)) {
    const action = promiseUpdateAction ?? partialPaymentAction;
    if (action) {
      tasks.push(
        buildTask({
          taskType: "follow_up_promise_to_pay",
          persistencePlan: input.persistencePlan,
          action,
          occurredAt,
          transcriptSnippet,
          summary:
            "Customer made or updated a payment commitment that needs monitored follow-up.",
          recommendedNextAction:
            "Track the promised payment date and confirm remittance or payment evidence.",
          ownerTeam: "collections",
          priority: "medium",
          dueAt: resolveDueAt(
            readActionString(action, "promisedDate") || input.promisedDate,
            shiftIso(occurredAt, 1)
          ),
          idempotencySuffix: normalizeInvoiceSuffix(action),
        })
      );
    }
  }

  if (contactVerificationAction || input.disposition === "wrong_contact" || routingChangeNeedsContactReview(routingChangeAction)) {
    tasks.push(
      buildTask({
        taskType: "contact_verification_review",
        persistencePlan: input.persistencePlan,
        action: contactVerificationAction ?? routingChangeAction,
        occurredAt,
        transcriptSnippet,
        summary:
          input.disposition === "wrong_contact"
            ? "Voice outreach reached the wrong contact and routing needs verification."
            : "Call outcome indicates contact routing or handler ownership needs verification.",
        recommendedNextAction: "Verify correct AP contact and update routing.",
        ownerTeam: "collections_ops_master_data",
        priority: "high",
        dueAt: shiftIso(occurredAt, 1),
      })
    );
  }

  for (const nextStepAction of nextStepFollowUpActions) {
    tasks.push(
      buildTask({
        taskType: "support_request_follow_up",
        persistencePlan: input.persistencePlan,
        action: nextStepAction,
        occurredAt,
        transcriptSnippet,
        summary:
          nextStepAction.description || "Customer requested support or an operational follow-up during the call.",
        recommendedNextAction: nextStepAction.title || "Review and complete the requested support follow-up.",
        ownerTeam: "collections_support",
        priority: nextStepAction.requiresHumanReview ? "high" : "medium",
        dueAt: resolveDueAt(nextStepAction.dueAt, shiftIso(occurredAt, 2)),
        idempotencySuffix: nextStepAction.title,
      })
    );
  }

  if (nonCommitmentAction) {
    tasks.push(
      buildTask({
        taskType: "non_commitment_follow_up",
        persistencePlan: input.persistencePlan,
        action: nonCommitmentAction,
        occurredAt,
        transcriptSnippet,
        summary: "Customer could not commit to a payment date and follow-up needs review.",
        recommendedNextAction:
          "Review blockers and determine next outreach or escalation step.",
        ownerTeam: "collections_credit",
        priority: "medium",
        dueAt: shiftIso(occurredAt, 2),
        idempotencySuffix: normalizeInvoiceSuffix(nonCommitmentAction),
      })
    );
  }

  if (paidAlreadyAction) {
    tasks.push(
      buildTask({
        taskType: "payment_collection_follow_up",
        persistencePlan: input.persistencePlan,
        action: paidAlreadyAction,
        occurredAt,
        transcriptSnippet,
        summary:
          "Customer said payment was already made; verify remittance or payment evidence before changing invoice status.",
        recommendedNextAction:
          "Check remittance/payment records, match evidence to invoices, and update the account only after verification.",
        ownerTeam: "cash_application_collections",
        priority: "high",
        dueAt: shiftIso(occurredAt, 1),
        idempotencySuffix: normalizeInvoiceSuffix(paidAlreadyAction),
      })
    );
  }

  if (shouldCreateGoodToPayFollowUp(input, promiseUpdateAction)) {
    tasks.push(
      buildTask({
        taskType: "payment_collection_follow_up",
        persistencePlan: input.persistencePlan,
        occurredAt,
        transcriptSnippet,
        linkedInvoiceIds: collectInvoiceIds(input.persistencePlan.actions),
        summary:
          "Customer indicated readiness to pay, but the outcome is not covered by automated promise monitoring.",
        recommendedNextAction:
          "Follow up on committed payment and confirm remittance or collection readiness.",
        ownerTeam: "collections",
        priority: "medium",
        dueAt: resolveDueAt(input.promisedDate, shiftIso(occurredAt, 1)),
      })
    );
  }

  if (
    promiseUpdateAction &&
    readActionString(promiseUpdateAction, "status") === "broken" &&
    brokenPromiseEscalationTriggered(
      input.persistencePlan.billingAccountId,
      input.historicalActivityEntries ?? [],
      occurredAt,
      config
    )
  ) {
    tasks.push(
      buildTask({
        taskType: "broken_promise_escalation",
        persistencePlan: input.persistencePlan,
        action: promiseUpdateAction,
        occurredAt,
        transcriptSnippet,
        summary:
          "Repeated broken promises met the escalation threshold for senior collections review.",
        recommendedNextAction:
          "Escalate repeated broken promises to senior collections or credit.",
        ownerTeam: "credit_senior_collections_account_manager",
        priority: "critical",
        dueAt: shiftIso(occurredAt, 1),
        idempotencySuffix: normalizeInvoiceSuffix(promiseUpdateAction),
      })
    );
  }

  return tasks.filter((task) => !hasExistingTask(input.existingTasks, task.idempotencyKey));
}

function buildTask(input: {
  taskType: VoicePostCallTaskType;
  persistencePlan: VoicePostCallPersistencePlan;
  occurredAt: string;
  transcriptSnippet?: string;
  summary: string;
  recommendedNextAction: string;
  ownerTeam: string;
  priority: "medium" | "high" | "critical";
  dueAt: string;
  action?: VoicePostCallPersistenceAction;
  linkedInvoiceIds?: string[];
  idempotencySuffix?: string;
}): VoicePostCallGeneratedTask {
  const linkedInvoiceIds = input.linkedInvoiceIds ?? collectInvoiceIds(input.action ? [input.action] : []);
  const suffix = input.idempotencySuffix ? `:${input.idempotencySuffix}` : "";

  return {
    taskType: input.taskType,
    billingAccountId: input.persistencePlan.billingAccountId,
    ...(input.persistencePlan.contactId ? { contactId: input.persistencePlan.contactId } : {}),
    ...(input.persistencePlan.branchId ? { branchId: input.persistencePlan.branchId } : {}),
    source: "retell_call",
    ...(input.persistencePlan.providerCallId ? { callId: input.persistencePlan.providerCallId } : {}),
    ...(input.persistencePlan.preCallPlanId ? { planId: input.persistencePlan.preCallPlanId } : {}),
    linkedInvoiceIds,
    priority: input.priority,
    ownerTeam: input.ownerTeam,
    dueAt: input.dueAt,
    summary: input.summary,
    recommendedNextAction: input.recommendedNextAction,
    ...(input.transcriptSnippet ? { transcriptSnippet: input.transcriptSnippet } : {}),
    requiresHumanReview: true,
    status: "open",
    title: humanizeTaskTitle(input.taskType),
    description: input.summary,
    idempotencyKey: `${input.persistencePlan.communicationAttemptId}:${input.taskType}${suffix}`,
  };
}

function shouldCreateGoodToPayFollowUp(
  input: BuildVoicePostCallTasksInput,
  promiseUpdateAction: VoicePostCallPersistenceAction | undefined
) {
  if (promiseUpdateAction) {
    return false;
  }

  return input.disposition === "good_to_pay" || Boolean(input.promisedDate || input.promisedAmountCents);
}

function shouldCreatePromiseFollowUp(
  promiseUpdateAction: VoicePostCallPersistenceAction | undefined,
  partialPaymentAction: VoicePostCallPersistenceAction | undefined
) {
  if (partialPaymentAction) {
    return true;
  }
  if (!promiseUpdateAction) {
    return false;
  }

  const status = readActionString(promiseUpdateAction, "status");
  return status === "new" || status === "updated" || status === "kept" || status === "";
}

function brokenPromiseEscalationTriggered(
  billingAccountId: string,
  history: ImmutableActivityLogEntry[],
  occurredAt: string,
  config: VoicePostCallTaskPolicyConfig
) {
  const occurredAtFrom = shiftIso(occurredAt, -config.repeatedBrokenPromiseWindowDays);
  const uniqueSignals = new Set<string>();

  for (const entry of history) {
    if (entry.entityType !== "billing_account" || entry.entityId !== billingAccountId) {
      continue;
    }
    if (entry.action !== "collections.voice.post_call.promise_update") {
      continue;
    }
    if (entry.occurredAt < occurredAtFrom || entry.occurredAt > occurredAt) {
      continue;
    }
    const status = readNestedString(entry.after, ["metadata", "status"]);
    if (status !== "broken") {
      continue;
    }
    const attemptId = readString(entry.metadata, "communicationAttemptId")
      || readString(entry.metadata, "communication_attempt_id")
      || "unknown_attempt";
    const invoiceIds = readNestedStringArray(entry.after, ["metadata", "invoiceIds"]);
    const promiseId = readNestedString(entry.after, ["metadata", "promiseToPayId"]);
    uniqueSignals.add(`${attemptId}:${promiseId}:${invoiceIds.join(",")}`);
  }

  return uniqueSignals.size >= config.repeatedBrokenPromiseThreshold;
}

function routingChangeNeedsContactReview(action: VoicePostCallPersistenceAction | undefined) {
  if (!action) {
    return false;
  }
  return Boolean(
    readActionString(action, "requestedContactId") ||
      readActionString(action, "requestedRoutingLevel") === "billing_account"
  );
}

function collectInvoiceIds(actions: VoicePostCallPersistenceAction[]) {
  const invoiceIds = actions.flatMap((action) => {
    const raw = action.metadata.invoiceIds;
    return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
  });
  return [...new Set(invoiceIds)];
}

function hasExistingTask(existingTasks: Task[], idempotencyKey: string) {
  return existingTasks.some((task) => readString(task.metadata, "idempotencyKey") === idempotencyKey);
}

function normalizeInvoiceSuffix(action: VoicePostCallPersistenceAction) {
  const invoiceIds = collectInvoiceIds([action]);
  return invoiceIds.join(",");
}

function readActionString(action: VoicePostCallPersistenceAction, key: string) {
  return readString(action.metadata, key);
}

function buildTranscriptSnippet(
  transcriptSummary: string | undefined,
  segments: Array<{ speaker: "agent" | "customer" | "unknown"; text: string }>
) {
  if (transcriptSummary && transcriptSummary.trim().length > 0) {
    return transcriptSummary.trim();
  }

  const customerLines = segments
    .filter((segment) => segment.speaker === "customer")
    .map((segment) => segment.text.trim())
    .filter((text) => text.length > 0)
    .slice(0, 2);

  const joined = customerLines.join(" ");
  return joined.length > 280 ? `${joined.slice(0, 277)}...` : joined;
}

function shiftIso(iso: string, days: number) {
  const value = new Date(iso);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString();
}

function resolveDueAt(candidate: string | undefined, fallback: string) {
  if (!candidate || candidate.trim().length === 0) {
    return fallback;
  }
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function humanizeTaskTitle(taskType: VoicePostCallTaskType) {
  switch (taskType) {
    case "invoice_dispute_review":
      return "Invoice dispute review";
    case "follow_up_promise_to_pay":
      return "Payment promise follow-up";
    case "payment_collection_follow_up":
      return "Payment collection follow-up";
    case "account_manager_callback":
      return "Account manager callback";
    case "non_commitment_follow_up":
      return "Non-commitment follow-up";
    case "broken_promise_escalation":
      return "Broken promise escalation";
    case "contact_verification_review":
      return "Contact verification review";
    case "payment_plan_review":
      return "Payment plan review";
    case "support_request_follow_up":
      return "Support request follow-up";
  }
}

function readString(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

function readNestedString(
  value: Record<string, unknown> | null | undefined,
  path: string[]
): string {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return "";
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : "";
}

function readNestedStringArray(
  value: Record<string, unknown> | null | undefined,
  path: string[]
): string[] {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return [];
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return Array.isArray(current)
    ? current.filter((item): item is string => typeof item === "string")
    : [];
}
