import type { UserCheck } from "../manifest/schema.js";
import { type CheckContext, type CheckResult } from "./types.js";
/**
 * Ports the bash predecessor's `check_user`, preserving its one load-
 * bearing looseness: the `name`/`configUser`-less path compares ONLY the
 * uid. `check_user <img> completely-bogus-name 0` PASSES in the bash —
 * `want_name` is a display label, never compared to anything. Pinned by
 * `user.test.ts`'s "a wrong name with a right uid passes" test.
 *
 * `configUser` is an opt-in tightening (not present in the bash) that
 * additionally asserts the resolved username (`id -un`) — for call sites
 * that DO want name equality, without forcing it on every caller.
 *
 * A missing/unpullable image is a HARD ERROR (this function lets
 * `inspectImageConfig`'s rejection propagate), not a check failure — the
 * bash predecessor instead reports "Config.User is empty", which is true
 * but misleading (the image doesn't exist at all).
 */
export declare function executeUserCheck(check: UserCheck, index: number, ctx: CheckContext): Promise<CheckResult>;
//# sourceMappingURL=user.d.ts.map