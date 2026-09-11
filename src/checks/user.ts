import type { UserCheck } from "../manifest/schema.js";
import { inspectImageConfig } from "../docker/inspect.js";
import { fail, pass, type CheckContext, type CheckResult } from "./types.js";

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
export async function executeUserCheck(
  check: UserCheck,
  index: number,
  ctx: CheckContext,
): Promise<CheckResult> {
  const label =
    check.name !== undefined
      ? `runs as ${check.name} (uid ${String(check.uid)})`
      : `runs as uid ${String(check.uid)}`;

  const config = await inspectImageConfig(ctx.cli, ctx.image);
  if (config.user.length === 0) {
    return fail(index, "user", label, "Config.User is empty (image would run as root)");
  }

  const uidResult = await ctx.cli.run({ image: ctx.image, command: "id -u" });
  const actual = uidResult.output.trim();
  if (!/^[0-9]+$/.test(actual)) {
    return fail(index, "user", label, actual);
  }

  const wantUid = String(check.uid);
  if (actual !== wantUid) {
    return fail(index, "user", label, `got uid ${actual} (Config.User=${config.user})`);
  }

  if (check.configUser !== undefined) {
    const nameResult = await ctx.cli.run({ image: ctx.image, command: "id -un" });
    const actualName = nameResult.output.trim();
    if (actualName !== check.configUser) {
      return fail(index, "user", label, `expected user "${check.configUser}", got "${actualName}"`);
    }
  }

  return pass(index, "user", label);
}
