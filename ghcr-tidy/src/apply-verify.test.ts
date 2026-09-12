import { describe, expect, it } from "vitest";
import { packageName } from "../../registry/package-name.js";
import { digest, registryPathFor, tag } from "./domain.js";
import { FakeGhcr } from "./fake-ghcr.js";
import { memoryRegressionSink } from "./verify.js";
import type { RegistryReader } from "./ports.js";
import { PLAN_SCHEMA_VERSION, type Plan, type PersistedDeletionGroup } from "./persisted-plan.js";
import {
  applyPlan,
  classifyApplyExit,
  EXIT_APPLY_OK,
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

/** A healthy canary, set up on every fake used below unless a test says otherwise. */
function withHealthyCanary(fake: FakeGhcr): FakeGhcr {
  return fake.setTag(canaryTag, digest("sha256:canary")).setManifest(digest("sha256:canary"), {});
}

/** Wraps a real `RegistryReader` so its `listTags` throws exactly once, then behaves normally — simulating an operational pre-snapshot failure without touching `FakeGhcr` itself. */
function registryThatFailsListTagsOnce(inner: RegistryReader): RegistryReader {
  let failed = false;
  return {
    listTags: (path) => {
      if (!failed) {
        failed = true;
        throw new Error("simulated transient failure listing tags");
      }
      return inner.listTags(path);
    },
    resolve: (path, ref) => inner.resolve(path, ref),
  };
}

/** Wraps a real `RegistryReader` so its SECOND `listTags` call throws, then behaves normally — simulating an operational POST-snapshot failure (the pre-snapshot succeeds, the post-snapshot does not) without touching `FakeGhcr` itself. This is the shape of the real incident: 24 minutes of successful deletions, then the post-apply read itself failed. */
function registryThatFailsSecondListTags(inner: RegistryReader): RegistryReader {
  let calls = 0;
  return {
    listTags: (path) => {
      calls += 1;
      if (calls === 2) {
        throw new Error("simulated transient failure listing tags");
      }
      return inner.listTags(path);
    },
    resolve: (path, ref) => inner.resolve(path, ref),
  };
}

describe("applyPlan — post-apply verification: clean apply", () => {
  it("pre and post snapshots match, no regression, the run completes normally", async () => {
    const fake = withHealthyCanary(new FakeGhcr());
    // A live, untouched tag alongside garbage being deleted.
    fake
      .setTag(tag("latest"), digest("sha256:live"))
      .setManifest(digest("sha256:live"), {})
      .setManifest(digest("sha256:garbage"), {});
    fake.addVersion({
      id: 1,
      digest: digest("sha256:garbage"),
      createdAt: new Date(),
      reportedTags: [],
    });

    const { mutator, deletedVersionIds } = fake.mutator();
    const { sink, incidents } = memoryRegressionSink();
    const verification: VerificationOptions = {
      registry: fake.registryReader(),
      canary: { path: canaryPath, tag: canaryTag },
      sink,
    };

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);
    const result = await applyPlan(plan, mutator, { budget: 100, verification });

    expect(deletedVersionIds).toEqual([1]);
    expect(result.abortedFor).toBeUndefined();
    expect(incidents).toEqual([]);
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_OK);
  });
});

describe("applyPlan — post-apply verification: regression by disappearance", () => {
  it("aborts with exit 4 when a live tag's digest 404s after this package's deletions; later packages are never processed", async () => {
    const fake = withHealthyCanary(new FakeGhcr());
    fake.setTag(tag("latest"), digest("sha256:live")).setManifest(digest("sha256:live"), {});
    // The plan mistakenly deletes the live tag's own digest.
    fake.addVersion({
      id: 1,
      digest: digest("sha256:live"),
      createdAt: new Date(),
      reportedTags: [],
    });
    fake.setDeleteSideEffect(1, () => fake.setManifest(digest("sha256:live"), { notFound: true }));

    const { mutator, attemptedVersionIds } = fake.mutator();
    const { sink, incidents } = memoryRegressionSink();
    const verification: VerificationOptions = {
      registry: fake.registryReader(),
      canary: { path: canaryPath, tag: canaryTag },
      sink,
    };

    const plan = planWithPackages([
      { packageName: pkgA, groups: [group(1, [1])] },
      { packageName: pkgB, groups: [group(10, [10])] },
    ]);
    const result = await applyPlan(plan, mutator, { budget: 100, verification });

    expect(attemptedVersionIds).toEqual([1]); // pkgB's group 10 was never attempted
    expect(result.abortedFor).toEqual({
      kind: "regression",
      packageName: pkgA,
      tags: [expect.objectContaining({ tag: tag("latest"), stillResolves: false }) as unknown],
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]?.packageName).toBe(pkgA);
    expect(incidents[0]?.precedingDeletions).toEqual([
      { digest: digest("sha256:v1"), versionId: 1 },
    ]);
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_SAFETY);
  });
});

