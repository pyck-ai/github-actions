import type { PackageName } from "../../registry/package-name.js";
import { digest, type Digest, type RegistryPath, type Tag } from "./domain.js";
import type { ResolvedPolicy } from "./manifest/schema.js";
import type { PersistedGroupMember } from "./persisted-plan.js";
import type { RegistryReader } from "./ports.js";
import { computeFloorTags, computeRetainedTags } from "./retain.js";
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
 *
 * The same principle governs {@link ExpiryProducer}: the tag list it
 * classifies is THIS function's own read, taken fresh at verification
 * time, and its result (`expectedExpiry` on {@link CompareSnapshotsOptions})
 * is likewise recomputed here rather than read off the `Plan`, which
 * carries no such field at all. A plan-supplied "these tags were meant
 * to go" list would be snapshotting what the planner believed all over
 * again, one layer up: a planner bug would produce a wrong intended set,
 * and a verifier that trusted it would certify that wrong set as
 * correct. Recomputing from the registry's own tag list plus the
 * resolved policy keeps the check independent of the planner it is
 * meant to catch mistakes in.
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

/**
 * What one call to {@link ExpiryProducer.produce} returns for a single
 * package's PRE-snapshot tag list: which tags the resolved policy
 * INTENDS to retire (`expiry`), which tags must never be retired
 * regardless of any window arithmetic (`floor`), and which tags the
 * producer could not classify at all (`unclassifiable`). A correct
 * producer returns three disjoint sets; {@link resolveExpirySet} enforces
 * this rather than trusting it, since it is exactly the property a buggy
 * producer would get wrong.
 */
export interface ExpiryProducerResult {
  readonly expiry: ReadonlySet<Tag>;
  readonly floor: ReadonlySet<Tag>;
  readonly unclassifiable: ReadonlySet<Tag>;
}

/**
 * Produces the INTENDED expiry set for one package: which currently-live
 * tags the resolved retention policy has decided to retire. Takes the
 * tag list {@link snapshotPackage} already read from the registry for
 * this package's PRE-apply snapshot (never anything from `Plan`, which
 * carries no such field) and that package's fully-resolved policy
 * (`manifest/schema.ts`'s `ResolvedPolicy`, recomputed from the manifest
 * at verification time, independently of planning's own resolution of
 * the same manifest).
 *
 * WHAT THIS CATCHES: everything from the planner's keep-root rule
 * downward, retention's age/count arithmetic, reachability, deletion
 * grouping, the delete loop itself, since the verifier never touches
 * those stages and instead independently re-derives which tags it
 * expects to be gone.
 *
 * WHAT THIS CANNOT CATCH: both the real planner and the real producer
 * call the SAME classify/window functions to decide what should have
 * expired. A bug there is invisible to this check, because both sides
 * agree on the wrong answer: a shared pure function is a shared failure
 * mode, not a gap in this seam's architecture. The mitigation is
 * property-based testing over the real tag corpus, not more layers of
 * checking, so nobody later mistakes this check for stronger than it
 * is. {@link resolveExpirySet}'s two obligations at least bound how
 * wrong a producer implementation can go, independently of that shared
 * code.
 */
export interface ExpiryProducer {
  produce(tags: readonly Tag[], policy: ResolvedPolicy): ExpiryProducerResult;
}

/**
 * The producer this change ships: always the empty set for every
 * argument, unconditionally. With this producer, {@link resolveExpirySet}
 * always succeeds with an empty expiry set, so `compareSnapshots`
 * classifies every tag exactly as it did before this seam existed. A
 * later change supplies the real, policy-driven producer this seam
 * exists for.
 */
export const nullExpiryProducer: ExpiryProducer = {
  produce: () => ({ expiry: new Set(), floor: new Set(), unclassifiable: new Set() }),
};

