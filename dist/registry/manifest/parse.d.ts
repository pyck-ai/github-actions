import { type Manifest } from "./schema.js";
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
export declare function parseManifest(content: string, sourcePath: string): Manifest;
//# sourceMappingURL=parse.d.ts.map