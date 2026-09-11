import type { CheckResult } from "../checks/types.js";
/**
 * The machine-readable report a later equivalence oracle diffs against
 * the console report (and, eventually, the bash predecessor's behaviour)
 * — one JSON document per target/ref, carrying every {@link CheckResult}
 * verbatim plus a summary and the process exit code pass 3 should use.
 */
export interface JsonReportSummary {
    total: number;
    passed: number;
    failed: number;
}
export interface JsonReport {
    target: string;
    ref: string;
    checks: CheckResult[];
    summary: JsonReportSummary;
    /** `0` if every check passed, `1` otherwise — the bash predecessor's `verify_summary` exit code. */
    exitCode: number;
}
/** Builds a {@link JsonReport} from a resolved target's check results. Pure — no I/O. */
export declare function buildJsonReport(target: string, ref: string, checks: readonly CheckResult[]): JsonReport;
/** `JSON.stringify`s a {@link JsonReport} with stable, readable formatting. */
export declare function formatJsonReport(report: JsonReport): string;
//# sourceMappingURL=json.d.ts.map