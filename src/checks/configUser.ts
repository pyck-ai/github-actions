import type { ConfigUserCheck } from "../manifest/schema.js";
import { inspectImageConfig } from "../docker/inspect.js";
import { fail, pass, type CheckContext, type CheckResult } from "./types.js";

/**
 * Ports `check_user_inspect`: an equality check on `Config.User` alone —
 * no `docker run`, so it's the only `user`-flavoured check that works on
 * shell-less (scratch) images. A missing/unpullable image is a HARD ERROR
 * (via `inspectImageConfig`), for the same reason `workdir` treats it as
 * one: the bash's `docker inspect ... 2>/dev/null` swallowing the failure
 * into `""` would let this PASS for an image that doesn't exist, when the
 * expected value is also `""`.
 */
export async function executeConfigUserCheck(
  check: ConfigUserCheck,
  index: number,
  ctx: CheckContext,
): Promise<CheckResult> {
  const label = `Config.User is ${check.value}`;
  const config = await inspectImageConfig(ctx.cli, ctx.image);
  return config.user === check.value
    ? pass(index, "configUser", label)
    : fail(index, "configUser", label, `got '${config.user.length > 0 ? config.user : "<empty>"}'`);
}
