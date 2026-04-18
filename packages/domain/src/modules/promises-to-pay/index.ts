import { defineModule } from "../../shared/define-module.js";

export const promisesToPayModule = defineModule({
  name: "promises_to_pay",
  boundedContext: "collections",
  description: "Customer commitments, promise schedules, and follow-up states.",
  capabilities: ["promise capture", "follow-up queue", "collections visibility"],
  integrations: ["dialer", "crm"],
  lifecycle: "draft"
});

export * from "./schema.js";
export * from "./machine.js";
export * from "./service.js";
