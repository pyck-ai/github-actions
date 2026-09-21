#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { packageName, type PackageName } from "../../registry/package-name.js";
import {
  createOctokit,
  createInMemoryTokenCache,
  getRegistryToken,
  type RegistryOctokit,
} from "../../registry/index.js";
import { createPackagesClient, createRegistryReader } from "./adapters.js";
import { createLimiter } from "./limiter.js";
import { createCachingRegistryReader } from "./resolve-cache.js";
import { applyMutator, type Mutator } from "./mutator.js";
import { grantApply, nodePlanFileSystem, type PlanFileSystem } from "./apply-capability.js";
import { githubIssueBreaker, breakerRegressionSink, type Breaker } from "./breaker.js";
import { formatIncidentReport } from "./incident-report.js";
import { ndjsonJournal, type Clock, type Journal } from "./journal.js";
import { registryPathFor, tag, type RegistryPath, type Tag } from "./domain.js";
import { parseManifest } from "./manifest/parse.js";
import {
  resolvePolicy,
  ManifestError,
  type Manifest,
  type ManifestPackageEntry,
} from "./manifest/schema.js";
import { planPackage, type PackagePlanResult, type PlannedPlan } from "./plan.js";
import { toPersistedPackagePlan, serializePlan, type Plan } from "./persisted-plan.js";
import {
  applyPlan,
  classifyApplyExit,
  totalGroupCount,
  plannedDeletionCount,
  EXIT_APPLY_OK,
  EXIT_APPLY_MUTATION_FAILURE,
  EXIT_APPLY_SAFETY,
  type ApplyAbortReason,
  type ApplyResult,
  type VerificationOptions,
} from "./apply.js";
import type { CanaryFailureReason } from "./verify.js";
import type { PackagesClient, RegistryReader } from "./ports.js";

/**
 * `ghcr-tidy` — the CLI entrypoint wiring the pure planning core
 * (`plan.ts`), the apply path (`apply-capability.ts`, `apply.ts`,
 * `mutator.ts`), and safety machinery (`breaker.ts`, `volume-alarm.ts`,
 * `verify.ts`) into three subcommands driven by one config manifest,
 * `.ghcr-tidy.yaml`: closed-schema config, explicit argv parsing, a
 * small, total exit-code mapping, and the `INPUT_ARGS`-vs-argv duality
 * that lets this same bundle serve as both a plain CLI and (later) a JS
 * action.
 *
 * ## Exit codes
 *
 * A single, TOTAL mapping, reused unchanged by every subcommand:
 *
 * - `0` — ok. Nothing wrong; for `apply`, every attempted deletion
 *   succeeded (or there was nothing to do).
 * - `1` — FINDINGS: `plan` skipped at least one package fail-closed
 *   (`SkippedPlan`), or `apply` had at least one abandoned deletion group
 *   (the registry itself rejected part of a delete — see
 *   `apply.ts`'s `EXIT_APPLY_MUTATION_FAILURE`). The run itself worked;
 *   something it found or did was not clean.
 * - `2` — CONFIG: an invalid manifest, a CLI usage error, `--package`
 *   matching no configured package, or a required credential/flag missing
 *   (no `GITHUB_TOKEN`, `apply` requested with no `--apply` flag, no
 *   breaker configured for `apply`, no canary configured for an `apply`
 *   that has work to do).
 * - `3` — INFRASTRUCTURE: an unexpected error escaped the planning core
 *   or the apply path (a network failure, an auth failure, anything not
 *   already classified as a finding or a safety trip).
 * - `4` — SAFETY: the breaker was already tripped, the volume alarm
 *   refused the plan, the pre-flight canary failed, post-apply
 *   verification found a regression, or `apply.ts`'s own plan-integrity
 *   assertion threw — see `apply.ts`'s `EXIT_APPLY_SAFETY` for the
 *   zero-mutation guard this also covers.
 */

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_CONFIG = 2;
const EXIT_INFRA = 3;
const EXIT_SAFETY = 4;

const DEFAULT_MANIFEST_PATH = ".ghcr-tidy.yaml";
/**
 * `--jobs`' default: ONE shared bound on real registry HTTP concurrency
 * for the whole run (see `limiter.ts`'s doc on why one shared limiter, not
 * one pool per dimension multiplied against another). It governs both how
 * many packages `runPlanning` processes at once (`runPool` below) AND,
 * via the same-sized limiter wrapped around the registry reader in
 * {@link buildRegistryAdapters}, how many per-tag/per-BFS-node requests
 * the planning core (`roots.ts`, `reachability.ts`) may have in flight at
 * once — across every package, not per package, so this stays the actual
 * ceiling on concurrent requests hitting `ghcr.io` regardless of how many
 * packages or BFS levels are logically "active" at once.
 *
 * 4: GHCR applies SECONDARY rate limits to bursts (see this project's
 * incident notes on `flutter-rfw`/`baseimages`), so
 * the fan-out this change adds within a single package (previously fully
 * serial: one HEAD per tag, one fetch per BFS node) must stay bounded
 * rather than firing every tag/every frontier node for every package at
 * once. `--jobs 1` recovers the fully serial behaviour this replaces.
 */
const DEFAULT_JOBS = 4;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Subcommand = "validate" | "plan" | "apply";

