#!/usr/bin/env node
// docs-check: three checks on a docs folder.
//
// Plain ESM, Node stdlib only, no build step: it runs as a `node24` JavaScript
// action on the runner's bundled Node and locally as
//   node docs-check/check.mjs [path] [--extra-words <file>] [--markdownlint-config <file>]
// The checks (the first two adapted from pyck-ai/docs-poc at 9ec8c73, directory mode):
//   headings          sentence case for every heading, the frontmatter `title` and the link texts of SUMMARY.md
//   guideline-links   no link to pyck-ai/guidelines
//   markdownlint      markdownlint-cli2 on the folder's Markdown, through `npx`
// All three read the same files: the folder's *.md, skipping dot entries, symlinks and folders named `internal`.
// Exit 0 when nothing is found, 1 when a check finds something, 2 for a bad path or option.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MARKDOWNLINT_VERSION = "0.23.1";
const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG = join(here, "markdownlint-cli2.yaml");
const BUNDLED_WORDS = join(here, "heading-words.txt");

/** A bad path, file or option: the run ends with exit code 2. */
class UsageError extends Error {}

// ----------------------------------------------------------------- the files

/** The Markdown files below `dir`, relative to `dir`, sorted. */
function markdownFiles(dir, rel = "") {
  const files = [];
  for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.isSymbolicLink()) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (e.name !== "internal") files.push(...markdownFiles(dir, r));
    } else if (e.name.endsWith(".md")) files.push(r);
  }
  return files.sort();
}

// ------------------------------------------------------------------ headings

