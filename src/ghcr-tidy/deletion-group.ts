import { digest, type Digest, type RegistryPath } from "./domain.js";
import type { RegistryReader } from "./ports.js";

/** One root plus its exclusively-owned descendants, topologically ordered parents-first. A child never precedes its parent. */
export interface DeletionGroup {
  readonly root: Digest;
  /** `root` is always `members[0]`. */
  readonly members: readonly Digest[];
}

/**
 * Best-effort BFS over `deleteSet`-only nodes rooted at `root`, marking
 * every visited digest in the shared `visited` set so no digest is ever
 * claimed by two groups (this is what makes a group's non-root members
 * "exclusively owned" — a digest still reachable from a KEPT root was
 * already excluded from `deleteSet` entirely by {@link computeReachability},
 * so it can never appear here in the first place).
 *
 * This walk is REPORTING/GROUPING ONLY and never influences `DELETE`
 * itself (`DELETE` is pure set arithmetic — see `plan.ts`). Consequently a
 * failed or 404 resolution here must NOT fail the plan closed: a deleted
 * root's child that itself 404s is exactly the "stale Packages API entry"
 * case the design accepts into `DELETE` without ceremony. Resolution here
 * simply stops descending past whatever could not be resolved; the
 * digest is still in the group as a childless leaf (or, if unresolved
 * itself with no known parent, as its own singleton group root).
 */
async function collectGroupMembers(
  path: RegistryPath,
  root: Digest,
  deleteSet: ReadonlySet<Digest>,
  rootChildren: ReadonlyMap<Digest, readonly Digest[]>,
  registry: RegistryReader,
  visited: Set<Digest>,
): Promise<Digest[]> {
  const members: Digest[] = [root];
  visited.add(root);

  let frontier: Digest[] = [root];
  while (frontier.length > 0) {
    const next: Digest[] = [];
    for (const d of frontier) {
      let children: readonly Digest[] | undefined = rootChildren.get(d);
      if (children === undefined) {
        try {
          const resolution = await registry.resolve(path, d);
          children =
            resolution.status === "success" ? resolution.children.map((c) => digest(c.digest)) : [];
        } catch {
          children = [];
        }
      }
      for (const c of children) {
        if (deleteSet.has(c) && !visited.has(c)) {
          visited.add(c);
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
 * that was never any known root's descendant. Deterministic: candidate
 * roots are processed in sorted digest order, and within a group each BFS
 * level's children are visited in the order {@link ManifestChild}s
 * appear in the manifest, so the same fake world always yields the same
 * plan.
 */
export async function buildDeletionGroups(
  path: RegistryPath,
  deleteSet: ReadonlySet<Digest>,
  liveRootDigests: ReadonlySet<Digest>,
  rootChildren: ReadonlyMap<Digest, readonly Digest[]>,
  registry: RegistryReader,
): Promise<readonly DeletionGroup[]> {
  const visited = new Set<Digest>();
  const groups: DeletionGroup[] = [];

  const liveRootCandidates = [...deleteSet].filter((d) => liveRootDigests.has(d)).sort();
  const otherCandidates = [...deleteSet].filter((d) => !liveRootDigests.has(d)).sort();

  for (const root of [...liveRootCandidates, ...otherCandidates]) {
    if (visited.has(root)) {
      continue;
    }
    const members = await collectGroupMembers(
      path,
      root,
      deleteSet,
      rootChildren,
      registry,
      visited,
    );
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