/** A CLI usage problem (bad flag, missing value, unrecognised subcommand) — always a CONFIG error. */
class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

interface ParsedArgs {
  manifest?: string;
  out?: string;
  journal?: string;
  budget?: number;
  jobs?: number;
  packages: string[];
  baseline?: number;
  canaryPackage?: string;
  canaryTag?: string;
  registryOwner?: string;
  breakerRepo?: string;
  /**
   * A token authenticated for issue read/write in the breaker's repo,
   * SEPARATE from `GITHUB_TOKEN` (used for the registry/Packages API and,
   * for `apply`, deleting versions). Falls back to `GHCR_TIDY_BREAKER_TOKEN`
   * (see `runApplyCommand`), then to `GITHUB_TOKEN` itself for setups
   * where one token legitimately carries both scopes. See
   * `breaker.ts`'s `githubIssueBreaker` doc for why this must not simply
   * reuse a `delete:packages`-scoped PAT — that combination is exactly
   * what produced a 404 on a real apply run.
   */
  breakerToken?: string;
  apply: boolean;
  /**
   * Opt-in remediation, OFF by default: tolerates a keep-root whose
   * subtree contains a PROVEN not-found descendant (see
   * `plan.ts`'s `computeReachabilityToleratingBrokenRoots`) instead of
   * failing that package closed, and lets the proven-broken root itself
   * fall into the ordinary DELETE set. This flag ALONE never deletes
   * anything — `plan` never deletes, and `apply` still separately
   * requires `--apply` (see `runApplyCommand`'s check above) — two
   * independent gestures are required for an actual deletion, exactly as
   * for `--apply` itself.
   */
  deleteBrokenRoots: boolean;
}

/**
 * Parses argv (without `node`/script path). The first token is a
 * subcommand (`validate`/`plan`/`apply`) ONLY if it exactly matches one of
 * those three names; otherwise the whole of argv is treated as `plan`'s
 * flags — `plan` is the default subcommand since it is the read-only,
 * safe-to-run-with-no-ceremony operation.
 */
export function parseArgv(argv: readonly string[]): { subcommand: Subcommand; args: ParsedArgs } {
  let subcommand: Subcommand = "plan";
  let rest = argv;
  const first = argv[0];
  if (first === "validate" || first === "plan" || first === "apply") {
    subcommand = first;
    rest = argv.slice(1);
  }

  const args: ParsedArgs = { packages: [], apply: false, deleteBrokenRoots: false };
  let i = 0;
  while (i < rest.length) {
    const flag = rest[i];
    if (flag === undefined) {
      break;
    }
    i += 1;
    const nextValue = (): string => {
      const value = rest[i];
      if (value === undefined) {
        throw new UsageError(`missing value for ${flag}`);
      }
      i += 1;
      return value;
    };
    const nextPositiveInt = (name: string): number => {
      const raw = nextValue();
      if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
        throw new UsageError(`${name} must be a positive integer, got "${raw}"`);
      }
      return Number(raw);
    };
    const nextNonNegativeInt = (name: string): number => {
      const raw = nextValue();
      if (!/^\d+$/.test(raw)) {
        throw new UsageError(`${name} must be a non-negative integer, got "${raw}"`);
      }
      return Number(raw);
    };

    switch (flag) {
      case "--manifest":
        args.manifest = nextValue();
        break;
      case "--out":
        args.out = nextValue();
        break;
      case "--journal":
        args.journal = nextValue();
        break;
      case "--budget":
        args.budget = nextPositiveInt("--budget");
        break;
      case "--jobs":
        args.jobs = nextPositiveInt("--jobs");
        break;
      case "--package":
        args.packages.push(nextValue());
        break;
      case "--baseline":
        args.baseline = nextNonNegativeInt("--baseline");
        break;
      case "--canary-package":
        args.canaryPackage = nextValue();
        break;
      case "--canary-tag":
        args.canaryTag = nextValue();
        break;
      case "--registry-owner":
        args.registryOwner = nextValue();
        break;
      case "--breaker-repo":
        args.breakerRepo = nextValue();
        break;
      case "--breaker-token":
        args.breakerToken = nextValue();
        break;
      case "--apply":
        args.apply = true;
        break;
      case "--delete-broken-roots":
        args.deleteBrokenRoots = true;
        break;
      default:
        throw new UsageError(`unknown flag: ${flag}`);
    }
  }

  return { subcommand, args };
}

async function loadManifestFile(manifestFlag: string | undefined): Promise<Manifest> {
  const manifestPath = path.resolve(manifestFlag ?? DEFAULT_MANIFEST_PATH);
  let content: string;
  try {
    content = await readFile(manifestPath, "utf8");
  } catch (error) {
    throw new ManifestError(`could not read manifest: ${errorMessage(error)}`, manifestPath);
  }
  return parseManifest(content, manifestPath);
}

/** Applies `--package` filtering: an exact match against each configured entry's `match`. Empty `filters` means "every configured package". Throws a {@link UsageError} (CONFIG) if a filter matches nothing. */
function selectPackages(
  manifest: Manifest,
  filters: readonly string[],
): readonly ManifestPackageEntry[] {
  if (filters.length === 0) {
    return manifest.packages;
  }
  const byName = new Map(manifest.packages.map((p) => [p.match as string, p]));
  const selected: ManifestPackageEntry[] = [];
  for (const f of filters) {
    const entry = byName.get(f);
    if (!entry) {
      throw new UsageError(
        `--package "${f}" does not match any configured package (configured: ${manifest.packages
          .map((p) => p.match)
          .join(", ")})`,
      );
    }
    selected.push(entry);
  }
  return selected;
}

