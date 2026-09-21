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

export {
  computeKeepRoots,
  computeRetainedTags,
  computeFloorTags,
  type LiveRoot,
  type RetentionPolicy,
} from "./retain.js";

export {
  parseTag,
  kindKeyOf,
  compareVersionsAscending,
  type ParsedTag,
  type VersionedTag,
  type UnversionedTag,
  type TagLevel,
} from "./tag-kind.js";

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
  computeReachabilityToleratingBrokenRoots,
  type PlanPackageOptions,
  type PlanPolicy,
  type PackagePlanResult,
  type SkippedPlan,
  type NothingToDoPlan,
  type PlannedPlan,
  type ReachabilityWithBrokenRootsResult,
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
  plannedDeletionCount,
  EXIT_APPLY_OK,
  EXIT_APPLY_MUTATION_FAILURE,
  EXIT_APPLY_SAFETY,
  type ApplyOptions,
  type ApplyResult,
  type ApplyAbortReason,
  type VerificationOptions,
  type PackageApplyResult,
  type GroupApplyResult,
  type MemberApplyOutcome,
} from "./apply.js";

export {
  memoryBreaker,
  githubIssueBreaker,
  breakerRegressionSink,
  BREAKER_ISSUE_TITLE,
  BREAKER_ISSUE_LABEL,
  type Breaker,
  type TrippedState,
  type IssuesRequestable,
} from "./breaker.js";

export { formatIncidentReport, type IncidentReportOptions } from "./incident-report.js";

export {
  checkVolumeAlarm,
  DEFAULT_VOLUME_ALARM_MULTIPLE,
  type VolumeAlarmOptions,
  type VolumeAlarmDecision,
} from "./volume-alarm.js";

export {
  snapshotPackage,
  checkCanary,
  compareSnapshots,
  memoryRegressionSink,
  nullExpiryProducer,
  policyDrivenExpiryProducer,
  resolveExpirySet,
  type ResolveState,
  type TagSnapshot,
  type RegressedTag,
  type CanaryFailureReason,
  type CanaryCheckResult,
  type CompareSnapshotsResult,
  type CompareSnapshotsOptions,
  type RegressionIncident,
  type RegressionSink,
  type ExpiryProducer,
  type ExpiryProducerInput,
  type ExpiryProducerResult,
  type ExpiryResolution,
  type ExpiryFailureReason,
} from "./verify.js";

export {
  resolvePolicy,
  validateManifest,
  ManifestError,
  DEFAULT_KEEP_MAJORS,
  DEFAULT_KEEP_MINORS,
  DEFAULT_KEEP_PATCHES,
  DEFAULT_KEEP_DAYS,
  type Manifest,
  type ManifestPackageEntry,
  type ManifestCanary,
  type RetentionConfig,
  type ResolvedPolicy,
} from "./manifest/schema.js";

export { parseManifest } from "./manifest/parse.js";
