import { describe, expect, it } from "vitest";
import { packageName } from "../../registry/package-name.js";
import { digest, tag } from "./domain.js";
import type { RegressionIncident } from "./verify.js";
import {
  BREAKER_ISSUE_LABEL,
  BREAKER_ISSUE_TITLE,
  breakerRegressionSink,
  githubIssueBreaker,
  memoryBreaker,
  type IssuesRequestable,
} from "./breaker.js";

const pkg = packageName("golang");

function incident(): RegressionIncident {
  return {
    packageName: pkg,
    tags: [
      {
        tag: tag("latest"),
        digestBefore: digest("sha256:live"),
        digestAfter: undefined,
        stillResolves: false,
        digestUnchanged: false,
        closureResolves: false,
      },
    ],
    precedingDeletions: [{ digest: digest("sha256:v1"), versionId: 1 }],
  };
}

describe("memoryBreaker", () => {
  it("starts untripped and records nothing", async () => {
    const { breaker, trips } = memoryBreaker();
    expect(await breaker.isTripped()).toBeNull();
    expect(trips).toEqual([]);
  });

  it("can be constructed already tripped", async () => {
    const state = { issueNumber: 42, issueUrl: "https://github.com/pyck-ai/x/issues/42" };
    const { breaker } = memoryBreaker(state);
    expect(await breaker.isTripped()).toEqual(state);
  });

  it("trip records the incident and isTripped reports a state afterwards", async () => {
    const { breaker, trips } = memoryBreaker();
    const inc = incident();
    await breaker.trip(inc);
    expect(trips).toEqual([inc]);
    expect(await breaker.isTripped()).not.toBeNull();
  });

  it("has no reset/clear method — nothing in this module can un-trip a breaker", () => {
    const { breaker } = memoryBreaker();
    expect((breaker as unknown as Record<string, unknown>).reset).toBeUndefined();
    expect((breaker as unknown as Record<string, unknown>).clear).toBeUndefined();
    expect(Object.keys(breaker).sort()).toEqual(["isTripped", "trip"]);
  });

  it("once tripped, stays tripped across further trip calls (no auto reset)", async () => {
    const { breaker, trips } = memoryBreaker();
    await breaker.trip(incident());
    const firstState = await breaker.isTripped();
    await breaker.trip(incident());
    const secondState = await breaker.isTripped();
    expect(secondState).toEqual(firstState);
    expect(trips).toHaveLength(2); // both incidents recorded, but the tripped state never changes
  });
});

/** A minimal fake of the GitHub issues surface `githubIssueBreaker` depends on. */
function fakeIssuesRequestable(): {
  octokit: IssuesRequestable;
  calls: { route: string; params: Record<string, unknown> | undefined }[];
} {
  const issues: { number: number; html_url: string; state: "open" | "closed" }[] = [];
  const comments: { issue_number: number; body: string }[] = [];
  const calls: { route: string; params: Record<string, unknown> | undefined }[] = [];
  let nextNumber = 1;

  const octokit: IssuesRequestable = {
    request: (route, params) => {
      calls.push({ route, params });
      if (route === "GET /repos/{owner}/{repo}/issues") {
        return Promise.resolve({ data: issues.filter((i) => i.state === "open") });
      }
      if (route === "POST /repos/{owner}/{repo}/issues") {
        const num = nextNumber++;
        issues.push({
          number: num,
          html_url: `https://github.com/pyck-ai/x/issues/${String(num)}`,
          state: "open",
        });
        return Promise.resolve({ data: { number: num } });
      }
      if (route === "POST /repos/{owner}/{repo}/issues/{issue_number}/comments") {
        comments.push({
          issue_number: params?.issue_number as number,
          body: params?.body as string,
        });
        return Promise.resolve({ data: {} });
      }
      throw new Error(`unexpected route in fake: ${route}`);
    },
  };
  return { octokit, calls };
}

describe("githubIssueBreaker", () => {
  it("isTripped reports null when no breaker issue is open", async () => {
    const { octokit } = fakeIssuesRequestable();
    const breaker = githubIssueBreaker(octokit, "pyck-ai", "x");
    expect(await breaker.isTripped()).toBeNull();
  });

  it("trip opens a labelled issue with the incident's title, and isTripped then reports it", async () => {
    const { octokit, calls } = fakeIssuesRequestable();
    const breaker = githubIssueBreaker(octokit, "pyck-ai", "x");
    await breaker.trip(incident());

    const created = calls.find((c) => c.route === "POST /repos/{owner}/{repo}/issues");
    expect(created?.params?.title).toBe(BREAKER_ISSUE_TITLE);
    expect(created?.params?.labels).toEqual([BREAKER_ISSUE_LABEL]);
    expect(typeof created?.params?.body).toBe("string");

    const state = await breaker.isTripped();
    expect(state).not.toBeNull();
    expect(state?.issueNumber).toBe(1);
  });

  it("trip against an already-tripped breaker comments on the existing issue instead of opening a second one", async () => {
    const { octokit, calls } = fakeIssuesRequestable();
    const breaker = githubIssueBreaker(octokit, "pyck-ai", "x");
    await breaker.trip(incident());
    await breaker.trip(incident());

    const creates = calls.filter((c) => c.route === "POST /repos/{owner}/{repo}/issues");
    const comments = calls.filter(
      (c) => c.route === "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
    );
    expect(creates).toHaveLength(1);
    expect(comments).toHaveLength(1);
  });
});

describe("githubIssueBreaker — mis-scoped token diagnostic", () => {
  /** A fake whose every request 404s, as GitHub does for an issues call made with a token that has no repo/issues access — indistinguishable on the wire from "no such repo". */
  function fake404Requestable(): IssuesRequestable {
    return {
      request: () => {
        const err = Object.assign(new Error("Not Found"), { status: 404 });
        return Promise.reject(err);
      },
    };
  }

  it("trip rejects with a diagnostic naming the token/scope cause, not a bare 404", async () => {
    const breaker = githubIssueBreaker(fake404Requestable(), "pyck-ai", "baseimages");
    await expect(breaker.trip(incident())).rejects.toThrow(
      /token passed to githubIssueBreaker cannot write issues/,
    );
    await expect(breaker.trip(incident())).rejects.toThrow(/pyck-ai\/baseimages/);
  });

  it("isTripped also rejects with the same diagnostic, not a bare 404", async () => {
    const breaker = githubIssueBreaker(fake404Requestable(), "pyck-ai", "baseimages");
    await expect(breaker.isTripped()).rejects.toThrow(
      /token passed to githubIssueBreaker cannot write issues/,
    );
  });

  it("a non-404 failure is rethrown unchanged, with no invented diagnosis", async () => {
    const octokit: IssuesRequestable = {
      request: () =>
        Promise.reject(Object.assign(new Error("service unavailable"), { status: 503 })),
    };
    const breaker = githubIssueBreaker(octokit, "pyck-ai", "baseimages");
    await expect(breaker.trip(incident())).rejects.toThrow("service unavailable");
  });
});

describe("breakerRegressionSink", () => {
  it("records an incident by tripping the breaker", async () => {
    const { breaker, trips } = memoryBreaker();
    const sink = breakerRegressionSink(breaker);
    const inc = incident();
    await sink.record(inc);
    expect(trips).toEqual([inc]);
    expect(await breaker.isTripped()).not.toBeNull();
  });
});
