import { describe, expect, it } from "vitest";
import { parseManifest } from "./parse.js";
import { substituteManifest, substituteString, SubstitutionError } from "./substitute.js";

const VARS = new Map([
  ["GOLANG_VERSION", "1.27.1"],
  ["ALPINE_VERSION", "3.23"],
]);

describe("substituteString", () => {
  it("expands a single ${VAR}", () => {
    expect(substituteString("go${GOLANG_VERSION}.tar.gz", VARS, "loc")).toBe("go1.27.1.tar.gz");
  });

  it("expands multiple ${VAR} references", () => {
    expect(substituteString("${GOLANG_VERSION}-alpine${ALPINE_VERSION}", VARS, "loc")).toBe(
      "1.27.1-alpine3.23",
    );
  });

  it("leaves a string with no ${...} untouched", () => {
    expect(substituteString("no variables here", VARS, "loc")).toBe("no variables here");
  });

  it("treats $$ as a literal $", () => {
    expect(substituteString("cost is $$5", VARS, "loc")).toBe("cost is $5");
  });

  it("passes through a lone $ not followed by { or $", () => {
    expect(substituteString("echo $HOME", VARS, "loc")).toBe("echo $HOME");
  });

  it("throws SubstitutionError (not a generic Error) for an undefined variable", () => {
    expect(() => substituteString("${NOPE}", VARS, "targets[0].checks[1].run")).toThrow(
      SubstitutionError,
    );
  });

  it("SubstitutionError names the variable and the location", () => {
    try {
      substituteString("${NOPE}", VARS, "targets[0].checks[1].run");
      expect.fail("expected substituteString to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SubstitutionError);
      const err = error as SubstitutionError;
      expect(err.variable).toBe("NOPE");
      expect(err.location).toBe("targets[0].checks[1].run");
      expect(err.message).toContain("NOPE");
      expect(err.message).toContain("targets[0].checks[1].run");
    }
  });

  it("throws for an unterminated ${", () => {
    expect(() => substituteString("go${GOLANG_VERSION", VARS, "loc")).toThrow(SubstitutionError);
  });
});

describe("substituteManifest — undefined variable is a ConfigError, not a check failure", () => {
  it("throws SubstitutionError, distinct from a check-result failure type", () => {
    const manifest = parseManifest(
      `
version: 1
targets:
  - match: "*"
    checks:
      - kind: version
        run: "tool --version"
        contains: "\${UNDEFINED_VAR}"
`,
      "imgverify.yml",
    );
    expect(() => substituteManifest(manifest, VARS)).toThrow(SubstitutionError);
    expect(() => substituteManifest(manifest, VARS)).not.toThrow(TypeError);
  });
});

describe("substituteManifest — deep expansion across check fields", () => {
  it("expands ${VAR} inside a check field nested in targets[].checks[]", () => {
    const manifest = parseManifest(
      `
version: 1
targets:
  - match: "*"
    checks:
      - kind: version
        run: "go version"
        contains: "go\${GOLANG_VERSION}"
`,
      "imgverify.yml",
    );
    const result = substituteManifest(manifest, VARS);
    const check = result.targets[0]?.checks[0];
    expect(check).toMatchObject({ kind: "version", contains: "go1.27.1" });
  });

  it("expands ${VAR} inside defaults.checks", () => {
    const manifest = parseManifest(
      `
version: 1
defaults:
  checks:
    - kind: workdir
      value: "/opt/go\${GOLANG_VERSION}"
targets:
  - match: "*"
    checks:
      - kind: workdir
        value: /root
`,
      "imgverify.yml",
    );
    const result = substituteManifest(manifest, VARS);
    expect(result.defaults?.checks[0]).toMatchObject({ value: "/opt/go1.27.1" });
  });

  it("leaves non-string fields (numbers, booleans) untouched", () => {
    const manifest = parseManifest(
      `
version: 1
targets:
  - match: "*"
    checks:
      - kind: exposedPort
        port: 8080
`,
      "imgverify.yml",
    );
    const result = substituteManifest(manifest, VARS);
    expect(result.targets[0]?.checks[0]).toMatchObject({ kind: "exposedPort", port: 8080 });
  });
});
