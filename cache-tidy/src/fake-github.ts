/**
 * The cache routes of the fake GitHub API the unit tests use: the cache
 * list and delete, repository, branch, pull request and tag endpoints.
 * Recording, routing, paging and fault injection come from `tidy-core`'s
 * fake.
 */
import {
  createFakeApi,
  json,
  jsonPage,
  onPath,
  onPrefix,
  type FakeHandler,
  type RecordedRequest,
} from "../../tidy-core/src/fake-github.js";

export type { RecordedRequest };

export interface FakeCache {
  id: number;
  key: string;
  ref: string;
  size: number;
  lastAccessedAt?: string;
}

export interface FakePullState {
  state: "open" | "closed";
  merged?: boolean;
}

export interface FakeOptions {
  defaultBranch?: string;
  caches: FakeCache[];
  branches?: string[];
  /** Pull requests the open list reports. */
  openPulls?: number[];
  /** What `GET /pulls/{n}` answers; a number is an HTTP status, absent is 404. */
  pulls?: Record<number, FakePullState | number>;
  /** Tag names that exist. */
  tags?: string[];
  /** Items per page for the REST lists; default 100. */
  pageSize?: number;
  /** Answer a request with this status instead of the normal one; return undefined to pass. */
  fail?: (req: RecordedRequest) => number | undefined;
  /** Status DELETE answers per cache id; default 204. */
  deleteStatus?: Record<number, number>;
}

export const API = "https://api.github.test";
export const OWNER_REPO = "pyck-ai/demo";

export function createFakeGithub(options: FakeOptions): {
  fetch: typeof fetch;
  requests: RecordedRequest[];
} {
  const size = options.pageSize ?? 100;
  const base = `/repos/${OWNER_REPO}`;

  const repo = onPath("GET", base, () =>
    json(200, { default_branch: options.defaultBranch ?? "main" }),
  );

  const caches = onPath("GET", `${base}/actions/caches`, ({ url }) => {
    const page = Number(url.searchParams.get("page") ?? "1");
    const all = options.caches.map((c) => ({
      id: c.id,
      key: c.key,
      ref: c.ref,
      size_in_bytes: c.size,
      last_accessed_at: c.lastAccessedAt ?? "2026-11-01T00:00:00Z",
    }));
    const response = jsonPage(all, url, size);
    const link = response.headers.get("link");
    const answer = json(
      200,
      {
        total_count: all.length,
        actions_caches: all.slice((page - 1) * size, page * size),
      },
      link === null ? {} : { link },
    );
    // A real fetch sets Response.url; paginate reads it on the last page of an
    // answer that carries total_count.
    Object.defineProperty(answer, "url", { value: url.toString() });
    return answer;
  });

  const deleteCache = onPrefix("DELETE", `${base}/actions/caches/`, (rest) => {
    const status = options.deleteStatus?.[Number(rest)] ?? 204;
    return status === 204
      ? new Response(null, { status })
      : json(status, { message: `delete answered ${String(status)}` });
  });

  const branches = onPath("GET", `${base}/branches`, ({ url }) =>
    jsonPage(
      (options.branches ?? []).map((name) => ({ name })),
      url,
      size,
    ),
  );

  const pulls = onPath("GET", `${base}/pulls`, ({ url }) =>
    jsonPage(
      (options.openPulls ?? []).map((number) => ({ number, state: "open" })),
      url,
      size,
    ),
  );

  const pull = onPrefix("GET", `${base}/pulls/`, (rest) => {
    const number = Number(rest);
    const answer = options.pulls?.[number];
    if (answer === undefined) return json(404, { message: "Not Found" });
    if (typeof answer === "number") return json(answer, { message: `answered ${String(answer)}` });
    return json(200, {
      number,
      state: answer.state,
      merged: answer.merged ?? false,
      merged_at: answer.merged === true ? "2026-11-01T00:00:00Z" : null,
    });
  });

  const matchingRefs = onPrefix("GET", `${base}/git/matching-refs/tags/`, (rest) => {
    const prefix = decodeURIComponent(rest);
    return json(
      200,
      (options.tags ?? [])
        .filter((tag) => tag.startsWith(prefix))
        .map((tag) => ({ ref: `refs/tags/${tag}` })),
    );
  });

  const handlers: FakeHandler[] = [repo, caches, deleteCache, branches, pulls, pull, matchingRefs];
  return createFakeApi({
    handlers,
    ...(options.fail !== undefined ? { fail: options.fail } : {}),
  });
}
