import type { FastifyInstance } from "fastify";
import { moduleRegistry } from "../bootstrap/module-registry.js";

const implementedRoutePrefixes = new Set([
  "/v1/accounts",
  "/v1/invoices",
  "/v1/learning_layer",
  "/v1/payments",
  "/v1/customer_profiles",
  "/v1/deductions",
  "/v1/credit_facilities",
  "/v1/control-center",
  "/v1/tasks",
]);

export const registerModules = (app: FastifyInstance): void => {
  for (const moduleDefinition of moduleRegistry) {
    if (implementedRoutePrefixes.has(moduleDefinition.routePrefix)) {
      continue;
    }

    app.get(moduleDefinition.routePrefix, async () => ({
      module: moduleDefinition.name,
      status: "not_implemented",
      capabilities: moduleDefinition.capabilities
    }));
  }
};
