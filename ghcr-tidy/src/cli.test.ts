import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { digest, registryPathFor, tag } from "./domain.js";
import { packageName } from "../../registry/package-name.js";
import { FakeGhcr, version } from "./fake-ghcr.js";
import { memoryBreaker } from "./breaker.js";
import { memoryJournal } from "./journal.js";
import { parsePlan } from "./persisted-plan.js";
import {
  buildPackageTokenMap,
  decorateRegistry,
  parseArgv,
  resolveArgv,
  resolveBreakerToken,
  runCommand,
  tokenizeArgs,
  type CliDeps,
} from "./cli.js";
import type { ManifestPackageEntry } from "./manifest/schema.js";
import type { Clock } from "./ports.js";
import type { RegistryReader } from "./ports.js";

const CLOCK: Clock = { now: () => new Date("2026-09-11T00:00:00.000Z") };

const VALID_MANIFEST = `
version: 1
owner: acme
packages:
  - match: widget
`;

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "ghcr-tidy-cli-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

async function writeManifest(content: string, name = ".ghcr-tidy.yaml"): Promise<string> {
  const p = path.join(tmpDir, name);
  await writeFile(p, content, "utf8");
  return p;
}

/**
 * A fake world with one live tag ("latest", protected by the default
 * protected-tag pattern) and one unreferenced, old garbage digest that
 * the default retention policy plans to delete.
 */
function widgetWorld(): FakeGhcr {
  const fake = new FakeGhcr();
  fake
    .setTag(tag("latest"), digest("sha256:live"))
    .setManifest(digest("sha256:live"), {})
    .setManifest(digest("sha256:garbage"), {});
  fake.addVersion(version(1, "sha256:live", "2026-09-01T00:00:00.000Z"));
  fake.addVersion(version(2, "sha256:garbage", "2020-01-01T00:00:00.000Z"));
  return fake;
}

/**
 * A fake world mirroring the live `baseimages/rover` incident this
 * remediation exists for: one tagged root whose only child is a
 * CONFIRMED 404 (an already-garbage-collected descendant), and a healthy
 * canary tag for `apply` tests. `retention.keepDays: 0` on the manifest
 * below (see `VALID_MANIFEST_ZERO_GRACE`) so the broken root is old
 * enough to actually land in DELETE once excluded from KEEP_ROOTS. The
 * root's own tag ("0.38") is an ordinary versioned tag, and the windowing
 * algorithm RETAINS it: `0` is the kind's only major, so `keepMajors: 1`
 * below keeps it. What excludes this root from KEEP_ROOTS is
 * `--delete-broken-roots`, which every test using this world passes, and
 * that is precisely the path these tests exercise. Nothing here relies on
 * a per-tag allow-list, which no longer exists.
 */
function brokenRootWorld(): FakeGhcr {
  const fake = new FakeGhcr();
  fake
    .setTag(tag("0.38"), digest("sha256:brokenroot"))
    .setManifest(digest("sha256:brokenroot"), { children: [{ digest: "sha256:missing" }] })
    .setManifest(digest("sha256:missing"), { notFound: true })
    .addVersion(version(1, "sha256:brokenroot", "2020-01-01T00:00:00.000Z", ["0.38"]));
  return fake;
}

const VALID_MANIFEST_ZERO_GRACE = `
version: 1
owner: acme
retention:
  keepMajors: 1
  keepMinors: 1
  keepPatches: 1
  keepDays: 0
packages:
  - match: widget
`;

function baseDeps(fake: FakeGhcr, overrides: Partial<CliDeps> = {}): CliDeps {
  return {
    registry: fake.registryReader(),
    packages: fake.packagesClient(),
    clock: CLOCK,
    ...overrides,
  };
}

describe("parseArgv", () => {
  it("defaults to the plan subcommand", () => {
    const { subcommand } = parseArgv(["--manifest", "x.yaml"]);
    expect(subcommand).toBe("plan");
  });

  it("recognises an explicit validate/plan/apply subcommand", () => {
    expect(parseArgv(["validate"]).subcommand).toBe("validate");
    expect(parseArgv(["plan"]).subcommand).toBe("plan");
    expect(parseArgv(["apply", "--apply"]).subcommand).toBe("apply");
  });

  it("collects repeated --package flags", () => {
    const { args } = parseArgv(["--package", "a", "--package", "b"]);
    expect(args.packages).toEqual(["a", "b"]);
  });

  it("parses --budget/--jobs/--baseline as integers", () => {
    const { args } = parseArgv(["--budget", "50", "--jobs", "2", "--baseline", "0"]);
    expect(args.budget).toBe(50);
    expect(args.jobs).toBe(2);
    expect(args.baseline).toBe(0);
  });

  it("rejects a non-positive --budget/--jobs", () => {
    expect(() => parseArgv(["--budget", "0"])).toThrow(/--budget/);
    expect(() => parseArgv(["--jobs", "-1"])).toThrow(/--jobs/);
  });

  it("sets the --apply boolean flag", () => {
    expect(parseArgv(["apply"]).args.apply).toBe(false);
    expect(parseArgv(["apply", "--apply"]).args.apply).toBe(true);
  });

  it("rejects an unknown flag", () => {
    expect(() => parseArgv(["--bogus"])).toThrow(/unknown flag: --bogus/);
  });

  it("rejects a flag missing its value", () => {
    expect(() => parseArgv(["--manifest"])).toThrow(/missing value for --manifest/);
  });

  it("sets the --delete-broken-roots boolean flag, off by default", () => {
    expect(parseArgv(["plan"]).args.deleteBrokenRoots).toBe(false);
    expect(parseArgv(["plan", "--delete-broken-roots"]).args.deleteBrokenRoots).toBe(true);
    expect(parseArgv(["apply", "--apply", "--delete-broken-roots"]).args.deleteBrokenRoots).toBe(
      true,
    );
  });
});

