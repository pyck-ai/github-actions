import { appendFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { actionDefaults as actionDefaultsOf, octokitOn } from "../../tidy-core/src/fake-github.js";
import {
  API,
  OWNER_REPO,
  createFakeGithub,
  type FakeCache,
  type FakeOptions,
} from "./fake-github.js";
import { main } from "./main.js";

/** The `inputs.*.default` values of cache-tidy's `action.yml`. */
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
  const dir = mkdtempSync(path.join(tmpdir(), "cache-tidy-"));
  const summaryFile = path.join(dir, "summary.md");
  appendFileSync(summaryFile, "");
  const log: string[] = [];
  const env: Record<string, string> = {
    ...actionDefaults(),
    INPUT_TOKEN: "t0ken",
    "INPUT_DRY-RUN": "false",
    GITHUB_REPOSITORY: OWNER_REPO,
    GITHUB_API_URL: API,
    GITHUB_STEP_SUMMARY: summaryFile,
    ...extraEnv,
  };
  for (const [name, value] of Object.entries(inputs)) env[`INPUT_${name.toUpperCase()}`] = value;
  const code = await main({ env, octokit: octokitOn(fake.fetch), log: (l) => log.push(l) });
  return { code, log, requests: fake.requests, summary: readFileSync(summaryFile, "utf8") };
}

let nextId = 100;
function cache(ref: string, size = 1000, extra: Partial<FakeCache> = {}): FakeCache {
  nextId++;
  return { id: nextId, key: `key-${String(nextId)}`, ref, size, ...extra };
}

const deletedIds = (r: RunResult): number[] =>
  r.requests
    .filter((q) => q.method === "DELETE")
    .map((q) => Number(q.path.split("/actions/caches/")[1]));

describe("pull request refs (spec 10.1, 10.2)", () => {
  for (const form of ["merge", "head"]) {
    const ref = `refs/pull/7/${form}`;
    it(`${ref}: kept when open, deleted when closed or merged`, async () => {
      const c = cache(ref);
      const open = await run({ caches: [c], openPulls: [7] });
      expect(open.code).toBe(0);
      expect(deletedIds(open)).toEqual([]);
      // The open list is the answer: no per-pull lookup.
      expect(open.requests.some((q) => q.path.includes("/pulls/7"))).toBe(false);

      const closed = await run({ caches: [c], pulls: { 7: { state: "closed" } } });
      expect(deletedIds(closed)).toEqual([c.id]);
      expect(closed.summary).toContain("| Dead, pull request closed | 1 | 1000 |");

      const merged = await run({ caches: [c], pulls: { 7: { state: "closed", merged: true } } });
      expect(deletedIds(merged)).toEqual([c.id]);
      expect(merged.summary).toContain("| Dead, pull request merged | 1 | 1000 |");
    });
  }

  it("keeps a cache when the pull request answers open despite the list", async () => {
    const c = cache("refs/pull/7/merge");
    const r = await run({ caches: [c], pulls: { 7: { state: "open" } } });
    expect(r.code).toBe(0);
    expect(deletedIds(r)).toEqual([]);
  });

  it("looks each closed pull request up once", async () => {
    const r = await run({
      caches: [cache("refs/pull/7/merge"), cache("refs/pull/7/head")],
      pulls: { 7: { state: "closed" } },
    });
    expect(r.requests.filter((q) => q.path.endsWith("/pulls/7"))).toHaveLength(1);
    expect(deletedIds(r)).toHaveLength(2);
  });
});

describe("pull request lookup failure (spec 10.3)", () => {
  for (const status of [404, 500]) {
    it(`keeps the cache, warns naming 7 and stays green on ${String(status)}`, async () => {
      const c = cache("refs/pull/7/merge");
      const r = await run({ caches: [c], pulls: { 7: status } });
      expect(r.code).toBe(0);
      expect(deletedIds(r)).toEqual([]);
      const warning = r.log.find((l) => l.startsWith("::warning::"));
      expect(warning).toContain("pull request 7");
    });
  }
});

