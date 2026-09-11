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
export declare class SubstitutionError extends Error {
    readonly variable: string;
    readonly location: string;
    constructor(variable: string, location: string);
}
/**
 * Expands every `${VAR}` in `input` using `vars`. `$$` is a literal `$`.
 * An unterminated `${` or a reference to a variable not in `vars` throws
 * {@link SubstitutionError} — pure, no fallback, no partial expansion.
 *
 * `location` is used only for the error message (e.g. a manifest JSON
 * path like `targets[0].checks[1].run`).
 */
export declare function substituteString(input: string, vars: ReadonlyMap<string, string>, location: string): string;
/**
 * Expands `${VAR}` references throughout every string field of a validated
 * {@link Manifest} (check fields, `match` globs, `registry`, etc.), using
 * `vars` (the parsed `buildargs.conf`). Deep-walks generically rather than
 * special-casing each of the twelve check kinds, so this stays correct as
 * kinds are added without needing to be revisited per kind.
 */
export declare function substituteManifest(manifest: Manifest, vars: ReadonlyMap<string, string>): Manifest;
//# sourceMappingURL=substitute.d.ts.map