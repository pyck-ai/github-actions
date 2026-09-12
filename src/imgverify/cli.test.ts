import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeCli } from "./checks/test-helpers.js";
import type { DockerCli, DockerExecResult } from "./docker/cli.js";
import type { BakeExecFn } from "./targets/bake.js";
import { parseArgv, resolveArgv, runCommand, tokenizeArgs } from "./cli.js";

const BUILDARGS_CONF = "FOO_VERSION=1.2.3\n";

const MANIFEST_YAML = `
version: 1
targets:
  - match: "*"
    checks:
      - kind: cmd
        commands: ["go"]
`;

const PORT_MANIFEST_YAML = `
version: 1
targets:
  - match: "img"
    checks:
      - kind: cmd
        commands: ["go"]
`;

function bakePrintJson(targets: Record<string, { tags: string[]; context?: string }>): string {
  return JSON.stringify({
    target: Object.fromEntries(
      Object.entries(targets).map(([name, t]) => [
        name,
        { context: t.context ?? "docker/x", tags: t.tags },
      ]),
    ),
  });
}

const SAMPLE_BAKE_PRINT = bakePrintJson({
  "agent-alpine": { tags: ["ghcr.io/x/agent:latest", "ghcr.io/x/agent:alpine"] },
  static: { tags: ["ghcr.io/x/static:latest"] },
});

describe("parseArgv", () => {
  it("defaults to the run subcommand when the first token is not a known subcommand", () => {
    const { subcommand, args } = parseArgv(["--digests", "digests.json"]);
    expect(subcommand).toBe("run");
    expect(args.digests).toBe("digests.json");
  });

  it("treats --digests as a trailing argument appended to a bare invocation (build-image.yml's shape)", () => {
    const { subcommand, args } = parseArgv(["--manifest", "m.yaml", "--digests", "d.json"]);
    expect(subcommand).toBe("run");
    expect(args.manifest).toBe("m.yaml");
    expect(args.digests).toBe("d.json");
  });

  it("recognises an explicit run/validate/buildargs subcommand", () => {
    expect(parseArgv(["validate", "--manifest", "m.yaml"]).subcommand).toBe("validate");
    expect(parseArgv(["buildargs", "--format", "env"]).subcommand).toBe("buildargs");
    expect(parseArgv(["run", "--manifest", "m.yaml"]).subcommand).toBe("run");
  });

  it("collects repeated --target flags", () => {
    const { args } = parseArgv(["--target", "agent-*", "--target", "static"]);
    expect(args.targets).toEqual(["agent-*", "static"]);
  });

  it("parses --timeout-ms as a number", () => {
    expect(parseArgv(["--timeout-ms", "5000"]).args.timeoutMs).toBe(5000);
  });

  it("rejects a non-positive --timeout-ms", () => {
    expect(() => parseArgv(["--timeout-ms", "0"])).toThrow(/--timeout-ms/);
    expect(() => parseArgv(["--timeout-ms", "abc"])).toThrow(/--timeout-ms/);
  });

  it("parses --jobs as a positive integer", () => {
    expect(parseArgv(["--jobs", "3"]).args.jobs).toBe(3);
    expect(parseArgv(["--jobs", "1"]).args.jobs).toBe(1);
  });

  it("rejects --jobs 0, a negative --jobs, and a non-integer --jobs as CONFIG errors", () => {
    expect(() => parseArgv(["--jobs", "0"])).toThrow(/--jobs/);
    expect(() => parseArgv(["--jobs", "-1"])).toThrow(/--jobs/);
    expect(() => parseArgv(["--jobs", "abc"])).toThrow(/--jobs/);
    expect(() => parseArgv(["--jobs", "3.5"])).toThrow(/--jobs/);
  });

  it("parses --platform (for later rejection by runCommand)", () => {
    expect(parseArgv(["--platform", "linux/amd64"]).args.platform).toBe("linux/amd64");
  });

  it("throws on an unknown flag", () => {
    expect(() => parseArgv(["--bogus"])).toThrow(/unknown flag/);
  });

  it("throws when a flag's value is missing", () => {
    expect(() => parseArgv(["--manifest"])).toThrow(/missing value/);
  });

  it("sets --no-color as a boolean switch", () => {
    expect(parseArgv(["--no-color"]).args.noColor).toBe(true);
    expect(parseArgv([]).args.noColor).toBe(false);
  });
});

