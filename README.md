# @pyck-ai/github-actions

TypeScript replacement for ~3000 lines of duplicated bash (`tidy.sh` /
`audit.sh`, copy-pasted across `baseimages`, `github-runner`, and other
repos) that maintain GHCR container packages. This repo hosts a shared
registry core plus three CLI tools built on it:

- `imgverify` — implemented: manifest-driven image verification, with a
  `run`/`validate`/`buildargs` CLI (`src/cli/imgverify.ts`, bundled to
  `dist/imgverify/`) and a companion `verify-image/` composite action.
- `ghcr-tidy` — not yet implemented.
- `ghcr-audit` — not yet implemented.

## Layout

```
src/
  registry/       shared GHCR + GitHub Packages API core
  buildargs/      imgverify: buildargs.conf parse/emit
  manifest/       imgverify: manifest schema, parse, ${VAR} substitution, target matching
  docker/         imgverify: docker CLI seam (inspect/run/create/export/pull/port)
  checks/         imgverify: the twelve check-kind executors + the kind->executor registry
  targets/        imgverify: `docker buildx bake --print` parsing + bake-target -> image-ref resolution
  report/         imgverify: console (✓/✗) and JSON report rendering
  cli/            imgverify: the `imgverify` CLI entrypoint (argv, orchestration, exit codes)
verify-image/     composite GitHub Action wrapping `dist/imgverify/index.js`, SHA-pinnable by consumers
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

## `imgverify`

A manifest-driven replacement for the org's ad hoc, per-repo image-
verification bash (`check_user`, `check_workdir`, `check_shell_cmd`, ...).
Everything below the CLI entrypoint is pure/injectable and tested with
fixtures — no docker daemon required except for the two real `spawn`
implementations (`docker/cli.ts`'s `spawnExec`/`spawnExecBinary`,
`targets/bake.ts`'s `spawnBakeExec`), which the CLI only wires in when it
isn't given fake dependencies.

| Module                   | Responsibility                                                                                                                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildargs/parse.ts`     | Strict `KEY=VALUE` parser for `buildargs.conf` — a single dialect replacing the four disagreeing parsers (`set -a; . file`, Task `dotenv:`, `grep`>>`$GITHUB_ENV`) currently in the org. Any line outside the dialect is a hard error naming the file and line.               |
| `buildargs/emit.ts`      | Formats a parsed buildargs map as `env`, `bake` (`--set *.args.KEY=VALUE`), or `github-env` lines.                                                                                                                                                                            |
| `manifest/schema.ts`     | The manifest v1 types and strict structural validation for the twelve closed check kinds (`user`, `configUser`, `workdir`, `env`, `cmd`, `version`, `writable`, `file`, `imageFile`, `sh`, `exposedPort`, `http`). Deliberately no host-shell escape kind.                    |
| `manifest/parse.ts`      | YAML text -> validated `Manifest`, wrapping YAML syntax errors and schema errors as a single `ManifestError`.                                                                                                                                                                 |
| `manifest/substitute.ts` | `${VAR}` expansion from `buildargs.conf` throughout a manifest's string fields (`$$` is a literal `$`). An undefined variable is a `SubstitutionError` (a config problem), never folded into a check result.                                                                  |
| `manifest/match.ts`      | Glob matching of `targets[].match` against real bake target names, merging in `defaults.checks` and appending later matches in file order. A `match` pattern with zero hits is a hard error.                                                                                  |
| `docker/cli.ts`          | The single typed seam over the `docker` CLI (`inspect`/`run`/`create`/`export`/`pull`/`port`), with an injectable exec function for testing.                                                                                                                                  |
| `docker/inspect.ts`      | Parses `docker inspect`'s `Config` block; a failed inspect is a hard error, not folded into a check result.                                                                                                                                                                   |
| `docker/export.ts`       | From-scratch tar reader over `docker export`'s stream, for the `imageFile` check kind.                                                                                                                                                                                        |
| `checks/*.ts`            | One executor per check kind (`user.ts`, `configUser.ts`, `workdir.ts`, `env.ts`, `cmd.ts`, `version.ts`, `writable.ts`, `file.ts`, `imageFile.ts`, `sh.ts`, `exposedPort.ts`, `http.ts`), dispatched by `checks/index.ts`'s `executeCheck`.                                   |
| `targets/bake.ts`        | Runs (or parses a pre-captured) `docker buildx bake --print` into a flat `BakeTarget[]` — kept stdout/stderr separate, unlike `docker/cli.ts`'s merged `spawnExec`, because bake writes progress to stderr and JSON to stdout.                                                |
| `targets/resolve.ts`     | Resolves a `BakeTarget` to a concrete image ref: local-tag mode (variant-suffix -> `:latest` -> first tag, then `docker inspect`) or `--digests` mode (repo derived from the first tag via regex, then `docker pull repo@digest`). Documents the multi-arch verification gap. |
| `report/console.ts`      | The `✓`/`✗` console report, ported line-for-line from the bash's `_pass`/`_fail`/`verify_summary`.                                                                                                                                                                            |
| `report/json.ts`         | The machine-readable per-target report an equivalence oracle diffs against.                                                                                                                                                                                                   |
| `cli/imgverify.ts`       | The CLI entrypoint: argv parsing, manifest/buildargs loading, target discovery + resolution, check execution, and exit codes. See below.                                                                                                                                      |

