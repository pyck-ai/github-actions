import { describe, expect, it, vi } from "vitest";
import { getEnvValue, inspectImageConfig } from "./inspect.js";
import type { DockerCli } from "./cli.js";

function fakeCli(inspectResult: unknown): DockerCli {
  return {
    inspect: vi.fn(async () => inspectResult),
    run: vi.fn(),
    create: vi.fn(),
    export: vi.fn(),
    pull: vi.fn(),
    port: vi.fn(),
    start: vi.fn(),
    rm: vi.fn(),
  } as unknown as DockerCli;
}

describe("inspectImageConfig", () => {
  it("extracts User/WorkingDir/Env/ExposedPorts from Config", async () => {
    const cli = fakeCli([
      {
        Config: {
          User: "1001",
          WorkingDir: "/app",
          Env: ["PATH=/usr/bin", "FOO=bar"],
          ExposedPorts: { "8080/tcp": {} },
        },
      },
    ]);
    const config = await inspectImageConfig(cli, "img:latest");
    expect(config).toEqual({
      user: "1001",
      workdir: "/app",
      env: ["PATH=/usr/bin", "FOO=bar"],
      exposedPorts: { "8080/tcp": {} },
    });
  });

  it("defaults missing fields to empty values", async () => {
    const cli = fakeCli([{ Config: {} }]);
    const config = await inspectImageConfig(cli, "img:latest");
    expect(config).toEqual({ user: "", workdir: "", env: [], exposedPorts: {} });
  });

  it("throws (hard error) when docker inspect itself rejects", async () => {
    const cli = fakeCli(undefined);
    cli.inspect = vi.fn(async () => {
      throw new Error("docker inspect nope failed: No such object");
    });
    await expect(inspectImageConfig(cli, "nope")).rejects.toThrow(/No such object/);
  });

  it("throws when the inspect result is not a non-empty array", async () => {
    const cli = fakeCli([]);
    await expect(inspectImageConfig(cli, "img")).rejects.toThrow(/no results/);
  });
});

describe("getEnvValue", () => {
  it("returns the value for a matching key", () => {
    expect(getEnvValue(["FOO=bar", "BAZ=qux"], "FOO")).toBe("bar");
  });

  it("returns undefined for a missing key", () => {
    expect(getEnvValue(["FOO=bar"], "MISSING")).toBeUndefined();
  });

  it("last wins for duplicate keys", () => {
    expect(getEnvValue(["FOO=first", "FOO=second"], "FOO")).toBe("second");
  });

  it("treats the name as a literal, not a regex", () => {
    expect(getEnvValue(["FOOX=bar"], "FOO.")).toBeUndefined();
  });

  it("handles a value containing '='", () => {
    expect(getEnvValue(["FOO=a=b=c"], "FOO")).toBe("a=b=c");
  });
});