describe("tokenizeArgs", () => {
  it("splits plain whitespace-separated tokens", () => {
    expect(tokenizeArgs("run --digests digests.json")).toEqual([
      "run",
      "--digests",
      "digests.json",
    ]);
  });

  it("keeps a single-quoted segment as one token", () => {
    expect(tokenizeArgs("--manifest 'some path.yaml'")).toEqual(["--manifest", "some path.yaml"]);
  });

  it("keeps a double-quoted segment as one token", () => {
    expect(tokenizeArgs('--manifest "some path.yaml"')).toEqual(["--manifest", "some path.yaml"]);
  });

  it("handles a mix of quoted and unquoted tokens", () => {
    expect(tokenizeArgs(`run --manifest "some path.yaml" --no-color`)).toEqual([
      "run",
      "--manifest",
      "some path.yaml",
      "--no-color",
    ]);
  });

  it("collapses repeated whitespace and drops empty tokens (build-image.yml's real doubled-space shape)", () => {
    expect(tokenizeArgs("run  --digests digests.json")).toEqual([
      "run",
      "--digests",
      "digests.json",
    ]);
  });

  it("returns no tokens for a blank string", () => {
    expect(tokenizeArgs("   ")).toEqual([]);
  });
});

describe("resolveArgv", () => {
  it("uses argv when INPUT_ARGS is undefined (plain CLI mode)", () => {
    expect(resolveArgv({}, ["run", "--digests", "digests.json"])).toEqual([
      "run",
      "--digests",
      "digests.json",
    ]);
  });

  it("uses INPUT_ARGS when defined, tokenizing quoted segments (JS action mode)", () => {
    expect(
      resolveArgv({ INPUT_ARGS: 'run --manifest "some path.yaml" --digests digests.json' }, [
        "should-be-ignored",
      ]),
    ).toEqual(["run", "--manifest", "some path.yaml", "--digests", "digests.json"]);
  });

  it("throws a clear error when INPUT_ARGS is defined but blank, rather than silently using no arguments", () => {
    expect(() => resolveArgv({ INPUT_ARGS: "" }, ["ignored"])).toThrow(/args.*empty/i);
    expect(() => resolveArgv({ INPUT_ARGS: "   " }, ["ignored"])).toThrow(/args.*empty/i);
  });
});

describe("runCommand — --platform", () => {
  it("rejects --platform with 'not implemented', exit 2", async () => {
    const exitCode = await runCommand(["--platform", "linux/amd64,linux/arm64"]);
    expect(exitCode).toBe(2);
  });
});

describe("runCommand — --jobs validation", () => {
  it("exits 2 (config error), same path as other bad CLI input, for 0/-1/non-integer --jobs", async () => {
    for (const bad of ["0", "-1", "abc", "3.5"]) {
      const exitCode = await runCommand(["--jobs", bad, "--digests", "digests.json"]);
      expect(exitCode).toBe(2);
    }
  });
});

describe("runCommand — buildargs subcommand", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "imgverify-"));
    await writeFile(path.join(dir, "buildargs.conf"), BUILDARGS_CONF);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("emits env-format lines", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitCode = await runCommand([
      "buildargs",
      "--buildargs",
      path.join(dir, "buildargs.conf"),
      "--format",
      "env",
    ]);
    expect(exitCode).toBe(0);
    expect(write).toHaveBeenCalledWith("FOO_VERSION=1.2.3\n");
    write.mockRestore();
  });

  it("exits 2 for an unknown --format", async () => {
    const exitCode = await runCommand([
      "buildargs",
      "--buildargs",
      path.join(dir, "buildargs.conf"),
      "--format",
      "bogus",
    ]);
    expect(exitCode).toBe(2);
  });
});

