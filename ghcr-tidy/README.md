# ghcr-tidy

<!-- toc
## Contents

- [Commands](#commands)
- [Config manifest](#config-manifest)
- [Retention](#retention)
- [Safety](#safety)
-->

Plans and applies GHCR retention for the packages named in a `.github/tidy-ghcr.yml` manifest, and verifies the registry after every deletion.

A bundled `node24` action (`dist/` is committed). Run it directly through the [`tidy-ghcr.yml`](../.github/workflows/tidy-ghcr.yml) reusable workflow, or as a step with `uses: pyck-ai/github-actions/ghcr-tidy@<sha>` and the `args` input (see [`action.yml`](./action.yml)).

## Commands

```sh
ghcr-tidy [plan]     # plan; plan is the default subcommand
ghcr-tidy validate   # manifest load + validation only
ghcr-tidy apply --apply --budget <n>   # apply the plan (see Safety)
ghcr-tidy apply --apply --budget <n> --delete-broken-roots   # + broken-root remediation
ghcr-tidy --help
```

Flags: `ghcr-tidy --help`, backed by the argument parsing in [`src/cli.ts`](./src/cli.ts). Exit codes (`0` ok, `1` findings, `2` config error, `3` infrastructure error, `4` safety): the "Exit codes" block in the doc comment of [`src/cli.ts`](./src/cli.ts).

## Config manifest

The manifest is read from `.github/tidy-ghcr.yml` unless `--manifest <path>` names another file. The two earlier paths, `.github/ghcr-tidy.yml` and the root `.ghcr-tidy.yaml`, are still read, with a deprecation warning, when one of them is the only manifest; rename it to `.github/tidy-ghcr.yml`. If more than one of the three exists the run fails with a config error (exit `2`), because two manifests could disagree and this tool deletes things.

The `.github/tidy-ghcr.yml` schema is closed: an unknown key is a hard error, because in a deletion tool a silently ignored config key produces a green run that did the wrong thing. The keys, their validation and defaults are documented in [`src/manifest/schema.ts`](./src/manifest/schema.ts). Package entries carry full package names; there is no repo-prefix concept to concatenate.

## Retention

Retention is one uniform, semver-aware algorithm applied identically to every package, with no per-package override.

- A tag decomposes into a kind and a version by a single lexical rule.
- The newest N majors, N minors within each, and N patches within each are kept (`keepMajors`, `keepMinors`, `keepPatches`).
- A digest is a keep-root if at least one of its tags survives that windowing.
- Independently, any version younger than `keepDays` is never deleted, tagged or not. It is the single remaining age-based control, and the most dangerous one to lower.

The tool computes the delete set (registry-rooted keep set, reachability, day window), emits a plan, and applies it.

## Safety

- **Apply gate.** Applying requires a persisted plan re-validated via a capability gate (`grantApply`). Deletion runs as groups (parent first, a failed parent abandons its group) and is only reachable through a `Mutator`.
- **Three gestures.** Deletion requires the `apply` subcommand, an explicit `--apply` flag, and a `--budget`. None of the apply-path safety nets (breaker, canary, post-apply verification) can be switched off.
- **Post-apply verification.** After each package's deletions the tool verifies the registry directly: it snapshots every tag before and after (from the registry's own tag list, interleaved per package, not batched), checks each tag still resolves, to the same digest, with its full manifest closure intact, and aborts the run on any regression.
- **Canary.** A pre-flight canary on a known-good tag distinguishes a bad registry day from damage the run caused. Damage confirmed broken before the run is reported separately.
- **Circuit breaker.** A post-apply regression opens a labelled issue with a cold-read incident report and trips a circuit breaker: every later run checks that issue before touching anything (including the canary) and refuses all deletions while it is open. The breaker has no reset in code: a human closes the issue to clear it.
- **Volume alarm.** The tool refuses to apply when the plan deletes more than a configurable multiple (default 3) of a caller-supplied trailing baseline.

### Intended tag expiry

Verification carries a seam for intended tag expiry: a resolved policy's own retirement decision, recomputed independently at verification time and never read off the plan.

- A tag it expected gone is reported as `expired`, not a regression.
- A tag it expected gone but which still resolves is reported separately without aborting anything.
- The seam is wired to the real, policy-driven producer. It mirrors the full deletion predicate, not the semver windows alone: a tag is expected gone only if no tag on its digest is retained and that digest is at least `keepDays` old.
- The predicate is re-derived at verification time (including an independent Packages API read for digest age) rather than read off the plan, so a bug anywhere from the planner's keep-root rule downward is still caught.

Bounded, expected residuals (suppressed per package with a stated reason):

- budget-deferred deletions;
- a digest unreachable by tag but reachable via another kept root's closure;
- a concurrent publish between snapshots.

The signal to act on is a persistent, growing set, not one run's count.

### Broken roots

The opt-in `--delete-broken-roots` flag tolerates a keep-root whose subtree contains a proven not-found descendant (a confirmed registry 404, e.g. an already-garbage-collected multi-arch child) instead of failing that whole package closed. The proven-broken root itself then falls into the ordinary delete set.

- A transient, 5xx, auth or network failure never qualifies, only a confirmed 404 does.
- Deleting a broken root still requires `--apply` as well (two independent gestures, same posture as `apply` itself).
- The reusable workflow's `delete-broken-roots` input is forced off unconditionally on a `schedule` trigger.
