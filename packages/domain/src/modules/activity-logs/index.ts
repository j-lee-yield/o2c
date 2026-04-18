import { defineModule } from "../../shared/define-module.js";

export const activityLogsModule = defineModule({
  name: "activity_logs",
  boundedContext: "observability",
  description: "Tenant-scoped business activity streams and audit events.",
  capabilities: ["event timelines", "actor tracing", "cross-module auditing"],
  integrations: ["siem", "data-warehouse"],
  lifecycle: "draft"
});

