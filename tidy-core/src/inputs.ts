/** An invalid input; the message names the input and the value it got. */
export class InputError extends Error {}

/** The environment a run reads its inputs from: `process.env` in production, a plain object in tests. */
export type Env = Record<string, string | undefined>;

/** The runner sets `INPUT_<NAME>` with the name upper-cased and `-` kept. */
function rawInput(env: Env, name: string): string | undefined {
  return env[`INPUT_${name.toUpperCase()}`];
}

/**
 * The input as it was set (not trimmed). The runner sets every input the
 * action declares, defaults included, so a missing one is a caller bug: it
 * throws {@link InputError}.
 */
export function requiredInput(env: Env, name: string): string {
  const raw = rawInput(env, name);
  if (raw === undefined) throw new InputError(`${name} is required, got no value`);
  return raw;
}

/** A non-empty input, trimmed. Throws {@link InputError} when it is missing or blank. */
export function requiredString(env: Env, name: string): string {
  const value = (rawInput(env, name) ?? "").trim();
  if (value === "") {
    throw new InputError(`${name} is required, got an empty value`);
  }
  return value;
}

/**
 * `true` or `false` and nothing else (surrounding whitespace is ignored).
 * Throws {@link InputError} when the input is missing or any other value.
 */
export function parseBoolean(env: Env, name: string): boolean {
  const raw = requiredInput(env, name);
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  throw new InputError(`${name} must be "true" or "false", got ${JSON.stringify(raw)}`);
}

/**
 * A whole number from `min` to `max` (digits only, surrounding whitespace is
 * ignored). Throws {@link InputError} when the input is missing, not a whole
 * number or outside the range.
 */
export function parseWholeNumber(env: Env, name: string, min: number, max: number): number {
  const raw = requiredInput(env, name);
  const value = raw.trim();
  const number = /^[0-9]+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new InputError(
      `${name} must be a whole number from ${String(min)} to ${String(max)}, got ${JSON.stringify(raw)}`,
    );
  }
  return number;
}
