import { describe, expect, it } from "vitest";
import { digest, registryPathFor, tag, type Digest, type Tag } from "./domain.js";
import { packageName } from "../../registry/package-name.js";
import { FakeGhcr } from "./fake-ghcr.js";
import {
  checkCanary,
  compareSnapshots,
  memoryRegressionSink,
  snapshotPackage,
  type TagSnapshot,
} from "./verify.js";

const path = registryPathFor("pyck-ai", packageName("golang"));

function healthy(d: string): TagSnapshot {
  return { resolve: "resolved", digest: digest(d), closure: "resolved" };
}
function closureBroken(d: string): TagSnapshot {
  return { resolve: "resolved", digest: digest(d), closure: "not-found" };
}
function notFound(): TagSnapshot {
  return { resolve: "not-found", closure: "unknown" };
}
function unknown(): TagSnapshot {
  return { resolve: "unknown", closure: "unknown" };
}

describe("snapshotPackage", () => {
  it("reports a healthy tag whose full closure resolves", async () => {
    const fake = new FakeGhcr();
    fake
      .setTag(tag("latest"), digest("sha256:root"))
      .setManifest(digest("sha256:root"), { children: [{ digest: "sha256:child" }] })
      .setManifest(digest("sha256:child"), {});

    const snapshot = await snapshotPackage(path, fake.registryReader());

    expect(snapshot.get(tag("latest"))).toEqual(healthy("sha256:root"));
  });

  it("reports a broken closure when a descendant 404s, even though the tag itself resolves", async () => {
    const fake = new FakeGhcr();
    fake
      .setTag(tag("latest"), digest("sha256:root"))
      .setManifest(digest("sha256:root"), { children: [{ digest: "sha256:child" }] })
      .setManifest(digest("sha256:child"), { notFound: true });

    const snapshot = await snapshotPackage(path, fake.registryReader());

    expect(snapshot.get(tag("latest"))).toEqual(closureBroken("sha256:root"));
  });

  it("reports not-found for a tag that itself 404s", async () => {
    const fake = new FakeGhcr();
    fake.setTag(tag("latest"), digest("sha256:gone"));
    fake.setManifest(digest("sha256:gone"), { notFound: true });

    const snapshot = await snapshotPackage(path, fake.registryReader());

    expect(snapshot.get(tag("latest"))).toEqual(notFound());
  });

  it("reports unknown for a tag with a transient resolution error", async () => {
    const fake = new FakeGhcr();
    fake.setTag(tag("latest"), digest("sha256:flaky"));
    fake.setManifest(digest("sha256:flaky"), { transient: true });

    const snapshot = await snapshotPackage(path, fake.registryReader());

    expect(snapshot.get(tag("latest"))).toEqual(unknown());
  });
});

describe("checkCanary", () => {
  it("is ok for a tag that resolves end to end", async () => {
    const fake = new FakeGhcr();
    fake
      .setTag(tag("canary"), digest("sha256:root"))
      .setManifest(digest("sha256:root"), { children: [{ digest: "sha256:child" }] })
      .setManifest(digest("sha256:child"), {});

    expect(await checkCanary(path, tag("canary"), fake.registryReader())).toEqual({ ok: true });
  });

  it("fails with a resolve-failed reason naming the ResolveState when the tag itself 404s", async () => {
    const fake = new FakeGhcr();
    fake.setTag(tag("canary"), digest("sha256:gone"));
    fake.setManifest(digest("sha256:gone"), { notFound: true });

    expect(await checkCanary(path, tag("canary"), fake.registryReader())).toEqual({
      ok: false,
      reason: { kind: "resolve-failed", state: "not-found" },
    });
  });

  it("fails with a closure-failed reason when a descendant of the tag 404s", async () => {
    const fake = new FakeGhcr();
    fake
      .setTag(tag("canary"), digest("sha256:root"))
      .setManifest(digest("sha256:root"), { children: [{ digest: "sha256:child" }] })
      .setManifest(digest("sha256:child"), { notFound: true });

    expect(await checkCanary(path, tag("canary"), fake.registryReader())).toEqual({
      ok: false,
      reason: { kind: "closure-failed", state: "not-found" },
    });
  });

  it("fails with an error reason, including the message, when resolving the canary throws", async () => {
    const throwingRegistry = {
      listTags: () => Promise.reject(new Error("simulated network failure")),
      resolve: () => Promise.reject(new Error("simulated network failure")),
    };

    expect(await checkCanary(path, tag("canary"), throwingRegistry)).toEqual({
      ok: false,
      reason: { kind: "error", message: "simulated network failure" },
    });
  });
});

