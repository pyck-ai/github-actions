# @pyck-ai/github-actions

<!-- toc
## Contents

- [What you can consume](#what-you-can-consume)
- [Tools](#tools)
- [Layout](#layout)
- [Development](#development)
- [Publishing](#publishing)
-->

Shared CI tooling for the pyck-ai org: reusable workflows, actions, and
the CLIs behind them. Replaces ~1850 lines of bash that had been copy-pasted
across `baseimages`, `github-runner` and `flutter-rfw`, where fixes reached one
copy and silently never reached the others.

## What you can consume

|                          | Reference                                                        |
| ------------------------ | ---------------------------------------------------------------- |
| Container build pipeline | `pyck-ai/github-actions/.github/workflows/build-image.yml@<sha>` |
| Repo housekeeping        | `pyck-ai/github-actions/.github/workflows/tidy-repo.yml@<sha>`   |
| Image verification       | `pyck-ai/github-actions/verify-image@<sha>`                      |
| GHCR retention           | `pyck-ai/github-actions/.github/workflows/tidy-ghcr.yml@<sha>`   |
| GHCR retention CLI step  | `pyck-ai/github-actions/ghcr-tidy@<sha>`                         |
| Batch jev check          | `pyck-ai/github-actions/jev-check@<sha>`                         |
| Agent docs check         | `pyck-ai/github-actions/agent-docs-check@<sha>`                  |

Pin by commit SHA. `build-image.yml` builds by digest, verifies, and only then
tags (see its header comment). The caller owns `concurrency:` for the reusable
workflows (see the header comments of `build-image.yml` and `tidy-repo.yml`).

## Tools

- **`verify-image`**: see [`verify-image/README.md`](./verify-image/README.md).
- **`jev-check`**: see [`jev-check/README.md`](./jev-check/README.md).
- **`ghcr-tidy`**: see [`ghcr-tidy/README.md`](./ghcr-tidy/README.md).
- **`agent-docs-check`**: see [`agent-docs-check/README.md`](./agent-docs-check/README.md).
- **`ghcr-audit`** — registry integrity checks. Not yet implemented.

## Layout

```
.github/workflows/   this repo's CI, plus the reusable workflows it publishes
ghcr-tidy/           action (bundled): action.yml, src/, dist/
verify-image/        action (plain bash, no bundle): action.yml, run.sh
jev-check/           action (plain bash, no bundle): action.yml, run.sh
agent-docs-check/    action (plain JavaScript, no bundle): action.yml, check.mjs
registry/            shared: registry API client
```

GitHub requires reusable workflows to sit directly in `.github/workflows/` and
does not support subdirectories there, so this repo's own CI and the workflows
it ships to consumers share one flat directory.

Each published action is a self-contained top-level directory (`$/ghcr-tidy`,
`$/verify-image`), discoverable at the repo root instead of nested under
`.github/actions/`. `registry/` is shared code with exactly one consumer today
(`ghcr-tidy`) — it was `src/core/registry/` before this layout existed to hold
more than one action's worth of TypeScript; it stayed a separate top-level
directory anyway, for when a second TypeScript action needs it.

## Development

```sh
npm install && npm test
npm run bundle   # ncc -> ghcr-tidy/dist/ (committed)
```

**After changing anything under `ghcr-tidy/src/` or `registry/`, run `npm run bundle` and commit the
result.** The bundle is what SHA-pinned consumers actually execute, so CI
rebuilds it from a clean checkout and fails if it differs from what is
committed — a stale bundle means a pinned consumer runs different code from the
source it appears to match. Dependencies are managed by Renovate
(`.github/renovate.json5`), which rebuilds the bundle automatically via
`.github/renovate-post-upgrade.sh` after each npm update.

## Publishing

GitHub Packages (`npm.pkg.github.com`). Note that GitHub's npm registry requires
authentication even for public packages, so local `npx` use needs a classic PAT
with `read:packages` in `~/.npmrc`. CI is unaffected: consumers execute the
committed bundle rather than installing from the registry.
