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
    rm(containerId: string, options?: {
        force?: boolean;
    }): Promise<void>;
}
/** The injectable seam: given argv (without the leading `docker`), run it and resolve with the result. */
export type ExecFn = (args: readonly string[], opts: {
    timeoutMs: number;
}) => Promise<DockerExecResult>;
/**
 * The injectable seam for binary output (`docker export`, which streams a
 * tar archive on stdout). Deliberately separate from {@link ExecFn}:
 * `export`'s stdout is a binary tar stream and must NOT have stderr
 * merged into it the way `run`'s text output does, and it must not be
 * decoded as UTF-8 along the way (which would corrupt non-ASCII bytes).
 */
export type ExecBinaryFn = (args: readonly string[], opts: {
    timeoutMs: number;
}) => Promise<{
    stdout: Buffer;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
}>;
/**
 * The real `ExecFn`: shells out to the `docker` binary via `spawn`,
 * merging stderr into the same buffer as stdout, and enforcing
 * `opts.timeoutMs` by killing the process (SIGKILL) if it does not exit
 * in time.
 */
export declare function spawnExec(args: readonly string[], opts: {
    timeoutMs: number;
}): Promise<DockerExecResult>;
/**
 * The real `ExecBinaryFn`: shells out to `docker`, keeping stdout as a raw
 * `Buffer` (for `export`'s tar stream) and stderr as a separate decoded
 * string, rather than merging the two the way {@link spawnExec} does.
 */
export declare function spawnExecBinary(args: readonly string[], opts: {
    timeoutMs: number;
}): ReturnType<ExecBinaryFn>;
/**
 * Builds a {@link DockerCli}. `exec` and `execBinary` default to
 * {@link spawnExec} / {@link spawnExecBinary} (the real `docker` binary);
 * pass fakes to test check logic without a docker daemon.
 */
export declare function createDockerCli(exec?: ExecFn, execBinary?: ExecBinaryFn): DockerCli;
//# sourceMappingURL=cli.d.ts.map