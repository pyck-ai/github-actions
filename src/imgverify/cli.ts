#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { emitBuildArgs, type EmitFormat } from "./buildargs/emit.js";
import { parseBuildArgs, type BuildArgs } from "./buildargs/parse.js";
import { executeCheck } from "./checks/index.js";
import type { CheckResult } from "./checks/types.js";
import {
  createDockerCli,
  spawnExec,
  spawnExecBinary,
  type DockerCli,
  type ExecBinaryFn,
  type ExecFn,
} from "./docker/cli.js";
import { globMatch, resolveTargets } from "./manifest/match.js";
import { parseManifest } from "./manifest/parse.js";
import type { Check, Manifest } from "./manifest/schema.js";
import { ManifestError } from "./manifest/schema.js";
import { substituteManifest } from "./manifest/substitute.js";
import { formatConsoleReport } from "../core/report/console.js";
import { buildJsonReport, type JsonReport } from "../core/report/json.js";
import {
  BakeError,
  parseBakePrint,
  runBakePrint,
  spawnBakeExec,
  type BakeExecFn,
  type BakeTarget,
} from "./targets/bake.js";
import {
  ResolveError,
  resolveDigestTarget,
  resolveLocalTarget,
  type ResolvedTarget,
} from "./targets/resolve.js";

/**
 * `imgverify` — the CLI entrypoint wiring the pure foundation layer
 * (`buildargs/`, `manifest/`), the check-kind executors (`checks/`), and
 * target resolution (`targets/`) into one command.
 *
 * ## Exit codes (deliberately richer than the bash predecessor's 0/1)
 *
 * - `0` — every check passed.
 * - `1` — at least one check FAILED (the only "the image is bad" code).
 * - `2` — CONFIG error: invalid manifest, unknown check kind, an undefined
 *   `${VAR}`, a `buildargs.conf` dialect violation, or a `--target` glob
 *   matching nothing. This is the fix for a real bash bug: an unset
 *   variable there aborted mid-run under `set -u` and was reported as an
 *   image failure, making a misconfigured environment indistinguishable
 *   from a genuinely broken image.
 * - `3` — INFRASTRUCTURE error: `bake --print` failed, an image isn't
 *   loaded locally / `docker pull` failed, or no digest was recorded for a
 *   target.
 *
 * ## `--digests` as a trailing argument
 *
 * `build-image.yml`'s `verify` job runs
 * `${{ inputs.verify-command }} --digests digests.json` — an arbitrary
 * caller-supplied prefix with `--digests <file>` appended. So `--digests`
 * MUST work with no subcommand at all (`imgverify --digests x` implies
 * `run`), and there must be no required positional that would break that
 * concatenation. See `parseArgv`.
 */

const EXIT_OK = 0;
const EXIT_CHECK_FAILURE = 1;
const EXIT_CONFIG_ERROR = 2;
const EXIT_INFRA_ERROR = 3;

const DEFAULT_MANIFEST_PATH = ".imgverify.yaml";
const DEFAULT_BUILDARGS_PATH = "buildargs.conf";
/**
 * `--jobs`' default: bounded concurrency for target verification. Pulling
 * multi-GB images dominates a real run's wall time (measured: ~130s of
 * pull gaps vs ~75s of check execution across 15 targets in
 * pyck-ai/baseimages run 34623780843), so overlapping pulls is the whole
 * point — but a self-hosted runner has finite network/disk, so the fan-out
 * must stay bounded rather than launching all targets at once. 4 is a
 * starting point that overlaps enough pulls to matter without saturating a
 * single runner's link; `--jobs 1` recovers today's fully serial behaviour
 * exactly.
 */
const DEFAULT_JOBS = 4;
/** `docker/cli.ts`'s `DockerCli` hardcodes this as its own per-operation default — see `--timeout-ms`'s handling in {@link runCommand}. */
const DOCKER_CLI_DEFAULT_TIMEOUT_MS = 120_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Subcommand = "run" | "validate" | "buildargs";

