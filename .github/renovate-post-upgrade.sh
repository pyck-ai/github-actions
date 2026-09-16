#!/bin/bash

# Renovate post-upgrade hook for this repo.
#
# Renovate runs this fixed path after applying a dependency update (see the
# postUpgradeTasks block in .github/renovate.json5). The org-wide runner
# allowlists this exact path, so the repo owns its post-upgrade logic here
# without anyone touching the runner's global allowedCommands.
# .github/CODEOWNERS guards it, because whatever is committed here runs
# arbitrary commands on a self-hosted runner.
#
# Why it exists: ghcr-tidy/dist/ is a COMMITTED ncc bundle with the runtime
# dependencies inlined into it (see the README's bundled-action distribution
# model). ci.yml's `build` job reruns `npm run bundle` and fails on any diff,
# tracked or untracked. So a bump to @octokit/* or yaml that lands without a
# rebuilt bundle fails its own pull request. This puts the bump and its bundle
# in the same commit.
#
# `npm run build` is deliberately NOT run here. It is tsc -p tsconfig.json,
# whose output goes to the gitignored lib/, so it cannot affect the commit.
# CI still runs it, which is where a type error should surface.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# This script installs no tooling, deliberately. The runner supplies npm:
# .github/renovate.json5 sets postUpgradeTasks.installTools.node, which makes
# Renovate provision a Node toolchain, at the version from constraints.node,
# before it runs this command.
#
# Keeping that out of here is what stops the Node version from being declared
# twice. It has to match the node-version ci.yml builds with, because this
# rebuilds an artifact that CI then compares byte for byte, and a version
# buried in a shell script is both invisible to that comparison and something
# every repo with a hook would have to repeat.

echo "renovate-post-upgrade: installing dependencies"
npm ci

echo "renovate-post-upgrade: rebuilding ghcr-tidy/dist"
npm run bundle

echo "renovate-post-upgrade: done"
