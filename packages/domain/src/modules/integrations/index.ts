import { defineModule } from "../../shared/define-module.js";

export const integrationsModule = defineModule({
  name: "integrations",
  boundedContext: "platform",
  description: "Connector registry, credentials, and sync orchestration contracts.",
  capabilities: ["connector catalog", "sync lifecycle", "credential references"],
  integrations: ["erp", "crm", "banking"],
  lifecycle: "draft"
});

export * from "./email.js";
