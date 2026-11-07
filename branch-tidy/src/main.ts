import {
  InputError,
  apiUrl,
  appendStepSummary,
  createOutput,
  describeError,
  parseRepository,
  statusOf,
  type OctokitFactory,
  type Repository,
} from "../../tidy-core/src/index.js";
import {
  deleteBranchRef,
  getBranchRef,
  getRepo,
  listBranches,
  listOpenPullRequests,
  type BranchInfo,
} from "./github.js";
import { parseInputs, type Inputs } from "./inputs.js";
import { judgeBranches, type KeepReason } from "./judge.js";
import { renderSummary, type Report } from "./report.js";

/** Everything `main` needs from its surroundings; the seam tests and the entry point share. */
export interface MainOptions {
  /** The action inputs (`INPUT_*`), `GITHUB_REPOSITORY`, `GITHUB_STEP_SUMMARY` and `GITHUB_API_URL`. */
  env: Record<string, string | undefined>;
  /** Builds the API client from the token input and the API URL. */
  octokit: OctokitFactory;
  /** The start time the cutoff is computed from. Defaults to the current time. */
  now?: Date;
  /** Receives every stdout line, workflow commands included. Defaults to stdout. */
  log?: (line: string) => void;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Plain code-unit order, the same on every machine and locale. */
function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Runs the action. Returns the exit code (0 on success, 1 on any failure) and
 * never exits the process. Nothing is deleted unless every read it depends on
 * succeeded: a listing failure fails the run before the first deletion.
 */
export async function main(opts: MainOptions): Promise<number> {
  const { log: out, notice, warning, error } = createOutput(opts.log);
  const start = opts.now ?? new Date();
  const env = opts.env;

  let inputs: Inputs;
  let repository: Repository;
  try {
    inputs = parseInputs(env);
    repository = parseRepository(env["GITHUB_REPOSITORY"]);
  } catch (err) {
    if (!(err instanceof InputError)) throw err;
    error(err.message);
    return 1;
  }

  const cutoff = new Date(start.getTime() - inputs.retainDays * MS_PER_DAY);
  const octokit = opts.octokit(inputs.token, apiUrl(env));

  const report: Report = {
    dryRun: inputs.dryRun,
    cutoff,
    seen: 0,
    stale: 0,
    unreadable: 0,
    kept: {
      "keep-branches": 0,
      "default-branch": 0,
      protected: 0,
      "protection-unknown": 0,
      "open-pr-head": 0,
      "open-pr-base": 0,
    },
    deleted: [],
    alreadyGone: 0,
    changedSinceListing: 0,
    failed: [],
    skipped: [],
  };

  let branches: BranchInfo[];
  let verdicts: ReturnType<typeof judgeBranches>;
  try {
    const repo = await getRepo(octokit, repository);
    branches = (await listBranches(octokit, repository)).sort((a, b) => byName(a.name, b.name));
    const openPullRequests = inputs.excludeOpenPrBranches
      ? await listOpenPullRequests(octokit, repository)
      : undefined;
    verdicts = judgeBranches(branches, {
      cutoff,
      keepBranches: inputs.keepBranches,
      repo,
      openPullRequests,
    });
  } catch (err) {
    error(`Nothing was deleted: reading the repository's branches failed. ${describeError(err)}`);
    return 1;
  }

  report.seen = branches.length;
  const toDelete: BranchInfo[] = [];
  for (const branch of branches) {
    const verdict = verdicts.get(branch.name);
    if (verdict === undefined || verdict.kind === "fresh") continue;
    if (verdict.kind === "unreadable") {
      report.unreadable++;
      warning(`Keeping branch ${branch.name}: ${verdict.why}.`);
      continue;
    }
    report.stale++;
    if (verdict.kind === "kept") {
      report.kept[verdict.reason]++;
      out(`Keeping stale branch ${branch.name}: ${keepText(verdict.reason)}.`);
      continue;
    }
    toDelete.push(branch);
  }

  let authFailure = false;
  for (const [index, branch] of toDelete.entries()) {
    const committedDate = branch.committedDate as Date;
    const judged = { name: branch.name, sha: branch.sha, committedDate };
    if (inputs.dryRun) {
      out(
        `Would delete branch ${branch.name} (head ${branch.sha}, last commit ${committedDate.toISOString()}).`,
      );
      report.deleted.push(judged);
      continue;
    }

    try {
      const current = await getBranchRef(octokit, repository, branch.name);
      if (current === undefined) {
        notice(`Branch ${branch.name} is already gone.`);
        report.alreadyGone++;
        continue;
      }
      if (current.sha !== branch.sha) {
        notice(
          `Branch ${branch.name} changed since listing (head ${branch.sha} is now ${current.sha}); keeping it.`,
        );
        report.changedSinceListing++;
        continue;
      }
      out(
        `Deleting branch ${branch.name} (head ${branch.sha}, last commit ${committedDate.toISOString()}).`,
      );
      await deleteBranchRef(octokit, repository, branch.name);
      report.deleted.push(judged);
    } catch (err) {
      report.failed.push(branch.name);
      error(`Could not delete branch ${branch.name}: ${describeError(err)}`);
      const status = statusOf(err);
      if (status === 401 || status === 403) {
        authFailure = true;
        report.skipped = toDelete.slice(index + 1).map((b) => b.name);
        break;
      }
    }
  }

  await appendStepSummary(env["GITHUB_STEP_SUMMARY"], renderSummary(report), warning);

  if (authFailure) {
    error(
      `Stopped after an authorization failure on ${report.failed.join(", ")}. Not attempted: ${report.skipped.length > 0 ? report.skipped.join(", ") : "none"}.`,
    );
    return 1;
  }
  if (report.failed.length > 0) {
    error(
      `Failed to delete ${String(report.failed.length)} branch(es): ${report.failed.join(", ")}.`,
    );
    return 1;
  }
  return 0;
}

function keepText(reason: KeepReason): string {
  switch (reason) {
    case "keep-branches":
      return "it is listed in keep-branches";
    case "default-branch":
      return "it is the default branch";
    case "protected":
      return "it is protected";
    case "protection-unknown":
      return "its protection status could not be read";
    case "open-pr-head":
      return "it is the head of an open pull request";
    case "open-pr-base":
      return "it is the base of an open pull request";
  }
}
