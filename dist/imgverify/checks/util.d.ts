import type { AsIdentity } from "../manifest/schema.js";
import type { DockerMount } from "../docker/cli.js";
/** Renders an `AsIdentity` for a check's label, e.g. `"default user"`, `"uid 0"`, `"uid 1001"`. */
export declare function asLabel(as: AsIdentity | undefined): string;
/** Splits a container's line-oriented output into non-empty, `\r`-stripped lines, as the bash predecessor's `tr -d '\r' | grep -v '^$'` does. */
export declare function nonEmptyLines(output: string): string[];
/**
 * Resolves a manifest's `sh` check `mounts[].host` relative to the
 * manifest file's own directory (not the process cwd), so fixture paths
 * in a manifest work regardless of where `imgverify` is invoked from. An
 * already-absolute host path is left untouched.
 */
export declare function resolveMounts(mounts: readonly {
    host: string;
    container: string;
    ro?: boolean;
}[] | undefined, manifestDir: string): DockerMount[] | undefined;
//# sourceMappingURL=util.d.ts.map