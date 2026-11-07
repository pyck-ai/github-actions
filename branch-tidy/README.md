# branch-tidy

<!-- toc
## Contents

- [Inputs](#inputs)
- [Which branches are deleted](#which-branches-are-deleted)
- [Deleting](#deleting)
- [Permissions](#permissions)
- [Limitations](#limitations)
-->

Deletes the stale branches of the repository the workflow runs in. Run it through the [`tidy-repo.yml`](../.github/workflows/tidy-repo.yml) reusable workflow, or as a step with `uses: pyck-ai/github-actions/branch-tidy@<sha>`.

A bundled `node24` action (`dist/` is committed). It needs no checkout, no git binary and no Docker, so it runs on runners that reject Dockerfile actions. It talks to the GitHub API only. Inputs and defaults live in [`action.yml`](./action.yml).

## Inputs

| Input                      | Meaning                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `token`                    | Token for all API calls; pass `${{ github.token }}`.                                    |
| `retain-days`              | Whole number of days, from 1 to 36500.                                                  |
| `dry-run`                  | `true` or `false`. When true, the action makes no write call at all.                    |
| `exclude-open-pr-branches` | `true` or `false`. When true, keep branches an open pull request uses.                  |
| `keep-branches`            | Comma-separated branch names never to delete. Whitespace and empty entries are ignored. |

Any other value for `retain-days`, `dry-run` or `exclude-open-pr-branches` fails the step before any API call, and the error names the input and the value. The repository is always the one the workflow runs in. There is no input for another repository, for tags or for name patterns.

## Which branches are deleted

A branch is stale when the committer date of its head commit is strictly earlier than the cutoff: the start of the run minus `retain-days` times 24 hours. A head commit exactly at the cutoff is kept. Only the head commit counts.

A stale branch is still kept, and the log gives the reason, when:

1. it is listed in `keep-branches` (exact, case sensitive match);
2. it is the repository's default branch, listed or not;
3. the branch listing reports it as protected (classic protection or rulesets), or reports no protection status at all;
4. with `exclude-open-pr-branches`: it is the head branch of an open pull request whose head is in this repository, or the base branch of any open pull request. A pull request from a fork, or from a deleted fork, does not protect a same-named branch here.

A branch whose head commit date cannot be read, or that does not point at a commit, is kept and a warning names it. Tags are never read or deleted.

## Deleting

Branches are handled one at a time in name order. For each one the action reads the ref again, then deletes it only if the head SHA is still the one it judged. A ref that is gone is a notice; a ref that moved is kept with a notice. The head SHA is logged before every deletion, and the step summary lists it with the command `git push origin <sha>:refs/heads/<name>` that recreates the branch.

- A failed `DELETE` (including 404 and 422) is logged with the branch and the HTTP status; the action goes on, and the step fails at the end naming the failed branches.
- A 401 or 403 stops the loop, fails the step and lists the branches not attempted.
- If listing branches, their commit dates, the repository or the open pull requests fails (including a GraphQL response carrying `errors`), the step fails before anything is deleted. A partial picture never leads to a deletion.

With `dry-run: true` the action lists and judges every branch as in a live run and reports each branch it would delete. It sends no request other than reads.

The step summary shows the mode, the cutoff, the counts (seen, stale, kept per reason, deleted or would delete, already gone, changed since listing, failed) and a table of the deleted branches. The action has no outputs.

## Permissions

`contents: write` to delete branches (listing needs `contents: read`) and `pull-requests: read` to list open pull requests. Rate limits are handled by the retry and throttling plugins of the shared Octokit client in [`registry/packages.ts`](../registry/packages.ts); the read side uses paginated list calls, never one call per branch.

## Limitations

A branch that points at an old commit (created from an old ref, or reset to one) counts as stale on its first run, even if it was pushed today: GitHub offers no cheap "last pushed" date. Branches that share history with the default branch are judged by their own head only. Run with `dry-run: true` first; the summary table is the exact delete set.