/**
 * Runs `worker` over `items` with at most `limit` concurrently in flight,
 * writing each result to its original index — a small bounded pool. Not a
 * plain `Promise.all`: that would fire every item at once with no cap on
 * concurrent registry requests.
 */
async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    for (;;) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= items.length) {
        return;
      }
      const item = items[i];
      if (item === undefined) {
        continue;
      }
      results[i] = await worker(item, i);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runNext()));
  return results;
}

interface PackagePlanOutcome {
  readonly entry: ManifestPackageEntry;
  readonly result: PackagePlanResult;
}

/** Injectable production dependencies for `plan`/`apply` — real network access by default, faked entirely in tests. */
export interface CliDeps {
  registry?: RegistryReader;
  packages?: PackagesClient;
  mutator?: Mutator;
  breaker?: Breaker;
  clock?: Clock;
  planFs?: PlanFileSystem;
  journal?: Journal;
  /** Per-package progress line sink for `runPlanning` — see that function's doc. Defaults to `process.stderr.write`; tests inject a collector instead of asserting against real stderr. */
  progress?: (line: string) => void;
}

const systemClock: Clock = { now: () => new Date() };

function requireToken(env: NodeJS.ProcessEnv): string {
  const token = env.GITHUB_TOKEN;
  if (!token) {
    throw new UsageError(
      "GITHUB_TOKEN is not set — required to read the GHCR registry and Packages API " +
        "(and, for `apply`, to delete versions and manage the breaker issue)",
    );
  }
  return token;
}

/**
 * Builds the real, network-backed `RegistryReader`/`PackagesClient` pair
 * for `plan`/`apply`, resolving GHCR bearer tokens per configured package
 * via a shared token cache (one exchange per package, not per manifest
 * resolution).
 *
 * The raw registry reader is wrapped in exactly two decorators, in this
 * order:
 *
 * 1. {@link createCachingRegistryReader} (outermost — checked first): a
 *    digest already resolved anywhere in this run, for this package, is
 *    served from memory with no HTTP call and no limiter slot consumed.
 * 2. {@link createLimiter}, sized {@link DEFAULT_JOBS}/`--jobs`: every
 *    cache MISS queues behind this ONE shared gate, so the planning
 *    core's newly-concurrent per-tag and per-BFS-node fan-out
 *    (`roots.ts`, `reachability.ts`) — now fired freely with no limit of
 *    its own — still hits `ghcr.io` with no more than `jobs` requests in
 *    flight at any moment, for the whole run, not per package.
 *
 * This is the ONLY place either decorator is applied: `planPackage` and
 * everything it calls stay unaware that concurrency is bounded at all.
 *
 * The two decorators are not handed to every caller as one bundle,
 * though: this function returns both `planningRegistry` (cached, for
 * `runPlanning`) and `verificationRegistry` (rate-limited only, for
 * `VerificationOptions.registry`), and the two are never the same
 * object. A verifier that reads its own plan-time cache back to itself
 * cannot detect what changed: `resolve-cache.ts` never invalidates or
 * evicts, so every post-apply resolve of a digest already seen during
 * planning would be served the PRE-DELETION answer, and the pre/post
 * snapshots around a deletion (`apply.ts`) would come out byte-identical
 * for anything the plan had already touched: exactly the class of bug
 * that let a multi-arch orphan go undetected in production. Verification
 * must observe the registry as it actually is at verification time, so
 * it gets the rate-limited reader with no cache in front of it.
 *
 * `canaryPackage`, when given, is registered in the same `pathFor` token
 * map as every selected package — the apply canary is a property of the
 * WHOLE RUN, not of whichever packages `--package` happened to select,
 * so it must resolve a bearer token regardless of scoping. Without this,
 * `--package <x>` where the canary lives in some other package leaves
 * the canary's registry path unmapped: the token lookup inside
 * `rawRegistry` throws immediately, and `applyPlan`'s pre-flight canary
 * check reports a bare "canary-failed" for a run that never actually
 * touched the registry for it. This was the first real `apply` run's
 * abort.
 */

/**
 * Builds the `RegistryPath -> PackageName` map {@link buildRegistryAdapters}
 * uses to resolve a GHCR bearer token per package. Extracted as its own
 * pure, exported function (no network, no token exchange) specifically so
 * the `--package`-scoping defect this fixes — the canary's package
 * silently absent from the map whenever `--package` excludes it — is
 * unit-testable without touching the registry at all: the bug and its fix
 * are both fully expressed in which keys end up in this map, before any
 * HTTP request is ever made.
 *
 * `entries` are the packages selected for this run (post `--package`
 * filtering); `canaryPackage`, always registered when given regardless of
 * that filtering, is the run-level apply canary (see
 * {@link buildRegistryAdapters}'s doc for why it cannot be scoped away).
 */
