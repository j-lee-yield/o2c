import type {
  VoiceDisputeContinuationDecision,
  VoiceDisputeFrozenScope,
  VoiceDisputeScope,
  VoicePreCallHandlerContext,
  VoicePreCallPriorityGroup,
  VoicePreCallPriorityGroupName
} from "@o2c/contracts";

export interface VoiceDisputeContinuationInput {
  disputeScope: VoiceDisputeScope;
  disputedInvoiceIds?: string[];
  currentGroup?: VoicePreCallPriorityGroup;
  remainingGroups: VoicePreCallPriorityGroup[];
  handlerContext: Pick<
    VoicePreCallHandlerContext,
    | "verifiedContactStatus"
    | "rightPartyCheckRequired"
    | "currentContactMayNoLongerBeHandler"
    | "routingUpdateRecommended"
    | "followUpRequired"
  >;
}

export interface VoiceDisputeScopeClassificationInput {
  explicitScope?: VoiceDisputeScope;
  summary?: string;
  notes?: string;
  disputedInvoiceIds?: string[];
  currentGroupInvoiceIds?: string[];
}

export function classifyVoiceDisputeScope(
  input: VoiceDisputeScopeClassificationInput
): VoiceDisputeScope {
  if (input.explicitScope) {
    return input.explicitScope;
  }

  const text = `${input.summary ?? ""} ${input.notes ?? ""}`.toLowerCase();
  if (
    /\b(wrong person|not the right person|not authorized|someone else|another person|new handler|new ap|handles this|handler|route|routing)\b/.test(
      text
    )
  ) {
    return "routing_or_handler_issue";
  }
  if (/\b(whole|entire|all|everything|full)\b/.test(text) && /\b(account|balance|soa|statement)\b/.test(text)) {
    return "whole_account_or_balance";
  }

  const disputedIds = unique(input.disputedInvoiceIds ?? []);
  if (disputedIds.length === 0) {
    return "unclear";
  }

  const currentGroupIds = unique(input.currentGroupInvoiceIds ?? []);
  if (
    currentGroupIds.length > 0 &&
    currentGroupIds.every((invoiceId) => disputedIds.includes(invoiceId))
  ) {
    return "current_group_only";
  }

  return "invoice_subset";
}

export function decideVoiceDisputeContinuation(
  input: VoiceDisputeContinuationInput
): VoiceDisputeContinuationDecision {
  const frozenScope = buildVoiceDisputeFrozenScope(input);
  const safeRemainingGroups = freezeVoiceDisputedScope(input.remainingGroups, frozenScope);
  const safeRemainingGroupsExist = safeRemainingGroups.length > 0;
  const contactAndRoutingSafe =
    input.handlerContext.verifiedContactStatus === "verified" &&
    !input.handlerContext.rightPartyCheckRequired &&
    !input.handlerContext.currentContactMayNoLongerBeHandler &&
    !input.handlerContext.routingUpdateRecommended &&
    !input.handlerContext.followUpRequired;

  if (input.disputeScope === "routing_or_handler_issue") {
    return {
      shouldContinueCall: false,
      nextAction: "switch_to_handler_handoff",
      continuationReason:
        "The dispute is about who handles the account, so invoice handling must stop and the call should switch to handler handoff.",
      frozenScope,
      safeRemainingGroupsExist,
      safeRemainingGroups
    };
  }

  if (input.disputeScope === "whole_account_or_balance") {
    return stopDecision({
      frozenScope,
      safeRemainingGroupsExist,
      safeRemainingGroups,
      reason:
        "The customer disputed the whole account or balance, so the collections sequence must stop for human review."
    });
  }

  if (input.disputeScope === "unclear") {
    return stopDecision({
      frozenScope,
      safeRemainingGroupsExist,
      safeRemainingGroups,
      reason:
        "The disputed scope is unclear, so the collections sequence must stop until an operator separates disputed and undisputed items."
    });
  }

  if (!contactAndRoutingSafe) {
    return stopDecision({
      frozenScope,
      safeRemainingGroupsExist,
      safeRemainingGroups,
      reason:
        "The dispute is narrow, but contact or routing safety is not confirmed enough to continue automated invoice handling."
    });
  }

  if (!safeRemainingGroupsExist) {
    return stopDecision({
      frozenScope,
      safeRemainingGroupsExist,
      safeRemainingGroups,
      reason:
        "The disputed scope was frozen and no clearly separate undisputed groups remain for this call."
    });
  }

  return {
    shouldContinueCall: true,
    nextAction: "continue_with_remaining_groups",
    continuationReason:
      "The disputed scope is narrow and frozen, and clearly separate undisputed groups remain with a verified safe contact.",
    frozenScope,
    safeRemainingGroupsExist,
    safeRemainingGroups
  };
}

