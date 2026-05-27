import { describe, expect, it } from "vitest";
import type {
  VoiceDisputeScope,
  VoicePreCallHandlerContext,
  VoicePreCallPriorityGroup,
  VoicePreCallPriorityGroupName
} from "@o2c/contracts";
import {
  classifyVoiceDisputeScope,
  decideVoiceDisputeContinuation,
  freezeVoiceDisputedScope
} from "./dispute-continuation.js";

const safeHandlerContext: Pick<
  VoicePreCallHandlerContext,
  | "verifiedContactStatus"
  | "rightPartyCheckRequired"
  | "currentContactMayNoLongerBeHandler"
  | "routingUpdateRecommended"
  | "followUpRequired"
> = {
  verifiedContactStatus: "verified",
  rightPartyCheckRequired: false,
  currentContactMayNoLongerBeHandler: false,
  routingUpdateRecommended: false,
  followUpRequired: false
};

const overdueGroup = group({
  name: "overdue_without_promise",
  rank: 2,
  invoiceIds: ["inv_1", "inv_2"]
});
const dueTodayGroup = group({
  name: "due_today_without_promise",
  rank: 3,
  invoiceIds: ["inv_3"]
});
const activePromiseGroup = group({
  name: "active_future_promises",
  rank: 5,
  invoiceIds: ["inv_4"],
  treatmentMode: "confirmation"
});

describe("voice dispute continuation policy", () => {
  it("allows a narrow invoice dispute to continue with separate undisputed groups", () => {
    const decision = decideVoiceDisputeContinuation({
      disputeScope: "invoice_subset",
      disputedInvoiceIds: ["inv_1"],
      currentGroup: overdueGroup,
      remainingGroups: [dueTodayGroup, activePromiseGroup],
      handlerContext: safeHandlerContext
    });

    expect(decision).toMatchObject({
      shouldContinueCall: true,
      nextAction: "continue_with_remaining_groups",
      safeRemainingGroupsExist: true,
      frozenScope: {
        scope: "invoice_subset",
        invoiceIds: ["inv_1"],
        groupNames: []
      }
    });
    expect(decision.safeRemainingGroups.map((entry) => entry.name)).toEqual([
      "due_today_without_promise",
      "active_future_promises"
    ]);
  });

  it("allows a whole current-group dispute to continue only with later safe groups", () => {
    const decision = decideVoiceDisputeContinuation({
      disputeScope: "current_group_only",
      disputedInvoiceIds: ["inv_1", "inv_2"],
      currentGroup: overdueGroup,
      remainingGroups: [dueTodayGroup, activePromiseGroup],
      handlerContext: safeHandlerContext
    });

    expect(decision).toMatchObject({
      shouldContinueCall: true,
      nextAction: "continue_with_remaining_groups",
      frozenScope: {
        scope: "current_group_only",
        invoiceIds: ["inv_1", "inv_2"],
        groupNames: ["overdue_without_promise"]
      }
    });
    expect(decision.safeRemainingGroups.map((entry) => entry.name)).toEqual([
      "due_today_without_promise",
      "active_future_promises"
    ]);
  });

  it.each([
    ["whole_account_or_balance", "stop_and_escalate"],
    ["unclear", "stop_and_escalate"]
  ] as const)("stops safely for %s disputes", (disputeScope, nextAction) => {
    const decision = decideVoiceDisputeContinuation({
      disputeScope,
      disputedInvoiceIds: ["inv_1"],
      currentGroup: overdueGroup,
      remainingGroups: [dueTodayGroup],
      handlerContext: safeHandlerContext
    });

    expect(decision.shouldContinueCall).toBe(false);
    expect(decision.nextAction).toBe(nextAction);
  });

  it("switches routing or handler disputes to handoff instead of invoice handling", () => {
    const disputeScope = classifyVoiceDisputeScope({
      summary: "I am not the right person. Someone else handles this account now.",
      disputedInvoiceIds: ["inv_1"]
    });
    const decision = decideVoiceDisputeContinuation({
      disputeScope,
      disputedInvoiceIds: ["inv_1"],
      currentGroup: overdueGroup,
      remainingGroups: [dueTodayGroup],
      handlerContext: safeHandlerContext
    });

    expect(disputeScope).toBe("routing_or_handler_issue");
    expect(decision.shouldContinueCall).toBe(false);
    expect(decision.nextAction).toBe("switch_to_handler_handoff");
  });

  it("removes frozen invoices and groups from later automated chase handling", () => {
    const frozen = {
      scope: "invoice_subset" as const,
      invoiceIds: ["inv_3"],
      groupNames: ["active_future_promises" as VoicePreCallPriorityGroupName],
      summary: "Frozen disputed invoice and promise group."
    };

    const groups = freezeVoiceDisputedScope([dueTodayGroup, activePromiseGroup], frozen);

    expect(groups.map((entry) => entry.name)).toEqual([]);
  });
});

function group(input: {
  name: VoicePreCallPriorityGroupName;
  rank: number;
  invoiceIds: string[];
  treatmentMode?: VoicePreCallPriorityGroup["treatmentMode"];
}): VoicePreCallPriorityGroup {
  return {
    name: input.name,
    rank: input.rank,
    label: input.name,
    invoiceIds: input.invoiceIds,
    count: input.invoiceIds.length,
    totalCents: input.invoiceIds.length * 100_000,
    summary: `${input.invoiceIds.length} invoice(s)`,
    treatment: "test",
    treatmentMode: input.treatmentMode ?? "collection",
    retellInstruction: "test",
    requiresFreshChase: input.treatmentMode !== "confirmation",
    confirmationOriented: input.treatmentMode === "confirmation"
  };
}
