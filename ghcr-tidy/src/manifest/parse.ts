import { parse as parseYaml, YAMLParseError } from "yaml";
import { ManifestError, validateManifest, type Manifest } from "./schema.js";

/**
 * Parses `.ghcr-tidy.yaml` from raw YAML text into a validated
 * {@link Manifest}. `sourcePath` is used only for error messages. Mirrors
 * `imgverify/manifest/parse.ts` exactly: a YAML syntax error and a schema
 * violation are both surfaced as the same catchable {@link ManifestError},
 * naming the manifest file either way.
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
