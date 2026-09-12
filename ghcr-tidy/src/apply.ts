import type { PackageName } from "../../registry/package-name.js";
import { registryPathFor, type Digest, type RegistryPath, type Tag } from "./domain.js";
import {
  assertGroupsAreWellFormed,
  type Plan,
  type PersistedDeletionGroup,
  type PersistedGroupMember,
} from "./persisted-plan.js";
import type { Breaker, TrippedState } from "./breaker.js";
import type { Journal, MutationTarget } from "./journal.js";
import type { Mutator } from "./mutator.js";
import type { RegistryReader } from "./ports.js";
import {
  checkVolumeAlarm,
  type VolumeAlarmDecision,
  type VolumeAlarmOptions,
} from "./volume-alarm.js";
import {
  checkCanary,
  compareSnapshots,
  snapshotPackage,
  type RegressedTag,
  type RegressionSink,
  type TagSnapshot,
} from "./verify.js";

/**
 * Wires post-apply verification (`verify.ts`) into `applyPlan`. Entirely
 * OPTIONAL: omitting it reproduces the pre-verification behaviour exactly
 * (nothing snapshots the registry, nothing can abort for a regression) —
 * every existing caller and test that does not pass it is unaffected.
 * When present, `applyPlan` runs the pre-flight canary once before the
 * very first deletion, and snapshots + verifies each package
 * immediately after that package's own deletions, aborting the whole run
 * before the next package is touched — see this module's `applyPlan` doc.
 */
export interface VerificationOptions {
  readonly registry: RegistryReader;
  /** One known-good, already-published tag resolved end to end before any deletion, to distinguish "the read path is broken today" from "this run broke something". Need not belong to any package in the plan. */
  readonly canary: { readonly path: RegistryPath; readonly tag: Tag };
  readonly sink: RegressionSink;
}

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
  readonly verification?: VerificationOptions;
  /**
   * The circuit breaker (`breaker.ts`). Checked BEFORE any mutation and
   * before the pre-flight canary — a tripped breaker refuses to perform
   * ANY mutation, unconditionally, regardless of `verification` being
   * set. Omitting this reproduces pre-breaker behaviour exactly (nothing
   * can ever refuse to run for this reason), same as `verification`
   * being optional.
   */
  readonly breaker?: Breaker;
  /**
   * The volume alarm (`volume-alarm.ts`). Checked once, after the
   * breaker and before the canary, against the plan's total planned
   * deletion count — see {@link plannedDeletionCount}. Omitting this
   * disables the check entirely, same as omitting `options.baseline`
   * within it.
   */
  readonly volumeAlarm?: VolumeAlarmOptions;
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

/**
 * Why `applyPlan` stopped before processing the entire plan.
 * `"breaker-tripped"` and `"volume-alarm"` mean nothing was attempted at
 * all — checked before anything else, including the canary.
 * `"canary-failed"` (when verification is enabled) also means nothing
 * was deleted at all. `"regression"` means every package up to and
 * including `packageName` was fully processed (its deletions already
 * happened) and `packageName`'s own deletions are exactly
 * `regression.tags[*]`'s `precedingDeletions` — every package AFTER it
 * in plan order was never touched.
 */
export type ApplyAbortReason =
  | { readonly kind: "breaker-tripped"; readonly state: TrippedState }
  | { readonly kind: "volume-alarm"; readonly decision: VolumeAlarmDecision }
  | { readonly kind: "canary-failed" }
  | {
      readonly kind: "regression";
      readonly packageName: PackageName;
      readonly tags: readonly RegressedTag[];
    };

/** Total number of individual version deletions this plan would attempt across every package and group, budget permitting — what the volume alarm (`volume-alarm.ts`) compares against its baseline. */
export function plannedDeletionCount(plan: Plan): number {
  return plan.packages.reduce(
    (sum, p) => sum + p.groups.reduce((s, g) => s + g.members.length, 0),
    0,
  );
}