describe("tokenizeArgs / resolveArgv", () => {
  it("tokenizes quoted and unquoted segments", () => {
    expect(tokenizeArgs(`plan --manifest "some path.yaml"`)).toEqual([
      "plan",
      "--manifest",
      "some path.yaml",
    ]);
  });

  it("resolveArgv falls back to process.argv when INPUT_ARGS is undefined", () => {
    expect(resolveArgv({}, ["plan", "--manifest", "x.yaml"])).toEqual([
      "plan",
      "--manifest",
      "x.yaml",
    ]);
  });

  it("resolveArgv uses INPUT_ARGS when defined and non-empty", () => {
    expect(resolveArgv({ INPUT_ARGS: "validate --manifest x.yaml" }, ["ignored"])).toEqual([
      "validate",
      "--manifest",
      "x.yaml",
    ]);
  });

  it("resolveArgv throws on a defined-but-empty INPUT_ARGS", () => {
    expect(() => resolveArgv({ INPUT_ARGS: "" }, [])).toThrow(/args.*empty/i);
    expect(() => resolveArgv({ INPUT_ARGS: "   " }, [])).toThrow(/args.*empty/i);
  });
});

describe("validate subcommand", () => {
  it("exits 0 on this repository's own dogfood manifest", async () => {
    const repoRoot = path.resolve(import.meta.dirname, "..", "..");
    const exitCode = await runCommand([
      "validate",
      "--manifest",
      path.join(repoRoot, ".ghcr-tidy.yaml"),
    ]);
    expect(exitCode).toBe(0);
  });

  it("exits 0 on a valid manifest", async () => {
    const manifestPath = await writeManifest(VALID_MANIFEST);
    const exitCode = await runCommand(["validate", "--manifest", manifestPath]);
    expect(exitCode).toBe(0);
  });

  it("exits 2 on a manifest with an unknown field", async () => {
    const manifestPath = await writeManifest(
      "version: 1\nowner: acme\npackages: []\nbogus: true\n",
    );
    const exitCode = await runCommand(["validate", "--manifest", manifestPath]);
    expect(exitCode).toBe(2);
  });

  it("exits 2 on a manifest with an invalid version", async () => {
    const manifestPath = await writeManifest("version: 2\nowner: acme\npackages: []\n");
    const exitCode = await runCommand(["validate", "--manifest", manifestPath]);
    expect(exitCode).toBe(2);
  });

  it("exits 2 on a manifest with a duplicate match", async () => {
    const manifestPath = await writeManifest(
      "version: 1\nowner: acme\npackages:\n  - match: widget\n  - match: widget\n",
    );
    const exitCode = await runCommand(["validate", "--manifest", manifestPath]);
    expect(exitCode).toBe(2);
  });

  it("exits 2 on invalid YAML", async () => {
    const manifestPath = await writeManifest("version: [1\n");
    const exitCode = await runCommand(["validate", "--manifest", manifestPath]);
    expect(exitCode).toBe(2);
  });

  it("exits 2 when the manifest file does not exist", async () => {
    const exitCode = await runCommand([
      "validate",
      "--manifest",
      path.join(tmpDir, "missing.yaml"),
    ]);
    expect(exitCode).toBe(2);
  });
});

