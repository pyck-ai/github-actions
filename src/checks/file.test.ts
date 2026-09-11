import { describe, expect, it, vi } from "vitest";
import type { FileCheck } from "../manifest/schema.js";
import { executeFileCheck } from "./file.js";
import { makeContext, makeFakeCli } from "./test-helpers.js";

const CHECK: FileCheck = { kind: "file", paths: ["/usr/bin/git", "/usr/bin/bogus"] };

describe("executeFileCheck", () => {
  it("passes when every path exists", async () => {
    const cli = makeFakeCli({
      run: vi.fn(async () => ({ output: "", exitCode: 0, timedOut: false })),
    });
    const result = await executeFileCheck(
      { kind: "file", paths: ["/usr/bin/git"] },
      0,
      makeContext({ cli }),
    );
    expect(result.verdict).toBe("pass");
  });

  it("fails and lists missing paths", async () => {
    const cli = makeFakeCli({
      run: vi.fn(async () => ({ output: "/usr/bin/bogus\n", exitCode: 0, timedOut: false })),
    });
    const result = await executeFileCheck(CHECK, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
    expect(result.detail).toBe("missing: /usr/bin/bogus");
  });
});
