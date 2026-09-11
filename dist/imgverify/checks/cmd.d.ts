import type { CmdCheck } from "../manifest/schema.js";
import { type CheckContext, type CheckResult } from "./types.js";
/**
 * Ports `check_cmd`. Each name in `commands` is spliced into the shell
 * loop as a LITERAL (the bash predecessor does the same unquoted, and no
 * existing call site has a glob or a space in a command name — see the
 * PASS 2 task brief).
 */
export declare function executeCmdCheck(check: CmdCheck, index: number, ctx: CheckContext): Promise<CheckResult>;
//# sourceMappingURL=cmd.d.ts.map