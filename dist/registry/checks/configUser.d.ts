import type { ConfigUserCheck } from "../manifest/schema.js";
import { type CheckContext, type CheckResult } from "./types.js";
/**
 * Ports `check_user_inspect`: an equality check on `Config.User` alone —
 * no `docker run`, so it's the only `user`-flavoured check that works on
 * shell-less (scratch) images. A missing/unpullable image is a HARD ERROR
 * (via `inspectImageConfig`), for the same reason `workdir` treats it as
 * one: the bash's `docker inspect ... 2>/dev/null` swallowing the failure
 * into `""` would let this PASS for an image that doesn't exist, when the
 * expected value is also `""`.
 */
export declare function executeConfigUserCheck(check: ConfigUserCheck, index: number, ctx: CheckContext): Promise<CheckResult>;
//# sourceMappingURL=configUser.d.ts.map