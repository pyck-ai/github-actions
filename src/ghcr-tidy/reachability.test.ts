import { describe, expect, it } from "vitest";
import { digest, registryPathFor, type RegistryPath, type Digest, type Tag } from "./domain.js";
import { packageName } from "../core/registry/package-name.js";
import { computeReachability } from "./reachability.js";
import { FakeGhcr } from "./fake-ghcr.js";
import type { ManifestResolution } from "../core/registry/manifest.js";
import type { RegistryReader } from "./ports.js";

const path = registryPathFor("pyck-ai", packageName("golang"));

/** Wraps a {@link RegistryReader} so resolving `ref` waits `delayFor.get(ref) ?? 0` ms before delegating — lets a test invert real-time completion order relative to discovery/root order. */
function delayed(inner: RegistryReader, delayFor: ReadonlyMap<string, number>): RegistryReader {
  return {
    listTags: (p) => inner.listTags(p),
    resolve: (p: RegistryPath, ref: Digest | Tag): Promise<ManifestResolution> => {
      const ms = delayFor.get(ref) ?? 0;
      return new Promise((resolve) => {
        setTimeout(() => {
          inner.resolve(p, ref).then(resolve);
        }, ms);
      });
    },
  };
}

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

  it("parallelizes across roots: reachable set and edges are identical regardless of which root's BFS resolves first", async () => {
    // Regression test for computeReachability's root-level parallelism
    // (previously a sequential `for (const root of keepRoots)` loop, now
    // every root's BFS starts together via `Promise.all`). Three
    // DISTINCT root digests — one of them ("r3") shares a descendant with
    // "r1" — with real-time completion order deliberately reversed
    // relative to `keepRoots`' own order: "r3" resolves fastest, "r1"
    // slowest. A naive implementation depending on completion order
    // (rather than root order) for its shared-state bookkeeping would
    // produce a different `edges` insertion order or double-resolve the
    // shared descendant.
    const build = (): FakeGhcr => {
      const fake = new FakeGhcr();
      fake
        .setManifest(digest("sha256:r1"), { children: [{ digest: "sha256:shared" }] })
        .setManifest(digest("sha256:r2"), { children: [{ digest: "sha256:c2" }] })
        .setManifest(digest("sha256:r3"), {
          children: [{ digest: "sha256:shared" }, { digest: "sha256:c3" }],
        })
        .setManifest(digest("sha256:shared"), {})
        .setManifest(digest("sha256:c2"), {})
        .setManifest(digest("sha256:c3"), {});
      return fake;
    };

    const keepRoots = new Set([digest("sha256:r1"), digest("sha256:r2"), digest("sha256:r3")]);

    const baseline = await computeReachability(
      path,
      keepRoots,
      new Map(),
      build().registryReader(),
    );

    const delayFor = new Map<string, number>([
      ["sha256:r1", 8],
      ["sha256:r2", 4],
      ["sha256:r3", 0],
      ["sha256:shared", 6],
      ["sha256:c2", 2],
      ["sha256:c3", 0],
    ]);
    const withJitter = await computeReachability(
      path,
      keepRoots,
      new Map(),
      delayed(build().registryReader(), delayFor),
    );

    expect(baseline.status).toBe("success");
    expect(withJitter.status).toBe("success");
    if (baseline.status !== "success" || withJitter.status !== "success") return;
    expect(withJitter.reachable).toEqual(baseline.reachable);
    expect(withJitter.edges).toEqual(baseline.edges);
    expect(withJitter.reachable.size).toBe(6);
  });

  it("fail-closed across roots: the FIRST root in keepRoots order is always reported, regardless of which root's descendant fails to resolve first", async () => {
    const fake = new FakeGhcr();
    fake
      .setManifest(digest("sha256:r1"), { children: [{ digest: "sha256:bad1" }] })
      .setManifest(digest("sha256:bad1"), { notFound: true })
      .setManifest(digest("sha256:r2"), { children: [{ digest: "sha256:bad2" }] })
      .setManifest(digest("sha256:bad2"), { notFound: true });

    const keepRoots = new Set([digest("sha256:r1"), digest("sha256:r2")]);

    // "r2" (second in keepRoots order) resolves its failing descendant
    // FIRST in real time; "r1" (first in order) is slower. The report
    // must still name r1's failing descendant, proving root selection is
    // order-based, not race-based.
    const delayFor = new Map<string, number>([
      ["sha256:bad1", 8],
      ["sha256:bad2", 0],
    ]);
    const registry = delayed(fake.registryReader(), delayFor);

    const result = await computeReachability(path, keepRoots, new Map(), registry);

    expect(result).toEqual({
      status: "failed",
      reason: "not-found",
      root: digest("sha256:r1"),
      failedDigest: digest("sha256:bad1"),
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
