import { describe, expect, it, vi } from "vitest";
import { createDockerCli, type DockerExecResult, type ExecBinaryFn, type ExecFn } from "./cli.js";

function fakeExec(result: Partial<DockerExecResult> = {}): ExecFn {
  return vi.fn(async (): Promise<DockerExecResult> => ({
    output: "",
    exitCode: 0,
    timedOut: false,
    ...result,
  }));
}

describe("createDockerCli — inspect", () => {
  it("parses the JSON docker inspect prints", async () => {
    const exec = fakeExec({ output: JSON.stringify([{ Id: "abc123" }]) });
    const cli = createDockerCli(exec);
    const result = await cli.inspect("myimage:latest");
    expect(result).toEqual([{ Id: "abc123" }]);
    expect(exec).toHaveBeenCalledWith(["inspect", "myimage:latest"], { timeoutMs: 120_000 });
  });

  it("throws on a non-zero exit code", async () => {
    const exec = fakeExec({ output: "Error: No such object", exitCode: 1 });
    const cli = createDockerCli(exec);
    await expect(cli.inspect("nope")).rejects.toThrow(/No such object/);
  });
});

describe("createDockerCli — run", () => {
  it("overrides entrypoint with sh -c, running the command against the image", async () => {
    const exec = fakeExec({ output: "go1.27.1" });
    const cli = createDockerCli(exec);
    await cli.run({ image: "golang:1.27", command: "go version" });
    expect(exec).toHaveBeenCalledWith(
      ["run", "--rm", "--entrypoint", "sh", "golang:1.27", "-c", "go version"],
      { timeoutMs: 120_000 },
    );
  });

  it("passes -u 0 for as: root", async () => {
    const exec = fakeExec();
    const cli = createDockerCli(exec);
    await cli.run({ image: "img", command: "id", as: "root" });
    expect(exec).toHaveBeenCalledWith(
      ["run", "--rm", "--entrypoint", "sh", "-u", "0", "img", "-c", "id"],
      { timeoutMs: 120_000 },
    );
  });

  it("passes -u <uid> for a numeric as", async () => {
    const exec = fakeExec();
    const cli = createDockerCli(exec);
    await cli.run({ image: "img", command: "id", as: 1001 });
    expect(exec).toHaveBeenCalledWith(
      ["run", "--rm", "--entrypoint", "sh", "-u", "1001", "img", "-c", "id"],
      { timeoutMs: 120_000 },
    );
  });

  it("omits -u for as: default (or omitted)", async () => {
    const exec = fakeExec();
    const cli = createDockerCli(exec);
    await cli.run({ image: "img", command: "id", as: "default" });
    expect(exec).toHaveBeenCalledWith(["run", "--rm", "--entrypoint", "sh", "img", "-c", "id"], {
      timeoutMs: 120_000,
    });
  });

  it("adds -v flags for mounts, with :ro suffix when set", async () => {
    const exec = fakeExec();
    const cli = createDockerCli(exec);
    await cli.run({
      image: "img",
      command: "true",
      mounts: [
        { host: "/host/a", container: "/container/a" },
        { host: "/host/b", container: "/container/b", ro: true },
      ],
    });
    expect(exec).toHaveBeenCalledWith(
      [
        "run",
        "--rm",
        "--entrypoint",
        "sh",
        "-v",
        "/host/a:/container/a",
        "-v",
        "/host/b:/container/b:ro",
        "img",
        "-c",
        "true",
      ],
      { timeoutMs: 120_000 },
    );
  });

  it("passes a custom timeoutMs through, defaulting to 120000", async () => {
    const exec = fakeExec();
    const cli = createDockerCli(exec);
    await cli.run({ image: "img", command: "true", timeoutMs: 5000 });
    expect(exec).toHaveBeenCalledWith(expect.anything(), { timeoutMs: 5000 });
  });

  it("does not throw on a non-zero exit — run results carry exitCode for the caller to inspect", async () => {
    const exec = fakeExec({ exitCode: 1 });
    const cli = createDockerCli(exec);
    const result = await cli.run({ image: "img", command: "false" });
    expect(result.exitCode).toBe(1);
  });
});

describe("createDockerCli — create", () => {
  it("returns the trimmed container id", async () => {
    const exec = fakeExec({ output: "abcdef1234567890\n" });
    const cli = createDockerCli(exec);
    const id = await cli.create({ image: "img" });
    expect(id).toBe("abcdef1234567890");
    expect(exec).toHaveBeenCalledWith(["create", "img"], { timeoutMs: 120_000 });
  });

  it("inserts extra args before the image", async () => {
    const exec = fakeExec({ output: "id" });
    const cli = createDockerCli(exec);
    await cli.create({ image: "img", args: ["-u", "0"] });
    expect(exec).toHaveBeenCalledWith(["create", "-u", "0", "img"], { timeoutMs: 120_000 });
  });

  it("throws on a non-zero exit code", async () => {
    const exec = fakeExec({ output: "boom", exitCode: 1 });
    const cli = createDockerCli(exec);
    await expect(cli.create({ image: "img" })).rejects.toThrow(/boom/);
  });

  it("appends a trailing cmd after the image, for scratch images with no CMD/ENTRYPOINT", async () => {
    const exec = fakeExec({ output: "id" });
    const cli = createDockerCli(exec);
    await cli.create({ image: "img", cmd: ["true"] });
    expect(exec).toHaveBeenCalledWith(["create", "img", "true"], { timeoutMs: 120_000 });
  });
});

