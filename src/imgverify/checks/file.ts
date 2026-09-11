import type { FileCheck } from "../manifest/schema.js";
import { nonEmptyLines } from "./util.js";
import { fail, pass, type CheckContext, type CheckResult } from "./types.js";

/** Ports `check_file`: path existence via `[ -e ]` inside a running container (as opposed to `imageFile`'s exported-filesystem check, the only option for scratch images). */
export async function executeFileCheck(
  check: FileCheck,
  index: number,
  ctx: CheckContext,
): Promise<CheckResult> {
  const label = `present: ${check.paths.join(" ")}`;
  const command = `for f in ${check.paths.join(" ")}; do [ -e "$f" ] || echo "$f"; done`;
  const result = await ctx.cli.run({
    image: ctx.image,
    command,
    ...(check.as !== undefined && { as: check.as }),
  });
  const missing = nonEmptyLines(result.output);
  return missing.length === 0
    ? pass(index, "file", label)
    : fail(index, "file", label, `missing: ${missing.join(" ")}`);
}
