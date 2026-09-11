import type { EnvCheck } from "../manifest/schema.js";
import { type CheckContext, type CheckResult } from "./types.js";
/**
 * Ports `check_env`/`check_env_contains`, but as EQUALITY/substring on the
 * resolved value rather than the bash's presence-conflating comparison:
 * the bash's `sed -n "s/^$2=//p"` on an UNSET variable yields the empty
 * string, indistinguishable from a variable explicitly set to `""`, so
 * `check_env IMG FOO ""` passes for both. Here an unset variable never
 * satisfies `equals: ""` — a free tightening; no existing call site relies
 * on the bash's conflation (see the PASS 2 task brief).
 *
 * `name` is matched as a LITERAL key, and `Config.Env` duplicate keys
 * resolve "last wins" (Docker's own runtime behaviour) via
 * `getEnvValue` — the bash's `sed` pipeline instead reports the FIRST
 * match, which is wrong whenever an image sets the same var twice.
 */
export declare function executeEnvCheck(check: EnvCheck, index: number, ctx: CheckContext): Promise<CheckResult>;
//# sourceMappingURL=env.d.ts.map