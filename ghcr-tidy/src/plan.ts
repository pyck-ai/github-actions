import type { PackageName } from "../../registry/package-name.js";
import { registryPathFor, type Digest, type RegistryPath } from "./domain.js";
import { computeKeepRoots, type RetentionPolicy } from "./retain.js";
import { buildLiveRoots } from "./roots.js";
import {
  computeReachability,
  type ReachabilityOptions,
  type ReachabilityResult,
} from "./reachability.js";
import {
  assertNoSurvivingParent,
  buildDeletionGroups,
  type DeletionGroup,
} from "./deletion-group.js";
import type { Clock, PackagesClient, RegistryReader } from "./ports.js";
import type { SkipReason } from "./skip-reason.js";

const MS_PER_DAY = 86_400_000;

/**
 * `retention` is the age-INDEPENDENT half (semver windowing — see
 * `retain.ts`'s `RetentionPolicy` doc): it decides which TAGS survive,
 * with no age component of its own at all. `keepDays` is the sole
 * age-based control left in this tool, applied uniformly to EVERY
 * version regardless of tags — it is what makes "any version younger
 * than `keepDays` is never deleted, tagged or not" an independent
 * guarantee (`INFLIGHT` below) rather than something retention also has
 * to express. This is the field the old two-knob split (`keepDays` on
 * roots, `graceDays` on every version) collapsed into: the root-only age
 * clause that caused the 2026-09-20 incident is gone, and this is the
 * survivor, carrying `graceDays`'s old semantics under the name the
 * repo owner actually uses. Lowering it is the single most dangerous
 * edit available in this tool's configuration.
 */
export interface PlanPolicy {
  readonly retention: RetentionPolicy;
  readonly keepDays: number;
}

export interface PlanPackageOptions {
  readonly org: string;
  /** The GHCR registry owner segment — usually equal to `org`, but kept distinct since they name different APIs' path components. */
  readonly registryOwner: string;
  readonly packageName: PackageName;
  readonly registry: RegistryReader;
  readonly packages: PackagesClient;
  readonly clock: Clock;
  readonly policy: PlanPolicy;
  readonly reachability?: ReachabilityOptions;
  /**
   * Opt-in remediation for a keep-root whose subtree contains a PROVEN
   * (confirmed 404, never transient/5xx/auth/network — see
   * `skip-reason.ts`) not-found descendant. Default `false`, matching
   * every existing caller: with this off, such a root fails the WHOLE
   * package closed exactly as before (`SkippedPlan`). With this on, the
   * proven-broken root itself is excluded from `KEEP_ROOTS`/`REACHABLE`
   * (see {@link computeReachabilityToleratingBrokenRoots}) so the rest of
   * the package can still be planned, and the broken root's own version
   * falls into `DELETE` through the ordinary `ALL \ (REACHABLE union
   * INFLIGHT)` set subtraction — still subject to `keepDays` like any
   * other digest, and still requiring the CLI's separate `--apply` gesture
   * to actually delete anything. See `cli.ts`'s `--delete-broken-roots`.
   */
  readonly deleteBrokenRoots?: boolean;
}

export interface SkippedPlan {
  readonly status: "skipped";
  readonly reason: SkipReason;
  readonly detail: string;
}

/** Distinct from `skipped`: the package was fully evaluated and there is nothing to delete (or nothing exists at all). */
export interface NothingToDoPlan {
  readonly status: "nothing-to-do";
}

export interface PlannedPlan {
  readonly status: "planned";
  readonly total: number;
  readonly liveRootsCount: number;
  readonly keepRootsCount: number;
  readonly reachableCount: number;
  readonly inflightCount: number;
  readonly deleteCount: number;
  /** `DELETE`, grouped and ordered — see `deletion-group.ts`. */
  readonly groups: readonly DeletionGroup[];
  /**
   * Packages API version id for every digest in `DELETE` (i.e. every
   * digest appearing somewhere in `groups`). The planning core itself
   * never needs this — reachability is pure digest set arithmetic — but
   * the apply path does: GHCR's delete-version endpoint is keyed by the
   * numeric version id, not the digest. Kept separate from `DeletionGroup`
   * itself so the heavily-tested digest-only shape of that type is
   * undisturbed by an apply-only concern.
   */
  readonly versionIdByDigest: ReadonlyMap<Digest, number>;
  /**
   * Keep-roots excluded from `REACHABLE` because their subtree contained
   * a PROVEN not-found descendant — always empty unless
   * `PlanPackageOptions.deleteBrokenRoots` was `true` AND at least one
   * root actually qualified (see
   * {@link computeReachabilityToleratingBrokenRoots}). Reporting-only:
   * whether a broken root's digest also appears in `groups` depends
   * entirely on the ordinary `keepDays`/`DELETE` arithmetic, exactly
   * like any other digest.
   */
  readonly brokenRootDigests: readonly Digest[];
}

