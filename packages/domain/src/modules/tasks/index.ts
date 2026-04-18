import { defineModule } from "../../shared/define-module.js";

export const tasksModule = defineModule({
  name: "tasks",
  boundedContext: "operations",
  description:
    "First-class operator tasks spanning customer workflows, collections, cash application, deductions, and credit controls.",
  capabilities: [
    "global task inbox",
    "per-customer task views",
    "source-linked task routing",
    "auditable task status changes",
  ],
  integrations: ["workflow-engine", "collections", "cash-application", "approvals"],
  lifecycle: "draft",
});

export * from "./schema.js";
export * from "./errors.js";
export * from "./service.js";
