# verify-image

<!-- toc
## Contents

- [Inputs](#inputs)
- [Behavior](#behavior)
-->

Runs each pushed image's own `verify.sh` inside that exact image, so an unverified image never ships green.

A plain-bash composite action, not a CLI. Inputs and defaults live in [`action.yml`](./action.yml); the script's argument contract is the header of [`run.sh`](./run.sh).

## Inputs

- `targets`: newline-separated bake target names built by one leg.
- `contexts`: JSON map of `target -> {context, repo}`.
- The leg's own digest file (`target -> digest`).

## Behavior

- Runs every target's own `verify.sh` (POSIX `sh`, shipped alongside the target's Dockerfile, looked up under its bake context dir) inside the exact image just pushed for it:

  ```sh
  docker run --env-file buildargs.conf -e TARGET=<target> -v .../verify.sh:/verify.sh:ro --entrypoint /bin/sh <ref> /verify.sh
  ```

- Continues past a failure, so one push reports every broken target rather than one failure per cycle, and fails the step if any target failed.
- A target with no `verify.sh` is a hard failure, not a skip. That is the property that guarantees an unverified image never ships green.
- Shell-less targets (`FROM scratch`) are detected by probing for `/bin/sh`. On failure they are verified against a throwaway image built as `FROM <ref>` + `COPY --from=busybox:musl /bin /bin`, removed afterwards.
