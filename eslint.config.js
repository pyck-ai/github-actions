// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: ["ghcr-tidy/dist/**", "lib/**", "node_modules/**", "coverage/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // agent-docs-check/check.mjs is a plain Node script: no build step, no
    // bundle, run by the runner's own Node (and locally with `node`). It runs
    // under Node, so `process`, `console` and friends are legitimate
    // globals rather than undefined references.
    files: ["agent-docs-check/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        TextDecoder: "readonly",
      },
    },
  },
);
