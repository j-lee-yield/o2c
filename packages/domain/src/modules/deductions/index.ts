import { defineModule } from "../../shared/define-module.js";

export const deductionsModule = defineModule({
  name: "deductions",
  boundedContext: "deductions",
  description: "Deduction review, claims evidence, and credit memo orchestration.",
  capabilities: ["deduction queues", "claim reconciliation", "credit memo drafting"],
  integrations: ["uploads", "ap-portal", "erp", "workflow-engine"],
  lifecycle: "draft",
});

export * from "./schema.js";