describe("applyPlan — post-apply verification: regression by digest change", () => {
  it("detects a tag now resolving to a different digest", async () => {
    const fake = withHealthyCanary(new FakeGhcr());
    fake.setTag(tag("latest"), digest("sha256:live")).setManifest(digest("sha256:live"), {});
    fake.setManifest(digest("sha256:other"), {});
    fake.addVersion({
      id: 1,
      digest: digest("sha256:garbage"),
      createdAt: new Date(),
      reportedTags: [],
    });
    fake.setManifest(digest("sha256:garbage"), {});
    // Deleting unrelated garbage somehow leaves the tag repointed — simulates a planner/registry model bug.
    fake.setDeleteSideEffect(1, () => fake.setTag(tag("latest"), digest("sha256:other")));

    const { mutator } = fake.mutator();
    const { sink, incidents } = memoryRegressionSink();
    const verification: VerificationOptions = {
      registry: fake.registryReader(),
      canary: { path: canaryPath, tag: canaryTag },
      sink,
    };

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);
    const result = await applyPlan(plan, mutator, { budget: 100, verification });

    expect(result.abortedFor?.kind).toBe("regression");
    expect(incidents[0]?.tags).toEqual([
      expect.objectContaining({
        tag: tag("latest"),
        digestBefore: digest("sha256:live"),
        digestAfter: digest("sha256:other"),
        stillResolves: true,
        digestUnchanged: false,
      }),
    ]);
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_SAFETY);
  });
});

describe("applyPlan — post-apply verification: regression by closure", () => {
  it("detects an unchanged tag/digest whose child manifest now 404s", async () => {
    const fake = withHealthyCanary(new FakeGhcr());
    fake
      .setTag(tag("latest"), digest("sha256:index"))
      .setManifest(digest("sha256:index"), {
        children: [{ digest: "sha256:arch-amd64" }, { digest: "sha256:arch-arm64" }],
      })
      .setManifest(digest("sha256:arch-amd64"), {})
      .setManifest(digest("sha256:arch-arm64"), {});
    // The plan wrongly deletes one child of the still-live index.
    fake.addVersion({
      id: 1,
      digest: digest("sha256:arch-arm64"),
      createdAt: new Date(),
      reportedTags: [],
    });
    fake.setDeleteSideEffect(1, () =>
      fake.setManifest(digest("sha256:arch-arm64"), { notFound: true }),
    );

    const { mutator } = fake.mutator();
    const { sink, incidents } = memoryRegressionSink();
    const verification: VerificationOptions = {
      registry: fake.registryReader(),
      canary: { path: canaryPath, tag: canaryTag },
      sink,
    };

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);
    const result = await applyPlan(plan, mutator, { budget: 100, verification });

    expect(result.abortedFor?.kind).toBe("regression");
    expect(incidents[0]?.tags).toEqual([
      expect.objectContaining({
        tag: tag("latest"),
        digestBefore: digest("sha256:index"),
        digestAfter: digest("sha256:index"),
        stillResolves: true,
        digestUnchanged: true,
        closureResolves: false,
      }),
    ]);
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_SAFETY);
  });
});

