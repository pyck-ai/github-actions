import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../docs-check/check.mjs";

// Runs docs-check's main() in-process against the fixture trees in
// tests/fixtures/docs-check/<case>/ (each holds a `docs/` folder). The first
// two checks need no tools, so most tests inject a `lint` that finds nothing.
// The "markdownlint" block starts the real script, which runs the pinned
// markdownlint-cli2 through npx and so needs network access the first time.

const root = join(__dirname, "..");
const script = join(root, "docs-check", "check.mjs");
const fixtures = join(__dirname, "fixtures", "docs-check");
const tmpBase = join(tmpdir(), "docs-check-tests");

type Lint = (args: { dir: string; files: string[]; config: string }) => string[];
interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function copyTree(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory()) copyTree(join(src, e.name), join(dest, e.name));
    else copyFileSync(join(src, e.name), join(dest, e.name));
  }
}

/** Copies a fixture to a fresh temp dir (the workspace), runs fn on it and removes it. */
async function withFixture<T>(fixture: string, fn: (ws: string) => T | Promise<T>): Promise<T> {
  mkdirSync(tmpBase, { recursive: true });
  const ws = mkdtempSync(join(tmpBase, "ws-"));
  try {
    copyTree(join(fixtures, fixture), ws);
    return await fn(ws);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
}

const noLint: Lint = () => [];

async function runMain(
  argv: string[],
  cwd: string,
  env: Record<string, string> = {},
  lint: Lint = noLint,
): Promise<RunResult> {
  const out: string[] = [];
  const err: string[] = [];
  const status = await main({
    argv,
    env: { GITHUB_ACTIONS: "", ...env },
    cwd,
    lint,
    log: (l: string) => out.push(`${l}\n`),
    error: (l: string) => err.push(`${l}\n`),
  });
  return { status, stdout: out.join(""), stderr: err.join("") };
}

/** Starts the real script, with the real markdownlint-cli2. */
function spawnScript(args: string[], cwd: string): RunResult {
  const res = spawnSync("node", [script, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GITHUB_ACTIONS: "" },
    timeout: 120_000,
  });
  return { status: res.status as number, stdout: res.stdout, stderr: res.stderr };
}

