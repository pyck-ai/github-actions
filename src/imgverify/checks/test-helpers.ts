import { vi } from "vitest";
import type { DockerCli, DockerExecResult } from "../docker/cli.js";
import type { CheckContext } from "./types.js";

/** A fully-mocked `DockerCli` for check-kind unit tests — no docker daemon involved anywhere in this test suite. */
export function makeFakeCli(overrides: Partial<DockerCli> = {}): DockerCli {
  return {
    inspect: vi.fn(async () => [{ Config: {} }]),
    run: vi.fn(async (): Promise<DockerExecResult> => ({
      output: "",
      exitCode: 0,
      timedOut: false,
    })),
    create: vi.fn(async () => "container123"),
    export: vi.fn(async () => Buffer.alloc(0)),
    pull: vi.fn(async () => undefined),
    port: vi.fn(async () => "0.0.0.0:32768"),
    start: vi.fn(async () => undefined),
    rm: vi.fn(async () => undefined),
    ...overrides,
  };
}

export function makeContext(overrides: Partial<CheckContext> = {}): CheckContext {
  return {
    cli: makeFakeCli(),
    image: "test-image:latest",
    manifestDir: "/manifests",
    ...overrides,
  };
}

/** Builds a `docker inspect`-shaped result with the given `Config` fields, matching what `inspectImageConfig` expects. */
export function inspectResult(config: {
  User?: string;
  WorkingDir?: string;
  Env?: string[];
  ExposedPorts?: Record<string, unknown>;
}): unknown[] {
  return [{ Config: config }];
}
