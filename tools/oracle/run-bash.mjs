#!/usr/bin/env node
// Runs every target's bash `verify.sh` against the locally pulled image
// (see ../../.imgverify.example.yaml's doc comment for the manifest this is
// checked against), exactly as `pyck-ai/baseimages`'s own `task verify`
// would invoke it per-image — `set -a && . ./buildargs.conf && set +a` is
// MANDATORY (see this repo's oracle task spec): without it the script
// aborts mid-run under `set -u` at the first unset `${SOME_VERSION}`.
//
// Writes one `<bake-target>.stdout.log` / `.stderr.log` / `.exit` per
// target under --out-dir. Does not itself judge pass/fail — see parse.mjs.

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { TARGETS, REGISTRY } from "./targets.mjs";

const BASEIMAGES_DIR = "/home/mkrupp/src/pyck/baseimages";

function parseArgs(argv) {
  const args = { outDir: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out-dir") {
      args.outDir = argv[(i += 1)];
    }
  }
  if (args.outDir === undefined) {
    throw new Error("--out-dir is required");
  }
  return args;
}

function runOne(target) {
  const ref = `${REGISTRY}/${target.localTag}`;
  const scriptArgs = target.variant !== undefined ? [ref, target.variant] : [ref];
  // MANDATORY: `set -a && . ./buildargs.conf && set +a` before invoking the
  // per-image verify.sh — see this module's doc comment.
  const shellCmd = [
    "set -a",
    ". ./buildargs.conf",
    "set +a",
    `./docker/${target.image}/verify.sh ${scriptArgs.map((a) => `'${a}'`).join(" ")}`,
  ].join(" && ");

  return new Promise((resolve) => {
    const child = spawn("bash", ["-c", shellCmd], {
      cwd: BASEIMAGES_DIR,
      env: { ...process.env, TERM: "dumb" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on("data", (c) => stdoutChunks.push(c));
    child.stderr.on("data", (c) => stderrChunks.push(c));
    child.on("close", (code) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode: code,
      });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.outDir, { recursive: true });

  for (const target of TARGETS) {
    const start = Date.now();
    process.stderr.write(`[bash] running ${target.bake} ...\n`);
    const result = await runOne(target);
    const wallMs = Date.now() - start;
    await writeFile(path.join(args.outDir, `${target.bake}.stdout.log`), result.stdout);
    await writeFile(path.join(args.outDir, `${target.bake}.stderr.log`), result.stderr);
    await writeFile(path.join(args.outDir, `${target.bake}.exit`), String(result.exitCode));
    await writeFile(path.join(args.outDir, `${target.bake}.wallms`), String(wallMs));
    process.stderr.write(
      `[bash] ${target.bake}: exit=${String(result.exitCode)} wall=${String(wallMs)}ms\n`,
    );
  }
}

void main();