/**
 * The real, policy-driven producer: retires exactly the tags
 * `retain.ts`'s `computeRetainedTags` would exclude from the keep set
 * for the SAME `tags`/`policy` pair `planPackage` itself resolves against
 * — independently re-derived here, not read off `Plan` (see this
 * module's doc for why). `unclassifiable` is always empty: `tag-kind.ts`'s
 * parse rule never fails to classify a tag (AC 1 — every tag decomposes
 * into a kind, a level, and a version, or is unversioned), so there is
 * nothing this producer could ever refuse to classify.
 *
 * `floor` is computed independently from `computeRetainedTags` (see
 * `retain.ts`'s `computeFloorTags` doc) rather than derived from it, so a
 * misconfigured policy cannot, by construction, make this producer's own
 * `expiry` and `floor` overlap — `resolveExpirySet` still checks this
 * rather than trusting it, per that function's doc.
 */
export const policyDrivenExpiryProducer: ExpiryProducer = {
  produce(tags, policy) {
    const retained = computeRetainedTags(tags, policy);
    const floor = computeFloorTags(tags);
    const expiry = new Set<Tag>();
    for (const t of tags) {
      if (!retained.has(t)) {
        expiry.add(t);
      }
    }
    return { expiry, floor, unclassifiable: new Set() };
  },
};

/** Why {@link resolveExpirySet} rejected a producer's output; see that function's doc for what each case means. */
export type ExpiryFailureReason = "floor-overlap" | "unclassifiable-in-expiry";

export type ExpiryResolution =
  | { readonly ok: true; readonly expiry: ReadonlySet<Tag> }
  | { readonly ok: false; readonly reason: ExpiryFailureReason; readonly tags: readonly Tag[] };

/**
 * The two safety obligations an {@link ExpiryProducer} must satisfy,
 * enforced HERE rather than merely documented, so a future producer
 * cannot quietly weaken them just by getting its own bookkeeping wrong:
 *
 * 1. FLOOR. `expiry` and `floor` must be disjoint: the producer's own
 *    floor set (e.g. the newest tag of every kind) can never be
 *    retired, regardless of any window parameter, so a bug in window
 *    arithmetic cannot suppress this guarantee.
 * 2. FAIL CLOSED ON UNCLASSIFIABLE. `expiry` must never contain a tag
 *    the producer itself reports as `unclassifiable`: an unrecognised
 *    tag's disappearance must always be treated as a candidate
 *    regression, never silently accepted as intended.
 *
 * A producer that violates either obligation fails the run closed for
 * that package: see `apply.ts`'s handling of an `ok: false`
 * {@link ExpiryResolution}, which aborts before that package's own
 * deletions are even attempted rather than falling back to an empty
 * expiry set and proceeding. A producer that already broke one
 * invariant is not trusted enough to fall back on for the other.
 *
 * With {@link nullExpiryProducer}, both sets are always empty, so both
 * checks are vacuous and this function always returns `ok: true` with
 * an empty `expiry` set.
 */
export function resolveExpirySet(
  producer: ExpiryProducer,
  tags: readonly Tag[],
  policy: ResolvedPolicy,
): ExpiryResolution {
  const { expiry, floor, unclassifiable } = producer.produce(tags, policy);
  const floorOverlap = [...expiry].filter((t) => floor.has(t));
  if (floorOverlap.length > 0) {
    return { ok: false, reason: "floor-overlap", tags: floorOverlap };
  }
  const unclassifiableOverlap = [...expiry].filter((t) => unclassifiable.has(t));
  if (unclassifiableOverlap.length > 0) {
    return { ok: false, reason: "unclassifiable-in-expiry", tags: unclassifiableOverlap };
  }
  return { ok: true, expiry };
}

