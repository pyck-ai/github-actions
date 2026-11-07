import { appendFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  API,
  OWNER_REPO,
  createFakeGithub,
  type FakeOptions,
  type FakeRun,
} from "./fake-github.js";
import { actionDefaults as actionDefaultsOf, octokitOn } from "../../tidy-core/src/fake-github.js";
import { main } from "./main.js";

const NOW = new Date("2026-11-07T12:00:00Z");
// retain-days 10: the cutoff is 2026-10-28T12:00:00Z.
const CUTOFF = "2026-10-28T12:00:00Z";
const CUTOFF_ISO = "2026-10-28T12:00:00.000Z";
const BEFORE = "2026-10-28T11:59:59Z";
const AFTER = "2026-10-28T12:00:01Z";
const OLD = "2020-01-01T00:00:00Z";

function run(
  id: number,
  createdAt: string | null | undefined,
  extra: Partial<FakeRun> = {},
): FakeRun {
  return { id, workflowId: 1, name: "ci", path: ".github/workflows/ci.yml", createdAt, ...extra };
}

/** The `inputs.*.default` values of run-tidy's `action.yml`. */
const actionDefaults = (): Record<string, string> =>
  actionDefaultsOf(path.join(__dirname, "..", "action.yml"));

/** The inputs most tests set on top of the action's defaults: delete for real, keep nothing. */
const LIVE: Record<string, string> = {
  token: "t0ken",
  "retain-days": "10",
  "keep-per-workflow": "0",
  "dry-run": "false",
};

interface RunResult {
  code: number;
  log: string[];
  requests: ReturnType<typeof createFakeGithub>["requests"];
  summary: string;
}

interface TidyOptions {
  /** The inputs set on top of the action's defaults; default {@link LIVE}. Leave one out to get its default. */
  base?: Record<string, string>;
  /** Replaces or removes (with `undefined`) environment variables. */
  env?: Record<string, string | undefined>;
}

/**
 * Runs the action as the runner would: the `action.yml` defaults, then the
 * `base` inputs, then `inputs` (an `undefined` value removes the input).
 */
async function tidy(
  api: FakeOptions,
  inputs: Record<string, string | undefined> = {},
  { base = LIVE, env: extraEnv = {} }: TidyOptions = {},
): Promise<RunResult> {
  const fake = createFakeGithub(api);
  const dir = mkdtempSync(path.join(tmpdir(), "run-tidy-"));
  const summaryFile = path.join(dir, "summary.md");
  appendFileSync(summaryFile, "");
  const log: string[] = [];
  const env: Record<string, string | undefined> = {
    ...actionDefaults(),
    GITHUB_REPOSITORY: OWNER_REPO,
    GITHUB_API_URL: API,
    GITHUB_STEP_SUMMARY: summaryFile,
    ...extraEnv,
  };
  for (const [name, value] of Object.entries({ ...base, ...inputs })) {
    env[`INPUT_${name.toUpperCase()}`] = value;
  }
  const code = await main({
    env,
    octokit: octokitOn(fake.fetch),
    now: NOW,
    log: (l) => log.push(l),
  });
  return { code, log, requests: fake.requests, summary: readFileSync(summaryFile, "utf8") };
}

const deleted = (r: RunResult): number[] =>
  r.requests
    .filter((q) => q.method === "DELETE")
    .map((q) => Number(q.path.split("/actions/runs/")[1]));

describe("cutoff (spec 12.1)", () => {
  it("deletes a run one second before the cutoff and keeps one at it or after it", async () => {
    const r = await tidy({
      runs: [run(1, BEFORE), run(2, CUTOFF, { workflowId: 2 }), run(3, AFTER, { workflowId: 3 })],
    });
    expect(r.code).toBe(0);
    expect(deleted(r)).toEqual([1]);
  });
});

