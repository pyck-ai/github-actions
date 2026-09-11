import { describe, expect, it, vi } from "vitest";
import type { CmdCheck } from "../manifest/schema.js";
import { executeCmdCheck } from "./cmd.js";
import { makeContext, makeFakeCli } from "./test-helpers.js";

const CHECK: CmdCheck = { kind: "cmd", commands: ["go", "git"] };

describe("executeCmdCheck", () => {
  it("passes when every command resolves on PATH", async () => {
    const cli = makeFakeCli({
      run: vi.fn(async () => ({ output: "", exitCode: 0, timedOut: false })),
    });
    const result = await executeCmdCheck(CHECK, 0, makeContext({ cli }));
    expect(result).toEqual({ index: 0, kind: "cmd", label: "on PATH: go git", verdict: "pass" });
  });

  it("fails and lists missing commands", async () => {
    const cli = makeFakeCli({
      run: vi.fn(async () => ({ output: "git\n", exitCode: 0, timedOut: false })),
    });
    const result = await executeCmdCheck(CHECK, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
    expect(result.detail).toBe("missing: git");
  });

  it("passes the as identity through to docker run", async () => {
    const run = vi.fn(async () => ({ output: "", exitCode: 0, timedOut: false }));
    const cli = makeFakeCli({ run });
    await executeCmdCheck({ ...CHECK, as: 1001 }, 0, makeContext({ cli }));
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ as: 1001 }));
  });
});
