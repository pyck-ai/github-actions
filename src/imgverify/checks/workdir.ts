import type { WorkdirCheck } from "../manifest/schema.js";
import { inspectImageConfig } from "../docker/inspect.js";
import { fail, pass, type CheckContext, type CheckResult } from "./types.js";

/**
 * Ports `check_workdir`. A missing/unpullable image is a HARD ERROR (via
 * `inspectImageConfig`'s propagating rejection) — the bash's `docker
 * inspect ... 2>/dev/null` swallows the failure into `""`, and
 * `[ "$got" = "$2" ]` then PASSES whenever the expected value is also
 * `""`, silently turning "image doesn't exist" into a green check.
 */
export async function executeWorkdirCheck(
  check: WorkdirCheck,
  index: number,
  ctx: CheckContext,
): Promise<CheckResult> {
  const label = `WORKDIR is ${check.value}`;
  const config = await inspectImageConfig(ctx.cli, ctx.image);
  return config.workdir === check.value
    ? pass(index, "workdir", label)
    : fail(
        index,
        "workdir",
        label,
        `got '${config.workdir.length > 0 ? config.workdir : "<empty>"}'`,
      );
}
