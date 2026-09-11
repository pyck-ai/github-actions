import type { CheckResult } from "../checks/types.js";

/**
 * The console report, ported line-for-line from the bash predecessor's
 * `_pass`/`_fail`/`verify_summary`: a `✓`/`✗` per check with its label,
 * an indented detail line on failure, and a tally at the end. Kept
 * intentionally close to that SHAPE (not just semantics) because a later
 * equivalence oracle compares this implementation's output against the
 * bash's, positionally, per check.
 */

const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const RESET = "\u001b[0m";

export interface ConsoleReportOptions {
  /** Whether to emit ANSI colour codes. Defaults to auto-detecting a TTY via `process.stdout.isTTY`. */
  color?: boolean;
}

function colorize(text: string, code: string, color: boolean): string {
  return color ? `${code}${text}${RESET}` : text;
}

function defaultColor(): boolean {
  return typeof process !== "undefined" && process.stdout?.isTTY === true;
}

/**
 * Renders the full console report as a single string (one line per check,
 * plus indented detail lines and a final tally) — the bash predecessor's
 * `_pass`/`_fail 2>&1` output, reproduced verbatim in shape.
 */
export function formatConsoleReport(
  results: readonly CheckResult[],
  options: ConsoleReportOptions = {},
): string {
  const color = options.color ?? defaultColor();
  const lines: string[] = [];

  for (const result of results) {
    if (result.verdict === "pass") {
      lines.push(`  ${colorize("✓", GREEN, color)} ${result.label}`);
    } else {
      lines.push(`  ${colorize("✗", RED, color)} ${result.label}`);
      if (result.detail !== undefined && result.detail.length > 0) {
        lines.push(`      ${result.detail}`);
      }
    }
  }

  const total = results.length;
  const failed = results.filter((r) => r.verdict === "fail").length;
  lines.push(
    failed > 0
      ? `  ${colorize(`${String(failed)} of ${String(total)} checks failed`, RED, color)}`
      : `  ${colorize(`all ${String(total)} checks passed`, GREEN, color)}`,
  );

  return lines.join("\n");
}

/** Writes {@link formatConsoleReport}'s output (plus a trailing newline) to `stream`, auto-detecting colour from the stream's own `isTTY`. */
export function printConsoleReport(
  results: readonly CheckResult[],
  stream: NodeJS.WritableStream = process.stdout,
): void {
  const color = "isTTY" in stream && (stream as { isTTY?: boolean }).isTTY === true;
  stream.write(`${formatConsoleReport(results, { color })}\n`);
}
