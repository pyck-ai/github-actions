import type { CacheEntry } from "./github.js";

/** The classes of the summary; each cache lands in exactly one. */
export type Reason =
  | "pr-merged"
  | "pr-closed"
  | "branch-gone"
  | "tag-gone"
  | "default-branch"
  | "branch-exists"
  | "open-pr"
  | "pr-unreadable"
  | "unknown";

/** The classes whose caches are deleted. */
export const DEAD_REASONS: readonly Reason[] = [
  "pr-merged",
  "pr-closed",
  "branch-gone",
  "tag-gone",
];

export const isDead = (reason: Reason): boolean => DEAD_REASONS.includes(reason);

/** What the action looked up about the repository; every lookup the caches need is in here. */
export interface Facts {
  defaultBranch: string;
  branches: ReadonlySet<string>;
  openPulls: ReadonlySet<number>;
  /** State of each closed-or-unknown pull request; `undefined` when the lookup failed. */
  pullStates: ReadonlyMap<number, "open" | "merged" | "closed" | undefined>;
  /** Tag names (the `<t>` of a tag-form ref) that exist. */
  tags: ReadonlySet<string>;
}

export type RefKind =
  | { kind: "pull"; number: number }
  | { kind: "tag"; name: string }
  | { kind: "branch"; name: string }
  | { kind: "unknown" };

const PULL_REF = /^refs\/pull\/([0-9]+)\/(?:merge|head)$/;
const TAG_REFS = ["refs/heads/refs/tags/", "refs/tags/"];
const BRANCH_PREFIX = "refs/heads/";

/** Reads a cache `ref` in the order of the spec: pull request, tag form, branch, anything else. */
export function parseRef(ref: string | undefined): RefKind {
  if (ref === undefined) return { kind: "unknown" };
  const pull = PULL_REF.exec(ref);
  if (pull?.[1] !== undefined) {
    const number = Number(pull[1]);
    if (Number.isSafeInteger(number)) return { kind: "pull", number };
    return { kind: "unknown" };
  }
  for (const prefix of TAG_REFS) {
    if (ref.startsWith(prefix) && ref.length > prefix.length) {
      return { kind: "tag", name: ref.slice(prefix.length) };
    }
  }
  if (ref.startsWith(BRANCH_PREFIX) && ref.length > BRANCH_PREFIX.length) {
    return { kind: "branch", name: ref.slice(BRANCH_PREFIX.length) };
  }
  return { kind: "unknown" };
}

/**
 * Whether a branch carries the name of a tag-form ref: one named `<t>`, or
 * one named `refs/tags/<t>`, which is what `refs/heads/refs/tags/<t>` spells.
 */
function branchOfTagName(name: string, branches: ReadonlySet<string>): boolean {
  return branches.has(name) || branches.has(`refs/tags/${name}`);
}

/**
 * Pure: classifies one cache. The default branch's caches are kept first,
 * whatever else the ref says. A pull request whose state could not be read
 * is kept.
 */
export function classify(cache: CacheEntry, facts: Facts): Reason {
  const parsed = parseRef(cache.ref);
  if (cache.ref === `${BRANCH_PREFIX}${facts.defaultBranch}`) return "default-branch";
  switch (parsed.kind) {
    case "pull": {
      if (facts.openPulls.has(parsed.number)) return "open-pr";
      const state = facts.pullStates.get(parsed.number);
      if (state === "open") return "open-pr";
      if (state === "merged") return "pr-merged";
      if (state === "closed") return "pr-closed";
      return "pr-unreadable";
    }
    case "tag":
      if (facts.tags.has(parsed.name)) return "branch-exists";
      return branchOfTagName(parsed.name, facts.branches) ? "branch-exists" : "tag-gone";
    case "branch":
      return facts.branches.has(parsed.name) ? "branch-exists" : "branch-gone";
    case "unknown":
      return "unknown";
  }
}
