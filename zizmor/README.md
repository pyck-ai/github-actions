# zizmor

<!-- toc
## Contents

- [Usage](#usage)
- [What the caller provides](#what-the-caller-provides)
- [Behavior](#behavior)
-->

Scans a repository's GitHub Actions workflows and composite actions with [zizmor](https://github.com/zizmorcore/zizmor), a static security checker (template injection, unpinned actions, broad permissions).

A plain-bash composite action with no inputs. The pinned version and the sha256 of each archive are defined once, in [`action.yml`](./action.yml).

## Usage

```yaml
jobs:
  zizmor:
    runs-on: [pyck-ai, firecracker, light]
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@<sha>
        with:
          persist-credentials: false
      - uses: pyck-ai/github-actions/zizmor@<sha>
```

Add the job to the `needs` of the repository's `ci-success` gate.

## What the caller provides

- `task` on `PATH`. The pyck-ai runner image has it; elsewhere install it first.
- A `zizmor` task in the Taskfile that runs the scan, and the same task in `task ci`:

  ```yaml
  zizmor:
    desc: Scan the workflows and composite actions for security problems
    cmds:
      - zizmor --offline --no-progress .github
  ```

  Scan `.` instead of `.github` when the repository keeps composite actions in top-level directories, as this one does.

- Optionally `.github/zizmor.yml`, the baseline of findings that exist today, as `rules.<id>.ignore` entries. The file may only shrink: fix a finding and delete its entry, never add one for new code. Ignore a whole file rather than a line, because a line entry breaks when the file is edited.

## Behavior

- Downloads the release archive for the runner's architecture (`x86_64` or `aarch64`, Linux), checks its sha256 and fails on a mismatch, unpacks `zizmor` into `$RUNNER_TEMP`, puts it on `PATH` for the step, prints `zizmor --version` and runs `task zizmor`.
- Makes no decision: the exit code is the task's. zizmor exits non-zero on any finding that is not ignored.
- Offline by design: the task passes `--offline`, so no token is needed. Online mode adds checks that query GitHub.
- Updating the version: Renovate bumps `ZIZMOR_VERSION` (annotation `# renovate:` in [`action.yml`](./action.yml), custom manager in [`renovate.json5`](../.github/renovate.json5)). It cannot compute the checksums, so edit them in the same PR from the release's asset digests; the CI run of the bump fails on the sha256 check until you do.
