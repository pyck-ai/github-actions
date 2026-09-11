import type { WorkdirCheck } from "../manifest/schema.js";
import { type CheckContext, type CheckResult } from "./types.js";
/**
 * Ports `check_workdir`. A missing/unpullable image is a HARD ERROR (via
 * `inspectImageConfig`'s propagating rejection) — the bash's `docker
 * inspect ... 2>/dev/null` swallows the failure into `""`, and
 * `[ "$got" = "$2" ]` then PASSES whenever the expected value is also
 * `""`, silently turning "image doesn't exist" into a green check.
 */
export declare function executeWorkdirCheck(check: WorkdirCheck, index: number, ctx: CheckContext): Promise<CheckResult>;
//# sourceMappingURL=workdir.d.ts.map