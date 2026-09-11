import { describe, expect, it, vi } from "vitest";
import { digest, registryPathFor, tag } from "./domain.js";
import { packageName } from "../core/registry/package-name.js";
import { createCachingRegistryReader } from "./resolve-cache.js";
import type { RegistryReader } from "./ports.js";

const path = registryPathFor("pyck-ai", packageName("golang"));
const otherPath = registryPathFor("pyck-ai", packageName("rover"));

function successResolution(d: string): ReturnType<RegistryReader["resolve"]> {
  return Promise.resolve({
    status: "success",
    httpStatus: 200,
    digest: d,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    children: [],
  });
}

describe("createCachingRegistryReader", () => {
  it("resolves the same (path, ref) only once", async () => {
    const resolve = vi.fn().mockImplementation((_p: string, ref: string) => successResolution(ref));
    const reader = createCachingRegistryReader({ listTags: vi.fn(), resolve });

    const a1 = await reader.resolve(path, digest("sha256:a"));
    const a2 = await reader.resolve(path, digest("sha256:a"));

    expect(a1).toEqual(a2);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent in-flight requests for the same (path, ref) into one", async () => {
    const resolve = vi.fn().mockImplementation((_p: string, ref: string) => successResolution(ref));
    const reader = createCachingRegistryReader({ listTags: vi.fn(), resolve });

    const [a1, a2] = await Promise.all([
      reader.resolve(path, digest("sha256:a")),
      reader.resolve(path, digest("sha256:a")),
    ]);

    expect(a1).toEqual(a2);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("does not share cache entries across different registry paths", async () => {
    const resolve = vi.fn().mockImplementation((_p: string, ref: string) => successResolution(ref));
    const reader = createCachingRegistryReader({ listTags: vi.fn(), resolve });

    await reader.resolve(path, digest("sha256:a"));
    await reader.resolve(otherPath, digest("sha256:a"));

    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("does not conflate a tag ref with a digest ref of the same text", async () => {
    const resolve = vi
      .fn()
      .mockImplementation((_p: string, _ref: string) => successResolution("sha256:x"));
    const reader = createCachingRegistryReader({ listTags: vi.fn(), resolve });

    await reader.resolve(path, tag("latest"));
    await reader.resolve(path, tag("latest"));

    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("passes listTags straight through, uncached", async () => {
    const listTags = vi.fn().mockResolvedValue([tag("latest")]);
    const reader = createCachingRegistryReader({ listTags, resolve: vi.fn() });

    await reader.listTags(path);
    await reader.listTags(path);

    expect(listTags).toHaveBeenCalledTimes(2);
  });
});
