# @pyck-ai/github-actions

TypeScript replacement for ~3000 lines of duplicated bash (`tidy.sh` /
`audit.sh`, copy-pasted across `baseimages`, `github-runner`, and other
repos) that maintain GHCR container packages. This repo hosts a shared
registry core plus three CLI tools built on it:

- `imgverify` — foundation layer only (`src/buildargs/`, `src/manifest/`,
  `src/docker/cli.ts`); no CLI entrypoint or check-kind execution yet.
- `ghcr-tidy` — not yet implemented.
- `ghcr-audit` — not yet implemented.

Only the scaffold, the shared registry core (`src/registry/`), and
`imgverify`'s pure foundation layer exist so far. Check-kind execution, the
CLI entrypoint, and the other two CLI tools are later phases.

## Layout

```
src/
  registry/       shared GHCR + GitHub Packages API core
  buildargs/      imgverify: buildargs.conf parse/emit (this phase)
  manifest/       imgverify: manifest schema, parse, ${VAR} substitution, target matching (this phase)
  docker/         imgverify: docker CLI seam (this phase; no callers yet)
.github/workflows/ CI (owned separately from this scaffold)
```

## Registry core (`src/registry/`)

Ported from the bash, with the registry-layer logic (`request_with_retry`,
`get_registry_token`, `github_api_paginate`, `list_versions`,
`resolve_manifest`) that was byte-identical across the source repos now
written once. See doc comments in each module for behaviour ported from the
bash and behaviour discovered empirically against the live registry
(notably: the last remaining package version cannot be deleted via the
version endpoint — see `deletePackageVersion` in `packages.ts`).

| Module            | Responsibility                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `package-name.ts` | Branded `PackageName` type — full, opaque package names only, never `(prefix, image)` pairs.                                                    |
| `http.ts`         | `requestWithRetry` — retrying fetch wrapper (429/5xx/network-error, linear backoff).                                                            |
| `status.ts`       | Pure HTTP status classification (`success` / `not-found` / `transient` / `client-error` / `network-error`).                                     |
| `manifest.ts`     | Manifest fetch + media-type dispatch (OCI index/manifest, Docker manifest list/v2) and child extraction, including attestation-child detection. |
| `auth.ts`         | GHCR registry bearer token exchange, with per-scope caching.                                                                                    |
| `packages.ts`     | GitHub Packages API via Octokit (pagination, retry, throttling): list/delete versions, delete whole packages.                                   |

## `imgverify` foundation layer

The pure, docker-free layer `imgverify` (a manifest-driven replacement for
the org's ad hoc image-verification bash) is built on. No CLI entrypoint or
check-kind execution exists yet — these modules are tested with fixtures
only, no docker daemon required.

| Module                   | Responsibility                                                                                                                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildargs/parse.ts`     | Strict `KEY=VALUE` parser for `buildargs.conf` — a single dialect replacing the four disagreeing parsers (`set -a; . file`, Task `dotenv:`, `grep`>>`$GITHUB_ENV`) currently in the org. Any line outside the dialect is a hard error naming the file and line. |
| `buildargs/emit.ts`      | Formats a parsed buildargs map as `env`, `bake` (`--set *.args.KEY=VALUE`), or `github-env` lines.                                                                                                                                                              |
| `manifest/schema.ts`     | The manifest v1 types and strict structural validation for the twelve closed check kinds (`user`, `configUser`, `workdir`, `env`, `cmd`, `version`, `writable`, `file`, `imageFile`, `sh`, `exposedPort`, `http`). Deliberately no host-shell escape kind.      |
| `manifest/parse.ts`      | YAML text -> validated `Manifest`, wrapping YAML syntax errors and schema errors as a single `ManifestError`.                                                                                                                                                   |
| `manifest/substitute.ts` | `${VAR}` expansion from `buildargs.conf` throughout a manifest's string fields (`$$` is a literal `$`). An undefined variable is a `SubstitutionError` (a config problem), never folded into a check result.                                                    |
| `manifest/match.ts`      | Glob matching of `targets[].match` against real bake target names, merging in `defaults.checks` and appending later matches in file order. A `match` pattern with zero hits is a hard error.                                                                    |
| `docker/cli.ts`          | The single typed seam over the `docker` CLI (`inspect`/`run`/`create`/`export`/`pull`/`port`), with an injectable exec function for testing. No callers yet — check-kind execution is a later phase.                                                            |

## Development

```sh
npm install
npm run build    # tsc — type-check, emit to lib/ (gitignored, not published)
npm run bundle   # ncc — bundle for CI consumption, emit to dist/ (committed)
npm test         # vitest
npm run lint     # eslint
npm run format   # prettier --write
```

`lib/` (tsc output) and `dist/` (ncc output) are deliberately different
directories: `dist/` is the artifact CI workflows and consuming actions
pin to, so it is committed and CI fails if it drifts from source (see
`ci.yml` / `release.yml`); `lib/` is a disposable type-check/build
byproduct and stays gitignored.

**After changing anything under `src/`, run `npm run bundle` and commit the
result.** `ci.yml` and `release.yml` both rebuild `dist/` from a clean
checkout and fail the build if the rebuilt output differs from what's
committed, or if `dist/` has untracked files — a stale committed bundle
would mean a pinned consumer silently runs different code than the source
it appears to match.

## Publishing

Published to GitHub Packages (`https://npm.pkg.github.com`), configured via
`publishConfig.registry` in `package.json`.
