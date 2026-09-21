import { describe, expect, it } from "vitest";
import { digest, tag } from "./domain.js";
import {
  computeFloorTags,
  computeKeepRoots,
  computeRetainedTags,
  type LiveRoot,
  type RetentionPolicy,
} from "./retain.js";
import { loadBaseimagesTags } from "./__fixtures__/load-baseimages-tags.js";

function root(d: string, tags: string[]): LiveRoot {
  return { digest: digest(d), tags: new Set(tags.map((t) => tag(t))) };
}

describe("computeRetainedTags — unversioned tags are always-retained singletons", () => {
  it("retains an unversioned tag unconditionally, even under a policy that keeps nothing versioned", () => {
    const retained = computeRetainedTags([tag("latest")], {
      keepMajors: 0,
      keepMinors: 0,
      keepPatches: 0,
    });
    expect(retained.has(tag("latest"))).toBe(true);
  });

  it("every unversioned tag is retained independently, with no configured allow-list anywhere", () => {
    const retained = computeRetainedTags(
      [tag("latest"), tag("alpine"), tag("debian"), tag("debian-trixie")],
      { keepMajors: 0, keepMinors: 0, keepPatches: 0 },
    );
    expect(retained).toEqual(
      new Set([tag("latest"), tag("alpine"), tag("debian"), tag("debian-trixie")]),
    );
  });
});

describe("computeRetainedTags — the version lattice and its three fixed levels", () => {
  const policy: RetentionPolicy = { keepMajors: 1, keepMinors: 1, keepPatches: 1 };

  it("a patch tag requires its major AND minor to be kept — enclosing-level survival (AC 3)", () => {
    const tags = [tag("1"), tag("1.0"), tag("1.0.0"), tag("2"), tag("2.0"), tag("2.0.0")];
    const retained = computeRetainedTags(tags, policy);
    // Only major 2 (the newest) survives at every level.
    expect(retained.has(tag("2"))).toBe(true);
    expect(retained.has(tag("2.0"))).toBe(true);
    expect(retained.has(tag("2.0.0"))).toBe(true);
    expect(retained.has(tag("1"))).toBe(false);
    expect(retained.has(tag("1.0"))).toBe(false);
    expect(retained.has(tag("1.0.0"))).toBe(false);
  });

  it("a minor tag requires only its major to be kept, independent of any patch window", () => {
    const retained = computeRetainedTags([tag("1"), tag("1.5")], {
      keepMajors: 1,
      keepMinors: 1,
      keepPatches: 0,
    });
    expect(retained.has(tag("1"))).toBe(true);
    expect(retained.has(tag("1.5"))).toBe(true);
  });

  it("AC 4: a minor alias never competes against a patch tag for a place in the patch window — structurally separate candidate sets", () => {
    // keepPatches: 1, but the corpus has one minor alias and two patch
    // tags. If the minor alias could occupy a patch-window slot, the
    // window would only fit ONE of the two real patches. It must not:
    // the minor alias is retained via the MINOR window, and the patch
    // window still picks the single newest PATCH.
    const tags = [tag("1.26"), tag("1.26.4"), tag("1.26.5")];
    const retained = computeRetainedTags(tags, {
      keepMajors: 1,
      keepMinors: 1,
      keepPatches: 1,
    });
    expect(retained.has(tag("1.26"))).toBe(true); // via the minor window
    expect(retained.has(tag("1.26.5"))).toBe(true); // newest patch
    expect(retained.has(tag("1.26.4"))).toBe(false); // NOT bumped by the minor alias
  });

  it("AC 5: a kind whose only member is minor-level, with no major-level tag, is retained correctly (golang's real shape)", () => {
    // No "alpine-3" tag exists anywhere — only "alpine-3.23". The major
    // candidate `3` must still be derived from this minor-level entry.
    const retained = computeRetainedTags([tag("alpine-3.23")], {
      keepMajors: 1,
      keepMinors: 1,
      keepPatches: 1,
    });
    expect(retained.has(tag("alpine-3.23"))).toBe(true);
  });

  it("HARD CASE: base's alpine vs alpine-3.23 are different kinds — the collision dissolves", () => {
    const retained = computeRetainedTags([tag("alpine"), tag("alpine-3.23")], {
      keepMajors: 0,
      keepMinors: 0,
      keepPatches: 0,
    });
    // "alpine" is unversioned (always retained); "alpine-3.23" is
    // versioned and excluded by the top-0 majors window.
    expect(retained.has(tag("alpine"))).toBe(true);
    expect(retained.has(tag("alpine-3.23"))).toBe(false);
  });

  it("HARD CASE: suffix variants are separate kinds — a missing -alpine build never expires the -debian one", () => {
    // python's real shape: 3.13-debian exists, 3.13-alpine does not.
    // Folding suffixes would make the (nonexistent) -alpine kind's
    // absence irrelevant to -debian's own window either way, but this
    // asserts the two kinds are windowed completely independently: a
    // newer -alpine build must never expire an older, still-current
    // -debian build.
    const tags = [tag("3.13-debian"), tag("3.14-alpine"), tag("3.14-debian")];
    const retained = computeRetainedTags(tags, { keepMajors: 1, keepMinors: 1, keepPatches: 1 });
    // "-debian" kind: majors {3} — both 3.13-debian and 3.14-debian are
    // minor-level under major 3, so only the newest minor (3.14) survives.
    expect(retained.has(tag("3.14-debian"))).toBe(true);
    expect(retained.has(tag("3.13-debian"))).toBe(false);
    // "-alpine" kind has exactly one member — trivially retained.
    expect(retained.has(tag("3.14-alpine"))).toBe(true);
  });
});

