import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tag, type Tag } from "../domain.js";

/**
 * Loads the real 362-tag corpus (`baseimages-tags.tsv`, `package<TAB>tag`,
 * one line per registry tag observed across all 11 live `baseimages`
 * packages) used to drive the property tests in `tag-kind.test.ts` and
 * `retain.test.ts` — see issue #23: this is the ground truth the parse
 * rule and the windowing algorithm are verified against, not a
 * hand-picked sample.
 */
export function loadBaseimagesTags(): ReadonlyMap<string, readonly Tag[]> {
  const fixturePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "baseimages-tags.tsv",
  );
  const content = readFileSync(fixturePath, "utf8");
  const byPackage = new Map<string, Tag[]>();

  for (const line of content.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    const [pkg, rawTag] = line.split("\t");
    if (!pkg || !rawTag) {
      throw new Error(`malformed fixture line: ${JSON.stringify(line)}`);
    }
    const list = byPackage.get(pkg) ?? [];
    list.push(tag(rawTag));
    byPackage.set(pkg, list);
  }

  return byPackage;
}
