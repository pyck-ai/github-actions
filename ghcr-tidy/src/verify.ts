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
 * Why {@link checkCanary} failed, carrying enough to explain the failure
 * to an operator — see this module's `checkCanary` doc and the incident
 * that motivated it: an unexplained "canary-failed" with no cause cost
 * real debugging time after a run had just planned thousands of
 * deletions successfully.
 *
 * `"resolve-failed"`/`"closure-failed"` report the {@link ResolveState}
 * the canary's own snapshot came back with (`"not-found"` or
 * `"unknown"` — never `"resolved"`, since that would not be a failure).
 * `"error"` is a thrown exception from resolving the canary at all (a
 * network error, an auth failure, anything `snapshotTag` did not itself
 * translate into a `ResolveState`), which the old boolean-returning
 * `checkCanary` swallowed silently.
 */
export type CanaryFailureReason =
  | { readonly kind: "resolve-failed"; readonly state: ResolveState }
  | { readonly kind: "closure-failed"; readonly state: ResolveState }
  | { readonly kind: "error"; readonly message: string };

export type CanaryCheckResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: CanaryFailureReason };

/**
 * The pre-flight canary: resolves one known-good tag end to end (tag +
 * full closure) BEFORE the first deletion of the whole run. If this
 * fails, the read path is broken today, independent of anything this run
 * is about to delete — the run must not mistake a bad registry day for
 * damage it caused.
 *
 * Returns a {@link CanaryCheckResult} rather than a bare boolean so a
 * failure always carries its cause (see {@link CanaryFailureReason}) —
 * fail-closed behaviour is unchanged, only the diagnosis improves.
 */
