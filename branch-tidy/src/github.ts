import {
  encodePathSegments,
  statusOf,
  type RegistryOctokit,
  type Repository,
} from "../../tidy-core/src/index.js";

/** What the listing calls report about one branch. */
export interface BranchInfo {
  name: string;
  /** Head SHA as the commit-date read saw it (REST listing SHA when GraphQL gave none). */
  sha: string;
  /** `undefined` when the listing did not report a boolean. */
  protected: boolean | undefined;
  /** `undefined` when the head commit date could not be read. */
  committedDate: Date | undefined;
  /** The branch points at something that is not a commit (a ref to a tag or tree). */
  notACommit: boolean;
}

export interface RepoInfo {
  id: number;
  defaultBranch: string;
}

export interface OpenPullRequest {
  headRef: string;
  /** Id of the repository holding the head branch; `undefined` for a deleted fork. */
  headRepoId: number | undefined;
  baseRef: string;
}

export interface RemoteRef {
  sha: string;
}

interface RestBranch {
  name: string;
  commit?: { sha?: string | null } | null;
  protected?: unknown;
}

interface RestPull {
  head?: { ref?: string; repo?: { id?: number } | null };
  base?: { ref?: string };
}

interface GraphqlRefNode {
  name: string;
  target?: {
    __typename?: string | null;
    oid?: string | null;
    committedDate?: string | null;
  } | null;
}

interface GraphqlRefsResponse {
  repository: {
    refs: {
      nodes: (GraphqlRefNode | null)[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
}

const REFS_QUERY = `query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    refs(refPrefix: "refs/heads/", first: 100, after: $cursor) {
      nodes {
        name
        target {
          __typename
          oid
          ... on Commit { committedDate }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

export async function getRepo(octokit: RegistryOctokit, repository: Repository): Promise<RepoInfo> {
  const { data } = await octokit.request("GET /repos/{owner}/{repo}", repository);
  const repo = data as { id?: unknown; default_branch?: unknown };
  if (typeof repo.id !== "number" || typeof repo.default_branch !== "string") {
    throw new Error("the repository answer has no id or default_branch");
  }
  return { id: repo.id, defaultBranch: repo.default_branch };
}

export async function listOpenPullRequests(
  octokit: RegistryOctokit,
  repository: Repository,
): Promise<OpenPullRequest[]> {
  const pulls = await octokit.paginate<RestPull>("GET /repos/{owner}/{repo}/pulls", {
    ...repository,
    state: "open",
    per_page: 100,
  });
  return pulls.map((pull) => {
    const headRepoId = pull.head?.repo?.id;
    return {
      headRef: pull.head?.ref ?? "",
      headRepoId: typeof headRepoId === "number" ? headRepoId : undefined,
      baseRef: pull.base?.ref ?? "",
    };
  });
}

/**
 * Every branch with its protection flag (REST list) joined by name to its
 * head commit date (GraphQL list). Both are paginated list calls, so the
 * number of calls does not grow with the number of branches. Any failure
 * throws: the caller must not delete on a partial picture.
 */
export async function listBranches(
  octokit: RegistryOctokit,
  repository: Repository,
): Promise<BranchInfo[]> {
  const rest = await octokit.paginate<RestBranch>("GET /repos/{owner}/{repo}/branches", {
    ...repository,
    per_page: 100,
  });
  const heads = await listHeads(octokit, repository);
  return rest.map((branch) => {
    const head = heads.get(branch.name);
    const restSha = branch.commit?.sha;
    return {
      name: branch.name,
      sha: head?.oid ?? (typeof restSha === "string" ? restSha : ""),
      protected: typeof branch.protected === "boolean" ? branch.protected : undefined,
      committedDate: parseDate(head?.committedDate),
      notACommit: head !== undefined && head.typename !== "Commit",
    };
  });
}

interface Head {
  typename: string | undefined;
  oid: string | undefined;
  committedDate: unknown;
}

/** A date only for a non-empty string that parses; null, missing or garbage is `undefined`. */
function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function listHeads(
  octokit: RegistryOctokit,
  repository: Repository,
): Promise<Map<string, Head>> {
  const heads = new Map<string, Head>();
  let cursor: string | null = null;
  for (;;) {
    const data: GraphqlRefsResponse = await octokit.graphql<GraphqlRefsResponse>(REFS_QUERY, {
      owner: repository.owner,
      name: repository.repo,
      cursor,
    });
    const refs = data.repository.refs;
    for (const node of refs.nodes) {
      if (node === null) continue;
      heads.set(node.name, {
        typename: stringOrUndefined(node.target?.__typename),
        oid: stringOrUndefined(node.target?.oid),
        committedDate: node.target?.committedDate,
      });
    }
    if (!refs.pageInfo.hasNextPage) return heads;
    if (refs.pageInfo.endCursor === null) {
      throw new Error("GraphQL reported another page of branches but no cursor");
    }
    cursor = refs.pageInfo.endCursor;
  }
}

/** The SHA the branch points at now, or `undefined` when GitHub answers 404. */
export async function getBranchRef(
  octokit: RegistryOctokit,
  repository: Repository,
  name: string,
): Promise<RemoteRef | undefined> {
  try {
    const { data } = await octokit.request(
      `GET /repos/{owner}/{repo}/git/ref/heads/${encodePathSegments(name)}`,
      repository,
    );
    const sha = (data as { object?: { sha?: unknown } }).object?.sha;
    if (typeof sha !== "string") throw new Error("the ref answer has no object.sha");
    return { sha };
  } catch (err) {
    if (statusOf(err) === 404) return undefined;
    throw err;
  }
}

export async function deleteBranchRef(
  octokit: RegistryOctokit,
  repository: Repository,
  name: string,
): Promise<void> {
  await octokit.request(
    `DELETE /repos/{owner}/{repo}/git/refs/heads/${encodePathSegments(name)}`,
    repository,
  );
}
