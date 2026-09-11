import { type Check, type Manifest } from "./schema.js";
/** Whether a Bake target name matches a `*`/`?` glob pattern. */
export declare function globMatch(pattern: string, targetName: string): boolean;
/**
 * Resolves, for every name in `targetNames`, the ordered list of checks
 * that apply to it: `defaults.checks` first, then the `checks` of every
 * `targets[]` entry whose `match` glob hits that name, appended in the
 * file's declared order (so a target hit by two patterns gets both
 * patterns' checks concatenated, oracle-comparable and deterministic).
 *
 * Throws {@link ManifestError} if any `match` pattern in the manifest
 * matches zero of `targetNames` — a misspelled or stale pattern must fail
 * loud here, not silently resolve to "no checks for this target".
 */
export declare function resolveTargets(manifest: Manifest, targetNames: readonly string[]): ReadonlyMap<string, Check[]>;
//# sourceMappingURL=match.d.ts.map