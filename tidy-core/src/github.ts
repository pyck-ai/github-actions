import { createOctokit, type RegistryOctokit } from "../../registry/index.js";
import { InputError, type Env } from "./inputs.js";

export type { RegistryOctokit };

const DEFAULT_API_URL = "https://api.github.com";

/** The repository a workflow runs in. */
export type Repository = { owner: string; repo: string };

/** Builds the API client from the token input and the API URL; the seam tests replace. */
export type OctokitFactory = (token: string, baseUrl: string) => RegistryOctokit;

/** The production {@link OctokitFactory}: the Octokit client of `registry/`. */
export const productionOctokit: OctokitFactory = (token, baseUrl) =>
  createOctokit(token, { baseUrl });

/** `GITHUB_API_URL` (GitHub Enterprise Server or a test double); api.github.com when unset or empty. */
export function apiUrl(env: Env): string {
  return (env["GITHUB_API_URL"] ?? "") || DEFAULT_API_URL;
}

/** Reads `GITHUB_REPOSITORY` (`owner/repo`). Throws {@link InputError} for anything else. */
export function parseRepository(raw: string | undefined): Repository {
  const [owner, repo, ...rest] = (raw ?? "").split("/");
  if (!owner || !repo || rest.length > 0) {
    throw new InputError(
      `GITHUB_REPOSITORY must be "owner/repo", got ${JSON.stringify(raw ?? "")}`,
    );
  }
  return { owner, repo };
}

/**
 * A path below a fixed prefix (a branch or cache key): slashes stay literal,
 * every segment is percent-encoded on its own. Encoding the whole path would
 * turn the slashes into `%2F`, which GitHub does not route as a ref path.
 */
export function encodePathSegments(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