describe("runs that are not finished (spec 12.2)", () => {
  it("never deletes queued, in_progress or waiting runs, also without a workflow file", async () => {
    const r = await tidy({
      runs: [
        run(1, OLD, { status: "queued" }),
        run(2, OLD, { status: "in_progress" }),
        run(3, OLD, { status: "waiting" }),
        run(4, OLD, { workflowId: 99, name: null, path: undefined, status: "in_progress" }),
        run(5, OLD, { workflowId: 99, name: null, path: undefined, status: "queued" }),
      ],
    });
    expect(r.code).toBe(0);
    expect(deleted(r)).toEqual([]);
    expect(r.summary).toContain("| Total | 5 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 |");
  });

  it("does not count an unfinished run toward the per-workflow minimum", async () => {
    const r = await tidy(
      { runs: [run(1, OLD), run(2, "2020-02-01T00:00:00Z", { status: "in_progress" })] },
      { "keep-per-workflow": "1" },
    );
    expect(deleted(r)).toEqual([]);
  });
});

describe("per-workflow minimum (spec 12.3)", () => {
  const runs = [
    run(1, "2020-01-01T00:00:00Z", { conclusion: "success" }),
    run(2, "2020-01-02T00:00:00Z", { conclusion: "failure" }),
    run(3, "2020-01-03T00:00:00Z", { conclusion: "cancelled" }),
    run(4, "2020-01-04T00:00:00Z", { conclusion: "success" }),
  ];

  it("keeps the newest N completed runs whatever their conclusion", async () => {
    const r = await tidy({ runs }, { "keep-per-workflow": "2" });
    expect(deleted(r)).toEqual([1, 2]);
  });

  it("keeps none with 0", async () => {
    const r = await tidy({ runs }, { "keep-per-workflow": "0" });
    expect(deleted(r)).toEqual([1, 2, 3, 4]);
  });

  it("keeps the newest run of a workflow that only has old runs", async () => {
    const r = await tidy({ runs }, { "keep-per-workflow": "1" });
    expect(deleted(r)).toEqual([1, 2, 3]);
  });

  it("keeps no old run of a workflow that ran recently", async () => {
    const r = await tidy({ runs: [run(1, OLD), run(2, AFTER)] }, { "keep-per-workflow": "1" });
    expect(deleted(r)).toEqual([1]);
  });

  it("counts per workflow_id", async () => {
    const r = await tidy(
      { runs: [run(1, OLD), run(2, OLD, { workflowId: 2, name: "other" })] },
      { "keep-per-workflow": "1" },
    );
    expect(deleted(r)).toEqual([]);
  });

  it("keeps the newest completed run with the action.yml default of 1", async () => {
    const r = await tidy(
      { runs: [run(1, OLD), run(2, "2020-01-02T00:00:00Z")] },
      {},
      { base: { token: "t0ken", "retain-days": "10", "dry-run": "false" } },
    );
    expect(r.code).toBe(0);
    expect(deleted(r)).toEqual([1]);
  });
});

describe("workflow without a workflow file (spec 12.4)", () => {
  it("is grouped by workflow_id, keeps its newest completed run and is reported by path or id", async () => {
    const gone = { workflowId: 7, name: null, path: undefined };
    const r = await tidy(
      {
        runs: [
          run(1, OLD, gone),
          run(2, "2020-01-02T00:00:00Z", gone),
          run(3, OLD, { workflowId: 8, name: null, path: ".github/workflows/x.yml" }),
        ],
      },
      { "keep-per-workflow": "1" },
    );
    expect(deleted(r)).toEqual([1]);
    expect(r.summary).toContain("| workflow 7 |");
    expect(r.summary).toContain("| .github/workflows/x.yml |");
  });
});

