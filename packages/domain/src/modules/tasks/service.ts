import {
  createEntityMetadata,
  evolveEntityMetadata,
  type ActorContext,
} from "../../shared/types.js";
import {
  InvalidTaskStatusTransitionError,
} from "./errors.js";
import type { Task, TaskKind, TaskListFilter, TaskPriority, TaskStatus, TaskSurface } from "./schema.js";

export function createTask(input: {
  id: string;
  title: string;
  description?: string;
  kind: TaskKind;
  origin: Task["origin"];
  surfaces: TaskSurface[];
  customerProfileId?: string;
  billingAccountId?: string;
  contactId?: string;
  branchId?: string;
  ownerId?: string;
  ownerRole?: Task["ownerRole"];
  ownerTeam?: string;
  source?: string;
  callId?: string;
  planId?: string;
  linkedInvoiceIds?: string[];
  priority?: TaskPriority;
  dueAt?: string;
  summary?: string;
  recommendedNextAction?: string;
  transcriptSnippet?: string;
  requiresHumanReview?: boolean;
  sourceLinks: Task["sourceLinks"];
  occurredAt: string;
  actor: ActorContext;
  metadata?: Record<string, unknown>;
}): Task {
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.occurredAt,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    kind: input.kind,
    taskType: input.kind,
    status: "open",
    origin: input.origin,
    surfaces: uniqueValues(input.surfaces),
    ...(input.customerProfileId ? { customerProfileId: input.customerProfileId } : {}),
    ...(input.billingAccountId ? { billingAccountId: input.billingAccountId } : {}),
    ...(input.contactId ? { contactId: input.contactId } : {}),
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.ownerId ? { ownerId: input.ownerId } : {}),
    ...(input.ownerRole ? { ownerRole: input.ownerRole } : {}),
    ...(input.ownerTeam ? { ownerTeam: input.ownerTeam } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.callId ? { callId: input.callId } : {}),
    ...(input.planId ? { planId: input.planId } : {}),
    ...(input.linkedInvoiceIds ? { linkedInvoiceIds: uniqueValues(input.linkedInvoiceIds) } : {}),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    ...(input.summary ? { summary: input.summary } : {}),
    ...(input.recommendedNextAction
      ? { recommendedNextAction: input.recommendedNextAction }
      : {}),
    ...(input.transcriptSnippet ? { transcriptSnippet: input.transcriptSnippet } : {}),
    ...(input.requiresHumanReview !== undefined
      ? { requiresHumanReview: input.requiresHumanReview }
      : {}),
    sourceLinks: cloneJson(input.sourceLinks),
    auditTrail: [
      {
        occurredAt: input.occurredAt,
        action: "task.created",
        actorId: input.actor.actorId,
        actorRole: input.actor.actorRole,
        summary: `Task created in ${input.surfaces.join(", ")}.`,
      },
    ],
    metadata: cloneJson(input.metadata ?? {}),
  };
}

