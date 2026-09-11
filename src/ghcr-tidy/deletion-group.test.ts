import { describe, expect, it } from "vitest";
import { digest, registryPathFor } from "./domain.js";
import { packageName } from "../core/registry/package-name.js";
import { assertNoSurvivingParent, buildDeletionGroups } from "./deletion-group.js";
import { FakeGhcr } from "./fake-ghcr.js";

const path = registryPathFor("pyck-ai", packageName("golang"));

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
