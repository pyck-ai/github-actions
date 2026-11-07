import { describe, expect, it } from "vitest";
import { createFakeApi, json, onPath } from "./fake-github.js";
import { createTidyOctokit, encodePathSegments, parseRepository } from "./github.js";
import { InputError } from "./inputs.js";

describe("parseRepository", () => {
  it("splits owner and repo", () => {
    expect(parseRepository("pyck-ai/demo")).toEqual({ owner: "pyck-ai", repo: "demo" });
  });

  it.each([undefined, "", "demo", "/demo", "pyck-ai/", "a/b/c"])(
    "rejects %j with an InputError naming the value",
    (raw) => {
      expect(() => parseRepository(raw)).toThrow(InputError);
      expect(() => parseRepository(raw)).toThrow(
        `GITHUB_REPOSITORY must be "owner/repo", got ${JSON.stringify(raw ?? "")}`,
      );
    },
  );
});

describe("encodePathSegments", () => {
  it("keeps slashes and encodes each segment", () => {
    expect(encodePathSegments("feature/a b/c#1")).toBe("feature/a%20b/c%231");
  });
});

describe("createTidyOctokit", () => {
  function fake(): ReturnType<typeof createFakeApi> {
    return createFakeApi({ handlers: [onPath("GET", "/ping", () => json(200, { ok: true }))] });
  }

  it("sends requests to GITHUB_API_URL through the given fetch", async () => {
    const api = fake();
    const octokit = createTidyOctokit("t0ken", {
      env: { GITHUB_API_URL: "https://api.github.test" },
      fetch: api.fetch,
      retries: 0,
    });
    const { data } = await octokit.request("GET /ping");
    expect(data).toEqual({ ok: true });
    expect(api.requests).toEqual([{ method: "GET", path: "/ping", body: "" }]);
  });

  it("falls back to api.github.com when GITHUB_API_URL is unset or empty", async () => {
    for (const env of [{}, { GITHUB_API_URL: "" }]) {
      const urls: string[] = [];
      const octokit = createTidyOctokit("t0ken", {
        env,
        fetch: ((input: string | URL | Request) => {
          urls.push(input instanceof Request ? input.url : String(input));
          return Promise.resolve(json(200, {}));
        }) as typeof fetch,
        retries: 0,
      });
      await octokit.request("GET /ping");
      expect(urls).toEqual(["https://api.github.com/ping"]);
    }
  });

  it("retries 5xx answers unless retries is 0", async () => {
    const calls = { n: 0 };
    const failing = createFakeApi({
      handlers: [],
      fail: () => {
        calls.n++;
        return 500;
      },
    });
    const octokit = createTidyOctokit("t0ken", {
      env: { GITHUB_API_URL: "https://api.github.test" },
      fetch: failing.fetch,
      retries: 0,
    });
    await expect(octokit.request("GET /ping")).rejects.toMatchObject({ status: 500 });
    expect(calls.n).toBe(1);
  });
});