describe("applyPlan — post-apply verification: pre-existing damage", () => {
  it("reports a tag broken in both pre and post as pre-existing, not a regression, and the run completes", async () => {
    const fake = withHealthyCanary(new FakeGhcr());
    // Already-hollow before this run starts; nothing in the plan touches it.
    fake.setTag(tag("already-broken"), digest("sha256:hollow"));
    fake.setManifest(digest("sha256:hollow"), { notFound: true });
    fake.setManifest(digest("sha256:garbage"), {});
    fake.addVersion({
      id: 1,
      digest: digest("sha256:garbage"),
      createdAt: new Date(),
      reportedTags: [],
    });

    const { mutator, deletedVersionIds } = fake.mutator();
    const { sink, incidents } = memoryRegressionSink();
    const verification: VerificationOptions = {
      registry: fake.registryReader(),
      canary: { path: canaryPath, tag: canaryTag },
      sink,
    };

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);
    const result = await applyPlan(plan, mutator, { budget: 100, verification });

    expect(deletedVersionIds).toEqual([1]);
    expect(result.abortedFor).toBeUndefined();
    expect(incidents).toEqual([]); // no regression recorded — pre-existing damage is not sunk
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_OK);
  });
});

describe("applyPlan — post-apply verification: pre-snapshot failure", () => {
  it("treats every broken post tag as a regression under the strict posture, even though the break might have predated this run", async () => {
    const fake = withHealthyCanary(new FakeGhcr());
    fake.setTag(tag("latest"), digest("sha256:live")).setManifest(digest("sha256:live"), {});
    fake.addVersion({
      id: 1,
      digest: digest("sha256:live"),
      createdAt: new Date(),
      reportedTags: [],
    });
    fake.setDeleteSideEffect(1, () => fake.setManifest(digest("sha256:live"), { notFound: true }));

    const { mutator, attemptedVersionIds } = fake.mutator();
    const { sink, incidents } = memoryRegressionSink();
    const verification: VerificationOptions = {
      registry: registryThatFailsListTagsOnce(fake.registryReader()),
      canary: { path: canaryPath, tag: canaryTag },
      sink,
    };

    const plan = planWithPackages([
      { packageName: pkgA, groups: [group(1, [1])] },
      { packageName: pkgB, groups: [group(10, [10])] },
    ]);
    const result = await applyPlan(plan, mutator, { budget: 100, verification });

    expect(attemptedVersionIds).toEqual([1]); // pkgB never touched
    expect(result.abortedFor?.kind).toBe("regression");
    expect(incidents).toHaveLength(1);
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_SAFETY);
  });
});

describe("applyPlan — post-apply verification: post-snapshot failure (the false-positive regression this fixes)", () => {
  it("does NOT trip the breaker when the post-snapshot read itself fails, even though every pre-apply tag was healthy — it aborts as verification-unavailable instead", async () => {
    const fake = withHealthyCanary(new FakeGhcr());
    // Nothing here is actually broken — this run's deletions are clean.
    fake
      .setTag(tag("latest"), digest("sha256:live"))
      .setManifest(digest("sha256:live"), {})
      .setManifest(digest("sha256:garbage"), {});
    fake.addVersion({
      id: 1,
      digest: digest("sha256:garbage"),
      createdAt: new Date(),
      reportedTags: [],
    });

    const { mutator, deletedVersionIds } = fake.mutator();
    const { sink, incidents } = memoryRegressionSink();
    const verification: VerificationOptions = {
      registry: registryThatFailsSecondListTags(fake.registryReader()),
      canary: { path: canaryPath, tag: canaryTag },
      sink,
    };

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);
    const result = await applyPlan(plan, mutator, { budget: 100, verification });

    // The deletion itself succeeded — this is purely a post-apply read failure.
    expect(deletedVersionIds).toEqual([1]);
    // The breaker must NEVER be told about this: nothing is confirmed broken.
    expect(incidents).toEqual([]);
    expect(result.abortedFor?.kind).toBe("verification-unavailable");
    const unavailable = result.abortedFor as {
      packageName: unknown;
      tags: readonly { tag: string }[];
    };
    expect(unavailable.packageName).toBe(pkgA);
    expect(unavailable.tags.map((t) => t.tag)).toContain(tag("latest"));
    // Still a hard failure, not a silent pass — an operator must not be
    // told the run was clean when nothing was actually confirmed.
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_SAFETY);
  });

  it("still reports a CONFIRMED pre-existing break as pre-existing even when the post-snapshot as a whole fails elsewhere in this package's tag set", async () => {
    // A tag that already 404s pre-apply, read successfully in a
    // pre-snapshot that itself does NOT fail — only the post-snapshot
    // fails wholesale, so every tag (including this pre-existing one)
    // ends up "unknown" post-apply, not silently reclassified as newly
    // regressed or newly pre-existing.
    const fake = withHealthyCanary(new FakeGhcr());
    fake.setTag(tag("already-broken"), digest("sha256:hollow"));
    fake.setManifest(digest("sha256:hollow"), { notFound: true });
    fake.setManifest(digest("sha256:garbage"), {});
    fake.addVersion({
      id: 1,
      digest: digest("sha256:garbage"),
      createdAt: new Date(),
      reportedTags: [],
    });

    const { mutator } = fake.mutator();
    const { sink, incidents } = memoryRegressionSink();
    const verification: VerificationOptions = {
      registry: registryThatFailsSecondListTags(fake.registryReader()),
      canary: { path: canaryPath, tag: canaryTag },
      sink,
    };

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);
    const result = await applyPlan(plan, mutator, { budget: 100, verification });

    expect(incidents).toEqual([]); // never a regression
    expect(result.abortedFor?.kind).toBe("verification-unavailable");
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_SAFETY);
  });
});

