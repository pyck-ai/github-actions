import { describe, expect, it, vi } from "vitest";
import { packageName } from "../../registry/package-name.js";
import { applyMutator, dryRunMutator } from "./mutator.js";
import type { Requestable } from "../../registry/packages.js";
import { grantApply } from "./apply-capability.js";
import { FakePlanFileSystem } from "./fake-plan-fs.js";
import { PLAN_SCHEMA_VERSION, type Plan } from "./persisted-plan.js";

const pkg = packageName("golang");

const emptyPlan: Plan = {
  schemaVersion: PLAN_SCHEMA_VERSION,
  org: "pyck-ai",
  generatedAt: "2026-09-11T00:00:00.000Z",
  packages: [],
};

describe("dryRunMutator", () => {
  it("records every call and performs no I/O, always reporting the optimistic outcome", async () => {
    const { mutator, calls } = dryRunMutator();

    await expect(mutator.deleteVersion(pkg, 1)).resolves.toBe("deleted");
    await expect(mutator.deletePackage(pkg)).resolves.toBe("deleted");

    expect(calls).toEqual([
      { kind: "deleteVersion", packageName: pkg, versionId: 1 },
      { kind: "deletePackage", packageName: pkg },
    ]);
  });

  it("holds no client: its shape has nothing capable of reaching the network", () => {
    const { mutator } = dryRunMutator();
    // No constructor argument was ever supplied, so there is no client
    // reference anywhere in this closure — this is a structural, not
    // just behavioural, guarantee. Asserting the object has no more
    // properties than its two methods is the closest runtime proxy for that.
    expect(Object.keys(mutator).sort()).toEqual(["deletePackage", "deleteVersion"]);
  });
});

describe("applyMutator", () => {
  it("requires a real ApplyCapability (see mutator.typecheck.ts for the compile-time version) and delegates to registry/packages.ts", async () => {
    const fs = new FakePlanFileSystem();
    const cap = await grantApply(emptyPlan, "/plans/plan.json", fs);

    const request = vi.fn(async (route: string) => {
      if (route.startsWith("DELETE") && route.includes("versions")) {
        return { status: 204 };
      }
      return { status: 204 };
    });
    const octokit: Requestable = { request };

    const mutator = applyMutator(octokit, "pyck-ai", cap);

    await expect(mutator.deleteVersion(pkg, 42)).resolves.toBe("deleted");
    await expect(mutator.deletePackage(pkg)).resolves.toBe("deleted");
    expect(request).toHaveBeenCalledTimes(2);
  });
});
