import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@o2c/audit": fileURLToPath(new URL("../audit/src/index.ts", import.meta.url)),
      "@o2c/auth": fileURLToPath(new URL("../auth/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    passWithNoTests: true,
    include: ["src/**/*.test.ts"]
  }
});
