import { digest, type Digest, type RegistryPath } from "./domain.js";
import type { RegistryReader } from "./ports.js";
import { skipReasonFor, type SkipReason } from "./skip-reason.js";

export interface ReachabilityOptions {
  /** Total nodes the BFS may visit across every root before it gives up. Guards a pathological/cyclic index from hanging the run. Default 10000. */
  readonly nodeCap?: number;
  /** Max BFS depth from any single root. Default 64. */
  readonly depthCap?: number;
}

export type ReachabilityResult =
  | {
      status: "success";
      /** `REACHABLE`: `KEEP_ROOTS` closed under `CHILDREN`. */
      reachable: ReadonlySet<Digest>;
      /** Parent -> direct children, for every digest added to `reachable`. Used to assert no digest in `DELETE` has a surviving parent. */
      edges: ReadonlyMap<Digest, readonly Digest[]>;
    }
  | { status: "failed"; reason: SkipReason; root: Digest; failedDigest: Digest };

/**
 * `REACHABLE = least fixed point R with KEEP_ROOTS subset R and, for all
 * d in R, CHILDREN(d) subset R`.
 *
 * Walks each keep-root's subtree with a per-root BFS over a SHARED
 * `reachable` set (so a digest shared by two keep-roots is resolved once),
 * mirroring the bash reference's per-root processing — one broken root
 * does not stop the walk of the others before the fail-closed check below
 * is reached (though the net effect here is the same: any failure fails
 * the whole package closed, per `plan.ts`'s module doc).
 *
 * `rootChildren` (from {@link buildLiveRoots}) supplies each root's direct
 * children for free — resolving a tag already fetched them — so the first
 * BFS level never re-resolves a root's own manifest.
 *
 * On any non-`"success"` resolution the WHOLE package must be treated as
 * fail-closed (see `plan.ts`): the caller cannot know `CHILDREN` of the
 * failed digest, so it cannot know whether anything downstream of it is
 * reachable. The distinct root/failedDigest in the result exists purely
 * for diagnostics.
 */
export async function computeReachability(
  path: RegistryPath,
  keepRoots: ReadonlySet<Digest>,
  rootChildren: ReadonlyMap<Digest, readonly Digest[]>,
  registry: RegistryReader,
  options: ReachabilityOptions = {},
): Promise<ReachabilityResult> {
  const nodeCap = options.nodeCap ?? 10_000;
  const depthCap = options.depthCap ?? 64;

  const reachable = new Set<Digest>();
  const edges = new Map<Digest, readonly Digest[]>();

  for (const root of keepRoots) {
    if (reachable.has(root)) {
      continue;
    }

    let frontier: Digest[] = [root];
    let depth = 0;

    while (frontier.length > 0) {
      if (depth > depthCap) {
        throw new Error(
          `reachability walk rooted at ${root} exceeded the depth cap (${String(depthCap)})`,
        );
      }

      const next: Digest[] = [];
      for (const d of frontier) {
        if (reachable.has(d)) {
          continue;
        }
        if (reachable.size >= nodeCap) {
          throw new Error(`reachability walk exceeded the node cap (${String(nodeCap)})`);
        }

        let children: readonly Digest[];
        const known = rootChildren.get(d);
        if (known !== undefined) {
          children = known;
        } else {
          const resolution = await registry.resolve(path, d);
          const reason = skipReasonFor(resolution);
          if (reason !== undefined) {
            return { status: "failed", reason, root, failedDigest: d };
          }
          if (resolution.status !== "success") {
            throw new Error("unreachable: non-success resolution without a skip reason");
          }
          children = resolution.children.map((c) => digest(c.digest));
        }

        reachable.add(d);
        edges.set(d, children);
        next.push(...children);
      }
      frontier = next;
      depth++;
    }
  }

  return { status: "success", reachable, edges };
}
