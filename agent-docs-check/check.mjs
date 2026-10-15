#!/usr/bin/env node
// agent-docs-check: budgets and hygiene for agent-facing docs.
//
// Plain ESM, Node stdlib only, no build step: it runs as a `node24` JavaScript
// action on the runner's bundled Node and locally as
//   node agent-docs-check/check.mjs [path] [--profile repo|central] [--fix]
//     [--require-skill-harness]
// Exit 1 if any error was found, 0 otherwise (warnings do not fail).

import { execFileSync } from "node:child_process";
import {
  lstatSync,
  existsSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, normalize, relative, resolve } from "node:path";

const LIMITS = {
  repo: { rootLines: 60, rootBytes: 4096 },
  central: { rootLines: 40, rootBytes: 3072 },
};
const NESTED_AGENTS = LIMITS.repo;
const AGENT_FILE_MAX_LINES = 200;
const TOC_MIN_H2 = 2;
const DESCRIPTION_MAX = 1024;
const SKILL_HARNESSES = ["generic", "opencode"];

const SKILL_DIR_RE = /(?:^|\/)\.(?:claude|opencode|agents)\/skills\/([^/]+)\//;
const TOP_SKILL_DIR_RE = /^skills\/([^/]+)\//;

/** @typedef {{ level: "error" | "warning", file: string, line?: number, msg: string }} Finding */

// ---------------------------------------------------------------- arguments

function parseArgs(argv, env) {
  if (env.GITHUB_ACTIONS === "true") {
    return {
      path: env.INPUT_PATH || ".",
      profile: env.INPUT_PROFILE || "repo",
      fix: (env.INPUT_FIX || "false").toLowerCase() === "true",
      requireSkillHarness: (env["INPUT_REQUIRE-SKILL-HARNESS"] || "false").toLowerCase() === "true",
      actions: true,
    };
  }
  const opts = {
    path: ".",
    profile: "repo",
    fix: false,
    requireSkillHarness: false,
    actions: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--profile") opts.profile = argv[++i] ?? "";
    else if (a.startsWith("--profile=")) opts.profile = a.slice("--profile=".length);
    else if (a === "--fix") opts.fix = true;
    else if (a === "--require-skill-harness") opts.requireSkillHarness = true;
    else if (a === "-h" || a === "--help") {
      console.log(
        "usage: node check.mjs [path] [--profile repo|central] [--fix] [--require-skill-harness]",
      );
      process.exit(0);
    } else if (a.startsWith("-")) {
      console.error(`agent-docs-check: unknown option ${a}`);
      process.exit(2);
    } else opts.path = a;
  }
  return opts;
}

// ------------------------------------------------------------------ file set

/**
 * Top-level `skills/<name>/` dirs that hold a SKILL.md, as a Set of names.
 * A `skills/<name>/` without a SKILL.md is a plain directory, not a skill.
 */
const topSkillNames = (rels) =>
  new Set(rels.map((r) => /^skills\/([^/]+)\/SKILL\.md$/.exec(r)?.[1]).filter(Boolean));

/**
 * The skill name when rel is inside a skill dir, else null. Skill dirs are
 * `.claude|.opencode|.agents/skills/<name>/` (any depth) and a top-level
 * `skills/<name>/` that contains a SKILL.md (names in topSkills).
 */
function skillDirOf(rel, topSkills) {
  const dot = SKILL_DIR_RE.exec(rel);
  if (dot) return dot[1];
  const top = TOP_SKILL_DIR_RE.exec(rel);
  return top && topSkills.has(top[1]) ? top[1] : null;
}

/** Files whose size is limited: anything inside a skill dir, and CODING_STANDARDS.md. */
const isAgentSized = (rel, topSkills) =>
  skillDirOf(rel, topSkills) !== null || basename(rel) === "CODING_STANDARDS.md";

