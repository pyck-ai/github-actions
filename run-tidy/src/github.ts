import { statusOf, type RegistryOctokit, type Repository } from "../../tidy-core/src/index.js";

/** What the listing reports about one workflow run; every field but `id` may be absent. */
export interface RunInfo {
  id: number;
  workflowId: number | undefined;
  /** The workflow's name, falling back to its path; `undefined` when the run carries neither. */
  workflowName: string | undefined;
  runNumber: number | undefined;
  status: string | undefined;
  conclusion: string | undefined;
  /** `undefined` when `created_at` is missing or does not parse. */
  createdAt: Date | undefined;
  /** The raw `created_at`, for the log. */
  createdAtRaw: string | undefined;
  event: string | undefined;
  headBranch: string | undefined;
  headSha: string | undefined;
}

/** The part of an Octokit response the paging loop reads. */
interface PageResponse {
  data: unknown;
  headers: { link?: string | undefined };
}

const RUNS_ROUTE = "GET /repos/{owner}/{repo}/actions/runs";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function int(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

function toRunInfo(raw: unknown): RunInfo {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("the run listing holds an entry that is not an object");
  }
  const run = raw as Record<string, unknown>;
  const id = int(run["id"]);
  if (id === undefined) throw new Error("the run listing holds a run without a numeric id");
  const createdAtRaw = str(run["created_at"]);
  const createdAt = createdAtRaw === undefined ? undefined : new Date(createdAtRaw);
  return {
    id,
    workflowId: int(run["workflow_id"]),
    workflowName: str(run["name"]) ?? str(run["path"]),
    runNumber: int(run["run_number"]),
    status: str(run["status"]),
    conclusion: str(run["conclusion"]),
    createdAt:
      createdAt !== undefined && !Number.isNaN(createdAt.getTime()) ? createdAt : undefined,
    createdAtRaw,
    event: str(run["event"]),
    headBranch: str(run["head_branch"]),
    headSha: str(run["head_sha"]),
  };
}

function nextLink(link: string | undefined): string | undefined {
  if (link === undefined) return undefined;
  for (const part of link.split(",")) {
    const match = /<([^>]*)>\s*;\s*rel="?next"?/.exec(part);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

/**
 * Every workflow run of the repository, following `Link` pagination to the
 * end. The only query parameters are `per_page` and `exclude_pull_requests`:
 * GitHub caps a search that uses any other filter at 1,000 results, and the
 * per-workflow minimum needs every run. Any failure, or a page that is not a
 * run list, throws: the caller must not delete on a partial picture. A run
 * listed twice (the listing shifted between pages) is returned once.
 */
export async function listRuns(
  octokit: RegistryOctokit,
  repository: Repository,
): Promise<RunInfo[]> {
  const runs = new Map<number, RunInfo>();
  const seenPages = new Set<string>();
  let page = 1;
  let response: PageResponse = await octokit.request(RUNS_ROUTE, {
    ...repository,
    per_page: 100,
    exclude_pull_requests: true,
  });
  for (;;) {
    const body = response.data;
    const list =
      typeof body === "object" && body !== null
        ? (body as { workflow_runs?: unknown }).workflow_runs
        : undefined;
    if (!Array.isArray(list)) {
      throw new Error(`page ${String(page)} of the run listing is not a list of workflow runs`);
    }
    for (const raw of list) {
      const run = toRunInfo(raw);
      if (!runs.has(run.id)) runs.set(run.id, run);
    }
    const next = nextLink(response.headers.link);
    if (next === undefined) return [...runs.values()];
    if (seenPages.has(next)) throw new Error("the run listing's pagination does not end");
    seenPages.add(next);
    page++;
    response = await octokit.request({ method: "GET", url: next });
  }
}

/** Deletes one run. Returns `false` when GitHub answers 404 (already gone); any other failure throws. */
export async function deleteRun(
  octokit: RegistryOctokit,
  repository: Repository,
  runId: number,
): Promise<boolean> {
  try {
    await octokit.request("DELETE /repos/{owner}/{repo}/actions/runs/{run_id}", {
      ...repository,
      run_id: runId,
    });
    return true;
  } catch (err) {
    if (statusOf(err) === 404) return false;
    throw err;
  }
}
