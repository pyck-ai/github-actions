import type { Tag } from "./domain.js";

/**
 * Decomposes a registry tag into `(kind, level, version)` by one universal
 * lexical rule, with no per-package configuration and no allow-list.
 *
 * **The parse rule**: VERSION_TOKEN is the LAST maximal substring matching
 * `\d+(\.\d+)*`, bounded on the left by start-of-string or `-`, and on the
 * right by end-of-string or `-`. If no such token exists, the tag is
 * UNVERSIONED. Otherwise `prefix` is everything before the token,
 * `suffix` everything after it, `version` is the token split on `.` into
 * integers, and `level` is its component count (1 major, 2 minor, 3
 * patch). A version with more than 3 components is treated as
 * unversioned rather than truncated — truncating would invent a level the
 * tag generator never emitted.
 *
 * **Last, not first-match or greedy.** `alpine-3-claude-2.1.227` contains
 * two numeric runs. A first-match parser would extract `3`, yielding
 * prefix `alpine-` and suffix `-claude-2.1.227` — nonsense. Taking the
 * LAST qualifying run yields prefix `alpine-3-claude-` and version
 * `2.1.227`, which is what the tag generator actually emitted. This is
 * the most likely place an implementation goes quietly wrong, hence the
 * explicit rule and the property test against the real corpus
 * (`__fixtures__/baseimages-tags.tsv`).
 *
 * **This is a standalone lexical convention verified empirically against
 * the corpus. It is NOT a derived inverse of `vtags`** (the tag-expression
 * helper that generates most of these tags) — two counterexamples prove
 * this, and both matter because framing the parser as an inverse would
 * invite someone to "fix" it by reading `docker-bake.hcl` instead of the
 * registry's own tag list:
 *
 * - `golang`'s `alpine-3.23` comes from a hand-written literal at
 *   `baseimages/docker-bake.hcl:190`
 *   (`"${REGISTRY}/golang:alpine-${ALPINE_VERSION}"`), not from a `vtags`
 *   call — which is why `base` has both `alpine-3` and `alpine-3.23`
 *   while `golang` has only the latter.
 * - All 29 `buildcache` tags come from `cache-to` registry refs, not from
 *   any tag expression at all.
 *
 * `kind := (package, prefix, suffix)` — see {@link kindKeyOf}. An
 * unversioned tag is its own singleton kind, keyed by its literal string;
 * "keeping the newest N of a kind with exactly one member" degenerates
 * to "always retained", which is why unversioned tags need no separate
 * allow-list anywhere in this tool.
 *
 * Suffix variants (`-alpine`/`-debian`) are deliberately SEPARATE kinds:
 * folding them would let one variant's newer release expire the other's
 * only build whenever they drift out of lockstep (the corpus already has
 * `python`'s `3.13-debian` with no `3.13-alpine`), which is the
 * destructive direction. Separate kinds merely pin one extra digest in
 * that case — the failure mode this tool should prefer when it must pick
 * one.
 */
export type TagLevel = 1 | 2 | 3;

export interface VersionedTag {
  readonly kind: "versioned";
  readonly prefix: string;
  readonly suffix: string;
  readonly version: readonly number[];
  readonly level: TagLevel;
}

export interface UnversionedTag {
  readonly kind: "unversioned";
  /** The tag's own literal string — an unversioned tag is a singleton kind keyed by this value. */
  readonly literal: string;
}

export type ParsedTag = VersionedTag | UnversionedTag;

/**
 * Matches every maximal digit-and-dot run in a tag. Boundary conditions
 * (start-or-`-` on the left, end-or-`-` on the right) are checked by
 * {@link parseTag} against each match's surrounding characters, not baked
 * into this pattern, because a lookbehind/lookahead version of the same
 * rule is far harder to read and to prove correct than a plain scan.
 */
const NUMERIC_RUN_RE = /\d+(?:\.\d+)*/g;

/**
 * Parses one tag per this module's rule. Never throws: every input string
 * is either {@link VersionedTag} or {@link UnversionedTag} — see AC 1
 * (every one of the 362 corpus tags decomposes without error).
 */
export function parseTag(raw: Tag): ParsedTag {
  const s: string = raw;
  let best: { readonly start: number; readonly end: number; readonly text: string } | undefined;

  NUMERIC_RUN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = NUMERIC_RUN_RE.exec(s)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const leftOk = start === 0 || s[start - 1] === "-";
    const rightOk = end === s.length || s[end] === "-";
    if (leftOk && rightOk) {
      // Keep scanning: iterating left-to-right and overwriting `best` on
      // every qualifying match leaves `best` set to the LAST one found.
      best = { start, end, text: match[0] };
    }
  }

  if (!best) {
    return { kind: "unversioned", literal: s };
  }

  const version = best.text.split(".").map(Number);
  if (version.length > 3) {
    return { kind: "unversioned", literal: s };
  }

  return {
    kind: "versioned",
    prefix: s.slice(0, best.start),
    suffix: s.slice(best.end),
    version,
    level: version.length as TagLevel,
  };
}

/**
 * The grouping key for {@link ParsedTag}s that share a kind: same
 * `(prefix, suffix)` for a versioned tag, or the tag's own literal string
 * for an unversioned one (always a singleton). Package-scoping is the
 * caller's responsibility — this module operates on one package's tag
 * list at a time (see `retain.ts`'s `computeRetainedTags`), so no package
 * name needs to be folded into the key here.
 */
export function kindKeyOf(parsed: ParsedTag): string {
  return parsed.kind === "unversioned"
    ? `u\u0000${parsed.literal}`
    : `v\u0000${parsed.prefix}\u0000${parsed.suffix}`;
}

/**
 * Ascending numeric comparison of two version tuples, padding the
 * shorter with trailing zeros — `[3]` compares equal to `[3, 0, 0]`. Used
 * to rank candidates within a level's window and to find a kind's newest
 * member across levels (see `retain.ts`'s `computeFloorTags`).
 */
export function compareVersionsAscending(a: readonly number[], b: readonly number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}
