import type { ExposedPortCheck } from "../manifest/schema.js";
import { type CheckContext, type CheckResult } from "./types.js";
/** New check kind (no bash predecessor): asserts `Config.ExposedPorts` contains `<port>/<protocol>`. */
export declare function executeExposedPortCheck(check: ExposedPortCheck, index: number, ctx: CheckContext): Promise<CheckResult>;
//# sourceMappingURL=exposedPort.d.ts.map