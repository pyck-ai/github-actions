#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { packageName, type PackageName } from "../core/registry/package-name.js";
import {
  createOctokit,
  createInMemoryTokenCache,
  getRegistryToken,
  type RegistryOctokit,
} from "../core/registry/index.js";
import { createPackagesClient, createRegistryReader } from "./adapters.js";
import { applyMutator, type Mutator } from "./mutator.js";
import { grantApply, nodePlanFileSystem, type PlanFileSystem } from "./apply-capability.js";
import { githubIssueBreaker, breakerRegressionSink, type Breaker } from "./breaker.js";
import { ndjsonJournal, type Clock, type Journal } from "./journal.js";
import { registryPathFor, tag, type RegistryPath } from "./domain.js";
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
  type ApplyResult,
  type VerificationOptions,
} from "./apply.js";
import type { PackagesClient, RegistryReader } from "./ports.js";

/**
 * `ghcr-tidy` — the CLI entrypoint wiring the pure planning core
 * (`plan.ts`), the apply path (`apply-capability.ts`, `apply.ts`,
 * `mutator.ts`), and safety machinery (`breaker.ts`, `volume-alarm.ts`,
 * `verify.ts`) into three subcommands driven by one config manifest,
 * `.ghcr-tidy.yaml`. Follows `imgverify/cli.ts`'s house style closely:
 * closed-schema config, explicit argv parsing, a small, total exit-code
 * mapping, and the `INPUT_ARGS`-vs-argv duality that lets this same
 * bundle serve as both a plain CLI and (later) a JS action.
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
const DEFAULT_JOBS = 4;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Subcommand = "validate" | "plan" | "apply";

/** A CLI usage problem (bad flag, missing value, unrecognised subcommand) — always a CONFIG error, same as `imgverify/cli.ts`'s `UsageError`. */
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
  apply: boolean;
}

/**
 * Parses argv (without `node`/script path). The first token is a
 * subcommand (`validate`/`plan`/`apply`) ONLY if it exactly matches one of
 * those three names; otherwise the whole of argv is treated as `plan`'s
 * flags — `plan` is the default subcommand, mirroring `imgverify`'s `run`
 * default, since it is the read-only, safe-to-run-with-no-ceremony
 * operation.
 */
export function parseArgv(argv: readonly string[]): { subcommand: Subcommand; args: ParsedArgs } {
  let subcommand: Subcommand = "plan";
  let rest = argv;
  const first = argv[0];
  if (first === "validate" || first === "plan" || first === "apply") {
    subcommand = first;
    rest = argv.slice(1);
  }

  const args: ParsedArgs = { packages: [], apply: false };
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
      case "--apply":
        args.apply = true;
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

/** Applies `--package` filtering: an exact match against each configured entry's `match`. Empty `filters` means "every configured package". Throws a {@link UsageError} (CONFIG) if a filter matches nothing — the same posture `imgverify`'s `--target` takes for an unmatched glob. */
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
 * writing each result to its original index — a small bounded pool,
 * mirroring `imgverify/cli.ts`'s `runPool` exactly (see that module's doc
 * comment for why this is not a plain `Promise.all`).
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

