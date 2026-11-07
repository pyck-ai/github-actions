/**
 * The workflow-run routes of the fake GitHub API the unit tests use: the
 * paged run listing and the run delete. Recording, routing, paging and fault
 * injection come from `tidy-core`'s fake. The fake is strict: it answers a
 * list call that carries a capping filter with a 400, and any other
 * unexpected parameter likewise, so a test fails when the action starts to
 * filter.
 */
import {
  createFakeApi,
  json,
  onPath,
  onPrefix,
  type FakeHandler,
  type RecordedRequest,
} from "../../tidy-core/src/fake-github.js";

export type { RecordedRequest };

export interface FakeRun {
  id: number;
  /** `undefined` leaves the field out of the answer. */
  workflowId?: number | undefined;
  name?: string | null | undefined;
  path?: string | undefined;
  /** Default `completed`. */
  status?: string;
  conclusion?: string | null;
  /** ISO date; `null` sends `null`, `undefined` omits the field. */
  createdAt?: string | null | undefined;
  runNumber?: number;
  event?: string;
  headBranch?: string;
  headSha?: string;
}

export interface FakeOptions {
  runs: FakeRun[];
  /** Items per page for the run listing; default 100. */
  pageSize?: number;
  /** Answer a request with this status instead of the normal one; return undefined to pass. */
  fail?: (req: RecordedRequest) => number | undefined;
  /** Status DELETE answers per run id; default 204. */
  deleteStatus?: Record<number, number>;
  /** Headers (and body message) for non-204 delete answers, per status. */
  deleteHeaders?: Record<number, Record<string, string>>;
  /** Replaces the body of the list answer for this 1-based page. */
  rawPage?: Record<number, unknown>;
}

export const API = "https://api.github.test";
export const OWNER_REPO = "pyck-ai/demo";

const ALLOWED_QUERY = new Set(["per_page", "exclude_pull_requests", "page"]);

function toJson(run: FakeRun): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: run.id,
    status: run.status ?? "completed",
    conclusion: run.conclusion ?? null,
    run_number: run.runNumber ?? run.id,
    event: run.event ?? "push",
    head_branch: run.headBranch ?? "main",
    head_sha: run.headSha ?? "a".repeat(40),
  };
  if (run.workflowId !== undefined) out["workflow_id"] = run.workflowId;
  if (run.name !== undefined) out["name"] = run.name;
  if (run.path !== undefined) out["path"] = run.path;
  if (run.createdAt !== undefined) out["created_at"] = run.createdAt;
  return out;
}

export function createFakeGithub(options: FakeOptions): {
  fetch: typeof fetch;
  requests: RecordedRequest[];
} {
  const size = options.pageSize ?? 100;
  const base = `/repos/${OWNER_REPO}/actions`;

  const list = onPath("GET", `${base}/runs`, ({ url }) => {
    for (const key of url.searchParams.keys()) {
      if (!ALLOWED_QUERY.has(key)) {
        return json(400, { message: `the fake rejects the list parameter ${key}` });
      }
    }
    if (url.searchParams.get("per_page") !== "100") {
      return json(400, { message: "the fake requires per_page=100" });
    }
    const page = Number(url.searchParams.get("page") ?? "1");
    const headers: Record<string, string> = {};
    if (page * size < options.runs.length) {
      const next = new URL(url);
      next.searchParams.set("page", String(page + 1));
      headers["link"] = `<${next.toString()}>; rel="next"`;
    }
    const raw = options.rawPage?.[page];
    if (raw !== undefined) return json(200, raw, headers);
    return json(
      200,
      {
        total_count: options.runs.length,
        workflow_runs: options.runs.slice((page - 1) * size, page * size).map(toJson),
      },
      headers,
    );
  });

  const remove = onPrefix("DELETE", `${base}/runs/`, (rest) => {
    const id = Number(rest);
    const status = options.deleteStatus?.[id] ?? 204;
    return status === 204
      ? new Response(null, { status })
      : json(
          status,
          { message: `delete answered ${String(status)}` },
          options.deleteHeaders?.[status],
        );
  });

  const handlers: FakeHandler[] = [list, remove];
  return createFakeApi({
    handlers,
    ...(options.fail !== undefined ? { fail: options.fail } : {}),
  });
}
