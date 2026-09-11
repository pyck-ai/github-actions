import { describe, expect, it } from "vitest";
import { globMatch, resolveTargets } from "./match.js";
import { parseManifest } from "./parse.js";
import { ManifestError } from "./schema.js";

describe("globMatch", () => {
  it("matches an exact literal", () => {
    expect(globMatch("golang-alpine", "golang-alpine")).toBe(true);
    expect(globMatch("golang-alpine", "golang-debian")).toBe(false);
  });

  it("matches a trailing *", () => {
    expect(globMatch("golang-*", "golang-alpine")).toBe(true);
    expect(globMatch("golang-*", "golang-debian")).toBe(true);
    expect(globMatch("golang-*", "python-alpine")).toBe(false);
  });

  it("matches a bare *", () => {
    expect(globMatch("*", "anything")).toBe(true);
  });

  it("matches ?", () => {
    expect(globMatch("golang-?", "golang-1")).toBe(true);
    expect(globMatch("golang-?", "golang-10")).toBe(false);
  });

  it("does not match a partial substring without wildcards", () => {
    expect(globMatch("golang", "golang-alpine")).toBe(false);
  });

  it("escapes regex-special characters in the pattern", () => {
    expect(globMatch("go.lang", "go.lang")).toBe(true);
    expect(globMatch("go.lang", "goXlang")).toBe(false);
  });
});

const MANIFEST = parseManifest(
  `
version: 1
defaults:
  checks:
    - kind: workdir
      value: /root
targets:
  - match: "golang-*"
    checks:
      - kind: cmd
        commands: ["go version"]
  - match: "golang-alpine"
    checks:
      - kind: env
        name: MUSL
        contains: musl
  - match: "python-*"
    checks:
      - kind: cmd
        commands: ["python --version"]
`,
  "imgverify.yml",
);

describe("resolveTargets", () => {
  it("gives every target defaults.checks first", () => {
    const resolved = resolveTargets(MANIFEST, ["golang-alpine", "golang-debian", "python-alpine"]);
    for (const checks of resolved.values()) {
      expect(checks[0]).toMatchObject({ kind: "workdir", value: "/root" });
    }
  });

  it("appends checks from every matching target entry, in file order", () => {
    const resolved = resolveTargets(MANIFEST, ["golang-alpine", "golang-debian", "python-alpine"]);
    // golang-alpine is matched by BOTH "golang-*" and "golang-alpine", in that order.
    expect(resolved.get("golang-alpine")).toEqual([
      { kind: "workdir", value: "/root" },
      { kind: "cmd", commands: ["go version"] },
      { kind: "env", name: "MUSL", contains: "musl" },
    ]);
  });

  it("a target matched by only one pattern gets only that pattern's checks", () => {
    const resolved = resolveTargets(MANIFEST, ["golang-alpine", "golang-debian", "python-alpine"]);
    expect(resolved.get("golang-debian")).toEqual([
      { kind: "workdir", value: "/root" },
      { kind: "cmd", commands: ["go version"] },
    ]);
    expect(resolved.get("python-alpine")).toEqual([
      { kind: "workdir", value: "/root" },
      { kind: "cmd", commands: ["python --version"] },
    ]);
  });

  it("resolution is deterministic across repeated calls", () => {
    const first = resolveTargets(MANIFEST, ["golang-alpine", "python-alpine"]);
    const second = resolveTargets(MANIFEST, ["golang-alpine", "python-alpine"]);
    expect(first.get("golang-alpine")).toEqual(second.get("golang-alpine"));
  });

  it("throws ManifestError when a match pattern hits zero targets", () => {
    expect(() => resolveTargets(MANIFEST, ["nginx", "static"])).toThrow(ManifestError);
  });

  it("the zero-hit error names the offending pattern", () => {
    try {
      resolveTargets(MANIFEST, ["nginx", "static"]);
      expect.fail("expected resolveTargets to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ManifestError);
      expect((error as ManifestError).message).toContain("golang-*");
    }
  });

  it("a target with no matching pattern gets only defaults.checks", () => {
    const noMatchManifest = parseManifest(
      `
version: 1
defaults:
  checks:
    - kind: workdir
      value: /root
targets:
  - match: "golang-*"
    checks:
      - kind: cmd
        commands: ["go version"]
`,
      "imgverify.yml",
    );
    const resolved = resolveTargets(noMatchManifest, ["golang-alpine", "static"]);
    expect(resolved.get("static")).toEqual([{ kind: "workdir", value: "/root" }]);
  });
});
