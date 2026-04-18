import { defineModule } from "../../shared/define-module.js";
export const accountsModule = defineModule({
    name: "accounts",
    boundedContext: "crm",
    description: "Tenant-scoped customer accounts and account hierarchies.",
    capabilities: ["tenant isolation", "party master data", "account lifecycle"],
    integrations: ["erp", "crm"],
    lifecycle: "draft"
});
//# sourceMappingURL=index.js.map