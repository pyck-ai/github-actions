import type { Check, CheckKind } from "../manifest/schema.js";
import type { DockerCli } from "../docker/cli.js";

/** A single check's outcome. `checks/index.ts` never lets a check's own failure throw — see its doc comment for the hard-error exception. */
export type CheckVerdict = "pass" | "fail";

export interface CheckResult {
  /** The check's 0-based position within its resolved (post-`match`) check list. */
  index: number;
  kind: CheckKind;
  /** Human-readable description, e.g. `"runs as nonroot (uid 1001)"` — the bash predecessor's `_pass`/`_fail` message. */
  label: string;
  verdict: CheckVerdict;
  /** Present on failure (or occasionally to note a truncation); the bash predecessor's second `_fail` argument. */
  detail?: string;
}

export interface CheckContext {
  cli: DockerCli;
  /** The fully-resolved image reference the checks run against. */
  image: string;
  /**
   * Absolute path to the directory containing the manifest file that
   * declared the current check — `sh`'s `mounts[].host` is resolved
   * relative to this, not the process's cwd, so a manifest's fixture
   * paths work regardless of where `imgverify` is invoked from.
   */
  manifestDir: string;
}

export type CheckExecutor<C extends Check = Check> = (
  check: C,
  index: number,
  ctx: CheckContext,
) => Promise<CheckResult>;

export function pass(index: number, kind: CheckKind, label: string): CheckResult {
  return { index, kind, label, verdict: "pass" };
}

export function fail(index: number, kind: CheckKind, label: string, detail?: string): CheckResult {
  return detail === undefined
    ? { index, kind, label, verdict: "fail" }
    : { index, kind, label, verdict: "fail", detail };
}

/**
 * Truncates captured command output to a few lines for a failure detail.
 * The bash predecessor uses `head -1` (`check_version`) or `tail -3`
 * (`check_shell_cmd`), both of which are frequently the wrong line for a
 * tool that prints a banner before the line that matters. This keeps a
 * few lines from both ends instead of gambling on one.
 */
export function truncateOutput(output: string, maxLines = 5): string {
  const lines = output
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.length > 0);
  if (lines.length <= maxLines) {
    return lines.join(" ");
  }
  const head = lines.slice(0, maxLines - 1);
  return [...head, `… (${String(lines.length - (maxLines - 1))} more lines)`].join(" ");
}
