import { describe, expect, it, vi } from "vitest";
import type { ConfigUserCheck } from "../manifest/schema.js";
import { executeConfigUserCheck } from "./configUser.js";
import { inspectResult, makeContext, makeFakeCli } from "./test-helpers.js";

const CHECK: ConfigUserCheck = { kind: "configUser", value: "1001" };

describe("executeConfigUserCheck", () => {
  it("passes when Config.User equals the expected value", async () => {
    const cli = makeFakeCli({ inspect: vi.fn(async () => inspectResult({ User: "1001" })) });
    const result = await executeConfigUserCheck(CHECK, 0, makeContext({ cli }));
    expect(result.verdict).toBe("pass");
  });

  it("fails with the actual value when it does not match", async () => {
    const cli = makeFakeCli({ inspect: vi.fn(async () => inspectResult({ User: "0" })) });
    const result = await executeConfigUserCheck(CHECK, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
    expect(result.detail).toBe("got '0'");
  });

  it("reports <empty> when Config.User is unset", async () => {
    const cli = makeFakeCli({ inspect: vi.fn(async () => inspectResult({ User: "" })) });
    const result = await executeConfigUserCheck(CHECK, 0, makeContext({ cli }));
    expect(result.detail).toBe("got '<empty>'");
  });

  it("propagates a missing/unpullable image as a hard error", async () => {
    const cli = makeFakeCli({
      inspect: vi.fn(async () => {
        throw new Error("No such object");
      }),
    });
    await expect(executeConfigUserCheck(CHECK, 0, makeContext({ cli }))).rejects.toThrow(
      /No such object/,
    );
  });
});
