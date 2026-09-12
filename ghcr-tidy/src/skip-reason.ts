import type { ManifestResolution } from "../../registry/manifest.js";

/**
 * Why a package was skipped (fail-closed) rather than planned.
 *
 * `"not-found"` is a CONFIRMED 404 on a keep-root or one of its
 * descendants: real registry corruption (e.g. a hollow index whose
 * children were already deleted by something else) — genuinely worth
 * surfacing loudly.
 *
 * `"transient"` covers everything else that is not a clean success:
 * 429/5xx exhausted after the registry core's own retries, a client error
 * (e.g. an expired token), or a network-level failure. This is an
 * infrastructure problem, not evidence the digest is gone, and must never
 * be treated the same as `"not-found"` — the reference bash's `resolve`
 * returned a bare failure with no such distinction, which is exactly the
 * ambiguity this type exists to remove.
 */
export type SkipReason = "not-found" | "transient";

/** Maps a non-`"success"` {@link ManifestResolution} to the {@link SkipReason} it represents. */
export function skipReasonFor(resolution: ManifestResolution): SkipReason | undefined {
  switch (resolution.status) {
    case "success":
      return undefined;
    case "not-found":
      return "not-found";
    case "transient-error":
    case "client-error":
    case "network-error":
      return "transient";
  }
}
