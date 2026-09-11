import { describe, expect, it } from "vitest";
import { packageName } from "./package-name.js";

describe("packageName", () => {
  it("accepts a flat name", () => {
    expect(packageName("github-runner")).toBe("github-runner");
  });

  it("accepts a nested name", () => {
    expect(packageName("baseimages/golang")).toBe("baseimages/golang");
  });

  it("rejects the empty string", () => {
    expect(() => packageName("")).toThrow();
  });

  it("rejects a leading slash", () => {
    expect(() => packageName("/baseimages/golang")).toThrow();
  });

  it("rejects a trailing slash", () => {
    expect(() => packageName("baseimages/golang/")).toThrow();
  });

  it("rejects a double slash", () => {
    expect(() => packageName("baseimages//golang")).toThrow();
  });
});
