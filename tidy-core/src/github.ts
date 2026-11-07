import { createOctokit, type RegistryOctokit } from "../../registry/index.js";
import { InputError, type Env } from "./inputs.js";

export type { RegistryOctokit };

const DEFAULT_API_URL = "https://api.github.com";

/** The repository a workflow runs in. */
export type Repository = { owner: string; repo: string };

export interface TidyOctokitOptions {
  /** Read for `GITHUB_API_URL` (GitHub Enterprise Server or a test double); api.github.com when unset or empty. */
  env: Env;
  /** Every HTTP request goes through this. */
  fetch: typeof fetch;
  /**
   * Retries of the retry plugin for 5xx and network errors. Defaults to the
   * plugin's own. `0` also switches the throttling plugin's request pacing
   * off, so a test run with a fake `fetch` is not slowed down by it.
   */
  retries?: number;
}

/** The Octokit client of `registry/` with the base URL taken from the environment. */
export function createTidyOctokit(token: string, options: TidyOctokitOptions): RegistryOctokit {
  const baseUrl = (options.env["GITHUB_API_URL"] ?? "") || DEFAULT_API_URL;
  return createOctokit(token, {
    baseUrl,
    fetch: options.fetch,
    ...(options.retries !== undefined
      ? { retries: options.retries, throttle: options.retries !== 0 }
      : {}),
  });
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
