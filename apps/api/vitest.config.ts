import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@o2c/audit": fileURLToPath(new URL("../../packages/audit/src/index.ts", import.meta.url)),
      "@o2c/auth": fileURLToPath(new URL("../../packages/auth/src/index.ts", import.meta.url)),
      "@o2c/config": fileURLToPath(new URL("../../packages/config/src/index.ts", import.meta.url)),
      "@o2c/contracts": fileURLToPath(new URL("../../packages/contracts/src/index.ts", import.meta.url)),
      "@o2c/database": fileURLToPath(new URL("../../packages/database/src/index.ts", import.meta.url)),
      "@o2c/domain": fileURLToPath(new URL("../../packages/domain/src/index.ts", import.meta.url)),
      "@o2c/routing": fileURLToPath(new URL("../../packages/routing/src/index.ts", import.meta.url)),
      "@o2c/seed": fileURLToPath(new URL("../../packages/seed/src/index.ts", import.meta.url)),
      "@o2c/testkit": fileURLToPath(new URL("../../packages/testkit/src/index.ts", import.meta.url)),
      "@o2c/workflows": fileURLToPath(new URL("../../packages/workflows/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    passWithNoTests: true,
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test-env.ts"],
  }
});
