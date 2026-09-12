import type { PackageName } from "./package-name.js";

export class RegistryAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "RegistryAuthError";
  }
}

/** A cache of registry bearer tokens keyed by scope, so a caller resolving
 * many manifests for the same package doesn't re-exchange a token per
 * request. Mirrors the bash's per-package token fetch, but shared across
 * calls within a scope instead of re-fetched every time. */
export interface RegistryTokenCache {
  get(scope: string): string | undefined;
  set(scope: string, token: string): void;
}

export function createInMemoryTokenCache(): RegistryTokenCache {
  const store = new Map<string, string>();
  return {
    get: (scope) => store.get(scope),
    set: (scope, token) => {
      store.set(scope, token);
    },
  };
}

export interface GetRegistryTokenOptions {
  fetchImpl?: typeof fetch;
  cache?: RegistryTokenCache;
}

/**
 * Exchanges a GitHub token for a GHCR registry bearer token scoped to
 * `repository:<packageName>:pull`. Results are cached per scope when a
 * `cache` is supplied (recommended for any caller resolving more than one
 * manifest for the same package).
 */
export async function getRegistryToken(
  githubToken: string,
  name: PackageName,
  options: GetRegistryTokenOptions = {},
): Promise<string> {
  const scope = `repository:${name}:pull`;
  const cached = options.cache?.get(scope);
  if (cached !== undefined) {
    return cached;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `https://ghcr.io/token?scope=${encodeURIComponent(scope)}&service=ghcr.io`;
  const basicAuth = Buffer.from(`token:${githubToken}`, "utf8").toString("base64");

  const res = await fetchImpl(url, { headers: { Authorization: `Basic ${basicAuth}` } });
  if (res.status !== 200) {
    throw new RegistryAuthError(
      `failed to obtain registry token for scope "${scope}": HTTP ${res.status}`,
      res.status,
    );
  }

  const body = (await res.json()) as { token?: string };
  if (!body.token) {
    throw new RegistryAuthError(
      `registry token response for scope "${scope}" is missing "token"`,
      res.status,
    );
  }

  options.cache?.set(scope, body.token);
  return body.token;
}
