#!/usr/bin/env bash
# Runner logic behind the jev-check composite action. Kept as a standalone
# script (rather than inline in action.yml) so it is testable directly,
# outside of Actions (see this repo's README, "jev-check" under Tools,
# for the invocation contract).
#
# Usage: run.sh <input-dir> <output-dir> <openrouter-api-key> [jev-ref]
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
#   jev-ref               go-installable ref of
#                         github.com/pyck-ai/jev-cli/cmd/jev; defaults to a
#                         commit pin (see action.yml) since jev-cli has no
#                         tagged releases yet; that default should move to
#                         a tag once one exists.
#
# The host runner is assumed minimal (bash + docker only: no go, no jq, no
# node), so jev itself runs inside golang:1.25-alpine (jev-cli's go.mod
# requires go 1.25.0), pinned by digest rather than the floating tag (see
# GO_IMAGE below), so a new Alpine/Go point release on Docker Hub can't
# change what a pinned consumer of this action actually executes.
# entrypoint.sh (run inside that container, mounted in read-only) installs
# jev once and then loops over every input file itself, so a batch of N
# files pays for `go install`'s network fetch exactly once rather than once
# per file.
#
# Runs as the invoking user's own uid:gid (not the image's default root),
# so files written into output-dir come out owned by the runner user
# rather than root. HOME/GOPATH/GOCACHE are pointed at paths under /tmp
# INSIDE the container's own (ephemeral, --rm) filesystem rather than a
# bind mount: /tmp there is world-writable by design and needs no matching
# /etc/passwd entry for an arbitrary numeric uid, whereas a bind-mounted
# host directory would have to already be owned or opened up for that
# exact uid.
set -euo pipefail

input_dir="${1:?input-dir required}"
output_dir="${2:?output-dir required}"
openrouter_key="${3:?OpenRouter API key required}"
jev_ref="${4:-f96cc157e45ba0997df0e8897aabd50ce09cbe2e}"

export OPENROUTER_API_KEY="$openrouter_key"

if [ ! -d "$input_dir" ]; then
  echo "::error::input-dir '$input_dir' does not exist" >&2
  exit 1
fi

mkdir -p "$output_dir"

# Resolve to absolute paths before bind-mounting: cwd inside `docker run` is
# irrelevant, but the mount source is resolved on the host (matches
# verify-image's run.sh).
input_dir_abs="$(cd "$input_dir" && pwd)"
output_dir_abs="$(cd "$output_dir" && pwd)"

# Resolve entrypoint.sh relative to this script's own location (not
# $GITHUB_ACTION_PATH), so run.sh keeps working when invoked directly
# outside of Actions.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Nothing to do: skip the container entirely rather than pay for a `go
# install` that has no work waiting for it once it finishes.
shopt -s nullglob
input_files=("$input_dir_abs"/*.json)
shopt -u nullglob
if [ "${#input_files[@]}" -eq 0 ]; then
  echo "jev-check: no *.json files in $input_dir; nothing to do."
  exit 0
fi

# golang:1.25-alpine, pinned by digest (jev-cli's go.mod requires go
# 1.25.0). Resolved via `docker buildx imagetools inspect
# golang:1.25-alpine` on 2026-09-28 (version 1.25.14-alpine3.24 at that
# time); re-resolve the same way to move this pin.
GO_IMAGE="golang:1.25-alpine@sha256:1ae0735f00daffa3aaf1363a5184c0d2dc55c78e3db4ec70241cdac97bf84b59"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp/jev-home \
  -e GOPATH=/tmp/jev-go \
  -e GOCACHE=/tmp/jev-gocache \
  -e OPENROUTER_API_KEY \
  -e JEV_REF="$jev_ref" \
  -v "$input_dir_abs:/input:ro" \
  -v "$output_dir_abs:/output" \
  -v "$script_dir/entrypoint.sh:/entrypoint.sh:ro" \
  --entrypoint /bin/sh \
  "$GO_IMAGE" /entrypoint.sh
