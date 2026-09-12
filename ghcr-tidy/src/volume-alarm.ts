/**
 * A pure decision: should `applyPlan` refuse to run at all because the
 * plan is about to delete far more than usual?
 *
 * This is deliberately NOT the reference bash's `--max-delete-ratio`
 * (a ceiling on deletions as a fraction of total versions, capped at
 * 0.98). That model doesn't fit here: the reference's own comments admit
 * that repo routinely deletes 80-90% of versions in a normal run, so a
 * ratio ceiling can't distinguish "a normal aggressive prune" from "the
 * classifier is broken and is about to delete everything". A TRAILING
 * BASELINE can: it asks whether *this* run is unusual relative to
 * *this package's own recent history*, which is exactly the signal a
 * runaway reachability bug produces (a sudden multiple of what normally
 * gets deleted) without being tripped by routine steady-state churn.
 *
 * This module knows nothing about where the baseline comes from (a
 * journal, a metrics store, a flat file committed alongside the plan —
 * not this module's problem) or about GHCR, `Plan`, or any I/O. The
 * caller supplies the trailing baseline and the planned count; this
 * module only decides and explains why.
 */

export interface VolumeAlarmOptions {
  /**
   * A trailing baseline deletion count supplied by the caller (e.g. an
   * average or a recent-run count read from history external to this
   * module). `undefined` means "no history available" — see
   * {@link checkVolumeAlarm}'s doc for how that case is handled.
   */
  readonly baseline?: number;
  /** Overrides {@link DEFAULT_VOLUME_ALARM_MULTIPLE} for this call. */
  readonly multiple?: number;
}

export interface VolumeAlarmDecision {
  readonly allowed: boolean;
  readonly plannedCount: number;
  readonly baseline?: number;
  readonly multiple: number;
  /** `baseline * multiple`. Omitted when there was no baseline to compute it from. */
  readonly threshold?: number;
  /** Human-readable explanation, suitable for a log line or an abort message. */
  readonly reason: string;
}

/**
 * Default multiple applied to the trailing baseline before a plan is
 * refused.
 *
 * Justification: publish cadence and image count both vary week to
 * week, so some multiple above 1x is needed just to tolerate normal
 * variance (a burst of retagged/rebuilt images legitimately produces
 * more garbage than an average day). 3x is conservative enough to let
 * that kind of routine spike through untouched, while still catching
 * the failure mode this alarm exists for: a reachability/classification
 * bug that suddenly marks most or all of a package's digests as
 * unreachable, which produces a jump far larger than 3x a trailing
 * baseline, not a marginal one. There is no measured production
 * distribution to fit this to yet (unlike the reference tool's
 * documented 80-90% steady state, which this module deliberately does
 * NOT try to replicate — see the module doc); 3x is a starting point to
 * be tightened once real run history exists.
 */
export const DEFAULT_VOLUME_ALARM_MULTIPLE = 3;

/**
 * Decides whether a plan deleting `plannedCount` versions should be
 * allowed to proceed.
 *
 * When `options.baseline` is `undefined` (no trailing history supplied —
 * e.g. the very first run, or a caller that hasn't wired history yet),
 * the decision is a DELIBERATE, DOCUMENTED `allowed: true`: refusing
 * every baseline-less run would make the alarm block indefinitely until
 * something seeds a baseline, which is worse than the risk it's meant to
 * catch. This is a deliberate choice, not an oversight — a caller that
 * wants a stricter posture for the no-history case must decide that
 * explicitly, e.g. by treating a missing baseline as `0` itself before
 * calling this function.
 */
export function checkVolumeAlarm(
  plannedCount: number,
  options: VolumeAlarmOptions = {},
): VolumeAlarmDecision {
  const multiple = options.multiple ?? DEFAULT_VOLUME_ALARM_MULTIPLE;

  if (options.baseline === undefined) {
    return {
      allowed: true,
      plannedCount,
      multiple,
      reason:
        "no trailing baseline supplied — proceeding without a volume check " +
        "(deliberate default; see checkVolumeAlarm's doc)",
    };
  }

  const threshold = options.baseline * multiple;
  if (plannedCount > threshold) {
    return {
      allowed: false,
      plannedCount,
      baseline: options.baseline,
      multiple,
      threshold,
      reason:
        `planned deletions (${String(plannedCount)}) exceed ${String(multiple)}x the trailing ` +
        `baseline (${String(options.baseline)}, threshold ${String(threshold)})`,
    };
  }

  return {
    allowed: true,
    plannedCount,
    baseline: options.baseline,
    multiple,
    threshold,
    reason:
      `planned deletions (${String(plannedCount)}) are within ${String(multiple)}x the ` +
      `trailing baseline (${String(options.baseline)}, threshold ${String(threshold)})`,
  };
}
