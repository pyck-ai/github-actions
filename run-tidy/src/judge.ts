import type { RunInfo } from "./github.js";

/** Why a run is not a deletion candidate; `old` runs that survive every rule are candidates. */
export type Verdict =
  | { kind: "not-finished" }
  | { kind: "unreadable" }
  | { kind: "young" }
  | { kind: "kept-by-minimum" }
  | { kind: "candidate" };

/** Newest first: `created_at` descending, the higher run id first on a tie. */
function newestFirst(a: RunInfo, b: RunInfo): number {
  const delta = (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
  return delta !== 0 ? delta : b.id - a.id;
}

/** The grouping key of a run; runs that carry no `workflow_id` share one group. */
export function workflowKey(run: RunInfo): string {
  return run.workflowId === undefined ? "unknown" : String(run.workflowId);
}

/**
 * Judges every run (spec sections 3 and 4). A run is old when its
 * `created_at` is strictly before `cutoff`. Runs that are not completed and
 * runs with no readable `created_at` are never candidates. Per workflow the
 * newest `keepPerWorkflow` completed runs with a readable date are kept
 * whatever their age or conclusion.
 */
export function judgeRuns(
  runs: readonly RunInfo[],
  options: { cutoff: Date; keepPerWorkflow: number },
): Map<number, Verdict> {
  const verdicts = new Map<number, Verdict>();
  const finished = new Map<string, RunInfo[]>();
  for (const run of runs) {
    if (run.status !== "completed") {
      verdicts.set(run.id, { kind: "not-finished" });
    } else if (run.createdAt === undefined) {
      verdicts.set(run.id, { kind: "unreadable" });
    } else {
      const key = workflowKey(run);
      finished.set(key, [...(finished.get(key) ?? []), run]);
    }
  }
  for (const group of finished.values()) {
    group.sort(newestFirst);
    for (const [rank, run] of group.entries()) {
      const createdAt = run.createdAt as Date;
      if (createdAt.getTime() >= options.cutoff.getTime()) {
        verdicts.set(run.id, { kind: "young" });
      } else if (rank < options.keepPerWorkflow) {
        verdicts.set(run.id, { kind: "kept-by-minimum" });
      } else {
        verdicts.set(run.id, { kind: "candidate" });
      }
    }
  }
  return verdicts;
}
