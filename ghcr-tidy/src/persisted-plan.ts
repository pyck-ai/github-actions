import { packageName, type PackageName } from "../../registry/package-name.js";
import { digest, type Digest } from "./domain.js";
import type { DeletionGroup } from "./deletion-group.js";
import type { PlannedPlan } from "./plan.js";

/**
 * The apply path's durable, on-disk artifact — deliberately a NARROWER
 * shape than the planning core's `PackagePlanResult`: digest + numeric
 * Packages API version id only, nothing about *why* a digest was
 * selected (no reachability sets, no policy). This is what makes the
 * schema small, stable, and easy to validate strictly (see {@link parsePlan}):
 * a plan file is a list of things to delete and the ids needed to delete
 * them, not a serialisation of the planning core's internal state.
 */
export const PLAN_SCHEMA_VERSION = 1 as const;

export interface PersistedGroupMember {
  readonly digest: Digest;
  readonly versionId: number;
}

/** Mirrors `DeletionGroup`'s parents-first ordering: `root` is always `members[0]`. */
export interface PersistedDeletionGroup {
  readonly root: PersistedGroupMember;
  readonly members: readonly PersistedGroupMember[];
}

export interface PersistedPackagePlan {
  readonly packageName: PackageName;
  readonly groups: readonly PersistedDeletionGroup[];
}

export interface Plan {
  readonly schemaVersion: typeof PLAN_SCHEMA_VERSION;
  readonly org: string;
  /** ISO-8601 timestamp of when this plan was computed — purely informational, never re-derived. */
  readonly generatedAt: string;
  readonly packages: readonly PersistedPackagePlan[];
}

/**
 * Builds a {@link PersistedPackagePlan} from a planning core `PlannedPlan`,
 * pairing every digest in its `groups` with the numeric version id
 * `applyMutator`'s `deleteVersion` requires (`plan.ts`'s
 * `versionIdByDigest`, an apply-only field the pure planning core
 * otherwise has no use for).
 */
export function toPersistedPackagePlan(pkg: PackageName, plan: PlannedPlan): PersistedPackagePlan {
  const resolve = (d: Digest): PersistedGroupMember => {
    const versionId = plan.versionIdByDigest.get(d);
    if (versionId === undefined) {
      throw new Error(`no Packages API version id known for digest ${d} planned for deletion`);
    }
    return { digest: d, versionId };
  };
  return {
    packageName: pkg,
    groups: plan.groups.map((g: DeletionGroup): PersistedDeletionGroup => ({
      root: resolve(g.root),
      members: g.members.map(resolve),
    })),
  };
}

/**
 * Deterministic, canonical serialisation: every field is re-emitted in a
 * FIXED order (never simply `JSON.stringify(plan)`, which would follow
 * whatever key insertion order the value happened to have), so the same
 * `Plan` value always produces the same bytes. `grantApply`'s hash-based
 * round-trip check depends on this: a plan that serialises differently
 * from one call to the next would make that check meaningless.
 */
export function serializePlan(plan: Plan): string {
  const canonical: Plan = {
    schemaVersion: plan.schemaVersion,
    org: plan.org,
    generatedAt: plan.generatedAt,
    packages: plan.packages.map((pkg) => ({
      packageName: pkg.packageName,
      groups: pkg.groups.map((g) => ({
        root: { digest: g.root.digest, versionId: g.root.versionId },
        members: g.members.map((m) => ({ digest: m.digest, versionId: m.versionId })),
      })),
    })),
  };
  return JSON.stringify(canonical, null, 2);
}

