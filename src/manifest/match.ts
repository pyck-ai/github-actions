import { ManifestError, type Check, type Manifest } from "./schema.js";

/**
 * Glob matching and target resolution against real Docker Bake target
 * names. This is deliberately split out from `schema.ts`: schema
 * validation is pure structure (is this a well-formed manifest?) and can
 * run without knowing anything about the consuming repo's Bake file,
 * whereas "does this `match` glob hit anything?" requires the actual list
 * of target names, which only the caller (pass 2's CLI) has. Keeping the
 * zero-hit check here means a manifest can be schema-validated in
 * isolation (e.g. in a unit test) while the target-resolution failure
 * mode — a typo'd `match` pattern silently matching nothing, which was a
 * silent-skip failure mode in the bash predecessor — is still a hard
 * error the moment real target names are available.
 */

const GLOB_SPECIAL_CHARS = /[.+^${}()|[\]\\]/g;

/** Converts a `*`/`?` glob (no other wildcard syntax) into an anchored RegExp. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(GLOB_SPECIAL_CHARS, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

/** Whether a Bake target name matches a `*`/`?` glob pattern. */
export function globMatch(pattern: string, targetName: string): boolean {
  return globToRegExp(pattern).test(targetName);
}

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
export function resolveTargets(
  manifest: Manifest,
  targetNames: readonly string[],
): ReadonlyMap<string, Check[]> {
  const result = new Map<string, Check[]>();
  for (const name of targetNames) {
    result.set(name, [...(manifest.defaults?.checks ?? [])]);
  }

  manifest.targets.forEach((entry, idx) => {
    const matched = targetNames.filter((name) => globMatch(entry.match, name));
    if (matched.length === 0) {
      throw new ManifestError(
        `match pattern "${entry.match}" matched none of the ${targetNames.length} known bake targets`,
        `targets[${idx}].match`,
      );
    }
    for (const name of matched) {
      result.get(name)?.push(...entry.checks);
    }
  });

  return result;
}
