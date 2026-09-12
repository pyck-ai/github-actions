import type { PackageName } from "../../registry/package-name.js";
import type { ManifestResolution } from "../../registry/manifest.js";
import type { Digest, RegistryPath, Tag } from "./domain.js";

/**
 * `/v2/` — the registry itself, and the SOLE source of truth for which
 * tags exist and what they resolve to. See the module doc on
 * {@link buildLiveRoots} (`roots.ts`) for why ghcr-tidy never roots on the
 * Packages API's per-version `tags` array.
 */
export interface RegistryReader {
  /** Lists every tag of the package. MUST paginate (GHCR pages at 100 per request). */
  listTags(path: RegistryPath): Promise<readonly Tag[]>;
  /** Resolves a manifest by digest or tag. */
  resolve(path: RegistryPath, ref: Digest | Tag): Promise<ManifestResolution>;
}

/**
 * A single version as reported by `GET /orgs/{org}/packages/container/{name}/versions`.
 *
 * `reportedTags` is named deliberately differently from a plain `tags`
 * field, and documented as REPORTING-ONLY, so that reusing it as a
 * retention input requires visibly reaching past its name and its doc
 * comment — the type system alone cannot forbid reading a field, but a
 * distinct, loudly-labelled name is the next best thing. See `roots.ts`
 * for where the actual roots (`LiveRoot`) come from instead: the registry
 * tag list, never this field. This is the flutter-rfw regression case:
 * `metadata.container.tags` is a stale secondary index that has been
 * observed empty for a version a live registry tag still points at.
 */
export interface PackageVersionRecord {
  readonly id: number;
  readonly digest: Digest;
  readonly createdAt: Date;
  /** STALE secondary index. Reporting only — see the interface doc. Never read this for retention. */
  readonly reportedTags: readonly Tag[];
}

/** `api.github.com` — the Packages API. Supplies version `id` (needed to delete) and `createdAt` (needed for age policy) only. */
export interface PackagesClient {
  /** Lists every version of the package. MUST paginate. */
  listVersions(org: string, pkg: PackageName): Promise<readonly PackageVersionRecord[]>;
}

/** Injectable time source, so age-based policy (`keepDays`, `graceDays`) is deterministic under test. */
export interface Clock {
  now(): Date;
}
