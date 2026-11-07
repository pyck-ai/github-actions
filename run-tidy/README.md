# run-tidy

<!-- toc
## Contents

- [Inputs](#inputs)
- [Which runs are deleted](#which-runs-are-deleted)
- [Listing](#listing)
- [Deleting](#deleting)
- [Permissions](#permissions)
- [Limitations](#limitations)
-->

Deletes the old workflow runs of the repository the workflow runs in. Run it through the [`tidy-repo.yml`](../.github/workflows/tidy-repo.yml) reusable workflow, or as a step with `uses: pyck-ai/github-actions/run-tidy@<sha>`.

A bundled `node24` action (`dist/` is committed), built on [tidy-core](../tidy-core/README.md) like [branch-tidy](../branch-tidy/README.md). It needs no checkout, no git binary and no Docker, and talks to the GitHub API only. Inputs and defaults live in [`action.yml`](./action.yml).

## Inputs

| Input               | Meaning                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `token`             | Token for all API calls; pass `${{ secrets.GITHUB_TOKEN }}`.                                                    |
| `retain-days`       | Whole number of days, from 1 to 36500.                                                                          |
| `keep-per-workflow` | Whole number, from 0 to 1000. The newest this many completed runs of each workflow are kept whatever their age. |
| `max-deletions`     | Whole number, from 1 to 100000. Stop deleting after this many runs in one invocation.                           |
| `dry-run`           | `true` or `false`. When true, the action makes no write call at all and reports each run as "would delete".     |

Any other value fails the step before any API call, and the error names the input and the value. The repository is always the one the workflow runs in.

## Which runs are deleted

A run is old when its `created_at` is strictly before the cutoff: the start of the step minus `retain-days` times 24 hours, in UTC. A re-run does not change `created_at`. A run with a missing or unparsable `created_at` is kept and a warning names it.

An old run is still kept when:

1. it is not completed (`queued`, `in_progress`, `waiting`, ...). That includes the run that executes run-tidy;
2. it is among the newest `keep-per-workflow` completed runs of its workflow by `created_at`, whatever its age or conclusion. A workflow that ran recently therefore keeps no old run; one that has not run for longer than `retain-days` keeps its newest.

Runs are grouped by `workflow_id`. Runs whose workflow file was deleted follow the same rules, and are reported under their workflow path or, failing that, `workflow <id>`. A run is not the record of a release: the tag, GitHub release or package is.

## Listing

The action lists every run with `GET /repos/{owner}/{repo}/actions/runs?per_page=100&exclude_pull_requests=true` and follows pagination to the end. It adds no other query parameter: GitHub caps a search that uses `actor`, `branch`, `check_suite_id`, `created`, `event`, `head_sha` or `status` at 1,000 results, and the per-workflow minimum needs every run. Any listing failure, including a 200 whose body is not a run list, fails the step before anything is deleted. A partial picture never leads to a deletion.

## Deleting

Old runs are deleted one at a time, oldest first. Before each deletion the log shows the workflow name, run id, run number, `created_at`, conclusion, event, branch and head SHA, because nothing else records the run afterwards. There is no check before the delete: GitHub only lets a run be deleted when it is completed or older than two weeks, and re-runs are possible only within 30 days of creation, so with `retain-days` of 30 or more a run cannot change between listing and deletion.

- 404: the run is already gone. A notice, counted, not a failure.
- Any other error: logged with the run id, HTTP status and GitHub's message; the action goes on and the step fails at the end naming the failed run ids.
- 401, or a 403 or 429 that survives the throttling plugin's retries: the loop stops and the step fails. The message includes GitHub's error body, so a rate-limit stop and a permission stop can be told apart, and the number of runs not attempted.
- `max-deletions`: after that many deletions the action stops, logs a notice with the number of old runs left, and succeeds; a backlog clears over the following days.

The `GITHUB_TOKEN` allows 1,000 requests per hour per repository, shared with the jobs that follow in `tidy-repo.yml`. One deletion is one request, so the `max-deletions` default in `action.yml` leaves the rest of the hour to the listing and the other jobs. A repository that creates more runs a day than that raises `max-deletions`.

With `dry-run: true` everything up to the delete call happens and each run is reported as "would delete". No write request is sent. Run every caller once by hand with `dry_run: true` first.

Every invocation logs one `run-tidy: ...` line with the counts. The step summary shows the mode, the cutoff, a row per workflow (runs seen, old, kept by the minimum, not finished, deleted or would delete, already gone, failed, not attempted, no date) and a total row. The action has no outputs.

## Permissions

`actions: write` to delete runs; listing needs `actions: read`. No contents access and no checkout.

## Limitations

Old runs of open pull requests are deleted; their checks disappear until re-run. A run stuck in `queued` or `waiting` is never deleted here, however old.
