import { appendFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  API,
  OWNER_REPO,
  createFakeGithub,
  sha,
  type FakeBranch,
  type FakeOptions,
} from "./fake-github.js";
import { actionDefaults as actionDefaultsOf, octokitOn } from "../../tidy-core/src/fake-github.js";
import { main } from "./main.js";

const NOW = new Date("2026-11-07T12:00:00Z");
// retain-days 10: the cutoff is 2026-10-28T12:00:00Z.
const CUTOFF = "2026-10-28T12:00:00Z";
const BEFORE = "2026-10-28T11:59:59Z";
const AFTER = "2026-10-28T12:00:01Z";

function branch(name: string, date: string, extra: Partial<FakeBranch> = {}): FakeBranch {
  return { name, sha: sha(name.charAt(0) || "x"), date, protected: false, ...extra };
}

/** The `inputs.*.default` values of branch-tidy's `action.yml`. */
const actionDefaults = (): Record<string, string> =>
  actionDefaultsOf(path.join(__dirname, "..", "action.yml"));

interface RunResult {
  code: number;
  log: string[];
  requests: ReturnType<typeof createFakeGithub>["requests"];
  summary: string;
}

async function run(
  api: FakeOptions,
  inputs: Record<string, string> = {},
  extraEnv: Record<string, string> = {},
): Promise<RunResult> {
  const fake = createFakeGithub(api);
  const dir = mkdtempSync(path.join(tmpdir(), "branch-tidy-"));
  const summaryFile = path.join(dir, "summary.md");
  appendFileSync(summaryFile, "");
  const log: string[] = [];
  const env: Record<string, string> = {
    ...actionDefaults(),
    INPUT_TOKEN: "t0ken",
    "INPUT_RETAIN-DAYS": "10",
    "INPUT_DRY-RUN": "false",
    GITHUB_REPOSITORY: OWNER_REPO,
    GITHUB_API_URL: API,
    GITHUB_STEP_SUMMARY: summaryFile,
    ...extraEnv,
  };
  for (const [name, value] of Object.entries(inputs)) env[`INPUT_${name.toUpperCase()}`] = value;
  const code = await main({
    env,
    octokit: octokitOn(fake.fetch),
    now: NOW,
    log: (l) => log.push(l),
  });
  return { code, log, requests: fake.requests, summary: readFileSync(summaryFile, "utf8") };
}

const deleted = (r: RunResult): string[] =>
  r.requests
    .filter((q) => q.method === "DELETE")
    .map((q) => decodeURIComponent(q.path.split("/git/refs/heads/")[1] ?? ""));

describe("cutoff", () => {
  it("deletes a branch one second before the cutoff and keeps one at it or after it", async () => {
    const r = await run({
      branches: [
        branch("old", BEFORE),
        branch("exact", CUTOFF),
        branch("newer", AFTER),
        branch("main", "2020-01-01T00:00:00Z"),
      ],
    });
    expect(r.code).toBe(0);
    expect(deleted(r)).toEqual(["old"]);
  });
});

describe("keep-branches", () => {
  const old = "2020-01-01T00:00:00Z";
  const all = [branch("main", old), branch("master", old), branch("dev", old), branch("x", old)];

  it("keeps main and master by default", async () => {
    const r = await run({ branches: all, defaultBranch: "trunk" });
    expect(deleted(r)).toEqual(["dev", "x"]);
  });

  it("a custom list replaces the default; whitespace and empty entries are ignored", async () => {
    const r = await run(
      { branches: all, defaultBranch: "trunk" },
      { "keep-branches": " dev ,, x ," },
    );
    expect(deleted(r)).toEqual(["main", "master"]);
  });

  it("matches exactly and case sensitively", async () => {
    const r = await run(
      { branches: [branch("Dev", old), branch("dev", old)], defaultBranch: "trunk" },
      { "keep-branches": "dev" },
    );
    expect(deleted(r)).toEqual(["Dev"]);
  });
});

