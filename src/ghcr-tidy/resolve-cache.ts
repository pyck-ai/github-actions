import type { ManifestResolution } from "../core/registry/manifest.js";
import type { Digest, RegistryPath, Tag } from "./domain.js";
import type { RegistryReader } from "./ports.js";

/**
 * Decorates a {@link RegistryReader} so that within one run, the same
 * `(path, ref)` pair is never sent to the underlying registry twice — and
 * two callers racing on the SAME digest (e.g. two keep-roots whose BFS
 * frontiers both reach a shared platform manifest in the same tick, now
 * that `reachability.ts` resolves a frontier level concurrently) share one
 * in-flight request instead of issuing duplicates.
 *
 * Keyed on the raw reference actually sent to the registry (a {@link Tag}
 * or a {@link Digest}), not on the digest a resolution turns OUT to be:
 * resolving a tag is exactly the tag -> digest lookup itself, so it can
 * never be skipped just because some other tag happens to already be
 * known to point at the same digest. What this DOES eliminate is the
 * common case this model produces constantly: the same DIGEST reached
 * from more than one place — a child shared by several roots (already
 * partly handled by `reachability.ts`'s own `reachable`/`rootChildren`
 * bookkeeping) or a manifest fetched once as a BFS child and later found
 * again as an unrelated live root.
 *
 * Scoped per `path` implicitly (the key includes it), so it is safe to
 * share ONE cache across every package in a run: a digest is
 * content-addressed, but manifest storage in GHCR is per-repository, so a
 * digest resolved successfully under one package's path says nothing
 * about whether it exists under a different package's path.
 *
 * Does not cache `listTags` — the tag list is read exactly once per
 * package already (`roots.ts` is `buildLiveRoots`'s only caller besides
 * `verify.ts`'s snapshotting, and those are different logical reads at
 * different times), so there is nothing to de-duplicate there.
 */
export function createCachingRegistryReader(registry: RegistryReader): RegistryReader {
  const cache = new Map<string, Promise<ManifestResolution>>();

  function cachedResolve(path: RegistryPath, ref: Digest | Tag): Promise<ManifestResolution> {
    const key = `${path}\u0000${ref}`;
    const existing = cache.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const promise = registry.resolve(path, ref);
    cache.set(key, promise);
    return promise;
  }

  return {
    listTags: (path) => registry.listTags(path),
    resolve: cachedResolve,
  };
}
