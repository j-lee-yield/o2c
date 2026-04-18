import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/domain/src/modules/exceptions/service.test.ts",
      "packages/workflows/src/remittance-ingestion.test.ts",
      "packages/workflows/src/cash-application.test.ts",
      "packages/workflows/src/collections-engine.test.ts"
    ]
  }
});
