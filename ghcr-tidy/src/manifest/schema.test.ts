import { describe, expect, it } from "vitest";
import { packageName } from "../../../registry/package-name.js";
import { tag } from "../domain.js";
import {
  DEFAULT_KEEP_DAYS,
  DEFAULT_KEEP_MAJORS,
  DEFAULT_KEEP_MINORS,
  DEFAULT_KEEP_PATCHES,
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

  it("accepts a bare package list with no per-package fields beyond match", () => {
    const m = validateManifest(
      base({ packages: [{ match: "baseimages/buildcache" }, { match: "baseimages/golang" }] }),
    );
    expect(m.packages).toEqual([
      { match: packageName("baseimages/buildcache") },
      { match: packageName("baseimages/golang") },
    ]);
  });

  it("accepts a full retention block", () => {
    const m = validateManifest(
      base({ retention: { keepMajors: 1, keepMinors: 3, keepPatches: 5, keepDays: 30 } }),
    );
    expect(m.retention).toEqual({ keepMajors: 1, keepMinors: 3, keepPatches: 5, keepDays: 30 });
  });

  it("accepts a partial retention block, leaving the rest to default at resolve time", () => {
    const m = validateManifest(base({ retention: { keepDays: 7 } }));
    expect(m.retention).toEqual({ keepDays: 7 });
  });

  it("accepts a manifest with no retention block at all", () => {
    const m = validateManifest(base());
    expect(m.retention).toBeUndefined();
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

describe("validateManifest — retention rejections", () => {
  it("rejects an unknown field under retention", () => {
    expect(() => validateManifest(base({ retention: { bogus: 1 } }))).toThrow(
      /unknown field "bogus"/,
    );
  });

  it("rejects a retention block that is not an object", () => {
    expect(() => validateManifest(base({ retention: "nope" }))).toThrow(
      /"retention" must be an object/,
    );
  });

  it("rejects a non-integer or negative value for any retention field", () => {
    expect(() => validateManifest(base({ retention: { keepMajors: -1 } }))).toThrow(
      /"keepMajors" must be a non-negative integer/,
    );
    expect(() => validateManifest(base({ retention: { keepMinors: 1.5 } }))).toThrow(
      /"keepMinors" must be a non-negative integer/,
    );
    expect(() => validateManifest(base({ retention: { keepPatches: "5" } }))).toThrow(
      /"keepPatches" must be a non-negative integer/,
    );
    expect(() => validateManifest(base({ retention: { keepDays: -1 } }))).toThrow(
      /"keepDays" must be a non-negative integer/,
    );
  });
});

describe("validateManifest — rejections", () => {
  it("rejects an unknown top-level field", () => {
    expect(() => validateManifest(base({ extra: true }))).toThrow(ManifestError);
    expect(() => validateManifest(base({ extra: true }))).toThrow(/unknown field "extra"/);
  });

  it("AC 10: rejects every field this schema removed, naming the offending field", () => {
    expect(() => validateManifest(base({ keepLast: 5 }))).toThrow(/unknown field "keepLast"/);
    expect(() => validateManifest(base({ protectedTags: ["^latest$"] }))).toThrow(
      /unknown field "protectedTags"/,
    );
    expect(() => validateManifest(base({ graceDays: 30 }))).toThrow(/unknown field "graceDays"/);
    expect(() => validateManifest(base({ packages: [{ match: "x", policy: "cache" }] }))).toThrow(
      /unknown field "policy"/,
    );
    expect(() => validateManifest(base({ packages: [{ match: "x", keepLast: 3 }] }))).toThrow(
      /unknown field "keepLast"/,
    );
    expect(() => validateManifest(base({ packages: [{ match: "x", keepDays: 3 }] }))).toThrow(
      /unknown field "keepDays"/,
    );
    expect(() =>
      validateManifest(base({ packages: [{ match: "x", protectedTags: ["^v"] }] })),
    ).toThrow(/unknown field "protectedTags"/);
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

  it("applies hardcoded defaults with no retention block at all", () => {
    const p = resolvePolicy(manifest);
    expect(p).toEqual({
      keepMajors: DEFAULT_KEEP_MAJORS,
      keepMinors: DEFAULT_KEEP_MINORS,
      keepPatches: DEFAULT_KEEP_PATCHES,
      keepDays: DEFAULT_KEEP_DAYS,
    });
  });

  it("a full retention block overrides every default", () => {
    const m: Manifest = {
      ...manifest,
      retention: { keepMajors: 1, keepMinors: 2, keepPatches: 3, keepDays: 7 },
    };
    expect(resolvePolicy(m)).toEqual({ keepMajors: 1, keepMinors: 2, keepPatches: 3, keepDays: 7 });
  });

  it("a partial retention block defaults only the missing fields", () => {
    const m: Manifest = { ...manifest, retention: { keepDays: 7 } };
    expect(resolvePolicy(m)).toEqual({
      keepMajors: DEFAULT_KEEP_MAJORS,
      keepMinors: DEFAULT_KEEP_MINORS,
      keepPatches: DEFAULT_KEEP_PATCHES,
      keepDays: 7,
    });
  });

  it("is identical for every package — there is no per-package resolution any more", () => {
    const m: Manifest = {
      ...manifest,
      packages: [{ match: packageName("a") }, { match: packageName("b") }],
      retention: { keepMajors: 2 },
    };
    // `resolvePolicy` takes only the manifest — the same call answers
    // for every package, unlike the old per-entry override chain.
    expect(resolvePolicy(m)).toEqual(resolvePolicy(m));
  });
});
