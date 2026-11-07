import type { KeepReason } from "./judge.js";

export interface ReportedBranch {
  name: string;
  sha: string;
  committedDate: Date;
}

export interface Report {
  dryRun: boolean;
  cutoff: Date;
  seen: number;
  stale: number;
  unreadable: number;
  kept: Record<KeepReason, number>;
  /** Deleted in a live run, would be deleted in a dry run. */
  deleted: ReportedBranch[];
  alreadyGone: number;
  changedSinceListing: number;
  failed: string[];
  skipped: string[];
}

const KEEP_LABELS: Record<KeepReason, string> = {
  "keep-branches": "kept by name (keep-branches)",
  "default-branch": "kept, default branch",
  protected: "kept, protected",
  "protection-unknown": "kept, protection status unknown",
  "open-pr-head": "kept, head of an open pull request",
  "open-pr-base": "kept, base of an open pull request",
};

/** A table cell: no pipe or line break may end it early. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

/** The shell command that recreates a deleted branch from the logged head SHA. */
export function recreateCommand(branch: ReportedBranch): string {
  return `git push origin ${branch.sha}:refs/heads/${branch.name}`;
}

/** Markdown for `GITHUB_STEP_SUMMARY`. */
export function renderSummary(report: Report): string {
  const deletedLabel = report.dryRun ? "would delete" : "deleted";
  const lines = [
    "## branch-tidy",
    "",
    `- Mode: ${report.dryRun ? "dry run (nothing is deleted)" : "live"}`,
    `- Cutoff: ${report.cutoff.toISOString()} (a branch is stale when its head commit is older)`,
    "",
    "| Count | Branches |",
    "| --- | ---: |",
    `| Branches seen | ${String(report.seen)} |`,
    `| Stale | ${String(report.stale)} |`,
    `| Kept, head commit date unreadable | ${String(report.unreadable)} |`,
    ...(Object.keys(KEEP_LABELS) as KeepReason[]).map(
      (reason) => `| ${KEEP_LABELS[reason]} | ${String(report.kept[reason])} |`,
    ),
    `| ${deletedLabel[0]?.toUpperCase() ?? ""}${deletedLabel.slice(1)} | ${String(report.deleted.length)} |`,
    `| Already gone | ${String(report.alreadyGone)} |`,
    `| Changed since listing (kept) | ${String(report.changedSinceListing)} |`,
    `| Failed | ${String(report.failed.length)} |`,
    `| Skipped after an authorization failure | ${String(report.skipped.length)} |`,
    "",
  ];
  if (report.deleted.length > 0) {
    lines.push(
      `### Branches ${deletedLabel}`,
      "",
      "| Branch | Last commit | Head SHA | Recreate with |",
      "| --- | --- | --- | --- |",
      ...report.deleted.map(
        (b) =>
          `| ${cell(b.name)} | ${b.committedDate.toISOString()} | ${b.sha} | \`${cell(recreateCommand(b))}\` |`,
      ),
      "",
    );
  }
  if (report.failed.length > 0) {
    lines.push("### Failed", "", ...report.failed.map((name) => `- ${cell(name)}`), "");
  }
  if (report.skipped.length > 0) {
    lines.push("### Skipped", "", ...report.skipped.map((name) => `- ${cell(name)}`), "");
  }
  return lines.join("\n");
}
