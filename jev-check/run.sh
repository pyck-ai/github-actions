#!/usr/bin/env bash
# Runner logic behind the jev-check composite action. Kept as a standalone
# script (rather than inline in action.yml) so it is testable directly,
# outside of Actions (see README.md in this directory for the invocation
# contract).
#
# Usage: run.sh <input-dir> <output-dir> <openrouter-api-key> <image> [command]
#
#   input-dir            directory of *.json files, each a complete
#                         `jev <command> -j` input object: for `check`,
#                         {"context": string, "propositions": [string, ...]};
#                         for `ask`, {"state": ..., "questions": {...}}
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
#   command               jev tool to run on each file: `check` or `ask`.
#                         Optional, default `check`; anything else exits 2
#                         before the image is pulled or any output written.
#
# Optional LiteLLM proxy, read from the environment (not positional args, so
# existing five-argument callers are unaffected):
#
#   PYCKLLM_API_KEY       LiteLLM virtual key. Unset or empty: none of the
#                         three variables below reaches the container and
#                         jev talks to OpenRouter directly, exactly as
#                         without this feature.
#   PYCKLLM_BASE_URL      proxy base root. Optional; jev's own default is
#                         http://127.0.0.1:53986. Inside the container
#                         127.0.0.1 is the container itself, so a local
#                         proxy URL only works with host networking; in CI
#                         use https://llm.pyck.dev.
#   JEV_CLI_ROUTE         `auto` (default), `proxy` (no fallback) or
#                         `direct`. Anything else exits 2 before the image
#                         is pulled or any output written; `proxy` without
#                         PYCKLLM_API_KEY exits 2 as well.
#
# When PYCKLLM_API_KEY is set, each of the variables above that is non-empty
# is passed into the container by name only (`-e PYCKLLM_API_KEY`, no
# `=value`), like the OpenRouter key.
#
# Optional model list, also from the environment:
#
#   JEV_MODELS            whitespace or newline separated model slugs
#                         (`typesafe/jev-1.14 liquid/d1-ultra`). Unset or
#                         empty: one run per file on jev's default model,
#                         writing <stem>.json / <stem>.error, exactly as
#                         without this feature. Set: every file runs once per
#                         slug with the root flag `--model <slug>` before the
#                         command, writing <stem>@<suffix>.json /
#                         <stem>@<suffix>.error, where <suffix> is the slug
#                         with every character outside [A-Za-z0-9._-]
#                         replaced by `_` (`typesafe/jev-1.14` becomes
#                         `typesafe_jev-1.14`). A slug that does not match
#                         ^~?[A-Za-z0-9._-]+/[A-Za-z0-9._:-]+$ exits 2 before
#                         the image is pulled or any output written.
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
# Exit status of `jev check` and `jev ask` (jev-cli internal/tools/check/cli.go,
# main.go; `ask` uses 0 and 3 the same way):
#   0  success (`check`: every proposition passed)
#   1  `check` only: at least one proposition needs review: STILL A VALID
#      RESULT, jev prints the complete JSON on stdout before exiting
#   3  hard error (missing key, bad input, network, ...): no usable result
# Statuses 0 and 1 are therefore both successes here (X.json is written);
# anything else is a failure (X.error is written). Treating 1 as a failure
# would discard exactly the results consumers care most about.
#
# Processes EVERY file (and, with JEV_MODELS, every model) rather than stopping at the first failure, so one
# run reports every broken input rather than one failure per rerun (same
# principle as verify-image's run.sh). Exits 1 if any run failed.
set -euo pipefail

input_dir="${1:?input-dir required}"
output_dir="${2:?output-dir required}"
openrouter_key="${3:?OpenRouter API key required}"
image="${4:?image required}"
command="${5:-check}"

if [ "$command" != "check" ] && [ "$command" != "ask" ]; then
  echo "::error::command must be 'check' or 'ask', got '$command'" >&2
  exit 2
fi

route="${JEV_CLI_ROUTE:-auto}"
case "$route" in
  auto | proxy | direct) ;;
  *)
    echo "::error::route must be 'auto', 'proxy' or 'direct', got '$route'" >&2
    exit 2
    ;;
esac

if [ "$route" = "proxy" ] && [ -z "${PYCKLLM_API_KEY:-}" ]; then
  echo "::error::route 'proxy' needs pyckllm-api-key" >&2
  exit 2
fi

# Whole-string read: IFS splits on spaces, tabs and newlines; `-d ''` keeps it
# from stopping at the first line. read returns non-zero at EOF, hence `|| true`.
models=()
IFS=$' \t\n' read -r -d '' -a models <<<"${JEV_MODELS:-}" || true
for model in "${models[@]+"${models[@]}"}"; do
  if [[ ! "$model" =~ ^~?[A-Za-z0-9._-]+/[A-Za-z0-9._:-]+$ ]]; then
    echo "::error::model '$model' is not a valid slug (expected provider/name)" >&2
    exit 2
  fi
done

export OPENROUTER_API_KEY="$openrouter_key"

# Names only (never `-e NAME=value`): values stay out of `docker inspect` and
# the process list. The proxy variables are passed only with a proxy key, so
# without one the docker command line is the one from before this feature.
env_args=(-e OPENROUTER_API_KEY)
if [ -n "${PYCKLLM_API_KEY:-}" ]; then
  export JEV_CLI_ROUTE="$route"
  env_args+=(-e PYCKLLM_API_KEY -e JEV_CLI_ROUTE)
  if [ -n "${PYCKLLM_BASE_URL:-}" ]; then
    env_args+=(-e PYCKLLM_BASE_URL)
  fi
fi

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

# Without models there is one run per file on jev's default model (empty
# slug, no --model flag, plain output names).
runs=("")
unit="file(s)"
if [ "${#models[@]}" -gt 0 ]; then
  runs=("${models[@]}")
  unit="run(s) (file x model)"
fi

checked=0
failed=0

for f in "${input_files[@]}"; do
  name="$(basename "$f")"
  stem="${name%.json}"

  for model in "${runs[@]}"; do
    checked=$((checked + 1))

    model_args=()
    label="$stem"
    what="$name"
    if [ -n "$model" ]; then
      model_args=(--model "$model")
      label="$stem@${model//[^A-Za-z0-9._-]/_}"
      what="$name with $model"
    fi
    out="$output_dir_abs/$label.json"
    err="$output_dir_abs/$label.error"
    tmp_out="$out.tmp"
    tmp_err="$err.tmp"

    # Written to .tmp then renamed, so a reader never sees a half-written
    # result.
    rc=0
    docker run --rm -i \
      --user "$(id -u):$(id -g)" \
      "${env_args[@]}" \
      "$image" "${model_args[@]+"${model_args[@]}"}" "$command" -j - -o json <"$f" >"$tmp_out" 2>"$tmp_err" || rc=$?

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
      echo "jev-check: $what failed (exit $rc); see $label.error" >&2
    fi
  done
done

echo "jev-check: checked $checked $unit, $failed failed"
if [ "$failed" -gt 0 ]; then
  exit 1
fi
exit 0
