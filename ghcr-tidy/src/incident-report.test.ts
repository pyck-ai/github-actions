import { describe, expect, it } from "vitest";
import { packageName } from "../../registry/package-name.js";
import { digest, tag } from "./domain.js";
import type { RegressionIncident } from "./verify.js";
import { formatIncidentReport } from "./incident-report.js";

const pkg = packageName("baseimages/golang");

describe("formatIncidentReport", () => {
  it("renders a tag-gone regression, with journal path", () => {
    const incident: RegressionIncident = {
      packageName: pkg,
      tags: [
        {
          tag: tag("latest"),
          digestBefore: digest("sha256:live"),
          digestAfter: undefined,
          stillResolves: false,
          digestUnchanged: false,
          closureResolves: false,
        },
      ],
      precedingDeletions: [{ digest: digest("sha256:garbage"), versionId: 1 }],
    };

    const body = formatIncidentReport(incident, {
      journalPath: "/tmp/ghcr-tidy-2026-09-11.ndjson",
    });

    expect(body).toMatchInlineSnapshot(`
      "ghcr-tidy detected a post-apply verification REGRESSION and stopped.

      Package:   baseimages/golang

      Affected tags:
        - latest
            failed check:    tag gone (no longer resolves)
            digest before:   sha256:live
            digest after:    (none — tag no longer resolves)

      Deletions this run made in this package before the regression was detected:
        - digest sha256:garbage (version id 1)

      Journal file for this run: /tmp/ghcr-tidy-2026-09-11.ndjson

      GHCR HAS NO UNDELETE. Whatever this run deleted in this package cannot be
      restored by GitHub — the only remediation is to rebuild and republish the
      affected tag(s) above from source.

      To clear this breaker: first understand the cause (read the journal above
      and confirm what actually broke and why), THEN close this issue. Closing
      the issue is the only way to clear the breaker — there is no automatic
      reset and no override flag. ghcr-tidy will refuse to delete anything in
      any package, in any future run, for as long as this issue stays open."
    `);
  });

  it("renders a digest-changed regression", () => {
    const incident: RegressionIncident = {
      packageName: pkg,
      tags: [
        {
          tag: tag("latest"),
          digestBefore: digest("sha256:live"),
          digestAfter: digest("sha256:other"),
          stillResolves: true,
          digestUnchanged: false,
          closureResolves: true,
        },
      ],
      precedingDeletions: [],
    };

    const body = formatIncidentReport(incident);

    expect(body).toContain("failed check:    tag now resolves to a different digest");
    expect(body).toContain("digest before:   sha256:live");
    expect(body).toContain("digest after:    sha256:other");
    expect(body).toContain(
      "(none — the regression was detected before this package deleted anything)",
    );
    expect(body).toContain("Journal file for this run: not recorded");
  });

  it("renders a broken-closure regression", () => {
    const incident: RegressionIncident = {
      packageName: pkg,
      tags: [
        {
          tag: tag("latest"),
          digestBefore: digest("sha256:index"),
          digestAfter: digest("sha256:index"),
          stillResolves: true,
          digestUnchanged: true,
          closureResolves: false,
        },
      ],
      precedingDeletions: [{ digest: digest("sha256:arch-arm64"), versionId: 1 }],
    };

    const body = formatIncidentReport(incident);

    expect(body).toContain(
      "failed check:    manifest closure broken (a child manifest this tag's index points at no longer resolves)",
    );
  });
});
