import {
  InputError,
  parseBoolean,
  parseWholeNumber,
  requiredInput,
  requiredString,
  type Env,
} from "../../tidy-core/src/index.js";

/** The validated action inputs. */
export interface Inputs {
  token: string;
  retainDays: number;
  dryRun: boolean;
  excludeOpenPrBranches: boolean;
  keepBranches: ReadonlySet<string>;
}

export { InputError };

/** Largest `retain-days` (100 years); a far larger value overflows the cutoff Date. */
const MAX_RETAIN_DAYS = 36500;

/**
 * Reads the inputs from the `INPUT_<NAME>` environment variables the runner
 * sets (upper-cased, `-` kept). Throws {@link InputError} on the first
 * invalid value; nothing is read from the network here.
 */
export function parseInputs(env: Env): Inputs {
  return {
    token: requiredString(env, "token"),
    retainDays: parseWholeNumber(env, "retain-days", 1, MAX_RETAIN_DAYS),
    dryRun: parseBoolean(env, "dry-run"),
    excludeOpenPrBranches: parseBoolean(env, "exclude-open-pr-branches"),
    keepBranches: new Set(
      requiredInput(env, "keep-branches")
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== ""),
    ),
  };
}
