import { describe, expect, it } from "vitest";
import { apiUrl, encodePathSegments, parseRepository, productionOctokit } from "./github.js";
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

describe("apiUrl", () => {
  it("reads GITHUB_API_URL", () => {
    expect(apiUrl({ GITHUB_API_URL: "https://ghe.example/api/v3" })).toBe(
      "https://ghe.example/api/v3",
    );
  });

  it.each([{}, { GITHUB_API_URL: "" }])("falls back to api.github.com for %j", (env) => {
    expect(apiUrl(env)).toBe("https://api.github.com");
  });
});

describe("productionOctokit", () => {
  it("builds an Octokit client on the given base URL", () => {
    const octokit = productionOctokit("t0ken", "https://api.github.test");
    expect(octokit.request.endpoint("GET /ping").url).toBe("https://api.github.test/ping");
  });
});