describe("order and budget (spec 12.5)", () => {
  const runs = [
    run(3, "2020-03-01T00:00:00Z"),
    run(1, "2020-01-01T00:00:00Z"),
    run(2, "2020-02-01T00:00:00Z"),
  ];

  it("deletes oldest first", async () => {
    const r = await tidy({ runs });
    expect(deleted(r)).toEqual([1, 2, 3]);
  });

  it("stops after max-deletions, logs how many old runs are left and succeeds", async () => {
    const r = await tidy({ runs }, { "max-deletions": "2" });
    expect(r.code).toBe(0);
    expect(deleted(r)).toEqual([1, 2]);
    expect(r.log.some((l) => l.startsWith("::notice::") && l.includes("1 old run(s) left"))).toBe(
      true,
    );
    expect(r.summary).toContain("Old runs left over");
  });

  it("logs the run before each deletion", async () => {
    const r = await tidy({
      runs: [
        run(5, OLD, {
          runNumber: 12,
          conclusion: "failure",
          event: "push",
          headBranch: "dev",
          headSha: "b".repeat(40),
        }),
      ],
    });
    const line = r.log.find((l) => l.startsWith("Deleting run"));
    expect(line).toContain('"ci"');
    expect(line).toContain("run 5");
    expect(line).toContain("run number 12");
    expect(line).toContain(`created ${OLD}`);
    expect(line).toContain("conclusion failure");
    expect(line).toContain("event push");
    expect(line).toContain("branch dev");
    expect(line).toContain(`sha ${"b".repeat(40)}`);
  });
});

describe("dry run (spec 12.6)", () => {
  it("makes no write request and reports would delete", async () => {
    const r = await tidy({ runs: [run(1, OLD), run(2, OLD)] }, { "dry-run": "true" });
    expect(r.code).toBe(0);
    expect(r.requests.every((q) => q.method === "GET")).toBe(true);
    expect(r.requests.some((q) => q.path.includes("graphql"))).toBe(false);
    expect(r.log.filter((l) => l.startsWith("Would delete run"))).toHaveLength(2);
    expect(r.summary).toContain("Would delete");
  });

  it("is the action.yml default", async () => {
    const r = await tidy(
      { runs: [run(1, OLD)] },
      {},
      { base: { token: "t0ken", "retain-days": "10", "keep-per-workflow": "0" } },
    );
    expect(r.code).toBe(0);
    expect(r.requests.every((q) => q.method === "GET")).toBe(true);
  });
});

describe("pagination (spec 12.7)", () => {
  it("follows every page", async () => {
    const runs = Array.from({ length: 7 }, (_, i) =>
      run(i + 1, `2020-01-0${String(i + 1)}T00:00:00Z`),
    );
    const r = await tidy({ runs, pageSize: 3 });
    expect(r.code).toBe(0);
    expect(deleted(r)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.requests.filter((q) => q.method === "GET")).toHaveLength(3);
  });
});

describe("delete errors (spec 12.8)", () => {
  const runs = [
    run(1, "2020-01-01T00:00:00Z"),
    run(2, "2020-01-02T00:00:00Z"),
    run(3, "2020-01-03T00:00:00Z"),
  ];

  it("treats 404 as a notice, not a failure", async () => {
    const r = await tidy({ runs, deleteStatus: { 2: 404 } });
    expect(r.code).toBe(0);
    expect(deleted(r)).toEqual([1, 2, 3]);
    expect(
      r.log.some((l) => l.startsWith("::notice::") && l.includes("Run 2 is already gone")),
    ).toBe(true);
    expect(r.summary).toContain("| Total | 3 | 3 | 0 | 0 | 2 | 1 | 0 | 0 | 0 |");
  });

  it.each([422, 500])("continues after %i and fails at the end naming the run", async (status) => {
    const r = await tidy({ runs, deleteStatus: { 1: status } });
    expect(r.code).toBe(1);
    expect(deleted(r)).toEqual([1, 2, 3]);
    const errors = r.log.filter((l) => l.startsWith("::error::"));
    expect(errors.some((l) => l.includes("run 1") && l.includes(`HTTP ${String(status)}`))).toBe(
      true,
    );
    expect(errors.some((l) => l.includes("Failed to delete 1 run(s): 1"))).toBe(true);
  });

  it("stops the loop on 401 and counts the runs not attempted", async () => {
    const r = await tidy({ runs, deleteStatus: { 1: 401 } });
    expect(r.code).toBe(1);
    expect(deleted(r)).toEqual([1]);
    expect(
      r.log.some((l) => l.startsWith("::error::") && l.includes("Not attempted: 2 run(s)")),
    ).toBe(true);
  });
});

