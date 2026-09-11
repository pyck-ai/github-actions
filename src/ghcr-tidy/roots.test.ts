import { describe, expect, it } from "vitest";
import { digest, registryPathFor, tag } from "./domain.js";
import { packageName } from "../core/registry/package-name.js";
import { buildLiveRoots } from "./roots.js";
import { FakeGhcr } from "./fake-ghcr.js";

const path = registryPathFor("pyck-ai", packageName("golang"));

describe("buildLiveRoots", () => {
  it("groups multiple tags pointing at the same digest into one root", async () => {
    const fake = new FakeGhcr();
    fake
      .setManifest(digest("sha256:a"), { children: [{ digest: "sha256:child" }] })
      .setTag(tag("latest"), digest("sha256:a"))
      .setTag(tag("3.38"), digest("sha256:a"));

    const result = await buildLiveRoots(path, fake.registryReader());

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0]?.digest).toBe(digest("sha256:a"));
    expect([...(result.roots[0]?.tags ?? [])].sort()).toEqual(["3.38", "latest"]);
    expect(result.rootChildren.get(digest("sha256:a"))).toEqual([digest("sha256:child")]);
  });

  it("rooting comes from the registry tag list, ignoring the Packages API entirely", async () => {
    // This is the regression test for the whole design: a digest that a
    // registry tag genuinely points at is a live root, no matter what the
    // (separately consulted) Packages API's stale `tags` array claims.
    const fake = new FakeGhcr();
    fake.setManifest(digest("sha256:a"), {}).setTag(tag("latest"), digest("sha256:a"));

    const result = await buildLiveRoots(path, fake.registryReader());

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.roots.map((r) => r.digest)).toEqual([digest("sha256:a")]);
  });

  it("fails closed with reason not-found when a tag itself 404s", async () => {
    const fake = new FakeGhcr();
    fake.setTag(tag("latest"), digest("sha256:gone"));
    fake.setManifest(digest("sha256:gone"), { notFound: true });

    const result = await buildLiveRoots(path, fake.registryReader());

    expect(result).toEqual({ status: "failed", reason: "not-found", tag: "latest" });
  });

  it("fails closed with reason transient when a tag resolves with a transient error", async () => {
    const fake = new FakeGhcr();
    fake.setTag(tag("latest"), digest("sha256:flaky"));
    fake.setManifest(digest("sha256:flaky"), { transient: true });

    const result = await buildLiveRoots(path, fake.registryReader());

    expect(result).toEqual({ status: "failed", reason: "transient", tag: "latest" });
  });

  it("returns no roots for a package with zero tags", async () => {
    const fake = new FakeGhcr();
    const result = await buildLiveRoots(path, fake.registryReader());

    expect(result).toEqual({ status: "success", roots: [], rootChildren: new Map() });
  });
});