describe("branch refs (spec 10.4, 10.5, 10.8)", () => {
  it("keeps a cache of a listed branch and deletes one of an absent branch", async () => {
    const kept = cache("refs/heads/feature/x");
    const gone = cache("refs/heads/feature/y");
    const r = await run({ caches: [kept, gone], branches: ["feature/x"] });
    expect(r.code).toBe(0);
    expect(deletedIds(r)).toEqual([gone.id]);
  });

  it("handles merge-queue branches", async () => {
    const ref = "refs/heads/gh-readonly-queue/main/pr-12-abc123";
    const c = cache(ref);
    expect(deletedIds(await run({ caches: [c], branches: [] }))).toEqual([c.id]);
    expect(
      deletedIds(await run({ caches: [c], branches: ["gh-readonly-queue/main/pr-12-abc123"] })),
    ).toEqual([]);
  });

  it("takes the default branch from the repository, and always keeps its caches", async () => {
    const trunk = cache("refs/heads/trunk");
    const main_ = cache("refs/heads/main");
    // Neither is in the branch list: trunk is kept as default, main is dead.
    const r = await run({ defaultBranch: "trunk", caches: [trunk, main_], branches: [] });
    expect(r.requests.some((q) => q.path === `/repos/${OWNER_REPO}`)).toBe(true);
    expect(deletedIds(r)).toEqual([main_.id]);
    expect(r.summary).toContain("| Kept, default branch | 1 | 1000 |");
  });
});

describe("tag refs (spec 10.6, 10.7)", () => {
  for (const ref of ["refs/heads/refs/tags/v1", "refs/tags/v1"]) {
    it(`${ref}: kept when the tag exists`, async () => {
      const c = cache(ref);
      const r = await run({ caches: [c], tags: ["v1"] });
      expect(deletedIds(r)).toEqual([]);
    });

    it(`${ref}: kept when a branch v1 exists`, async () => {
      const c = cache(ref);
      const r = await run({ caches: [c], branches: ["v1"] });
      expect(deletedIds(r)).toEqual([]);
    });

    it(`${ref}: deleted when neither exists`, async () => {
      const c = cache(ref);
      const r = await run({ caches: [c], tags: ["v10"], branches: ["v2"] });
      expect(deletedIds(r)).toEqual([c.id]);
      expect(r.summary).toContain("| Dead, tag gone | 1 | 1000 |");
    });
  }

  it("keeps refs/heads/refs/tags/v1 when a branch with that literal name exists", async () => {
    const c = cache("refs/heads/refs/tags/v1");
    const r = await run({ caches: [c], branches: ["refs/tags/v1"] });
    expect(deletedIds(r)).toEqual([]);
  });

  it("asks for the tag by prefix match and decides on the exact ref", async () => {
    const c = cache("refs/tags/v1");
    const r = await run({ caches: [c], tags: ["v10"] });
    expect(
      r.requests.some((q) => q.path.startsWith(`/repos/${OWNER_REPO}/git/matching-refs/tags/v1`)),
    ).toBe(true);
    expect(deletedIds(r)).toEqual([c.id]);
  });

  it("keeps an unknown ref form and counts it as unknown", async () => {
    const c = cache("refs/foo/bar", 4321);
    const r = await run({ caches: [c] });
    expect(deletedIds(r)).toEqual([]);
    expect(r.summary).toContain("| Kept, unknown ref form | 1 | 4321 |");
    expect(r.log.join("\n")).toContain("1 unknown");
  });
});

describe("pagination (spec 10.9)", () => {
  it("follows every page of caches, branches and open pull requests", async () => {
    const caches: FakeCache[] = [];
    const branches: string[] = [];
    const openPulls: number[] = [];
    for (let i = 1; i <= 5; i++) {
      branches.push(`b${String(i)}`);
      openPulls.push(i);
      caches.push(cache(`refs/heads/b${String(i)}`), cache(`refs/pull/${String(i)}/merge`));
    }
    const dead = cache("refs/heads/b9");
    caches.push(dead);
    // Page size 2: b5, pull 5 and the dead cache sit past the first pages.
    const r = await run({ caches, branches, openPulls, pageSize: 2 });
    expect(r.code).toBe(0);
    expect(deletedIds(r)).toEqual([dead.id]);
    for (const what of ["actions/caches", "branches", "pulls"]) {
      const pages = r.requests.filter((q) => q.method === "GET" && q.path.includes(`/${what}?`));
      expect(pages.length).toBeGreaterThan(1);
    }
  });
});

