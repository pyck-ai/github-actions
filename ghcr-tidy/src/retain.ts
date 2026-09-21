import type { Digest, Tag } from "./domain.js";
import { compareVersionsAscending, kindKeyOf, parseTag, type ParsedTag } from "./tag-kind.js";

/** A live, tagged registry root: a digest and the FULL set of tags (from the registry, digest-scoped) that point at it. */
export interface LiveRoot {
  readonly digest: Digest;
  readonly tags: ReadonlySet<Tag>;
}

/**
 * Uniform, semver-aware retention: keep the newest `keepMajors` majors of
 * every kind (`tag-kind.ts`'s `(prefix, suffix)` grouping); within each
 * kept major, the newest `keepMinors` minors; within each kept minor, the
 * newest `keepPatches` patches. Applied identically to every package —
 * there is no per-package override anywhere in this policy.
 *
 * This is the WHOLE age-independent half of retention. Age lives entirely
 * in `plan.ts`'s `PlanPolicy.keepDays`, applied to every version
 * regardless of tags: that is what makes "any version younger than
 * `keepDays` is never deleted" an independent guarantee rather than
 * something this policy has to also express. Unversioned tags (`latest`,
 * `alpine`, `debian-trixie`, every `buildcache` tag) need no field here
 * at all — they are always-retained singleton kinds by construction (see
 * `tag-kind.ts`'s module doc).
 */
export interface RetentionPolicy {
  readonly keepMajors: number;
  readonly keepMinors: number;
  readonly keepPatches: number;
}

interface VersionedEntry {
  readonly tag: Tag;
  readonly version: readonly number[];
  readonly level: 1 | 2 | 3;
}

/** Descending-version top-N, used at every one of the three fixed levels below. */
function topN<T>(items: readonly T[], n: number, versionOf: (item: T) => readonly number[]): T[] {
  return [...items]
    .sort((a, b) => compareVersionsAscending(versionOf(b), versionOf(a)))
    .slice(0, Math.max(0, n));
}

/**
 * `RETAINED(tags)`: which of `tags` the resolved policy decided to keep,
 * per this module's doc. Pure and package-scoped — `tags` must be every
 * tag of ONE package (kinds are grouped within this call only, never
 * merged across packages).
 *
 * Implements the version LATTICE correction to the naive per-tag
 * algorithm (see the issue this ships for): windows range over every
 * VERSION that occurs anywhere in a kind, not over the tags that happen
 * to exist at each level. `majorSet` below is built from EVERY versioned
 * entry regardless of level, so a kind whose only member is
 * `alpine-3.23` (minor level, major `3` with no `alpine-3` tag anywhere —
 * `golang`'s real shape) still produces a major candidate `3`. The same
 * reasoning applies one level down: a kind's minor candidates are drawn
 * from every entry at level 2 OR 3 (`|v| >= 2`), so a patch tag whose
 * minor has no literal minor-level tag still contributes its minor to
 * the window.
 *
 * A patch tag's own window (`keptPatches`) is built ONLY from
 * three-component versions. This is what stops a minor alias like
 * `1.26` from ever competing against a patch tag like `1.26.5` for a
 * place in the patch window — the separation is structural (different
 * source sets), not a guard that could be forgotten.
 *
 * The nesting is a fixed three levels (major/minor/patch), matching the
 * tag generator's fixed three-component version grammar — written as
 * such rather than as an open-ended loop, since a loop would imply a
 * fourth level is meaningful, which `tag-kind.ts`'s parse rule already
 * forbids (more than 3 components is unversioned).
 */
