import { describe, expect, it, vi } from "vitest";
import { RegistryAuthError, createInMemoryTokenCache, getRegistryToken } from "./auth.js";
import { packageName } from "./package-name.js";

function fakeTokenResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("getRegistryToken", () => {
  it("requests a token scoped to repository:<name>:pull", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeTokenResponse(200, { token: "abc123" }));

    const token = await getRegistryToken("gh-token", packageName("baseimages/golang"), {
      fetchImpl,
    });

    expect(token).toBe("abc123");
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain(encodeURIComponent("repository:baseimages/golang:pull"));
  });

  it("throws RegistryAuthError on a non-200 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeTokenResponse(401, {}));

    await expect(
      getRegistryToken("gh-token", packageName("baseimages/golang"), { fetchImpl }),
    ).rejects.toBeInstanceOf(RegistryAuthError);
  });

  it("throws RegistryAuthError when the response body has no token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeTokenResponse(200, {}));

    await expect(
      getRegistryToken("gh-token", packageName("baseimages/golang"), { fetchImpl }),
    ).rejects.toBeInstanceOf(RegistryAuthError);
  });

  it("serves a cached token without calling fetch again", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeTokenResponse(200, { token: "cached-token" }));
    const cache = createInMemoryTokenCache();
    const name = packageName("baseimages/golang");

    const first = await getRegistryToken("gh-token", name, { fetchImpl, cache });
    const second = await getRegistryToken("gh-token", name, { fetchImpl, cache });

    expect(first).toBe("cached-token");
    expect(second).toBe("cached-token");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not share a cached token across different package scopes", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeTokenResponse(200, { token: "token-a" }))
      .mockResolvedValueOnce(fakeTokenResponse(200, { token: "token-b" }));
    const cache = createInMemoryTokenCache();

    const a = await getRegistryToken("gh-token", packageName("baseimages/golang"), {
      fetchImpl,
      cache,
    });
    const b = await getRegistryToken("gh-token", packageName("baseimages/python"), {
      fetchImpl,
      cache,
    });

    expect(a).toBe("token-a");
    expect(b).toBe("token-b");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
