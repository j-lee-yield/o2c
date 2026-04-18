export type EntityId = string;
export type CurrencyCode = "PHP" | "USD";
export type AuditContext = {
    actorId: EntityId;
    actorType: "user" | "system" | "automation";
    correlationId: string;
    occurredAt: string;
};
export type SeedScenario = {
    code: string;
    description: string;
};
export * from "./collections/email.js";
export * from "./collections/replies.js";
export * from "./communications.js";
export * from "./communication-providers.js";
export * from "./ingestion/bir-invoice.js";
export * from "./ingestion/normalization.js";
export * from "./ingestion/perfios.js";
export * from "./ingestion/remittance.js";
export * from "./ingestion/review.js";
export * from "./invoices/index.js";
export * from "./integrations/connectors.js";
export * from "./integrations/framework.js";
export * from "./learning-ui.js";
export * from "./operator-console.js";
//# sourceMappingURL=index.d.ts.map