describe("default branch", () => {
  it("is kept although keep-branches does not list it", async () => {
    const old = "2020-01-01T00:00:00Z";
    const r = await run(
      { branches: [branch("trunk", old), branch("other", old)], defaultBranch: "trunk" },
      { "keep-branches": "something-else" },
    );
    expect(deleted(r)).toEqual(["other"]);
    expect(r.summary).toContain("| kept, default branch | 1 |");
  });
});

describe("protection", () => {
  const old = "2020-01-01T00:00:00Z";
  it("keeps a protected stale branch", async () => {
    const r = await run({ branches: [branch("rel", old, { protected: true })] });
    expect(deleted(r)).toEqual([]);
    expect(r.code).toBe(0);
  });

  it("keeps a branch whose listing carries no protection status", async () => {
    const r = await run({
      branches: [{ name: "unknown", sha: sha("u"), date: old }, branch("plain", old)],
    });
    expect(deleted(r)).toEqual(["plain"]);
    expect(r.summary).toContain("| kept, protection status unknown | 1 |");
  });
});

describe("open pull requests", () => {
  const old = "2020-01-01T00:00:00Z";
  const branches = [branch("head-b", old), branch("base-b", old), branch("free", old)];
  const pulls = [
    { head: "head-b", headRepoId: 7, base: "base-b" },
    { head: "free", headRepoId: 99, base: "main" },
  ];

  it("keeps a head branch in this repository and a base branch; a fork head does not protect", async () => {
    const r = await run({ branches, pulls, repoId: 7 });
    expect(deleted(r)).toEqual(["free"]);
  });

  it("a fork pull request with the same head name does not protect the branch", async () => {
    const r = await run({
      branches: [branch("feat", old)],
      pulls: [{ head: "feat", headRepoId: 99, base: "main" }],
      repoId: 7,
    });
    expect(deleted(r)).toEqual(["feat"]);
  });

  it("a pull request whose head repository is null protects nothing through its head", async () => {
    const r = await run({
      branches: [branch("feat", old)],
      pulls: [{ head: "feat", headRepoId: null, base: "main" }],
      repoId: 7,
    });
    expect(deleted(r)).toEqual(["feat"]);
  });

  it("with exclude-open-pr-branches false none of these apply and pull requests are not read", async () => {
    const r = await run({ branches, pulls, repoId: 7 }, { "exclude-open-pr-branches": "false" });
    expect(deleted(r)).toEqual(["base-b", "free", "head-b"]);
    expect(r.requests.some((q) => q.path.includes("/pulls"))).toBe(false);
  });
});

describe("dry run", () => {
  it("lists and judges but makes no write request", async () => {
    const r = await run(
      {
        branches: [branch("old", "2020-01-01T00:00:00Z"), branch("main", "2020-01-01T00:00:00Z")],
      },
      { "dry-run": "true" },
    );
    expect(r.code).toBe(0);
    expect(r.requests.filter((q) => q.method !== "GET" && q.path !== "/graphql")).toEqual([]);
    expect(r.requests.filter((q) => q.method === "POST" && /mutation/.test(q.body))).toEqual([]);
    expect(r.log.some((l) => l.includes("Would delete branch old"))).toBe(true);
    expect(r.summary).toContain("dry run");
    expect(r.summary).toContain("git push origin " + sha("o") + ":refs/heads/old");
  });

  it("is the default when dry-run is not set", async () => {
    const fake = createFakeGithub({ branches: [branch("old", "2020-01-01T00:00:00Z")] });
    const code = await main({
      env: {
        ...actionDefaults(),
        INPUT_TOKEN: "t",
        "INPUT_RETAIN-DAYS": "1",
        GITHUB_REPOSITORY: OWNER_REPO,
        GITHUB_API_URL: API,
      },
      octokit: octokitOn(fake.fetch),
      now: NOW,
      log: () => undefined,
    });
    expect(code).toBe(0);
    expect(fake.requests.some((q) => q.method === "DELETE")).toBe(false);
  });
});

