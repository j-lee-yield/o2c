import type { TaskStatus } from "./schema.js";

export class TaskNotFoundError extends Error {
  constructor(readonly taskId: string) {
    super(`Task ${taskId} was not found.`);
    this.name = "TaskNotFoundError";
  }
}

export class InvalidTaskStatusTransitionError extends Error {
  constructor(
    readonly taskId: string,
    readonly fromStatus: TaskStatus,
    readonly toStatus: TaskStatus,
  ) {
    super(`Task ${taskId} cannot transition from ${fromStatus} to ${toStatus}.`);
    this.name = "InvalidTaskStatusTransitionError";
  }
}
