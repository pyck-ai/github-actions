import { describe, expect, it } from "vitest";
import type { CheckResult } from "../checks/types.js";
import { buildJsonReport, formatJsonReport } from "./json.js";

const PASS: CheckResult = { index: 0, kind: "cmd", label: "on PATH: go", verdict: "pass" };
const FAIL: CheckResult = {
  index: 1,
  kind: "cmd",
  label: "on PATH: bogus",
  verdict: "fail",
  detail: "missing: bogus",
};

describe("buildJsonReport", () => {
  it("summarizes an all-pass result with exitCode 0", () => {
    const report = buildJsonReport("golang", "ghcr.io/pyck-ai/golang:latest", [PASS]);
    expect(report).toEqual({
      target: "golang",
      ref: "ghcr.io/pyck-ai/golang:latest",
      checks: [PASS],
      summary: { total: 1, passed: 1, failed: 0 },
      exitCode: 0,
    });
  });

  it("summarizes a mixed result with exitCode 1", () => {
    const report = buildJsonReport("golang", "ghcr.io/pyck-ai/golang:latest", [PASS, FAIL]);
    expect(report.summary).toEqual({ total: 2, passed: 1, failed: 1 });
    expect(report.exitCode).toBe(1);
  });

  it("handles zero checks", () => {
    const report = buildJsonReport("golang", "ghcr.io/pyck-ai/golang:latest", []);
    expect(report.summary).toEqual({ total: 0, passed: 0, failed: 0 });
    expect(report.exitCode).toBe(0);
  });

  it("does not alias the input array", () => {
    const input: CheckResult[] = [PASS];
    const report = buildJsonReport("t", "r", input);
    input.push(FAIL);
    expect(report.checks).toHaveLength(1);
  });
});

describe("formatJsonReport", () => {
  it("produces parseable, indented JSON", () => {
    const report = buildJsonReport("golang", "ghcr.io/pyck-ai/golang:latest", [PASS]);
    const text = formatJsonReport(report);
    expect(JSON.parse(text)).toEqual(report);
    expect(text).toContain("\n  ");
  });
});
