import type { PackageName } from "../core/registry/package-name.js";
import type { ManifestChild, ManifestResolution } from "../core/registry/manifest.js";
import { digest, type Digest, type RegistryPath, type Tag } from "./domain.js";
import type { PackageVersionRecord, PackagesClient, RegistryReader } from "./ports.js";

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
