import type { HttpCheck } from "../manifest/schema.js";
import { type CheckContext, type CheckResult } from "./types.js";
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
export declare function executeHttpCheck(check: HttpCheck, index: number, ctx: CheckContext): Promise<CheckResult>;
//# sourceMappingURL=http.d.ts.map