import { Octokit as OctokitCore } from "@octokit/core";
import { paginateRest } from "@octokit/plugin-paginate-rest";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import type { PackageName } from "./package-name.js";

/**
 * The Octokit class this module is built for: core + pagination + retry +
 * throttling. This is a primary reason TypeScript replaces the bash here —
 * the bash hand-rolled `Link` header pagination and shipped a raw
 * `curl -X DELETE` with NO backoff, so a single 429 counted as a permanent
 * failure AND consumed a deletion budget slot. Octokit's throttling plugin
 * backs off and retries automatically instead.
 */
export const Octokit = OctokitCore.plugin(paginateRest, retry, throttling);
export type RegistryOctokit = InstanceType<typeof Octokit>;

export interface CreateOctokitOptions {
  /** Max additional retries the throttling plugin performs on a rate limit before giving up. Default 3. */
  maxRateLimitRetries?: number;
}

export function createOctokit(auth: string, options: CreateOctokitOptions = {}): RegistryOctokit {
  const maxRetries = options.maxRateLimitRetries ?? 3;
  return new Octokit({
    auth,
    throttle: {
      onRateLimit: (_retryAfter, requestOptions, octokit, retryCount) => {
        octokit.log.warn(
          `rate limit hit for ${String(requestOptions.method)} ${String(requestOptions.url)}`,
        );
        return retryCount < maxRetries;
      },
      onSecondaryRateLimit: (_retryAfter, requestOptions, octokit, retryCount) => {
        octokit.log.warn(
          `secondary rate limit hit for ${String(requestOptions.method)} ${String(requestOptions.url)}`,
        );
        return retryCount < maxRetries;
      },
    },
  });
}

export type PackageType = "container";

export interface RawPackageVersion {
  id: number;
  name: string;
  created_at: string;
  metadata?: { container?: { tags?: string[] } };
}

export interface PackageVersion {
  id: number;
  digest: string;
  createdAt: string;
  tags: string[];
}

/** Maps a raw GitHub Packages API version object to our internal shape. Pure, no I/O. */
export function toPackageVersion(raw: RawPackageVersion): PackageVersion {
  return {
    id: raw.id,
    digest: raw.name,
    createdAt: raw.created_at,
    tags: raw.metadata?.container?.tags ?? [],
  };
}

/** The subset of Octokit this module depends on for listing — narrowed so it can be faked in tests. */
export interface Paginatable {
  paginate<T = unknown>(route: string, params?: Record<string, unknown>): Promise<T[]>;
}

/**
 * Lists every version of a container package, following pagination via
 * Octokit's `paginate` plugin.
 *
 * CAUTION: the GitHub Packages API is a secondary index that goes stale. Do
 * not treat the result of this call as authoritative for read-after-write —
 * e.g. immediately after deleting versions, a subsequent list may still
 * briefly show them, or a subsequent list of a freshly-pushed package may
 * not yet show a new version.
 */
export async function listPackageVersions(
  octokit: Paginatable,
  org: string,
  name: PackageName,
): Promise<PackageVersion[]> {
  const raws = await octokit.paginate<RawPackageVersion>(
    "GET /orgs/{org}/packages/{package_type}/{package_name}/versions",
    { org, package_type: "container" satisfies PackageType, package_name: name, per_page: 100 },
  );
  return raws.map(toPackageVersion);
}

/** The subset of Octokit this module depends on for deleting — narrowed so it can be faked in tests. */
export interface Requestable {
  request(route: string, params?: Record<string, unknown>): Promise<{ status: number }>;
}

interface RequestErrorLike {
  status: number;
}

function isRequestErrorLike(err: unknown): err is RequestErrorLike {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  );
}

export type DeletePackageVersionResult = "deleted" | "already-gone" | "last-version-conflict";

function classifyDeleteVersionStatus(status: number): DeletePackageVersionResult {
  if (status === 204) {
    return "deleted";
  }
  if (status === 404) {
    return "already-gone";
  }
  if (status === 400) {
    return "last-version-conflict";
  }
  throw new Error(`unexpected status ${status} deleting package version`);
}

/**
 * Deletes a single package version.
 *
 * KNOWN GITHUB BEHAVIOUR (observed 2026-09-10 against pyck-ai/baseimages;
 * NOT documented by GitHub — their docs list only 204/401/403/404 for this
 * endpoint and actually claim the opposite): deleting the LAST remaining
 * version of a package via this endpoint returns HTTP 400. Deleting the
 * package itself (see {@link deletePackage}) succeeds with 204 even while
 * versions remain.
 *
 * Consequently this function surfaces a 400 as `"last-version-conflict"`
 * instead of throwing a generic error. Callers must NOT retry the version
 * delete in a loop expecting it to eventually succeed — that loop never
 * terminates. Decide the whole package should go and call
 * {@link deletePackage} once instead.
 */
export async function deletePackageVersion(
  octokit: Requestable,
  org: string,
  name: PackageName,
  versionId: number,
): Promise<DeletePackageVersionResult> {
  try {
    const res = await octokit.request(
      "DELETE /orgs/{org}/packages/{package_type}/{package_name}/versions/{package_version_id}",
      {
        org,
        package_type: "container" satisfies PackageType,
        package_name: name,
        package_version_id: versionId,
      },
    );
    return classifyDeleteVersionStatus(res.status);
  } catch (err) {
    if (isRequestErrorLike(err)) {
      return classifyDeleteVersionStatus(err.status);
    }
    throw err;
  }
}

export type DeletePackageResult = "deleted" | "already-gone";

function classifyDeletePackageStatus(status: number): DeletePackageResult {
  if (status === 204) {
    return "deleted";
  }
  if (status === 404) {
    return "already-gone";
  }
  throw new Error(`unexpected status ${status} deleting package`);
}

/**
 * Deletes an entire package (and all of its versions) in one call. Treats
 * both 204 and 404 as success: a package that is already gone is an
 * acceptable outcome for a retirement workflow, not an error.
 *
 * Do NOT retire a package by deleting its versions one at a time down to
 * zero and then calling this: `deletePackageVersion` cannot remove the last
 * version (see its doc comment), so "zero versions" is unreachable and that
 * loop never terminates. Decide the package should go, then issue this one
 * call.
 */
export async function deletePackage(
  octokit: Requestable,
  org: string,
  name: PackageName,
): Promise<DeletePackageResult> {
  try {
    const res = await octokit.request("DELETE /orgs/{org}/packages/{package_type}/{package_name}", {
      org,
      package_type: "container" satisfies PackageType,
      package_name: name,
    });
    return classifyDeletePackageStatus(res.status);
  } catch (err) {
    if (isRequestErrorLike(err)) {
      return classifyDeletePackageStatus(err.status);
    }
    throw err;
  }
}
