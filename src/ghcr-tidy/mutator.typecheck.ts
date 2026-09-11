import type { Requestable } from "../core/registry/packages.js";
import { applyMutator } from "./mutator.js";

/**
 * Compile-time-only assertion, checked by `tsc` (`npm run build` — this
 * file is NOT excluded the way `*.test.ts` is, precisely so `tsc` sees
 * it) rather than by `vitest`, which does not type-check by default.
 *
 * This module is never imported anywhere and never executed; its sole
 * purpose is the `@ts-expect-error` below. If `applyMutator` is ever
 * changed to accept something other than a genuine `ApplyCapability` as
 * its third argument, this directive becomes an "unused '@ts-expect-error'
 * directive" error and the build fails — the capability guard described
 * in `apply-capability.ts` and `mutator.ts` has a compiled, enforced
 * regression test, not just a doc comment's word for it.
 */
const fakeOctokit = undefined as unknown as Requestable;
const org = "pyck-ai";

// @ts-expect-error `applyMutator` must not be constructible from a plain
// object — there is no way to obtain a real `ApplyCapability` other than
// `grantApply`'s write-read-validate round trip (see `apply-capability.ts`).
applyMutator(fakeOctokit, org, {});
