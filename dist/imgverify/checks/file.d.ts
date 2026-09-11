import type { FileCheck } from "../manifest/schema.js";
import { type CheckContext, type CheckResult } from "./types.js";
/** Ports `check_file`: path existence via `[ -e ]` inside a running container (as opposed to `imageFile`'s exported-filesystem check, the only option for scratch images). */
export declare function executeFileCheck(check: FileCheck, index: number, ctx: CheckContext): Promise<CheckResult>;
//# sourceMappingURL=file.d.ts.map