import {
  InputError,
  optionalString,
  parseBoolean,
  parseWholeNumber,
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

const DEFAULT_KEEP_BRANCHES = "main,master";

/**
 * Reads the inputs from the `INPUT_<NAME>` environment variables the runner
 * sets (upper-cased, `-` kept). Throws {@link InputError} on the first
 * invalid value; nothing is read from the network here.
 */
export function parseInputs(env: Env): Inputs {
  return {
    token: requiredString(env, "token"),
    retainDays: parseWholeNumber(env, "retain-days", 1),
    dryRun: parseBoolean(env, "dry-run", true),
    excludeOpenPrBranches: parseBoolean(env, "exclude-open-pr-branches", true),
    keepBranches: new Set(
      optionalString(env, "keep-branches", DEFAULT_KEEP_BRANCHES)
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== ""),
    ),
  };
}