/** A CLI usage problem (bad flag, missing value, unrecognised subcommand) — always a CONFIG error. */
class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

interface ParsedArgs {
  manifest?: string;
  buildargs?: string;
  digests?: string;
  registry?: string;
  /** Repeatable `--target <glob>`. */
  targets: string[];
  bakePrint?: string;
  json?: string;
  timeoutMs?: number;
  /** `--jobs N` — bounded verification concurrency; defaults to {@link DEFAULT_JOBS}. */
  jobs?: number;
  noColor: boolean;
  /** Parsed only to be rejected — see this module's doc comment and the CLI surface spec. */
  platform?: string;
  format?: string;
}

/**
 * Parses argv (without `node`/script path). The first token is a
 * subcommand (`run`/`validate`/`buildargs`) ONLY if it exactly matches one
 * of those three names; otherwise the whole of argv is treated as `run`'s
 * flags — this is what lets `imgverify --digests digests.json` (no
 * subcommand) work as `build-image.yml` requires.
 */
export function parseArgv(argv: readonly string[]): { subcommand: Subcommand; args: ParsedArgs } {
  let subcommand: Subcommand = "run";
  let rest = argv;
  const first = argv[0];
  if (first === "run" || first === "validate" || first === "buildargs") {
    subcommand = first;
    rest = argv.slice(1);
  }

  const args: ParsedArgs = { targets: [], noColor: false };
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

    switch (flag) {
      case "--manifest":
        args.manifest = nextValue();
        break;
      case "--buildargs":
        args.buildargs = nextValue();
        break;
      case "--digests":
        args.digests = nextValue();
        break;
      case "--registry":
        args.registry = nextValue();
        break;
      case "--target":
        args.targets.push(nextValue());
        break;
      case "--bake-print":
        args.bakePrint = nextValue();
        break;
      case "--json":
        args.json = nextValue();
        break;
      case "--timeout-ms": {
        const raw = nextValue();
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new UsageError(`--timeout-ms must be a positive number, got "${raw}"`);
        }
        args.timeoutMs = parsed;
        break;
      }
      case "--jobs": {
        const raw = nextValue();
        if (!/^-?\d+$/.test(raw)) {
          throw new UsageError(`--jobs must be a positive integer, got "${raw}"`);
        }
        const parsed = Number(raw);
        if (parsed <= 0) {
          throw new UsageError(`--jobs must be a positive integer, got "${raw}"`);
        }
        args.jobs = parsed;
        break;
      }
      case "--no-color":
        args.noColor = true;
        break;
      case "--platform":
        args.platform = nextValue();
        break;
      case "--format":
        args.format = nextValue();
        break;
      default:
        throw new UsageError(`unknown flag: ${flag}`);
    }
  }

  return { subcommand, args };
}

interface LoadedManifest {
  manifest: Manifest;
  vars: BuildArgs;
  manifestDir: string;
  registry: string | undefined;
}

/**
 * Parses `buildargs.conf` and the manifest, then substitutes `${VAR}`
 * throughout the manifest. Every failure mode here — unreadable file, bad
 * YAML, schema violation, dialect violation, undefined variable — is a
 * CONFIG error (`ManifestError`/`BuildArgsParseError`/`SubstitutionError`),
 * never a check failure.
 *
 * Registry precedence: the `REGISTRY` env var wins over `--registry`, which
 * wins over the manifest's own `registry:` field — matching this CLI
 * surface's documented `--registry <ref> (env REGISTRY wins)`.
 */