describe("encoding", () => {
  it("deletes a name with slashes at a path ending /git/refs/heads/feature/a/b", async () => {
    const r = await run({ branches: [branch("feature/a/b", "2020-01-01T00:00:00Z")] });
    const del = r.requests.find((q) => q.method === "DELETE");
    expect(del?.path).toBe(`/repos/${OWNER_REPO}/git/refs/heads/feature/a/b`);
    const get = r.requests.find((q) => q.path.includes("/git/ref/heads/"));
    expect(get?.path.endsWith("/git/ref/heads/feature/a/b")).toBe(true);
  });

  it("percent-encodes each segment on its own", async () => {
    const r = await run({ branches: [branch("fix/a b#1", "2020-01-01T00:00:00Z")] });
    const del = r.requests.find((q) => q.method === "DELETE");
    expect(del?.path.endsWith("/git/refs/heads/fix/a%20b%231")).toBe(true);
    expect(deleted(r)).toEqual(["fix/a b#1"]);
  });
});

describe("pagination", () => {
  it("reads branches, commit dates and pull requests over several pages", async () => {
    const names = Array.from({ length: 7 }, (_, i) => `b${String(i)}`);
    const r = await run({
      branches: names.map((n) => branch(n, "2020-01-01T00:00:00Z")),
      pulls: [
        { head: "b6", headRepoId: 1, base: "x" },
        { head: "b5", headRepoId: 1, base: "x" },
        { head: "b4", headRepoId: 1, base: "x" },
      ],
      pageSize: 3,
    });
    expect(deleted(r)).toEqual(["b0", "b1", "b2", "b3"]);
    expect(r.requests.filter((q) => q.path === "/graphql")).toHaveLength(3);
    expect(
      r.requests.filter((q) => q.path.startsWith(`/repos/${OWNER_REPO}/branches`)),
    ).toHaveLength(3);
    expect(r.requests.filter((q) => q.path.startsWith(`/repos/${OWNER_REPO}/pulls`))).toHaveLength(
      1,
    );
  });

  it("follows pull request pages to the end", async () => {
    const r = await run({
      branches: [branch("late", "2020-01-01T00:00:00Z")],
      pulls: [
        { head: "a", headRepoId: 1, base: "x" },
        { head: "b", headRepoId: 1, base: "x" },
        { head: "late", headRepoId: 1, base: "x" },
      ],
      pageSize: 2,
    });
    expect(deleted(r)).toEqual([]);
    expect(r.requests.filter((q) => q.path.startsWith(`/repos/${OWNER_REPO}/pulls`))).toHaveLength(
      2,
    );
  });
});

