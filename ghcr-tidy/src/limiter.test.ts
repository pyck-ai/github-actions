import { describe, expect, it } from "vitest";
import { createLimiter } from "./limiter.js";

/** A deferred promise, so a test can control exactly when a queued task resolves. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("createLimiter", () => {
  it("runs up to `limit` tasks concurrently and queues the rest", async () => {
    const limit = createLimiter(2);
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    let running = 0;
    let maxRunning = 0;

    const results = gates.map((g, i) =>
      limit(async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await g.promise;
        running -= 1;
        return i;
      }),
    );

    // Give the microtask queue a turn so the first `limit` tasks start.
    await Promise.resolve();
    await Promise.resolve();
    expect(maxRunning).toBe(2);

    gates[0]?.resolve();
    gates[1]?.resolve();
    gates[2]?.resolve();

    expect(await Promise.all(results)).toEqual([0, 1, 2]);
    expect(maxRunning).toBe(2);
  });

  it("propagates a rejection to its own caller without blocking the queue", async () => {
    const limit = createLimiter(1);
    const first = limit(() => Promise.reject(new Error("boom")));
    const second = limit(() => Promise.resolve("ok"));

    await expect(first).rejects.toThrow("boom");
    await expect(second).resolves.toBe("ok");
  });

  it("rejects for a non-positive or non-integer limit", () => {
    expect(() => createLimiter(0)).toThrow(/positive integer/);
    expect(() => createLimiter(-1)).toThrow(/positive integer/);
    expect(() => createLimiter(1.5)).toThrow(/positive integer/);
  });
});
