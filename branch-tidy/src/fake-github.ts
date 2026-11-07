/**
 * The branch routes of the fake GitHub API the unit tests use: REST branch,
 * repository, pull request and git ref endpoints plus the one GraphQL query
 * the action sends. Recording, routing, paging and fault injection come from
 * `tidy-core`'s fake.
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

export function createFakeGithub(options: FakeOptions): {
  fetch: typeof fetch;
  requests: RecordedRequest[];
} {
  const size = options.pageSize ?? 100;
  const repoId = options.repoId ?? 1;
  const base = `/repos/${OWNER_REPO}`;

  const graphql = onPath("POST", "/graphql", ({ body }) => {
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
  });

  const repo = onPath("GET", base, () =>
    json(200, { id: repoId, default_branch: options.defaultBranch ?? "main" }),
  );

  const branches = onPath("GET", `${base}/branches`, ({ url }) =>
    jsonPage(
      options.branches.map((b) => ({
        name: b.name,
        commit: { sha: b.sha },
        ...(b.protected !== undefined ? { protected: b.protected } : {}),
      })),
      url,
      size,
    ),
  );

  const pulls = onPath("GET", `${base}/pulls`, ({ url }) =>
    jsonPage(
      (options.pulls ?? []).map((p) => ({
        head: { ref: p.head, repo: p.headRepoId === null ? null : { id: p.headRepoId } },
        base: { ref: p.base },
      })),
      url,
      size,
    ),
  );

  const getRef = onPrefix("GET", `${base}/git/ref/heads/`, (rest) => {
    const name = decodeURIComponent(rest);
    const listed = options.branches.find((b) => b.name === name);
    const overridden = options.currentSha !== undefined && name in options.currentSha;
    const current = overridden ? (options.currentSha?.[name] ?? null) : (listed?.sha ?? null);
    if (current === null) return json(404, { message: "Not Found" });
    return json(200, { ref: `refs/heads/${name}`, object: { sha: current, type: "commit" } });
  });

  const deleteRef = onPrefix("DELETE", `${base}/git/refs/heads/`, (rest) => {
    const name = decodeURIComponent(rest);
    const status = options.deleteStatus?.[name] ?? 204;
    return status === 204
      ? new Response(null, { status })
      : json(status, { message: `delete answered ${String(status)}` });
  });

  const handlers: FakeHandler[] = [graphql, repo, branches, pulls, getRef, deleteRef];
  return createFakeApi({
    handlers,
    ...(options.fail !== undefined ? { fail: options.fail } : {}),
  });
}

/** Full-hex SHA for tests: `sha("a")` is forty `a`. */
export function sha(char: string): string {
  return char.repeat(40);
}