export type PackagePlanResult = SkippedPlan | NothingToDoPlan | PlannedPlan;

export interface ReachabilityWithBrokenRootsResult {
  readonly result: ReachabilityResult;
  /** Roots excluded from consideration because their subtree contained a PROVEN not-found descendant. Always empty unless `deleteBrokenRoots` is `true` AND `result.status === "success"`. */
  readonly brokenRoots: ReadonlySet<Digest>;
}

/**
 * Wraps {@link computeReachability} to optionally tolerate a keep-root
 * whose subtree contains a PROVEN not-found descendant (a confirmed
 * registry 404 — see `skip-reason.ts`'s `"not-found"`; NEVER a
 * transient/5xx/auth/network failure, which always fails closed exactly
 * as `computeReachability` already does on its own — that distinction is
 * `skipReasonFor`'s whole reason for existing, and this function leans on
 * it rather than re-deriving anything).
 *
 * When `deleteBrokenRoots` is `false` (the default everywhere except the
 * explicit `--delete-broken-roots` CLI opt-in — see `cli.ts`), this is a
 * pure passthrough: exactly one `computeReachability` call, `brokenRoots`
 * always empty, byte-identical to calling `computeReachability` directly.
 *
 * When `true`: on a `"not-found"` failure, the FAILING ROOT ITSELF
 * (`result.root` — never a broader guess, never the `failedDigest` that
 * may be several levels below it) is removed from the keep-root set and
 * the ENTIRE walk is retried from scratch over the reduced set — each
 * retry starts with fresh `reachable`/`edges` state (a brand-new
 * `computeReachability` call), so a root excluded on one iteration can
 * never leave partially-resolved data behind to contaminate a later
 * iteration's result. This repeats until either every remaining root's
 * subtree resolves cleanly (`"success"`, with every excluded root
 * reported in `brokenRoots`) or a failure that does not qualify (any
 * `"transient"` reason, or `deleteBrokenRoots` itself being `false`) is
 * hit — at which point the WHOLE package still fails closed exactly as it
 * always has: a broken root already found on an earlier iteration never
 * gets "half credit" while something else remains genuinely unknown, so
 * this function only ever returns `brokenRoots` alongside a `"success"`
 * result, never alongside a `"failed"` one.
 *
 * An excluded root is not force-added to `DELETE` here or anywhere else:
 * it is simply no longer a keep-root, so `planPackage`'s ordinary
 * `ALL \ (REACHABLE union INFLIGHT)` set subtraction picks it up exactly
 * like any other digest that is not reachable from anything — including
 * still respecting `keepDays`, on the chance a "broken" root is actually
 * an in-flight push race (the index pushed, its child not yet) rather
 * than settled corruption.
 */
export async function computeReachabilityToleratingBrokenRoots(
  path: RegistryPath,
  keepRoots: ReadonlySet<Digest>,
  rootChildren: ReadonlyMap<Digest, readonly Digest[]>,
  registry: RegistryReader,
  reachabilityOptions: ReachabilityOptions | undefined,
  deleteBrokenRoots: boolean,
): Promise<ReachabilityWithBrokenRootsResult> {
  let candidateRoots = keepRoots;
  const brokenRoots = new Set<Digest>();

  for (;;) {
    const result = await computeReachability(
      path,
      candidateRoots,
      rootChildren,
      registry,
      reachabilityOptions,
    );
    if (result.status === "success") {
      return { result, brokenRoots };
    }
    // Not "success": either the mode is off, the failure is not a proven
    // not-found (transient — never tolerated regardless of the flag), or
    // — defensively, should be unreachable in practice since
    // `computeReachability` only ever reports a root drawn from the set
    // it was given — the reported root is not even one still under
    // consideration. Any of these fails the whole package closed, same
    // as calling `computeReachability` directly, and any roots already
    // excluded on an earlier iteration are discarded (see this
    // function's doc: no "half credit").
    if (!deleteBrokenRoots || result.reason !== "not-found" || !candidateRoots.has(result.root)) {
      return { result, brokenRoots: new Set() };
    }
    brokenRoots.add(result.root);
    const next = new Set(candidateRoots);
    next.delete(result.root);
    candidateRoots = next;
  }
}

