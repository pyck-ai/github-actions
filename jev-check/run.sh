#!/usr/bin/env bash
# Runner logic behind the jev-check composite action. Kept as a standalone
# script (rather than inline in action.yml) so it is testable directly,
# outside of Actions (see this repo's README, "jev-check" under Tools,
# for the invocation contract).
#
# Usage: run.sh <input-dir> <output-dir> <openrouter-api-key> <image>
#
#   input-dir            directory of *.json files, each a complete
#                         `jev check -j` input object:
#                         {"context": string, "propositions": [string, ...]}
#   output-dir            directory to write results to; created if missing
#   openrouter-api-key    OpenRouter key for the jev CLI. Exported as
#                         OPENROUTER_API_KEY and passed into the container
#                         by name only (`-e OPENROUTER_API_KEY`, no `=value`)
#                         so the key is never a command-line argument to
#                         `docker`, since it would otherwise be visible via
#                         `docker inspect` or a process listing on the
#                         runner host.
#   image                 jev container image reference. Required: the one
#                         and only default lives in action.yml (the `image`
#                         input), where Renovate keeps its digest current,
#                         so there is deliberately no second copy here.
#
# Design: jev runs from a prebuilt image (ghcr.io/pyck-ai/jev-cli), a
# static, shell-less, single-binary image whose ENTRYPOINT is jev itself. It
# is built, verified, and published by jev-cli's own pipeline, so this
# action neither compiles anything nor installs a toolchain on every run.
# The host runner is assumed minimal (bash + docker only: no go, no jq, no
# node), so the per-file loop lives here, on the host, in bash; the image
# has no shell to host one anyway.
#
# The image is pulled once up front, then each input file costs one
# `docker run`. Each file is fed to jev on stdin and its result is captured
# from stdout/stderr, so no bind mounts are needed: the container sees
# neither input-dir nor output-dir.
#
# Runs as the invoking user's own uid:gid (not the image's default uid), so
# files written into output-dir (by this script's redirections, as the
# runner user) and anything jev writes are never root-owned. The image sets
# HOME=/tmp, which is world-writable inside the container's own ephemeral
# (--rm) filesystem, so jev has a resolvable, writable HOME for any
# arbitrary numeric uid with no matching /etc/passwd entry required (jev
# exits 3 on every run without one).
#
# Exit status of `jev check` (jev-cli internal/tools/check/cli.go, main.go):
#   0  every proposition passed
#   1  at least one proposition needs review: STILL A VALID RESULT, jev
#      prints the complete JSON on stdout before exiting
#   3  hard error (missing key, bad input, network, ...): no usable result
# Statuses 0 and 1 are therefore both successes here (X.json is written);
# anything else is a failure (X.error is written). Treating 1 as a failure
# would discard exactly the results consumers care most about.
#
# Processes EVERY file rather than stopping at the first failure, so one
# run reports every broken input rather than one failure per rerun (same
# principle as verify-image's run.sh). Exits 1 if any file failed.
set -euo pipefail

input_dir="${1:?input-dir required}"
output_dir="${2:?output-dir required}"
openrouter_key="${3:?OpenRouter API key required}"
image="${4:?image required}"

export OPENROUTER_API_KEY="$openrouter_key"

if [ ! -d "$input_dir" ]; then
  echo "::error::input-dir '$input_dir' does not exist" >&2
  exit 1
fi

mkdir -p "$output_dir"

# Resolve to absolute paths so the glob and later messages do not depend on
# the working directory.
input_dir_abs="$(cd "$input_dir" && pwd)"
output_dir_abs="$(cd "$output_dir" && pwd)"

# Nothing to do: skip docker entirely rather than pay for an image pull that
# has no work waiting for it once it finishes.
shopt -s nullglob
input_files=("$input_dir_abs"/*.json)
shopt -u nullglob
if [ "${#input_files[@]}" -eq 0 ]; then
  echo "jev-check: no *.json files in $input_dir; nothing to do."
  exit 0
fi

# Pull once, before any output is written, so an unpullable image fails the
# step clearly instead of producing one .error file per input. Pulling only
# when the image is absent is the same thing on a fresh CI runner (always
# absent, so always pulled) and lets a locally built image be used for
# testing.
if ! docker image inspect "$image" >/dev/null 2>&1; then
  if ! docker pull --quiet "$image" >/dev/null; then
    echo "::error::could not pull jev image '$image'" >&2
    exit 1
  fi
fi

checked=0
failed=0

for f in "${input_files[@]}"; do
  checked=$((checked + 1))

  name="$(basename "$f")"
  stem="${name%.json}"
  out="$output_dir_abs/$stem.json"
  err="$output_dir_abs/$stem.error"
  tmp_out="$out.tmp"
  tmp_err="$err.tmp"

  # Written to .tmp then renamed, so a reader never sees a half-written
  # result.
  rc=0
  docker run --rm -i \
    --user "$(id -u):$(id -g)" \
    -e OPENROUTER_API_KEY \
    "$image" check -j - -o json <"$f" >"$tmp_out" 2>"$tmp_err" || rc=$?

  # 0 and 1 both carry a complete JSON result (see the header comment).
  if [ "$rc" -eq 0 ] || [ "$rc" -eq 1 ]; then
    mv "$tmp_out" "$out"
    rm -f "$tmp_err"
  else
    failed=$((failed + 1))
    rm -f "$tmp_out"
    {
      cat "$tmp_err"
      echo "jev exited with status $rc"
    } >"$err"
    rm -f "$tmp_err"
    echo "jev-check: $name failed (exit $rc); see $stem.error" >&2
  fi
done

echo "jev-check: checked $checked file(s), $failed failed"
if [ "$failed" -gt 0 ]; then
  exit 1
fi
exit 0
