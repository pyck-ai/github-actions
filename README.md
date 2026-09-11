# @pyck-ai/github-actions

Shared CI tooling for the pyck-ai org: reusable workflows, composite actions, and
the CLIs behind them. Replaces ~1850 lines of bash that had been copy-pasted
across `baseimages`, `github-runner` and `flutter-rfw`, where fixes reached one
copy and silently never reached the others.

## What you can consume

|                          | Reference                                                        |
| ------------------------ | ---------------------------------------------------------------- |
| Container build pipeline | `pyck-ai/github-actions/.github/workflows/build-image.yml@<sha>` |
| Repo housekeeping        | `pyck-ai/github-actions/.github/workflows/tidy-repo.yml@<sha>`   |
| Image verification       | `pyck-ai/github-actions/.github/actions/verify-image@<sha>`      |

Pin by commit SHA. `build-image.yml` builds by digest, verifies the pushed
digest, and only then applies tags — a failed verification means no tag ever
moves.

**The caller owns `concurrency:`.** Neither reusable workflow declares one, and
neither should: inside a called workflow `github.workflow` resolves to the
_calling_ workflow's name, so a block in both files computes the same group and
GitHub kills the run outright — "a deadlock was detected for concurrency group
... between a top level workflow and ...", zero jobs, nothing built. Declare it
in your own workflow instead. `tidy-repo.yml` additionally wants
`cancel-in-progress: false`, because a half-finished cleanup is worse than none.

## Tools

- **`imgverify`** — manifest-driven image verification. A repo declares its
  checks in `.imgverify.yaml`; the tool resolves bake targets, pulls or inspects
  each image, and runs them. Twelve check kinds, no shell escape hatch.
- **`ghcr-tidy`** — GHCR retention. It computes the delete set (registry-rooted
  keep set, reachability, grace window), emits a plan, and applies it. Applying
  requires a persisted plan re-validated via a capability gate (`grantApply`);
  deletion runs as groups (parent first, a failed parent abandons its group) and
  is only reachable through a `Mutator`. After each package's deletions it
  verifies the registry directly — snapshotting every tag before and after
  (from the registry's own tag list, interleaved per package, not batched),
  checking each tag still resolves, to the same digest, with its full manifest
  closure intact, and aborting the run on any regression. A pre-flight canary
  on a known-good tag distinguishes a bad registry day from damage the run
  caused; damage confirmed broken before the run is reported separately. Not
  yet wired to a CLI or action, so nothing can invoke it from CI yet.
- **`ghcr-audit`** — registry integrity checks. Not yet implemented.

```sh
imgverify [run]      # verify; --digests <file> checks the exact pushed artifact
imgverify validate   # manifest + substitution only, no docker
imgverify buildargs  # parse buildargs.conf, emit env/bake/github-env
imgverify --help
```

Exit codes: `0` pass · `1` a check failed · `2` config error · `3` infrastructure
error. Config and infrastructure errors are deliberately distinct from check
failures, so a broken environment is never reported as a broken image.

## Layout

```
.github/workflows/   this repo's CI, plus the reusable workflows it publishes
.github/actions/     composite actions, each with its own bundle
src/core/            shared: registry API client, reporting
src/ghcr-tidy/       that tool's internals
src/imgverify/       that tool's internals
```

GitHub requires reusable workflows to sit directly in `.github/workflows/` and
does not support subdirectories there, so this repo's own CI and the workflows
it ships to consumers share one flat directory.

## Development

```sh
npm install && npm test
npm run bundle   # ncc -> .github/actions/verify-image/dist/ (committed)
```

**After changing anything under `src/`, run `npm run bundle` and commit the
result.** The bundle is what SHA-pinned consumers actually execute, so CI
rebuilds it from a clean checkout and fails if it differs from what is
committed — a stale bundle means a pinned consumer runs different code from the
source it appears to match.

## Publishing

GitHub Packages (`npm.pkg.github.com`). Note that GitHub's npm registry requires
authentication even for public packages, so local `npx` use needs a classic PAT
with `read:packages` in `~/.npmrc`. CI is unaffected: consumers execute the
committed bundle rather than installing from the registry.
