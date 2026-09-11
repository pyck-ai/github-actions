import { describe, expect, it } from "vitest";
import { digest, registryPathFor, tag, type Tag } from "./domain.js";
import { packageName } from "../core/registry/package-name.js";
import { buildLiveRoots } from "./roots.js";
import { FakeGhcr } from "./fake-ghcr.js";
import type { RegistryReader } from "./ports.js";

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

    expect(result).toEqual({
      status: "failed",
      reason: "not-found",
      detail: 'tag "latest" failed to resolve',
    });
  });

  it("fails closed with reason transient when a tag resolves with a transient error", async () => {
    const fake = new FakeGhcr();
    fake.setTag(tag("latest"), digest("sha256:flaky"));
    fake.setManifest(digest("sha256:flaky"), { transient: true });

    const result = await buildLiveRoots(path, fake.registryReader());

    expect(result).toEqual({
      status: "failed",
      reason: "transient",
      detail: 'tag "latest" failed to resolve',
    });
  });

  it("returns no roots for a package with zero tags", async () => {
    const fake = new FakeGhcr();
    const result = await buildLiveRoots(path, fake.registryReader());

    expect(result).toEqual({ status: "success", roots: [], rootChildren: new Map() });
  });

  it("fails closed (never throws) when listTags itself rejects", async () => {
    // Regression test for the production incident: a `RegistryReader`
    // whose `listTags` throws/rejects (real adapters do this — see
    // `adapters.ts`'s doc — most commonly because the underlying HTTP
    // call genuinely could not be made) must not let that exception
    // propagate out of `buildLiveRoots` and abort the whole run; it must
    // fail this ONE package closed, exactly like a tag that fails to
    // resolve.
    const registry: RegistryReader = {
      listTags: () => Promise.reject(new Error("network-error")),
      resolve: () => Promise.reject(new Error("unused")),
    };

    const result = await buildLiveRoots(path, registry);

    expect(result).toEqual({
      status: "failed",
      reason: "transient",
      detail: "failed to list tags: network-error",
    });
  });

  it("determinism: reports the FIRST failing tag in list order, regardless of which resolves first", async () => {
    // Tags are resolved concurrently (`Promise.all`); this proves the
    // reported failure does not depend on completion order — "b" is made
    // to resolve (and fail) before "a" does, but "a" (earlier in the tag
    // list) must still be the one reported.
    const order: Tag[] = [tag("a"), tag("b")];
    const registry: RegistryReader = {
      listTags: () => Promise.resolve(order),
      resolve: (_path, ref) => {
        if (ref === "b") {
          // Resolves immediately — finishes before "a" below.
          return Promise.resolve({ status: "not-found", httpStatus: 404 });
        }
        // "a" resolves after a macrotask, so "b" settles first if
        // anything in the implementation depended on completion order.
        return new Promise((resolve) => {
          setTimeout(() => resolve({ status: "not-found", httpStatus: 404 }), 5);
        });
      },
    };

    const result = await buildLiveRoots(path, registry);

    expect(result).toEqual({
      status: "failed",
      reason: "not-found",
      detail: 'tag "a" failed to resolve',
    });
  });
});
