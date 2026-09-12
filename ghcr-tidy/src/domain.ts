import type { PackageName } from "../../registry/package-name.js";

/**
 * A content digest, e.g. `"sha256:deadbeef..."`. Branded separately from
 * {@link Tag} because the whole ghcr-tidy model is set arithmetic over
 * digests (`REACHABLE`, `INFLIGHT`, `DELETE`) — a tag string leaking into
 * one of those sets is a silent wrong-answer bug that plain `string` typing
 * cannot catch.
 */
export type Digest = string & { readonly __brand: "Digest" };

/**
 * Validates and brands a raw string as a {@link Digest}. Deliberately only
 * checks the `<algorithm>:<content>` shape (OCI's own digest grammar,
 * `algorithm ::= component ( '+' component )*`, `component` alphanumeric),
 * not that `<content>` is valid hex of the right length for `sha256` —
 * fixtures across the test suite use short, readable placeholders like
 * `"sha256:child"`, and this constructor's job is to keep a `Tag` from
 * being used where a `Digest` is required, not to re-implement the OCI
 * spec's digest grammar.
 */
export function digest(value: string): Digest {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:\+[a-z0-9]+)*:[^\s:]+$/.test(value)) {
    throw new Error(`invalid digest: ${JSON.stringify(value)}`);
  }
  return value as Digest;
}

/** A registry tag, e.g. `"latest"` or `"3.38-alpine"`. Never used as a set key for reachability. */
export type Tag = string & { readonly __brand: "Tag" };

/** Validates and brands a raw string as a {@link Tag}. */
export function tag(value: string): Tag {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`invalid tag: ${JSON.stringify(value)}`);
  }
  return value as Tag;
}

/**
 * The path segment GHCR's `/v2/` registry API expects, e.g.
 * `"pyck-ai/baseimages/golang"`. Branded SEPARATELY from
 * {@link PackageName} (`"baseimages/golang"`) because the two are
 * different strings for different APIs — the Packages API takes the bare
 * package name, `/v2/` needs the owner prepended. Swapping them produces a
 * 404 from the registry, which under fail-closed semantics becomes a
 * silent green no-op: the package is skipped, nothing is deleted, and
 * nothing in the output says why. There is exactly one constructor,
 * {@link registryPathFor}, so this string can never be assembled by ad hoc
 * concatenation elsewhere (the reference bash has two mutually
 * incompatible concatenations of this exact kind).
 */
export type RegistryPath = string & { readonly __brand: "RegistryPath" };

/** The one and only way to construct a {@link RegistryPath}: from an owner and a {@link PackageName}. */
export function registryPathFor(owner: string, name: PackageName): RegistryPath {
  if (typeof owner !== "string" || owner.length === 0) {
    throw new Error(`invalid registry owner: ${JSON.stringify(owner)}`);
  }
  return `${owner}/${name}` as RegistryPath;
}
