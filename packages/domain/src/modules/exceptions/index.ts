import { defineModule } from "../../shared/define-module.js";

export const exceptionsModule = defineModule({
  name: "exceptions",
  boundedContext: "operations",
  description: "Cross-module exception management and triage queues.",
  capabilities: ["exception routing", "priority queues", "case ownership"],
  integrations: ["workflow-engine", "alerting"],
  lifecycle: "draft"
});

export * from "./schema.js";
export * from "./machine.js";
export * from "./playbooks.js";
export * from "./service.js";
export * from "./errors.js";
