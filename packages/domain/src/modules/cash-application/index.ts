import { defineModule } from "../../shared/define-module.js";

export const cashApplicationModule = defineModule({
  name: "cash_application",
  boundedContext: "cash-management",
  description: "Matching, allocation, and unapplied cash workflow boundaries.",
  capabilities: ["matching rules", "allocation proposals", "exception escalations"],
  integrations: ["erp", "banking", "workflow-engine", "learning-layer"],
  lifecycle: "draft"
});
