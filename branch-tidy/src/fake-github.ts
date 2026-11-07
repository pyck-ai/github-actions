/**
 * A fake GitHub API at the `fetch` level for the unit tests: REST branch,
 * repository, pull request and git ref endpoints plus the one GraphQL query
 * the action sends. It records every request so tests can assert on writes.
 */

export interface FakeBranch {
  name: string;
  sha: string;
  /** ISO date of the head commit; `null` makes GraphQL answer without a date. */
  date: string | null;
  /** Omitted: the listing carries no `protected` field. */
  protected?: boolean;
  /** Raw GraphQL `committedDate` sent instead of `date` (e.g. `null` or garbage). */
  rawCommittedDate?: unknown;
  /** GraphQL `__typename` of the target; default `Commit`. */
  typename?: string;
}

export interface FakePull {
  head: string;
  /** Repository id of the head; `null` is a deleted fork. */
  headRepoId: number | null;
  base: string;
}

export interface RecordedRequest {
  method: string;
  /** Path with the query string. */
  path: string;
  body: string;
}

export interface FakeOptions {
  repoId?: number;
  defaultBranch?: string;
  branches: FakeBranch[];
  pulls?: FakePull[];
  /** Items per page for the REST lists and GraphQL; default 100. */
  pageSize?: number;
  /** Answer a request with this status instead of the normal one; return undefined to pass. */
  fail?: (req: RecordedRequest) => number | undefined;
  /** SHA the pre-delete GET reports for a branch; default the listed SHA. `null` answers 404. */
  currentSha?: Record<string, string | null>;
  /** Status DELETE answers per branch; default 204. */
  deleteStatus?: Record<string, number>;
  /** Answer GraphQL with HTTP 200 and an `errors` entry. */
  graphqlErrors?: boolean;
}

export const API = "https://api.github.test";
export const OWNER_REPO = "pyck-ai/demo";

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function pageOf<T>(items: T[], url: URL, size: number, headers: Record<string, string>): T[] {
  const page = Number(url.searchParams.get("page") ?? "1");
  if (page * size < items.length) {
    const next = new URL(url);
    next.searchParams.set("page", String(page + 1));
    headers["link"] = `<${next.toString()}>; rel="next"`;
  }
  return items.slice((page - 1) * size, page * size);
}

export function createFakeGithub(options: FakeOptions): {
  fetch: typeof fetch;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const size = options.pageSize ?? 100;
  const repoId = options.repoId ?? 1;
  const base = `/repos/${OWNER_REPO}`;

  const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request?.url ?? String(input));
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : "";
    const recorded: RecordedRequest = { method, path: url.pathname + url.search, body };
    requests.push(recorded);
    return Promise.resolve(answer(recorded, url, method, body));
  };

  function answer(recorded: RecordedRequest, url: URL, method: string, body: string): Response {
    const forced = options.fail?.(recorded);
    if (forced !== undefined) return json(forced, { message: `forced ${String(forced)}` });
    const path = url.pathname;
    const headers: Record<string, string> = {};

    if (method === "POST" && path === "/graphql") {
      if (options.graphqlErrors) {
        return json(200, { data: null, errors: [{ type: "FORBIDDEN", message: "graphql boom" }] });
      }
      const cursor = (JSON.parse(body) as { variables?: { cursor?: string | null } }).variables
        ?.cursor;
      const start = cursor ? Number(cursor) : 0;
      const slice = options.branches.slice(start, start + size);
      const end = start + slice.length;
      return json(200, {
        data: {
          repository: {
            refs: {
              nodes: slice.map((b) => ({
                name: b.name,
                target: {
                  __typename: b.typename ?? "Commit",
                  oid: b.sha,
                  ...("rawCommittedDate" in b
                    ? { committedDate: b.rawCommittedDate }
                    : b.date !== null && (b.typename ?? "Commit") === "Commit"
                      ? { committedDate: b.date }
                      : {}),
                },
              })),
              pageInfo: {
                hasNextPage: end < options.branches.length,
                endCursor: String(end),
              },
            },
          },
        },
      });
    }
    if (method === "GET" && path === base) {
      return json(200, { id: repoId, default_branch: options.defaultBranch ?? "main" });
    }
    if (method === "GET" && path === `${base}/branches`) {
      const items = options.branches.map((b) => ({
        name: b.name,
        commit: { sha: b.sha },
        ...(b.protected !== undefined ? { protected: b.protected } : {}),
      }));
      return json(200, pageOf(items, url, size, headers), headers);
    }
    if (method === "GET" && path === `${base}/pulls`) {
      const items = (options.pulls ?? []).map((p) => ({
        head: { ref: p.head, repo: p.headRepoId === null ? null : { id: p.headRepoId } },
        base: { ref: p.base },
      }));
      return json(200, pageOf(items, url, size, headers), headers);
    }
    const refPrefix = `${base}/git/ref/heads/`;
    if (method === "GET" && path.startsWith(refPrefix)) {
      const name = decodeURIComponent(path.slice(refPrefix.length));
      const listed = options.branches.find((b) => b.name === name);
      const overridden = options.currentSha !== undefined && name in options.currentSha;
      const current = overridden ? (options.currentSha?.[name] ?? null) : (listed?.sha ?? null);
      if (current === null) return json(404, { message: "Not Found" });
      return json(200, { ref: `refs/heads/${name}`, object: { sha: current, type: "commit" } });
    }
    const deletePrefix = `${base}/git/refs/heads/`;
    if (method === "DELETE" && path.startsWith(deletePrefix)) {
      const name = decodeURIComponent(path.slice(deletePrefix.length));
      const status = options.deleteStatus?.[name] ?? 204;
      return status === 204
        ? new Response(null, { status })
        : json(status, { message: `delete answered ${String(status)}` });
    }
    return json(404, { message: `fake has no route for ${method} ${path}` });
  }

  return { fetch: fakeFetch as typeof fetch, requests };
}

/** Full-hex SHA for tests: `sha("a")` is forty `a`. */
export function sha(char: string): string {
  return char.repeat(40);
}
