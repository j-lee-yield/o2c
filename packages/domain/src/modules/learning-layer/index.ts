import { defineModule } from "../../shared/define-module.js";

export const learningLayerModule = defineModule({
  name: "learning_layer",
  boundedContext: "learning",
  description:
    "Explainable multi-channel behavior memory, supervision signals, and next-best-action scoring.",
  capabilities: [
    "event ingestion",
    "behavior profiling",
    "operator supervision",
    "next best action scoring",
  ],
  integrations: ["collections", "cash_application", "email", "sms", "voice"],
  lifecycle: "draft",
});

export * from "./schema.js";
export * from "./service.js";
export * from "./communications.js";
export * from "./customer-profiles.js";