export function buildPackageTokenMap(
  registryOwner: string,
  entries: readonly ManifestPackageEntry[],
  canaryPackage?: PackageName,
): ReadonlyMap<RegistryPath, PackageName> {
  const pathToName = new Map<RegistryPath, PackageName>();
  const add = (p: PackageName): void => {
    pathToName.set(registryPathFor(registryOwner, p), p);
  };
  for (const entry of entries) {
    add(entry.match);
  }
  if (canaryPackage) {
    add(canaryPackage);
  }
  return pathToName;
}

/**
 * Applies the two decorators `buildRegistryAdapters` puts around the raw,
 * network-backed registry reader, returning `planningRegistry` (cached +
 * rate-limited) and `verificationRegistry` (rate-limited only) as two
 * DISTINCT objects over the same underlying `raw` reader (see
 * `buildRegistryAdapters`'s doc for why verification must never be handed
 * the cached one). Extracted as its own pure function (no token exchange,
 * no octokit) specifically so this wiring is unit-testable directly
 * against a fake `RegistryReader`, exercising the actual
 * `createCachingRegistryReader`/`createLimiter` decorators rather than a
 * bare double that bypasses them entirely: mirroring
 * {@link buildPackageTokenMap}'s reason for being its own function.
 */
export function decorateRegistry(
  raw: RegistryReader,
  jobs: number,
): { planningRegistry: RegistryReader; verificationRegistry: RegistryReader } {
  const limit = createLimiter(jobs);
  const verificationRegistry: RegistryReader = {
    listTags: (p) => limit(() => raw.listTags(p)),
    resolve: (p, ref) => limit(() => raw.resolve(p, ref)),
  };
  const planningRegistry = createCachingRegistryReader(verificationRegistry);
  return { planningRegistry, verificationRegistry };
}

/**
 * Which token `githubIssueBreaker` should authenticate with — deliberately
 * SEPARATE from the registry/Packages-API token, which for `apply` is
 * typically a `delete:packages`-scoped PAT with no issues access (see
 * `breaker.ts`'s `githubIssueBreaker` doc for what happens when the two
 * are conflated: a bare 404 with no indication the token was the
 * problem). Precedence, highest first: `--breaker-token`, then
 * `GHCR_TIDY_BREAKER_TOKEN`, then `fallback` (the registry token itself)
 * — the last resort exists only for setups where one token legitimately
 * carries both scopes (e.g. local/dry-run use with a broadly-scoped PAT).
 * Pure and side-effect-free specifically so this precedence is
 * unit-testable without constructing an Octokit client or making any
 * network call — mirroring {@link buildPackageTokenMap}'s reason for
 * being its own function.
 */
export function resolveBreakerToken(
  args: Pick<ParsedArgs, "breakerToken">,
  env: NodeJS.ProcessEnv,
  fallback: string,
): string {
  return args.breakerToken ?? env.GHCR_TIDY_BREAKER_TOKEN ?? fallback;
}

function buildRegistryAdapters(
  token: string,
  owner: string,
  registryOwner: string,
  entries: readonly ManifestPackageEntry[],
  octokit: RegistryOctokit,
  jobs: number,
  canaryPackage?: PackageName,
): {
  /** Cached + rate-limited. For `runPlanning` ONLY: never pass this to `VerificationOptions.registry`. */
  planningRegistry: RegistryReader;
  /** Rate-limited, NOT cached. For `VerificationOptions.registry` (canary + both snapshots); see this function's doc for why verification must not share planning's cache. */
  verificationRegistry: RegistryReader;
  packages: PackagesClient;
  pathFor: (p: PackageName) => RegistryPath;
} {
  const pathToName = new Map(buildPackageTokenMap(registryOwner, entries, canaryPackage));
  const pathFor = (p: PackageName): RegistryPath => {
    const rp = registryPathFor(registryOwner, p);
    pathToName.set(rp, p);
    return rp;
  };

  const tokenCache = createInMemoryTokenCache();
  const rawRegistry = createRegistryReader(async (rp) => {
    const name = pathToName.get(rp);
    if (!name) {
      throw new Error(`no configured package maps to registry path ${rp}`);
    }
    return getRegistryToken(token, name, { cache: tokenCache });
  });
  const { planningRegistry, verificationRegistry } = decorateRegistry(rawRegistry, jobs);
  const packages = createPackagesClient(octokit);
  return { planningRegistry, verificationRegistry, packages, pathFor };
}

interface PlanRunResult {
  outcomes: readonly PackagePlanOutcome[];
  plan: Plan;
}

/** One line per {@link PackagePlanResult}, terse enough for {@link runPlanning}'s per-package progress lines — NOT the multi-line detail `formatPlanSummary` prints at the end of a run. */
function progressOutcomeSummary(result: PackagePlanResult): string {
  switch (result.status) {
    case "nothing-to-do":
      return "nothing to do";
    case "skipped":
      return `SKIPPED (${result.reason})`;
    case "planned":
      return (
        `${String(result.deleteCount)} to delete in ${String(result.groups.length)} group(s)` +
        (result.brokenRootDigests.length > 0
          ? `, including ${String(result.brokenRootDigests.length)} broken root(s) (proven not-found)`
          : "")
      );
  }
}

