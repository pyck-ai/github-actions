import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BuildArgsParseError, parseBuildArgs } from "./parse.js";

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`./testdata/${name}`, import.meta.url));
}

function readFixture(name: string): string {
  return readFileSync(fixturePath(name), "utf8");
}

describe("parseBuildArgs — real fixtures", () => {
  it.each(["baseimages-buildargs.conf", "runner-buildargs.conf", "flutter-rfw-buildargs.conf"])(
    "parses %s clean",
    (name) => {
      const content = readFixture(name);
      const path = fixturePath(name);
      expect(() => parseBuildArgs(content, path)).not.toThrow();
    },
  );

  it("parses baseimages-buildargs.conf into the expected keys", () => {
    const result = parseBuildArgs(
      readFixture("baseimages-buildargs.conf"),
      "baseimages-buildargs.conf",
    );
    expect(result.get("ALPINE_VERSION")).toBe("3.23");
    expect(result.get("DEBIAN_RELEASE")).toBe("trixie");
    expect(result.get("ALPINE_MIRRORS")).toBe(
      "https://mirror.netcologne.de/alpine,https://mirror.leaseweb.com/alpine",
    );
    expect(result.size).toBeGreaterThan(10);
  });

  it("parses runner-buildargs.conf into the expected keys", () => {
    const result = parseBuildArgs(readFixture("runner-buildargs.conf"), "runner-buildargs.conf");
    expect(result.get("ACTIONS_RUNNER_VERSION")).toBe("2.337.0");
    expect(result.get("BUILDKIT_VERSION")).toBe("0.33.0");
    expect(result.size).toBe(2);
  });

  it("parses flutter-rfw-buildargs.conf into the expected keys", () => {
    const result = parseBuildArgs(
      readFixture("flutter-rfw-buildargs.conf"),
      "flutter-rfw-buildargs.conf",
    );
    expect(result.get("FLUTTER_VERSION")).toBe("3.38.1");
    expect(result.size).toBe(1);
  });
});

describe("parseBuildArgs — blank/comment/whitespace lines", () => {
  it("skips blank lines", () => {
    expect(parseBuildArgs("A=1\n\nB=2\n", "f").size).toBe(2);
  });

  it("skips comment-only lines", () => {
    expect(parseBuildArgs("# a comment\nA=1\n", "f").get("A")).toBe("1");
  });

  it("skips whitespace-only lines", () => {
    expect(parseBuildArgs("A=1\n   \nB=2\n", "f").size).toBe(2);
  });

  it("skips a comment line with leading whitespace", () => {
    expect(parseBuildArgs("   # indented comment\nA=1\n", "f").size).toBe(1);
  });
});

describe("parseBuildArgs — line endings", () => {
  it("handles a missing trailing newline", () => {
    const result = parseBuildArgs("A=1\nB=2", "f");
    expect(result.get("A")).toBe("1");
    expect(result.get("B")).toBe("2");
  });

  it("handles CRLF line endings", () => {
    const result = parseBuildArgs("A=1\r\nB=2\r\n", "f");
    expect(result.get("A")).toBe("1");
    expect(result.get("B")).toBe("2");
  });
});

describe("parseBuildArgs — rejected dialect (hard errors)", () => {
  it("rejects an embedded space in the value (`A=hello world`)", () => {
    expect(() => parseBuildArgs("A=hello world\n", "f")).toThrow(BuildArgsParseError);
  });

  it("rejects a trailing inline comment (`B=val # trailing`)", () => {
    expect(() => parseBuildArgs("B=val # trailing\n", "f")).toThrow(BuildArgsParseError);
  });

  it('rejects a quoted value (`C="quoted"`)', () => {
    expect(() => parseBuildArgs('C="quoted"\n', "f")).toThrow(BuildArgsParseError);
  });

  it("rejects a value containing a single quote", () => {
    expect(() => parseBuildArgs("D='quoted'\n", "f")).toThrow(BuildArgsParseError);
  });

  it("rejects an `export` prefix", () => {
    expect(() => parseBuildArgs("export X=1\n", "f")).toThrow(BuildArgsParseError);
  });

  it("rejects a duplicate key", () => {
    expect(() => parseBuildArgs("A=1\nA=2\n", "f")).toThrow(BuildArgsParseError);
  });

  it("rejects a key starting with a digit", () => {
    expect(() => parseBuildArgs("1A=1\n", "f")).toThrow(BuildArgsParseError);
  });

  it("rejects a value with nothing after `=`", () => {
    expect(() => parseBuildArgs("A=\n", "f")).toThrow(BuildArgsParseError);
  });

  it("error carries the file path and 1-based line number", () => {
    try {
      parseBuildArgs("A=1\nB=hello world\n", "buildargs.conf");
      expect.fail("expected parseBuildArgs to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BuildArgsParseError);
      const err = error as BuildArgsParseError;
      expect(err.path).toBe("buildargs.conf");
      expect(err.line).toBe(2);
      expect(err.message).toContain("buildargs.conf:2");
    }
  });
});
