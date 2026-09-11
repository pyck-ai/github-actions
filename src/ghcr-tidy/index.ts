export {
  digest,
  tag,
  registryPathFor,
  type Digest,
  type Tag,
  type RegistryPath,
} from "./domain.js";

export { skipReasonFor, type SkipReason } from "./skip-reason.js";

export type { RegistryReader, PackagesClient, PackageVersionRecord, Clock } from "./ports.js";

export { computeKeepRoots, type LiveRoot, type RetentionPolicy } from "./retain.js";

export { buildLiveRoots, type BuildLiveRootsResult } from "./roots.js";

export {
  computeReachability,
  type ReachabilityOptions,
  type ReachabilityResult,
} from "./reachability.js";

export {
  buildDeletionGroups,
  assertNoSurvivingParent,
  type DeletionGroup,
} from "./deletion-group.js";

export {
  planPackage,
  type PlanPackageOptions,
  type PlanPolicy,
  type PackagePlanResult,
  type SkippedPlan,
  type NothingToDoPlan,
  type PlannedPlan,
} from "./plan.js";

export { createRegistryReader, createPackagesClient } from "./adapters.js";

export {
  PLAN_SCHEMA_VERSION,
  toPersistedPackagePlan,
  serializePlan,
  parsePlan,
  assertGroupsAreWellFormed,
  type Plan,
  type PersistedPackagePlan,
  type PersistedDeletionGroup,
  type PersistedGroupMember,
} from "./persisted-plan.js";

export {
  grantApply,
  nodePlanFileSystem,
  type ApplyCapability,
  type PlanFileSystem,
} from "./apply-capability.js";

export {
  dryRunMutator,
  applyMutator,
  type Mutator,
  type VersionId,
  type DeleteVersionResult,
  type DeletePackageResult,
  type DryRunMutator,
  type RecordedCall,
} from "./mutator.js";

export {
  ndjsonJournal,
  memoryJournal,
  type Journal,
  type MutationTarget,
  type MutationOutcome,
  type JournalEntry,
} from "./journal.js";

export {
  applyPlan,
  classifyApplyExit,
  totalGroupCount,
  EXIT_APPLY_OK,
  EXIT_APPLY_MUTATION_FAILURE,
  EXIT_APPLY_SAFETY,
  type ApplyOptions,
  type ApplyResult,
  type PackageApplyResult,
  type GroupApplyResult,
  type MemberApplyOutcome,
} from "./apply.js";