describe("listing failures (spec 12.9)", () => {
  const runs = [run(1, OLD), run(2, "2020-01-02T00:00:00Z"), run(3, "2020-01-03T00:00:00Z")];

  it.each([1, 2, 3])("deletes nothing when page %i fails", async (page) => {
    const r = await tidy({
      runs,
      pageSize: 1,
      fail: (q) =>
        (q.method === "GET" && q.path.includes(`page=${String(page)}`)) ||
        (page === 1 && !q.path.includes("page="))
          ? 500
          : undefined,
    });
    expect(r.code).toBe(1);
    expect(deleted(r)).toEqual([]);
    expect(r.log.some((l) => l.includes("Nothing was deleted"))).toBe(true);
  });

  it("deletes nothing on a malformed later page", async () => {
    const r = await tidy({ runs, pageSize: 1, rawPage: { 2: { workflow_runs: "nope" } } });
    expect(r.code).toBe(1);
    expect(deleted(r)).toEqual([]);
  });

  it("deletes nothing on a 200 that is not a run list", async () => {
    const r = await tidy({ runs, rawPage: { 1: [] } });
    expect(r.code).toBe(1);
    expect(deleted(r)).toEqual([]);
  });

  it("deletes nothing on a network failure", async () => {
    const r = await tidy({ runs, fail: () => new Error("socket hang up") });
    expect(r.code).toBe(1);
    expect(deleted(r)).toEqual([]);
  });
});

describe("unreadable created_at (spec 12.10)", () => {
  it("keeps a run with a missing or unparsable created_at, with a warning", async () => {
    const r = await tidy({
      runs: [run(1, undefined), run(2, null), run(3, "not a date"), run(4, OLD)],
    });
    expect(r.code).toBe(0);
    expect(deleted(r)).toEqual([4]);
    const warnings = r.log.filter((l) => l.startsWith("::warning::"));
    expect(warnings).toHaveLength(3);
    expect(warnings.some((l) => l.includes("run 2"))).toBe(true);
  });
});

describe("invalid inputs (spec 12.11)", () => {
  it.each([
    ["retain-days", "0"],
    ["retain-days", "abc"],
    ["retain-days", "1.5"],
    ["retain-days", ""],
    ["retain-days", "36501"],
    ["keep-per-workflow", "-1"],
    ["keep-per-workflow", "x"],
    ["keep-per-workflow", "1001"],
    ["max-deletions", "0"],
    ["max-deletions", "many"],
    ["max-deletions", "100001"],
    ["dry-run", "yes"],
    ["dry-run", "False"],
    ["token", ""],
  ])("fails %s=%j before any API call, naming the input", async (name, value) => {
    const r = await tidy({ runs: [run(1, OLD)] }, { [name]: value });
    expect(r.code).toBe(1);
    expect(r.requests).toEqual([]);
    const error = r.log.find((l) => l.startsWith("::error::")) ?? "";
    expect(error).toContain(name);
    if (value !== "") expect(error).toContain(value);
  });

  it.each([
    ["retain-days", "36500"],
    ["keep-per-workflow", "1000"],
    ["max-deletions", "100000"],
  ])("accepts %s=%s, the largest allowed value", async (name, value) => {
    const r = await tidy({ runs: [run(1, OLD)] }, { [name]: value });
    expect(r.code).toBe(0);
  });

  it.each(["token", "retain-days", "keep-per-workflow", "max-deletions", "dry-run"])(
    "fails with no %s at all, before any API call",
    async (name) => {
      const r = await tidy({ runs: [run(1, OLD)] }, { [name]: undefined });
      expect(r.code).toBe(1);
      expect(r.requests).toEqual([]);
      const error = r.log.find((l) => l.startsWith("::error::")) ?? "";
      expect(error).toContain(
        name === "token" ? "token is required" : `${name} is required, got no value`,
      );
    },
  );

  it("fails on a bad GITHUB_REPOSITORY before any API call", async () => {
    const r = await tidy({ runs: [] }, {}, { env: { GITHUB_REPOSITORY: "nope" } });
    expect(r.code).toBe(1);
    expect(r.requests).toEqual([]);
  });
});

