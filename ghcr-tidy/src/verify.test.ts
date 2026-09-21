import { describe, expect, it } from "vitest";
import { digest, registryPathFor, tag, type Digest, type Tag } from "./domain.js";
import { packageName } from "../../registry/package-name.js";
import type { ResolvedPolicy } from "./manifest/schema.js";
import { FakeGhcr } from "./fake-ghcr.js";
import { loadBaseimagesTagDigestAge } from "./__fixtures__/load-baseimages-tag-digest-age.js";
import {
  checkCanary,
  compareSnapshots,
  memoryRegressionSink,
  nullExpiryProducer,
  policyDrivenExpiryProducer,
  resolveExpirySet,
  snapshotPackage,
  type ExpiryProducer,
  type ExpiryProducerInput,
  type TagSnapshot,
} from "./verify.js";

const path = registryPathFor("pyck-ai", packageName("golang"));

/** A minimal, fully-resolved policy for tests that only care about it being passed through, not its values. */
const anyPolicy: ResolvedPolicy = {
  keepMajors: 1,
  keepMinors: 3,
  keepPatches: 5,
  keepDays: 30,
};

/** Pinned per issue #27's corpus test: ages are continuous floats, so a drifting clock would silently change the answer and rot the test. */
const PINNED_NOW = new Date("2026-09-21T21:00:00Z");

