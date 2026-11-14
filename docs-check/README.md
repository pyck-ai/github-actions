# docs-check

<!-- toc
## Contents

- [Usage](#usage)
- [Rules](#rules)
-->

Checks a docs folder: sentence-case headings, no links to the company guidelines, and markdownlint.

A plain JavaScript action (`node24`, no dependencies, no build step). The checker is [`check.mjs`](./check.mjs); its header owns the local invocation. The first two checks are adapted from [pyck-ai/docs-poc](https://github.com/pyck-ai/docs-poc) at `9ec8c73` (directory mode of `check-headings.mjs` and `check-guideline-links.mjs`). markdownlint runs `markdownlint-cli2@0.23.1` through the first of these that exists: `bunx` on `PATH`; the `npx` that ships with the Node running the action (started as `<that node> npx-cli.js`, so a `node` on `PATH` that is really bun does not matter); `npx` on `PATH`. A runner image with `bun` but no `npx` therefore works. If none starts, the error names what was tried. The action needs network access the first time it runs on a runner.

## Usage

```yaml
- uses: actions/checkout@<sha>
- uses: pyck-ai/github-actions/docs-check@<sha>
  with:
    path: docs
    extra-words: .github/heading-words.txt # optional
    markdownlint-config: .markdownlint-cli2.yaml # optional
```

Inputs (`path`, `extra-words`, `markdownlint-config`) and their defaults are in [`action.yml`](./action.yml). `extra-words` is a file of proper nouns and product names that keep their capital letter in a heading, one word or phrase per line, `#` starts a comment; it adds to the list in [`heading-words.txt`](./heading-words.txt). `markdownlint-config` replaces the shipped [`markdownlint-cli2.yaml`](./markdownlint-cli2.yaml) (MD013, MD041 and MD060 off) as a whole; it does not merge with it.

## Rules

All three checks read the same files: the Markdown below `path`, skipping dot entries, symlinks and folders named `internal`. A `path` that is not a folder, or that holds no Markdown file, fails with exit code 2, so a wrong path cannot pass for a clean docs folder.

Every finding is one line `file:line: ...`, with `file` relative to `path`. The step fails (exit 1) when any check finds something.

| Check             | Checks                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `headings`        | headings (H1 to H6, fenced code skipped), the frontmatter `title` and the link texts of `SUMMARY.md` are in sentence case: after the first word, a word that starts with a capital letter followed by a lowercase letter is a finding. Not a finding: all-caps and CamelCase words, `code`, quoted text, the word after a colon, and the words and phrases of the allow lists (see Usage) |
| `guideline-links` | no line links to `pyck-ai/guidelines` in any form (`github.com`, `raw.githubusercontent.com`, API, ssh, `pyck-ai.github.io/guidelines`, `~/.pyck/guidelines`); code fences are read too, because an example a reader copies is still a link. A link to another pyck-ai repository is fine                                                                                                 |
| `markdownlint`    | `markdownlint-cli2` 0.23.1 with the shipped or the given config; each finding prints as `file:line: <rule> <description>`. A run that does not start, or a config it cannot read, fails with exit code 1 and the tool's message                                                                                                                                                           |
