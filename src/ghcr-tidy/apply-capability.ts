import {
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  rename as nodeRename,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { parsePlan, serializePlan, type Plan } from "./persisted-plan.js";

declare const APPLY: unique symbol;

/**
 * Proof that `plan` was durably written to disk, read back, and
 * re-validated — see {@link grantApply}, the only function that can
 * produce one. There is no runtime value keyed by `APPLY`; this is a
 * pure type-level brand, so an `ApplyCapability` can never be forged by
 * an object literal (`{}` is not assignable to it — see
 * `mutator.typecheck.ts`) and can only ever have come from a successful
 * `grantApply` call.
 */
export interface ApplyCapability {
  readonly [APPLY]: true;
}

/**
 * The filesystem seam `grantApply` writes and reads through. Injectable
 * so tests can fault-inject a truncated or corrupted round trip (the
 * exact failure mode that let the bash reference delete against a
 * zero-byte plan file) without touching a real disk.
 */
export interface PlanFileSystem {
  mkdir(dirPath: string): Promise<void>;
  writeFile(filePath: string, content: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  readFile(filePath: string): Promise<string>;
}

export function nodePlanFileSystem(): PlanFileSystem {
  return {
    mkdir: async (dirPath) => {
      await nodeMkdir(dirPath, { recursive: true });
    },
    writeFile: (filePath, content) => nodeWriteFile(filePath, content, "utf8"),
    rename: (from, to) => nodeRename(from, to),
    readFile: (filePath) => nodeReadFile(filePath, "utf8"),
  };
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Grants an {@link ApplyCapability} for `plan`, but ONLY after:
 *
 * 1. Serialising it deterministically ({@link serializePlan}).
 * 2. Writing it atomically — a temp file in the SAME directory as
 *    `filePath`, then a rename, so `filePath` never briefly shows a
 *    partial write.
 * 3. Reading `filePath` back from disk (not reusing the in-memory
 *    `serialized` string — the read must exercise the real file).
 * 4. Verifying a SHA-256 hash of the reread bytes matches the bytes just
 *    serialised.
 * 5. Re-parsing the reread bytes against {@link parsePlan}'s closed
 *    schema and confirming the result matches `plan` exactly.
 *
 * Any failure at any step throws and no capability is returned — there
 * is no other constructor for one, and {@link applyMutator} in
 * `mutator.ts` requires one, so "delete without a durable, re-readable
 * plan" is a type error, not a code-review item.
 *
 * This exists to make one specific historical failure structurally
 * impossible: the bash reference serialised its plan with
 * `jq --argjson`, silently produced a ZERO-BYTE plan file once the plan
 * exceeded argv's ~128KB limit, logged success, and deleted anyway. Here
 * a truncated or corrupted write is caught before any mutation can
 * occur, because obtaining the capability IS the round trip.
 */
export async function grantApply(
  plan: Plan,
  filePath: string,
  fs: PlanFileSystem = nodePlanFileSystem(),
): Promise<ApplyCapability> {
  const serialized = serializePlan(plan);
  const expectedHash = sha256Hex(serialized);

  const dir = path.dirname(filePath);
  await fs.mkdir(dir);
  const tmpPath = path.join(
    dir,
    `.${path.basename(filePath)}.tmp-${randomBytes(8).toString("hex")}`,
  );
  await fs.writeFile(tmpPath, serialized);
  await fs.rename(tmpPath, filePath);

  const reread = await fs.readFile(filePath);
  const actualHash = sha256Hex(reread);
  if (actualHash !== expectedHash) {
    throw new Error(
      `plan round trip failed: content hash of ${filePath} after write (${actualHash}) does not match the hash of what was serialised (${expectedHash}) — refusing to grant apply`,
    );
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(reread);
  } catch (error) {
    throw new Error(
      `plan round trip failed: ${filePath} is not valid JSON after being written (${error instanceof Error ? error.message : String(error)}) — refusing to grant apply`,
    );
  }

  // Compare via serializePlan's canonical key order, not raw
  // JSON.stringify — a value's own key insertion order is not guaranteed
  // to match parsePlan's, and this check must not produce a false
  // mismatch on two structurally-identical plans.
  const reparsed = parsePlan(rawJson);
  if (serializePlan(reparsed) !== serializePlan(plan)) {
    throw new Error(
      `plan round trip failed: the plan re-read from ${filePath} does not match the plan that was granted — refusing to grant apply`,
    );
  }

  return {} as ApplyCapability;
}
