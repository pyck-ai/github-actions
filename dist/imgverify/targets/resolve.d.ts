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
export declare class ResolveError extends Error {
    constructor(message: string);
}
export interface ResolvedTarget {
    /** The bake target name this ref was resolved for, e.g. `"agent-alpine"`. */
    target: string;
    /** The concrete image ref checks run against — a local tag, or `repo@digest` in digest mode. */
    ref: string;
    /** `docker inspect -f '{{.Architecture}}'` of the resolved ref — see this module's doc comment on the multi-arch gap. */
    architecture: string;
}
/**
 * Picks the preferred tag for a target's LOCAL image ref, in order:
 * (i) a tag whose `:suffix` equals the target's variant, (ii) else the
 * `:latest` tag, (iii) else the first declared tag. Throws
 * {@link ResolveError} if the target has no tags at all.
 */
export declare function pickLocalTag(target: BakeTarget): string;
/**
 * Derives a tag's repo (registry + namespace + image, no tag) by stripping
 * a trailing `:[^/]*$` with a REGEX — not bash's `${x%:*}` or a naive
 * `split(":")[0]` — because a registry ref with a port
 * (`host:5000/img:tag`) has a `:` that is not the tag separator. Mirrors
 * `build-image.yml`'s `discover`/`publish` jobs' `jq`
 * `sub(":[^/]+$"; "")`/`sed 's/:[^/]*$//'`, which this must agree with.
 */
export declare function deriveRepoFromTag(tag: string): string;
/**
 * Local-tag mode: picks the preferred tag ({@link pickLocalTag}) and
 * confirms it is loaded locally via `docker inspect`. A failed inspect
 * (the image was never built/loaded) is {@link ResolveError} telling the
 * operator to build first, not a check failure.
 */
export declare function resolveLocalTarget(cli: DockerCli, target: BakeTarget): Promise<ResolvedTarget>;
/**
 * Digest mode: derives the target's repo from its first declared tag
 * ({@link deriveRepoFromTag}), looks up the recorded digest for this
 * target's name in `digests`, and `docker pull`s `repo@digest` — the exact
 * artifact `build` pushed. Throws {@link ResolveError} if the target has
 * no tags, no digest was recorded for it, or the pull fails.
 */
export declare function resolveDigestTarget(cli: DockerCli, target: BakeTarget, digests: Readonly<Record<string, string>>): Promise<ResolvedTarget>;
//# sourceMappingURL=resolve.d.ts.map