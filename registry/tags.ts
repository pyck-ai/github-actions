import { requestWithRetry, type RequestWithRetryOptions } from "./http.js";
import { classifyStatus } from "./status.js";

interface RawTagsList {
  name?: string;
  tags?: string[];
}

/**
 * Parses the `Link` header GHCR returns on a paginated `tags/list` response
 * and extracts the `rel="next"` URL, or `undefined` on the last page.
 * Mirrors the same relation the bash predecessor followed by hand with
 * `grep`/`sed`; kept as a small pure function so it is unit-testable
 * against real header fixtures without mocking `fetch`.
 */
export function parseNextLink(header: string | null): string | undefined {
  if (!header) {
    return undefined;
  }
  const part = header
    .split(",")
    .map((p) => p.trim())
    .find((p) => /rel="next"/.test(p));
  if (!part) {
    return undefined;
  }
  const match = /<([^>]+)>/.exec(part);
  return match?.[1];
}

export type ListTagsResult =
  | { status: "success"; tags: string[] }
  | { status: "not-found"; httpStatus: 404 }
  | { status: "transient-error"; httpStatus: number }
  | { status: "client-error"; httpStatus: number }
  | { status: "network-error" };

export type ListRegistryTagsOptions = RequestWithRetryOptions;

/**
 * Lists every tag of a package by following `https://ghcr.io/v2/<registryPath>/tags/list`,
 * paginating via the `Link: rel="next"` header GHCR returns once a package
 * has more tags than fit on one page.
 *
 * MUST paginate: `baseimages/python` was observed returning exactly 100 tags
 * at `?n=100` — i.e. truncated — so a single-page read computes ROOTS from a
 * partial view of the registry and silently under-protects (or, worse,
 * under-deletes-then-corrects-later) whatever tags fall past the first page.
 *
 * GHCR's `Link` header is ORIGIN-RELATIVE (verified live 2026-09-11 against
 * `ghcr.io/v2/pyck-ai/baseimages/agent/tags/list`:
 * `link: </v2/pyck-ai/baseimages/agent/tags/list?last=...&n=...>; rel="next"`
 * — no scheme or host), per the OCI distribution spec's own pagination
 * example. `parseNextLink` returns that raw value verbatim, so it MUST be
 * resolved against the previous request's URL before being fetched:
 * passing a bare path straight to `fetch` throws (`TypeError: Failed to
 * parse URL`), which `requestWithRetry` catches and reports as
 * `"network-error"` on every retry — indistinguishable from a real network
 * failure, but 100% reproducible for any package with more than one page
 * of tags (i.e. the moment pagination is actually exercised) and NOT
 * something retrying helps with. This was the exact cause of
 * `baseimages/agent`'s `network-error` in production: it has >100 tags,
 * `rover` (1 tag, no pagination) did not hit it.
 *
 * Classifies the observed status the same way {@link resolveManifest} does,
 * so a caller building ghcr-tidy's LIVE_ROOTS can distinguish a genuine
 * 404 (package has no tags endpoint — unusual, but not the same as "zero
 * tags") from a transient failure that must not be treated as "no tags".
 */
export async function listRegistryTags(
  registryPath: string,
  token: string,
  options: ListRegistryTagsOptions = {},
): Promise<ListTagsResult> {
  const tags: string[] = [];
  let url: string | undefined = `https://ghcr.io/v2/${registryPath}/tags/list?n=100`;

  while (url) {
    const outcome = await requestWithRetry(
      url,
      { headers: { Authorization: `Bearer ${token}` } },
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

    let parsed: RawTagsList;
    try {
      parsed = JSON.parse(outcome.bodyText) as RawTagsList;
    } catch {
      parsed = {};
    }
    tags.push(...(parsed.tags ?? []));
    const next = parseNextLink(outcome.headers.get("link"));
    // Resolve against the URL just fetched: `next` is ORIGIN-RELATIVE in
    // practice (see this function's doc), but `new URL` also accepts an
    // already-absolute `next` unchanged, so this is correct either way.
    url = next !== undefined ? new URL(next, url).toString() : undefined;
  }

  return { status: "success", tags };
}
