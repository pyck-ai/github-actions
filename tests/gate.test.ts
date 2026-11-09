import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "../gate/check.mjs";

// Most tests call main() in-process: the `needs` input arrives as INPUT_NEEDS
// and the step summary path as GITHUB_STEP_SUMMARY, as on the runner. Two
// end-to-end tests spawn gate/check.mjs so the entry point stays covered.

const script = join(__dirname, "..", "gate", "check.mjs");
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function envFor(needs: string | undefined) {
  const dir = mkdtempSync(join(tmpdir(), "gate-tests-"));
  dirs.push(dir);
  const summary = join(dir, "summary.md");
  const env: Record<string, string> = { GITHUB_STEP_SUMMARY: summary };
  if (needs !== undefined) env["INPUT_NEEDS"] = needs;
  return { env, summary };
}

function readSummary(summary: string) {
  try {
    return readFileSync(summary, "utf8");
  } catch {
    return ""; // no summary written
  }
}

function runGate(needs: string | undefined) {
  const { env, summary } = envFor(needs);
  const lines: string[] = [];
  const status = main(env, (line) => lines.push(line));
  return { status, stdout: lines.join("\n"), summary: readSummary(summary) };
}

function spawnGate(needs: string) {
  const { env, summary } = envFor(needs);
  const r = spawnSync(process.execPath, [script], {
    env: { PATH: process.env["PATH"] ?? "", ...env },
    encoding: "utf8",
  });
  return { status: r.status, stdout: r.stdout, summary: readSummary(summary) };
}

const needs = (results: Record<string, string>) =>
  JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { result: v }])));

describe("gate", () => {
  it("passes when every job succeeded", () => {
    const r = runGate(needs({ lint: "success", test: "success" }));
    expect(r.status).toBe(0);
    expect(r.summary).toContain("`lint`: success");
    expect(r.summary).toContain("`test`: success");
  });

  it("passes when a job was skipped", () => {
    const r = runGate(needs({ lint: "success", deploy: "skipped" }));
    expect(r.status).toBe(0);
    expect(r.summary).toContain("`deploy`: skipped");
  });

  it("fails and names the job when one failed", () => {
    const r = runGate(needs({ lint: "success", test: "failure" }));
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("::error::gate: job test did not pass (failure)");
    expect(r.stdout).not.toContain("job lint");
  });

  it("fails when a job was cancelled", () => {
    const r = runGate(needs({ lint: "cancelled" }));
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("::error::gate: job lint did not pass (cancelled)");
  });

  it("names every failed job", () => {
    const r = runGate(needs({ a: "failure", b: "cancelled", c: "success" }));
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("job a did not pass");
    expect(r.stdout).toContain("job b did not pass");
    expect(r.stdout).not.toContain("job c");
  });

  it("fails on a result it does not know", () => {
    const r = runGate(needs({ lint: "weird" }));
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('unexpected result "weird"');
  });

  it("fails when needs is empty", () => {
    const r = runGate("{}");
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("::error::gate: the needs input is empty");
  });

  it("fails when needs is not valid JSON", () => {
    const r = runGate("not json");
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("::error::gate: the needs input is not valid JSON");
  });

  it("fails when needs is missing", () => {
    expect(runGate(undefined).status).toBe(1);
  });

  it("fails when needs is not an object", () => {
    expect(runGate("[]").status).toBe(1);
    expect(runGate("null").status).toBe(1);
  });

  describe("as a child process", () => {
    it("exits 0 and prints each job when every job passed", () => {
      const r = spawnGate(needs({ lint: "success" }));
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("lint: success");
      expect(r.summary).toContain("`lint`: success");
    });

    it("exits 1 and names the failed job", () => {
      const r = spawnGate(needs({ lint: "failure" }));
      expect(r.status).toBe(1);
      expect(r.stdout).toContain("::error::gate: job lint did not pass (failure)");
    });
  });
});
