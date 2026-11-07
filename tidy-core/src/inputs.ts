/** An invalid input; the message names the input and the value it got. */
export class InputError extends Error {}

/** The environment a run reads its inputs from: `process.env` in production, a plain object in tests. */
export type Env = Record<string, string | undefined>;

/**
 * The raw value of an input: the runner sets `INPUT_<NAME>` with the name
 * upper-cased and `-` kept.
 */
export function rawInput(env: Env, name: string): string | undefined {
  return env[`INPUT_${name.toUpperCase()}`];
}

/** A non-empty input, trimmed. Throws {@link InputError} when it is missing or blank. */
export function requiredString(env: Env, name: string): string {
  const value = (rawInput(env, name) ?? "").trim();
  if (value === "") {
    throw new InputError(`${name} is required, got an empty value`);
  }
  return value;
}

/** The input as it was set (not trimmed), or `fallback` when the runner did not set it. */
export function optionalString(env: Env, name: string, fallback: string): string {
  return rawInput(env, name) ?? fallback;
}

/**
 * `true` or `false` and nothing else (surrounding whitespace is ignored);
 * `fallback` when the input is not set. Throws {@link InputError} on any
 * other value.
 */
export function parseBoolean(env: Env, name: string, fallback: boolean): boolean {
  const raw = rawInput(env, name);
  if (raw === undefined) return fallback;
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  throw new InputError(`${name} must be "true" or "false", got ${JSON.stringify(raw)}`);
}

/**
 * A whole number of at least `min` (digits only, surrounding whitespace is
 * ignored). Throws {@link InputError} when the input is missing, not a whole
 * number or below `min`.
 */
export function parseWholeNumber(env: Env, name: string, min: number): number {
  const raw = rawInput(env, name);
  const value = (raw ?? "").trim();
  const number = /^[0-9]+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(number) || number < min) {
    throw new InputError(
      `${name} must be a whole number >= ${String(min)}, got ${JSON.stringify(raw ?? "")}`,
    );
  }
  return number;
}
