import { parse as parseYaml, YAMLParseError } from "yaml";
import { ManifestError, validateManifest, type Manifest } from "./schema.js";

/**
 * Parses `imgverify.yml` (or whatever the manifest file is named) from raw
 * YAML text into a validated {@link Manifest}. `sourcePath` is used only
 * for error messages.
 *
 * A YAML syntax error is wrapped as a {@link ManifestError} rather than
 * left as a raw `YAMLParseError`, so every failure mode from this module —
 * bad YAML, or YAML that parses but fails schema validation — is a single
 * catchable type naming the manifest file.
 */
export function parseManifest(content: string, sourcePath: string): Manifest {
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (error) {
    const reason = error instanceof YAMLParseError ? error.message : String(error);
    throw new ManifestError(`invalid YAML: ${reason}`, sourcePath);
  }

  try {
    return validateManifest(raw);
  } catch (error) {
    if (error instanceof ManifestError) {
      const location = error.location ? `${sourcePath}#${error.location}` : sourcePath;
      throw new ManifestError(error.reason, location);
    }
    throw error;
  }
}
