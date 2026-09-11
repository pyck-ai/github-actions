import type { PackageName } from "../core/registry/package-name.js";
import type { Digest } from "./domain.js";
import {
  assertGroupsAreWellFormed,
  type Plan,
  type PersistedDeletionGroup,
} from "./persisted-plan.js";
import type { Journal, MutationTarget } from "./journal.js";
import type { Mutator } from "./mutator.js";

export interface ApplyOptions {
  /**
   * Maximum number of version-delete calls this run may ATTEMPT
   * (success or failure both count — see `buildGroupOutcome`'s doc).
   * Checked GROUP-granularly: a group is never started unless the full
   * remaining budget can cover every one of its members, so a run can
   * never stop between a root and its own children for lack of budget.
   */
  readonly budget: number;
  readonly journal?: Journal;
}

export type MemberApplyOutcome =
  | {
      readonly digest: Digest;
      readonly versionId: number;
      readonly result: "deleted" | "already-gone";
    }
  | {
      readonly digest: Digest;
      readonly versionId: number;
      readonly result: "last-version-conflict" | "error";
      readonly detail: string;
    }
  | { readonly digest: Digest; readonly versionId: number; readonly result: "not-attempted" };

export interface GroupApplyResult {
  readonly root: Digest;
  /**
   * `"completed"`: every member was attempted and none failed (a
   * `"deleted"`/`"already-gone"` result on every member).
   * `"abandoned"`: some member failed and the rest of the group (in
   * parents-first order) was never attempted — see this module's doc for
   * why this is the safe outcome, not a bug.
   * `"skipped-budget"`: the group was never started at all because the
   * remaining budget could not cover it in full.
   */
  readonly status: "completed" | "abandoned" | "skipped-budget";
  readonly members: readonly MemberApplyOutcome[];
}

export interface PackageApplyResult {
  readonly packageName: PackageName;
  readonly groups: readonly GroupApplyResult[];
}

export interface ApplyResult {
  readonly packages: readonly PackageApplyResult[];
  /** Total delete-version calls actually made across every package/group, regardless of outcome. */
  readonly attempted: number;
  readonly remainingBudget: number;
}

function isSuccess(
  result: "deleted" | "already-gone" | "last-version-conflict",
): result is "deleted" | "already-gone" {
  return result === "deleted" || result === "already-gone";
}

/**
 * Executes ONE {@link PersistedDeletionGroup} against `mutator`, in
 * parents-first order, stopping at the first member whose delete does
 * not cleanly succeed.
 *
 * This is the structural fix for the defect that hollowed out
 * `flutter-rfw`: the hardened bash ordered tagged roots before their
 * (not directly tag-referenced) children but, on a failed ROOT delete,
 * merely logged and continued straight on to that root's children anyway
 * — leaving a tag resolving to an index whose children were all gone. Here, any
 * non-success on ANY member (root or descendant) immediately abandons
 * every member after it in the group's parents-first order; those
 * members are recorded `"not-attempted"` and no further calls are made
 * for this group. An abandoned group therefore leaves behind, at worst,
 * unreferenced garbage below whatever was deleted before the failure —
 * never a live tag whose children were deleted out from under it, since
 * the root is always `members[0]` and is always attempted first.
 *
 * `"already-gone"` (a 404) is treated exactly like success: the digest is
 * already absent, which is the desired end state, not a failure — this
 * is also what makes applying the same plan twice idempotent.
 */
