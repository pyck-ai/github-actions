import { describe, expect, it } from "vitest";
import { digest, registryPathFor } from "./domain.js";
import { packageName } from "../core/registry/package-name.js";
import { computeReachability } from "./reachability.js";
import { FakeGhcr } from "./fake-ghcr.js";

const path = registryPathFor("pyck-ai", packageName("golang"));

describe("computeReachability", () => {
  it("reaches a multi-arch index's platform and attestation children via BFS", async () => {
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
      .setManifest(digest("sha256:att-arm64"), {});

    const keepRoots = new Set([digest("sha256:index")]);
    const result = await computeReachability(path, keepRoots, new Map(), fake.registryReader());

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.reachable.size).toBe(5);
    for (const d of [
      "sha256:index",
      "sha256:amd64",
      "sha256:arm64",
      "sha256:att-amd64",
      "sha256:att-arm64",
    ]) {
      expect(result.reachable.has(digest(d))).toBe(true);
    }
  });

  it("shares a common descendant between two roots without re-resolving it", async () => {
    const fake = new FakeGhcr();
    fake
      .setManifest(digest("sha256:a"), { children: [{ digest: "sha256:shared" }] })
      .setManifest(digest("sha256:b"), { children: [{ digest: "sha256:shared" }] })
      .setManifest(digest("sha256:shared"), {});

    const keepRoots = new Set([digest("sha256:a"), digest("sha256:b")]);
    const result = await computeReachability(path, keepRoots, new Map(), fake.registryReader());

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.reachable.size).toBe(3);
    expect(result.reachable.has(digest("sha256:shared"))).toBe(true);
  });

  it("fails closed with reason not-found when a descendant 404s", async () => {
    const fake = new FakeGhcr();
    fake
      .setManifest(digest("sha256:a"), { children: [{ digest: "sha256:dead" }] })
      .setManifest(digest("sha256:dead"), { notFound: true });

    const keepRoots = new Set([digest("sha256:a")]);
    const result = await computeReachability(path, keepRoots, new Map(), fake.registryReader());

    expect(result).toEqual({
      status: "failed",
      reason: "not-found",
      root: digest("sha256:a"),
      failedDigest: digest("sha256:dead"),
    });
  });

  it("fails closed with reason transient when a descendant returns 429/5xx", async () => {
    const fake = new FakeGhcr();
    fake
      .setManifest(digest("sha256:a"), { children: [{ digest: "sha256:flaky" }] })
      .setManifest(digest("sha256:flaky"), { transient: true });

    const keepRoots = new Set([digest("sha256:a")]);
    const result = await computeReachability(path, keepRoots, new Map(), fake.registryReader());

    expect(result).toEqual({
      status: "failed",
      reason: "transient",
      root: digest("sha256:a"),
      failedDigest: digest("sha256:flaky"),
    });
  });

  it("throws when the node cap is exceeded", async () => {
    const fake = new FakeGhcr();
    fake.setManifest(digest("sha256:a"), { children: [{ digest: "sha256:b" }] });
    fake.setManifest(digest("sha256:b"), { children: [{ digest: "sha256:c" }] });
    fake.setManifest(digest("sha256:c"), {});

    const keepRoots = new Set([digest("sha256:a")]);
    await expect(
      computeReachability(path, keepRoots, new Map(), fake.registryReader(), { nodeCap: 2 }),
    ).rejects.toThrow(/node cap/);
  });
});
