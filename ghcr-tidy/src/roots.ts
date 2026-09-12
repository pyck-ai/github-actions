import { digest, type Digest, type RegistryPath, type Tag } from "./domain.js";
import type { LiveRoot } from "./retain.js";
import type { RegistryReader } from "./ports.js";
import { skipReasonFor, type SkipReason } from "./skip-reason.js";

export type BuildLiveRootsResult =
  | {
      status: "success";
      roots: readonly LiveRoot[];
      /** Direct children of every live root (kept or not), as a free side effect of resolving each tag — reused by the reachability walk and by deletion-group building so neither has to re-resolve a root. */
      rootChildren: ReadonlyMap<Digest, readonly Digest[]>;
    }
  | { status: "failed"; reason: SkipReason; detail: string };

/**
 * Builds `LIVE_ROOTS = image(TAGMAP)` by listing the registry's own tags
 * and resolving each one — NEVER by reading the Packages API's per-version
 * `tags` array.
 *
 * This is the single most important departure from the bash reference,
 * which rooted on the Packages API instead (`tidy.sh:1068`) despite its
 * own sibling `audit.sh` documenting that array as a stale secondary index
 * "observed claiming a tag that, per the registry itself, resolves to a
 * different, healthy digest". A version whose `tags` array is stale-empty
 * while a registry tag genuinely points at it would, under that model,
 * not be a root, not be reachable, and get deleted along with its
 * children — precisely how `flutter-rfw`'s image was hollowed out.
 * Rooting in the registry closes that class of bug by construction: if a
 * tag resolves to a digest, that digest is live, full stop, regardless of
 * what the Packages API's cache says.
 *
 * Every tag must resolve for `LIVE_ROOTS` (and therefore `KEEP_ROOTS`) to
 * be computable at all, so this function fails the WHOLE package closed
 * (see the `plan.ts` module doc) on the first tag that does not resolve
 * with a `"success"` status — there is no smaller safe unit than "we do
 * not know what this tag points at". Listing the tags in the first place
 * is held to the same standard: {@link RegistryReader.listTags} has no
 * failure channel of its own (it throws — see `adapters.ts`'s doc), and a
 * thrown listing failure is caught here and turned into the identical
 * `"failed"` outcome, so a package whose tag list cannot even be read is
 * SKIPPED like any other fail-closed package, never left to propagate an
 * uncaught exception out of the whole run (that used to abort the entire
 * `plan`/`apply` invocation over ONE package's transient registry error,
 * while sibling packages already in flight kept running to completion in
 * the background regardless — see `cli.ts`'s `--jobs` doc for why that
 * mattered in practice).
 *
 * Every tag is resolved CONCURRENTLY (`Promise.all`) rather than one at a
 * time — this function itself imposes no concurrency limit; the
 * `RegistryReader` it is given is expected to already bound real HTTP
 * concurrency (see `limiter.ts`/`resolve-cache.ts` and `cli.ts`'s
 * `--jobs` wiring). Results are kept indexed by the tag list's own order
 * so that, if more than one tag fails, the FIRST one in list order is
 * always what gets reported — independent of which network round trip
 * happens to finish first — keeping the emitted skip reason
 * deterministic regardless of concurrency (see `plan.test.ts`'s
 * determinism-under-concurrency test).
 */
export async function buildLiveRoots(
  path: RegistryPath,
  registry: RegistryReader,
): Promise<BuildLiveRootsResult> {
  let tags: readonly Tag[];
  try {
    tags = await registry.listTags(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "failed", reason: "transient", detail: `failed to list tags: ${message}` };
  }

  const resolutions = await Promise.all(tags.map((t) => registry.resolve(path, t)));

  const tagsByDigest = new Map<Digest, Set<Tag>>();
  const rootChildren = new Map<Digest, readonly Digest[]>();

  for (const [i, t] of tags.entries()) {
    const resolution = resolutions[i];
    // Always defined: `resolutions` was built from `tags` via `.map`, so
    // it has exactly `tags.length` entries in the same order.
    if (resolution === undefined) {
      throw new Error("unreachable: resolutions and tags must be the same length");
    }
    const reason = skipReasonFor(resolution);
    if (reason !== undefined) {
      return { status: "failed", reason, detail: `tag "${t}" failed to resolve` };
    }
    if (resolution.status !== "success") {
      // Unreachable: skipReasonFor returns undefined only for "success".
      throw new Error("unreachable: non-success resolution without a skip reason");
    }

    const d = digest(resolution.digest);
    const existing = tagsByDigest.get(d);
    if (existing) {
      existing.add(t);
    } else {
      tagsByDigest.set(d, new Set([t]));
    }
    if (!rootChildren.has(d)) {
      rootChildren.set(
        d,
        resolution.children.map((c) => digest(c.digest)),
      );
    }
  }

  const roots: LiveRoot[] = [...tagsByDigest.entries()].map(([d, tagSet]) => ({
    digest: d,
    tags: tagSet,
  }));

  return { status: "success", roots, rootChildren };
}