describe("count line (spec 12.12)", () => {
  it("is logged even when nothing is deleted", async () => {
    const r = await tidy({ runs: [] });
    expect(r.code).toBe(0);
    expect(r.log.filter((l) => l.startsWith("run-tidy: "))).toEqual([
      `run-tidy: live, cutoff ${CUTOFF_ISO}: 0 runs seen, 0 old, 0 kept by the per-workflow minimum, 0 not finished, 0 without a date, deleted 0, 0 already gone, 0 failed, 0 not attempted.`,
    ]);
  });

  it("is logged once with the counts of a mixed run", async () => {
    const r = await tidy(
      { runs: [run(1, OLD), run(2, AFTER), run(3, OLD, { status: "queued" })] },
      { "dry-run": "true" },
    );
    const lines = r.log.filter((l) => l.startsWith("run-tidy: "));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("3 runs seen, 1 old");
    expect(lines[0]).toContain("1 not finished");
    expect(lines[0]).toContain("would delete 1");
  });
});

describe("listing request (spec 12.13)", () => {
  it("uses per_page=100 and exclude_pull_requests and nothing else", async () => {
    const r = await tidy({ runs: [run(1, OLD)] });
    const gets = r.requests.filter((q) => q.method === "GET");
    expect(gets).toHaveLength(1);
    const url = new URL(gets[0]?.path ?? "", API);
    expect([...url.searchParams.keys()].sort()).toEqual(["exclude_pull_requests", "per_page"]);
    expect(url.searchParams.get("per_page")).toBe("100");
    expect(url.searchParams.get("exclude_pull_requests")).toBe("true");
    expect(r.code).toBe(0);
  });

  it("the fake rejects a filtered list call", async () => {
    const fake = createFakeGithub({ runs: [run(1, OLD)] });
    const res = await fake.fetch(
      `${API}/repos/${OWNER_REPO}/actions/runs?per_page=100&status=completed`,
    );
    expect(res.status).toBe(400);
  });

  it("follows later pages with the same filters only", async () => {
    const r = await tidy({ runs: [run(1, OLD), run(2, OLD), run(3, OLD)], pageSize: 1 });
    for (const q of r.requests.filter((q) => q.method === "GET")) {
      const keys = [...new URL(q.path, API).searchParams.keys()].filter((k) => k !== "page").sort();
      expect(keys).toEqual(["exclude_pull_requests", "per_page"]);
    }
  });
});

describe("rate limits (spec 12.14)", () => {
  const runs = [run(1, "2020-01-01T00:00:00Z"), run(2, "2020-01-02T00:00:00Z")];

  it.each([403, 429])(
    "stops the loop on a persistent %i and carries GitHub's message",
    async (status) => {
      const r = await tidy({
        runs,
        deleteStatus: { 1: status },
        deleteHeaders: {
          [status]: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1", "retry-after": "0" },
        },
      });
      expect(r.code).toBe(1);
      expect(deleted(r)).toEqual([1]);
      const error =
        r.log.find((l) => l.startsWith("::error::") && l.includes("Not attempted")) ?? "";
      expect(error).toContain(`delete answered ${String(status)}`);
      expect(error).toContain("Not attempted: 1 run(s)");
    },
  );
});

describe("report", () => {
  it("shows mode, cutoff, per workflow rows and a total", async () => {
    const r = await tidy({
      runs: [run(1, OLD), run(2, OLD, { workflowId: 2, name: "deploy" })],
    });
    expect(r.summary).toContain("## run-tidy");
    expect(r.summary).toContain("- Mode: live");
    expect(r.summary).toContain(`- Cutoff: ${CUTOFF_ISO}`);
    expect(r.summary).toContain("| ci | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |");
    expect(r.summary).toContain("| deploy | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |");
    expect(r.summary).toContain("| Total | 2 | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |");
  });
});