export function computeRetainedTags(
  tags: readonly Tag[],
  policy: RetentionPolicy,
): ReadonlySet<Tag> {
  const retained = new Set<Tag>();
  const kinds = new Map<string, VersionedEntry[]>();

  for (const t of tags) {
    const parsed: ParsedTag = parseTag(t);
    if (parsed.kind === "unversioned") {
      // Always-retained singleton kind — see this module's and
      // `tag-kind.ts`'s doc for why no allow-list is needed here.
      retained.add(t);
      continue;
    }
    const key = kindKeyOf(parsed);
    const list = kinds.get(key) ?? [];
    list.push({ tag: t, version: parsed.version, level: parsed.level });
    kinds.set(key, list);
  }

  for (const entries of kinds.values()) {
    const byMajor = new Map<number, VersionedEntry[]>();
    for (const e of entries) {
      const major = e.version[0] ?? 0;
      const list = byMajor.get(major) ?? [];
      list.push(e);
      byMajor.set(major, list);
    }

    const keptMajors = topN([...byMajor.keys()], policy.keepMajors, (m) => [m]);
    for (const major of keptMajors) {
      const majorEntries = byMajor.get(major) ?? [];
      for (const e of majorEntries) {
        if (e.level === 1) {
          retained.add(e.tag);
        }
      }

      const byMinor = new Map<number, VersionedEntry[]>();
      for (const e of majorEntries) {
        if (e.level < 2) {
          continue;
        }
        const minor = e.version[1] ?? 0;
        const list = byMinor.get(minor) ?? [];
        list.push(e);
        byMinor.set(minor, list);
      }

      const keptMinors = topN([...byMinor.keys()], policy.keepMinors, (m) => [major, m]);
      for (const minor of keptMinors) {
        const minorEntries = byMinor.get(minor) ?? [];
        for (const e of minorEntries) {
          if (e.level === 2) {
            retained.add(e.tag);
          }
        }

        const patchEntries = minorEntries.filter((e) => e.level === 3);
        const keptPatches = topN(patchEntries, policy.keepPatches, (e) => e.version);
        for (const e of keptPatches) {
          retained.add(e.tag);
        }
      }
    }
  }

  return retained;
}

/**
 * The floor set for `verify.ts`'s `ExpiryProducer`: the single newest
 * literal tag of every kind, computed directly from the version lattice
 * rather than from {@link computeRetainedTags}'s policy-windowed result —
 * an independent safety net so that a misconfigured policy (e.g.
 * `keepMajors: 0`) cannot, by itself, cause the currently-newest build of
 * a kind to be reported as intended expiry. `verify.ts`'s
 * `resolveExpirySet` enforces that `expiry` and `floor` stay disjoint; at
 * the recommended policy this floor is already a subset of
 * {@link computeRetainedTags}'s result and never fires that check, but it
 * exists to catch the case where it would not be.
 *
 * An unversioned tag's floor is itself: a singleton kind's only member is
 * trivially its own newest.
 */
export function computeFloorTags(tags: readonly Tag[]): ReadonlySet<Tag> {
  const floor = new Set<Tag>();
  const newestByKind = new Map<string, VersionedEntry>();

  for (const t of tags) {
    const parsed: ParsedTag = parseTag(t);
    if (parsed.kind === "unversioned") {
      floor.add(t);
      continue;
    }
    const key = kindKeyOf(parsed);
    const entry: VersionedEntry = { tag: t, version: parsed.version, level: parsed.level };
    const current = newestByKind.get(key);
    if (!current || compareVersionsAscending(entry.version, current.version) > 0) {
      newestByKind.set(key, entry);
    }
  }

  for (const entry of newestByKind.values()) {
    floor.add(entry.tag);
  }

  return floor;
}

/**
 * `KEEP_ROOTS = { r in LIVE_ROOTS : exists t in r.tags . RETAINED(t) }` —
 * a single existential over {@link computeRetainedTags}'s result,
 * replacing the old multi-clause `computeKeepRoots` (protected-tag
 * pattern, newest-`keepLast`, root-level `keepDays`) entirely. The cross-
 * reference is keep-ROOT membership, not a filter applied to `DELETE`
 * afterwards: a retained tag protects its digest's entire manifest
 * closure via `plan.ts`'s reachability walk seeded from this set, so
 * filtering `DELETE` after the fact would keep an index's tag while
 * still deleting the platform manifests it points at — the exact
 * broken-root corruption `deleteBrokenRoots` exists to remediate.
 *
 * Purely additive, like the clauses it replaces: no rule anywhere in
 * this module ever removes a digest from the keep set once added.
 * Deletion happens only by absence, in `plan.ts`'s
 * `ALL \ (REACHABLE union INFLIGHT)` subtraction.
 *
 * Age plays NO part here — see {@link RetentionPolicy}'s doc for where
 * it lives instead (`plan.ts`'s `PlanPolicy.keepDays`, applied uniformly
 * to every version). A tagged root can therefore be deleted purely for
 * falling outside its kind's kept window, once old enough: this is a
 * deliberate capability, not a regression of the old root protection —
 * it is what makes it possible to ever retire a frozen series at all.
 */
export function computeKeepRoots(
  roots: readonly LiveRoot[],
  policy: RetentionPolicy,
): ReadonlySet<Digest> {
  const allTags: Tag[] = [];
  for (const root of roots) {
    for (const t of root.tags) {
      allTags.push(t);
    }
  }
  const retained = computeRetainedTags(allTags, policy);

  const keep = new Set<Digest>();
  for (const root of roots) {
    for (const t of root.tags) {
      if (retained.has(t)) {
        keep.add(root.digest);
        break;
      }
    }
  }
  return keep;
}