export function freezeVoiceDisputedScope(
  groups: VoicePreCallPriorityGroup[],
  frozenScope: VoiceDisputeFrozenScope
): VoicePreCallPriorityGroup[] {
  const frozenInvoiceIds = new Set(frozenScope.invoiceIds);
  const frozenGroupNames = new Set(frozenScope.groupNames);

  return groups
    .filter((group) => !frozenGroupNames.has(group.name))
    .map((group) => {
      const invoiceIds = group.invoiceIds.filter((invoiceId) => !frozenInvoiceIds.has(invoiceId));
      const removedCount = group.invoiceIds.length - invoiceIds.length;
      if (removedCount === 0) {
        return group;
      }
      return {
        ...group,
        invoiceIds,
        count: invoiceIds.length
      };
    })
    .filter((group) => group.count > 0);
}

function buildVoiceDisputeFrozenScope(
  input: VoiceDisputeContinuationInput
): VoiceDisputeFrozenScope {
  const currentGroupName = input.currentGroup?.name;
  const currentGroupInvoiceIds = input.currentGroup?.invoiceIds ?? [];
  const disputedInvoiceIds = unique(input.disputedInvoiceIds ?? []);

  switch (input.disputeScope) {
    case "current_group_only":
      return {
        scope: input.disputeScope,
        invoiceIds: currentGroupInvoiceIds,
        groupNames: currentGroupName ? [currentGroupName] : [],
        summary: currentGroupName
          ? `Frozen current group ${currentGroupName} (${currentGroupInvoiceIds.length} invoice(s)).`
          : "Frozen the current disputed group."
      };
    case "invoice_subset":
      return {
        scope: input.disputeScope,
        invoiceIds: disputedInvoiceIds,
        groupNames: [],
        summary:
          disputedInvoiceIds.length > 0
            ? `Frozen ${disputedInvoiceIds.length} disputed invoice(s).`
            : "Frozen the disputed invoice subset."
      };
    case "whole_account_or_balance":
      return {
        scope: input.disputeScope,
        invoiceIds: unique([
          ...currentGroupInvoiceIds,
          ...input.remainingGroups.flatMap((group) => group.invoiceIds),
          ...disputedInvoiceIds
        ]),
        groupNames: uniqueNames([
          ...(currentGroupName ? [currentGroupName] : []),
          ...input.remainingGroups.map((group) => group.name)
        ]),
        summary: "Frozen the whole account or balance for human review."
      };
    case "routing_or_handler_issue":
      return {
        scope: input.disputeScope,
        invoiceIds: disputedInvoiceIds,
        groupNames: currentGroupName ? [currentGroupName] : [],
        summary: "Frozen invoice handling because the caller raised a routing or handler issue."
      };
    case "unclear":
      return {
        scope: input.disputeScope,
        invoiceIds: unique([...currentGroupInvoiceIds, ...disputedInvoiceIds]),
        groupNames: currentGroupName ? [currentGroupName] : [],
        summary: "Frozen the unclear disputed scope for human review."
      };
  }
}

function stopDecision(input: {
  frozenScope: VoiceDisputeFrozenScope;
  safeRemainingGroupsExist: boolean;
  safeRemainingGroups: VoicePreCallPriorityGroup[];
  reason: string;
}): VoiceDisputeContinuationDecision {
  return {
    shouldContinueCall: false,
    nextAction: "stop_and_escalate",
    continuationReason: input.reason,
    frozenScope: input.frozenScope,
    safeRemainingGroupsExist: input.safeRemainingGroupsExist,
    safeRemainingGroups: input.safeRemainingGroups
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function uniqueNames(values: VoicePreCallPriorityGroupName[]): VoicePreCallPriorityGroupName[] {
  return [...new Set(values)];
}
