import {
  createTask,
  filterTasks,
  TaskNotFoundError,
  transitionTaskStatus,
  type Task,
  type TaskListFilter,
} from "@o2c/domain";
import type { Principal } from "@o2c/auth";

export interface TaskRepository {
  save(task: Task): Promise<void>;
  get(taskId: string): Promise<Task | undefined>;
  list(): Promise<Task[]>;
}

export class InMemoryTaskRepository implements TaskRepository {
  private readonly records = new Map<string, Task>();

  async save(task: Task): Promise<void> {
    this.records.set(task.id, structuredClone(task));
  }

  async get(taskId: string): Promise<Task | undefined> {
    const record = this.records.get(taskId);
    return record ? structuredClone(record) : undefined;
  }

  async list(): Promise<Task[]> {
    return [...this.records.values()].map((task) => structuredClone(task));
  }
}

export class TaskWorkflowService {
  private readonly now: () => string;
  private readonly idGenerator: (prefix: string) => string;

  constructor(
    private readonly deps: {
      repository: TaskRepository;
      now?: () => string;
      idGenerator?: (prefix: string) => string;
    },
  ) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.idGenerator = deps.idGenerator ?? ((prefix) => `${prefix}_${Date.now()}`);
  }

  async list(filter: TaskListFilter = {}) {
    return filterTasks(await this.deps.repository.list(), filter);
  }

  async listForCustomer(customerProfileId: string, filter: Omit<TaskListFilter, "customerProfileId"> = {}) {
    return this.list({ ...filter, customerProfileId });
  }

  async get(taskId: string) {
    const task = await this.deps.repository.get(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }
    return task;
  }

  async create(
    principal: Principal,
    input: Omit<Parameters<typeof createTask>[0], "id" | "occurredAt" | "actor"> & { id?: string; occurredAt?: string },
  ) {
    const occurredAt = input.occurredAt ?? this.now();
    const task = createTask({
      ...input,
      id: input.id ?? this.idGenerator("task"),
      occurredAt,
      actor: principalToActor(principal),
    });
    await this.deps.repository.save(task);
    return task;
  }

  async updateStatus(
    principal: Principal,
    input: {
      taskId: string;
      status: Task["status"];
      occurredAt?: string;
      summary?: string;
    },
  ) {
    const current = await this.get(input.taskId);
    const updated = transitionTaskStatus({
      task: current,
      nextStatus: input.status,
      occurredAt: input.occurredAt ?? this.now(),
      actor: principalToActor(principal),
      ...(input.summary ? { summary: input.summary } : {}),
    });
    await this.deps.repository.save(updated);
    return updated;
  }

  async seed(tasks: Task[]) {
    for (const task of tasks) {
      await this.deps.repository.save(task);
    }
  }
}

function principalToActor(principal: Principal) {
  return {
    actorId: principal.id,
    actorRole: "user" as const,
  };
}