async function loadManifest(args: ParsedArgs): Promise<LoadedManifest> {
  const manifestPath = path.resolve(args.manifest ?? DEFAULT_MANIFEST_PATH);
  const manifestDir = path.dirname(manifestPath);

  let manifestContent: string;
  try {
    manifestContent = await readFile(manifestPath, "utf8");
  } catch (error) {
    throw new ManifestError(`could not read manifest: ${errorMessage(error)}`, manifestPath);
  }
  const manifest = parseManifest(manifestContent, manifestPath);

  // The buildargs path itself can never contain a ${VAR} — resolving it is
  // what produces the vars a substitution would need, so it is read from
  // the manifest BEFORE substitution, never after.
  const buildargsPath = path.resolve(
    args.buildargs ??
      (manifest.buildargs !== undefined
        ? path.resolve(manifestDir, manifest.buildargs)
        : DEFAULT_BUILDARGS_PATH),
  );

  let buildargsContent: string;
  try {
    buildargsContent = await readFile(buildargsPath, "utf8");
  } catch (error) {
    throw new ManifestError(`could not read buildargs file: ${errorMessage(error)}`, buildargsPath);
  }
  const vars = parseBuildArgs(buildargsContent, buildargsPath);

  const substituted = substituteManifest(manifest, vars);
  const registry = process.env.REGISTRY ?? args.registry ?? substituted.registry;

  return { manifest: substituted, vars, manifestDir, registry };
}

async function loadBakeTargets(
  args: ParsedArgs,
  registry: string | undefined,
  timeoutMs: number,
  bakeExec: BakeExecFn,
): Promise<BakeTarget[]> {
  if (args.bakePrint !== undefined) {
    const bakePrintPath = path.resolve(args.bakePrint);
    let content: string;
    try {
      content = await readFile(bakePrintPath, "utf8");
    } catch (error) {
      throw new BakeError(
        `could not read --bake-print file ${bakePrintPath}: ${errorMessage(error)}`,
      );
    }
    return parseBakePrint(content);
  }

  const env: Record<string, string> = {};
  if (registry !== undefined) {
    env.REGISTRY = registry;
  }
  return runBakePrint(bakeExec, {
    timeoutMs,
    ...(Object.keys(env).length > 0 && { env }),
  });
}

/**
 * Reads `--digests <file>` (`{target: "sha256:..."}`) and validates every
 * value is a string — a non-string digest would otherwise silently become
 * `"[object Object]"` or similar once template-interpolated into a ref.
 */
