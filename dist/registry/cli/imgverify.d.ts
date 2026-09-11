#!/usr/bin/env node
import { type DockerCli } from "../docker/cli.js";
import { type BakeExecFn } from "../targets/bake.js";
type Subcommand = "run" | "validate" | "buildargs";
interface ParsedArgs {
    manifest?: string;
    buildargs?: string;
    digests?: string;
    registry?: string;
    /** Repeatable `--target <glob>`. */
    targets: string[];
    bakePrint?: string;
    json?: string;
    timeoutMs?: number;
    noColor: boolean;
    /** Parsed only to be rejected — see this module's doc comment and the CLI surface spec. */
    platform?: string;
    format?: string;
}
/**
 * Parses argv (without `node`/script path). The first token is a
 * subcommand (`run`/`validate`/`buildargs`) ONLY if it exactly matches one
 * of those three names; otherwise the whole of argv is treated as `run`'s
 * flags — this is what lets `imgverify --digests digests.json` (no
 * subcommand) work as `build-image.yml` requires.
 */
export declare function parseArgv(argv: readonly string[]): {
    subcommand: Subcommand;
    args: ParsedArgs;
};
/**
 * Injectable dependencies for testing `run` end-to-end without a real
 * `docker` binary: a fake {@link DockerCli} (image inspect/pull/run/etc.)
 * and a fake {@link BakeExecFn} (`docker buildx bake --print`'s
 * subprocess). {@link mainEntry} (the real CLI) passes neither, so
 * production always uses the real `docker` binary via
 * {@link timeoutOverrideExec}/{@link spawnBakeExec}.
 */
export interface CliDeps {
    cli?: DockerCli;
    bakeExec?: BakeExecFn;
}
/** Runs the CLI end-to-end and returns the process exit code — never calls `process.exit` itself, so it stays testable. */
export declare function runCommand(argv: readonly string[], deps?: CliDeps): Promise<number>;
export {};
//# sourceMappingURL=imgverify.d.ts.map