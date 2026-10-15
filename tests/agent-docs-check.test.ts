import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// Runs agent-docs-check/check.mjs as a child process against the fixture trees
// in tests/fixtures/agent-docs-check/<case>/. Agent tools treat a real
// AGENTS.md, CLAUDE.md or .claude/ directory as live instructions, so the
// fixtures store them with a `.fixture` suffix. Each run first copies the
// fixture into a temp dir outside any git work tree, stripping the suffix,
// and git is told to ignore everything above it via GIT_CEILING_DIRECTORIES:
// the check then takes its directory-walk branch.

const root = join(__dirname, "..");
const script = join(root, "agent-docs-check", "check.mjs");
const fixtures = join(__dirname, "fixtures", "agent-docs-check");
const fixtureSuffix = ".fixture";
const tmpBase = join(tmpdir(), "agent-docs-check-tests");

/** Copy a fixture tree to dest, dropping the .fixture suffix from every path segment; symlinks stay verbatim. */
function copyFixture(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, e.name);
    const name = e.name.endsWith(fixtureSuffix) ? e.name.slice(0, -fixtureSuffix.length) : e.name;
    const to = join(dest, name);
    if (e.isSymbolicLink()) symlinkSync(readlinkSync(from), to);
    else if (e.isDirectory()) copyFixture(from, to);
    else copyFileSync(from, to);
  }
}

/**
 * Materialise a fixture into a fresh temp dir, run fn on it, always remove it.
 * The checked root is `<tmp>/<fixture>`: with no git origin the check names the
 * repo under check after the root's basename, so a fixture can refer to itself
 * as `~/.pyck/<fixture>/...` deterministically.
 */