/** Builds a minimal {@link ExpiryProducerInput}, defaulting every field a given test does not care about. */
function producerInput(overrides: Partial<ExpiryProducerInput> = {}): ExpiryProducerInput {
  return {
    tags: [],
    digestOf: new Map(),
    createdAtOf: new Map(),
    now: PINNED_NOW,
    policy: anyPolicy,
    ...overrides,
  };
}

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
    expect(result.unverified).toEqual([]);
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

  it("republished, NOT a regression: healthy before and after, but a different digest — a concurrent publish, since deleting a manifest cannot repoint a tag", () => {
    const pre = new Map<Tag, TagSnapshot>([[t, healthy("sha256:a")]]);
    const post = new Map<Tag, TagSnapshot>([[t, healthy("sha256:b")]]);

    const result = compareSnapshots(pre, post);

    expect(result.regressions).toEqual([]);
    expect(result.preExisting).toEqual([]);
    expect(result.unverified).toEqual([]);
    expect(result.republished).toEqual([
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

  it("regression: healthy before, CONFIRMED broken after (tag itself 404s) — still a regression regardless of digest bookkeeping", () => {
    const pre = new Map<Tag, TagSnapshot>([[t, healthy("sha256:a")]]);
    const post = new Map<Tag, TagSnapshot>([[t, notFound()]]);

    const result = compareSnapshots(pre, post);

    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0]?.tag).toBe(t);
    expect(result.republished).toEqual([]);
  });

  it("regression: healthy before, tag still resolves but its CLOSURE broke and the digest also changed — closure breakage always wins over a digest change", () => {
    const pre = new Map<Tag, TagSnapshot>([[t, healthy("sha256:a")]]);
    const post = new Map<Tag, TagSnapshot>([[t, closureBroken("sha256:b")]]);

    const result = compareSnapshots(pre, post);

    expect(result.regressions).toEqual([
      {
        tag: t,
        digestBefore: digest("sha256:a"),
        digestAfter: digest("sha256:b"),
        stillResolves: true,
        digestUnchanged: false,
        closureResolves: false,
      },
    ]);
    expect(result.republished).toEqual([]);
  });

  it("healthy pre, UNKNOWN post (a transient read, not a digest change) is still unverified, never republished", () => {
    const pre = new Map<Tag, TagSnapshot>([[t, healthy("sha256:a")]]);
    const post = new Map<Tag, TagSnapshot>([[t, unknown()]]);

    const result = compareSnapshots(pre, post);

    expect(result.regressions).toEqual([]);
    expect(result.republished).toEqual([]);
    expect(result.unverified).toHaveLength(1);
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

  it("preSnapshotFailed: a CONFIRMED broken post tag is a regression, with no pre-existing bucket", () => {
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
    expect(result.unverified).toEqual([]);
  });

  it("preSnapshotFailed: a merely UNKNOWN post tag is unverified, not a regression — the false-positive this predicate must not repeat", () => {
    const flakyTag = tag("flaky");
    const post = new Map<Tag, TagSnapshot>([[flakyTag, unknown()]]);

    const result = compareSnapshots(new Map(), post, { preSnapshotFailed: true });

    expect(result.regressions).toEqual([]);
    expect(result.preExisting).toEqual([]);
    expect(result.unverified).toHaveLength(1);
    expect(result.unverified[0]?.tag).toBe(flakyTag);
  });

  it("a healthy pre tag with a merely UNKNOWN post read is unverified, not a regression", () => {
    const pre = new Map<Tag, TagSnapshot>([[t, healthy("sha256:a")]]);
    const post = new Map<Tag, TagSnapshot>([[t, unknown()]]);

    const result = compareSnapshots(pre, post);

    expect(result.regressions).toEqual([]);
    expect(result.preExisting).toEqual([]);
    expect(result.unverified).toHaveLength(1);
    expect(result.unverified[0]?.tag).toBe(t);
  });

  it("a confirmed-broken pre tag with a merely UNKNOWN post read is unverified, not pre-existing", () => {
    const pre = new Map<Tag, TagSnapshot>([[t, notFound()]]);
    const post = new Map<Tag, TagSnapshot>([[t, unknown()]]);

    const result = compareSnapshots(pre, post);

    expect(result.regressions).toEqual([]);
    expect(result.preExisting).toEqual([]);
    expect(result.unverified).toHaveLength(1);
  });

  it("postSnapshotFailed: every tag pre knew as healthy is unverified, NEVER defaulted to confirmed-broken — the exact defect that turned one failed listTags call into a mass false regression", () => {
    const liveTag1 = tag("stable-1");
    const liveTag2 = tag("stable-2");
    const pre = new Map<Tag, TagSnapshot>([
      [liveTag1, healthy("sha256:a")],
      [liveTag2, healthy("sha256:b")],
    ]);
    // Whatever the (necessarily unreliable) post map looks like — even
    // completely empty, as a totally failed read produces — must never
    // be trusted as "these tags are gone".
    const post = new Map<Tag, TagSnapshot>();

    const result = compareSnapshots(pre, post, { postSnapshotFailed: true });

    expect(result.regressions).toEqual([]);
    expect(result.preExisting).toEqual([]);
    expect(result.unverified).toHaveLength(2);
  });

  it("postSnapshotFailed: a pre tag already confirmed broken is unverified, not silently reported as pre-existing (post state is genuinely not known)", () => {
    const pre = new Map<Tag, TagSnapshot>([[t, notFound()]]);
    const post = new Map<Tag, TagSnapshot>();

    const result = compareSnapshots(pre, post, { postSnapshotFailed: true });

    expect(result.regressions).toEqual([]);
    expect(result.preExisting).toEqual([]);
    expect(result.unverified).toHaveLength(1);
  });
});

describe("resolveExpirySet — the two safety obligations, unchanged (test 7)", () => {
  it("ok: true with the producer's expiry set when floor and unclassifiable are disjoint from it", () => {
    const producer: ExpiryProducer = {
      produce: () => ({
        expiry: new Set([tag("old-1"), tag("old-2")]),
        floor: new Set([tag("newest")]),
        unclassifiable: new Set([tag("weird-tag")]),
      }),
    };

    const result = resolveExpirySet(
      producer,
      producerInput({ tags: [tag("old-1"), tag("old-2")] }),
    );

    expect(result).toEqual({
      ok: true,
      expiry: new Set([tag("old-1"), tag("old-2")]),
    });
  });

  it("fails closed when a MISBEHAVING producer's expiry set overlaps its own floor set", () => {
    // A deliberately broken producer: it puts the same tag in both
    // `expiry` and `floor`, which a correct producer must never do (the
    // floor is supposed to be exactly what protects the newest tag of
    // each kind from expiry).
    const misbehavingProducer: ExpiryProducer = {
      produce: () => ({
        expiry: new Set([tag("newest")]),
        floor: new Set([tag("newest")]),
        unclassifiable: new Set(),
      }),
    };

    const result = resolveExpirySet(misbehavingProducer, producerInput({ tags: [tag("newest")] }));

    expect(result).toEqual({
      ok: false,
      reason: "floor-overlap",
      tags: [tag("newest")],
    });
  });

  it("fails closed when a MISBEHAVING producer's expiry set contains a tag it itself reports unclassifiable", () => {
    // A deliberately broken producer: it retires a tag it admits it
    // could not classify, which is exactly the "fail closed on
    // unclassifiable" obligation this function exists to enforce rather
    // than trust.
    const misbehavingProducer: ExpiryProducer = {
      produce: () => ({
        expiry: new Set([tag("mystery")]),
        floor: new Set(),
        unclassifiable: new Set([tag("mystery")]),
      }),
    };

    const result = resolveExpirySet(misbehavingProducer, producerInput({ tags: [tag("mystery")] }));

    expect(result).toEqual({
      ok: false,
      reason: "unclassifiable-in-expiry",
      tags: [tag("mystery")],
    });
  });

  it("nullExpiryProducer always succeeds with an empty expiry set, for any tags and any policy", () => {
    const result = resolveExpirySet(
      nullExpiryProducer,
      producerInput({ tags: [tag("a"), tag("b"), tag("c")] }),
    );

    expect(result).toEqual({ ok: true, expiry: new Set() });
  });
});

describe("compareSnapshots: expected expiry", () => {
  const t = tag("latest");

  it("a healthy tag that disappears AND is in expectedExpiry is classified expired, not regressions", () => {
    const pre = new Map<Tag, TagSnapshot>([[t, healthy("sha256:a")]]);
    const post = new Map<Tag, TagSnapshot>([[t, notFound()]]);

    const result = compareSnapshots(pre, post, { expectedExpiry: new Set([t]) });

    expect(result.regressions).toEqual([]);
    expect(result.expired).toEqual([
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

  it("a healthy tag that disappears and is NOT in expectedExpiry still lands in regressions, unchanged", () => {
    const other = tag("other");
    const pre = new Map<Tag, TagSnapshot>([[t, healthy("sha256:a")]]);
    const post = new Map<Tag, TagSnapshot>([[t, notFound()]]);

    const result = compareSnapshots(pre, post, { expectedExpiry: new Set([other]) });

    expect(result.expired).toEqual([]);
    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0]?.tag).toBe(t);
  });

  it("a tag expected to expire but which still resolves (same digest) is notExpired, not silently passed", () => {
    const pre = new Map<Tag, TagSnapshot>([[t, healthy("sha256:a")]]);
    const post = new Map<Tag, TagSnapshot>([[t, healthy("sha256:a")]]);

    const result = compareSnapshots(pre, post, { expectedExpiry: new Set([t]) });

    expect(result.notExpired).toEqual([
      {
        tag: t,
        digestBefore: digest("sha256:a"),
        digestAfter: digest("sha256:a"),
        stillResolves: true,
        digestUnchanged: true,
        closureResolves: true,
      },
    ]);
    expect(result.regressions).toEqual([]);
    expect(result.republished).toEqual([]);
  });

  it("a tag expected to expire but which still resolves under a DIFFERENT digest is notExpired, not republished", () => {
    const pre = new Map<Tag, TagSnapshot>([[t, healthy("sha256:a")]]);
    const post = new Map<Tag, TagSnapshot>([[t, healthy("sha256:b")]]);

    const result = compareSnapshots(pre, post, { expectedExpiry: new Set([t]) });

    expect(result.notExpired).toHaveLength(1);
    expect(result.notExpired[0]?.tag).toBe(t);
    expect(result.republished).toEqual([]);
  });

  it("neither expired nor notExpired trips anything: an empty expectedExpiry reproduces classification exactly as if the option were never passed", () => {
    const pre = new Map<Tag, TagSnapshot>([[t, healthy("sha256:a")]]);
    const post = new Map<Tag, TagSnapshot>([[t, notFound()]]);

    const withEmptySet = compareSnapshots(pre, post, { expectedExpiry: new Set() });
    const withoutOption = compareSnapshots(pre, post);

    expect(withEmptySet).toEqual(withoutOption);
    expect(withEmptySet.expired).toEqual([]);
    expect(withEmptySet.notExpired).toEqual([]);
  });
});

describe("policyDrivenExpiryProducer", () => {
  const policy: ResolvedPolicy = { keepMajors: 0, keepMinors: 0, keepPatches: 0, keepDays: 30 };
  const OLD = new Date("2020-01-01T00:00:00Z");
  const YOUNG = new Date("2026-09-20T00:00:00Z"); // 1 day before PINNED_NOW

  it("retires exactly the tags the windowing algorithm would exclude, keeps unversioned tags out of expiry, and reports nothing unclassifiable (basic shape, everything alone on its own old digest)", () => {
    const tags = [tag("latest"), tag("1.0"), tag("2.0")];
    const digestOf = new Map<Tag, Digest>([
      [tag("latest"), digest("sha256:a")],
      [tag("1.0"), digest("sha256:b")],
      [tag("2.0"), digest("sha256:c")],
    ]);
    const createdAtOf = new Map<Digest, Date>([
      [digest("sha256:a"), OLD],
      [digest("sha256:b"), OLD],
      [digest("sha256:c"), OLD],
    ]);
    const result = policyDrivenExpiryProducer.produce(
      producerInput({ tags, digestOf, createdAtOf, policy }),
    );
    expect(result.unclassifiable).toEqual(new Set());
    expect(result.expiry.has(tag("latest"))).toBe(false);
    // Both "1.0" and "2.0" fall outside a top-0-majors window, are each
    // alone on their own digest, and that digest is old.
    expect(result.expiry).toEqual(new Set([tag("1.0"), tag("2.0")]));
  });

  it("TEST 1 (conjunction): a digest carrying one retained and one non-retained tag yields an EMPTY expiry for both, even though the digest is old — pinned independently of the age half", () => {
    const retainedTag = tag("golang-2"); // sole member of its kind -> retained major
    const staleTag = tag("claude-9.9.9"); // different kind, non-retained under keepMinors:0
    const sharedDigest = digest("sha256:shared");
    const kindPolicy: ResolvedPolicy = {
      keepMajors: 1,
      keepMinors: 0,
      keepPatches: 0,
      keepDays: 30,
    };

    const result = policyDrivenExpiryProducer.produce(
      producerInput({
        tags: [retainedTag, staleTag],
        digestOf: new Map([
          [retainedTag, sharedDigest],
          [staleTag, sharedDigest],
        ]),
        createdAtOf: new Map([[sharedDigest, OLD]]), // old enough to pass keepDays on its own
        policy: kindPolicy,
      }),
    );

    expect(result.expiry).toEqual(new Set());
  });

  it("TEST 2 (age gate): the same non-retained tag is absent from expiry on a young digest, and present on an old one", () => {
    const staleTag = tag("claude-9.9.9");
    const younger: ExpiryProducerInput = producerInput({
      tags: [staleTag],
      digestOf: new Map([[staleTag, digest("sha256:young")]]),
      createdAtOf: new Map([[digest("sha256:young"), YOUNG]]),
      policy,
    });
    const older: ExpiryProducerInput = producerInput({
      tags: [staleTag],
      digestOf: new Map([[staleTag, digest("sha256:old")]]),
      createdAtOf: new Map([[digest("sha256:old"), OLD]]),
      policy,
    });

    expect(policyDrivenExpiryProducer.produce(younger).expiry.has(staleTag)).toBe(false);
    expect(policyDrivenExpiryProducer.produce(older).expiry.has(staleTag)).toBe(true);
  });

  it("a tag with no known digest, or a digest with no known createdAt, is never asserted expected-to-expire (fails safe on unknown facts)", () => {
    const orphanTag = tag("claude-9.9.9"); // resolves to a digest never reported by createdAtOf
    const unresolvedTag = tag("claude-8.8.8"); // never resolved at all, absent from digestOf
    const result = policyDrivenExpiryProducer.produce(
      producerInput({
        tags: [orphanTag, unresolvedTag],
        digestOf: new Map([[orphanTag, digest("sha256:unknown-age")]]),
        createdAtOf: new Map(), // deliberately empty
        policy,
      }),
    );
    expect(result.expiry).toEqual(new Set());
  });

  it("resolveExpirySet never rejects the real producer's own output: floor and expiry stay disjoint at the recommended policy", () => {
    const generous: ResolvedPolicy = {
      keepMajors: 1,
      keepMinors: 3,
      keepPatches: 5,
      keepDays: 30,
    };
    const tags = [
      tag("1"),
      tag("1.0"),
      tag("1.0.0"),
      tag("2"),
      tag("2.0"),
      tag("2.0.0"),
      tag("latest"),
    ];
    const digestOf = new Map(tags.map((t) => [t, digest(`sha256:${t}`)]));
    const createdAtOf = new Map([...digestOf.values()].map((d) => [d, OLD] as const));
    const result = resolveExpirySet(
      policyDrivenExpiryProducer,
      producerInput({ tags, digestOf, createdAtOf, policy: generous }),
    );
    expect(result.ok).toBe(true);
  });

  it("TEST 3 (the safety direction): a tag INSIDE the keepDays window that then disappears is a regression, never expired — the hole issue #27 closes", () => {
    const inWindowTag = tag("claude-9.9.9"); // outside its semver window, but its digest is YOUNG
    const d = digest("sha256:in-window");
    const input = producerInput({
      tags: [inWindowTag],
      digestOf: new Map([[inWindowTag, d]]),
      createdAtOf: new Map([[d, YOUNG]]),
      policy,
    });
    const resolution = resolveExpirySet(policyDrivenExpiryProducer, input);
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    // The keepDays gate must have excluded it: it is NOT in the expiry
    // set despite failing the semver window on its own.
    expect(resolution.expiry.has(inWindowTag)).toBe(false);

    // Simulating this tag being wrongly deleted anyway (e.g. a broken
    // INFLIGHT gate): `compareSnapshots` (untouched by this fix) must
    // classify it as a REGRESSION, never `expired`, precisely because
    // the resolved `expectedExpiry` set does not contain it.
    const pre = new Map<Tag, TagSnapshot>([[inWindowTag, healthy("sha256:in-window")]]);
    const post = new Map<Tag, TagSnapshot>([[inWindowTag, notFound()]]);
    const result = compareSnapshots(pre, post, { expectedExpiry: resolution.expiry });

    expect(result.expired).toEqual([]);
    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0]?.tag).toBe(inWindowTag);
  });
});

describe("policyDrivenExpiryProducer — TEST 4: corpus silence at the shipped default policy", () => {
  const byPackage = loadBaseimagesTagDigestAge();
  const policy: ResolvedPolicy = { keepMajors: 1, keepMinors: 3, keepPatches: 5, keepDays: 30 };

  /**
   * Runs the real producer against one package's ground-truth corpus at
   * the PINNED instant and asserts the residual is exactly zero — the
   * literal meaning of "notExpired is empty on a correct run": every
   * tag either resolves normally forever or is a genuine, correctly
   * classified expiry candidate. Nothing here simulates a snapshot: an
   * empty `expiry` set makes `compareSnapshots`'s `notExpired` bucket
   * empty for ANY post-apply outcome, by construction (see
   * `compareSnapshots`'s doc — membership in `expectedExpiry` is the
   * only way into that bucket), so asserting the set itself is the
   * direct, sufficient claim.
   */
  function assertZeroResidual(packageName: string, expectedTagCount: number): void {
    const pkg = byPackage.get(packageName);
    expect(pkg).toBeDefined();
    if (!pkg) return;
    expect(pkg.tags).toHaveLength(expectedTagCount);

    const input = producerInput({
      tags: pkg.tags,
      digestOf: pkg.digestOf,
      createdAtOf: pkg.createdAtOf,
      policy,
    });
    const result = policyDrivenExpiryProducer.produce(input);
    expect(result.unclassifiable).toEqual(new Set());

    const resolution = resolveExpirySet(policyDrivenExpiryProducer, input);
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.expiry).toEqual(new Set());
  }

  it("all-in-one: residual is zero (114 tags, matching the issue's ground truth of naive 40, -18 digest existential, -22 keepDays)", () => {
    assertZeroResidual("all-in-one", 114);
  });

  it("agent: residual is zero (132 tags, matching the issue's ground truth of naive 60, -24 digest existential, -36 keepDays)", () => {
    assertZeroResidual("agent", 132);
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
