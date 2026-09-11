import { shouldRetryStatus } from "./status.js";

/**
 * The outcome of an HTTP attempt: either a response was received (any
 * status — the caller decides what to do with it via {@link classifyStatus})
 * or the request failed below the HTTP layer (DNS, TLS, timeout, ...).
 */
export type HttpOutcome =
  | { kind: "response"; status: number; headers: Headers; bodyText: string }
  | { kind: "network-error"; error: unknown };

export interface RequestWithRetryOptions {
  /** Total attempts, including the first. Default 3. */
  attempts?: number;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests, to avoid real delays. Defaults to `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  /** Backoff duration before retry attempt `attempt` (1-based). */
  backoffMs?: (attempt: number) => number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
const defaultBackoff = (attempt: number): number => attempt * 2000;

/**
 * Performs an HTTP request, retrying up to `attempts` times (default 3) on
 * 429, 5xx, and network-level failures, with a linear backoff between
 * attempts. This is the direct replacement for the bash `request_with_retry`
 * helper duplicated byte-identically across the tidy/audit scripts.
 *
 * Always resolves (never rejects) with the last observed outcome, whether
 * that is a response or a network error, so callers get a uniform value to
 * classify rather than a mix of return values and thrown exceptions.
 */
export async function requestWithRetry(
  url: string,
  init: RequestInit,
  options: RequestWithRetryOptions = {},
): Promise<HttpOutcome> {
  const attempts = options.attempts ?? 3;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const backoffMs = options.backoffMs ?? defaultBackoff;

  let lastOutcome: HttpOutcome = {
    kind: "network-error",
    error: new Error("requestWithRetry: attempts must be >= 1"),
  };

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetchImpl(url, init);
      const bodyText = await res.text();
      const outcome: HttpOutcome = {
        kind: "response",
        status: res.status,
        headers: res.headers,
        bodyText,
      };
      lastOutcome = outcome;
      if (shouldRetryStatus(res.status) && attempt < attempts) {
        await sleep(backoffMs(attempt));
        continue;
      }
      return outcome;
    } catch (error) {
      lastOutcome = { kind: "network-error", error };
      if (attempt < attempts) {
        await sleep(backoffMs(attempt));
        continue;
      }
    }
  }

  return lastOutcome;
}
