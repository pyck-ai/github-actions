import { digest, type Digest, type RegistryPath } from "./domain.js";
import type { RegistryReader } from "./ports.js";

/** One root plus its exclusively-owned descendants, topologically ordered parents-first. A child never precedes its parent. */
export interface DeletionGroup {
  readonly root: Digest;
  /** `root` is always `members[0]`. */
  readonly members: readonly Digest[];
}

/**
 * Best-effort BFS over `deleteSet`-only nodes rooted at `root`, computing
 * `root`'s FULL transitive closure within `deleteSet` — as if `root` were
 * the only candidate, with no cross-candidate ownership to respect. Used
 * as {@link buildDeletionGroups}'s phase 1 (see that function's doc): the
 * closure computed here is candidate-LOCAL (only `localVisited`, scoped
 * to this one call, guards against re-visiting a node reachable two ways
 * within `root`'s own subtree — e.g. a diamond), so it can safely run
 * CONCURRENTLY with every other candidate's closure. Ownership — which
 * candidate actually gets to keep a digest reachable from more than
 * one — is resolved afterward, deterministically, by
 * {@link buildDeletionGroups} itself; this function neither knows nor
 * cares about it.
 *
 * Each BFS level's children are resolved CONCURRENTLY (`Promise.all`),
 * matching `reachability.ts`'s own per-level fan-out; like that function,
 * this imposes no concurrency limit of its own — real HTTP concurrency is
 * bounded entirely by the shared `RegistryReader` (`limiter.ts`, `cli.ts`'s
 * `--jobs`), and a digest reachable from more than one candidate is only
 * ever fetched once regardless (`resolve-cache.ts`, shared across the
 * whole run).
 *
 * This walk is REPORTING/GROUPING ONLY and never influences `DELETE`
 * itself (`DELETE` is pure set arithmetic — see `plan.ts`). Consequently a
 * failed or 404 resolution here must NOT fail the plan closed: a deleted
 * root's child that itself 404s is exactly the "stale Packages API entry"
 * case the design accepts into `DELETE` without ceremony. Resolution here
 * simply stops descending past whatever could not be resolved; the
 * digest is still in the group as a childless leaf (or, if unresolved
 * itself with no known parent, as its own singleton group root). A
 * genuinely UNEXPECTED failure (a bug, not a modeled 404/transient
 * response) still propagates as a rejected promise out of this function —
 * it is never silently swallowed into a truncated-but-plausible-looking
 * member list — which fails the whole package closed at the `planPackage`
 * level (`cli.ts`'s per-package isolation keeps that from touching any
 * OTHER package's plan).
 */
async function computeCandidateClosure(
  path: RegistryPath,
  root: Digest,
  deleteSet: ReadonlySet<Digest>,
  rootChildren: ReadonlyMap<Digest, readonly Digest[]>,
  registry: RegistryReader,
): Promise<readonly Digest[]> {
  const localVisited = new Set<Digest>([root]);
  const members: Digest[] = [root];

  let frontier: readonly Digest[] = [root];
  while (frontier.length > 0) {
    const resolved = await Promise.all(
      frontier.map(async (d): Promise<readonly Digest[]> => {
        const known = rootChildren.get(d);
        if (known !== undefined) {
          return known;
        }
        try {
          const resolution = await registry.resolve(path, d);
          return resolution.status === "success"
            ? resolution.children.map((c) => digest(c.digest))
            : [];
        } catch {
          return [];
        }
      }),
    );

    const next: Digest[] = [];
    for (const children of resolved) {
      for (const c of children) {
        if (deleteSet.has(c) && !localVisited.has(c)) {
          localVisited.add(c);
          members.push(c);
          next.push(c);
        }
      }
    }
    frontier = next;
  }

  return members;
}

