import { describe, expect, it } from "vitest";
import { digest, tag } from "./domain.js";
import { computeKeepRoots, type LiveRoot, type RetentionPolicy } from "./retain.js";
import type { PackageVersionRecord } from "./ports.js";

function root(d: string, tags: string[]): LiveRoot {
  return { digest: digest(d), tags: new Set(tags.map((t) => tag(t))) };
}

function versionRecord(d: string, createdAt: string): PackageVersionRecord {
  return { id: 1, digest: digest(d), createdAt: new Date(createdAt), reportedTags: [] };
}

const now = new Date("2026-09-11T00:00:00Z");

const basePolicy: RetentionPolicy = {
  protectedTagPatterns: [],
  keepLast: 0,
  keepDays: 0,
};

describe("computeKeepRoots", () => {
  it("keeps a digest carrying a protected tag", () => {
    const roots = [root("sha256:a", ["latest"])];
    const versionsByDigest = new Map([
      [digest("sha256:a"), versionRecord("sha256:a", "2020-01-01")],
    ]);
    const policy: RetentionPolicy = { ...basePolicy, protectedTagPatterns: [/^latest$/] };

    const keep = computeKeepRoots(roots, versionsByDigest, policy, now);

    expect(keep.has(digest("sha256:a"))).toBe(true);
  });

  it("protecting one tag protects every other tag on the SAME digest (digest-scoped)", () => {
    const roots = [root("sha256:a", ["latest", "3.38", "3.38.1"])];
    const versionsByDigest = new Map([
      [digest("sha256:a"), versionRecord("sha256:a", "2020-01-01")],
    ]);
    const policy: RetentionPolicy = { ...basePolicy, protectedTagPatterns: [/^latest$/] };

    const keep = computeKeepRoots(roots, versionsByDigest, policy, now);

    // The digest is protected once, which implicitly protects every alias.
    expect(keep.has(digest("sha256:a"))).toBe(true);
  });

  it("keeps the newest N roots by keepLast, regardless of tag or age", () => {
    const roots = [root("sha256:a", ["v1"]), root("sha256:b", ["v2"]), root("sha256:c", ["v3"])];
    const versionsByDigest = new Map([
      [digest("sha256:a"), versionRecord("sha256:a", "2020-01-01")],
      [digest("sha256:b"), versionRecord("sha256:b", "2020-06-01")],
      [digest("sha256:c"), versionRecord("sha256:c", "2020-03-01")],
    ]);
    const policy: RetentionPolicy = { ...basePolicy, keepLast: 1 };

    const keep = computeKeepRoots(roots, versionsByDigest, policy, now);

    expect(keep.has(digest("sha256:b"))).toBe(true); // newest
    expect(keep.has(digest("sha256:a"))).toBe(false);
    expect(keep.has(digest("sha256:c"))).toBe(false);
  });

  it("keeps a root younger than keepDays", () => {
    const roots = [root("sha256:a", ["v1"])];
    const versionsByDigest = new Map([
      [digest("sha256:a"), versionRecord("sha256:a", "2026-09-10")],
    ]);
    const policy: RetentionPolicy = { ...basePolicy, keepDays: 30 };

    const keep = computeKeepRoots(roots, versionsByDigest, policy, now);

    expect(keep.has(digest("sha256:a"))).toBe(true);
  });

  it("does not keep an old, unprotected, non-newest root", () => {
    const roots = [root("sha256:a", ["v1"])];
    const versionsByDigest = new Map([
      [digest("sha256:a"), versionRecord("sha256:a", "2020-01-01")],
    ]);
    const policy: RetentionPolicy = { protectedTagPatterns: [], keepLast: 0, keepDays: 1 };

    const keep = computeKeepRoots(roots, versionsByDigest, policy, now);

    expect(keep.has(digest("sha256:a"))).toBe(false);
  });

  it("retains a root with no matching Packages API entry (unknown age is fail-safe)", () => {
    const roots = [root("sha256:a", ["v1"])];
    const versionsByDigest = new Map<ReturnType<typeof digest>, PackageVersionRecord>();
    const policy: RetentionPolicy = { protectedTagPatterns: [], keepLast: 0, keepDays: 1 };

    const keep = computeKeepRoots(roots, versionsByDigest, policy, now);

    expect(keep.has(digest("sha256:a"))).toBe(true);
  });
});
