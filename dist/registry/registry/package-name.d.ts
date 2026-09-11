/**
 * A GitHub Packages container package name, e.g. `"baseimages/golang"` or
 * `"github-runner"`.
 *
 * This is intentionally an OPAQUE, FULL name — never a `(prefix, image)`
 * pair to be joined. Different repos nest their packages differently
 * (baseimages nests under an org-level prefix, other repos do not), so any
 * code that reconstructs a path from a prefix plus an image name computes
 * the wrong path for at least one of them, fails closed, and produces a
 * green run that silently does nothing. Always obtain a `PackageName` from
 * the GitHub Packages API response (`.name`) or from a single fully
 * qualified string — never by concatenation.
 */
export type PackageName = string & {
    readonly __brand: unique symbol;
};
/** Validates and brands a raw string as a {@link PackageName}. */
export declare function packageName(value: string): PackageName;
//# sourceMappingURL=package-name.d.ts.map