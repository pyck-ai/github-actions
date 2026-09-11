import type { VersionCheck } from "../manifest/schema.js";
import { fail, pass, truncateOutput, type CheckContext, type CheckResult } from "./types.js";

/**
 * Ports `check_version`, preserving its one load-bearing looseness: an
 * UNANCHORED SUBSTRING match on `contains` against the run's combined
 * stdout+stderr. Not equality, not a word-boundary match — `python`'s
 * manifest asserts `PYTHON_VERSION=3.14` against an image shipping
 * `3.14.x`, and needle `3.5` matching output `3.53.1` is exactly the
 * proven case anchoring would break. Pinned by `version.test.ts`'s
 * "`3.5` matches `3.53.1`" test.
 *
 * `matches` (regex) and `notContains` are optional additional tightenings
 * for call sites that want them; the bare `contains` substring is always
 * checked and is never anchored, regardless of whether they're present.
 *
 * Failure detail uses {@link truncateOutput} (a few lines from both ends)
 * rather than the bash's `head -1`, which is frequently the wrong line
 * for a tool that prints a banner before the line that matters.
 */
export async function executeVersionCheck(
  check: VersionCheck,
  index: number,
  ctx: CheckContext,
): Promise<CheckResult> {
  const label = `${check.run} reports ${check.contains}`;
  const result = await ctx.cli.run({
    image: ctx.image,
    command: check.run,
    ...(check.as !== undefined && { as: check.as }),
  });
  const output = result.output;

  const failures: string[] = [];
  if (!output.includes(check.contains)) {
    failures.push(`does not contain "${check.contains}"`);
  }
  if (check.matches !== undefined && !new RegExp(check.matches).test(output)) {
    failures.push(`does not match /${check.matches}/`);
  }
  if (check.notContains !== undefined && output.includes(check.notContains)) {
    failures.push(`unexpectedly contains "${check.notContains}"`);
  }

  return failures.length === 0
    ? pass(index, "version", label)
    : fail(index, "version", label, `${failures.join("; ")} — got: ${truncateOutput(output)}`);
}
