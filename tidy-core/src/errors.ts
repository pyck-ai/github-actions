/** The HTTP status of an Octokit error, or `undefined` for any other error. */
export function statusOf(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

/** The error's message, prefixed with `HTTP <status>: ` when it carries a status. */
export function describeError(err: unknown): string {
  const status = statusOf(err);
  const message = err instanceof Error ? err.message : String(err);
  return status !== undefined ? `HTTP ${String(status)}: ${message}` : message;
}
