import type { Check } from "../manifest/schema.js";
import type { CheckContext, CheckResult } from "./types.js";
/** Runs a single check via its kind's executor. See this module's doc comment for hard-error propagation. */
export declare function executeCheck(check: Check, index: number, ctx: CheckContext): Promise<CheckResult>;
export type { CheckContext, CheckResult, CheckVerdict } from "./types.js";
//# sourceMappingURL=index.d.ts.map