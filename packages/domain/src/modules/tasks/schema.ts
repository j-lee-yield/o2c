import type { Role } from "@o2c/auth";
import type { DomainEntity } from "../../shared/types.js";

export const taskStatuses = ["open", "completed", "closed", "dismissed"] as const;

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
  kind: string;
  status: TaskStatus;
  origin: TaskOrigin;
  surfaces: TaskSurface[];
  customerProfileId?: string;
  billingAccountId?: string;
  ownerId?: string;
  ownerRole?: Role | "system";
  dueAt?: string;
  completedAt?: string;
  closedAt?: string;
  dismissedAt?: string;
  sourceLinks: TaskSourceLink[];
  auditTrail: TaskAuditEntry[];
  metadata: Record<string, unknown>;
}

export interface TaskListFilter {
  status?: TaskStatus;
  origin?: TaskOrigin;
  surface?: TaskSurface;
  customerProfileId?: string;
}