describe("runCommand — validate subcommand (no docker at all)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "imgverify-"));
    await writeFile(path.join(dir, "buildargs.conf"), BUILDARGS_CONF);
    await writeFile(path.join(dir, ".imgverify.yaml"), MANIFEST_YAML);
    await writeFile(path.join(dir, "bake-print.json"), SAMPLE_BAKE_PRINT);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("passes schema + substitution validation without --bake-print", async () => {
    const exitCode = await runCommand([
      "validate",
      "--manifest",
      path.join(dir, ".imgverify.yaml"),
      "--buildargs",
      path.join(dir, "buildargs.conf"),
    ]);
    expect(exitCode).toBe(0);
  });

  it("also validates match globs against real target names when --bake-print is given", async () => {
    const exitCode = await runCommand([
      "validate",
      "--manifest",
      path.join(dir, ".imgverify.yaml"),
      "--buildargs",
      path.join(dir, "buildargs.conf"),
      "--bake-print",
      path.join(dir, "bake-print.json"),
    ]);
    expect(exitCode).toBe(0);
  });

  it("exits 2 (config error) for a match glob that hits nothing", async () => {
    await writeFile(
      path.join(dir, "stale.yaml"),
      `
version: 1
targets:
  - match: "nonexistent-*"
    checks:
      - kind: cmd
        commands: ["go"]
`,
    );
    const exitCode = await runCommand([
      "validate",
      "--manifest",
      path.join(dir, "stale.yaml"),
      "--buildargs",
      path.join(dir, "buildargs.conf"),
      "--bake-print",
      path.join(dir, "bake-print.json"),
    ]);
    expect(exitCode).toBe(2);
  });

  it("exits 2 for a manifest with an undefined ${VAR}", async () => {
    await writeFile(
      path.join(dir, "undef.yaml"),
      `
version: 1
targets:
  - match: "*"
    checks:
      - kind: workdir
        value: "\${NOT_DEFINED}"
`,
    );
    const exitCode = await runCommand([
      "validate",
      "--manifest",
      path.join(dir, "undef.yaml"),
      "--buildargs",
      path.join(dir, "buildargs.conf"),
    ]);
    expect(exitCode).toBe(2);
  });
});

describe("runCommand — run subcommand, exit-code matrix (no docker daemon)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "imgverify-"));
    await writeFile(path.join(dir, "buildargs.conf"), BUILDARGS_CONF);
    await writeFile(path.join(dir, ".imgverify.yaml"), MANIFEST_YAML);
    await writeFile(path.join(dir, "bake-print.json"), SAMPLE_BAKE_PRINT);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function baseArgv(extra: string[] = []): string[] {
    return [
      "run",
      "--manifest",
      path.join(dir, ".imgverify.yaml"),
      "--buildargs",
      path.join(dir, "buildargs.conf"),
      "--bake-print",
      path.join(dir, "bake-print.json"),
      ...extra,
    ];
  }

  it("exit 0 — every check passes", async () => {
    const cli = makeFakeCli({ run: async () => ({ output: "", exitCode: 0, timedOut: false }) });
    const exitCode = await runCommand(baseArgv(), { cli });
    expect(exitCode).toBe(0);
  });

  it("exit 1 — a check fails, image is otherwise fine", async () => {
    const cli = makeFakeCli({
      run: async (): Promise<DockerExecResult> => ({
        output: "go\n",
        exitCode: 0,
        timedOut: false,
      }),
    });
    const exitCode = await runCommand(baseArgv(), { cli });
    expect(exitCode).toBe(1);
  });

  it("exit 2 — config error: unknown manifest field", async () => {
    await writeFile(
      path.join(dir, "bad.yaml"),
      `
version: 1
bogusField: true
targets:
  - match: "*"
    checks:
      - kind: cmd
        commands: ["go"]
`,
    );
    const cli = makeFakeCli();
    const exitCode = await runCommand(
      [
        "run",
        "--manifest",
        path.join(dir, "bad.yaml"),
        "--buildargs",
        path.join(dir, "buildargs.conf"),
        "--bake-print",
        path.join(dir, "bake-print.json"),
      ],
      { cli },
    );
    expect(exitCode).toBe(2);
  });

  it("exit 2 — --target matches none of the known bake targets", async () => {
    const cli = makeFakeCli();
    const exitCode = await runCommand(baseArgv(["--target", "nonexistent-*"]), { cli });
    expect(exitCode).toBe(2);
  });

  it("exit 2 — completeness guard fires even when --target filters the run to a different, fully-covered target", async () => {
    // This manifest's "static" entry only covers "static" — "agent-alpine" (also present
    // in SAMPLE_BAKE_PRINT) has no coverage at all. Filtering with --target static must
    // still fail: the completeness check runs against the FULL bake target set, not the
    // --target-filtered subset (same ordering guarantee as the existing zero-hit guard).
    await writeFile(
      path.join(dir, "partial.yaml"),
      `
version: 1
targets:
  - match: "static"
    checks:
      - kind: cmd
        commands: ["go"]
`,
    );
    const cli = makeFakeCli({ run: async () => ({ output: "", exitCode: 0, timedOut: false }) });
    const exitCode = await runCommand(
      [
        "run",
        "--manifest",
        path.join(dir, "partial.yaml"),
        "--buildargs",
        path.join(dir, "buildargs.conf"),
        "--bake-print",
        path.join(dir, "bake-print.json"),
        "--target",
        "static",
      ],
      { cli },
    );
    expect(exitCode).toBe(2);
  });

  it("exit 3 — bake --print itself fails (infrastructure error)", async () => {
    const bakeExec: BakeExecFn = vi.fn(async () => ({
      stdout: "",
      stderr: "no bake file found",
      exitCode: 1,
      timedOut: false,
    }));
    const exitCode = await runCommand(
      [
        "run",
        "--manifest",
        path.join(dir, ".imgverify.yaml"),
        "--buildargs",
        path.join(dir, "buildargs.conf"),
      ],
      { bakeExec },
    );
    expect(exitCode).toBe(3);
  });

  it("exit 3 — local image is not loaded (docker inspect fails)", async () => {
    const cli = makeFakeCli({
      inspect: async () => {
        throw new Error("No such image");
      },
    });
    const exitCode = await runCommand(baseArgv(), { cli });
    expect(exitCode).toBe(3);
  });

  it("exit 3 — digest mode with no digest recorded for a target", async () => {
    await writeFile(
      path.join(dir, "digests.json"),
      JSON.stringify({ "some-other-target": "sha256:aaa" }),
    );
    const cli = makeFakeCli();
    const exitCode = await runCommand(baseArgv(["--digests", path.join(dir, "digests.json")]), {
      cli,
    });
    expect(exitCode).toBe(3);
  });
});

