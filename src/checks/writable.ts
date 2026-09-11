import type { WritableCheck } from "../manifest/schema.js";
import { asLabel, nonEmptyLines } from "./util.js";
import { fail, pass, type CheckContext, type CheckResult } from "./types.js";

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
export async function executeWritableCheck(
  check: WritableCheck,
  index: number,
  ctx: CheckContext,
): Promise<CheckResult> {
  const label = `writable by ${asLabel(check.as)}: ${check.paths.join(" ")}`;
  const probe = check.mustExist
    ? `([ -e "$d" ] && mkdir -p "$d" && touch "$d/.wprobe" && rm -f "$d/.wprobe")`
    : `(mkdir -p "$d" && touch "$d/.wprobe" && rm -f "$d/.wprobe")`;
  const command = `for d in ${check.paths.join(" ")}; do ${probe} 2>/dev/null || echo "$d"; done`;
  const result = await ctx.cli.run({
    image: ctx.image,
    command,
    ...(check.as !== undefined && { as: check.as }),
  });
  const denied = nonEmptyLines(result.output);
  return denied.length === 0
    ? pass(index, "writable", label)
    : fail(index, "writable", label, `denied: ${denied.join(" ")}`);
}
