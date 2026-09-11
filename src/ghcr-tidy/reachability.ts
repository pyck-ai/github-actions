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
 *
 * Each BFS level (the current `frontier`, de-duplicated) is resolved
 * CONCURRENTLY (`Promise.all`), not one node at a time — this is usually
 * where most of a package's fan-out actually lives (a multi-arch index's
 * platform + attestation children, all siblings in one level). Like
 * `roots.ts`'s per-tag resolution, this function imposes no concurrency
 * limit of its own; the `RegistryReader` it is given is expected to
 * already bound real HTTP concurrency (`limiter.ts`, `cli.ts`'s `--jobs`).
 * Levels themselves stay sequential (a node's children are only knowable
 * once the node itself has resolved), and roots are still walked one at a
 * time in `keepRoots`' own order — de-duplication against the shared
 * `reachable` set is exactly as it was before, just checked once per
 * level up front instead of node-by-node as each resolve returns, so
 * concurrent siblings never race each other into resolving the same
 * digest twice.
 *
 * When more than one node in a level fails, the FIRST one in the level's
 * (de-duplicated, order-preserving) order is always what gets reported —
 * independent of which network round trip happens to finish first — so
 * the emitted skip reason is deterministic regardless of concurrency (see
 * `plan.test.ts`'s determinism-under-concurrency test).
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

      // De-duplicate the level up front (a digest can appear more than
      // once in one frontier — e.g. two parents at the same level sharing
      // a child) so concurrent resolution below never issues two requests
      // for the same digest, and order is preserved for deterministic
      // failure reporting.
      const distinctFrontier: Digest[] = [];
      const seenThisLevel = new Set<Digest>();
      for (const d of frontier) {
        if (reachable.has(d) || seenThisLevel.has(d)) {
          continue;
        }
        seenThisLevel.add(d);
        distinctFrontier.push(d);
      }

      for (const d of distinctFrontier) {
        if (reachable.size >= nodeCap) {
          throw new Error(`reachability walk exceeded the node cap (${String(nodeCap)})`);
        }
        // Reserved up front (before any resolve completes) so the node
        // cap above is checked against an accurate count even though the
        // resolves below run concurrently.
        reachable.add(d);
      }

      const resolved = await Promise.all(
        distinctFrontier.map(async (d) => {
          const known = rootChildren.get(d);
          if (known !== undefined) {
            return { kind: "known" as const, children: known };
          }
          return { kind: "resolved" as const, resolution: await registry.resolve(path, d) };
        }),
      );

      const next: Digest[] = [];
      for (const [i, d] of distinctFrontier.entries()) {
        const outcome = resolved[i];
        // Always defined: `resolved` was built from `distinctFrontier`
        // via `.map`, so it has exactly `distinctFrontier.length` entries
        // in the same order.
        if (outcome === undefined) {
          throw new Error("unreachable: resolved and distinctFrontier must be the same length");
        }

        let children: readonly Digest[];
        if (outcome.kind === "known") {
          children = outcome.children;
        } else {
          const reason = skipReasonFor(outcome.resolution);
          if (reason !== undefined) {
            return { status: "failed", reason, root, failedDigest: d };
          }
          if (outcome.resolution.status !== "success") {
            throw new Error("unreachable: non-success resolution without a skip reason");
          }
          children = outcome.resolution.children.map((c) => digest(c.digest));
        }

        edges.set(d, children);
        next.push(...children);
      }
      frontier = next;
      depth++;
    }
  }

  return { status: "success", reachable, edges };
}
