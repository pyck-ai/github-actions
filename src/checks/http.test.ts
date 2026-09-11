import { afterEach, describe, expect, it, vi } from "vitest";
import type { HttpCheck } from "../manifest/schema.js";
import { executeHttpCheck } from "./http.js";
import { makeContext, makeFakeCli } from "./test-helpers.js";

const CHECK: HttpCheck = {
  kind: "http",
  desc: "serves /healthz",
  containerPort: 80,
  path: "/healthz",
  expectStatus: 200,
  retries: 2,
  retryDelayMs: 1,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("executeHttpCheck", () => {
  it("publishes, polls, and passes on the first successful response", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const create = vi.fn(async () => "container123");
    const rm = vi.fn(async () => undefined);
    const cli = makeFakeCli({ create, rm, port: vi.fn(async () => "0.0.0.0:32768") });

    const result = await executeHttpCheck(CHECK, 0, makeContext({ cli }));

    expect(result).toEqual({ index: 0, kind: "http", label: "serves /healthz", verdict: "pass" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ args: ["-P"] }));
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:32768/healthz");
  });

  it("retries until expectStatus is seen", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const cli = makeFakeCli();

    const result = await executeHttpCheck(CHECK, 0, makeContext({ cli }));
    expect(result.verdict).toBe("pass");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails after exhausting retries", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const cli = makeFakeCli();

    const result = await executeHttpCheck(CHECK, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
    expect(result.detail).toMatch(/status 500/);
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("always removes the container, even on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    const rm = vi.fn(async () => undefined);
    const cli = makeFakeCli({ rm });
    await executeHttpCheck(CHECK, 0, makeContext({ cli }));
    expect(rm).toHaveBeenCalledWith("container123", { force: true });
  });

  it("always removes the container, even when something throws mid-check", async () => {
    const rm = vi.fn(async () => undefined);
    const cli = makeFakeCli({
      rm,
      start: vi.fn(async () => {
        throw new Error("start failed");
      }),
    });
    const result = await executeHttpCheck(CHECK, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
    expect(result.detail).toMatch(/start failed/);
    expect(rm).toHaveBeenCalledWith("container123", { force: true });
  });

  it("a failed container removal does not mask the real result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    const cli = makeFakeCli({
      rm: vi.fn(async () => {
        throw new Error("rm failed");
      }),
    });
    const result = await executeHttpCheck(CHECK, 0, makeContext({ cli }));
    expect(result.verdict).toBe("pass");
  });
});
