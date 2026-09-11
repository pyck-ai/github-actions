import { describe, expect, it } from "vitest";
import { packageName } from "../core/registry/package-name.js";
import { digest, tag } from "./domain.js";
import { FakeGhcr, version } from "./fake-ghcr.js";
import { planPackage, type PlanPackageOptions, type PlanPolicy } from "./plan.js";
import type { Clock } from "./ports.js";

const org = "pyck-ai";
const registryOwner = "pyck-ai";
const pkg = packageName("golang");

const now = new Date("2026-09-11T00:00:00Z");
const clock: Clock = { now: () => now };

const defaultPolicy: PlanPolicy = {
  retention: { protectedTagPatterns: [/^latest$/], keepLast: 1, keepDays: 30 },
  graceDays: 30,
};

function options(fake: FakeGhcr, policy: PlanPolicy = defaultPolicy): PlanPackageOptions {
  return {
    org,
    registryOwner,
    packageName: pkg,
    registry: fake.registryReader(),
    packages: fake.packagesClient(),
    clock,
    policy,
  };
}

const OLD = "2020-01-01T00:00:00Z"; // far outside keepDays/graceDays
const RECENT = "2026-09-10T00:00:00Z"; // within keepDays/graceDays (1 day old)

describe("planPackage", () => {
  it("multi-arch index: 4 untagged children (2 platform + 2 attestation) all kept, reachable via BFS", async () => {
    const fake = new FakeGhcr();
    fake
      .setManifest(digest("sha256:index"), {
        children: [
          { digest: "sha256:amd64", platform: { architecture: "amd64" } },
          { digest: "sha256:arm64", platform: { architecture: "arm64" } },
          {
            digest: "sha256:att-amd64",
            annotations: { "vnd.docker.reference.type": "attestation-manifest" },
          },
          {
            digest: "sha256:att-arm64",
            annotations: { "vnd.docker.reference.type": "attestation-manifest" },
          },
        ],
      })
      .setManifest(digest("sha256:amd64"), {})
      .setManifest(digest("sha256:arm64"), {})
      .setManifest(digest("sha256:att-amd64"), {})
      .setManifest(digest("sha256:att-arm64"), {})
      .setTag(tag("latest"), digest("sha256:index"))
      .addVersion(version(1, "sha256:index", OLD, ["latest"]))
      .addVersion(version(2, "sha256:amd64", OLD))
      .addVersion(version(3, "sha256:arm64", OLD))
      .addVersion(version(4, "sha256:att-amd64", OLD))
      .addVersion(version(5, "sha256:att-arm64", OLD));

    const result = await planPackage(options(fake));

    // Everything is kept/reachable, so there is nothing to delete — see
    // `reachability.test.ts` for direct coverage of the 5-node BFS itself.
    expect(result).toEqual({ status: "nothing-to-do" });
  });

  it("aged-out root: root plus all 4 children in ONE group, root ordered first", async () => {
    const fake = new FakeGhcr();
    fake
      .setManifest(digest("sha256:kept"), {})
      .setManifest(digest("sha256:old"), {
        children: [
          { digest: "sha256:c1" },
          { digest: "sha256:c2" },
          { digest: "sha256:c3" },
          { digest: "sha256:c4" },
        ],
      })
      .setManifest(digest("sha256:c1"), {})
      .setManifest(digest("sha256:c2"), {})
      .setManifest(digest("sha256:c3"), {})
      .setManifest(digest("sha256:c4"), {})
      .setTag(tag("latest"), digest("sha256:kept"))
      .setTag(tag("v1-old"), digest("sha256:old"))
      .addVersion(version(1, "sha256:kept", RECENT, ["latest"]))
      .addVersion(version(2, "sha256:old", OLD, ["v1-old"]))
      .addVersion(version(3, "sha256:c1", OLD))
      .addVersion(version(4, "sha256:c2", OLD))
      .addVersion(version(5, "sha256:c3", OLD))
      .addVersion(version(6, "sha256:c4", OLD));

    const policy: PlanPolicy = {
      retention: { protectedTagPatterns: [], keepLast: 0, keepDays: 30 },
      graceDays: 30,
    };
    const result = await planPackage(options(fake, policy));

    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.deleteCount).toBe(5);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.root).toBe(digest("sha256:old"));
    expect(result.groups[0]?.members[0]).toBe(digest("sha256:old"));
    expect(result.groups[0]?.members).toHaveLength(5);
  });

  it("shared child: kept root A and unkept root B share child C; C survives, B is planned for deletion", async () => {
    const fake = new FakeGhcr();
    fake
      .setManifest(digest("sha256:a"), { children: [{ digest: "sha256:c" }] })
      .setManifest(digest("sha256:b"), { children: [{ digest: "sha256:c" }] })
      .setManifest(digest("sha256:c"), {})
      .setTag(tag("latest"), digest("sha256:a"))
      .setTag(tag("v-old"), digest("sha256:b"))
      .addVersion(version(1, "sha256:a", RECENT, ["latest"]))
      .addVersion(version(2, "sha256:b", OLD, ["v-old"]))
      .addVersion(version(3, "sha256:c", OLD));

    const policy: PlanPolicy = {
      retention: { protectedTagPatterns: [], keepLast: 0, keepDays: 30 },
      graceDays: 30,
    };
    const result = await planPackage(options(fake, policy));

    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.deleteCount).toBe(1);
    expect(result.groups).toEqual([{ root: digest("sha256:b"), members: [digest("sha256:b")] }]);
    // C must never be in the delete set / group membership.
    expect(result.groups.some((g) => g.members.includes(digest("sha256:c")))).toBe(false);
  });

  it("REGRESSION: stale-empty Packages tags while a registry tag points at the version — KEPT", async () => {
    // The Packages API's tags array claims this version is untagged, but
    // the registry's own tag list resolves `latest` to it. Rooting on the
    // registry (never the Packages API) must keep it. This test FAILS
    // against a model that roots on the Packages API's tags array instead.
    const fake = new FakeGhcr();
    fake
      .setManifest(digest("sha256:a"), {})
      .setTag(tag("latest"), digest("sha256:a"))
      .addVersion(version(1, "sha256:a", OLD, [])); // Packages API: stale-empty tags

    const policy: PlanPolicy = {
      retention: { protectedTagPatterns: [/^latest$/], keepLast: 0, keepDays: 0 },
      graceDays: 0,
    };
    const result = await planPackage(options(fake, policy));

    expect(result.status).toBe("nothing-to-do");
  });

  it("a digest in ALL that 404s in the registry and is unreachable is planned for deletion, not fail-closed", async () => {
    const fake = new FakeGhcr();
    fake
      .setManifest(digest("sha256:kept"), {})
      .setTag(tag("latest"), digest("sha256:kept"))
      .addVersion(version(1, "sha256:kept", RECENT, ["latest"]))
      // "sha256:stale" has NO manifest registered at all -> resolves 404,
      // but it is never walked to (not reachable from any kept root), so
      // it must never be resolved and must simply land in DELETE.
      .addVersion(version(2, "sha256:stale", OLD));

    const policy: PlanPolicy = {
      retention: { protectedTagPatterns: [/^latest$/], keepLast: 0, keepDays: 0 },
      graceDays: 0,
    };
    const result = await planPackage(options(fake, policy));

    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.deleteCount).toBe(1);
    expect(result.groups).toEqual([
      { root: digest("sha256:stale"), members: [digest("sha256:stale")] },
    ]);
  });

  it("partially unresolvable index: root 200, one child 404 -> fail-closed, reason not-found, zero groups", async () => {
    const fake = new FakeGhcr();
    fake
      .setManifest(digest("sha256:root"), { children: [{ digest: "sha256:missing" }] })
      .setManifest(digest("sha256:missing"), { notFound: true })
      .setTag(tag("latest"), digest("sha256:root"))
      .addVersion(version(1, "sha256:root", OLD, ["latest"]));

    const policy: PlanPolicy = {
      retention: { protectedTagPatterns: [/^latest$/], keepLast: 0, keepDays: 0 },
      graceDays: 0,
    };
    const result = await planPackage(options(fake, policy));

    expect(result).toMatchObject({ status: "skipped", reason: "not-found" });
  });

  it("same but the child returns 429 after retries -> fail-closed, reason transient (a DIFFERENT reason)", async () => {
    const fake = new FakeGhcr();
    fake
      .setManifest(digest("sha256:root"), { children: [{ digest: "sha256:flaky" }] })
      .setManifest(digest("sha256:flaky"), { transient: true })
      .setTag(tag("latest"), digest("sha256:root"))
      .addVersion(version(1, "sha256:root", OLD, ["latest"]));

    const policy: PlanPolicy = {
      retention: { protectedTagPatterns: [/^latest$/], keepLast: 0, keepDays: 0 },
      graceDays: 0,
    };
    const result = await planPackage(options(fake, policy));

    expect(result).toMatchObject({ status: "skipped", reason: "transient" });
  });

  it("nothing-to-do for an empty package", async () => {
    const fake = new FakeGhcr();
    const result = await planPackage(options(fake));
    expect(result).toEqual({ status: "nothing-to-do" });
  });

  it("nothing-to-do when everything is reachable or inflight (no delete set)", async () => {
    const fake = new FakeGhcr();
    fake
      .setManifest(digest("sha256:a"), {})
      .setTag(tag("latest"), digest("sha256:a"))
      .addVersion(version(1, "sha256:a", RECENT, ["latest"]));

    const result = await planPackage(options(fake));
    expect(result).toEqual({ status: "nothing-to-do" });
  });

  it("determinism: the same fake world produces a byte-identical plan across repeated calls", async () => {
    const build = (): FakeGhcr => {
      const fake = new FakeGhcr();
      fake
        .setManifest(digest("sha256:kept"), {})
        .setManifest(digest("sha256:old"), { children: [{ digest: "sha256:oc" }] })
        .setManifest(digest("sha256:oc"), {})
        .setTag(tag("latest"), digest("sha256:kept"))
        .setTag(tag("v-old"), digest("sha256:old"))
        .addVersion(version(1, "sha256:kept", RECENT, ["latest"]))
        .addVersion(version(2, "sha256:old", OLD, ["v-old"]))
        .addVersion(version(3, "sha256:oc", OLD));
      return fake;
    };
    const policy: PlanPolicy = {
      retention: { protectedTagPatterns: [], keepLast: 0, keepDays: 30 },
      graceDays: 30,
    };

    const first = await planPackage(options(build(), policy));
    const second = await planPackage(options(build(), policy));

    expect(first).toEqual(second);
  });
});
