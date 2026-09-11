import { describe, expect, it, vi } from "vitest";
import type { UserCheck } from "../manifest/schema.js";
import { executeUserCheck } from "./user.js";
import { inspectResult, makeContext, makeFakeCli } from "./test-helpers.js";

const CHECK: UserCheck = { kind: "user", uid: 1001, name: "nonroot" };

describe("executeUserCheck", () => {
  it("passes when Config.User is set and id -u matches", async () => {
    const cli = makeFakeCli({
      inspect: vi.fn(async () => inspectResult({ User: "1001" })),
      run: vi.fn(async () => ({ output: "1001\n", exitCode: 0, timedOut: false })),
    });
    const result = await executeUserCheck(CHECK, 0, makeContext({ cli }));
    expect(result).toEqual({
      index: 0,
      kind: "user",
      label: "runs as nonroot (uid 1001)",
      verdict: "pass",
    });
  });

  it("fails when Config.User is empty", async () => {
    const cli = makeFakeCli({ inspect: vi.fn(async () => inspectResult({ User: "" })) });
    const result = await executeUserCheck(CHECK, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
    expect(result.detail).toMatch(/Config.User is empty/);
  });

  it("fails when id -u does not match the expected uid", async () => {
    const cli = makeFakeCli({
      inspect: vi.fn(async () => inspectResult({ User: "1001" })),
      run: vi.fn(async () => ({ output: "0\n", exitCode: 0, timedOut: false })),
    });
    const result = await executeUserCheck(CHECK, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
    expect(result.detail).toMatch(/got uid 0/);
  });

  it("fails when id -u prints something non-numeric (USER names a nonexistent account)", async () => {
    const cli = makeFakeCli({
      inspect: vi.fn(async () => inspectResult({ User: "ghost" })),
      run: vi.fn(async () => ({
        output: "sh: can't find user ghost",
        exitCode: 1,
        timedOut: false,
      })),
    });
    const result = await executeUserCheck(CHECK, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
    expect(result.detail).toMatch(/can't find user/);
  });

  // Preserved looseness #2: the bash's `check_user` compares ONLY the uid — the
  // display name is never checked against anything. `check_user <img> completely-
  // bogus-name 0` PASSES in the bash. `configUser` unset here, so a wrong `name`
  // must still pass alongside a right uid.
  it("passes with a wrong display name when the uid is right (name is decorative, per the bash predecessor)", async () => {
    const cli = makeFakeCli({
      inspect: vi.fn(async () => inspectResult({ User: "1001" })),
      run: vi.fn(async () => ({ output: "1001\n", exitCode: 0, timedOut: false })),
    });
    const wrongNameCheck: UserCheck = { kind: "user", uid: 1001, name: "completely-bogus-name" };
    const result = await executeUserCheck(wrongNameCheck, 0, makeContext({ cli }));
    expect(result.verdict).toBe("pass");
  });

  it("with opt-in configUser, fails when the resolved username does not match", async () => {
    const cli = makeFakeCli({
      inspect: vi.fn(async () => inspectResult({ User: "1001" })),
      run: vi
        .fn()
        .mockResolvedValueOnce({ output: "1001\n", exitCode: 0, timedOut: false })
        .mockResolvedValueOnce({ output: "someoneelse\n", exitCode: 0, timedOut: false }),
    });
    const check: UserCheck = { kind: "user", uid: 1001, configUser: "nonroot" };
    const result = await executeUserCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
    expect(result.detail).toMatch(/expected user "nonroot", got "someoneelse"/);
  });

  it("with opt-in configUser, passes when the resolved username matches", async () => {
    const cli = makeFakeCli({
      inspect: vi.fn(async () => inspectResult({ User: "1001" })),
      run: vi
        .fn()
        .mockResolvedValueOnce({ output: "1001\n", exitCode: 0, timedOut: false })
        .mockResolvedValueOnce({ output: "nonroot\n", exitCode: 0, timedOut: false }),
    });
    const check: UserCheck = { kind: "user", uid: 1001, configUser: "nonroot" };
    const result = await executeUserCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("pass");
  });

  // Hard-error requirement: a missing/unpullable image must abort, not become a "fail".
  it("propagates (does not catch) a missing/unpullable image as a hard error", async () => {
    const cli = makeFakeCli({
      inspect: vi.fn(async () => {
        throw new Error("docker inspect nope failed (exit 1): No such object");
      }),
    });
    await expect(executeUserCheck(CHECK, 0, makeContext({ cli, image: "nope" }))).rejects.toThrow(
      /No such object/,
    );
  });
});
