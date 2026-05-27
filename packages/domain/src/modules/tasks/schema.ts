import type { Role } from "@o2c/auth";
import type { DomainEntity } from "../../shared/types.js";

export const taskStatuses = ["open", "completed", "closed", "dismissed", "deleted"] as const;

export type TaskStatus = (typeof taskStatuses)[number];

export const taskOrigins = [
  "ai_generated",
  "system_generated",
  "workflow_generated",
  "manual",
] as const;

export type TaskOrigin = (typeof taskOrigins)[number];

export const taskSurfaces = [
  "home",
  "customers",
  "collections",
  "cash_app",
  "deductions",
  "org_credit_line",
] as const;

export type TaskSurface = (typeof taskSurfaces)[number];

export const taskKinds = [
  "review_bounce",
  "follow_up_promise_to_pay",
  "resend_documents",
  "resolve_wrong_contact",
  "review_dispute",
  "review_reply",
  "schedule_callback",
  "review_call",
  "review_duplicate_customer",
  "approve_primary_contact_change",
  "invoice_dispute_review",
  "follow_up_promise_to_pay",
  "payment_collection_follow_up",
  "account_manager_callback",
  "non_commitment_follow_up",
  "broken_promise_escalation",
  "contact_verification_review",
  "payment_plan_review",
  "support_request_follow_up",
] as const;

export type KnownTaskKind = (typeof taskKinds)[number];
export type TaskKind = KnownTaskKind | (string & {});

export const taskPriorities = ["low", "medium", "high", "critical"] as const;

export type TaskPriority = (typeof taskPriorities)[number];

export interface TaskSourceLink {
  label: string;
  objectType: string;
  objectId: string;
  href?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskAuditEntry {
  occurredAt: string;
  action: string;
  actorId: string;
  actorRole: Role | "system" | "user";
  summary: string;
}

export interface Task extends DomainEntity {
  title: string;
  description?: string;
  kind: TaskKind;
  taskType: TaskKind;
  status: TaskStatus;
  origin: TaskOrigin;
  surfaces: TaskSurface[];
  customerProfileId?: string;
  billingAccountId?: string;
  contactId?: string;
  branchId?: string;
  ownerId?: string;
  ownerRole?: Role | "system";
  ownerTeam?: string;
  source?: string;
  callId?: string;
  planId?: string;
  linkedInvoiceIds?: string[];
  priority?: TaskPriority;
  dueAt?: string;
  completedAt?: string;
  archivedAt?: string;
  closedAt?: string;
  dismissedAt?: string;
  deletedAt?: string;
  summary?: string;
  recommendedNextAction?: string;
  transcriptSnippet?: string;
  requiresHumanReview?: boolean;
  sourceLinks: TaskSourceLink[];
  auditTrail: TaskAuditEntry[];
  metadata: Record<string, unknown>;
}

export interface TaskListFilter {
  status?: TaskStatus;
  origin?: TaskOrigin;
  surface?: TaskSurface;
  kind?: TaskKind;
  priority?: TaskPriority;
  q?: string;
  customerProfileId?: string;
  billingAccountId?: string;
}
