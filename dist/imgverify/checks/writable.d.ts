import type { WritableCheck } from "../manifest/schema.js";
import { type CheckContext, type CheckResult } from "./types.js";
/**
 * Ports `check_writable`/`check_writable_as`, preserving its one load-
 * bearing looseness: this tests "can create-and-write", not "exists and
 * is writable" — `mkdir -p` creates the path if it's missing, so a
 * typo'd path under a writable parent PASSES. `mustExist` (default
 * `false`, matching every existing bash call site's implicit behaviour)
 * opts a call site into ALSO requiring the path to already exist. Pinned
 * by `writable.test.ts`'s "a nonexistent path passes by default" test.
 *
 * Every path is spliced as a LITERAL, matching the bash's unquoted
 * splice — no existing call site has a glob or a space in a path.
 */
export declare function executeWritableCheck(check: WritableCheck, index: number, ctx: CheckContext): Promise<CheckResult>;
//# sourceMappingURL=writable.d.ts.map