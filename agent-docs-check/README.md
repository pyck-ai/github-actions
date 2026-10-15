# agent-docs-check

<!-- toc
## Contents

- [Usage](#usage)
- [Rules](#rules)
- [Exclusions](#exclusions)
-->

Keeps agent-facing docs inside their budgets.

A plain JavaScript action (`node24`, no dependencies, no build step). It reads `git ls-files` (plus untracked, not ignored files) when the path is a git work tree, otherwise walks the directory. The checker is [`check.mjs`](./check.mjs); its header owns the local invocation.

## Usage

```yaml
- uses: actions/checkout@<sha>
- uses: pyck-ai/github-actions/agent-docs-check@<sha>
  with:
    profile: repo # or central
```

Inputs (`path`, `profile`) and their defaults are in [`action.yml`](./action.yml). Use `profile: central` for `pyck-ai/guidelines`, whose root `AGENTS.md` is the org-wide one.

## Rules

| Rule ID            | Checks                                                                                                                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-claude-md`     | no `CLAUDE.md` anywhere                                                                                                                                                                                                                                                                                                               |
| `agents-md-budget` | root `AGENTS.md` at most 60 lines / 4096 bytes (`profile: central`: 40 / 3072); nested ones use 60 / 4096; a missing root file is a warning                                                                                                                                                                                           |
| `agent-file-size`  | at most 200 lines for agent files only: every file inside `.agents/skills/*/`, `.claude/skills/*/`, `.opencode/skills/*/` or a top-level `skills/*/` that has a `SKILL.md` (symlinks are followed: the finding sits on the link and names the target) and every `CODING_STANDARDS.md`. Docs, ADRs and `CONTRIBUTING.md` have no limit |
| `broken-symlink`   | a symlink inside a skill dir (or named `CODING_STANDARDS.md`) whose target does not exist is an error                                                                                                                                                                                                                                 |

A skill dir is `.agents/skills/<name>/`, `.claude/skills/<name>/`, `.opencode/skills/<name>/` or a top-level `skills/<name>/` that contains a `SKILL.md`; a top-level `skills/<name>/` without one is a plain directory.

## Exclusions

Not checked by any rule: paths with a `fixtures/` or `testdata/` segment (test fixtures break the rules on purpose). This repo's own fixtures store `AGENTS.md`, `CLAUDE.md` and `.claude`, `.agents`, `.opencode` with a `.fixture` suffix so agents do not load them; the tests strip it on copy.
