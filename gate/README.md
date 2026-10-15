# gate

<!-- toc
## Contents

- [Usage](#usage)
- [Behaviour](#behaviour)
- [Why skipped passes](#why-skipped-passes)
-->

One pass/fail verdict for a workflow's jobs, to use as the single required status check of a branch ruleset.

A plain JavaScript action (`node24`, no dependencies, no build step). The checker is [`check.mjs`](./check.mjs); the input is declared in [`action.yml`](./action.yml).

## Usage

Add one job per group, named `<group>-success`, that lists every job of the group under `needs` and always runs:

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: task lint
  ci-success:
    if: always()
    needs: [lint]
    permissions: {}
    runs-on: ubuntu-latest
    steps:
      - uses: pyck-ai/github-actions/gate@<sha>
        with:
          needs: ${{ toJSON(needs) }}
```

No checkout is needed: the runner fetches a remote action itself. Only this repository, which uses its own action as `./gate`, checks out first.

Without `if: always()` the gate job is skipped as soon as a job it needs fails, and GitHub counts a skipped job as passing for branch protection. Always run the gate.

## Behaviour

- `success` and `skipped` pass. `failure` and `cancelled` fail, and so does any other result.
- The step fails when `needs` is empty, not valid JSON or not an object: a gate that needs nothing gates nothing, and is a mistake.
- Writes one line per job to the step summary and an `::error::` annotation naming each job that did not pass.

## Why skipped passes

A job that is skipped by an `if:` (a deploy with no environment, a leg with nothing to build) did not fail and was meant not to run. Treating it as a failure would make every optional job break the gate. A job skipped because an upstream job failed is not a hole either: the upstream failure is itself in `needs` and fails the gate. The only requirement is that the gate lists the upstream job too.