describe("runCommand — digest mode", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "imgverify-"));
    await writeFile(path.join(dir, "buildargs.conf"), BUILDARGS_CONF);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("derives the repo from the target's first tag with a regex, not naive splitting — registry with a port", async () => {
    await writeFile(path.join(dir, ".imgverify.yaml"), PORT_MANIFEST_YAML);
    const bakePrint = bakePrintJson({
      img: { tags: ["host:5000/img:latest", "host:5000/img:1.0"] },
    });
    await writeFile(path.join(dir, "bake-print.json"), bakePrint);
    await writeFile(path.join(dir, "digests.json"), JSON.stringify({ img: "sha256:deadbeef" }));

    let pulledRef = "";
    const cli = makeFakeCli({
      pull: async (ref) => {
        pulledRef = ref;
      },
      run: async () => ({ output: "", exitCode: 0, timedOut: false }),
    });

    const exitCode = await runCommand(
      [
        "run",
        "--manifest",
        path.join(dir, ".imgverify.yaml"),
        "--buildargs",
        path.join(dir, "buildargs.conf"),
        "--bake-print",
        path.join(dir, "bake-print.json"),
        "--digests",
        path.join(dir, "digests.json"),
      ],
      { cli },
    );

    expect(pulledRef).toBe("host:5000/img@sha256:deadbeef");
    expect(exitCode).toBe(0);
  });
});

