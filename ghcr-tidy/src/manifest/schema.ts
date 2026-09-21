import { packageName, type PackageName } from "../../../registry/package-name.js";
import { tag, type Tag } from "../domain.js";

/**
 * `.ghcr-tidy.yaml` config manifest schema (version 1): which packages
 * `ghcr-tidy` manages and, optionally, a global retention override.
 *
 * CLOSED schema: an unknown top-level, per-package, or `retention` field
 * is a hard error, never a silently-ignored one. A silently ignored key
 * in a deletion tool's config produces a green run that did the wrong
 * thing — the exact failure class this strictness exists to remove. This
 * is also the migration mechanism for the retention redesign this
 * schema ships: `keepLast`, `protectedTags`, `graceDays`, `policy`, and
 * any per-package retention override are all REMOVED fields, so a
 * manifest still using any of them fails validation loudly rather than
 * being silently reinterpreted under the new algorithm.
 *
 * `packages[].match` is a FULL package name (`registry/package-name.ts`'s
 * `PackageName`), never a `(prefix, image)` pair to be joined here or
 * anywhere else — see that module's doc for why: the two existing bash
 * implementations concatenate a repo prefix onto an image name in two
 * mutually incompatible ways, and that exact bug class is what the branded
 * `PackageName` type exists to make structurally impossible. A manifest
 * author who needs `baseimages/golang` writes exactly that string.
 */

/**
 * Defaults for `retention`'s four knobs, applied field by field when the
 * manifest omits `retention` entirely or omits an individual field
 * within it. `keepDays` is the primary safety control: it is the ONLY
 * age-based check left in this tool (see `plan.ts`'s `PlanPolicy.keepDays`
 * doc), so lowering it is the single most dangerous edit available in
 * this configuration — it, not `keepMajors`/`keepMinors`/`keepPatches`,
 * is what bounds how much a first run under a tightened policy can ever
 * delete.
 */
export const DEFAULT_KEEP_MAJORS = 1;
export const DEFAULT_KEEP_MINORS = 3;
export const DEFAULT_KEEP_PATCHES = 5;
export const DEFAULT_KEEP_DAYS = 30;

export interface ManifestPackageEntry {
  /** The full GHCR package name, e.g. `"flutter-rfw"` or `"baseimages/golang"`. Never a prefix to be joined — see this module's doc. There is deliberately nothing else on this type: retention is a single global policy, never overridden per package (see `retention.ts`'s module doc for why a package-specific override is exactly the special-casing this schema exists to remove). */
  readonly match: PackageName;
}

/**
 * The four global retention knobs (`retain.ts`'s `RetentionPolicy` plus
 * `plan.ts`'s `PlanPolicy.keepDays`), each individually optional and
 * defaulting per {@link DEFAULT_KEEP_MAJORS} etc. Applied identically to
 * every package in {@link Manifest.packages} — there is no per-package
 * override anywhere in this schema.
 */
export interface RetentionConfig {
  /** Newest N majors kept, per kind. */
  readonly keepMajors?: number;
  /** Within each kept major, newest N minors kept. */
  readonly keepMinors?: number;
  /** Within each kept minor, newest N patches kept. */
  readonly keepPatches?: number;
  /** Any version younger than this many days is never deleted, tagged or not — see this module's doc on why this is the primary safety control. */
  readonly keepDays?: number;
}

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

export interface Manifest {
  readonly version: 1;
  /** The GitHub org that owns every package listed here — both the Packages API `org` and (absent a future need to diverge) the GHCR `/v2/` path owner. */
  readonly owner: string;
  /**
   * The packages this manifest manages. MAY be empty: a repository that
   * publishes no container images (this repository, dogfooding itself —
   * see the root `.ghcr-tidy.yaml`) is a legitimate, permanent steady
   * state, not a misconfiguration, and must not be worked around by
   * inventing a fake package entry just to satisfy a non-empty rule.
   * Emptiness is deliberately NOT rejected here: it simply means "this
   * repo manages zero GHCR packages", which is true for some repos.
   */
  readonly packages: readonly ManifestPackageEntry[];
  /** The single global retention policy applied to every package above. Omit entirely to accept every default. */
  readonly retention?: RetentionConfig;
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

/** A manifest failed structural validation. Carries the location (a dotted/bracketed path) where it failed. */
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

const PACKAGE_ENTRY_FIELDS = ["match"];

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

