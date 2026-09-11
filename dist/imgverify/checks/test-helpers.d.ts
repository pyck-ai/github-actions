import type { DockerCli } from "../docker/cli.js";
import type { CheckContext } from "./types.js";
/** A fully-mocked `DockerCli` for check-kind unit tests — no docker daemon involved anywhere in this test suite. */
export declare function makeFakeCli(overrides?: Partial<DockerCli>): DockerCli;
export declare function makeContext(overrides?: Partial<CheckContext>): CheckContext;
/** Builds a `docker inspect`-shaped result with the given `Config` fields, matching what `inspectImageConfig` expects. */
export declare function inspectResult(config: {
    User?: string;
    WorkingDir?: string;
    Env?: string[];
    ExposedPorts?: Record<string, unknown>;
}): unknown[];
//# sourceMappingURL=test-helpers.d.ts.map