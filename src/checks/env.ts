import type { EnvCheck } from "../manifest/schema.js";
import { getEnvValue, inspectImageConfig } from "../docker/inspect.js";
import { fail, pass, type CheckContext, type CheckResult } from "./types.js";

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
export async function executeEnvCheck(
  check: EnvCheck,
  index: number,
  ctx: CheckContext,
): Promise<CheckResult> {
  const config = await inspectImageConfig(ctx.cli, ctx.image);
  const got = getEnvValue(config.env, check.name);

  if ("equals" in check) {
    const label = `${check.name}=${check.equals}`;
    return got !== undefined && got === check.equals
      ? pass(index, "env", label)
      : fail(index, "env", label, `got '${got ?? "<unset>"}'`);
  }

  if ("contains" in check) {
    const label = `${check.name} contains ${check.contains}`;
    return got !== undefined && got.includes(check.contains)
      ? pass(index, "env", label)
      : fail(index, "env", label, `got '${got ?? "<unset>"}'`);
  }

  // check.absent === true
  const label = `${check.name} is unset`;
  return got === undefined ? pass(index, "env", label) : fail(index, "env", label, `got '${got}'`);
}
