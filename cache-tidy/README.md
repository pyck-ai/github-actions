# cache-tidy

<!-- toc
## Contents

- [Why](#why)
- [Inputs](#inputs)
- [Which caches are deleted](#which-caches-are-deleted)
- [Deleting](#deleting)
- [Permissions](#permissions)
- [Limitations](#limitations)
-->

Deletes the GitHub Actions caches of the repository the workflow runs in that no run can read any more. Run it through the [`tidy-repo.yml`](../.github/workflows/tidy-repo.yml) reusable workflow, or as a step with `uses: pyck-ai/github-actions/cache-tidy@<sha>`.

A bundled `node24` action (`dist/` is committed), built on [tidy-core](../tidy-core/README.md). It needs no checkout, no git binary and no Docker. It talks to the GitHub API only. Inputs and defaults live in [`action.yml`](./action.yml).

## Why

Measured on 2026-11-07, read-only: the 8 largest pyck-ai repositories hold 15.4 GB in 57 caches, the organization 18.2 GB in 1,221. No repository is over the 10 GB default limit, and no cache was unused for more than 7 days, so neither GitHub's [7-day removal nor its eviction](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching) has fired. The value is headroom: at the limit GitHub evicts by last access, so a rarely read but live default-branch cache can go before dead pull request caches that were touched more recently. Caches of merged or closed pull requests and of deleted branches are 41% of the measured bytes, 55% with the tag form.

## Inputs

| Input     | Meaning                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------- |
| `token`   | Token for all API calls; pass `${{ secrets.GITHUB_TOKEN }}`.                                              |
| `dry-run` | `true` or `false`. When true, the action makes no write call at all; the summary table is the delete set. |

Any other value for `dry-run` fails the step before any API call, and the error names the input and the value. The repository is always the one the workflow runs in.

## Which caches are deleted

A run restores caches of its own ref, of the default branch and, for a pull request run, of the pull request's base branch. A `refs/pull/<n>/merge` cache is readable only by re-runs of pull request `<n>`. A `refs/heads/<b>` cache is readable by runs on `<b>` and by pull requests based on `<b>`, and no open pull request can have a deleted base. So a cache is dead when its pull request is closed or its branch is gone. Each cache's `ref` is read in this order:

1. `refs/pull/<n>/merge` or `refs/pull/<n>/head`: dead when pull request `<n>` is closed, merged or not.
2. `refs/heads/refs/tags/<t>` or `refs/tags/<t>`: dead only when neither a tag nor a branch named `<t>` exists.
3. `refs/heads/<name>`, merge-queue branches `refs/heads/gh-readonly-queue/...` included: dead when `<name>` is not in the branch list.
4. Anything else: kept, and counted as `unknown` so an unexpected form shows in the summary.

The default branch's caches are always kept. A pull request that is not in the open list is looked up once (`GET /pulls/{n}`); an answer other than `closed`, a 404 included, keeps its caches and logs a warning naming the number, and the step stays green.

No rule deletes a cache because a newer one with a similar key exists: keys are chosen by each workflow (BuildKit, for one, stores each image layer under its own key). Deleting a cache never breaks a run; the worst case is one cold build for a reopened pull request or a branch recreated under the same name.

## Deleting

Caches are deleted by id (`DELETE /actions/caches/{id}`), never by key: the key endpoint without `ref` deletes that key on every ref. One at a time, largest first.

- A 404 is "already gone", a notice.
- Any other error is logged with the cache id; the action goes on, and the step fails at the end naming the failed ids.
- A 401 or 403 stops the loop, fails the step and lists the caches not attempted. A rate-limit 403 clears by the next day's run. There is no retry beyond the retry and throttling plugins.
- If listing the caches, branches, repository, open pull requests or tags fails, the step fails before anything is deleted. A partial picture never leads to a deletion.

With `dry-run: true` the action lists and classifies every cache as in a live run and reports each cache it would delete. It sends no request other than reads.

Every run logs one count line. The step summary shows the mode, bytes and counts per class (pull request merged, pull request closed, branch gone, tag gone, kept: default branch, existing branch or tag, open pull request, pull request state unreadable, unknown ref form) and a table of the deleted or would-delete caches with id, key, ref, reason, size and `last_accessed_at`. The usage endpoints lag about 5 minutes and are not used. The action has no outputs.

## Permissions

`actions: write` to delete caches, `contents: read` for branches and tags, `pull-requests: read` for pull request state. A calling workflow's own permissions must grant `actions: write`, as the run cleanup in `tidy-repo.yml` already requires.

## Limitations

A cache of a deleted branch whose name is later recreated starts cold. The listing is read once at the start; a cache created during the run is not seen.
