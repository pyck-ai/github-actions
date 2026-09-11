import path from "node:path";
import type { AsIdentity } from "../manifest/schema.js";
import type { DockerMount } from "../docker/cli.js";

/** Renders an `AsIdentity` for a check's label, e.g. `"default user"`, `"uid 0"`, `"uid 1001"`. */
export function asLabel(as: AsIdentity | undefined): string {
  if (as === undefined || as === "default") {
    return "default user";
  }
  if (as === "root") {
    return "uid 0";
  }
  return `uid ${String(as)}`;
}

/** Splits a container's line-oriented output into non-empty, `\r`-stripped lines, as the bash predecessor's `tr -d '\r' | grep -v '^$'` does. */
export function nonEmptyLines(output: string): string[] {
  return output
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.length > 0);
}

/**
 * Resolves a manifest's `sh` check `mounts[].host` relative to the
 * manifest file's own directory (not the process cwd), so fixture paths
 * in a manifest work regardless of where `imgverify` is invoked from. An
 * already-absolute host path is left untouched.
 */
export function resolveMounts(
  mounts: readonly { host: string; container: string; ro?: boolean }[] | undefined,
  manifestDir: string,
): DockerMount[] | undefined {
  if (!mounts) {
    return undefined;
  }
  return mounts.map((m) => ({
    host: path.isAbsolute(m.host) ? m.host : path.resolve(manifestDir, m.host),
    container: m.container,
    ...(m.ro !== undefined && { ro: m.ro }),
  }));
}
