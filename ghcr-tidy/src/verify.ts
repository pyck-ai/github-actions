import type { PackageName } from "../../registry/package-name.js";
import { digest, type Digest, type RegistryPath, type Tag } from "./domain.js";
import type { PersistedGroupMember } from "./persisted-plan.js";
import type { RegistryReader } from "./ports.js";
import { skipReasonFor } from "./skip-reason.js";

/**
 * The outcome of trying to resolve one thing (a tag, or one node of a
 * manifest closure) against the registry.
 *
 * `"not-found"` is a CONFIRMED 404 — real evidence the thing is gone.
 * `"unknown"` is everything else non-`"resolved"` (429/5xx exhausted,
 * client error, network error): an infrastructure problem, not evidence
 * of absence. Collapsing these two into one "broken" value is exactly
 * the ambiguity `skip-reason.ts` exists to remove elsewhere in this
 * package, and post-apply verification needs the same distinction for
 * the same reason: a transient read failure must never be reported, or
 * acted on, as proof a deletion broke something.
 */
export type ResolveState = "resolved" | "not-found" | "unknown";

/**
 * One tag's health at a point in time: whether the tag itself resolves,
 * to what digest, and whether every node in that digest's manifest
 * closure (recursively) also resolves. `closure` is `"unknown"`
 * (meaningless, not evaluated) whenever `resolve !== "resolved"` — there
 * is nothing to walk a closure from.
 *
 * Deliberately keeps `resolve` and `closure` as two separate fields
 * rather than a single boolean: the three-part regression predicate
 * (`compareSnapshots`) needs to tell "the tag itself is gone" apart from
 * "the tag resolves fine but something under it 404s", because those are
 * reported as different failed predicate parts.
 */
export interface TagSnapshot {
  readonly resolve: ResolveState;
  readonly digest?: Digest;
  readonly closure: ResolveState;
}

async function closureState(
  path: RegistryPath,
  d: Digest,
  registry: RegistryReader,
  cache: Map<Digest, ResolveState>,
): Promise<ResolveState> {
  const cached = cache.get(d);
  if (cached !== undefined) {
    return cached;
  }

  const resolution = await registry.resolve(path, d);
  const reason = skipReasonFor(resolution);
  let state: ResolveState;
  if (reason === "not-found") {
    state = "not-found";
  } else if (reason === "transient") {
    state = "unknown";
  } else if (resolution.status === "success") {
    state = "resolved";
    for (const child of resolution.children) {
      const childState = await closureState(path, digest(child.digest), registry, cache);
      if (childState === "not-found") {
        state = "not-found";
        break;
      }
      if (childState === "unknown") {
        state = "unknown";
      }
    }
  } else {
    // Unreachable: skipReasonFor returns undefined only for "success".
    throw new Error("unreachable: non-success resolution without a skip reason");
  }

  cache.set(d, state);
  return state;
}

/** Resolves one tag and its full manifest closure. Shared by {@link snapshotPackage} (every tag of a package) and {@link checkCanary} (a single known-good tag, possibly in a different package). */
async function snapshotTag(
  path: RegistryPath,
  t: Tag,
  registry: RegistryReader,
  cache: Map<Digest, ResolveState>,
): Promise<TagSnapshot> {
  const resolution = await registry.resolve(path, t);
  const reason = skipReasonFor(resolution);
  if (reason === "not-found") {
    return { resolve: "not-found", closure: "unknown" };
  }
  if (reason === "transient") {
    return { resolve: "unknown", closure: "unknown" };
  }
  if (resolution.status !== "success") {
    throw new Error("unreachable: non-success resolution without a skip reason");
  }

  const d = digest(resolution.digest);
  // The tag's own resolution already gave us its direct children for
  // free (mirroring `roots.ts`'s `rootChildren` reuse) — no need to
  // re-resolve `d` itself, only walk what it points at.
  cache.set(d, "resolved");
  let closure: ResolveState = "resolved";
  for (const child of resolution.children) {
    const childState = await closureState(path, digest(child.digest), registry, cache);
    if (childState === "not-found") {
      closure = "not-found";
      break;
    }
    if (childState === "unknown") {
      closure = "unknown";
    }
  }

  return { resolve: "resolved", digest: d, closure };
}

/**
 * Snapshots every tag currently listed by the registry for `path`,
 * resolving each one and its full manifest closure. This is the ONLY
 * legitimate snapshot source for verification — see `roots.ts`'s module
 * doc on why ghcr-tidy never roots on anything but the registry's own tag
 * list. Snapshotting what the planner believed (its keep-roots) would
 * inherit whatever the planner got wrong; snapshotting the registry
 * itself does not.
 */
export async function snapshotPackage(
  path: RegistryPath,
  registry: RegistryReader,
): Promise<ReadonlyMap<Tag, TagSnapshot>> {
  const tags = await registry.listTags(path);
  const cache = new Map<Digest, ResolveState>();
  const result = new Map<Tag, TagSnapshot>();
  for (const t of tags) {
    result.set(t, await snapshotTag(path, t, registry, cache));
  }
  return result;
}

/**
 * The pre-flight canary: resolves one known-good tag end to end (tag +
 * full closure) BEFORE the first deletion of the whole run. If this
 * fails, the read path is broken today, independent of anything this run
 * is about to delete — the run must not mistake a bad registry day for
 * damage it caused.
 */
export async function checkCanary(
  path: RegistryPath,
  canaryTag: Tag,
  registry: RegistryReader,
): Promise<boolean> {
  try {
    const snapshot = await snapshotTag(path, canaryTag, registry, new Map());
    return snapshot.resolve === "resolved" && snapshot.closure === "resolved";
  } catch {
    return false;
  }
}

