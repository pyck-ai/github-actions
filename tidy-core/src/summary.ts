import { appendFile } from "node:fs/promises";
import { describeError } from "./errors.js";

/**
 * Appends `markdown` and a newline to the file `GITHUB_STEP_SUMMARY` names.
 * Does nothing when `path` is unset or empty. A write failure never fails
 * the run: it is reported through `warning` only.
 */
export async function appendStepSummary(
  path: string | undefined,
  markdown: string,
  warning: (message: string) => void,
): Promise<void> {
  if (!path) return;
  try {
    await appendFile(path, `${markdown}\n`, "utf8");
  } catch (err) {
    warning(`Could not write the step summary: ${describeError(err)}`);
  }
}
