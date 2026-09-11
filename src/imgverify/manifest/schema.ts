/**
 * `imgverify.yml` manifest schema (version 1): types plus strict structural
 * validation for the twelve check kinds an image build can declare.
 *
 * The set of kinds is CLOSED, and deliberately does not include a
 * host-shell escape kind. Every existing host-side check in the org was
 * analysed and is expressible as `exposedPort`, `http`, or `sh` +
 * `mounts` — the moment a raw-shell escape exists, every awkward check
 * migrates into it and the manifest degrades into bash with extra syntax.
 *
 * Validation here is STRICT and rejects before any side effect: an unknown
 * `kind`, an unknown field, a missing required field, a `version` other
 * than `1`, or an empty `checks` array are all hard errors. This matters
 * because in the bash predecessor a misspelled helper name was a SILENT
 * SKIP — the run still exited 0 with two assertions silently missing. A
 * `MatchError` for a `match` glob with zero hits is thrown separately, in
 * `match.ts`, once the real bake target names are known (see that module's
 * doc comment).
 */

/** The run identity a check executes as: the image default, `root`, or an explicit uid. */
export type AsIdentity = "default" | "root" | number;

export interface UserCheck {
  kind: "user";
  uid: number | string;
  /** Label only — does not affect the check, purely descriptive in output. */
  name?: string;
  /** Opt-in: also assert `/etc/passwd`'s default-user entry equals this value. */
  configUser?: string;
}

export interface ConfigUserCheck {
  kind: "configUser";
  value: string;
}

export interface WorkdirCheck {
  kind: "workdir";
  value: string;
}

export type EnvCheck =
  | { kind: "env"; name: string; equals: string }
  | { kind: "env"; name: string; contains: string }
  | { kind: "env"; name: string; absent: true };

export interface CmdCheck {
  kind: "cmd";
  commands: string[];
  as?: AsIdentity;
}

export interface VersionCheck {
  kind: "version";
  run: string;
  contains: string;
  matches?: string;
  notContains?: string;
  as?: AsIdentity;
}

export interface WritableCheck {
  kind: "writable";
  paths: string[];
  as?: AsIdentity;
  /** Default false: the path is allowed not to exist yet (e.g. a runtime-created dir). */
  mustExist?: boolean;
}

export interface FileCheck {
  kind: "file";
  paths: string[];
  as?: AsIdentity;
}

export interface ImageFileCheck {
  kind: "imageFile";
  paths: string[];
}

export interface ShMount {
  host: string;
  container: string;
  ro?: boolean;
}

export interface ShCheck {
  kind: "sh";
  desc: string;
  run: string;
  as?: AsIdentity;
  mounts?: ShMount[];
  timeoutMs?: number;
}

export interface ExposedPortCheck {
  kind: "exposedPort";
  port: number;
  protocol?: "tcp" | "udp";
}

export interface HttpCheck {
  kind: "http";
  desc: string;
  containerPort: number;
  path: string;
  expectStatus: number;
  retries?: number;
  retryDelayMs?: number;
}

export type Check =
  | UserCheck
  | ConfigUserCheck
  | WorkdirCheck
  | EnvCheck
  | CmdCheck
  | VersionCheck
  | WritableCheck
  | FileCheck
  | ImageFileCheck
  | ShCheck
  | ExposedPortCheck
  | HttpCheck;

export type CheckKind = Check["kind"];

/** The closed set of valid check kinds, in the order documented above. */
export const CHECK_KINDS: readonly CheckKind[] = [
  "user",
  "configUser",
  "workdir",
  "env",
  "cmd",
  "version",
  "writable",
  "file",
  "imageFile",
  "sh",
  "exposedPort",
  "http",
];

export interface ManifestDefaults {
  checks: Check[];
}

export interface ManifestTargetEntry {
  match: string;
  checks: Check[];
}

export interface Manifest {
  version: 1;
  buildargs?: string;
  registry?: string;
  defaults?: ManifestDefaults;
  targets: ManifestTargetEntry[];
}

/** A manifest failed structural validation. Carries the location (a dotted/bracketed path) where it failed. */
export class ManifestError extends Error {
  /** The underlying failure message, without the location prefix. */
  readonly reason: string;

  constructor(
    reason: string,
    readonly location?: string,
  ) {
    super(location ? `${location}: ${reason}` : reason);
    this.name = "ManifestError";
    this.reason = reason;
  }
}

interface FieldSpec {
  required: readonly string[];
  optional: readonly string[];
}

const AS_FIELD = ["as"] as const;

