import { describe, expect, it } from "vitest";
import { packageName } from "../../registry/package-name.js";
import { digest } from "./domain.js";
import { FakeGhcr } from "./fake-ghcr.js";
import { dryRunMutator } from "./mutator.js";
import { memoryJournal } from "./journal.js";
import { PLAN_SCHEMA_VERSION, type Plan, type PersistedDeletionGroup } from "./persisted-plan.js";
import {
  applyPlan,
  classifyApplyExit,
  EXIT_APPLY_MUTATION_FAILURE,
  EXIT_APPLY_OK,
  EXIT_APPLY_SAFETY,
} from "./apply.js";

const pkg = packageName("golang");

function group(rootId: number, memberIds: number[]): PersistedDeletionGroup {
  const members = memberIds.map((id) => ({
    digest: digest(`sha256:v${String(id)}`),
    versionId: id,
  }));
  return { root: members[0]!, members };
}

function planWithGroups(groups: PersistedDeletionGroup[]): Plan {
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    org: "pyck-ai",
    generatedAt: "2026-09-11T00:00:00.000Z",
    packages: [{ packageName: pkg, groups }],
  };
}

describe("applyPlan — mid-group parent failure (the flutter-rfw regression test)", () => {
  it("does NOT delete a root's children when the root's own delete fails, abandons the group, and still processes later groups", async () => {
    const fake = new FakeGhcr();
    fake.setDeleteFault(1, { kind: "error", status: 500 });

    const failingGroup = group(1, [1, 2, 3]); // root=1 fails; 2, 3 must never be attempted
    const healthyGroup = group(10, [10, 11]);
    const plan = planWithGroups([failingGroup, healthyGroup]);

    const { mutator, attemptedVersionIds, deletedVersionIds } = fake.mutator();

    const result = await applyPlan(plan, mutator, { budget: 100 });

    // Only the root of the failing group was attempted — its children never were.
    expect(attemptedVersionIds).toEqual([1, 10, 11]);
    expect(deletedVersionIds).toEqual([10, 11]);

    const [failingResult, healthyResult] = result.packages[0]!.groups;
    expect(failingResult).toEqual({
      root: digest("sha256:v1"),
      status: "abandoned",
      members: [
        {
          digest: digest("sha256:v1"),
          versionId: 1,
          result: "error",
          detail: expect.stringContaining("500"),
        },
        { digest: digest("sha256:v2"), versionId: 2, result: "not-attempted" },
        { digest: digest("sha256:v3"), versionId: 3, result: "not-attempted" },
      ],
    });
    expect(healthyResult).toEqual({
      root: digest("sha256:v10"),
      status: "completed",
      members: [
        { digest: digest("sha256:v10"), versionId: 10, result: "deleted" },
        { digest: digest("sha256:v11"), versionId: 11, result: "deleted" },
      ],
    });

    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_MUTATION_FAILURE);
  });
});

describe("applyPlan — root already gone", () => {
  it("treats a 404 on the root as success and still deletes its children", async () => {
    const fake = new FakeGhcr();
    fake.setDeleteFault(1, { kind: "not-found" });
    const plan = planWithGroups([group(1, [1, 2, 3])]);
    const { mutator, deletedVersionIds, attemptedVersionIds } = fake.mutator();

    const result = await applyPlan(plan, mutator, { budget: 100 });

    expect(attemptedVersionIds).toEqual([1, 2, 3]);
    expect(deletedVersionIds).toEqual([2, 3]); // root itself was already-gone, not "deleted"
    expect(result.packages[0]!.groups[0]!.status).toBe("completed");
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_OK);
  });
});

describe("applyPlan — last version conflict", () => {
  it("surfaces a 400 as last-version-conflict, does not retry, and abandons the rest of the group", async () => {
    const fake = new FakeGhcr();
    fake.setDeleteFault(1, { kind: "last-version-conflict" });
    const plan = planWithGroups([group(1, [1, 2])]);
    const { mutator, attemptedVersionIds } = fake.mutator();

    const result = await applyPlan(plan, mutator, { budget: 100 });

    expect(attemptedVersionIds).toEqual([1]); // called exactly once — no retry storm
    expect(result.packages[0]!.groups[0]).toMatchObject({
      status: "abandoned",
      members: [
        { versionId: 1, result: "last-version-conflict" },
        { versionId: 2, result: "not-attempted" },
      ],
    });
  });
});

describe("applyPlan — budget", () => {
  it("does not start a group it cannot finish, and remaining budget accounts for it", async () => {
    const fake = new FakeGhcr();
    const plan = planWithGroups([group(1, [1, 2, 3]), group(10, [10])]);
    const { mutator, attemptedVersionIds } = fake.mutator();

    // Budget 2 cannot cover the first group's 3 members, but can cover the second's 1.
    const result = await applyPlan(plan, mutator, { budget: 2 });

    expect(attemptedVersionIds).toEqual([10]);
    expect(result.packages[0]!.groups[0]!.status).toBe("skipped-budget");
    expect(result.packages[0]!.groups[0]!.members.every((m) => m.result === "not-attempted")).toBe(
      true,
    );
    expect(result.packages[0]!.groups[1]!.status).toBe("completed");
    expect(result.attempted).toBe(1);
    expect(result.remainingBudget).toBe(1);
  });
});

