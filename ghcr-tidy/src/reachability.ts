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
 * Walks EVERY keep-root's subtree CONCURRENTLY — one BFS per root, all
 * started together via `Promise.all` — over a SHARED `reachable` set (so
 * a digest shared by two keep-roots is resolved once, whichever root's
 * walk gets there first). This replaced a per-root `for` loop that walked
 * one root's whole subtree to completion before starting the next: for a
 * package with many kept roots but a shallow tree under each (a few
 * children per multi-arch index), the old loop left most of `--jobs`'
 * concurrency budget idle, since only one root's handful of in-flight
 * requests ever competed for it at once. Firing every root's walk at once
 * does not add a second concurrency budget — see the note on the shared
 * limiter below — it just gives the one existing budget enough
 * simultaneous candidate work to actually fill it. (For a package that
 * keeps only a HANDFUL of roots — e.g. `keepLast: 1` — this walk was
 * never the dominant cost in the first place; see `deletion-group.ts`'s
 * `buildDeletionGroups`/`collectGroupMembers`, which walks the far larger
 * DELETE set and remains sequential root-by-root AND node-by-node, for
 * where that time actually goes.) One broken root does not stop the walk
 * of the others before the fail-closed check below is reached (though the
 * net effect here is the same: any failure fails the whole package
 * closed, per `plan.ts`'s module doc).
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
 * Each BFS level (the current `frontier`, de-duplicated) is ALSO resolved
 * concurrently (`Promise.all`), not one node at a time — this is usually
 * where most of a package's fan-out actually lives (a multi-arch index's
 * platform + attestation children, all siblings in one level). Like
 * `roots.ts`'s per-tag resolution, this function imposes no concurrency
 * limit of its own — real HTTP concurrency, across every root's every
 * level at once, is bounded entirely by the shared `RegistryReader`
 * (`limiter.ts`, `cli.ts`'s `--jobs`) applied once at the registry-adapter
 * boundary, so root-level and level-level fan-out here never multiply
 * together into a second, uncoordinated budget. Levels within one root
 * stay sequential (a node's children are only knowable once the node
 * itself has resolved); de-duplication against the shared `reachable` set
 * is exactly as it was before, just checked once per level up front
 * instead of node-by-node as each resolve returns, so concurrent
 * siblings — whether in the same root's level or in a different root's
 * walk entirely — never race each other into resolving the same digest
 * twice (JS's single-threaded, run-to-completion semantics make each
 * level's synchronous de-dup-and-reserve pass atomic; see `walkRoot`'s
 * own comment below).
 *
 * When more than one node fails — whether siblings in one level or nodes
 * in different roots' walks — the FIRST one in `keepRoots`' root order,
 * and within a root the first in that level's (de-duplicated,
 * order-preserving) frontier order, is always what gets reported:
 * `Promise.all` collects every root's outcome before any is inspected,
 * and outcomes are then scanned in root order, never by which network
 * round trip happens to finish first — so the emitted skip reason stays
 * deterministic regardless of concurrency (see `plan.test.ts`'s
 * determinism-under-concurrency test).
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

  type RootWalkOutcome =
    | { status: "success" }
    | { status: "failed"; reason: SkipReason; root: Digest; failedDigest: Digest };

  // One root's BFS. Runs concurrently with every other root's (see
  // `Promise.all` below) but reads/writes the OUTER `reachable`/`edges`
  // safely: JS is single-threaded and every mutation here happens in a
  // synchronous stretch with no `await` in between, so two roots' walks
  // can never interleave mid-check — each de-dup-and-reserve pass over a
  // level's frontier still completes atomically before this walk yields
  // to the next `await`, exactly as it did when levels were the only
  // thing resolved concurrently.
  async function walkRoot(root: Digest): Promise<RootWalkOutcome> {
    if (reachable.has(root)) {
      return { status: "success" };
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
      // a child, or two DIFFERENT roots' frontiers converging on the same
      // shared descendant) so concurrent resolution below never issues
      // two requests for the same digest, and order is preserved for
      // deterministic failure reporting.
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
        // Reserved up front (before any resolve completes, and before
        // this walk's next `await`) so the node cap above is checked
        // against an accurate count even though the resolves below run
        // concurrently — both within this level and across sibling
        // roots' own levels.
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

    return { status: "success" };
  }

  // Every root's BFS is kicked off together — this is the fix for the
  // planner's bottleneck (see the module doc above): a keep-set with
  // hundreds of roots but only ~4 children per multi-arch index used to
  // leave almost all of `--jobs`' budget idle, because only ONE root's
  // handful of concurrent requests was ever in flight at a time. Real HTTP
  // concurrency is still bounded exactly as before — by the shared
  // `RegistryReader`'s own limiter (`limiter.ts`, `cli.ts`'s `--jobs`) at
  // the registry-adapter boundary, applied to every resolve this function
  // (and every OTHER root's) issues — so firing all roots' walks at once
  // does not add a second, uncoordinated concurrency budget: it simply
  // gives the one existing budget enough simultaneous candidate work to
  // actually fill it.
  //
  // Outcomes are collected via `Promise.all` (not raced) and then scanned
  // in `keepRoots`' OWN order below, so which failure gets reported is
  // determined purely by root order, never by which root's network calls
  // happen to finish first — the same determinism guarantee the
  // per-level frontier resolution already gave within a single root, now
  // extended across roots too.
  const outcomes = await Promise.all([...keepRoots].map((root) => walkRoot(root)));

  for (const outcome of outcomes) {
    if (outcome.status === "failed") {
      return outcome;
    }
  }

  return { status: "success", reachable, edges };
}
