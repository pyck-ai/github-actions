import { packageName, type PackageName } from "../../../registry/package-name.js";
import { tag, type Tag } from "../domain.js";

/**
 * `.ghcr-tidy.yaml` config manifest schema (version 1): which packages
 * `ghcr-tidy` manages and, optionally, retention overrides for each.
 *
 * CLOSED schema, matching `imgverify`'s manifest (`imgverify/manifest/schema.ts`):
 * an unknown top-level or per-package field is a hard error, never a
 * silently-ignored one. A silently ignored key in a deletion tool's config
 * produces a green run that did the wrong thing — the exact failure class
 * this strictness exists to remove.
 *
 * `packages[].match` is a FULL package name (`registry/package-name.ts`'s
 * `PackageName`), never a `(prefix, image)` pair to be joined here or
 * anywhere else — see that module's doc for why: the two existing bash
 * implementations concatenate a repo prefix onto an image name in two
 * mutually incompatible ways, and that exact bug class is what the branded
 * `PackageName` type exists to make structurally impossible. A manifest
 * author who needs `baseimages/golang` writes exactly that string.
 */

/** `keepLast`/`keepDays`/`graceDays` default to 30/30/10-ish floors — see the per-field docs below for the exact defaults and, critically, why `keepDays` and `graceDays` are two separate knobs that must not be conflated. */
export const DEFAULT_KEEP_LAST = 10;
/** `keepDays` protects TAGGED ROOTS (via `retain.ts`'s `RetentionPolicy`) — a root younger than this is kept regardless of tag or count. Deliberately equal to {@link DEFAULT_GRACE_DAYS} and not to be diverged from casually: both are a 30-day floor agreed for this project: lowering either deletes inside it. */
export const DEFAULT_KEEP_DAYS = 30;
/** `graceDays` protects EVERY version regardless of tags (`plan.ts`'s `INFLIGHT`) — a digest pushed by a build that has not yet been tagged. See {@link DEFAULT_KEEP_DAYS}'s doc for why this is a separate knob from `keepDays`, both defaulting to the same 30-day floor. */
export const DEFAULT_GRACE_DAYS = 30;
/** Tags matching any of these patterns are protected (digest-scoped — see `retain.ts`), and so is every other tag sharing that digest. */
export const DEFAULT_PROTECTED_TAGS: readonly string[] = ["^latest$", "^alpine$", "^debian$"];

/** `policy: "cache"` (see {@link ManifestPackageEntry.policy}) keeps every LIVE (tagged) root unconditionally — implemented as a protected-tag pattern matching every tag, so `retain.ts`'s existing digest-scoped protection logic does the work with no special-cased branch of its own. */
export const CACHE_POLICY_PATTERN = "^.*$";

export type PackagePolicy = "cache";

/**
 * A known-good `(package, tag)` pair `apply` resolves BEFORE attempting
 * any deletion, and again immediately after, to prove the registry itself
 * is reachable and behaving — see `verify.ts`'s canary check and
 * `apply.ts`'s `VerificationOptions`. This is per-repository
 * configuration, not a per-invocation flag: it must be present on EVERY
 * apply run regardless of trigger, including a `schedule`-triggered one,
 * where `workflow_call` `inputs` are empty and workflow_dispatch input
 * defaults are never applied (see `tidy-ghcr.yml`'s own doc on this exact
 * trap). A canary sourced only from CLI flags supplied by a caller
 * workflow would silently vanish on every scheduled run — the manifest is
 * the only place that survives every trigger, hence living here rather
 * than as a required CLI flag.
 */
export interface ManifestCanary {
  /** MUST resolve to a tag that is NEVER itself a candidate for deletion (see this field's validation note) — a canary inside the delete set proves nothing and would be worse than no canary at all. */
  readonly package: PackageName;
  readonly tag: Tag;
}

