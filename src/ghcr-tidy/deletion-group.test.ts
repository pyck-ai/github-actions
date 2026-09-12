import { describe, expect, it } from "vitest";
import { digest, registryPathFor, type Digest, type RegistryPath, type Tag } from "./domain.js";
import { packageName } from "../core/registry/package-name.js";
import { assertNoSurvivingParent, buildDeletionGroups } from "./deletion-group.js";
import { FakeGhcr } from "./fake-ghcr.js";
import type { ManifestResolution } from "../core/registry/manifest.js";
import type { RegistryReader } from "./ports.js";

const path = registryPathFor("pyck-ai", packageName("golang"));

/** Wraps a {@link RegistryReader} so resolving `ref` waits `delayFor.get(ref) ?? 0` ms before delegating — lets a test invert real-time completion order relative to candidate/discovery order. */
function delayed(inner: RegistryReader, delayFor: ReadonlyMap<string, number>): RegistryReader {
  return {
    listTags: (p) => inner.listTags(p),
    resolve: (p: RegistryPath, ref: Digest | Tag): Promise<ManifestResolution> => {
      const ms = delayFor.get(ref) ?? 0;
      return new Promise((resolve) => {
        setTimeout(() => {
          inner.resolve(p, ref).then(resolve);
        }, ms);
      });
    },
  };
}

