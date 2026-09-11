import { describe, expect, it, vi } from "vitest";
import type { ShCheck } from "../manifest/schema.js";
import { executeShCheck } from "./sh.js";
import { makeContext, makeFakeCli } from "./test-helpers.js";

describe("executeShCheck", () => {
  it("passes on exit code 0", async () => {
    const check: ShCheck = { kind: "sh", desc: "smoke test", run: "true" };
    const cli = makeFakeCli({
      run: vi.fn(async () => ({ output: "", exitCode: 0, timedOut: false })),
    });
    const result = await executeShCheck(check, 0, makeContext({ cli }));
    expect(result).toEqual({ index: 0, kind: "sh", label: "smoke test", verdict: "pass" });
  });

  it("fails on nonzero exit, with truncated output as detail", async () => {
    const check: ShCheck = { kind: "sh", desc: "smoke test", run: "false" };
    const cli = makeFakeCli({
      run: vi.fn(async () => ({ output: "line1\nline2\nboom\n", exitCode: 1, timedOut: false })),
    });
    const result = await executeShCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
    expect(result.detail).toMatch(/boom/);
  });

  it("resolves mounts.host relative to the manifest directory, not cwd", async () => {
    const check: ShCheck = {
      kind: "sh",
      desc: "fixture mount",
      run: "cat /fixture/data",
      mounts: [{ host: "fixtures/data", container: "/fixture/data", ro: true }],
    };
    const run = vi.fn(async () => ({ output: "", exitCode: 0, timedOut: false }));
    const cli = makeFakeCli({ run });
    await executeShCheck(check, 0, makeContext({ cli, manifestDir: "/manifests/sub" }));
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        mounts: [{ host: "/manifests/sub/fixtures/data", container: "/fixture/data", ro: true }],
      }),
    );
  });

  it("leaves an already-absolute mount host untouched", async () => {
    const check: ShCheck = {
      kind: "sh",
      desc: "fixture mount",
      run: "true",
      mounts: [{ host: "/abs/data", container: "/fixture/data" }],
    };
    const run = vi.fn(async () => ({ output: "", exitCode: 0, timedOut: false }));
    const cli = makeFakeCli({ run });
    await executeShCheck(check, 0, makeContext({ cli, manifestDir: "/manifests" }));
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ mounts: [{ host: "/abs/data", container: "/fixture/data" }] }),
    );
  });

  it("passes timeoutMs through to docker run", async () => {
    const check: ShCheck = { kind: "sh", desc: "slow", run: "sleep 1", timeoutMs: 5000 };
    const run = vi.fn(async () => ({ output: "", exitCode: 0, timedOut: false }));
    const cli = makeFakeCli({ run });
    await executeShCheck(check, 0, makeContext({ cli }));
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 5000 }));
  });
});