export interface ManifestPackageEntry {
  /** The full GHCR package name, e.g. `"flutter-rfw"` or `"baseimages/golang"`. Never a prefix to be joined — see this module's doc. */
  readonly match: PackageName;
  /**
   * `"cache"` means: keep every currently-tagged version, regardless of
   * `keepLast`/`keepDays`/`protectedTags` (which are ignored when this is
   * set — see {@link CACHE_POLICY_PATTERN}). Intended for buildx-cache-style
   * packages where every live tag is operationally meaningful and none of
   * them is "old" in a way that should ever be pruned automatically.
   * Omitted means the normal retention policy applies.
   */
  readonly policy?: PackagePolicy;
  /** Overrides the manifest-level (or default) `keepLast` for this package only. Ignored when `policy` is `"cache"`. */
  readonly keepLast?: number;
  /** Overrides the manifest-level (or default) `keepDays` for this package only. Ignored when `policy` is `"cache"`. */
  readonly keepDays?: number;
  /** Overrides the manifest-level (or default) `graceDays` for this package only. Always applies, even under `policy: "cache"` — it protects untagged children, not roots. */
  readonly graceDays?: number;
  /** Overrides the manifest-level (or default) `protectedTags` for this package only. Ignored when `policy` is `"cache"`. */
  readonly protectedTags?: readonly string[];
}

export interface Manifest {
  readonly version: 1;
  /** The GitHub org that owns every package listed here — both the Packages API `org` and (absent a future need to diverge) the GHCR `/v2/` path owner. */
  readonly owner: string;
  /**
   * The packages this manifest manages. MAY be empty: a repository that
   * publishes no container images (this repository, dogfooding itself —
   * see the root `.ghcr-tidy.yaml`) is a legitimate, permanent steady
   * state, not a misconfiguration. This is a deliberate departure from
   * `imgverify`'s manifest, where an empty `checks`/`targets` array is
   * rejected: there, emptiness means "silently testing nothing", a real
   * bug class observed in the bash predecessor. Here, emptiness means
   * "this repo manages zero GHCR packages", which is simply true for some
   * repos and must not be worked around by inventing a fake package entry
   * just to satisfy a non-empty rule.
   */
  readonly packages: readonly ManifestPackageEntry[];
  readonly keepLast?: number;
  readonly keepDays?: number;
  readonly graceDays?: number;
  readonly protectedTags?: readonly string[];
  /**
   * OPTIONAL, deliberately: `validate` and `plan` are both read-only and
   * work perfectly well with no canary configured at all — only `apply`
   * WITH deletions to attempt needs one (`cli.ts`'s `hasWork` guard).
   * Making this required would force every plan-only manifest (including
   * this repo's own, which manages zero packages) to invent a canary it
   * will never use. The runtime check in `cli.ts` remains the backstop
   * for the one case that actually matters: an apply run with real work
   * and no canary anywhere (manifest or `--canary-package`/`--canary-tag`)
   * still fails loudly, CONFIG, before anything is deleted.
   */
  readonly canary?: ManifestCanary;
}

/** A manifest failed structural validation. Carries the location (a dotted/bracketed path) where it failed — mirrors `imgverify/manifest/schema.ts`'s `ManifestError`. */
export class ManifestError extends Error {
  /** The underlying failure message, without the location prefix. */
  readonly reason: string;

  constructor(
    reason: string,
    readonly location?: string,
  ) {
    super(location ? `${location}: ${reason}` : reason);
    this.name = "ManifestError";
    this.reason = reason;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(location: string, message: string): never {
  throw new ManifestError(message, location);
}

function checkUnknownFields(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  location: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      fail(location, `unknown field "${key}" (allowed: ${allowed.join(", ")})`);
    }
  }
}

function validateNonNegativeInt(value: unknown, field: string, location: string): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    fail(`${location}.${field}`, `"${field}" must be a non-negative integer`);
  }
}

