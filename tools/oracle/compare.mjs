#!/usr/bin/env node
// The equivalence oracle's comparator: loads the bash side's captured logs
// (run-bash.mjs's output) and the TS side's `--json` report, and produces a
// per-target agreement table plus every full divergence. See this repo's
// oracle task spec for the exact agreement/triage rules this implements.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { TARGETS } from "./targets.mjs";
import { parseBashChecks, isInvalid } from "./parse-bash.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--bash-dir") args.bashDir = argv[(i += 1)];
    if (argv[i] === "--ts-json") args.tsJson = argv[(i += 1)];
  }
  if (args.bashDir === undefined || args.tsJson === undefined) {
    throw new Error("usage: compare.mjs --bash-dir <dir> --ts-json <file>");
  }
  return args;
}

async function loadBash(bashDir, bakeTarget) {
  const stdout = await readFile(path.join(bashDir, `${bakeTarget}.stdout.log`), "utf8");
  const stderr = await readFile(path.join(bashDir, `${bakeTarget}.stderr.log`), "utf8");
  const exitCode = Number(
    (await readFile(path.join(bashDir, `${bakeTarget}.exit`), "utf8")).trim(),
  );
  const wallMs = Number(
    (await readFile(path.join(bashDir, `${bakeTarget}.wallms`), "utf8")).trim(),
  );
  return {
    checks: parseBashChecks(stdout),
    exitCode,
    wallMs,
    invalid: isInvalid(stderr),
    stderr,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tsReport = JSON.parse(await readFile(args.tsJson, "utf8"));
  const tsByTarget = new Map(tsReport.targets.map((t) => [t.target, t]));

  const rows = [];
  const divergences = [];
  const skipped = [];

  for (const target of TARGETS) {
    const bake = target.bake;
    let bash;
    try {
      bash = await loadBash(args.bashDir, bake);
    } catch (error) {
      skipped.push({ target: bake, reason: `could not load bash output: ${String(error)}` });
      continue;
    }
    const ts = tsByTarget.get(bake);
    if (ts === undefined) {
      skipped.push({ target: bake, reason: "TS report has no entry for this target" });
      continue;
    }

    if (bash.invalid) {
      skipped.push({
        target: bake,
        reason: `bash run INVALID (stderr matched command-not-found/unbound-variable): ${bash.stderr.trim()}`,
      });
      continue;
    }

    const countMatch = bash.checks.length === ts.checks.length;
    let verdictAgreement = 0;
    const rowDivergences = [];
    const n = Math.max(bash.checks.length, ts.checks.length);
    for (let i = 0; i < n; i += 1) {
      const b = bash.checks[i];
      const t = ts.checks[i];
      if (b === undefined || t === undefined) {
        rowDivergences.push({
          index: i,
          bash: b ? `${b.verdict} ${b.label}` : "<missing>",
          ts: t ? `${t.verdict} ${t.label}` : "<missing>",
          kind: "index-out-of-range (count mismatch)",
        });
        continue;
      }
      if (b.verdict === t.verdict) {
        verdictAgreement += 1;
      } else {
        rowDivergences.push({
          index: i,
          bash: `${b.verdict} ${b.label}`,
          ts: `${t.verdict} ${t.kind}:${t.label}`,
        });
      }
    }

    const bashExit = bash.exitCode;
    const tsCheckExit = ts.summary.failed > 0 ? 1 : 0;
    const exitAgree = bashExit === tsCheckExit && (bashExit === 0 || bashExit === 1);

    const status = countMatch && rowDivergences.length === 0 && exitAgree ? "PASS" : "DIVERGE";

    rows.push({
      target: bake,
      bashChecks: bash.checks.length,
      tsChecks: ts.checks.length,
      countMatch,
      verdictAgreement,
      verdictTotal: n,
      bashExit,
      tsExit: tsCheckExit,
      exitAgree,
      wallMs: bash.wallMs,
      status,
    });

    if (status === "DIVERGE") {
      divergences.push({ target: bake, countMatch, exitAgree, rows: rowDivergences });
    }
  }

  console.log(JSON.stringify({ rows, divergences, skipped }, null, 2));
}

void main();