/**
 * Plans every selected package, then assembles a persisted {@link Plan}
 * (`apply`-ready) from whichever of them came back `"planned"`.
 * Concurrency bounded by `--jobs` (default {@link DEFAULT_JOBS}).
 *
 * Emits one terse progress line via `progress` when each package STARTS
 * and another when it FINISHES (with its result and elapsed time) — a
 * multi-package run against a real registry is dominated by HTTP round
 * trips per package and can legitimately take minutes; with no output at
 * all in between, that is indistinguishable from a hang. `progress`
 * defaults to `process.stderr.write` (not stdout: stdout is reserved for
 * `formatPlanSummary`'s final report and, when `--out` is not used, is
 * the only machine-parseable-adjacent output this CLI produces — progress
 * lines must never get mixed into it) and is injectable purely so tests
 * do not have to assert against real stderr.
 */
async function runPlanning(
  manifest: Manifest,
  entries: readonly ManifestPackageEntry[],
  registry: RegistryReader,
  packagesClient: PackagesClient,
  clock: Clock,
  jobs: number,
  deleteBrokenRoots: boolean,
  progress: (line: string) => void = (line) => {
    process.stderr.write(line);
  },
): Promise<PlanRunResult> {
  const total = entries.length;
  const outcomes = await runPool(
    entries,
    jobs,
    async (entry, index): Promise<PackagePlanOutcome> => {
      const n = index + 1;
      progress(`[ghcr-tidy] (${String(n)}/${String(total)}) planning ${entry.match}...\n`);
      const startedAt = Date.now();

      const policy = resolvePolicy(entry, manifest);
      const result = await planPackage({
        org: manifest.owner,
        registryOwner: manifest.owner,
        packageName: entry.match,
        registry,
        packages: packagesClient,
        clock,
        policy: {
          retention: {
            protectedTagPatterns: policy.protectedTagPatterns,
            keepLast: policy.keepLast,
            keepDays: policy.keepDays,
          },
          graceDays: policy.graceDays,
        },
        deleteBrokenRoots,
      });

      const elapsedMs = Date.now() - startedAt;
      progress(
        `[ghcr-tidy] (${String(n)}/${String(total)}) ${entry.match}: ${progressOutcomeSummary(result)} (${String(elapsedMs)}ms)\n`,
      );
      return { entry, result };
    },
  );

  const packages = outcomes
    .filter((o): o is PackagePlanOutcome & { result: PlannedPlan } => o.result.status === "planned")
    .map((o) => toPersistedPackagePlan(o.entry.match, o.result));

  const plan: Plan = {
    schemaVersion: 1,
    org: manifest.owner,
    generatedAt: clock.now().toISOString(),
    packages,
  };

  return { outcomes, plan };
}

function formatPlanSummary(outcomes: readonly PackagePlanOutcome[]): string {
  const lines: string[] = [];
  let totalDelete = 0;
  let totalGroups = 0;
  let skipped = 0;
  for (const { entry, result } of outcomes) {
    if (result.status === "nothing-to-do") {
      lines.push(`  ${entry.match}: nothing to do`);
    } else if (result.status === "skipped") {
      skipped += 1;
      lines.push(`  ${entry.match}: SKIPPED (${result.reason}) — ${result.detail}`);
    } else {
      totalDelete += result.deleteCount;
      totalGroups += result.groups.length;
      lines.push(
        `  ${entry.match}: ${String(result.deleteCount)} to delete in ${String(result.groups.length)} group(s) ` +
          `(live roots ${String(result.liveRootsCount)}, kept ${String(result.keepRootsCount)}, ` +
          `reachable ${String(result.reachableCount)}, inflight ${String(result.inflightCount)})` +
          (result.brokenRootDigests.length > 0
            ? ` — broken root(s) proven not-found: ${result.brokenRootDigests.join(", ")}`
            : ""),
      );
    }
  }
  return [
    `planned ${String(outcomes.length)} package(s): ${String(totalGroups)} group(s), ` +
      `${String(totalDelete)} version(s) to delete, ${String(skipped)} skipped (fail-closed)`,
    ...lines,
  ].join("\n");
}

async function writePlanFile(plan: Plan, outPath: string, fs: PlanFileSystem): Promise<void> {
  const dir = path.dirname(outPath);
  await fs.mkdir(dir);
  await fs.writeFile(outPath, serializePlan(plan));
}

async function runValidateCommand(args: ParsedArgs): Promise<number> {
  const manifest = await loadManifestFile(args.manifest);
  process.stdout.write(
    `manifest OK — owner "${manifest.owner}", ${String(manifest.packages.length)} package(s) configured\n`,
  );
  return EXIT_OK;
}

async function runPlanCommand(args: ParsedArgs, deps: CliDeps): Promise<number> {
  const manifest = await loadManifestFile(args.manifest);
  const entries = selectPackages(manifest, args.packages);
  const registryOwner = args.registryOwner ?? manifest.owner;
  const clock = deps.clock ?? systemClock;
  const jobs = args.jobs ?? DEFAULT_JOBS;

  let registry: RegistryReader;
  let packagesClient: PackagesClient;
  if (deps.registry && deps.packages) {
    registry = deps.registry;
    packagesClient = deps.packages;
  } else {
    const token = requireToken(process.env);
    const octokit = createOctokit(token);
    const adapters = buildRegistryAdapters(
      token,
      manifest.owner,
      registryOwner,
      entries,
      octokit,
      jobs,
    );
    registry = deps.registry ?? adapters.planningRegistry;
    packagesClient = deps.packages ?? adapters.packages;
  }

  const { outcomes, plan } = await runPlanning(
    manifest,
    entries,
    registry,
    packagesClient,
    clock,
    jobs,
    args.deleteBrokenRoots,
    deps.progress,
  );

  process.stdout.write(`${formatPlanSummary(outcomes)}\n`);

  if (args.out !== undefined) {
    const fs = deps.planFs ?? nodePlanFileSystem();
    await writePlanFile(plan, path.resolve(args.out), fs);
    process.stdout.write(`plan written to ${args.out}\n`);
  }

  const hadSkip = outcomes.some((o) => o.result.status === "skipped");
  return hadSkip ? EXIT_FINDINGS : EXIT_OK;
}

