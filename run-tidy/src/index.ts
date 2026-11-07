import { productionOctokit } from "../../tidy-core/src/index.js";
import { main } from "./main.js";

// No top-level await: ncc bundles to CommonJS.
main({ env: process.env, octokit: productionOctokit }).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stdout.write(`::error::${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  },
);