describe("plan subcommand", () => {
  it("produces the expected human-readable summary and writes a parseable plan with --out", async () => {
    const manifestPath = await writeManifest(VALID_MANIFEST);
    const outPath = path.join(tmpDir, "plan.json");
    const fake = widgetWorld();

    const logs: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      logs.push(String(chunk));
      return true;
    });

    const exitCode = await runCommand(
      ["plan", "--manifest", manifestPath, "--out", outPath],
      baseDeps(fake),
    );
    spy.mockRestore();

    expect(exitCode).toBe(0);
    const output = logs.join("");
    expect(output).toContain("planned 1 package(s)");
    expect(output).toContain("1 version(s) to delete");
    expect(output).toContain("widget");

    const written = await import("node:fs/promises").then((fs) => fs.readFile(outPath, "utf8"));
    const parsed = parsePlan(JSON.parse(written) as unknown);
    expect(parsed.packages).toHaveLength(1);
    expect(parsed.packages[0]?.groups[0]?.root.digest).toBe(digest("sha256:garbage"));
  });

  it("emits a start and finish progress line per package via CliDeps.progress, and never writes them to stdout", async () => {
    const manifestPath = await writeManifest(VALID_MANIFEST);
    const fake = widgetWorld();

    const stdoutLogs: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutLogs.push(String(chunk));
      return true;
    });
    const progressLines: string[] = [];

    const exitCode = await runCommand(
      ["plan", "--manifest", manifestPath],
      baseDeps(fake, { progress: (line) => progressLines.push(line) }),
    );
    stdoutSpy.mockRestore();

    expect(exitCode).toBe(0);
    expect(progressLines.some((l) => /planning widget\.\.\./.test(l))).toBe(true);
    expect(progressLines.some((l) => /widget: .*\(\d+ms\)/.test(l))).toBe(true);
    // Progress must never leak into stdout, which is reserved for the
    // human-readable summary (and is the only output at all when --out
    // is not used).
    expect(stdoutLogs.join("")).not.toMatch(/planning widget/);
  });

  it("is the default subcommand (no subcommand token)", async () => {
    const manifestPath = await writeManifest(VALID_MANIFEST);
    const fake = widgetWorld();
    const exitCode = await runCommand(["--manifest", manifestPath], baseDeps(fake));
    expect(exitCode).toBe(0);
  });

  it("restricts to the packages named by --package, and exits 2 if one matches nothing", async () => {
    const manifestPath = await writeManifest(
      "version: 1\nowner: acme\npackages:\n  - match: widget\n  - match: gadget\n",
    );
    const fake = widgetWorld();
    fake
      .setTag(tag("latest"), digest("sha256:live")) // gadget shares the same fake world's tags/resolve
      .setManifest(digest("sha256:live"), {});

    const exitOk = await runCommand(
      ["plan", "--manifest", manifestPath, "--package", "widget"],
      baseDeps(fake),
    );
    expect(exitOk).toBe(0);

    const exitBad = await runCommand(
      ["plan", "--manifest", manifestPath, "--package", "does-not-exist"],
      baseDeps(fake),
    );
    expect(exitBad).toBe(2);
  });

  it("exits 1 (findings) when a package is skipped fail-closed", async () => {
    const manifestPath = await writeManifest(VALID_MANIFEST);
    const fake = new FakeGhcr();
    fake.setTag(tag("latest"), digest("sha256:live"));
    // No manifest registered for sha256:live — it will 404 on resolve, failing the package closed.
    // A non-empty version listing is required too: planPackage short-circuits
    // to "nothing-to-do" (never touching the registry at all) when the
    // Packages API reports zero versions — see plan.ts's first check.
    fake.addVersion(version(1, "sha256:live", "2026-09-01T00:00:00.000Z"));

    const exitCode = await runCommand(["plan", "--manifest", manifestPath], baseDeps(fake));
    expect(exitCode).toBe(1);
  });

  it("--delete-broken-roots: plan still reports SKIPPED (not-found) without the flag, and identifies the broken root without deleting anything with it", async () => {
    const manifestPath = await writeManifest(VALID_MANIFEST_ZERO_GRACE);

    const withoutFlag = await runCommand(
      ["plan", "--manifest", manifestPath],
      baseDeps(brokenRootWorld()),
    );
    expect(withoutFlag).toBe(1);

    const logs: string[] = [];
    const withFlag = await runCommand(
      ["plan", "--manifest", manifestPath, "--delete-broken-roots"],
      baseDeps(brokenRootWorld(), {
        progress: (line) => logs.push(line),
      }),
    );
    // A "planned" outcome (broken root identified and swept into DELETE,
    // nothing left "skipped") is exit 0, not 1 — proving the whole
    // package is no longer fail-closed once the broken root is excluded.
    expect(withFlag).toBe(0);
    expect(logs.join("")).toContain("broken root(s)");
  });

  it("exits 1 (findings), not 3, when listTags itself fails — the package is SKIPPED, not the whole run aborted", async () => {
    // This was the production incident: `listTags` throwing (a real
    // `network-error`, or anything else — see `roots.ts`'s doc) used to
    // propagate all the way out of `runCommand` uncaught, aborting the
    // ENTIRE plan/apply over one package's transient registry error while
    // sibling packages already in flight under `--jobs` kept running to
    // completion in the background regardless of the process having
    // already reported its result. `buildLiveRoots` now catches this and
    // fails only the one affected package closed, like any other
    // fail-closed reason.
    const manifestPath = await writeManifest(VALID_MANIFEST);
    const throwingRegistry: RegistryReader = {
      listTags: () => Promise.reject(new Error("simulated network failure")),
      resolve: () => Promise.reject(new Error("unused")),
    };
    // Same reasoning as above: a non-empty version listing is required for
    // planPackage to ever reach the registry at all.
    const fakePackages = new FakeGhcr();
    fakePackages.addVersion(version(1, "sha256:live", "2026-09-01T00:00:00.000Z"));
    const exitCode = await runCommand(["plan", "--manifest", manifestPath], {
      registry: throwingRegistry,
      packages: fakePackages.packagesClient(),
      clock: CLOCK,
    });
    expect(exitCode).toBe(1);
  });

  it("exits 3 (infrastructure) when the registry throws an unexpected error that is NOT a tag-listing failure", async () => {
    // `resolve()` throwing (as opposed to returning a typed non-success
    // result, which is all a real adapter ever does) is not a case
    // `roots.ts`/`reachability.ts` catch — it is exactly the "truly
    // unexpected" case `runCommand`'s outer catch exists for.
    const manifestPath = await writeManifest(VALID_MANIFEST);
    const throwingRegistry: RegistryReader = {
      listTags: () => Promise.resolve([tag("latest")]),
      resolve: () => Promise.reject(new Error("simulated unexpected failure")),
    };
    const fakePackages = new FakeGhcr();
    fakePackages.addVersion(version(1, "sha256:live", "2026-09-01T00:00:00.000Z"));
    const exitCode = await runCommand(["plan", "--manifest", manifestPath], {
      registry: throwingRegistry,
      packages: fakePackages.packagesClient(),
      clock: CLOCK,
    });
    expect(exitCode).toBe(3);
  });

  it("exits 2 when GITHUB_TOKEN is not set and no registry/packages deps are supplied", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    const manifestPath = await writeManifest(VALID_MANIFEST);
    const exitCode = await runCommand(["plan", "--manifest", manifestPath]);
    expect(exitCode).toBe(2);
  });
});

