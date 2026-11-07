import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "ghcr-tidy/src/**/*.test.ts",
      "branch-tidy/src/**/*.test.ts",
      "run-tidy/src/**/*.test.ts",
      "registry/**/*.test.ts",
      "tidy-core/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "ghcr-tidy/src/**/*.ts",
        "branch-tidy/src/**/*.ts",
        "run-tidy/src/**/*.ts",
        "registry/**/*.ts",
        "tidy-core/**/*.ts",
      ],
      exclude: [
        "ghcr-tidy/src/**/*.test.ts",
        "branch-tidy/src/**/*.test.ts",
        "run-tidy/src/**/*.test.ts",
        "registry/**/*.test.ts",
        "tidy-core/**/*.test.ts",
      ],
    },
  },
});
