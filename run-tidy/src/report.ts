export interface WorkflowCounts {
  name: string;
  seen: number;
  old: number;
  keptByMinimum: number;
  notFinished: number;
  /** Deleted in a live run, would be deleted in a dry run. */
  deleted: number;
  alreadyGone: number;
  failed: number;
  /** Old runs not attempted: `max-deletions` or an authorization stop. */
  notAttempted: number;
  /** Runs with no readable `created_at`. */
  unreadable: number;
}

export interface Report {
  dryRun: boolean;
  cutoff: Date;
  workflows: Map<string, WorkflowCounts>;
}

const COLUMNS: { header: string; value: (w: WorkflowCounts) => number }[] = [
  { header: "Seen", value: (w) => w.seen },
  { header: "Old", value: (w) => w.old },
  { header: "Kept by minimum", value: (w) => w.keptByMinimum },
  { header: "Not finished", value: (w) => w.notFinished },
  { header: "Deleted", value: (w) => w.deleted },
  { header: "Already gone", value: (w) => w.alreadyGone },
  { header: "Failed", value: (w) => w.failed },
  { header: "Not attempted", value: (w) => w.notAttempted },
  { header: "No date (kept)", value: (w) => w.unreadable },
];

export function emptyCounts(name: string): WorkflowCounts {
  return {
    name,
    seen: 0,
    old: 0,
    keptByMinimum: 0,
    notFinished: 0,
    deleted: 0,
    alreadyGone: 0,
    failed: 0,
    notAttempted: 0,
    unreadable: 0,
  };
}

export function totals(report: Report): WorkflowCounts {
  const sum = emptyCounts("Total");
  for (const w of report.workflows.values()) {
    sum.seen += w.seen;
    sum.old += w.old;
    sum.keptByMinimum += w.keptByMinimum;
    sum.notFinished += w.notFinished;
    sum.deleted += w.deleted;
    sum.alreadyGone += w.alreadyGone;
    sum.failed += w.failed;
    sum.notAttempted += w.notAttempted;
    sum.unreadable += w.unreadable;
  }
  return sum;
}

/** A table cell: no pipe or line break may end it early. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

/** The one log line every invocation writes, so a run can be checked from the log alone. */
export function countLine(report: Report): string {
  const t = totals(report);
  const deletedLabel = report.dryRun ? "would delete" : "deleted";
  return (
    `run-tidy: ${report.dryRun ? "dry run" : "live"}, cutoff ${report.cutoff.toISOString()}: ` +
    `${String(t.seen)} runs seen, ${String(t.old)} old, ` +
    `${String(t.keptByMinimum)} kept by the per-workflow minimum, ` +
    `${String(t.notFinished)} not finished, ${String(t.unreadable)} without a date, ` +
    `${deletedLabel} ${String(t.deleted)}, ${String(t.alreadyGone)} already gone, ` +
    `${String(t.failed)} failed, ${String(t.notAttempted)} not attempted.`
  );
}

/** Markdown for `GITHUB_STEP_SUMMARY`. */
export function renderSummary(report: Report): string {
  const deletedHeader = report.dryRun ? "Would delete" : "Deleted";
  const header = COLUMNS.map((c) => (c.header === "Deleted" ? deletedHeader : c.header));
  const row = (w: WorkflowCounts): string =>
    `| ${cell(w.name)} | ${COLUMNS.map((c) => String(c.value(w))).join(" | ")} |`;
  const names = [...report.workflows.values()].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  const lines = [
    "## run-tidy",
    "",
    `- Mode: ${report.dryRun ? "dry run (nothing is deleted)" : "live"}`,
    `- Cutoff: ${report.cutoff.toISOString()} (a run is old when it was created before)`,
    "",
    `| Workflow | ${header.join(" | ")} |`,
    `| --- | ${COLUMNS.map(() => "---:").join(" | ")} |`,
    ...names.map(row),
    row(totals(report)),
    "",
  ];
  const left = totals(report).notAttempted;
  if (left > 0) {
    lines.push(`Old runs left over (max-deletions or a stop): ${String(left)}.`, "");
  }
  return lines.join("\n");
}
