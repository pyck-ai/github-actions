import type { HttpCheck } from "../manifest/schema.js";
import { fail, pass, type CheckContext, type CheckResult } from "./types.js";

const DEFAULT_RETRIES = 10;
const DEFAULT_RETRY_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parses `docker port`'s `host:port` (or `[::]:port`) mapping into a fetchable base URL. */
function hostPortToUrl(mapping: string, path: string): string {
  const lastColon = mapping.lastIndexOf(":");
  const port = mapping.slice(lastColon + 1);
  return `http://127.0.0.1:${port}${path}`;
}

/**
 * New check kind (no direct bash predecessor — the bash's `check_host`
 * escape hatch was used for ad hoc host-side probes; this is the one
 * closed, typed replacement for the "publish a port and request it" case
 * called out in the manifest schema's doc comment).
 *
 * Publishes the container's ports (`-P`), resolves the host-side mapping
 * for `containerPort` via `docker port`, then retry-polls `path` until
 * `expectStatus` is seen or retries are exhausted. The container is
 * ALWAYS removed afterwards, including when anything above throws — the
 * bash's `check_host` relies on `trap ... EXIT` for the same guarantee.
 */
export async function executeHttpCheck(
  check: HttpCheck,
  index: number,
  ctx: CheckContext,
): Promise<CheckResult> {
  const label = check.desc;
  const retries = check.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = check.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  const containerId = await ctx.cli.create({ image: ctx.image, args: ["-P"] });
  try {
    await ctx.cli.start(containerId);
    const mapping = await ctx.cli.port(containerId, check.containerPort);
    const url = hostPortToUrl(mapping, check.path);

    let lastError: string | undefined;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url);
        if (response.status === check.expectStatus) {
          return pass(index, "http", label);
        }
        lastError = `got status ${String(response.status)} from ${url}`;
      } catch (err) {
        lastError = `${url}: ${err instanceof Error ? err.message : String(err)}`;
      }
      if (attempt < retries) {
        await sleep(retryDelayMs);
      }
    }
    return fail(index, "http", label, lastError ?? "no response");
  } catch (err) {
    return fail(index, "http", label, err instanceof Error ? err.message : String(err));
  } finally {
    await ctx.cli.rm(containerId, { force: true }).catch(() => {
      // Best-effort cleanup: a failed removal must not mask the real result.
    });
  }
}
