import { describe, expect, it, vi } from "vitest";
import type { VersionCheck } from "../manifest/schema.js";
import { executeVersionCheck } from "./version.js";
import { makeContext, makeFakeCli } from "./test-helpers.js";

describe("executeVersionCheck", () => {
  // Preserved looseness #1: `contains` is an UNANCHORED SUBSTRING match, not
  // equality and not word-boundary-anchored. `python`'s real manifest asserts
  // `PYTHON_VERSION=3.14` against an image shipping `3.14.x`; needle `3.5`
  // matching output `3.53.1` is the proven case any future anchoring would break.
  it("needle '3.5' matches output '3.53.1' (unanchored substring, per the bash predecessor)", async () => {
    const check: VersionCheck = { kind: "version", run: "python --version", contains: "3.5" };
    const cli = makeFakeCli({
      run: vi.fn(async () => ({ output: "Python 3.53.1\n", exitCode: 0, timedOut: false })),
    });
    const result = await executeVersionCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("pass");
  });

  it("fails when the substring is absent, with truncated output in the detail", async () => {
    const check: VersionCheck = { kind: "version", run: "go version", contains: "1.27.1" };
    const cli = makeFakeCli({
      run: vi.fn(async () => ({
        output: "go version go1.26.0 linux/amd64\n",
        exitCode: 0,
        timedOut: false,
      })),
    });
    const result = await executeVersionCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
    expect(result.detail).toMatch(/go1\.26\.0/);
  });

  it("optional matches regex additionally tightens the assertion", async () => {
    const check: VersionCheck = {
      kind: "version",
      run: "go version",
      contains: "go1",
      matches: "^go version go1\\.\\d+\\.\\d+",
    };
    const cli = makeFakeCli({
      run: vi.fn(async () => ({
        output: "banner\ngo version go1.27.1 linux/amd64",
        exitCode: 0,
        timedOut: false,
      })),
    });
    const result = await executeVersionCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
  });

  it("optional notContains additionally tightens the assertion", async () => {
    const check: VersionCheck = {
      kind: "version",
      run: "node --version",
      contains: "v22",
      notContains: "deprecated",
    };
    const cli = makeFakeCli({
      run: vi.fn(async () => ({
        output: "v22.1.0 (deprecated build)",
        exitCode: 0,
        timedOut: false,
      })),
    });
    const result = await executeVersionCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
  });
});
