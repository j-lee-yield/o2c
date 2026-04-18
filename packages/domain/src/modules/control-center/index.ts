import { defineModule } from "../../shared/define-module.js";

export const controlCenterModule = defineModule({
  name: "control-center",
  boundedContext: "collections",
  description: "Operator-configured multi-stage outreach workflows across email, voice, and SMS.",
  capabilities: ["workflow configuration", "template management", "channel-safe outreach policy"],
  integrations: ["email", "voice", "sms", "approval-engine", "audit-log"],
  lifecycle: "draft",
});

export * from "./schema.js";
export * from "./service.js";
