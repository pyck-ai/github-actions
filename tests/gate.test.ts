import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// Runs gate/check.mjs as a child process the way the runner does: the `needs`
// input arrives as INPUT_NEEDS and the step summary path as GITHUB_STEP_SUMMARY.

const script = join(__dirname, "..", "gate", "check.mjs");
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function runGate(needs: string | undefined) {
  const dir = mkdtempSync(join(tmpdir(), "gate-tests-"));
  dirs.push(dir);
  const summary = join(dir, "summary.md");
  const env: Record<string, string> = {
    PATH: process.env["PATH"] ?? "",
    GITHUB_STEP_SUMMARY: summary,
  };
  if (needs !== undefined) env["INPUT_NEEDS"] = needs;
  const r = spawnSync(process.execPath, [script], { env, encoding: "utf8" });
  let written = "";
  try {
    written = readFileSync(summary, "utf8");
  } catch {
    // no summary written
  }
  return { status: r.status, stdout: r.stdout, summary: written };
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
});