  return { match };
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

const RETENTION_FIELDS = ["keepMajors", "keepMinors", "keepPatches", "keepDays"];

function validateRetention(raw: unknown, location: string): RetentionConfig {
  if (!isPlainObject(raw)) {
    fail(location, `"retention" must be an object`);
  }
  checkUnknownFields(raw, RETENTION_FIELDS, location);

  if (raw.keepMajors !== undefined) {
    validateNonNegativeInt(raw.keepMajors, "keepMajors", location);
  }
  if (raw.keepMinors !== undefined) {
    validateNonNegativeInt(raw.keepMinors, "keepMinors", location);
  }
  if (raw.keepPatches !== undefined) {
    validateNonNegativeInt(raw.keepPatches, "keepPatches", location);
  }
  if (raw.keepDays !== undefined) {
    validateNonNegativeInt(raw.keepDays, "keepDays", location);
  }

  return {
    ...(raw.keepMajors !== undefined && { keepMajors: raw.keepMajors as number }),
    ...(raw.keepMinors !== undefined && { keepMinors: raw.keepMinors as number }),
    ...(raw.keepPatches !== undefined && { keepPatches: raw.keepPatches as number }),
    ...(raw.keepDays !== undefined && { keepDays: raw.keepDays as number }),
  };
}

const MANIFEST_TOP_LEVEL_FIELDS = ["version", "owner", "packages", "retention", "canary"];

/**
 * Validates a manifest already parsed from YAML into a plain JS value
 * (`unknown`). Pure — no I/O, no network.
 *
 * Rejects: any unrecognised top-level, per-package, or `retention` field
 * (including under `canary`) — in particular every field this schema
 * removed (`keepLast`, `protectedTags`, `graceDays`, `policy`, and any
 * per-package retention override) now fails with `unknown field "..."`
 * naming the offending key; a missing or non-`1` `version`; a
 * missing/empty `owner`; a duplicate `match` across `packages`; a
 * `match` (or `canary.package`) that is not a syntactically valid
 * {@link PackageName}; an empty/missing `canary.tag`; and a negative or
 * non-integer `retention` field anywhere. Does NOT reject an empty
 * `packages` array — see {@link Manifest.packages}'s doc for why. Does
 * NOT reject a missing `canary` or a missing `retention` — see those
 * fields' docs for why both are optional.
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

  let retention: RetentionConfig | undefined;
  if (raw.retention !== undefined) {
    retention = validateRetention(raw.retention, "retention");
  }
  let canary: ManifestCanary | undefined;
  if (raw.canary !== undefined) {
    canary = validateCanary(raw.canary, "canary");
  }

  return {
    version: 1,
    owner: raw.owner,
    packages,
    ...(retention !== undefined && { retention }),
    ...(canary !== undefined && { canary }),
  };
}

/**
 * A fully-resolved retention policy: every field of `manifest.retention`
 * defaulted per {@link DEFAULT_KEEP_MAJORS} etc. Identical for every
 * package in the manifest — there is no per-package resolution step any
 * more, unlike the per-package override chain this replaced.
 */
export interface ResolvedPolicy {
  readonly keepMajors: number;
  readonly keepMinors: number;
  readonly keepPatches: number;
  readonly keepDays: number;
}

/** Resolves `manifest.retention`, field by field, against the hardcoded defaults. */
export function resolvePolicy(manifest: Manifest): ResolvedPolicy {
  const r = manifest.retention;
  return {
    keepMajors: r?.keepMajors ?? DEFAULT_KEEP_MAJORS,
    keepMinors: r?.keepMinors ?? DEFAULT_KEEP_MINORS,
    keepPatches: r?.keepPatches ?? DEFAULT_KEEP_PATCHES,
    keepDays: r?.keepDays ?? DEFAULT_KEEP_DAYS,
  };
}
