import { randomUUID } from "node:crypto";
import { buildDemoSeedBundle } from "@o2c/seed";
import {
  InMemoryTaskRepository,
  TaskWorkflowService,
} from "@o2c/workflows";

let seeded = false;
let taskService: TaskWorkflowService | undefined;

export async function getTaskService() {
  if (!taskService) {
    taskService = new TaskWorkflowService({
      repository: new InMemoryTaskRepository(),
      now: () => new Date().toISOString(),
      idGenerator: () => randomUUID(),
    });
  }

  if (!seeded) {
    seeded = true;
    await taskService.seed(buildDemoSeedBundle().tasks);
  }

  return taskService;
}
