import type { DockerCli } from "./cli.js";

/**
 * Parsing of `docker inspect`'s `Config` block, used by every check kind
 * that needs the image's declared metadata (`user`, `configUser`,
 * `workdir`, `env`, `exposedPort`) rather than runtime behaviour.
 *
 * `docker inspect` returning an error (the image is missing/unpullable)
 * is a HARD ERROR here — {@link inspectImageConfig} lets `DockerCli#inspect`'s
 * rejection propagate rather than swallowing it into some default value.
 * The bash predecessor's `docker inspect ... 2>/dev/null` swallows the
 * failure into an empty string, which for `check_user` is reported as
 * "Config.User is empty" (true but misleading — the image doesn't exist)
 * and for `check_workdir` PASSES when the expected value is also `""`.
 * Both are bugs, not behaviour to preserve.
 */

export interface ImageConfig {
  /** `Config.User`, e.g. `"1001"` or `""` if unset. */
  user: string;
  /** `Config.WorkingDir`, e.g. `"/app"` or `""` if unset. */
  workdir: string;
  /** `Config.Env`, raw `"KEY=VALUE"` entries in declaration order (duplicates possible). */
  env: string[];
  /** `Config.ExposedPorts` keys, e.g. `{"8080/tcp": {}}` — empty object if unset. */
  exposedPorts: Record<string, unknown>;
}

interface RawInspectEntry {
  Config?: {
    User?: unknown;
    WorkingDir?: unknown;
    Env?: unknown;
    ExposedPorts?: unknown;
  };
}

/**
 * Runs `docker inspect <ref>` and extracts the `Config` fields every check
 * kind needs. Throws if the image cannot be inspected (missing/unpullable)
 * or if the JSON docker prints does not have the expected shape — both are
 * hard errors that should abort the run, not fail a single check.
 */
export async function inspectImageConfig(cli: DockerCli, ref: string): Promise<ImageConfig> {
  const raw = await cli.inspect(ref);
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`docker inspect ${ref} returned no results`);
  }
  const entry = raw[0] as RawInspectEntry;
  const config = entry.Config ?? {};

  const user = typeof config.User === "string" ? config.User : "";
  const workdir = typeof config.WorkingDir === "string" ? config.WorkingDir : "";
  const env = Array.isArray(config.Env)
    ? config.Env.filter((v): v is string => typeof v === "string")
    : [];
  const exposedPorts =
    typeof config.ExposedPorts === "object" && config.ExposedPorts !== null
      ? (config.ExposedPorts as Record<string, unknown>)
      : {};

  return { user, workdir, env, exposedPorts };
}

/**
 * Resolves an env var's value from `Config.Env` entries, treating the name
 * as a LITERAL (never a regex) and honouring "last wins" for duplicate
 * keys — matching Docker's own runtime behaviour, which the bash
 * predecessor's `sed` pipeline (first match wins) did not.
 */
export function getEnvValue(env: readonly string[], name: string): string | undefined {
  let value: string | undefined;
  for (const line of env) {
    const idx = line.indexOf("=");
    if (idx === -1) {
      continue;
    }
    if (line.slice(0, idx) === name) {
      value = line.slice(idx + 1);
    }
  }
  return value;
}
