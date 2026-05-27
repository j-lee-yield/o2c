import { defineModule } from "../../shared/define-module.js";

export * from "./schema.js";

export const accessControlModule = defineModule({
  name: "access_control",
  boundedContext: "auth",
  description: "Users, roles, permissions, scoped assignments, and approval authorities.",
  capabilities: [
    "user_management",
    "role_management",
    "scoped_authorization",
    "approval_authority_management",
  ],
  integrations: [],
  lifecycle: "active",
});
