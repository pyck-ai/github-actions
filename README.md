# github-actions

<!-- toc
## Contents

- [What is github-actions?](#what-is-github-actions)
- [Getting started](#getting-started)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Status](#status)
- [License](#license)
- [Security](#security)
-->

Shared CI workflows and actions for the pyck-ai repositories.

## What is github-actions?

Every pyck-ai repository that builds images, tidies its GitHub history or cleans up GHCR needs the same pipeline steps. Kept in one place, a fix reaches every repository by bumping one pinned reference instead of by editing copies.

Consumers call the reusable workflows and actions by commit SHA. The workflows are YAML; `ghcr-tidy` and `branch-tidy` are bundled TypeScript actions, and the other actions are plain bash or JavaScript.

Out of the box, github-actions includes:

- **`build-image.yml`**: builds a container image by digest, verifies the pushed digest, and only then applies tags. On runners with `runner-init` (the unprivileged kata pool) it builds on the runner's rootless BuildKit through the buildx remote driver, with arm64 built by BuildKit's own emulation; callers configure nothing. Each platform of a component builds in its own matrix leg, with its own build cache refs, and tags are created from all platforms' digests. With `reproducible: true` (kata pool only) the same commit gives the same index digest, which the job computes before any tag is created and can compare with a digest pinned in the caller's repository (`pin-task`). Off by default. See [its header comment](./.github/workflows/build-image.yml).
- **`tidy-repo.yml`**: deletes old workflow runs, closes stale issues and PRs, and deletes stale branches. See [its header comment](./.github/workflows/tidy-repo.yml).
- **`tidy-ghcr.yml`**: runs GHCR retention through the `ghcr-tidy` action. See [its header comment](./.github/workflows/tidy-ghcr.yml).
- **`verify-image`**: runs each pushed image's own `verify.sh` inside that image. See [verify-image/README.md](./verify-image/README.md).
- **`ghcr-tidy`**: plans and applies GHCR retention from a `.github/tidy-ghcr.yml` manifest. See [ghcr-tidy/README.md](./ghcr-tidy/README.md).
- **`branch-tidy`**: deletes the stale branches of a repository, keeping protected, default and open-pull-request branches. See [branch-tidy/README.md](./branch-tidy/README.md).
- **`jev-check`**: runs the jev CLI once per input file and writes one result per file. See [jev-check/README.md](./jev-check/README.md).
- **`agent-docs-check`**: keeps agent-facing docs inside their budgets. See [agent-docs-check/README.md](./agent-docs-check/README.md).
- **`gate`**: one pass/fail verdict over a workflow's jobs, for a required status check. See [gate/README.md](./gate/README.md).
- **`zizmor`**: installs a pinned zizmor and runs the caller's `task zizmor` to scan workflows and actions for security problems. See [zizmor/README.md](./zizmor/README.md).
- **`gitleaks`**: installs a pinned gitleaks CLI and runs the caller's `task gitleaks` to scan git history for secrets. See [gitleaks/README.md](./gitleaks/README.md).

## Getting started

Consume a workflow or action by pinning a commit SHA:

```yaml
jobs:
  build:
    uses: pyck-ai/github-actions/.github/workflows/build-image.yml@<sha> # v0.1.0
  # or, as a step: uses: pyck-ai/github-actions/verify-image@<sha>
```

The caller owns `concurrency:`: the reusable workflows declare none (see the header comment of [build-image.yml](./.github/workflows/build-image.yml) for why).

Work on this repository:

```sh
npm ci             # install dependencies
task ci            # run every check CI runs (also needs zizmor and gitleaks on PATH)
task generate      # rebuild ghcr-tidy/dist/ and branch-tidy/dist/ (committed) after changing their src/
```

Prerequisites: Node.js 22 or later (`engines` in [package.json](./package.json); CI runs 24), npm, [go-task](https://taskfile.dev), [zizmor](https://docs.zizmor.sh) and [gitleaks](https://github.com/gitleaks/gitleaks) (versions in [zizmor/action.yml](./zizmor/action.yml) and [gitleaks/action.yml](./gitleaks/action.yml)). `task check` runs the Node checks alone. Run `task --list` for every other command. For the inputs and behaviour of one action, see the README in its directory: [verify-image](./verify-image/README.md), [ghcr-tidy](./ghcr-tidy/README.md), [branch-tidy](./branch-tidy/README.md), [jev-check](./jev-check/README.md), [agent-docs-check](./agent-docs-check/README.md), [zizmor](./zizmor/README.md), [gitleaks](./gitleaks/README.md).

## Documentation

- [build-image.yml](./.github/workflows/build-image.yml), [tidy-repo.yml](./.github/workflows/tidy-repo.yml), [tidy-ghcr.yml](./.github/workflows/tidy-ghcr.yml): header comments own the contract of each reusable workflow.
- [verify-image](./verify-image/README.md), [ghcr-tidy](./ghcr-tidy/README.md), [branch-tidy](./branch-tidy/README.md), [jev-check](./jev-check/README.md), [agent-docs-check](./agent-docs-check/README.md), [gate](./gate/README.md), [zizmor](./zizmor/README.md), [gitleaks](./gitleaks/README.md): inputs, behaviour and design of each action.
- [registry](./registry/README.md): the shared TypeScript registry core that `ghcr-tidy` and `branch-tidy` bundle.
- [ghcr-tidy/src/cli.ts](./ghcr-tidy/src/cli.ts): `ghcr-tidy` flags and exit codes.
- [Taskfile.yml](./Taskfile.yml): the checks every change must pass (`task ci`; [ci.yml](./.github/workflows/ci.yml) runs its parts as parallel jobs), including the committed-bundle check.
- [renovate.json5](./.github/renovate.json5): how dependency and image digests are kept current.

## Contributing

- [CONTRIBUTING.md](https://github.com/pyck-ai/.github/blob/main/.github/CONTRIBUTING.md): start here (the organization default).
- [AGENTS.md](./AGENTS.md): read this first if you are an AI coding agent.

## Status

Version 0.1.0, pre-1.0: pin by SHA, not by branch. The repository is not published to npm.

## License

[Functional Source License 1.1, ALv2 Future License](./LICENSE) (FSL-1.1-ALv2).

## Security

See the [organization security policy](https://github.com/pyck-ai/.github/blob/main/.github/SECURITY.md) for how to report a vulnerability.
