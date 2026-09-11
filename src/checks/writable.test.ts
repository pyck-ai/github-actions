import { describe, expect, it, vi } from "vitest";
import type { WritableCheck } from "../manifest/schema.js";
import { executeWritableCheck } from "./writable.js";
import { makeContext, makeFakeCli } from "./test-helpers.js";

describe("executeWritableCheck", () => {
  it("passes when nothing is reported denied", async () => {
    const check: WritableCheck = { kind: "writable", paths: ["/go/bin"] };
    const cli = makeFakeCli({
      run: vi.fn(async () => ({ output: "", exitCode: 0, timedOut: false })),
    });
    const result = await executeWritableCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("pass");
  });

  // Preserved looseness #3: `mkdir -p` creates the path if it's missing, so this
  // tests "can create-and-write", not "exists and is writable" — a typo'd path
  // under a writable parent PASSES. `mustExist` defaults to false.
  it("passes for a path that does not exist yet, by default (mustExist defaults to false)", async () => {
    const check: WritableCheck = { kind: "writable", paths: ["/go/bin/typo-path"] };
    const run = vi.fn(async (opts: { command: string }) => {
      // Simulate the real shell: mkdir -p creates the missing dir, so the probe succeeds.
      expect(opts.command).not.toContain("[ -e ");
      return { output: "", exitCode: 0, timedOut: false };
    });
    const cli = makeFakeCli({ run });
    const result = await executeWritableCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("pass");
  });

  it("with mustExist: true, requires the path to exist before probing writability", async () => {
    const check: WritableCheck = { kind: "writable", paths: ["/go/bin"], mustExist: true };
    const run = vi.fn(async (opts: { command: string }) => {
      expect(opts.command).toContain('[ -e "$d" ]');
      return { output: "", exitCode: 0, timedOut: false };
    });
    const cli = makeFakeCli({ run });
    await executeWritableCheck(check, 0, makeContext({ cli }));
    expect(run).toHaveBeenCalled();
  });

  it("fails and lists denied paths", async () => {
    const check: WritableCheck = { kind: "writable", paths: ["/go/bin", "/var/cache/go"] };
    const cli = makeFakeCli({
      run: vi.fn(async () => ({ output: "/var/cache/go\n", exitCode: 0, timedOut: false })),
    });
    const result = await executeWritableCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
    expect(result.detail).toBe("denied: /var/cache/go");
  });

  it("labels by uid when as is set", async () => {
    const check: WritableCheck = { kind: "writable", paths: ["/tmp"], as: 1001 };
    const cli = makeFakeCli({
      run: vi.fn(async () => ({ output: "", exitCode: 0, timedOut: false })),
    });
    const result = await executeWritableCheck(check, 0, makeContext({ cli }));
    expect(result.label).toBe("writable by uid 1001: /tmp");
  });
});
