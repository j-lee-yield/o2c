import { defineModule } from "../../shared/define-module.js";

export const creditFacilitiesModule = defineModule({
  name: "credit_facilities",
  boundedContext: "treasury",
  description:
    "Organization-side borrowing facilities, drawdowns, lender statements, repayments, tasks, and alerts.",
  capabilities: [
    "credit facility tracking",
    "loan statement normalization",
    "repayment application auditability",
    "borrowing dashboard and tasking",
  ],
  integrations: ["document_ai", "spreadsheet", "accounting", "approvals"],
  lifecycle: "draft",
});

export * from "./schema.js";
