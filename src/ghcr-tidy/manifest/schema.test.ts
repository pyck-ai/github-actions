import { describe, expect, it } from "vitest";
import { packageName } from "../../core/registry/package-name.js";
import { tag } from "../domain.js";
import {
  CACHE_POLICY_PATTERN,
  DEFAULT_GRACE_DAYS,
  DEFAULT_KEEP_DAYS,
  DEFAULT_KEEP_LAST,
  DEFAULT_PROTECTED_TAGS,
  ManifestError,
  resolvePolicy,
  validateManifest,
  type Manifest,
} from "./schema.js";

function base(overrides: Partial<Record<string, unknown>> = {}): unknown {
  return {
    version: 1,
    owner: "pyck-ai",
    packages: [{ match: "flutter-rfw" }],
    ...overrides,
  };
}

describe("validateManifest — acceptance", () => {
  it("accepts a minimal manifest", () => {
    const m = validateManifest(base());
    expect(m.owner).toBe("pyck-ai");
    expect(m.packages).toHaveLength(1);
    expect(m.packages[0]?.match).toBe("flutter-rfw");
  });

  it("accepts an empty packages array (this repo's own dogfood case)", () => {
    const m = validateManifest(base({ packages: [] }));
    expect(m.packages).toEqual([]);
  });

  it("accepts a nested package name (baseimages-style)", () => {
    const m = validateManifest(base({ packages: [{ match: "baseimages/golang" }] }));
    expect(m.packages[0]?.match).toBe("baseimages/golang");
  });

  it("accepts policy: cache and per-package overrides", () => {
    const m = validateManifest(
      base({
        packages: [
          { match: "flutter-rfw/buildcache", policy: "cache" },
          {
            match: "flutter-rfw",
            keepLast: 3,
            keepDays: 7,
            graceDays: 5,
            protectedTags: ["^v\\d"],
          },
        ],
      }),
    );
    expect(m.packages[0]).toMatchObject({ match: "flutter-rfw/buildcache", policy: "cache" });
    expect(m.packages[1]).toMatchObject({
      match: "flutter-rfw",
      keepLast: 3,
      keepDays: 7,
      graceDays: 5,
      protectedTags: ["^v\\d"],
    });
  });

  it("accepts top-level retention overrides", () => {
    const m = validateManifest(
      base({ keepLast: 5, keepDays: 15, graceDays: 15, protectedTags: ["^stable$"] }),
    );
    expect(m).toMatchObject({
      keepLast: 5,
      keepDays: 15,
      graceDays: 15,
      protectedTags: ["^stable$"],
    });
  });

  it("accepts a manifest with no canary at all (validate/plan-only usage)", () => {
    const m = validateManifest(base());
    expect(m.canary).toBeUndefined();
  });

  it("accepts a canary with a full package name and tag", () => {
    const m = validateManifest(base({ canary: { package: "baseimages/base", tag: "alpine" } }));
    expect(m.canary).toEqual({
      package: packageName("baseimages/base"),
      tag: tag("alpine"),
    });
  });
});

describe("validateManifest — canary rejections", () => {
  it("rejects an unknown field under canary", () => {
    expect(() => validateManifest(base({ canary: { package: "x", tag: "y", bogus: 1 } }))).toThrow(
      /unknown field "bogus"/,
    );
  });

  it("rejects a canary that is not an object", () => {
    expect(() => validateManifest(base({ canary: "nope" }))).toThrow(
      /"canary" must be an object with "package" and "tag"/,
    );
  });

  it("rejects a missing or empty canary.package", () => {
    expect(() => validateManifest(base({ canary: { tag: "y" } }))).toThrow(
      /canary\.package.*"package" must be a non-empty string/,
    );
    expect(() => validateManifest(base({ canary: { package: "", tag: "y" } }))).toThrow(
      /canary\.package.*"package" must be a non-empty string/,
    );
  });

  it("rejects a canary.package that is not a syntactically valid package name", () => {
    expect(() =>
      validateManifest(base({ canary: { package: "/leading-slash", tag: "y" } })),
    ).toThrow(ManifestError);
  });

  it("rejects a missing or empty canary.tag", () => {
    expect(() => validateManifest(base({ canary: { package: "x" } }))).toThrow(
      /canary\.tag.*"tag" must be a non-empty string/,
    );
    expect(() => validateManifest(base({ canary: { package: "x", tag: "" } }))).toThrow(
      /canary\.tag.*"tag" must be a non-empty string/,
    );
  });
});