describe("listing failures (spec 10.10)", () => {
  const routes: [string, (path: string) => boolean][] = [
    ["the repository", (p) => p === `/repos/${OWNER_REPO}`],
    ["the caches", (p) => p.includes("/actions/caches?")],
    ["the branches", (p) => p.includes("/branches")],
    ["the open pull requests", (p) => p.includes("/pulls?")],
    ["the tags", (p) => p.includes("/matching-refs/")],
  ];
  for (const [name, matches] of routes) {
    it(`fails the step and deletes nothing when ${name} fail`, async () => {
      const r = await run({
        caches: [cache("refs/heads/gone"), cache("refs/tags/v1")],
        fail: (q) => (q.method === "GET" && matches(q.path) ? 500 : undefined),
      });
      expect(r.code).toBe(1);
      expect(deletedIds(r)).toEqual([]);
      expect(r.log.some((l) => l.startsWith("::error::Nothing was deleted"))).toBe(true);
    });
  }

  it("fails when a later page of the caches fails", async () => {
    const r = await run({
      caches: [cache("refs/heads/a"), cache("refs/heads/b"), cache("refs/heads/c")],
      pageSize: 1,
      fail: (q) =>
        q.path.includes("/actions/caches?") && q.path.includes("page=2") ? 500 : undefined,
    });
    expect(r.code).toBe(1);
    expect(deletedIds(r)).toEqual([]);
  });
});

describe("dry run (spec 10.11)", () => {
  it("sends no request but GET and reports the exact delete set", async () => {
    const dead = cache("refs/heads/gone", 5000);
    const live = cache("refs/heads/main", 10);
    const r = await run({ caches: [dead, live], branches: ["main"] }, { "dry-run": "true" });
    expect(r.code).toBe(0);
    expect(r.requests.length).toBeGreaterThan(0);
    expect(r.requests.every((q) => q.method === "GET")).toBe(true);
    expect(r.summary).toContain("dry run");
    expect(r.summary).toContain(`| ${String(dead.id)} | ${dead.key} | refs/heads/gone |`);
    expect(r.summary).not.toContain(live.key);
  });

  it("is a dry run with the defaults of action.yml", async () => {
    const fake = createFakeGithub({ caches: [cache("refs/heads/gone")] });
    const code = await main({
      env: {
        ...actionDefaults(),
        INPUT_TOKEN: "t",
        GITHUB_REPOSITORY: OWNER_REPO,
        GITHUB_API_URL: API,
      },
      octokit: octokitOn(fake.fetch),
      log: () => undefined,
    });
    expect(code).toBe(0);
    expect(fake.requests.every((q) => q.method === "GET")).toBe(true);
  });
});

describe("deleting (spec 10.12)", () => {
  it("deletes the largest first", async () => {
    const small = cache("refs/heads/a", 10);
    const big = cache("refs/heads/b", 9000);
    const mid = cache("refs/heads/c", 500);
    const r = await run({ caches: [small, big, mid] });
    expect(deletedIds(r)).toEqual([big.id, mid.id, small.id]);
  });

  it("treats 404 as already gone: a notice, green", async () => {
    const a = cache("refs/heads/a");
    const r = await run({ caches: [a], deleteStatus: { [a.id]: 404 } });
    expect(r.code).toBe(0);
    expect(r.log.some((l) => l.startsWith("::notice::") && l.includes(String(a.id)))).toBe(true);
    expect(r.summary).toContain("| Already gone | 1 | |");
  });

  it("continues after a 500 and fails at the end naming the ids", async () => {
    const a = cache("refs/heads/a", 300);
    const b = cache("refs/heads/b", 200);
    const c = cache("refs/heads/c", 100);
    const r = await run({ caches: [a, b, c], deleteStatus: { [b.id]: 500 } });
    expect(r.code).toBe(1);
    expect(deletedIds(r)).toEqual([a.id, b.id, c.id]);
    const last = r.log.filter((l) => l.startsWith("::error::")).at(-1) ?? "";
    expect(last).toContain(String(b.id));
    expect(last).not.toContain(String(a.id));
  });

  for (const status of [401, 403]) {
    it(`stops on ${String(status)}, lists the caches not attempted and fails`, async () => {
      const a = cache("refs/heads/a", 300);
      const b = cache("refs/heads/b", 200);
      const c = cache("refs/heads/c", 100);
      const r = await run({ caches: [a, b, c], deleteStatus: { [b.id]: status } });
      expect(r.code).toBe(1);
      expect(deletedIds(r)).toEqual([a.id, b.id]);
      const last = r.log.filter((l) => l.startsWith("::error::")).at(-1) ?? "";
      expect(last).toContain(`Not attempted: ${String(c.id)}`);
      expect(last).toContain("next day's run");
      expect(r.summary).toContain(`- ${String(c.id)}`);
    });
  }
});