function isHealthy(s: TagSnapshot): boolean {
  return s.resolve === "resolved" && s.closure === "resolved";
}

/** Confirmed broken by direct 404 evidence — NOT merely "unknown". */
function isConfirmedBroken(s: TagSnapshot): boolean {
  return s.resolve === "not-found" || (s.resolve === "resolved" && s.closure === "not-found");
}

/** Neither confirmed healthy nor confirmed broken — a transient read failure occurred somewhere in this tag's resolution. */
function isUnknown(s: TagSnapshot): boolean {
  return s.resolve === "unknown" || (s.resolve === "resolved" && s.closure === "unknown");
}

/**
 * One tag examined by {@link compareSnapshots}, carrying the three
 * predicate parts individually rather than a single verdict — so a
 * `RegressionSink` (and, later, an incident report) can say exactly
 * which of "still resolves" / "same digest" / "closure resolves" failed,
 * not merely that something did.
 */
export interface RegressedTag {
  readonly tag: Tag;
  readonly digestBefore: Digest | undefined;
  readonly digestAfter: Digest | undefined;
  readonly stillResolves: boolean;
  readonly digestUnchanged: boolean;
  readonly closureResolves: boolean;
}

function toFinding(t: Tag, pre: TagSnapshot, post: TagSnapshot): RegressedTag {
  return {
    tag: t,
    digestBefore: pre.digest,
    digestAfter: post.digest,
    stillResolves: post.resolve === "resolved",
    digestUnchanged:
      pre.digest !== undefined && post.digest !== undefined && pre.digest === post.digest,
    closureResolves: post.closure === "resolved",
  };
}

export interface CompareSnapshotsResult {
  /** A HEALTHY (or unverifiable) pre-snapshot tag is now broken, or an unverifiable pre-snapshot tag is still broken post-apply — see this module's doc and rule 5 of the task brief. Aborts the run. */
  readonly regressions: readonly RegressedTag[];
  /** Broken in BOTH pre and post — not caused by this run, reported but does not abort. */
  readonly preExisting: readonly RegressedTag[];
}

export interface CompareSnapshotsOptions {
  /**
   * Set when the PRE-snapshot itself failed operationally (e.g.
   * `registry.listTags` threw) rather than merely reporting individual
   * tags as `"unknown"`. Per the task brief's strict posture (rule 5),
   * every broken POST tag is then treated as a regression: there is no
   * "pre-existing" bucket to fall back into because there is no reliable
   * pre-apply data for any tag at all.
   */
  readonly preSnapshotFailed?: boolean;
}

/**
 * The three-part regression predicate. For every tag present in `pre`:
 *
 * 1. it must still resolve;
 * 2. it must resolve to the SAME digest, not merely some digest;
 * 3. its full child closure must still resolve.
 *
 * A tag confirmed broken in BOTH `pre` and `post` is reported separately
 * (`preExisting`) and does not count as a regression — a budgeted
 * multi-run drain of an already-broken package must not report the same
 * known damage as fresh every run. A tag whose pre-apply state could not
 * be confirmed either way (`"unknown"` — a transient read failure) is
 * held to the STRICT posture: any non-healthy post state counts as a
 * regression, because there is no confirmed-broken pre state to excuse
 * it into `preExisting`.
 */
export function compareSnapshots(
  pre: ReadonlyMap<Tag, TagSnapshot>,
  post: ReadonlyMap<Tag, TagSnapshot>,
  options: CompareSnapshotsOptions = {},
): CompareSnapshotsResult {
  if (options.preSnapshotFailed) {
    const regressions: RegressedTag[] = [];
    for (const [t, postState] of post) {
      if (!isHealthy(postState)) {
        regressions.push(toFinding(t, { resolve: "unknown", closure: "unknown" }, postState));
      }
    }
    return { regressions, preExisting: [] };
  }

  const regressions: RegressedTag[] = [];
  const preExisting: RegressedTag[] = [];

  for (const [t, preState] of pre) {
    const postState: TagSnapshot = post.get(t) ?? { resolve: "not-found", closure: "unknown" };

    if (isHealthy(preState)) {
      if (isHealthy(postState) && preState.digest === postState.digest) {
        continue;
      }
      regressions.push(toFinding(t, preState, postState));
      continue;
    }

    if (isUnknown(preState)) {
      if (!isHealthy(postState)) {
        regressions.push(toFinding(t, preState, postState));
      }
      continue;
    }

    // isConfirmedBroken(preState) must hold — isHealthy and isUnknown are exhaustive otherwise.
    if (isConfirmedBroken(postState)) {
      preExisting.push(toFinding(t, preState, postState));
    }
    // Else: improved, or post state is unknown (inconclusive) — neither
    // is reported; there is no confirmed new damage to act on.
  }

  return { regressions, preExisting };
}

/**
 * Enough to act on later, per the task brief: which package, which tags
 * and how each failed, the digest each pointed at before and now, and
 * every deletion this run made in that package before the regression was
 * detected — a follow-up task backs this with a GitHub issue; this is
 * deliberately just the seam.
 */
export interface RegressionIncident {
  readonly packageName: PackageName;
  readonly tags: readonly RegressedTag[];
  readonly precedingDeletions: readonly PersistedGroupMember[];
}

export interface RegressionSink {
  record(incident: RegressionIncident): Promise<void>;
}

/** An in-memory `RegressionSink` for tests: records every incident, in order, with no I/O. `incidents` is a live reference. */
export function memoryRegressionSink(): {
  sink: RegressionSink;
  incidents: readonly RegressionIncident[];
} {
  const incidents: RegressionIncident[] = [];
  const sink: RegressionSink = {
    record: (incident) => {
      incidents.push(incident);
      return Promise.resolve();
    },
  };
  return { sink, incidents };
}
