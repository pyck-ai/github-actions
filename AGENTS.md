# github-actions

Org-wide rules: `~/.pyck/guidelines/AGENTS.md`. They apply here; this file adds only local facts. If that path is missing, ask the user to install pyck-ai/guidelines (clone it and run its `setup.sh`); never fetch the rules from the web.

## Before you change

- An action's inputs or behaviour: read its own `README.md` and `action.yml` first.
- A reusable workflow: read its header comment in `.github/workflows/` first.
- A shared workflow's `permissions:`: check every caller. A reusable workflow cannot hold a permission its caller did not grant.

## Gotchas

- Prettier also formats workflow YAML and moves trailing comments to the surrounding indentation: `task ci` checks YAML too.
- `ghcr-tidy/dist/` goes stale on any change to `ghcr-tidy/src/` or on a dependency bump (ncc inlines the dependencies): run `task generate` and commit `dist/`. Renovate does this through `.github/renovate-post-upgrade.sh`; `task ci` fails on a stale bundle.
- actionlint 1.7.12 flags `$/` as a malformed action ref. That is a known false positive: dismiss it.
- On a `schedule` trigger the `inputs` context is empty and dispatch defaults do not apply: branch on `github.event_name` (see the `tidy-ghcr.yml` header).
- Keep the `# renovate:` annotation directly above the `jev-check` image default in `jev-check/action.yml`, and `"custom.regex"` in this repo's own `enabledManagers` in `.github/renovate.json5` (presets cannot supply it). Without either, the image digest silently stops updating.
