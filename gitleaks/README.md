# gitleaks

<!-- toc
## Contents

- [Usage](#usage)
- [What the caller provides](#what-the-caller-provides)
- [Behavior](#behavior)
-->

Scans a repository's git history for secrets with the [gitleaks](https://github.com/gitleaks/gitleaks) CLI (MIT).

A plain-bash composite action with no inputs. It runs the CLI and not `gitleaks-action`, whose licence is a proprietary agreement that needs a key for organizations. The pinned version and the sha256 of each archive are defined once, in [`action.yml`](./action.yml).

## Usage

```yaml
jobs:
  gitleaks:
    runs-on: [pyck-ai, firecracker, light]
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@<sha>
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: pyck-ai/github-actions/gitleaks@<sha>
```

`fetch-depth: 0` is required. Add the job to the `needs` of the repository's `ci-success` gate.

## What the caller provides

- `task` on `PATH`. The pyck-ai runner image has it; elsewhere install it first.
- A `gitleaks` task in the Taskfile that runs the scan, and the same task in `task ci`:

  ```yaml
  gitleaks:
    desc: Scan the whole git history for secrets
    cmds:
      - gitleaks git --redact --no-banner --baseline-path .gitleaks-baseline.json .
  ```

  `--redact` keeps a secret out of the CI log.

- `.gitleaks-baseline.json`, a gitleaks report in the default JSON format listing the findings that exist today (`[]` for none). The file may only shrink. Create it with `gitleaks git --redact --report-path .gitleaks-baseline.json .` after checking every finding by hand. A real secret must be revoked, not baselined.

## Behavior

- Fails when the checkout is shallow, because a history scan of one commit passes without looking at anything.
- Downloads the release archive for the runner's architecture (`x64` or `arm64`, Linux), checks its sha256 and fails on a mismatch, unpacks `gitleaks` into `$RUNNER_TEMP`, puts it on `PATH` for the step, prints `gitleaks version` and runs `task gitleaks`.
- Makes no decision: the exit code is the task's. gitleaks exits 1 on any finding that is not in the baseline.
- Updating the version: Renovate bumps `GITLEAKS_VERSION` (annotation `# renovate:` in [`action.yml`](./action.yml), custom manager in [`renovate.json5`](../.github/renovate.json5)). It cannot compute the checksums, so edit them in the same PR from the release's checksums file; the CI run of the bump fails on the sha256 check until you do.
