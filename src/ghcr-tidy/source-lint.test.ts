import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "Untagged" must never appear as a deletion predicate anywhere in this
 * module: untagged-ness is never a deletion criterion, only
 * unreachability is (see `plan.ts`'s module doc — this is precisely the
 * bug that destroyed `flutter-rfw`). This test greps the module's own
 * non-test source for the word, so a future change that reintroduces an
 * "untagged" check fails loudly instead of silently regressing the
 * design.
 */
describe("no 'untagged' predicate anywhere in ghcr-tidy's planning source", () => {
  it("finds no occurrence of the word 'untagged' (case-insensitive) in any non-test .ts file", () => {
    const dir = new URL(".", import.meta.url).pathname;
    const offenders: string[] = [];

    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".ts") || name.endsWith(".test.ts") || name === "source-lint.test.ts") {
        continue;
      }
      const contents = readFileSync(join(dir, name), "utf8");
      if (/untagged/i.test(contents)) {
        offenders.push(name);
      }
    }

    expect(offenders).toEqual([]);
  });
});
