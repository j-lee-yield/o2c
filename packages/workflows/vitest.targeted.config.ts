import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/remittance-ingestion.test.ts",
      "src/cash-application.test.ts",
      "src/collections-engine.test.ts"
    ]
  }
});