describe("computeKeepRoots — a root is kept iff at least one of its tags is retained", () => {
  it("keeps a root carrying an unversioned tag, regardless of policy", () => {
    const roots = [root("sha256:a", ["latest"])];
    const keep = computeKeepRoots(roots, { keepMajors: 0, keepMinors: 0, keepPatches: 0 });
    expect(keep.has(digest("sha256:a"))).toBe(true);
  });

  it("keeping one tag on a digest implicitly keeps every other tag sharing it (digest-scoped)", () => {
    const roots = [root("sha256:a", ["latest", "1.0", "1.0.0"])];
    const keep = computeKeepRoots(roots, { keepMajors: 0, keepMinors: 0, keepPatches: 0 });
    expect(keep.has(digest("sha256:a"))).toBe(true);
  });

  it("excludes a root whose only tag falls outside its kind's kept window", () => {
    const roots = [root("sha256:a", ["1.0"]), root("sha256:b", ["2.0"])];
    const keep = computeKeepRoots(roots, { keepMajors: 1, keepMinors: 1, keepPatches: 1 });
    expect(keep.has(digest("sha256:b"))).toBe(true); // newest major
    expect(keep.has(digest("sha256:a"))).toBe(false);
  });

  it("AC 6: a digest is excluded unless EVERY one of its tags is expired — no weighting, no threshold, no partial rule", () => {
    // "sha256:a" carries both an expired versioned tag and a retained
    // unversioned one — the existential means ANY retained tag suffices.
    const roots = [root("sha256:a", ["9.9.9", "latest"])];
    const keep = computeKeepRoots(roots, { keepMajors: 0, keepMinors: 0, keepPatches: 0 });
    expect(keep.has(digest("sha256:a"))).toBe(true);
  });
});

describe("computeFloorTags — the newest literal tag of every kind, independent of policy", () => {
  it("an unversioned tag's floor is itself", () => {
    expect(computeFloorTags([tag("latest")])).toEqual(new Set([tag("latest")]));
  });

  it("the newest version, by absolute comparison across levels, is the floor of its kind", () => {
    const floor = computeFloorTags([tag("1"), tag("1.5"), tag("1.5.2")]);
    expect(floor).toEqual(new Set([tag("1.5.2")]));
  });

  it("floor is computed per kind, not globally across a package", () => {
    const floor = computeFloorTags([tag("1.5"), tag("2.3-alpine")]);
    expect(floor).toEqual(new Set([tag("1.5"), tag("2.3-alpine")]));
  });
});