/**
 * Groups `deleteSet` into {@link DeletionGroup}s, one per former live root
 * (parents ordered first) plus one singleton group per orphaned digest
 * that was never any known root's descendant.
 *
 * Two phases:
 *
 * 1. **Concurrent, side-effect-free**: every candidate root's FULL
 *    transitive closure within `deleteSet` is computed independently and
 *    at the same time ({@link computeCandidateClosure}, fired via
 *    `Promise.all`). This replaced a `for` loop that walked one
 *    candidate's whole subtree to completion — resolving one digest at a
 *    time — before starting the next: with hundreds of candidates (every
 *    deleted image is its own candidate), that left almost all of
 *    `--jobs`' concurrency budget idle for the same reason
 *    `reachability.ts`'s old per-root loop did. Real HTTP concurrency is
 *    still bounded entirely by the shared `RegistryReader`'s limiter, so
 *    firing every candidate's closure at once does not add a second,
 *    competing budget.
 * 2. **Deterministic, synchronous, no I/O**: candidates are walked in
 *    FIXED order (sorted digest order, live-root candidates first,
 *    exactly as before) and each one's precomputed closure is filtered
 *    against a single shared `visited` set, claiming whichever digests
 *    are not already owned by an earlier candidate. A digest reachable
 *    from more than one candidate's closure — the ownership race phase 1
 *    deliberately ignores — is always won by whichever candidate comes
 *    FIRST in this fixed order, exactly matching what the original
 *    sequential-BFS algorithm did (the first candidate to reach a shared
 *    digest always fully expanded into its descendants before any later
 *    candidate got a chance to). Because this phase does no I/O and never
 *    awaits, it can never race: the outcome depends only on candidate
 *    order, never on which candidate's network calls happened to resolve
 *    first — so the emitted groups (root, member order, and ownership of
 *    every shared digest) are byte-for-byte deterministic regardless of
 *    concurrency.
 *
 * Within a kept group, member order matches `computeCandidateClosure`'s
 * own BFS order (parents before children) with any digest claimed by an
 * earlier candidate filtered out — filtering out entries never reorders
 * the survivors, so parents still precede their children.
 */
export async function buildDeletionGroups(
  path: RegistryPath,
  deleteSet: ReadonlySet<Digest>,
  liveRootDigests: ReadonlySet<Digest>,
  rootChildren: ReadonlyMap<Digest, readonly Digest[]>,
  registry: RegistryReader,
): Promise<readonly DeletionGroup[]> {
  const liveRootCandidates = [...deleteSet].filter((d) => liveRootDigests.has(d)).sort();
  const otherCandidates = [...deleteSet].filter((d) => !liveRootDigests.has(d)).sort();
  const orderedCandidates = [...liveRootCandidates, ...otherCandidates];

  const closures = await Promise.all(
    orderedCandidates.map((root) =>
      computeCandidateClosure(path, root, deleteSet, rootChildren, registry),
    ),
  );

  const visited = new Set<Digest>();
  const groups: DeletionGroup[] = [];

  for (const [i, root] of orderedCandidates.entries()) {
    if (visited.has(root)) {
      continue;
    }
    const closure = closures[i];
    // Always defined: `closures` was built from `orderedCandidates` via
    // `.map`, so it has exactly `orderedCandidates.length` entries in the
    // same order.
    if (closure === undefined) {
      throw new Error("unreachable: closures and orderedCandidates must be the same length");
    }

    const members: Digest[] = [];
    for (const d of closure) {
      if (visited.has(d)) {
        continue;
      }
      visited.add(d);
      members.push(d);
    }
    groups.push({ root, members });
  }

  return groups;
}

/**
 * Static integrity assertion: no digest in `DELETE` may still be
 * referenced as a child of a digest in `reachable` (a "surviving parent").
 * `edges` here should be the reachability walk's own edge map — every
 * digest it contains as a key was successfully resolved, so its recorded
 * children are exactly what the registry itself reports.
 *
 * Throws on violation. Intended to run once per planned package as the
 * final sanity check before a plan is returned to the caller.
 */
export function assertNoSurvivingParent(
  deleteSet: ReadonlySet<Digest>,
  reachable: ReadonlySet<Digest>,
  edges: ReadonlyMap<Digest, readonly Digest[]>,
): void {
  for (const [parent, children] of edges) {
    if (!reachable.has(parent)) {
      continue;
    }
    for (const child of children) {
      if (deleteSet.has(child)) {
        throw new Error(
          `plan integrity violation: ${child} is planned for deletion but reachable parent ${parent} still references it`,
        );
      }
    }
  }
}
