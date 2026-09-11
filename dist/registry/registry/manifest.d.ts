import { type RequestWithRetryOptions } from "./http.js";
export declare const OCI_INDEX = "application/vnd.oci.image.index.v1+json";
export declare const OCI_MANIFEST = "application/vnd.oci.image.manifest.v1+json";
export declare const DOCKER_MANIFEST_LIST = "application/vnd.docker.distribution.manifest.list.v2+json";
export declare const DOCKER_MANIFEST_V2 = "application/vnd.docker.distribution.manifest.v2+json";
/** Accept header sent when resolving a manifest: every media type the registry core understands. */
export declare const MANIFEST_ACCEPT_HEADER: string;
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
export declare function isAttestationChild(child: ManifestChild): boolean;
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
export declare function parseManifestBody(bodyText: string, headerMediaType?: string): ParsedManifest;
export type ManifestResolution = {
    status: "success";
    httpStatus: number;
    digest: string;
    mediaType: string;
    children: ManifestChild[];
} | {
    status: "not-found";
    httpStatus: 404;
} | {
    status: "transient-error";
    httpStatus: number;
} | {
    status: "client-error";
    httpStatus: number;
} | {
    status: "network-error";
};
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
export declare function resolveManifest(registryPath: string, token: string, reference: string, options?: ResolveManifestOptions): Promise<ManifestResolution>;
//# sourceMappingURL=manifest.d.ts.map