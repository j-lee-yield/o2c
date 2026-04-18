import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const resolvePath = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@o2c/contracts": resolvePath("../contracts/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    passWithNoTests: true,
    include: ["src/**/*.test.ts"]
  }
});