describe("deletion outcomes", () => {
  const old = "2020-01-01T00:00:00Z";

  it("a 404 from the pre-delete GET does not fail the step", async () => {
    const r = await run({
      branches: [branch("gone", old), branch("here", old)],
      currentSha: { gone: null },
    });
    expect(r.code).toBe(0);
    expect(deleted(r)).toEqual(["here"]);
    expect(r.log.some((l) => l.startsWith("::notice::") && l.includes("already gone"))).toBe(true);
  });

  it("a SHA that changed since listing keeps the branch and does not fail the step", async () => {
    const r = await run({
      branches: [branch("moved", old), branch("still", old)],
      currentSha: { moved: sha("z") },
    });
    expect(r.code).toBe(0);
    expect(deleted(r)).toEqual(["still"]);
    expect(
      r.log.some((l) => l.startsWith("::notice::") && l.includes("changed since listing")),
    ).toBe(true);
  });

  it("logs the head SHA before deleting and does one GET plus one DELETE per branch", async () => {
    const r = await run({ branches: [branch("one", old)] });
    expect(r.log.some((l) => l.includes("Deleting branch one") && l.includes(sha("o")))).toBe(true);
    const refCalls = r.requests.filter((q) => q.path.includes("/git/ref"));
    expect(refCalls.map((q) => q.method)).toEqual(["GET", "DELETE"]);
  });

  it("a 422 from DELETE does not stop the others and fails the step at the end", async () => {
    const r = await run({
      branches: [branch("a", old), branch("b", old), branch("c", old)],
      deleteStatus: { b: 422 },
    });
    expect(r.code).toBe(1);
    expect(deleted(r)).toEqual(["a", "b", "c"]);
    const err = r.log.filter((l) => l.startsWith("::error::"));
    expect(err.some((l) => l.includes("branch b") && l.includes("422"))).toBe(true);
    expect(err.at(-1)).toContain("b");
  });

  it("a 404 from DELETE after a successful GET is a failure", async () => {
    const r = await run({ branches: [branch("a", old)], deleteStatus: { a: 404 } });
    expect(r.code).toBe(1);
  });

  it("a 403 stops the loop, fails the step and lists the skipped branches", async () => {
    const r = await run({
      branches: [branch("a", old), branch("b", old), branch("c", old)],
      deleteStatus: { b: 403 },
    });
    expect(r.code).toBe(1);
    expect(deleted(r)).toEqual(["a", "b"]);
    const last = r.log.filter((l) => l.startsWith("::error::")).at(-1) ?? "";
    expect(last).toContain("Not attempted: c");
    expect(r.summary).toContain("### Skipped");
  });

  it("a 401 on the pre-delete GET also stops the loop", async () => {
    const r = await run({
      branches: [branch("a", old), branch("b", old)],
      fail: (q) => (q.method === "GET" && q.path.includes("/git/ref/heads/a") ? 401 : undefined),
    });
    expect(r.code).toBe(1);
    expect(deleted(r)).toEqual([]);
    expect(r.log.at(-1)).toContain("Not attempted: b");
  });
});

describe("listing failures delete nothing", () => {
  const old = "2020-01-01T00:00:00Z";
  const base = { branches: [branch("a", old)], pulls: [] };

  const cases: [string, FakeOptions][] = [
    [
      "listing branches",
      {
        ...base,
        fail: (q) => (q.path.startsWith(`/repos/${OWNER_REPO}/branches`) ? 500 : undefined),
      },
    ],
    [
      "reading commit dates (HTTP error)",
      { ...base, fail: (q) => (q.path === "/graphql" ? 502 : undefined) },
    ],
    ["reading commit dates (GraphQL errors entry)", { ...base, graphqlErrors: true }],
    [
      "listing pull requests",
      { ...base, fail: (q) => (q.path.includes("/pulls") ? 500 : undefined) },
    ],
    [
      "reading the repository",
      { ...base, fail: (q) => (q.path === `/repos/${OWNER_REPO}` ? 500 : undefined) },
    ],
    ["a 403 on GraphQL", { ...base, fail: (q) => (q.path === "/graphql" ? 403 : undefined) }],
  ];

  it.each(cases)("%s", async (_name, api) => {
    const r = await run(api);
    expect(r.code).toBe(1);
    expect(r.requests.filter((q) => q.method === "DELETE")).toEqual([]);
    expect(r.requests.filter((q) => q.path.includes("/git/ref"))).toEqual([]);
    expect(r.log.some((l) => l.startsWith("::error::"))).toBe(true);
  });
});

