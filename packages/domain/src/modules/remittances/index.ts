import { defineModule } from "../../shared/define-module.js";

export const remittancesModule = defineModule({
  name: "remittances",
  boundedContext: "cash-management",
  description: "Remittance advice capture and parsing workflow hooks.",
  capabilities: ["document ingestion", "reference matching", "parser handoff"],
  integrations: ["email", "sftp", "edi"],
  lifecycle: "draft"
});

