import type { PackageName } from "../core/registry/package-name.js";
import type { ManifestChild, ManifestResolution } from "../core/registry/manifest.js";
import { digest, type Digest, type RegistryPath, type Tag } from "./domain.js";
import type { PackageVersionRecord, PackagesClient, RegistryReader } from "./ports.js";
import type { Mutator } from "./mutator.js";

/**
 * A registry-side node: what {@link FakeGhcr.registry} resolves a digest
 * to. `notFound: true` and `transient: true` let a test simulate exactly
 * the failure a real `resolveManifest` call could return, without faking
 * HTTP.
 */
export interface FakeManifestNode {
  readonly children?: readonly ManifestChild[];
  readonly notFound?: boolean;
  readonly transient?: boolean;
}

/**
 * A double exposing TWO INDEPENDENTLY PERTURBABLE views of a package,
 * matching the two real, genuinely different data sources ghcr-tidy reads
 * from:
 *
 * - `registry`: the `/v2/` tag list and manifest graph — ground truth.
 * - `packagesApi`: the Packages API's version listing (id/createdAt/tags)
 *   — a secondary index that can and does go stale.
 *
 * Divergence between the two is the central fact of this domain (see the
 * `roots.ts` module doc for the flutter-rfw incident), so this fake is
 * built to make that divergence trivial to express: set a tag on
 * `registryTags` without touching a version's `reportedTags`, or vice
 * versa, and the two `RegistryReader`/`PackagesClient` implementations
 * below will faithfully report the mismatch to the code under test.
 */
export class FakeGhcr {
  /** digest -> node. The registry's manifest graph. */
  readonly manifests = new Map<Digest, FakeManifestNode>();
  /** tag -> digest. The registry's tag list / TAGMAP. */
  readonly registryTags = new Map<Tag, Digest>();
  /** The Packages API's version listing, independent of `registryTags`. */
  readonly packageVersions: PackageVersionRecord[] = [];

  setManifest(d: Digest, node: FakeManifestNode): this {
    this.manifests.set(d, node);
    return this;
  }

  setTag(t: Tag, d: Digest): this {
    this.registryTags.set(t, d);
    return this;
  }

  addVersion(v: PackageVersionRecord): this {
    this.packageVersions.push(v);
    return this;
  }

  registryReader(): RegistryReader {
    return {
      listTags: (_path: RegistryPath): Promise<readonly Tag[]> =>
        Promise.resolve([...this.registryTags.keys()]),

      resolve: (_path: RegistryPath, ref: Digest | Tag): Promise<ManifestResolution> => {
        const d = this.registryTags.get(ref as Tag) ?? (ref as Digest);
        const node = this.manifests.get(d);
        if (!node) {
          return Promise.resolve({ status: "not-found", httpStatus: 404 });
        }
        if (node.notFound) {
          return Promise.resolve({ status: "not-found", httpStatus: 404 });
        }
        if (node.transient) {
          return Promise.resolve({ status: "transient-error", httpStatus: 503 });
        }
        return Promise.resolve({
          status: "success",
          httpStatus: 200,
          digest: d,
          mediaType: node.children?.length
            ? "application/vnd.oci.image.index.v1+json"
            : "application/vnd.oci.image.manifest.v1+json",
          children: [...(node.children ?? [])],
        });
      },
    };
  }

  packagesClient(): PackagesClient {
    return {
      listVersions: (_org: string, _pkg: PackageName): Promise<readonly PackageVersionRecord[]> =>
        Promise.resolve([...this.packageVersions]),
    };
  }

  /** Fault to inject the NEXT time `deleteVersion` is called for a given version id — see {@link mutator}. */
  readonly deleteFaults = new Map<number, FakeDeleteFault>();

  setDeleteFault(versionId: number, fault: FakeDeleteFault): this {
    this.deleteFaults.set(versionId, fault);
    return this;
  }

  /**
   * A mutating view of this fake world, matching real GHCR delete
   * semantics closely enough to exercise `apply.ts`'s group-execution
   * algorithm: deleting an id already deleted returns `"already-gone"`
   * (mirroring a real 404 on a second delete — this is what makes
   * applying the same plan twice idempotent), and `setDeleteFault` lets a
   * test make a specific digest fail with a specific outcome ONCE
   * (`"not-found"` -> already-gone, `"last-version-conflict"` -> the
   * undocumented 400, `"error"` -> throws, simulating anything the
   * throttling/retry plugins gave up on, e.g. a 500).
   */
  mutator(): FakeMutatorHandle {
    const deletedVersionIds: number[] = [];
    const attemptedVersionIds: number[] = [];
    const mutator: Mutator = {
      deleteVersion: (_pkg, id) => {
        attemptedVersionIds.push(id);
        if (deletedVersionIds.includes(id)) {
          return Promise.resolve("already-gone");
        }
        const fault = this.deleteFaults.get(id);
        if (fault?.kind === "not-found") {
          return Promise.resolve("already-gone");
        }
        if (fault?.kind === "last-version-conflict") {
          return Promise.resolve("last-version-conflict");
        }
        if (fault?.kind === "error") {
          return Promise.reject(
            new Error(
              `simulated failure (status ${String(fault.status ?? 500)}) deleting version ${String(id)}`,
            ),
          );
        }
        deletedVersionIds.push(id);
        return Promise.resolve("deleted");
      },
      deletePackage: (_pkg) => Promise.resolve("deleted"),
    };
    return { mutator, deletedVersionIds, attemptedVersionIds };
  }
}

/** A one-shot fault for {@link FakeGhcr.mutator}'s `deleteVersion`. */
export type FakeDeleteFault =
  | { readonly kind: "not-found" }
  | { readonly kind: "last-version-conflict" }
  | { readonly kind: "error"; readonly status?: number };

export interface FakeMutatorHandle {
  readonly mutator: Mutator;
  /** Version ids for which `deleteVersion` returned `"deleted"`, in call order. */
  readonly deletedVersionIds: readonly number[];
  /** Every `deleteVersion` call made, in order, regardless of outcome. */
  readonly attemptedVersionIds: readonly number[];
}

/** Convenience for building a `PackageVersionRecord` in tests without threading branding calls through every fixture. */
export function version(
  id: number,
  d: string,
  createdAt: string,
  reportedTags: string[] = [],
): PackageVersionRecord {
  return {
    id,
    digest: digest(d),
    createdAt: new Date(createdAt),
    reportedTags: reportedTags.map((t) => t as Tag),
  };
}
