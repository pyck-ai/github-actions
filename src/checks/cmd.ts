import type { CmdCheck } from "../manifest/schema.js";
import { nonEmptyLines } from "./util.js";
import { fail, pass, type CheckContext, type CheckResult } from "./types.js";

/**
 * Ports `check_cmd`. Each name in `commands` is spliced into the shell
 * loop as a LITERAL (the bash predecessor does the same unquoted, and no
 * existing call site has a glob or a space in a command name — see the
 * PASS 2 task brief).
 */
export async function executeCmdCheck(
  check: CmdCheck,
  index: number,
  ctx: CheckContext,
): Promise<CheckResult> {
  const label = `on PATH: ${check.commands.join(" ")}`;
  const command = `for c in ${check.commands.join(" ")}; do command -v "$c" >/dev/null 2>&1 || echo "$c"; done`;
  const result = await ctx.cli.run({
    image: ctx.image,
    command,
    ...(check.as !== undefined && { as: check.as }),
  });
  const missing = nonEmptyLines(result.output);
  return missing.length === 0
    ? pass(index, "cmd", label)
    : fail(index, "cmd", label, `missing: ${missing.join(" ")}`);
}