async function loadDigests(digestsFlag: string): Promise<Record<string, string>> {
  const digestsPath = path.resolve(digestsFlag);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(digestsPath, "utf8"));
  } catch (error) {
    throw new UsageError(`could not read --digests file ${digestsPath}: ${errorMessage(error)}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new UsageError(`--digests file ${digestsPath} must be a JSON object of {target: digest}`);
  }
  const digests: Record<string, string> = {};
  for (const [target, digest] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof digest !== "string") {
      throw new UsageError(
        `--digests file ${digestsPath}: digest for "${target}" must be a string, got ${typeof digest}`,
      );
    }
    digests[target] = digest;
  }
  return digests;
}

/**
 * Wraps `spawnExec`/`spawnExecBinary` so `--timeout-ms` acts as a new
 * process-wide default. `docker/cli.ts`'s `DockerCli` hardcodes
 * `DEFAULT_TIMEOUT_MS = 120_000` per-operation and has no global override
 * knob; rather than modify that module, an explicit per-check `timeoutMs`
 * (e.g. a `sh` check's own `timeoutMs` field) is presumed to differ from
 * that hardcoded default and is passed through unchanged — only calls that
 * would have used the hardcoded default get the CLI's override. A `sh`
 * check that deliberately sets `timeoutMs: 120000` (equal to the
 * hardcoded default) is the one case this heuristic gets wrong; documented
 * here rather than silently assumed.
 */
function timeoutOverrideExec(timeoutMs: number | undefined): {
  exec: ExecFn;
  execBinary: ExecBinaryFn;
} {
  if (timeoutMs === undefined) {
    return { exec: spawnExec, execBinary: spawnExecBinary };
  }
  const resolve = (requested: number): number =>
    requested === DOCKER_CLI_DEFAULT_TIMEOUT_MS ? timeoutMs : requested;
  return {
    exec: (execArgs, opts) => spawnExec(execArgs, { timeoutMs: resolve(opts.timeoutMs) }),
    execBinary: (execArgs, opts) =>
      spawnExecBinary(execArgs, { timeoutMs: resolve(opts.timeoutMs) }),
  };
}

function targetHeader(resolved: ResolvedTarget): string {
  return `\n${resolved.target} — ${resolved.ref} (platform: ${resolved.architecture})\n`;
}

/**
 * Runs `worker` over `items` with at most `limit` concurrently in flight,
 * writing each result to `results[i]` at its ORIGINAL index — a small
 * hand-rolled bounded pool rather than a dependency, since the only shape
 * needed is "N workers pull from a shared cursor". Deliberately not
 * `Promise.all(items.map(worker))`: that fans out unboundedly, and these
 * workers are multi-GB `docker pull`s where an unbounded fan-out on one
 * runner would thrash network and disk (see `DEFAULT_JOBS`'s doc comment).
 *
 * Completion order is NOT the same as index order — that is the whole
 * point of running concurrently — but because every result lands in its
 * own reserved slot, `results` always comes back in the original,
 * deterministic `items` order regardless of which worker finished first.
 * Callers rely on this to keep console/JSON output ordering identical to
 * the fully serial (`--jobs 1`) implementation.
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

/** One target's fully-computed verification outcome, with its console output BUFFERED rather than written — see {@link runPool}'s doc comment on why. */
interface TargetOutcome {
  /** Exactly what the serial implementation would have written to stdout for this target, concatenated. */
  output: string;
  /** Present only when the target reached the point of producing check results (i.e. no resolve/hard error). */
  report?: JsonReport;
  hadInfraError: boolean;
  hadCheckFailure: boolean;
}

interface VerifyTargetContext {
  cli: DockerCli;
  digests: Record<string, string> | undefined;
  resolvedChecks: ReadonlyMap<string, Check[]>;
  manifestDir: string;
  color: boolean;
}

/**
 * Resolves and verifies a single target, mirroring the old inline loop
 * body exactly but returning its console output as a string instead of
 * writing it — so {@link runPool} can run many of these concurrently while
 * the caller still flushes output in the original deterministic order.
 */
async function verifyTarget(target: BakeTarget, ctx: VerifyTargetContext): Promise<TargetOutcome> {
  const { cli, digests, resolvedChecks, manifestDir, color } = ctx;

  let resolved: ResolvedTarget;
  try {
    resolved =
      digests !== undefined
        ? await resolveDigestTarget(cli, target, digests)
        : await resolveLocalTarget(cli, target);
  } catch (error) {
    return {
      output: `\n${target.name}: ${errorMessage(error)}\n`,
      hadInfraError: true,
      hadCheckFailure: false,
    };
  }

  let output = targetHeader(resolved);

  const checks: Check[] = resolvedChecks.get(target.name) ?? [];
  const results: CheckResult[] = [];
  let hardError: unknown;
  for (let idx = 0; idx < checks.length; idx += 1) {
    const check = checks[idx];
    if (check === undefined) {
      continue;
    }
    try {
      const result = await executeCheck(check, idx, {
        cli,
        image: resolved.ref,
        manifestDir,
      });
      results.push(result);
    } catch (error) {
      hardError = error;
      break;
    }
  }

  if (hardError !== undefined) {
    output += `  ${errorMessage(hardError)}\n`;
    return { output, hadInfraError: true, hadCheckFailure: false };
  }

  output += `${formatConsoleReport(results, { color })}\n`;
  const report = buildJsonReport(target.name, resolved.ref, results);
  return { output, report, hadInfraError: false, hadCheckFailure: report.summary.failed > 0 };
}

async function runValidateCommand(args: ParsedArgs): Promise<number> {
  const loaded = await loadManifest(args);

  if (args.bakePrint === undefined) {
    process.stdout.write(
      "manifest OK (schema + \\${VAR} substitution only — pass --bake-print to also validate " +
        '"match" globs against real bake target names; validate never invokes docker itself)\n',
    );
    return EXIT_OK;
  }

  const bakePrintPath = path.resolve(args.bakePrint);
  const content = await readFile(bakePrintPath, "utf8");
  const bakeTargets = parseBakePrint(content);
  resolveTargets(
    loaded.manifest,
    bakeTargets.map((t) => t.name),
  );

  process.stdout.write(`manifest OK — matched ${String(bakeTargets.length)} bake target(s)\n`);
  return EXIT_OK;
}

async function runBuildArgsCommand(args: ParsedArgs): Promise<number> {
  if (args.format !== "env" && args.format !== "bake" && args.format !== "github-env") {
    throw new UsageError(`--format must be one of env, bake, github-env`);
  }
  const buildargsPath = path.resolve(args.buildargs ?? DEFAULT_BUILDARGS_PATH);
  const content = await readFile(buildargsPath, "utf8");
  const vars = parseBuildArgs(content, buildargsPath);
  for (const line of emitBuildArgs(vars, args.format as EmitFormat)) {
    process.stdout.write(`${line}\n`);
  }
  return EXIT_OK;
}

/**
 * Injectable dependencies for testing `run` end-to-end without a real
 * `docker` binary: a fake {@link DockerCli} (image inspect/pull/run/etc.)
 * and a fake {@link BakeExecFn} (`docker buildx bake --print`'s
 * subprocess). {@link mainEntry} (the real CLI) passes neither, so
 * production always uses the real `docker` binary via
 * {@link timeoutOverrideExec}/{@link spawnBakeExec}.
 */
export interface CliDeps {
  cli?: DockerCli;
  bakeExec?: BakeExecFn;
}

async function runRunCommand(args: ParsedArgs, deps: CliDeps): Promise<number> {
  const loaded = await loadManifest(args);
  const timeoutMs = args.timeoutMs ?? DOCKER_CLI_DEFAULT_TIMEOUT_MS;

  let bakeTargets: BakeTarget[];
  try {
    bakeTargets = await loadBakeTargets(
      args,
      loaded.registry,
      timeoutMs,
      deps.bakeExec ?? spawnBakeExec,
    );
  } catch (error) {
    if (error instanceof BakeError) {
      throw error;
    }
    throw new BakeError(errorMessage(error));
  }

  // Match validation runs against the FULL set of known bake targets, not
  // the --target-filtered subset — a typo'd `match` glob must be caught
  // even on a run that only exercises one target via --target.
  const resolvedChecks = resolveTargets(
    loaded.manifest,
    bakeTargets.map((t) => t.name),
  );

  let selectedTargets = bakeTargets;
  if (args.targets.length > 0) {
    const globs = args.targets;
    selectedTargets = bakeTargets.filter((t) => globs.some((glob) => globMatch(glob, t.name)));
    if (selectedTargets.length === 0) {
      throw new UsageError(
        `--target matched none of the ${String(bakeTargets.length)} known bake targets (${bakeTargets.map((t) => t.name).join(", ")})`,
      );
    }
  }

  const digests = args.digests !== undefined ? await loadDigests(args.digests) : undefined;

  let cli: DockerCli;
  if (deps.cli !== undefined) {
    cli = deps.cli;
  } else {
    const { exec, execBinary } = timeoutOverrideExec(args.timeoutMs);
    cli = createDockerCli(exec, execBinary);
  }
  const color = !args.noColor;
  const jobs = args.jobs ?? DEFAULT_JOBS;

  // Verified concurrently (bounded by `jobs`), but `runPool` guarantees
  // `outcomes` comes back in `selectedTargets`' original order regardless
  // of completion order — so flushing it in a plain sequential loop below
  // reproduces the fully serial implementation's output byte-for-byte.
  const outcomes = await runPool(selectedTargets, jobs, (target) =>
    verifyTarget(target, {
      cli,
      digests,
      resolvedChecks,
      manifestDir: loaded.manifestDir,
      color,
    }),
  );

  const reports: JsonReport[] = [];
  let hadInfraError = false;
  let hadCheckFailure = false;

  for (const outcome of outcomes) {
    process.stdout.write(outcome.output);
    if (outcome.hadInfraError) {
      hadInfraError = true;
    }
    if (outcome.hadCheckFailure) {
      hadCheckFailure = true;
    }
    if (outcome.report !== undefined) {
      reports.push(outcome.report);
    }
  }

  const exitCode = hadInfraError
    ? EXIT_INFRA_ERROR
    : hadCheckFailure
      ? EXIT_CHECK_FAILURE
      : EXIT_OK;

  if (args.json !== undefined) {
    await writeFile(
      path.resolve(args.json),
      JSON.stringify({ targets: reports, exitCode }, null, 2),
    );
  }

  return exitCode;
}

/** Runs the CLI end-to-end and returns the process exit code — never calls `process.exit` itself, so it stays testable. */
export async function runCommand(argv: readonly string[], deps: CliDeps = {}): Promise<number> {
  let subcommand: Subcommand;
  let args: ParsedArgs;
  try {
    ({ subcommand, args } = parseArgv(argv));
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n`);
    return EXIT_CONFIG_ERROR;
  }

  if (args.platform !== undefined) {
    // Named seam: parsed and rejected rather than silently ignored, so the
    // multi-arch verification gap (see targets/resolve.ts's doc comment)
    // stays a tracked, decided shape rather than a forgotten TODO.
    process.stderr.write(`--platform is not implemented\n`);
    return EXIT_CONFIG_ERROR;
  }

  try {
    switch (subcommand) {
      case "buildargs":
        return await runBuildArgsCommand(args);
      case "validate":
        return await runValidateCommand(args);
      case "run":
        return await runRunCommand(args, deps);
    }
  } catch (error) {
    if (error instanceof BakeError || error instanceof ResolveError) {
      process.stderr.write(`${errorMessage(error)}\n`);
      return EXIT_INFRA_ERROR;
    }
    // ManifestError, SubstitutionError (thrown by substituteManifest),
    // BuildArgsParseError, and UsageError are all CONFIG errors.
    process.stderr.write(`${errorMessage(error)}\n`);
    return EXIT_CONFIG_ERROR;
  }
}

