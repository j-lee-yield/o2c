import type { Role } from "@o2c/auth";
import type { DomainEntity } from "../../shared/types.js";
import type { ApprovalRequest } from "../approvals/schema.js";
import type { BillingAccount, Branch, Contact, ParentAccount } from "../accounts/schema.js";
import type { DomainException } from "../exceptions/schema.js";
import type { CustomerInvoice } from "../invoices/schema.js";
import type { Payment } from "../payments/schema.js";
import type { Remittance } from "../remittances/schema.js";
import type { CustomerProfileReadModel } from "../learning-layer/customer-profiles.js";

export const customerProfileSources = [
  "erp_accounting",
  "spreadsheet_fallback",
  "document_extracted",
] as const;

export type CustomerProfileSource = (typeof customerProfileSources)[number];

export const customerProfileStatuses = [
  "active",
  "pending_review",
  "merged",
] as const;

export type CustomerProfileStatus = (typeof customerProfileStatuses)[number];

export const contactVerificationStates = ["unknown", "unverified", "verified"] as const;

export type ContactVerificationState = (typeof contactVerificationStates)[number];

export const customerProfileTaskTypes = [
  "send_grouped_reminder_draft",
  "request_remittance",
  "review_duplicate_customer",
  "approve_primary_contact_change",
  "resolve_merge_conflict",
] as const;

export type CustomerProfileTaskType = (typeof customerProfileTaskTypes)[number];

export const customerProfileTaskExecutionTypes = ["ai", "human"] as const;

export type CustomerProfileTaskExecutionType =
  (typeof customerProfileTaskExecutionTypes)[number];