function mergeEdges(
  a: ReadonlyMap<Digest, readonly Digest[]>,
  b: ReadonlyMap<Digest, readonly Digest[]>,
): ReadonlyMap<Digest, readonly Digest[]> {
  const merged = new Map<Digest, readonly Digest[]>(a);
  for (const [k, v] of b) {
    merged.set(k, v);
  }
  return merged;
}

/**
 * Plans a single package. Implements, in order:
 *
 * ```
 * ALL         = Packages API versions (id, digest, createdAt) — version ids and ages ONLY
 * LIVE_ROOTS  = image(TAGMAP), from the REGISTRY tag list (never the Packages API's `tags`)
 * KEEP_ROOTS  = { d in LIVE_ROOTS : exists t in d.tags . RETAINED(t) } — see `retain.ts`
 * REACHABLE   = least fixed point containing KEEP_ROOTS, closed under CHILDREN
 * INFLIGHT    = { v in ALL : age(v) < keepDays }
 * DELETE      = ALL \ (REACHABLE union INFLIGHT)
 * ```
 *
 * FAIL-CLOSED: if any keep-root or any of its descendants fails to
 * resolve, the WHOLE package is skipped — see {@link buildLiveRoots} and
 * {@link computeReachability} for why there is no smaller safe unit. Note
 * this is stricter than it sounds for `LIVE_ROOTS`: computing `KEEP_ROOTS`
 * at all requires knowing every live root's digest, which requires every
 * tag to resolve, so in practice ANY tag failing to resolve already fails
 * the package closed — not only tags that would end up kept.
 *
 * A digest that is in `ALL`, 404s in the registry, and is unreachable
 * from any kept root is deliberately NOT a fail-closed condition: it is
 * simply never resolved (nothing walks to it), and correctly falls into
 * `DELETE` via the set subtraction above — a stale Packages API entry,
 * not evidence of corruption.
 */
export async function planPackage(options: PlanPackageOptions): Promise<PackagePlanResult> {
  const { org, registryOwner, packageName, registry, packages, clock, policy } = options;
  const path = registryPathFor(registryOwner, packageName);

  const versions = await packages.listVersions(org, packageName);
  if (versions.length === 0) {
    return { status: "nothing-to-do" };
  }
  const versionsByDigest = new Map(versions.map((v) => [v.digest, v]));

  const liveRootsResult = await buildLiveRoots(path, registry);
  if (liveRootsResult.status === "failed") {
    return {
      status: "skipped",
      reason: liveRootsResult.reason,
      detail: liveRootsResult.detail,
    };
  }
  const { roots, rootChildren } = liveRootsResult;

  const now = clock.now();
  const keepRoots = computeKeepRoots(roots, policy.retention);

  const { result: reachResult, brokenRoots } = await computeReachabilityToleratingBrokenRoots(
    path,
    keepRoots,
    rootChildren,
    registry,
    options.reachability,
    options.deleteBrokenRoots ?? false,
  );
  if (reachResult.status === "failed") {
    return {
      status: "skipped",
      reason: reachResult.reason,
      detail: `descendant ${reachResult.failedDigest} of root ${reachResult.root} failed to resolve`,
    };
  }
  const { reachable, edges } = reachResult;

  const inflight = new Set<Digest>();
  for (const v of versions) {
    const ageDays = (now.getTime() - v.createdAt.getTime()) / MS_PER_DAY;
    if (ageDays < policy.keepDays) {
      inflight.add(v.digest);
    }
  }

  const deleteSet = new Set<Digest>();
  for (const v of versions) {
    if (!reachable.has(v.digest) && !inflight.has(v.digest)) {
      deleteSet.add(v.digest);
    }
  }

  if (deleteSet.size === 0) {
    return { status: "nothing-to-do" };
  }

  const liveRootDigests = new Set(roots.map((r) => r.digest));
  const groups = await buildDeletionGroups(
    path,
    deleteSet,
    liveRootDigests,
    mergeEdges(rootChildren, edges),
    registry,
  );

  assertNoSurvivingParent(deleteSet, reachable, edges);

  const versionIdByDigest = new Map<Digest, number>();
  for (const d of deleteSet) {
    const v = versionsByDigest.get(d);
    // Always present: deleteSet is built from `versions` itself above, so
    // every digest in it has a matching PackageVersionRecord by construction.
    if (v) {
      versionIdByDigest.set(d, v.id);
    }
  }

  return {
    status: "planned",
    total: versions.length,
    liveRootsCount: roots.length,
    keepRootsCount: keepRoots.size,
    reachableCount: reachable.size,
    inflightCount: inflight.size,
    deleteCount: deleteSet.size,
    groups,
    versionIdByDigest,
    brokenRootDigests: [...brokenRoots],
  };
}
