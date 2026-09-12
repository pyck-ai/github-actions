import type { PackageName } from "../../registry/package-name.js";
import {
  deletePackage as deletePackageRequest,
  deletePackageVersion,
  type DeletePackageResult,
  type DeletePackageVersionResult,
  type Requestable,
} from "../../registry/packages.js";
import type { ApplyCapability } from "./apply-capability.js";

export type VersionId = number;
/** Reused verbatim from `registry/packages.ts` — see that module's doc for the undocumented 400-on-last-version behaviour this type encodes. Never reclassified here. */
export type DeleteVersionResult = DeletePackageVersionResult;
export type { DeletePackageResult };

/**
 * The seam every mutation goes through. Deliberately has NO `apply`
 * boolean anywhere near it or below it: there is no flag in scope for a
 * caller below the CLI layer to check, because the two implementations
 * ({@link dryRunMutator}, {@link applyMutator}) are the only two ways to
 * obtain one, and only one of them can reach a network. The bash
 * reference checked an `APPLY` variable in at least five separate
 * call sites and needed a bespoke extra guard for one code path that
 * bypassed the others; a missing guard must be impossible here, not
 * merely unlikely.
 */
export interface Mutator {
  deleteVersion(pkg: PackageName, id: VersionId): Promise<DeleteVersionResult>;
  deletePackage(pkg: PackageName): Promise<DeletePackageResult>;
}

export interface RecordedCall {
  readonly kind: "deleteVersion" | "deletePackage";
  readonly packageName: PackageName;
  readonly versionId?: VersionId;
}

export interface DryRunMutator {
  readonly mutator: Mutator;
  /** Every call made, in call order. Live reference — grows as `mutator`'s methods are invoked. */
  readonly calls: readonly RecordedCall[];
}

/**
 * A `Mutator` that HOLDS NO CLIENT — there is nothing inside it capable
 * of making an HTTP request, so it cannot reach the network even by
 * accident or by a future refactor that forgets to check a flag. It
 * records every call it would have made and always reports the
 * optimistic outcome (`"deleted"`), so a dry run's `calls` list and a
 * real apply run's journal (`journal.ts`) are directly diffable: both
 * enumerate the exact same intended mutations in the exact same order.
 */
export function dryRunMutator(): DryRunMutator {
  const calls: RecordedCall[] = [];
  const mutator: Mutator = {
    deleteVersion(pkg, id) {
      calls.push({ kind: "deleteVersion", packageName: pkg, versionId: id });
      return Promise.resolve("deleted");
    },
    deletePackage(pkg) {
      calls.push({ kind: "deletePackage", packageName: pkg });
      return Promise.resolve("deleted");
    },
  };
  return { mutator, calls };
}

/**
 * The real, network-backed `Mutator`, wrapping `registry/packages.ts`.
 * REQUIRES an {@link ApplyCapability} as a constructor parameter, and
 * there is no other constructor for a network-backed `Mutator` — so
 * "delete without a durable, re-readable plan" (see `grantApply`'s doc)
 * is a type error, not a code-review item. See
 * `mutator.typecheck.ts` for the compile-time assertion that this
 * cannot be bypassed.
 *
 * `_cap` is intentionally unused at runtime: its only job is to exist in
 * the type signature.
 */
export function applyMutator(octokit: Requestable, org: string, _cap: ApplyCapability): Mutator {
  return {
    deleteVersion: (pkg, id) => deletePackageVersion(octokit, org, pkg, id),
    deletePackage: (pkg) => deletePackageRequest(octokit, org, pkg),
  };
}
