import { defineModule } from "../../shared/define-module.js";

export const approvalsModule = defineModule({
  name: "approvals",
  boundedContext: "governance",
  description: "Approval matrices, policy hooks, and decision tracking.",
  capabilities: ["approval chains", "policy checks", "decision auditability"],
  integrations: ["identity", "workflow-engine"],
  lifecycle: "draft"
});

export * from "./schema.js";
export * from "./errors.js";
export * from "./policy-engine.js";
export * from "./rules-engine.js";
export * from "./queue.js";
export * from "./repository.js";
export * from "./service.js";
