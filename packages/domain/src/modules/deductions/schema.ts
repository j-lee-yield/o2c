import type { ApprovalRequest } from "../approvals/schema.js";
import type { UploadedDocument } from "../documents/schema.js";
import type { DomainException } from "../exceptions/schema.js";
import type { CustomerInvoice } from "../invoices/schema.js";
import type { Payment } from "../payments/schema.js";
import type { DomainEntity } from "../../shared/types.js";

export const deductionCaseStates = [
  "open_new",
  "triaged",
  "gathering_support",
  "credit_memo_draft",
  "approval_pending",
  "sync_pending",
  "synced",
  "rejected",
  "closed",
] as const;

export type DeductionCaseState = (typeof deductionCaseStates)[number];

export const deductionQueueStatuses = [
  "new",
  "needs_documents",
  "ready_for_review",
  "credit_memo_in_progress",
  "approval_blocked",
  "sync_ready",
  "synced",
] as const;

export type DeductionQueueStatus = (typeof deductionQueueStatuses)[number];

export const deductionReasons = [
  "pricing",
  "short_shipment",
  "damaged_goods",
  "returns",
  "trade_promo",
  "tax",
  "logistics",
  "unclassified",
] as const;

export type DeductionReason = (typeof deductionReasons)[number];

export const deductionSourceChannels = ["email", "upload", "ap_portal", "erp", "manual"] as const;
export type DeductionSourceChannel = (typeof deductionSourceChannels)[number];

export const deductionPriorities = ["low", "medium", "high", "critical"] as const;
export type DeductionPriority = (typeof deductionPriorities)[number];

export const deductionLineItemStatuses = [
  "open",
  "under_review",
  "accepted",
  "rejected",
  "credited",
] as const;

export type DeductionLineItemStatus = (typeof deductionLineItemStatuses)[number];

export const claimStates = [
  "received",
  "validated",
  "needs_support",
  "rejected",
  "resolved",
] as const;

export type ClaimState = (typeof claimStates)[number];

export const deductionBundleStates = [
  "missing_documents",
  "partial",
  "complete",
  "submitted",
] as const;

export type DeductionDocumentBundleState = (typeof deductionBundleStates)[number];

export const creditMemoDraftStates = [
  "draft",
  "ready_for_review",
  "approval_pending",
  "approved",
  "sync_pending",
  "synced",
  "sync_failed",
  "cancelled",
] as const;

export type CreditMemoDraftState = (typeof creditMemoDraftStates)[number];

export interface DeductionCase extends DomainEntity {
  parentAccountId: string;
  billingAccountId: string;
  branchId?: string;
  invoiceId?: CustomerInvoice["id"];
  paymentId?: Payment["id"];
  exceptionId?: DomainException["id"];
  approvalRequestId?: ApprovalRequest["id"];
  externalClaimReference?: string;
  state: DeductionCaseState;
  queueStatus: DeductionQueueStatus;
  reasonCode: DeductionReason;
  priority: DeductionPriority;
  sourceChannel: DeductionSourceChannel;
  sourceJobId?: string;
  ownerRole?: string;
  detectedAt: string;
  openedAt: string;
  targetAmountCents: number;
  currency: string;
  metadata: Record<string, unknown>;
}

export interface DeductionLineItem extends DomainEntity {
  deductionCaseId: DeductionCase["id"];
  invoiceId?: CustomerInvoice["id"];
  paymentId?: Payment["id"];
  exceptionId?: DomainException["id"];
  claimId?: string;
  lineNumber: number;
  category: DeductionReason;
  description: string;
  quantity?: number;
  unitAmountCents?: number;
  disputedAmountCents: number;
  acceptedAmountCents?: number;
  status: DeductionLineItemStatus;
  metadata: Record<string, unknown>;
}

export interface Claim extends DomainEntity {
  deductionCaseId: DeductionCase["id"];
  invoiceId?: CustomerInvoice["id"];
  paymentId?: Payment["id"];
  exceptionId?: DomainException["id"];
  claimNumber: string;
  claimantName?: string;
  sourceChannel: DeductionSourceChannel;
  assertedAt: string;
  status: ClaimState;
  assertedAmountCents: number;
  currency: string;
  metadata: Record<string, unknown>;
}

export interface DeductionDocumentBundle extends DomainEntity {
  deductionCaseId: DeductionCase["id"];
  invoiceId?: CustomerInvoice["id"];
  paymentId?: Payment["id"];
  status: DeductionDocumentBundleState;
  completenessScore: number;
  missingDocumentTypes: UploadedDocument["documentType"][];
  documentIds: UploadedDocument["id"][];
  metadata: Record<string, unknown>;
}

export interface CreditMemoDraft extends DomainEntity {
  deductionCaseId: DeductionCase["id"];
  invoiceId?: CustomerInvoice["id"];
  paymentId?: Payment["id"];
  exceptionId?: DomainException["id"];
  approvalRequestId?: ApprovalRequest["id"];
  memoNumber?: string;
  state: CreditMemoDraftState;
  reasonCode: DeductionReason;
  currency: string;
  subtotalAmountCents: number;
  totalAmountCents: number;
  lastRefreshedAt: string;
  lastSyncedAt?: string;
  erpSyncStatus: "not_started" | "blocked" | "ready" | "synced" | "failed";
  metadata: Record<string, unknown>;
}

export interface CreditMemoDraftLine extends DomainEntity {
  creditMemoDraftId: CreditMemoDraft["id"];
  deductionLineItemId?: DeductionLineItem["id"];
  lineNumber: number;
  description: string;
  quantity?: number;
  unitAmountCents?: number;
  amountCents: number;
  taxCode?: string;
  metadata: Record<string, unknown>;
}
