import type { PackageName } from "../core/registry/package-name.js";
import { registryPathFor, type Digest } from "./domain.js";
import { computeKeepRoots, type RetentionPolicy } from "./retain.js";
import { buildLiveRoots } from "./roots.js";
import { computeReachability, type ReachabilityOptions } from "./reachability.js";
import {
  assertNoSurvivingParent,
  buildDeletionGroups,
  type DeletionGroup,
} from "./deletion-group.js";
import type { Clock, PackagesClient, RegistryReader } from "./ports.js";
import type { SkipReason } from "./skip-reason.js";

const MS_PER_DAY = 86_400_000;

/**
 * Age-based policy applied to EVERY version regardless of tags — the
 * `graceDays` half of the two-knob age protection described on
 * {@link RetentionPolicy}. Kept as a separate type (rather than folding
 * `graceDays` into `RetentionPolicy`) so the two floors cannot be confused
 * for one call site: `keepDays` is a `retain()` input for ROOTS only,
 * `graceDays` gates membership in `INFLIGHT` for every version in `ALL`.
 */
export interface PlanPolicy {
  readonly retention: RetentionPolicy;
  readonly graceDays: number;
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
}

export type PackagePlanResult = SkippedPlan | NothingToDoPlan | PlannedPlan;

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
 * KEEP_ROOTS  = { d in LIVE_ROOTS : retain(d) }
 * REACHABLE   = least fixed point containing KEEP_ROOTS, closed under CHILDREN
 * INFLIGHT    = { v in ALL : age(v) < graceDays }
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
      detail: `tag "${liveRootsResult.tag}" failed to resolve`,
    };
  }
  const { roots, rootChildren } = liveRootsResult;

  const now = clock.now();
  const keepRoots = computeKeepRoots(roots, versionsByDigest, policy.retention, now);

  const reachResult = await computeReachability(
    path,
    keepRoots,
    rootChildren,
    registry,
    options.reachability,
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
    if (ageDays < policy.graceDays) {
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
  };
}
