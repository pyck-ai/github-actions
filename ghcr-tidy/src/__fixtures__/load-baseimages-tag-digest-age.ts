import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { digest, tag, type Digest, type Tag } from "../domain.js";

/** One package's worth of {@link ExpiryProducerInput}-shaped ground truth, minus `policy`/`now` (both supplied by the test itself, per case). */
export interface PackageTagDigestAge {
  readonly tags: readonly Tag[];
  readonly digestOf: ReadonlyMap<Tag, Digest>;
  readonly createdAtOf: ReadonlyMap<Digest, Date>;
}

/**
 * Loads `baseimages-tag-digest-age.tsv` (`package<TAB>tag<TAB>digest<TAB>
 * created_at`, 246 rows: `all-in-one` 114 tags + `agent` 132 tags, every
 * tag joined to its digest and that digest's authoritative Packages API
 * `created_at`) — the ground truth issue #27's corpus test verifies
 * `policyDrivenExpiryProducer` against. Real data pulled from the live
 * registry and Packages API, oldest `2026-08-24T09:19:13Z`, newest
 * `2026-09-21T20:20:49Z`.
 *
 * Several tags legitimately share one digest here (the same build
 * carrying multiple version aliases across different tag kinds, e.g. a
 * `golang` minor/patch pair alongside an `opencode` alias produced by
 * the same `all-in-one` layer) — this is exactly the shape the digest
 * existential in `policyDrivenExpiryProducer` exists to handle, not a
 * fixture artifact to normalise away.
 */
export function loadBaseimagesTagDigestAge(): ReadonlyMap<string, PackageTagDigestAge> {
  const fixturePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "baseimages-tag-digest-age.tsv",
  );
  const content = readFileSync(fixturePath, "utf8");
  const lines = content.split("\n").filter((l) => l.trim() !== "");
  const [header, ...rows] = lines;
  if (header !== "package\ttag\tdigest\tcreated_at") {
    throw new Error(`unexpected fixture header: ${JSON.stringify(header)}`);
  }

  const byPackage = new Map<
    string,
    { tags: Tag[]; digestOf: Map<Tag, Digest>; createdAtOf: Map<Digest, Date> }
  >();

  for (const line of rows) {
    const [pkg, rawTag, rawDigest, rawCreatedAt] = line.split("\t");
    if (!pkg || !rawTag || !rawDigest || !rawCreatedAt) {
      throw new Error(`malformed fixture line: ${JSON.stringify(line)}`);
    }
    const t = tag(rawTag);
    const d = digest(rawDigest);
    const entry = byPackage.get(pkg) ?? {
      tags: [],
      digestOf: new Map<Tag, Digest>(),
      createdAtOf: new Map<Digest, Date>(),
    };
    entry.tags.push(t);
    entry.digestOf.set(t, d);
    entry.createdAtOf.set(d, new Date(rawCreatedAt));
    byPackage.set(pkg, entry);
  }

  return byPackage;
}