/**
 * Splits a single argument string (e.g. `INPUT_ARGS`'s value) into argv
 * tokens, respecting single- and double-quoted segments so a value like
 * `--manifest "some path.yaml"` survives intact. Deliberately NOT a naive
 * `.split(" ")` and deliberately NOT shelled out to `/bin/sh -c` (this is
 * exactly the shell-injection surface the JS-action conversion removes).
 * Runs of whitespace collapse to nothing — GitHub Actions expression
 * interpolation (see `build-image.yml`'s multi-line `args:`) routinely
 * produces doubled spaces where an empty `${{ }}` branch resolves to `""`.
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
 * Picks argv for the run: `INPUT_ARGS` (set by the Actions runtime for the
 * `args` input when this module runs as a `node20` JS action) when it is
 * DEFINED, falling back to real `process.argv` only when it is undefined —
 * i.e. when running as the plain `imgverify` CLI. "Defined" (not
 * "non-empty") is the signal because GitHub sets `INPUT_<NAME>` for every
 * declared input even when the caller omits it and its declared default
 * applies (`action.yml`'s `args` input defaults to `""`), so a caller that
 * invokes this action directly with no `args` gets `INPUT_ARGS=""` — which
 * must fail loudly rather than silently run with no arguments.
 */
export function resolveArgv(env: NodeJS.ProcessEnv, argv: readonly string[]): string[] {
  const inputArgs = env.INPUT_ARGS;
  if (inputArgs === undefined) {
    return [...argv];
  }
  if (inputArgs.trim() === "") {
    throw new UsageError(
      "the `args` input is empty — pass a subcommand and flags (e.g. `run --digests digests.json`)",
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
    process.exitCode = EXIT_CONFIG_ERROR;
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
