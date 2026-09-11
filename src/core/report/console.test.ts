import { describe, expect, it } from "vitest";
import type { CheckResult } from "../../imgverify/checks/types.js";
import { formatConsoleReport } from "./console.js";

const PASS: CheckResult = { index: 0, kind: "cmd", label: "on PATH: go", verdict: "pass" };
const FAIL: CheckResult = {
  index: 1,
  kind: "cmd",
  label: "on PATH: bogus",
  verdict: "fail",
  detail: "missing: bogus",
};

describe("formatConsoleReport", () => {
  it("renders a checkmark line for a pass, no colour when color: false", () => {
    const output = formatConsoleReport([PASS], { color: false });
    expect(output).toBe("  ✓ on PATH: go\n  all 1 checks passed");
  });

  it("renders a cross line plus an indented detail for a fail", () => {
    const output = formatConsoleReport([FAIL], { color: false });
    expect(output).toBe("  ✗ on PATH: bogus\n      missing: bogus\n  1 of 1 checks failed");
  });

  it("tallies mixed pass/fail correctly", () => {
    const output = formatConsoleReport([PASS, FAIL, PASS], { color: false });
    expect(output.split("\n").at(-1)).toBe("  1 of 3 checks failed");
  });

  it("omits the detail line when a fail has no detail", () => {
    const noDetailFail: CheckResult = { index: 0, kind: "sh", label: "smoke", verdict: "fail" };
    const output = formatConsoleReport([noDetailFail], { color: false });
    expect(output).toBe("  ✗ smoke\n  1 of 1 checks failed");
  });

  it("emits ANSI colour codes when color: true", () => {
    const output = formatConsoleReport([PASS], { color: true });
    expect(output).toContain("\u001b[32m✓\u001b[0m");
    expect(output).toContain("\u001b[32mall 1 checks passed\u001b[0m");
  });

  it("colours a failing tally red", () => {
    const output = formatConsoleReport([FAIL], { color: true });
    expect(output).toContain("\u001b[31m✗\u001b[0m");
    expect(output).toContain("\u001b[31m1 of 1 checks failed\u001b[0m");
  });

  it("passes with zero checks", () => {
    const output = formatConsoleReport([], { color: false });
    expect(output).toBe("  all 0 checks passed");
  });
});
