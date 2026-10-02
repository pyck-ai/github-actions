#!/bin/sh
# Runs INSIDE golang:1.25-alpine as the jev-check composite action's one
# container step, invoked by ../run.sh via
# `docker run --entrypoint /bin/sh ... /entrypoint.sh`, with this file
# itself bind-mounted in read-only (the same pattern verify-image's run.sh
# uses for a target's own verify.sh).
#
# POSIX `sh`, not bash: Alpine's default shell is busybox ash, and nothing
# here needs bash's extensions.
#
# Installs jev (github.com/pyck-ai/jev-cli/cmd/jev@$JEV_REF) once via `go
# install`, then runs it once per `*.json` file under /input (mounted
# read-only by run.sh), writing each result under /output (mounted
# read-write). For each input `X.json`: on success, writes `X.json` (jev's
# `-o json` stdout); on failure, writes `X.error` (jev's stderr plus its
# exit code) instead, and continues with the next file, processing EVERY
# file rather than stopping at the first failure, so one run reports every
# broken input rather than one failure per rerun (same principle as
# verify-image's run.sh). Exits 1 if any file failed, 0 otherwise; no
# `*.json` files under /input is logged, not a failure.
set -eu

: "${JEV_REF:?JEV_REF required}"
: "${HOME:?HOME required}"
: "${GOPATH:?GOPATH required}"
: "${GOCACHE:?GOCACHE required}"

# HOME/GOPATH/GOCACHE point under /tmp inside this container's own
# (ephemeral, --rm) filesystem (see run.sh for why), so they need creating
# fresh every run; /tmp itself is world-writable, so this succeeds under
# the arbitrary uid:gid `docker run --user` set us to, with no matching
# /etc/passwd entry required.
mkdir -p "$HOME" "$GOPATH" "$GOCACHE"

echo "jev-check: installing github.com/pyck-ai/jev-cli/cmd/jev@$JEV_REF..." >&2
go install "github.com/pyck-ai/jev-cli/cmd/jev@$JEV_REF"
PATH="$GOPATH/bin:$PATH"
export PATH

checked=0
failed=0

for f in /input/*.json; do
  # Nullglob workaround: with no match, ash leaves the pattern literal, and
  # no file by that literal name exists.
  [ -e "$f" ] || continue
  checked=$((checked + 1))

  name=$(basename "$f")
  stem=${name%.json}
  out="/output/$stem.json"
  err="/output/$stem.error"
  tmp_out="$out.tmp"
  tmp_err="$err.tmp"

  rc=0
  jev check -j - -o json <"$f" >"$tmp_out" 2>"$tmp_err" || rc=$?

  if [ "$rc" -eq 0 ]; then
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

if [ "$checked" -eq 0 ]; then
  echo "jev-check: no *.json files in /input; nothing to do."
  exit 0
fi

echo "jev-check: checked $checked file(s), $failed failed"
if [ "$failed" -gt 0 ]; then
  exit 1
fi
exit 0
