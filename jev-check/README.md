# jev-check

<!-- toc
## Contents

- [Inputs](#inputs)
- [Behavior](#behavior)
- [Design](#design)
-->

Runs TypeSafe's [jev CLI](https://github.com/pyck-ai/jev-cli) once per input file and writes one result per file.

A plain-bash composite action, not a CLI. Inputs and defaults live in [`action.yml`](./action.yml); the script's argument contract is the header of [`run.sh`](./run.sh).

## Inputs

- `input-dir`: directory of `*.json` files, each a complete `jev check -j` input object: `{"context": string, "propositions": [string, ...]}`.
- `output-dir`: where results are written.
- `command` (optional): `check` (default) or `ask`. `ask` runs `jev ask -j` (`{"state": ..., "questions": {...}}`) for every file. Any other value exits 2 before anything is pulled or written.
- `image` (optional): the jev CLI image. Defaults to `ghcr.io/pyck-ai/jev-cli` pinned by digest, defined once in [`action.yml`](./action.yml).
- `openrouter-api-key`: passed into the container by name only (`-e OPENROUTER_API_KEY`, no `=value`), never as a command-line value visible to `docker inspect` or a process listing on the runner host.

## Behavior

- For each `X.json`, writes `X.json` (jev's `-o json` result) on success or `X.error` (jev's stderr plus its exit code) on failure.
- Continues past a failure, so one run reports every broken input rather than one failure per rerun, and fails the step if any input failed.
- jev exit status `0` and `1` (some proposition needs review) both print a complete JSON result and both write `X.json`. Any other status writes `X.error`.
- An empty (or all-non-`.json`) `input-dir` is logged and not a failure.
- [`run.sh`](./run.sh) pulls the image once, then runs one `docker run` per input file (input on stdin, result on stdout, no bind mounts).
- The container runs as the invoking user's own uid:gid, so output files come out owned by the runner user rather than root.

## Design

- Deliberately generic and GitHub-credential-free: this is the batch primitive a caller assembles a workflow around, e.g. pyck-ai/pyck-review's scheduled PR-classification workflow, whose middle job prepares inputs in an earlier job (with GitHub credentials this action never sees) and reads outputs in a later one.
- The runner is assumed to have only bash and docker, and no Go toolchain: jev runs from the prebuilt, static `ghcr.io/pyck-ai/jev-cli` image, which jev-cli's own pipeline builds, verifies, and publishes.
- Renovate keeps the image digest current through the custom regex manager in [`.github/renovate.json5`](../.github/renovate.json5), which matches the `# renovate:` annotation above the default in [`action.yml`](./action.yml).
