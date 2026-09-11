import { describe, expect, it, vi } from "vitest";
import type { ExposedPortCheck } from "../manifest/schema.js";
import { executeExposedPortCheck } from "./exposedPort.js";
import { inspectResult, makeContext, makeFakeCli } from "./test-helpers.js";

describe("executeExposedPortCheck", () => {
  it("passes when the port/protocol is exposed", async () => {
    const check: ExposedPortCheck = { kind: "exposedPort", port: 8080 };
    const cli = makeFakeCli({
      inspect: vi.fn(async () => inspectResult({ ExposedPorts: { "8080/tcp": {} } })),
    });
    const result = await executeExposedPortCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("pass");
  });

  it("defaults to tcp when protocol is omitted", async () => {
    const check: ExposedPortCheck = { kind: "exposedPort", port: 53, protocol: "udp" };
    const cli = makeFakeCli({
      inspect: vi.fn(async () => inspectResult({ ExposedPorts: { "53/tcp": {} } })),
    });
    const result = await executeExposedPortCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
  });

  it("fails when nothing is exposed", async () => {
    const check: ExposedPortCheck = { kind: "exposedPort", port: 8080 };
    const cli = makeFakeCli({ inspect: vi.fn(async () => inspectResult({})) });
    const result = await executeExposedPortCheck(check, 0, makeContext({ cli }));
    expect(result.verdict).toBe("fail");
    expect(result.detail).toBe("got: <none>");
  });
});
