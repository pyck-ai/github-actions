import { InputError, parseBoolean, requiredString, type Env } from "../../tidy-core/src/index.js";

/** The validated action inputs. */
export interface Inputs {
  token: string;
  dryRun: boolean;
}

export { InputError };

/**
 * Reads the inputs from the `INPUT_<NAME>` environment variables the runner
 * sets (upper-cased, `-` kept). Throws {@link InputError} on the first
 * invalid value; nothing is read from the network here.
 */
export function parseInputs(env: Env): Inputs {
  return {
    token: requiredString(env, "token"),
    dryRun: parseBoolean(env, "dry-run"),
  };
}