/** Renders one {@link CanaryFailureReason} into an operator-facing phrase — see that type's doc for the three cases. */
function formatCanaryFailureReason(reason: CanaryFailureReason): string {
  switch (reason.kind) {
    case "resolve-failed":
      return `tag failed to resolve (${reason.state})`;
    case "closure-failed":
      return `tag resolved but its manifest closure failed to resolve (${reason.state})`;
    case "error":
      return `error while resolving: ${reason.message}`;
  }
}

/** Renders one {@link ApplyAbortReason} for the `ABORTED:` line — the `canary-failed` case additionally names the canary's own path/tag and the cause, since a bare "canary-failed" gave no way to diagnose the first real apply's spurious abort. The `regression` case additionally names a `sinkError` (the breaker itself failed to record the — still real, still confirmed — regression) rather than letting that failure erase the summary line entirely, as it did in the incident that motivated `sinkError`. */
function formatAbortReason(reason: ApplyAbortReason): string {
  if (reason.kind === "canary-failed") {
    return `canary-failed (canary ${reason.path}:${reason.tag} — ${formatCanaryFailureReason(reason.reason)})`;
  }
  if (reason.kind === "regression" && reason.sinkError !== undefined) {
    return `regression (breaker also failed to record it: ${reason.sinkError})`;
  }
  if (reason.kind === "verification-unavailable") {
    return `verification-unavailable (${String(reason.tags.length)} tag(s) could not be confirmed healthy or broken in package ${reason.packageName} — not treated as a regression, breaker not tripped)`;
  }
  return reason.kind;
}

function summarizeApplyResult(plan: Plan, result: ApplyResult): string {
  const lines: string[] = [];
  for (const pkg of result.packages) {
    for (const group of pkg.groups) {
      const deleted = group.members.filter(
        (m) => m.result === "deleted" || m.result === "already-gone",
      ).length;
      const failed = group.members.filter(
        (m) => m.result === "error" || m.result === "last-version-conflict",
      ).length;
      const notAttempted = group.members.filter((m) => m.result === "not-attempted").length;
      lines.push(
        `  ${pkg.packageName} group ${group.root}: ${group.status} — ${String(deleted)} deleted, ` +
          `${String(failed)} failed, ${String(notAttempted)} not attempted`,
      );
    }
    // Never a failure and never sunk to the breaker (see `verify.ts`'s
    // `republished` doc) — reported here purely as context: the
    // registry changed under this run, which is normal in a repo whose
    // CI publishes continuously, not something an operator needs to act
    // on.
    if (pkg.republishedTags.length > 0) {
      lines.push(
        `  ${pkg.packageName}: ${String(pkg.republishedTags.length)} tag(s) republished by ` +
          `something else during this run (not a regression): ` +
          `${pkg.republishedTags.map((t) => t.tag).join(", ")}`,
      );
    }
  }
  const header =
    `attempted ${String(result.attempted)} of ${String(plannedDeletionCount(plan))} planned deletion(s), ` +
    `${String(result.remainingBudget)} budget remaining` +
    (result.abortedFor ? `, ABORTED: ${formatAbortReason(result.abortedFor)}` : "");
  return [header, ...lines].join("\n");
}

