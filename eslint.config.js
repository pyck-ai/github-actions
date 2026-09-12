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
    // tools/ holds plain Node scripts (the equivalence-oracle harness). They
    // are not bundled, not published, and not part of `npm test` — but they do
    // run under Node, so `process`, `console` and `Buffer` are legitimate
    // globals rather than undefined references.
    files: ["tools/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        TextDecoder: "readonly",
      },
    },
    rules: {
      // The oracle strips ANSI escapes from the bash side's output before
      // parsing verdicts, so matching \x1b is the point, not an accident.
      "no-control-regex": "off",
    },
  },
);
