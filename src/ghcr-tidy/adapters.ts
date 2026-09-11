import type { PackageName } from "../core/registry/package-name.js";
import { listRegistryTags } from "../core/registry/tags.js";
import { resolveManifest, type ManifestResolution } from "../core/registry/manifest.js";
import { listPackageVersions, type Paginatable } from "../core/registry/packages.js";
import { digest, tag, type Digest, type RegistryPath, type Tag } from "./domain.js";
import type { PackageVersionRecord, PackagesClient, RegistryReader } from "./ports.js";

/**
 * The real {@link RegistryReader}: `/v2/` via the registry core
 * (`listRegistryTags`, `resolveManifest`). `resolveManifest`'s
 * `registryPath` parameter remains a bare `string` (see the module's own
 * report on why it was not tightened to {@link RegistryPath}) — a
 * `RegistryPath` is structurally a `string`, so it is passed straight
 * through with no cast needed.
 *
 * `listTags` throws on anything other than a clean `"success"` from
 * {@link listRegistryTags}, since {@link RegistryReader.listTags} has no
 * failure channel of its own — the ONLY caller, {@link buildLiveRoots},
 * resolves every tag immediately afterwards anyway, so a tag-listing
 * failure and a tag-resolution failure end up in the same fail-closed
 * path either way. This adapter is the one exception where "throw" is
 * appropriate: it is a boundary-crossing detail of wiring GHCR-shaped
 * errors into a Promise, not a semantic decision belonging to the pure
 * planning core.
 */
export function createRegistryReader(
  getToken: (path: RegistryPath) => Promise<string>,
): RegistryReader {
  return {
    async listTags(path: RegistryPath): Promise<readonly Tag[]> {
      const token = await getToken(path);
      const result = await listRegistryTags(path, token);
      if (result.status !== "success") {
        throw new Error(`failed to list tags for ${path}: ${result.status}`);
      }
      return result.tags.map((t) => tag(t));
    },

    async resolve(path: RegistryPath, ref: Digest | Tag): Promise<ManifestResolution> {
      const token = await getToken(path);
      return resolveManifest(path, token, ref);
    },
  };
}

/** The real {@link PackagesClient}: the Packages API via `core/registry/packages.ts`, branding the raw shape into {@link PackageVersionRecord}. */
export function createPackagesClient(octokit: Paginatable): PackagesClient {
  return {
    async listVersions(org: string, pkg: PackageName): Promise<readonly PackageVersionRecord[]> {
      const raws = await listPackageVersions(octokit, org, pkg);
      return raws.map((v) => ({
        id: v.id,
        digest: digest(v.digest),
        createdAt: new Date(v.createdAt),
        reportedTags: v.tags.map((t) => tag(t)),
      }));
    },
  };
}
