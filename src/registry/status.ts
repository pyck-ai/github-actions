/**
 * Classification of an observed HTTP status, used throughout the registry
 * core so callers can distinguish a genuinely dead resource (404) from a
 * transient failure (429/5xx) that just needs a retry — rather than
 * treating every non-200 the same way, which is what let the bash
 * predecessor silently misclassify rate limits as "dead" in places.
 */
export type StatusClass = "success" | "not-found" | "transient" | "client-error" | "network-error";

/** Pure classification of an HTTP status code. No I/O. */
export function classifyStatus(status: number): StatusClass {
  if (status === 404) {
    return "not-found";
  }
  if (status === 429 || (status >= 500 && status <= 599)) {
    return "transient";
  }
  if (status >= 200 && status < 300) {
    return "success";
  }
  return "client-error";
}

/** Whether a status code warrants a retry (429 or 5xx). */
export function shouldRetryStatus(status: number): boolean {
  return classifyStatus(status) === "transient";
}
