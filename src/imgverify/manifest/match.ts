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
 * The minimal shape `resolveTargets` needs from a real `BakeTarget`
 * (`targets/bake.ts`) — kept local rather than importing that type so
 * this module stays decoupled from the bake-file layer (see the module
 * doc comment above), while still letting the completeness check below
 * distinguish tagged from tagless targets.
 */
export interface ResolvableTarget {
  readonly name: string;
  readonly tags: readonly string[];
}

/**
 * Resolves, for every target in `targets`, the ordered list of checks
 * that apply to it: `defaults.checks` first, then the `checks` of every
 * `targets[]` entry whose `match` glob hits that name, appended in the
 * file's declared order (so a target hit by two patterns gets both
 * patterns' checks concatenated, oracle-comparable and deterministic).
 *
 * Throws {@link ManifestError} in two symmetric cases:
 * - any `match` pattern in the manifest matches zero of `targets` — a
 *   misspelled or stale pattern must fail loud here, not silently
 *   resolve to "no checks for this target"; and
 * - any TAGGED target ends up with zero resolved checks (no `match`
 *   covers it and there is no `defaults.checks`) — otherwise the check
 *   loop in `cli.ts` runs zero times, "0 checks passed" is reported, and
 *   the run exits 0 having verified nothing. Tagless targets (bake
 *   stages with no tags, e.g. a shared internal-only build stage) are
 *   exempt: they are filtered out of the CI matrix before verification
 *   ever runs (`build-image.yml`'s `discover` job) and `targets/resolve.ts`
 *   already refuses to resolve them to an image ref regardless of
 *   manifest coverage, so requiring a manifest entry for one would be
 *   pure busywork for an image that can never silently pass with 0 checks.
 */
export function resolveTargets(
  manifest: Manifest,
  targets: readonly ResolvableTarget[],
): ReadonlyMap<string, Check[]> {
  const targetNames = targets.map((t) => t.name);
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

  const uncovered = targets
    .filter((t) => t.tags.length > 0 && (result.get(t.name)?.length ?? 0) === 0)
    .map((t) => t.name);
  if (uncovered.length > 0) {
    throw new ManifestError(
      `no manifest coverage for bake target(s): ${uncovered.join(", ")} — add a "targets[]" ` +
        `entry whose "match" glob covers ${uncovered.length === 1 ? "it" : "them"} ` +
        `(or a "defaults.checks" block that applies to every target)`,
      "<root>",
    );
  }

  return result;
}
