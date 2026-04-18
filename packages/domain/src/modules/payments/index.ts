import { defineModule } from "../../shared/define-module.js";

export const paymentsModule = defineModule({
  name: "payments",
  boundedContext: "cash-management",
  description: "Inbound payment records and settlement events.",
  capabilities: ["payment imports", "status tracking", "allocation hooks"],
  integrations: ["banking", "lockbox"],
  lifecycle: "draft"
});

