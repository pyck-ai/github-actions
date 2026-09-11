import { describe, expect, it, vi } from "vitest";
import type { WorkdirCheck } from "../manifest/schema.js";
import { executeWorkdirCheck } from "./workdir.js";
import { inspectResult, makeContext, makeFakeCli } from "./test-helpers.js";

const CHECK: WorkdirCheck = { kind: "workdir", value: "/app" };

describe("executeWorkdirCheck", () => {
  it("passes when WorkingDir equals the expected value", async () => {
    const cli = makeFakeCli({ inspect: vi.fn(async () => inspectResult({ WorkingDir: "/app" })) });
    const result = await executeWorkdirCheck(CHECK, 0, makeContext({ cli }));
    expect(result.verdict).toBe("pass");
  });

  it("fails with the actual value when it does not match", async () => {
    const cli = makeFakeCli({ inspect: vi.fn(async () => inspectResult({ WorkingDir: "/" })) });
    const result = await executeWorkdirCheck(CHECK, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
    expect(result.detail).toBe("got '/'");
  });

  // Bash-bug-adjacent requirement: unlike the bash predecessor (whose
  // `docker inspect ... 2>/dev/null` swallows a missing image into `""`, which
  // then PASSES a check expecting `""`), a missing image here must hard-error —
  // it must never resolve as a "pass" just because both sides happen to be empty.
  it("propagates a missing/unpullable image as a hard error, even when the expected value is empty", async () => {
    const emptyCheck: WorkdirCheck = { kind: "workdir", value: "" };
    const cli = makeFakeCli({
      inspect: vi.fn(async () => {
        throw new Error("docker inspect nope failed: No such object");
      }),
    });
    await expect(
      executeWorkdirCheck(emptyCheck, 0, makeContext({ cli, image: "nope" })),
    ).rejects.toThrow(/No such object/);
  });
});