describe("inputs (spec 10.13)", () => {
  it("fails an invalid dry-run before any API call, naming the input and the value", async () => {
    const r = await run({ caches: [cache("refs/heads/a")] }, { "dry-run": "yes" });
    expect(r.code).toBe(1);
    expect(r.requests).toEqual([]);
    const error = r.log.find((l) => l.startsWith("::error::")) ?? "";
    expect(error).toContain("dry-run");
    expect(error).toContain('"yes"');
  });

  it("fails a missing dry-run, which has no fallback, before any API call", async () => {
    const fake = createFakeGithub({ caches: [cache("refs/heads/gone")] });
    const log: string[] = [];
    const code = await main({
      env: { INPUT_TOKEN: "t", GITHUB_REPOSITORY: OWNER_REPO, GITHUB_API_URL: API },
      octokit: octokitOn(fake.fetch),
      log: (l) => log.push(l),
    });
    expect(code).toBe(1);
    expect(fake.requests).toEqual([]);
    expect(log).toContain("::error::dry-run is required, got no value");
  });

  it("fails a missing token before any API call", async () => {
    const r = await run({ caches: [] }, { token: "" });
    expect(r.code).toBe(1);
    expect(r.requests).toEqual([]);
  });
});

describe("summary (spec 10.14)", () => {
  it("reports bytes and counts per class that equal the fixture's sums", async () => {
    const r = await run(
      {
        defaultBranch: "main",
        branches: ["main", "feature"],
        openPulls: [3],
        pulls: { 7: { state: "closed" }, 8: { state: "closed", merged: true }, 9: 404 },
        tags: [],
        caches: [
          cache("refs/pull/7/merge", 11),
          cache("refs/pull/7/head", 12),
          cache("refs/pull/8/merge", 13),
          cache("refs/pull/9/merge", 14),
          cache("refs/pull/3/merge", 15),
          cache("refs/heads/gone", 16),
          cache("refs/heads/gone2", 17),
          cache("refs/tags/v1", 18),
          cache("refs/heads/main", 19),
          cache("refs/heads/feature", 20),
          cache("refs/foo/bar", 21),
        ],
      },
      { "dry-run": "true" },
    );
    expect(r.code).toBe(0);
    expect(r.summary).toContain("| Dead, pull request merged | 1 | 13 |");
    expect(r.summary).toContain("| Dead, pull request closed | 2 | 23 |");
    expect(r.summary).toContain("| Dead, branch gone | 2 | 33 |");
    expect(r.summary).toContain("| Dead, tag gone | 1 | 18 |");
    expect(r.summary).toContain("| Kept, default branch | 1 | 19 |");
    expect(r.summary).toContain("| Kept, existing branch or tag | 1 | 20 |");
    expect(r.summary).toContain("| Kept, open pull request | 1 | 15 |");
    expect(r.summary).toContain("| Kept, pull request state unreadable | 1 | 14 |");
    expect(r.summary).toContain("| Kept, unknown ref form | 1 | 21 |");
    expect(r.summary).toContain("| All caches | 11 | 176 |");
    expect(r.summary).toContain("| Would delete | 6 | 87 |");
    expect(r.log.some((l) => l.includes("11 caches (176 bytes), 6 dead (87 bytes)"))).toBe(true);
  });
});

describe("deleting by id (spec 10.15)", () => {
  it("never uses the key-based delete endpoint", async () => {
    const a = cache("refs/heads/a");
    const keyed: FakeCache = { id: 999, key: "npm-abc?ref=x", ref: "refs/heads/b", size: 5 };
    const r = await run({ caches: [a, keyed] });
    const deletes = r.requests.filter((q) => q.method === "DELETE");
    expect(deletes.map((q) => q.path).sort()).toEqual(
      [
        `/repos/${OWNER_REPO}/actions/caches/${String(a.id)}`,
        `/repos/${OWNER_REPO}/actions/caches/999`,
      ].sort(),
    );
    for (const q of deletes) {
      expect(q.path).toMatch(/\/actions\/caches\/\d+$/);
      expect(q.path).not.toContain("key=");
    }
  });
});