describe("applyPlan — post-apply verification: both snapshots fail operationally", () => {
  it("aborts as verification-unavailable with no tag data at all, rather than silently reporting a clean run", async () => {
    const fake = withHealthyCanary(new FakeGhcr());
    fake.setTag(tag("latest"), digest("sha256:live")).setManifest(digest("sha256:live"), {});
    fake.addVersion({
      id: 1,
      digest: digest("sha256:live"),
      createdAt: new Date(),
      reportedTags: [],
    });

    const inner = fake.registryReader();
    const alwaysFailsListTags: RegistryReader = {
      listTags: () => {
        throw new Error("registry read is down");
      },
      resolve: (p, ref) => inner.resolve(p, ref),
    };

    const { mutator } = fake.mutator();
    const { sink, incidents } = memoryRegressionSink();
    const verification: VerificationOptions = {
      registry: alwaysFailsListTags,
      canary: { path: canaryPath, tag: canaryTag },
      sink,
    };

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);
    const result = await applyPlan(plan, mutator, { budget: 100, verification });

    expect(incidents).toEqual([]);
    expect(result.abortedFor).toEqual({
      kind: "verification-unavailable",
      packageName: pkgA,
      tags: [],
    });
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_SAFETY);
  });
});

describe("applyPlan — post-apply verification: incident survives a broken sink (the breaker outage this fixes)", () => {
  it("calls onIncident BEFORE sink.record, and still returns a normal abort result (with the run summary intact) when sink.record throws", async () => {
    const fake = withHealthyCanary(new FakeGhcr());
    fake.setTag(tag("latest"), digest("sha256:live")).setManifest(digest("sha256:live"), {});
    fake.addVersion({
      id: 1,
      digest: digest("sha256:live"),
      createdAt: new Date(),
      reportedTags: [],
    });
    fake.setDeleteSideEffect(1, () => fake.setManifest(digest("sha256:live"), { notFound: true }));

    const { mutator, attemptedVersionIds } = fake.mutator();
    const callOrder: string[] = [];
    const sink = {
      record: () => {
        callOrder.push("sink");
        return Promise.reject(new Error("simulated 404: breaker token cannot write issues"));
      },
    };
    const verification: VerificationOptions = {
      registry: fake.registryReader(),
      canary: { path: canaryPath, tag: canaryTag },
      sink,
      onIncident: () => {
        callOrder.push("onIncident");
      },
    };

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);
    // Must not throw — a thrown sink error used to propagate all the way
    // out of applyPlan, killing the run before the CLI could print its
    // summary line at all.
    const result = await applyPlan(plan, mutator, { budget: 100, verification });

    expect(attemptedVersionIds).toEqual([1]);
    expect(callOrder).toEqual(["onIncident", "sink"]); // recorded locally before the network call
    expect(result.abortedFor).toEqual({
      kind: "regression",
      packageName: pkgA,
      tags: [expect.objectContaining({ tag: tag("latest") }) as unknown],
      sinkError: "simulated 404: breaker token cannot write issues",
    });
    // The run summary is still fully computable from `result` — nothing
    // about the sink failure erased `attempted`/`remainingBudget`.
    expect(result.attempted).toBe(1);
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_SAFETY);
  });

  it("onIncident is called even when the confirmed regression's sink succeeds (breaker healthy) — sinkError is absent", async () => {
    const fake = withHealthyCanary(new FakeGhcr());
    fake.setTag(tag("latest"), digest("sha256:live")).setManifest(digest("sha256:live"), {});
    fake.addVersion({
      id: 1,
      digest: digest("sha256:live"),
      createdAt: new Date(),
      reportedTags: [],
    });
    fake.setDeleteSideEffect(1, () => fake.setManifest(digest("sha256:live"), { notFound: true }));

    const { mutator } = fake.mutator();
    const { sink, incidents } = memoryRegressionSink();
    let onIncidentCalls = 0;
    const verification: VerificationOptions = {
      registry: fake.registryReader(),
      canary: { path: canaryPath, tag: canaryTag },
      sink,
      onIncident: () => {
        onIncidentCalls += 1;
      },
    };

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);
    const result = await applyPlan(plan, mutator, { budget: 100, verification });

    expect(onIncidentCalls).toBe(1);
    expect(incidents).toHaveLength(1);
    expect(result.abortedFor?.kind).toBe("regression");
    expect((result.abortedFor as { sinkError?: string }).sinkError).toBeUndefined();
  });
});

