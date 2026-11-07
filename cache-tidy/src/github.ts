import {
  encodePathSegments,
  type RegistryOctokit,
  type Repository,
} from "../../tidy-core/src/index.js";

/** One Actions cache as the listing reports it. */
export interface CacheEntry {
  id: number;
  key: string;
  /** `undefined` when the listing carries no string `ref`. */
  ref: string | undefined;
  sizeInBytes: number;
  lastAccessedAt: string;
}

/** What `GET /pulls/{n}` says about a pull request that is not in the open list. */
export type PullState = "open" | "merged" | "closed";

interface RestCache {
  id?: unknown;
  key?: unknown;
  ref?: unknown;
  size_in_bytes?: unknown;
  last_accessed_at?: unknown;
}

/** The default branch name. Throws when the answer has none. */
export async function getDefaultBranch(
  octokit: RegistryOctokit,
  repository: Repository,
): Promise<string> {
  const { data } = await octokit.request("GET /repos/{owner}/{repo}", repository);
  const name = (data as { default_branch?: unknown }).default_branch;
  if (typeof name !== "string" || name === "") {
    throw new Error("the repository answer has no default_branch");
  }
  return name;
}

/**
 * Every cache of the repository, all pages. Octokit's paginate unwraps the
 * answer's object (`total_count`, `actions_caches`) and follows the `Link`
 * header. A cache without a numeric id or size throws: a partial picture
 * must never lead to a deletion.
 */
export async function listCaches(
  octokit: RegistryOctokit,
  repository: Repository,
): Promise<CacheEntry[]> {
  const items = await octokit.paginate<RestCache>("GET /repos/{owner}/{repo}/actions/caches", {
    ...repository,
    per_page: 100,
  });
  const caches = new Map<number, CacheEntry>();
  for (const item of items) {
    if (typeof item.id !== "number" || typeof item.size_in_bytes !== "number") {
      throw new Error("a cache in the list has no numeric id or size_in_bytes");
    }
    caches.set(item.id, {
      id: item.id,
      key: typeof item.key === "string" ? item.key : "",
      ref: typeof item.ref === "string" ? item.ref : undefined,
      sizeInBytes: item.size_in_bytes,
      lastAccessedAt: typeof item.last_accessed_at === "string" ? item.last_accessed_at : "",
    });
  }
  return [...caches.values()];
}

/** The names of all branches (paginated list, no per-name lookups). */
export async function listBranchNames(
  octokit: RegistryOctokit,
  repository: Repository,
): Promise<Set<string>> {
  const branches = await octokit.paginate<{ name?: unknown }>(
    "GET /repos/{owner}/{repo}/branches",
    { ...repository, per_page: 100 },
  );
  const names = new Set<string>();
  for (const branch of branches) {
    if (typeof branch.name !== "string") throw new Error("a branch in the list has no name");
    names.add(branch.name);
  }
  return names;
}

/** The numbers of all open pull requests. */
export async function listOpenPullNumbers(
  octokit: RegistryOctokit,
  repository: Repository,
): Promise<Set<number>> {
  const pulls = await octokit.paginate<{ number?: unknown }>("GET /repos/{owner}/{repo}/pulls", {
    ...repository,
    state: "open",
    per_page: 100,
  });
  const numbers = new Set<number>();
  for (const pull of pulls) {
    if (typeof pull.number !== "number")
      throw new Error("a pull request in the list has no number");
    numbers.add(pull.number);
  }
  return numbers;
}

/**
 * The state of one pull request. Throws on any failure (404 included) and on
 * a state that is neither `open` nor `closed`; the caller keeps the caches.
 */
export async function getPullState(
  octokit: RegistryOctokit,
  repository: Repository,
  number: number,
): Promise<PullState> {
  const { data } = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
    ...repository,
    pull_number: number,
  });
  const pull = data as { state?: unknown; merged?: unknown; merged_at?: unknown };
  if (pull.state === "open") return "open";
  if (pull.state === "closed") {
    return pull.merged === true || typeof pull.merged_at === "string" ? "merged" : "closed";
  }
  throw new Error(`unexpected pull request state ${JSON.stringify(pull.state)}`);
}

/** Whether a tag named exactly `name` exists. Any failure throws. */
export async function tagExists(
  octokit: RegistryOctokit,
  repository: Repository,
  name: string,
): Promise<boolean> {
  // The endpoint matches by prefix: `tags/v1` also answers `refs/tags/v10`.
  const refs = await octokit.paginate<{ ref?: unknown }>(
    `GET /repos/{owner}/{repo}/git/matching-refs/tags/${encodePathSegments(name)
      .replace(/\{/g, "%7B")
      .replace(/\}/g, "%7D")}`,
    { ...repository, per_page: 100 },
  );
  return refs.some((r) => r.ref === `refs/tags/${name}`);
}

/** Deletes one cache by id. Never by key: the key endpoint without `ref` deletes that key on every ref. */
export async function deleteCache(
  octokit: RegistryOctokit,
  repository: Repository,
  id: number,
): Promise<void> {
  await octokit.request("DELETE /repos/{owner}/{repo}/actions/caches/{cache_id}", {
    ...repository,
    cache_id: id,
  });
}