const CHECK_FIELD_SPECS: Record<CheckKind, FieldSpec> = {
  user: { required: ["uid"], optional: ["name", "configUser"] },
  configUser: { required: ["value"], optional: [] },
  workdir: { required: ["value"], optional: [] },
  env: { required: ["name"], optional: ["equals", "contains", "absent"] },
  cmd: { required: ["commands"], optional: AS_FIELD },
  version: { required: ["run", "contains"], optional: ["matches", "notContains", ...AS_FIELD] },
  writable: { required: ["paths"], optional: [...AS_FIELD, "mustExist"] },
  file: { required: ["paths"], optional: AS_FIELD },
  imageFile: { required: ["paths"], optional: [] },
  sh: { required: ["desc", "run"], optional: [...AS_FIELD, "mounts", "timeoutMs"] },
  exposedPort: { required: ["port"], optional: ["protocol"] },
  http: {
    required: ["desc", "containerPort", "path", "expectStatus"],
    optional: ["retries", "retryDelayMs"],
  },
};

const ENV_VARIANT_FIELDS = ["equals", "contains", "absent"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(location: string, message: string): never {
  throw new ManifestError(message, location);
}

function checkUnknownFields(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  location: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      fail(location, `unknown field "${key}" (allowed: ${allowed.join(", ")})`);
    }
  }
}

function validateAsIdentity(value: unknown, location: string): void {
  if (value === "default" || value === "root") {
    return;
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return;
  }
  fail(
    location,
    `"as" must be "default", "root", or a non-negative integer uid, got ${JSON.stringify(value)}`,
  );
}

function validateStringArray(value: unknown, field: string, location: string): void {
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === "string")) {
    fail(location, `"${field}" must be a non-empty array of strings`);
  }
}

/** Validates a single check object against its kind's field spec. Throws {@link ManifestError} on any violation. */
export function validateCheck(raw: unknown, location: string): Check {
  if (!isPlainObject(raw)) {
    fail(location, "check must be an object");
  }

  const kind = raw.kind;
  if (typeof kind !== "string" || !CHECK_KINDS.includes(kind as CheckKind)) {
    fail(
      location,
      `unknown check kind ${JSON.stringify(kind)} (valid kinds: ${CHECK_KINDS.join(", ")})`,
    );
  }

  const spec = CHECK_FIELD_SPECS[kind as CheckKind];
  const allowedFields = ["kind", ...spec.required, ...spec.optional];
  checkUnknownFields(raw, allowedFields, location);

  if (kind === "env") {
    if (typeof raw.name !== "string" || raw.name.length === 0) {
      fail(location, `"name" is required and must be a non-empty string`);
    }
    const present = ENV_VARIANT_FIELDS.filter((f) => raw[f] !== undefined);
    if (present.length !== 1) {
      fail(
        location,
        `env check must specify exactly one of ${ENV_VARIANT_FIELDS.join(", ")}, got: ${
          present.length === 0 ? "none" : present.join(", ")
        }`,
      );
    }
    if (present[0] === "absent" && raw.absent !== true) {
      fail(location, `"absent" must be literal true`);
    }
    return raw as unknown as EnvCheck;
  }

  for (const field of spec.required) {
    if (raw[field] === undefined) {
      fail(location, `missing required field "${field}" for kind "${kind}"`);
    }
  }

  switch (kind as CheckKind) {
    case "user":
      if (typeof raw.uid !== "number" && typeof raw.uid !== "string") {
        fail(location, `"uid" must be a number or string`);
      }
      break;
    case "configUser":
    case "workdir":
      if (typeof raw.value !== "string") {
        fail(location, `"value" must be a string`);
      }
      break;
    case "cmd":
      validateStringArray(raw.commands, "commands", location);
      break;
    case "version":
      if (typeof raw.run !== "string" || raw.run.length === 0) {
        fail(location, `"run" must be a non-empty string`);
      }
      if (typeof raw.contains !== "string") {
        fail(location, `"contains" must be a string`);
      }
      break;
    case "writable":
    case "file":
    case "imageFile":
      validateStringArray(raw.paths, "paths", location);
      break;
    case "sh":
      if (typeof raw.desc !== "string" || raw.desc.length === 0) {
        fail(location, `"desc" must be a non-empty string`);
      }
      if (typeof raw.run !== "string" || raw.run.length === 0) {
        fail(location, `"run" must be a non-empty string`);
      }
      if (raw.mounts !== undefined) {
        if (!Array.isArray(raw.mounts)) {
          fail(location, `"mounts" must be an array`);
        }
        raw.mounts.forEach((mount, idx) => {
          const mountLocation = `${location}.mounts[${idx}]`;
          if (!isPlainObject(mount)) {
            fail(mountLocation, "mount must be an object");
          }
          checkUnknownFields(mount, ["host", "container", "ro"], mountLocation);
          if (typeof mount.host !== "string" || mount.host.length === 0) {
            fail(mountLocation, `"host" must be a non-empty string`);
          }
          if (typeof mount.container !== "string" || mount.container.length === 0) {
            fail(mountLocation, `"container" must be a non-empty string`);
          }
          if (mount.ro !== undefined && typeof mount.ro !== "boolean") {
            fail(mountLocation, `"ro" must be a boolean`);
          }
        });
      }
      if (raw.timeoutMs !== undefined && typeof raw.timeoutMs !== "number") {
        fail(location, `"timeoutMs" must be a number`);
      }
      break;
    case "exposedPort":
      if (typeof raw.port !== "number") {
        fail(location, `"port" must be a number`);
      }
      if (raw.protocol !== undefined && raw.protocol !== "tcp" && raw.protocol !== "udp") {
        fail(location, `"protocol" must be "tcp" or "udp"`);
      }
      break;
    case "http":
      if (typeof raw.desc !== "string" || raw.desc.length === 0) {
        fail(location, `"desc" must be a non-empty string`);
      }
      if (typeof raw.containerPort !== "number") {
        fail(location, `"containerPort" must be a number`);
      }
      if (typeof raw.path !== "string" || raw.path.length === 0) {
        fail(location, `"path" must be a non-empty string`);
      }
      if (typeof raw.expectStatus !== "number") {
        fail(location, `"expectStatus" must be a number`);
      }
      break;
  }

  if ("as" in raw) {
    validateAsIdentity(raw.as, `${location}.as`);
  }

  return raw as unknown as Check;
}

