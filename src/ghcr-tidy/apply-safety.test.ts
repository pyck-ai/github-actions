import { describe, expect, it } from "vitest";
import { packageName } from "../core/registry/package-name.js";
import { digest, registryPathFor, tag } from "./domain.js";
import { FakeGhcr } from "./fake-ghcr.js";
import { breakerRegressionSink, memoryBreaker } from "./breaker.js";
import { PLAN_SCHEMA_VERSION, type Plan, type PersistedDeletionGroup } from "./persisted-plan.js";
import {
  applyPlan,
  classifyApplyExit,
  EXIT_APPLY_SAFETY,
  type VerificationOptions,
} from "./apply.js";

const org = "pyck-ai";
const pkgA = packageName("golang");
const pkgB = packageName("python");
const canaryPath = registryPathFor(org, packageName("nginx"));
const canaryTag = tag("canary");

function group(rootId: number, memberIds: number[]): PersistedDeletionGroup {
  const members = memberIds.map((id) => ({
    digest: digest(`sha256:v${String(id)}`),
    versionId: id,
  }));
  return { root: members[0]!, members };
}

function planWithPackages(
  packages: { packageName: ReturnType<typeof packageName>; groups: PersistedDeletionGroup[] }[],
): Plan {
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    org,
    generatedAt: "2026-09-11T00:00:00.000Z",
    packages,
  };
}

function withHealthyCanary(fake: FakeGhcr): FakeGhcr {
  return fake.setTag(canaryTag, digest("sha256:canary")).setManifest(digest("sha256:canary"), {});
}

describe("applyPlan — circuit breaker: already tripped", () => {
  it("refuses to attempt any mutation and names the issue in the abort reason", async () => {
    const state = { issueNumber: 7, issueUrl: "https://github.com/pyck-ai/x/issues/7" };
    const { breaker } = memoryBreaker(state);
    const fake = new FakeGhcr();
    const { mutator, attemptedVersionIds } = fake.mutator();

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);
    const result = await applyPlan(plan, mutator, { budget: 100, breaker });

    expect(attemptedVersionIds).toEqual([]);
    expect(result.attempted).toBe(0);
    expect(result.abortedFor).toEqual({ kind: "breaker-tripped", state });
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_SAFETY);
  });

  it("also refuses when verification is configured — the breaker check happens first", async () => {
    const state = { issueNumber: 7, issueUrl: "https://github.com/pyck-ai/x/issues/7" };
    const { breaker } = memoryBreaker(state);
    const fake = withHealthyCanary(new FakeGhcr());
    const { mutator, attemptedVersionIds } = fake.mutator();
    const verification: VerificationOptions = {
      registry: fake.registryReader(),
      canary: { path: canaryPath, tag: canaryTag },
      sink: { record: () => Promise.resolve() },
    };

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);
    const result = await applyPlan(plan, mutator, { budget: 100, breaker, verification });

    expect(attemptedVersionIds).toEqual([]);
    expect(result.abortedFor?.kind).toBe("breaker-tripped");
  });
});

describe("applyPlan — circuit breaker: a regression trips it via the RegressionSink seam", () => {
  it("trip is called once with the regression incident, and a second run against the same breaker refuses to mutate", async () => {
    const { breaker, trips } = memoryBreaker();
    const sink = breakerRegressionSink(breaker);

    const fake = withHealthyCanary(new FakeGhcr());
    fake.setTag(tag("latest"), digest("sha256:live")).setManifest(digest("sha256:live"), {});
    fake.addVersion({
      id: 1,
      digest: digest("sha256:live"),
      createdAt: new Date(),
      reportedTags: [],
    });
    fake.setDeleteSideEffect(1, () => fake.setManifest(digest("sha256:live"), { notFound: true }));

    const { mutator: firstMutator } = fake.mutator();
    const verification: VerificationOptions = {
      registry: fake.registryReader(),
      canary: { path: canaryPath, tag: canaryTag },
      sink,
    };

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);
    const firstResult = await applyPlan(plan, firstMutator, { budget: 100, breaker, verification });

    expect(firstResult.abortedFor?.kind).toBe("regression");
    expect(trips).toHaveLength(1);
    expect(trips[0]?.packageName).toBe(pkgA);
    expect(trips[0]?.tags[0]?.tag).toBe(tag("latest"));

    // A second run against the SAME breaker: it is now tripped, and must refuse to mutate,
    // even for a plan that has nothing to do with what tripped it.
    const { mutator: secondMutator, attemptedVersionIds } = fake.mutator();
    const secondPlan = planWithPackages([{ packageName: pkgB, groups: [group(20, [20])] }]);
    const secondResult = await applyPlan(secondPlan, secondMutator, { budget: 100, breaker });

    expect(attemptedVersionIds).toEqual([]);
    expect(secondResult.abortedFor?.kind).toBe("breaker-tripped");
  });
});

describe("applyPlan — volume alarm", () => {
  it("refuses to apply, attempting nothing, when planned deletions exceed the multiple of the baseline", async () => {
    const fake = new FakeGhcr();
    const { mutator, attemptedVersionIds } = fake.mutator();

    // 4 planned deletions, baseline 1, multiple 3 -> threshold 3 -> 4 > 3 -> refused.
    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1, 2, 3, 4])] }]);
    const result = await applyPlan(plan, mutator, {
      budget: 100,
      volumeAlarm: { baseline: 1, multiple: 3 },
    });

    expect(attemptedVersionIds).toEqual([]);
    expect(result.attempted).toBe(0);
    expect(result.abortedFor).toMatchObject({ kind: "volume-alarm" });
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_SAFETY);
  });

  it("proceeds normally when planned deletions are within the multiple of the baseline", async () => {
    const fake = new FakeGhcr();
    const { mutator, attemptedVersionIds } = fake.mutator();

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1, 2])] }]);
    const result = await applyPlan(plan, mutator, {
      budget: 100,
      volumeAlarm: { baseline: 1, multiple: 3 },
    });

    expect(attemptedVersionIds).toEqual([1, 2]);
    expect(result.abortedFor).toBeUndefined();
  });
});
