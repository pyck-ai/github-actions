# registry

Typed core for talking to an OCI registry and the GitHub Packages API: package names, HTTP with retry, tag listing, manifest resolution and package-version listing and deletion.

Only [ghcr-tidy](../ghcr-tidy/README.md) uses it (through [`index.ts`](./index.ts) and direct module imports); it is source shared inside this repository, not a published package, and ncc inlines it into the `ghcr-tidy` bundle.

| Module                                 | Owns                                                                |
| -------------------------------------- | ------------------------------------------------------------------- |
| [`package-name.ts`](./package-name.ts) | the branded `PackageName` type and its parser                       |
| [`status.ts`](./status.ts)             | classifying an HTTP status and deciding whether to retry            |
| [`http.ts`](./http.ts)                 | `requestWithRetry`, the one HTTP entry point                        |
| [`auth.ts`](./auth.ts)                 | registry bearer-token exchange, token cache and `RegistryAuthError` |
| [`tags.ts`](./tags.ts)                 | tag listing with `Link` header pagination                           |
| [`manifest.ts`](./manifest.ts)         | manifest and index resolution, attestation-child detection          |
| [`packages.ts`](./packages.ts)         | the Octokit client and Packages API version listing and deletion    |

Each module has a `*.test.ts` next to it; `npm test` (part of `task ci`) runs them with vitest from the repository root.