async function runApplyCommand(args: ParsedArgs, deps: CliDeps): Promise<number> {
  if (!args.apply) {
    throw new UsageError(
      "`apply` requires the explicit --apply flag in addition to the subcommand — " +
        "two independent gestures are required to delete anything",
    );
  }
  if (args.budget === undefined) {
    throw new UsageError("`apply` requires --budget <n>");
  }
  if (args.out === undefined) {
    throw new UsageError(
      "`apply` requires --out <path> — the plan is written there and re-read before any deletion is granted (grantApply's round trip)",
    );
  }

  const manifest = await loadManifestFile(args.manifest);
  const entries = selectPackages(manifest, args.packages);
  const registryOwner = args.registryOwner ?? manifest.owner;
  const clock = deps.clock ?? systemClock;
  const jobs = args.jobs ?? DEFAULT_JOBS;

  // The canary's package, resolved here — BEFORE `--package` filtering
  // is baked into the registry adapters below — because the canary is a
  // property of the whole run, not of whichever packages `--package`
  // happened to select (see `buildRegistryAdapters`'s doc). A malformed
  // name is swallowed here on purpose: this is only a best-effort
  // registration for the token map, and the proper, user-facing error is
  // still raised below, at the point where the canary is actually
  // required (only once it is known the plan has work to verify).
  const canaryPackageRaw: string | undefined = args.canaryPackage ?? manifest.canary?.package;
  let canaryPackageForRegistry: PackageName | undefined;
  if (canaryPackageRaw !== undefined) {
    try {
      canaryPackageForRegistry = packageName(canaryPackageRaw);
    } catch {
      // Deferred to the validation below, which runs only if the plan
      // turns out to have work to verify.
    }
  }

  // A production Octokit client is needed for any of: the registry
  // adapters, the mutator, or the breaker — built once, lazily, only if at
  // least one of those was not already supplied by `deps` (tests supply
  // all of them and so never require a real token at all).
  const needsOctokit = !deps.registry || !deps.packages || !deps.mutator || !deps.breaker;
  const token = needsOctokit ? requireToken(process.env) : undefined;
  const octokit = token !== undefined ? createOctokit(token) : undefined;

  let registry: RegistryReader;
  let verificationRegistry: RegistryReader;
  let packagesClient: PackagesClient;
  if (deps.registry && deps.packages) {
    // Tests inject a single bare fake here, with no caching decorator in
    // front of it at all, so reusing it for both planning and
    // verification is correct in that world, not a reintroduction of
    // the production bug (see `buildRegistryAdapters`'s doc for why
    // production keeps the two separate).
    registry = deps.registry;
    verificationRegistry = deps.registry;
    packagesClient = deps.packages;
  } else {
    // token/octokit are guaranteed defined here: needsOctokit is true
    // whenever this branch is reached (deps.registry or deps.packages
    // missing implies needsOctokit).
    const adapters = buildRegistryAdapters(
      token as string,
      manifest.owner,
      registryOwner,
      entries,
      octokit as RegistryOctokit,
      jobs,
      canaryPackageForRegistry,
    );
    registry = adapters.planningRegistry;
    verificationRegistry = adapters.verificationRegistry;
    packagesClient = adapters.packages;
  }

  // The breaker is mandatory, unconditionally — see this module's doc and
  // apply.ts's doc on why "apply with no breaker" must not be reachable.
  let breaker: Breaker;
  if (deps.breaker) {
    breaker = deps.breaker;
  } else {
    const repoSpec = args.breakerRepo ?? process.env.GITHUB_REPOSITORY;
    if (!repoSpec) {
      throw new UsageError(
        "no breaker configured: pass --breaker-repo <owner>/<repo> or set GITHUB_REPOSITORY " +
          "— apply refuses to run without a circuit breaker",
      );
    }
    const [breakerOwner, breakerRepo] = repoSpec.split("/", 2);
    if (!breakerOwner || !breakerRepo) {
      throw new UsageError(
        `--breaker-repo/GITHUB_REPOSITORY must be "<owner>/<repo>", got "${repoSpec}"`,
      );
    }
    const breakerTokenValue = resolveBreakerToken(args, process.env, token as string);
    const breakerOctokit =
      breakerTokenValue === token ? (octokit as RegistryOctokit) : createOctokit(breakerTokenValue);
    breaker = githubIssueBreaker(breakerOctokit, breakerOwner, breakerRepo, {
      ...(args.journal !== undefined && { journalPath: args.journal }),
    });
  }

  const { outcomes, plan } = await runPlanning(
    manifest,
    entries,
    registry,
    packagesClient,
    clock,
    jobs,
    args.deleteBrokenRoots,
    deps.progress,
  );
  process.stdout.write(`${formatPlanSummary(outcomes)}\n`);

  const fs = deps.planFs ?? nodePlanFileSystem();
  const outPath = path.resolve(args.out);
  await writePlanFile(plan, outPath, fs);
  const cap = await grantApply(plan, outPath, fs);
  process.stdout.write(`plan written and re-verified at ${args.out}\n`);

  const mutator: Mutator =
    deps.mutator ?? applyMutator(octokit as RegistryOctokit, manifest.owner, cap);

  const hasWork = totalGroupCount(plan) > 0;
  let verification: VerificationOptions | undefined;
  if (hasWork) {
    // `--canary-package`/`--canary-tag` OVERRIDE `manifest.canary`,
    // field by field, when present; otherwise the manifest's value (if
    // any) is used. The manifest is the source that survives every
    // trigger — see `manifest/schema.ts`'s `ManifestCanary` doc for why a
    // `schedule`-triggered run can never rely on a CLI-flag-only canary.
    // `canaryPackageRaw` was already resolved above (before the registry
    // adapters were built); only `canaryTagRaw` is new here.
    const canaryTagRaw: string | undefined = args.canaryTag ?? manifest.canary?.tag;
    if (!canaryPackageRaw || !canaryTagRaw) {
      throw new UsageError(
        "this plan has deletions to attempt but no canary is configured — add `canary: " +
          "{ package, tag }` to the manifest, or pass --canary-package <name> --canary-tag " +
          "<tag> (a known-good tag resolved before any deletion). Verification is not " +
          "optional on the apply path.",
      );
    }
    // Reuse the package already parsed above when it succeeded; only
    // re-parse (to surface the proper error) if it did not.
    let canaryPkg: PackageName;
    if (canaryPackageForRegistry !== undefined) {
      canaryPkg = canaryPackageForRegistry;
    } else {
      try {
        canaryPkg = packageName(canaryPackageRaw);
      } catch (error) {
        throw new UsageError(`canary package "${canaryPackageRaw}": ${errorMessage(error)}`);
      }
    }
    let canaryTagValue: Tag;
    try {
      canaryTagValue = tag(canaryTagRaw);
    } catch (error) {
      throw new UsageError(`canary tag "${canaryTagRaw}": ${errorMessage(error)}`);
    }
    verification = {
      registry: verificationRegistry,
      canary: { path: registryPathFor(registryOwner, canaryPkg), tag: canaryTagValue },
      sink: breakerRegressionSink(breaker),
      // Printed to stdout BEFORE `sink.record` (which calls the
      // breaker, a network operation) is even attempted — so the
      // incident survives a breaker outage instead of vanishing behind
      // a bare "Not Found" the way it did in the run that motivated
      // this (see `apply.ts`'s `VerificationOptions.onIncident` doc).
      onIncident: (incident) => {
        process.stdout.write(
          `${formatIncidentReport(incident, { ...(args.journal !== undefined && { journalPath: args.journal }) })}\n`,
        );
      },
    };
  }

  const journal = deps.journal ?? (args.journal ? ndjsonJournal(args.journal) : undefined);

  const result = await applyPlan(plan, mutator, {
    budget: args.budget,
    breaker,
    ...(journal && { journal }),
    ...(args.baseline !== undefined && { volumeAlarm: { baseline: args.baseline } }),
    ...(verification && { verification }),
  });

  process.stdout.write(`${summarizeApplyResult(plan, result)}\n`);

  const applyExit = classifyApplyExit(plan, result);
  if (applyExit === EXIT_APPLY_SAFETY) {
    return EXIT_SAFETY;
  }
  if (applyExit === EXIT_APPLY_MUTATION_FAILURE) {
    return EXIT_FINDINGS;
  }
  if (applyExit !== EXIT_APPLY_OK) {
    // Unreachable given classifyApplyExit's three-value range — guards
    // against a silent exit-code drift if that range ever grows.
    throw new Error(`unexpected apply exit classification: ${String(applyExit)}`);
  }
  const hadPlanSkip = outcomes.some((o) => o.result.status === "skipped");
  return hadPlanSkip ? EXIT_FINDINGS : EXIT_OK;
}

