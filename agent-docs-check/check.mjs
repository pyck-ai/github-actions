#!/usr/bin/env node
// agent-docs-check: budgets and hygiene for agent-facing docs.
//
// Plain ESM, Node stdlib only, no build step: it runs as a `node24` JavaScript
// action on the runner's bundled Node and locally as
//   node agent-docs-check/check.mjs [path] [--profile repo|central]
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
} from "node:fs";
import { basename, join, normalize, relative, resolve } from "node:path";

const LIMITS = {
  repo: { rootLines: 60, rootBytes: 4096 },
  central: { rootLines: 40, rootBytes: 3072 },
};
const NESTED_AGENTS = LIMITS.repo;
const AGENT_FILE_MAX_LINES = 200;

const SKILL_DIR_RE = /(?:^|\/)\.(?:claude|opencode|agents)\/skills\/([^/]+)\//;
const TOP_SKILL_DIR_RE = /^skills\/([^/]+)\//;

/** @typedef {{ level: "error" | "warning", file: string, line?: number, msg: string }} Finding */

// ---------------------------------------------------------------- arguments

function parseArgs(argv, env) {
  if (env.GITHUB_ACTIONS === "true") {
    return {
      path: env.INPUT_PATH || ".",
      profile: env.INPUT_PROFILE || "repo",
      actions: true,
    };
  }
  const opts = {
    path: ".",
    profile: "repo",
    actions: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--profile") opts.profile = argv[++i] ?? "";
    else if (a.startsWith("--profile=")) opts.profile = a.slice("--profile=".length);
    else if (a === "-h" || a === "--help") {
      console.log("usage: node check.mjs [path] [--profile repo|central]");
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

/** Does the path run through a `fixtures/` or `testdata/` directory? */
const hasFixtureSegment = (rel) =>
  rel.split("/").some((seg) => ["fixtures", "testdata"].includes(seg));

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
  return { files, broken, topSkills };
}

// -------------------------------------------------------------- text helpers

function splitLines(text) {
  const lines = text.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// ----------------------------------------------------------------- the checks

async function check(root, profile) {
  /** @type {Finding[]} */
  const findings = [];
  const add = (level, file, line, msg) => findings.push({ level, file, line, msg });
  const limits = LIMITS[profile];
  const { files, broken, topSkills } = listFiles(root);
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
  }

  return { findings, checked };
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

  const { findings, checked } = await check(root, opts.profile);
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
