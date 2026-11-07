# tidy-core

The plumbing the tidy actions share: reading action inputs, writing workflow commands and the step summary, building the Octokit client from the runner's environment, and a fake GitHub API for their unit tests.

This is not an action: it has no `action.yml` and no `dist/`. It is source shared inside this repository, not a published package. [branch-tidy](../branch-tidy/README.md) imports it, and the planned `run-tidy` and `cache-tidy` will; ncc inlines it into each action's bundle. It builds on [registry](../registry/README.md) for the Octokit class.

| Module                                   | Owns                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| [`inputs.ts`](./src/inputs.ts)           | `InputError` and the parsers for string, strict boolean and whole-number inputs             |
| [`output.ts`](./src/output.ts)           | `createOutput`: log lines and escaped `::notice::`, `::warning::` and `::error::` commands  |
| [`errors.ts`](./src/errors.ts)           | `statusOf` and `describeError` for Octokit errors                                           |
| [`summary.ts`](./src/summary.ts)         | `appendStepSummary`: appends to `GITHUB_STEP_SUMMARY`; a write failure is only a warning    |
| [`github.ts`](./src/github.ts)           | `createTidyOctokit`, `parseRepository` and `encodePathSegments`                             |
| [`fake-github.ts`](./src/fake-github.ts) | the `fetch`-level fake API for tests: recording, routing, `Link` paging and fault injection |

[`index.ts`](./src/index.ts) exports everything except the fake, which tests import directly so it never reaches a bundle. Each module has a `*.test.ts` next to it; `npm test` (part of `task ci`) runs them from the repository root.
