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
  deleteCache,
  getDefaultBranch,
  getPullState,
  listBranchNames,
  listCaches,
  listOpenPullNumbers,
  tagExists,
  type CacheEntry,
} from "./github.js";
import { parseInputs, type Inputs } from "./inputs.js";
import { classify, isDead, parseRef, type Facts } from "./judge.js";
import { countLine, renderSummary, type Classified, type Report } from "./report.js";

/** Everything `main` needs from its surroundings; the seam tests and the entry point share. */
export interface MainOptions {
  /** The action inputs (`INPUT_*`), `GITHUB_REPOSITORY`, `GITHUB_STEP_SUMMARY` and `GITHUB_API_URL`. */
  env: Record<string, string | undefined>;
  /** Builds the API client from the token input and the API URL. */
  octokit: OctokitFactory;
  /** The start time of the run. Unused by the rules; kept so every tidy action shares one seam. */
  now?: Date;
  /** Receives every stdout line, workflow commands included. Defaults to stdout. */
  log?: (line: string) => void;
}

/** Largest first; the id breaks ties so the order is the same on every run. */
function bySizeDesc(a: Classified, b: Classified): number {
  return b.cache.sizeInBytes - a.cache.sizeInBytes || a.cache.id - b.cache.id;
}

/**
 * Runs the action. Returns the exit code (0 on success, 1 on any failure) and
 * never exits the process. Nothing is deleted unless every read it depends on
 * succeeded: a listing failure fails the run before the first deletion.
 */
export async function main(opts: MainOptions): Promise<number> {
  const { log: out, notice, warning, error } = createOutput(opts.log);
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

  const octokit = opts.octokit(inputs.token, apiUrl(env));

  let caches: CacheEntry[];
  let facts: Facts;
  try {
    const defaultBranch = await getDefaultBranch(octokit, repository);
    caches = await listCaches(octokit, repository);
    const branches = await listBranchNames(octokit, repository);
    const openPulls = await listOpenPullNumbers(octokit, repository);

    const pullStates = new Map<number, "open" | "merged" | "closed" | undefined>();
    const tags = new Set<string>();
    const tagNames = new Set<string>();
    const pullNumbers = new Set<number>();
    for (const cache of caches) {
      const ref = parseRef(cache.ref);
      if (ref.kind === "pull" && !openPulls.has(ref.number)) pullNumbers.add(ref.number);
      if (ref.kind === "tag") tagNames.add(ref.name);
    }
    for (const number of [...pullNumbers].sort((a, b) => a - b)) {
      try {
        pullStates.set(number, await getPullState(octokit, repository, number));
      } catch (err) {
        pullStates.set(number, undefined);
        warning(
          `Keeping the caches of pull request ${String(number)}: its state could not be read. ${describeError(err)}`,
        );
      }
    }
    for (const name of [...tagNames].sort()) {
      if (await tagExists(octokit, repository, name)) tags.add(name);
    }
    facts = { defaultBranch, branches, openPulls, pullStates, tags };
  } catch (err) {
    error(`Nothing was deleted: reading the repository's caches failed. ${describeError(err)}`);
    return 1;
  }

  const classified: Classified[] = caches.map((cache) => ({
    cache,
    reason: classify(cache, facts),
  }));
  const toDelete = classified.filter((c) => isDead(c.reason)).sort(bySizeDesc);

  const report: Report = {
    dryRun: inputs.dryRun,
    caches: classified,
    deleted: [],
    alreadyGone: 0,
    failed: [],
    skipped: [],
  };

  let authFailure = false;
  for (const [index, item] of toDelete.entries()) {
    const { cache } = item;
    const what = `cache ${String(cache.id)} (key ${cache.key}, ref ${cache.ref ?? ""}, ${String(cache.sizeInBytes)} bytes)`;
    if (inputs.dryRun) {
      out(`Would delete ${what}.`);
      report.deleted.push(item);
      continue;
    }
    try {
      out(`Deleting ${what}.`);
      await deleteCache(octokit, repository, cache.id);
      report.deleted.push(item);
    } catch (err) {
      const status = statusOf(err);
      if (status === 404) {
        notice(`Cache ${String(cache.id)} is already gone.`);
        report.alreadyGone++;
        continue;
      }
      report.failed.push(cache.id);
      error(`Could not delete cache ${String(cache.id)}: ${describeError(err)}`);
      if (status === 401 || status === 403) {
        authFailure = true;
        report.skipped = toDelete.slice(index + 1).map((c) => c.cache.id);
        break;
      }
    }
  }

  out(countLine(report));
  await appendStepSummary(env["GITHUB_STEP_SUMMARY"], renderSummary(report), warning);

  if (authFailure) {
    error(
      `Stopped after an authorization failure on cache ${report.failed.join(", ")}. ` +
        `Not attempted: ${report.skipped.length > 0 ? report.skipped.join(", ") : "none"}. ` +
        "A rate-limit 403 clears by the next day's run.",
    );
    return 1;
  }
  if (report.failed.length > 0) {
    error(
      `Failed to delete ${String(report.failed.length)} cache(s): ${report.failed.join(", ")}.`,
    );
    return 1;
  }
  return 0;
}
