import type { Role } from "@o2c/auth";
import type { BillingAccount, Contact } from "../accounts/schema.js";
import type { CustomerInvoice } from "../invoices/schema.js";

import { evaluateApprovalRequirement } from "./policy-engine.js";

export type SensitiveActionType =
  | "send_reminder"
  | "invoice_level_outreach"
  | "resend_document"
  | "resolve_payment_exception";

export interface CollectionsApprovalRuleInput {
  actionType: SensitiveActionType;
  account: BillingAccount;
  invoices?: CustomerInvoice[];
  contact?: Pick<Contact, "id" | "isVerified" | "allowAutoSend">;
  lowRisk: boolean;
  aiProposedSend?: boolean;
  exceptionKind?: string;
  balanceApprovalThresholdCents?: number;
  recipientConfidence?: number;
  lowRecipientConfidenceThreshold?: number;
  groupedReminderAmbiguousEntities?: boolean;
  isFirstOutboundContact?: boolean;
}

export interface CollectionsApprovalRuleDecision {
  requiresApproval: boolean;
  autoExecute: boolean;
  approverRole?: Role;
  reasonCode?: string;
  reasonCodes: string[];
  requestType: string;
  summary: string;
  priority: "high" | "normal";
  policyContext: Record<string, unknown>;
}

export function evaluateCollectionsApprovalRule(
  input: CollectionsApprovalRuleInput
): CollectionsApprovalRuleDecision {
  const balanceCents = input.invoices?.reduce((sum, invoice) => sum + invoice.amountCents, 0);
  const hasDisputedInvoice = input.invoices?.some(
    (invoice) => invoice.state === "disputed_partial" || invoice.state === "disputed_full"
  );
  const branchIds = input.invoices
    ?.map((invoice) => invoice.branchId)
    .filter((branchId): branchId is string => typeof branchId === "string");
  const decision = evaluateApprovalRequirement({
    subject: "outbound_message",
    action:
      input.actionType === "resend_document"
        ? "invoice_resend"
        : input.actionType === "invoice_level_outreach"
          ? "grouped_reminder"
          : "send_reminder",
    billingAccountId: input.account.id,
    parentAccountId: input.account.parentAccountId,
    ...(branchIds && branchIds.length > 0 ? { branchIds } : {}),
    accountTier: input.account.accountTier,
    isVipAccount: input.account.metadata.vip === true,
    isNewAccount:
      input.account.metadata.newAccount === true ||
      input.account.metadata.firstOutboundPending === true,
    ...(input.isFirstOutboundContact !== undefined
      ? { isFirstOutboundContact: input.isFirstOutboundContact }
      : {}),
    ...(hasDisputedInvoice !== undefined ? { hasDisputedInvoice } : {}),
    ...(balanceCents !== undefined ? { balanceCents } : {}),
    ...(input.balanceApprovalThresholdCents !== undefined
      ? { balanceApprovalThresholdCents: input.balanceApprovalThresholdCents }
      : {}),
    ...(input.recipientConfidence !== undefined
      ? { recipientConfidence: input.recipientConfidence }
      : {}),
    ...(input.lowRecipientConfidenceThreshold !== undefined
      ? { lowRecipientConfidenceThreshold: input.lowRecipientConfidenceThreshold }
      : {}),
    groupedReminderAmbiguousEntities:
      input.groupedReminderAmbiguousEntities || input.actionType === "invoice_level_outreach",
    verifiedContact: Boolean(input.contact?.isVerified && input.contact.allowAutoSend),
    lowRisk: input.lowRisk,
    policyMetadata: {
      actionType: input.actionType,
      contactId: input.contact?.id,
      aiProposedSend: input.aiProposedSend ?? false,
      exceptionKind: input.exceptionKind,
    },
  });

  if (input.actionType === "resolve_payment_exception" || input.exceptionKind) {
    return {
      requiresApproval: true,
      autoExecute: false,
      approverRole: "ar_manager",
      reasonCode: "payment_exception_resolution",
      reasonCodes: ["payment_exception_resolution"],
      requestType: "collections_exception_resolution",
      summary: "Approval required for payment exception resolution.",
      priority: "high",
      policyContext: {
        ...decision.policyContext,
        reasonCodes: ["payment_exception_resolution"],
      },
    };
  }

  return {
    requiresApproval: decision.requiresApproval,
    autoExecute: decision.autoExecute,
    ...(decision.assigneeRole ? { approverRole: decision.assigneeRole } : {}),
    ...(decision.reasonCodes[0] ? { reasonCode: decision.reasonCodes[0] } : {}),
    reasonCodes: decision.reasonCodes,
    requestType: decision.requestType,
    summary: decision.summary,
    priority: decision.priority,
    policyContext: {
      ...decision.policyContext,
      reasonCodes: decision.reasonCodes,
    },
  };
}
