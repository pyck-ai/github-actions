/**
 * `docker buildx bake --print` — the source of truth for real target names,
 * tags, and build contexts, used both to validate a manifest's `match`
 * globs (`manifest/match.ts`) and to resolve a target to a concrete image
 * ref (`resolve.ts`).
 *
 * Deliberately does NOT reuse `docker/cli.ts`'s `spawnExec` (which merges
 * stderr into stdout): `docker buildx bake --print` writes its build
 * progress (`#1 [internal] load local bake definitions ...`) to STDERR and
 * the JSON document to STDOUT — merging the two would interleave progress
 * lines into the JSON and break parsing. Measured against a real bake file
 * (`pyck-ai/baseimages`): stdout is exactly the JSON, stderr is exactly the
 * progress lines, with a real build.
 */
export interface BakeTarget {
    /** The bake target's own name, e.g. `"agent-alpine"`. */
    name: string;
    /** Every tag bake would apply to this target, in declared order. */
    tags: string[];
    /** The target's build context path, relative to the bake file. */
    context: string;
}
/**
 * `docker buildx bake --print` failed to run, or its output was not the
 * JSON shape expected. Always an INFRASTRUCTURE error (exit 3): it means
 * `imgverify` could not even discover what to verify, not that an image
 * failed a check.
 */
export declare class BakeError extends Error {
    constructor(message: string);
}
/**
 * Parses `docker buildx bake --print`'s JSON document (already captured as
 * text — from a live subprocess or a `--bake-print` fixture file) into a
 * flat list of {@link BakeTarget}. Pure — no I/O.
 */
export declare function parseBakePrint(json: string): BakeTarget[];
/** The injectable seam: given `docker` argv (without the leading `docker`) and an env overlay, run it and resolve with stdout/stderr kept separate. */
export type BakeExecFn = (args: readonly string[], opts: {
    timeoutMs: number;
    env?: Readonly<Record<string, string>>;
}) => Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
}>;
/**
 * The real {@link BakeExecFn}: shells out to `docker`, keeping stdout and
 * stderr in separate buffers (see this module's doc comment for why that
 * separation is load-bearing here, unlike `docker/cli.ts`'s `spawnExec`).
 */
export declare function spawnBakeExec(args: readonly string[], opts: {
    timeoutMs: number;
    env?: Readonly<Record<string, string>>;
}): ReturnType<BakeExecFn>;
export interface RunBakePrintOptions {
    /** Extra argv appended after `buildx bake --print`, e.g. specific target names. */
    args?: string[];
    /** Env vars overlaid on the subprocess's environment, e.g. `REGISTRY`. */
    env?: Readonly<Record<string, string>>;
    timeoutMs?: number;
}
/**
 * Runs `docker buildx bake --print [args...]` via `exec` (defaulting to the
 * real `docker` binary) and parses its output into {@link BakeTarget}s.
 * A non-zero exit, a timeout, or unparseable output all throw
 * {@link BakeError} — always an infrastructure error, never a check
 * failure.
 */
export declare function runBakePrint(exec?: BakeExecFn, options?: RunBakePrintOptions): Promise<BakeTarget[]>;
//# sourceMappingURL=bake.d.ts.map