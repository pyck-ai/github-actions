import type { Manifest } from "./schema.js";

/**
 * A `${VAR}` in a manifest referenced a variable not present in
 * `buildargs.conf`. This is a ConfigError, NOT a check failure: in the
 * bash predecessor an unset variable aborted mid-run under `set -u` and
 * was reported as an image failure, making a misconfigured environment
 * indistinguishable from a genuinely broken image. Callers must surface
 * this before running anything against the image, not fold it into a
 * check result.
 */
export class SubstitutionError extends Error {
  constructor(
    readonly variable: string,
    readonly location: string,
  ) {
    super(`undefined variable "\${${variable}}" at ${location}`);
    this.name = "SubstitutionError";
  }
}

/**
 * Expands every `${VAR}` in `input` using `vars`. `$$` is a literal `$`.
 * An unterminated `${` or a reference to a variable not in `vars` throws
 * {@link SubstitutionError} — pure, no fallback, no partial expansion.
 *
 * `location` is used only for the error message (e.g. a manifest JSON
 * path like `targets[0].checks[1].run`).
 */
export function substituteString(
  input: string,
  vars: ReadonlyMap<string, string>,
  location: string,
): string {
  let result = "";
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch !== "$") {
      result += ch;
      i += 1;
      continue;
    }

    const next = input[i + 1];
    if (next === "$") {
      result += "$";
      i += 2;
      continue;
    }

    if (next === "{") {
      const end = input.indexOf("}", i + 2);
      if (end === -1) {
        throw new SubstitutionError(input.slice(i + 2), location);
      }
      const name = input.slice(i + 2, end);
      const value = vars.get(name);
      if (value === undefined) {
        throw new SubstitutionError(name, location);
      }
      result += value;
      i = end + 1;
      continue;
    }

    // A lone `$` not followed by `{` or `$` is passed through literally.
    result += ch;
    i += 1;
  }
  return result;
}

function substituteValue(
  value: unknown,
  vars: ReadonlyMap<string, string>,
  location: string,
): unknown {
  if (typeof value === "string") {
    return substituteString(value, vars, location);
  }
  if (Array.isArray(value)) {
    return value.map((item, idx) => substituteValue(item, vars, `${location}[${idx}]`));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      result[key] = substituteValue(v, vars, location ? `${location}.${key}` : key);
    }
    return result;
  }
  return value;
}

/**
 * Expands `${VAR}` references throughout every string field of a validated
 * {@link Manifest} (check fields, `match` globs, `registry`, etc.), using
 * `vars` (the parsed `buildargs.conf`). Deep-walks generically rather than
 * special-casing each of the twelve check kinds, so this stays correct as
 * kinds are added without needing to be revisited per kind.
 */
export function substituteManifest(
  manifest: Manifest,
  vars: ReadonlyMap<string, string>,
): Manifest {
  return substituteValue(manifest, vars, "manifest") as Manifest;
}
