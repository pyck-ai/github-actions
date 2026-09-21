import { describe, expect, it } from "vitest";
import { packageName } from "../../registry/package-name.js";
import { digest, registryPathFor, tag, type Tag } from "./domain.js";
import type { ResolvedPolicy } from "./manifest/schema.js";
import { FakeGhcr } from "./fake-ghcr.js";
import { memoryRegressionSink, nullExpiryProducer, type ExpiryProducer } from "./verify.js";
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

/** A minimal, fully-resolved policy for tests that only care about it being threaded through, not its values. */
const anyPolicy: ResolvedPolicy = {
  protectedTagPatterns: [],
  keepLast: 10,
  keepDays: 30,
  graceDays: 30,
};

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

describe("applyPlan — post-apply verification: republished tag (a concurrent publish, not a regression)", () => {
  it("does NOT abort, does NOT trip the breaker, and completes normally when a tag resolves cleanly before and after but to a different digest", async () => {
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
    // Someone else's CI republishes the tag mid-run, unrelated to this
    // run's own (correct) deletion of unrelated garbage — this run
    // cannot have caused this: deleting a manifest can only make a tag
    // fail to resolve, never repoint it.
    fake.setDeleteSideEffect(1, () => fake.setTag(tag("latest"), digest("sha256:other")));

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
    expect(incidents).toEqual([]); // never sunk to the breaker
    expect(result.packages[0]?.republishedTags).toEqual([
      expect.objectContaining({
        tag: tag("latest"),
        digestBefore: digest("sha256:live"),
        digestAfter: digest("sha256:other"),
        stillResolves: true,
        digestUnchanged: false,
        closureResolves: true,
      }),
    ]);
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_OK);
  });

  it("still aborts as a regression when the tag's CLOSURE breaks, even though its own digest also changed", async () => {
    const fake = withHealthyCanary(new FakeGhcr());
    fake
      .setTag(tag("latest"), digest("sha256:index"))
      .setManifest(digest("sha256:index"), {
        children: [{ digest: "sha256:arch-amd64" }, { digest: "sha256:arch-arm64" }],
      })
      .setManifest(digest("sha256:arch-amd64"), {})
      .setManifest(digest("sha256:arch-arm64"), {});
    fake.setManifest(digest("sha256:new-index"), {
      children: [{ digest: "sha256:arch-amd64" }, { digest: "sha256:missing-child" }],
    });
    fake.addVersion({
      id: 1,
      digest: digest("sha256:garbage"),
      createdAt: new Date(),
      reportedTags: [],
    });
    fake.setManifest(digest("sha256:garbage"), {});
    // A concurrent publish repoints the tag to a NEW index whose own
    // child is broken — the digest changed AND the closure is broken.
    // Closure breakage must still win: this is real, confirmed damage
    // regardless of why the digest also differs.
    fake.setDeleteSideEffect(1, () => fake.setTag(tag("latest"), digest("sha256:new-index")));

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
    expect(incidents).toHaveLength(1);
    expect(incidents[0]?.tags).toEqual([
      expect.objectContaining({
        tag: tag("latest"),
        stillResolves: true,
        digestUnchanged: false,
        closureResolves: false,
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

describe("applyPlan: expiry seam, shipped with the null producer (issue #22)", () => {
  /**
   * AC 8's end-to-end pin: with `nullExpiryProducer`, `verification.expiry`
   * present or absent must make NO observable difference to a run. Each
   * scenario below re-runs one of this file's existing setups twice, once
   * with `verification.expiry` wired to the null producer and once
   * without it, and asserts the two results are identical (same
   * attempted/remainingBudget/abortedFor/groups) with an empty `expired`
   * and `notExpired` bucket on every package either way.
   */
  function withNullExpiry(verification: VerificationOptions): VerificationOptions {
    return {
      ...verification,
      expiry: { producer: nullExpiryProducer, policyFor: () => anyPolicy },
    };
  }

  it("clean apply: identical result with and without the null producer wired", async () => {
    const fake = withHealthyCanary(new FakeGhcr());
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

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);

    const { mutator: mutatorA } = fake.mutator();
    const { sink: sinkA } = memoryRegressionSink();
    const verificationA: VerificationOptions = {
      registry: fake.registryReader(),
      canary: { path: canaryPath, tag: canaryTag },
      sink: sinkA,
    };
    const resultWithoutExpiry = await applyPlan(plan, mutatorA, {
      budget: 100,
      verification: verificationA,
    });

    // A second, independent fake world identical to the first: `apply`
    // mutates registry state as a side effect of deletion, so the same
    // fake cannot be replayed for a second run.
    const fake2 = withHealthyCanary(new FakeGhcr());
    fake2
      .setTag(tag("latest"), digest("sha256:live"))
      .setManifest(digest("sha256:live"), {})
      .setManifest(digest("sha256:garbage"), {});
    fake2.addVersion({
      id: 1,
      digest: digest("sha256:garbage"),
      createdAt: new Date(),
      reportedTags: [],
    });
    const { mutator: mutatorB } = fake2.mutator();
    const { sink: sinkB } = memoryRegressionSink();
    const verificationB: VerificationOptions = withNullExpiry({
      registry: fake2.registryReader(),
      canary: { path: canaryPath, tag: canaryTag },
      sink: sinkB,
    });
    const resultWithExpiry = await applyPlan(plan, mutatorB, {
      budget: 100,
      verification: verificationB,
    });

    expect(resultWithExpiry.attempted).toBe(resultWithoutExpiry.attempted);
    expect(resultWithExpiry.remainingBudget).toBe(resultWithoutExpiry.remainingBudget);
    expect(resultWithExpiry.abortedFor).toEqual(resultWithoutExpiry.abortedFor);
    expect(resultWithExpiry.packages[0]?.groups).toEqual(resultWithoutExpiry.packages[0]?.groups);
    expect(resultWithExpiry.packages[0]?.republishedTags).toEqual(
      resultWithoutExpiry.packages[0]?.republishedTags,
    );
    // The property AC 8 actually pins: the null producer never produces
    // a finding.
    expect(resultWithExpiry.packages[0]?.expiredTags).toEqual([]);
    expect(resultWithExpiry.packages[0]?.notExpiredTags).toEqual([]);
  });

  it("regression by disappearance: still aborts identically with the null producer wired (an unclassified-by-policy tag is never treated as intended)", async () => {
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
    const verification: VerificationOptions = withNullExpiry({
      registry: fake.registryReader(),
      canary: { path: canaryPath, tag: canaryTag },
      sink,
    });

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);
    const result = await applyPlan(plan, mutator, { budget: 100, verification });

    expect(attemptedVersionIds).toEqual([1]);
    expect(result.abortedFor).toEqual({
      kind: "regression",
      packageName: pkgA,
      tags: [expect.objectContaining({ tag: tag("latest"), stillResolves: false }) as unknown],
    });
    expect(incidents).toHaveLength(1);
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_SAFETY);
  });
});

describe("applyPlan: expiry seam, deliberate expiry (a tag the producer classifies as expired)", () => {
  /** A producer that always retires exactly the tags named in `expiring`, with an empty floor and nothing unclassifiable. */
  function producerExpiring(...expiring: Tag[]): ExpiryProducer {
    return {
      produce: (tags) => ({
        expiry: new Set(tags.filter((t) => expiring.includes(t))),
        floor: new Set(),
        unclassifiable: new Set(),
      }),
    };
  }

  it("a tag the producer expires does not trip the breaker and is reported under expiredTags, not as a regression", async () => {
    const fake = withHealthyCanary(new FakeGhcr());
    fake
      .setTag(tag("retired"), digest("sha256:old"))
      .setManifest(digest("sha256:old"), {})
      .setManifest(digest("sha256:garbage"), {});
    fake.addVersion({
      id: 1,
      digest: digest("sha256:old"),
      createdAt: new Date(),
      reportedTags: [],
    });
    // This run's own deletion retires the tag exactly as the (fake)
    // policy intended.
    fake.setDeleteSideEffect(1, () => fake.setManifest(digest("sha256:old"), { notFound: true }));

    const { mutator, deletedVersionIds } = fake.mutator();
    const { sink, incidents } = memoryRegressionSink();
    const verification: VerificationOptions = {
      registry: fake.registryReader(),
      canary: { path: canaryPath, tag: canaryTag },
      sink,
      expiry: { producer: producerExpiring(tag("retired")), policyFor: () => anyPolicy },
    };

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);
    const result = await applyPlan(plan, mutator, { budget: 100, verification });

    expect(deletedVersionIds).toEqual([1]);
    expect(result.abortedFor).toBeUndefined();
    expect(incidents).toEqual([]);
    expect(result.packages[0]?.expiredTags).toEqual([
      expect.objectContaining({ tag: tag("retired"), stillResolves: false }) as unknown,
    ]);
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_OK);
  });

  it("a tag the producer expected to expire but which still resolves is reported under notExpiredTags and does NOT abort the run", async () => {
    const fake = withHealthyCanary(new FakeGhcr());
    fake
      .setTag(tag("not-yet-retired"), digest("sha256:kept"))
      .setManifest(digest("sha256:kept"), {})
      .setManifest(digest("sha256:garbage"), {});
    fake.addVersion({
      id: 1,
      digest: digest("sha256:garbage"),
      createdAt: new Date(),
      reportedTags: [],
    });
    // "not-yet-retired" is never touched by this run's own deletion: it
    // is still healthy pre AND post, despite the producer expecting it
    // to be gone.

    const { mutator, deletedVersionIds } = fake.mutator();
    const { sink, incidents } = memoryRegressionSink();
    const verification: VerificationOptions = {
      registry: fake.registryReader(),
      canary: { path: canaryPath, tag: canaryTag },
      sink,
      expiry: {
        producer: producerExpiring(tag("not-yet-retired")),
        policyFor: () => anyPolicy,
      },
    };

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);
    const result = await applyPlan(plan, mutator, { budget: 100, verification });

    expect(deletedVersionIds).toEqual([1]);
    expect(result.abortedFor).toBeUndefined();
    expect(incidents).toEqual([]);
    expect(result.packages[0]?.notExpiredTags).toEqual([
      expect.objectContaining({ tag: tag("not-yet-retired"), stillResolves: true }) as unknown,
    ]);
    expect(result.packages[0]?.expiredTags).toEqual([]);
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_OK);
  });
});

