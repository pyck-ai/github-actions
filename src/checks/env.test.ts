import { describe, expect, it, vi } from "vitest";
import type { EnvCheck } from "../manifest/schema.js";
import { executeEnvCheck } from "./env.js";
import { inspectResult, makeContext, makeFakeCli } from "./test-helpers.js";

describe("executeEnvCheck — equals", () => {
  it("passes when the value matches exactly", async () => {
    const check: EnvCheck = { kind: "env", name: "FOO", equals: "bar" };
    const cli = makeFakeCli({ inspect: vi.fn(async () => inspectResult({ Env: ["FOO=bar"] })) });
    const result = await executeEnvCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("pass");
  });

  it("fails when the value differs", async () => {
    const check: EnvCheck = { kind: "env", name: "FOO", equals: "bar" };
    const cli = makeFakeCli({ inspect: vi.fn(async () => inspectResult({ Env: ["FOO=baz"] })) });
    const result = await executeEnvCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
    expect(result.detail).toBe("got 'baz'");
  });

  // Free tightening (explicitly not a preserved looseness): an unset variable
  // must never satisfy `equals: ""` — the bash's `sed` pipeline conflates unset
  // with set-to-empty because both yield an empty capture group.
  it("does NOT satisfy equals: '' for an unset variable", async () => {
    const check: EnvCheck = { kind: "env", name: "UNSET", equals: "" };
    const cli = makeFakeCli({ inspect: vi.fn(async () => inspectResult({ Env: [] })) });
    const result = await executeEnvCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
    expect(result.detail).toBe("got '<unset>'");
  });

  it("last wins for duplicate keys, matching Docker runtime behaviour", async () => {
    const check: EnvCheck = { kind: "env", name: "FOO", equals: "second" };
    const cli = makeFakeCli({
      inspect: vi.fn(async () => inspectResult({ Env: ["FOO=first", "FOO=second"] })),
    });
    const result = await executeEnvCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("pass");
  });
});

describe("executeEnvCheck — contains", () => {
  it("passes on a literal substring match", async () => {
    const check: EnvCheck = { kind: "env", name: "PATH", contains: "/usr/local/bin" };
    const cli = makeFakeCli({
      inspect: vi.fn(async () => inspectResult({ Env: ["PATH=/usr/local/bin:/usr/bin"] })),
    });
    const result = await executeEnvCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("pass");
  });

  it("fails when the substring is absent", async () => {
    const check: EnvCheck = { kind: "env", name: "PATH", contains: "/opt/bin" };
    const cli = makeFakeCli({
      inspect: vi.fn(async () => inspectResult({ Env: ["PATH=/usr/bin"] })),
    });
    const result = await executeEnvCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
  });
});

describe("executeEnvCheck — absent", () => {
  it("passes when the variable is unset", async () => {
    const check: EnvCheck = { kind: "env", name: "FOO", absent: true };
    const cli = makeFakeCli({ inspect: vi.fn(async () => inspectResult({ Env: [] })) });
    const result = await executeEnvCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("pass");
  });

  it("fails when the variable is set", async () => {
    const check: EnvCheck = { kind: "env", name: "FOO", absent: true };
    const cli = makeFakeCli({ inspect: vi.fn(async () => inspectResult({ Env: ["FOO=bar"] })) });
    const result = await executeEnvCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
    expect(result.detail).toBe("got 'bar'");
  });
});
