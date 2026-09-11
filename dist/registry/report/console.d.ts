import type { CheckResult } from "../checks/types.js";
export interface ConsoleReportOptions {
    /** Whether to emit ANSI colour codes. Defaults to auto-detecting a TTY via `process.stdout.isTTY`. */
    color?: boolean;
}
/**
 * Renders the full console report as a single string (one line per check,
 * plus indented detail lines and a final tally) — the bash predecessor's
 * `_pass`/`_fail 2>&1` output, reproduced verbatim in shape.
 */
export declare function formatConsoleReport(results: readonly CheckResult[], options?: ConsoleReportOptions): string;
/** Writes {@link formatConsoleReport}'s output (plus a trailing newline) to `stream`, auto-detecting colour from the stream's own `isTTY`. */
export declare function printConsoleReport(results: readonly CheckResult[], stream?: NodeJS.WritableStream): void;
//# sourceMappingURL=console.d.ts.map