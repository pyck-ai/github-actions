import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ManifestError } from "./schema.js";
import { parseManifest } from "./parse.js";

describe("parseManifest", () => {
  it("parses valid YAML into a validated manifest", () => {
    const m = parseManifest(
      "version: 1\nowner: pyck-ai\npackages:\n  - match: flutter-rfw\n",
      "test.yaml",
    );
    expect(m.owner).toBe("pyck-ai");
    expect(m.packages).toHaveLength(1);
  });

  it("wraps a YAML syntax error as a ManifestError naming the source path", () => {
    expect(() => parseManifest("version: [1\n", "bad.yaml")).toThrow(ManifestError);
    try {
      parseManifest("version: [1\n", "bad.yaml");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ManifestError);
      expect((error as ManifestError).message).toContain("bad.yaml");
      expect((error as ManifestError).message).toContain("invalid YAML");
    }
  });

  it("wraps a schema violation as a ManifestError with a #location suffix naming both file and field", () => {
    try {
      parseManifest("version: 2\nowner: x\npackages: []\n", "bad-version.yaml");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ManifestError);
      expect((error as ManifestError).location).toBe("bad-version.yaml#version");
    }
  });

  it("accepts this repository's own dogfood manifest (.ghcr-tidy.yaml at the repo root)", async () => {
    const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
    const content = await readFile(path.join(repoRoot, ".ghcr-tidy.yaml"), "utf8");
    const m = parseManifest(content, ".ghcr-tidy.yaml");
    expect(m).toEqual({ version: 1, owner: "pyck-ai", packages: [] });
  });
});