describe("AC 8/9/10 — the real baseimages corpus, at the recommended 1/3/5/30 policy", () => {
  const byPackage = loadBaseimagesTags();
  const policy: RetentionPolicy = { keepMajors: 1, keepMinors: 3, keepPatches: 5 };

  it("AC 9: all-in-one keeps exactly 74 of its 114 tags", () => {
    const tags = byPackage.get("all-in-one") ?? [];
    expect(tags).toHaveLength(114);
    const retained = computeRetainedTags(tags, policy);
    expect(retained.size).toBe(74);
  });

  it("AC 9: agent keeps exactly 72 of its 132 tags", () => {
    const tags = byPackage.get("agent") ?? [];
    expect(tags).toHaveLength(132);
    const retained = computeRetainedTags(tags, policy);
    expect(retained.size).toBe(72);
  });

  it("AC 9: at keepMinors 2 or higher, golang's frozen 1.26 line (and its debian-trixie twin) is retained, not expired — the incident this ships to fix", () => {
    const golang = byPackage.get("golang") ?? [];
    for (const keepMinors of [2, 3]) {
      const retained = computeRetainedTags(golang, { keepMajors: 1, keepMinors, keepPatches: 5 });
      expect(retained.has(tag("1.26"))).toBe(true);
      expect(retained.has(tag("1.26.5"))).toBe(true);
      // "debian-trixie" is unversioned, so its "twin" is really every
      // "-debian"-suffixed golang tag, which follows the SAME windowing
      // as the bare and "-alpine" kinds since all three distros build
      // from the same version set — see `tag-kind.ts`'s doc on the
      // "accepted wart" that this kind separation produces.
      expect(retained.has(tag("1.26-debian"))).toBe(true);
      expect(retained.has(tag("1.26.5-debian"))).toBe(true);
      expect(retained.has(tag("1.26-alpine"))).toBe(true);
      expect(retained.has(tag("1.26.5-alpine"))).toBe(true);
    }
  });

  it("AC 9: at keepMinors 1, the same golang 1.26 line falls outside the window (1.27 is newer) — proving N is the dial, not a constant", () => {
    const golang = byPackage.get("golang") ?? [];
    const retained = computeRetainedTags(golang, { keepMajors: 1, keepMinors: 1, keepPatches: 5 });
    expect(retained.has(tag("1.26"))).toBe(false);
    expect(retained.has(tag("1.26.5"))).toBe(false);
  });

  it("AC 10 (algorithm half): buildcache needs no special case — its 29 unversioned tags are retained by the algorithm alone", () => {
    const buildcache = byPackage.get("buildcache") ?? [];
    expect(buildcache).toHaveLength(29);
    const retained = computeRetainedTags(buildcache, {
      keepMajors: 0,
      keepMinors: 0,
      keepPatches: 0,
    });
    expect(retained.size).toBe(29);
  });

  it("measured cross-check: all-in-one at 1/2/3 keeps 64, and at 1/1/1 keeps 40 (the pre-incident-equivalent posture)", () => {
    const tags = byPackage.get("all-in-one") ?? [];
    expect(computeRetainedTags(tags, { keepMajors: 1, keepMinors: 2, keepPatches: 3 }).size).toBe(
      64,
    );
    expect(computeRetainedTags(tags, { keepMajors: 1, keepMinors: 1, keepPatches: 1 }).size).toBe(
      40,
    );
  });

  it("measured cross-check: agent at 1/2/3 keeps 57, and at 1/1/1 keeps 30", () => {
    const tags = byPackage.get("agent") ?? [];
    expect(computeRetainedTags(tags, { keepMajors: 1, keepMinors: 2, keepPatches: 3 }).size).toBe(
      57,
    );
    expect(computeRetainedTags(tags, { keepMajors: 1, keepMinors: 1, keepPatches: 1 }).size).toBe(
      30,
    );
  });
});