const CODE = "\u0000";
// A code span becomes the NUL placeholder, which `trim` must keep at the edges of a word.
const trim = (w) =>
  // eslint-disable-next-line no-control-regex
  w.replace(/^[^\p{L}\p{N}\u0000]+|[^\p{L}\p{N}\u0000]+$/gu, "").replace(/['’]s$/, "");

/** One phrase per line (words separated by spaces); `#` starts a comment. */
export function parseAllow(text) {
  const phrases = [];
  for (const line of text.split(/\r?\n/)) {
    const words = line
      .replace(/(^|\s)#.*$/, "")
      .trim()
      .split(/\s+/)
      .map(trim)
      .filter(Boolean);
    if (words.length) phrases.push(words);
  }
  return phrases;
}

/** The capitalised words of a heading that are neither first nor exempt and not covered by the allow list. */
export function violations(text, allow = []) {
  const plain = text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/`[^`]*`/g, CODE)
    // Quoted text is a message or label copied word for word from the app, so it keeps its own capitals.
    .replace(/"[^"]*"|“[^”]*”/g, CODE)
    .replace(/<[^>]+>/g, " ")
    .replace(/\{#[^}]*\}\s*$/, "")
    .replace(/\\([_*])/g, "$1");
  const raw = plain.split(/\s+/).filter(Boolean);
  const tokens = raw.map(trim);
  // A word is "first" after leading numbers such as "1." in "1. Set up the tenant".
  const first = tokens.findIndex((t) => /\p{L}/u.test(t));
  const covered = new Set();
  for (let i = 0; i < tokens.length; i++) {
    for (const phrase of allow) {
      if (phrase.every((w, k) => tokens[i + k] === w)) phrase.forEach((_, k) => covered.add(i + k));
    }
  }
  const singles = new Set(allow.filter((p) => p.length === 1).map((p) => p[0]));
  const out = [];
  tokens.forEach((token, i) => {
    if (i < first || token === CODE) return;
    if (i > 0 && raw[i - 1].endsWith(":")) return;
    token.split("-").forEach((part, k) => {
      if (i === first && k === 0) return;
      if (!/^\p{Lu}\p{Ll}/u.test(part) || /\p{Lu}/u.test(part.slice(1))) return;
      if (covered.has(i) || singles.has(token) || singles.has(part)) return;
      out.push(part);
    });
  });
  return out;
}

/** Headings and the frontmatter title of one Markdown file: [{ line, text }]. */
export function entries(md) {
  const out = [];
  const lines = md.split(/\r?\n/);
  let i = 0;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) {
      for (let n = 1; n < end; n++) {
        const m = lines[n].match(/^title:\s*(.*?)\s*$/);
        if (m) out.push({ line: n + 1, text: m[1].replace(/^(["'])(.*)\1$/, "$2") });
      }
      i = end + 1;
    }
  }
  let fence = null;
  for (; i < lines.length; i++) {
    const f = lines[i].match(/^ {0,3}(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const h = lines[i].match(/^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/);
    if (h && h[1]) out.push({ line: i + 1, text: h[1] });
  }
  return out;
}

/** The link texts of SUMMARY.md: [{ line, text }]. */
export function summaryLabels(md) {
  const out = [];
  md.split(/\r?\n/).forEach((line, n) => {
    const m = line.match(/^\s*\*\s+\[([^\]]+)\]\(([^)]+\.md)\)/);
    if (m) out.push({ line: n + 1, text: m[1] });
  });
  return out;
}

function checkHeadings(dir, files, allow) {
  const found = [];
  let read = 0;
  for (const file of files) {
    const md = readFileSync(join(dir, file), "utf8");
    for (const e of file === "SUMMARY.md" ? summaryLabels(md) : entries(md)) {
      read++;
      for (const word of violations(e.text, allow)) {
        found.push(`${file}:${e.line}: ${e.text}  (word: ${word})`);
      }
    }
  }
  return { found, read };
}

// ----------------------------------------------------------- guideline links

// The repository name must end there: pyck-ai/guidelines-foo is another repository.
export const GUIDELINE_PATTERN =
  /(?:github(?:usercontent)?\.com[/:](?:repos\/)?pyck-ai\/guidelines|pyck-ai\.github\.io\/guidelines|\.pyck\/guidelines)(?![\w-])/gi;

/** The guideline links of one Markdown file, code fences included: [{ line, match }]. */
export function guidelineHits(md) {
  const out = [];
  md.split(/\r?\n/).forEach((text, n) => {
    for (const m of text.matchAll(GUIDELINE_PATTERN)) out.push({ line: n + 1, match: m[0] });
  });
  return out;
}

function checkGuidelineLinks(dir, files) {
  return files.flatMap((file) =>
    guidelineHits(readFileSync(join(dir, file), "utf8")).map(
      (h) => `${file}:${h.line}: ${h.match}`,
    ),
  );
}

// -------------------------------------------------------------- markdownlint

// `<file>:<line>[:<column>] error <rule> <description>`, on stderr.
const LINT_LINE = /^(.+?):(\d+)(?::\d+)? (?:error|warning) (.*)$/;

/**
 * Runs markdownlint-cli2 on `files` (relative to `dir`) and returns the findings as
 * `file:line: <rule> <description>` lines. Throws when it does not run: exit code 2
 * (bad config, crash) or no `npx`. `npx` downloads the pinned version on first use.
 */
function defaultLint({ dir, files, config }) {
  const args = [
    "--yes",
    `markdownlint-cli2@${MARKDOWNLINT_VERSION}`,
    "--config",
    config,
    // A leading colon names a literal path, so a file name is never read as a glob.
    ...files.map((f) => `:${f}`),
  ];
  const res = spawnSync("npx", args, { cwd: dir, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (res.error) throw new Error(`markdownlint-cli2 did not run: ${res.error.message}`);
  const found = [];
  for (const raw of res.stderr.split(/\r?\n/)) {
    const m = LINT_LINE.exec(raw);
    if (m) found.push(`${m[1]}:${m[2]}: ${m[3]}`);
  }
  if (res.status !== 0 && found.length === 0) {
    throw new Error(`markdownlint-cli2 exited ${res.status}:\n${res.stderr}${res.stdout}`);
  }
  return found;
}

// ----------------------------------------------------------------- arguments

/** The options, or `{ exit }` when the arguments end the run early (--help, a bad flag). */
function parseArgs(argv, env, log, error) {
  if (env.GITHUB_ACTIONS === "true") {
    return {
      path: env.INPUT_PATH || "docs",
      extraWords: env["INPUT_EXTRA-WORDS"] || "",
      markdownlintConfig: env["INPUT_MARKDOWNLINT-CONFIG"] || "",
    };
  }
  const opts = { path: "docs", extraWords: "", markdownlintConfig: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--extra-words") opts.extraWords = argv[++i] ?? "";
    else if (a === "--markdownlint-config") opts.markdownlintConfig = argv[++i] ?? "";
    else if (a === "-h" || a === "--help") {
      log("usage: node check.mjs [path] [--extra-words <file>] [--markdownlint-config <file>]");
      return { exit: 0 };
    } else if (a.startsWith("-")) {
      error(`docs-check: unknown option ${a}`);
      return { exit: 2 };
    } else opts.path = a;
  }
  return opts;
}

// ---------------------------------------------------------------------- main

/** `lint` is injectable so tests need not start npx; it has defaultLint's signature. */
export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  cwd = process.cwd(),
  log = console.log,
  error = console.error,
  lint = defaultLint,
} = {}) {
  try {
    return run(argv, env, cwd, log, error, lint);
  } catch (err) {
    if (err instanceof UsageError) {
      error(`docs-check: ${err.message}`);
      return 2;
    }
    error(err instanceof Error ? (err.stack ?? String(err)) : String(err));
    return 1;
  }
}

function inputFile(cwd, name, what) {
  const file = resolve(cwd, name);
  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) {
    throw new UsageError(`${what} "${name}" is not a file`);
  }
  return file;
}

function run(argv, env, cwd, log, error, lint) {
  const opts = parseArgs(argv, env, log, error);
  if ("exit" in opts) return opts.exit;
  const dir = resolve(cwd, opts.path);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new UsageError(`not a directory: ${opts.path}`);
  }
  const files = markdownFiles(dir);
  if (files.length === 0) throw new UsageError(`no Markdown file to check in ${opts.path}`);
  const extra = opts.extraWords
    ? readFileSync(inputFile(cwd, opts.extraWords, "extra-words file"), "utf8")
    : "";
  const config = opts.markdownlintConfig
    ? inputFile(cwd, opts.markdownlintConfig, "markdownlint-config file")
    : DEFAULT_CONFIG;
  const allow = parseAllow(`${readFileSync(BUNDLED_WORDS, "utf8")}\n${extra}`);

  const headings = checkHeadings(dir, files, allow);
  const checks = [
    {
      name: "headings",
      found: headings.found,
      ok: `all ${headings.read} headings, titles and labels are in sentence case`,
      bad: (n) =>
        `${n} word(s) in headings, titles or labels are not in sentence case. Use a lowercase first letter, or add a proper noun to the extra-words file.`,
    },
    {
      name: "guideline-links",
      found: checkGuidelineLinks(dir, files),
      ok: `no link to the company guidelines in ${files.length} pages`,
      bad: (n) =>
        `${n} link(s) to the company guidelines. They bind pyck contributors and employees, not customers: remove the link.`,
    },
    {
      name: "markdownlint",
      found: lint({ dir, files, config }),
      ok: `markdownlint ${MARKDOWNLINT_VERSION}: no finding in ${files.length} files`,
      bad: (n) => `${n} markdownlint finding(s).`,
    },
  ];
  let failed = false;
  for (const c of checks) {
    for (const line of c.found) log(line);
    if (c.found.length) {
      failed = true;
      error(`docs-check ${c.name}: ${c.bad(c.found.length)}`);
    } else log(`docs-check ${c.name}: ${c.ok}`);
  }
  return failed ? 1 : 0;
}

// Node resolves symlinks in the main module's URL but not in argv[1], so both
// sides compare as real paths: a checkout reached through a symlink must still run.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exit(await main());
}
