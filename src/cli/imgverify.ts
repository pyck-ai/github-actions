#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { emitBuildArgs, type EmitFormat } from "../buildargs/emit.js";
import { parseBuildArgs, type BuildArgs } from "../buildargs/parse.js";
import { executeCheck } from "../checks/index.js";
import type { CheckResult } from "../checks/types.js";
import {
  createDockerCli,
  spawnExec,
  spawnExecBinary,
  type DockerCli,
  type ExecBinaryFn,
  type ExecFn,
} from "../docker/cli.js";
import { globMatch, resolveTargets } from "../manifest/match.js";
import { parseManifest } from "../manifest/parse.js";
import type { Check, Manifest } from "../manifest/schema.js";
import { ManifestError } from "../manifest/schema.js";
import { substituteManifest } from "../manifest/substitute.js";
import { formatConsoleReport } from "../report/console.js";
import { buildJsonReport, type JsonReport } from "../report/json.js";
import {
  BakeError,
  parseBakePrint,
  runBakePrint,
  spawnBakeExec,
  type BakeExecFn,
  type BakeTarget,
} from "../targets/bake.js";
import {
  ResolveError,
  resolveDigestTarget,
  resolveLocalTarget,
  type ResolvedTarget,
} from "../targets/resolve.js";

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
      throw new BakeError(`could not read --bake-print file ${bakePrintPath}: ${errorMessage(error)}`);
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
function timeoutOverrideExec(timeoutMs: number | undefined): { exec: ExecFn; execBinary: ExecBinaryFn } {
  if (timeoutMs === undefined) {
    return { exec: spawnExec, execBinary: spawnExecBinary };
  }
  const resolve = (requested: number): number =>
    requested === DOCKER_CLI_DEFAULT_TIMEOUT_MS ? timeoutMs : requested;
  return {
    exec: (execArgs, opts) => spawnExec(execArgs, { timeoutMs: resolve(opts.timeoutMs) }),
    execBinary: (execArgs, opts) => spawnExecBinary(execArgs, { timeoutMs: resolve(opts.timeoutMs) }),
  };
}

function printTargetHeader(resolved: ResolvedTarget): void {
  process.stdout.write(`\n${resolved.target} — ${resolved.ref} (platform: ${resolved.architecture})\n`);
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
  resolveTargets(loaded.manifest, bakeTargets.map((t) => t.name));

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
  const resolvedChecks = resolveTargets(loaded.manifest, bakeTargets.map((t) => t.name));

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

  const reports: JsonReport[] = [];
  let hadInfraError = false;
  let hadCheckFailure = false;

  for (const target of selectedTargets) {
    let resolved: ResolvedTarget;
    try {
      resolved =
        digests !== undefined
          ? await resolveDigestTarget(cli, target, digests)
          : await resolveLocalTarget(cli, target);
    } catch (error) {
      hadInfraError = true;
      process.stdout.write(`\n${target.name}: ${errorMessage(error)}\n`);
      continue;
    }

    printTargetHeader(resolved);

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
          manifestDir: loaded.manifestDir,
        });
        results.push(result);
      } catch (error) {
        hardError = error;
        break;
      }
    }

    if (hardError !== undefined) {
      hadInfraError = true;
      process.stdout.write(`  ${errorMessage(hardError)}\n`);
      continue;
    }

    process.stdout.write(`${formatConsoleReport(results, { color })}\n`);
    const report = buildJsonReport(target.name, resolved.ref, results);
    reports.push(report);
    if (report.summary.failed > 0) {
      hadCheckFailure = true;
    }
  }

  const exitCode = hadInfraError ? EXIT_INFRA_ERROR : hadCheckFailure ? EXIT_CHECK_FAILURE : EXIT_OK;

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

/* c8 ignore start -- process wiring, exercised via runCommand in tests */
async function mainEntry(): Promise<void> {
  const exitCode = await runCommand(process.argv.slice(2));
  process.exitCode = exitCode;
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isDirectRun) {
  void mainEntry();
}
/* c8 ignore stop */