describe("applyPlan — post-apply verification: pre-flight canary", () => {
  it("aborts before any deletion is attempted when the canary itself fails to resolve", async () => {
    const fake = new FakeGhcr();
    // No canary tag/manifest set up at all — canary resolution 404s.
    fake.setManifest(digest("sha256:garbage"), {});
    fake.addVersion({
      id: 1,
      digest: digest("sha256:garbage"),
      createdAt: new Date(),
      reportedTags: [],
    });

    const { mutator, attemptedVersionIds } = fake.mutator();
    const { sink, incidents } = memoryRegressionSink();
    const verification: VerificationOptions = {
      registry: fake.registryReader(),
      canary: { path: canaryPath, tag: canaryTag },
      sink,
    };

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);
    const result = await applyPlan(plan, mutator, { budget: 100, verification });

    expect(attemptedVersionIds).toEqual([]);
    expect(result.abortedFor).toEqual({
      kind: "canary-failed",
      path: canaryPath,
      tag: canaryTag,
      reason: { kind: "resolve-failed", state: "not-found" },
    });
    expect(result.packages).toEqual([]);
    expect(incidents).toEqual([]); // canary failure is not a regression incident
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_SAFETY);
  });

  it("still attempts zero deletions and leaves the budget untouched when the canary is broken", async () => {
    const fake = new FakeGhcr();
    fake.setManifest(digest("sha256:garbage"), {});
    fake.addVersion({
      id: 1,
      digest: digest("sha256:garbage"),
      createdAt: new Date(),
      reportedTags: [],
    });

    const { mutator } = fake.mutator();
    const { sink } = memoryRegressionSink();
    const verification: VerificationOptions = {
      registry: fake.registryReader(),
      canary: { path: canaryPath, tag: canaryTag },
      sink,
    };

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);
    const result = await applyPlan(plan, mutator, { budget: 100, verification });

    expect(result.attempted).toBe(0);
    expect(result.remainingBudget).toBe(100);
  });

  it("aborts with the thrown error's message when resolving the canary itself throws", async () => {
    const fake = withHealthyCanary(new FakeGhcr());
    fake.setManifest(digest("sha256:garbage"), {});
    fake.addVersion({
      id: 1,
      digest: digest("sha256:garbage"),
      createdAt: new Date(),
      reportedTags: [],
    });

    const inner = fake.registryReader();
    const throwingRegistry: RegistryReader = {
      listTags: (p) => inner.listTags(p),
      resolve: () => Promise.reject(new Error("simulated network failure")),
    };

    const { mutator, attemptedVersionIds } = fake.mutator();
    const { sink } = memoryRegressionSink();
    const verification: VerificationOptions = {
      registry: throwingRegistry,
      canary: { path: canaryPath, tag: canaryTag },
      sink,
    };

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);
    const result = await applyPlan(plan, mutator, { budget: 100, verification });

    expect(attemptedVersionIds).toEqual([]);
    expect(result.abortedFor).toEqual({
      kind: "canary-failed",
      path: canaryPath,
      tag: canaryTag,
      reason: { kind: "error", message: "simulated network failure" },
    });
  });
});
