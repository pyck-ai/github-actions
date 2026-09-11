import type { DockerCli } from "../docker/cli.js";
import type { BakeTarget } from "./bake.js";

/**
 * Resolves a bake target to the concrete image ref `imgverify` runs its
 * checks against, in one of two modes (see `imgverify.ts`'s CLI surface):
 * local-tag mode (default, for a developer running against images already
 * built with `docker buildx bake --load`) and digest mode (`--digests`,
 * for CI verifying the exact artifact `build` pushed).
 *
 * ## The multi-arch verification gap
 *
 * `docker pull <repo>@<digest>` on a multi-arch (index) digest fetches only
 * the manifest and layers for the PULLER's own platform — not every
 * platform the index lists. Self-hosted CI runners in this org are amd64,
 * so digest-mode verification checks the amd64 half of every multi-arch
 * image; any arm64 half is published to the registry unverified. This is
 * not something `imgverify` can close: `docker buildx bake --load` is not
 * an alternative, because `--load` CANNOT load a multi-arch result into
 * the local image store at all (buildx refuses it outright) — so pulling
 * the real pushed digest and checking one platform is still strictly
 * better than a fresh single-platform local rebuild, which wouldn't be the
 * artifact that was actually published. `resolveDigestTarget` reports the
 * platform it actually verified (see {@link ResolvedTarget.architecture})
 * specifically so this gap is visible in every CI log, not just in this
 * comment — see also the identical note in `build-image.yml` and in
 * `pyck-ai/baseimages`'s `verify.sh`. A `--platform` flag is a named seam
 * for closing this later (see `imgverify.ts`), but is not implemented.
 */

/**
 * Target resolution failed for reasons that are the environment's fault,
 * not the image's: no local tag to inspect, no digest recorded for a
 * target, `docker inspect`/`docker pull` failing outright. Always an
 * INFRASTRUCTURE error (exit 3).
 */
export class ResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResolveError";
  }
}

export interface ResolvedTarget {
  /** The bake target name this ref was resolved for, e.g. `"agent-alpine"`. */
  target: string;
  /** The concrete image ref checks run against — a local tag, or `repo@digest` in digest mode. */
  ref: string;
  /** `docker inspect -f '{{.Architecture}}'` of the resolved ref — see this module's doc comment on the multi-arch gap. */
  architecture: string;
}

/** A tag's `:suffix`, i.e. everything after the last `:`. */
function tagSuffix(tag: string): string {
  return tag.slice(tag.lastIndexOf(":") + 1);
}

/**
 * The bake target's "variant" for tag-preference matching: the substring
 * after the last `-` in the target name (e.g. `"alpine"` for
 * `"agent-alpine"`), or the whole name if it contains no `-` (e.g.
 * `"static"` for the single-variant `"static"` target — which then falls
 * through to the `:latest` tag, since no tag has a `:static` suffix).
 */
function targetVariant(name: string): string {
  const idx = name.lastIndexOf("-");
  return idx === -1 ? name : name.slice(idx + 1);
}

/**
 * Picks the preferred tag for a target's LOCAL image ref, in order:
 * (i) a tag whose `:suffix` equals the target's variant, (ii) else the
 * `:latest` tag, (iii) else the first declared tag. Throws
 * {@link ResolveError} if the target has no tags at all.
 */
export function pickLocalTag(target: BakeTarget): string {
  const first = target.tags[0];
  if (first === undefined) {
    throw new ResolveError(`target "${target.name}" has no tags to resolve a local image ref from`);
  }

  const variant = targetVariant(target.name);
  const bySuffix = target.tags.find((tag) => tagSuffix(tag) === variant);
  if (bySuffix !== undefined) {
    return bySuffix;
  }

  const latest = target.tags.find((tag) => tagSuffix(tag) === "latest");
  if (latest !== undefined) {
    return latest;
  }

  return first;
}

/**
 * Derives a tag's repo (registry + namespace + image, no tag) by stripping
 * a trailing `:[^/]*$` with a REGEX — not bash's `${x%:*}` or a naive
 * `split(":")[0]` — because a registry ref with a port
 * (`host:5000/img:tag`) has a `:` that is not the tag separator. Mirrors
 * `build-image.yml`'s `discover`/`publish` jobs' `jq`
 * `sub(":[^/]+$"; "")`/`sed 's/:[^/]*$//'`, which this must agree with.
 */
export function deriveRepoFromTag(tag: string): string {
  return tag.replace(/:[^/]*$/, "");
}

function extractArchitecture(raw: unknown): string {
  if (!Array.isArray(raw) || raw.length === 0) {
    return "unknown";
  }
  const entry = raw[0] as { Architecture?: unknown };
  return typeof entry.Architecture === "string" && entry.Architecture.length > 0
    ? entry.Architecture
    : "unknown";
}

/**
 * Local-tag mode: picks the preferred tag ({@link pickLocalTag}) and
 * confirms it is loaded locally via `docker inspect`. A failed inspect
 * (the image was never built/loaded) is {@link ResolveError} telling the
 * operator to build first, not a check failure.
 */
export async function resolveLocalTarget(
  cli: DockerCli,
  target: BakeTarget,
): Promise<ResolvedTarget> {
  const ref = pickLocalTag(target);
  let raw: unknown;
  try {
    raw = await cli.inspect(ref);
  } catch (error) {
    throw new ResolveError(
      `image "${ref}" for target "${target.name}" is not loaded locally — build it first ` +
        `(e.g. \`docker buildx bake --load ${target.name}\`): ${
          error instanceof Error ? error.message : String(error)
        }`,
    );
  }
  return { target: target.name, ref, architecture: extractArchitecture(raw) };
}

/**
 * Digest mode: derives the target's repo from its first declared tag
 * ({@link deriveRepoFromTag}), looks up the recorded digest for this
 * target's name in `digests`, and `docker pull`s `repo@digest` — the exact
 * artifact `build` pushed. Throws {@link ResolveError} if the target has
 * no tags, no digest was recorded for it, or the pull fails.
 */
export async function resolveDigestTarget(
  cli: DockerCli,
  target: BakeTarget,
  digests: Readonly<Record<string, string>>,
): Promise<ResolvedTarget> {
  const firstTag = target.tags[0];
  if (firstTag === undefined) {
    throw new ResolveError(`target "${target.name}" has no tags to derive a registry repo from`);
  }

  const digest = digests[target.name];
  if (digest === undefined) {
    throw new ResolveError(`no digest recorded for target "${target.name}"`);
  }

  const repo = deriveRepoFromTag(firstTag);
  const ref = `${repo}@${digest}`;

  try {
    await cli.pull(ref);
  } catch (error) {
    throw new ResolveError(
      `docker pull ${ref} failed for target "${target.name}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  let raw: unknown;
  try {
    raw = await cli.inspect(ref);
  } catch {
    raw = undefined;
  }
  return { target: target.name, ref, architecture: extractArchitecture(raw) };
}