export async function checkCanary(
  path: RegistryPath,
  canaryTag: Tag,
  registry: RegistryReader,
): Promise<CanaryCheckResult> {
  let snapshot: TagSnapshot;
  try {
    snapshot = await snapshotTag(path, canaryTag, registry, new Map());
  } catch (error) {
    return {
      ok: false,
      reason: {
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
  if (snapshot.resolve !== "resolved") {
    return { ok: false, reason: { kind: "resolve-failed", state: snapshot.resolve } };
  }
  if (snapshot.closure !== "resolved") {
    return { ok: false, reason: { kind: "closure-failed", state: snapshot.closure } };
  }
  return { ok: true };
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
  /** A HEALTHY (or unverifiable) pre-snapshot tag is now CONFIRMED broken (a real 404 evidence), or an unverifiable pre-snapshot tag is now confirmed broken post-apply — see this module's doc. This is the ONLY bucket that trips the breaker (`breaker.ts`'s `breakerRegressionSink`): every finding in it is backed by direct 404 evidence, never by a merely-unreadable tag, and never by a mere digest change on an otherwise-healthy tag (see {@link republished}). Aborts the run. */
  readonly regressions: readonly RegressedTag[];
  /** Broken in BOTH pre and post — not caused by this run, reported but does not abort. */
  readonly preExisting: readonly RegressedTag[];
  /**
   * Neither confirmed healthy nor confirmed broken after this run: a
   * transient read failure on an individual tag, or a whole snapshot
   * (pre or post) that could not be taken at all. NEVER trips the
   * breaker — `isUnknown` is not evidence of damage, and treating it as
   * such is exactly the defect that turned one failed `listTags` call
   * into thousands of false "regressions" (every tag silently defaulted
   * to a confirmed-not-found post state). The caller must still fail the
   * run loudly when this is non-empty: an operator cannot be told
   * everything is fine when nothing was actually confirmed.
   */
  readonly unverified: readonly RegressedTag[];
  /**
   * A tag that resolved cleanly BEFORE this run and resolves cleanly
   * (tag AND full closure) AFTER it, but to a DIFFERENT digest — a
   * concurrent publish repointed it while this run was in progress.
   * Deliberately a SEPARATE bucket from `unverified`: "someone
   * republished this tag" and "we could not read this tag" are
   * different facts an operator needs told apart, not the same shrug.
   *
   * Never trips the breaker and never aborts the run — see this
   * module's `compareSnapshots` doc for why a digest change alone is
   * never evidence of deletion damage: deleting a manifest can only
   * make a tag fail to resolve, it cannot repoint a tag to a different
   * digest. Reported so the caller can surface it as context (the
   * registry changed under this run), which is genuinely useful in a
   * repo whose CI publishes continuously, without treating normal,
   * expected concurrent activity as a safety incident.
   */
  readonly republished: readonly RegressedTag[];
}

export interface CompareSnapshotsOptions {
  /**
   * Set when the PRE-snapshot itself failed operationally (e.g.
   * `registry.listTags` threw) rather than merely reporting individual
   * tags as `"unknown"`. Per the task brief's strict posture (rule 5),
   * there is then no reliable per-tag baseline at all, so every tag
   * `post` currently knows about is examined against a synthetic
   * `"unknown"` pre-state instead — see `compareSnapshots`'s doc for how
   * that still separates CONFIRMED post-apply damage (a regression) from
   * a merely unverifiable one (`unverified`), rather than collapsing both
   * into "regression" the way the pre-fix strict posture did.
   */
  readonly preSnapshotFailed?: boolean;
  /**
   * Set when the POST-snapshot itself failed operationally. Every tag's
   * post state is then treated as `"unknown"` UNCONDITIONALLY — never
   * looked up in (the necessarily incomplete or empty) `post` map at
   * all. This is the fix for the incident that motivated this option:
   * without it, a whole-snapshot read failure produced an empty `post`
   * map, and every tag `pre` had ever seen as healthy defaulted (via the
   * ordinary "absent from post means not-found" rule, which is only
   * valid when the post read actually succeeded) to CONFIRMED broken —
   * turning one infrastructure hiccup into a mass false regression that
   * tripped the breaker on a real apply run.
   */
  readonly postSnapshotFailed?: boolean;
}

/**
 * The three-part regression predicate. For every tag present in `pre`:
 *
 * 1. it must still resolve;
 * 2. its full child closure must still resolve;
 * 3. IF it still resolves and its closure still resolves, a digest
 *    change is `republished` (a concurrent publish), never a
 *    regression — see {@link CompareSnapshotsResult.republished}'s doc
 *    for why: deleting a manifest can only make a tag fail to resolve,
 *    it can never repoint a tag to a different digest, so a
 *    healthy-to-healthy digest change is never evidence THIS run
 *    caused damage.
 *
 * A tag confirmed broken in BOTH `pre` and `post` is reported separately
 * (`preExisting`) and does not count as a regression — a budgeted
 * multi-run drain of an already-broken package must not report the same
 * known damage as fresh every run. A tag whose pre-apply state could not
 * be confirmed either way (`"unknown"` — a transient read failure) is
 * held to the STRICT posture: any CONFIRMED-broken post state counts as
 * a regression, because there is no confirmed-broken pre state to excuse
 * it into `preExisting` — but a merely `"unknown"` post state still only
 * ever lands in `unverified`, never `regressions`, same as everywhere
 * else in this predicate.
 */
export function compareSnapshots(
  pre: ReadonlyMap<Tag, TagSnapshot>,
  post: ReadonlyMap<Tag, TagSnapshot>,
  options: CompareSnapshotsOptions = {},
): CompareSnapshotsResult {
  const postSnapshotFailed = options.postSnapshotFailed ?? false;

  function effectivePostState(t: Tag): TagSnapshot {
    if (postSnapshotFailed) {
      // See `CompareSnapshotsOptions.postSnapshotFailed`'s doc: the read
      // itself failed, so `post` (however it looks) is not trustworthy
      // evidence for ANY tag — never fall through to the "absent means
      // not-found" default below, which is only valid when the post read
      // actually succeeded.
      return { resolve: "unknown", closure: "unknown" };
    }
    return post.get(t) ?? { resolve: "not-found", closure: "unknown" };
  }

  // When the PRE-snapshot itself failed there is no reliable baseline to
  // iterate (`pre` is empty) — instead walk every tag `post` currently
  // knows about, each with a synthetic `"unknown"` pre-state, so the
  // per-tag classification below still runs and still separates
  // confirmed damage from merely-unverifiable tags.
  const entries: Iterable<readonly [Tag, TagSnapshot]> = options.preSnapshotFailed
    ? Array.from(post.keys(), (t) => [t, { resolve: "unknown", closure: "unknown" } as const])
    : pre;

  const regressions: RegressedTag[] = [];
  const preExisting: RegressedTag[] = [];
  const unverified: RegressedTag[] = [];
  const republished: RegressedTag[] = [];

  for (const [t, preState] of entries) {
    const postState = effectivePostState(t);

    if (isHealthy(preState)) {
      if (isHealthy(postState)) {
        if (preState.digest === postState.digest) {
          continue;
        }
        // Still fully healthy — tag resolves, full closure resolves —
        // just pointing somewhere else. Deleting a manifest cannot
        // repoint a tag, only make it fail to resolve, so this is never
        // evidence that THIS run's deletions caused any damage: it is a
        // concurrent publish (someone else's CI) racing this run. See
        // `republished`'s doc for why this is its own bucket rather than
        // folded into `regressions` or `unverified`.
        republished.push(toFinding(t, preState, postState));
        continue;
      }
      if (isUnknown(postState)) {
        // Cannot confirm the tag is broken — only that this run's read of
        // it, post-apply, was inconclusive. Surfaced, but not a
        // regression: see this module's doc on why `isUnknown` must never
        // trip the breaker.
        unverified.push(toFinding(t, preState, postState));
      } else {
        // isConfirmedBroken(postState): either the tag itself now 404s,
        // or it still resolves but its closure does not — both are real,
        // confirmed damage regardless of any digest change, so neither
        // is ever redirected into `republished`.
        regressions.push(toFinding(t, preState, postState));
      }
      continue;
    }

    if (isUnknown(preState)) {
      if (isConfirmedBroken(postState)) {
        regressions.push(toFinding(t, preState, postState));
      } else if (isUnknown(postState)) {
        unverified.push(toFinding(t, preState, postState));
      }
      // Else: post state is healthy — resolved fine, nothing to report.
      // (There is no pre-apply digest to compare against here, so a
      // healthy post state can never be classified as `republished`
      // either — there is nothing to say it changed FROM.)
      continue;
    }

    // isConfirmedBroken(preState) must hold — isHealthy and isUnknown are exhaustive otherwise.
    if (isConfirmedBroken(postState)) {
      preExisting.push(toFinding(t, preState, postState));
    } else if (isUnknown(postState)) {
      unverified.push(toFinding(t, preState, postState));
    }
    // Else: improved (now resolves) — no confirmed new damage to act on.
  }

  return { regressions, preExisting, unverified, republished };
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
