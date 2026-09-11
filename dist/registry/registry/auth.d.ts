import type { PackageName } from "./package-name.js";
export declare class RegistryAuthError extends Error {
    readonly status: number;
    constructor(message: string, status: number);
}
/** A cache of registry bearer tokens keyed by scope, so a caller resolving
 * many manifests for the same package doesn't re-exchange a token per
 * request. Mirrors the bash's per-package token fetch, but shared across
 * calls within a scope instead of re-fetched every time. */
export interface RegistryTokenCache {
    get(scope: string): string | undefined;
    set(scope: string, token: string): void;
}
export declare function createInMemoryTokenCache(): RegistryTokenCache;
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
export declare function getRegistryToken(githubToken: string, name: PackageName, options?: GetRegistryTokenOptions): Promise<string>;
//# sourceMappingURL=auth.d.ts.map