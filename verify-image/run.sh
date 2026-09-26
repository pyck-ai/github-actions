#!/usr/bin/env bash
# Runner logic behind the verify-image composite action. Kept as a standalone
# script (rather than inline in action.yml) so it is testable directly,
# outside of Actions — see this repo's README ("verify-image" under Tools)
# for the invocation contract.
#
# Usage: run.sh <targets> <contexts-json> <digests-file> [buildargs-file]
#
#   targets         newline-separated list of bake target names built by one
#                   leg (matrix.component.targets in build-image.yml)
#   contexts-json   JSON object: target -> {context, repo}. "context" is the
#                   target's own bake context dir, where its verify.sh
#                   lives; "repo" is the registry repo its digest was pushed
#                   to. As emitted by build-image.yml's `discover` job.
#   digests-file    path to a JSON object: target -> digest, written by this
#                   leg's own "Export digest" step (the EXACT digest just
#                   pushed, not whatever a floating tag happens to point at)
#   buildargs-file  optional KEY=VALUE file passed to each verify.sh via
#                   `docker run --env-file`; tolerated if absent
#
# Verifies EVERY target in the list rather than stopping at the first
# failure — a run that reports every broken image beats one failure per push
# cycle, since a re-run only ever surfaces the next one. A target with no
# verify.sh is a hard failure, not a skip, for every target checked: this is
# the property that guarantees every taggable image is actually verified
# before a tag can move. Do not weaken this to a warning or a pass.
set -euo pipefail

targets="${1:?targets required}"
contexts_json="${2:?contexts JSON required}"
digests_file="${3:?digests file required}"
buildargs="${4:-buildargs.conf}"

env_file_args=()
if [ -n "$buildargs" ] && [ -f "$buildargs" ]; then
  env_file_args=(--env-file "$buildargs")
fi

