import { spawn } from "node:child_process";

/**
 * The single seam between `imgverify`'s check logic and the real `docker`
 * CLI. This module defines the interface and a real implementation ONLY —
 * it has no callers yet. Check kinds (pass 2) and target resolution / the
 * CLI entrypoint (pass 3) consume {@link DockerCli}; everything below this
 * seam (buildargs, manifest schema, substitution, target matching) is
 * pure and testable with fixtures, no docker daemon required.
 *
 * Two semantics are load-bearing and easy to lose if `run` is
 * reimplemented later, so they are baked in here:
 *
 * - stderr is merged into stdout (`2>&1`, via `stdio: ["ignore", "pipe",
 *   "pipe"]` piped into the same buffer). Several tools under test print
 *   their `--version` output to stderr, and the bash predecessor relies
 *   on seeing it.
 * - `run` invokes `docker run --entrypoint sh ... <image> -c <command>`,
 *   which OVERRIDES the image's `ENTRYPOINT` and DISCARDS its `CMD`. A
 *   check's `run` string is always executed as `sh -c '<run>'` inside the
 *   image, never via the image's own entrypoint/cmd.
 *
 * `timeoutMs` defaults to 120000 (2 minutes) for every operation. The
 * bash predecessor has no timeout anywhere, so a single hung check
 * currently hangs the whole job until GitHub's 60-minute hard limit.
 */

const DEFAULT_TIMEOUT_MS = 120_000;

/** The run identity passed to `docker run -u`: the image default, `root` (uid 0), or an explicit uid. */
export type DockerRunAs = "default" | "root" | number;

export interface DockerMount {
  host: string;
  container: string;
  ro?: boolean;
}

export interface DockerRunOptions {
  image: string;
  /** Executed as `sh -c "<command>"`, overriding the image's ENTRYPOINT/CMD. */
  command: string;
  as?: DockerRunAs;
  mounts?: DockerMount[];
  /** Defaults to {@link DEFAULT_TIMEOUT_MS} (120000ms). */
  timeoutMs?: number;
}

export interface DockerExecResult {
  /** Combined stdout+stderr (`2>&1`). */
  output: string;
  exitCode: number | null;
  timedOut: boolean;
}

export interface DockerCreateOptions {
  image: string;
  /** Extra `docker create` flags, e.g. `-u`/`-v`, inserted before `image`. */
  args?: string[];
  /**
   * Trailing `[COMMAND] [ARG...]`, appended after `image`. `docker create`
   * refuses an image with no `CMD`/`ENTRYPOINT` (every scratch image)
   * unless one is supplied here; the check kind that needs this (
   * `imageFile`, to export a scratch image's filesystem without ever
   * running it) passes a dummy command that is never executed.
   */
  cmd?: string[];
}

/**
 * Typed wrapper over the subset of the `docker` CLI `imgverify` needs.
 * All six operations are async and shell out to the real `docker` binary
 * in {@link createDockerCli}'s default implementation; an alternate
 * `exec` function can be injected for testing without a docker daemon.
 */
export interface DockerCli {
  /** `docker inspect <ref>` — returns the parsed JSON array docker prints. */
  inspect(ref: string): Promise<unknown>;
  /** `docker run --rm --entrypoint sh [-u ...] [-v ...] <image> -c "<command>"`. */
  run(options: DockerRunOptions): Promise<DockerExecResult>;
  /** `docker create [args...] <image> [cmd...]` — returns the created container ID. */
  create(options: DockerCreateOptions): Promise<string>;
  /** `docker export <containerId>` — returns the tar archive of the container's filesystem. */
  export(containerId: string): Promise<Buffer>;
  /** `docker pull <ref>`. */
  pull(ref: string): Promise<void>;
  /** `docker port <containerId> <containerPort>[/protocol]` — returns the host-side mapping, e.g. `0.0.0.0:32768`. */
  port(containerId: string, containerPort: number, protocol?: "tcp" | "udp"): Promise<string>;
  /** `docker start <containerId>` — starts a previously `create`d container without attaching. */
  start(containerId: string): Promise<void>;
  /** `docker rm [-f] <containerId>` — used to clean up containers created by `create` (`run --rm` cleans up its own). */
  rm(containerId: string, options?: { force?: boolean }): Promise<void>;
}

/** The injectable seam: given argv (without the leading `docker`), run it and resolve with the result. */
export type ExecFn = (
  args: readonly string[],
  opts: { timeoutMs: number },
) => Promise<DockerExecResult>;

/**
 * The injectable seam for binary output (`docker export`, which streams a
 * tar archive on stdout). Deliberately separate from {@link ExecFn}:
 * `export`'s stdout is a binary tar stream and must NOT have stderr
 * merged into it the way `run`'s text output does, and it must not be
 * decoded as UTF-8 along the way (which would corrupt non-ASCII bytes).
 */
