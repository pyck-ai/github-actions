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
export type PackageName = string & { readonly __brand: unique symbol };

/** Validates and brands a raw string as a {@link PackageName}. */
export function packageName(value: string): PackageName {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("package name must be a non-empty string");
  }
  if (value.startsWith("/") || value.endsWith("/") || value.includes("//")) {
    throw new Error(`invalid package name: ${JSON.stringify(value)}`);
  }
  return value as PackageName;
}
