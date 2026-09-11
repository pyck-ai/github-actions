import { describe, expect, it, vi } from "vitest";
import { BakeError, parseBakePrint, runBakePrint, type BakeExecFn } from "./bake.js";

const SAMPLE_PRINT = JSON.stringify({
  group: { default: { targets: ["agent-alpine", "static"] } },
  target: {
    "agent-alpine": {
      context: "docker/agent",
      dockerfile: "Dockerfile.alpine",
      tags: ["ghcr.io/pyck-ai/agent:latest", "ghcr.io/pyck-ai/agent:alpine"],
    },
    static: {
      context: "docker/static",
      tags: ["ghcr.io/pyck-ai/static:latest"],
    },
  },
});

describe("parseBakePrint", () => {
  it("flattens the target object into a list, preserving tags and context", () => {
    const targets = parseBakePrint(SAMPLE_PRINT);
    expect(targets).toEqual([
      {
        name: "agent-alpine",
        tags: ["ghcr.io/pyck-ai/agent:latest", "ghcr.io/pyck-ai/agent:alpine"],
        context: "docker/agent",
      },
      { name: "static", tags: ["ghcr.io/pyck-ai/static:latest"], context: "docker/static" },
    ]);
  });

  it("defaults tags to [] and context to '' when absent", () => {
    const targets = parseBakePrint(JSON.stringify({ target: { foo: {} } }));
    expect(targets).toEqual([{ name: "foo", tags: [], context: "" }]);
  });

  it("throws BakeError on invalid JSON", () => {
    expect(() => parseBakePrint("not json")).toThrow(BakeError);
  });

  it("throws BakeError when the top level is not an object", () => {
    expect(() => parseBakePrint("42")).toThrow(BakeError);
  });

  it('throws BakeError when "target" is missing', () => {
    expect(() => parseBakePrint(JSON.stringify({ group: {} }))).toThrow(BakeError);
  });

  it('throws BakeError when "target" is not an object', () => {
    expect(() => parseBakePrint(JSON.stringify({ target: "nope" }))).toThrow(BakeError);
  });
});

function fakeExec(
  result: Partial<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
  }> = {},
): BakeExecFn {
  return vi.fn(async () => ({
    stdout: "",
    stderr: "",
    exitCode: 0,
    timedOut: false,
    ...result,
  }));
}

describe("runBakePrint", () => {
  it("invokes docker buildx bake --print and parses stdout", async () => {
    const exec = fakeExec({ stdout: SAMPLE_PRINT, stderr: "#1 [internal] load ...\n" });
    const targets = await runBakePrint(exec);
    expect(targets).toHaveLength(2);
    expect(exec).toHaveBeenCalledWith(["buildx", "bake", "--print"], { timeoutMs: 120_000 });
  });

  it("passes REGISTRY (and other env) through to the subprocess", async () => {
    const exec = fakeExec({ stdout: SAMPLE_PRINT });
    await runBakePrint(exec, { env: { REGISTRY: "ghcr.io/pyck-ai" } });
    expect(exec).toHaveBeenCalledWith(["buildx", "bake", "--print"], {
      timeoutMs: 120_000,
      env: { REGISTRY: "ghcr.io/pyck-ai" },
    });
  });

  it("appends extra args after --print", async () => {
    const exec = fakeExec({ stdout: SAMPLE_PRINT });
    await runBakePrint(exec, { args: ["agent-alpine"] });
    expect(exec).toHaveBeenCalledWith(["buildx", "bake", "--print", "agent-alpine"], {
      timeoutMs: 120_000,
    });
  });

  it("respects a custom timeoutMs", async () => {
    const exec = fakeExec({ stdout: SAMPLE_PRINT });
    await runBakePrint(exec, { timeoutMs: 5000 });
    expect(exec).toHaveBeenCalledWith(expect.anything(), { timeoutMs: 5000 });
  });

  it("throws BakeError on a non-zero exit, using stderr for the message", async () => {
    const exec = fakeExec({ exitCode: 1, stderr: "no bake file found" });
    await expect(runBakePrint(exec)).rejects.toThrow(/no bake file found/);
    await expect(runBakePrint(exec)).rejects.toBeInstanceOf(BakeError);
  });

  it("throws BakeError on a timeout, without attempting to parse stdout", async () => {
    const exec = fakeExec({ timedOut: true, exitCode: null });
    await expect(runBakePrint(exec)).rejects.toThrow(/timed out/);
    await expect(runBakePrint(exec)).rejects.toBeInstanceOf(BakeError);
  });

  it("does not merge stderr progress output into the parsed stdout JSON", async () => {
    const exec = fakeExec({
      stdout: SAMPLE_PRINT,
      stderr: "#1 [internal] load local bake definitions\n#1 DONE 0.0s\n",
    });
    const targets = await runBakePrint(exec);
    expect(targets).toHaveLength(2);
  });
});