function validateChecksArray(raw: unknown, location: string): Check[] {
  if (!Array.isArray(raw)) {
    fail(location, `"checks" must be an array`);
  }
  if (raw.length === 0) {
    fail(location, `"checks" must not be empty`);
  }
  return raw.map((check, idx) => validateCheck(check, `${location}[${idx}]`));
}

const MANIFEST_TOP_LEVEL_FIELDS = ["version", "buildargs", "registry", "defaults", "targets"];

/**
 * Validates a manifest already parsed from YAML into a plain JS value
 * (`unknown`, as returned by `YAML.parse`). Pure — no I/O, and no
 * knowledge of the real bake target names, so a `match` glob's hit count
 * is NOT checked here (see `match.ts`).
 */
export function validateManifest(raw: unknown): Manifest {
  if (!isPlainObject(raw)) {
    fail("<root>", "manifest must be an object");
  }
  checkUnknownFields(raw, MANIFEST_TOP_LEVEL_FIELDS, "<root>");

  if (raw.version !== 1) {
    fail("version", `manifest "version" must be 1, got ${JSON.stringify(raw.version)}`);
  }

  if (raw.buildargs !== undefined && typeof raw.buildargs !== "string") {
    fail("buildargs", `"buildargs" must be a string`);
  }
  if (raw.registry !== undefined && typeof raw.registry !== "string") {
    fail("registry", `"registry" must be a string`);
  }

  let defaults: ManifestDefaults | undefined;
  if (raw.defaults !== undefined) {
    if (!isPlainObject(raw.defaults)) {
      fail("defaults", `"defaults" must be an object`);
    }
    checkUnknownFields(raw.defaults, ["checks"], "defaults");
    if (raw.defaults.checks === undefined) {
      fail("defaults", `"defaults" must have a "checks" field`);
    }
    defaults = { checks: validateChecksArray(raw.defaults.checks, "defaults.checks") };
  }

  if (raw.targets === undefined) {
    fail("targets", `manifest must have a "targets" field`);
  }
  if (!Array.isArray(raw.targets) || raw.targets.length === 0) {
    fail("targets", `"targets" must be a non-empty array`);
  }

  const targets: ManifestTargetEntry[] = raw.targets.map((entry, idx) => {
    const location = `targets[${idx}]`;
    if (!isPlainObject(entry)) {
      fail(location, "target entry must be an object");
    }
    checkUnknownFields(entry, ["match", "checks"], location);
    if (typeof entry.match !== "string" || entry.match.length === 0) {
      fail(`${location}.match`, `"match" must be a non-empty string`);
    }
    if (entry.checks === undefined) {
      fail(location, `target entry must have a "checks" field`);
    }
    const checks = validateChecksArray(entry.checks, `${location}.checks`);
    return { match: entry.match, checks };
  });

  return {
    version: 1,
    ...(defaults !== undefined && { defaults }),
    targets,
    ...(raw.buildargs !== undefined && { buildargs: raw.buildargs as string }),
    ...(raw.registry !== undefined && { registry: raw.registry as string }),
  };
}
