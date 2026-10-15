# agent-docs-check

<!-- toc
## Contents

- [Usage](#usage)
- [Rules](#rules)
- [Managed TOC region](#managed-toc-region)
- [Fix mode](#fix-mode)
- [Exclusions](#exclusions)
-->

Keeps agent-facing docs inside their budgets: sizes, managed tables of contents, skill frontmatter and links.

A plain JavaScript action (`node24`, no dependencies, no build step). It reads `git ls-files` (plus untracked, not ignored files) when the path is a git work tree, otherwise walks the directory. The checker is [`check.mjs`](./check.mjs); its header owns the local invocation.

## Usage

```yaml
- uses: actions/checkout@<sha>
- uses: pyck-ai/github-actions/agent-docs-check@<sha>
  with:
    profile: repo # or central
```

Inputs (`path`, `profile`, `check-urls`, `fix`, `require-skill-harness`, `pyck-home`) and their defaults are in [`action.yml`](./action.yml). Use `profile: central` for `pyck-ai/guidelines`, whose root `AGENTS.md` is the org-wide one. `require-skill-harness` (locally `--require-skill-harness`) makes a missing `metadata.harness` an error; see `skill-harness`. `pyck-home` (or the `PYCK_HOME` environment variable locally) is where `~/.pyck/<repo>` paths into other repos resolve; the default is `$HOME/.pyck`.

## Rules

| Rule ID                       | Checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-claude-md`                | no `CLAUDE.md` anywhere                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `agents-md-budget`            | root `AGENTS.md` at most 60 lines / 4096 bytes (`profile: central`: 40 / 3072); nested ones use 60 / 4096; a missing root file is a warning                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `agent-file-size`             | at most 200 lines for agent files only: every file inside `.agents/skills/*/`, `.claude/skills/*/`, `.opencode/skills/*/` or a top-level `skills/*/` that has a `SKILL.md` (symlinks are followed: the finding sits on the link and names the target) and every `CODING_STANDARDS.md`. Docs, ADRs and `CONTRIBUTING.md` have no limit                                                                                                                                                                                                                           |
| `toc-missing`, `toc-stale`    | every `.md` with two or more `##` headings (outside fences) has a managed TOC region before the first `##`: a `## Contents` heading, a blank line, then one `- [Heading](#anchor)` item per `##` heading in order (GitHub anchors, duplicates get `-1`, `-2`). `toc-stale` names the missing, extra, misordered or wrongly anchored heading                                                                                                                                                                                                                     |
| `toc-legacy`, `toc-unmanaged` | the old `<!-- Contents: ... -->` comment is `toc-legacy` (`--fix` removes it); a `## Contents` heading outside a region is `toc-unmanaged` (reported, never edited)                                                                                                                                                                                                                                                                                                                                                                                             |
| `skill-frontmatter`           | `SKILL.md` `name` equals the directory, matches `^[a-z0-9-]{1,64}$`, no `anthropic` or `claude`; `description` non-empty, at most 1024 characters, no `<` or `>`                                                                                                                                                                                                                                                                                                                                                                                                |
| `skill-harness`               | `SKILL.md` `metadata`, when present, is a map of indented `key: value` lines, and `metadata.harness` is `generic` (installed in `~/.agents/skills`, for any Agent Skills reader) or `opencode` (installed in `~/.config/opencode/skills`, needs opencode or its plugins); quotes around the value are fine. A missing `metadata.harness` is an error only with `require-skill-harness` / `--require-skill-harness`, because many repos have untagged skills                                                                                                     |
| `frontmatter-yaml`            | frontmatter of any `.md` (`SKILL.md`, agent and command files too): a `key: value` line whose value is an unquoted plain scalar (not starting with `"`, `'`, `\|`, `>`, `[` or `{`) must not contain `": "` or `" #"` or end with `":"`. YAML reads `": "` as a new key and `" #"` as a comment, so opencode skips such a file; quote the value. Indented `child: value` lines under an empty `key:` (one level, e.g. `metadata:`) get the same check                                                                                                           |
| `relative-link`               | relative markdown links in `AGENTS.md`, skill-dir, `CODING_STANDARDS.md`, `CONTRIBUTING.md`, `docs/**` and every `README.md` resolve (links in fenced code are ignored; `~/` targets are `pyck-path`'s business)                                                                                                                                                                                                                                                                                                                                                |
| `agent-url`                   | agent files (`AGENTS.md`, `SKILL.md`, every file in a skill dir, `CODING_STANDARDS.md`) contain no `http://` or `https://` URL in prose; inline code and fenced code are exempt. A fetched URL is unreviewed text, so name a local path under `~/.pyck/<repo>/` instead                                                                                                                                                                                                                                                                                         |
| `pyck-path`                   | a `~/.pyck/<repo>/<rest>` path in an agent file (a link target or an inline code span) exists, `#anchor` stripped. `<repo>` is checked against the root when it is the repo under check (basename of the `origin` remote URL without `.git`, else of the root dir), otherwise against `$PYCK_HOME/<repo>` (default `~/.pyck`). A repo that is not installed there is one warning (`~/.pyck/<repo> is not installed here; paths into it were not checked`) and its paths are skipped; paths containing `<`, `>`, `{` or `}` are skipped; anchors are not checked |
| `link-form`                   | human files (`README.md`, `CONTRIBUTING.md`, `docs/**`) do not link `raw.githubusercontent.com`; use `github.com/.../blob/...` with an anchor                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `url-404`                     | with `check-urls`, every link in a human file into `pyck-ai/guidelines` or `pyck-ai/.github` is requested and a 404 is an error                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `url-unreachable`             | with `check-urls`, a probed URL that returns no status at all (network error or timeout) is a warning, not an error                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `broken-symlink`              | a symlink inside a skill dir (or named `CODING_STANDARDS.md`) whose target does not exist is an error                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

A skill dir is `.agents/skills/<name>/`, `.claude/skills/<name>/`, `.opencode/skills/<name>/` or a top-level `skills/<name>/` that contains a `SKILL.md`; a top-level `skills/<name>/` without one is a plain directory. Every file in a skill dir is an agent file for `agent-url` and `pyck-path`, but only `.md` files are read for URLs, so a `.yml` there is not URL-checked.

## Managed TOC region

The managed region has two spellings of the same content, visible or hidden (agent-only); moving the `-->` toggles between them:

```md
<!-- toc -->

## Contents

- [Install](#install)
- [Usage](#usage)

<!-- /toc -->

<!-- toc
## Contents

- [Install](#install)
- [Usage](#usage)
-->
```

## Fix mode

`--fix` (input `fix`, local runs):

- inserts the hidden region right after the H1 (after the frontmatter when there is no H1);
- rewrites only the lines between the markers of a stale region, keeping its spelling;
- removes a `toc-legacy` comment and one following blank line;
- prints each fixed file, then re-runs the checks.

`toc-unmanaged` is never edited.

## Exclusions

Not checked by any rule: paths with a `fixtures/` or `testdata/` segment (test fixtures break the rules on purpose). This repo's own fixtures store `AGENTS.md`, `CLAUDE.md` and `.claude`, `.agents`, `.opencode` with a `.fixture` suffix so agents do not load them; the tests strip it on copy.

Not subject to the TOC rules:

- any `AGENTS.md` or `SKILL.md` (both loaded whole);
- `CHANGELOG*.md`;
- files with `DO NOT EDIT` in their first 5 lines;
- `PULL_REQUEST_TEMPLATE*.md`;
- `.github/ISSUE_TEMPLATE/**`;
- paths with a `node_modules/` segment;
- files matched by a `.tocignore`.

### `.tocignore`

`.tocignore` files use gitignore syntax and semantics (any number, at any depth, relative to their own directory; `!` negation, anchoring, trailing `/`, `**`, escapes, later rules win, nothing under an excluded directory can be re-included) because git's own matcher evaluates them (`git ls-files -c -o -i --exclude-per-directory=.tocignore`; `.gitignore` is not consulted). They affect the TOC rules only.

`.tocignore` needs `git` in `PATH` (tested with git 2.x; the runner image ships git). Outside a git work tree, or when `git ls-files` fails, `.tocignore` files are ignored with a warning.