/** Runs the CLI end-to-end and returns the process exit code — never calls `process.exit` itself. */
export async function runCommand(argv: readonly string[], deps: CliDeps = {}): Promise<number> {
  let subcommand: Subcommand;
  let args: ParsedArgs;
  try {
    ({ subcommand, args } = parseArgv(argv));
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n`);
    return EXIT_CONFIG;
  }

  try {
    switch (subcommand) {
      case "validate":
        return await runValidateCommand(args);
      case "plan":
        return await runPlanCommand(args, deps);
      case "apply":
        return await runApplyCommand(args, deps);
    }
  } catch (error) {
    if (error instanceof ManifestError || error instanceof UsageError) {
      process.stderr.write(`${errorMessage(error)}\n`);
      return EXIT_CONFIG;
    }
    // A plan-integrity violation (assertGroupsAreWellFormed / assertNoSurvivingParent)
    // is a thrown Error, not a return value — and is exactly a safety-severity
    // finding: the plan itself was shown to be structurally wrong.
    if (error instanceof Error && /plan integrity violation/.test(error.message)) {
      process.stderr.write(`${error.message}\n`);
      return EXIT_SAFETY;
    }
    process.stderr.write(`${errorMessage(error)}\n`);
    return EXIT_INFRA;
  }
}

/**
 * Splits a single argument string (e.g. `INPUT_ARGS`'s value) into argv
 * tokens, respecting single- and double-quoted segments.
 */
export function tokenizeArgs(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let hasToken = false;
  let quote: '"' | "'" | undefined;

  for (const ch of input) {
    if (quote !== undefined) {
      if (ch === quote) {
        quote = undefined;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      if (hasToken) {
        tokens.push(current);
        current = "";
        hasToken = false;
      }
      continue;
    }
    current += ch;
    hasToken = true;
  }
  if (hasToken) {
    tokens.push(current);
  }
  return tokens;
}

/**
 * Picks argv for the run: `INPUT_ARGS` when defined (running as a future
 * JS action), falling back to real `process.argv` otherwise. Tests
 * "defined" rather than "non-empty" so an explicitly-set-but-empty
 * `INPUT_ARGS` is treated as a usage error below, not silently ignored
 * in favour of `process.argv`.
 */
export function resolveArgv(env: NodeJS.ProcessEnv, argv: readonly string[]): string[] {
  const inputArgs = env.INPUT_ARGS;
  if (inputArgs === undefined) {
    return [...argv];
  }
  if (inputArgs.trim() === "") {
    throw new UsageError(
      "the `args` input is empty — pass a subcommand and flags (e.g. `plan --manifest .ghcr-tidy.yaml`)",
    );
  }
  return tokenizeArgs(inputArgs);
}

/* c8 ignore start -- process wiring, exercised via runCommand in tests */
async function mainEntry(): Promise<void> {
  let argv: string[];
  try {
    argv = resolveArgv(process.env, process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n`);
    process.exitCode = EXIT_CONFIG;
    return;
  }
  const exitCode = await runCommand(argv);
  process.exitCode = exitCode;
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isDirectRun) {
  void mainEntry();
}
/* c8 ignore stop */