describe("runCommand — local-tag preference chain", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "imgverify-"));
    await writeFile(path.join(dir, "buildargs.conf"), BUILDARGS_CONF);
    await writeFile(path.join(dir, ".imgverify.yaml"), MANIFEST_YAML);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function inspectedRefsFor(bakePrint: string): Promise<string[]> {
    await writeFile(path.join(dir, "bake-print.json"), bakePrint);
    const inspected: string[] = [];
    const cli: DockerCli = makeFakeCli({
      inspect: async (ref) => {
        inspected.push(ref);
        return [{ Config: {} }];
      },
      run: async () => ({ output: "", exitCode: 0, timedOut: false }),
    });
    await runCommand(
      [
        "run",
        "--manifest",
        path.join(dir, ".imgverify.yaml"),
        "--buildargs",
        path.join(dir, "buildargs.conf"),
        "--bake-print",
        path.join(dir, "bake-print.json"),
      ],
      { cli },
    );
    return inspected;
  }

  it("prefers the tag whose suffix equals the target's variant", async () => {
    const bakePrint = bakePrintJson({
      "agent-alpine": { tags: ["ghcr.io/x/agent:latest", "ghcr.io/x/agent:alpine"] },
    });
    expect(await inspectedRefsFor(bakePrint)).toEqual(["ghcr.io/x/agent:alpine"]);
  });

  it("falls back to :latest when no tag matches the variant", async () => {
    const bakePrint = bakePrintJson({
      "rover-debian": { tags: ["ghcr.io/x/rover:latest", "ghcr.io/x/rover:0.41.0"] },
    });
    expect(await inspectedRefsFor(bakePrint)).toEqual(["ghcr.io/x/rover:latest"]);
  });

  it("falls back to the first tag when neither variant nor :latest is present", async () => {
    const bakePrint = bakePrintJson({
      "agent-alpine": { tags: ["ghcr.io/x/agent:claude-2.1.268", "ghcr.io/x/agent:claude-2.1"] },
    });
    expect(await inspectedRefsFor(bakePrint)).toEqual(["ghcr.io/x/agent:claude-2.1.268"]);
  });
});