export function transitionTaskStatus(input: {
  task: Task;
  nextStatus: TaskStatus;
  occurredAt: string;
  actor: ActorContext;
  summary?: string;
}): Task {
  if (input.task.status === input.nextStatus) {
    return input.task;
  }

  if (!canTransitionTaskStatus(input.task.status, input.nextStatus)) {
    throw new InvalidTaskStatusTransitionError(input.task.id, input.task.status, input.nextStatus);
  }

  const auditEntry = {
    occurredAt: input.occurredAt,
    action: `task.${input.nextStatus}`,
    actorId: input.actor.actorId,
    actorRole: input.actor.actorRole,
    summary: input.summary ?? buildDefaultStatusSummary(input.nextStatus),
  };
  const archiveAuditEntry =
    input.nextStatus === "completed"
      ? {
          occurredAt: input.occurredAt,
          action: "task.archived",
          actorId: input.actor.actorId,
          actorRole: input.actor.actorRole,
          summary: "Completed task archived from the active task list.",
        }
      : undefined;

  return {
    ...input.task,
    ...evolveEntityMetadata(input.task, {
      at: input.occurredAt,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    status: input.nextStatus,
    ...(input.nextStatus === "completed" ? { completedAt: input.occurredAt } : {}),
    ...(input.nextStatus === "completed" ? { archivedAt: input.occurredAt } : {}),
    ...(input.nextStatus === "closed" ? { closedAt: input.occurredAt } : {}),
    ...(input.nextStatus === "dismissed" ? { dismissedAt: input.occurredAt } : {}),
    ...(input.nextStatus === "deleted" ? { deletedAt: input.occurredAt } : {}),
    auditTrail: [
      ...input.task.auditTrail,
      auditEntry,
      ...(archiveAuditEntry ? [archiveAuditEntry] : []),
    ],
  };
}

export function filterTasks(tasks: Task[], filter: TaskListFilter = {}): Task[] {
  return tasks
    .filter((task) => {
      if (filter.status && task.status !== filter.status) {
        return false;
      }
      if (filter.origin && task.origin !== filter.origin) {
        return false;
      }
      if (filter.surface && !task.surfaces.includes(filter.surface)) {
        return false;
      }
      if (filter.kind && task.kind !== filter.kind && task.taskType !== filter.kind) {
        return false;
      }
      if (filter.priority && task.priority !== filter.priority) {
        return false;
      }
      if (filter.customerProfileId && task.customerProfileId !== filter.customerProfileId) {
        return false;
      }
      if (filter.billingAccountId && task.billingAccountId !== filter.billingAccountId) {
        return false;
      }
      if (filter.q && !taskMatchesSearch(task, filter.q)) {
        return false;
      }
      return true;
    })
    .sort(compareTasksForList);
}

export function canTransitionTaskStatus(current: TaskStatus, next: TaskStatus) {
  const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
    open: ["completed", "closed", "dismissed", "deleted"],
    completed: ["closed", "deleted"],
    closed: ["deleted"],
    dismissed: ["deleted"],
    deleted: [],
  };

  return allowedTransitions[current].includes(next);
}

function compareTasksForList(left: Task, right: Task) {
  const statusRank = taskStatusRank(left.status) - taskStatusRank(right.status);
  if (statusRank !== 0) {
    return statusRank;
  }

  const priorityRank = taskPriorityRank(left.priority) - taskPriorityRank(right.priority);
  if (priorityRank !== 0) {
    return priorityRank;
  }

  return right.createdAt.localeCompare(left.createdAt);
}

function taskStatusRank(status: TaskStatus) {
  switch (status) {
    case "open":
      return 0;
    case "completed":
      return 1;
    case "closed":
      return 2;
    case "dismissed":
      return 3;
    case "deleted":
      return 4;
  }
}

function taskPriorityRank(priority: TaskPriority | undefined) {
  switch (priority) {
    case "critical":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
    case "low":
      return 3;
    default:
      return 2;
  }
}

function buildDefaultStatusSummary(status: TaskStatus) {
  switch (status) {
    case "completed":
      return "Task marked completed.";
    case "closed":
      return "Task closed.";
    case "dismissed":
      return "Task dismissed.";
    case "deleted":
      return "Task deleted from the active task list.";
    case "open":
      return "Task reopened.";
  }
}

function uniqueValues<T>(values: T[]) {
  return [...new Set(values)];
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function taskMatchesSearch(task: Task, query: string) {
  const tokens = normalizeSearchTokens(query);
  if (tokens.length === 0) {
    return true;
  }

  const haystack = buildTaskSearchHaystack(task);
  return tokens.every((token) => haystack.includes(token));
}

function normalizeSearchTokens(query: string) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildTaskSearchHaystack(task: Task) {
  return [
    task.id,
    task.title,
    task.description,
    task.kind,
    task.taskType,
    task.customerProfileId,
    task.billingAccountId,
    task.contactId,
    task.branchId,
    task.ownerId,
    task.ownerTeam,
    task.source,
    task.callId,
    task.planId,
    ...(task.linkedInvoiceIds ?? []),
    task.summary,
    task.recommendedNextAction,
    task.transcriptSnippet,
    ...task.sourceLinks.flatMap((sourceLink) => [
      sourceLink.label,
      sourceLink.objectType,
      sourceLink.objectId,
      sourceLink.href,
      ...collectSearchValues(sourceLink.metadata),
    ]),
    ...collectSearchValues(task.metadata),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
}

function collectSearchValues(value: unknown, depth = 0): string[] {
  if (value === null || value === undefined || depth > 3) {
    return [];
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectSearchValues(item, depth + 1));
  }

  if (typeof value === "object") {
    return Object.values(value).flatMap((item) => collectSearchValues(item, depth + 1));
  }

  return [];
}
