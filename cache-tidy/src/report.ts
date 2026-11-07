import { isDead, type Reason } from "./judge.js";
import type { CacheEntry } from "./github.js";

export interface Classified {
  cache: CacheEntry;
  reason: Reason;
}

export interface Report {
  dryRun: boolean;
  /** Every cache listed, with its class. */
  caches: Classified[];
  /** Deleted in a live run, would be deleted in a dry run. */
  deleted: Classified[];
  alreadyGone: number;
  failed: number[];
  /** Ids not attempted after an authorization failure. */
  skipped: number[];
}

/** Summary rows in order: label per class. */
const CLASS_LABELS: [Reason, string][] = [
  ["pr-merged", "Dead, pull request merged"],
  ["pr-closed", "Dead, pull request closed"],
  ["branch-gone", "Dead, branch gone"],
  ["tag-gone", "Dead, tag gone"],
  ["default-branch", "Kept, default branch"],
  ["branch-exists", "Kept, existing branch or tag"],
  ["open-pr", "Kept, open pull request"],
  ["pr-unreadable", "Kept, pull request state unreadable"],
  ["unknown", "Kept, unknown ref form"],
];

export const REASON_TEXT: Record<Reason, string> = Object.fromEntries(CLASS_LABELS) as Record<
  Reason,
  string
>;

/** A table cell: no pipe or line break may end it early. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

export function totalBytes(items: readonly Classified[]): number {
  return items.reduce((sum, item) => sum + item.cache.sizeInBytes, 0);
}

/** The one count line every run logs. */
export function countLine(report: Report): string {
  const dead = report.caches.filter((c) => isDead(c.reason));
  const verb = report.dryRun ? "would delete" : "deleted";
  return (
    `cache-tidy: ${String(report.caches.length)} caches (${String(totalBytes(report.caches))} bytes), ` +
    `${String(dead.length)} dead (${String(totalBytes(dead))} bytes), ` +
    `${verb} ${String(report.deleted.length)} (${String(totalBytes(report.deleted))} bytes), ` +
    `${String(report.caches.length - dead.length)} kept, ` +
    `${String(report.caches.filter((c) => c.reason === "unknown").length)} unknown.`
  );
}

/** Markdown for `GITHUB_STEP_SUMMARY`. */
export function renderSummary(report: Report): string {
  const deletedLabel = report.dryRun ? "would delete" : "deleted";
  const lines = [
    "## cache-tidy",
    "",
    `- Mode: ${report.dryRun ? "dry run (nothing is deleted)" : "live"}`,
    "",
    "| Class | Caches | Bytes |",
    "| --- | ---: | ---: |",
    ...CLASS_LABELS.map(([reason, label]) => {
      const items = report.caches.filter((c) => c.reason === reason);
      return `| ${label} | ${String(items.length)} | ${String(totalBytes(items))} |`;
    }),
    `| All caches | ${String(report.caches.length)} | ${String(totalBytes(report.caches))} |`,
    `| ${deletedLabel[0]?.toUpperCase() ?? ""}${deletedLabel.slice(1)} | ${String(report.deleted.length)} | ${String(totalBytes(report.deleted))} |`,
    `| Already gone | ${String(report.alreadyGone)} | |`,
    `| Failed | ${String(report.failed.length)} | |`,
    `| Skipped after an authorization failure | ${String(report.skipped.length)} | |`,
    "",
  ];
  if (report.deleted.length > 0) {
    lines.push(
      `### Caches ${deletedLabel}`,
      "",
      "| Id | Key | Ref | Reason | Size (bytes) | Last accessed |",
      "| ---: | --- | --- | --- | ---: | --- |",
      ...report.deleted.map(
        ({ cache, reason }) =>
          `| ${String(cache.id)} | ${cell(cache.key)} | ${cell(cache.ref ?? "")} | ${REASON_TEXT[reason]} | ${String(cache.sizeInBytes)} | ${cache.lastAccessedAt} |`,
      ),
      "",
    );
  }
  if (report.failed.length > 0) {
    lines.push("### Failed", "", ...report.failed.map((id) => `- ${String(id)}`), "");
  }
  if (report.skipped.length > 0) {
    lines.push("### Skipped", "", ...report.skipped.map((id) => `- ${String(id)}`), "");
  }
  return lines.join("\n");
}
