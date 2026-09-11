import type { BuildArgs } from "./parse.js";
/**
 * Output dialects for a parsed {@link BuildArgs} map, matching the three
 * ways the org's tooling has historically consumed `buildargs.conf`:
 * a plain `KEY=VALUE` env file, Docker Bake `--set` flags, and lines
 * appended to `$GITHUB_ENV`.
 */
export type EmitFormat = "env" | "bake" | "github-env";
/**
 * Formats a parsed {@link BuildArgs} map as one line per entry, in
 * insertion order (the order the keys appeared in the source file).
 *
 * - `"env"` / `"github-env"` — `KEY=VALUE`, suitable for a plain env file
 *   or for appending to `$GITHUB_ENV`.
 * - `"bake"` — `--set *.args.KEY=VALUE`, one flag per array entry, meant
 *   to be passed straight through as separate `docker buildx bake` argv
 *   entries (not shell-joined, so no quoting concerns).
 *
 * Pure formatting only — no file I/O, no env var lookups.
 */
export declare function emitBuildArgs(args: BuildArgs, format: EmitFormat): string[];
//# sourceMappingURL=emit.d.ts.map