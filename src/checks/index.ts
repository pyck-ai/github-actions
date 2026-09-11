import type { Check, CheckKind } from "../manifest/schema.js";
import { executeCmdCheck } from "./cmd.js";
import { executeConfigUserCheck } from "./configUser.js";
import { executeEnvCheck } from "./env.js";
import { executeExposedPortCheck } from "./exposedPort.js";
import { executeFileCheck } from "./file.js";
import { executeHttpCheck } from "./http.js";
import { executeImageFileCheck } from "./imageFile.js";
import { executeShCheck } from "./sh.js";
import type { CheckContext, CheckResult } from "./types.js";
import { executeUserCheck } from "./user.js";
import { executeVersionCheck } from "./version.js";
import { executeWorkdirCheck } from "./workdir.js";
import { executeWritableCheck } from "./writable.js";

/**
 * `kind` → executor lookup for every one of the twelve closed check kinds
 * (`manifest/schema.ts`'s `CHECK_KINDS`). Each executor is a pure async
 * function of `(check, index, ctx)`: it never throws for an ordinary
 * check failure (that's `verdict: "fail"`) and NEVER lets one check's
 * outcome affect the next — `executeCheck` runs each in isolation and the
 * caller (pass 3) is expected to iterate the list sequentially, awaiting
 * each `CheckResult` before moving on.
 *
 * The one exception is a HARD ERROR: `user`, `configUser`, `workdir`, and
 * `exposedPort` call `inspectImageConfig`, whose rejection (the image is
 * missing/unpullable) is intentionally left to propagate out of
 * `executeCheck` rather than being caught into a `CheckResult` — see each
 * of those modules' doc comments. A caller that wants to keep running the
 * rest of a target's checks after that must catch it explicitly; the
 * default is to abort, since every other check against that same image
 * would fail for the same reason anyway.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedExecutor = (check: any, index: number, ctx: CheckContext) => Promise<CheckResult>;

const EXECUTORS: Record<CheckKind, UntypedExecutor> = {
  user: executeUserCheck,
  configUser: executeConfigUserCheck,
  workdir: executeWorkdirCheck,
  env: executeEnvCheck,
  cmd: executeCmdCheck,
  version: executeVersionCheck,
  writable: executeWritableCheck,
  file: executeFileCheck,
  imageFile: executeImageFileCheck,
  sh: executeShCheck,
  exposedPort: executeExposedPortCheck,
  http: executeHttpCheck,
};

/** Runs a single check via its kind's executor. See this module's doc comment for hard-error propagation. */
export function executeCheck(check: Check, index: number, ctx: CheckContext): Promise<CheckResult> {
  return EXECUTORS[check.kind](check, index, ctx);
}

export type { CheckContext, CheckResult, CheckVerdict } from "./types.js";