describe("runCommand — --json report file", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "imgverify-"));
    await writeFile(path.join(dir, "buildargs.conf"), BUILDARGS_CONF);
    await writeFile(path.join(dir, ".imgverify.yaml"), MANIFEST_YAML);
    await writeFile(path.join(dir, "bake-print.json"), SAMPLE_BAKE_PRINT);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes a combined JSON report with every target and the aggregate exit code", async () => {
    const cli = makeFakeCli({ run: async () => ({ output: "", exitCode: 0, timedOut: false }) });
    const jsonPath = path.join(dir, "out.json");
    const exitCode = await runCommand(
      [
        "run",
        "--manifest",
        path.join(dir, ".imgverify.yaml"),
        "--buildargs",
        path.join(dir, "buildargs.conf"),
        "--bake-print",
        path.join(dir, "bake-print.json"),
        "--json",
        jsonPath,
      ],
      { cli },
    );
    expect(exitCode).toBe(0);
    const { readFile } = await import("node:fs/promises");
    const written = JSON.parse(await readFile(jsonPath, "utf8")) as {
      targets: unknown[];
      exitCode: number;
    };
    expect(written.exitCode).toBe(0);
    expect(written.targets).toHaveLength(2);
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("runCommand — --jobs concurrency", () => {
  let dir: string;
  // Deliberately reverse-ordered vs. the manifest/bake-print declaration
  // order below (t-slow, t-fast, t-medium) so pulls finish in the OPPOSITE
  // order from how targets are declared — the out-of-order shape the
  // determinism guarantee has to survive.
  const DELAYS_MS: Record<string, number> = { "t-slow": 40, "t-fast": 5, "t-medium": 20 };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "imgverify-"));
    await writeFile(path.join(dir, "buildargs.conf"), BUILDARGS_CONF);
    await writeFile(path.join(dir, ".imgverify.yaml"), MANIFEST_YAML);
    const bakePrint = bakePrintJson({
      "t-slow": { tags: ["ghcr.io/x/t-slow:latest"] },
      "t-fast": { tags: ["ghcr.io/x/t-fast:latest"] },
      "t-medium": { tags: ["ghcr.io/x/t-medium:latest"] },
    });
    await writeFile(path.join(dir, "bake-print.json"), bakePrint);
    await writeFile(
      path.join(dir, "digests.json"),
      JSON.stringify({
        "t-slow": "sha256:aaa1",
        "t-fast": "sha256:aaa2",
        "t-medium": "sha256:aaa3",
      }),
    );
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function baseArgv(extra: string[] = []): string[] {
    return [
      "run",
      "--manifest",
      path.join(dir, ".imgverify.yaml"),
      "--buildargs",
      path.join(dir, "buildargs.conf"),
      "--bake-print",
      path.join(dir, "bake-print.json"),
      "--digests",
      path.join(dir, "digests.json"),
      ...extra,
    ];
  }

  /** `docker pull repo@digest` — delays by target (parsed out of the ref) so different targets finish in a controllable, non-declaration order. */
  function delayingCli(pullOrder: string[]): DockerCli {
    return makeFakeCli({
      pull: async (ref) => {
        const target = /\/([^/:@]+)@/.exec(ref)?.[1];
        await delay(target !== undefined ? (DELAYS_MS[target] ?? 0) : 0);
        pullOrder.push(target ?? ref);
      },
      run: async () => ({ output: "", exitCode: 0, timedOut: false }),
    });
  }

  it("out-of-order pull completion still flushes console output in the original target order (the critical determinism property)", async () => {
    const pullOrder: string[] = [];
    const cli = delayingCli(pullOrder);
    const chunks: string[] = [];
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        chunks.push(String(chunk));
        return true;
      });

    const exitCode = await runCommand(baseArgv(["--jobs", "3"]), { cli });
    write.mockRestore();

    expect(exitCode).toBe(0);
    // Sanity check that this test actually exercises out-of-order
    // completion — if pulls happened to finish in declaration order, the
    // ordering assertion below would be trivially true and prove nothing.
    expect(pullOrder).toEqual(["t-fast", "t-medium", "t-slow"]);

    const headerOrder = chunks
      .filter((chunk) => chunk.includes(" — ghcr.io"))
      .map((chunk) => /^\n(\S+) —/.exec(chunk)?.[1]);
    expect(headerOrder).toEqual(["t-slow", "t-fast", "t-medium"]);
  });

  it("--jobs 1 produces byte-identical output to concurrent (--jobs 4) verification for the same inputs", async () => {
    async function collect(extra: string[]): Promise<{ exitCode: number; output: string }> {
      const pullOrder: string[] = [];
      const cli = delayingCli(pullOrder);
      const chunks: string[] = [];
      const write = vi
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk: string | Uint8Array) => {
          chunks.push(String(chunk));
          return true;
        });
      const exitCode = await runCommand(baseArgv(extra), { cli });
      write.mockRestore();
      return { exitCode, output: chunks.join("") };
    }

    const serial = await collect(["--jobs", "1"]);
    const concurrent = await collect(["--jobs", "4"]);

    expect(serial.exitCode).toBe(0);
    expect(concurrent.exitCode).toBe(0);
    expect(concurrent.output).toBe(serial.output);
  });

  it("a failing target (infra error) does not abort the others — all are attempted and reported", async () => {
    const cli = makeFakeCli({
      pull: async (ref) => {
        if (ref.startsWith("ghcr.io/x/t-fast@")) {
          throw new Error("pull failed");
        }
      },
      run: async () => ({ output: "", exitCode: 0, timedOut: false }),
    });
    const jsonPath = path.join(dir, "out.json");
    const exitCode = await runCommand(baseArgv(["--jobs", "3", "--json", jsonPath]), { cli });

    expect(exitCode).toBe(3);
    const { readFile } = await import("node:fs/promises");
    const written = JSON.parse(await readFile(jsonPath, "utf8")) as {
      targets: { target: string }[];
    };
    expect(written.targets.map((t) => t.target).sort()).toEqual(["t-medium", "t-slow"]);
  });

  it("exit code 1 (check failure) is unchanged under concurrent verification", async () => {
    const cli = makeFakeCli({
      pull: async () => undefined,
      run: async () => ({ output: "go\n", exitCode: 0, timedOut: false }),
    });
    const exitCode = await runCommand(baseArgv(["--jobs", "3"]), { cli });
    expect(exitCode).toBe(1);
  });

  it("exit code 3 (infra error) is unchanged under concurrent verification", async () => {
    const cli = makeFakeCli({
      pull: async () => {
        throw new Error("boom");
      },
    });
    const exitCode = await runCommand(baseArgv(["--jobs", "3"]), { cli });
    expect(exitCode).toBe(3);
  });

  it("bounds concurrency to --jobs: no more than N pulls are ever in flight simultaneously", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const cli = makeFakeCli({
      pull: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await delay(15);
        inFlight -= 1;
      },
      run: async () => ({ output: "", exitCode: 0, timedOut: false }),
    });

    const exitCode = await runCommand(baseArgv(["--jobs", "2"]), { cli });

    expect(exitCode).toBe(0);
    // 3 targets, --jobs 2: exactly two workers can be pulling at once.
    expect(maxInFlight).toBe(2);
  });
});