describe("compareSnapshots — the three-part predicate", () => {
  const t = tag("latest");

  it("no regression when the tag is healthy and unchanged", () => {
    const pre = new Map<Tag, TagSnapshot>([[t, healthy("sha256:a")]]);
    const post = new Map<Tag, TagSnapshot>([[t, healthy("sha256:a")]]);

    const result = compareSnapshots(pre, post);

    expect(result.regressions).toEqual([]);
    expect(result.preExisting).toEqual([]);
  });

  it("regression: the tag disappears entirely (stillResolves: false)", () => {
    const pre = new Map<Tag, TagSnapshot>([[t, healthy("sha256:a")]]);
    const post = new Map<Tag, TagSnapshot>([[t, notFound()]]);

    const result = compareSnapshots(pre, post);

    expect(result.regressions).toEqual([
      {
        tag: t,
        digestBefore: digest("sha256:a"),
        digestAfter: undefined,
        stillResolves: false,
        digestUnchanged: false,
        closureResolves: false,
      },
    ]);
  });

  it("regression: the tag resolves but to a different digest (digestUnchanged: false)", () => {
    const pre = new Map<Tag, TagSnapshot>([[t, healthy("sha256:a")]]);
    const post = new Map<Tag, TagSnapshot>([[t, healthy("sha256:b")]]);

    const result = compareSnapshots(pre, post);

    expect(result.regressions).toEqual([
      {
        tag: t,
        digestBefore: digest("sha256:a"),
        digestAfter: digest("sha256:b"),
        stillResolves: true,
        digestUnchanged: false,
        closureResolves: true,
      },
    ]);
  });

  it("regression: same digest but the closure broke (closureResolves: false)", () => {
    const pre = new Map<Tag, TagSnapshot>([[t, healthy("sha256:a")]]);
    const post = new Map<Tag, TagSnapshot>([[t, closureBroken("sha256:a")]]);

    const result = compareSnapshots(pre, post);

    expect(result.regressions).toEqual([
      {
        tag: t,
        digestBefore: digest("sha256:a"),
        digestAfter: digest("sha256:a"),
        stillResolves: true,
        digestUnchanged: true,
        closureResolves: false,
      },
    ]);
  });

  it("pre-existing, not a regression: broken in both pre and post", () => {
    const pre = new Map<Tag, TagSnapshot>([[t, notFound()]]);
    const post = new Map<Tag, TagSnapshot>([[t, notFound()]]);

    const result = compareSnapshots(pre, post);

    expect(result.regressions).toEqual([]);
    expect(result.preExisting).toHaveLength(1);
    expect(result.preExisting[0]?.tag).toBe(t);
  });

  it("a tag unverifiable in the pre-snapshot (transient) that is broken post is a regression, not pre-existing", () => {
    const pre = new Map<Tag, TagSnapshot>([[t, unknown()]]);
    const post = new Map<Tag, TagSnapshot>([[t, notFound()]]);

    const result = compareSnapshots(pre, post);

    expect(result.regressions).toHaveLength(1);
    expect(result.preExisting).toEqual([]);
  });

  it("a tag unverifiable pre-snapshot that is healthy post is not a regression", () => {
    const pre = new Map<Tag, TagSnapshot>([[t, unknown()]]);
    const post = new Map<Tag, TagSnapshot>([[t, healthy("sha256:a")]]);

    const result = compareSnapshots(pre, post);

    expect(result.regressions).toEqual([]);
    expect(result.preExisting).toEqual([]);
  });

  it("ignores a tag absent from the pre-snapshot even if broken post", () => {
    const pre = new Map<Tag, TagSnapshot>();
    const post = new Map<Tag, TagSnapshot>([[t, notFound()]]);

    const result = compareSnapshots(pre, post);

    expect(result.regressions).toEqual([]);
    expect(result.preExisting).toEqual([]);
  });

  it("preSnapshotFailed: every non-healthy post tag is a regression, with no pre-existing bucket", () => {
    const healthyTag = tag("stable");
    const brokenTag = tag("broken");
    const post = new Map<Tag, TagSnapshot>([
      [healthyTag, healthy("sha256:a")],
      [brokenTag, notFound()],
    ]);

    const result = compareSnapshots(new Map(), post, { preSnapshotFailed: true });

    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0]?.tag).toBe(brokenTag);
    expect(result.preExisting).toEqual([]);
  });
});

describe("memoryRegressionSink", () => {
  it("records every incident, in order, with no I/O", async () => {
    const { sink, incidents } = memoryRegressionSink();
    const pkg = packageName("golang");

    await sink.record({
      packageName: pkg,
      tags: [
        {
          tag: tag("latest"),
          digestBefore: digest("sha256:a") as Digest,
          digestAfter: undefined,
          stillResolves: false,
          digestUnchanged: false,
          closureResolves: false,
        },
      ],
      precedingDeletions: [],
    });

    expect(incidents).toHaveLength(1);
    expect(incidents[0]?.packageName).toBe(pkg);
  });
});