### CLI usage

```sh
imgverify [run] [flags]     # default subcommand; a bare `imgverify --digests x` implies run
imgverify validate [flags]  # parse + substitute + (optionally, with --bake-print) match — no docker at all
imgverify buildargs --format env|bake|github-env [--buildargs <path>]
```

`run`/`validate` flags: `--manifest <path>` (default `.imgverify.yaml`; also
the base dir `sh` check `mounts[].host` paths resolve against),
`--buildargs <path>`, `--digests <file>` (switches target resolution to
digest mode — pulls `repo@digest` instead of a local tag), `--registry
<ref>` (env `REGISTRY` wins), `--target <glob>` (repeatable, filters which
targets actually run — manifest `match` validation still runs against every
known target), `--bake-print <file>` (a pre-captured `docker buildx bake
--print` JSON document — lets a run skip invoking `docker buildx` at all),
`--json <path>` (writes a combined `{targets, exitCode}` report), `--timeout-ms
<n>` (default 120000), `--no-color`, `--platform <list>` (parsed and
rejected with "not implemented" — a named seam for closing the multi-arch
verification gap documented in `targets/resolve.ts`, not yet built).

Exit codes: `0` every check passed; `1` at least one check failed; `2`
CONFIG error (bad manifest, undefined `${VAR}`, buildargs dialect
violation, a `--target` glob matching nothing); `3` INFRASTRUCTURE error
(`bake --print` failed, an image isn't loaded locally / `docker pull`
failed, no digest recorded for a target).

### `verify-image/`

A composite action (`verify-image/action.yml`) wrapping
`dist/imgverify/index.js`, so a consumer can pin this tool by the action's
commit SHA the same way they'd pin any other action — the bundled JS the
action runs is committed in this same repo, so the SHA pin covers the CLI
code too.

## Development

```sh
npm install
npm run build    # tsc — type-check, emit to lib/ (gitignored, not published)
npm run bundle   # ncc — bundle registry + imgverify for CI consumption, emit to dist/ (committed)
npm test         # vitest
npm run lint     # eslint
npm run format   # prettier --write
```

`npm run bundle` fans out to `bundle:registry` (`ncc build
src/registry/index.ts -o dist/registry`) and `bundle:imgverify` (`ncc build
src/cli/imgverify.ts -o dist/imgverify`), each producing a `type: module`
`package.json` alongside its `index.js`.

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
