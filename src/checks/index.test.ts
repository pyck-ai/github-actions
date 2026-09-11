import { afterEach, describe, expect, it, vi } from "vitest";
import type { Check } from "../manifest/schema.js";
import { executeCheck } from "./index.js";
import { inspectResult, makeContext, makeFakeCli } from "./test-helpers.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("executeCheck", () => {
  it("dispatches to the right executor for every one of the twelve check kinds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    const cli = makeFakeCli({
      inspect: vi.fn(async () =>
        inspectResult({
          User: "1001",
          WorkingDir: "/app",
          Env: ["FOO=bar"],
          ExposedPorts: { "80/tcp": {} },
        }),
      ),
      run: vi.fn(async () => ({ output: "1001", exitCode: 0, timedOut: false })),
      export: vi.fn(async () => Buffer.alloc(1024)),
    });
    const ctx = makeContext({ cli });

    const checks: Check[] = [
      { kind: "user", uid: 1001 },
      { kind: "configUser", value: "1001" },
      { kind: "workdir", value: "/app" },
      { kind: "env", name: "FOO", equals: "bar" },
      { kind: "cmd", commands: ["sh"] },
      { kind: "version", run: "sh --version", contains: "" },
      { kind: "writable", paths: ["/tmp"] },
      { kind: "file", paths: ["/etc/passwd"] },
      { kind: "imageFile", paths: ["/etc/passwd"] },
      { kind: "sh", desc: "smoke", run: "true" },
      { kind: "exposedPort", port: 80 },
      { kind: "http", desc: "http", containerPort: 80, path: "/", expectStatus: 200, retries: 0 },
    ];

    for (const [i, check] of checks.entries()) {
      const result = await executeCheck(check, i, ctx);
      expect(result.kind).toBe(check.kind);
      expect(result.index).toBe(i);
    }
  });

  it("propagates a hard error from an inspect-based check (does not swallow it)", async () => {
    const cli = makeFakeCli({
      inspect: vi.fn(async () => {
        throw new Error("No such object");
      }),
    });
    await expect(
      executeCheck({ kind: "workdir", value: "/app" }, 0, makeContext({ cli })),
    ).rejects.toThrow(/No such object/);
  });
});
