import { formatIncidentReport, type IncidentReportOptions } from "./incident-report.js";
import type { RegressionIncident, RegressionSink } from "./verify.js";

/**
 * The circuit breaker: the piece whose absence turned a single
 * classification bug into a recurring outage (flutter-rfw's daily prune
 * re-destroyed every rebuild for as long as the bug went unnoticed —
 * see the project's ghcr-tidy incident notes). A regression caught by
 * post-apply verification (`verify.ts`) means the model this run made
 * its deletion decisions from was WRONG. Aborting just that one run only
 * buys until the next scheduled run tries the exact same wrong model
 * again. The breaker turns "wrong once" into "stopped until a human
 * looks at it".
 *
 * Deliberately minimal: two operations, no reset, no expiry, no
 * override. See {@link Breaker}'s own doc for why.
 */

/** What {@link Breaker.isTripped} reports when the breaker is currently tripped — enough for a caller to print a useful, actionable message. */
export interface TrippedState {
  readonly issueNumber: number;
  readonly issueUrl: string;
}

/**
 * `isTripped` must be checked BEFORE any mutation is attempted, by every
 * caller that can mutate — see `apply.ts`'s `applyPlan`. `trip` is
 * called from a `RegressionSink` (see {@link breakerRegressionSink}) the
 * moment post-apply verification detects a regression.
 *
 * There is intentionally NO `reset`/`clear` method on this interface,
 * no time-based expiry anywhere in this module, and no flag any caller
 * can pass to bypass `isTripped`. Clearing the breaker requires a human
 * to close the backing GitHub issue — see {@link githubIssueBreaker}.
 * If a future change needs an escape hatch here, that is a decision for
 * a human to make explicitly outside this module, not a parameter to
 * add to it.
 */
export interface Breaker {
  isTripped(): Promise<TrippedState | null>;
  trip(incident: RegressionIncident): Promise<void>;
}

/**
 * An in-memory {@link Breaker} for tests. `trips` is a live reference
 * recording every incident passed to `trip`, in order, regardless of
 * whether the breaker was already tripped. Once tripped (either via the
 * `initial` argument or a prior `trip` call), `isTripped` keeps
 * reporting the SAME tripped state forever — nothing in this function
 * ever clears it, matching the real breaker's no-reset contract.
 */
export function memoryBreaker(initial: TrippedState | null = null): {
  breaker: Breaker;
  trips: readonly RegressionIncident[];
} {
  let tripped = initial;
  const trips: RegressionIncident[] = [];
  const breaker: Breaker = {
    isTripped: () => Promise.resolve(tripped),
    trip: (incident) => {
      trips.push(incident);
      tripped ??= { issueNumber: 1, issueUrl: "https://github.com/example/example/issues/1" };
      return Promise.resolve();
    },
  };
  return { breaker, trips };
}

/** Fixed, well-known title for the breaker issue — `isTripped`/`trip` locate it by this exact title (scoped further by {@link BREAKER_ISSUE_LABEL}), never by searching free text. */
export const BREAKER_ISSUE_TITLE =
  "ghcr-tidy: deletion breaker tripped (post-apply verification found a regression)";

/** Label applied to the breaker issue so it can be located by an exact, indexed field rather than a title-text search (GitHub's issue search is eventually consistent; label filtering on the list endpoint is not). */
export const BREAKER_ISSUE_LABEL = "ghcr-tidy-breaker";

interface RawIssue {
  readonly number: number;
  readonly html_url: string;
}

function isRawIssueArray(data: unknown): data is RawIssue[] {
  return (
    Array.isArray(data) &&
    data.every(
      (d) =>
        typeof d === "object" &&
        d !== null &&
        typeof (d as { number?: unknown }).number === "number" &&
        typeof (d as { html_url?: unknown }).html_url === "string",
    )
  );
}

/** The subset of Octokit this module depends on — narrowed so it can be faked in tests, matching the style of `Requestable`/`Paginatable` in `registry/packages.ts`. */
export interface IssuesRequestable {
  request(route: string, params?: Record<string, unknown>): Promise<{ data: unknown }>;
}

/** The HTTP status an Octokit `RequestError` carries — narrowed so a mis-scoped-token 404 can be told apart from any other failure without depending on `@octokit/request-error` directly. */
function requestErrorStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | undefined)?.status;
  return typeof status === "number" ? status : undefined;
}

