import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendStepSummary } from "./summary.js";

describe("appendStepSummary", () => {
  it("appends the markdown and a newline to the file", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "tidy-core-")), "summary.md");
    writeFileSync(file, "earlier\n");
    const warnings: string[] = [];
    await appendStepSummary(file, "## one", (m) => warnings.push(m));
    await appendStepSummary(file, "## two", (m) => warnings.push(m));
    expect(readFileSync(file, "utf8")).toBe("earlier\n## one\n## two\n");
    expect(warnings).toEqual([]);
  });

  it.each([undefined, ""])("does nothing when the path is %j", async (file) => {
    const warnings: string[] = [];
    await appendStepSummary(file, "x", (m) => warnings.push(m));
    expect(warnings).toEqual([]);
  });

  it("only warns when the file cannot be written", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tidy-core-"));
    const warnings: string[] = [];
    await appendStepSummary(path.join(dir, "missing", "summary.md"), "x", (m) => warnings.push(m));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^Could not write the step summary: /);
  });
});
