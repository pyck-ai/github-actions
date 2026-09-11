/**
 * The outcome of an HTTP attempt: either a response was received (any
 * status — the caller decides what to do with it via {@link classifyStatus})
 * or the request failed below the HTTP layer (DNS, TLS, timeout, ...).
 */
export type HttpOutcome = {
    kind: "response";
    status: number;
    headers: Headers;
    bodyText: string;
} | {
    kind: "network-error";
    error: unknown;
};
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
export declare function requestWithRetry(url: string, init: RequestInit, options?: RequestWithRetryOptions): Promise<HttpOutcome>;
//# sourceMappingURL=http.d.ts.map