describe("a ref that is not a commit", () => {
  it("is kept with a warning naming it", async () => {
    const r = await run({
      branches: [
        branch("tagged", "2020-01-01T00:00:00Z", { typename: "Tag" }),
        branch("nodate", null as unknown as string),
        branch("old", "2020-01-01T00:00:00Z"),
      ],
    });
    expect(r.code).toBe(0);
    expect(deleted(r)).toEqual(["old"]);
    const warnings = r.log.filter((l) => l.startsWith("::warning::"));
    expect(warnings.some((l) => l.includes("tagged"))).toBe(true);
    expect(warnings.some((l) => l.includes("nodate"))).toBe(true);
  });

  it.each([
    ["null", null],
    ["an unparsable string", "not-a-date"],
    ["an empty string", ""],
    ["a number", 0],
  ])("keeps a commit whose committedDate is %s, with a warning naming it", async (_n, raw) => {
    const r = await run({
      branches: [
        branch("baddate", "2020-01-01T00:00:00Z", { rawCommittedDate: raw }),
        branch("old", "2020-01-01T00:00:00Z"),
      ],
    });
    expect(r.code).toBe(0);
    expect(deleted(r)).toEqual(["old"]);
    const warnings = r.log.filter((l) => l.startsWith("::warning::"));
    expect(warnings.some((l) => l.includes("baddate"))).toBe(true);
  });
});

describe("invalid inputs fail before any API call", () => {
  const cases: [string, Record<string, string>, string][] = [
    [
      "retain-days 0",
      { "retain-days": "0" },
      'retain-days must be a whole number from 1 to 36500, got "0"',
    ],
    ["retain-days -1", { "retain-days": "-1" }, 'got "-1"'],
    [
      "retain-days 1.5",
      { "retain-days": "1.5" },
      'retain-days must be a whole number from 1 to 36500, got "1.5"',
    ],
    [
      "retain-days 36501",
      { "retain-days": "36501" },
      'retain-days must be a whole number from 1 to 36500, got "36501"',
    ],
    [
      "retain-days 999999999",
      { "retain-days": "999999999" },
      'retain-days must be a whole number from 1 to 36500, got "999999999"',
    ],
    ["retain-days abc", { "retain-days": "abc" }, 'got "abc"'],
    ["retain-days empty", { "retain-days": "" }, 'got ""'],
    ["dry-run yes", { "dry-run": "yes" }, 'dry-run must be "true" or "false", got "yes"'],
    ["dry-run empty", { "dry-run": "" }, "dry-run"],
    [
      "exclude-open-pr-branches 1",
      { "exclude-open-pr-branches": "1" },
      'exclude-open-pr-branches must be "true" or "false", got "1"',
    ],
  ];

  it.each(cases)("%s", async (_name, inputs, message) => {
    const r = await run({ branches: [branch("old", "2020-01-01T00:00:00Z")] }, inputs);
    expect(r.code).toBe(1);
    expect(r.requests).toEqual([]);
    expect(r.log.join("\n")).toContain(message);
  });

  it("retain-days 36500 is accepted and keeps a fresh branch", async () => {
    const r = await run(
      { branches: [branch("old", "2020-01-01T00:00:00Z")] },
      { "retain-days": "36500" },
    );
    expect(r.code).toBe(0);
    expect(deleted(r)).toEqual([]);
  });

  it.each(["dry-run", "exclude-open-pr-branches", "keep-branches"])(
    "a missing %s fails, naming the input",
    async (name) => {
      const fake = createFakeGithub({ branches: [] });
      const log: string[] = [];
      const env: Record<string, string> = {
        ...actionDefaults(),
        INPUT_TOKEN: "t",
        "INPUT_RETAIN-DAYS": "1",
        GITHUB_REPOSITORY: OWNER_REPO,
      };
      delete env[`INPUT_${name.toUpperCase()}`];
      const code = await main({
        env,
        octokit: octokitOn(fake.fetch),
        log: (l) => log.push(l),
      });
      expect(code).toBe(1);
      expect(fake.requests).toEqual([]);
      expect(log.join("\n")).toContain(`${name} is required, got no value`);
    },
  );

  it("a missing retain-days fails too", async () => {
    const fake = createFakeGithub({ branches: [] });
    const log: string[] = [];
    const code = await main({
      env: { ...actionDefaults(), INPUT_TOKEN: "t", GITHUB_REPOSITORY: OWNER_REPO },
      octokit: octokitOn(fake.fetch),
      log: (l) => log.push(l),
    });
    expect(code).toBe(1);
    expect(fake.requests).toEqual([]);
  });
});

