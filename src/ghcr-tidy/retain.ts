import type { Digest, Tag } from "./domain.js";
import type { PackageVersionRecord } from "./ports.js";

const MS_PER_DAY = 86_400_000;

/** A live, tagged registry root: a digest and the FULL set of tags (from the registry, digest-scoped) that point at it. */
export interface LiveRoot {
  readonly digest: Digest;
  readonly tags: ReadonlySet<Tag>;
}

/**
 * Retention policy for {@link computeKeepRoots}. `keepDays` and
 * `graceDays` are deliberately DIFFERENT knobs answering different
 * questions, both defaulting to 30 and not to be diverged from casually:
 * `keepDays` protects TAGGED ROOTS via this policy; `graceDays` (applied
 * separately, in `plan.ts`, against every version regardless of tags)
 * protects digests pushed by a build that has not yet tagged them.
 * Lowering either below the agreed floor deletes inside it.
 */
export interface RetentionPolicy {
  /** A tag matching any of these regexes is protected, and so is every OTHER tag sharing its digest (digest-scoped, not tag-scoped). */
  readonly protectedTagPatterns: readonly RegExp[];
  /** The newest N roots (by `PackageVersionRecord.createdAt`) are kept regardless of tag or age. */
  readonly keepLast: number;
  /** A root younger than this many days is kept regardless of tag or count. */
  readonly keepDays: number;
}

function isProtectedByTag(tags: ReadonlySet<Tag>, patterns: readonly RegExp[]): boolean {
  if (patterns.length === 0) {
    return false;
  }
  for (const t of tags) {
    if (patterns.some((p) => p.test(t))) {
      return true;
    }
  }
  return false;
}

/**
 * Age in days of a root, from the matching `PackageVersionRecord`, or
 * `undefined` if the root's digest has no matching entry in the Packages
 * API listing (e.g. a digest pushed so recently that API is not yet
 * consistent). Age `undefined` is NOT the same as age `0`: see
 * {@link isRetainedByAge}.
 */
function ageDaysOf(
  d: Digest,
  versionsByDigest: ReadonlyMap<Digest, PackageVersionRecord>,
  now: Date,
): number | undefined {
  const v = versionsByDigest.get(d);
  if (!v) {
    return undefined;
  }
  return (now.getTime() - v.createdAt.getTime()) / MS_PER_DAY;
}

/**
 * A root whose age cannot be determined (no matching Packages API entry)
 * is retained unconditionally. This is the fail-safe choice, not an
 * oversight: an unknown age might mean "younger than keepDays", and
 * treating unknown as "old enough to prune" would delete a digest we have
 * no evidence is safe to delete.
 */
function isRetainedByAge(ageDays: number | undefined, keepDays: number): boolean {
  return ageDays === undefined || ageDays < keepDays;
}

/**
 * `KEEP_ROOTS = { d in LIVE_ROOTS : retain(d) }`.
 *
 * `retain(d)` is true if ANY of: `d` carries a protected tag (digest-scoped
 * — protecting the digest `latest` points at protects every other tag on
 * that same digest, by construction, since {@link LiveRoot.tags} is
 * already the full set of tags sharing that digest), `d` is among the
 * newest `keepLast` roots by creation time, or `d` is younger than
 * `keepDays` (see {@link isRetainedByAge} for the unknown-age case).
 *
 * Deterministic: same input roots + versions + policy + now always
 * produces the same keep set, because the newest-N ranking uses a stable
 * sort and set iteration order in this module never depends on insertion
 * from an external, non-deterministic source (the ordering that reaches
 * this function is the caller's business; this function iterates strictly
 * in the order given).
 */
export function computeKeepRoots(
  roots: readonly LiveRoot[],
  versionsByDigest: ReadonlyMap<Digest, PackageVersionRecord>,
  policy: RetentionPolicy,
  now: Date,
): ReadonlySet<Digest> {
  const keep = new Set<Digest>();

  for (const root of roots) {
    if (isProtectedByTag(root.tags, policy.protectedTagPatterns)) {
      keep.add(root.digest);
    }
  }

  const knownAge = roots
    .map((root) => ({ root, createdAt: versionsByDigest.get(root.digest)?.createdAt }))
    .filter((entry): entry is { root: LiveRoot; createdAt: Date } => entry.createdAt !== undefined)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const { root } of knownAge.slice(0, Math.max(0, policy.keepLast))) {
    keep.add(root.digest);
  }

  for (const root of roots) {
    if (isRetainedByAge(ageDaysOf(root.digest, versionsByDigest, now), policy.keepDays)) {
      keep.add(root.digest);
    }
  }

  return keep;
}
