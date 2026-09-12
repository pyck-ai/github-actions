import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["ghcr-tidy/src/**/*.test.ts", "registry/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["ghcr-tidy/src/**/*.ts", "registry/**/*.ts"],
      exclude: ["ghcr-tidy/src/**/*.test.ts", "registry/**/*.test.ts"],
    },
  },
});
