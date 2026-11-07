/** The validated action inputs. */
export interface Inputs {
  token: string;
  retainDays: number;
  dryRun: boolean;
  excludeOpenPrBranches: boolean;
  keepBranches: ReadonlySet<string>;
}

/** An invalid input; the message names the input and the value it got. */
export class InputError extends Error {}

/** Largest `retain-days` (100 years); a far larger value overflows the cutoff Date. */
const MAX_RETAIN_DAYS = 36500;

/** The runner sets every declared input, defaults included; a missing one is a caller bug. */
function required(name: string, raw: string | undefined): string {
  if (raw === undefined) throw new InputError(`${name} is required, got no value`);
  return raw;
}

function parseBoolean(name: string, raw: string | undefined): boolean {
  const value = required(name, raw).trim();
  if (value === "true") return true;
  if (value === "false") return false;
  throw new InputError(`${name} must be "true" or "false", got ${JSON.stringify(raw)}`);
}

function parseRetainDays(raw: string | undefined): number {
  const value = (raw ?? "").trim();
  const days = /^[0-9]+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(days) || days < 1 || days > MAX_RETAIN_DAYS) {
    throw new InputError(
      `retain-days must be a whole number from 1 to ${MAX_RETAIN_DAYS}, got ${JSON.stringify(raw ?? "")}`,
    );
  }
  return days;
}

/**
 * Reads the inputs from the `INPUT_<NAME>` environment variables the runner
 * sets (upper-cased, `-` kept). Throws {@link InputError} on the first
 * invalid value; nothing is read from the network here.
 */
export function parseInputs(env: Record<string, string | undefined>): Inputs {
  const token = (env["INPUT_TOKEN"] ?? "").trim();
  if (token === "") {
    throw new InputError("token is required, got an empty value");
  }
  return {
    token,
    retainDays: parseRetainDays(env["INPUT_RETAIN-DAYS"]),
    dryRun: parseBoolean("dry-run", env["INPUT_DRY-RUN"]),
    excludeOpenPrBranches: parseBoolean(
      "exclude-open-pr-branches",
      env["INPUT_EXCLUDE-OPEN-PR-BRANCHES"],
    ),
    keepBranches: new Set(
      required("keep-branches", env["INPUT_KEEP-BRANCHES"])
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== ""),
    ),
  };
}
