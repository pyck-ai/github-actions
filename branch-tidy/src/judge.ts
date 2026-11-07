import type { BranchInfo, OpenPullRequest, RepoInfo } from "./github.js";

/** Why a stale branch is kept; the first reason that applies is the one reported. */
export type KeepReason =
  | "keep-branches"
  | "default-branch"
  | "protected"
  | "protection-unknown"
  | "open-pr-head"
  | "open-pr-base";

export type Verdict =
  | { kind: "fresh" }
  | { kind: "unreadable"; why: string }
  | { kind: "kept"; reason: KeepReason }
  | { kind: "delete" };

export interface JudgeContext {
  cutoff: Date;
  keepBranches: ReadonlySet<string>;
  repo: RepoInfo;
  /** Open pull requests, or `undefined` when `exclude-open-pr-branches` is false. */
  openPullRequests: readonly OpenPullRequest[] | undefined;
}

/**
 * Decides what to do with every branch. Pure: no I/O, so the whole decision
 * can be tested without a fake API. A head commit exactly at the cutoff is
 * fresh; a branch whose head date cannot be read is never stale.
 */
export function judgeBranches(
  branches: readonly BranchInfo[],
  context: JudgeContext,
): Map<string, Verdict> {
  const prHeads = new Set<string>();
  const prBases = new Set<string>();
  for (const pr of context.openPullRequests ?? []) {
    if (pr.headRepoId === context.repo.id) prHeads.add(pr.headRef);
    prBases.add(pr.baseRef);
  }

  const verdicts = new Map<string, Verdict>();
  for (const branch of branches) {
    verdicts.set(branch.name, judge(branch, context, prHeads, prBases));
  }
  return verdicts;
}

function judge(
  branch: BranchInfo,
  context: JudgeContext,
  prHeads: ReadonlySet<string>,
  prBases: ReadonlySet<string>,
): Verdict {
  if (branch.notACommit) return { kind: "unreadable", why: "it does not point at a commit" };
  if (branch.committedDate === undefined) {
    return { kind: "unreadable", why: "its head commit date could not be read" };
  }
  if (branch.committedDate.getTime() >= context.cutoff.getTime()) return { kind: "fresh" };

  if (context.keepBranches.has(branch.name)) return { kind: "kept", reason: "keep-branches" };
  if (branch.name === context.repo.defaultBranch) {
    return { kind: "kept", reason: "default-branch" };
  }
  if (branch.protected === undefined) return { kind: "kept", reason: "protection-unknown" };
  if (branch.protected) return { kind: "kept", reason: "protected" };
  if (prHeads.has(branch.name)) return { kind: "kept", reason: "open-pr-head" };
  if (prBases.has(branch.name)) return { kind: "kept", reason: "open-pr-base" };
  return { kind: "delete" };
}
