import { requestWithRetry, type RequestWithRetryOptions } from "./http.js";
import { classifyStatus } from "./status.js";

export const OCI_INDEX = "application/vnd.oci.image.index.v1+json";
export const OCI_MANIFEST = "application/vnd.oci.image.manifest.v1+json";
export const DOCKER_MANIFEST_LIST = "application/vnd.docker.distribution.manifest.list.v2+json";
export const DOCKER_MANIFEST_V2 = "application/vnd.docker.distribution.manifest.v2+json";

/** Accept header sent when resolving a manifest: every media type the registry core understands. */
export const MANIFEST_ACCEPT_HEADER = [
  OCI_INDEX,
  OCI_MANIFEST,
  DOCKER_MANIFEST_LIST,
  DOCKER_MANIFEST_V2,
].join(", ");

const INDEX_MEDIA_TYPES: ReadonlySet<string> = new Set([OCI_INDEX, DOCKER_MANIFEST_LIST]);

/** The annotation GHCR sets on a buildx provenance/attestation child of a multi-arch index. */
const ATTESTATION_ANNOTATION_KEY = "vnd.docker.reference.type";
const ATTESTATION_ANNOTATION_VALUE = "attestation-manifest";

export interface ManifestPlatform {
  os?: string;
  architecture?: string;
  variant?: string;
}

export interface ManifestChild {
  digest: string;
  mediaType?: string;
  size?: number;
  platform?: ManifestPlatform;
  annotations?: Record<string, string>;
}

/**
 * Whether a child is GHCR's buildx provenance/attestation manifest rather
 * than a platform image. Verified against the live registry (2026-09):
 * these are ordinary index children carrying
 * `annotations["vnd.docker.reference.type"] === "attestation-manifest"` —
 * NOT something returned by the `/v2/<img>/referrers/<digest>` endpoint,
 * which returns 0 results for these. Do not build referrers-API logic to
 * find them; they are already covered by index-children traversal.
 */
export function isAttestationChild(child: ManifestChild): boolean {
  return child.annotations?.[ATTESTATION_ANNOTATION_KEY] === ATTESTATION_ANNOTATION_VALUE;
}

interface RawManifestChild {
  digest: string;
  mediaType?: string;
  size?: number;
  platform?: ManifestPlatform;
  annotations?: Record<string, string>;
}

interface RawManifestDocument {
  mediaType?: string;
  manifests?: RawManifestChild[];
}

export interface ParsedManifest {
  mediaType: string;
  children: ManifestChild[];
}

/**
 * Parses a manifest response body into its media type and (for an index)
 * its direct children. Pure, no I/O — this is the media-type dispatch and
 * child-extraction logic, kept separate from the network call so it can be
 * unit tested against fixture bodies without mocking `fetch`.
 *
 * A flat manifest (OCI manifest, Docker v2 manifest) has no children: the
 * caller sees `children: []`, matching a package like `buildcache` whose
 * tagged versions are plain manifests with zero fan-out.
 */
export function parseManifestBody(bodyText: string, headerMediaType?: string): ParsedManifest {
  let parsed: RawManifestDocument;
  try {
    parsed = JSON.parse(bodyText) as RawManifestDocument;
  } catch {
    return { mediaType: headerMediaType ?? "unknown", children: [] };
  }

  const mediaType = parsed.mediaType ?? headerMediaType ?? "unknown";
  if (!INDEX_MEDIA_TYPES.has(mediaType) || !Array.isArray(parsed.manifests)) {
    return { mediaType, children: [] };
  }

  const children: ManifestChild[] = parsed.manifests.map((m) => ({
    digest: m.digest,
    ...(m.mediaType !== undefined && { mediaType: m.mediaType }),
    ...(m.size !== undefined && { size: m.size }),
    ...(m.platform !== undefined && { platform: m.platform }),
    ...(m.annotations !== undefined && { annotations: m.annotations }),
  }));

  return { mediaType, children };
}

export type ManifestResolution =
  | {
      status: "success";
      httpStatus: number;
      digest: string;
      mediaType: string;
      children: ManifestChild[];
    }
  | { status: "not-found"; httpStatus: 404 }
  | { status: "transient-error"; httpStatus: number }
  | { status: "client-error"; httpStatus: number }
  | { status: "network-error" };

export type ResolveManifestOptions = RequestWithRetryOptions;

/**
 * Resolves a manifest by digest or tag against `https://ghcr.io/v2/<registryPath>/manifests/<reference>`.
 *
 * The observed HTTP status is always recorded on the result (via `httpStatus`
 * on every branch except `network-error`), so callers can distinguish a 404
 * (genuinely dead child — safe to treat as unreachable) from a 429/5xx that
 * survived retries (transient — must NOT be treated as dead; the bash
 * predecessor that dropped this distinction could not explain why a
 * descendant failed to resolve).
 */
export async function resolveManifest(
  registryPath: string,
  token: string,
  reference: string,
  options: ResolveManifestOptions = {},
): Promise<ManifestResolution> {
  const url = `https://ghcr.io/v2/${registryPath}/manifests/${reference}`;
  const outcome = await requestWithRetry(
    url,
    { headers: { Authorization: `Bearer ${token}`, Accept: MANIFEST_ACCEPT_HEADER } },
    options,
  );

  if (outcome.kind === "network-error") {
    return { status: "network-error" };
  }

  const cls = classifyStatus(outcome.status);
  if (cls === "not-found") {
    return { status: "not-found", httpStatus: 404 };
  }
  if (cls === "transient") {
    return { status: "transient-error", httpStatus: outcome.status };
  }
  if (cls === "client-error") {
    return { status: "client-error", httpStatus: outcome.status };
  }

  const digestHeader = outcome.headers.get("docker-content-digest") ?? reference;
  const { mediaType, children } = parseManifestBody(
    outcome.bodyText,
    outcome.headers.get("content-type") ?? undefined,
  );
  return {
    status: "success",
    httpStatus: outcome.status,
    digest: digestHeader,
    mediaType,
    children,
  };
}