export type ExecBinaryFn = (
  args: readonly string[],
  opts: { timeoutMs: number },
) => Promise<{ stdout: Buffer; stderr: string; exitCode: number | null; timedOut: boolean }>;

function asFlag(as: DockerRunAs | undefined): string[] {
  if (as === undefined || as === "default") {
    return [];
  }
  if (as === "root") {
    return ["-u", "0"];
  }
  return ["-u", String(as)];
}

function mountFlags(mounts: readonly DockerMount[] | undefined): string[] {
  if (!mounts) {
    return [];
  }
  return mounts.flatMap((m) => ["-v", `${m.host}:${m.container}${m.ro ? ":ro" : ""}`]);
}

/**
 * The real `ExecFn`: shells out to the `docker` binary via `spawn`,
 * merging stderr into the same buffer as stdout, and enforcing
 * `opts.timeoutMs` by killing the process (SIGKILL) if it does not exit
 * in time.
 */
export function spawnExec(
  args: readonly string[],
  opts: { timeoutMs: number },
): Promise<DockerExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", [...args], { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ output: Buffer.concat(chunks).toString("utf8"), exitCode: code, timedOut });
    });
  });
}

/**
 * The real `ExecBinaryFn`: shells out to `docker`, keeping stdout as a raw
 * `Buffer` (for `export`'s tar stream) and stderr as a separate decoded
 * string, rather than merging the two the way {@link spawnExec} does.
 */
export function spawnExecBinary(
  args: readonly string[],
  opts: { timeoutMs: number },
): ReturnType<ExecBinaryFn> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", [...args], { stdio: ["ignore", "pipe", "pipe"] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode: code,
        timedOut,
      });
    });
  });
}

/**
 * Builds a {@link DockerCli}. `exec` and `execBinary` default to
 * {@link spawnExec} / {@link spawnExecBinary} (the real `docker` binary);
 * pass fakes to test check logic without a docker daemon.
 */
export function createDockerCli(
  exec: ExecFn = spawnExec,
  execBinary: ExecBinaryFn = spawnExecBinary,
): DockerCli {
  return {
    async inspect(ref) {
      const result = await exec(["inspect", ref], { timeoutMs: DEFAULT_TIMEOUT_MS });
      if (result.exitCode !== 0) {
        throw new Error(
          `docker inspect ${ref} failed (exit ${String(result.exitCode)}): ${result.output}`,
        );
      }
      return JSON.parse(result.output) as unknown;
    },

    async run(options) {
      const args = [
        "run",
        "--rm",
        "--entrypoint",
        "sh",
        ...asFlag(options.as),
        ...mountFlags(options.mounts),
        options.image,
        "-c",
        options.command,
      ];
      return exec(args, { timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS });
    },

    async create(options) {
      const args = ["create", ...(options.args ?? []), options.image, ...(options.cmd ?? [])];
      const result = await exec(args, { timeoutMs: DEFAULT_TIMEOUT_MS });
      if (result.exitCode !== 0) {
        throw new Error(
          `docker create ${options.image} failed (exit ${String(result.exitCode)}): ${result.output}`,
        );
      }
      return result.output.trim();
    },

    async export(containerId) {
      const result = await execBinary(["export", containerId], { timeoutMs: DEFAULT_TIMEOUT_MS });
      if (result.exitCode !== 0) {
        throw new Error(
          `docker export ${containerId} failed (exit ${String(result.exitCode)}): ${result.stderr}`,
        );
      }
      return result.stdout;
    },

    async pull(ref) {
      const result = await exec(["pull", ref], { timeoutMs: DEFAULT_TIMEOUT_MS });
      if (result.exitCode !== 0) {
        throw new Error(
          `docker pull ${ref} failed (exit ${String(result.exitCode)}): ${result.output}`,
        );
      }
    },

    async port(containerId, containerPort, protocol = "tcp") {
      const spec = protocol === "tcp" ? String(containerPort) : `${containerPort}/${protocol}`;
      const result = await exec(["port", containerId, spec], { timeoutMs: DEFAULT_TIMEOUT_MS });
      if (result.exitCode !== 0) {
        throw new Error(
          `docker port ${containerId} ${spec} failed (exit ${String(result.exitCode)}): ${result.output}`,
        );
      }
      return result.output.trim();
    },

    async start(containerId) {
      const result = await exec(["start", containerId], { timeoutMs: DEFAULT_TIMEOUT_MS });
      if (result.exitCode !== 0) {
        throw new Error(
          `docker start ${containerId} failed (exit ${String(result.exitCode)}): ${result.output}`,
        );
      }
    },

    async rm(containerId, options) {
      const args = options?.force ? ["rm", "-f", containerId] : ["rm", containerId];
      const result = await exec(args, { timeoutMs: DEFAULT_TIMEOUT_MS });
      if (result.exitCode !== 0) {
        throw new Error(
          `docker rm ${containerId} failed (exit ${String(result.exitCode)}): ${result.output}`,
        );
      }
    },
  };
}
