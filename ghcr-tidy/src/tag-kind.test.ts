import { describe, expect, it } from "vitest";
import { tag } from "./domain.js";
import { compareVersionsAscending, kindKeyOf, parseTag, type ParsedTag } from "./tag-kind.js";
import { loadBaseimagesTags } from "./__fixtures__/load-baseimages-tags.js";

function versioned(prefix: string, suffix: string, version: readonly number[]): ParsedTag {
  return { kind: "versioned", prefix, suffix, version, level: version.length as 1 | 2 | 3 };
}

function unversioned(literal: string): ParsedTag {
  return { kind: "unversioned", literal };
}

describe("parseTag — the last-delimited VERSION_TOKEN rule", () => {
  it("a bare major-level tag has no prefix/suffix", () => {
    expect(parseTag(tag("1"))).toEqual(versioned("", "", [1]));
  });

  it("a minor-level tag with a prefix", () => {
    expect(parseTag(tag("alpine-3.23"))).toEqual(versioned("alpine-", "", [3, 23]));
  });

  it("a patch-level tag with prefix and suffix", () => {
    expect(parseTag(tag("claude-2.1.227-alpine"))).toEqual(
      versioned("claude-", "-alpine", [2, 1, 227]),
    );
  });

  it("REAL CORPUS HARD CASE: two numeric runs — the LAST one wins, not the first", () => {
    // A first-match/greedy parser would extract "3", yielding the
    // nonsense prefix "alpine-" and suffix "-claude-2.1.227". The last
    // qualifying run is "2.1.227", giving prefix "alpine-3-claude-".
    expect(parseTag(tag("alpine-3-claude-2.1.227"))).toEqual(
      versioned("alpine-3-claude-", "", [2, 1, 227]),
    );
  });

  it("a digit run not bounded by start/end/'-' on both sides never qualifies as a VERSION_TOKEN", () => {
    // "1" here is bounded by 'v' on the left, not '-' or start — no
    // qualifying token anywhere in the string, so the whole tag is
    // unversioned rather than misparsed.
    expect(parseTag(tag("v1-old"))).toEqual(unversioned("v1-old"));
    expect(parseTag(tag("v-old"))).toEqual(unversioned("v-old"));
  });

  it("no digits at all is unversioned", () => {
    expect(parseTag(tag("latest"))).toEqual(unversioned("latest"));
    expect(parseTag(tag("debian-trixie"))).toEqual(unversioned("debian-trixie"));
  });

  it("more than 3 version components is unversioned, never truncated", () => {
    expect(parseTag(tag("1.2.3.4"))).toEqual(unversioned("1.2.3.4"));
    expect(parseTag(tag("build-1.2.3.4-x"))).toEqual(unversioned("build-1.2.3.4-x"));
  });

  it("HARD CASE: base's alpine vs alpine-3.23 are different kinds — the collision dissolves", () => {
    const alpine = parseTag(tag("alpine"));
    const alpine323 = parseTag(tag("alpine-3.23"));
    expect(alpine).toEqual(unversioned("alpine"));
    expect(alpine323.kind).toBe("versioned");
    // Different kinds by construction: an unversioned literal's "kind
    // key" can never collide with any versioned (prefix, suffix) key.
    expect(kindKeyOf(alpine)).not.toBe(kindKeyOf(alpine323));
  });

  it("HARD CASE: suffix variants are separate kinds — alpine and debian never share a lattice", () => {
    const alpineVariant = parseTag(tag("claude-2.1.227-alpine"));
    const debianVariant = parseTag(tag("claude-2.1.227-debian"));
    expect(kindKeyOf(alpineVariant)).not.toBe(kindKeyOf(debianVariant));
  });
});

describe("kindKeyOf", () => {
  it("groups by (prefix, suffix) for versioned tags, regardless of version", () => {
    const a = parseTag(tag("golang-1.26"));
    const b = parseTag(tag("golang-1.27"));
    expect(kindKeyOf(a)).toBe(kindKeyOf(b));
  });

  it("every unversioned tag is its own singleton kind", () => {
    const a = parseTag(tag("latest"));
    const b = parseTag(tag("stable"));
    expect(kindKeyOf(a)).not.toBe(kindKeyOf(b));
  });
});

describe("compareVersionsAscending", () => {
  it("compares by numeric value, padding the shorter with zeros", () => {
    expect(compareVersionsAscending([1], [1, 0, 0])).toBe(0);
    expect(compareVersionsAscending([1], [1, 1])).toBeLessThan(0);
    expect(compareVersionsAscending([2], [1, 99])).toBeGreaterThan(0);
    expect(compareVersionsAscending([1, 26, 5], [1, 26, 4])).toBeGreaterThan(0);
  });
});

describe("AC 1 — the real corpus: all 362 tags decompose without error", () => {
  const byPackage = loadBaseimagesTags();

  it("every tag in every package parses to versioned or unversioned, never throws", () => {
    let total = 0;
    for (const [, tags] of byPackage) {
      for (const t of tags) {
        expect(() => parseTag(t)).not.toThrow();
        const parsed = parseTag(t);
        expect(parsed.kind === "versioned" || parsed.kind === "unversioned").toBe(true);
        if (parsed.kind === "versioned") {
          expect(parsed.version.length).toBeGreaterThanOrEqual(1);
          expect(parsed.version.length).toBeLessThanOrEqual(3);
          expect(parsed.version.every((n) => Number.isFinite(n))).toBe(true);
        }
        total += 1;
      }
    }
    expect(total).toBe(362);
  });

  it("HARD CASE from the real corpus: golang has alpine-3.23 (minor level) with NO alpine-3 tag at all", () => {
    const golang = byPackage.get("golang") ?? [];
    expect(golang).toContain(tag("alpine-3.23"));
    expect(golang).not.toContain(tag("alpine-3"));
    expect(parseTag(tag("alpine-3.23"))).toEqual(versioned("alpine-", "", [3, 23]));
  });

  it("HARD CASE from the real corpus: python has 3.13-debian with no 3.13-alpine", () => {
    const python = byPackage.get("python") ?? [];
    expect(python).toContain(tag("3.13-debian"));
    expect(python).not.toContain(tag("3.13-alpine"));
  });

  it("HARD CASE from the real corpus: buildcache is 29 tags, all unversioned singletons", () => {
    const buildcache = byPackage.get("buildcache") ?? [];
    expect(buildcache).toHaveLength(29);
    for (const t of buildcache) {
      expect(parseTag(t).kind).toBe("unversioned");
    }
  });

  it("measured: 55 unversioned tags and zero tags with more than 3 components across the whole corpus", () => {
    let unversionedCount = 0;
    let overLengthCount = 0;
    for (const [, tags] of byPackage) {
      for (const t of tags) {
        const parsed = parseTag(t);
        if (parsed.kind === "unversioned") {
          unversionedCount += 1;
          if (t.split(".").length > 3 && /\d/.test(t)) {
            overLengthCount += 1;
          }
        }
      }
    }
    expect(unversionedCount).toBe(55);
    expect(overLengthCount).toBe(0);
  });
});
