import { appendFile } from "node:fs/promises";
import type { PackageName } from "../../registry/package-name.js";
import type { Digest } from "./domain.js";

/** What a journal entry is about. `versionId`/`digest` together make an entry human-diffable against a plan file without needing to cross-reference ids. */
export interface MutationTarget {
  readonly packageName: PackageName;
  readonly versionId: number;
  readonly digest: Digest;
}

export type MutationOutcome =
  | { readonly kind: "deleted" }
  | { readonly kind: "already-gone" }
  | { readonly kind: "last-version-conflict" }
  | { readonly kind: "failed"; readonly error: string };

export interface JournalIntentEntry {
  readonly type: "intent";
  readonly timestamp: string;
  readonly target: MutationTarget;
}

export interface JournalOutcomeEntry {
  readonly type: "outcome";
  readonly timestamp: string;
  readonly target: MutationTarget;
  readonly outcome: MutationOutcome;
}

export type JournalEntry = JournalIntentEntry | JournalOutcomeEntry;

/**
 * Append-only record of every mutation attempt: one `"intent"` line
 * BEFORE the mutating call, one `"outcome"` line AFTER it. A log line
 * written only after success cannot distinguish "never attempted" from
 * "attempted and the process was killed mid-call"; writing intent first
 * can — a killed run leaves the journal ending on an unanswered intent
 * line, an unambiguous forensic record, alongside a durable plan file
 * that says what SHOULD have happened next.
 */
export interface Journal {
  recordIntent(target: MutationTarget): Promise<void>;
  recordOutcome(target: MutationTarget, outcome: MutationOutcome): Promise<void>;
}

export interface Clock {
  now(): Date;
}

const systemClock: Clock = { now: () => new Date() };

/** The real `Journal`: appends one NDJSON line per call to `path`. Never truncates or rewrites — appending only, so a partially-written run's history is never lost by a later run. */
export function ndjsonJournal(path: string, clock: Clock = systemClock): Journal {
  async function append(entry: JournalEntry): Promise<void> {
    await appendFile(path, `${JSON.stringify(entry)}\n`, "utf8");
  }
  return {
    recordIntent: (target) =>
      append({ type: "intent", timestamp: clock.now().toISOString(), target }),
    recordOutcome: (target, outcome) =>
      append({ type: "outcome", timestamp: clock.now().toISOString(), target, outcome }),
  };
}

/** An in-memory `Journal` for tests: records every entry, in order, with no filesystem I/O. `entries` is a live reference. */
export function memoryJournal(clock: Clock = systemClock): {
  journal: Journal;
  entries: readonly JournalEntry[];
} {
  const entries: JournalEntry[] = [];
  const journal: Journal = {
    recordIntent: (target) => {
      entries.push({ type: "intent", timestamp: clock.now().toISOString(), target });
      return Promise.resolve();
    },
    recordOutcome: (target, outcome) => {
      entries.push({ type: "outcome", timestamp: clock.now().toISOString(), target, outcome });
      return Promise.resolve();
    },
  };
  return { journal, entries };
}
