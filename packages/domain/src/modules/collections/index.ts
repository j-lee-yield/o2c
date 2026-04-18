import { defineModule } from "../../shared/define-module.js";

export const collectionsModule = defineModule({
  name: "collections",
  boundedContext: "collections",
  description: "Collections strategies, queues, and customer outreach planning.",
  capabilities: ["strategy assignment", "queue segmentation", "outreach orchestration"],
  integrations: ["dialer", "email", "workflow-engine", "learning-layer"],
  lifecycle: "draft"
});

export * from "./schema.js";
export * from "./errors.js";
export * from "./service.js";
export * from "./workspace.js";
