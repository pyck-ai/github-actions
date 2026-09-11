import { describe, expect, it } from "vitest";
import { packageName } from "../core/registry/package-name.js";
import { digest, registryPathFor, tag } from "./domain.js";

describe("digest", () => {
  it("accepts a valid sha256 digest", () => {
    expect(digest("sha256:deadbeef")).toBe("sha256:deadbeef");
  });

  it("rejects a bare tag-looking string", () => {
    expect(() => digest("latest")).toThrow();
  });

  it("rejects the empty string", () => {
    expect(() => digest("")).toThrow();
  });
});

describe("tag", () => {
  it("accepts a plain tag", () => {
    expect(tag("3.38-alpine")).toBe("3.38-alpine");
  });

  it("rejects the empty string", () => {
    expect(() => tag("")).toThrow();
  });
});

describe("registryPathFor", () => {
  it("joins owner and package name with a single slash", () => {
    expect(registryPathFor("pyck-ai", packageName("baseimages/golang"))).toBe(
      "pyck-ai/baseimages/golang",
    );
  });

  it("rejects an empty owner", () => {
    expect(() => registryPathFor("", packageName("golang"))).toThrow();
  });
});
