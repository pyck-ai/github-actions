import { describe, expect, it } from "vitest";
import { packageName } from "../../registry/package-name.js";
import { digest } from "./domain.js";
import {
  PLAN_SCHEMA_VERSION,
  assertGroupsAreWellFormed,
  parsePlan,
  serializePlan,
  toPersistedPackagePlan,
  type Plan,
} from "./persisted-plan.js";
import type { PlannedPlan } from "./plan.js";

const pkg = packageName("golang");

const plan: Plan = {
  schemaVersion: PLAN_SCHEMA_VERSION,
  org: "pyck-ai",
  generatedAt: "2026-09-11T00:00:00.000Z",
  packages: [
    {
      packageName: pkg,
      groups: [
        {
          root: { digest: digest("sha256:root"), versionId: 1 },
          members: [
            { digest: digest("sha256:root"), versionId: 1 },
            { digest: digest("sha256:child"), versionId: 2 },
          ],
        },
      ],
    },
  ],
};

describe("serializePlan / parsePlan", () => {
  it("round-trips a plan exactly", () => {
    const parsed = parsePlan(JSON.parse(serializePlan(plan)));
    expect(serializePlan(parsed)).toBe(serializePlan(plan));
  });

  it("is deterministic regardless of a value's own key insertion order", () => {
    // Same content, deliberately built with different key order.
    const reordered: Plan = {
      generatedAt: plan.generatedAt,
      packages: plan.packages,
      org: plan.org,
      schemaVersion: plan.schemaVersion,
    };
    expect(serializePlan(reordered)).toBe(serializePlan(plan));
  });

  it("rejects an unrecognised top-level field (closed schema)", () => {
    const raw = { ...JSON.parse(serializePlan(plan)), extra: "surprise" };
    expect(() => parsePlan(raw)).toThrow(/unexpected field/);
  });

  it("rejects an unrecognised field on a group member", () => {
    const raw = JSON.parse(serializePlan(plan));
    raw.packages[0].groups[0].root.bogus = true;
    expect(() => parsePlan(raw)).toThrow(/unexpected field/);
  });

  it("rejects a wrong schemaVersion", () => {
    const raw = { ...JSON.parse(serializePlan(plan)), schemaVersion: 2 };
    expect(() => parsePlan(raw)).toThrow(/schemaVersion/);
  });

  it("rejects a group whose members[0] is not its root", () => {
    const raw = JSON.parse(serializePlan(plan));
    raw.packages[0].groups[0].members.reverse();
    expect(() => parsePlan(raw)).toThrow(/members\[0\] must equal root/);
  });

  it("rejects a non-integer versionId", () => {
    const raw = JSON.parse(serializePlan(plan));
    raw.packages[0].groups[0].root.versionId = 1.5;
    expect(() => parsePlan(raw)).toThrow(/versionId/);
  });

  it("rejects an invalid digest", () => {
    const raw = JSON.parse(serializePlan(plan));
    raw.packages[0].groups[0].root.digest = "not-a-digest";
    expect(() => parsePlan(raw)).toThrow();
  });

  it("throws on truncated / non-JSON input at the JSON.parse boundary before reaching parsePlan", () => {
    const truncated = serializePlan(plan).slice(0, 10);
    expect(() => JSON.parse(truncated) as unknown).toThrow();
  });

  it("rejects an empty object", () => {
    expect(() => parsePlan({})).toThrow(/unexpected field|must be/);
  });
});

describe("toPersistedPackagePlan", () => {
  it("pairs every digest in the planned groups with its Packages API version id", () => {
    const planned: PlannedPlan = {
      status: "planned",
      total: 2,
      liveRootsCount: 1,
      keepRootsCount: 0,
      reachableCount: 0,
      inflightCount: 0,
      deleteCount: 2,
      groups: [
        { root: digest("sha256:root"), members: [digest("sha256:root"), digest("sha256:child")] },
      ],
      versionIdByDigest: new Map([
        [digest("sha256:root"), 1],
        [digest("sha256:child"), 2],
      ]),
    };

    const persisted = toPersistedPackagePlan(pkg, planned);

    expect(persisted).toEqual({
      packageName: pkg,
      groups: [
        {
          root: { digest: digest("sha256:root"), versionId: 1 },
          members: [
            { digest: digest("sha256:root"), versionId: 1 },
            { digest: digest("sha256:child"), versionId: 2 },
          ],
        },
      ],
    });
  });

  it("throws if a group digest has no known version id (defensive — should be unreachable per plan.ts's construction)", () => {
    const planned: PlannedPlan = {
      status: "planned",
      total: 1,
      liveRootsCount: 1,
      keepRootsCount: 0,
      reachableCount: 0,
      inflightCount: 0,
      deleteCount: 1,
      groups: [{ root: digest("sha256:root"), members: [digest("sha256:root")] }],
      versionIdByDigest: new Map(),
    };

    expect(() => toPersistedPackagePlan(pkg, planned)).toThrow(/no Packages API version id/);
  });
});

describe("assertGroupsAreWellFormed", () => {
  it("does not throw on a well-formed plan", () => {
    expect(() => assertGroupsAreWellFormed(plan)).not.toThrow();
  });

  it("throws when a digest appears in more than one group", () => {
    const malformed: Plan = {
      ...plan,
      packages: [
        {
          packageName: pkg,
          groups: [
            {
              root: { digest: digest("sha256:a"), versionId: 1 },
              members: [{ digest: digest("sha256:a"), versionId: 1 }],
            },
            {
              root: { digest: digest("sha256:b"), versionId: 2 },
              members: [
                { digest: digest("sha256:b"), versionId: 2 },
                { digest: digest("sha256:a"), versionId: 1 },
              ],
            },
          ],
        },
      ],
    };

    expect(() => assertGroupsAreWellFormed(malformed)).toThrow(/more than one group/);
  });

  it("throws when a non-root member is also the root of another group", () => {
    const malformed: Plan = {
      ...plan,
      packages: [
        {
          packageName: pkg,
          groups: [
            {
              root: { digest: digest("sha256:a"), versionId: 1 },
              members: [
                { digest: digest("sha256:a"), versionId: 1 },
                { digest: digest("sha256:b"), versionId: 2 },
              ],
            },
            {
              root: { digest: digest("sha256:b"), versionId: 2 },
              members: [{ digest: digest("sha256:b"), versionId: 2 }],
            },
          ],
        },
      ],
    };

    expect(() => assertGroupsAreWellFormed(malformed)).toThrow();
  });
});