describe("validateManifest — rejections", () => {
  it("rejects an unknown top-level field", () => {
    expect(() => validateManifest(base({ extra: true }))).toThrow(ManifestError);
    expect(() => validateManifest(base({ extra: true }))).toThrow(/unknown field "extra"/);
  });

  it("rejects an unknown per-package field", () => {
    expect(() => validateManifest(base({ packages: [{ match: "x", bogus: 1 }] }))).toThrow(
      /unknown field "bogus"/,
    );
  });

  it("rejects a missing version", () => {
    const raw = base();
    delete (raw as Record<string, unknown>).version;
    expect(() => validateManifest(raw)).toThrow(/"version" must be 1/);
  });

  it("rejects a non-1 version", () => {
    expect(() => validateManifest(base({ version: 2 }))).toThrow(/"version" must be 1/);
  });

  it("rejects a missing owner", () => {
    const raw = base();
    delete (raw as Record<string, unknown>).owner;
    expect(() => validateManifest(raw)).toThrow(/"owner" must be a non-empty string/);
  });

  it("rejects an empty owner", () => {
    expect(() => validateManifest(base({ owner: "" }))).toThrow(
      /"owner" must be a non-empty string/,
    );
  });

  it("rejects a manifest with no packages field at all", () => {
    const raw = base();
    delete (raw as Record<string, unknown>).packages;
    expect(() => validateManifest(raw)).toThrow(/must have a "packages" field/);
  });

  it("rejects packages that is not an array", () => {
    expect(() => validateManifest(base({ packages: "nope" }))).toThrow(
      /"packages" must be an array/,
    );
  });

  it("rejects a duplicate match", () => {
    expect(() =>
      validateManifest(base({ packages: [{ match: "flutter-rfw" }, { match: "flutter-rfw" }] })),
    ).toThrow(/duplicate package "flutter-rfw"/);
  });

  it("rejects a match that is not a syntactically valid package name", () => {
    expect(() => validateManifest(base({ packages: [{ match: "/leading-slash" }] }))).toThrow(
      ManifestError,
    );
    expect(() => validateManifest(base({ packages: [{ match: "double//slash" }] }))).toThrow(
      ManifestError,
    );
    expect(() => validateManifest(base({ packages: [{ match: "" }] }))).toThrow(
      /"match" must be a non-empty string/,
    );
  });

  it("rejects an invalid policy value", () => {
    expect(() => validateManifest(base({ packages: [{ match: "x", policy: "bogus" }] }))).toThrow(
      /"policy" must be "cache"/,
    );
  });

  it("rejects a non-integer or negative keepLast/keepDays/graceDays, per-package and top-level", () => {
    expect(() => validateManifest(base({ packages: [{ match: "x", keepLast: -1 }] }))).toThrow(
      /"keepLast" must be a non-negative integer/,
    );
    expect(() => validateManifest(base({ packages: [{ match: "x", keepDays: 1.5 }] }))).toThrow(
      /"keepDays" must be a non-negative integer/,
    );
    expect(() => validateManifest(base({ packages: [{ match: "x", graceDays: "10" }] }))).toThrow(
      /"graceDays" must be a non-negative integer/,
    );
    expect(() => validateManifest(base({ keepLast: -1 }))).toThrow(
      /"keepLast" must be a non-negative integer/,
    );
    expect(() => validateManifest(base({ keepDays: -1 }))).toThrow(
      /"keepDays" must be a non-negative integer/,
    );
    expect(() => validateManifest(base({ graceDays: -1 }))).toThrow(
      /"graceDays" must be a non-negative integer/,
    );
  });

  it("rejects a malformed protectedTags regex, per-package and top-level", () => {
    expect(() =>
      validateManifest(base({ packages: [{ match: "x", protectedTags: ["("] }] })),
    ).toThrow(/not a valid regular expression/);
    expect(() => validateManifest(base({ protectedTags: ["("] }))).toThrow(
      /not a valid regular expression/,
    );
  });

  it("rejects protectedTags that is not an array of strings", () => {
    expect(() => validateManifest(base({ protectedTags: "not-an-array" }))).toThrow(
      /"protectedTags" must be an array of strings/,
    );
    expect(() => validateManifest(base({ protectedTags: [1, 2] }))).toThrow(
      /"protectedTags" must be an array of strings/,
    );
  });

  it("rejects a manifest that is not an object", () => {
    expect(() => validateManifest("nope")).toThrow(/manifest must be an object/);
    expect(() => validateManifest(null)).toThrow(/manifest must be an object/);
    expect(() => validateManifest([])).toThrow(/manifest must be an object/);
  });

  it("rejects a package entry that is not an object", () => {
    expect(() => validateManifest(base({ packages: ["x"] }))).toThrow(
      /package entry must be an object/,
    );
  });
});