function validateProtectedTags(value: unknown, location: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    fail(location, `"protectedTags" must be an array of strings`);
  }
  for (const pattern of value) {
    try {
      new RegExp(pattern);
    } catch (error) {
      fail(
        location,
        `"protectedTags" entry ${JSON.stringify(pattern)} is not a valid regular expression: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return value;
}

const PACKAGE_ENTRY_FIELDS = [
  "match",
  "policy",
  "keepLast",
  "keepDays",
  "graceDays",
  "protectedTags",
];

function validatePackageEntry(
  raw: unknown,
  location: string,
  seenMatches: Set<string>,
): ManifestPackageEntry {
  if (!isPlainObject(raw)) {
    fail(location, "package entry must be an object");
  }
  checkUnknownFields(raw, PACKAGE_ENTRY_FIELDS, location);

  if (typeof raw.match !== "string" || raw.match.length === 0) {
    fail(`${location}.match`, `"match" must be a non-empty string`);
  }
  let match: PackageName;
  try {
    match = packageName(raw.match);
  } catch (error) {
    fail(`${location}.match`, error instanceof Error ? error.message : String(error));
  }
  if (seenMatches.has(match)) {
    fail(`${location}.match`, `duplicate package "${match}" — each package may be listed once`);
  }
  seenMatches.add(match);

  if (raw.policy !== undefined && raw.policy !== "cache") {
    fail(
      `${location}.policy`,
      `"policy" must be "cache" if present, got ${JSON.stringify(raw.policy)}`,
    );
  }
  if (raw.keepLast !== undefined) {
    validateNonNegativeInt(raw.keepLast, "keepLast", location);
  }
  if (raw.keepDays !== undefined) {
    validateNonNegativeInt(raw.keepDays, "keepDays", location);
  }
  if (raw.graceDays !== undefined) {
    validateNonNegativeInt(raw.graceDays, "graceDays", location);
  }
  let protectedTags: readonly string[] | undefined;
  if (raw.protectedTags !== undefined) {
    protectedTags = validateProtectedTags(raw.protectedTags, `${location}.protectedTags`);
  }

  return {
    match,
    ...(raw.policy !== undefined && { policy: raw.policy as PackagePolicy }),
    ...(raw.keepLast !== undefined && { keepLast: raw.keepLast as number }),
    ...(raw.keepDays !== undefined && { keepDays: raw.keepDays as number }),
    ...(raw.graceDays !== undefined && { graceDays: raw.graceDays as number }),
    ...(protectedTags !== undefined && { protectedTags }),
  };
}

const CANARY_FIELDS = ["package", "tag"];

function validateCanary(raw: unknown, location: string): ManifestCanary {
  if (!isPlainObject(raw)) {
    fail(location, `"canary" must be an object with "package" and "tag"`);
  }
  checkUnknownFields(raw, CANARY_FIELDS, location);

  if (typeof raw.package !== "string" || raw.package.length === 0) {
    fail(`${location}.package`, `"package" must be a non-empty string`);
  }
  let pkg: PackageName;
  try {
    pkg = packageName(raw.package);
  } catch (error) {
    fail(`${location}.package`, error instanceof Error ? error.message : String(error));
  }

  if (typeof raw.tag !== "string" || raw.tag.length === 0) {
    fail(`${location}.tag`, `"tag" must be a non-empty string`);
  }
  let canaryTag: Tag;
  try {
    canaryTag = tag(raw.tag);
  } catch (error) {
    fail(`${location}.tag`, error instanceof Error ? error.message : String(error));
  }

  return { package: pkg, tag: canaryTag };
}

const MANIFEST_TOP_LEVEL_FIELDS = [
  "version",
  "owner",
  "packages",
  "keepLast",
  "keepDays",
  "graceDays",
  "protectedTags",
  "canary",
];

/**
 * Validates a manifest already parsed from YAML into a plain JS value
 * (`unknown`). Pure — no I/O, no network.
 *
 * Rejects: any unrecognised top-level or per-package field (including
 * under `canary`); a missing or non-`1` `version`; a missing/empty
 * `owner`; a duplicate `match` across `packages`; a `match` (or
 * `canary.package`) that is not a syntactically valid {@link PackageName};
 * an empty/missing `canary.tag`; and a malformed `protectedTags` regex
 * anywhere. Does NOT reject an empty `packages` array — see
 * {@link Manifest.packages}'s doc for why that is a deliberate departure
 * from `imgverify`. Does NOT reject a missing `canary` — see
 * {@link Manifest.canary}'s doc for why that is optional rather than
 * required.
 */
export function validateManifest(raw: unknown): Manifest {
  if (!isPlainObject(raw)) {
    fail("<root>", "manifest must be an object");
  }
  checkUnknownFields(raw, MANIFEST_TOP_LEVEL_FIELDS, "<root>");

  if (raw.version !== 1) {
    fail("version", `manifest "version" must be 1, got ${JSON.stringify(raw.version)}`);
  }
  if (typeof raw.owner !== "string" || raw.owner.length === 0) {
    fail("owner", `"owner" must be a non-empty string`);
  }
  if (raw.packages === undefined) {
    fail("packages", `manifest must have a "packages" field (an array, possibly empty)`);
  }
  if (!Array.isArray(raw.packages)) {
    fail("packages", `"packages" must be an array`);
  }

  const seenMatches = new Set<string>();
  const packages = raw.packages.map((entry, idx) =>
    validatePackageEntry(entry, `packages[${String(idx)}]`, seenMatches),
  );

  if (raw.keepLast !== undefined) {
    validateNonNegativeInt(raw.keepLast, "keepLast", "<root>");
  }
  if (raw.keepDays !== undefined) {
    validateNonNegativeInt(raw.keepDays, "keepDays", "<root>");
  }
  if (raw.graceDays !== undefined) {
    validateNonNegativeInt(raw.graceDays, "graceDays", "<root>");
  }
  let protectedTags: readonly string[] | undefined;
  if (raw.protectedTags !== undefined) {
    protectedTags = validateProtectedTags(raw.protectedTags, "protectedTags");
  }
  let canary: ManifestCanary | undefined;
  if (raw.canary !== undefined) {
    canary = validateCanary(raw.canary, "canary");
  }

  return {
    version: 1,
    owner: raw.owner,
    packages,
    ...(raw.keepLast !== undefined && { keepLast: raw.keepLast as number }),
    ...(raw.keepDays !== undefined && { keepDays: raw.keepDays as number }),
    ...(raw.graceDays !== undefined && { graceDays: raw.graceDays as number }),
    ...(protectedTags !== undefined && { protectedTags }),
    ...(canary !== undefined && { canary }),
  };
}

/**
 * A fully-resolved retention policy for one package: every override layer
 * (per-package, manifest-level, hardcoded default) already applied. See
 * `plan.ts`'s `PlanPolicy` for the shape this feeds.
 */
export interface ResolvedPolicy {
  readonly protectedTagPatterns: readonly RegExp[];
  readonly keepLast: number;
  readonly keepDays: number;
  readonly graceDays: number;
}

/**
 * Resolves `entry`'s effective retention policy: per-package override,
 * falling back to the manifest-level override, falling back to the
 * hardcoded default — in that order, field by field.
 *
 * `policy: "cache"` short-circuits `protectedTagPatterns` to
 * {@link CACHE_POLICY_PATTERN} (every tag is protected, hence every live
 * root is a keep-root) and makes `keepLast`/`keepDays`/`protectedTags`
 * moot for THIS package — they are not read at all, rather than read and
 * then overridden, so a manifest author who sets both `policy: "cache"`
 * and e.g. `keepLast: 3` on the same entry does not get a confusing
 * silent precedence rule to memorise; `keepLast` there is simply inert.
 * `graceDays` is resolved and applied identically regardless of `policy`
 * — it protects untagged children, an orthogonal concern from root
 * retention (see `retain.ts`'s `RetentionPolicy` doc).
 */
export function resolvePolicy(entry: ManifestPackageEntry, manifest: Manifest): ResolvedPolicy {
  const graceDays = entry.graceDays ?? manifest.graceDays ?? DEFAULT_GRACE_DAYS;

  if (entry.policy === "cache") {
    return {
      protectedTagPatterns: [new RegExp(CACHE_POLICY_PATTERN)],
      keepLast: 0,
      keepDays: 0,
      graceDays,
    };
  }

  const protectedTagsRaw = entry.protectedTags ?? manifest.protectedTags ?? DEFAULT_PROTECTED_TAGS;
  return {
    protectedTagPatterns: protectedTagsRaw.map((p) => new RegExp(p)),
    keepLast: entry.keepLast ?? manifest.keepLast ?? DEFAULT_KEEP_LAST,
    keepDays: entry.keepDays ?? manifest.keepDays ?? DEFAULT_KEEP_DAYS,
    graceDays,
  };
}