export const customerProfileTaskStatuses = [
  "open",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type CustomerProfileTaskStatus = (typeof customerProfileTaskStatuses)[number];

export const mergeSuggestionStatuses = [
  "pending_review",
  "approved",
  "rejected",
  "auto_merged",
] as const;

export type MergeSuggestionStatus = (typeof mergeSuggestionStatuses)[number];

export interface CustomerProfileVerificationSnapshot {
  email: ContactVerificationState;
  phone: ContactVerificationState;
}

export interface CustomerProfileContact extends DomainEntity {
  profileId: string;
  fullName: string;
  email?: string;
  phone?: string;
  role: Contact["role"];
  isPrimaryCandidate: boolean;
  isPrimaryEmail: boolean;
  isPrimaryPhone: boolean;
  allowAutoSend: boolean;
  isVerified: boolean;
  verification: CustomerProfileVerificationSnapshot;
  sharedMailbox: boolean;
  sourcePriorities: CustomerProfileSource[];
  sourceContactIds: string[];
  survivorshipReasons: string[];
  recentSuccessfulResponses: number;
  metadata: Record<string, unknown>;
}

export interface CustomerProfileTaskAuditEntry {
  occurredAt: string;
  action: string;
  actorId: string;
  actorRole: Role | "system" | "user";
  summary: string;
}

export interface CustomerProfileTask extends DomainEntity {
  customerProfileId: string;
  executionType: CustomerProfileTaskExecutionType;
  taskType: CustomerProfileTaskType;
  status: CustomerProfileTaskStatus;
  ownerId?: string;
  ownerRole?: Role | "system";
  dueAt?: string;
  slaAt?: string;
  sourceObjectType: string;
  sourceObjectId: string;
  auditTrail: CustomerProfileTaskAuditEntry[];
  metadata: Record<string, unknown>;
}

export interface CustomerProfilePrimaryContactConflict extends DomainEntity {
  customerProfileId: string;
  existingPrimaryContactId?: string;
  suggestedPrimaryContactId: string;
  status: "pending_review" | "resolved" | "rejected";
  reasonSummary: string;
  taskId: string;
  approvalRequestId?: string;
  metadata: Record<string, unknown>;
}

export interface CustomerProfileMergeSignal {
  signal: string;
  weight: number;
  matchedValue?: string;
  exact: boolean;
}

export interface CustomerProfileMergeSuggestion extends DomainEntity {
  sourceProfileId: string;
  targetProfileId: string;
  confidence: number;
  status: MergeSuggestionStatus;
  threshold: number;
  autoMergeEligible: boolean;
  reasons: string[];
  signals: CustomerProfileMergeSignal[];
  reviewTaskId?: string;
  approvalRequestId?: string;
  metadata: Record<string, unknown>;
}

export interface CustomerProfile extends DomainEntity {
  status: CustomerProfileStatus;
  canonicalName: string;
  legalEntityName?: string;
  taxId?: string;
  parentAccountId?: string;
  parentAccountName?: string;
  billingAccountId?: string;
  billingAccountName?: string;
  branchIds: string[];
  branchNames: string[];
  primaryContactId?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  contactIds: string[];
  linkedInvoiceIds: string[];
  linkedPaymentIds: string[];
  linkedRemittanceIds: string[];
  linkedExceptionIds: string[];
  linkedApprovalRequestIds: string[];
  linkedTaskIds: string[];
  sourceKinds: CustomerProfileSource[];
  memorySummary?: CustomerProfileReadModel;
  mergedIntoProfileId?: string;
  metadata: Record<string, unknown>;
}

export interface CustomerProfileCandidateContactInput {
  id?: string;
  fullName: string;
  email?: string;
  phone?: string;
  role: Contact["role"];
  isPrimary?: boolean;
  isVerified?: boolean;
  allowAutoSend?: boolean;
  recentSuccessfulResponses?: number;
  metadata?: Record<string, unknown>;
}

export interface CustomerProfileHierarchyInput {
  parentAccount?: ParentAccount;
  billingAccount?: BillingAccount;
  branch?: Branch;
}

export interface CustomerProfileSourceReference {
  objectType: string;
  objectId: string;
}

export interface CustomerProfileIngestionPayload {
  id: string;
  source: CustomerProfileSource;
  occurredAt: string;
  hierarchy: CustomerProfileHierarchyInput;
  legalEntityName?: string;
  billingAccountName?: string;
  taxId?: string;
  contacts: CustomerProfileCandidateContactInput[];
  invoices?: CustomerInvoice[];
  payments?: Payment[];
  remittances?: Remittance[];
  exceptions?: DomainException[];
  approvals?: ApprovalRequest[];
  tasks?: CustomerProfileTask[];
  sourceReferences?: CustomerProfileSourceReference[];
  memorySummary?: CustomerProfileReadModel;
  metadata?: Record<string, unknown>;
}

export interface DuplicateScoreBreakdown {
  confidence: number;
  reasons: string[];
  signals: CustomerProfileMergeSignal[];
}

export const customerProfileTabIds = [
  "overview",
  "invoices",
  "tasks",
  "activity",
  "payments",
  "ap_portal",
  "deductions",
] as const;

export type CustomerProfileTabId = (typeof customerProfileTabIds)[number];

export interface CustomerProfileTab {
  id: CustomerProfileTabId;
  label: string;
  itemCount: number;
  status: "ready" | "attention" | "empty";
}

export interface CustomerOverviewSummary {
  canonicalName: string;
  legalEntityName?: string;
  taxId?: string;
  status: CustomerProfileStatus;
  accountTier: BillingAccount["accountTier"] | "unknown";
  parentAccountName?: string;
  billingAccountName?: string;
  branchNames: string[];
  hierarchySummary: string;
}

export interface CustomerContactSummary {
  totalContacts: number;
  verifiedContacts: number;
  autoSendEligibleContacts: number;
  sharedMailboxContacts: number;
  hasVerifiedPrimaryContact: boolean;
  primaryContact?: {
    id: string;
    fullName: string;
    email?: string;
    phone?: string;
    role: Contact["role"];
    allowAutoSend: boolean;
    isVerified: boolean;
  };
}

export interface CustomerInsightSummary {
  conciseSummary: string;
  preferredChannel?: CustomerProfileReadModel["preferredChannel"];
  nextBestAction?: CustomerProfileReadModel["nextBestAction"];
  remittanceQuality?: CustomerProfileReadModel["paymentBehaviorSnapshot"]["remittanceQuality"];
  centralizedPayerConfidence?: number;
  duplicateReviewPending: boolean;
  primaryContactReviewPending: boolean;
  explanation: string[];
}

export interface CustomerFinancialSummary {
  currency: string;
  openAmountCents: number;
  overdueAmountCents: number;
  collectibleAmountCents: number;
  disputedAmountCents: number;
  unappliedCashAmountCents: number;
  openInvoiceCount: number;
  overdueInvoiceCount: number;
  disputedInvoiceCount: number;
  paymentCount: number;
  remittanceCount: number;
  lastPaymentAt?: string;
}

export interface CustomerCompletenessCheckItem {
  id: string;
  label: string;
  status: "complete" | "warning" | "missing";
  detail: string;
}

export interface CustomerCompletenessCheck {
  score: number;
  completedCount: number;
  totalCount: number;
  status: "complete" | "warning" | "missing";
  items: CustomerCompletenessCheckItem[];
}

export interface CustomerProfileNote {
  id: string;
  kind: "system" | "operator" | "credit" | "collections";
  body: string;
  source: string;
  createdAt: string;
}

export interface CustomerCreditProfile {
  riskLevel: "low" | "medium" | "high" | "unknown";
  hasCreditHold: boolean;
  hasOverdueBalance: boolean;
  internalCreditLimitCents?: number;
  availableCreditCents?: number;
  blockedReasons: string[];
}

export interface CustomerIndexReadModel {
  profileId: string;
  canonicalName: string;
  status: CustomerProfileStatus;
  accountTier: BillingAccount["accountTier"] | "unknown";
  parentAccountId?: string;
  parentAccountName?: string;
  billingAccountId?: string;
  billingAccountName?: string;
  branchIds: string[];
  branchNames: string[];
  primaryContactEmail?: string;
  openAmountCents: number;
  overdueAmountCents: number;
  collectibleAmountCents: number;
  disputedAmountCents: number;
  openInvoiceCount: number;
  taskCount: number;
  completenessScore: number;
  nextAction: string;
  hasPendingReview: boolean;
  tabs: CustomerProfileTab[];
}

export interface CustomerProfileAggregateReadModel {
  profileId: string;
  overviewSummary: CustomerOverviewSummary;
  contactSummary: CustomerContactSummary;
  insightSummary: CustomerInsightSummary;
  financialSummary: CustomerFinancialSummary;
  completenessCheck: CustomerCompletenessCheck;
  notes: CustomerProfileNote[];
  creditProfile: CustomerCreditProfile;
  tabs: CustomerProfileTab[];
}

export interface DuplicateScoreCandidate {
  profile: CustomerProfile;
  breakdown: DuplicateScoreBreakdown;
}

export interface CustomerProfileReviewQueueItem {
  mergeSuggestion: CustomerProfileMergeSuggestion;
  sourceProfile?: CustomerProfile;
  targetProfile?: CustomerProfile;
  task?: CustomerProfileTask;
  approval?: ApprovalRequest;
}

export interface UnifiedCustomerProfileView {
  profile: CustomerProfile;
  hierarchy: {
    parentAccount?: ParentAccount;
    billingAccount?: BillingAccount;
    branches: Branch[];
  };
  contacts: CustomerProfileContact[];
  invoices: CustomerInvoice[];
  payments: Payment[];
  remittances: Remittance[];
  exceptions: DomainException[];
  approvals: ApprovalRequest[];
  tasks: CustomerProfileTask[];
  mergeSuggestions: CustomerProfileMergeSuggestion[];
  primaryContactConflict?: CustomerProfilePrimaryContactConflict;
  summary?: CustomerProfileReadModel;
  conciseSummary: string;
  customerIndexEntry: CustomerIndexReadModel;
  customerProfile: CustomerProfileAggregateReadModel;
}

export interface CustomerProfileMasteringPolicy {
  duplicate: {
    autoMergeMinConfidence: number;
    reviewMinConfidence: number;
    weights: {
      taxIdExact: number;
      legalEntityExact: number;
      legalEntityFuzzy: number;
      billingNameExact: number;
      billingNameFuzzy: number;
      emailDomainOverlap: number;
      phoneOverlap: number;
      branchOverlap: number;
      linkageOverlap: number;
    };
  };
  contacts: {
    sourcePriority: CustomerProfileSource[];
    sharedMailboxPrefixes: string[];
  };
}

export function defaultCustomerProfileMasteringPolicy(): CustomerProfileMasteringPolicy {
  return {
    duplicate: {
      // Product policy: anything below 99% must be reviewed by a human.
      autoMergeMinConfidence: 0.99,
      reviewMinConfidence: 0.1,
      weights: {
        taxIdExact: 0.52,
        legalEntityExact: 0.18,
        legalEntityFuzzy: 0.08,
        billingNameExact: 0.12,
        billingNameFuzzy: 0.05,
        emailDomainOverlap: 0.04,
        phoneOverlap: 0.06,
        branchOverlap: 0.04,
        linkageOverlap: 0.11,
      },
    },
    contacts: {
      sourcePriority: ["erp_accounting", "spreadsheet_fallback", "document_extracted"],
      sharedMailboxPrefixes: [
        "ap",
        "accountspayable",
        "accounts.payable",
        "finance",
        "treasury",
        "payables",
      ],
    },
  };
}
