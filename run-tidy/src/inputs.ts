import {
  InputError,
  parseBoolean,
  parseWholeNumber,
  requiredString,
  type Env,
} from "../../tidy-core/src/index.js";

/** The validated action inputs. */
export interface Inputs {
  token: string;
  retainDays: number;
  keepPerWorkflow: number;
  maxDeletions: number;
  dryRun: boolean;
}

export { InputError };

/** Largest `retain-days` (100 years); a far larger value overflows the cutoff Date. */
const MAX_RETAIN_DAYS = 36500;
const MAX_KEEP_PER_WORKFLOW = 1000;
const MAX_MAX_DELETIONS = 100000;

/**
 * Reads the inputs from the `INPUT_<NAME>` environment variables the runner
 * sets (upper-cased, `-` kept). Throws {@link InputError} on the first
 * invalid value; nothing is read from the network here.
 */
export function parseInputs(env: Env): Inputs {
  return {
    token: requiredString(env, "token"),
    retainDays: parseWholeNumber(env, "retain-days", 1, MAX_RETAIN_DAYS),
    keepPerWorkflow: parseWholeNumber(env, "keep-per-workflow", 0, MAX_KEEP_PER_WORKFLOW),
    maxDeletions: parseWholeNumber(env, "max-deletions", 1, MAX_MAX_DELETIONS),
    dryRun: parseBoolean(env, "dry-run"),
  };
}
