import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  actionDefaults,
  createFakeApi,
  json,
  jsonPage,
  octokitOn,
  onPath,
  onPrefix,
} from "./fake-github.js";

const BASE = "https://api.github.test";

describe("createFakeApi", () => {
  const api = () =>
    createFakeApi({
      handlers: [
        onPath("GET", "/a", () => json(200, { a: 1 })),
        onPrefix("DELETE", "/things/", (rest) => json(200, { rest })),
        onPath("GET", "/list", ({ url }) => jsonPage([1, 2, 3, 4, 5], url, 2)),
      ],
      fail: ({ path }) =>
        path === "/boom" ? 503 : path === "/net" ? new Error("socket hang up") : undefined,
    });

  it("records every request with method, path and query, and body", async () => {
    const fake = api();
    await fake.fetch(`${BASE}/a?x=1`);
    await fake.fetch(new Request(`${BASE}/things/a%2Fb`, { method: "DELETE" }));
    await fake.fetch(`${BASE}/a`, { method: "post", body: "{}" });
    expect(fake.requests).toEqual([
      { method: "GET", path: "/a?x=1", body: "" },
      { method: "DELETE", path: "/things/a%2Fb", body: "" },
      { method: "POST", path: "/a", body: "{}" },
    ]);
  });

  it("routes by method and exact path or prefix; the first answer wins", async () => {
    const fake = api();
    expect(await (await fake.fetch(`${BASE}/a`)).json()).toEqual({ a: 1 });
    expect(await (await fake.fetch(`${BASE}/things/a%2Fb`, { method: "DELETE" })).json()).toEqual({
      rest: "a%2Fb",
    });
  });

  it("answers 404 naming the route when no handler answers", async () => {
    const res = await api().fetch(`${BASE}/nope`, { method: "PUT" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: "fake has no route for PUT /nope" });
  });

  it("injects a status or a network failure before the handlers", async () => {
    const fake = api();
    const forced = await fake.fetch(`${BASE}/boom`);
    expect(forced.status).toBe(503);
    expect(await forced.json()).toEqual({ message: "forced 503" });
    await expect(fake.fetch(`${BASE}/net`)).rejects.toThrow("socket hang up");
    expect(fake.requests).toHaveLength(2);
  });

  it("pages a list with a Link header until the last page", async () => {
    const fake = api();
    const first = await fake.fetch(`${BASE}/list`);
    expect(await first.json()).toEqual([1, 2]);
    expect(first.headers.get("link")).toBe(`<${BASE}/list?page=2>; rel="next"`);
    const last = await fake.fetch(`${BASE}/list?page=3`);
    expect(await last.json()).toEqual([5]);
    expect(last.headers.get("link")).toBeNull();
  });
});

describe("octokitOn", () => {
  it("sends requests to the base URL through the fake fetch, without retrying a 5xx", async () => {
    const api = createFakeApi({ handlers: [], fail: () => 500 });
    const octokit = octokitOn(api.fetch)("t0ken", BASE);
    await expect(octokit.request("GET /ping")).rejects.toMatchObject({ status: 500 });
    expect(api.requests).toEqual([{ method: "GET", path: "/ping", body: "" }]);
  });

  it("answers from a handler", async () => {
    const api = createFakeApi({
      handlers: [onPath("GET", "/ping", () => json(200, { ok: true }))],
    });
    const { data } = await octokitOn(api.fetch)("t0ken", BASE).request("GET /ping");
    expect(data).toEqual({ ok: true });
  });
});

describe("actionDefaults", () => {
  it("returns INPUT_<NAME> for every input with a default and skips the others", () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "tidy-core-")), "action.yml");
    writeFileSync(
      file,
      [
        "inputs:",
        "  token:",
        "    required: true",
        "  dry-run:",
        '    default: "true"',
        "  keep-branches:",
        "    default: main,master",
        "",
      ].join("\n"),
    );
    expect(actionDefaults(file)).toEqual({
      "INPUT_DRY-RUN": "true",
      "INPUT_KEEP-BRANCHES": "main,master",
    });
  });
});