export interface ApplyResult {
  readonly packages: readonly PackageApplyResult[];
  /** Total delete-version calls actually made across every package/group, regardless of outcome. */
  readonly attempted: number;
  readonly remainingBudget: number;
  /** Set only when verification aborted the run early — see {@link ApplyAbortReason}. */
  readonly abortedFor?: ApplyAbortReason;
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
        // (see registry/packages.ts). Surfaced as-is, never retried
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

/** Every member across `groups` that was actually deleted (success, including a 404-as-already-gone) — what {@link RegressionIncident.precedingDeletions} reports for a package. */
function deletedMembers(groups: readonly GroupApplyResult[]): PersistedGroupMember[] {
  const out: PersistedGroupMember[] = [];
  for (const g of groups) {
    for (const m of g.members) {
      if (m.result === "deleted" || m.result === "already-gone") {
        out.push({ digest: m.digest, versionId: m.versionId });
      }
    }
  }
  return out;
}

/** Snapshots `path`, translating a thrown/rejected read (e.g. `listTags` itself failing) into the strict-posture `preSnapshotFailed` signal `compareSnapshots` needs, rather than letting it propagate and abort the run for a reason indistinguishable from a real regression. */
async function trySnapshot(
  path: RegistryPath,
  registry: RegistryReader,
): Promise<{ snapshot: ReadonlyMap<Tag, TagSnapshot>; failed: boolean }> {
  try {
    return { snapshot: await snapshotPackage(path, registry), failed: false };
  } catch {
    return { snapshot: new Map(), failed: true };
  }
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
 *
 * When `options.verification` is set: the pre-flight canary is resolved
 * once, before this function's very first deletion, and a canary failure
 * aborts before touching anything. Each package is then snapshotted from
 * the registry's own tag list immediately BEFORE its deletions begin and
 * again immediately AFTER they finish (interleaved, never batched to the
 * end of the run — see this module's and `verify.ts`'s docs for why: a
 * regression from an early package must not be masked by continuing to
 * apply a plan whose underlying model has just been shown to be wrong).
 * A regression aborts the WHOLE run before the next package is started;
 * every package already processed keeps its result, every package after
 * it is never touched.
 */
export async function applyPlan(
  plan: Plan,
  mutator: Mutator,
  options: ApplyOptions,
): Promise<ApplyResult> {
  assertGroupsAreWellFormed(plan);

  if (options.breaker) {
    const tripped = await options.breaker.isTripped();
    if (tripped) {
      return {
        packages: [],
        attempted: 0,
        remainingBudget: options.budget,
        abortedFor: { kind: "breaker-tripped", state: tripped },
      };
    }
  }

  if (options.volumeAlarm) {
    const decision = checkVolumeAlarm(plannedDeletionCount(plan), options.volumeAlarm);
    if (!decision.allowed) {
      return {
        packages: [],
        attempted: 0,
        remainingBudget: options.budget,
        abortedFor: { kind: "volume-alarm", decision },
      };
    }
  }

  const verification = options.verification;
  if (verification) {
    const canaryOk = await checkCanary(
      verification.canary.path,
      verification.canary.tag,
      verification.registry,
    );
    if (!canaryOk) {
      return {
        packages: [],
        attempted: 0,
        remainingBudget: options.budget,
        abortedFor: { kind: "canary-failed" },
      };
    }
  }

  let remainingBudget = options.budget;
  let totalAttempted = 0;
  const packages: PackageApplyResult[] = [];

  for (const pkgPlan of plan.packages) {
    let preSnapshot: ReadonlyMap<Tag, TagSnapshot> | undefined;
    let preSnapshotFailed = false;
    let registryPath: RegistryPath | undefined;
    if (verification) {
      registryPath = registryPathFor(plan.org, pkgPlan.packageName);
      const pre = await trySnapshot(registryPath, verification.registry);
      preSnapshot = pre.snapshot;
      preSnapshotFailed = pre.failed;
    }

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

    if (verification && registryPath) {
      // A post-snapshot read failure gets exactly the same "unknown"
      // treatment as any other unresolved tag (see `verify.ts`'s
      // `ResolveState` doc) rather than throwing: an infrastructure
      // hiccup reading the registry back is not evidence of a
      // regression, but it also cannot be silently waved through, so it
      // still runs through the same strict `compareSnapshots` predicate.
      const post = await trySnapshot(registryPath, verification.registry);
      const { regressions } = compareSnapshots(preSnapshot ?? new Map(), post.snapshot, {
        preSnapshotFailed,
      });
      if (regressions.length > 0) {
        await verification.sink.record({
          packageName: pkgPlan.packageName,
          tags: regressions,
          precedingDeletions: deletedMembers(groups),
        });
        return {
          packages,
          attempted: totalAttempted,
          remainingBudget,
          abortedFor: {
            kind: "regression",
            packageName: pkgPlan.packageName,
            tags: regressions,
          },
        };
      }
    }
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
 *
 * `result.abortedFor` (a canary failure, or a post-apply regression) is
 * ALSO `4`, checked first: a regression can leave `result.attempted > 0`
 * (the aborting package's own deletions already happened), which would
 * otherwise fall through to the `1`/`0` logic below and understate what
 * went wrong — verification catching a wrong model is exactly the same
 * severity as the zero-mutation guard below it, not merely "some deletes
 * failed".
 */
export function classifyApplyExit(plan: Plan, result: ApplyResult): number {
  if (result.abortedFor) {
    return EXIT_APPLY_SAFETY;
  }
  const groupCount = totalGroupCount(plan);
  if (groupCount > 0 && result.attempted === 0) {
    return EXIT_APPLY_SAFETY;
  }
  const hadAbandonedGroup = result.packages.some((p) =>
    p.groups.some((g) => g.status === "abandoned"),
  );
  return hadAbandonedGroup ? EXIT_APPLY_MUTATION_FAILURE : EXIT_APPLY_OK;
}
