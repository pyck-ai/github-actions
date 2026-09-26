# @pyck-ai/github-actions

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

Pin by commit SHA. `build-image.yml` builds by digest, verifies the pushed
digest, and only then applies tags — a failed verification means no tag ever
moves.

**The caller owns `concurrency:`.** Neither reusable workflow declares one, and
neither should: inside a called workflow `github.workflow` resolves to the
_calling_ workflow's name, so a block in both files computes the same group and
GitHub kills the run outright — "a deadlock was detected for concurrency group
... between a top level workflow and ...", zero jobs, nothing built. Declare it
in your own workflow instead. `tidy-repo.yml` and `tidy-ghcr.yml` additionally
want `cancel-in-progress: false`, because a half-finished cleanup (deletions
attempted, budget partially spent) is worse than none.

## Tools

- **`verify-image`** — a plain-bash composite action, not a CLI. Given a
  leg's `targets` (newline-separated bake target names), a `contexts` JSON
  map of `target -> {context, repo}`, and the leg's own digest file
  (`target -> digest`), it runs EVERY target's own `verify.sh` (POSIX `sh`,
  shipped alongside the target's Dockerfile, looked up under its bake
  context dir) INSIDE the exact image just pushed for it via
  `docker run --env-file buildargs.conf -e TARGET=<target> -v .../verify.sh:/verify.sh:ro --entrypoint /bin/sh <ref> /verify.sh`,
  continuing past a failure so one push reports every broken target rather
  than one failure per cycle, and fails the step if any target failed. A
  target with no `verify.sh` is a hard failure, not a skip — the property
  that guarantees an unverified image never ships green. Shell-less targets
  (`FROM scratch`) are detected by probing for `/bin/sh` and, on failure,
  verified against a throwaway image built as `FROM <ref>` +
  `COPY --from=busybox:musl /bin /bin`, removed afterwards.
- **`ghcr-tidy`** — GHCR retention, driven by a `.ghcr-tidy.yaml` config
  manifest (closed schema: an unknown key is a hard error, because in a
  deletion tool a silently ignored config key produces a green run that did
  the wrong thing). Package entries carry full package names; there is no
  repo-prefix concept to concatenate. Retention is one uniform, semver-aware
  algorithm applied identically to every package, with no per-package
  override: a tag decomposes into a kind and a version by a single lexical
  rule, and the newest N majors, N minors within each, and N patches within
  each are kept — a digest is a keep-root if at least one of its tags
  survives that windowing. Independently, any version younger than
  `keepDays` is never deleted, tagged or not — the single remaining
  age-based control, and the most dangerous one to lower. It computes the
  delete set (registry-rooted keep set, reachability, day window), emits a
  plan, and applies it. Applying requires a persisted plan re-validated via a
  capability gate (`grantApply`); deletion runs as groups (parent first, a
  failed parent abandons its group) and is only reachable through a
  `Mutator`. After each package's deletions it verifies the registry directly
  — snapshotting every tag before and after (from the registry's own tag
  list, interleaved per package, not batched), checking each tag still
  resolves, to the same digest, with its full manifest closure intact, and
  aborting the run on any regression. A pre-flight canary on a known-good tag
  distinguishes a bad registry day from damage the run caused; damage
  confirmed broken before the run is reported separately. Verification also
  carries a seam for INTENDED tag expiry (a resolved policy's own retirement
  decision, recomputed independently at verification time, never read off
  the plan): a tag it expected gone is reported as `expired`, not a
  regression, and a tag it expected gone but which still resolves is
  reported separately without aborting anything (bounded, expected residuals:
  budget-deferred deletions, suppressed per package with a stated reason; a
  digest unreachable by tag but reachable via another kept root's closure;
  a concurrent publish between snapshots — the signal to act on is a
  persistent, growing set, not one run's count). This ships wired to the
  real, policy-driven producer: it mirrors the full deletion predicate, not
  the semver windows alone — a tag is expected gone only if NO tag on its
  digest is retained AND that digest is at least `keepDays` old — independently
  re-derived at verification time (including an independent Packages API
  read for digest age) rather than read off the plan, so a bug anywhere
  from the planner's keep-root rule downward is still caught. A post-apply
  regression also opens a labelled issue with a cold-read incident report and
  trips a circuit breaker: every later run checks that issue before touching
  anything (including the canary) and refuses all deletions while it is
  open. The breaker has no reset in code — a human closes the issue to clear
  it. A volume alarm additionally refuses to apply when the plan deletes more
  than a configurable multiple (default 3) of a caller-supplied trailing
  baseline. Deletion requires three independent gestures — the `apply`
  subcommand, an explicit `--apply` flag, and a `--budget` — and none of the
  apply-path safety nets (breaker, canary, post-apply verification) can be
  switched off. An opt-in `--delete-broken-roots` flag additionally tolerates
  a keep-root whose subtree contains a PROVEN not-found descendant (a
  confirmed registry 404, e.g. an already-garbage-collected multi-arch
  child) instead of failing that whole package closed, letting the
  proven-broken root itself fall into the ordinary delete set — a
  transient/5xx/auth/network failure never qualifies, only a confirmed
  404 does. Deleting a broken root still requires `--apply` as well (two
  independent gestures, same posture as `apply` itself), and the reusable
  workflow's `delete-broken-roots` input is forced off unconditionally on
  a `schedule` trigger.

  ```sh
  ghcr-tidy [plan]     # plan; plan is the default subcommand
  ghcr-tidy validate   # manifest load + validation only
  ghcr-tidy apply --apply --budget <n>   # apply the plan (see safety above)
  ghcr-tidy apply --apply --budget <n> --delete-broken-roots   # + broken-root remediation
  ghcr-tidy --help
  ```

  Exit codes: `0` ok · `1` findings · `2` config error · `3` infrastructure
  error · `4` safety (breaker tripped, volume alarm, canary failure,
  verification regression, plan-integrity violation).

- **`ghcr-audit`** — registry integrity checks. Not yet implemented.

## Layout

```
.github/workflows/   this repo's CI, plus the reusable workflows it publishes
ghcr-tidy/           action (bundled): action.yml, src/, dist/
verify-image/        action (plain bash, no bundle): action.yml, run.sh
registry/            shared: registry API client
scripts/             generate-community-files.go: regenerates .github/PULL_REQUEST_TEMPLATE.md
                     and .github/ISSUE_TEMPLATE/*.yml from src/ (`task generate`)
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

`.github/PULL_REQUEST_TEMPLATE.md` and `.github/ISSUE_TEMPLATE/*.yml` are
likewise generated, from `src/pull_request.md`/`src/issue-*.yml` by
`scripts/generate-community-files.go` — edit the source and run `task
generate`, never the generated file directly. `task generate:check` (what
`community-files.yml` runs in CI) verifies they're in sync without writing.
These mirror the org-wide canonical versions in
[`pyck-ai/.github`](https://github.com/pyck-ai/.github); GitHub only
auto-propagates a _single_ org-level `ISSUE_TEMPLATE.md`/`PULL_REQUEST_TEMPLATE.md`
to repos lacking their own copy, not a multi-form `ISSUE_TEMPLATE/` directory of
YAML forms — hence vendoring a local, generated copy here instead of relying on
inheritance for the issue forms specifically.

## Publishing

GitHub Packages (`npm.pkg.github.com`). Note that GitHub's npm registry requires
authentication even for public packages, so local `npx` use needs a classic PAT
with `read:packages` in `~/.npmrc`. CI is unaffected: consumers execute the
committed bundle rather than installing from the registry.