# Verifies a single target. Callers must invoke this as `( verify_one ... )`
# (a subshell): the EXIT trap it installs then only ever cleans up ITS OWN
# derived busybox image, regardless of how the subshell exits — success, a
# failing verify.sh, or an early `return` for a missing verify.sh — without
# one target's cleanup racing another's when the loop below keeps going.
verify_one() {
  local target="$1" context="$2" image="$3"

  local script="$context/verify.sh"
  # A target with no verify.sh is a hard failure, not a skip. Do not weaken
  # this to a warning or a pass.
  if [ ! -f "$script" ]; then
    echo "::error::target '$target' has no verify.sh (looked for: $script)" >&2
    return 1
  fi

  # Resolve to an absolute path before bind-mounting: cwd inside `docker run`
  # is irrelevant, but the mount source is resolved on the host.
  local script_dir script_abs
  script_dir="$(cd "$(dirname "$script")" && pwd)"
  script_abs="$script_dir/$(basename "$script")"

  local ref="$image"
  # NOT `local`: the EXIT trap below fires once this subshell's last command
  # (this function call) returns — by which point a `local` var's scope has
  # already been popped, so `cleanup` would read an unset `derived_tag`
  # under `set -u`. A plain (subshell-global) assignment survives until the
  # subshell process itself exits, which is exactly when the trap runs.
  # Safe across targets because each `verify_one` call gets its own subshell
  # (see the caller).
  derived_tag=""
  # shellcheck disable=SC2329 # invoked indirectly via `trap cleanup EXIT`
  cleanup() {
    if [ -n "$derived_tag" ]; then
      docker rmi -f "$derived_tag" >/dev/null 2>&1 || true
    fi
  }
  trap cleanup EXIT

  # Builds (once per target — callers must check `$derived_tag` is still
  # empty first) a throwaway image that layers busybox's /bin (a directory
  # of applet symlinks) onto the exact digest under test, so it's provably
  # "the published artifact plus one directory". Sets `derived_tag` on
  # success; the EXIT trap above removes it regardless of how this
  # function's caller's caller (verify_one) ultimately returns.
  derive_busybox_image() {
    derived_tag="verify-image-derived-$$-$RANDOM-$target"
    printf 'FROM %s\nCOPY --from=busybox:musl /bin /bin\n' "$image" \
      | docker build -q -t "$derived_tag" - >/dev/null
  }

  # shellcheck disable=SC2329 # invoked (possibly twice) below
  run_verify_sh() {
    docker run --rm \
      "${env_file_args[@]}" \
      -e TARGET="$target" \
      -v "$script_abs:/verify.sh:ro" \
      --entrypoint /bin/sh \
      "$1" /verify.sh
  }

  # Shell-less detection (e.g. `FROM scratch` images like baseimages'
  # `static`): a bare `/bin/sh -c` probe fails immediately if there's no
  # shell to exec at all. On failure, derive a throwaway image that layers
  # busybox's /bin (a directory of applet symlinks) onto the exact digest
  # under test, so the derived image is provably "the published artifact
  # plus one directory" and verify.sh runs under the same shell dialect as
  # every other image.
  if ! docker run --rm --entrypoint /bin/sh "$image" -c 'exit 0' >/dev/null 2>&1; then
    echo "::notice::$target: image has no /bin/sh; verifying via a derived busybox image"
    if ! derive_busybox_image; then
      echo "::error::target '$target' failed to build a derived busybox image from $image" >&2
      return 1
    fi
    ref="$derived_tag"
  fi

  local rc
  rc=0
  run_verify_sh "$ref" || rc=$?

  # A *partial* shell (enough applets for the probe above to pass, not
  # enough for what verify.sh itself calls — e.g. printenv/grep/sleep) fails
  # here instead, distinctly from the no-shell case above. Rather than
  # requiring every target to permanently ship whatever verify.sh happens to
  # use beyond its own entrypoint's runtime needs, retry once against a
  # derived busybox image before giving up. Only reachable once per target
  # ($derived_tag empty means the probe above didn't already retry this
  # way), so a genuinely shell-less image never gets a redundant second
  # build. This can only turn a false failure (missing tool) into a pass —
  # it cannot mask a real verify.sh assertion failure, since the identical
  # assertion still runs against the same image plus strictly more tools.
  if [ "$rc" -ne 0 ] && [ -z "$derived_tag" ]; then
    echo "::notice::$target: verify.sh failed against the shipped image as-is (exit $rc); retrying against a derived busybox image in case a tool verify.sh uses, but the image doesn't ship at runtime, was missing"
    if derive_busybox_image; then
      rc=0
      run_verify_sh "$derived_tag" || rc=$?
    fi
  fi

  if [ "$rc" -ne 0 ]; then
    echo "::error::verify.sh failed for target '$target' (image $image, script $script_abs): exit $rc" >&2
  fi
  return "$rc"
}

failed=()
checked=0
while IFS= read -r t; do
  [ -n "$t" ] || continue
  checked=$((checked + 1))

  context=$(jq -r --arg t "$t" '.[$t].context // empty' <<<"$contexts_json")
  repo=$(jq -r --arg t "$t" '.[$t].repo // empty' <<<"$contexts_json")
  digest=$(jq -r --arg t "$t" '.[$t] // empty' "$digests_file")

  if [ -z "$context" ] || [ -z "$repo" ] || [ -z "$digest" ]; then
    echo "::error::missing context/repo/digest for target '$t' (context='$context' repo='$repo' digest='$digest')" >&2
    failed+=("$t")
    continue
  fi

  if ! ( verify_one "$t" "$context" "${repo}@${digest}" ); then
    failed+=("$t")
  fi
done <<<"$targets"

if [ "$checked" -eq 0 ]; then
  echo "::error::no targets given to verify" >&2
  exit 1
fi

echo "verify-image: checked $checked target(s), ${#failed[@]} failed"
if [ "${#failed[@]}" -gt 0 ]; then
  for t in "${failed[@]}"; do
    echo "::error::$t: verification failed"
  done
  exit 1
fi

exit 0
