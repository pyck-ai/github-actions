#!/usr/bin/env node
// gate: one pass/fail verdict for the jobs a workflow's gate job `needs`.
//
// Plain ESM, Node stdlib only, no build step: it runs as a `node24` JavaScript
// action on the runner's bundled Node and locally as
//   INPUT_NEEDS='{"lint":{"result":"success"}}' node gate/check.mjs
// Exit 1 if any job failed or was cancelled, or if `needs` is empty or not
// valid JSON; 0 otherwise. A skipped job passes.

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const FAILING = ["failure", "cancelled"];

/**
 * Judge the `needs` JSON string. Returns the verdict without touching the
 * environment, so the rules are testable on their own.
 * @param {string | undefined} raw
 * @returns {{ ok: boolean, jobs: { name: string, result: string }[], problem?: string }}
 */
export function judge(raw) {
  let needs;
  try {
    needs = JSON.parse(raw ?? "");
  } catch {
    return { ok: false, jobs: [], problem: "the needs input is not valid JSON" };
  }
  if (needs === null || typeof needs !== "object" || Array.isArray(needs)) {
    return { ok: false, jobs: [], problem: "the needs input is not a JSON object" };
  }
  const names = Object.keys(needs);
  if (names.length === 0) {
    return {
      ok: false,
      jobs: [],
      problem: "the needs input is empty: a gate that needs nothing gates nothing",
    };
  }
  const jobs = names.map((name) => ({ name, result: String(needs[name]?.result ?? "unknown") }));
  // An unknown result is not a pass: only the documented results are trusted.
  const passing = jobs.every((j) => j.result === "success" || j.result === "skipped");
  return { ok: passing, jobs };
}

function main(env) {
  const verdict = judge(env.INPUT_NEEDS);
  if (verdict.problem) console.log(`::error::gate: ${verdict.problem}`);
  for (const j of verdict.jobs) {
    if (j.result === "success" || j.result === "skipped") {
      console.log(`${j.name}: ${j.result}`);
    } else {
      const why = FAILING.includes(j.result) ? j.result : `unexpected result "${j.result}"`;
      console.log(`::error::gate: job ${j.name} did not pass (${why})`);
    }
  }
  if (env.GITHUB_STEP_SUMMARY) {
    const lines = ["## Gate", ""];
    if (verdict.problem) lines.push(`- ${verdict.problem}`);
    for (const j of verdict.jobs) lines.push(`- \`${j.name}\`: ${j.result}`);
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  }
  return verdict.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.env));
}