async function applyGroup(
  pkg: PackageName,
  group: PersistedDeletionGroup,
  mutator: Mutator,
  journal: Journal | undefined,
  remainingBudget: number,
): Promise<{ result: GroupApplyResult; attempted: number }> {
  if (remainingBudget < group.members.length) {
    return {
      result: {
        root: group.root.digest,
        status: "skipped-budget",
        members: group.members.map((m) => ({
          digest: m.digest,
          versionId: m.versionId,
          result: "not-attempted",
        })),
      },
      attempted: 0,
    };
  }

  const members: MemberApplyOutcome[] = [];
  let attempted = 0;
  let abandoned = false;

  for (const member of group.members) {
    if (abandoned) {
      members.push({ digest: member.digest, versionId: member.versionId, result: "not-attempted" });
      continue;
    }

    const target: MutationTarget = {
      packageName: pkg,
      versionId: member.versionId,
      digest: member.digest,
    };
    await journal?.recordIntent(target);
    attempted += 1;

    try {
      const outcome = await mutator.deleteVersion(pkg, member.versionId);
      await journal?.recordOutcome(target, { kind: outcome });
      if (isSuccess(outcome)) {
        members.push({ digest: member.digest, versionId: member.versionId, result: outcome });
      } else {
        // "last-version-conflict": a 400, GHCR's undocumented refusal to
        // delete a package's last remaining version via this endpoint
        // (see core/registry/packages.ts). Surfaced as-is, never retried
        // in a loop (that loop would never terminate) — just abandons
        // the rest of this group like any other non-success.
        members.push({
          digest: member.digest,
          versionId: member.versionId,
          result: "last-version-conflict",
          detail: "GHCR refuses to delete a package's last remaining version via this endpoint",
        });
        abandoned = true;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await journal?.recordOutcome(target, { kind: "failed", error: detail });
      members.push({ digest: member.digest, versionId: member.versionId, result: "error", detail });
      abandoned = true;
    }
  }

  return {
    result: { root: group.root.digest, status: abandoned ? "abandoned" : "completed", members },
    attempted,
  };
}

/**
 * Applies `plan` group by group, package by package, in the plan's own
 * order. Enforces {@link assertGroupsAreWellFormed} BEFORE any mutation —
 * throws (never mutates anything) on a structurally malformed plan, e.g.
 * one hand-edited after `grantApply` validated it.
 *
 * Budget accounting is GROUP-granular (see `ApplyOptions.budget`'s doc):
 * checked before a group starts, decremented by the number of members
 * actually ATTEMPTED once it finishes (which can be less than the
 * group's full size if it was abandoned partway through — the unspent
 * remainder is available to later groups).
 */
export async function applyPlan(
  plan: Plan,
  mutator: Mutator,
  options: ApplyOptions,
): Promise<ApplyResult> {
  assertGroupsAreWellFormed(plan);

  let remainingBudget = options.budget;
  let totalAttempted = 0;
  const packages: PackageApplyResult[] = [];

  for (const pkgPlan of plan.packages) {
    const groups: GroupApplyResult[] = [];
    for (const group of pkgPlan.groups) {
      const { result, attempted } = await applyGroup(
        pkgPlan.packageName,
        group,
        mutator,
        options.journal,
        remainingBudget,
      );
      groups.push(result);
      remainingBudget -= attempted;
      totalAttempted += attempted;
    }
    packages.push({ packageName: pkgPlan.packageName, groups });
  }

  return { packages, attempted: totalAttempted, remainingBudget };
}

/** Total number of groups across every package in the plan — used by {@link classifyApplyExit} to distinguish "nothing to do" from "something was supposed to happen and didn't". */
export function totalGroupCount(plan: Plan): number {
  return plan.packages.reduce((sum, p) => sum + p.groups.length, 0);
}

export const EXIT_APPLY_OK = 0;
export const EXIT_APPLY_MUTATION_FAILURE = 1;
export const EXIT_APPLY_SAFETY = 4;

/**
 * Maps an {@link ApplyResult} to an exit code, extending the planning
 * core / `imgverify`'s scheme with `4 = safety`.
 *
 * The zero-mutation guard: if the plan contained at least one group but
 * NOTHING was attempted (e.g. the whole budget was `0`, or every group
 * was skipped for budget reasons), that is a FAILURE — a
 * non-empty plan silently doing nothing is exactly the kind of runner
 * malfunction `4` exists to flag loudly rather than let masquerade as
 * `0 = ok`. Distinguished from a normal `1 = mutation failure` (some
 * group was abandoned because the registry itself rejected a delete):
 * `4` means "the run itself did not do its job", `1` means "the run did
 * its job and the registry said no to part of it".
 */
export function classifyApplyExit(plan: Plan, result: ApplyResult): number {
  const groupCount = totalGroupCount(plan);
  if (groupCount > 0 && result.attempted === 0) {
    return EXIT_APPLY_SAFETY;
  }
  const hadAbandonedGroup = result.packages.some((p) =>
    p.groups.some((g) => g.status === "abandoned"),
  );
  return hadAbandonedGroup ? EXIT_APPLY_MUTATION_FAILURE : EXIT_APPLY_OK;
}