describe("report", () => {
  it("writes counts and a recreate command to the step summary and tolerates no summary file", async () => {
    const old = "2020-01-01T00:00:00Z";
    const r = await run({
      branches: [branch("old", old), branch("main", old), branch("fresh", AFTER)],
    });
    expect(r.summary).toContain("| Branches seen | 3 |");
    expect(r.summary).toContain("| Stale | 2 |");
    expect(r.summary).toContain("| Deleted | 1 |");
    expect(r.summary).toContain(`git push origin ${sha("o")}:refs/heads/old`);

    const noFile = await run({ branches: [] }, {}, { GITHUB_STEP_SUMMARY: "" });
    expect(noFile.code).toBe(0);
  });

  it("logs one count line when nothing is stale, in a dry run and in a live run", async () => {
    const branches = [branch("fresh", AFTER)];
    const countLines = (r: RunResult): string[] =>
      r.log.filter((l) => l.startsWith("branch-tidy: "));
    const live = await run({ branches });
    expect(countLines(live)).toEqual([
      `branch-tidy: live, cutoff ${new Date(CUTOFF).toISOString()}: 1 branches seen, 0 stale, 0 kept, 0 without a date, deleted 0, 0 already gone, 0 changed since listing, 0 failed, 0 not attempted.`,
    ]);
    const dry = await run({ branches }, { "dry-run": "true" });
    expect(countLines(dry)).toEqual([
      `branch-tidy: dry run, cutoff ${new Date(CUTOFF).toISOString()}: 1 branches seen, 0 stale, 0 kept, 0 without a date, would delete 0, 0 already gone, 0 changed since listing, 0 failed, 0 not attempted.`,
    ]);
  });

  it("the count line agrees with the summary of a run that deletes", async () => {
    const old = "2020-01-01T00:00:00Z";
    const r = await run({
      branches: [branch("old", old), branch("main", old), branch("fresh", AFTER)],
    });
    expect(r.log.at(-1)).toBe(
      `branch-tidy: live, cutoff ${new Date(CUTOFF).toISOString()}: 3 branches seen, 2 stale, 1 kept, 0 without a date, deleted 1, 0 already gone, 0 changed since listing, 0 failed, 0 not attempted.`,
    );
    const dry = await run(
      { branches: [branch("old", old), branch("main", old)] },
      { "dry-run": "true" },
    );
    expect(dry.log.at(-1)).toContain("2 stale, 1 kept, 0 without a date, would delete 1,");
  });

  it("logs the count line before the final error after an authorization failure", async () => {
    const old = "2020-01-01T00:00:00Z";
    const r = await run({
      branches: [branch("a", old), branch("b", old), branch("c", old)],
      deleteStatus: { b: 403 },
    });
    const lines = r.log.filter((l) => l.startsWith("branch-tidy: "));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(
      "deleted 1, 0 already gone, 0 changed since listing, 1 failed, 1 not attempted.",
    );
    expect(r.log.indexOf(lines[0] ?? "")).toBeLessThan(r.log.length - 1);
    expect(r.log.at(-1)).toContain("Not attempted: c");
  });

  it("uses https://api.github.com when GITHUB_API_URL is unset", async () => {
    const urls: string[] = [];
    const code = await main({
      env: {
        ...actionDefaults(),
        INPUT_TOKEN: "t",
        "INPUT_RETAIN-DAYS": "1",
        GITHUB_REPOSITORY: OWNER_REPO,
      },
      octokit: octokitOn(((input: string | URL | Request) => {
        urls.push(String(input instanceof Request ? input.url : input));
        return Promise.resolve(new Response("{}", { status: 500 }));
      }) as typeof fetch),
      log: () => undefined,
    });
    expect(code).toBe(1);
    expect(urls[0]?.startsWith("https://api.github.com/")).toBe(true);
  });
});
