import { defineModule } from "../../shared/define-module.js";

export const customerProfilesModule = defineModule({
  name: "customer_profiles",
  boundedContext: "crm",
  description:
    "Customer profile mastering, contact survivorship, duplicate resolution, and unified profile views.",
  capabilities: [
    "customer profile aggregate",
    "deduplication and merge review",
    "contact survivorship",
    "profile tasks and review queues",
  ],
  integrations: ["erp", "spreadsheet", "document_extraction", "learning-layer", "approvals"],
  lifecycle: "draft",
});

export * from "./schema.js";
export * from "./service.js";
