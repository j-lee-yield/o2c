import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@o2c/audit": fileURLToPath(new URL("../audit/src/index.ts", import.meta.url)),
      "@o2c/auth": fileURLToPath(new URL("../auth/src/index.ts", import.meta.url)),
      "@o2c/contracts": fileURLToPath(new URL("../contracts/src/index.ts", import.meta.url)),
      "@o2c/domain": fileURLToPath(new URL("../domain/src/index.ts", import.meta.url)),
      "@o2c/testkit": fileURLToPath(new URL("../testkit/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    passWithNoTests: true,
    include: ["src/**/*.test.ts"]
  }
});