/** Injectable production dependencies for `plan`/`apply` — real network access by default, faked entirely in tests (mirroring `imgverify/cli.ts`'s `CliDeps`). */
export interface CliDeps {
  registry?: RegistryReader;
  packages?: PackagesClient;
  mutator?: Mutator;
  breaker?: Breaker;
  clock?: Clock;
  planFs?: PlanFileSystem;
  journal?: Journal;
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

/** Builds the real, network-backed `RegistryReader`/`PackagesClient` pair for `plan`/`apply`, resolving GHCR bearer tokens per configured package via a shared token cache (one exchange per package, not per manifest resolution). */
function buildRegistryAdapters(
  token: string,
  owner: string,
  registryOwner: string,
  entries: readonly ManifestPackageEntry[],
  octokit: RegistryOctokit,
): {
  registry: RegistryReader;
  packages: PackagesClient;
  pathFor: (p: PackageName) => RegistryPath;
} {
  const pathToName = new Map<RegistryPath, PackageName>();
  const pathFor = (p: PackageName): RegistryPath => {
    const rp = registryPathFor(registryOwner, p);
    pathToName.set(rp, p);
    return rp;
  };
  for (const entry of entries) {
    pathFor(entry.match);
  }

  const tokenCache = createInMemoryTokenCache();
  const registry = createRegistryReader(async (rp) => {
    const name = pathToName.get(rp);
    if (!name) {
      throw new Error(`no configured package maps to registry path ${rp}`);
    }
    return getRegistryToken(token, name, { cache: tokenCache });
  });
  const packages = createPackagesClient(octokit);
  return { registry, packages, pathFor };
}

interface PlanRunResult {
  outcomes: readonly PackagePlanOutcome[];
  plan: Plan;
}

/** Plans every selected package, then assembles a persisted {@link Plan} (`apply`-ready) from whichever of them came back `"planned"`. Concurrency bounded by `--jobs` (default {@link DEFAULT_JOBS}), matching `imgverify/cli.ts`'s target-verification pool. */
async function runPlanning(
  manifest: Manifest,
  entries: readonly ManifestPackageEntry[],
  registry: RegistryReader,
  packagesClient: PackagesClient,
  clock: Clock,
  jobs: number,
): Promise<PlanRunResult> {
  const outcomes = await runPool(entries, jobs, async (entry): Promise<PackagePlanOutcome> => {
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
    });
    return { entry, result };
  });

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
          `reachable ${String(result.reachableCount)}, inflight ${String(result.inflightCount)})`,
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
    const adapters = buildRegistryAdapters(token, manifest.owner, registryOwner, entries, octokit);
    registry = deps.registry ?? adapters.registry;
    packagesClient = deps.packages ?? adapters.packages;
  }

  const { outcomes, plan } = await runPlanning(
    manifest,
    entries,
    registry,
    packagesClient,
    clock,
    jobs,
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
  }
  const header =
    `attempted ${String(result.attempted)} of ${String(plannedDeletionCount(plan))} planned deletion(s), ` +
    `${String(result.remainingBudget)} budget remaining` +
    (result.abortedFor ? `, ABORTED: ${result.abortedFor.kind}` : "");
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

  // A production Octokit client is needed for any of: the registry
  // adapters, the mutator, or the breaker — built once, lazily, only if at
  // least one of those was not already supplied by `deps` (tests supply
  // all of them and so never require a real token at all).
  const needsOctokit = !deps.registry || !deps.packages || !deps.mutator || !deps.breaker;
  const token = needsOctokit ? requireToken(process.env) : undefined;
  const octokit = token !== undefined ? createOctokit(token) : undefined;

  let registry: RegistryReader;
  let packagesClient: PackagesClient;
  if (deps.registry && deps.packages) {
    registry = deps.registry;
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
    );
    registry = adapters.registry;
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
    breaker = githubIssueBreaker(octokit as RegistryOctokit, breakerOwner, breakerRepo, {
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
    if (!args.canaryPackage || !args.canaryTag) {
      throw new UsageError(
        "this plan has deletions to attempt but no canary is configured — pass " +
          "--canary-package <name> --canary-tag <tag> (a known-good tag resolved before any " +
          "deletion). Verification is not optional on the apply path.",
      );
    }
    let canaryPkg: PackageName;
    try {
      canaryPkg = packageName(args.canaryPackage);
    } catch (error) {
      throw new UsageError(`--canary-package: ${errorMessage(error)}`);
    }
    verification = {
      registry,
      canary: { path: registryPathFor(registryOwner, canaryPkg), tag: tag(args.canaryTag) },
      sink: breakerRegressionSink(breaker),
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
 * tokens, respecting single- and double-quoted segments. Identical in
 * behaviour to `imgverify/cli.ts`'s `tokenizeArgs` — duplicated rather than
 * imported so the two CLIs' bundles stay independent (`imgverify` is
 * bundled as a JS action today; `ghcr-tidy` is not yet — see this
 * project's task notes on scope).
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
 * JS action), falling back to real `process.argv` otherwise — see
 * `imgverify/cli.ts`'s `resolveArgv` doc for the exact semantics this
 * mirrors, including why "defined" (not "non-empty") is the signal.
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
