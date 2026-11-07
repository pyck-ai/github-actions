import { describe, expect, it } from "vitest";
import { createFakeApi, json, jsonPage, onPath, onPrefix } from "./fake-github.js";

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
