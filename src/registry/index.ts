export { packageName, type PackageName } from "./package-name.js";

export { classifyStatus, shouldRetryStatus, type StatusClass } from "./status.js";

export { requestWithRetry, type HttpOutcome, type RequestWithRetryOptions } from "./http.js";

export {
  OCI_INDEX,
  OCI_MANIFEST,
  DOCKER_MANIFEST_LIST,
  DOCKER_MANIFEST_V2,
  MANIFEST_ACCEPT_HEADER,
  isAttestationChild,
  parseManifestBody,
  resolveManifest,
  type ManifestPlatform,
  type ManifestChild,
  type ParsedManifest,
  type ManifestResolution,
  type ResolveManifestOptions,
} from "./manifest.js";

export {
  RegistryAuthError,
  createInMemoryTokenCache,
  getRegistryToken,
  type RegistryTokenCache,
  type GetRegistryTokenOptions,
} from "./auth.js";

export {
  Octokit,
  createOctokit,
  toPackageVersion,
  listPackageVersions,
  deletePackageVersion,
  deletePackage,
  type RegistryOctokit,
  type CreateOctokitOptions,
  type PackageType,
  type RawPackageVersion,
  type PackageVersion,
  type Paginatable,
  type Requestable,
  type DeletePackageVersionResult,
  type DeletePackageResult,
} from "./packages.js";
