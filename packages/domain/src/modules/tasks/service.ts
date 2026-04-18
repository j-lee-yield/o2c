import {
  createEntityMetadata,
  evolveEntityMetadata,
  type ActorContext,
} from "../../shared/types.js";
import {
  InvalidTaskStatusTransitionError,
} from "./errors.js";
import type { Task, TaskListFilter, TaskStatus, TaskSurface } from "./schema.js";

export function createTask(input: {
  id: string;
  title: string;
  description?: string;
  kind: string;
  origin: Task["origin"];
  surfaces: TaskSurface[];
  customerProfileId?: string;
  billingAccountId?: string;
  ownerId?: string;
  ownerRole?: Task["ownerRole"];
  dueAt?: string;
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
    status: "open",
    origin: input.origin,
    surfaces: uniqueValues(input.surfaces),
    ...(input.customerProfileId ? { customerProfileId: input.customerProfileId } : {}),
    ...(input.billingAccountId ? { billingAccountId: input.billingAccountId } : {}),
    ...(input.ownerId ? { ownerId: input.ownerId } : {}),
    ...(input.ownerRole ? { ownerRole: input.ownerRole } : {}),
    ...(input.dueAt ? { dueAt: input.dueAt } : {}),
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

  return {
    ...input.task,
    ...evolveEntityMetadata(input.task, {
      at: input.occurredAt,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    status: input.nextStatus,
    ...(input.nextStatus === "completed" ? { completedAt: input.occurredAt } : {}),
    ...(input.nextStatus === "closed" ? { closedAt: input.occurredAt } : {}),
    ...(input.nextStatus === "dismissed" ? { dismissedAt: input.occurredAt } : {}),
    auditTrail: [
      ...input.task.auditTrail,
      {
        occurredAt: input.occurredAt,
        action: `task.${input.nextStatus}`,
        actorId: input.actor.actorId,
        actorRole: input.actor.actorRole,
        summary: input.summary ?? buildDefaultStatusSummary(input.nextStatus),
      },
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
      if (filter.customerProfileId && task.customerProfileId !== filter.customerProfileId) {
        return false;
      }
      return true;
    })
    .sort(compareTasksForList);
}

export function canTransitionTaskStatus(current: TaskStatus, next: TaskStatus) {
  const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
    open: ["completed", "closed", "dismissed"],
    completed: ["closed"],
    closed: [],
    dismissed: [],
  };

  return allowedTransitions[current].includes(next);
}

function compareTasksForList(left: Task, right: Task) {
  const statusRank = taskStatusRank(left.status) - taskStatusRank(right.status);
  if (statusRank !== 0) {
    return statusRank;
  }

  const leftDue = left.dueAt ?? left.createdAt;
  const rightDue = right.dueAt ?? right.createdAt;
  return leftDue.localeCompare(rightDue);
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
