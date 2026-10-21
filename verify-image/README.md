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
- `digests`: path to the JSON `target -> digest` file of this leg, so the exact pushed artifact is verified. `build-image.yml` runs one leg per component and platform and calls this action only when the leg's platform is the runner's native one.
- `buildargs`: path to `buildargs.conf` (default `buildargs.conf`, optional), passed to each `verify.sh` as environment through `docker run --env-file`.
- `builder`: buildx builder for the derived busybox image below (optional). Empty uses plain `docker build`; set, it runs `docker buildx build --builder <builder> --load`. `build-image.yml` sets it to the leg's remote builder on the kata pool, where the podman socket cannot run buildx's default docker-container builder.

## Behavior

- Runs every target's own `verify.sh` (POSIX `sh`, shipped alongside the target's Dockerfile, looked up under its bake context dir) inside the exact image just pushed for it:

  ```sh
  docker run --env-file buildargs.conf -e TARGET=<target> -v .../verify.sh:/verify.sh:ro --entrypoint /bin/sh <ref> /verify.sh
  ```

- Continues past a failure, so one push reports every broken target rather than one failure per cycle, and fails the step if any target failed.
- A target with no `verify.sh` is a hard failure, not a skip. That is the property that guarantees an unverified image never ships green.
- Shell-less targets (`FROM scratch`) are detected by probing for `/bin/sh`. On failure they are verified against a throwaway image built as `FROM <ref>` + `COPY --from=busybox:musl /bin /bin`, removed afterwards.