describe("apply subcommand", () => {
  it("refuses without --apply and mutates nothing", async () => {
    const manifestPath = await writeManifest(VALID_MANIFEST);
    const fake = widgetWorld();
    const { mutator, attemptedVersionIds } = fake.mutator();
    const { breaker } = memoryBreaker();

    const exitCode = await runCommand(
      [
        "apply",
        "--manifest",
        manifestPath,
        "--budget",
        "10",
        "--out",
        path.join(tmpDir, "plan.json"),
      ],
      baseDeps(fake, { mutator, breaker }),
    );

    expect(exitCode).toBe(2);
    expect(attemptedVersionIds).toEqual([]);
  });

  it("exits 2 and mutates nothing when no breaker is configured", async () => {
    vi.stubEnv("GITHUB_TOKEN", "dummy-token-for-octokit-construction-only");
    vi.stubEnv("GITHUB_REPOSITORY", "");
    const manifestPath = await writeManifest(VALID_MANIFEST);
    const fake = widgetWorld();
    const { mutator, attemptedVersionIds } = fake.mutator();

    const exitCode = await runCommand(
      [
        "apply",
        "--apply",
        "--manifest",
        manifestPath,
        "--budget",
        "10",
        "--out",
        path.join(tmpDir, "plan.json"),
        "--canary-package",
        "canary-pkg",
        "--canary-tag",
        "canary",
      ],
      baseDeps(fake, { mutator }),
    );

    expect(exitCode).toBe(2);
    expect(attemptedVersionIds).toEqual([]);
  });

  it("exits 2 when --budget is missing", async () => {
    const manifestPath = await writeManifest(VALID_MANIFEST);
    const fake = widgetWorld();
    const { mutator } = fake.mutator();
    const { breaker } = memoryBreaker();

    const exitCode = await runCommand(
      ["apply", "--apply", "--manifest", manifestPath, "--out", path.join(tmpDir, "plan.json")],
      baseDeps(fake, { mutator, breaker }),
    );
    expect(exitCode).toBe(2);
  });

  it("exits 2 when --out is missing", async () => {
    const manifestPath = await writeManifest(VALID_MANIFEST);
    const fake = widgetWorld();
    const { mutator } = fake.mutator();
    const { breaker } = memoryBreaker();

    const exitCode = await runCommand(
      ["apply", "--apply", "--manifest", manifestPath, "--budget", "10"],
      baseDeps(fake, { mutator, breaker }),
    );
    expect(exitCode).toBe(2);
  });

  it("exits 2 when the plan has work but no canary is configured", async () => {
    const manifestPath = await writeManifest(VALID_MANIFEST);
    const fake = widgetWorld();
    const { mutator, attemptedVersionIds } = fake.mutator();
    const { breaker } = memoryBreaker();

    const exitCode = await runCommand(
      [
        "apply",
        "--apply",
        "--manifest",
        manifestPath,
        "--budget",
        "10",
        "--out",
        path.join(tmpDir, "plan.json"),
      ],
      baseDeps(fake, { mutator, breaker }),
    );

    expect(exitCode).toBe(2);
    expect(attemptedVersionIds).toEqual([]);
  });

  it("exits 0 on a clean apply with a healthy canary, journal, and breaker", async () => {
    const manifestPath = await writeManifest(VALID_MANIFEST);
    const fake = widgetWorld();
    fake.setTag(tag("canary"), digest("sha256:canary")).setManifest(digest("sha256:canary"), {});
    const { mutator, deletedVersionIds } = fake.mutator();
    const { breaker, trips } = memoryBreaker();
    const { journal, entries } = memoryJournal(CLOCK);

    const exitCode = await runCommand(
      [
        "apply",
        "--apply",
        "--manifest",
        manifestPath,
        "--budget",
        "10",
        "--out",
        path.join(tmpDir, "plan.json"),
        "--canary-package",
        "widget",
        "--canary-tag",
        "canary",
      ],
      baseDeps(fake, { mutator, breaker, journal }),
    );

    expect(exitCode).toBe(0);
    expect(deletedVersionIds).toEqual([2]);
    expect(trips).toEqual([]);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("wires the shipped null expiry producer with no observable effect: a clean apply's summary never mentions expiry at all (issue #22, AC 8)", async () => {
    const manifestPath = await writeManifest(VALID_MANIFEST);
    const fake = widgetWorld();
    fake.setTag(tag("canary"), digest("sha256:canary")).setManifest(digest("sha256:canary"), {});
    const { mutator, deletedVersionIds } = fake.mutator();
    const { breaker, trips } = memoryBreaker();

    const logs: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      logs.push(String(chunk));
      return true;
    });

    const exitCode = await runCommand(
      [
        "apply",
        "--apply",
        "--manifest",
        manifestPath,
        "--budget",
        "10",
        "--out",
        path.join(tmpDir, "plan.json"),
        "--canary-package",
        "widget",
        "--canary-tag",
        "canary",
      ],
      baseDeps(fake, { mutator, breaker }),
    );
    spy.mockRestore();

    expect(exitCode).toBe(0);
    expect(deletedVersionIds).toEqual([2]);
    expect(trips).toEqual([]);
    // The shipped producer always returns the empty set, so no package
    // can ever have an expired or notExpired finding, and the run
    // summary this test's own byte-identical guarantee rests on must
    // never mention either.
    const output = logs.join("");
    expect(output).not.toMatch(/expired/i);
  });

  it("exits 1 (findings) when a deletion is abandoned (registry rejects part of the plan)", async () => {
    const manifestPath = await writeManifest(VALID_MANIFEST);
    const fake = widgetWorld();
    fake.setTag(tag("canary"), digest("sha256:canary")).setManifest(digest("sha256:canary"), {});
    fake.setDeleteFault(2, { kind: "error", status: 500 });
    const { mutator } = fake.mutator();
    const { breaker } = memoryBreaker();

    const exitCode = await runCommand(
      [
        "apply",
        "--apply",
        "--manifest",
        manifestPath,
        "--budget",
        "10",
        "--out",
        path.join(tmpDir, "plan.json"),
        "--canary-package",
        "widget",
        "--canary-tag",
        "canary",
      ],
      baseDeps(fake, { mutator, breaker }),
    );

    expect(exitCode).toBe(1);
  });

  it("exits 4 (safety) when the breaker is already tripped, and mutates nothing", async () => {
    const manifestPath = await writeManifest(VALID_MANIFEST);
    const fake = widgetWorld();
    fake.setTag(tag("canary"), digest("sha256:canary")).setManifest(digest("sha256:canary"), {});
    const { mutator, attemptedVersionIds } = fake.mutator();
    const { breaker } = memoryBreaker({
      issueNumber: 99,
      issueUrl: "https://github.com/acme/repo/issues/99",
    });

    const exitCode = await runCommand(
      [
        "apply",
        "--apply",
        "--manifest",
        manifestPath,
        "--budget",
        "10",
        "--out",
        path.join(tmpDir, "plan.json"),
        "--canary-package",
        "widget",
        "--canary-tag",
        "canary",
      ],
      baseDeps(fake, { mutator, breaker }),
    );

    expect(exitCode).toBe(4);
    expect(attemptedVersionIds).toEqual([]);
  });

  it("exits 4 (safety) when the volume alarm refuses the plan", async () => {
    const manifestPath = await writeManifest(VALID_MANIFEST);
    const fake = widgetWorld();
    fake.setTag(tag("canary"), digest("sha256:canary")).setManifest(digest("sha256:canary"), {});
    const { mutator, attemptedVersionIds } = fake.mutator();
    const { breaker } = memoryBreaker();

    const exitCode = await runCommand(
      [
        "apply",
        "--apply",
        "--manifest",
        manifestPath,
        "--budget",
        "10",
        "--out",
        path.join(tmpDir, "plan.json"),
        "--canary-package",
        "widget",
        "--canary-tag",
        "canary",
        "--baseline",
        "0",
      ],
      baseDeps(fake, { mutator, breaker }),
    );

    expect(exitCode).toBe(4);
    expect(attemptedVersionIds).toEqual([]);
  });

  it("uses the manifest's canary when no --canary-package/--canary-tag flags are given", async () => {
    const manifestPath = await writeManifest(
      "version: 1\nowner: acme\npackages:\n  - match: widget\ncanary:\n  package: widget\n  tag: canary\n",
    );
    const fake = widgetWorld();
    fake.setTag(tag("canary"), digest("sha256:canary")).setManifest(digest("sha256:canary"), {});
    const { mutator, deletedVersionIds } = fake.mutator();
    const { breaker, trips } = memoryBreaker();

    const exitCode = await runCommand(
      [
        "apply",
        "--apply",
        "--manifest",
        manifestPath,
        "--budget",
        "10",
        "--out",
        path.join(tmpDir, "plan.json"),
      ],
      baseDeps(fake, { mutator, breaker }),
    );

    expect(exitCode).toBe(0);
    expect(deletedVersionIds).toEqual([2]);
    expect(trips).toEqual([]);
  });

  it("--canary-package/--canary-tag OVERRIDE a manifest canary that would otherwise fail", async () => {
    // The manifest's own canary tag does not resolve to anything (no
    // matching setTag/setManifest below) — if the manifest canary were
    // used instead of the CLI override, verification would fail (exit 4).
    const manifestPath = await writeManifest(
      "version: 1\nowner: acme\npackages:\n  - match: widget\ncanary:\n  package: widget\n  tag: broken-canary\n",
    );
    const fake = widgetWorld();
    fake.setTag(tag("canary"), digest("sha256:canary")).setManifest(digest("sha256:canary"), {});
    const { mutator, deletedVersionIds } = fake.mutator();
    const { breaker, trips } = memoryBreaker();

    const exitCode = await runCommand(
      [
        "apply",
        "--apply",
        "--manifest",
        manifestPath,
        "--budget",
        "10",
        "--out",
        path.join(tmpDir, "plan.json"),
        "--canary-package",
        "widget",
        "--canary-tag",
        "canary",
      ],
      baseDeps(fake, { mutator, breaker }),
    );

    expect(exitCode).toBe(0);
    expect(deletedVersionIds).toEqual([2]);
    expect(trips).toEqual([]);
  });

  it("--delete-broken-roots: the flag ALONE, without --apply, deletes nothing (still requires the two independent gestures)", async () => {
    const manifestPath = await writeManifest(VALID_MANIFEST_ZERO_GRACE);
    const fake = brokenRootWorld();
    const { mutator, attemptedVersionIds } = fake.mutator();
    const { breaker } = memoryBreaker();

    const exitCode = await runCommand(
      [
        "apply",
        // Deliberately NO --apply here.
        "--delete-broken-roots",
        "--manifest",
        manifestPath,
        "--budget",
        "10",
        "--out",
        path.join(tmpDir, "plan.json"),
      ],
      baseDeps(fake, { mutator, breaker }),
    );

    expect(exitCode).toBe(2);
    expect(attemptedVersionIds).toEqual([]);
  });

  it("--delete-broken-roots requires --apply too: apply --apply alone (mode off) leaves the broken root SKIPPED and undeleted", async () => {
    const manifestPath = await writeManifest(VALID_MANIFEST_ZERO_GRACE);
    const fake = brokenRootWorld();
    fake.setTag(tag("canary"), digest("sha256:canary")).setManifest(digest("sha256:canary"), {});
    const { mutator, attemptedVersionIds } = fake.mutator();
    const { breaker } = memoryBreaker();

    const exitCode = await runCommand(
      [
        "apply",
        "--apply",
        "--manifest",
        manifestPath,
        "--budget",
        "10",
        "--out",
        path.join(tmpDir, "plan.json"),
        "--canary-package",
        "widget",
        "--canary-tag",
        "canary",
      ],
      baseDeps(fake, { mutator, breaker }),
    );

    // Findings (1): the package is skipped fail-closed, nothing to apply
    // to, so nothing is attempted at all — not a zero-mutation safety
    // trip, since there was no work in the (empty) plan.
    expect(exitCode).toBe(1);
    expect(attemptedVersionIds).toEqual([]);
  });

  it("--apply --delete-broken-roots: BOTH gestures together actually delete the proven-broken root, with the breaker/canary/journal machinery still fully in effect", async () => {
    const manifestPath = await writeManifest(VALID_MANIFEST_ZERO_GRACE);
    const fake = brokenRootWorld();
    fake.setTag(tag("canary"), digest("sha256:canary")).setManifest(digest("sha256:canary"), {});
    const { mutator, deletedVersionIds } = fake.mutator();
    const { breaker, trips } = memoryBreaker();
    const { journal, entries } = memoryJournal(CLOCK);

    const exitCode = await runCommand(
      [
        "apply",
        "--apply",
        "--delete-broken-roots",
        "--manifest",
        manifestPath,
        "--budget",
        "10",
        "--out",
        path.join(tmpDir, "plan.json"),
        "--canary-package",
        "widget",
        "--canary-tag",
        "canary",
      ],
      baseDeps(fake, { mutator, breaker, journal }),
    );

    expect(exitCode).toBe(0);
    expect(deletedVersionIds).toEqual([1]);
    expect(trips).toEqual([]);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("--apply --delete-broken-roots: an already-tripped breaker still refuses to delete the broken root", async () => {
    const manifestPath = await writeManifest(VALID_MANIFEST_ZERO_GRACE);
    const fake = brokenRootWorld();
    fake.setTag(tag("canary"), digest("sha256:canary")).setManifest(digest("sha256:canary"), {});
    const { mutator, attemptedVersionIds } = fake.mutator();
    const { breaker } = memoryBreaker({
      issueNumber: 99,
      issueUrl: "https://github.com/acme/repo/issues/99",
    });

    const exitCode = await runCommand(
      [
        "apply",
        "--apply",
        "--delete-broken-roots",
        "--manifest",
        manifestPath,
        "--budget",
        "10",
        "--out",
        path.join(tmpDir, "plan.json"),
        "--canary-package",
        "widget",
        "--canary-tag",
        "canary",
      ],
      baseDeps(fake, { mutator, breaker }),
    );

    expect(exitCode).toBe(4);
    expect(attemptedVersionIds).toEqual([]);
  });

  it("--apply --delete-broken-roots: budget too small to cover the group leaves it skipped-budget, mutating nothing (budget gating still applies)", async () => {
    // The broken root's group has TWO members (root + a healthy but
    // otherwise-unreferenced sibling — see the parents-first test below
    // for the exact fixture) so a budget of 1 cannot cover the whole
    // group and the group is skipped in full rather than partially spent.
    const manifestPath = await writeManifest(VALID_MANIFEST_ZERO_GRACE);
    const fake = new FakeGhcr();
    fake
      .setTag(tag("0.38"), digest("sha256:brokenroot"))
      .setManifest(digest("sha256:brokenroot"), {
        children: [{ digest: "sha256:missing" }, { digest: "sha256:sibling" }],
      })
      .setManifest(digest("sha256:missing"), { notFound: true })
      .setManifest(digest("sha256:sibling"), {})
      .addVersion(version(1, "sha256:brokenroot", "2020-01-01T00:00:00.000Z", ["0.38"]))
      .addVersion(version(2, "sha256:sibling", "2020-01-01T00:00:00.000Z"))
      .setTag(tag("canary"), digest("sha256:canary"))
      .setManifest(digest("sha256:canary"), {});
    const { mutator, attemptedVersionIds } = fake.mutator();
    const { breaker } = memoryBreaker();

    const exitCode = await runCommand(
      [
        "apply",
        "--apply",
        "--delete-broken-roots",
        "--manifest",
        manifestPath,
        "--budget",
        "1",
        "--out",
        path.join(tmpDir, "plan.json"),
        "--canary-package",
        "widget",
        "--canary-tag",
        "canary",
      ],
      baseDeps(fake, { mutator, breaker }),
    );

    // Zero-mutation safety guard: the plan had a group but nothing was
    // ever attempted (the whole group was skipped for budget reasons).
    expect(exitCode).toBe(4);
    expect(attemptedVersionIds).toEqual([]);
  });

  it("--apply --delete-broken-roots: a failed tagged root delete abandons the rest of that group (the flutter-rfw-style parents-first rule still holds)", async () => {
    // The broken root here has a SECOND child, "sha256:sibling", that is
    // NOT itself missing (it resolves fine) but is otherwise unreferenced
    // and unprotected — so it also lands in DELETE, in the SAME group as
    // the broken root (root is always members[0]). Faulting the root's
    // own delete must abandon "sibling" too, never attempting it.
    const manifestPath = await writeManifest(VALID_MANIFEST_ZERO_GRACE);
    const fake = new FakeGhcr();
    fake
      .setTag(tag("0.38"), digest("sha256:brokenroot"))
      .setManifest(digest("sha256:brokenroot"), {
        children: [{ digest: "sha256:missing" }, { digest: "sha256:sibling" }],
      })
      .setManifest(digest("sha256:missing"), { notFound: true })
      .setManifest(digest("sha256:sibling"), {})
      .addVersion(version(1, "sha256:brokenroot", "2020-01-01T00:00:00.000Z", ["0.38"]))
      .addVersion(version(2, "sha256:sibling", "2020-01-01T00:00:00.000Z"))
      .setTag(tag("canary"), digest("sha256:canary"))
      .setManifest(digest("sha256:canary"), {});
    fake.setDeleteFault(1, { kind: "error", status: 500 });
    const { mutator, deletedVersionIds, attemptedVersionIds } = fake.mutator();
    const { breaker } = memoryBreaker();

    const exitCode = await runCommand(
      [
        "apply",
        "--apply",
        "--delete-broken-roots",
        "--manifest",
        manifestPath,
        "--budget",
        "10",
        "--out",
        path.join(tmpDir, "plan.json"),
        "--canary-package",
        "widget",
        "--canary-tag",
        "canary",
      ],
      baseDeps(fake, { mutator, breaker }),
    );

    // Findings (1): the root's own delete failed, so the group was
    // abandoned — "sibling" (version id 2) must never have been attempted.
    expect(exitCode).toBe(1);
    expect(attemptedVersionIds).toEqual([1]);
    expect(deletedVersionIds).toEqual([]);
  });

  it("skips the canary requirement when the plan has no work to do (empty packages)", async () => {
    const manifestPath = await writeManifest("version: 1\nowner: acme\npackages: []\n");
    const fake = new FakeGhcr();
    const { mutator, attemptedVersionIds } = fake.mutator();
    const { breaker } = memoryBreaker();

    const exitCode = await runCommand(
      [
        "apply",
        "--apply",
        "--manifest",
        manifestPath,
        "--budget",
        "10",
        "--out",
        path.join(tmpDir, "plan.json"),
      ],
      baseDeps(fake, { mutator, breaker }),
    );

    expect(exitCode).toBe(0);
    expect(attemptedVersionIds).toEqual([]);
  });
});

describe("buildPackageTokenMap", () => {
  const owner = "acme";
  const buildcache = packageName("baseimages/buildcache");
  const base = packageName("baseimages/base");

  function entryFor(name: ReturnType<typeof packageName>): ManifestPackageEntry {
    return { match: name };
  }

  it("registers the canary's package even when --package scopes selection to a DIFFERENT package — the exact regression that aborted the first real apply", () => {
    // `--package baseimages/buildcache` selects only `buildcache`; the
    // canary lives in `base`, which is NOT among `entries`. Before the
    // fix, `base`'s registry path was absent from this map entirely,
    // so the token lookup inside `buildRegistryAdapters`'s `rawRegistry`
    // threw immediately and the canary check was indistinguishable from
    // a broken registry.
    const map = buildPackageTokenMap(owner, [entryFor(buildcache)], base);

    expect(map.get(registryPathFor(owner, base))).toBe(base);
    expect(map.get(registryPathFor(owner, buildcache))).toBe(buildcache);
  });

  it("still resolves the canary's package on an unscoped run (every package, including the canary's, selected)", () => {
    // The accidental-working case: no --package filter, so every
    // configured entry (including the canary's own package) is already
    // selected — must not regress.
    const map = buildPackageTokenMap(owner, [entryFor(buildcache), entryFor(base)], base);

    expect(map.get(registryPathFor(owner, base))).toBe(base);
    expect(map.get(registryPathFor(owner, buildcache))).toBe(buildcache);
  });

  it("registers nothing extra when no canary package is given", () => {
    const map = buildPackageTokenMap(owner, [entryFor(buildcache)], undefined);

    expect(map.size).toBe(1);
    expect(map.get(registryPathFor(owner, buildcache))).toBe(buildcache);
    expect(map.get(registryPathFor(owner, base))).toBeUndefined();
  });
});

describe("resolveBreakerToken — never let the delete:packages PAT double as the issues token", () => {
  it("prefers --breaker-token over everything else", () => {
    expect(
      resolveBreakerToken(
        { breakerToken: "from-flag" },
        { GHCR_TIDY_BREAKER_TOKEN: "from-env" },
        "registry-token",
      ),
    ).toBe("from-flag");
  });

  it("falls back to GHCR_TIDY_BREAKER_TOKEN when no flag is given", () => {
    expect(resolveBreakerToken({}, { GHCR_TIDY_BREAKER_TOKEN: "from-env" }, "registry-token")).toBe(
      "from-env",
    );
  });

  it("falls back to the registry token as a last resort when neither is configured — the pre-fix (and still-supported single-token) behaviour", () => {
    expect(resolveBreakerToken({}, {}, "registry-token")).toBe("registry-token");
  });
});

describe("decorateRegistry: verification must not replay planning's cache", () => {
  /**
   * Regression coverage for the bug where `buildRegistryAdapters` handed
   * the SAME cached reader to both `runPlanning` and
   * `VerificationOptions.registry`. `resolve-cache.ts` never invalidates,
   * so a digest already resolved during planning would be served the
   * same, pre-deletion answer forever after, and post-apply verification
   * (the canary and both snapshots) could never observe damage it should
   * be catching. This test goes through the real
   * `createCachingRegistryReader`/`createLimiter` decorator stack (via
   * `decorateRegistry`, the exact function `buildRegistryAdapters` calls)
   * instead of a bare fake reader, so it actually exercises the wiring
   * this bug lived in.
   */
  it("planningRegistry keeps serving a stale resolution while verificationRegistry observes the registry's current state", async () => {
    const path = registryPathFor("acme", packageName("widget"));
    const fake = new FakeGhcr();
    fake.setTag(tag("v1"), digest("sha256:d1")).setManifest(digest("sha256:d1"), {});

    const { planningRegistry, verificationRegistry } = decorateRegistry(fake.registryReader(), 4);

    // "Planning" resolves the tag once, populating the cache.
    const planned = await planningRegistry.resolve(path, tag("v1"));
    expect(planned).toMatchObject({ status: "success", digest: digest("sha256:d1") });

    // The registry changes between planning and verification (e.g. the
    // manifest this tag pointed at was deleted during apply).
    fake.setManifest(digest("sha256:d1"), { notFound: true });

    // planningRegistry replays its cached answer: this is by design (see
    // `resolve-cache.ts`'s doc), it is what makes it unsafe for
    // verification specifically.
    const rePlanned = await planningRegistry.resolve(path, tag("v1"));
    expect(rePlanned).toMatchObject({ status: "success", digest: digest("sha256:d1") });

    // verificationRegistry, the reader `buildRegistryAdapters` now wires
    // to `VerificationOptions.registry`, is NOT cached and observes the
    // change.
    const verified = await verificationRegistry.resolve(path, tag("v1"));
    expect(verified).toMatchObject({ status: "not-found" });
  });

  it("still shares one rate limiter between planningRegistry and verificationRegistry, so verification stays bounded by --jobs", async () => {
    const path = registryPathFor("acme", packageName("widget"));
    const fake = new FakeGhcr();
    for (let i = 0; i < 5; i += 1) {
      fake.setTag(tag(`t${String(i)}`), digest(`sha256:d${String(i)}`));
      fake.setManifest(digest(`sha256:d${String(i)}`), {});
    }

    let concurrent = 0;
    let maxConcurrent = 0;
    const raw = fake.registryReader();
    const instrumented: RegistryReader = {
      listTags: (p) => raw.listTags(p),
      resolve: async (p, ref) => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        const result = await raw.resolve(p, ref);
        concurrent -= 1;
        return result;
      },
    };

    const { planningRegistry, verificationRegistry } = decorateRegistry(instrumented, 2);
    await Promise.all([
      ...[0, 1].map((i) => planningRegistry.resolve(path, tag(`t${String(i)}`))),
      ...[2, 3, 4].map((i) => verificationRegistry.resolve(path, tag(`t${String(i)}`))),
    ]);

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });
});