function listFiles(root) {
  /** @type {string[]} */
  let rels;
  let gitTree = false;
  try {
    execFileSync("git", ["-C", root, "rev-parse", "--is-inside-work-tree"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    gitTree = true;
  } catch {
    gitTree = false;
  }
  if (gitTree) {
    // Tracked plus untracked-but-not-ignored, so a new file is checked before
    // it is committed. Deleted-but-tracked files are dropped below.
    const out = execFileSync(
      "git",
      ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { maxBuffer: 256 * 1024 * 1024 },
    ).toString("utf8");
    rels = [...new Set(out.split("\0").filter(Boolean))];
  } else {
    rels = [];
    const walk = (dir) => {
      for (const ent of readdirSync(join(root, dir), { withFileTypes: true })) {
        if (ent.name === ".git" || ent.name === "node_modules") continue;
        const rel = dir ? `${dir}/${ent.name}` : ent.name;
        if (ent.isDirectory()) walk(rel);
        else rels.push(rel);
      }
    };
    walk("");
  }
  // Regular files, plus symlinks that can carry agent-file content (inside a
  // skill dir, or named CODING_STANDARDS.md): those are followed and counted
  // by their target's size, and reported as `broken` when the target is
  // missing. Other symlinks are skipped so their target is counted once,
  // under its own name.
  /** @type {{ rel: string, target: string }[]} */
  const broken = [];
  // Test fixtures break the rules on purpose (this repo's own fixtures do),
  // so nothing under a `fixtures/` or `testdata/` segment is checked.
  const topSkills = topSkillNames(rels.filter((rel) => !hasFixtureSegment(rel)));
  const files = rels
    .filter((rel) => !hasFixtureSegment(rel))
    .filter((rel) => {
      let st;
      try {
        st = lstatSync(join(root, rel));
      } catch {
        return false;
      }
      if (st.isFile()) return true;
      if (!st.isSymbolicLink() || !isAgentSized(rel, topSkills)) return false;
      try {
        return statSync(join(root, rel)).isFile();
      } catch {
        broken.push({ rel, target: readlinkSync(join(root, rel)) });
        return false;
      }
    })
    .sort();
  broken.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  return { files, gitTree, broken, topSkills };
}

/**
 * Files matched by `.tocignore` files, with gitignore syntax and semantics:
 * git's own matcher does the work (any number of `.tocignore` files at any
 * depth, negation, anchoring, dir-only, `**`, escapes, later rules win, no
 * re-including below an excluded directory). `-c -o -i` lists tracked and
 * untracked files matched by the per-directory exclude file; without
 * `--exclude-standard` no `.gitignore` is mixed in. Outside a git work tree
 * there is no matcher: `.tocignore` files are ignored, with one warning.
 * Returns `warning`: the message to report, or null.
 */
function tocIgnoredFiles(root, gitTree, files) {
  const hasTocIgnore = files.some((f) => basename(f) === ".tocignore");
  if (!gitTree) {
    return {
      ignored: new Set(),
      warning: hasTocIgnore
        ? ".tocignore needs a git work tree (it uses git's matcher); not a git work tree, so .tocignore is ignored"
        : null,
    };
  }
  try {
    const out = execFileSync(
      "git",
      ["-C", root, "ls-files", "-z", "-c", "-o", "-i", "--exclude-per-directory=.tocignore"],
      { maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    ).toString("utf8");
    return { ignored: new Set(out.split("\0").filter(Boolean)), warning: null };
  } catch (err) {
    // git found the work tree but could not list the matches: same outcome
    // as no matcher (one warning), never a crash.
    const stderr = err?.stderr?.toString("utf8") ?? "";
    const reason = stderr.split("\n").find((l) => l.trim()) ?? err?.message ?? "no output";
    return {
      ignored: new Set(),
      warning: hasTocIgnore
        ? `could not apply .tocignore (git ls-files failed: ${reason.trim()}); exemptions ignored`
        : null,
    };
  }
}

// -------------------------------------------------------------- text helpers

function splitLines(text) {
  const lines = text.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Lines annotated with whether they sit inside a fenced code block. */
function annotateFences(lines) {
  let fence = null; // { ch, len }
  return lines.map((text, i) => {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    let inFence = fence !== null;
    if (m) {
      const marker = m[1];
      if (fence === null) {
        fence = { ch: marker[0], len: marker.length };
        inFence = true;
      } else if (marker[0] === fence.ch && marker.length >= fence.len && m[2].trim() === "") {
        fence = null;
        inFence = true; // the closing line itself is still fence
      }
    }
    return { line: i + 1, text, inFence };
  });
}

const NESTED_LINE_RE = /^[ \t]+([A-Za-z0-9_.-]+):[ \t]*(.*)$/;

/** Strip one pair of matching quotes. */
function unquote(value) {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/** An unquoted plain scalar that YAML rejects (": ") or misreads (" #", trailing ":"). */
function badPlainScalar(raw) {
  const plain = raw.trim();
  return (
    plain !== "" &&
    !/^["'|>[{]/.test(plain) &&
    (plain.includes(": ") || plain.includes(" #") || plain.endsWith(":"))
  );
}

/**
 * Parse leading `---` frontmatter. Returns null when absent.
 *
 * A lenient line parser, not YAML. `fields` maps each top-level key to its
 * scalar text (continuation lines joined). One nested level is also read: a
 * `key:` line with an empty value followed by indented `child: value` lines
 * (and nothing else) is a map, returned in `maps[key]`; `fields[key]` keeps
 * the joined text for such a key.
 */
function parseFrontmatter(lines) {
  if (lines[0]?.trim() !== "---") return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const fields = {};
  const maps = {};
  const yamlIssues = [];
  for (let i = 1; i < end; i++) {
    const m = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const [, key, raw] = m;
    // An unquoted plain scalar that YAML rejects (": ") or misreads (" #", trailing ":").
    if (badPlainScalar(raw)) yamlIssues.push({ line: i + 1, key });
    const cont = [];
    const contLines = [];
    while (i + 1 < end && /^[ \t]+\S|^[ \t]*$/.test(lines[i + 1])) {
      cont.push(lines[i + 1].trim());
      contLines.push({ line: i + 2, text: lines[i + 1] });
      i++;
    }
    const nested = contLines.filter((c) => c.text.trim() !== "");
    if (
      raw.trim() === "" &&
      nested.length > 0 &&
      nested.every((c) => NESTED_LINE_RE.test(c.text))
    ) {
      const map = {};
      for (const c of nested) {
        const [, child, childRaw] = NESTED_LINE_RE.exec(c.text);
        if (badPlainScalar(childRaw)) yamlIssues.push({ line: c.line, key: `${key}.${child}` });
        map[child] = unquote(childRaw.trim());
      }
      maps[key] = map;
    }
    let value;
    if (/^[>|][+-]?$/.test(raw.trim())) {
      value = raw.trim().startsWith("|") ? cont.join("\n") : cont.join(" ");
    } else {
      value = [raw.trim(), ...cont].filter(Boolean).join(" ");
    }
    fields[key] = unquote(value.trim());
  }
  return { fields, maps, yamlIssues, endLine: end + 1 }; // endLine: 1-based line of the closing ---
}

// ----------------------------------------------------------------------- TOC

/** Heading/list text compared without inline markdown and extra whitespace. */
function normHeading(s) {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`+/g, "")
    .replace(/\*+/g, "")
    .replace(/(?<![A-Za-z0-9])_+|_+(?![A-Za-z0-9])/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** GitHub's heading slug, without the duplicate suffix. */
const slugOf = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replace(/ /g, "-");

/**
 * Every ATX heading outside fenced code with its GitHub anchor. Duplicates get
 * -1, -2, ... in order of appearance, counted over all heading levels as
 * GitHub does.
 */
function headingsWithAnchors(lines) {
  const seen = new Map();
  const out = [];
  for (const l of annotateFences(lines)) {
    if (l.inFence) continue;
    const m = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(l.text);
    if (!m) continue;
    const text = normHeading(m[2]);
    const slug = slugOf(text);
    const n = seen.get(slug) ?? 0;
    seen.set(slug, n + 1);
    out.push({ line: l.line, level: m[1].length, text, anchor: n ? `${slug}-${n}` : slug });
  }
  return out;
}

const TOC_OPEN_VISIBLE = "<!-- toc -->";
const TOC_CLOSE_VISIBLE = "<!-- /toc -->";
const TOC_OPEN_HIDDEN = "<!-- toc";
const TOC_CLOSE_HIDDEN = "-->";

/** Does the path run through a `fixtures/` or `testdata/` (or listed extra) directory? */
const hasFixtureSegment = (rel, extra = []) =>
  rel.split("/").some((seg) => ["fixtures", "testdata", ...extra].includes(seg));

/** Is this markdown file a doc that needs a table of contents? */
function isTocDoc(rel, lines) {
  const name = basename(rel);
  if (name === "AGENTS.md" || name === "SKILL.md") return false;
  if (/^CHANGELOG/i.test(name) || /^PULL_REQUEST_TEMPLATE/i.test(name)) return false;
  if (/(?:^|\/)\.github\/ISSUE_TEMPLATE\//.test(rel)) return false;
  if (hasFixtureSegment(rel, ["node_modules"])) return false;
  if (lines.slice(0, 5).some((l) => l.includes("DO NOT EDIT"))) return false;
  return true;
}

const CONTENTS_HEADING = "## Contents";

/** Locate the managed region before the first section heading (`limitLine`). */
function findRegion(lines, limitLine) {
  for (const l of annotateFences(lines)) {
    if (l.line >= limitLine) break;
    if (l.inFence) continue;
    const t = l.text.trimEnd();
    const hidden = t === TOC_OPEN_HIDDEN;
    if (t !== TOC_OPEN_VISIBLE && !hidden) continue;
    const closeMarker = hidden ? TOC_CLOSE_HIDDEN : TOC_CLOSE_VISIBLE;
    const open = l.line - 1;
    const close = lines.findIndex((x, k) => k > open && x.trimEnd() === closeMarker);
    return { open, close, hidden };
  }
  return null;
}

/** Item lines of a region body: { text, anchor | null } per non-blank line. */
function parseItems(body) {
  return body
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const m = /^[ \t]*[-*+][ \t]+\[(.*)\]\(#([^)\s]*)\)[ \t]*$/.exec(l);
      if (m) return { text: normHeading(m[1]), anchor: m[2] };
      return { text: normHeading(l.replace(/^[ \t]*[-*+][ \t]+/, "")), anchor: null };
    });
}

/** Describe how `listed` differs from `expected` (both { text, anchor }), or null when equal. */
function diffToc(expected, listed) {
  const et = expected.map((e) => e.text);
  const lt = listed.map((e) => e.text);
  const parts = [];
  if (!(et.length === lt.length && et.every((h, i) => h === lt[i]))) {
    const surplus = (a, b) => {
      const c = new Map();
      for (const h of b) c.set(h, (c.get(h) ?? 0) + 1);
      const out = [];
      for (const h of a) {
        if (c.get(h)) c.set(h, c.get(h) - 1);
        else out.push(h);
      }
      return out;
    };
    const missing = surplus(et, lt);
    const extra = surplus(lt, et);
    if (missing.length) parts.push(`missing: ${missing.map((h) => `"${h}"`).join(", ")}`);
    if (extra.length) parts.push(`extra: ${extra.map((h) => `"${h}"`).join(", ")}`);
    if (!parts.length) {
      const i = et.findIndex((h, k) => h !== lt[k]);
      parts.push(`out of order: expected "${et[i]}" at position ${i + 1}, found "${lt[i]}"`);
    }
  } else {
    for (let i = 0; i < expected.length; i++) {
      if (expected[i].anchor !== listed[i].anchor) {
        parts.push(
          `wrong anchor for "${expected[i].text}": expected #${expected[i].anchor}, found ${listed[i].anchor === null ? "no link" : `#${listed[i].anchor}`}`,
        );
      }
    }
  }
  return parts.length
    ? `table of contents does not match the "##" headings (${parts.join("; ")})`
    : null;
}

/**
 * Analyse the TOC of one doc. Returns { problems, sections, region } where each
 * problem is { code, msg, line, fix } and `fix` says whether --fix repairs it.
 * `## Contents` inside a region is part of the region; outside one it is
 * `toc-unmanaged`. Neither counts as a section.
 */
function analyzeToc(lines, fm) {
  const h2 = headingsWithAnchors(lines).filter((h) => h.level === 2);
  const isContents = (h) => h.text.toLowerCase() === "contents";
  const firstSection = h2.find((h) => !isContents(h));
  const limit = firstSection ? firstSection.line : Infinity;
  const region = findRegion(lines, limit);
  const inRegion = (h) =>
    region !== null &&
    h.line - 1 > region.open &&
    (region.close === -1 || h.line - 1 < region.close);
  const unmanaged = h2.find((h) => isContents(h) && !inRegion(h));
  const sections = h2.filter((h) => !isContents(h));
  const top = fm ? fm.endLine + 1 : 1;
  const problems = [];
  const prob = (code, line, msg, fix) => problems.push({ code, line, msg, fix });

  const legacyAt = annotateFences(lines).find(
    (l) => !l.inFence && l.line < limit && /^\s*<!--\s*Contents:/.test(l.text),
  );
  if (legacyAt) {
    prob(
      "toc-legacy",
      legacyAt.line,
      'the "<!-- Contents: ... -->" comment is no longer accepted; replace it with the managed region (--fix removes it)',
      true,
    );
  }
  if (unmanaged) {
    prob(
      "toc-unmanaged",
      unmanaged.line,
      `a "## Contents" heading outside a managed region is not a table of contents; replace it with the managed region ("${TOC_OPEN_VISIBLE}", "${CONTENTS_HEADING}", a blank line, the list, "${TOC_CLOSE_VISIBLE}"; or hidden: "${TOC_OPEN_HIDDEN}" ... "${TOC_CLOSE_HIDDEN}")`,
      false,
    );
  }
  if (sections.length < TOC_MIN_H2) return { problems, sections, region };

  if (!region && !unmanaged) {
    prob(
      "toc-missing",
      top,
      `${sections.length} "##" headings and no managed table of contents region (add "${TOC_OPEN_HIDDEN}", "${CONTENTS_HEADING}", a blank line, a list of "- [Heading](#anchor)" items and "${TOC_CLOSE_HIDDEN}" before the first "##" heading; --fix inserts it after the H1)`,
      true,
    );
  } else if (region && region.close === -1) {
    prob(
      "toc-missing",
      region.open + 1,
      `table of contents region opened with "${lines[region.open].trimEnd()}" is never closed`,
      false,
    );
  } else if (region) {
    const body = lines.slice(region.open + 1, region.close);
    const at = body.findIndex((l) => l.trim() !== "");
    const hasHeading = at !== -1 && body[at].trim() === CONTENTS_HEADING;
    const blankAfter = hasHeading && body[at + 1]?.trim() === "";
    const diff = diffToc(sections, parseItems(hasHeading ? body.slice(at + 1) : body));
    if (diff) prob("toc-stale", region.open + 1, diff, true);
    else if (!hasHeading || !blankAfter) {
      prob(
        "toc-stale",
        region.open + 1,
        `table of contents region must start with "${CONTENTS_HEADING}" followed by a blank line`,
        true,
      );
    }
  }
  return { problems, sections, region };
}

/** The exact lines between the markers for the given sections. */
const regionBody = (sections) => [CONTENTS_HEADING, "", ...tocItems(sections)];

const tocItems = (sections) => sections.map((s) => `- [${s.text}](#${s.anchor})`);

/** Repair the TOC of one file in place. Returns true when the file changed. */
function fixToc(root, rel) {
  const abs = join(root, rel);
  const raw = readFileSync(abs, "utf8");
  let lines = raw.split("\n");

  // 1. Remove a legacy "Contents" comment, and one blank line after it.
  const legacy = analyzeToc(lines, parseFrontmatter(lines)).problems.find(
    (p) => p.code === "toc-legacy",
  );
  if (legacy) {
    const start = legacy.line - 1;
    let end = start;
    while (end < lines.length && !lines[end].includes("-->")) end++;
    if (lines[end + 1]?.trim() === "") end++;
    lines = [...lines.slice(0, start), ...lines.slice(end + 1)];
  }

  // 2. Insert or rewrite the managed region.
  const fm = parseFrontmatter(lines);
  const a = analyzeToc(lines, fm);
  const missing = a.problems.find((p) => p.code === "toc-missing" && p.fix);
  const stale = a.problems.find((p) => p.code === "toc-stale");
  if (stale) {
    lines = [
      ...lines.slice(0, a.region.open + 1),
      ...regionBody(a.sections),
      ...lines.slice(a.region.close),
    ];
  } else if (missing) {
    const region = [TOC_OPEN_HIDDEN, ...regionBody(a.sections), TOC_CLOSE_HIDDEN];
    const firstH2 = a.sections[0].line;
    const h1 = headingsWithAnchors(lines).find((h) => h.level === 1 && h.line < firstH2);
    const after = h1 ? h1.line : fm ? fm.endLine : 0; // insert after this many lines
    const blankBefore = h1 || fm;
    const needBlankAfter = lines[after]?.trim() !== "";
    lines = [
      ...lines.slice(0, after),
      ...(blankBefore ? [""] : []),
      ...region,
      ...(needBlankAfter ? [""] : []),
      ...lines.slice(after),
    ];
  }

  const out = lines.join("\n");
  if (out === raw) return false;
  writeFileSync(abs, out);
  return true;
}

// ----------------------------------------------------------------- the checks

async function check(root, profile, requireSkillHarness) {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {{ rel: string }[]} */
  const tocFixes = [];
  const add = (level, file, line, msg) => findings.push({ level, file, line, msg });
  const limits = LIMITS[profile];
  const { files, gitTree, broken, topSkills } = listFiles(root);
  const tocIgnore = tocIgnoredFiles(root, gitTree, files);
  if (tocIgnore.warning) add("warning", ".tocignore", undefined, tocIgnore.warning);
  for (const { rel, target } of broken) {
    add(
      "error",
      rel,
      undefined,
      `broken-symlink: ${rel} points to ${target}, which does not exist (rename or move of the target?)`,
    );
  }
  let checked = 0;

  if (!files.includes("AGENTS.md")) {
    add("warning", "AGENTS.md", undefined, "missing root AGENTS.md (rule: every repo has one)");
  }

  for (const rel of files) {
    const name = basename(rel);
    const skillName = skillDirOf(rel, topSkills);
    const inSkill = skillName !== null;
    const isMd = name.endsWith(".md");
    const isAgents = name === "AGENTS.md";
    const isSkillMd = inSkill && rel.endsWith(`skills/${skillName}/SKILL.md`);
    const isCoding = name === "CODING_STANDARDS.md";
    const sizeLimited = inSkill || isCoding;
    const isLink = lstatSync(join(root, rel)).isSymbolicLink();

    // Rule 1
    if (name === "CLAUDE.md" && !hasFixtureSegment(rel)) {
      add(
        "error",
        rel,
        undefined,
        "no-claude-md: CLAUDE.md must not exist; delete it (tools read AGENTS.md)",
      );
    }

    if (!isMd && !sizeLimited) continue;

    const buf = readFileSync(join(root, rel)); // follows symlinks
    if (buf.includes(0)) continue; // binary
    const text = buf.toString("utf8");
    const lines = splitLines(text);

    // Rule 3: only agent files (loaded whole) have a line limit.
    if (sizeLimited && lines.length > AGENT_FILE_MAX_LINES) {
      let via = "";
      if (isLink) {
        const target = realpathSync(join(root, rel));
        const rootReal = realpathSync(root);
        via = ` (symlink to ${target.startsWith(rootReal + "/") ? relative(rootReal, target) : target})`;
      }
      add(
        "error",
        rel,
        AGENT_FILE_MAX_LINES + 1,
        `agent-file-size: ${lines.length} lines${via}, limit is ${AGENT_FILE_MAX_LINES} for agent files (skill dirs, CODING_STANDARDS.md)`,
      );
    }

    // A symlink is checked for size only; its target is checked under its own name.
    if (isLink) {
      checked++;
      continue;
    }
    checked++;

    // Rule 2
    if (isAgents) {
      const lim = rel === "AGENTS.md" ? limits : NESTED_AGENTS;
      const which = rel === "AGENTS.md" ? `root AGENTS.md (${profile})` : "nested AGENTS.md";
      if (lines.length > lim.rootLines) {
        add(
          "error",
          rel,
          lim.rootLines + 1,
          `agents-md-budget: ${which} has ${lines.length} lines, limit is ${lim.rootLines}`,
        );
      }
      if (buf.length > lim.rootBytes) {
        add(
          "error",
          rel,
          undefined,
          `agents-md-budget: ${which} is ${buf.length} bytes, limit is ${lim.rootBytes}`,
        );
      }
    }

    // Rule 4: every doc with two or more `##` headings has a table of contents.
    const fm = isMd ? parseFrontmatter(lines) : null;
    for (const y of fm?.yamlIssues ?? []) {
      add(
        "error",
        rel,
        y.line,
        `frontmatter-yaml: the value of "${y.key}" is an unquoted YAML scalar that contains ": " or " #" or ends with ":"; quote the value (YAML reads ": " as a new key and " #" as a comment)`,
      );
    }
    if (isMd && !tocIgnore.ignored.has(rel) && isTocDoc(rel, lines)) {
      const { problems } = analyzeToc(lines, fm);
      for (const p of problems) add("error", rel, p.line, `${p.code}: ${p.msg}`);
      if (problems.some((p) => p.fix)) tocFixes.push({ rel });
    }

    // Rule 5
    if (isSkillMd) {
      const dir = skillName;
      if (!fm) {
        add(
          "error",
          rel,
          1,
          "skill-frontmatter: SKILL.md needs YAML frontmatter (--- name, description ---)",
        );
      } else {
        const { name: n, description: d } = fm.fields;
        if (n === undefined || n === "") {
          add("error", rel, 1, "skill-frontmatter: missing name");
        } else {
          if (n !== dir) {
            add(
              "error",
              rel,
              1,
              `skill-frontmatter: name "${n}" must equal the directory name "${dir}"`,
            );
          }
          if (!/^[a-z0-9-]{1,64}$/.test(n)) {
            add("error", rel, 1, `skill-frontmatter: name "${n}" must match ^[a-z0-9-]{1,64}$`);
          }
          if (/anthropic|claude/.test(n)) {
            add(
              "error",
              rel,
              1,
              `skill-frontmatter: name "${n}" must not contain "anthropic" or "claude"`,
            );
          }
        }
        if (d === undefined || d === "") {
          add("error", rel, 1, "skill-frontmatter: missing or empty description");
        } else {
          if (d.length > DESCRIPTION_MAX) {
            add(
              "error",
              rel,
              1,
              `skill-frontmatter: description is ${d.length} chars, limit is ${DESCRIPTION_MAX}`,
            );
          }
          if (/[<>]/.test(d)) {
            add("error", rel, 1, "skill-frontmatter: description must not contain < or >");
          }
        }

        // Rule 5c: where the skill is installed, in `metadata.harness`.
        const hasMetadata = Object.hasOwn(fm.fields, "metadata");
        const metadata = fm.maps.metadata;
        if (hasMetadata && !metadata) {
          add(
            "error",
            rel,
            1,
            "skill-harness: metadata must be a map of indented `key: value` lines (metadata:, then e.g. `  harness: generic`)",
          );
        } else if (metadata && Object.hasOwn(metadata, "harness")) {
          if (!SKILL_HARNESSES.includes(metadata.harness)) {
            add(
              "error",
              rel,
              1,
              `skill-harness: metadata.harness is "${metadata.harness}", must be ${SKILL_HARNESSES.join(" or ")}`,
            );
          }
        } else if (requireSkillHarness) {
          add(
            "error",
            rel,
            1,
            `skill-harness: missing metadata.harness (${SKILL_HARNESSES.join(" or ")}); add "metadata:" with an indented "harness: <value>" line`,
          );
        }
      }
    }
  }

  return { findings, checked, tocFixes };
}

// --------------------------------------------------------------------- output

const escData = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escProp = (s) => escData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");

function display(inputPath, rel) {
  const p = normalize(join(inputPath, rel));
  return p.startsWith("./") ? p.slice(2) : p;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2), process.env);
  if (!(opts.profile in LIMITS)) {
    console.error(`agent-docs-check: unknown profile "${opts.profile}" (use repo or central)`);
    process.exit(2);
  }
  const root = resolve(opts.path);
  if (!existsSync(root)) {
    console.error(`agent-docs-check: path "${opts.path}" does not exist`);
    process.exit(2);
  }

  let result = await check(root, opts.profile, opts.requireSkillHarness);
  if (opts.fix) {
    for (const { rel } of result.tocFixes) {
      if (fixToc(root, rel)) console.log(`fixed: ${display(opts.path, rel)}`);
    }
    if (result.tocFixes.length) result = await check(root, opts.profile, opts.requireSkillHarness);
  }
  const { findings, checked } = result;
  for (const f of findings) {
    const file = display(opts.path, f.file);
    if (opts.actions) {
      const props = `file=${escProp(file)},line=${f.line ?? 1}`;
      console.log(`::${f.level} ${props}::${escData(f.msg)}`);
    } else {
      console.log(`${file}:${f.line ?? 1}: ${f.level === "warning" ? "warning: " : ""}${f.msg}`);
    }
  }
  const errors = findings.filter((f) => f.level === "error").length;
  const warnings = findings.length - errors;
  console.log(
    `agent-docs-check: ${errors} error(s), ${warnings} warning(s), ${checked} file(s) checked (profile ${opts.profile})`,
  );
  process.exit(errors > 0 ? 1 : 0);
}

await main();
