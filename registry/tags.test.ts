import { describe, expect, it, vi } from "vitest";
import { listRegistryTags, parseNextLink } from "./tags.js";

function fakeResponse(status: number, body = "", headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

describe("parseNextLink", () => {
  it("extracts the rel=next URL", () => {
    const header = '<https://ghcr.io/v2/owner/pkg/tags/list?n=100&last=v9>; rel="next"';
    expect(parseNextLink(header)).toBe("https://ghcr.io/v2/owner/pkg/tags/list?n=100&last=v9");
  });

  it("returns undefined when there is no next relation", () => {
    expect(parseNextLink('<https://example.test>; rel="prev"')).toBeUndefined();
  });

  it("returns undefined for a null header", () => {
    expect(parseNextLink(null)).toBeUndefined();
  });
});

describe("listRegistryTags", () => {
  it("returns all tags on a single page", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fakeResponse(200, JSON.stringify({ name: "pkg", tags: ["a", "b"] })));

    const result = await listRegistryTags("owner/pkg", "tok", { fetchImpl, sleep: vi.fn() });

    expect(result).toEqual({ status: "success", tags: ["a", "b"] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("follows Link: rel=next pagination across multiple pages", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        fakeResponse(200, JSON.stringify({ tags: ["a", "b"] }), {
          link: '<https://ghcr.io/v2/owner/pkg/tags/list?n=100&last=b>; rel="next"',
        }),
      )
      .mockResolvedValueOnce(fakeResponse(200, JSON.stringify({ tags: ["c"] })));

    const result = await listRegistryTags("owner/pkg", "tok", { fetchImpl, sleep: vi.fn() });

    expect(result).toEqual({ status: "success", tags: ["a", "b", "c"] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      "https://ghcr.io/v2/owner/pkg/tags/list?n=100&last=b",
    );
  });

  it("resolves an origin-relative Link: rel=next (GHCR's actual production format)", async () => {
    // Regression test for the real bug: GHCR returns a path-only Link
    // header (`</v2/owner/pkg/tags/list?...>`, no scheme/host), verified
    // live against ghcr.io. Passing that straight to `fetch` throws, which
    // `requestWithRetry` reports as `network-error` — this must not
    // happen; the relative URL must be resolved against the page just
    // fetched before the next request is made.
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        fakeResponse(200, JSON.stringify({ tags: ["a", "b"] }), {
          link: '</v2/owner/pkg/tags/list?n=100&last=b>; rel="next"',
        }),
      )
      .mockResolvedValueOnce(fakeResponse(200, JSON.stringify({ tags: ["c"] })));

    const result = await listRegistryTags("owner/pkg", "tok", { fetchImpl, sleep: vi.fn() });

    expect(result).toEqual({ status: "success", tags: ["a", "b", "c"] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      "https://ghcr.io/v2/owner/pkg/tags/list?n=100&last=b",
    );
  });

  it("returns not-found for a 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(404));

    const result = await listRegistryTags("owner/pkg", "tok", { fetchImpl, sleep: vi.fn() });

    expect(result).toEqual({ status: "not-found", httpStatus: 404 });
  });

  it("returns transient-error after retries are exhausted", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => fakeResponse(503));

    const result = await listRegistryTags("owner/pkg", "tok", {
      fetchImpl,
      sleep: vi.fn(),
      attempts: 2,
    });

    expect(result).toEqual({ status: "transient-error", httpStatus: 503 });
  });

  it("returns network-error when fetch fails at every attempt", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

    const result = await listRegistryTags("owner/pkg", "tok", {
      fetchImpl,
      sleep: vi.fn(),
      attempts: 1,
    });

    expect(result).toEqual({ status: "network-error" });
  });

  it("treats an unparsable body as zero tags on that page instead of throwing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, "not json"));

    const result = await listRegistryTags("owner/pkg", "tok", { fetchImpl, sleep: vi.fn() });

    expect(result).toEqual({ status: "success", tags: [] });
  });
});
