import { createOctokit } from "../../registry/index.js";
import { main } from "./main.js";

main({
  env: process.env,
  octokit: (token, baseUrl) => createOctokit(token, { baseUrl }),
}).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stdout.write(`::error::${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  },
);
