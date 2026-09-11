import type { RegressedTag, RegressionIncident } from "./verify.js";

/**
 * Renders a {@link RegressionIncident} into the plain-text body of the
 * breaker issue. Written for a human reading it cold, with no other
 * context, at 3am: what broke, what this run did just before it broke,
 * where to find more detail, and — because GHCR deletions are
 * irreversible — what to do about it. Pure and synchronous: no I/O, no
 * knowledge of GitHub, Octokit, or the breaker itself.
 */

/** Which of the three regression-predicate parts (see `verify.ts`'s `compareSnapshots`) is responsible for one tag's finding. Order matters: a tag that no longer resolves has nothing meaningful to say about its digest or closure, so that check comes first. */
function failedPredicatePart(t: RegressedTag): string {
  if (!t.stillResolves) {
    return "tag gone (no longer resolves)";
  }
  if (!t.digestUnchanged) {
    return "tag now resolves to a different digest";
  }
  if (!t.closureResolves) {
    return "manifest closure broken (a child manifest this tag's index points at no longer resolves)";
  }
  return "unknown (no predicate part reported as failed — this should not happen)";
}

function formatTag(t: RegressedTag): string {
  const before = t.digestBefore ?? "(none recorded)";
  const after = t.digestAfter ?? "(none — tag no longer resolves)";
  return [
    `  - ${t.tag}`,
    `      failed check:    ${failedPredicatePart(t)}`,
    `      digest before:   ${before}`,
    `      digest after:    ${after}`,
  ].join("\n");
}

export interface IncidentReportOptions {
  /** Path (or description of where to find) the NDJSON journal for this run, if known. */
  readonly journalPath?: string;
}

/**
 * Renders the full incident report body. See this module's doc for the
 * intended reader and the information it deliberately always includes.
 */
export function formatIncidentReport(
  incident: RegressionIncident,
  options: IncidentReportOptions = {},
): string {
  const deletionsSection =
    incident.precedingDeletions.length === 0
      ? "  (none — the regression was detected before this package deleted anything)"
      : incident.precedingDeletions
          .map((m) => `  - digest ${m.digest} (version id ${String(m.versionId)})`)
          .join("\n");

  const journalLine = options.journalPath
    ? `Journal file for this run: ${options.journalPath}`
    : "Journal file for this run: not recorded — check the run's own logs/artifacts for its journal path.";

  return [
    "ghcr-tidy detected a post-apply verification REGRESSION and stopped.",
    "",
    `Package:   ${incident.packageName}`,
    "",
    "Affected tags:",
    incident.tags.map(formatTag).join("\n"),
    "",
    "Deletions this run made in this package before the regression was detected:",
    deletionsSection,
    "",
    journalLine,
    "",
    "GHCR HAS NO UNDELETE. Whatever this run deleted in this package cannot be",
    "restored by GitHub — the only remediation is to rebuild and republish the",
    "affected tag(s) above from source.",
    "",
    "To clear this breaker: first understand the cause (read the journal above",
    "and confirm what actually broke and why), THEN close this issue. Closing",
    "the issue is the only way to clear the breaker — there is no automatic",
    "reset and no override flag. ghcr-tidy will refuse to delete anything in",
    "any package, in any future run, for as long as this issue stays open.",
  ].join("\n");
}
