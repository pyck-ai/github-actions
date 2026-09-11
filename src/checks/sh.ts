import type { ShCheck } from "../manifest/schema.js";
import { resolveMounts } from "./util.js";
import { fail, pass, truncateOutput, type CheckContext, type CheckResult } from "./types.js";

/**
 * Ports `check_shell_cmd`/`check_shell_cmd_as`: passes iff the command
 * exits 0. `mounts[].host` is resolved relative to the manifest file's
 * own directory (`ctx.manifestDir`), not the process cwd — a manifest's
 * fixture-mount paths must work regardless of where `imgverify` runs
 * from. Failure detail includes stderr (merged into `DockerCli#run`'s
 * combined output already) truncated to a few lines, per-check
 * `timeoutMs` is passed straight through to `DockerCli#run`.
 */
export async function executeShCheck(
  check: ShCheck,
  index: number,
  ctx: CheckContext,
): Promise<CheckResult> {
  const label = check.desc;
  const mounts = resolveMounts(check.mounts, ctx.manifestDir);
  const result = await ctx.cli.run({
    image: ctx.image,
    command: check.run,
    ...(check.as !== undefined && { as: check.as }),
    ...(mounts !== undefined && { mounts }),
    ...(check.timeoutMs !== undefined && { timeoutMs: check.timeoutMs }),
  });
  return result.exitCode === 0
    ? pass(index, "sh", label)
    : fail(index, "sh", label, truncateOutput(result.output, 4));
}
