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

## Tools

- **`imgverify`** — manifest-driven image verification. A repo declares its
  checks in `.imgverify.yaml`; the tool resolves bake targets, pulls or inspects
  each image, and runs them. Twelve check kinds, no shell escape hatch.
  See [`examples/baseimages.imgverify.yaml`](examples/baseimages.imgverify.yaml).
- **`ghcr-tidy`** — GHCR retention. Not yet implemented.
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
src/imgverify/       that tool's internals
examples/            fixture manifests
tools/oracle/        bash-vs-TypeScript equivalence harness
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
