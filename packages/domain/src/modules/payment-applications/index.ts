import { defineModule } from "../../shared/define-module.js";

export const paymentApplicationsModule = defineModule({
  name: "payment_applications",
  boundedContext: "cash-management",
  description: "Canonical records for how payments are allocated against invoices.",
  capabilities: ["allocation records", "application auditability", "writeback handoff"],
  integrations: ["erp", "workflow-engine"],
  lifecycle: "draft"
});
