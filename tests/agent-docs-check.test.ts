import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
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
    ])("fails over 200 lines: %s", (fixture, where) =>
      expectFail(fixture, [where, "agent-file-size:", "limit is 200"]),
    );
    it("has no limit for a script in a skill dir (201-line .py next to SKILL.md)", () => {
      const { code, out } = run("size-script-pass");
      expect(out).not.toContain("agent-file-size");
      expect(code).toBe(0);
    });
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

  describe("rule 4: managed table of contents region", () => {
    it("passes a visible region", () => expectPass("toc-visible-pass"));
    it("passes a hidden region (frontmatter, inline markdown, fenced ##, ### ignored)", () =>
      expectPass("toc-hidden-pass"));
    it("passes GitHub anchors: duplicates get -1, -2, punctuation dropped, unicode kept", () =>
      expectPass("toc-anchors-pass"));
    it("passes a doc with a single ## heading", () => expectPass("toc-one-h2-pass"));
    it("exempts AGENTS.md, SKILL.md, changelogs, generated files, templates, fixtures", () =>
      expectPass("toc-exempt-pass"));
    it("fails toc-missing with two ## headings and no region", () =>
      expectFail("toc-missing-fail", ["docs/guide.md:1: toc-missing:", '2 "##" headings']));
    it("fails toc-missing for an unclosed hidden region", () =>
      expectFail("toc-unclosed-fail", ["docs/guide.md:3: toc-missing:", "never closed"]));
    it("does not accept a region after the first ## heading (its ## Contents is unmanaged)", () =>
      expectFail("toc-after-h2-fail", ["docs/guide.md:6: toc-unmanaged:"]));
    it("fails toc-stale naming a missing heading", () =>
      expectFail("toc-stale-missing-fail", ["toc-stale:", 'missing: "Gamma"']));
    it("fails toc-stale naming an extra item", () =>
      expectFail("toc-stale-extra-fail", ["toc-stale:", 'extra: "Zeta"']));
    it("fails toc-stale naming an order problem", () =>
      expectFail("toc-stale-order-fail", [
        "toc-stale:",
        'out of order: expected "Alpha" at position 1, found "Beta"',
      ]));
    it("fails toc-stale naming a wrong anchor", () =>
      expectFail("toc-stale-anchor-fail", [
        "toc-stale:",
        'wrong anchor for "Beta": expected #beta, found #bata',
      ]));
    it("fails toc-stale when duplicate headings lack the -1 suffix", () =>
      expectFail("toc-stale-duplicate-fail", [
        "toc-stale:",
        'wrong anchor for "Setup": expected #setup-1, found #setup',
      ]));
    it("fails toc-stale when the region lacks the ## Contents heading", () =>
      expectFail("toc-noheading-fail", [
        "toc-stale:",
        'must start with "## Contents" followed by a blank line',
      ]));
    it("fails toc-stale when no blank line follows ## Contents", () =>
      expectFail("toc-noblank-fail", ["toc-stale:", "followed by a blank line"]));
    it("fails toc-legacy for a leading Contents comment", () =>
      expectFail("toc-legacy-fail", ["docs/guide.md:1: toc-legacy:", "--fix removes it"]));
    it("fails toc-unmanaged for a ## Contents outside the region, even next to a valid one", () =>
      expectFail("toc-unmanaged-with-region-fail", [
        "toc-unmanaged:",
        "outside a managed region",
        "1 error(s)",
      ]));
    it("fails toc-unmanaged for a ## Contents heading, not counted as a section", () =>
      expectFail("toc-unmanaged-fail", [
        "docs/guide.md:3: toc-unmanaged:",
        "replace it with the managed region",
        "1 error(s)",
      ]));
  });

  describe(".tocignore (gitignore syntax and semantics, via git's matcher)", () => {
    const base = tmpBase;
    const dirs: string[] = [];
    afterEach(() => {
      for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    });

    /** Copy the tree to a temp dir, write the given files, optionally git init, return reported docs. */
    function tocRun(
      files: Record<string, string>,
      git = true,
      forceAdd: string[] = [],
      extraEnv: NodeJS.ProcessEnv = {},
    ): { reported: string[]; out: string; code: number | null } {
      mkdirSync(base, { recursive: true });
      const tmp = mkdtempSync(join(base, "ignore-"));
      dirs.push(tmp);
      copyFixture(join(fixtures, "tocignore-tree"), tmp);
      for (const [rel, text] of Object.entries(files)) {
        mkdirSync(dirname(join(tmp, rel)), { recursive: true });
        writeFileSync(join(tmp, rel), text);
      }
      if (git) {
        spawnSync("git", ["-C", tmp, "init", "-q"]);
        if (forceAdd.length) spawnSync("git", ["-C", tmp, "add", "-f", ...forceAdd]);
      }
      const res = spawnSync("node", [script, tmp], {
        encoding: "utf8",
        env: { ...process.env, GITHUB_ACTIONS: "", GIT_CEILING_DIRECTORIES: base, ...extraEnv },
      });
      const out = `${res.stdout}${res.stderr}`;
      const reported = [...out.matchAll(/^(\S+?):\d+: toc-missing:/gm)]
        .map((m) => m[1].slice(tmp.length + 1))
        .sort();
      return { reported, out, code: res.status };
    }
    const all = [
      "#hash.md",
      "dir/file.md",
      "dirfile/x.md",
      "docs/guide.md",
      "docs/skip-me.md",
      "docs/top.md",
      "pkg/inner/y.md",
      "pkg/inner/z.md",
      "pkg/top.md",
      "src/deep/more/x.md",
      "src/notes.md",
      "top.md",
      "vendor/a.md",
      "vendor/sub/b.md",
    ];

    it("reports every doc without a .tocignore", () => {
      expect(tocRun({}).reported).toEqual(all);
    });
    it("handles comments, globs, dir/, anchoring, negation and escapes", () => {
      const { reported } = tocRun({
        ".tocignore": [
          "# a comment",
          "",
          "src/",
          "!src/notes.md", // cannot re-include below an excluded directory
          "vendor/**/b.md",
          "/top.md", // anchored: not docs/top.md or pkg/top.md
          "docs/skip-*.md",
          "dir",
          "\\#hash.md", // escaped leading #
          "",
        ].join("\n"),
      });
      expect(reported).toEqual(
        [
          "docs/guide.md",
          "docs/top.md",
          "dirfile/x.md",
          "pkg/inner/y.md",
          "pkg/inner/z.md",
          "pkg/top.md",
          "vendor/a.md",
        ].sort(),
      );
    });
    it("lets a later negation re-include a file whose directory is not excluded", () => {
      const { reported } = tocRun({ ".tocignore": "vendor/*.md\n!vendor/a.md\n" });
      expect(reported).toContain("vendor/a.md");
      expect(reported).toContain("vendor/sub/b.md");
    });
    it("applies a trailing / to directories only", () => {
      // top.md is a file: "top.md/" must not match it, but "dir/" matches the directory.
      const { reported } = tocRun({ ".tocignore": "top.md/\ndir/\n" });
      expect(reported).toContain("top.md");
      expect(reported).not.toContain("dir/file.md");
      expect(reported).toContain("dirfile/x.md");
    });
    it("reads .tocignore files at any depth, relative to their own directory", () => {
      const { reported } = tocRun({
        "pkg/.tocignore": "/top.md\ninner/y.md\n",
        ".tocignore": "",
      });
      expect(reported).not.toContain("pkg/top.md");
      expect(reported).not.toContain("pkg/inner/y.md");
      expect(reported).toContain("pkg/inner/z.md");
      expect(reported).toContain("top.md");
      expect(reported).toContain("docs/top.md");
    });
    it("exits 0 when .tocignore covers every doc, and 1 without it", () => {
      expect(tocRun({}).code).toBe(1);
      const { reported, out, code } = tocRun({ ".tocignore": "*.md\n" });
      expect(reported).toEqual([]);
      expect(out).not.toContain("toc-missing");
      expect(out).toMatch(/0 error\(s\)/);
      expect(code).toBe(0);
    });
    it("warns with git's first stderr line when git ls-files fails, and ignores the exemptions", () => {
      // A git wrapper on PATH that fails only the .tocignore listing.
      mkdirSync(base, { recursive: true });
      const bin = mkdtempSync(join(base, "fakegit-"));
      dirs.push(bin);
      const realGit = spawnSync("which", ["git"], { encoding: "utf8" }).stdout.trim();
      const wrapper = join(bin, "git");
      writeFileSync(
        wrapper,
        `#!/bin/sh\ncase "$*" in *--exclude-per-directory*) echo "fatal: simulated failure" >&2; echo "second line" >&2; exit 128;; esac\nexec ${realGit} "$@"\n`,
      );
      chmodSync(wrapper, 0o755);
      const { reported, out } = tocRun({ ".tocignore": "*.md\n" }, true, [], {
        PATH: `${bin}:${process.env.PATH}`,
      });
      expect(out).toContain(
        "warning: could not apply .tocignore (git ls-files failed: fatal: simulated failure); exemptions ignored",
      );
      expect(out.match(/could not apply \.tocignore/g)).toHaveLength(1);
      expect(out).not.toContain("second line");
      expect(reported).toEqual(all);
    });
    it("does not mix in .gitignore", () => {
      // src/notes.md is tracked although .gitignore lists src/: only .tocignore may hide it.
      const { reported } = tocRun({ ".gitignore": "src/\n", ".tocignore": "docs/\n" }, true, [
        "src/notes.md",
      ]);
      expect(reported).toContain("src/notes.md");
      expect(reported).not.toContain("docs/guide.md");
    });
    it("ignores .tocignore outside a git work tree and warns once", () => {
      const { reported, out } = tocRun(
        { ".tocignore": "src/\n", "pkg/.tocignore": "inner/\n" },
        false,
      );
      expect(reported).toContain("src/notes.md");
      expect(out.match(/warning: .tocignore needs a git work tree/g)).toHaveLength(1);
    });
  });

  describe("--fix", () => {
    let tmp: string;
    afterEach(() => rmSync(tmp, { recursive: true, force: true }));
    const fixed = (rel: string): string => readFileSync(join(tmp, rel), "utf8");
    function fixCopy(fixture: string): { code: number | null; out: string } {
      const base = tmpBase;
      mkdirSync(base, { recursive: true });
      tmp = mkdtempSync(join(base, "fix-"));
      copyFixture(join(fixtures, fixture), tmp);
      const res = spawnSync("node", [script, tmp, "--fix"], {
        encoding: "utf8",
        env: { ...process.env, GITHUB_ACTIONS: "", GIT_CEILING_DIRECTORIES: tmpdir() },
      });
      return { code: res.status, out: `${res.stdout}${res.stderr}` };
    }
    const body = "## Contents\n\n- [Alpha](#alpha)\n- [Beta](#beta)";
    const hidden = `<!-- toc\n${body}\n-->`;

    it("inserts a hidden region after the H1, or at the top without one", () => {
      const { code, out } = fixCopy("toc-fix");
      expect(out).toContain(`fixed: ${join(tmp, "docs/h1.md")}`);
      expect(out).toMatch(/0 error\(s\)/);
      expect(code).toBe(0);
      expect(fixed("docs/h1.md")).toBe(`# Missing\n\n${hidden}\n\nIntro.\n\n## Alpha\n\n## Beta\n`);
      expect(fixed("docs/frontmatter.md")).toBe(
        `---\ntitle: x\n---\n\n# Front\n\n${hidden}\n\nIntro.\n\n## Alpha\n\n## Beta\n`,
      );
      expect(fixed("docs/tight.md")).toBe(
        `# Tight\n\n${hidden}\n\nIntro.\n\n## Alpha\n\n## Beta\n`,
      );
      expect(fixed("docs/noh1.md")).toBe(
        `---\ntitle: x\n---\n\n${hidden}\n\nIntro.\n\n## Alpha\n\n## Beta\n`,
      );
      expect(fixed("docs/noh1-nofm.md")).toBe(`${hidden}\n\nIntro.\n\n## Alpha\n\n## Beta\n`);
    });

    it("rewrites only the lines between the markers, keeping the spelling", () => {
      fixCopy("toc-fix");
      expect(fixed("docs/visible.md")).toBe(
        "# Vis\n\n<!-- toc -->\n## Contents\n\n- [Alpha](#alpha)\n- [Beta](#beta)\n- [Alpha](#alpha-1)\n<!-- /toc -->\n\nIntro.\n\n## Alpha\n\n## `Beta`\n\n## Alpha\n",
      );
      expect(fixed("docs/hidden.md")).toBe(`# Hid\n\n${hidden}\n\nIntro.\n\n## Alpha\n\n## Beta\n`);
    });

    it("removes a legacy Contents comment (and one blank line) and adds the region", () => {
      fixCopy("toc-fix");
      expect(fixed("docs/legacy.md")).toBe(
        `# Legacy\n\n${hidden}\n\nIntro.\n\n## Alpha\n\n## Beta\n`,
      );
      expect(fixed("docs/legacy-multi.md")).toBe(
        `# Legacy\n\n${hidden}\n\nIntro.\n\n## Alpha\n\n## Beta\n`,
      );
    });

    it("is idempotent: a second --fix run changes nothing", () => {
      fixCopy("toc-fix");
      const rels = [
        "docs/h1.md",
        "docs/frontmatter.md",
        "docs/tight.md",
        "docs/noh1.md",
        "docs/noh1-nofm.md",
        "docs/visible.md",
        "docs/hidden.md",
        "docs/legacy.md",
        "docs/legacy-multi.md",
      ];
      const first = rels.map(fixed);
      const res = spawnSync("node", [script, tmp, "--fix"], {
        encoding: "utf8",
        env: { ...process.env, GITHUB_ACTIONS: "", GIT_CEILING_DIRECTORIES: tmpdir() },
      });
      expect(rels.map(fixed)).toEqual(first);
      expect(`${res.stdout}${res.stderr}`).not.toContain("fixed:");
      expect(res.status).toBe(0);
    });

    it("never edits a ## Contents section and still reports it", () => {
      const before = readFileSync(join(fixtures, "toc-fix-unmanaged/docs/guide.md"), "utf8");
      const { code, out } = fixCopy("toc-fix-unmanaged");
      expect(fixed("docs/guide.md")).toBe(before);
      expect(out).not.toContain("fixed:");
      expect(out).toContain("toc-unmanaged:");
      expect(code).toBe(1);
    });
  });

  describe("rule 5: skill frontmatter", () => {
    it("passes a valid skill", () => expectPass("skill-frontmatter-pass"));
    it.each([
      ["skill-frontmatter-missing-fail", "needs YAML frontmatter"],
      ["skill-frontmatter-name-mismatch-fail", 'name "other" must equal the directory name "demo"'],
      ["skill-frontmatter-name-claude-fail", 'must not contain "anthropic" or "claude"'],
      ["skill-frontmatter-name-anthropic-fail", 'must not contain "anthropic" or "claude"'],
      ["skill-frontmatter-name-chars-fail", "must match ^[a-z0-9-]{1,64}$"],
      ["skill-frontmatter-desc-empty-fail", "missing or empty description"],
      ["skill-frontmatter-desc-brackets-fail", "description must not contain < or >"],
      ["skill-frontmatter-desc-long-fail", "description is 1025 chars, limit is 1024"],
    ])("fails: %s", (fixture, message) => expectFail(fixture, ["skill-frontmatter:", message]));
    it("checks the frontmatter of a top-level skills/<name>/SKILL.md", () =>
      expectFail("skills-top-name-fail", [
        'skills/demo/SKILL.md:1: skill-frontmatter: name "other" must equal the directory name "demo"',
      ]));
  });

  describe("rule 5b: frontmatter values are valid YAML", () => {
    it.each([
      "frontmatter-yaml-double-pass",
      "frontmatter-yaml-single-pass",
      "frontmatter-yaml-url-pass",
      "frontmatter-yaml-block-pass",
    ])("passes: %s", (fixture) => expectPass(fixture));
    it.each([
      "frontmatter-yaml-colon-fail",
      "frontmatter-yaml-hash-fail",
      "frontmatter-yaml-trailing-colon-fail",
    ])("fails an unquoted scalar: %s", (fixture) =>
      expectFail(fixture, [
        /skills\/demo\/SKILL\.md:3: frontmatter-yaml: the value of "description"/,
        "quote the value",
      ]),
    );
    it("also checks agent files outside skill dirs", () =>
      expectFail("frontmatter-yaml-agent-fail", [
        /agents\/helper\.md:3: frontmatter-yaml: the value of "description"/,
      ]));
  });

  describe("rule 5c: skill-harness", () => {
    const flag = ["--require-skill-harness"];
    it.each([
      "skill-harness-generic-pass",
      "skill-harness-opencode-pass",
      "skill-harness-quoted-double-pass",
      "skill-harness-quoted-single-pass",
    ])("passes with and without the flag: %s", (fixture) => {
      expectPass(fixture);
      expectPass(fixture, flag);
    });
    it("fails an unknown value, with or without the flag", () => {
      for (const args of [[], flag]) {
        expectFail(
          "skill-harness-unknown-fail",
          ['skill-harness: metadata.harness is "claude", must be generic or opencode'],
          args,
        );
      }
    });
    it("fails a metadata that is not a map", () =>
      expectFail("skill-harness-nonmap-fail", ["skill-harness: metadata must be a map"]));
    it("does not report a missing tag without the flag", () => {
      expectPass("skill-harness-missing");
      expectPass("skill-harness-metadata-other");
    });
    it.each(["skill-harness-missing", "skill-harness-metadata-other"])(
      "reports a missing tag with --require-skill-harness: %s",
      (fixture) =>
        expectFail(
          fixture,
          [/skills\/demo\/SKILL\.md:1: skill-harness: missing metadata\.harness/, "1 error(s)"],
          flag,
        ),
    );
    it("reads the flag from the require-skill-harness input", () => {
      const env = { GITHUB_ACTIONS: "true", "INPUT_REQUIRE-SKILL-HARNESS": "true" };
      withFixture("skill-harness-missing", (dir) => {
        const res = spawnSync("node", [script], {
          encoding: "utf8",
          env: { ...process.env, ...env, INPUT_PATH: dir, GIT_CEILING_DIRECTORIES: tmpBase },
        });
        expect(`${res.stdout}${res.stderr}`).toContain("skill-harness: missing metadata.harness");
        expect(res.status).toBe(1);
      });
    });
    it("does not check a SKILL.md outside a skill dir", () =>
      expectPass("skill-harness-outside-skill-pass", ["--require-skill-harness"]));
    it("checks a nested value for frontmatter-yaml", () =>
      expectFail("frontmatter-yaml-nested-fail", [
        /skills\/demo\/SKILL\.md:6: frontmatter-yaml: the value of "metadata\.note"/,
      ]));
  });

  describe("rule 6: relative links resolve", () => {
    it("passes for existing targets, ignoring URLs, anchors and code", () =>
      expectPass("links-pass"));
    it("fails a broken link in AGENTS.md", () =>
      expectFail("links-broken-agents-fail", ['AGENTS.md:3: relative-link: "docs/missing.md"']));
    it("fails a broken link in README.md, with the anchor stripped", () =>
      expectFail("links-broken-readme-fail", ['README.md:3: relative-link: "gone/README.md#x"']));
    it("fails a broken link in docs, resolved relative to the file", () =>
      expectFail("links-broken-docs-fail", ['docs/guide.md:3: relative-link: "../nope.md"']));
  });

  describe("rule 7: agent files hold no URLs, human files no raw links", () => {
    it("passes ~/.pyck paths in agent files and blob links in human files (no agent-url in human files)", () =>
      expectPass("link-form-pass"));
    it.each([
      ["link-form-agents-blob-fail", "AGENTS.md:3"],
      ["link-form-skill-blob-fail", ".claude/skills/demo/SKILL.md:8"],
      ["link-form-coding-blob-fail", "CODING_STANDARDS.md:3"],
    ])("fails a blob link in an agent file: %s", (fixture, where) =>
      expectFail(fixture, [
        where,
        "agent-url: agent files contain no URLs; name a local path under ~/.pyck/<repo>/ instead",
      ]),
    );
    it("fails a raw link in an agent file", () =>
      expectFail("agent-url-raw-fail", ["AGENTS.md:3", "agent-url: agent files contain no URLs"]));
    it("fails a plain http URL in an agent file", () =>
      expectFail("agent-url-http-fail", ["AGENTS.md:3", "agent-url: agent files contain no URLs"]));
    it("passes a URL inside inline code or a fence", () => expectPass("agent-url-code-pass"));
    it("fails a URL in a non-SKILL.md file of a top-level skills/<name>/ dir", () =>
      expectFail("skills-top-url-fail", [
        "skills/demo/guide.md:3: agent-url: agent files contain no URLs",
      ]));
    it("passes the same URL inside backticks in a top-level skill dir", () =>
      expectPass("skills-top-url-code-pass"));
    it("treats skills/<name>/ without a SKILL.md as a plain directory", () =>
      expectPass("skills-top-nonskill-pass"));
    it.each([
      ["link-form-readme-raw-fail", "README.md:3"],
      ["link-form-docs-raw-fail", "docs/guide.md:3"],
      ["link-form-contributing-raw-fail", "CONTRIBUTING.md:3"],
    ])("fails a raw link in a human file: %s", (fixture, where) =>
      expectFail(fixture, [
        where,
        "link-form: human files",
        "must not link raw.githubusercontent.com",
      ]),
    );
  });

  describe("rule 9: ~/.pyck paths", () => {
    const pyckHome = join(fixtures, "pyck-home");
    it("passes a path into the repo under check that exists", () =>
      expectPass("pyck-path-self-pass"));
    it("fails a path into the repo under check that is missing", () =>
      expectFail("pyck-path-self-fail", [
        "AGENTS.md:3: pyck-path: ~/.pyck/pyck-path-self-fail/missing does not exist",
        "1 error(s)",
      ]));
    it("names the repo under check after the origin remote when there is one", () => {
      const { code, out } = withFixture("pyck-path-self-pass", (dir) => {
        const git = (...a: string[]) =>
          spawnSync("git", ["-C", dir, ...a], { encoding: "utf8", env: { ...process.env } });
        git("init", "-q");
        git("remote", "add", "origin", "git@github.com:acme/renamed-repo.git");
        writeFileSync(join(dir, "AGENTS.md"), "# Agents\n\nSee `~/.pyck/renamed-repo/existing`.\n");
        const res = spawnSync("node", [script, dir], {
          encoding: "utf8",
          env: {
            ...process.env,
            GITHUB_ACTIONS: "",
            GIT_CEILING_DIRECTORIES: tmpBase,
            PYCK_HOME: join(tmpBase, "no-pyck-home"),
          },
        });
        return { code: res.status, out: `${res.stdout}${res.stderr}` };
      });
      expect(out).toContain("0 error(s)");
      expect(code).toBe(0);
    });
    it("warns once per repo that is not installed and checks nothing", () => {
      const { code, out } = run("pyck-path-other-warn");
      expect(code).toBe(0);
      expect(out).toContain("0 error(s), 1 warning(s)");
      expect(out).toContain(
        "pyck-path: ~/.pyck/other-repo is not installed here; paths into it were not checked",
      );
      expect(out.match(/is not installed here/g)).toHaveLength(1);
    });
    it("checks a path into another repo under PYCK_HOME", () =>
      expectPass("pyck-path-other-warn", [], { PYCK_HOME: pyckHome }));
    it("fails a missing path into another repo under PYCK_HOME", () =>
      expectFail(
        "pyck-path-other-fail",
        ["AGENTS.md:3: pyck-path: ~/.pyck/other-repo/missing does not exist"],
        [],
        { PYCK_HOME: pyckHome },
      ));
    it("skips a path with a placeholder", () => expectPass("pyck-path-placeholder-pass"));
    it("does not treat a ~/ link target as relative", () => expectPass("pyck-path-self-pass"));
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