export interface CompareSnapshotsResult {
  /** A HEALTHY (or unverifiable) pre-snapshot tag is now CONFIRMED broken (a real 404 evidence), or an unverifiable pre-snapshot tag is now confirmed broken post-apply — see this module's doc. This is the ONLY bucket that trips the breaker (`breaker.ts`'s `breakerRegressionSink`): every finding in it is backed by direct 404 evidence, never by a merely-unreadable tag, and never by a mere digest change on an otherwise-healthy tag (see {@link republished}), and never a tag the expiry producer's `expiry` set said should go (see {@link expired}). Aborts the run. */
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
  /**
   * A HEALTHY pre-snapshot tag disappeared, exactly as
   * `CompareSnapshotsOptions.expectedExpiry` said it should: deliberate
   * retirement, not damage. Deliberately a SEPARATE bucket from
   * `regressions` rather than a flag on a regression finding: an
   * operator reading a run summary needs to see "this run destroyed N
   * things on purpose" as a fact distinct from "this run destroyed N
   * things it should not have", not the same list with an asterisk.
   * Never trips the breaker and never aborts the run, but see
   * `apply.ts`'s `PackageApplyResult.expiredTags` doc for why it must
   * still always be reported: deliberate destruction is still
   * destruction, and an operator must never be told nothing happened
   * when something real did.
   */
  readonly expired: readonly RegressedTag[];
  /**
   * A tag `CompareSnapshotsOptions.expectedExpiry` said should have
   * disappeared but which still resolves (tag AND full closure) after
   * this run: the two-sided half of the expiry check. The policy can
   * be wrong in either direction, and a tag that failed to retire is as
   * worth surfacing as one that retired when it should not have. Never
   * trips the breaker and never aborts the run: an intended deletion
   * that simply did not happen this cycle (e.g. it was not yet
   * reachable for deletion under `graceDays`, or the run's budget ran
   * out before its group) is not evidence of damage.
   */
  readonly notExpired: readonly RegressedTag[];
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
  /**
   * The tag set {@link resolveExpirySet} validated as this package's
   * intended expiry, computed from THIS package's own pre-snapshot tag
   * list, never from `pre`/`post` here: `compareSnapshots` itself
   * remains a pure comparison function and never calls an
   * {@link ExpiryProducer} itself. Defaults to the empty set: with no
   * `expectedExpiry` at all (every existing caller, before this option
   * existed), classification is byte-identical to before this option
   * was added, since a healthy tag that disappears is unconditionally a
   * regression. Membership only changes classification for a tag that
   * was healthy in `pre`, see {@link CompareSnapshotsResult.expired}
   * and {@link CompareSnapshotsResult.notExpired}.
   */
  readonly expectedExpiry?: ReadonlySet<Tag>;
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
 *
 * `options.expectedExpiry` only changes the outcome for a tag that WAS
 * healthy in `pre` (see {@link CompareSnapshotsResult.expired} and
 * {@link CompareSnapshotsResult.notExpired}): a healthy tag now confirmed
 * broken lands in `expired` instead of `regressions` when it is a
 * member, and a healthy tag that is STILL healthy lands in `notExpired`
 * instead of silently passing (or `republished`) when it is a member.
 * Every other branch of this predicate is unaffected by it, so an empty
 * (or omitted) `expectedExpiry` reproduces the pre-expiry-seam
 * classification exactly.
 */
export function compareSnapshots(
  pre: ReadonlyMap<Tag, TagSnapshot>,
  post: ReadonlyMap<Tag, TagSnapshot>,
  options: CompareSnapshotsOptions = {},
): CompareSnapshotsResult {
  const postSnapshotFailed = options.postSnapshotFailed ?? false;
  const expectedExpiry = options.expectedExpiry ?? new Set<Tag>();

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
  const expired: RegressedTag[] = [];
  const notExpired: RegressedTag[] = [];

  for (const [t, preState] of entries) {
    const postState = effectivePostState(t);
    const isExpected = expectedExpiry.has(t);

    if (isHealthy(preState)) {
      if (isHealthy(postState)) {
        if (isExpected) {
          // The policy expected this tag to be retired by now, but it
          // still resolves: the two-sided half of the check (see
          // `CompareSnapshotsResult.notExpired`'s doc). Reported on its
          // own regardless of whether the digest also happens to have
          // changed: "still here" is the fact worth surfacing, not
          // whether it moved while staying here.
          notExpired.push(toFinding(t, preState, postState));
          continue;
        }
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
      } else if (isExpected) {
        // isConfirmedBroken(postState) AND the policy said this tag
        // should go: deliberate retirement, not damage, see
        // `CompareSnapshotsResult.expired`'s doc for why this is its own
        // bucket rather than a flag on a regression finding.
        expired.push(toFinding(t, preState, postState));
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

  return { regressions, preExisting, unverified, republished, expired, notExpired };
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
