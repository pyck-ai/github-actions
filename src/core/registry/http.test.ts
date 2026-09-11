import { describe, expect, it, vi } from "vitest";
import { requestWithRetry } from "./http.js";

function fakeResponse(status: number, body = ""): Response {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

describe("requestWithRetry", () => {
  it("returns immediately on success without retrying", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, "ok"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const outcome = await requestWithRetry("https://example.test", {}, { fetchImpl, sleep });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ kind: "response", status: 200, bodyText: "ok" });
  });

  it("does not retry on 404 (permanent, no backoff wasted)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(404));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const outcome = await requestWithRetry("https://example.test", {}, { fetchImpl, sleep });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ kind: "response", status: 404 });
  });

  it("retries on 429 up to `attempts` times, then returns the last response", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => fakeResponse(429));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const outcome = await requestWithRetry(
      "https://example.test",
      {},
      { fetchImpl, sleep, attempts: 3 },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({ kind: "response", status: 429 });
  });

  it("retries on 5xx and succeeds on a later attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(503))
      .mockResolvedValueOnce(fakeResponse(200, "recovered"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const outcome = await requestWithRetry("https://example.test", {}, { fetchImpl, sleep });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({ kind: "response", status: 200, bodyText: "recovered" });
  });

  it("retries on network-level failure and reports network-error if never recovered", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const outcome = await requestWithRetry(
      "https://example.test",
      {},
      { fetchImpl, sleep, attempts: 2 },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(outcome.kind).toBe("network-error");
  });

  it("recovers after a network-level failure on a later attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(fakeResponse(200));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const outcome = await requestWithRetry("https://example.test", {}, { fetchImpl, sleep });

    expect(outcome).toMatchObject({ kind: "response", status: 200 });
  });

  it("uses the configured backoff schedule between attempts", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => fakeResponse(500));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const backoffMs = vi.fn((attempt: number) => attempt * 100);

    await requestWithRetry(
      "https://example.test",
      {},
      { fetchImpl, sleep, backoffMs, attempts: 3 },
    );

    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });
});