describe("applyPlan — idempotence", () => {
  it("applying the same plan twice: the second run mutates nothing new and every member reports already-gone", async () => {
    const fake = new FakeGhcr();
    const plan = planWithGroups([group(1, [1, 2, 3])]);
    const { mutator, deletedVersionIds } = fake.mutator();

    const first = await applyPlan(plan, mutator, { budget: 100 });
    expect(classifyApplyExit(plan, first)).toBe(EXIT_APPLY_OK);
    expect(deletedVersionIds).toEqual([1, 2, 3]);

    const second = await applyPlan(plan, mutator, { budget: 100 });

    expect(classifyApplyExit(plan, second)).toBe(EXIT_APPLY_OK);
    expect(deletedVersionIds).toEqual([1, 2, 3]); // nothing new deleted
    expect(second.packages[0]!.groups[0]).toEqual({
      root: digest("sha256:v1"),
      status: "completed",
      members: [
        { digest: digest("sha256:v1"), versionId: 1, result: "already-gone" },
        { digest: digest("sha256:v2"), versionId: 2, result: "already-gone" },
        { digest: digest("sha256:v3"), versionId: 3, result: "already-gone" },
      ],
    });
  });
});

describe("applyPlan — dry run", () => {
  it("dryRunMutator records every intended call and performs none; matches exactly what apply would issue", async () => {
    const plan = planWithGroups([group(1, [1, 2, 3]), group(10, [10])]);
    const { mutator, calls } = dryRunMutator();

    const result = await applyPlan(plan, mutator, { budget: 100 });

    expect(calls).toEqual([
      { kind: "deleteVersion", packageName: pkg, versionId: 1 },
      { kind: "deleteVersion", packageName: pkg, versionId: 2 },
      { kind: "deleteVersion", packageName: pkg, versionId: 3 },
      { kind: "deleteVersion", packageName: pkg, versionId: 10 },
    ]);
    // A dry run against a plan with no faults completes every group —
    // the intents recorded are exactly the version ids a real apply
    // journal would show intent/outcome pairs for, in the same order.
    expect(result.packages[0]!.groups.every((g) => g.status === "completed")).toBe(true);
  });
});

describe("applyPlan — journal", () => {
  it("records intent before outcome for every attempted mutation, in order", async () => {
    const fake = new FakeGhcr();
    fake.setDeleteFault(2, { kind: "error", status: 500 });
    const plan = planWithGroups([group(1, [1, 2, 3])]);
    const { mutator } = fake.mutator();
    const { journal, entries } = memoryJournal();

    await applyPlan(plan, mutator, { budget: 100, journal });

    expect(entries.map((e) => `${e.type}:${String(e.target.versionId)}`)).toEqual([
      "intent:1",
      "outcome:1",
      "intent:2",
      "outcome:2",
    ]);
    expect(entries[3]).toMatchObject({ type: "outcome", outcome: { kind: "failed" } });
  });
});

describe("classifyApplyExit — zero-mutation guard", () => {
  it("is a FAILURE (exit 4) when the plan has groups but zero mutations were attempted", async () => {
    const fake = new FakeGhcr();
    const plan = planWithGroups([group(1, [1, 2, 3])]);
    const { mutator } = fake.mutator();

    // Budget 0 means every group is skipped for budget reasons — nothing attempted.
    const result = await applyPlan(plan, mutator, { budget: 0 });

    expect(result.attempted).toBe(0);
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_SAFETY);
  });

  it("is OK (exit 0) for an empty plan with zero groups — that is a legitimate no-op, not a failure", async () => {
    const fake = new FakeGhcr();
    const plan = planWithGroups([]);
    const { mutator } = fake.mutator();

    const result = await applyPlan(plan, mutator, { budget: 100 });

    expect(result.attempted).toBe(0);
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_OK);
  });
});

describe("applyPlan — plan integrity", () => {
  it("throws before any mutation when the plan is structurally malformed", async () => {
    const fake = new FakeGhcr();
    const { mutator, attemptedVersionIds } = fake.mutator();

    const malformed: Plan = {
      schemaVersion: PLAN_SCHEMA_VERSION,
      org: "pyck-ai",
      generatedAt: "2026-09-11T00:00:00.000Z",
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

    await expect(applyPlan(malformed, mutator, { budget: 100 })).rejects.toThrow(
      /more than one group/,
    );
    expect(attemptedVersionIds).toEqual([]);
  });
});
