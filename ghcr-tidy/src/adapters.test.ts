import { describe, expect, it, vi } from "vitest";
import { packageName } from "../../registry/package-name.js";
import type { Paginatable, RawPackageVersion } from "../../registry/packages.js";
import { registryPathFor, tag } from "./domain.js";
import { createPackagesClient, createRegistryReader } from "./adapters.js";

const path = registryPathFor("pyck-ai", packageName("golang"));

describe("createPackagesClient", () => {
  it("brands every raw version and fully enumerates a paginated (>100) listing", async () => {
    const raws: RawPackageVersion[] = Array.from({ length: 150 }, (_, i) => ({
      id: i,
      name: `sha256:v${String(i)}`,
      created_at: "2026-01-01T00:00:00Z",
      metadata: { container: { tags: i === 0 ? ["latest"] : [] } },
    }));
    const paginate = vi.fn().mockResolvedValue(raws);
    const octokit: Paginatable = { paginate };

    const client = createPackagesClient(octokit);
    const versions = await client.listVersions("pyck-ai", packageName("golang"));

    expect(versions).toHaveLength(150);
    expect(versions[0]).toMatchObject({ id: 0, digest: "sha256:v0", reportedTags: ["latest"] });
    expect(versions[0]?.createdAt).toBeInstanceOf(Date);
  });
});

describe("createRegistryReader", () => {
  function fakeResponse(status: number, body = "", headers: Record<string, string> = {}): Response {
    return new Response(body, { status, headers });
  }

  it("listTags follows Link pagination and fully enumerates >100 tags", async () => {
    const page1Tags = Array.from({ length: 100 }, (_, i) => `t${String(i)}`);
    const page2Tags = Array.from({ length: 20 }, (_, i) => `t${String(100 + i)}`);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        fakeResponse(200, JSON.stringify({ tags: page1Tags }), {
          link: '<https://ghcr.io/v2/pyck-ai/golang/tags/list?n=100&last=t99>; rel="next"',
        }),
      )
      .mockResolvedValueOnce(fakeResponse(200, JSON.stringify({ tags: page2Tags })));

    const reader = createRegistryReader(() => Promise.resolve("tok"));
    // Inject fetchImpl via the underlying core function's default fetch is not
    // directly overridable here; instead verify pagination end-to-end through
    // global fetch stubbing, since createRegistryReader has no options seam
    // of its own (see the module doc: it is a thin wiring layer over the
    // already-tested, already-paginating core functions).
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      const tags = await reader.listTags(path);
      expect(tags).toHaveLength(120);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("listTags follows an origin-relative Link header end to end (GHCR's real format)", async () => {
    // See `registry/tags.ts`'s doc: GHCR's Link header is
    // origin-relative in production. This exercises that through the real
    // adapter wiring, not just the core function in isolation.
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        fakeResponse(200, JSON.stringify({ tags: ["a"] }), {
          link: '</v2/pyck-ai/baseimages/agent/tags/list?n=100&last=a>; rel="next"',
        }),
      )
      .mockResolvedValueOnce(fakeResponse(200, JSON.stringify({ tags: ["b"] })));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      const reader = createRegistryReader(() => Promise.resolve("tok"));
      const tags = await reader.listTags(path);
      expect(tags).toEqual(["a", "b"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("resolve passes the registry path and reference straight through to resolveManifest", async () => {
    const body = JSON.stringify({ mediaType: "application/vnd.oci.image.manifest.v1+json" });
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fakeResponse(200, body, { "docker-content-digest": "sha256:x" }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    try {
      const reader = createRegistryReader(() => Promise.resolve("tok"));
      const result = await reader.resolve(path, tag("latest"));
      expect(result).toMatchObject({ status: "success", digest: "sha256:x" });
      const calledUrl = fetchImpl.mock.calls[0]?.[0] as string;
      expect(calledUrl).toBe(`https://ghcr.io/v2/${path}/manifests/latest`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