function fail(where: string, message: string): never {
  throw new Error(`invalid plan at ${where}: ${message}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Rejects any field not in `allowed` — the "closed" half of "closed schema": an unrecognised field is as suspicious as a missing one. */
function assertNoExtraKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  where: string,
): void {
  const extra = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (extra.length > 0) {
    fail(where, `unexpected field(s): ${extra.join(", ")}`);
  }
}

function parseMember(raw: unknown, where: string): PersistedGroupMember {
  if (!isPlainObject(raw)) fail(where, "must be an object");
  assertNoExtraKeys(raw, ["digest", "versionId"], where);
  const rawDigest = raw.digest;
  const versionId = raw.versionId;
  if (typeof rawDigest !== "string") fail(`${where}.digest`, "must be a string");
  if (typeof versionId !== "number" || !Number.isInteger(versionId) || versionId < 0) {
    fail(`${where}.versionId`, "must be a non-negative integer");
  }
  let d: Digest;
  try {
    d = digest(rawDigest);
  } catch (error) {
    fail(`${where}.digest`, error instanceof Error ? error.message : String(error));
  }
  return { digest: d, versionId };
}

function parseGroup(raw: unknown, where: string): PersistedDeletionGroup {
  if (!isPlainObject(raw)) fail(where, "must be an object");
  assertNoExtraKeys(raw, ["root", "members"], where);
  const root = parseMember(raw.root, `${where}.root`);
  if (!Array.isArray(raw.members)) fail(`${where}.members`, "must be an array");
  const members = raw.members.map((m, i) => parseMember(m, `${where}.members[${String(i)}]`));
  if (members.length === 0 || members[0]?.digest !== root.digest) {
    fail(where, "members[0] must equal root (root-first ordering)");
  }
  return { root, members };
}

function parsePackagePlan(raw: unknown, where: string): PersistedPackagePlan {
  if (!isPlainObject(raw)) fail(where, "must be an object");
  assertNoExtraKeys(raw, ["packageName", "groups"], where);
  const rawName = raw.packageName;
  const groups = raw.groups;
  if (typeof rawName !== "string") fail(`${where}.packageName`, "must be a string");
  if (!Array.isArray(groups)) fail(`${where}.groups`, "must be an array");
  let name: PackageName;
  try {
    name = packageName(rawName);
  } catch (error) {
    fail(`${where}.packageName`, error instanceof Error ? error.message : String(error));
  }
  return {
    packageName: name,
    groups: groups.map((g, i) => parseGroup(g, `${where}.groups[${String(i)}]`)),
  };
}

/**
 * Parses and validates a persisted plan against a CLOSED schema: any
 * missing field, wrong type, or UNRECOGNISED extra field throws, and
 * every digest/package name is re-validated through its own branding
 * constructor (never trusted as already-valid just because the JSON
 * parsed). Deliberately strict rather than lenient: this is the last
 * check standing between an on-disk file and {@link grantApply} handing
 * out a capability to delete, and a schema that tolerates one
 * unrecognised field could just as easily tolerate a typo'd one.
 */
export function parsePlan(raw: unknown): Plan {
  if (!isPlainObject(raw)) fail("plan", "must be an object");
  assertNoExtraKeys(raw, ["schemaVersion", "org", "generatedAt", "packages"], "plan");
  const { schemaVersion, org, generatedAt, packages } = raw;
  if (schemaVersion !== PLAN_SCHEMA_VERSION) {
    fail(
      "plan.schemaVersion",
      `must be ${String(PLAN_SCHEMA_VERSION)}, got ${JSON.stringify(schemaVersion)}`,
    );
  }
  if (typeof org !== "string" || org.length === 0) fail("plan.org", "must be a non-empty string");
  if (typeof generatedAt !== "string" || Number.isNaN(Date.parse(generatedAt))) {
    fail("plan.generatedAt", "must be an ISO-8601 timestamp string");
  }
  if (!Array.isArray(packages)) fail("plan.packages", "must be an array");

  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    org,
    generatedAt,
    packages: packages.map((p, i) => parsePackagePlan(p, `plan.packages[${String(i)}]`)),
  };
}

/**
 * Structural, plan-only sanity check: no digest may appear as a non-root
 * member of one group while also being the root of a DIFFERENT group in
 * the same package. The planning core's own construction
 * (`buildDeletionGroups`'s shared `visited` set) already guarantees this
 * for a plan built in the same process, but the persisted `Plan` schema
 * intentionally does not carry the full `reachable`/`edges` data
 * `assertNoSurvivingParent` (`deletion-group.ts`) needs to re-verify the
 * stronger "no surviving KEPT parent" property — that property was
 * already checked once, in-process, before this plan was ever persisted
 * (see `plan.ts`'s call to `assertNoSurvivingParent`). This check is the
 * defense-in-depth re-verification available from the persisted shape
 * alone: it catches a hand-edited or corrupted plan file that merges or
 * duplicates group membership in a way that would make the apply path's
 * per-group abandonment semantics (`apply.ts`) incoherent.
 */
export function assertGroupsAreWellFormed(plan: Plan): void {
  for (const pkg of plan.packages) {
    const roots = new Set(pkg.groups.map((g) => g.root.digest));
    const seen = new Set<Digest>();
    for (const group of pkg.groups) {
      for (const member of group.members) {
        if (seen.has(member.digest)) {
          throw new Error(
            `plan integrity violation: digest ${member.digest} appears in more than one group of package ${pkg.packageName}`,
          );
        }
        seen.add(member.digest);
        if (member.digest !== group.root.digest && roots.has(member.digest)) {
          throw new Error(
            `plan integrity violation: digest ${member.digest} is both a non-root member of group ${group.root.digest} and the root of another group in package ${pkg.packageName}`,
          );
        }
      }
    }
  }
}
