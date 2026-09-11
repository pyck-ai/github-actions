/**
 * A bounded concurrency gate: `limit(fn)` queues `fn` and runs it only
 * once fewer than `limit` calls are currently in flight through THIS
 * limiter. Unlike a fixed-size worker pool over a known array (see
 * `cli.ts`'s `runPool`), this has no notion of "items" — arbitrary,
 * differently-shaped async work from anywhere can share one limiter.
 *
 * This is what actually bounds registry HTTP concurrency for ghcr-tidy
 * (see `cli.ts`'s `--jobs` wiring): the planning core (`roots.ts`,
 * `reachability.ts`) fires its independent per-tag/per-BFS-node requests
 * with `Promise.all` and no limit of its own — deliberately, so it stays
 * pure set-arithmetic-plus-I/O with no concurrency policy baked in — and
 * relies on the `RegistryReader` it was given already being wrapped by a
 * limiter sized to `--jobs`. One shared limiter, applied once at the
 * registry-adapter boundary, means concurrency stays additive (bounded by
 * `--jobs` HTTP requests in flight at any moment, across every package and
 * every BFS frontier at once) rather than multiplying together with
 * whatever other pool (e.g. the cross-package one) happens to also be
 * live — two independently-sized pools nested inside each other would
 * bound total concurrency to their PRODUCT, not either one's own limit.
 */
export function createLimiter(limit: number): <T>(fn: () => Promise<T>) => Promise<T> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`limiter concurrency must be a positive integer, got ${String(limit)}`);
  }

  let active = 0;
  const queue: Array<() => void> = [];

  function schedule(): void {
    if (active >= limit) {
      return;
    }
    const run = queue.shift();
    if (!run) {
      return;
    }
    active += 1;
    run();
  }

  return function withLimit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn().then(
          (value) => {
            active -= 1;
            resolve(value);
            schedule();
          },
          (error: unknown) => {
            active -= 1;
            reject(error);
            schedule();
          },
        );
      });
      schedule();
    });
  };
}