function withFixture<T>(fixture: string, fn: (dir: string) => T): T {
  mkdirSync(tmpBase, { recursive: true });
  const tmp = mkdtempSync(join(tmpBase, "fixture-"));
  try {
    const dir = join(tmp, fixture);
    copyFixture(join(fixtures, fixture), dir);
    return fn(dir);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function run(
  fixture: string,
  args: string[] = [],
  env: NodeJS.ProcessEnv = {},
): { code: number | null; out: string } {
  return withFixture(fixture, (dir) => {
    const res = spawnSync("node", [script, dir, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_ACTIONS: "",
        GIT_CEILING_DIRECTORIES: tmpBase,
        PYCK_HOME: join(tmpBase, "no-pyck-home"),
        ...env,
      },
    });
    return { code: res.status, out: `${res.stdout}${res.stderr}` };
  });
}

function expectPass(fixture: string, args: string[] = [], env: NodeJS.ProcessEnv = {}): void {
  const { code, out } = run(fixture, args, env);
  expect(out).toMatch(/0 error\(s\)/);
  expect(code).toBe(0);
}

function expectFail(
  fixture: string,
  messages: (string | RegExp)[],
  args: string[] = [],
  env: NodeJS.ProcessEnv = {},
): void {
  const { code, out } = run(fixture, args, env);
  expect(code).toBe(1);
  for (const m of messages) {
    if (typeof m === "string") expect(out).toContain(m);
    else expect(out).toMatch(m);
  }
}

describe("agent-docs-check", () => {
  describe("rule 1: no CLAUDE.md", () => {
    it("passes without CLAUDE.md", () => expectPass("claude-md-pass"));
    it("fails on every CLAUDE.md, at any depth", () => {
      expectFail("claude-md-fail", [
        /CLAUDE\.md:1: no-claude-md: CLAUDE\.md must not exist; delete it/,
        /sub\/CLAUDE\.md:1: no-claude-md/,
        "2 error(s)",
      ]);
    });
    it("skips a CLAUDE.md under a fixtures/ or testdata/ segment", () => {
      const base = tmpBase;
      mkdirSync(base, { recursive: true });
      const tmp = mkdtempSync(join(base, "claude-"));
      try {
        writeFileSync(join(tmp, "AGENTS.md"), "# Agents\n");
        for (const d of ["tests/fixtures/x", "pkg/testdata"]) {
          mkdirSync(join(tmp, d), { recursive: true });
          writeFileSync(join(tmp, d, "CLAUDE.md"), "# fixture\n");
        }
        writeFileSync(join(tmp, "CLAUDE.md"), "# real\n");
        const res = spawnSync("node", [script, tmp], {
          encoding: "utf8",
          env: { ...process.env, GITHUB_ACTIONS: "", GIT_CEILING_DIRECTORIES: base },
        });
        const out = `${res.stdout}${res.stderr}`;
        expect(out).toContain("1 error(s)");
        expect(out).toMatch(/\/CLAUDE\.md:1: no-claude-md/);
        expect(out).not.toContain("fixtures");
        expect(out).not.toContain("testdata");
        expect(res.status).toBe(1);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe("rule 2: AGENTS.md budget", () => {
    it("passes at the repo limit, root and nested", () => expectPass("agents-budget-pass"));
    it("fails over 60 lines", () =>
      expectFail("agents-budget-lines-fail", ["has 61 lines, limit is 60"]));
    it("fails over 4096 bytes", () =>
      expectFail("agents-budget-bytes-fail", [/is \d+ bytes, limit is 4096/]));
    it("applies the repo limit to nested AGENTS.md", () =>
      expectFail("agents-budget-nested-fail", [
        "pkg/AGENTS.md:61",
        "nested AGENTS.md has 61 lines, limit is 60",
      ]));
    it("passes the central profile at 40 lines", () =>
      expectPass("agents-budget-central-pass", ["--profile", "central"]));
    it("fails the central profile over 40 lines", () =>
      expectFail(
        "agents-budget-central-fail",
        ["has 41 lines, limit is 40", "(central)"],
        ["--profile", "central"],
      ));
    it("fails the central profile over 3072 bytes", () =>
      expectFail(
        "agents-budget-central-bytes-fail",
        [/is \d+ bytes, limit is 3072/],
        ["--profile=central"],
      ));
    it("accepts the same central-failing file under the repo profile", () =>
      expectPass("agents-budget-central-fail"));
    it("warns, without failing, when the root AGENTS.md is missing", () => {
      const { code, out } = run("agents-missing-root");
      expect(out).toContain("warning: missing root AGENTS.md");
      expect(out).toContain("0 error(s), 1 warning(s)");
      expect(code).toBe(0);
    });
  });

  describe("rule 3: agent files max 200 lines", () => {
    it("passes at 200 lines (SKILL.md, CODING_STANDARDS.md)", () => expectPass("size-agent-pass"));
    it("has no limit for docs, ADRs or CONTRIBUTING.md", () => expectPass("size-docs-pass"));
    it.each([
      ["size-skill-fail", ".claude/skills/demo/SKILL.md:201"],
      ["size-coding-fail", "pkg/CODING_STANDARDS.md:201"],
      ["size-skillfile-fail", ".agents/skills/demo/notes.txt:201"],
    ])("fails over 200 lines: %s", (fixture, where) =>
      expectFail(fixture, [where, "agent-file-size:", "limit is 200"]),
    );
    it("follows a skill-dir symlink, reports the link and names the target", () =>
      expectFail("size-symlink-fail", [
        ".claude/skills/demo/std.md:201: agent-file-size:",
        "(symlink to docs/std.md)",
      ]));
  });

  describe("broken-symlink", () => {
    const base = tmpBase;
    const dirs: string[] = [];
    afterEach(() => {
      for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    });

    /** Temp tree (no git) with AGENTS.md, a docs/std.md and the given symlinks (path -> target). */
    function linkRun(links: Record<string, string>): { code: number | null; out: string } {
      mkdirSync(base, { recursive: true });
      const tmp = mkdtempSync(join(base, "link-"));
      dirs.push(tmp);
      writeFileSync(join(tmp, "AGENTS.md"), "# Agents\n");
      mkdirSync(join(tmp, "docs"));
      writeFileSync(join(tmp, "docs", "std.md"), "# Std\n");
      for (const [rel, target] of Object.entries(links)) {
        mkdirSync(dirname(join(tmp, rel)), { recursive: true });
        symlinkSync(target, join(tmp, rel));
      }
      const res = spawnSync("node", [script, tmp], {
        encoding: "utf8",
        env: { ...process.env, GITHUB_ACTIONS: "", GIT_CEILING_DIRECTORIES: base },
      });
      return { code: res.status, out: `${res.stdout}${res.stderr}` };
    }

    it("errors on a dangling symlink in a skill dir, naming the link and its target", () => {
      const { code, out } = linkRun({
        ".claude/skills/demo/std.md": "../../../docs/renamed.md",
      });
      expect(out).toContain(
        ".claude/skills/demo/std.md:1: broken-symlink: .claude/skills/demo/std.md points to ../../../docs/renamed.md, which does not exist",
      );
      expect(out).toContain("1 error(s)");
      expect(code).toBe(1);
    });
    it("errors on a dangling CODING_STANDARDS.md symlink", () => {
      const { code, out } = linkRun({ "pkg/CODING_STANDARDS.md": "../docs/gone.md" });
      expect(out).toMatch(/pkg\/CODING_STANDARDS\.md:1: broken-symlink:.*\.\.\/docs\/gone\.md/);
      expect(code).toBe(1);
    });
    it("passes a resolving symlink in a skill dir", () => {
      const { code, out } = linkRun({ ".claude/skills/demo/std.md": "../../../docs/std.md" });
      expect(out).not.toContain("broken-symlink");
      expect(code).toBe(0);
    });
    it("skips a dangling symlink outside skill dirs", () => {
      const { code, out } = linkRun({ "docs/dangling.md": "nowhere.md" });
      expect(out).not.toContain("broken-symlink");
      expect(out).toContain("0 error(s)");
      expect(code).toBe(0);
    });
  });

  describe("output modes", () => {
    it("prints workflow annotations in GitHub Actions", () => {
      const { code, out } = withFixture("claude-md-fail", (dir) => {
        const res = spawnSync("node", [script], {
          encoding: "utf8",
          env: {
            ...process.env,
            GITHUB_ACTIONS: "true",
            GIT_CEILING_DIRECTORIES: tmpBase,
            INPUT_PATH: dir,
            INPUT_PROFILE: "repo",
            "INPUT_CHECK-URLS": "false",
          },
        });
        return { code: res.status, out: `${res.stdout}${res.stderr}` };
      });
      expect(code).toBe(1);
      expect(out).toContain("::error file=");
      expect(out).toMatch(/CLAUDE\.md,line=1::no-claude-md: /);
    });
  });

  describe("fixture names", () => {
    const reserved = new Set([
      "AGENTS.md",
      "AGENTS.override.md",
      "CLAUDE.md",
      "CLAUDE.local.md",
      ".claude",
      ".agents",
      ".opencode",
      ".codex",
    ]);

    /** Every path under dir (symlinks listed, not followed) with a segment agent tools would load. */
    function realAgentNames(dir: string): string[] {
      const found: string[] = [];
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (reserved.has(e.name)) found.push(p);
        else if (e.isDirectory()) found.push(...realAgentNames(p));
      }
      return found;
    }

    it("keeps real agent file and directory names out of tests/fixtures/", () => {
      const bad = realAgentNames(join(__dirname, "fixtures"));
      expect(
        bad,
        `these load as real agent files; add a .fixture suffix; the test helper strips it when it copies the fixture:\n${bad.join("\n")}`,
      ).toEqual([]);
    });
  });
});
