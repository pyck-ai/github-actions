import type { PersistedGroupMember } from "./persisted-plan.js";
import type { RegressedTag, RegressionIncident } from "./verify.js";

/**
 * Renders a {@link RegressionIncident} into the plain-text body of the
 * breaker issue. Written for a human reading it cold, with no other
 * context, at 3am: what broke, what this run did just before it broke,
 * where to find more detail, and — because GHCR deletions are
 * irreversible — what to do about it. Pure and synchronous: no I/O, no
 * knowledge of GitHub, Octokit, or the breaker itself.
 */

/**
 * GitHub's hard limit on an issue/comment body is 65536 characters —
 * kept comfortably under it rather than exactly at it, since this is
 * plain text with no reason to court the edge. This is the fix for the
 * incident that made it necessary: a single concurrent-publish burst on
 * one package (~40 tags repointed by someone else's CI mid-run)
 * produced a body over 65536 characters, GitHub's `POST .../issues`
 * rejected it outright ("Validation Failed: body is too long"), and the
 * breaker — the safety mechanism for a REAL regression — could not file
 * its own incident at the exact moment it mattered most.
 */
export const MAX_INCIDENT_BODY_CHARS = 60_000;

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

function formatDeletion(m: PersistedGroupMember): string {
  return `  - digest ${m.digest} (version id ${String(m.versionId)})`;
}

/** Renders every item in full — the untruncated path, byte-identical to this module's pre-truncation behaviour, used whenever the resulting body fits under {@link MAX_INCIDENT_BODY_CHARS} on the first attempt. */
function renderFull<T>(
  items: readonly T[],
  render: (item: T) => string,
  emptyText: string,
): string {
  return items.length === 0 ? emptyText : items.map(render).join("\n");
}

/**
 * Renders as many `render(item)` lines from `items` as fit in `budget`
 * characters (each joined by `"\n"`), appending a plain, explicit
 * omission notice — never silent — when any had to be left out. Used for
 * both the affected-tags and preceding-deletions sections so an incident
 * with thousands of findings still produces a postable body instead of
 * failing exactly when the operator needs the issue filed most.
 */
function renderTruncated<T>(
  items: readonly T[],
  render: (item: T) => string,
  budget: number,
  emptyText: string,
  noun: string,
): string {
  if (items.length === 0) {
    return emptyText;
  }
  const lines: string[] = [];
  let used = 0;
  for (const item of items) {
    const line = render(item);
    const addedLength = lines.length === 0 ? line.length : line.length + 1; // +1 for the joining "\n"
    if (used + addedLength > budget) {
      break;
    }
    lines.push(line);
    used += addedLength;
  }
  const omitted = items.length - lines.length;
  if (omitted > 0) {
    lines.push(
      `  ... and ${String(omitted)} more ${noun}${omitted === 1 ? "" : "s"} omitted here for ` +
        `length (${String(items.length)} total) — see the journal for the full list.`,
    );
  }
  return lines.join("\n");
}

export interface IncidentReportOptions {
  /** Path (or description of where to find) the NDJSON journal for this run, if known. */
  readonly journalPath?: string;
}

/** Assembles the full report body from its two variable-length sections — everything else is fixed text, shared by both the untruncated and truncated render paths. */
function assembleBody(
  incident: RegressionIncident,
  options: IncidentReportOptions,
  tagsSection: string,
  deletionsSection: string,
  truncationNotice: string | undefined,
): string {
  const journalLine = options.journalPath
    ? `Journal file for this run: ${options.journalPath}`
    : "Journal file for this run: not recorded — check the run's own logs/artifacts for its journal path.";

  return [
    "ghcr-tidy detected a post-apply verification REGRESSION and stopped.",
    "",
    `Package:   ${incident.packageName}`,
    ...(truncationNotice ? ["", truncationNotice] : []),
    "",
    "Affected tags:",
    tagsSection,
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

const NO_DELETIONS_TEXT =
  "  (none — the regression was detected before this package deleted anything)";

/**
 * Renders the full incident report body, guaranteed to be no longer than
 * {@link MAX_INCIDENT_BODY_CHARS}. See this module's doc for the
 * intended reader and the information it deliberately always includes.
 *
 * The common case (the incident is small enough to render in full) is
 * tried first and returned as-is. Only when that would exceed the
 * limit does this fall back to a truncated render: the affected-tags
 * list — the most actionable content, what actually regressed — gets
 * the larger share of the remaining budget; the preceding-deletions
 * list (already fully recorded in the run's own journal) gets the
 * smaller share. Either list that had to be cut states PLAINLY that it
 * was truncated and exactly how many entries were left out — a
 * breaker that silently drops evidence to fit is exactly the kind of
 * blind spot post-apply verification exists to prevent.
 */
export function formatIncidentReport(
  incident: RegressionIncident,
  options: IncidentReportOptions = {},
): string {
  const fullTags = renderFull(incident.tags, formatTag, "");
  const fullDeletions = renderFull(incident.precedingDeletions, formatDeletion, NO_DELETIONS_TEXT);
  const full = assembleBody(incident, options, fullTags, fullDeletions, undefined);
  if (full.length <= MAX_INCIDENT_BODY_CHARS) {
    return full;
  }

  const truncationNotice =
    "NOTE: this report was truncated because the full incident exceeds GitHub's " +
    "issue body size limit. Counts below are of what is SHOWN, not the full " +
    "incident — see each section's own omission notice for how much was left out.";

  // Fixed overhead (everything except the two variable-length sections)
  // measured with both sections empty, so the budget split below reacts
  // to the ACTUAL incident (package name length, journal path length,
  // etc.) rather than a guessed constant.
  const skeletonLength = assembleBody(incident, options, "", "", truncationNotice).length;
  const available = Math.max(MAX_INCIDENT_BODY_CHARS - skeletonLength, 0);
  // Tags first: they are what regressed, and are this report's whole
  // point. Deletions are already fully recorded in the journal
  // (`journalLine` above), so they get the smaller remainder.
  const tagsBudget = Math.floor(available * 0.7);
  const deletionsBudget = available - tagsBudget;

  const tagsSection = renderTruncated(incident.tags, formatTag, tagsBudget, "", "tag");
  const deletionsSection = renderTruncated(
    incident.precedingDeletions,
    formatDeletion,
    deletionsBudget,
    NO_DELETIONS_TEXT,
    "deletion",
  );

  const truncated = assembleBody(
    incident,
    options,
    tagsSection,
    deletionsSection,
    truncationNotice,
  );
  if (truncated.length <= MAX_INCIDENT_BODY_CHARS) {
    return truncated;
  }
  // Last-resort safety net for a pathological case (e.g. a package name
  // long enough on its own to blow the budget): a hard cut is worse than
  // no truncation notice placement, but it is still postable, which a
  // rejected-outright issue is not.
  const marker = "\n\n[... report truncated to fit GitHub's issue body size limit ...]";
  return truncated.slice(0, MAX_INCIDENT_BODY_CHARS - marker.length) + marker;
}
