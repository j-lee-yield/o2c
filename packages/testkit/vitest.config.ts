import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@o2c/contracts": fileURLToPath(new URL("../contracts/src/index.ts", import.meta.url)),
      "@o2c/domain": fileURLToPath(new URL("../domain/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    passWithNoTests: true,
    include: ["src/**/*.test.ts"]
  }
});
