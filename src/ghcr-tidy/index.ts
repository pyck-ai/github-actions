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
