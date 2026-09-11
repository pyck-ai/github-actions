import { describe, expect, it } from "vitest";
import { emitBuildArgs } from "./emit.js";
import { parseBuildArgs } from "./parse.js";

const SAMPLE = parseBuildArgs("ALPINE_VERSION=3.23\nGOLANG_VERSION=1.27.1\n", "f");

describe("emitBuildArgs", () => {
  it("formats as env: KEY=VALUE lines, in insertion order", () => {
    expect(emitBuildArgs(SAMPLE, "env")).toEqual(["ALPINE_VERSION=3.23", "GOLANG_VERSION=1.27.1"]);
  });

  it("formats as github-env: identical to env", () => {
    expect(emitBuildArgs(SAMPLE, "github-env")).toEqual(emitBuildArgs(SAMPLE, "env"));
  });

  it("formats as bake: one --set *.args.KEY=VALUE flag per entry", () => {
    expect(emitBuildArgs(SAMPLE, "bake")).toEqual([
      "--set *.args.ALPINE_VERSION=3.23",
      "--set *.args.GOLANG_VERSION=1.27.1",
    ]);
  });

  it("returns an empty array for an empty map", () => {
    expect(emitBuildArgs(new Map(), "env")).toEqual([]);
    expect(emitBuildArgs(new Map(), "bake")).toEqual([]);
  });
});
