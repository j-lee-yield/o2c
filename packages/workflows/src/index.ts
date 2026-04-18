import type { AuditLogger } from "@o2c/audit";
import type { AuditContext } from "@o2c/contracts";
import {
  canAutoChaseInvoice,
  DisputedInvoiceAutoChaseBlockedError,
  StrategicAccountApprovalRequiredError,
  type BillingAccount,
  type CustomerInvoice,
} from "@o2c/domain";

export type CollectionState =
  | "queued"
  | "drafting"
  | "awaiting_approval"
  | "sent"
  | "blocked"
  | "completed";

export type CollectionActionDependencies = {
  auditLogger: AuditLogger;
};

export async function requestCollectionSend(params: {
  invoice: CustomerInvoice;
  account: BillingAccount;
  auditContext: AuditContext;
  deps: CollectionActionDependencies;
}): Promise<CollectionState> {
  const { invoice, account, auditContext, deps } = params;

  if (
    invoice.state === "disputed_partial" ||
    invoice.state === "disputed_full" ||
    !canAutoChaseInvoice(invoice)
  ) {
    throw new DisputedInvoiceAutoChaseBlockedError(invoice.id);
  }

  if (account.accountTier === "strategic") {
    throw new StrategicAccountApprovalRequiredError(account.id);
  }

  await deps.auditLogger.log(auditContext, {
    action: "collection.send_requested",
    entityId: invoice.id,
    entityType: "invoice",
    metadata: {
      billingAccountId: invoice.billingAccountId,
      branchKnown: Boolean(invoice.branchId),
    },
  });

  return "drafting";
}

// TODO(sprint-2): add explicit state machines for approvals, remittance ingestion, and cash application.
export * from "./collections-engine.js";
export * from "./collections-workspace.js";
export * from "./approvals-queue.js";
export * from "./bir-invoice-ingestion.js";
export * from "./bir-invoice-review-service.js";
export * from "./cash-application.js";
export * from "./communication-providers.js";
export * from "./control-center.js";
export * from "./customer-profile-mastering.js";
export * from "./gmail-api-adapter.js";
export * from "./ingestion-foundation.js";
export * from "./integration-sync.js";
export * from "./learning-events.js";
export * from "./outbound-email.js";
export * from "./outreach-intelligence-context.js";
export * from "./outreach-intelligence.js";
export * from "./outreach-provider-adapters.js";
export * from "./perfios-statement-ingestion.js";
export * from "./pilot-metrics.js";
export * from "./remittance-ingestion.js";
export * from "./tasks.js";