describe("applyPlan: expiry seam, MISBEHAVING producer fails the run closed", () => {
  it("aborts with expiry-producer-invalid, BEFORE this package's own deletions, when the producer's expiry set overlaps its floor set", async () => {
    const fake = withHealthyCanary(new FakeGhcr());
    fake.setTag(tag("newest"), digest("sha256:a")).setManifest(digest("sha256:a"), {});
    fake.addVersion({
      id: 1,
      digest: digest("sha256:a"),
      createdAt: new Date(),
      reportedTags: [],
    });

    // Deliberately broken: puts the same tag in both `expiry` and
    // `floor`. Filtered to the tag this test cares about, because
    // `FakeGhcr.listTags` is not path-scoped (it returns every tag set
    // on the fake, including the canary's), so `tags` here also
    // contains `canary`: irrelevant noise this producer should ignore,
    // same as a real one would for a tag outside its own package.
    const misbehavingProducer: ExpiryProducer = {
      produce: (tags) => {
        const target = tags.filter((t) => t === tag("newest"));
        return { expiry: new Set(target), floor: new Set(target), unclassifiable: new Set() };
      },
    };

    const { mutator, attemptedVersionIds } = fake.mutator();
    const { sink, incidents } = memoryRegressionSink();
    const verification: VerificationOptions = {
      registry: fake.registryReader(),
      canary: { path: canaryPath, tag: canaryTag },
      sink,
      expiry: { producer: misbehavingProducer, policyFor: () => anyPolicy },
    };

    const plan = planWithPackages([{ packageName: pkgA, groups: [group(1, [1])] }]);
    const result = await applyPlan(plan, mutator, { budget: 100, verification });

    // Nothing for this package was ever attempted: the producer's own
    // invariant broke before any deletion was even started.
    expect(attemptedVersionIds).toEqual([]);
    expect(result.attempted).toBe(0);
    expect(result.remainingBudget).toBe(100);
    expect(result.packages).toEqual([]);
    expect(incidents).toEqual([]); // not a regression, never reaches the breaker
    expect(result.abortedFor).toEqual({
      kind: "expiry-producer-invalid",
      packageName: pkgA,
      reason: "floor-overlap",
      tags: [tag("newest")],
    });
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_SAFETY);
  });

  it("aborts with expiry-producer-invalid when the producer's expiry set contains a tag it itself reports unclassifiable, and never touches a LATER package", async () => {
    const fake = withHealthyCanary(new FakeGhcr());
    fake.setTag(tag("mystery"), digest("sha256:a")).setManifest(digest("sha256:a"), {});
    fake.addVersion({
      id: 1,
      digest: digest("sha256:a"),
      createdAt: new Date(),
      reportedTags: [],
    });
    fake.setTag(tag("also-mystery"), digest("sha256:b")).setManifest(digest("sha256:b"), {});
    fake.addVersion({
      id: 10,
      digest: digest("sha256:c"),
      createdAt: new Date(),
      reportedTags: [],
    });
    fake.setManifest(digest("sha256:c"), {});

    // Same `FakeGhcr` path-scoping caveat as the floor-overlap test
    // above: `canary` is filtered out as irrelevant noise, leaving only
    // the tag this test cares about.
    const misbehavingProducer: ExpiryProducer = {
      produce: (tags) => {
        const target = tags.filter((t) => t !== tag("canary"));
        // Admits it cannot classify anything, yet still retires it.
        return { expiry: new Set(target), floor: new Set(), unclassifiable: new Set(target) };
      },
    };

    const { mutator, attemptedVersionIds } = fake.mutator();
    const { sink } = memoryRegressionSink();
    const verification: VerificationOptions = {
      registry: fake.registryReader(),
      canary: { path: canaryPath, tag: canaryTag },
      sink,
      expiry: { producer: misbehavingProducer, policyFor: () => anyPolicy },
    };

    const plan = planWithPackages([
      { packageName: pkgA, groups: [group(1, [1])] },
      { packageName: pkgB, groups: [group(10, [10])] },
    ]);
    const result = await applyPlan(plan, mutator, { budget: 100, verification });

    expect(attemptedVersionIds).toEqual([]); // pkgB's group 10 was never attempted either
    expect(result.abortedFor).toEqual({
      kind: "expiry-producer-invalid",
      packageName: pkgA,
      reason: "unclassifiable-in-expiry",
      // `FakeGhcr.listTags` is not path-scoped, so pkgA's own
      // pre-snapshot already includes `also-mystery` (set for pkgB
      // below) alongside `mystery`, both are legitimately in scope for
      // this producer's obligation check on pkgA's tag list.
      tags: [tag("mystery"), tag("also-mystery")],
    });
    expect(classifyApplyExit(plan, result)).toBe(EXIT_APPLY_SAFETY);
  });
});
