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
import { deleteRun, listRuns, type RunInfo } from "./github.js";
import { parseInputs, type Inputs } from "./inputs.js";
import { judgeRuns, workflowKey, type Verdict } from "./judge.js";
import { countLine, emptyCounts, renderSummary, type Report } from "./report.js";

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

/** Oldest first; the lower run id first on a tie. */
function oldestFirst(a: RunInfo, b: RunInfo): number {
  const delta = (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
  return delta !== 0 ? delta : a.id - b.id;
}

function describeRun(run: RunInfo, workflow: string): string {
  const field = (value: string | number | undefined): string =>
    value === undefined ? "-" : String(value);
  return (
    `workflow ${JSON.stringify(workflow)}, run ${String(run.id)}, run number ${field(run.runNumber)}, ` +
    `created ${field(run.createdAtRaw)}, conclusion ${field(run.conclusion)}, event ${field(run.event)}, ` +
    `branch ${field(run.headBranch)}, sha ${field(run.headSha)}`
  );
}

/**
 * Runs the action. Returns the exit code (0 on success, 1 on any failure) and
 * never exits the process. Nothing is deleted unless the whole run listing
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

  let runs: RunInfo[];
  try {
    runs = await listRuns(octokit, repository);
  } catch (err) {
    error(`Nothing was deleted: listing the workflow runs failed. ${describeError(err)}`);
    return 1;
  }

  const verdicts = judgeRuns(runs, { cutoff, keepPerWorkflow: inputs.keepPerWorkflow });
  const report: Report = { dryRun: inputs.dryRun, cutoff, workflows: new Map() };
  const names = new Map<string, string>();
  for (const run of runs) {
    const key = workflowKey(run);
    if (run.workflowName !== undefined && !names.has(key)) names.set(key, run.workflowName);
  }
  const countsOf = (run: RunInfo): ReturnType<typeof emptyCounts> => {
    const key = workflowKey(run);
    let counts = report.workflows.get(key);
    if (counts === undefined) {
      counts = emptyCounts(
        names.get(key) ?? (key === "unknown" ? "unknown workflow" : `workflow ${key}`),
      );
      report.workflows.set(key, counts);
    }
    return counts;
  };

  const candidates: RunInfo[] = [];
  for (const run of runs) {
    const counts = countsOf(run);
    counts.seen++;
    const verdict = verdicts.get(run.id) as Verdict;
    switch (verdict.kind) {
      case "not-finished":
        counts.notFinished++;
        break;
      case "unreadable":
        counts.unreadable++;
        warning(
          `Keeping run ${String(run.id)} of ${JSON.stringify(counts.name)}: its created_at is missing or not a date.`,
        );
        break;
      case "young":
        break;
      case "kept-by-minimum":
        counts.old++;
        counts.keptByMinimum++;
        break;
      case "candidate":
        counts.old++;
        candidates.push(run);
        break;
    }
  }
  candidates.sort(oldestFirst);

  const failed: number[] = [];
  let stopped: string | undefined;
  let attempted = 0;
  let notAttempted: RunInfo[] = [];
  for (const [index, run] of candidates.entries()) {
    if (attempted >= inputs.maxDeletions) {
      notAttempted = candidates.slice(index);
      notice(
        `Stopped at max-deletions (${String(inputs.maxDeletions)}): ${String(notAttempted.length)} old run(s) left for later invocations.`,
      );
      break;
    }
    const counts = countsOf(run);
    attempted++;
    if (inputs.dryRun) {
      out(`Would delete run: ${describeRun(run, counts.name)}.`);
      counts.deleted++;
      continue;
    }
    out(`Deleting run: ${describeRun(run, counts.name)}.`);
    try {
      if (await deleteRun(octokit, repository, run.id)) {
        counts.deleted++;
      } else {
        notice(`Run ${String(run.id)} is already gone.`);
        counts.alreadyGone++;
      }
    } catch (err) {
      failed.push(run.id);
      counts.failed++;
      error(`Could not delete run ${String(run.id)}: ${describeError(err)}`);
      const status = statusOf(err);
      if (status === 401 || status === 403 || status === 429) {
        notAttempted = candidates.slice(index + 1);
        stopped = `Stopped after an authorization or rate-limit failure on run ${String(run.id)} (${describeError(err)}). Not attempted: ${String(notAttempted.length)} run(s).`;
        break;
      }
    }
  }
  for (const run of notAttempted) countsOf(run).notAttempted++;

  out(countLine(report));
  await appendStepSummary(env["GITHUB_STEP_SUMMARY"], renderSummary(report), warning);

  if (stopped !== undefined) {
    error(stopped);
    return 1;
  }
  if (failed.length > 0) {
    error(`Failed to delete ${String(failed.length)} run(s): ${failed.join(", ")}.`);
    return 1;
  }
  return 0;
}
