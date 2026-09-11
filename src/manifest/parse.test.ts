import { describe, expect, it } from "vitest";
import { parseManifest } from "./parse.js";
import { ManifestError } from "./schema.js";

const FULL_MANIFEST = `
version: 1
buildargs: buildargs.conf
registry: ghcr.io/pyck-ai/baseimages
defaults:
  checks:
    - kind: user
      uid: 0
      name: root
      configUser: root
    - kind: configUser
      value: root
    - kind: workdir
      value: /root
    - kind: env
      name: HOME
      equals: /root
    - kind: env
      name: DEBIAN_FRONTEND
      absent: true
targets:
  - match: "golang-*"
    checks:
      - kind: cmd
        commands: ["go version"]
        as: root
      - kind: version
        run: go version
        contains: go1.27
        matches: "go1\\\\.\\\\d+"
        notContains: "go1.26"
        as: 1001
      - kind: writable
        paths: ["/go/pkg"]
        mustExist: true
      - kind: file
        paths: ["/usr/local/bin/go"]
      - kind: imageFile
        paths: ["/etc/os-release"]
      - kind: sh
        desc: "go build smoke test"
        run: "cd /tmp && go build ."
        mounts:
          - host: "./fixtures/hello"
            container: "/tmp/hello"
            ro: true
        timeoutMs: 5000
      - kind: exposedPort
        port: 8080
        protocol: tcp
      - kind: http
        desc: "health check"
        containerPort: 8080
        path: /health
        expectStatus: 200
        retries: 3
        retryDelayMs: 500
  - match: "golang-alpine"
    checks:
      - kind: env
        name: MUSL
        contains: musl
`;

describe("parseManifest — valid input", () => {
  it("parses a manifest exercising all twelve check kinds", () => {
    const manifest = parseManifest(FULL_MANIFEST, "imgverify.yml");
    expect(manifest.version).toBe(1);
    expect(manifest.buildargs).toBe("buildargs.conf");
    expect(manifest.registry).toBe("ghcr.io/pyck-ai/baseimages");
    expect(manifest.defaults?.checks).toHaveLength(5);
    expect(manifest.targets).toHaveLength(2);
    expect(manifest.targets[0]?.match).toBe("golang-*");
    expect(manifest.targets[0]?.checks).toHaveLength(8);
  });

  it("defaults are optional", () => {
    const manifest = parseManifest(
      `
version: 1
targets:
  - match: "*"
    checks:
      - kind: workdir
        value: /root
`,
      "imgverify.yml",
    );
    expect(manifest.defaults).toBeUndefined();
  });
});

describe("parseManifest — invalid YAML", () => {
  it("throws ManifestError naming the source path", () => {
    expect(() => parseManifest("version: 1\n  bad indent:\ntargets: [", "imgverify.yml")).toThrow(
      ManifestError,
    );
  });
});

describe("parseManifest — schema violations surface with location", () => {
  it("rejects an unknown check kind, listing valid kinds", () => {
    try {
      parseManifest(
        `
version: 1
targets:
  - match: "*"
    checks:
      - kind: hostShell
        run: "rm -rf /"
`,
        "imgverify.yml",
      );
      expect.fail("expected parseManifest to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ManifestError);
      const err = error as ManifestError;
      expect(err.message).toContain("imgverify.yml");
      expect(err.message).toContain("unknown check kind");
      expect(err.message).toContain("user");
    }
  });

  it("rejects an unknown field on a known kind", () => {
    expect(() =>
      parseManifest(
        `
version: 1
targets:
  - match: "*"
    checks:
      - kind: workdir
        value: /root
        typo: oops
`,
        "imgverify.yml",
      ),
    ).toThrow(/unknown field "typo"/);
  });

  it("rejects a missing required field", () => {
    expect(() =>
      parseManifest(
        `
version: 1
targets:
  - match: "*"
    checks:
      - kind: workdir
`,
        "imgverify.yml",
      ),
    ).toThrow(/missing required field "value"/);
  });

  it("rejects version other than 1", () => {
    expect(() =>
      parseManifest(
        `
version: 2
targets:
  - match: "*"
    checks:
      - kind: workdir
        value: /root
`,
        "imgverify.yml",
      ),
    ).toThrow(/version/);
  });

  it("rejects an empty checks array", () => {
    expect(() =>
      parseManifest(
        `
version: 1
targets:
  - match: "*"
    checks: []
`,
        "imgverify.yml",
      ),
    ).toThrow(/checks.*must not be empty/);
  });

  it("rejects an env check with no variant field", () => {
    expect(() =>
      parseManifest(
        `
version: 1
targets:
  - match: "*"
    checks:
      - kind: env
        name: HOME
`,
        "imgverify.yml",
      ),
    ).toThrow(/exactly one of/);
  });

  it("rejects an env check with two variant fields", () => {
    expect(() =>
      parseManifest(
        `
version: 1
targets:
  - match: "*"
    checks:
      - kind: env
        name: HOME
        equals: /root
        contains: root
`,
        "imgverify.yml",
      ),
    ).toThrow(/exactly one of/);
  });

  it("rejects an unknown top-level field", () => {
    expect(() =>
      parseManifest(
        `
version: 1
extra: yes
targets:
  - match: "*"
    checks:
      - kind: workdir
        value: /root
`,
        "imgverify.yml",
      ),
    ).toThrow(/unknown field "extra"/);
  });

  it("rejects a manifest with no targets", () => {
    expect(() =>
      parseManifest(
        `
version: 1
targets: []
`,
        "imgverify.yml",
      ),
    ).toThrow(/targets/);
  });

  it('rejects an invalid "as" value', () => {
    expect(() =>
      parseManifest(
        `
version: 1
targets:
  - match: "*"
    checks:
      - kind: cmd
        commands: ["true"]
        as: superuser
`,
        "imgverify.yml",
      ),
    ).toThrow(/"as" must be/);
  });
});
