import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// GitHub evaluates `${{ ... }}` anywhere in an action's metadata file while
// loading it, descriptions included, and only a few contexts exist outside
// `runs:` (no `secrets`, for one). An expression there fails every caller at
// "Set up job" with "Unrecognized named-value", and neither actionlint nor
// a local run catches it. jev-check shipped exactly that in an input
// description. Expressions belong under `runs:` only.

const root = join(__dirname, "..");

function actionFiles(): string[] {
  return readdirSync(root)
    .filter((d) => !d.startsWith(".") && d !== "node_modules")
    .filter((d) => statSync(join(root, d)).isDirectory())
    .flatMap((d) => ["action.yml", "action.yaml"].map((f) => join(d, f)))
    .filter((p) => {
      try {
        return statSync(join(root, p)).isFile();
      } catch {
        return false;
      }
    });
}

function expressionsOutsideRuns(node: unknown, path: string[], out: string[]): string[] {
  if (typeof node === "string") {
    if (node.includes("${{")) out.push(path.join("."));
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => expressionsOutsideRuns(v, [...path, String(i)], out));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (path.length === 0 && k === "runs") continue;
      expressionsOutsideRuns(v, [...path, k], out);
    }
  }
  return out;
}

describe("action metadata", () => {
  const files = actionFiles();

  it("finds the repo's actions", () => {
    expect(files).toContain(join("jev-check", "action.yml"));
  });

  it.each(files)("%s has no ${{ }} expression outside runs:", (file) => {
    const doc: unknown = parse(readFileSync(join(root, file), "utf8"));
    expect(expressionsOutsideRuns(doc, [], [])).toEqual([]);
  });
});
