import type { ExposedPortCheck } from "../manifest/schema.js";
import { inspectImageConfig } from "../docker/inspect.js";
import { fail, pass, type CheckContext, type CheckResult } from "./types.js";

/** New check kind (no bash predecessor): asserts `Config.ExposedPorts` contains `<port>/<protocol>`. */
export async function executeExposedPortCheck(
  check: ExposedPortCheck,
  index: number,
  ctx: CheckContext,
): Promise<CheckResult> {
  const protocol = check.protocol ?? "tcp";
  const key = `${String(check.port)}/${protocol}`;
  const label = `exposes ${key}`;
  const config = await inspectImageConfig(ctx.cli, ctx.image);
  return key in config.exposedPorts
    ? pass(index, "exposedPort", label)
    : fail(
        index,
        "exposedPort",
        label,
        `got: ${Object.keys(config.exposedPorts).join(", ") || "<none>"}`,
      );
}