/**
 * Wraps one `octokit.request` call so a bare 404 — GitHub's response to
 * an issues call made with a token that has no `repo`/`issues` scope,
 * indistinguishable on the wire from "no such repo" — is rethrown with
 * the cause named. This is the fix for the incident that motivated it: a
 * PAT scoped `read:packages, delete:packages, read:org` (correct for
 * deleting GHCR versions, wrong for managing issues) produced exactly
 * this 404 with no indication anywhere that the token, not the repo, was
 * the problem — see this module's `githubIssueBreaker` doc for the token
 * this function expects to be handed instead.
 */
async function requestOrExplain(
  octokit: IssuesRequestable,
  owner: string,
  repo: string,
  route: string,
  params: Record<string, unknown>,
): Promise<{ data: unknown }> {
  try {
    return await octokit.request(route, params);
  } catch (error) {
    if (requestErrorStatus(error) === 404) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `ghcr-tidy breaker: GitHub returned 404 managing the breaker issue in ${owner}/${repo} ` +
          `(${route}). This almost always means the token passed to githubIssueBreaker cannot ` +
          `write issues — e.g. a delete:packages-scoped PAT used to delete GHCR versions has no ` +
          `repo/issues access. Configure a SEPARATE token with issue write access for the ` +
          `breaker (a plain GITHUB_TOKEN with \`issues: write\` permissions is enough). ` +
          `Original error: ${message}`,
      );
    }
    throw error;
  }
}

/**
 * The real, GitHub-issue-backed {@link Breaker}.
 *
 * `isTripped` and `trip` both locate the breaker issue by listing OPEN
 * issues labelled {@link BREAKER_ISSUE_LABEL} — an exact, indexed match,
 * not a title-text search. `trip` creates that issue if none is open, or
 * adds a comment to the existing one if the breaker was somehow already
 * tripped when a second regression is reported (e.g. two packages in the
 * same run, or a re-run before a human has caught up) — either way the
 * issue stays open and no new issue is created for the same outage.
 *
 * `octokit` must be authenticated with a token that can create/comment on
 * issues in `owner/repo` — NOT necessarily the same token used to read
 * the registry or delete package versions (`delete:packages` carries no
 * issues access at all). See {@link requestOrExplain} for what happens
 * when it is the wrong one.
 */
export function githubIssueBreaker(
  octokit: IssuesRequestable,
  owner: string,
  repo: string,
  options: IncidentReportOptions = {},
): Breaker {
  async function findOpenIssue(): Promise<RawIssue | undefined> {
    const res = await requestOrExplain(octokit, owner, repo, "GET /repos/{owner}/{repo}/issues", {
      owner,
      repo,
      state: "open",
      labels: BREAKER_ISSUE_LABEL,
      per_page: 100,
    });
    if (!isRawIssueArray(res.data)) {
      throw new Error("unexpected response shape listing issues for the ghcr-tidy breaker");
    }
    return res.data[0];
  }

  return {
    async isTripped(): Promise<TrippedState | null> {
      const issue = await findOpenIssue();
      return issue ? { issueNumber: issue.number, issueUrl: issue.html_url } : null;
    },

    async trip(incident: RegressionIncident): Promise<void> {
      const body = formatIncidentReport(incident, options);
      const existing = await findOpenIssue();
      if (existing) {
        await requestOrExplain(
          octokit,
          owner,
          repo,
          "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
          {
            owner,
            repo,
            issue_number: existing.number,
            body: `Another regression was detected while this breaker was already tripped:\n\n${body}`,
          },
        );
        return;
      }
      await requestOrExplain(octokit, owner, repo, "POST /repos/{owner}/{repo}/issues", {
        owner,
        repo,
        title: BREAKER_ISSUE_TITLE,
        body,
        labels: [BREAKER_ISSUE_LABEL],
      });
    },
  };
}

/**
 * The real backing for `verify.ts`'s `RegressionSink` seam: every
 * recorded incident trips the breaker. This is the ONLY thing that
 * connects post-apply verification to the breaker — `applyPlan` itself
 * never calls `trip` directly, it only checks `isTripped` (see
 * `apply.ts`). Wire this in as `VerificationOptions.sink` to make a
 * regression actually stop future runs, not merely this one.
 */
export function breakerRegressionSink(breaker: Breaker): RegressionSink {
  return {
    record: (incident) => breaker.trip(incident),
  };
}
