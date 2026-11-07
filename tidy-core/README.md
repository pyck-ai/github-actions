# tidy-core

The plumbing the tidy actions share: reading action inputs, writing workflow commands and the step summary, the API-client factory and API URL, and test helpers (a fake GitHub API and the input defaults of an `action.yml`).

This is not an action: it has no `action.yml` and no `dist/`. It is source shared inside this repository, not a published package. [branch-tidy](../branch-tidy/README.md), [run-tidy](../run-tidy/README.md) and [cache-tidy](../cache-tidy/README.md) import it; ncc inlines it into each action's bundle. It builds on [registry](../registry/README.md) for the Octokit class.

| Module                                   | Owns                                                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`inputs.ts`](./src/inputs.ts)           | `InputError` and the required parsers for string, strict boolean and whole-number inputs; no fallbacks, the defaults live in `action.yml`          |
| [`output.ts`](./src/output.ts)           | `createOutput`: log lines and escaped `::notice::`, `::warning::` and `::error::` commands                                                         |
| [`errors.ts`](./src/errors.ts)           | `statusOf` and `describeError` for Octokit errors                                                                                                  |
| [`summary.ts`](./src/summary.ts)         | `appendStepSummary`: appends to `GITHUB_STEP_SUMMARY`; a write failure is only a warning                                                           |
| [`github.ts`](./src/github.ts)           | `OctokitFactory`, `productionOctokit`, `apiUrl` (from `GITHUB_API_URL`), `parseRepository` and `encodePathSegments`                                |
| [`fake-github.ts`](./src/fake-github.ts) | test-only: the `fetch`-level fake API (recording, routing, `Link` paging, fault injection), `octokitOn(fetch)` and `actionDefaults(actionYmlPath)` |

[`index.ts`](./src/index.ts) exports everything except `fake-github.ts`, which tests import directly so it never reaches a bundle. Each module has a `*.test.ts` next to it; `npm test` (part of `task ci`) runs them from the repository root.