describe("docs-check", () => {
  describe("headings", () => {
    it("passes on sentence-case headings, titles and SUMMARY.md labels", async () => {
      await withFixture("pass", async (ws) => {
        const res = await runMain(["docs"], ws);
        expect(res.stdout).toContain("docs-check headings: all 6 headings, titles and labels");
        expect(res.status).toBe(0);
      });
    });

    it("fails on a title and a heading, naming file and line relative to path", async () => {
      await withFixture("headings-fail", async (ws) => {
        const res = await runMain(["docs"], ws);
        expect(res.stdout).toContain("page.md:2: The Big Page  (word: Big)");
        expect(res.stdout).toContain("page.md:2: The Big Page  (word: Page)");
        expect(res.stdout).toContain("page.md:7: Getting Started  (word: Started)");
        expect(res.stdout).not.toContain("docs/page.md");
        expect(res.stderr).toContain("docs-check headings: 3 word(s)");
        expect(res.status).toBe(1);
      });
    });

    it("reads the link texts of SUMMARY.md", async () => {
      await withFixture("summary-fail", async (ws) => {
        const res = await runMain(["docs"], ws);
        expect(res.stdout).toContain("SUMMARY.md:3: Getting Started  (word: Started)");
        expect(res.stdout).not.toContain("Fine label");
        expect(res.status).toBe(1);
      });
    });

    it("takes extra words from the extra-words file, phrases too", async () => {
      await withFixture("extra-words", async (ws) => {
        const without = await runMain(["docs"], ws);
        expect(without.stdout).toContain("page.md:3: Using Acme tools  (word: Acme)");
        expect(without.stdout).toContain("page.md:5: Acme Cloud console  (word: Cloud)");
        expect(without.status).toBe(1);

        const withWords = await runMain(["docs", "--extra-words", "words.txt"], ws);
        expect(withWords.stdout).not.toContain("Acme");
        expect(withWords.status).toBe(0);
      });
    });

    it("keeps the words of the shipped list", async () => {
      await withFixture("pass", async (ws) => {
        // "Kubernetes" in pass/docs/README.md is only allowed by the shipped heading-words.txt.
        const res = await runMain(["docs"], ws);
        expect(res.stdout).not.toContain("Kubernetes");
        expect(res.status).toBe(0);
      });
    });
  });

  describe("guideline-links", () => {
    it("passes with no link to pyck-ai/guidelines", async () => {
      await withFixture("pass", async (ws) => {
        const res = await runMain(["docs"], ws);
        expect(res.stdout).toContain(
          "docs-check guideline-links: no link to the company guidelines in 3 pages",
        );
        expect(res.status).toBe(0);
      });
    });

    it("fails on a link and on a local path, code fences included, not on look-alike repos", async () => {
      await withFixture("guideline-fail", async (ws) => {
        const res = await runMain(["docs"], ws);
        expect(res.stdout).toContain("page.md:3: github.com/pyck-ai/guidelines");
        expect(res.stdout).toContain("page.md:6: .pyck/guidelines");
        expect(res.stdout).not.toContain("page.md:9");
        expect(res.stderr).toContain("docs-check guideline-links: 2 link(s)");
        expect(res.status).toBe(1);
      });
    });
  });

  describe("files read", () => {
    it("skips internal/ folders and dot entries, for every check", async () => {
      await withFixture("internal", async (ws) => {
        const seen: string[][] = [];
        const res = await runMain(["docs"], ws, {}, ({ files }) => (seen.push(files), []));
        expect(seen).toEqual([["page.md"]]);
        expect(res.stdout).not.toContain("secret.md");
        expect(res.stdout).not.toContain("dot.md");
        expect(res.status).toBe(0);
      });
    });

    it("skips a symlinked Markdown file", async () => {
      await withFixture("pass", async (ws) => {
        symlinkSync(join(ws, "docs", "guide.md"), join(ws, "docs", "link.md"));
        const seen: string[][] = [];
        await runMain(["docs"], ws, {}, ({ files }) => (seen.push(files), []));
        expect(seen[0]).toEqual(["README.md", "SUMMARY.md", "guide.md"]);
      });
    });
  });

  describe("bad path", () => {
    it("fails on a missing folder", async () => {
      await withFixture("pass", async (ws) => {
        const res = await runMain(["nope"], ws);
        expect(res.stderr).toContain("docs-check: not a directory: nope");
        expect(res.status).toBe(2);
      });
    });

    it("fails on a folder with no Markdown file to check", async () => {
      await withFixture("empty", async (ws) => {
        const res = await runMain(["docs"], ws);
        expect(res.stderr).toContain("docs-check: no Markdown file to check in docs");
        expect(res.status).toBe(2);
      });
    });

    it("fails on an extra-words file that does not exist", async () => {
      await withFixture("pass", async (ws) => {
        const res = await runMain(["docs", "--extra-words", "missing.txt"], ws);
        expect(res.stderr).toContain('extra-words file "missing.txt" is not a file');
        expect(res.status).toBe(2);
      });
    });
  });

  describe("inputs in GitHub Actions", () => {
    const actionsEnv = (extra: Record<string, string> = {}) => ({
      GITHUB_ACTIONS: "true",
      ...extra,
    });

    it("defaults path to docs", async () => {
      await withFixture("headings-fail", async (ws) => {
        const res = await runMain([], ws, actionsEnv());
        expect(res.stdout).toContain("page.md:7:");
        expect(res.status).toBe(1);
      });
    });

    it("reads INPUT_PATH and INPUT_EXTRA-WORDS", async () => {
      await withFixture("extra-words", async (ws) => {
        const res = await runMain(
          [],
          ws,
          actionsEnv({ INPUT_PATH: "docs", "INPUT_EXTRA-WORDS": "words.txt" }),
        );
        expect(res.status).toBe(0);
      });
    });

    it("passes INPUT_MARKDOWNLINT-CONFIG to markdownlint", async () => {
      await withFixture("pass", async (ws) => {
        const configs: string[] = [];
        await runMain(
          [],
          ws,
          actionsEnv({ "INPUT_MARKDOWNLINT-CONFIG": "docs/SUMMARY.md" }),
          ({ config }) => (configs.push(config), []),
        );
        expect(configs).toEqual([join(ws, "docs", "SUMMARY.md")]);
      });
    });

    it("uses the shipped config when none is given", async () => {
      await withFixture("pass", async (ws) => {
        const configs: string[] = [];
        await runMain(["docs"], ws, {}, ({ config }) => (configs.push(config), []));
        expect(configs).toEqual([join(root, "docs-check", "markdownlint-cli2.yaml")]);
      });
    });
  });

  // Starts the real script and the real, pinned markdownlint-cli2 through npx.
  describe("markdownlint (real markdownlint-cli2 0.23.1)", { timeout: 120_000 }, () => {
    it("passes on clean Markdown and prints the summary", async () => {
      await withFixture("pass", (ws) => {
        const res = spawnScript(["docs"], ws);
        expect(res.stdout).toContain(
          "docs-check markdownlint: markdownlint 0.23.1: no finding in 3 files",
        );
        expect(res.status).toBe(0);
      });
    });

    it("fails with file:line findings relative to path", async () => {
      await withFixture("lint-fail", (ws) => {
        const res = spawnScript(["docs"], ws);
        expect(res.stdout).toMatch(/^page\.md:3: MD040\/fenced-code-language /m);
        expect(res.stderr).toContain("docs-check markdownlint: 1 markdownlint finding(s)");
        expect(res.status).toBe(1);
      });
    });

    it("uses the config given with --markdownlint-config instead of the shipped one", async () => {
      await withFixture("lint-config", (ws) => {
        const res = spawnScript(["docs", "--markdownlint-config", "config.yaml"], ws);
        expect(res.stdout).not.toContain("MD040");
        expect(res.status).toBe(0);
      });
    });

    it("fails with the tool's message on a config it cannot read", async () => {
      await withFixture("pass", (ws) => {
        const res = spawnScript(["docs", "--markdownlint-config", "missing.yaml"], ws);
        expect(res.stderr).toContain("is not a file");
        expect(res.status).toBe(2);
      });
    });

    it("does not lint a file in internal/ or a dot folder", async () => {
      await withFixture("internal", (ws) => {
        const res = spawnScript(["docs"], ws);
        expect(res.stdout).not.toContain("secret.md");
        expect(res.status).toBe(0);
      });
    });
  });
});