describe("buildDeletionGroups", () => {
  it("groups an aged-out root with all of its children, root ordered first", async () => {
    const fake = new FakeGhcr();
    fake.setManifest(digest("sha256:root"), {
      children: [
        { digest: "sha256:c1" },
        { digest: "sha256:c2" },
        { digest: "sha256:c3" },
        { digest: "sha256:c4" },
      ],
    });

    const deleteSet = new Set(
      ["sha256:root", "sha256:c1", "sha256:c2", "sha256:c3", "sha256:c4"].map((d) => digest(d)),
    );
    const rootChildren = new Map([
      [
        digest("sha256:root"),
        ["sha256:c1", "sha256:c2", "sha256:c3", "sha256:c4"].map((d) => digest(d)),
      ],
    ]);
    const liveRootDigests = new Set([digest("sha256:root")]);

    const groups = await buildDeletionGroups(
      path,
      deleteSet,
      liveRootDigests,
      rootChildren,
      fake.registryReader(),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.root).toBe(digest("sha256:root"));
    expect(groups[0]?.members[0]).toBe(digest("sha256:root"));
    expect(groups[0]?.members).toHaveLength(5);
  });

  it("excludes a child still reachable via another (kept) root from every group", async () => {
    // A survives (kept), B is deleted. C is shared — since it's reachable
    // via A, it was never in deleteSet at all, so B's group must not claim it.
    const deleteSet = new Set([digest("sha256:b")]);
    const rootChildren = new Map([
      [digest("sha256:b"), [digest("sha256:c")]], // B still points at C, but C is not in deleteSet
    ]);
    const liveRootDigests = new Set([digest("sha256:b")]);
    const fake = new FakeGhcr();

    const groups = await buildDeletionGroups(
      path,
      deleteSet,
      liveRootDigests,
      rootChildren,
      fake.registryReader(),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.members).toEqual([digest("sha256:b")]);
  });

  it("groups an orphaned digest (never a live root) as its own singleton", async () => {
    const deleteSet = new Set([digest("sha256:orphan")]);
    const fake = new FakeGhcr();

    const groups = await buildDeletionGroups(
      path,
      deleteSet,
      new Set(),
      new Map(),
      fake.registryReader(),
    );

    expect(groups).toEqual([{ root: digest("sha256:orphan"), members: [digest("sha256:orphan")] }]);
  });

  it("produces deterministic, sorted output across repeated calls on the same world", async () => {
    const fake = new FakeGhcr();
    const deleteSet = new Set(["sha256:z", "sha256:a", "sha256:m"].map((d) => digest(d)));
    const liveRootDigests = new Set([...deleteSet]);

    const first = await buildDeletionGroups(
      path,
      deleteSet,
      liveRootDigests,
      new Map(),
      fake.registryReader(),
    );
    const second = await buildDeletionGroups(
      path,
      deleteSet,
      liveRootDigests,
      new Map(),
      fake.registryReader(),
    );

    expect(first).toEqual(second);
    expect(first.map((g) => g.root)).toEqual([
      digest("sha256:a"),
      digest("sha256:m"),
      digest("sha256:z"),
    ]);
  });

  it("a digest shared by two candidate roots' closures is claimed by the FIRST candidate in fixed order, with parents-first member order preserved", async () => {
    // r1 and r2 both point at the same shared descendant D, which itself
    // has a further descendant E. Both r1 and r2 are live-root candidates
    // (sorted "sha256:r1" before "sha256:r2"), so the ORIGINAL sequential
    // algorithm would fully expand r1 into D and E first, leaving r2 with
    // nothing but itself — this pins that exact ownership + order.
    const build = (): FakeGhcr => {
      const fake = new FakeGhcr();
      fake
        .setManifest(digest("sha256:r1"), { children: [{ digest: "sha256:d" }] })
        .setManifest(digest("sha256:r2"), { children: [{ digest: "sha256:d" }] })
        .setManifest(digest("sha256:d"), { children: [{ digest: "sha256:e" }] })
        .setManifest(digest("sha256:e"), {});
      return fake;
    };

    const deleteSet = new Set(
      ["sha256:r1", "sha256:r2", "sha256:d", "sha256:e"].map((d) => digest(d)),
    );
    const liveRootDigests = new Set([digest("sha256:r1"), digest("sha256:r2")]);

    const groups = await buildDeletionGroups(
      path,
      deleteSet,
      liveRootDigests,
      new Map(),
      build().registryReader(),
    );

    expect(groups).toEqual([
      {
        root: digest("sha256:r1"),
        members: [digest("sha256:r1"), digest("sha256:d"), digest("sha256:e")],
      },
      { root: digest("sha256:r2"), members: [digest("sha256:r2")] },
    ]);
  });

  it("determinism under concurrency: reversed completion order across candidates does not change group ownership or member order", async () => {
    // Regression test for buildDeletionGroups' two-phase parallelisation
    // (previously a sequential `for` loop over candidates, each doing a
    // node-by-node sequential BFS). Every candidate's closure is now
    // computed concurrently via Promise.all; this wraps a real FakeGhcr
    // world with artificial, REVERSED latency (later-sorted candidates
    // and deeper descendants resolve FIRST) to prove the emitted groups
    // are identical to the synchronous baseline regardless of completion
    // order.
    const build = (): FakeGhcr => {
      const fake = new FakeGhcr();
      fake
        .setManifest(digest("sha256:r1"), { children: [{ digest: "sha256:d" }] })
        .setManifest(digest("sha256:r2"), { children: [{ digest: "sha256:d" }] })
        .setManifest(digest("sha256:r3"), { children: [{ digest: "sha256:c3" }] })
        .setManifest(digest("sha256:d"), { children: [{ digest: "sha256:e" }] })
        .setManifest(digest("sha256:e"), {})
        .setManifest(digest("sha256:c3"), {});
      return fake;
    };

    const deleteSet = new Set(
      ["sha256:r1", "sha256:r2", "sha256:r3", "sha256:d", "sha256:e", "sha256:c3"].map((d) =>
        digest(d),
      ),
    );
    const liveRootDigests = new Set([
      digest("sha256:r1"),
      digest("sha256:r2"),
      digest("sha256:r3"),
    ]);

    const baseline = await buildDeletionGroups(
      path,
      deleteSet,
      liveRootDigests,
      new Map(),
      build().registryReader(),
    );

    // Deliberately inverted vs. candidate order: "r3" (sorted last)
    // resolves fastest, "r1" (sorted first) slowest, and "e" resolves
    // before its own parent "d" would even be requested by a slower
    // candidate. A naive implementation relying on completion order
    // (rather than fixed candidate order) for ownership would hand "d"
    // and "e" to a different candidate, or reorder members.
    const delayFor = new Map<string, number>([
      ["sha256:r1", 10],
      ["sha256:r2", 6],
      ["sha256:r3", 0],
      ["sha256:d", 8],
      ["sha256:e", 2],
      ["sha256:c3", 0],
    ]);
    const withJitter = await buildDeletionGroups(
      path,
      deleteSet,
      liveRootDigests,
      new Map(),
      delayed(build().registryReader(), delayFor),
    );

    expect(withJitter).toEqual(baseline);
    expect(baseline).toEqual([
      {
        root: digest("sha256:r1"),
        members: [digest("sha256:r1"), digest("sha256:d"), digest("sha256:e")],
      },
      { root: digest("sha256:r2"), members: [digest("sha256:r2")] },
      { root: digest("sha256:r3"), members: [digest("sha256:r3"), digest("sha256:c3")] },
    ]);
  });
});

describe("assertNoSurvivingParent", () => {
  it("does not throw when no reachable parent references a deleted digest", () => {
    const deleteSet = new Set([digest("sha256:dead")]);
    const reachable = new Set([digest("sha256:alive")]);
    const edges = new Map([[digest("sha256:alive"), [digest("sha256:other")]]]);

    expect(() => assertNoSurvivingParent(deleteSet, reachable, edges)).not.toThrow();
  });

  it("throws when a reachable parent still references a digest in DELETE", () => {
    const deleteSet = new Set([digest("sha256:child")]);
    const reachable = new Set([digest("sha256:parent")]);
    const edges = new Map([[digest("sha256:parent"), [digest("sha256:child")]]]);

    expect(() => assertNoSurvivingParent(deleteSet, reachable, edges)).toThrow(/integrity/);
  });

  it("ignores edges from a parent that is not itself reachable", () => {
    const deleteSet = new Set([digest("sha256:child")]);
    const reachable = new Set<ReturnType<typeof digest>>();
    const edges = new Map([[digest("sha256:parent"), [digest("sha256:child")]]]);

    expect(() => assertNoSurvivingParent(deleteSet, reachable, edges)).not.toThrow();
  });
});
