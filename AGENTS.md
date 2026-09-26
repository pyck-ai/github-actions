# Agent Instructions

This repo publishes shared CI tooling for the pyck-ai org: the reusable
workflows `build-image.yml`, `tidy-repo.yml`, `tidy-ghcr.yml`, and the
actions `verify-image` and `ghcr-tidy`. See [README.md](README.md) for what
each one does and how a consumer pins it.

## Commands

- `npm test` — vitest, run before every commit.
- `npm run lint` — eslint.
- `npm run build` — `tsc -p tsconfig.json`.
- `npm run bundle` — rebuilds `ghcr-tidy/dist/` from `ghcr-tidy/src/`.
- `npm run format:check` — prettier check (`npm run format` to fix).
- `task generate` — regenerates `.github/PULL_REQUEST_TEMPLATE.md` and
  `.github/ISSUE_TEMPLATE/*.yml` from `src/` (`task generate:check` to
  verify without writing; CI's `community-files.yml` runs the equivalent
  `go run ./scripts/generate-community-files.go --check`, since `task`
  isn't preinstalled on GitHub-hosted runners).

## Traps that have each cost a commit here

- Run prettier and `format:check` before committing, **including on
  workflow YAML**. Prettier normalises comment indentation to the
  surrounding mapping level; a trailing comment split across lines at the
  wrong depth fails `--check`.
- Rebuild the bundle (`npm run bundle`) whenever `ghcr-tidy/src/` changes.
  CI's `ci.yml` hard-fails on a stale or unlisted `dist/`.
- `actionlint` (v1.7.12) falsely flags `$/` as a malformed ref. That one
  finding is a known false positive; dismiss it, don't work around it.
- A reusable workflow can never hold a permission its caller did not
  grant. When changing a shared workflow's `permissions:`, check every
  caller too.
- On a `schedule` trigger the `inputs` context is EMPTY. Dispatch defaults
  do not apply there; branch on `github.event_name == 'schedule'` instead
  of relying on `inputs.x || default`.
- A dependency bump makes `ghcr-tidy/dist/` stale, because ncc inlines the
  runtime deps into the bundle. Renovate rebuilds it via
  `.github/renovate-post-upgrade.sh`, wired up in `.github/renovate.json5`. If
  you bump a dependency by hand, run `npm run bundle` and commit the result, or
  `ci.yml`'s `build` job will fail.
