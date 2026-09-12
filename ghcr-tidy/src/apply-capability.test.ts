import { describe, expect, it } from "vitest";
import { packageName } from "../../registry/package-name.js";
import { digest } from "./domain.js";
import { grantApply } from "./apply-capability.js";
import { FakePlanFileSystem } from "./fake-plan-fs.js";
import { PLAN_SCHEMA_VERSION, serializePlan, type Plan } from "./persisted-plan.js";

const pkg = packageName("golang");
const filePath = "/plans/plan.json";

const plan: Plan = {
  schemaVersion: PLAN_SCHEMA_VERSION,
  org: "pyck-ai",
  generatedAt: "2026-09-11T00:00:00.000Z",
  packages: [
    {
      packageName: pkg,
      groups: [
        {
          root: { digest: digest("sha256:root"), versionId: 1 },
          members: [
            { digest: digest("sha256:root"), versionId: 1 },
            { digest: digest("sha256:child"), versionId: 2 },
          ],
        },
      ],
    },
  ],
};

describe("grantApply", () => {
  it("writes the plan atomically (temp file then rename) and returns a capability", async () => {
    const fs = new FakePlanFileSystem();

    const cap = await grantApply(plan, filePath, fs);

    expect(cap).toBeDefined();
    expect(fs.files.get(filePath)).toBe(serializePlan(plan));
    // Never left the temp file behind: rename removes the source key.
    expect([...fs.files.keys()]).toEqual([filePath]);
    expect(fs.dirsCreated).toEqual(["/plans"]);
  });

  it("throws, and grants no capability, when the written content does not round-trip (hash mismatch)", async () => {
    const fs = new FakePlanFileSystem({ corruptWrittenContent: "" });

    await expect(grantApply(plan, filePath, fs)).rejects.toThrow(/round trip failed/);
  });

  it("throws when the reread content is truncated JSON", async () => {
    const goodSerialized = serializePlan(plan);
    const truncated = goodSerialized.slice(0, Math.floor(goodSerialized.length / 2));
    const fs = new FakePlanFileSystem({ corruptWrittenContent: truncated });

    await expect(grantApply(plan, filePath, fs)).rejects.toThrow(/round trip failed/);
  });

  it("throws when the reread content is valid JSON but fails the closed schema", async () => {
    const fs = new FakePlanFileSystem({
      corruptWrittenContent: JSON.stringify({ schemaVersion: PLAN_SCHEMA_VERSION, org: "x" }),
    });

    await expect(grantApply(plan, filePath, fs)).rejects.toThrow(/round trip failed|invalid plan/);
  });

  it("a truncated/corrupt plan file already on disk at the target path does not block a fresh grantApply (grantApply always writes its own copy first)", async () => {
    // grantApply does not trust or reuse whatever is already sitting at
    // `filePath` — it always serialises, writes, and rereads its OWN
    // bytes. A stale/corrupt file at the target path before the call is
    // simply overwritten, never consulted.
    const fs = new FakePlanFileSystem();
    fs.seed(filePath, "{not even json");

    await expect(grantApply(plan, filePath, fs)).resolves.toBeDefined();
    expect(fs.files.get(filePath)).toBe(serializePlan(plan));
  });
});