describe("createDockerCli — export", () => {
  function fakeExecBinary(
    result: Partial<{
      stdout: Buffer;
      stderr: string;
      exitCode: number | null;
      timedOut: boolean;
    }> = {},
  ): ExecBinaryFn {
    return vi.fn(async () => ({
      stdout: Buffer.alloc(0),
      stderr: "",
      exitCode: 0,
      timedOut: false,
      ...result,
    }));
  }

  it("returns the raw stdout buffer, unmodified (binary-safe)", async () => {
    const binaryTar = Buffer.from([0x1f, 0x8b, 0x00, 0xff, 0xfe, 0x80]);
    const execBinary = fakeExecBinary({ stdout: binaryTar });
    const exec = fakeExec();
    const cli = createDockerCli(exec, execBinary);
    const result = await cli.export("container123");
    expect(result).toEqual(binaryTar);
    expect(execBinary).toHaveBeenCalledWith(["export", "container123"], { timeoutMs: 120_000 });
  });

  it("throws on a non-zero exit code, using stderr (not the binary stdout) for the message", async () => {
    const execBinary = fakeExecBinary({ exitCode: 1, stderr: "no such container" });
    const cli = createDockerCli(fakeExec(), execBinary);
    await expect(cli.export("nope")).rejects.toThrow(/no such container/);
  });
});

describe("createDockerCli — pull", () => {
  it("resolves on exit code 0", async () => {
    const exec = fakeExec();
    const cli = createDockerCli(exec);
    await expect(cli.pull("img:latest")).resolves.toBeUndefined();
    expect(exec).toHaveBeenCalledWith(["pull", "img:latest"], { timeoutMs: 120_000 });
  });

  it("throws on a non-zero exit code", async () => {
    const exec = fakeExec({ output: "manifest unknown", exitCode: 1 });
    const cli = createDockerCli(exec);
    await expect(cli.pull("img:missing")).rejects.toThrow(/manifest unknown/);
  });
});

describe("createDockerCli — port", () => {
  it("returns the trimmed host mapping for tcp (default protocol)", async () => {
    const exec = fakeExec({ output: "0.0.0.0:32768\n" });
    const cli = createDockerCli(exec);
    const mapping = await cli.port("container123", 8080);
    expect(mapping).toBe("0.0.0.0:32768");
    expect(exec).toHaveBeenCalledWith(["port", "container123", "8080"], { timeoutMs: 120_000 });
  });

  it("qualifies the port spec for udp", async () => {
    const exec = fakeExec({ output: "0.0.0.0:32769" });
    const cli = createDockerCli(exec);
    await cli.port("container123", 53, "udp");
    expect(exec).toHaveBeenCalledWith(["port", "container123", "53/udp"], { timeoutMs: 120_000 });
  });

  it("throws on a non-zero exit code", async () => {
    const exec = fakeExec({ output: "", exitCode: 1 });
    const cli = createDockerCli(exec);
    await expect(cli.port("container123", 8080)).rejects.toThrow(/docker port/);
  });
});

describe("createDockerCli — start", () => {
  it("resolves on exit code 0", async () => {
    const exec = fakeExec();
    const cli = createDockerCli(exec);
    await expect(cli.start("container123")).resolves.toBeUndefined();
    expect(exec).toHaveBeenCalledWith(["start", "container123"], { timeoutMs: 120_000 });
  });

  it("throws on a non-zero exit code", async () => {
    const exec = fakeExec({ output: "no such container", exitCode: 1 });
    const cli = createDockerCli(exec);
    await expect(cli.start("nope")).rejects.toThrow(/no such container/);
  });
});

describe("createDockerCli — rm", () => {
  it("plain rm without force", async () => {
    const exec = fakeExec();
    const cli = createDockerCli(exec);
    await cli.rm("container123");
    expect(exec).toHaveBeenCalledWith(["rm", "container123"], { timeoutMs: 120_000 });
  });

  it("adds -f when force is set", async () => {
    const exec = fakeExec();
    const cli = createDockerCli(exec);
    await cli.rm("container123", { force: true });
    expect(exec).toHaveBeenCalledWith(["rm", "-f", "container123"], { timeoutMs: 120_000 });
  });

  it("throws on a non-zero exit code", async () => {
    const exec = fakeExec({ output: "no such container", exitCode: 1 });
    const cli = createDockerCli(exec);
    await expect(cli.rm("nope")).rejects.toThrow(/no such container/);
  });
});