describe("resolvePolicy", () => {
  const manifest: Manifest = { version: 1, owner: "pyck-ai", packages: [] };

  it("applies hardcoded defaults with no overrides anywhere", () => {
    const p = resolvePolicy({ match: packageName("x") }, manifest);
    expect(p.keepLast).toBe(DEFAULT_KEEP_LAST);
    expect(p.keepDays).toBe(DEFAULT_KEEP_DAYS);
    expect(p.graceDays).toBe(DEFAULT_GRACE_DAYS);
    expect(p.protectedTagPatterns.map((r) => r.source)).toEqual(
      DEFAULT_PROTECTED_TAGS.map((s) => new RegExp(s).source),
    );
  });

  it("manifest-level overrides beat hardcoded defaults", () => {
    const m: Manifest = {
      ...manifest,
      keepLast: 1,
      keepDays: 2,
      graceDays: 3,
      protectedTags: ["^x$"],
    };
    const p = resolvePolicy({ match: packageName("x") }, m);
    expect(p).toMatchObject({ keepLast: 1, keepDays: 2, graceDays: 3 });
    expect(p.protectedTagPatterns.map((r) => r.source)).toEqual(["^x$"]);
  });

  it("per-package overrides beat manifest-level overrides", () => {
    const m: Manifest = { ...manifest, keepLast: 1, keepDays: 2, graceDays: 3 };
    const p = resolvePolicy(
      {
        match: packageName("x"),
        keepLast: 10,
        keepDays: 20,
        graceDays: 30,
        protectedTags: ["^y$"],
      },
      m,
    );
    expect(p).toMatchObject({ keepLast: 10, keepDays: 20, graceDays: 30 });
    expect(p.protectedTagPatterns.map((r) => r.source)).toEqual(["^y$"]);
  });

  it("policy: cache keeps every tag and ignores keepLast/keepDays/protectedTags, but graceDays still resolves normally", () => {
    const m: Manifest = { ...manifest, graceDays: 9 };
    const p = resolvePolicy(
      {
        match: packageName("x"),
        policy: "cache",
        keepLast: 999,
        keepDays: 999,
        protectedTags: ["^never-matches-this-specific-pattern$"],
      },
      m,
    );
    expect(p.protectedTagPatterns.map((r) => r.source)).toEqual([
      new RegExp(CACHE_POLICY_PATTERN).source,
    ]);
    expect(p.graceDays).toBe(9);
  });
});
