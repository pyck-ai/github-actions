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
export type EnvCheck = {
    kind: "env";
    name: string;
    equals: string;
} | {
    kind: "env";
    name: string;
    contains: string;
} | {
    kind: "env";
    name: string;
    absent: true;
};
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
export type Check = UserCheck | ConfigUserCheck | WorkdirCheck | EnvCheck | CmdCheck | VersionCheck | WritableCheck | FileCheck | ImageFileCheck | ShCheck | ExposedPortCheck | HttpCheck;
export type CheckKind = Check["kind"];
/** The closed set of valid check kinds, in the order documented above. */
export declare const CHECK_KINDS: readonly CheckKind[];
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
export declare class ManifestError extends Error {
    readonly location?: string | undefined;
    /** The underlying failure message, without the location prefix. */
    readonly reason: string;
    constructor(reason: string, location?: string | undefined);
}
/** Validates a single check object against its kind's field spec. Throws {@link ManifestError} on any violation. */
export declare function validateCheck(raw: unknown, location: string): Check;
/**
 * Validates a manifest already parsed from YAML into a plain JS value
 * (`unknown`, as returned by `YAML.parse`). Pure — no I/O, and no
 * knowledge of the real bake target names, so a `match` glob's hit count
 * is NOT checked here (see `match.ts`).
 */
export declare function validateManifest(raw: unknown): Manifest;
//# sourceMappingURL=schema.d.ts.map